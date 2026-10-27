// M03 / M06 world: three source ribbons that merge into one slab (vendor360, 12 tile tables).
import { COLS, ROWS, CH, cellX, cellZ, G_DOT, G_COLON, G_DOLLAR, type CellBuf } from "./cells";
import { field, tier, CELL_FIELD } from "../system/matrix-field";
import { FIELD_GEOM, fy } from "./layout-river";

export const SLAB_COL0 = 168;
export const TILE_COLS = 18;
export const TILE_ROWS = 20;
export const LANE_Z = [-2.2, 0, 2.2];
export const LANE_Y = [0.55, 0, -0.55];
const G = [0, G_DOT, G_COLON, G_DOLLAR, G_DOLLAR];
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function fillStreams(buf: CellBuf, tField: number, gateShow: number): void {
  for (let row = 0; row < ROWS; row++) {
    const lane = Math.floor(row / 20);
    const lr = row % 20;
    for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      const u = col / COLS;
      const m = smooth(0.5, 0.68, u);
      const ribbonZ = LANE_Z[lane] + (lr - 9.5) * CH * 0.5;
      buf.x[i] = cellX(col);
      buf.y[i] = LANE_Y[lane] * (1 - m);
      buf.z[i] = ribbonZ + (cellZ(row) - ribbonZ) * m;
      const X = (col + 0.5) * CELL_FIELD;
      let g: number;
      let c: number;
      let a = 1;
      if (col < SLAB_COL0) {
        const Y = FIELD_GEOM.hc + (lr - 9.5) * CELL_FIELD * 0.45;
        const t = tier(field(X, Y, tField + lane * 2.7, FIELD_GEOM).v);
        g = G[t];
        c = t === 0 ? 0 : t - 1;
        // gaps between the three ribbons are empty space, so the plane reads as one object once merged
      } else {
        const sc = col - SLAB_COL0;
        const edge = sc === 0 || col === COLS - 1 || row === 0 || row === ROWS - 1;
        const tileEdge = sc % TILE_COLS === 0 || sc % TILE_COLS === TILE_COLS - 1 || lr === 0 || lr === TILE_ROWS - 1;
        if (edge) {
          g = G_DOLLAR;
          c = 3;
        } else if (tileEdge) {
          g = G_COLON;
          c = 2;
        } else {
          const t = Math.min(2, tier(field(X, fy(row), tField, FIELD_GEOM).v));
          g = G[t];
          c = t === 0 ? 0 : t - 1;
        }
      }
      if (gateShow > 0 && col >= 228 && col < 231 && row >= 4 && row < 56) {
        g = G_COLON;
        c = 3;
        a = gateShow;
      }
      buf.g[i] = g;
      buf.c[i] = c;
      buf.a[i] = a;
    }
  }
}
