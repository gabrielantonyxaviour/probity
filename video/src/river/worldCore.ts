// Generic world: a plan supplies camera keys, layout morph events and parameter schedules; the core turns a frame into cells.
import { makeBuf, type CellBuf } from "./cells";
import { fillRiver, type RiverParams } from "./layout-river";
import { fillStreams } from "./layout-streams";
import { fillPlanes } from "./layout-planes";
import { applyHold, type HoldTarget } from "./layout-hold";
import { morph } from "./morph";
import { resolve, lerp2, type Cam2 } from "./cam2";
import type { Cam } from "./camera";
import { bez, ease, clamp01 } from "../system/motion";

export type Kind = "river" | "streams" | "planes";
export interface MorphEvt { from: Kind; to: Kind; start: number }
export interface CamKey { f: number; cam: Cam2 }
export interface WorldPlan {
  fps: number;
  camKeys: CamKey[];
  morphs: MorphEvt[];
  tField(frame: number): number;
  river(frame: number): { p: RiverParams; set: number[] };
  planes(frame: number): { act: number; mix: number; all?: number };
  streamsGate(frame: number): number;
  hold?(frame: number): { active: boolean; peels: number[]; target: HoldTarget };
  bannerClip?(frame: number): { y0: number; y1: number } | null;
}
export interface World {
  plan: WorldPlan;
  cam2At(frame: number): Cam2;
  camAt(frame: number): Cam;
  buildCells(frame: number): CellBuf;
  bannerClip(frame: number): { y0: number; y1: number } | null;
}

const MORPH_SEC = 1.2;
const GROUP_STAGGER = 0.06;
const GROUP_COLS = 20;

export function makeWorld(plan: WorldPlan): World {
  const morphFrames = Math.round((MORPH_SEC + 11 * GROUP_STAGGER) * plan.fps);
  const keys = plan.camKeys;
  const bufs = { a: makeBuf(), b: makeBuf(), out: makeBuf() };

  const cam2At = (frame: number): Cam2 => {
    if (frame <= keys[0].f) return keys[0].cam;
    for (let i = 1; i < keys.length; i++) {
      if (frame <= keys[i].f) {
        const a = keys[i - 1], b = keys[i];
        return lerp2(a.cam, b.cam, bez(ease.inOut)(clamp01((frame - a.f) / (b.f - a.f))));
      }
    }
    return keys[keys.length - 1].cam;
  };

  const kindAt = (frame: number): { a: Kind; b: Kind | null; t: number } => {
    let kind: Kind = "river";
    for (const m of plan.morphs) {
      if (frame < m.start) break;
      if (frame < m.start + morphFrames) return { a: m.from, b: m.to, t: (frame - m.start) / plan.fps };
      kind = m.to;
    }
    return { a: kind, b: null, t: 0 };
  };

  const fill = (kind: Kind, buf: CellBuf, frame: number) => {
    if (kind === "river") {
      const r = plan.river(frame);
      fillRiver(buf, r.p, r.set);
      const h = plan.hold?.(frame);
      if (h?.active) applyHold(buf, h.peels, h.target);
    } else if (kind === "streams") {
      fillStreams(buf, plan.tField(frame), plan.streamsGate(frame));
    } else {
      const pp = plan.planes(frame);
      fillPlanes(buf, plan.tField(frame), pp.act, pp.mix, pp.all ?? 0);
    }
  };

  return {
    plan,
    cam2At,
    camAt: (frame) => resolve(cam2At(frame)),
    bannerClip: (frame) => plan.bannerClip?.(frame) ?? null,
    buildCells(frame) {
      const k = kindAt(frame);
      if (!k.b) {
        fill(k.a, bufs.out, frame);
        return bufs.out;
      }
      fill(k.a, bufs.a, frame);
      fill(k.b, bufs.b, frame);
      morph(bufs.out, bufs.a, bufs.b, { t: k.t, dur: MORPH_SEC, groupStagger: GROUP_STAGGER, groups: GROUP_COLS });
      return bufs.out;
    },
  };
}
