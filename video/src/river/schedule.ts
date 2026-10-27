// Parameter schedule shared by the film and the deck: reveal, branch, gate flips (the catch), dimming and the hero re-catch.
import { caughtCells, GATE_COL, FIELD_GEOM, fy, type RiverParams } from "./layout-river";
import { field, CELL_FIELD } from "../system/matrix-field";
import { prog, ease } from "../system/motion";

export interface RiverSchedule {
  fps: number;
  tField(frame: number): number;
  branchFrom: number; // branch begins to peel
  gateFrom: number; // faint gate column appears
  flipStart: number; // gate cells flip to crosses (60 ms apart)
  releaseAt: number | null; // crosses revert and the branch re-brightens (before the final re-catch)
  recatchAt: number | null; // final re-catch at the landing hero's static time
  endFrame: number;
}

const cache = new Map<number, number[]>();
export const caught = (t: number) => {
  const k = Math.round(t * 1000);
  let v = cache.get(k);
  if (!v) cache.set(k, (v = caughtCells(t)));
  return v;
};
export const flipN = (fps: number, f0: number, f: number) => Math.max(0, Math.min(12, Math.floor((f - f0) / (0.06 * fps)) + 1));

export function riverSchedule(sc: RiverSchedule, frame: number): { p: RiverParams; set: number[] } {
  const { fps } = sc;
  let catchT = sc.tField(sc.flipStart);
  let flips = frame < sc.flipStart ? 0 : Math.min(12, flipN(fps, sc.flipStart, frame));
  let dim = frame < sc.flipStart ? 0 : Math.min(4, Math.floor((frame - sc.flipStart) / 3) + 1);
  if (sc.releaseAt !== null && frame >= sc.releaseAt) {
    const recatch = sc.recatchAt ?? Infinity;
    flips = frame < recatch ? 12 - flipN(fps, sc.releaseAt, frame) : 0;
    dim = Math.round(4 * (1 - prog(frame, sc.releaseAt, 30, ease.content)));
  }
  if (sc.recatchAt !== null && frame >= sc.recatchAt) {
    catchT = sc.tField(sc.endFrame - 1);
    flips = flipN(fps, sc.recatchAt, frame);
    dim = 0;
  }
  return {
    set: caught(catchT),
    p: {
      tField: sc.tField(frame),
      reveal: prog(frame, 0, 45),
      branchGain: prog(frame, sc.branchFrom, 60),
      gateShow: prog(frame, sc.gateFrom, 45),
      catchT,
      flips,
      dim,
    },
  };
}

/** Number of branch cells at or above the glyph threshold inside the gate columns at field time t. */
export function gateStrength(t: number): number {
  let n = 0;
  for (let k = 0; k < 3; k++) {
    const col = GATE_COL + k;
    for (let row = 0; row < 60; row++) if (field((col + 0.5) * CELL_FIELD, fy(row), t, FIELD_GEOM).vb * 255 >= 96) n++;
  }
  return n;
}

/** First frame in [from, to] where the gate holds the strongest branch for the next 0.8 s (deterministic pick of the catch moment). */
export function pickFlipFrame(fps: number, tField: (f: number) => number, from: number, to: number): number {
  let best = -1, at = from;
  for (let f = from; f <= to; f += 3) {
    const m = Math.min(gateStrength(tField(f)), gateStrength(tField(f + Math.round(0.4 * fps))), gateStrength(tField(f + Math.round(0.8 * fps))));
    if (m > best) {
      best = m;
      at = f;
    }
  }
  return at;
}
