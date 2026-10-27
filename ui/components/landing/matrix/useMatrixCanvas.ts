"use client";

import { useEffect, type RefObject } from "react";
import { FIELD, computeFrame, gateColumns, type Tier } from "./matrix-field";

const FRAME_MS = 33;
const DPR_MAX = 2;
/** Tier glyph colour tokens, read once from the computed style (tiers 1 to 6). */
const TIER_VARS = ["--stone-1000", "--stone-950", "--stone-800", "--stone-600", "--stone-600", "--hold"] as const;
const GLYPHS = ["·", ":", "$", "$", "$", "×"] as const;

type Options = { staticFrame: boolean };

function resolveColour(host: HTMLElement, token: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  probe.style.display = "none";
  host.appendChild(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

function fontFamily(host: HTMLElement): string {
  const probe = document.createElement("span");
  probe.style.fontFamily = "var(--font-mono)";
  probe.style.display = "none";
  host.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily;
  probe.remove();
  return family;
}

/** One small atlas holds the six glyphs, so a frame is ~2,500 drawImage blits instead of fillText calls. */
function buildAtlas(host: HTMLElement, dpr: number, family: string): HTMLCanvasElement {
  const cw = FIELD.cellW * dpr;
  const ch = FIELD.cellH * dpr;
  const atlas = document.createElement("canvas");
  atlas.width = cw * GLYPHS.length;
  atlas.height = ch;
  const g = atlas.getContext("2d");
  if (!g) return atlas;
  g.font = `400 ${12 * dpr}px ${family}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  TIER_VARS.forEach((token, i) => {
    g.fillStyle = resolveColour(host, token);
    g.fillText(GLYPHS[i], i * cw + cw / 2, ch / 2 + dpr * 0.5);
  });
  return atlas;
}

/**
 * Draws the payment river into `canvasRef`. Canvas 2D, 33 ms throttle, first draw after fonts are ready, paused when
 * off-screen or hidden (time stays continuous), DPR <= 2, ResizeObserver, live reduced-motion listener.
 * Writes `--gate-x` and `--caught-y` on `hostRef` for the annotation overlay.
 */
export function useMatrixCanvas(
  hostRef: RefObject<HTMLElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { staticFrame }: Options,
): void {
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: true });
    if (!host || !canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let ready = false;
    let visible = true;
    let running = false;
    let raf = 0;
    let last = -Infinity;
    let origin = 0;
    let pausedAt: number | null = null;
    let pausedTotal = 0;
    let atlas: HTMLCanvasElement | null = null;
    let family = "";
    let dpr = 1;
    let cols = 0;
    let rows = 0;
    let buf = new Uint8Array(0);
    let lastT: number = FIELD.T_STATIC;
    let lastCaught = -2;
    let lastGate = -2;
    let ema = 0;
    let frames = 0;

    const shouldAnimate = () => ready && visible && !document.hidden && !reduced.matches && !staticFrame;

    const draw = (t: number) => {
      if (!atlas || cols === 0) return;
      const t0 = performance.now();
      lastT = t;
      computeFrame(cols, rows, t, buf);
      ctx.clearRect(0, 0, cols * FIELD.cellW, rows * FIELD.cellH);
      const cw = FIELD.cellW * dpr;
      const ch = FIELD.cellH * dpr;
      let caughtTop = -1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tier = buf[r * cols + c] as Tier;
          if (tier === 0) continue;
          if (tier === 6 && caughtTop < 0) caughtTop = r;
          ctx.drawImage(atlas, (tier - 1) * cw, 0, cw, ch, c * FIELD.cellW, r * FIELD.cellH, FIELD.cellW, FIELD.cellH);
        }
      }
      if (caughtTop !== lastCaught) {
        lastCaught = caughtTop;
        host.style.setProperty("--caught-y", caughtTop < 0 ? "0px" : `${caughtTop * FIELD.cellH}px`);
      }
      const ms = performance.now() - t0;
      ema = ema === 0 ? ms : ema * 0.9 + ms * 0.1;
      if (++frames % 30 === 0) canvas.dataset.frameMs = ema.toFixed(2);
      if (!host.dataset.ready) host.dataset.ready = "1";
    };

    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (ts - last < FRAME_MS) return;
      last = ts;
      draw((ts - origin - pausedTotal) / 1000);
    };

    const sync = () => {
      const go = shouldAnimate();
      if (go && !running) {
        running = true;
        const now = performance.now();
        if (origin === 0) {
          origin = now - lastT * 1000;
          pausedTotal = 0;
        } else if (pausedAt !== null) {
          pausedTotal += now - pausedAt;
        }
        pausedAt = null;
        raf = requestAnimationFrame(tick);
      } else if (!go && running) {
        running = false;
        cancelAnimationFrame(raf);
        pausedAt = performance.now();
      }
      if (!go && ready && (reduced.matches || staticFrame)) draw(FIELD.T_STATIC);
    };

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width === 0 || height === 0) return;
      const nextDpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
      if (nextDpr !== dpr || !atlas) {
        dpr = nextDpr;
        atlas = buildAtlas(host, dpr, family);
      }
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / FIELD.cellW) + 1;
      rows = Math.ceil(height / FIELD.cellH) + 1;
      buf = new Uint8Array(cols * rows);
      const gate = gateColumns(cols);
      const gateX = Math.round((gate.first + FIELD.gateCols / 2) * FIELD.cellW);
      if (gateX !== lastGate) {
        lastGate = gateX;
        host.style.setProperty("--gate-x", `${gateX}px`);
      }
      const half = 80; // half the label width: keep the label inside the banner at narrow widths
      const shift = Math.max(half - gateX, Math.min(0, width - gateX - half));
      host.style.setProperty("--label-shift", `${shift}px`);
      draw(reduced.matches || staticFrame ? FIELD.T_STATIC : lastT);
    };

    let resizeRaf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(resize);
    });
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      sync();
    });
    const onVisibility = () => sync();
    const onMotion = () => {
      origin = 0;
      pausedAt = null;
      pausedTotal = 0;
      lastT = FIELD.T_STATIC;
      sync();
    };

    void (async () => {
      family = fontFamily(host);
      try {
        await Promise.all([document.fonts.ready, document.fonts.load(`400 12px ${family}`)]);
      } catch {
        /* fonts API unavailable: draw with whatever the browser has */
      }
      if (disposed) return;
      ready = true;
      resize();
      observer.observe(host);
      io.observe(host);
      document.addEventListener("visibilitychange", onVisibility);
      reduced.addEventListener("change", onMotion);
      sync();
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeRaf);
      observer.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onMotion);
    };
  }, [hostRef, canvasRef, staticFrame]);
}
