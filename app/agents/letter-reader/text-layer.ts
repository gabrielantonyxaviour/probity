// PDF text layer and OCR word boxes -> quote-to-box matching (04 §2.2, REV-44). Boxes are 0-1000 page coordinates.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { normText } from "../../policy/normalise";
import type { OcrPage } from "./docs.port";

const run = promisify(execFile);

export type Word = { text: string; x0: number; y0: number; x1: number; y1: number };
export type TextPage = { page: number; width: number; height: number; words: Word[]; lines: string[]; text: string; source: "text_layer" | "ocr" };
export type Bbox = [number, number, number, number];

const decode = (s: string): string =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));

/** Parse `pdftotext -bbox-layout` XHTML into pages of lines and boxed words (page size in pt). */
export function parseBboxLayout(xhtml: string): TextPage[] {
  const pages: TextPage[] = [];
  for (const pm of xhtml.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)) {
    const width = Number(pm[1]);
    const height = Number(pm[2]);
    const words: Word[] = [];
    const lines: string[] = [];
    for (const lm of pm[3]!.matchAll(/<line [^>]*>([\s\S]*?)<\/line>/g)) {
      const lw: string[] = [];
      for (const wm of lm[1]!.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g)) {
        const text = decode(wm[5]!);
        words.push({ text, x0: Number(wm[1]), y0: Number(wm[2]), x1: Number(wm[3]), y1: Number(wm[4]) });
        lw.push(text);
      }
      if (lw.length) lines.push(lw.join(" "));
    }
    pages.push({ page: pages.length + 1, width, height, words, lines, text: lines.join("\n"), source: "text_layer" });
  }
  return pages;
}

export async function readPdfTextLayer(pdfPath: string, signal?: AbortSignal): Promise<TextPage[]> {
  const { stdout } = await run("pdftotext", ["-bbox-layout", "-enc", "UTF-8", pdfPath, "-"], { maxBuffer: 32 * 1024 * 1024, timeout: 30_000, signal });
  return parseBboxLayout(stdout);
}

export function pageFromOcr(page: number, o: OcrPage): TextPage {
  const lines = o.text.split("\n").map((l) => l.trim()).filter(Boolean);
  return { page, width: o.width, height: o.height, words: o.words, lines, text: lines.join("\n"), source: "ocr" };
}

/** Page text with line numbers, as sent to the model (04 §6.1). */
export const numbered = (p: TextPage): string => p.lines.map((l, i) => `${i + 1}: ${l}`).join("\n");

export function normToken(t: string): string {
  return t.normalize("NFKC").toLowerCase().replace(/^[.,;:]+|[.,;:]+$/g, "");
}
const tokensOf = (t: string): string[] => t.normalize("NFKC").split(/\s+/).map(normToken).filter(Boolean);

/** Find the quote as a contiguous word sequence (line breaks allowed) and return the union box in 0-1000 coordinates. */
export function matchQuote(p: TextPage, quote: string): Bbox | null {
  const q = tokensOf(quote);
  if (q.length === 0) return null;
  const w = p.words.map((x) => normToken(x.text));
  for (let i = 0; i + q.length <= w.length; i++) {
    let ok = true;
    for (let j = 0; j < q.length; j++) {
      if (w[i + j] !== q[j]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const span = p.words.slice(i, i + q.length);
    const x0 = Math.min(...span.map((s) => s.x0));
    const y0 = Math.min(...span.map((s) => s.y0));
    const x1 = Math.max(...span.map((s) => s.x1));
    const y1 = Math.max(...span.map((s) => s.y1));
    const c = (v: number, d: number) => Math.max(0, Math.min(1000, Math.round((v / d) * 1000)));
    return [c(x0, p.width), c(y0, p.height), c(x1, p.width), c(y1, p.height)];
  }
  return null;
}

/** True when the quote's words occur (as a contiguous run) in the page text, ignoring case and spacing. */
export const quoteInPage = (p: TextPage, quote: string): boolean => matchQuote(p, quote) !== null || normText(p.text).includes(normText(quote));
