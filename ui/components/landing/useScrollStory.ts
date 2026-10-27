"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Panels: intro plus four steps (motion.md 1.5). Scroll budget: 0.4 viewport of intro, 0.7 per step. */
export const PANELS = 5;
const INTRO = 0.4;
const STEP = 0.7;
const PLATES = 4;
const MARKER = 0.5; // the active marker sits at the middle of the sticky column

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const stacked = (i: number) => 105 * (i - 1.5);
function exploded(i: number, active: number): number {
  if (i === active) return 0;
  return Math.sign(i - active) * (320 + 60 * (Math.abs(i - active) - 1));
}
const layout = (i: number, state: number) => (state < 0 ? stacked(i) : exploded(i, state));

/** Plate offsets for scroll progress `l` (in steps). Moves half a step ahead of the text; `discrete` skips blending. */
export function plateOffsets(l: number, discrete: boolean, step: number): number[] {
  const out: number[] = [];
  const p = discrete ? step : clamp(l + 0.5, 0, PLATES);
  const n = discrete ? step - 1 : Math.min(Math.floor(p), PLATES - 1);
  const f = discrete ? 1 : p >= PLATES ? 1 : p - n;
  for (let i = 0; i < PLATES; i++) {
    const a = layout(i, n - 1);
    const b = layout(i, n);
    out.push(a + (b - a) * f);
  }
  return out;
}

/** Which panel (0 intro, 1..4) and progress through it, for a scroll offset `t` into the section. */
export function storyAt(t: number, vh: number): { step: number; progress: number; l: number } {
  const l = (t - INTRO * vh) / (STEP * vh);
  if (l < 0) return { step: 0, progress: 0, l };
  const step = Math.min(1 + Math.floor(l), PANELS - 1);
  return { step, progress: clamp(l - (step - 1), 0, 1), l };
}

function beamFor(step: number, progress: number): { top: number; bottom: number } {
  if (step === 0) return { top: 0, bottom: 0 };
  if (step === 1) return { top: MARKER, bottom: MARKER + (1 - MARKER) * progress };
  if (step === PANELS - 1) return { top: 0, bottom: MARKER * progress };
  return { top: 0, bottom: progress };
}

/**
 * Scroll-scrubbed story. One rAF loop, alive only while the section is on screen, writes CSS variables on the
 * section (`--plate-0..3`, `--beam-top`, `--beam-bottom`) and returns the active panel. Reduced motion switches panels
 * at the same thresholds with no blending and a full-length beam.
 */
export function useScrollStory(ref: RefObject<HTMLElement | null>): { step: number; goTo: (step: number) => void } {
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let running = false;
    const last: Record<string, string> = {};
    const put = (k: string, v: string) => {
      if (last[k] === v) return;
      last[k] = v;
      el.style.setProperty(k, v);
    };

    const frame = () => {
      const vh = window.innerHeight;
      const t = -el.getBoundingClientRect().top;
      const s = storyAt(t, vh);
      const discrete = reduced.matches;
      plateOffsets(s.l, discrete, s.step).forEach((y, i) => put(`--plate-${i}`, y.toFixed(2)));
      const beam = discrete ? { top: 0, bottom: s.step === 0 ? 0 : 1 } : beamFor(s.step, s.progress);
      put("--beam-top", beam.top.toFixed(4));
      put("--beam-bottom", beam.bottom.toFixed(4));
      if (s.step !== stepRef.current) {
        stepRef.current = s.step;
        setStep(s.step);
      }
    };
    const loop = () => {
      frame();
      raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver((entries) => {
      const on = entries.some((e) => e.isIntersecting);
      if (on && !running) {
        running = true;
        raf = requestAnimationFrame(loop);
      } else if (!on && running) {
        running = false;
        cancelAnimationFrame(raf);
        frame();
      }
    });
    io.observe(el);
    frame();
    const onChange = () => frame();
    reduced.addEventListener("change", onChange);
    window.addEventListener("resize", onChange);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      reduced.removeEventListener("change", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, [ref]);

  const goTo = useCallback(
    (target: number) => {
      const el = ref.current;
      if (!el) return;
      const vh = window.innerHeight;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const mid = target === 0 ? 0 : INTRO + STEP * (target - 1) + STEP / 2;
      window.scrollTo({ top: top + mid * vh, behavior: "smooth" });
    },
    [ref],
  );

  return { step, goTo };
}
