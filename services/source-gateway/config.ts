// Gateway configuration. Reads process env first, then .env.local / .env.db.local / .env (never overriding). No value is ever logged.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

function loadEnvFiles(): void {
  for (const name of [".env.local", ".env.db.local", ".env"]) {
    const file = path.join(REPO_ROOT, name);
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").split("\n")) {
      const m = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(raw);
      if (!m || raw.trimStart().startsWith("#")) continue;
      let value = m[2] as string;
      if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
      else value = value.replace(/\s+#.*$/, "");
      if (process.env[m[1] as string] === undefined && value !== "" && !/^<.*>$/.test(value)) process.env[m[1] as string] = value;
    }
  }
}

const Schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8790),
  HOST: z.string().optional(),
  GATEWAY_DEBUG: z.enum(["0", "1"]).default("0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "silent"]).default("info"),
  USASPENDING_UPSTREAM: z.url().default("https://api.usaspending.gov"),
  SEC_DATA_UPSTREAM: z.url().default("https://data.sec.gov"),
  SEC_WWW_UPSTREAM: z.url().default("https://www.sec.gov"),
  SEC_USER_AGENT: z.string().min(8).optional(),
  ERP_READER_DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//).optional(),
  SAMPLE_DATA_DIR: z.string().default(path.join(REPO_ROOT, "data/sample")),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(20_000),
  RETRY_DELAY_MS: z.coerce.number().int().min(0).max(30_000).default(2_000),
});
export type GatewayConfig = z.infer<typeof Schema> & { host: string };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  if (env === process.env) loadEnvFiles();
  const parsed = Schema.parse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== "")));
  const host = parsed.HOST ?? (existsSync("/.dockerenv") ? "0.0.0.0" : "127.0.0.1");
  return { ...parsed, host };
}
