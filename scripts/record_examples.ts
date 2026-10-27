// Records the shipped input_examples as real runs through the API and writes output_examples/NN-*/ plus MANIFEST.json.
//
//   npm run record:examples                              # all eight examples, live, through the API on :8787
//   npm run record:examples -- --only 01,03              # a subset
//   npm run record:examples -- --from-run 01=r-...,03=r-... --out /tmp/shape-check   # NO new run: package finished runs
//   npm run record:examples -- --plan                    # print what would run, touch nothing
//
// Each folder holds request.json, response.json (the run envelope), stdout.txt, trace-<run>.jsonl, receipts-<run>.jsonl,
// queries-<run>.jsonl, warmup-*.json and RECORDED.md; MANIFEST.json lists {file, sha256, run_id, mode, captured_at, git_sha}.
// The shapes are the ones README R8 (jq filters) and video/scripts/facts.ts read. Nothing here is read by app/ or ui/.
// Before a real recording: reset the ERP, record, reset again, then prime the inbox (STATUS section 4, item 10).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { buildRunBody } from "../app/cli/input-file";
import { renderResult } from "../app/cli/print";
import { saveExample } from "../app/cli/save-example";
import { RunEnvelope, RunErrorEnvelope } from "../app/schemas/api";
import { TraceEventSchema } from "../app/schemas/trace";
import { formatTraceLine, levelOf } from "../app/trace/stdout";
import { masker } from "../app/trace/mask";
import { sha256 } from "../app/lib/hash";

const ROOT = path.resolve(import.meta.dirname, "..");
const LOGS = path.join(ROOT, "logs");
const EXAMPLES = path.join(ROOT, "input_examples");

/** Example id -> request path (relative to input_examples). The output folder is the same name without `.json`. */
export const CATALOG: Array<{ nn: string; name: string; input: string }> = readdirSync(EXAMPLES)
  .filter((n) => /^\d{2}[a-z]?-/.test(n) && n !== "README.md")
  .sort()
  .map((n) => ({ nn: n.slice(0, n.indexOf("-")), name: n.replace(/\.json$/, ""), input: n }));

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const say = (s: string): void => void process.stdout.write(`${s}\n`);
type Json = Record<string, unknown>;

