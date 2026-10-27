// Bench (reflection 2a): the same T05 fact sheet for one vendor, fetched by hand-coded REST + pg (bench/direct-path.ts) and through
// Zetaris (the real T05 SQL on the activated USL), compared on time, lines of code, joins and the canonical row_hash. Writes bench/results.json.
//   npx tsx bench/direct-fetch.ts -- --vendor V-10027 [--runs 4] [--no-zetaris]
// Every number is measured here; the DQ2 hand-coded figure is an estimate and says so.
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { COLUMNS, directT05 } from "./direct-path";
import { ROOT, codeLines, count, filesIn, median } from "./measure";

const arg = (n: string, d: string): string => (process.argv.indexOf(`--${n}`) > 0 ? (process.argv[process.argv.indexOf(`--${n}`) + 1] ?? d) : d);
const vendor = arg("vendor", "V-10027");
const runs = Math.max(2, Number(arg("runs", "4")));
const withZetaris = !process.argv.includes("--no-zetaris");

const { loadConfig } = await import("../app/config/env");
const cfg = loadConfig();
if (!cfg.ERP_DATABASE_URL) throw new Error("ERP_DATABASE_URL is not set (the data lane writes .env.db.local).");
const secUserAgent = cfg.secUserAgentLive ?? "Probity bench probity-bench@example.com";
const { rowHash } = await import("../app/adapters/zetaris/response");
const { runZetaris, ZetarisError } = await import("../app/adapters/zetaris/index");
const { t05 } = await import("../app/templates/registry");

type Run = { run: number; ms: number; rows: number; row_hash: string | null; error: string | null };
const direct: Run[] = [];
let directRows: unknown[][] = [];
for (let i = 1; i <= runs; i++) {
  const t0 = Date.now();
  try {
    const r = await directT05(vendor, { erpUrl: cfg.ERP_DATABASE_URL, secUserAgent });
    directRows = r.rows;
    direct.push({ run: i, ms: Date.now() - t0, rows: r.rows.length, row_hash: rowHash(COLUMNS, r.rows), error: null });
  } catch (e) {
    direct.push({ run: i, ms: Date.now() - t0, rows: 0, row_hash: null, error: e instanceof Error ? e.message.slice(0, 160) : "failed" });
  }
}

const usl: Run[] = [];
let uslRows: unknown[][] = [];
const uslQueryIds: string[] = [];
const sql = t05.sql({ vendor_id: vendor });
if (withZetaris) {
  for (let i = 1; i <= runs; i++) {
    const queryId = randomUUID();
    const t0 = Date.now();
    try {
      const r = await runZetaris(sql, { key: "query", kind: "sql", limit: 10, queryId, columns: t05.columns });
      uslRows = r.rows;
      uslQueryIds.push(queryId);
      usl.push({ run: i, ms: r.latencyMs, rows: r.rows.length, row_hash: r.rowHash, error: null });
    } catch (e) {
      usl.push({ run: i, ms: Date.now() - t0, rows: 0, row_hash: null, error: e instanceof ZetarisError ? `${e.code}: ${e.message.slice(0, 100)}` : "failed" });
    }
  }
}

// T05 as the agent itself ran it in recorded live runs for this vendor (logs/run-*.json, read only): the "from the agent's own trace" numbers.
type Rec = { run_id: string; query_id: string; row_hash: string; latency_ms: number };
const recorded: Rec[] = [];
for (const f of readdirSync(path.join(ROOT, "logs")).filter((x) => /^run-r-.*\.json$/.test(x))) {
  const r = JSON.parse(readFileSync(path.join(ROOT, "logs", f), "utf8")) as { run_id: string; vendor_id?: string; mode?: string; live?: { observations?: Array<{ observation: { template_id?: string; query_id: string; row_hash: string; latency_ms: number } }> } };
  if (r.vendor_id !== vendor || r.mode !== "live") continue;
  const seen = new Set<string>();
  for (const w of r.live?.observations ?? []) {
    const o = w.observation;
    if (o.template_id === "T05" && !seen.has(o.query_id)) { seen.add(o.query_id); recorded.push({ run_id: r.run_id, query_id: o.query_id, row_hash: o.row_hash, latency_ms: o.latency_ms }); }
  }
}
const recordedMs = recorded.filter((x) => x.latency_ms >= 100).map((x) => x.latency_ms);
const okMs = (rs: Run[], pick: "first" | "rest"): number | null => median((pick === "first" ? rs.slice(0, 1) : rs.slice(1)).filter((r) => !r.error).map((r) => r.ms));
const diffs = directRows.length && uslRows.length ? COLUMNS.flatMap((c, i) => (String(directRows[0]![i] ?? null) === String(uslRows[0]![i] ?? null) ? [] : [{ column: c, direct: directRows[0]![i] ?? null, zetaris: uslRows[0]![i] ?? null }])) : null;

