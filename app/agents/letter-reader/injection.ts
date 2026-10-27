// D6 deterministic detector: text in the request addressed to an automated reviewer. Pure code, run before any model
// reads the letter. Channels: the PDF text layer (hidden lines are words under 3 pt tall), OCR text when there is no text
// layer, and the email body. The Ultra review (injection-review.ts) may confirm or add spans; it can never remove one.
import type { InjectionChannel, InjectionSpan } from "../../schemas/letter-checks";
import { normText } from "../../policy/normalise";
import type { TextPage } from "./text-layer";

/** A hidden line: every word's glyph box is under this height in PDF points (smallest visible text in any letter is 7 pt). */
export const HIDDEN_MAX_PT = 3;

// Strong signals read as an instruction on their own. Words that a legitimate letter or email footer also uses ("AI" in a
// company name, "an automated system", "already verified by phone") are weak: they count only next to a decision directive.
const SIGNALS: Array<{ id: string; strong: boolean; re: RegExp }> = [
  { id: "addressed_to_ai", strong: true, re: /\b(?:ai|a\.i\.|llm)[- ](?:based\s+)?(?:reviewers?|assistants?|agents?|systems?|models?|tools?)\b|\bllm-based\b|\blanguage models?\b|\b(?:system|developer)\s+(?:note|prompt|instructions?|message)\b|\bnote to (?:the |any )?(?:ai|model|reviewer|system|assistant)s?\b|\b(?:for|to|attention:?)\s+(?:the\s+|any\s+|all\s+)?(?:automated|ai)\s+(?:assistants?|reviewers?|review|tools?|systems?|agents?)\b/i },
  { id: "override_instructions", strong: true, re: /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+)?(?:(?:the|your)\s+)?(?:previous|prior|above|earlier|other)\s+(?:instructions?|rules?|checks?|guidance)|\bnew system instruction|^\s*system\s*:/i },
  { id: "json_directive", strong: true, re: /"?\bdecision"?\s*[:=]\s*"?(?:approve|approved)\b|"?\bcall[-_ ]?back"?\s*[:=]\s*"?(?:waived|skip|false|none)\b/i },
  { id: "concealment", strong: true, re: /\bdo not (?:mention|flag|report|disclose|repeat)\b[^.\n]{0,50}\b(?:this|note|text|instructions?|notice)\b|\bstate that (?:this|the) (?:letter|document|request) contains no instructions\b/i },
  { id: "decision_directive", strong: false, re: /\b(?:mark|output|respond|return|set|treat|record|classify|decide|answer)\b[^.\n]{0,50}\b(?:approve[ds]?|approval|as approved)\b/i },
  { id: "mentions_automation", strong: false, re: /\bautomated\s+(?:assistants?|reviewers?|review|tools?|systems?|agents?)\b/i },
  { id: "callback_waiver", strong: false, re: /\b(?:skip|waive[ds]?|bypass|no need for|do not (?:place|make|perform))\b[^.\n]{0,40}\b(?:call-?backs?|verification calls?|verification|further checks)\b|\bwith no (?:further checks|call-?back)\b/i },
  { id: "pre_verified", strong: false, re: /\bpre-?verified\b|\balready (?:confirmed|verified) by (?:telephone|phone|the controller|your controller)\b/i },
];

/** Signals a text carries, and whether it reads as an instruction to an automated reviewer. */
export function classify(text: string): { signals: string[]; instruction: boolean } {
  const hits = SIGNALS.filter((s) => s.re.test(text));
  const strong = hits.some((h) => h.strong);
  const directive = hits.some((h) => h.id === "decision_directive");
  const weak = hits.filter((h) => !h.strong).length;
  return { signals: hits.map((h) => h.id), instruction: strong || (directive && weak >= 2) };
}

