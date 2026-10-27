"use client";
// GET /runs/:id/graph, refetched when graph_seq grows (500 ms debounce), once at the decision and once at the end (01 section 9.8).
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, ApiClientError } from "./api";
import { GraphPayload } from "./contracts";
import { cleanGraph } from "./graph-asof";
import type { z } from "zod";

export type GraphState = { payload: z.infer<typeof GraphPayload> | null; error: ApiClientError | null; loading: boolean; unavailable: boolean };

export function useGraph(runId: string, graphSeq: number, settleKey: string): GraphState & { retry: () => void } {
  const [st, setSt] = useState<GraphState>({ payload: null, error: null, loading: true, unavailable: false });
  const [nonce, setNonce] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const ctrl = new AbortController();
    timer.current = setTimeout(async () => {
      try {
        const payload = await apiGet(`/runs/${encodeURIComponent(runId)}/graph`, GraphPayload, { signal: ctrl.signal });
        setSt({ payload: cleanGraph(payload), error: null, loading: false, unavailable: false });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        const err = e instanceof ApiClientError ? e : new ApiClientError("network", String(e));
        setSt((s) => ({ payload: s.payload, error: err, loading: false, unavailable: err.status === 404 || err.status === 501 }));
      }
    }, 500);
    return () => {
      ctrl.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [runId, graphSeq, settleKey, nonce]);
  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { ...st, retry };
}
