// Foundation-provided config loader (06 §7.2). The config lane (Sol-B2) may extend it; names and semantics are frozen.
// Missing live keys NEVER fail the loader (REV-05): `liveMissing(cfg)` lists them; /readyz reports them and POST /run
// answers 503 live_unconfigured. Only malformed values throw ConfigError (names only, never values).
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { PINNED_MODELS } from "../schemas/models";
import { normaliseRuntimeUrl } from "./runtime-url";

export const isPlaceholder = (v: unknown): boolean => typeof v === "string" && (v.trim() === "" || /<[^>]+>/.test(v));
const clean = (v: unknown) => (isPlaceholder(v) ? undefined : v);
const opt = <T extends z.ZodType>(s: T) => z.preprocess(clean, s.optional());
const withDefault = <T extends z.ZodType>(s: T, d: z.output<T>) => z.preprocess(clean, s.default(d as never));
const bool = (d: boolean) =>
  z.preprocess(
    (v) => (v === undefined || v === "" ? d : ["true", "1", "yes"].includes(String(v).toLowerCase())),
    z.boolean(),
  );
const int = (d: number, min: number, max: number) =>
  z.preprocess((v) => (v === undefined || v === "" ? d : Number(v)), z.number().int().min(min).max(max));
const nvidiaOnly = z
  .string()
  .refine(
    (s) => s.startsWith("nvidia/"),
    "pin an exact nvidia/* model id; meterless/* routing ids can reach paid Anthropic (DEC-01)",
  );

