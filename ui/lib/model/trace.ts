// Trace viewer model: grouping, challenge threads, round headers, chips, summary counts and the handoff ribbon
// (01 sections 8, 17.6). Every row is a real trace event; this file adds grouping and labels, never content.
import type { TraceEvent } from "../contracts";
import { hash8, latency, tokens } from "../format";
import { AGENT_DISPLAY, CHALLENGE_ACTIONS, DDL_TEMPLATES, LANE_LABELS, MODE_LABELS, isNemotron, modelShort, templateLabel, type TraceFilter } from "../labels-trace";
import { TRACE } from "../copy";
import type { AgentName } from "@schemas/trace";

export type ChallengeInfo = { kind: "gap" | "reject" | "block" | "approve_soft"; answeredRound: number | null };
export type TraceItem =
  | { kind: "round"; key: string; round: number; title: string; rule: string | null; challengeSeq: number | null }
  | { kind: "event"; key: string; ev: TraceEvent; challenge: ChallengeInfo | null }
  | { kind: "group"; key: string; evs: TraceEvent[]; round: number; rows: number; labels: string[] };

export const isAgent = (n: AgentName) => AGENT_DISPLAY[n].agent;
const isMemory = (e: TraceEvent) => e.engine != null || e.agent_name === "memory_gate" || e.action === "memory_recall" || e.action === "memory_write" || e.action === "outcome_recorded";
const isZetaris = (e: TraceEvent) => e.template_id != null || e.zetaris_query_ids.length > 0;
export const isModelCall = (e: TraceEvent) => e.lane != null && e.model != null && e.action !== "model_check";
const isEvidenceTemplate = (e: TraceEvent) => e.action === "run_template" && e.agent_name === "evidence_runner";

function keepForFilter(e: TraceEvent, f: TraceFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "zetaris":
      return isZetaris(e);
    case "models":
      return e.lane != null;
    case "challenges":
      return CHALLENGE_ACTIONS.has(e.action) || e.action === "requery";
    case "memory":
      return isMemory(e);
    case "agents":
      return isAgent(e.agent_name) || CHALLENGE_ACTIONS.has(e.action) || e.action === "register_source" || isMemory(e) || isEvidenceTemplate(e);
  }
}

export function challengeOf(e: TraceEvent, trace: TraceEvent[]): ChallengeInfo | null {
  if (e.action === "gap_request") {
    const answered = trace.find((x) => x.seq > e.seq && x.round > e.round);
    return { kind: "gap", answeredRound: answered ? answered.round : e.round + 1 };
  }
  if (e.action === "reject_link") return { kind: "reject", answeredRound: null };
  if (e.action === "block_fact") return { kind: "block", answeredRound: null };
  if (e.action === "approve_link" && (e.lane === "deep" || e.model != null)) return { kind: "approve_soft", answeredRound: null };
  return null;
}

function roundHeader(n: number, trace: TraceEvent[], firstSeq: number): TraceItem {
  if (n === 0) return { kind: "round", key: "round-0", round: 0, title: TRACE.round0, rule: null, challengeSeq: null };
  const gaps = trace.filter((e) => e.action === "gap_request" && e.seq < firstSeq);
  const gap = gaps.find((g) => g.round === n - 1) ?? gaps[gaps.length - 1];
  const rule = gap?.rule ?? gap?.codes[0] ?? "";
  const reason = gap ? gap.output_summary : "";
  return { kind: "round", key: `round-${n}`, round: n, title: TRACE.roundN(n, rule, reason), rule: rule || null, challengeSeq: gap?.seq ?? null };
}

export function buildTraceItems(trace: TraceEvent[], filter: TraceFilter): TraceItem[] {
  const kept = trace.filter((e) => keepForFilter(e, filter));
  const items: TraceItem[] = [];
  let lastRound = -1;
  let i = 0;
  while (i < kept.length) {
    const e = kept[i];
    if (e.round !== lastRound) {
      items.push(roundHeader(e.round, trace, e.seq));
      lastRound = e.round;
    }
    if (filter === "agents" && isEvidenceTemplate(e)) {
      let j = i;
      while (j + 1 < kept.length && isEvidenceTemplate(kept[j + 1]) && kept[j + 1].round === e.round) j++;
      const evs = kept.slice(i, j + 1);
      if (evs.length >= 2) {
        const labels = [...new Set(evs.map((x) => x.template_id ?? "").filter(Boolean))];
        items.push({ kind: "group", key: `group-${evs[0].seq}`, evs, round: e.round, rows: evs.reduce((s, x) => s + (x.rows ?? 0), 0), labels });
        i = j + 1;
        continue;
      }
    }
    items.push({ kind: "event", key: `ev-${e.seq}`, ev: e, challenge: challengeOf(e, trace) });
    i += 1;
  }
  return items;
}

