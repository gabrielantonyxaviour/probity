// Zetaris env (03 §1, §4.1). ZETARIS_API_KEY fills both keys when the split keys are unset.
import { z } from "zod";

const placeholder = (v: unknown) => typeof v === "string" && (v.trim() === "" || /<[^>]+>/.test(v));
const clean = (v: unknown) => (placeholder(v) || v === "" ? undefined : v);
const optStr = z.preprocess(clean, z.string().min(8).optional());
const int = (d: number, min: number, max: number) =>
  z.preprocess((v) => (v === undefined || v === "" ? d : Number(v)), z.number().int().min(min).max(max));
const flag = (d: boolean) =>
  z.preprocess((v) => {
    if (v === undefined || v === "") return d;
    return ["true", "1", "yes"].includes(String(v).toLowerCase());
  }, z.boolean());

const Raw = z.object({
  ZETARIS_API_ORIGIN: z.preprocess(clean, z.string().default("http://localhost:8888")),
  ZETARIS_UI_ORIGIN: z.preprocess(clean, z.string().default("http://localhost:3000")),
  ZETARIS_ROUTE: z.preprocess(clean, z.enum(["direct", "api", "ui_proxy"]).default("direct")),
  ZETARIS_ORG_ID: z.preprocess(clean, z.string().regex(/^\d+$/).default("1")),
  ZETARIS_ADMIN_API_KEY: optStr,
  ZETARIS_QUERY_API_KEY: optStr,
  ZETARIS_API_KEY: optStr,
  SEC_USER_AGENT: z.preprocess(
    clean,
    z
      .string()
      .regex(/^[A-Za-z0-9 ._@-]{5,100}$/)
      .refine((s) => s.includes("@"), "SEC_USER_AGENT must contain @")
      .optional(),
  ),
  ZETARIS_SQL_TIMEOUT_MS: int(45_000, 1_000, 60_000),
  ZETARIS_DDL_TIMEOUT_MS: int(120_000, 1_000, 600_000),
  ZETARIS_ROW_LIMIT: int(500, 1, 500),
  ZETARIS_MAX_CONCURRENCY: int(3, 1, 4),
  ERP_PATH: z.preprocess(clean, z.enum(["jdbc", "gateway"]).default("jdbc")),
  REGISTRY_USL_PATH: z.preprocess(clean, z.enum(["rest", "stage"]).default("rest")),
  REGISTRY_PATH: z.preprocess(clean, z.enum(["direct", "gateway"]).default("direct")),
  CHILDREN_SHAPE: z.preprocess(clean, z.enum(["rows", "wrapped"]).default("rows")),
  PREREGISTER_DISCOVERY: flag(false),
  ERP_ZETARIS_READER_PASSWORD: z.preprocess(clean, z.string().min(1).optional()),
  GATEWAY_ORIGIN_FOR_ZETARIS: z.preprocess(
    clean,
    z.string().default("http://host.docker.internal:8790"),
  ),
  ZETARIS_DOCKER_NETWORK: z.preprocess(clean, z.string().default("zetaris_default")),
});

export type ZetarisConfig = {
  apiOrigin: string;
  uiOrigin: string;
  route: "direct" | "ui_proxy";
  orgId: string;
  queryKey: string | undefined;
  adminKey: string | undefined;
  secUserAgent: string | undefined;
  sqlTimeoutMs: number;
  ddlTimeoutMs: number;
  rowLimit: number;
  maxConcurrency: number;
  erpPath: "jdbc" | "gateway";
  registryUslPath: "rest" | "stage";
  registryPath: "direct" | "gateway";
  childrenShape: "rows" | "wrapped";
  preregisterDiscovery: boolean;
  erpPassword: string | undefined;
  gatewayOrigin: string;
  dockerNetwork: string;
};

let cached: ZetarisConfig | undefined;

/** Names only. Never includes secret values. */
export class ZetarisConfigError extends Error {
  readonly code = "config_invalid";
  constructor(message: string) {
    super(message);
    this.name = "ZetarisConfigError";
  }
}

export function loadZetarisConfig(env: NodeJS.ProcessEnv = process.env): ZetarisConfig {
  if (cached && env === process.env) return cached;
  const raw = { ...env };
  for (const k of ["ZETARIS_ADMIN_API_KEY", "ZETARIS_QUERY_API_KEY"] as const) {
    if ((raw[k] === undefined || placeholder(raw[k])) && raw.ZETARIS_API_KEY && !placeholder(raw.ZETARIS_API_KEY)) {
      raw[k] = raw.ZETARIS_API_KEY;
    }
  }
  const parsed = Raw.safeParse(raw);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new ZetarisConfigError(`Configuration invalid: ${names}`);
  }
  const e = parsed.data;
  const origin = (u: string) => u.replace(/\/+$/, "").replace(/\/api\/v1\.0$/, "");
  const cfg: ZetarisConfig = {
    apiOrigin: origin(e.ZETARIS_API_ORIGIN),
    uiOrigin: origin(e.ZETARIS_UI_ORIGIN),
    route: e.ZETARIS_ROUTE === "ui_proxy" ? "ui_proxy" : "direct",
    orgId: e.ZETARIS_ORG_ID,
    queryKey: e.ZETARIS_QUERY_API_KEY,
    adminKey: e.ZETARIS_ADMIN_API_KEY,
    secUserAgent: e.SEC_USER_AGENT,
    sqlTimeoutMs: e.ZETARIS_SQL_TIMEOUT_MS,
    ddlTimeoutMs: e.ZETARIS_DDL_TIMEOUT_MS,
    rowLimit: e.ZETARIS_ROW_LIMIT,
    maxConcurrency: e.ZETARIS_MAX_CONCURRENCY,
    erpPath: e.ERP_PATH,
    registryUslPath: e.REGISTRY_USL_PATH,
    registryPath: e.REGISTRY_PATH,
    childrenShape: e.CHILDREN_SHAPE,
    preregisterDiscovery: e.PREREGISTER_DISCOVERY,
    erpPassword: e.ERP_ZETARIS_READER_PASSWORD,
    gatewayOrigin: origin(e.GATEWAY_ORIGIN_FOR_ZETARIS),
    dockerNetwork: e.ZETARIS_DOCKER_NETWORK,
  };
  if (env === process.env) cached = cfg;
  return cfg;
}

export function resetZetarisConfigForTests(): void {
  cached = undefined;
}

export function requireSecUserAgent(cfg: ZetarisConfig = loadZetarisConfig()): string {
  if (!cfg.secUserAgent) throw new ZetarisConfigError("SEC_USER_AGENT is unset");
  return cfg.secUserAgent;
}
