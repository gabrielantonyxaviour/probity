import React from "react";
import { C, FONT } from "../system/tokens";
import { monoStyle } from "../system/Text";
import { ease, bez, clamp01 } from "../system/motion";

/** Annotation grammar (motion.md 2.2): the leader draws over 17 frames after 3, then dot and label fade at +18 frames. */
export const Annotation: React.FC<{
  frame: number; at: number; x: number; y: number; dx: number; dy: number; label: string; sub?: string; color?: string; align?: "left" | "right"; alpha?: number;
}> = ({ frame, at, x, y, dx, dy, label, sub, color = C.fg2, align = "left", alpha = 1 }) => {
  const line = bez(ease.content)(clamp01((frame - at - 3) / 17));
  const text = bez(ease.content)(clamp01((frame - at - 18) / 9));
  const x2 = x + dx, y2 = y + dy;
  const lx = x + dx * line, ly = y + dy * line;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: alpha, pointerEvents: "none" }}>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <line x1={x} y1={y} x2={lx} y2={ly} stroke={color} strokeWidth={1} />
        <circle cx={x} cy={y} r={2} fill={color} opacity={clamp01((frame - at) / 4)} />
      </svg>
      <div
        style={{
          position: "absolute", top: y2 - 8, opacity: text, ...(align === "left" ? { left: x2 + 10 } : { right: 1920 - x2 + 10 }),
          textAlign: align,
        }}
      >
        <div style={{ ...monoStyle, fontSize: 13, color, whiteSpace: "nowrap" }}>{label}</div>
        {sub ? <div style={{ fontFamily: FONT.sans, fontWeight: 300, fontSize: 15, color: C.muted, marginTop: 6, whiteSpace: "nowrap" }}>{sub}</div> : null}
      </div>
    </div>
  );
};
