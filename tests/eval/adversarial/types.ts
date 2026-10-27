import type { ClaimSet } from "../../../app/schemas/messages";
import type { DualReading, InjectionReport } from "../../../app/schemas/letter-checks";

export type ModelEvent = { note: string | null; status: string; lane: string | null; model: string | null; latency_ms: number | null; tokens_in: number | null; tokens_out: number | null; receipt_id: string | null; egress: string | null; hmem_injected: number | null; error_code: string | null };
export type CaseRun = {
  tag: string; id: string; group: "attack" | "legit" | "clean"; label: string; at: string; seconds: number; ok: boolean; needs_human: string | null;
  claims: ClaimSet | null; account_number: string | null; injection: InjectionReport | null; dual: DualReading | null; limitations: string[]; partials: string[]; model_events: ModelEvent[];
};