/** The email body: everything after the first blank line, split into paragraphs (blank lines or a "--" separator). */
export function emailParagraphs(eml: string | null): string[] {
  if (!eml) return [];
  const norm = eml.replace(/\r\n/g, "\n");
  const cut = norm.indexOf("\n\n");
  if (cut < 0) return [];
  return norm
    .slice(cut + 2)
    .split(/\n\s*\n|\n--\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").replace(/^--\s*/, "").trim())
    .filter((p) => p.length > 0 && p !== "--");
}

type Geo = { bbox: [number, number, number, number]; bbox_pt: [number, number, number, number]; hidden: boolean };

function lineGeo(p: TextPage, i: number): Geo | null {
  const span = p.line_spans?.[i];
  if (!span) return null;
  const ws = p.words.slice(span[0], span[1]);
  if (!ws.length) return null;
  const x0 = Math.min(...ws.map((w) => w.x0));
  const y0 = Math.min(...ws.map((w) => w.y0));
  const x1 = Math.max(...ws.map((w) => w.x1));
  const y1 = Math.max(...ws.map((w) => w.y1));
  const k = (v: number, d: number) => Math.max(0, Math.min(1000, Math.round((v / d) * 1000)));
  const hidden = ws.every((w) => w.y1 - w.y0 < HIDDEN_MAX_PT);
  return { bbox: [k(x0, p.width), k(y0, p.height), k(x1, p.width), k(y1, p.height)], bbox_pt: [x0, y0, x1, y1], hidden };
}

const clip = (t: string): string => (t.length > 600 ? `${t.slice(0, 599)}…` : t);

function span(n: number, channel: InjectionChannel, text: string, signals: string[], o: Partial<InjectionSpan> = {}): InjectionSpan {
  return {
    span_id: `inj-${n}`, channel, hidden: false, text: clip(text), page: null, line_index: null, bbox: null, bbox_pt: null, page_size_pt: null,
    signals, found_by: ["code"], confirmed_by_model: null, counted: true, ...o,
  };
}

/** Scan the text layer (or OCR when there is none) and the email body. Every returned span counts (fires R8). */
export function detectInjection(a: { layer: TextPage[]; ocr: TextPage[] | null; eml: string | null }): InjectionSpan[] {
  const out: InjectionSpan[] = [];
  const pages = a.layer.length ? a.layer : (a.ocr ?? []);
  for (const p of pages) {
    const taken = new Set<number>();
    p.lines.forEach((line, i) => {
      const geo = p.source === "text_layer" ? lineGeo(p, i) : null;
      const c = classify(line);
      if (!geo?.hidden && !c.instruction) return;
      taken.add(i);
      const channel: InjectionChannel = geo?.hidden ? "pdf_hidden_text" : p.source === "text_layer" ? "pdf_text" : "ocr_text";
      out.push(span(out.length + 1, channel, line, geo?.hidden ? ["tiny_text", ...c.signals] : c.signals, {
        hidden: !!geo?.hidden, page: p.page, line_index: i, bbox: geo?.bbox ?? null, bbox_pt: geo?.bbox_pt ?? null, page_size_pt: [p.width, p.height],
      }));
    });
    // A visible sentence wrapped over two lines: test the pair when neither line fired alone.
    for (let i = 0; i + 1 < p.lines.length; i++) {
      if (taken.has(i) || taken.has(i + 1)) continue;
      const c = classify(`${p.lines[i]} ${p.lines[i + 1]}`);
      if (!c.instruction) continue;
      const g0 = p.source === "text_layer" ? lineGeo(p, i) : null;
      const g1 = p.source === "text_layer" ? lineGeo(p, i + 1) : null;
      const bbox = g0 && g1 ? ([Math.min(g0.bbox[0], g1.bbox[0]), g0.bbox[1], Math.max(g0.bbox[2], g1.bbox[2]), g1.bbox[3]] as [number, number, number, number]) : null;
      const bbox_pt = g0 && g1 ? ([Math.min(g0.bbox_pt[0], g1.bbox_pt[0]), g0.bbox_pt[1], Math.max(g0.bbox_pt[2], g1.bbox_pt[2]), g1.bbox_pt[3]] as [number, number, number, number]) : null;
      taken.add(i).add(i + 1);
      out.push(span(out.length + 1, p.source === "text_layer" ? "pdf_text" : "ocr_text", `${p.lines[i]} ${p.lines[i + 1]}`, c.signals, { page: p.page, line_index: i, bbox, bbox_pt, page_size_pt: [p.width, p.height] }));
    }
  }
  for (const para of emailParagraphs(a.eml)) {
    const c = classify(para);
    if (c.instruction) out.push(span(out.length + 1, "email_body", para, c.signals));
  }
  return out;
}

/** Where a model-quoted text sits: a page line, or an email paragraph. Null when it is not in the request verbatim. */
export function locateQuote(quote: string, a: { layer: TextPage[]; ocr: TextPage[] | null; eml: string | null }): Omit<InjectionSpan, "span_id" | "signals" | "found_by" | "confirmed_by_model" | "counted"> | null {
  const q = normText(quote);
  if (q.length < 12) return null;
  for (const p of a.layer.length ? a.layer : (a.ocr ?? [])) {
    const i = p.lines.findIndex((l) => normText(l).includes(q) || (q.includes(normText(l)) && normText(l).length >= 24));
    if (i < 0) continue;
    const geo = p.source === "text_layer" ? lineGeo(p, i) : null;
    const channel: InjectionChannel = geo?.hidden ? "pdf_hidden_text" : p.source === "text_layer" ? "pdf_text" : "ocr_text";
    return { channel, hidden: !!geo?.hidden, text: clip(p.lines[i]!), page: p.page, line_index: i, bbox: geo?.bbox ?? null, bbox_pt: geo?.bbox_pt ?? null, page_size_pt: [p.width, p.height] };
  }
  const para = emailParagraphs(a.eml).find((x) => normText(x).includes(q));
  return para ? { channel: "email_body", hidden: false, text: clip(para), page: null, line_index: null, bbox: null, bbox_pt: null, page_size_pt: null } : null;
}

/** True when two span texts are the same text (one contains the other after normalising). */
export const sameSpan = (a: string, b: string): boolean => {
  const x = normText(a);
  const y = normText(b);
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
};