const uslFiles = { registration_rest: ["zetaris/register/20_rest.sql"], flatten_views: ["zetaris/register/30_views.sql"], erp_datasource: ["zetaris/register/40_erp.sql"], usl_ddl: ["zetaris/usl.ddl"], activation: filesIn("zetaris/activate", ".sql"), dq_rules: ["zetaris/dq_rules.sql"] };
const lines = Object.fromEntries(Object.entries(uslFiles).map(([k, fs]) => [k, fs.reduce((n, f) => n + codeLines(f), 0)]));
const dqText = readFileSync(path.join(ROOT, "zetaris/dq_rules.sql"), "utf8");
const dq2 = /account_single_vendor[\s\S]*?(?=\n--|\n\n|$)/.exec(dqText)?.[0] ?? "";
const result = {
  generated_at: new Date().toISOString(),
  vendor_id: vendor,
  task: "T05 fact sheet: vendor x USAspending recipient x SEC registrant, one vendor",
  runs_per_path: runs,
  timing_ms: {
    note: "first = the first call of this script (new connections, uncached); repeat = median of the later calls. Zetaris times are the adapter's latencyMs per query; direct times are wall clock for the three reads.",
    direct: { first: okMs(direct, "first"), repeat: okMs(direct, "rest"), runs: direct },
    zetaris: withZetaris ? { first: okMs(usl, "first"), repeat: okMs(usl, "rest"), runs: usl, query_ids: uslQueryIds } : "not run (--no-zetaris)",
    zetaris_in_recorded_runs: { source: "logs/run-*.json, T05 observations of live runs for this vendor; a latency under 100 ms is a re-used query record and is left out of the median", runs: recorded, median_ms: median(recordedMs), min_ms: recordedMs.length ? Math.min(...recordedMs) : null, max_ms: recordedMs.length ? Math.max(...recordedMs) : null },
  },
  correctness: { direct_row_hash: direct.find((r) => r.row_hash)?.row_hash ?? null, zetaris_row_hash: usl.find((r) => r.row_hash)?.row_hash ?? null, same_rows: diffs ? diffs.length === 0 : null, column_diffs: diffs,
    same_row_hash_as_recorded_zetaris_runs: recorded.length ? recorded.every((x) => x.row_hash === (direct.find((r) => r.row_hash)?.row_hash ?? null)) : null, recorded_zetaris_row_hashes: [...new Set(recorded.map((x) => x.row_hash))], direct_rows: directRows.length, zetaris_rows: uslRows.length },
  lines_of_code: {
    method: "non-blank, non-comment lines (bench/measure.ts codeLines)",
    direct_path: { file: "bench/direct-path.ts", lines: codeLines("bench/direct-path.ts") },
    usl_path: { ...lines, total: Object.values(lines).reduce((a, b) => a + b, 0), t05_sql: sql.split("\n").length, scope_note: "the USL artefacts cover 6 company families (24 REST tables), every template and 6 DQ rules, not only T05" },
    dq2_account_reuse: { usl: dq2 ? dq2.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).length : null, direct: "estimate, not implemented: about 6 lines (one pg query grouping bank accounts by account_hash)" },
  },
  joins: { usl_in_t05_sql: count(/\bJOIN\b/gi, sql), direct_in_code: 2, direct_note: "vendor.uei to the USAspending record and vendor.registrant_cik to the SEC record, each a hand-written key lookup; the domain list is a third pg query" },
  integration_concerns: [
    { concern: "HTTP retry and backoff, rate limits", direct: "not handled (one attempt, 20 s timeout)", usl: "adapter semaphore, timeouts, retry classes" },
    { concern: "JSON flattening and type coercion", direct: "inline property reads, strings by hand", usl: "flatten views and CAST in SQL, written once for 24 REST tables" },
    { concern: "Cross-source join", direct: "two key lookups in TypeScript", usl: "two LEFT JOINs in SQL" },
    { concern: "Provenance and re-run", direct: "none", usl: "a query id per query, stored row_hash, POST /zetaris/rerun" },
    { concern: "Caching", direct: "none", usl: "CACHE TABLE on registry tables" },
    { concern: "A vendor whose UEI was never registered", direct: "works (the recipient id is derived from the UEI)", usl: "needs a CREATE REST SESSION TABLE at run time (admin key)" },
    { concern: "Governed access", direct: "app holds the ERP password and calls public APIs directly", usl: "query key can SELECT, admin key registers; the ERP is reached through one datasource" },
  ],
  honest_summary: null as string | null,
};
const fmt = (n: number | null) => (n === null ? "n/a" : `${n} ms`);
const d = result.timing_ms.direct;
const z = result.timing_ms.zetaris;
const rec = result.timing_ms.zetaris_in_recorded_runs;
const liveZ = typeof z !== "string" && z.first !== null ? `${fmt(z.first)} first / ${fmt(z.repeat)} repeat now` : "no live Zetaris answer in this run (timeout)";
result.honest_summary = `For one vendor the hand-coded path is ${result.lines_of_code.direct_path.lines} lines against ${result.lines_of_code.usl_path.total} lines of USL artefacts (amortised over every template, family and DQ rule). Direct: ${fmt(d.first)} first / ${fmt(d.repeat)} repeat. Zetaris T05: ${liveZ}; in ${recordedMs.length} recorded live queries the agent's own T05 took a median ${fmt(rec.median_ms)} (${fmt(rec.min_ms)} to ${fmt(rec.max_ms)}). The direct path has none of provenance, re-run, caching, retries or governed keys.`;
writeFileSync(path.join(ROOT, "bench/results.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(result.honest_summary);
console.log(`rows equal: ${result.correctness.same_rows}; same row_hash as the recorded Zetaris runs: ${result.correctness.same_row_hash_as_recorded_zetaris_runs}; direct row_hash ${result.correctness.direct_row_hash}; zetaris row_hash ${result.correctness.zetaris_row_hash}`);
if (diffs?.length) console.log(`column differences: ${JSON.stringify(diffs)}`);
console.log("wrote bench/results.json");
