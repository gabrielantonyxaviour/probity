// Write zetaris/register/*.sql (placeholders) and .generated/ (real secrets, gitignored).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadZetarisConfig, requireSecUserAgent, resetZetarisConfigForTests } from "../../app/adapters/zetaris/config.ts";
import { dqRulesSqlFile } from "../../app/templates/dq-rules.ts";
import { activateJobs } from "./sql/activate.ts";
import { dqJobs } from "./sql/dq.ts";
import { erpJobs } from "./sql/erp.ts";
import { exploreJobs } from "./sql/explore.ts";
import { restJobs } from "./sql/rest.ts";
import { uslJobs } from "./sql/usl.ts";
import { viewJobs } from "./sql/views.ts";
import type { Job } from "./sql/types.ts";

export function loadDbEnv(): void {
  if (!process.env.ERP_ZETARIS_READER_PASSWORD && existsSync(".env.db.local")) process.loadEnvFile(".env.db.local");
  resetZetarisConfigForTests();
}

const GEN = "zetaris/register/.generated";
const COMMITTED = "zetaris/register";

function writeSplit(dir: string, jobs: Job[]): void {
  mkdirSync(dir, { recursive: true });
  const byFile = new Map<string, string[]>();
  for (const job of jobs) {
    const list = byFile.get(job.file) ?? [];
    list.push(job.sql.trim());
    byFile.set(job.file, list);
  }
  for (const [file, parts] of byFile) writeFileSync(join(dir, file), `${parts.join("\n\n-- @@\n\n")}\n`);
}

export function buildJobs(userAgent: string, password: string, jdbcHost = "payee-erp-db:5432"): Job[] {
  const cfg = loadZetarisConfig();
  return [
    ...restJobs(cfg, userAgent),
    ...viewJobs(cfg),
    ...erpJobs(password, jdbcHost),
    ...uslJobs(),
    ...activateJobs(),
    ...dqJobs(),
    ...exploreJobs(),
  ];
}

export function generate(jdbcHost = "payee-erp-db:5432"): { jobs: Job[]; count: number } {
  loadDbEnv();
  const cfg = loadZetarisConfig();
  const ua = requireSecUserAgent(cfg);
  const password = cfg.erpPassword ?? "<ERP_ZETARIS_READER_PASSWORD>";
  const jobs = buildJobs(ua, password, jdbcHost);
  writeSplit(GEN, jobs);
  const publicJobs = buildJobs("<SEC_USER_AGENT>", "<ERP_ZETARIS_READER_PASSWORD>");
  writeSplit(COMMITTED, publicJobs);
  writeFileSync("zetaris/dq_rules.sql", dqRulesSqlFile());
  const activates = publicJobs.filter((j) => j.file === "60_activate.sql");
  mkdirSync("zetaris/activate", { recursive: true });
  for (const job of activates) writeFileSync(join("zetaris/activate", `${job.label}.sql`), `${job.sql.trim()}\n`);
  mkdirSync("zetaris/explore", { recursive: true });
  for (const job of publicJobs.filter((j) => j.file === "80_explore.sql" && j.key === "query")) {
    writeFileSync(join("zetaris/explore", `${job.label}.sql`), `${job.sql.trim()}\n`);
  }
  writeFileSync(
    "zetaris/usl_queries.sql",
    publicJobs
      .filter((j) => j.label === "usl-1" || j.label === "usl-2" || j.label === "usl-3")
      .map((j) => j.sql.trim())
      .join("\n\n-- @@\n\n") + "\n",
  );
  const meta = jobs.map((job, index) => ({
    index,
    phase: job.phase,
    label: job.label,
    file: job.file,
    key: job.key,
    kind: job.kind,
    limit: job.limit,
    gapBeforeMs: job.gapBeforeMs ?? 0,
  }));
  writeFileSync(join(GEN, "manifest.json"), `${JSON.stringify(meta)}\n`);
  return { jobs, count: jobs.length };
}

const isMain = process.argv[1]?.endsWith("gen-register-sql.ts");
if (isMain) {
  const host = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : "payee-erp-db:5432";
  const { count } = generate(host);
  process.stdout.write(`generated ${count} statements\n`);
}
