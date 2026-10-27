"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

type Options = {
  rootRef: RefObject<HTMLElement | null>;
  /** The element that receives `--progress` (0..1). */
  listRef: RefObject<HTMLElement | null>;
  ms: number;
  onAdvance: () => void;
};

/**
 * Autoplay timer for the answers accordion (motion.md 1.6). Runs only while at least half of the section is visible
 * and resumes from saved progress. Any manual choice stops it for good; reduced motion never starts it.
 */
export function useAutoplay({ rootRef, listRef, ms, onAdvance }: Options): { stop: () => void } {
  const stopped = useRef(false);
  const stopFn = useRef<() => void>(() => undefined);
  const advance = useRef(onAdvance);
  advance.current = onAdvance;

  useEffect(() => {
    const root = rootRef.current;
    const list = listRef.current;
    if (!root || !list) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let elapsed = 0;
    let prev = 0;
    let visible = false;
    let running = false;

    const setProgress = (v: number) => list.style.setProperty("--progress", v.toFixed(4));
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      elapsed += Math.min(now - prev, 100);
      prev = now;
      if (elapsed >= ms) {
        elapsed = 0;
        setProgress(0);
        advance.current();
        return;
      }
      setProgress(elapsed / ms);
    };
    const sync = () => {
      const go = visible && !stopped.current && !reduced.matches && !document.hidden;
      if (go && !running) {
        running = true;
        prev = performance.now();
        raf = requestAnimationFrame(loop);
      } else if (!go && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    };
    stopFn.current = () => {
      stopped.current = true;
      elapsed = 0;
      setProgress(0);
      sync();
    };
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        sync();
      },
      { threshold: 0.5 },
    );
    io.observe(root);
    reduced.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      reduced.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [rootRef, listRef, ms]);

  return { stop: useCallback(() => stopFn.current(), []) };
}
