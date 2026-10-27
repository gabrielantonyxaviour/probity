// Idempotent phased registration. Exit 2 on a failed phase, 3 if the 20-minute timer fires.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { runZetaris, ZetarisError } from "../../app/adapters/zetaris/index.ts";
import { loadZetarisConfig, requireSecUserAgent } from "../../app/adapters/zetaris/config.ts";
import { saveCapture } from "./capture.ts";
import { generate, loadDbEnv } from "./gen-register-sql.ts";
import { asInline, maybeSkipCompile } from "./phases/recover.ts";
import { fail, runJob } from "./run-job.ts";
import { JDBC_HOSTS } from "./sql/erp.ts";
import type { Job, Phase } from "./sql/types.ts";
import { ddlSha16 } from "./sql/usl.ts";
import { verifyRest } from "./verify-rest.ts";
import { verifyPhase } from "./verify-live.ts";

const PHASES: Phase[] = ["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"];
const started = Date.now();
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const rebuild = args.includes("--rebuild-usl");
const only = args.includes("--only") ? (args[args.indexOf("--only") + 1] as Phase) : undefined;
const from = args.includes("--from") ? (args[args.indexOf("--from") + 1] as Phase) : undefined;
let activationForm = "view";

function chosenPhases(): Phase[] {
  if (only) return [only];
  if (from) return PHASES.slice(PHASES.indexOf(from));
  return PHASES;
}

function probeJdbc(): string {
  for (const host of JDBC_HOSTS) {
    const [name, port] = host.split(":");
    try {
      execFileSync(
        "docker",
        ["exec", "zetaris-driver-1", "bash", "-c", `timeout 3 bash -c 'echo >/dev/tcp/${name}/${port}'`],
        { stdio: "ignore" },
      );
      process.stdout.write(`jdbc reachable ${host}\n`);
      return host;
    } catch {
      process.stdout.write(`jdbc unreachable ${host}\n`);
    }
  }
  return "";
}

async function preflight(): Promise<void> {
  const one = await runZetaris("SELECT 1 AS one LIMIT 1", { key: "query", kind: "sql", limit: 1, queryId: randomUUID(), columns: ["one"] });
  if (String(one.rows[0]?.[0]) !== "1") throw new ZetarisError("zetaris_sql_error", "SELECT 1 did not return 1");
  const again = await runZetaris("SELECT 1 AS one LIMIT 1", { key: "query", kind: "sql", limit: 1, queryId: randomUUID(), columns: ["one"] });
  process.stdout.write(`P0 row_hash ${one.rowHash} repeat ${again.rowHash}\n`);
  await runZetaris("SHOW LIGHTNING DATABASES", { key: "query", kind: "sql", limit: 50, queryId: randomUUID() });
  await runZetaris("SHOW DATASOURCES", { key: "query", kind: "sql", limit: 50, queryId: randomUUID() });
  try {
    await runZetaris("SHOW NAMESPACES OR TABLES IN lightning.metastore", { key: "query", kind: "sql", limit: 50, queryId: randomUUID() });
  } catch (err) {
    const code = err instanceof ZetarisError ? err.code : "error";
    process.stdout.write(`P0 metastore probe ${code}\n`);
  }
  try {
    await runZetaris("SELECT * FROM no_such_db.no_such_table LIMIT 1", { key: "query", kind: "sql", limit: 1, queryId: randomUUID() });
  } catch (err) {
    const typed = err instanceof ZetarisError ? err : new ZetarisError("zetaris_sql_error", "error");
    mkdirSync("zetaris/results", { recursive: true });
    writeFileSync(
      "zetaris/results/k1p_error_sample.json",
      `${JSON.stringify({ at: new Date().toISOString(), httpStatus: typed.httpStatus ?? null, code: typed.code, message: typed.message }, null, 2)}\n`,
    );
    process.stdout.write(`P0 error sample ${typed.code}\n`);
  }
}

function noteSession(): void {
  const path = "zetaris/.state/session_tables.json";
  let names: string[];
  try {
    names = JSON.parse(readFileSync(path, "utf8")) as string[];
  } catch {
    names = [];
  }
  if (!names.includes("pp_usa_r_khk6e1jw9c15")) names.push("pp_usa_r_khk6e1jw9c15");
  mkdirSync("zetaris/.state", { recursive: true });
  writeFileSync(path, `${JSON.stringify(names, null, 2)}\n`);
}

