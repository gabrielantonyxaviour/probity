import React from "react";
import { AbsoluteFill } from "remotion";
import { C, FONT } from "../system/tokens";
import { Eyebrow, Serif, monoStyle } from "../system/Text";
import { Annotation } from "./Annotation";
import { useScene } from "./useScene";
import { anchor } from "../system/anchor";
import { catchCentre } from "../river/world";
import { ease, bez, clamp01 } from "../system/motion";

export const REPO = "github.com/gabrielantonyxaviour/probity";

/** M09 outro: the world lands on the landing hero frame (top-down banner at T_STATIC). No exit: the last frame is the hero. */
export const M09: React.FC = () => {
  const { f, g } = useScene("M09");
  const e = bez(ease.content);
  const cc = catchCentre("final");
  const gate = anchor(g, cc.x, 0, cc.z);
  const rules = clamp01((f - 108) / 20);
  const ruleLine = (y: number) => <div style={{ position: "absolute", left: 0, top: y, width: 1920 * e(rules), height: 1, background: C.rule }} />;
  return (
    <AbsoluteFill>
      {ruleLine(673)}
      {ruleLine(927)}
      <div style={{ position: "absolute", left: 120, top: 150 }}>
        <Eyebrow frame={f} at={96} style={{ marginBottom: 22 }}>Open Agent Hackathon 2026 · Track T01</Eyebrow>
        <Serif frame={f} at={100} size={112}>Probity</Serif>
        <Serif frame={f} at={110} size={44} color={C.fg2} style={{ marginTop: 22 }}>Verify the payee, not the paperwork.</Serif>
        <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 14, opacity: e(clamp01((f - 126) / 15)) }}>
          <div style={{ fontFamily: FONT.mono, fontSize: 20, color: C.fg, fontFeatureSettings: '"zero" 1' }}>{REPO}</div>
          <div style={{ ...monoStyle, fontSize: 14, color: C.muted }}>SAMPLE_MODE: one command, no keys</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 1060, top: 330, width: 740, opacity: e(clamp01((f - 150) / 18)) }}>
        <div style={{ ...monoStyle, fontSize: 14, color: C.fg2, marginBottom: 12 }}>Built Grok-first</div>
        <div style={{ fontFamily: FONT.sans, fontWeight: 300, fontSize: 23, color: C.fg2, lineHeight: 1.45 }}>
          Grok (xAI) built the Zetaris data layer (source registration, the unified vendor360 layer, data-quality rules, live checks) and wrote the independent end-to-end test suite. Claude Code built the agents and the interface.
        </div>
      </div>
      {gate.visible && f > 114 ? <Annotation frame={f} at={118} x={gate.x} y={gate.y - 24} dx={0} dy={-56} label="Held before release" color={C.fg2} /> : null}
    </AbsoluteFill>
  );
};
