"use client";
// D5 time travel: the stops of the as-of scrubber and GET /runs/:id/graph?at= with a per-run cache. The server answers
// bitemporally (valid by then AND known by then, app/engines/wm-read.ts); the UI only picks the instants.
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { apiGet, ApiClientError } from "./api";
import { GraphPayload } from "./contracts";

type Payload = z.infer<typeof GraphPayload>;

/** Decision 8: no scenario labels in the product UI. Older API builds still send one as a phone sublabel. */
export function cleanGraph(p: Payload): Payload {
  return { ...p, nodes: p.nodes.map((n) => (n.sublabel && /demo scenario/i.test(n.sublabel) ? { ...n, sublabel: null } : n)) };
}
export type Tick = { at: string; kind: "received" | "learned" | "decided" | "now"; added: number };

// End of the second, so everything learned within that second counts as known.
const sec = (iso: string) => `${iso.slice(0, 19)}.999Z`;

/** Stops between the request's received_at and now: every second in which the graph learned an edge or a node. */
export function asOfTicks(p: Payload | null, decidedAt: string | null, nowIso: string): Tick[] {
  if (!p) return [];
  const root = p.nodes.find((n) => n.type === "request");
  const received = root?.provenance.at ?? null;
  if (!received) return [];
  const r = sec(received);
  const now = sec(nowIso);
  const counts = new Map<string, number>();
  const bump = (t: string | null | undefined) => {
    if (!t) return;
    const s = sec(new Date(t).toISOString());
    if (s > r && s < now) counts.set(s, (counts.get(s) ?? 0) + 1);
  };
  for (const e of p.edges) bump(e.valid_from);
  for (const n of p.nodes) bump(n.provenance.at);
  const d = decidedAt ? sec(new Date(decidedAt).toISOString()) : null;
  const ticks: Tick[] = [{ at: r, kind: "received", added: 0 }];
  for (const [at, added] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) ticks.push({ at, kind: at === d ? "decided" : "learned", added });
  if (d && d > r && d < now && !counts.has(d)) ticks.push({ at: d, kind: "decided", added: 0 });
  ticks.sort((a, b) => a.at.localeCompare(b.at));
  ticks.push({ at: now, kind: "now", added: 0 });
  return ticks;
}

type AsOfState = { payload: Payload | null; loading: boolean; error: ApiClientError | null };

/** The graph as of `at` (null = latest, served by the review's own graph store). Cached per run and instant. */
export function useAsOfGraph(runId: string, at: string | null, prefetch: string[]): AsOfState {
  const cache = useRef(new Map<string, Payload>());
  const [st, setSt] = useState<AsOfState>({ payload: null, loading: false, error: null });
  useEffect(() => {
    cache.current = new Map();
  }, [runId]);
  useEffect(() => {
    if (!at) return setSt({ payload: null, loading: false, error: null });
    const hit = cache.current.get(at);
    if (hit) return setSt({ payload: hit, loading: false, error: null });
    const ctrl = new AbortController();
    setSt((s) => ({ ...s, loading: true, error: null }));
    apiGet(`/runs/${encodeURIComponent(runId)}/graph?at=${encodeURIComponent(at)}`, GraphPayload, { signal: ctrl.signal })
      .then((raw) => {
        const p = cleanGraph(raw);
        cache.current.set(at, p);
        setSt({ payload: p, loading: false, error: null });
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setSt((s) => ({ ...s, loading: false, error: e instanceof ApiClientError ? e : new ApiClientError("network", String(e)) }));
      });
    return () => ctrl.abort();
  }, [runId, at]);
  const key = prefetch.join("|");
  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    void (async () => {
      for (const t of key.split("|")) {
        if (ctrl.signal.aborted || cache.current.has(t)) continue;
        try {
          cache.current.set(t, cleanGraph(await apiGet(`/runs/${encodeURIComponent(runId)}/graph?at=${encodeURIComponent(t)}`, GraphPayload, { signal: ctrl.signal })));
        } catch {
          return;
        }
      }
    })();
    return () => ctrl.abort();
  }, [runId, key]);
  return st;
}
