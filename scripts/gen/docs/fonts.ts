// IBM Plex (SIL OFL 1.1, scripts/fonts/OFL.txt) loaded once with opentype.js. The same files are embedded in the PDFs, so wrapping,
// glyph outlines and bounding boxes are identical on every machine.
import path from "node:path";
import opentype from "opentype.js";
import { REPO } from "../env-files";

export type FontKey = "sans" | "sansBold" | "sansItalic" | "serif" | "serifBold";
const FILES: Record<FontKey, string> = {
  sans: "PlexSans-Regular.ttf", sansBold: "PlexSans-Bold.ttf", sansItalic: "PlexSans-Italic.ttf",
  serif: "PlexSerif-Regular.ttf", serifBold: "PlexSerif-Bold.ttf",
};
export const fontPath = (k: FontKey): string => path.join(REPO, "scripts/fonts", FILES[k]);
const cache = new Map<FontKey, opentype.Font>();
export function font(k: FontKey): opentype.Font {
  let f = cache.get(k);
  if (!f) { f = opentype.loadSync(fontPath(k)); cache.set(k, f); }
  return f;
}
export const width = (k: FontKey, text: string, size: number): number => font(k).getAdvanceWidth(text, size);
export const ascent = (k: FontKey, size: number): number => (font(k).ascender / font(k).unitsPerEm) * size;
export const pathData = (k: FontKey, text: string, x: number, y: number, size: number): string => font(k).getPath(text, x, y, size).toPathData(2);
