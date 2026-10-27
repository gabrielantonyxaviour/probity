// Nightshift client errors (05 §4.8). Messages are fixed text per code: never the token, a request body or an upstream body.
import { AppError, type ModelErrorCode } from "../../schemas/errors";

export const MODEL_ERROR_TEXT: Record<ModelErrorCode, string> = {
  timeout: "The model call timed out.",
  unreachable: "Nightshift is not reachable.",
  unauthorized: "Nightshift rejected the runtime token.",
  model_not_found: "The pinned model is not available in the Nightshift catalog.",
  rate_limited: "Nightshift rate-limited the call.",
  server_error: "Nightshift returned a server error.",
  bad_request: "The model request was refused as invalid.",
  invalid_response: "The model response did not contain valid structured output.",
  cross_check_blocked: "Nightshift's cross-check blocked the response.",
  budget_exhausted: "The per-run model call budget is exhausted.",
  truncated: "The model response was cut off by the token limit.",
  sample_mode: "SAMPLE_MODE: no model is called.",
};
const RETRYABLE = new Set<ModelErrorCode>(["timeout", "unreachable", "server_error", "rate_limited"]);

/** Evidence from a response that was received but unusable (a cross-check block): carried to the failure trace event. */
export type ModelErrorDetail = { cross_check?: Record<string, unknown> | null; receipt_id?: string | null; model?: string | null };
export type ModelErrorInfo = { call_id?: string; http_status?: number; note?: string; retry_after_ms?: number; detail?: ModelErrorDetail };

class ModelError extends AppError {
  readonly call_id: string | undefined;
  readonly note: string | undefined;
  readonly retry_after_ms: number | undefined;
  readonly detail: ModelErrorDetail | undefined;
  constructor(code: ModelErrorCode, info: ModelErrorInfo = {}) {
    super(code, MODEL_ERROR_TEXT[code], { retryable: RETRYABLE.has(code), ...(info.http_status ? { httpStatus: info.http_status } : {}) });
    this.call_id = info.call_id;
    this.note = info.note;
    this.retry_after_ms = info.retry_after_ms;
    this.detail = info.detail;
  }
}
/** No model can be reached at all (sample mode, offline, unauthorized, circuit open): agents use their fallback. */
export class ModelUnavailable extends ModelError {
  readonly kind = "unavailable" as const;
}
/** A call was made (or refused as invalid) and did not produce a usable answer. */
export class ModelCallFailed extends ModelError {
  readonly kind = "failed" as const;
}
export class ModelBudgetExceeded extends ModelError {
  readonly kind = "budget" as const;
  constructor(info: ModelErrorInfo = {}) {
    super("budget_exhausted", info);
  }
}
export type ModelFailure = ModelUnavailable | ModelCallFailed | ModelBudgetExceeded;
export const isModelFailure = (e: unknown): e is ModelFailure =>
  e instanceof ModelUnavailable || e instanceof ModelCallFailed || e instanceof ModelBudgetExceeded;
