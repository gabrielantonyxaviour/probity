// DeckSilent: ten slide segments over the same persistent world. Each slide ends on a held frame; clips are cut at the segment edges.
import { deck } from "../data/deck";
import { makeWorld, type MorphEvt, type CamKey, type WorldPlan } from "../river/worldCore";
import { riverSchedule, pickFlipFrame, type RiverSchedule } from "../river/schedule";
import { river, iso, type Cam2 } from "../river/cam2";
import { BANNER_VIEW } from "./worldKeys";
import { prog, ease } from "../system/motion";
import { T_STATIC_SECONDS, SPEED } from "../system/matrix-field";
import { VIDEO } from "../system/tokens";

const FPS = VIDEO.fps;
export interface DeckSeg { id: string; start: number; len: number }
let at0 = 0;
export const DECK_SEGS: DeckSeg[] = deck.slides.map((s) => {
  const len = Math.round(s.seconds * FPS);
  const seg = { id: s.id, start: at0, len };
  at0 += len;
  return seg;
});
export const DECK_TOTAL = at0;
export const dseg = (id: string): DeckSeg => {
  const s = DECK_SEGS.find((x) => x.id === id);
  if (!s) throw new Error(`no deck slide ${id}`);
  return s;
};
const dat = (id: string, sec: number) => (sec >= 0 ? dseg(id).start + Math.round(sec * FPS) : dseg(id).start + dseg(id).len + Math.round(sec * FPS));
const dend = (id: string) => dseg(id).start + dseg(id).len;

export const deckTField = (frame: number) => (frame / FPS + (T_STATIC_SECONDS - DECK_TOTAL / FPS)) * SPEED;

const flipStart = pickFlipFrame(FPS, deckTField, dat("D04", 2.5), dat("D04", 5.0));
const sched: RiverSchedule = {
  fps: FPS,
  tField: deckTField,
  branchFrom: dat("D02", 1.0),
  gateFrom: dat("D02", 4.0),
  flipStart,
  releaseAt: dseg("D10").start + Math.round(0.3 * FPS),
  recatchAt: dend("D10") - Math.round(2.2 * FPS),
  endFrame: dend("D10"),
};

// Deck views sit right of centre so the text column stays clear (target moved left along the screen-right vector).
const PLANES_DECK = iso(10.2 - 3.6, 0.4, 0.4 - 3.6, -45, 72);
const STREAMS_DECK = iso(15.5 - 3.4, 0, -4.0, -40, 62);
const key = (f: number, cam: Cam2): CamKey => ({ f, cam });
const camKeys: CamKey[] = [
  key(0, river(0.4, 1.2, -15)),
  key(dend("D01"), river(3.4, 1.2, -14)),
  key(dend("D02"), river(12.6, 3.4, -27, 0.9)),
  key(dend("D03"), river(12.8, 3.3, -26, 0.9)),
  key(dat("D04", 4.5), river(15.0, 1.7, -24, 0.8)),
  key(dend("D04"), river(15.0, 1.7, -24, 0.8)),
  key(dat("D05", 1.5), PLANES_DECK),
  key(dend("D06"), PLANES_DECK),
  key(dat("D07", 1.7), STREAMS_DECK),
  key(dend("D07"), STREAMS_DECK),
  key(dend("D08"), river(13.6, 2.0, -22, 0.8)),
  key(dend("D09"), river(11.5, 1.4, -16)),
  key(dat("D10", 3.6), BANNER_VIEW),
  key(dend("D10"), BANNER_VIEW),
];
const morphs: MorphEvt[] = [
  { from: "river", to: "planes", start: dat("D05", 0) },
  { from: "planes", to: "streams", start: dat("D07", 0) },
  { from: "streams", to: "river", start: dat("D08", 0) },
];

const plan: WorldPlan = {
  fps: FPS,
  camKeys,
  morphs,
  tField: deckTField,
  river: (f) => riverSchedule(sched, f),
  planes: (f) => {
    const s = (f - dseg("D05").start) / FPS;
    const step = (a: number) => prog(s, a, 0.5);
    if (f >= dseg("D06").start) return { act: -1, mix: 0, all: 1 };
    const collapse = prog(s, 7.6, 0.8);
    return { act: step(3.2) + step(4.9) + step(6.5), mix: prog(s, 1.6, 0.6) * (1 - collapse), all: collapse };
  },
  streamsGate: (f) => prog(f, dat("D07", 3), 40),
  bannerClip: (f) => {
    const p = prog(f, dat("D10", 1.8), 60, ease.inOut);
    return p <= 0 ? null : { y0: 673 * p, y1: 1080 + (927 - 1080) * p };
  },
};
export const deckWorld = makeWorld(plan);

const lerpK = (f: number, pts: [number, number][]) => {
  if (f <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (f <= pts[i][0]) return pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * (f - pts[i - 1][0])) / (pts[i][0] - pts[i - 1][0]);
  return pts[pts.length - 1][1];
};
/** Scrim levels keep text readable over the world and stay continuous across slide boundaries. */
export function scrim(f: number): { uniform: number; side: number; height: number } {
  const u = lerpK(f, [[0, 0.8], [dend("D04"), 0.8], [dat("D05", 0.6), 0], [dend("D07"), 0], [dat("D08", 0.6), 0.8], [dend("D10"), 0.8]]);
  const side = lerpK(f, [[0, 0], [dend("D04"), 0], [dat("D05", 0.6), 0.92], [dend("D07"), 0.92], [dat("D08", 0.6), 0]]);
  const height = lerpK(f, [[dat("D10", 0), 1080], [dat("D10", 2.6), 640]]);
  return { uniform: u, side, height };
}
