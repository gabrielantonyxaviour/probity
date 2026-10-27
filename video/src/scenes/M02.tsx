import React from "react";
import { AbsoluteFill } from "remotion";
import { C, FONT } from "../system/tokens";
import { Eyebrow, Serif, Panel, monoStyle } from "../system/Text";
import { Annotation } from "./Annotation";
import { useScene } from "./useScene";
import { anchor } from "../system/anchor";
import { branchWorld } from "../river/layout-river";
import { tField } from "../river/world";
import { ease, bez, clamp01 } from "../system/motion";
import { beat } from "../data/beats";
import { seg } from "../timeline/timeline";

const B: React.CSSProperties = { fontWeight: 400, color: C.fg };
interface Card { id: string; from: number; to: number; eyebrow: string; text: React.ReactNode; source: string; note?: string }

// Every figure carries its source line in frame for its whole hold (>= 1.5 s). Never "SAM.gov".
const CARDS: Card[] = [
  {
    id: "doj", from: beat("M02", "doj"), to: beat("M02", "ic3"), eyebrow: "A real case · 2018",
    text: (<><b style={B}>$23.5 million</b> diverted after stolen contractor logins changed banking details on a government vendor payment system (2018).</>),
    source: "USAO-NJ release 22-160 (29 Apr 2022); GAO-26-108174",
  },
  {
    id: "ic3", from: beat("M02", "ic3"), to: beat("M02", "afp"), eyebrow: "Business email compromise",
    text: (<><b style={B}>$3,046,598,558</b> lost to business email compromise in 2025.</>),
    source: "FBI IC3 2025 Internet Crime Report",
  },
  {
    id: "afp", from: beat("M02", "afp"), to: seg("M02").len + 20, eyebrow: "The control already exists",
    text: (<><b style={B}>91%</b> of organisations call back on a system-of-record number, not one in the email.</>),
    source: "AFP 2025 Payments Fraud and Control Survey (2024 data)",
  },
];

export const M02: React.FC = () => {
  const { f, g, alpha } = useScene("M02");
  const e = bez(ease.content);
  const bp = branchWorld(118, tField(g));
  const a = anchor(g, bp.x, 0, bp.z);
  return (
    <AbsoluteFill>
      {CARDS.map((c) => {
        const inP = e(clamp01((f - c.from + 4) / 12)); // on screen as its sentence starts
        const outP = e(clamp01((f - (c.to - 10)) / 8));
        const o = Math.min(inP, 1 - outP) * (c.id === "afp" ? alpha : 1);
        if (o <= 0.001) return null;
        return (
          <div key={c.id} style={{ position: "absolute", left: 120, top: 150, width: 860, opacity: o }}>
            <Panel style={{ padding: "34px 40px 30px" }}>
              <Eyebrow frame={f} at={c.from} style={{ marginBottom: 20 }}>{c.eyebrow}</Eyebrow>
              <Serif frame={f} at={c.from + 3} size={44}>{c.text}</Serif>
              <div style={{ marginTop: 26, borderTop: `1px solid ${C.rule}`, paddingTop: 14 }}>
                <div style={{ ...monoStyle, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>Source: {c.source}</div>
                {c.note ? <div style={{ fontFamily: FONT.sans, fontWeight: 300, fontSize: 15, color: C.muted, marginTop: 8 }}>{c.note}</div> : null}
              </div>
            </Panel>
          </div>
        );
      })}
      {a.visible && a.y < 1040 ? <Annotation frame={f} at={110} x={a.x} y={a.y} dx={-70} dy={60} label="Lookalike account" sub="One payment branch peels away" alpha={alpha} align="right" /> : null}
    </AbsoluteFill>
  );
};
