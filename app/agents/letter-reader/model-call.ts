// A1 model call (05 §5.1): Nemotron 3 Ultra over the page text, temperature 0, 3000 tokens, thinking off.
// `text+fast` / `ocr+fast` send the same text and schema to Lightning (04 §2.2).
import type { ChatMessage, ContentPart } from "../../schemas/models";
import type { ExtractClaimsModel } from "../../schemas/llm";
import type { RunContext } from "../../orchestration/ctx";
import { callJson, type JsonCall } from "../../orchestration/model";
import { loadPrompt } from "../../prompts/load";
import { numbered, type TextPage } from "./text-layer";

export function letterMessages(pages: TextPage[], emlText: string | null, source: "PDF text layer" | "OCR"): ChatMessage[] {
  const parts: ContentPart[] = [{ type: "text", text: `Email headers:\n${emlText && emlText.trim() ? emlText.slice(0, 8000) : "none"}` }];
  for (const p of pages) parts.push({ type: "text", text: `Page ${p.page} (${source}), line-numbered:\n${numbered(p)}` });
  return [
    { role: "system", content: loadPrompt("letter_reader") },
    { role: "user", content: parts },
  ];
}

export async function extractClaimsModel(
  ctx: RunContext,
  lane: "deep" | "fast",
  pages: TextPage[],
  emlText: string | null,
  source: "PDF text layer" | "OCR",
): Promise<JsonCall<ExtractClaimsModel>> {
  return callJson(ctx, "extract_claims", {
    agent: "letter_reader",
    action: "extract_claims",
    lane,
    messages: letterMessages(pages, emlText, source),
    reasoning: "off",
    temperature: 0,
    max_tokens: 3000,
    purpose: `extract_claims ${source} ${lane}`,
  });
}
