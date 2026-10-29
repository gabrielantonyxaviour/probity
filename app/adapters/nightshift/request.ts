// Request building (05 §4.6, §4.3). Body: stream:false always; thinking via chat_template_kwargs (off except the Identity
// Examiner); json_schema response_format for expect:"json"; never reasoning_budget. `meterless/*` and non-NVIDIA ids are
// refused here too (the third of three places, DEC-01).
import type { ChatMessage, ChatRequest } from "../../schemas/models";
import { assertPinnable } from "./lanes";
import { ModelCallFailed } from "./errors";

export type ReasoningControl = "kwargs" | "system" | "none";
export type Extras = { kwargs: boolean; parallel: boolean; tools: boolean }; // false once a lane refused them
export const ALL_EXTRAS: Extras = { kwargs: true, parallel: true, tools: true };
export const NO_EXTRAS: Extras = { kwargs: false, parallel: false, tools: false };

export const THINKING_AGENT = "identity_examiner";

/** Per-call Nightshift app id (REV-57): `<prefix>-<run_id>-<n>`, lower-case, <= 48 chars. Defeats per-app H-MEM injection. */
export function appIdFor(prefix: string, runId: string, n: number): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-");
  const suffix = `-${n}`;
  const head = slug(`${prefix}-${runId}`).slice(0, 48 - suffix.length).replace(/-+$/, "");
  return `${head}${suffix}`;
}

/**
 * The `meterless-scope` value for one call. Nightshift's H-MEM retrieval walls records off by scope only; `meterless-app`
 * only weights the score (engine/hmem.js `retrieve`). A shared `app` scope therefore still pulled answers mined from earlier
 * runs into new prompts (live 2026-10-27: 1 to 3 injected per run). In `app` mode each call gets its own app-scoped
 * partition, `app:<per-call app id>`, which holds no earlier records; `user` keeps Nightshift's shared default.
 */
export function scopeFor(mode: "user" | "app", appId: string): string {
  return mode === "user" ? "user" : `app:${appId}`;
}

export function headersFor(token: string, appId: string, mode: "user" | "app" = "app"): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "meterless-app": appId,
    "meterless-scope": scopeFor(mode, appId),
    "meterless-trace": "1",
  };
}

/** Token Factory (and any plain OpenAI-compatible endpoint): bearer auth only, no Meterless routing headers. */
export function plainHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

function withThinkingMarker(messages: ChatMessage[], on: boolean): ChatMessage[] {
  const marker = on ? "/think" : "/no_think";
  const first = messages[0];
  if (first && first.role === "system" && typeof first.content === "string")
    return [{ ...first, content: `${marker}\n${first.content}` }, ...messages.slice(1)];
  return [{ role: "system", content: marker }, ...messages];
}

export function buildBody(
  req: ChatRequest,
  model: string,
  control: ReasoningControl,
  extras: Extras,
  callId: string,
  opts: { forceSubmit?: boolean } = {},
): Record<string, unknown> {
  assertPinnable(model, callId);
  const wantsThinking = req.reasoning !== "off";
  if (wantsThinking && req.agent !== THINKING_AGENT) throw new ModelCallFailed("bad_request", { call_id: callId, note: "reasoning_not_allowed" });
  let messages = req.messages;
  if (control === "system") messages = withThinkingMarker(messages, wantsThinking);

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: req.temperature,
    max_tokens: req.max_tokens,
    stream: false,
  };
  if (req.top_p !== undefined) body.top_p = req.top_p;
  if (control === "kwargs" && extras.kwargs) body.chat_template_kwargs = { enable_thinking: wantsThinking };

  const submit = opts.forceSubmit && req.response_schema ? submitTool(req.response_schema) : null;
  const tools = submit ? [submit] : req.tools;
  if (tools?.length && extras.tools) {
    body.tools = tools;
    if (extras.parallel) body.parallel_tool_calls = true;
    if (submit) body.tool_choice = { type: "function", function: { name: submit.function.name } };
    else if (req.tool_choice) body.tool_choice = req.tool_choice;
  }
  if (req.expect === "json" && req.response_schema && !submit) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: req.response_schema.name, strict: true, schema: req.response_schema.schema },
    };
  }
  return body;
}

/** Fallback for json outputs (DEC-03): a forced `submit_<schema>` tool call whose arguments are the object. */
export function submitTool(schema: { name: string; schema: Record<string, unknown> }) {
  return {
    type: "function" as const,
    function: {
      name: `submit_${schema.name}`.slice(0, 60),
      description: `Submit the ${schema.name} result as the arguments of this call.`,
      parameters: schema.schema,
    },
  };
}

/** Names of the extras a 400 body mentions, for the one-shot resend without them (05 §4.6). */
export function extrasNamedIn(text: string): Array<keyof Extras> {
  const t = text.toLowerCase();
  const hit: Array<keyof Extras> = [];
  if (t.includes("chat_template_kwargs") || t.includes("enable_thinking")) hit.push("kwargs");
  if (t.includes("parallel_tool_calls")) hit.push("parallel");
  if (t.includes("tools") || t.includes("tool_choice") || t.includes("function")) hit.push("tools");
  return hit;
}
