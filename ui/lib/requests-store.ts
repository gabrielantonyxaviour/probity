"use client";
// Shared inbox store: GET /requests is fetched once and shared by the queue, the run chip and the review head.
// Refetches on focus; the queue also polls every 10 s while a row is running (01 section 6).
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { z } from "zod";
import { apiGet, ApiClientError } from "./api";
import { InboxItem as InboxItemSchema, type InboxItem } from "./contracts";

// Loose rows keep additive fields the frozen schema does not name yet (history_run for closed ERP rows).
const InboxResponseUI = z.array(InboxItemSchema.loose());

type Snap = { items: InboxItem[] | null; error: ApiClientError | null; loading: boolean };
let snap: Snap = { items: null, error: null, loading: false };
const subs = new Set<() => void>();
let inflight: Promise<void> | null = null;

function set(next: Partial<Snap>) {
  snap = { ...snap, ...next };
  subs.forEach((f) => f());
}

export async function reloadRequests(): Promise<void> {
  if (inflight) return inflight;
  set({ loading: true });
  inflight = apiGet("/requests", InboxResponseUI as unknown as z.ZodType<InboxItem[]>)
    .then((items) => set({ items, error: null, loading: false }))
    .catch((e: unknown) => set({ error: e instanceof ApiClientError ? e : new ApiClientError("network", String(e)), loading: false }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useRequests(o: { poll?: boolean } = {}) {
  const s = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => snap,
    () => snap,
  );
  useEffect(() => {
    if (!snap.items && !inflight) void reloadRequests();
    const onFocus = () => void reloadRequests();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  const running = !!s.items?.some((i) => i.latest_run?.status === "running");
  useEffect(() => {
    if (!o.poll || !running) return;
    const t = setInterval(() => void reloadRequests(), 10_000);
    return () => clearInterval(t);
  }, [o.poll, running]);
  const reload = useCallback(() => reloadRequests(), []);
  return { ...s, reload };
}

/** The most common payment_run_id across the inbox is "the next run". */
export function nextRun(items: InboxItem[] | null): InboxItem["payment_run"] | null {
  if (!items?.length) return null;
  const counts = new Map<string, { n: number; run: InboxItem["payment_run"] }>();
  for (const i of items) {
    const c = counts.get(i.payment_run_id);
    counts.set(i.payment_run_id, { n: (c?.n ?? 0) + 1, run: c?.run ?? i.payment_run });
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.run.scheduled_date.localeCompare(b.run.scheduled_date))[0].run;
}
