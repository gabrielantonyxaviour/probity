"use client";
// Review page state shared by every region: the run, URL-backed overlays, cross-highlighting and the graph.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ClaimSet, FactField, GateDecision } from "@/lib/contracts";
import type { RunState } from "@/lib/run-store";
import { decisionOf, needsHumanOf } from "@/lib/run-store";
import { useUrlParams } from "@/lib/url-state";
import { useGraph, type GraphState } from "@/lib/graph-store";
import { useReady } from "@/components/shell/ReadyProvider";
import { useNow } from "@/lib/hooks/use-now";

export type Highlight = { field: FactField | null; claim: number | null };
type Ctx = {
  runId: string;
  state: RunState;
  decision: GateDecision | null;
  claims: ClaimSet | null;
  decided: boolean;
  running: boolean;
  stopped: boolean;
  needsHuman: boolean;
  failed: boolean;
  sample: boolean;
  hmem: boolean;
  elapsedSeconds: number;
  graph: GraphState & { retry: () => void };
  hl: Highlight;
  setHl: (h: Highlight) => void;
  param: (k: string) => string | null;
  setParams: (u: Record<string, string | null>, mode?: "push" | "replace") => void;
  openEvidence: (id: string) => void;
  openQuery: (id: string) => void;
  openMemory: (id: string) => void;
  refresh: () => void;
};
const ReviewCtx = createContext<Ctx | null>(null);
export function useReview(): Ctx {
  const c = useContext(ReviewCtx);
  if (!c) throw new Error("useReview outside ReviewProvider");
  return c;
}

export function ReviewProvider({ runId, state, refresh, children }: { runId: string; state: RunState; refresh: () => void; children: ReactNode }) {
  const { ready } = useReady();
  const url = useUrlParams();
  const [hl, setHl] = useState<Highlight>({ field: null, claim: null });
  const decision = decisionOf(state);
  const running = state.status === "running";
  const now = useNow(running);
  const start = state.startedAt ? Date.parse(state.startedAt) : now;
  const env = state.envelope;
  const elapsedSeconds =
    !running && env ? env.execution_time_seconds : Math.max(0, Math.round((now - start) / 1000));
  const graph = useGraph(runId, state.graphSeq, `${state.decision ? 1 : 0}${state.status}`);
  const openEvidence = useCallback((id: string) => url.set({ evidence: id, query: null, memory: null }, "push"), [url]);
  const openQuery = useCallback((id: string) => url.set({ query: id, evidence: null, memory: null }, "push"), [url]);
  const openMemory = useCallback((id: string) => url.set({ memory: id, evidence: null, query: null }, "push"), [url]);
  const value = useMemo<Ctx>(
    () => ({
      runId,
      state,
      decision,
      claims: state.claims,
      decided: !!decision,
      running,
      stopped: state.status === "error" && env?.status === "error" && env.code === "cancelled",
      needsHuman: !!needsHumanOf(state) || state.detail?.stage === "NEEDS_HUMAN",
      failed: state.status === "error" && !(env?.status === "error" && env.code === "cancelled"),
      sample: decision?.mode === "sample" || ready?.mode === "sample",
      hmem: ready?.features.hmem ?? false,
      elapsedSeconds,
      graph,
      hl,
      setHl,
      param: url.get,
      setParams: url.set,
      openEvidence,
      openQuery,
      openMemory,
      refresh,
    }),
    [runId, state, decision, running, env, ready, elapsedSeconds, graph, hl, url, openEvidence, openQuery, openMemory, refresh],
  );
  return <ReviewCtx.Provider value={value}>{children}</ReviewCtx.Provider>;
}
