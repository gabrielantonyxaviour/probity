// Response parsing (05 §4.7). The model name comes from the body, then the compute receipt, then a response header; the
// requested id is never copied into `model`. `nemotron` is decided by the receipt's winning route (independent runtime
// evidence), because body.model may only echo the pin. Business rules are not decided here: code decides.
import { z } from "zod";
import type { ChatRequest, ModelSource, ParsedToolCall } from "../../schemas/models";
import { lastJsonObject, parseToolCalls, stripThink, withoutToolTags } from "./extract";

const Message = z
  .object({
    role: z.string().optional(),
    content: z.union([z.string(), z.array(z.object({ type: z.string().optional(), text: z.string().optional() }).passthrough()), z.null()]).optional(),
    tool_calls: z.array(z.unknown()).optional(),
    reasoning_content: z.string().nullish(),
    reasoning: z.string().nullish(),
  })
  .passthrough();
export const ChatBody = z
  .object({
    id: z.string().optional(),
    model: z.string().nullish(),
    choices: z.array(z.object({ message: Message, finish_reason: z.string().nullish() }).passthrough()).min(1),
    usage: z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() }).passthrough().optional(),
    meterless: z.record(z.string(), z.unknown()).optional(),
    meterless_cross_check: z.record(z.string(), z.unknown()).nullish(),
  })
  .passthrough();

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export type ParsedResponse = {
  model: string | null;
  model_source: ModelSource;
  nemotron: boolean;
  route_model: string | null;
  content: string | null;
  json: Record<string, unknown> | null;
  json_path: "content" | "tool_call" | "balanced" | null;
  tool_calls: ParsedToolCall[];
  finish_reason: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  reasoning_chars: number;
  receipt: Record<string, unknown> | null; // meterless.receipt (nested), prompt text removed
  cross_check: Record<string, unknown> | null;
  receipt_id: string | null;
  routed_model: string | null;
  provider_model: string | null;
  app: string | null;
  structured_output: string | null;
  egress_destination: string | null;
  routing_width: number | null;
  hmem_injected: number;
  blocked: boolean;
};

const MODEL_HEADER = /^(x-)?(meterless-)?(model|served-model|routed-model)$/i;

export function parseResponse(raw: unknown, headers: Headers, req: Pick<ChatRequest, "expect">): ParsedResponse {
  const body = ChatBody.parse(raw);
  const choice = body.choices[0]!;
  const m = obj(body.meterless);
  const nested = obj(m?.receipt);
  const receiptView = nested ?? m;
  const routed = str(m?.routed_model) ?? str(nested?.routed_model);
  const provider = str(m?.provider_model) ?? str(nested?.provider_model);

  let model = str(body.model);
  let model_source: ModelSource = model ? "response_body" : "none";
  if (!model && (routed || provider)) {
    model = routed ?? provider;
    model_source = "receipt";
  }
  if (!model) {
    headers.forEach((v, k) => {
      if (!model && MODEL_HEADER.test(k) && v) {
        model = v;
        model_source = "response_header";
      }
    });
  }
  const route_model = str(obj(receiptView?.winning_route)?.model) ?? str(obj(m?.winning_route)?.model);
  const nemotron = route_model ? /nemotron/i.test(route_model) : /nemotron/i.test(model ?? "");

  const message = choice.message;
  const rawContent = typeof message.content === "string" ? message.content : Array.isArray(message.content) ? message.content.map((p) => p.text ?? "").join("") : "";
  const think = stripThink(rawContent);
  const reasoning_chars = think.chars + (message.reasoning_content?.length ?? 0) + (message.reasoning?.length ?? 0);
  const tool_calls = parseToolCalls(message.tool_calls, think.text, req.expect === "tool_calls");
  const visible = withoutToolTags(think.text);

  const cross = obj(body.meterless_cross_check) ?? obj(nested?.cross_check) ?? null;
  const structured = obj(m?.structured_output);
  const validation = str(structured?.validation);
  const finish = str(choice.finish_reason);

  let json: Record<string, unknown> | null = null;
  let json_path: ParsedResponse["json_path"] = null;
  if (req.expect === "json") {
    const direct = lastJsonObject(visible);
    const submit = tool_calls.find((c) => c.name.startsWith("submit_"));
    if (direct && validation === "passed") {
      json = direct;
      json_path = "content";
    } else if (submit) {
      json = submit.arguments;
      json_path = "tool_call";
    } else if (direct) {
      json = direct;
      json_path = "balanced";
    }
  }

  const egress = obj(receiptView?.egress) ?? obj(m?.egress);
  const routing = obj(receiptView?.routing);
  const hmem = obj(receiptView?.hmem);
  const recommended = str(cross?.recommended_action);
  const blocked =
    finish === "requires_review" ||
    recommended === "require_approval" ||
    recommended === "block" ||
    str(cross?.risk_level) === "critical";

  const receipt: Record<string, unknown> | null = nested ? { ...nested } : m ? { ...m } : null;
  if (receipt) {
    delete receipt.receipt;
    if ("prompt_preview" in receipt) receipt.prompt_preview = "[omitted: prompt text is not persisted]";
  }

  return {
    model,
    model_source,
    nemotron,
    route_model,
    content: json ? JSON.stringify(json) : visible || null,
    json,
    json_path,
    tool_calls,
    finish_reason: finish,
    tokens_in: body.usage?.prompt_tokens ?? null,
    tokens_out: body.usage?.completion_tokens ?? null,
    reasoning_chars,
    receipt,
    cross_check: cross,
    receipt_id: str(m?.receipt_id) ?? str(nested?.receipt_id),
    routed_model: routed,
    provider_model: provider,
    app: str(m?.app) ?? str(nested?.app),
    structured_output: validation,
    egress_destination: str(egress?.destination),
    routing_width: typeof routing?.width === "number" ? routing.width : null,
    hmem_injected: typeof hmem?.injected === "number" ? hmem.injected : 0,
    blocked,
  };
}
