import type { FieldScore, InjectionScore } from "./score";

export type CallRecord = {
  n: number;
  letter: string;
  lane: "deep" | "fast";
  source: "PDF text layer" | "OCR";
  ok: boolean;
  error: string | null;
  error_note: string | null;
  repaired: boolean;
  model_output: { needs_human: string | null; has_claims: boolean; unreadable_fields: string[]; pressure_kinds: string[] } | null;
  requested_model: string | null;
  model: string | null;
  nemotron: boolean | null;
  http_status: number | null;
  latency_ms: number;
  wall_ms: number;
  tokens_in: number | null;
  tokens_out: number | null;
  input_chars: number;
  ocr_ms: number | null;
  fields: FieldScore[];
  false_positives: string[];
  quote_support: { total: number; supported: number; decisive_unsupported: string[] };
  injection: InjectionScore;
  receipt: {
    call_id: string;
    app: string | null;
    routed_model: string | null;
    provider_model: string | null;
    winning_route_model: string | null;
    egress: string | null;
    hmem_injected: number | null;
    /** true when the receipt had no hmem record and the store derived injected = 0 (so 0 means "none reported") */
    hmem_derived: boolean | null;
    structured_output: string | null;
    cross_check: string | null;
  } | null;
  contaminated: boolean;
};

export type LaneSummary = {
  requested_model: string;
  calls: number;
  ok: number;
  failed: number;
  repaired: number;
  contaminated: number;
  field_exact_match: { matched: number; total: number; rate: number | null };
  answered_field_match: { matched: number; total: number; rate: number | null; letters: number };
  by_field: Record<string, { matched: number; total: number; rate: number | null }>;
  by_variant: Record<string, { matched: number; total: number; rate: number | null }>;
  false_positive_calls: number;
  quote_support: { supported: number; total: number; rate: number | null; calls_with_decisive_unsupported: number };
  injection: { variants: number; model_flagged: number; flagged_final: number; value_taken: number };
  latency_ms: { p50: number | null; p95: number | null; mean: number | null; max: number | null };
  tokens: { mean_in: number | null; mean_out: number | null; total_in: number; total_out: number; calls_with_usage: number };
  receipts: { with_receipt: number; egress_nvidia: number; egress_values: string[]; models_seen: string[]; unique_apps: number; hmem_injected_total: number; hmem_record_present: number };
};

export type EvalResult = {
  eval: "nemotron-letter-reader";
  spec: "07 section 3.6.1 (Reader part)";
  started_at: string;
  finished_at: string;
  pins: { fast: string; deep: string };
  meterless_scope: string;
  concurrency: number;
  letters: string[];
  lanes: { fast: LaneSummary | null; deep: LaneSummary | null };
  unique_apps_across_run: number;
  calls: CallRecord[];
};
