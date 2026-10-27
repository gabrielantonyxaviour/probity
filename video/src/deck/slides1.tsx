import React from "react";
import { C, FONT, monoStyle, Serif, Eyebrow, Awaiting } from "./parts";
import { SlideHead, Notice, Media, Cap, Body, fade, useLocal } from "./parts";

export const D01: React.FC = () => {
  const f = useLocal();
  return (
    <>
      <SlideHead f={f} id="D01" eyebrow="Open Agent Hackathon 2026 · Track T01 · Nemotron · Team Zen" size={64} width={1400} />
      <Body f={f} at={24} size={24} style={{ position: "absolute", left: 120, top: 318, width: 1250 }}>
        Reads a vendor's bank-detail change, cross-examines every claim across sources that disagree, and decides: approve, call back first, or hold.
      </Body>
      <div style={{ position: "absolute", left: 120, top: 440 }}>
        <Media slot="R01" at={2.5} label="S1 LETTER" w={800} h={450} f={f} show={30} />
        <Cap f={f} at={44}>The request: the vendor letter, as received</Cap>
      </div>
      <div style={{ position: "absolute", left: 1000, top: 440 }}>
        <Media slot="R02" at={1.8} label="HOLD BANNER" w={800} h={450} f={f} show={40} />
        <Cap f={f} at={54}>The decision, before the payment run</Cap>
      </div>
      <Notice f={f} />
    </>
  );
};

