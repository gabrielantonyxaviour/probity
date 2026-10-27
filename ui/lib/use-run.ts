"use client";
// Live run hook: snapshot + trace first, then SSE (Last-Event-ID reconnect is native to EventSource), falling back to
// polling GET /runs/:id and /runs/:id/trace every second. A slow slowSync snapshot guards against any missed event.
import { useCallback, useEffect, useReducer, useRef } from "react";
import { apiGet, apiText, apiUrl, ApiClientError } from "./api";
import { parseTraceLines, RunDetail, SseEvent } from "./contracts";
import { log } from "./log";
import { initialRunState, isTerminal, rawDecisionOf, reduceRun, type RunState } from "./run-store";

const SSE_NAMES = ["stage", "trace", "claims", "exposure", "observation", "graph", "decision", "done", "error"] as const;
const POLL_MS = 1000;
const SLOW_SYNC_MS = 4000;

export function useRun(runId: string): { state: RunState; refresh: () => void } {
  const [state, dispatch] = useReducer(reduceRun, runId, initialRunState);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    dispatch({ type: "reset", runId });
    const ctrl = new AbortController();
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let slowSync: ReturnType<typeof setInterval> | null = null;
    let inflight = false;
    let stopped = false;

    const fail = (e: unknown) => {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof ApiClientError) dispatch({ type: "failed", error: e });
      else log.error({ e }, "unexpected run error");
    };
    const snapshot = async () => {
      let raw: unknown = null;
      const d = await apiGet(`/runs/${encodeURIComponent(runId)}`, RunDetail, { signal: ctrl.signal, onRaw: (r) => (raw = r) });
      if (!stopped) dispatch({ type: "snapshot", detail: d, rawDecision: rawDecisionOf(raw) ?? undefined });
      return d;
    };
    const trace = async () => {
      try {
        const text = await apiText(`/runs/${encodeURIComponent(runId)}/trace`, { signal: ctrl.signal });
        if (!stopped) dispatch({ type: "trace", events: parseTraceLines(text) });
      } catch (e) {
        if (e instanceof ApiClientError && e.notFound) {
          if (!stopped) dispatch({ type: "trace", events: [] });
          return;
        }
        throw e;
      }
    };
    const cleanupLive = () => {
      es?.close();
      es = null;
      if (timer) clearInterval(timer);
      if (slowSync) clearInterval(slowSync);
      timer = slowSync = null;
    };
    const finish = async () => {
      cleanupLive();
      dispatch({ type: "transport", transport: "idle" });
      try {
        await snapshot();
        await trace();
      } catch (e) {
        fail(e);
      }
    };
    const pollOnce = async (withTrace: boolean) => {
      if (inflight || stopped) return;
      inflight = true;
      try {
        const d = await snapshot();
        if (withTrace) await trace();
        if (isTerminal(d.status)) await finish();
        else if (!es && !timer) startPolling();
      } catch (e) {
        fail(e);
      } finally {
        inflight = false;
      }
    };
    const startPolling = () => {
      if (es) {
        es.close();
        es = null;
      }
      if (slowSync) clearInterval(slowSync);
      slowSync = null;
      if (timer) return;
      dispatch({ type: "transport", transport: "poll" });
      timer = setInterval(() => void pollOnce(true), POLL_MS);
    };
    const startSse = () => {
      let opened = false;
      try {
        es = new EventSource(apiUrl(`/runs/${encodeURIComponent(runId)}/events`));
      } catch {
        startPolling();
        return;
      }
      es.onopen = () => {
        opened = true;
        dispatch({ type: "transport", transport: "sse" });
      };
      es.onerror = () => {
        if (!es) return;
        if (!opened || es.readyState === EventSource.CLOSED) startPolling();
      };
      for (const name of SSE_NAMES) {
        es.addEventListener(name, (msg) => {
          let data: unknown;
          try {
            data = JSON.parse((msg as MessageEvent<string>).data);
          } catch {
            return;
          }
          const parsed = SseEvent.safeParse({ event: name, data });
          if (!parsed.success) {
            log.warn({ name, issues: parsed.error.issues.slice(0, 3) }, "sse event failed the contract");
            void pollOnce(true);
            return;
          }
          dispatch({ type: "sse", event: parsed.data });
          if (name === "done" || name === "error") void finish();
        });
      }
      slowSync = setInterval(() => void pollOnce(false), SLOW_SYNC_MS);
    };

    refreshRef.current = () => void pollOnce(true);

    (async () => {
      try {
        const d = await snapshot();
        await trace();
        if (!isTerminal(d.status) && !stopped) startSse();
      } catch (e) {
        fail(e);
      }
    })();

    return () => {
      stopped = true;
      ctrl.abort();
      cleanupLive();
    };
  }, [runId]);

  const refresh = useCallback(() => refreshRef.current(), []);
  return { state, refresh };
}
