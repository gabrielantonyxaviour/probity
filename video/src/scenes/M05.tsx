import React from "react";
import { AbsoluteFill } from "remotion";
import { C, FONT, STEP } from "../system/tokens";
import { Eyebrow, monoStyle } from "../system/Text";
import { useScene } from "./useScene";
import { anchor } from "../system/anchor";
import { planesParams } from "../river/world";
import { planeOffset, PLANE_X, PLANE_COLS } from "../river/layout-planes";
import { CW } from "../river/cells";
import { ease, bez, clamp01, msToFrames } from "../system/motion";
import { fx } from "../data/facts";
import { beat } from "../data/beats";

const AGENTS = [
  { code: "A1", name: "Letter Reader", model: "Nemotron 3 Ultra × 2", line: "Reads it twice; the readings must agree", color: STEP.read, at: beat("M05", "A1") },
  { code: "A2", name: "Registry Scout", model: "Nemotron 3.5 Lightning", line: "A fixed floor of Zetaris checks, plus the checks the floor misses", color: STEP.gather, at: beat("M05", "A2") },
  { code: "A3", name: "Identity Examiner", model: "Nemotron 3 Ultra", line: "Re-runs the query, sends the Scout back when evidence is missing", color: STEP.challenge, at: beat("M05", "A3") },
  { code: "A4", name: "Gate Officer", model: "Code decides", line: "Applies policy: approve, call back or hold", color: STEP.decide, at: beat("M05", "A4") },
] as const;

const Check: React.FC<{ p: number; color: string }> = ({ p, color }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" style={{ verticalAlign: "-2px", marginLeft: 8 }}>
    <path d="M2 8.5 L6.2 12.5 L14 3.5" fill="none" stroke={color} strokeWidth="1.6" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
  </svg>
);

/** M05 agents: four isometric planes, one accent each; the loop arrow Examiner -> Scout is drawn in screen space over the planes. */
export const M05: React.FC = () => {
  const { f, g, alpha } = useScene("M05");
  const e = bez(ease.content);
  const { act, mix } = planesParams(g);
  const rEdge = (i: number) => anchor(g, PLANE_X + (PLANE_COLS / 2) * CW, planeOffset(i, act, mix), 0);
  const loopA = rEdge(2), loopB = rEdge(1);
  const LOOP = beat("M05", "A3") + 24; // the Examiner sends the Scout back
  const loopP = e(clamp01((f - LOOP) / msToFrames(550)));
  const tickP = e(clamp01((f - LOOP - 18) / 9));
  const mx = Math.max(loopA.x, loopB.x) + 70;
  const d = `M ${loopA.x} ${loopA.y} C ${mx} ${loopA.y}, ${mx} ${loopB.y}, ${loopB.x} ${loopB.y}`;
  return (
    <AbsoluteFill style={{ opacity: alpha }}>
      <div style={{ position: "absolute", left: 120, top: 190, width: 560 }}>
        {AGENTS.map((a, i) => {
          const on = e(clamp01((f - a.at) / 15));
          const next = AGENTS[i + 1];
          const active = f >= a.at && (!next || f < next.at);
          const bar = e(clamp01((f - a.at - 4) / msToFrames(600)));
          return (
            <div key={a.code} style={{ position: "relative", padding: "0 0 0 26px", marginBottom: 34, opacity: on * (active ? 1 : 0.5) }}>
              <div style={{ position: "absolute", left: 0, top: 0, width: 3, height: 86 * bar, background: a.color }} />
              <Eyebrow frame={f} at={a.at} color={a.color} size={13} style={{ marginBottom: 10 }}>{a.code} · {a.model}</Eyebrow>
              <div style={{ fontFamily: FONT.serif, fontWeight: 300, fontSize: 40, color: C.fg, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{a.name}</div>
              <div style={{ fontFamily: FONT.sans, fontWeight: 300, fontSize: 17, color: C.muted, marginTop: 8, height: 24, opacity: active ? 1 : 0 }}>
                {a.line}
                {a.code === "A1" && fx.readings() ? <span style={{ ...monoStyle, fontSize: 12, color: C.agree, marginLeft: 12 }}>{fx.readings()}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
      {loopP > 0 && loopA.visible && loopB.visible ? (
        <>
          <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
            <path d={d} fill="none" stroke={STEP.challenge} strokeWidth={1.5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - loopP} />
            <circle cx={loopB.x} cy={loopB.y} r={3} fill={STEP.challenge} opacity={loopP} />
          </svg>
          <div style={{ position: "absolute", left: mx + 14, top: (loopA.y + loopB.y) / 2 - 22, opacity: clamp01((f - LOOP - 18) / 9) }}>
            <div style={{ ...monoStyle, fontSize: 13, color: STEP.challenge }}>GapRequest, ≤2 rounds</div>
            <div style={{ ...monoStyle, fontSize: 12, color: C.fg2, marginTop: 8, opacity: tickP }}>
              re-query · row hash<Check p={tickP} color={C.agree} />
            </div>
          </div>
        </>
      ) : null}
    </AbsoluteFill>
  );
};
