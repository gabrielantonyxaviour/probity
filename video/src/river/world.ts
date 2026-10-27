// Film plan: the persistent world for the 3:30 film, driven by the timeline (segment ids M01..M09, R01..R13).
import { riverSchedule, caught, pickFlipFrame, type RiverSchedule } from "./schedule";
import { makeWorld, type MorphEvt, type WorldPlan } from "./worldCore";
import { buildCamKeys } from "../timeline/worldKeys";
import { TL, at, endOf, FPS, seg } from "../timeline/timeline";
import { prog, ease } from "../system/motion";
import { T_STATIC_SECONDS, SPEED } from "../system/matrix-field";
import { facts } from "../data/facts";
import type { HoldTarget } from "./layout-hold";

const BACK = -1.0; // morph back starts 1.0 s before the scene ends (the seam is part of the world)
const morphs: MorphEvt[] = [
  { from: "river", to: "streams", start: at("M03", 0) },
  { from: "streams", to: "river", start: at("M03", BACK) },
  { from: "river", to: "planes", start: at("M05", 0) },
  { from: "planes", to: "river", start: at("M05", BACK) },
  { from: "river", to: "streams", start: at("M06", 0) },
  { from: "streams", to: "river", start: at("M06", BACK) },
].filter((m) => m.start >= 0) as MorphEvt[];

/** Field clock: the last frame of the film lands on the landing hero's T_STATIC, the flow stays continuous. */
export const tSec = (frame: number) => frame / FPS + (T_STATIC_SECONDS - TL.total / FPS);
export const tField = (frame: number) => tSec(frame) * SPEED;

/** The catch frame: the first moment in M04 (3.0 to 5.0 s) where the branch is strongest at the gate for the next 0.8 s. */
export const FLIP_START = pickFlipFrame(FPS, tField, at("M04", 3.0), at("M04", 5.0));
const sched = (): RiverSchedule => ({
  fps: FPS,
  tField,
  branchFrom: at("M02", 1.0),
  gateFrom: at("M02", 3.5),
  flipStart: FLIP_START,
  releaseAt: seg("M09").start + Math.round(0.3 * FPS),
  recatchAt: endOf("M09") - Math.round(2.2 * FPS),
  endFrame: endOf("M09"),
});
export const riverParams = (frame: number) => riverSchedule(sched(), frame);

export function planesParams(frame: number): { act: number; mix: number } {
  const s = (frame - seg("M05").start) / FPS;
  const mix = prog(s, 1.6, 0.6) * (1 - prog(s, 11.0, 0.7));
  const step = (a: number) => prog(s, a, 0.5);
  return { act: s < 1.5 ? -1 : step(4.0) + step(6.7) + step(9.3), mix };
}

export function holdParams(frame: number): { active: boolean; peels: number[]; target: HoldTarget } {
  const n = facts.pending ? 2 : Math.min(3, Math.max(1, facts.sweep.length));
  return {
    active: frame >= at("M08", 0) && frame <= endOf("M09"),
    peels: Array.from({ length: n }, (_, j) => prog(frame, at("M08", 1.0 + 0.35 * j), 54, ease.inOut)),
    target: { x: 14.2, y: 1.0, z: -2.5, pitch: 0.62 },
  };
}

const plan: WorldPlan = {
  fps: FPS,
  camKeys: buildCamKeys(),
  morphs,
  tField,
  river: riverParams,
  planes: planesParams,
  streamsGate: (f) => prog(f, at("M06", 2.2), 40),
  hold: holdParams,
  bannerClip: (frame) => {
    const p = prog(frame, at("M09", 1.8), 60, ease.inOut);
    return p <= 0 ? null : { y0: 673 * p, y1: 1080 + (927 - 1080) * p };
  },
};
export const filmWorld = makeWorld(plan);
export const camAt = filmWorld.camAt;
export const cam2At = filmWorld.cam2At;
export const buildCells = filmWorld.buildCells;
export const bannerClip = filmWorld.bannerClip;

/** Centre of the caught cells (world x, z), for the "held before release" annotation. */
export function catchCentre(which: "m04" | "final" = "m04"): { x: number; z: number } {
  const set = caught(which === "m04" ? tField(FLIP_START) : tField(endOf("M09") - 1));
  let x = 0, z = 0;
  for (const i of set) {
    x += ((i % 240) + 0.5) * 0.12;
    z += (Math.floor(i / 240) - 29.5) * 0.14;
  }
  return { x: x / set.length, z: z / set.length };
}
