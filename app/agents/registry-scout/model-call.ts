// A2 model call (05 §5.2): Lightning, temperature 0, 1024 tokens per turn (Lightning reasons first), tool_choice auto.
import type { ChatMessage, ChatResult, ToolDef } from "../../schemas/models";
import type { RunContext } from "../../orchestration/ctx";
import { callModel } from "../../orchestration/model";
import { loadPrompt } from "../../prompts/load";

export const scoutSystem = (): ChatMessage => ({ role: "system", content: loadPrompt("registry_scout") });

export function scoutTurn(ctx: RunContext, messages: ChatMessage[], tools: ToolDef[], purpose: string): Promise<ChatResult> {
  return callModel(ctx, {
    agent: "registry_scout", action: "plan_coverage", lane: "fast", messages, tools, tool_choice: "auto", expect: "tool_calls",
    reasoning: "off", temperature: 0, max_tokens: 1024, purpose,
  });
}