async function api(base: string, method: string, p: string, body?: unknown): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${base}${p}`, {
    method,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  const parse = (): Json => {
    try {
      return JSON.parse(text) as Json;
    } catch {
      return { error: text.slice(0, 200) };
    }
  };
  return { status: res.status, json: parse() };
}

/** Start an async run and wait for the envelope. The API owns the run; this only reads it. */
async function liveRun(base: string, body: unknown): Promise<string> {
  const started = await api(base, "POST", "/run", { ...(body as object), options: { ...((body as { options?: object }).options ?? {}), async: true } });
  if (started.status !== 202) throw new Error(`POST /run answered ${started.status}: ${String(started.json.error ?? "no body")}`);
  const runId = String(started.json.run_id);
  const deadline = Date.now() + 15 * 60_000;
  for (;;) {
    const d = await api(base, "GET", `/runs/${runId}`);
    if (d.status === 200 && d.json.envelope) return runId;
    if (Date.now() > deadline) throw new Error(`${runId}: did not finish within 15 minutes`);
    await sleep(2000);
  }
}

async function envelopeOf(base: string, runId: string): Promise<RunEnvelope | RunErrorEnvelope> {
  const d = await api(base, "GET", `/runs/${runId}`);
  if (d.status !== 200) throw new Error(`GET /runs/${runId} answered ${d.status}`);
  const env = d.json.envelope;
  const parsed = RunEnvelope.or(RunErrorEnvelope).safeParse(env);
  if (!parsed.success) throw new Error(`${runId}: the run has no valid envelope yet (status ${String(d.json.status)})`);
  return parsed.data;
}

/** The terminal text a CLI user would have seen: the trace lines, then the summary block. */
function stdoutOf(runId: string, env: RunEnvelope | RunErrorEnvelope, ui: string): string {
  const f = path.join(LOGS, `trace-${runId}.jsonl`);
  const lines: string[] = [];
  if (existsSync(f)) {
    for (const l of readFileSync(f, "utf8").split("\n").filter(Boolean)) {
      try {
        const ev = TraceEventSchema.safeParse(JSON.parse(l));
        if (ev.success) lines.push(`[${levelOf(ev.data)}] ${formatTraceLine(ev.data)}`);
      } catch {
        /* a partial last line is not a trace event */
      }
    }
  }
  return [...lines, ...renderResult(env, ui)].join("\n");
}

/** Extra files saveExample does not copy: the Zetaris queries (masked) and the newest warm-up that precedes the run. */
function extras(runId: string, dir: string, startedAt: string | null): string[] {
  const written: string[] = [];
  const q = path.join(LOGS, `queries-${runId}.jsonl`);
  if (existsSync(q)) {
    const masked = readFileSync(q, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.stringify(masker.deep(JSON.parse(l)));
        } catch {
          return l;
        }
      });
    writeFileSync(path.join(dir, `queries-${runId}.jsonl`), `${masked.join("\n")}\n`);
    written.push(`queries-${runId}.jsonl`);
  }
  const stamp = (n: string) => n.replace(/^warmup-/, "").replace(/\.json$/, "");
  const cut = (startedAt ?? new Date().toISOString()).replace(/[-:]|\.\d+/g, "");
  const warm = readdirSync(LOGS)
    .filter((n) => /^warmup-\d{8}T\d{6}Z\.json$/.test(n) && stamp(n) <= cut)
    .sort()
    .pop();
  if (warm) {
    copyFileSync(path.join(LOGS, warm), path.join(dir, warm));
    written.push(warm);
  }
  return written;
}

function appendManifest(outRoot: string, dirName: string, files: string[], runId: string, mode: string): void {
  const mf = path.join(outRoot, "MANIFEST.json");
  const manifest = (existsSync(mf) ? JSON.parse(readFileSync(mf, "utf8")) : []) as Array<Json>;
  const base = manifest.find((m) => m.run_id === runId);
  for (const f of files) {
    const rel = `${dirName}/${f}`;
    const entry = { file: rel, sha256: sha256(readFileSync(path.join(outRoot, rel))), run_id: runId, mode, captured_at: base?.captured_at ?? new Date().toISOString(), git_sha: base?.git_sha ?? "uncommitted" };
    const i = manifest.findIndex((m) => m.file === rel);
    if (i >= 0) manifest[i] = entry;
    else manifest.push(entry);
  }
  writeFileSync(mf, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function recordOne(o: { base: string; ui: string; outRoot: string; ex: (typeof CATALOG)[number]; runId?: string }): Promise<{ dir: string; runId: string; files: string[] }> {
  const { body } = buildRunBody({ input: path.join(EXAMPLES, o.ex.input) }, { dirs: { examples: EXAMPLES } });
  const runId = o.runId ?? (await liveRun(o.base, body));
  const env = await envelopeOf(o.base, runId);
  const detail = (await api(o.base, "GET", `/runs/${runId}`)).json;
  const mode = detail.mode === "sample" ? "sample" : "live";
  const dir = path.join(o.outRoot, o.ex.name);
  mkdirSync(dir, { recursive: true });
  const written = saveExample({ dir, cfg: { dirs: { logs: LOGS } } as never, request: body, envelope: env, stdout: stdoutOf(runId, env, o.ui), mode });
  const more = extras(runId, dir, typeof detail.started_at === "string" ? detail.started_at : null);
  appendManifest(o.outRoot, o.ex.name, more, runId, mode);
  return { dir, runId, files: [...written, ...more] };
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { only: { type: "string" }, out: { type: "string" }, api: { type: "string" }, "from-run": { type: "string" }, plan: { type: "boolean" } },
  });
  const base = (values.api ?? process.env.PAYEE_API_URL ?? "http://localhost:8787").replace(/\/+$/, "");
  const ui = process.env.PAYEE_UI_URL ?? "http://localhost:3100";
  const outRoot = path.resolve(values.out ?? path.join(ROOT, "output_examples"));
  const from = new Map((values["from-run"] ?? "").split(",").filter(Boolean).map((p) => p.split("=") as [string, string]));
  const only = values.only ? new Set(values.only.split(",")) : from.size ? new Set(from.keys()) : null;
  const picks = CATALOG.filter((e) => !only || only.has(e.nn));
  if (values.plan) {
    for (const e of picks) say(`${e.nn}  ${e.name}  <- ${from.get(e.nn) ?? "new live run"}  -> ${path.relative(ROOT, path.join(outRoot, e.name))}`);
    return 0;
  }
  mkdirSync(outRoot, { recursive: true });
  if (outRoot === path.join(ROOT, "output_examples") && !from.size) {
    const ready = await api(base, "GET", "/readyz").catch(() => null);
    if (ready?.json.ready !== true || ready.json.mode !== "live") {
      process.stderr.write("record_examples: the API is not ready in live mode; nothing was recorded.\n");
      return 1;
    }
  }
  let failed = 0;
  for (const e of picks) {
    const t0 = Date.now();
    try {
      const r = await recordOne({ base, ui, outRoot, ex: e, ...(from.get(e.nn) ? { runId: from.get(e.nn)! } : {}) });
      say(`ok    ${e.name}  ${r.runId}  ${r.files.length} files  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    } catch (err) {
      failed++;
      say(`FAIL  ${e.name}  ${err instanceof Error ? err.message : "unknown"}`);
    }
  }
  if (existsSync(path.join(outRoot, "MANIFEST.json")) && statSync(path.join(outRoot, "MANIFEST.json")).size > 0) say(`MANIFEST.json: ${outRoot}/MANIFEST.json`);
  return failed ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
