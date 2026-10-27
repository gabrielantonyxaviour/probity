"use client";
// GET /readyz every 15 s feeds the system chip, the SAMPLE banner and the feature flags (01 UX-12).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiGet, ApiClientError } from "@/lib/api";
import { ReadyResponse } from "@/lib/contracts";

type Ctx = { ready: ReadyResponse | null; error: ApiClientError | null; reload: () => void };
const ReadyCtx = createContext<Ctx>({ ready: null, error: null, reload: () => {} });
export const useReady = () => useContext(ReadyCtx);

export function ReadyProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState<ReadyResponse | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const load = useCallback(async () => {
    try {
      setReady(await apiGet("/readyz", ReadyResponse, { acceptStatuses: [503] }));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiClientError ? e : new ApiClientError("network", String(e)));
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);
  const value = useMemo(() => ({ ready, error, reload: () => void load() }), [ready, error, load]);
  return <ReadyCtx.Provider value={value}>{children}</ReadyCtx.Provider>;
}
