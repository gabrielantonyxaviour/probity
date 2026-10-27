import React from "react";
import { AbsoluteFill } from "remotion";
import { C, FONT } from "../system/tokens";
import { Eyebrow, Serif, Awaiting, monoStyle } from "../system/Text";
import { useScene } from "./useScene";
import { anchor } from "../system/anchor";
import { stripCentre, STRIP_COLS } from "../river/layout-hold";
import { holdParams } from "../river/world";
import { CW } from "../river/cells";
import { facts, fx } from "../data/facts";
import { ease, bez, clamp01 } from "../system/motion";

/** M08 impact: sweep items peel out of the river into a dollar hold list; exposure and Q8 come from facts. */
export const M08: React.FC = () => {
  const { f, g, alpha } = useScene("M08");
  const e = bez(ease.content);
  const { target } = holdParams(g);
  const n = facts.pending ? 2 : Math.min(3, Math.max(1, facts.sweep.length));
  return (
    <AbsoluteFill style={{ opacity: alpha }}>
      {Array.from({ length: n }, (_, j) => {
        const [cx, cy, cz] = stripCentre(target, j);
        const a = anchor(g, cx - (STRIP_COLS / 2) * CW, cy, cz);
        const it = facts.pending ? null : facts.sweep[j];
        const on = e(clamp01((f - (62 + j * 12)) / 12));
        return a.visible ? (
          <div key={j} style={{ position: "absolute", left: a.x, top: a.y - 38, opacity: on, display: "flex", gap: 18, alignItems: "baseline", whiteSpace: "nowrap" }}>
            {it ? (
              <>
                <span style={{ ...monoStyle, fontSize: 14, color: C.fg }}>{it.item_id} · {it.vendor_id}</span>
                <span style={{ fontFamily: FONT.sans, fontWeight: 300, fontSize: 17, color: C.fg2 }}>{it.vendor_name} · {it.rule}</span>
                <span style={{ fontFamily: FONT.mono, fontSize: 20, color: C.fg, fontFeatureSettings: '"zero" 1' }}>{fx.usd(it.amount_usd)}</span>
              </>
            ) : <Awaiting label="HOLD ITEM · AWAITING RECORDED RUN" />}
          </div>
        ) : null;
      })}
      <div style={{ position: "absolute", left: 120, bottom: 110 }}>
        <Eyebrow frame={f} at={20} style={{ marginBottom: 16 }}>Not asked, but checked</Eyebrow>
        <Serif frame={f} at={24} size={48}>A hold list, in dollars.</Serif>
        <div style={{ display: "flex", gap: 36, marginTop: 22, alignItems: "baseline" }}>
          {facts.pending ? <Awaiting /> : (
            <>
              <Stat label="At stake in this run" value={fx.usd(facts.vendor_amount_usd)} f={f} at={96} />
              <Stat label="This check, end to end" value={facts.execution_time_seconds === undefined ? "-" : `${Math.round(facts.execution_time_seconds)} s`} f={f} at={108} />
              <Stat label="Median per check" value={fx.q8() === null ? "-" : `${fx.q8()} s`} f={f} at={120} />
            </>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Stat: React.FC<{ label: string; value: string; f: number; at: number }> = ({ label, value, f, at }) => (
  <div style={{ opacity: bez(ease.content)(clamp01((f - at) / 12)) }}>
    <div style={{ ...monoStyle, fontSize: 12, color: C.muted, marginBottom: 8 }}>{label}</div>
    <div style={{ fontFamily: FONT.mono, fontSize: 26, color: C.fg, fontFeatureSettings: '"zero" 1' }}>{value}</div>
  </div>
);