async function execute(job: Job): Promise<void> {
  if (job.label === "compile-vendor360") {
    const gate = await maybeSkipCompile(rebuild);
    if (gate === "skip") {
      process.stdout.write("P5 compile-vendor360 skip\n");
      return;
    }
  }
  try {
    const result = await runJob(job);
    if (result.status === "ok") saveCapture(job, result);
    if (job.label === "k1d-create") noteSession();
  } catch (err) {
    if (job.label === "usl-2") {
      const code = err instanceof ZetarisError ? err.code : "error";
      process.stdout.write(`P8 usl-2 ${code} t11_mode=split\n`);
      return;
    }
    const retry = job.sql.includes("FROM probity.") ? asInline(job) : null;
    if (retry) {
      activationForm = "inline";
      process.stdout.write(`${job.phase} ${job.label} retry inline\n`);
      const result = await runJob(retry);
      if (result.status === "ok") saveCapture(retry, result);
      return;
    }
    const hint =
      job.phase === "P3" ? "ERP_PATH=gateway" : job.phase === "P2" ? "REGISTRY_PATH=gateway" : job.phase === "P5" ? "REGISTRY_USL_PATH=stage" : "see 03 §9";
    fail(job.phase, job, err, hint);
  }
}

async function main(): Promise<void> {
  loadDbEnv();
  const host = probeJdbc();
  const { jobs } = generate(host || "payee-erp-db:5432");
  const phases = chosenPhases();
  if (dry) {
    for (const job of jobs.filter((j) => phases.includes(j.phase))) process.stdout.write(`${job.phase} ${job.label} ${job.key}\n`);
    process.stdout.write(`dry-run ${jobs.length} statements\n`);
    return;
  }
  for (const phase of phases) {
    if (Date.now() - started > 20 * 60 * 1000) {
      process.stderr.write(`timer phase ${phase}\n`);
      process.exit(3);
    }
    if (phase === "P0") {
      await preflight();
      continue;
    }
    if (phase === "P3" && !host) {
      process.stderr.write("P3 BLOCKED-ON-DATA-LANE jdbc unreachable from driver\n");
      if (!only) process.exit(2);
      continue;
    }
    if (phase === "P9") continue;
    const slice = jobs.filter((j) => j.phase === phase);
    if (slice.length === 0) {
      process.stdout.write(`${phase} no statements\n`);
      continue;
    }
    for (const job of slice) await execute(job);
    if (phase === "P4" || phase === "P6") await verifyPhase(phase);
    if (phase === "P2") {
      const checked = await verifyRest(requireSecUserAgent(loadZetarisConfig()));
      mkdirSync("zetaris/results", { recursive: true });
      writeFileSync("zetaris/results/rest_counts.json", `${JSON.stringify({ at: new Date().toISOString(), ok: checked.ok, counts: checked.counts, notes: checked.notes }, null, 2)}\n`);
      process.stdout.write(`P2 verify ok=${checked.ok} notes=${checked.notes.length}\n`);
      if (!checked.ok) {
        fail("P2", undefined, new ZetarisError("zetaris_sql_error", checked.notes.join("; ") || "verify failed"), "REGISTRY_PATH=gateway");
      }
    }
  }
  const cfg = loadZetarisConfig();
  const state = {
    at: new Date().toISOString(),
    erp_table_ref: "payee_erp",
    jdbc_host: host || null,
    registry_path: cfg.registryPath,
    registry_usl_path: cfg.registryUslPath,
    children_shape: cfg.childrenShape,
    activation_form: activationForm,
    ddl_sha: ddlSha16(),
    phases,
  };
  mkdirSync("zetaris/.state", { recursive: true });
  writeFileSync("zetaris/.state/registration.json", `${JSON.stringify(state, null, 2)}\n`);
  writeFileSync("zetaris/results/registration.json", `${JSON.stringify(state, null, 2)}\n`);
  process.stdout.write("register done\n");
}

main().catch((err) => fail("register", undefined as unknown as Job, err, "see 03 §9"));
