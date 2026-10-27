// Glyph atlas: one pre-rendered sprite per (glyph, colour, mip level), drawn from the mono font (motion.md 5.2).
import { C, FONT } from "../system/tokens";
import { G_DOT, G_COLON, G_DOLLAR, G_CROSS, COLOR_HOLD } from "./cells";

const GLYPH_CHAR: Record<number, string> = { [G_DOT]: "·", [G_COLON]: ":", [G_DOLLAR]: "$", [G_CROSS]: "×" };
const STONE = [C.t1, C.t2, C.t3, C.t4];
const ACCENTS = [C.cobalt, C.teal, C.violet, C.hold];
const MIX = [0.3, 0.5, 0.75, 1];
export const SPRITE_W = [48, 24, 12];

function hexToRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function mixOver(fg: string, m: number): string {
  const a = hexToRgb(fg);
  const b = hexToRgb(C.ground);
  const o = a.map((v, i) => Math.round(b[i] + (v - b[i]) * m));
  return `rgb(${o[0]},${o[1]},${o[2]})`;
}
export function colorOf(code: number): string {
  if (code < 4) return STONE[code];
  if (code === COLOR_HOLD) return C.hold;
  const k = code - 4;
  return mixOver(ACCENTS[Math.floor(k / 4)], MIX[k % 4]);
}

const cache = new Map<number, HTMLCanvasElement>();
export function sprite(glyph: number, color: number, level: number): HTMLCanvasElement {
  const key = (glyph * 64 + color) * 4 + level;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = SPRITE_W[level];
  const h = Math.round((w * 14) / 12);
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d");
  if (g) {
    g.fillStyle = colorOf(color);
    g.font = `400 ${w}px ${FONT.mono}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(GLYPH_CHAR[glyph] ?? "", w / 2, h / 2 + w * 0.04);
  }
  cache.set(key, cv);
  return cv;
}