const PERSONAS = [
  { name: "Dana", role: "AP controls lead", org: "Fictional federal integrator", line: "Owns the call-back policy and the payment-run release." },
  { name: "Priya", role: "Assistant controller", org: "Signs off the run", line: "Needs a hold list in dollars, not a mailbox." },
  { name: "Tomás", role: "Vendor-master analyst", org: "Keeps the records straight", line: "Applies changes, makes the call-back." },
];
const STATS = [
  { v: "$23.5 million", t: "diverted after stolen contractor logins changed banking details on a government vendor payment system (2018).", s: "USAO-NJ release 22-160 (29 Apr 2022); GAO-26-108174" },
  { v: "$3,046,598,558", t: "lost to business email compromise in 2025.", s: "FBI IC3 2025 Internet Crime Report" },
  { v: "91%", t: "of organisations call back on a system-of-record number, not one in the email.", s: "AFP 2025 Payments Fraud and Control Survey (2024 data)" },
  { v: "25–40 min", t: "per request to find an independent number across 3–4 systems.", s: "Our estimate, not a measurement" },
];
export const D02: React.FC = () => {
  const f = useLocal();
  return (
    <>
      <SlideHead f={f} id="D02" eyebrow="Who feels it" size={52} />
      <div style={{ position: "absolute", left: 120, top: 250, display: "flex", gap: 36 }}>
        {PERSONAS.map((p, i) => (
          <div key={p.name} style={{ width: 520, border: `1px solid ${C.rule}`, borderRadius: 8, padding: "22px 26px", background: "rgba(26,25,24,0.7)", opacity: fade(f, 14 + i * 4) }}>
            <div style={{ fontFamily: FONT.serif, fontWeight: 300, fontSize: 38, letterSpacing: "-0.03em", color: C.fg }}>{p.name}</div>
            <div style={{ ...monoStyle, fontSize: 12, color: C.muted, margin: "8px 0 12px" }}>{p.role} · {p.org}</div>
            <div style={{ fontFamily: FONT.sans, fontWeight: 300, fontSize: 18, color: C.fg2 }}>{p.line}</div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 120, top: 505, display: "flex", alignItems: "center", gap: 14, opacity: fade(f, 28) }}>
        {["Vendor master", "AP ledger", "USAspending", "SEC EDGAR", "A phone"].map((s, i) => (
          <React.Fragment key={s}>
            <div style={{ ...monoStyle, fontSize: 13, color: C.fg, border: `1px solid ${C.ruleStrong}`, borderRadius: 4, padding: "8px 14px" }}>{s}</div>
            {i < 4 ? <div style={{ width: 28, height: 1, background: C.ruleStrong }} /> : null}
          </React.Fragment>
        ))}
        <div style={{ fontFamily: FONT.sans, fontWeight: 300, fontSize: 17, color: C.muted, marginLeft: 12 }}>The moment: a bank-change request before a payment run. Policy says call back; practice calls the number on the letter.</div>
      </div>
      <div style={{ position: "absolute", left: 120, top: 640, display: "flex", gap: 40, width: 1680 }}>
        {STATS.map((s, i) => (
          <div key={s.v} style={{ flex: 1, borderTop: `1px solid ${C.rule}`, paddingTop: 18, opacity: fade(f, 34 + i * 6) }}>
            <div style={{ fontFamily: FONT.serif, fontWeight: 300, fontSize: 40, letterSpacing: "-0.03em", color: C.fg }}>{s.v}</div>
            <div style={{ fontFamily: FONT.sans, fontWeight: 300, fontSize: 16, color: C.fg2, margin: "10px 0 12px", lineHeight: 1.4 }}>{s.t}</div>
            <div style={{ ...monoStyle, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{s.s}</div>
          </div>
        ))}
      </div>
      <Notice f={f} />
    </>
  );
};

type Cell = { t: string; k?: "red" | "amber" | "ok" };
const ROWS: { case: string; cells: Cell[] }[] = [
  { case: "S1 · Booz Allen", cells: [
    { t: "Remit to 1 Commvault Way, Suite 205, Tinton Falls, NJ" },
    { t: "Never paid this entity", k: "red" },
    { t: "KHK6E1JW9C15 BOOZ ALLEN HAMILTON INC · Tinton Falls NJ. 1 of 41 children, the only one in NJ", k: "red" },
    { t: "Parent 0001443646 files as Booz Allen Hamilton Holding Corp; former name EXPLORER HOLDING CORP", k: "amber" } ] },
  { case: "S1 · The phone", cells: [
    { t: "Call (703) 555-0147" },
    { t: "Master number changed by email 3 days earlier", k: "red" },
    { t: "Not carried by USAspending", k: "amber" },
    { t: "SEC number 703-902-5000. Never a number from the letter.", k: "ok" } ] },
  { case: "S2 · SAIC or Leidos", cells: [
    { t: "Science Applications International Corporation" },
    { t: "Two vendors fit: V-10442, V-10587", k: "red" },
    { t: "LEIDOS, INC. carries the alias SCIENCE APPLICATIONS INTERNATIONAL CORPORATION", k: "amber" },
    { t: "Leidos Holdings, Inc. former name SAIC, Inc. (2005–2013)", k: "amber" } ] },
  { case: "S4 · V2X", cells: [
    { t: "Letterhead: Vectrus, Inc." },
    { t: "V2X on file", k: "ok" },
    { t: "CG8SV4246V29 alias VECTRUS INC.; location null", k: "amber" },
    { t: "0001601548 former names Vectrus, Inc. (2014–2022), Exelis MSCO Inc.", k: "amber" } ] },
];
const COLS = ["", "Claim in the request", "Vendor master", "USAspending", "SEC EDGAR"];
const W = [190, 360, 300, 420, 410];
const TONE = { red: [C.holdBg, C.holdBorder], amber: ["#28210b", "#69530c"], ok: ["#1b271d", "#3c6649"] } as const;
export const D03: React.FC = () => {
  const f = useLocal();
  return (
    <>
      <SlideHead f={f} id="D03" eyebrow="Four sources, four answers" size={52} />
      <div style={{ position: "absolute", left: 120, top: 230 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {COLS.map((c, i) => <div key={c + i} style={{ ...monoStyle, fontSize: 12, color: C.muted, width: W[i], opacity: fade(f, 12) }}>{c}</div>)}
        </div>
        {ROWS.map((r, ri) => (
          <div key={r.case} style={{ display: "flex", gap: 8, marginBottom: 8, opacity: fade(f, 16 + ri * 6) }}>
            <div style={{ width: W[0], ...monoStyle, fontSize: 13, color: C.fg, padding: "14px 0" }}>{r.case}</div>
            {r.cells.map((c, ci) => (
              <div key={ci} style={{ width: W[ci + 1], minHeight: 118, boxSizing: "border-box", padding: "12px 14px", fontFamily: FONT.sans, fontWeight: 300, fontSize: 16, lineHeight: 1.35, color: C.fg2,
                background: c.k ? TONE[c.k][0] : "rgba(26,25,24,0.7)", border: `1px solid ${c.k ? TONE[c.k][1] : C.rule}`, borderRadius: 4 }}>{c.t}</div>
            ))}
          </div>
        ))}
        <div style={{ display: "flex", gap: 22, marginTop: 18, alignItems: "center", opacity: fade(f, 46) }}>
          <div style={{ fontFamily: FONT.serif, fontWeight: 300, fontSize: 26, letterSpacing: "-0.03em", color: C.fg }}>Every registry fact here is real public data.</div>
          <div style={{ ...monoStyle, fontSize: 12, color: C.holdText }}>■ disagrees</div>
          <div style={{ ...monoStyle, fontSize: 12, color: C.gap }}>■ gap or inconsistent</div>
          <div style={{ ...monoStyle, fontSize: 12, color: C.agree }}>■ consistent</div>
        </div>
      </div>
      <Notice f={f} />
    </>
  );
};

const Phone: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-2px" }}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
const CHIPS: { g: React.ReactNode; n: string; c: string }[] = [
  { g: "✓", n: "Approve", c: C.agree },
  { g: <Phone />, n: "Call back first", c: C.gap },
  { g: "✕", n: "Hold", c: C.hold },
];
export const D04: React.FC = () => {
  const f = useLocal();
  return (
    <>
      <SlideHead f={f} id="D04" eyebrow="One request in, one decision out" size={56} width={900} />
      <Serif frame={f} at={20} size={34} color={C.fg2} style={{ position: "absolute", left: 120, top: 290, width: 800 }}>
        Not reconciling records: deciding whether to trust a claim before money moves.
      </Serif>
      <div style={{ position: "absolute", left: 120, top: 520, display: "flex", gap: 14, opacity: fade(f, 34) }}>
        {CHIPS.map((c) => (
          <div key={c.n} style={{ ...monoStyle, fontSize: 14, color: c.c, border: `1px solid ${c.c}`, borderRadius: 999, padding: "10px 18px" }}>{c.g} {c.n}</div>
        ))}
      </div>
      <Body f={f} at={44} size={20} style={{ position: "absolute", left: 120, top: 600, width: 800 }}>
        A cited fact sheet. A call-back script that uses only independently sourced numbers. The exposure on the payment run. An unasked sweep of the rest of the run.
      </Body>
      <Serif frame={f} at={54} size={30} style={{ position: "absolute", left: 120, top: 760, width: 800 }}>Code decides; models read, plan, critique and explain.</Serif>
      <div style={{ position: "absolute", left: 1000, top: 250 }}>
        <Media slot="R05" at={44} label="S1 DECISION" w={800} h={450} f={f} show={26} />
        <div style={{ display: "flex", gap: 12, marginTop: 16, opacity: fade(f, 60) }}>
          {["Reasons, in order", "Call-back by provenance", "Exposure strip", "Sweep"].map((t) => (
            <div key={t} style={{ ...monoStyle, fontSize: 11, color: C.fg2, border: `1px solid ${C.ruleStrong}`, padding: "6px 10px" }}>{t}</div>
          ))}
        </div>
      </div>
    </>
  );
};
export { Eyebrow, Serif, Awaiting };
