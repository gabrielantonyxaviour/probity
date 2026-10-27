import React from "react";
import { AbsoluteFill } from "remotion";
import { C, FONT, VIDEO } from "../system/tokens";
import { Eyebrow, Serif, Panel, Awaiting, monoStyle, Rule } from "../system/Text";
import { useScene } from "./useScene";
import { facts } from "../data/facts";
import { ease, bez, clamp01 } from "../system/motion";

/** M07 receipts: a Nightshift receipt card assembled only from facts.receipt (the filmed run's receipts jsonl). */
export const M07: React.FC = () => {
  const { f, alpha } = useScene("M07");
  const e = bez(ease.content);
  const r = facts.pending ? null : facts.receipt;
  const rows: [string, string][] = r
    ? ([
        ["Model", r.model ?? "-"],
        ["Egress", r.egress ? `egress ${r.egress}` : "-"],
        ["Routing width", r.routing_width === null ? "-" : `routing width ${r.routing_width}`],
        ...(r.hmem_injected === 0 && r.all_calls_hmem_zero !== false ? ([["H-MEM", "hmem injected 0"]] as [string, string][]) : []),
      ] satisfies [string, string][])
    : [];
  const w = 1240;
  return (
    <AbsoluteFill style={{ opacity: alpha }}>
      <div style={{ position: "absolute", left: (VIDEO.width - w) / 2, top: 170, width: w }}>
        <Panel style={{ padding: "44px 60px 46px" }}>
          <Eyebrow frame={f} at={6} size={20} style={{ marginBottom: 22 }}>Meterless Nightshift · receipt</Eyebrow>
          <Serif frame={f} at={9} size={72}>What Nemotron did</Serif>
          <div style={{ margin: "22px 0 8px" }}><Rule frame={f} at={14} width={w - 120} /></div>
          {r === null ? (
            <div style={{ padding: "18px 0 6px" }}><Awaiting /></div>
          ) : (
            rows.map(([k, v], i) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "20px 0", borderBottom: `1px solid ${C.rule}`, opacity: e(clamp01((f - 22 - i * 4) / 12)) }}>
                <div style={{ ...monoStyle, fontSize: 22, color: C.muted }}>{k}</div>
                <div style={{ fontFamily: FONT.mono, fontSize: 32, color: C.fg, fontFeatureSettings: '"zero" 1' }}>{v}</div>
              </div>
            ))
          )}
          <div style={{ ...monoStyle, fontSize: 18, color: C.subtle, marginTop: 22, opacity: e(clamp01((f - 40) / 12)) }}>
            {facts.pending ? "run pending" : `run ${facts.run_id} · ${facts.sha256.slice(0, 10)}`}
          </div>
        </Panel>
      </div>
    </AbsoluteFill>
  );
};
