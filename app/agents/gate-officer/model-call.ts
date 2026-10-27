// A4 model call (05 §5.4): Lightning, temperature 0.3, 1000 tokens (>= 800 required), thinking off. Rationale only.
import type { ChatMessage } from "../../schemas/models";
import type { RunContext } from "../../orchestration/ctx";
import { callJson, type JsonCall } from "../../orchestration/model";
import type { WriteRationaleModel } from "../../schemas/llm";
import { loadPrompt } from "../../prompts/load";

export function rationaleCall(ctx: RunContext, input: unknown, failures: string[] | null, previous: string | null): Promise<JsonCall<WriteRationaleModel>> {
  const messages: ChatMessage[] = [
    { role: "system", content: loadPrompt("gate_officer") },
    { role: "user", content: JSON.stringify(input) },
  ];
  if (failures && previous) {
    messages.push({ role: "assistant", content: JSON.stringify({ text: previous }) });
    messages.push({ role: "user", content: `That rationale failed these checks: ${failures.join("; ")}. Write it again as exactly 5 sentences, using only values from the input.` });
  }
  return callJson(ctx, "write_rationale", {
    agent: "gate_officer", action: "write_rationale", lane: "fast", reasoning: "off", temperature: 0.3, max_tokens: 1000, messages,
    purpose: failures ? "write_rationale regenerate" : "write_rationale",
  });
}
