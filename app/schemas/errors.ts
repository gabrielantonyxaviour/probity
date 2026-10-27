// FROZEN v1 (foundation). Error vocabulary. Spec: 06 §13, 03 §1.3, spine §4.6.
// API errors are {error, code?} only: never a raw database error, upstream body or stack trace.
import { z } from "zod";

/** Run-level codes: appear in the run error envelope (06 §13). */
export const RUN_ERROR_CODES = [
  "internal_error",
  "zetaris_unavailable",
  "erp_unavailable",
  "world_model_unavailable",
  "sample_data_missing",
  "interrupted",
  "invalid_input",
  "live_unconfigured",
  "cancelled",
  "policy_invariant",
] as const;
export const RunErrorCode = z.enum(RUN_ERROR_CODES);
export type RunErrorCode = z.infer<typeof RunErrorCode>;

/** Fixed envelope text per run-level code (REV-40). Never replaced by an upstream message. */
export const ERROR_TEXT: Record<RunErrorCode, string> = {
  internal_error: "Internal error; see the trace.",
  zetaris_unavailable: "Zetaris is not reachable.",
  erp_unavailable: "The vendor master database is not reachable.",
  world_model_unavailable: "The World Model store could not be written.",
  sample_data_missing: "Sample data is missing or corrupt.",
  interrupted: "The run was interrupted by a restart.",
  invalid_input: "The input is not valid.",
  live_unconfigured: "Live keys are not configured. Start with SAMPLE_MODE=true to run offline.",
  cancelled: "The run was cancelled.",
  policy_invariant: "A policy check failed; no decision was issued.",
};
export const RECOVERABLE_RUN_ERRORS: readonly RunErrorCode[] = [
  "zetaris_unavailable",
  "erp_unavailable",
  "interrupted",
];

/** Zetaris adapter error codes (03 §1.3). Clients only ever see {error:"Data layer query failed", code}. */
export const ZETARIS_ERROR_CODES = [
  "zetaris_unreachable",
  "zetaris_timeout",
  "zetaris_bad_request",
  "zetaris_auth",
  "zetaris_forbidden",
  "zetaris_already_exists",
  "zetaris_not_activated",
  "zetaris_upstream_rest",
  "zetaris_session_missing",
  "zetaris_sql_error",
  "zetaris_server",
] as const;
export const ZetarisErrorCode = z.enum(ZETARIS_ERROR_CODES);
export type ZetarisErrorCode = z.infer<typeof ZetarisErrorCode>;

/** Nightshift client error codes (05 §4.8). */
export const MODEL_ERROR_CODES = [
  "timeout",
  "unreachable",
  "unauthorized",
  "model_not_found",
  "rate_limited",
  "server_error",
  "bad_request",
  "invalid_response",
  "cross_check_blocked",
  "budget_exhausted",
  "truncated",
  "sample_mode",
] as const;
export const ModelErrorCode = z.enum(MODEL_ERROR_CODES);
export type ModelErrorCode = z.infer<typeof ModelErrorCode>;

/** HTTP-level codes on every non-run route (06 §4). */
export const HTTP_ERROR_CODES = [
  "invalid_json",
  "invalid_input",
  "live_unavailable",
  "live_unconfigured",
  "run_id_exists",
  "not_found",
  "unsupported_media_type",
  "unreadable_document",
  "pdf_render_unavailable",
  "payload_too_large",
  "busy",
  "request_conflict",
  "state_locked",
  "run_finished",
  "callback_number_not_scripted",
  "callback_source_mismatch",
  "no_run_for_request",
  "hmem_disabled",
  "world_model_locked",
  "internal_error",
] as const;
export const HttpErrorCode = z.enum(HTTP_ERROR_CODES);
export type HttpErrorCode = z.infer<typeof HttpErrorCode>;

export type ErrorCode = RunErrorCode | ZetarisErrorCode | ModelErrorCode | HttpErrorCode;
export const ErrorCodeSchema = z.union([RunErrorCode, ZetarisErrorCode, ModelErrorCode, HttpErrorCode]);

/** The only error body shape for non-run routes. */
export const ApiError = z.object({ error: z.string().min(1), code: z.string().optional() });
export type ApiError = z.infer<typeof ApiError>;

/** Typed error thrown by every port. `retryable` drives the C2 fallback chain. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly httpStatus: number | undefined;
  constructor(
    code: ErrorCode,
    message: string,
    opts: { retryable?: boolean; httpStatus?: number; cause?: unknown } = {},
  ) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "AppError";
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.httpStatus = opts.httpStatus;
  }
}
