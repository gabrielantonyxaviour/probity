import React from "react";
import { C, FONT } from "./tokens";
import { ease, bez, clamp01 } from "./motion";

export const EXIT_FRAMES = 24; // Lockgate rule: overlays leave in the last 24 frames so the next scene opens on the bare world

/** 1 until `len - EXIT_FRAMES`, then fades to 0 (plain curve; exits are shorter than entrances). */
export const exitAlpha = (frame: number, len: number, exit = EXIT_FRAMES) =>
  1 - bez(ease.plain)(clamp01((frame - (len - exit)) / Math.max(1, exit * 0.6)));

export const monoStyle: React.CSSProperties = {
  fontFamily: FONT.mono,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontFeatureSettings: '"zero" 1',
  fontWeight: 400,
};

/** Mono eyebrow: left-to-right clip-path wipe over 15 frames (motion.md 5.3). */
export const Eyebrow: React.FC<{ frame: number; at: number; children: React.ReactNode; color?: string; size?: number; style?: React.CSSProperties }> = ({
  frame, at, children, color = C.muted, size = 14, style,
}) => {
  const p = bez(ease.content)(clamp01((frame - at) / 15));
  return (
    <div style={{ ...monoStyle, fontSize: size, lineHeight: 1, color, clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`, whiteSpace: "nowrap", ...style }}>{children}</div>
  );
};

/** Serif line: opacity only, starting 2 frames after `at`, no translate and no scale. */
export const Serif: React.FC<{ frame: number; at: number; children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({
  frame, at, children, size = 44, color = C.fg, style,
}) => {
  const o = bez(ease.content)(clamp01((frame - at - 2) / 15));
  return (
    <div style={{ fontFamily: FONT.serif, fontWeight: 300, fontSize: size, lineHeight: 1.12, letterSpacing: "-0.03em", color, opacity: o, fontVariationSettings: '"opsz" 60', ...style }}>{children}</div>
  );
};

export const Sans: React.FC<{ frame: number; at: number; children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({
  frame, at, children, size = 20, color = C.fg2, style,
}) => {
  const o = bez(ease.content)(clamp01((frame - at - 2) / 15));
  return <div style={{ fontFamily: FONT.sans, fontWeight: 300, fontSize: size, lineHeight: 1.4, color, opacity: o, ...style }}>{children}</div>;
};

/** Translucent surface per tokens (--bg-popover): stone-1000 at 80%, 1 px rule, light blur. */
export const Panel: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; alpha?: number }> = ({ children, style, alpha = 1 }) => (
  <div style={{ background: "rgba(26,25,24,0.82)", border: `1px solid ${C.rule}`, borderRadius: 8, backdropFilter: "blur(4px)", opacity: alpha, ...style }}>{children}</div>
);

/** Marker for run-derived values whose run has not been recorded yet. */
export const Awaiting: React.FC<{ label?: string; style?: React.CSSProperties }> = ({ label = "AWAITING RECORDED RUN", style }) => (
  <span style={{ ...monoStyle, fontSize: 13, color: C.gap, border: `1px dashed ${C.gap}`, borderRadius: 3, padding: "3px 8px", whiteSpace: "nowrap", ...style }}>{label}</span>
);

/** Left-to-right draw of a hairline (pathLength style). */
export const Rule: React.FC<{ frame: number; at: number; width: number; color?: string; dur?: number }> = ({ frame, at, width, color = C.rule, dur = 17 }) => {
  const p = bez(ease.content)(clamp01((frame - at) / dur));
  return <div style={{ height: 1, width: width * p, background: color }} />;
};
