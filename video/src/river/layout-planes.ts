// M05 world: four isometric planes (Letter Reader, Registry Scout, Identity Examiner, Gate Officer).
import { CW, CH, G_DOT, G_COLON, G_DOLLAR, accentColor, type CellBuf } from "./cells";
import { field, tier, CELL_FIELD } from "../system/matrix-field";
import { FIELD_GEOM } from "./layout-river";

export const PLANE_COLS = 120;
export const PLANE_ROWS = 30;
export const PLANE_CELLS = PLANE_COLS * PLANE_ROWS; // 3600; 4 planes = 14,400 = every cell
export const PLANE_X = 12;
const U = 0.0114; // motion.md 1.5 offsets (105 stacked, 320 / 380 / 440 pushed) scaled to world units
const G = [0, G_DOT, G_COLON, G_DOLLAR, G_DOLLAR];

/** Continuous version of the scrollytelling offsets. act < 0 means stacked. */
export function planeOffset(i: number, act: number, mix: number): number {
  const stacked = 105 * (i - 1.5);
  const d = i - act;
  const ad = Math.abs(d);
  const exploded = ad < 1 ? d * 320 : Math.sign(d) * (320 + 60 * (ad - 1));
  return (stacked + (exploded - stacked) * mix) * U;
}

export function planeWeight(i: number, act: number): number {
  return act < 0 ? 0 : Math.max(0, 1 - Math.abs(i - act));
}

export function fillPlanes(buf: CellBuf, tField: number, act: number, mix: number, all = 0): void {
  for (let p = 0; p < 4; p++) {
    const y = planeOffset(p, act, mix);
    const lit = all > 0.5 || planeWeight(p, act) > 0.5;
    const base = p * PLANE_CELLS;
    for (let l = 0; l < PLANE_CELLS; l++) {
      const i = base + l;
      const c = l % PLANE_COLS;
      const r = (l - c) / PLANE_COLS;
      buf.x[i] = PLANE_X + (c - PLANE_COLS / 2 + 0.5) * CW;
      buf.y[i] = y;
      buf.z[i] = (r - PLANE_ROWS / 2 + 0.5) * CH;
      const edge = c === 0 || c === PLANE_COLS - 1 || r === 0 || r === PLANE_ROWS - 1;
      const X = c * CELL_FIELD * 0.55 + p * 5.1;
      const Y = FIELD_GEOM.hc + (r - 14.5) * CELL_FIELD * 0.5;
      const t = tier(field(X, Y, tField + p * 1.9, FIELD_GEOM).v);
      let g: number = G[t];
      let col = t === 0 ? 0 : t - 1;
      if (edge) {
        g = G_DOLLAR;
        col = 3;
      } else if (c % 20 === 0 && r % 10 !== 0) {
        g = G_COLON;
        col = 1;
      }
      if (lit && g !== 0) col = accentColor(p, Math.min(3, col));
      buf.g[i] = g;
      buf.c[i] = col;
      buf.a[i] = lit ? 1 : 0.8;
    }
  }
}
