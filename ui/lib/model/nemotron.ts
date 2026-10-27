// "What Nemotron did" jobs and the model ledger (01 sections 7.1.6, 17.7). Counts are trace-event counts.
import type { ClaimSet, GateDecision, ModelUsed, TraceEvent } from "../contracts";
import { MODELS } from "../copy";
import { latency } from "../format";
import { AGENT_DISPLAY, isNemotron, modelShort } from "../labels-trace";
import { isModelCall } from "./trace";

export type JobId = "read" | "plan" | "judge" | "write";
export type Job = {
  id: JobId;
  line: string;
  ran: boolean;
  note: string | null;
  model: string | null;
  nemotron: boolean | null;
  calls: number;
  p50: string;
  events: number[];
};

function p50(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

function chipOf(evs: TraceEvent[]) {
  const withModel = evs.filter(isModelCall);
  const first = withModel[0];
  return {
    calls: withModel.length,
    model: first ? modelShort(first.model) : null,
    nemotron: first ? (withModel.every((e) => e.nemotron ?? isNemotron(e.model)) as boolean) : null,
    p50: latency(p50(withModel.map((e) => e.latency_ms ?? 0))),
  };
}

export function buildJobs(a: { trace: TraceEvent[]; claims: ClaimSet | null; decision: GateDecision | null; sample: boolean }): Job[] {
  const t = a.trace;
  const read = t.filter((e) => e.agent_name === "letter_reader" && e.action === "extract_claims");
  const planEvs = t.filter((e) => e.agent_name === "registry_scout" && (e.action === "plan_coverage" || e.action === "run_template"));
  const k0 = t.filter((e) => e.action === "run_template" && e.round === 0 && e.planned_by !== "code").length;
  const k1 = t.filter((e) => e.action === "run_template" && e.round >= 1 && e.planned_by !== "code").length;
  const judgeEvs = t.filter((e) => e.agent_name === "identity_examiner" && e.lane === "deep" && ["approve_link", "reject_link", "raise_conflict"].includes(e.action));
  const approved = judgeEvs.filter((e) => e.action === "approve_link").length;
  const rejected = judgeEvs.filter((e) => e.action === "reject_link").length;
  const conflicts = judgeEvs.filter((e) => e.action === "raise_conflict").length;
  const held = a.decision ? a.decision.reason_codes.filter((c) => c.code === "R4" && c.variant === "link_pending").length : 0;
  const writeEvs = t.filter((e) => e.agent_name === "gate_officer" && (e.action === "write_rationale" || e.action === "number_check"));
  const claims = a.claims;
  const quoted = claims ? claims.fields.filter((f) => f.field !== "pressure_phrase" && f.field !== "watermark").length : 0;
  const pressure = claims ? claims.pressure_phrases.length : 0;
  const injection = !!claims?.pressure_phrases.some((p) => p.kind === "embedded_instruction");
  const numberCheck = a.decision?.rationale.number_check ?? "passed";
  const mk = (id: JobId, evs: TraceEvent[], line: string, ranOverride?: boolean): Job => {
    const c = chipOf(evs);
    const ran = ranOverride ?? (evs.length > 0 && (c.calls > 0 || a.sample));
    return {
      id,
      line,
      ran,
      note: ran ? null : a.sample ? MODELS.sampleNotRun : MODELS.notNeeded,
      model: c.model,
      nemotron: c.nemotron,
      calls: c.calls,
      p50: c.p50,
      events: evs.map((e) => e.seq),
    };
  };
  const plannedByModel = planEvs.some((e) => e.planned_by === "model" || (e.lane != null && e.model != null));
  return [
    mk("read", read, MODELS.readLine(quoted, pressure, injection), read.length > 0 && !a.sample),
    mk("plan", planEvs, MODELS.planLine(k0, k1 > 0 ? k1 : null), plannedByModel && !a.sample),
    mk("judge", judgeEvs, MODELS.judgeLine(approved, rejected, held, conflicts), judgeEvs.length > 0 && !a.sample),
    mk("write", writeEvs, MODELS.writeLine[numberCheck], writeEvs.some(isModelCall) && !a.sample),
  ];
}

export type LedgerRow = {
  agent: string;
  lane: string;
  requested: string;
  model: string;
  calls: number;
  tokensIn: number | null;
  tokensOut: number | null;
  p50: number;
  nemotron: boolean;
};

export function buildLedger(a: { decision: GateDecision | null; trace: TraceEvent[] }): LedgerRow[] {
  if (a.decision) {
    return a.decision.models_used.map((m: ModelUsed) => ({
      agent: m.agent,
      lane: m.lane,
      requested: m.requested_model,
      model: m.model,
      calls: m.calls,
      tokensIn: m.tokens_in,
      tokensOut: m.tokens_out,
      p50: m.latency_ms_p50,
      nemotron: m.nemotron,
    }));
  }
  const groups = new Map<string, TraceEvent[]>();
  for (const e of a.trace.filter(isModelCall)) {
    const key = `${e.agent_name}|${e.lane}|${e.model}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.values()].map((evs) => {
    const e = evs[0];
    const sum = (f: (x: TraceEvent) => number | null) => (evs.every((x) => f(x) == null) ? null : evs.reduce((s, x) => s + (f(x) ?? 0), 0));
    return {
      agent: e.agent_name,
      lane: e.lane ?? "fast",
      requested: e.requested_model ?? "",
      model: e.model ?? "",
      calls: evs.length,
      tokensIn: sum((x) => x.tokens_in),
      tokensOut: sum((x) => x.tokens_out),
      p50: p50(evs.map((x) => x.latency_ms ?? 0)),
      nemotron: evs.every((x) => x.nemotron ?? isNemotron(x.model)),
    };
  });
}

export const agentName = (id: string) => (id in AGENT_DISPLAY ? AGENT_DISPLAY[id as keyof typeof AGENT_DISPLAY].name : id);
