// Every API error is `{error, code?}`. No stack, no upstream body, no secret (the message is masked and, for adapter
// errors, replaced by fixed text). The run-level error envelope (its own shape, REV-40) is built in envelope.ts.
import type { FastifyInstance, FastifyReply } from "fastify";
import { ZodError, type ZodType } from "zod";
import { AppError, type ErrorCode } from "../schemas/errors";
import { MODEL_ERROR_TEXT } from "../adapters/nightshift/errors";
import { logger } from "../trace/logger";
import { masker } from "../trace/mask";

const STATUS: Partial<Record<ErrorCode, number>> = {
  invalid_json: 400,
  invalid_input: 400,
  live_unavailable: 400,
  callback_number_not_scripted: 400,
  callback_source_mismatch: 400,
  not_found: 404,
  no_run_for_request: 404,
  run_id_exists: 409,
  request_conflict: 409,
  state_locked: 409,
  run_finished: 409,
  world_model_locked: 409,
  unsupported_media_type: 415,
  payload_too_large: 413,
  unreadable_document: 422,
  pdf_render_unavailable: 422,
  busy: 429,
  live_unconfigured: 503,
  hmem_disabled: 503,
  zetaris_unavailable: 503,
  erp_unavailable: 503,
};

export type Failure = { status: number; error: string; code: string };

/** Throw this from a route for a known HTTP failure. */
export const fail = (code: ErrorCode, message: string, status?: number): AppError =>
  new AppError(code, message, { httpStatus: status ?? STATUS[code] ?? 500 });

export function firstIssue(err: ZodError): string {
  const i = err.issues[0];
  if (!i) return "The input is not valid.";
  const where = i.path.join(".");
  return where ? `${where}: ${i.message}` : i.message;
}

/** Parse with zod or throw a 400 invalid_input naming the first failing field. */
export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw fail("invalid_input", firstIssue(r.error), 400);
  return r.data;
}

export function classify(err: unknown): Failure {
  if (err instanceof ZodError) return { status: 400, error: firstIssue(err), code: "invalid_input" };
  if (err instanceof AppError) {
    if (err.code.startsWith("zetaris_")) return { status: 502, error: "Data layer query failed", code: err.code };
    const status = err.httpStatus ?? STATUS[err.code] ?? (err.code in MODEL_ERROR_TEXT ? 502 : 500);
    const model = MODEL_ERROR_TEXT[err.code as keyof typeof MODEL_ERROR_TEXT];
    return { status, error: model ?? err.message, code: err.code };
  }
  const f = err as { code?: string; statusCode?: number };
  if (f.code === "FST_ERR_CTP_BODY_TOO_LARGE" || f.code === "FST_REQ_FILE_TOO_LARGE")
    return { status: 413, error: "The request body is too large.", code: "payload_too_large" };
  if (f.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE")
    return { status: 415, error: "Unsupported content type.", code: "unsupported_media_type" };
  if (f.code === "FST_ERR_CTP_INVALID_JSON_BODY" || f.code === "invalid_json")
    return { status: 400, error: "Body is not valid JSON.", code: "invalid_json" };
  if (f.statusCode && f.statusCode >= 400 && f.statusCode < 500)
    return { status: f.statusCode, error: "The request is not valid.", code: "invalid_input" };
  return { status: 500, error: "Internal error.", code: "internal_error" };
}

export function sendFailure(reply: FastifyReply, f: Failure): FastifyReply {
  if (f.code === "busy") reply.header("retry-after", "30");
  return reply.code(f.status).header("content-type", "application/json; charset=utf-8").send({ error: masker.string(f.error), code: f.code });
}

export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    const f = classify(err);
    if (f.status >= 500) logger.error({ method: req.method, url: req.url.split("?")[0], err }, "request_failed");
    return sendFailure(reply, f);
  });
  app.setNotFoundHandler((_req, reply) => sendFailure(reply, { status: 404, error: "Not found.", code: "not_found" }));
}
