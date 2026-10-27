// One reducer for a run, fed by SSE events or by polling snapshots (01 section 8.6, REV-45). Pure and unit-tested.
// Rows are deduped by trace `seq`, observations by `evidence_id`; replays and reloads can never double-render.
import type {
  ClaimSet,
  DocPage,
  Exposure,
  FactField,
  GateDecision,
  Observation,
  RunDetail,
  RunEnvelope,
  RunErrorEnvelope,
  SseEvent,
  TraceEvent,
} from "./contracts";
import { STAGE_NAMES, type StageName } from "@schemas/run-state";
import type { ApiClientError } from "./api";

export type LiveObservation = { field: FactField | null; observation: Observation };
export type Envelope = RunEnvelope | RunErrorEnvelope;
export type RunStatus = RunDetail["status"];

export type RunState = {
  runId: string;
  load: "loading" | "ready" | "notfound" | "error";
  error: ApiClientError | null;
  /** A refresh failed while we already had data (API went away mid-run). */
  stale: ApiClientError | null;
  detail: RunDetail | null;
  trace: TraceEvent[];
  traceLoaded: boolean;
  observations: LiveObservation[];
  exposure: Exposure | null;
  claims: ClaimSet | null;
  docPages: DocPage[];
  decision: GateDecision | null;
  /** The decision exactly as the API sent it (Download JSON must be byte-equal to the envelope artifact). */
  rawDecision: unknown;
  stage: StageName | null;
  stageRound: number;
  graphSeq: number;
  envelope: Envelope | null;
  status: RunStatus;
  startedAt: string | null;
  transport: "idle" | "sse" | "poll";
};

export type RunAction =
  | { type: "reset"; runId: string }
  | { type: "snapshot"; detail: RunDetail; rawDecision?: unknown }
  | { type: "trace"; events: TraceEvent[] }
  | { type: "sse"; event: SseEvent }
  | { type: "failed"; error: ApiClientError }
  | { type: "transport"; transport: RunState["transport"] };

export const initialRunState = (runId: string): RunState => ({
  runId,
  load: "loading",
  error: null,
  stale: null,
  detail: null,
  trace: [],
  traceLoaded: false,
  observations: [],
  exposure: null,
  claims: null,
  docPages: [],
  decision: null,
  rawDecision: null,
  stage: null,
  stageRound: 0,
  graphSeq: 0,
  envelope: null,
  status: "running",
  startedAt: null,
  transport: "idle",
});

const isStage = (s: string): s is StageName => (STAGE_NAMES as readonly string[]).includes(s);

export function mergeTrace(existing: TraceEvent[], incoming: TraceEvent[]): TraceEvent[] {
  if (incoming.length === 0) return existing;
  const bySeq = new Map<number, TraceEvent>();
  for (const e of existing) bySeq.set(e.seq, e);
  let changed = false;
  for (const e of incoming) {
    if (!bySeq.has(e.seq)) changed = true;
    bySeq.set(e.seq, e);
  }
  if (!changed && existing.length === bySeq.size) return existing;
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

export function mergeObservations(existing: LiveObservation[], incoming: LiveObservation[]): LiveObservation[] {
  if (incoming.length === 0) return existing;
  const key = (o: LiveObservation) => `${o.observation.evidence_id}|${o.observation.source}|${o.field ?? ""}`;
  const seen = new Set(existing.map(key));
  const fresh = incoming.filter((o) => !seen.has(key(o)));
  return fresh.length === 0 ? existing : [...existing, ...fresh];
}

/** The final GateDecision from the envelope when present, else the preliminary one from `live` or `decision`. */
export function decisionOf(state: Pick<RunState, "envelope" | "decision">): GateDecision | null {
  const env = state.envelope;
  if (env && env.status !== "error") {
    const art = env.output.artifacts.find((a) => a.type === "gate_decision");
    if (art && art.type === "gate_decision") return art.data;
  }
  return state.decision;
}

/** Pulls envelope.output.artifacts[gate_decision].data out of a raw GET /runs/:id body. */
export function rawDecisionOf(raw: unknown): unknown {
  const arts = (raw as { envelope?: { output?: { artifacts?: Array<{ type?: string; data?: unknown }> } } } | null)?.envelope?.output?.artifacts;
  return arts?.find((x) => x.type === "gate_decision")?.data ?? null;
}

export function needsHumanOf(state: Pick<RunState, "envelope" | "detail">): RunEnvelope["output"]["needs_human"] {
  const env = state.envelope;
  if (env && env.status !== "error") return env.output.needs_human;
  return null;
}

function statusFromEnvelope(env: Envelope): RunStatus {
  return env.status;
}

export function reduceRun(state: RunState, a: RunAction): RunState {
  switch (a.type) {
    case "reset":
      return initialRunState(a.runId);
    case "failed":
      if (a.error.notFound && !state.detail) return { ...state, load: "notfound", error: a.error };
      if (!state.detail) return { ...state, load: "error", error: a.error };
      return { ...state, stale: a.error };
    case "transport":
      return state.transport === a.transport ? state : { ...state, transport: a.transport };
    case "snapshot": {
      const d = a.detail;
      const live = d.live;
      const stage = isStage(d.stage) ? d.stage : state.stage;
      return {
        ...state,
        load: "ready",
        error: null,
        stale: null,
        detail: d,
        claims: d.claims ?? state.claims,
        docPages: d.doc_pages.length ? d.doc_pages : state.docPages,
        exposure: live.exposure ?? state.exposure,
        observations: mergeObservations(state.observations, live.observations),
        decision: live.decision ?? state.decision,
        rawDecision: a.rawDecision ?? state.rawDecision,
        graphSeq: Math.max(state.graphSeq, live.graph_seq),
        stage,
        stageRound: d.round,
        envelope: d.envelope ?? state.envelope,
        status: d.status,
        startedAt: d.started_at,
      };
    }
    case "trace": {
      const trace = mergeTrace(state.trace, a.events);
      return trace === state.trace && state.traceLoaded ? state : { ...state, trace, traceLoaded: true };
    }
    case "sse": {
      const ev = a.event;
      switch (ev.event) {
        case "stage":
          return { ...state, stage: ev.data.stage, stageRound: ev.data.round };
        case "trace":
          return { ...state, trace: mergeTrace(state.trace, [ev.data]) };
        case "claims": {
          const { doc_pages, ...claims } = ev.data;
          return { ...state, claims: claims as ClaimSet, docPages: doc_pages };
        }
        case "exposure":
          return { ...state, exposure: ev.data };
        case "observation":
          return { ...state, observations: mergeObservations(state.observations, [ev.data]) };
        case "graph":
          return { ...state, graphSeq: Math.max(state.graphSeq, ev.data.world_seq) };
        case "decision":
          return { ...state, decision: ev.data };
        case "done":
          return { ...state, envelope: ev.data, status: statusFromEnvelope(ev.data) };
        case "error":
          return { ...state, envelope: ev.data, status: "error" };
      }
    }
  }
}

export const isTerminal = (s: RunStatus) => s !== "running";
