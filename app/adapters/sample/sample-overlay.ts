// What the sample ERP writer has stored during this process (requests the intake inserted, call-backs a human logged). The sample
// Zetaris port reads it so T07, T08, T08b and the DQ sweep see this run's own writes, exactly as the live USL sees Postgres.
import type { Row } from "./sample-store";
import type { ErpOverlay } from "./sample-tables";

export type SampleDeps = { erp?: unknown };
type Snapshotting = { snapshot?: () => { requests?: unknown[]; callbacks?: unknown[] }; requests?: () => unknown[]; callbacks?: () => unknown[] };

export function overlayOf(erp: unknown): ErpOverlay | undefined {
  const e = erp as Snapshotting | null | undefined;
  if (!e || typeof e !== "object") return undefined;
  if (typeof e.snapshot === "function") {
    const snap = e.snapshot.bind(e);
    return { requests: () => (snap().requests ?? []) as Row[], callbacks: () => (snap().callbacks ?? []) as Row[] };
  }
  if (typeof e.requests === "function") {
    const req = e.requests.bind(e);
    const cb = typeof e.callbacks === "function" ? e.callbacks.bind(e) : () => [];
    return { requests: () => req() as Row[], callbacks: () => cb() as Row[] };
  }
  return undefined;
}
