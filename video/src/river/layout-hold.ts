// M08: sweep items peel out of the river and settle into a dollar hold list floating above it.
import { COLS, CW, CH, G_DOLLAR, type CellBuf } from "./cells";

export const STRIP_COLS = 48;
export const STRIP_ROWS = 2;
export const stripSource = (j: number) => ({ col0: 96 + j * 40, row0: 28 });

export interface HoldTarget {
  x: number; // centre x of strip 0
  y: number;
  z: number; // centre z
  pitch: number; // z spacing between strips (the list stacks toward +z, i.e. down the screen at yaw -90)
}
export const stripCentre = (t: HoldTarget, j: number): [number, number, number] => [t.x, t.y, t.z + j * t.pitch];

/** peels[j] in 0..1 moves strip j's source cells (already filled as river) onto the list. */
export function applyHold(buf: CellBuf, peels: number[], target: HoldTarget): void {
  for (let j = 0; j < peels.length; j++) {
    const p = peels[j];
    if (p <= 0) continue;
    const { col0, row0 } = stripSource(j);
    const [cx, cy, cz] = stripCentre(target, j);
    const arc = Math.sin(Math.PI * p) * 0.3;
    for (let r = 0; r < STRIP_ROWS; r++) {
      for (let c = 0; c < STRIP_COLS; c++) {
        const i = (row0 + r) * COLS + col0 + c;
        const tx = cx + (c - STRIP_COLS / 2 + 0.5) * CW;
        const tz = cz + (r - STRIP_ROWS / 2 + 0.5) * CH;
        buf.x[i] += (tx - buf.x[i]) * p;
        buf.y[i] = cy * p + arc;
        buf.z[i] += (tz - buf.z[i]) * p;
        buf.g[i] = G_DOLLAR;
        buf.c[i] = 3;
        buf.a[i] = 1;
      }
    }
  }
}
