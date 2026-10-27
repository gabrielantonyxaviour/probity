"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Ctx = { streaming: boolean; setStreaming: (v: boolean) => void };
const ShellCtx = createContext<Ctx>({ streaming: false, setStreaming: () => {} });

export function ShellStateProvider({ children }: { children: ReactNode }) {
  const [streaming, setStreaming] = useState(false);
  return <ShellCtx.Provider value={{ streaming, setStreaming }}>{children}</ShellCtx.Provider>;
}
export const useShellState = () => useContext(ShellCtx);

/** A review page calls this while its check streams so the header dot pulses (the one ambient loop). */
export function useReportStreaming(active: boolean) {
  const { setStreaming } = useShellState();
  useEffect(() => {
    setStreaming(active);
    return () => setStreaming(false);
  }, [active, setStreaming]);
}
