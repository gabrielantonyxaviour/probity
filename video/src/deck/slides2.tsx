import React from "react";
import { C, FONT, monoStyle, Awaiting } from "./parts";
import { SlideHead, Media, Cap, Body, fade, useLocal } from "./parts";
import { STEP } from "../system/tokens";
import { facts, fx } from "../data/facts";
import { TABLES } from "../scenes/M06";

const AGENTS = [
  { code: "A1", name: "Letter Reader", model: "Nemotron 3 Ultra × 2", line: "Two independent Ultra readings must agree; text aimed at an AI is evidence, never obeyed", color: STEP.read, at: 44 },
  { code: "A2", name: "Registry Scout", model: "Nemotron 3.5 Lightning", line: "A fixed floor of Zetaris checks, plus the checks the floor misses", color: STEP.gather, at: 84 },
  { code: "A3", name: "Identity Examiner", model: "Nemotron 3 Ultra", line: "Block authority: re-queries, sends the Scout back, nobody overrides", color: STEP.challenge, at: 124 },
  { code: "A4", name: "Gate Officer", model: "Code decides", line: "Policy in code: approve, call back or hold; sweeps the run", color: STEP.decide, at: 168 },
];
export const D05: React.FC = () => {
  const f = useLocal();
  return (
    <>
      <SlideHead f={f} id="D05" eyebrow="Four agents, four authorities" size={52} width={900} />
      <div style={{ position: "absolute", left: 120, top: 250, width: 620 }}>
        {AGENTS.map((a) => (
          <div key={a.code} style={{ position: "relative", paddingLeft: 24, marginBottom: 26, opacity: fade(f, a.at) }}>
            <div style={{ position: "absolute", left: 0, top: 2, width: 3, height: 74, background: a.color }} />
            <div style={{ ...monoStyle, fontSize: 12, color: a.color, marginBottom: 8 }}>{a.code} · {a.model}</div>
            <div style={{ fontFamily: FONT.serif, fontWeight: 300, fontSize: 34, letterSpacing: "-0.03em", color: C.fg, lineHeight: 1.05 }}>{a.name}</div>
            <div style={{ fontFamily: FONT.sans, fontWeight: 300, fontSize: 16, color: C.muted, marginTop: 6 }}>{a.line}</div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 120, bottom: 70, display: "flex", gap: 12, flexWrap: "wrap", width: 900, opacity: fade(f, 190) }}>
        {["GapRequest loop, ≤2 rounds", "Re-query · row hash", "R8 injection hold", "C7 readings disagree → call back", "Fail closed", "World Model: shared state"].map((t, i) => (
          <div key={t} style={{ ...monoStyle, fontSize: 12, color: i === 0 ? STEP.challenge : C.fg2, border: `1px solid ${i === 0 ? STEP.challenge : C.ruleStrong}`, borderRadius: 4, padding: "8px 12px" }}>{t}</div>
        ))}
      </div>
    </>
  );
};

const LAYERS = [
  { n: "Interface", t: "Next.js 15 · Tailwind v4 · Radix", c: STEP.read },
  { n: "Agents and policy", t: "TypeScript on Node 22 · Fastify · zod · pino", c: STEP.gather },
  { n: "Evidence and memory", t: "Zetaris (local) · Postgres 16 · Docker · Meterless World Model", c: STEP.challenge },
  { n: "Models", t: "Meterless Nightshift → NVIDIA Nemotron 3 Ultra and 3.5 Lightning", c: STEP.decide },
];
export const D06: React.FC = () => {
  const f = useLocal();
  return (
    <>
      <SlideHead f={f} id="D06" eyebrow="What it runs on" size={52} width={900} />
      <div style={{ position: "absolute", left: 120, top: 270, width: 700 }}>
        {LAYERS.map((l, i) => (
          <div key={l.n} style={{ position: "relative", paddingLeft: 24, marginBottom: 34, opacity: fade(f, 18 + i * 6) }}>
            <div style={{ position: "absolute", left: 0, top: 2, width: 3, height: 70, background: l.c }} />
            <div style={{ ...monoStyle, fontSize: 12, color: l.c, marginBottom: 8 }}>Layer {4 - i}</div>
            <div style={{ fontFamily: FONT.serif, fontWeight: 300, fontSize: 34, letterSpacing: "-0.03em", color: C.fg }}>{l.n}</div>
            <div style={{ fontFamily: FONT.sans, fontWeight: 300, fontSize: 17, color: C.fg2, marginTop: 6 }}>{l.t}</div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 1010, top: 270, width: 790, border: `1px solid ${C.ruleStrong}`, borderRadius: 8, padding: "26px 30px", background: "rgba(26,25,24,0.85)", opacity: fade(f, 44) }}>
        <div style={{ ...monoStyle, fontSize: 12, color: C.muted, marginBottom: 14 }}>Built Grok-first</div>
        <div style={{ fontFamily: FONT.serif, fontWeight: 300, fontSize: 30, letterSpacing: "-0.03em", color: C.fg, lineHeight: 1.2, marginBottom: 14 }}>Grok (xAI) built the Zetaris data layer and wrote the independent end-to-end test suite.</div>
        <div style={{ fontFamily: FONT.sans, fontWeight: 300, fontSize: 17, color: C.fg2, lineHeight: 1.45 }}>Source registration, the unified vendor360 layer, data-quality rules, live checks. Claude Code built the agents and the interface.</div>
      </div>
    </>
  );
};

const POINTS = [
  "3 sources → one semantic layer, vendor360 (12 tables)",
  "Five data-quality rules sweep the payment run: DQ1, DQ2, DQ7, DQ8, DQ9",
  "Lineage: source system → USL table → query id → SQL hash → row hash",
  "Each fact's query can be re-run; T23 joins all three systems in one query",
];
export const D07: React.FC = () => {
  const f = useLocal();
  return (
    <>
      <SlideHead f={f} id="D07" eyebrow="Zetaris · Unified Semantic Layer" size={52} width={900} />
      <div style={{ position: "absolute", left: 120, top: 250, width: 800 }}>
        {POINTS.map((p, i) => (
          <div key={p} style={{ fontFamily: FONT.serif, fontWeight: 300, fontSize: 30, letterSpacing: "-0.03em", color: C.fg, margin: "0 0 22px", opacity: fade(f, 20 + i * 8) }}>{p}</div>
        ))}
        <div style={{ columnCount: 2, columnGap: 28, marginTop: 28, opacity: fade(f, 56) }}>
          {TABLES.map((t) => <div key={t} style={{ ...monoStyle, textTransform: "none", fontSize: 12, color: C.muted, marginBottom: 7 }}>{t}</div>)}
        </div>
        <Body f={f} at={64} size={17} color={C.muted} style={{ marginTop: 18 }}>{facts.pending || !facts.zetaris_queries ? "" : `${facts.zetaris_queries} Zetaris queries in the recorded S1 check. `}Wish list for Zetaris: keyed REST templates.</Body>
      </div>
      <div style={{ position: "absolute", left: 1010, top: 700 }}>
        <Media slot="R10" at={4} label="LIST DQ USL" w={390} h={220} f={f} show={30} />
        <Cap f={f} at={50}>LIST DQ USL, RUN DQ</Cap>
      </div>
      <div style={{ position: "absolute", left: 1410, top: 700 }}>
        <Media slot="R13" at={6} label="SWEEP PANEL" w={390} h={220} f={f} show={36} />
        <Cap f={f} at={56}>The sweep: five rules over the run</Cap>
      </div>
    </>
  );
};

export const D08: React.FC = () => {
  const f = useLocal();
  return (
    <>
      <SlideHead f={f} id="D08" eyebrow="Meterless · NVIDIA Nemotron" size={50} width={1500} />
      <div style={{ position: "absolute", left: 120, top: 250, width: 760 }}>
        {[
          ["World Model", "Bitemporal edges: the graph as known at any moment (time travel), a point-in-time call-back, cross-session memory of a confirmed impersonation."],
          ["Nightshift", "Two pinned lanes: nvidia/nemotron-3-ultra-550b-a55b and nvidia/nemotron-3.5-lightning-30b-a3b. A per-call app id, the model logged per call, a receipt for each."],
        ].map(([h, t], i) => (
          <div key={h} style={{ marginBottom: 24, opacity: fade(f, 16 + i * 8) }}>
            <div style={{ ...monoStyle, fontSize: 12, color: C.muted, marginBottom: 8 }}>{h}</div>
            <div style={{ fontFamily: FONT.sans, fontWeight: 300, fontSize: 19, color: C.fg2, lineHeight: 1.4 }}>{t}</div>
          </div>
        ))}
        <div style={{ opacity: fade(f, 34) }}>
          <div style={{ ...monoStyle, fontSize: 12, color: C.muted, marginBottom: 10 }}>Nemotron, measured</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[["98.2%", "field agreement, two Ultra readings"], ["10/11", "injected spans caught; hidden 5/5"], ["2/25", "clean letters falsely held (R8)"], ["0 vs 3", "wrong link approvals, Ultra vs Lightning"]].map(([v, t]) => (
              <div key={t} style={{ border: `1px solid ${C.ruleStrong}`, padding: "10px 12px", width: 172 }}>
                <div style={{ fontFamily: FONT.mono, fontSize: 22, color: C.fg }}>{v}</div>
                <div style={{ fontFamily: FONT.sans, fontWeight: 300, fontSize: 14, color: C.fg2, marginTop: 6, lineHeight: 1.3 }}>{t}</div>
              </div>
            ))}
          </div>
          <div style={{ ...monoStyle, textTransform: "none", fontSize: 11, color: C.muted, marginTop: 10 }}>Examiner labels were written by our coding assistant (Claude Opus 5.5) from captured rows; not expert-labelled.</div>
        </div>
        <div style={{ marginTop: 22, opacity: fade(f, 50) }}>
          {facts.pending || !facts.receipt ? <Awaiting /> : (
            <div style={{ ...monoStyle, fontSize: 13, color: C.fg }}>
              Receipt: {facts.receipt.egress ? `egress ${facts.receipt.egress}` : ""}{facts.receipt.routing_width !== null ? ` · routing width ${facts.receipt.routing_width}` : ""}
            </div>
          )}
        </div>
      </div>
      <div style={{ position: "absolute", left: 960, top: 250 }}>
        <Media slot="R14" at={4.5} label="AS-OF GRAPH" w={420} h={236} f={f} show={26} />
        <Cap f={f} at={44}>Time travel: the graph as known then</Cap>
      </div>
      <div style={{ position: "absolute", left: 1400, top: 250 }}>
        <Media slot="R03" at={8} label="TRACE RAIL" w={400} h={236} f={f} show={32} />
        <Cap f={f} at={50}>Trace rail: the model logged per call</Cap>
      </div>
      <div style={{ position: "absolute", left: 960, top: 560, width: 840, opacity: fade(f, 56) }}>
        <div style={{ ...monoStyle, fontSize: 12, color: C.muted, marginBottom: 10 }}>Measured: this check, end to end</div>
        {facts.pending ? <Awaiting /> : <div style={{ fontFamily: FONT.mono, fontSize: 22, color: C.fg }}>{Math.round(facts.execution_time_seconds)} s (S1, recorded run)</div>}
      </div>
    </>
  );
};

const UNIQUE = [
  "Two independent Ultra readings must agree before a claim counts.",
  "A letter that talks to the AI is evidence: quoted, held, never obeyed.",
  "The call-back number is chosen by provenance, not by convenience.",
  "The unasked action: five Zetaris rules sweep the whole payment run.",
  "Before a discovered link counts, the Examiner re-runs its query and compares row hashes.",
  "Every fact has lineage to its rows, and the graph replays as of any moment.",
];
export const D09: React.FC = () => {
  const f = useLocal();
  return (
    <>
      <SlideHead f={f} id="D09" eyebrow="Six things we did differently, then the numbers" size={50} width={1500} />
      <div style={{ position: "absolute", left: 120, top: 250, width: 820 }}>
        {UNIQUE.map((u, i) => (
          <div key={u} style={{ fontFamily: FONT.serif, fontWeight: 300, fontSize: 24, letterSpacing: "-0.03em", color: C.fg, lineHeight: 1.2, marginBottom: 16, opacity: fade(f, 16 + i * 6) }}>{u}</div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 1010, top: 250 }}>
        <Media slot="R07" at={9} label="THREE SESSIONS" w={790} h={444} f={f} show={26} />
        <Cap f={f} at={46}>Three processes, memory carried by the World Model</Cap>
      </div>
      <div style={{ position: "absolute", left: 1010, top: 760, display: "flex", gap: 30, width: 790, opacity: fade(f, 52) }}>
        {[
          ["Median time per check", fx.q8() === null ? null : `${fx.q8()} s`],
          ["Zetaris queries, S1 check", facts.pending || !facts.zetaris_queries ? null : String(facts.zetaris_queries)],
          ["Sweep rules per check", fx.rules().length ? String(fx.rules().length) : null],
          ["E2E tests passing", "96"],
        ].map(([l, v]) => (
          <div key={l as string} style={{ flex: 1 }}>
            <div style={{ ...monoStyle, fontSize: 11, color: C.muted, marginBottom: 8, minHeight: 28 }}>{l}</div>
            {v ? <div style={{ fontFamily: FONT.mono, fontSize: 28, color: C.fg }}>{v}</div> : <Awaiting label="AWAITING RUN" />}
          </div>
        ))}
      </div>
    </>
  );
};

const LIMITS = [
  "It does not prove who owns a bank account; no ownership validation service is connected.",
  "It never applies a change and never places a call. A human does both.",
  "Registry coverage at setup is 6 federal-contractor families; other entities are discovered at run time. US entities and USD only.",
  "Zetaris latency is the bottleneck: a check takes two to four minutes.",
  "Small measured samples, labelled by our coding assistant, not by experts.",
];
const NEXT = ["Bank-account ownership validation", "SAM.gov and exclusions as Zetaris sources", "Keyed REST templates", "Controller run view", "ERP write-back behind approval", "Faster checks: Zetaris result caching"];
export const D10: React.FC = () => {
  const f = useLocal();
  return (
    <>
      <SlideHead f={f} id="D10" eyebrow="What comes next, and the honest edges" size={50} width={1500} top={60} />
      <div style={{ position: "absolute", left: 120, top: 190, display: "flex", gap: 14, flexWrap: "wrap", width: 1680 }}>
        {NEXT.map((n, i) => (
          <div key={n} style={{ fontFamily: FONT.serif, fontWeight: 300, fontSize: 28, letterSpacing: "-0.03em", color: C.fg, border: `1px solid ${C.ruleStrong}`, borderRadius: 999, padding: "10px 22px", opacity: fade(f, 12 + i * 5) }}>{n}</div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 120, top: 400, width: 1300 }}>
        <div style={{ ...monoStyle, fontSize: 12, color: C.muted, marginBottom: 16, opacity: fade(f, 40) }}>Limits today</div>
        {LIMITS.map((l, i) => (
          <div key={l} style={{ fontFamily: FONT.sans, fontWeight: 300, fontSize: 21, color: C.fg2, lineHeight: 1.35, marginBottom: 14, paddingLeft: 22, borderLeft: `1px solid ${C.ruleStrong}`, opacity: fade(f, 44 + i * 5) }}>{l}</div>
        ))}
      </div>
    </>
  );
};
