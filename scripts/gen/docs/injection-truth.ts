// Ground truth for prompt-injection spans (D6): where each one sits in the text layer, how it is hidden, and what the attacker wanted.
// Spans are derived from the same Letter that produced the PDF, so the truth cannot drift from the file.
import type { Box, Laid, Letter } from "./model";

export type InjectionChannel = "pdf_text_layer" | "email_body";
export interface InjectionSpan {
  id: string;
  channel: InjectionChannel;
  visibility: "hidden" | "visible";
  kind: "embedded_instruction";
  goal: string;
  text: string;
  page: number | null;
  /** hidden spans only: the exact PDF drawing attributes and the bbox pdftotext reports (pt, origin top-left) */
  hidden: { font_pt: number; color: string; bbox_pt: [number, number, number, number]; after: string } | null;
  /** visible text lines immediately before and after the span in reading order (page content only) */
  between: [string | null, string | null] | null;
  box_px: Box | null;
}

const goalsOf = (L: Letter): Map<string, string> => new Map((L.hidden ?? []).map((h) => [h.id, h.goal]));

export function injectionSpans(L: Letter, laid: Laid, o: { visibleGoals?: string[]; email?: { id: string; text: string; goal: string }[] } = {}): InjectionSpan[] {
  const out: InjectionSpan[] = [];
  const page = laid.pages[0];
  const visible = (page?.runs ?? []).filter((r) => !r.hidden).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const h of laid.hidden ?? []) {
    const baseline = h.bbox_pt[3] - 0.25;
    const above = [...visible].reverse().find((r) => r.y < baseline - 0.01);
    const below = visible.find((r) => r.y > baseline + 0.01 && r.text !== "");
    out.push({ id: h.id, channel: "pdf_text_layer", visibility: "hidden", kind: "embedded_instruction", goal: goalsOf(L).get(h.id) ?? h.goal, text: h.text, page: h.page, hidden: { font_pt: h.size, color: h.color, bbox_pt: h.bbox_pt.map((v) => Math.round(v * 100) / 100) as [number, number, number, number], after: h.after }, between: [above?.text ?? null, below?.text ?? null], box_px: h.box });
  }
  const hiddenTexts = new Set((laid.hidden ?? []).map((h) => h.text));
  let n = 0;
  for (const f of laid.fields.filter((x) => x.kind === "embedded_instruction" && !hiddenTexts.has(x.text))) {
    out.push({ id: `${L.id}-V${n + 1}`, channel: "pdf_text_layer", visibility: "visible", kind: "embedded_instruction", goal: o.visibleGoals?.[n] ?? "unspecified", text: f.text, page: f.boxes[0]?.page ?? 1, hidden: null, between: null, box_px: f.boxes[0] ?? null });
    n++;
  }
  for (const e of o.email ?? []) out.push({ id: e.id, channel: "email_body", visibility: "visible", kind: "embedded_instruction", goal: e.goal, text: e.text, page: null, hidden: null, between: null, box_px: null });
  return out;
}
