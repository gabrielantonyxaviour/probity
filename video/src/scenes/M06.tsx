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

/** M06 Zetaris: the M03 world reprised longer. 3 sources -> vendor360 (12 tables) -> DQ1 / DQ2 gate over the payment run; query ids tick. */
export const M06: React.FC = () => {
  const { f, g, alpha } = useScene("M06");
  const e = bez(ease.content);
  const gate = anchor(g, cellX(229), 0, 0);
  const ids = facts.pending ? [] : facts.query_ids.slice(0, 4);
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
          <Annotation frame={f} at={84} x={gate.x} y={gate.y} dx={80} dy={-90} label="DQ1 unverified_recent_bank_change" color={C.fg2} alpha={alpha} />
          <Annotation frame={f} at={96} x={gate.x} y={gate.y + 14} dx={80} dy={-52} label="DQ2 account_single_vendor" color={C.fg2} alpha={alpha} />
        </>
      ) : null}
      <div style={{ position: "absolute", left: 120, bottom: 110, opacity: alpha }}>
        <Serif frame={f} at={60} size={44}>Every fact is a query with an id.</Serif>
        <div style={{ marginTop: 16, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          {facts.pending ? <Awaiting /> : ids.map((id, i) => (
            <div key={id} style={{ ...monoStyle, textTransform: "none", fontSize: 13, color: C.fg2, opacity: e(clamp01((f - 70 - i * 12) / 8)) }}>query {id.slice(0, 12)}</div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
