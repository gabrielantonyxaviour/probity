import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../system/tokens";
import { Eyebrow, Serif, monoStyle } from "../system/Text";
import { Annotation } from "./Annotation";
import { useScene } from "./useScene";
import { anchor } from "../system/anchor";
import { cellX } from "../river/cells";
import { LANE_Y, LANE_Z } from "../river/layout-streams";
import { ease, bez, clamp01 } from "../system/motion";

export const SOURCES = [
  { name: "Vendor master + AP ledger", tag: "INTERNAL · ERP", color: C.olive },
  { name: "USAspending", tag: "REAL · PUBLIC", color: C.real },
  { name: "SEC EDGAR", tag: "REAL · PUBLIC", color: C.real },
] as const;

/** Three source ribbons (internal ERP and two public registries) merge into one plane: vendor360, Zetaris. */
export const M03: React.FC = () => {
  const { f, g, alpha } = useScene("M03");
  const e = bez(ease.content);
  const slab = anchor(g, cellX(204), 0, 0);
  const sp = clamp01((f - 128) / 15);
  return (
    <AbsoluteFill>
      {SOURCES.map((s, i) => {
        const a = anchor(g, cellX(34), LANE_Y[i], LANE_Z[i]);
        return a.visible ? <Annotation key={s.name} frame={f} at={62 + i * 16} x={a.x} y={a.y} dx={-60} dy={-52 + i * 4} label={s.name} sub={s.tag} color={s.color} align="right" alpha={alpha} /> : null;
      })}
      <div style={{ position: "absolute", left: slab.x - 230, top: slab.y + 150, width: 460, textAlign: "center", opacity: e(sp) * alpha }}>
        <Eyebrow frame={f} at={128} style={{ justifyContent: "center", margin: "0 auto 14px", width: "fit-content" }}>One semantic layer · Zetaris</Eyebrow>
        <Serif frame={f} at={132} size={54} style={{ fontStyle: "normal" }}>vendor360</Serif>
        <div style={{ ...monoStyle, fontSize: 13, color: C.muted, marginTop: 10 }}>3 sources · 12 tables · one USL</div>
      </div>
    </AbsoluteFill>
  );
};
