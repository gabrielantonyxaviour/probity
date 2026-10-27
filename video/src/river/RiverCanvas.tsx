import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { filmWorld } from "./world";
import type { World } from "./worldCore";
import { drawWorld } from "./draw";
import { FONT } from "../system/tokens";

let fontsReady = false;
async function loadFonts() {
  if (fontsReady) return;
  await Promise.all([
    document.fonts.load(`400 48px ${FONT.mono}`),
    document.fonts.load(`300 40px ${FONT.serif}`),
    document.fonts.load(`300 20px ${FONT.sans}`),
    document.fonts.load(`500 14px ${FONT.mono}`),
  ]);
  await document.fonts.ready;
  fontsReady = true;
}

export const useFontsReady = () => {
  const [ready, setReady] = useState(fontsReady);
  const [handle] = useState(() => (fontsReady ? null : delayRender("fonts")));
  useEffect(() => {
    if (fontsReady) {
      if (handle !== null) continueRender(handle);
      return;
    }
    loadFonts().then(() => {
      setReady(true);
      if (handle !== null) continueRender(handle);
    });
  }, [handle]);
  return ready;
};

/** The persistent 3D river. Always mounted at film level; its pixels are a pure function of the frame. */
export const RiverCanvas: React.FC<{ frame?: number; world?: World }> = ({ frame: override, world = filmWorld }) => {
  const own = useCurrentFrame();
  const frame = override ?? own;
  const { width, height } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const ready = useFontsReady();
  useLayoutEffect(() => {
    if (!ready) return;
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const buf = world.buildCells(frame);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    const clip = world.bannerClip(frame);
    if (clip) {
      ctx.beginPath();
      ctx.rect(0, clip.y0, width, clip.y1 - clip.y0);
      ctx.clip();
    }
    const c2 = world.cam2At(frame);
    const focus = height / 2 / Math.tan((c2.fov * Math.PI) / 360) / c2.scale;
    drawWorld(ctx, width, height, world.camAt(frame), buf, focus);
    ctx.restore();
  }, [frame, ready, width, height, world]);
  return <canvas ref={ref} width={width} height={height} style={{ position: "absolute", inset: 0 }} />;
};
