import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../system/tokens";
import { Eyebrow, Serif, Panel, Awaiting, monoStyle } from "../system/Text";
import { Annotation } from "./Annotation";
import { SOURCES } from "./M03";
import { useScene } from "./useScene";
import { anchor } from "../system/anchor";
import { cellX } from "../river/cells";
import { LANE_Y, LANE_Z } from "../river/layout-streams";
import { facts } from "../data/facts";
import { ease, bez, clamp01 } from "../system/motion";

export const TABLES = [
  "registry_entity", "registry_child", "registry_parent", "registry_alias", "sec_registrant", "vendor",
  "vendor_contact", "vendor_bank_account", "vendor_contact_log", "ap_invoice", "bank_change_request", "payment_run_item",
];

export const RULES = [
  ["DQ1", "unverified_recent_bank_change"],
  ["DQ2", "account_single_vendor"],
  ["DQ7", "one bank account, two vendors"],
  ["DQ8", "bank_change_before_large_payment"],
  ["DQ9", "payee name differs from the master"],
] as const;
const LINEAGE = ["source system", "USL table", "query id", "SQL hash", "row hash"];

/** M06 Zetaris: the M03 world reprised longer. 3 sources -> vendor360 (12 tables) -> five sweep rules over the payment run; lineage. */
export const M06: React.FC = () => {
  const { f, g, alpha } = useScene("M06");
  const e = bez(ease.content);
  const gate = anchor(g, cellX(229), 0, 0);
  const ids = facts.pending ? [] : facts.query_ids.slice(0, 3);
  const nq = facts.pending ? null : (facts.zetaris_queries ?? null);
  return (
    <AbsoluteFill>
      {SOURCES.map((s, i) => {
        const a = anchor(g, cellX(34), LANE_Y[i], LANE_Z[i]);
        return a.visible ? <Annotation key={s.name} frame={f} at={40 + i * 10} x={a.x} y={a.y} dx={-60} dy={-52 + i * 4} label={s.name} sub={s.tag} color={s.color} align="right" alpha={alpha} /> : null;
      })}
      <div style={{ position: "absolute", left: 120, top: 120, width: 520, opacity: alpha }}>
        <Eyebrow frame={f} at={30} style={{ marginBottom: 14 }}>vendor360 · 12 tables · one USL</Eyebrow>
        <Panel style={{ padding: "18px 22px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px" }}>
            {TABLES.map((t, i) => (
              <div key={t} style={{ ...monoStyle, textTransform: "none", fontSize: 13, color: C.fg2, opacity: e(clamp01((f - 36 - i * 3) / 10)) }}>{t}</div>
            ))}
          </div>
        </Panel>
      </div>
      {gate.visible ? (
        <>
          {RULES.map(([id, name], i) => (
            <Annotation key={id} frame={f} at={78 + i * 10} x={gate.x} y={gate.y + i * 6} dx={80} dy={-170 + i * 38} label={`${id} ${name}`} color={C.fg2} alpha={alpha} />
          ))}
        </>
      ) : null}
      <div style={{ position: "absolute", left: 1010, bottom: 110, width: 800, opacity: alpha }}>
        <Serif frame={f} at={60} size={44}>Each fact traces back to its rows.</Serif>
        <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center" }}>
          {LINEAGE.map((l, i) => (
            <React.Fragment key={l}>
              <div style={{ ...monoStyle, textTransform: "none", fontSize: 14, color: C.fg, border: `1px solid ${C.ruleStrong}`, padding: "7px 12px", opacity: e(clamp01((f - 84 - i * 9) / 10)) }}>{l}</div>
              {i < LINEAGE.length - 1 ? <div style={{ width: 22, height: 1, background: C.ruleStrong, opacity: e(clamp01((f - 88 - i * 9) / 10)) }} /> : null}
            </React.Fragment>
          ))}
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          {nq ? <div style={{ ...monoStyle, fontSize: 13, color: C.muted, opacity: e(clamp01((f - 130) / 10)) }}>{nq} Zetaris queries in this check</div> : null}
          {facts.pending ? <Awaiting /> : ids.map((id, i) => (
            <div key={id} style={{ ...monoStyle, textTransform: "none", fontSize: 13, color: C.fg2, opacity: e(clamp01((f - 136 - i * 10) / 8)) }}>query {id.slice(0, 12)}</div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
