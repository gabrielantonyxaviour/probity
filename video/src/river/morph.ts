import { N, COLS, type CellBuf } from "./cells";
import { bez, ease } from "../system/motion";

export interface MorphSpec {
  t: number; // seconds into the morph
  dur: number; // per-cell duration (1.2 s inOut)
  groupStagger: number; // seconds per column group (60 ms)
  groups: number; // columns per group
}

/** out = A -> B per cell with a column-group stagger; glyph / colour swap at the cell's midpoint. */
export function morph(out: CellBuf, A: CellBuf, B: CellBuf, s: MorphSpec): void {
  const e = bez(ease.inOut);
  for (let i = 0; i < N; i++) {
    const grp = Math.floor((i % COLS) / s.groups);
    const raw = (s.t - grp * s.groupStagger) / s.dur;
    const p = e(raw < 0 ? 0 : raw > 1 ? 1 : raw);
    out.x[i] = A.x[i] + (B.x[i] - A.x[i]) * p;
    out.y[i] = A.y[i] + (B.y[i] - A.y[i]) * p;
    out.z[i] = A.z[i] + (B.z[i] - A.z[i]) * p;
    const src = p < 0.5 ? A : B;
    out.g[i] = src.g[i];
    out.c[i] = src.c[i];
    out.a[i] = src.a[i];
  }
}
