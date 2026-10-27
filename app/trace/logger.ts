// Foundation-provided pino logger (06 §8.1). The trace lane (Sol-B2) extends this with the full masker (trace/mask.ts)
// by calling `setLogMasker()`. Production code never writes to the console object: everything goes through this logger.
import { randomUUID } from "node:crypto";
import pino from "pino";
import pretty from "pino-pretty";
import { loadConfig } from "../config/env";
import { masker as processMasker } from "./mask";

export const SESSION_ID = `s-${randomUUID().slice(0, 8)}`;

type Masker = (value: unknown) => unknown;
let masker: Masker = (v) => processMasker.deep(v);
/** Install the deep masker (06 §8.3). Applied to every argument that reaches pino. */
export function setLogMasker(fn: Masker): void {
  masker = fn;
}

export const REDACT_PATHS = [
  "req.headers.authorization",
  "headers.authorization",
  "*.api_key",
  "*.token",
  "*.password",
  "*.METERLESS_RUNTIME_TOKEN",
  "*.ZETARIS_QUERY_API_KEY",
  "*.ZETARIS_ADMIN_API_KEY",
  "*.ZETARIS_API_KEY",
  "*.account_number",
  "*.content_base64",
  "body.input.claims.bank.account_number",
];

export function createLogger(opts: { level?: string; format?: "pretty" | "json"; svc?: string } = {}): pino.Logger {
  // A malformed configuration must reach the caller as a fixed-text error, not as a stack from this import.
  const cfg = (() => {
    try {
      return loadConfig();
    } catch {
      return { LOG_LEVEL: "info", LOG_FORMAT: "pretty" } as const;
    }
  })();
  const level = opts.level ?? cfg.LOG_LEVEL;
  const format = opts.format ?? cfg.LOG_FORMAT;
  const options: pino.LoggerOptions = {
    level,
    base: { svc: opts.svc ?? "payee-api", session_id: SESSION_ID },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    hooks: {
      logMethod(args, method) {
        method.apply(this, args.map((a) => masker(a)) as unknown as Parameters<typeof method>);
      },
    },
  };
  const stream =
    format === "pretty"
      ? pretty({
          sync: true,
          colorize: process.stdout.isTTY,
          ignore: "pid,hostname,svc,session_id,time,level",
          messageFormat: "[{levelLabel}] {msg}",
        })
      : pino.destination(1);
  return pino(options, stream);
}

export const logger = createLogger();
