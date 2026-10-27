import { script } from "../data/script";
import { slotsFile, type SlotCfg } from "../data/slots";
import { TOTAL_CAP_SECONDS, VIDEO } from "../system/tokens";

export interface Seg {
  id: string;
  kind: "motion" | "slot";
  start: number; // frames
  len: number; // frames (0 when a conditional slot is disabled)
  enabled: boolean;
  slot?: SlotCfg;
}
export interface Timeline {
  segs: Seg[];
  total: number;
  byId: Map<string, Seg>;
}

const f = (s: number) => Math.round(s * VIDEO.fps);

export function buildTimeline(): Timeline {
  const motion = new Map(script.motion.map((m) => [m.id, m]));
  const slots = new Map(slotsFile.slots.map((s) => [s.id, s]));
  const segs: Seg[] = [];
  let at = 0;
  for (const id of script.sequence) {
    const m = motion.get(id);
    if (m) {
      segs.push({ id, kind: "motion", start: at, len: f(m.seconds), enabled: true });
      at += f(m.seconds);
      continue;
    }
    const s = slots.get(id);
    if (!s) throw new Error(`sequence names ${id} but slots.json has no such slot`);
    const len = s.enabled ? f(s.seconds) : 0;
    segs.push({ id, kind: "slot", start: at, len, enabled: s.enabled, slot: s });
    at += len;
  }
  const total = at;
  if (total > f(Math.min(TOTAL_CAP_SECONDS, slotsFile.cap_seconds))) {
    throw new Error(`Film is ${(total / VIDEO.fps).toFixed(1)} s, over the ${TOTAL_CAP_SECONDS} s cap. Disable S7 (R08), then F29 (R12), then shorten agents.`);
  }
  return { segs, total, byId: new Map(segs.map((s) => [s.id, s])) };
}

export const TL = buildTimeline();
export const seg = (id: string): Seg => {
  const s = TL.byId.get(id);
  if (!s) throw new Error(`unknown segment ${id}`);
  return s;
};
/** Frame offset into a segment by seconds; negative seconds count back from its end. */
export const at = (id: string, sec: number): number => {
  const s = seg(id);
  return sec >= 0 ? s.start + f(sec) : s.start + s.len + f(sec);
};
export const endOf = (id: string): number => seg(id).start + seg(id).len;
export const FPS = VIDEO.fps;
export const secs = f;