const Env = z.object({
  SAMPLE_MODE: bool(false),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  LOG_FORMAT: z.enum(["pretty", "json"]).default("pretty"),
  HOST: z.string().default("0.0.0.0"),
  PORT: int(8787, 1, 65535),
  RUN_BUDGET_SECONDS: int(480, 60, 480),
  MAX_CONCURRENT_RUNS: int(2, 1, 4),
  MAX_UPLOAD_MB: int(8, 1, 20),
  ENABLE_TEST_HOOKS: bool(true),
  ENABLE_HMEM: bool(false),
  LOG_DIR: z.string().default("logs"),
  WORLD_DIR: opt(z.string().min(1)), // no default (REV-53)
  HMEM_DIR: z.string().default("data/hmem"),
  SAMPLE_DATA_DIR: z.string().default("data/sample"),
  UPLOAD_DIR: z.string().default("uploads"),
  INPUT_EXAMPLES_DIR: z.string().default("input_examples"),
  TESSDATA_DIR: z.string().default("app/vendor/tessdata"),
  ZETARIS_API_ORIGIN: withDefault(z.url(), "http://localhost:8888"),
  ZETARIS_UI_ORIGIN: opt(z.url()),
  ZETARIS_ORG_ID: z.string().regex(/^\d+$/).default("1"),
  ZETARIS_QUERY_API_KEY: opt(z.string().min(8)),
  ZETARIS_ADMIN_API_KEY: opt(z.string().min(8)),
  ZETARIS_API_KEY: opt(z.string().min(8)), // alias: fills the admin and query keys when those are unset
  ZETARIS_SQL_TIMEOUT_MS: int(45_000, 5_000, 60_000),
  ZETARIS_DDL_TIMEOUT_MS: int(120_000, 10_000, 600_000),
  ZETARIS_ROW_LIMIT: int(500, 1, 500),
  ZETARIS_MAX_CONCURRENCY: int(3, 1, 4),
  ZETARIS_DOWN_POLICY: z.enum(["degrade", "error"]).default("degrade"),
  ZETARIS_ROUTE: z.enum(["api", "ui_proxy"]).default("api"),
  ERP_PATH: z.enum(["jdbc", "gateway"]).default("jdbc"),
  REGISTRY_USL_PATH: z.enum(["rest", "stage"]).default("rest"),
  REGISTRY_PATH: z.enum(["direct", "gateway"]).default("direct"),
  CHILDREN_SHAPE: z.enum(["rows", "wrapped"]).default("rows"),
  PREREGISTER_DISCOVERY: bool(false),
  METERLESS_BASE_URL: withDefault(z.string(), "http://127.0.0.1:8088/v1"),
  METERLESS_RUNTIME_TOKEN: opt(
    z
      .string()
      .min(8)
      .refine((t) => t !== "rt-local", "rt-local is rejected by the runtime"),
  ),
  // Live finding 2026-10-27: with `meterless-scope: user` Nightshift's H-MEM injects earlier answers into later prompts even when
  // every call has a fresh app id; `app` scope (per-call app id) stays clean. Both are accepted; the default keeps decisions clean.
  METERLESS_SCOPE: z.enum(["user", "app"]).default("app"),
  METERLESS_APP_ID: z
    .string()
    .regex(/^[a-z0-9-]{3,40}$/)
    .default("probity"),
  LANE_FAST_MODEL: withDefault(nvidiaOnly, PINNED_MODELS.fast),
  LANE_DEEP_MODEL: withDefault(nvidiaOnly, PINNED_MODELS.deep),
  LANE_VISION_MODEL: opt(nvidiaOnly),
  LANE_JUDGE_MODEL: opt(nvidiaOnly),
  L1_TOOL_MODE: z.enum(["native", "json"]).default("native"),
  REASONING_CONTROL: z.enum(["kwargs", "system", "none"]).default("kwargs"),
  MODEL_TIMEOUT_MS: int(90_000, 10_000, 120_000),
  MODEL_FIRST_CALL_TIMEOUT_MS: int(180_000, 30_000, 300_000),
  SEC_USER_AGENT: opt(z.string().regex(/^[A-Za-z][\w .-]{1,40} [^\s@]+@[^\s@]+\.[a-z]{2,}$/)), // REV-62: no default
  USASPENDING_BASE_URL: z.url().default("https://api.usaspending.gov"),
  SEC_DATA_BASE_URL: z.url().default("https://data.sec.gov"),
  ERP_DATABASE_URL: opt(z.string().regex(/^postgres(ql)?:\/\//)),
  SOURCE_GATEWAY_URL: opt(z.url()),
  PAYEE_API_URL: opt(z.url()), // CLI forwards here when it answers; default http://localhost:<PORT>
  PAYEE_UI_URL: withDefault(z.url(), "http://localhost:3100"), // the Review URL printed by the CLI
  PAYEE_DEMO_SESSIONS: bool(false), // keep the sample World Model between processes (spine §9.3)
});

/** Live mode needs these. The Zetaris origin and the Nightshift URL have local defaults, so only keys and the ERP URL can be missing. */
export const LIVE_REQUIRED = [
  "ZETARIS_API_ORIGIN",
  "ZETARIS_QUERY_API_KEY",
  "METERLESS_BASE_URL",
  "METERLESS_RUNTIME_TOKEN",
  "ERP_DATABASE_URL",
] as const;
type Parsed = z.infer<typeof Env>;
export const liveMissing = (c: Pick<Parsed, "SAMPLE_MODE" | (typeof LIVE_REQUIRED)[number]>) =>
  c.SAMPLE_MODE ? [] : LIVE_REQUIRED.filter((k) => !c[k]);

export class ConfigError extends Error {
  readonly code = "config_invalid";
}
export type Config = ReturnType<typeof loadConfig>;

/**
 * Load `.env.local`, then `.env`, then `.env.db.local` (the local ERP database credentials written by the data lane) into
 * process.env without overriding values already set: the process env wins, and earlier files win over later ones.
 */
function loadEnvFiles(): void {
  for (const f of [".env.local", ".env", ".env.db.local"]) {
    try {
      process.loadEnvFile(f);
    } catch {
      /* optional file */
    }
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env) loadEnvFiles();
  const raw: NodeJS.ProcessEnv = { ...env };
  // ZETARIS_API_KEY is the alias for both Zetaris keys until a second user's key exists (SW7 fail branch).
  for (const k of ["ZETARIS_ADMIN_API_KEY", "ZETARIS_QUERY_API_KEY"] as const) {
    if (
      (raw[k] === undefined || isPlaceholder(raw[k])) &&
      raw.ZETARIS_API_KEY !== undefined &&
      !isPlaceholder(raw.ZETARIS_API_KEY)
    ) {
      raw[k] = raw.ZETARIS_API_KEY;
    }
  }
  const r = Env.safeParse(raw);
  if (!r.success) {
    const names = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "); // names only, never values
    throw new ConfigError(`Configuration invalid: ${names}. Set SAMPLE_MODE=true to run offline with no keys.`);
  }
  const e = r.data;
  const abs = (p: string) => path.resolve(process.cwd(), p);
  return {
    ...e,
    ZETARIS_API_ORIGIN: e.ZETARIS_API_ORIGIN.replace(/\/+$/, "").replace(/\/api\/v1\.0$/, ""), // origin only (SCR-03-6)
    METERLESS_BASE_URL: normaliseRuntimeUrl(e.METERLESS_BASE_URL),
    secUserAgentLive: e.SEC_USER_AGENT && !/@[^\s@]+\.example$/i.test(e.SEC_USER_AGENT) ? e.SEC_USER_AGENT : undefined,
    dirs: {
      logs: abs(e.LOG_DIR),
      world: e.WORLD_DIR ? abs(e.WORLD_DIR) : e.SAMPLE_MODE ? path.join(os.tmpdir(), "probity-sample") : abs("."),
      hmem: abs(e.HMEM_DIR),
      sample: abs(e.SAMPLE_DATA_DIR),
      uploads: abs(e.UPLOAD_DIR),
      examples: abs(e.INPUT_EXAMPLES_DIR),
      tessdata: abs(e.TESSDATA_DIR),
    },
    /** Values the masker must never let through (06 §8.3 rule 1). */
    secrets: [
      e.ZETARIS_QUERY_API_KEY,
      e.ZETARIS_ADMIN_API_KEY,
      e.ZETARIS_API_KEY,
      e.METERLESS_RUNTIME_TOKEN,
      e.ERP_DATABASE_URL?.match(/:\/\/[^:]+:([^@]+)@/)?.[1],
      raw.POSTGRES_PASSWORD,
      raw.PAYEE_APP_PASSWORD,
      raw.ERP_ZETARIS_READER_PASSWORD,
    ].filter((s): s is string => typeof s === "string" && s.length >= 6 && !isPlaceholder(s)),
  } as const;
}
