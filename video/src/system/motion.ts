// Mirror of ui/lib/motion.ts (motion.md section 3). If the UI lane's file lands, make one of the two canonical.
import { Easing } from "remotion";

export const dur = { d1: 150, d2: 200, d3: 230, d4: 300, d5: 350, d6: 400, d7: 500, d8: 550, d9: 600, pulse: 3000, autoplay: 8000 } as const;
export const ease = {
  quickOut: [0.3, 0.76, 0.27, 1],
  expoOut: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
  spring: [0.34, 1.56, 0.64, 1],
  standard: [0.4, 0, 0.2, 1],
  exit: [0.4, 0, 1, 1],
  content: [0, 0, 0.58, 1],
  plain: [0.25, 0.1, 0.25, 1],
} as const;
export const stagger = { step: 60, annotation: 600 } as const;

type Curve = readonly [number, number, number, number];
const cache = new Map<string, (t: number) => number>();
export function bez(c: Curve): (t: number) => number {
  const k = c.join(",");
  let f = cache.get(k);
  if (!f) {
    f = Easing.bezier(c[0], c[1], c[2], c[3]);
    cache.set(k, f);
  }
  return f;
}

export const msToFrames = (ms: number, fps = 30) => Math.round((ms / 1000) * fps);
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Eased progress 0..1 of `frame` through [start, start+len), clamped. */
export function prog(frame: number, start: number, len: number, curve: Curve = ease.inOut): number {
  if (len <= 0) return frame >= start ? 1 : 0;
  return bez(curve)(clamp01((frame - start) / len));
}
