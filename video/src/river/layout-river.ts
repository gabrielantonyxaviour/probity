import { COLS, ROWS, CW, CH, cellX, cellZ, G_DOT, G_COLON, G_DOLLAR, G_CROSS, COLOR_HOLD, type CellBuf } from "./cells";
import { field, centre, tier, CELL_FIELD, BRANCH_START, GATE_AT, GATE_WIDTH_CELLS, type FieldGeom } from "../system/matrix-field";

// The field is evaluated at landing-banner geometry (161 x 19 cells at 1920 px) so the top-down last frame is the hero frame:
// world cols 0..160 and rows 20..38 are the banner's cols and rows; the world just carries more bed around them.
export const BANNER_COLS = 161;
export const BANNER_ROWS = 19;
export const FIELD_ROW_SHIFT = 20;
export const fy = (row: number) => (row - FIELD_ROW_SHIFT + 0.5) * CELL_FIELD;
export const FIELD_GEOM: FieldGeom = { fieldWidth: BANNER_COLS * CELL_FIELD, hc: (BANNER_ROWS * CELL_FIELD) / 2 };
export const GATE_COL = Math.round(GATE_AT * BANNER_COLS);
export const BRANCH_COL = Math.round(BRANCH_START * BANNER_COLS);
export const GATE_X = cellX(GATE_COL + 1);

export interface RiverParams {
  tField: number; // field clock t (already seconds * 0.9)
  reveal: number; // 0..1 open fade
  branchGain: number; // 0..1 how visible the diverted branch is
  gateShow: number; // 0..1 faint gate column
  catchT: number; // field time at which the caught cells are chosen
  flips: number; // 0..12 gate cells turned into red crosses
  dim: number; // 0..4 tiers the upstream branch has dimmed
}

const GLYPH_OF_TIER = [0, G_DOT, G_COLON, G_DOLLAR, G_DOLLAR];
const THR = 96 / 255;

/** The 12 caught cells: top 4 branch cells per gate column at catchT (deterministic, column-major). */
export function caughtCells(catchT: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < GATE_WIDTH_CELLS; k++) {
    const col = GATE_COL + k;
    const X = (col + 0.5) * CELL_FIELD;
    const rows: { row: number; vb: number }[] = [];
    for (let row = 0; row < ROWS; row++) rows.push({ row, vb: field(X, fy(row), catchT, FIELD_GEOM).vb });
    rows.sort((a, b) => b.vb - a.vb || a.row - b.row);
    for (const r of rows.slice(0, 4)) if (r.vb > 0.12) out.push(r.row * COLS + col);
    out.sort((a, b) => (a % COLS) - (b % COLS) || a - b);
  }
  return out.slice(0, 12);
}

export function fillRiver(buf: CellBuf, p: RiverParams, caught: number[]): void {
  const alphaAll = Math.min(1, p.reveal * 3);
  const cap = p.reveal < 0.35 ? 1 : p.reveal < 0.6 ? 2 : p.reveal < 0.85 ? 3 : 4;
  const caughtIdx = new Map<number, number>();
  caught.forEach((i, k) => caughtIdx.set(i, k));
  for (let row = 0; row < ROWS; row++) {
    const Y = fy(row);
    const z = cellZ(row);
    for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      const X = (col + 0.5) * CELL_FIELD;
      buf.x[i] = cellX(col);
      buf.y[i] = 0;
      buf.z[i] = z;
      const { v, vb } = field(X, Y, p.tField, FIELD_GEOM);
      const k = caughtIdx.get(i);
      if (k !== undefined && p.flips > k) {
        buf.g[i] = G_CROSS;
        buf.c[i] = COLOR_HOLD;
        buf.a[i] = 1;
        continue;
      }
      const b = vb * p.branchGain;
      if (b >= THR && col >= BRANCH_COL) {
        const toward = Math.min(1, (col - BRANCH_COL) / (GATE_COL - BRANCH_COL));
        const upstream = col < GATE_COL;
        const level = upstream ? 4 - p.dim : 4; // dims one tier per step until it is only bed texture
        if (level <= 0) {
          buf.g[i] = 0;
        } else {
          buf.g[i] = GLYPH_OF_TIER[level];
          buf.c[i] = level - 1;
          buf.a[i] = (1 - 0.5 * toward) * alphaAll;
        }
        continue;
      }
      let t = tier(v);
      if (t > cap) t = cap as typeof t;
      if (col >= GATE_COL && col < GATE_COL + GATE_WIDTH_CELLS && p.gateShow > 0 && t < 2) {
        buf.g[i] = G_COLON;
        buf.c[i] = 1;
        buf.a[i] = p.gateShow * alphaAll * 0.9;
        continue;
      }
      buf.g[i] = GLYPH_OF_TIER[t];
      buf.c[i] = t === 0 ? 0 : t - 1;
      buf.a[i] = alphaAll;
    }
  }
}
export { CW, CH };

/** World position (x, z) of the diverted branch centre line at a column and field time. */
export function branchWorld(col: number, tF: number): { x: number; z: number } {
  const X = (col + 0.5) * CELL_FIELD;
  const xd = BRANCH_START * FIELD_GEOM.fieldWidth;
  const Y = centre(X, tF, FIELD_GEOM.hc) + 0.06 * Math.max(0, X - xd) ** 2;
  return { x: cellX(col), z: cellZ(Y / CELL_FIELD - 0.5 + FIELD_ROW_SHIFT) };
}