export type ModelChipData = { lane: string; model: string; seconds: string; tokens: string; nemotron: boolean | null; sample: boolean };
export function modelChip(e: TraceEvent, sampleMode: boolean): ModelChipData | null {
  if (!e.lane) return null;
  if (!e.model) {
    return sampleMode ? { lane: LANE_LABELS[e.lane], model: "none (SAMPLE_MODE)", seconds: "", tokens: "", nemotron: null, sample: true } : null;
  }
  const nem = e.nemotron ?? isNemotron(e.model);
  return { lane: LANE_LABELS[e.lane], model: modelShort(e.model), seconds: latency(e.latency_ms), tokens: tokens(e.tokens_in, e.tokens_out), nemotron: nem, sample: false };
}

export type ZetarisChipData = { label: string; id: string; rows: string | null; mode: string | null; latency: string; q: string | null; queryId: string | null; ddl: boolean };
export function zetarisChip(e: TraceEvent): ZetarisChipData | null {
  if (!e.template_id && e.zetaris_query_ids.length === 0) return null;
  const queryId = e.zetaris_query_ids[0] ?? null;
  const id = e.template_id ?? "";
  return {
    label: templateLabel(e.template_id),
    id,
    rows: e.rows != null ? `${e.rows} ${e.rows === 1 ? "row" : "rows"}` : null,
    mode: e.source_mode ? MODE_LABELS[e.source_mode] : null,
    latency: latency(e.latency_ms),
    q: queryId ? queryId.slice(0, 8) : null,
    queryId,
    ddl: DDL_TEMPLATES.has(id),
  };
}

export function recheckChip(e: TraceEvent): { ok: boolean; text: string } | null {
  if (e.action !== "requery") return null;
  if (/chang|differ|mismatch|drift/i.test(e.output_summary)) return { ok: false, text: TRACE.rowsChanged };
  if (/match/i.test(e.output_summary)) return { ok: true, text: TRACE.rowHash(hash8(e.row_hash) || "") };
  return null;
}

export type TraceSummary = { agents: number; handoffs: number; challenges: number; rounds: number; queries: number; rechecks: number; registrations: number; modelCalls: number; notNemotron: number };
export function summarize(trace: TraceEvent[]): TraceSummary {
  const agents = new Set<AgentName>();
  const s: TraceSummary = { agents: 0, handoffs: 0, challenges: 0, rounds: 0, queries: 0, rechecks: 0, registrations: 0, modelCalls: 0, notNemotron: 0 };
  for (const e of trace) {
    if (isAgent(e.agent_name)) agents.add(e.agent_name);
    if (e.target_agent) s.handoffs += 1;
    if (CHALLENGE_ACTIONS.has(e.action)) s.challenges += 1;
    s.rounds = Math.max(s.rounds, e.round);
    if (isZetaris(e)) s.queries += 1;
    if (e.action === "requery") s.rechecks += 1;
    if (e.action === "register_source") s.registrations += 1;
    if (isModelCall(e)) {
      s.modelCalls += 1;
      if (!(e.nemotron ?? isNemotron(e.model))) s.notNemotron += 1;
    }
  }
  s.agents = agents.size;
  return s;
}

export type RibbonNode = { kind: "agent"; agent: AgentName } | { kind: "loop"; rule: string };
export function buildRibbon(trace: TraceEvent[]): RibbonNode[] {
  const out: RibbonNode[] = [];
  const lastAgent = () => {
    for (let i = out.length - 1; i >= 0; i--) {
      const n = out[i];
      if (n.kind === "agent") return n.agent;
    }
    return null;
  };
  for (const e of trace) {
    if (!e.target_agent) continue;
    if (!isAgent(e.agent_name) && !isAgent(e.target_agent)) continue;
    if (isAgent(e.agent_name) && lastAgent() !== e.agent_name) out.push({ kind: "agent", agent: e.agent_name });
    if (e.action === "gap_request") out.push({ kind: "loop", rule: e.rule ?? e.codes[0] ?? "" });
    if (isAgent(e.target_agent) && lastAgent() !== e.target_agent) out.push({ kind: "agent", agent: e.target_agent });
    else if (isAgent(e.target_agent) && out[out.length - 1]?.kind === "loop") out.push({ kind: "agent", agent: e.target_agent });
  }
  return out;
}

export function eventAnchor(seq: number): string {
  return `trace-ev-${seq}`;
}
