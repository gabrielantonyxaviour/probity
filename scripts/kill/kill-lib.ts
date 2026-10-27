// Shared bits of the kill tests: run a command with a timeout, call Zetaris through the independent curl helper, write a result file.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "../..");
const RESULTS = path.join(ROOT, "scripts/kill/results");

export type Verdict = { id: string; title: string; pass: boolean | null; evidence: string; elapsed_ms: number; at: string };
export type Check = { id: string; title: string; run: () => Promise<{ pass: boolean | null; evidence: string }> };

export function sh(cmd: string, args: string[], o: { timeoutMs?: number; input?: string; env?: NodeJS.ProcessEnv } = {}): { code: number | null; out: string; err: string; ms: number } {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", timeout: o.timeoutMs ?? 120_000, maxBuffer: 32 * 1024 * 1024, input: o.input, env: { ...process.env, ...o.env } });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "", ms: Date.now() - t0 };
}

export type Z = { ok: boolean; http: number; ms: number; rows: unknown[][]; columns: string[] | null; raw: string };
/** One statement through scripts/kill/zsql.sh. Rows come back positional; `ok` means HTTP 200. */
export function zsql(stmt: string, role: "query" | "admin" = "query", timeoutS = 90): Z {
  const r = sh("bash", ["scripts/kill/zsql.sh", stmt, role], { timeoutMs: (timeoutS + 10) * 1000, env: { ZSQL_TIMEOUT: String(timeoutS) } });
  try {
    const j = JSON.parse(r.out.trim().split("\n").pop() ?? "{}") as { http: number; ms: number; body: { data?: unknown[][]; headers?: string[] } | string };
    const b = typeof j.body === "object" && j.body ? j.body : {};
    return { ok: j.http === 200, http: j.http, ms: j.ms, rows: Array.isArray(b.data) ? b.data : [], columns: b.headers ?? null, raw: typeof j.body === "string" ? j.body : JSON.stringify(j.body) };
  } catch {
    return { ok: false, http: 0, ms: r.ms, rows: [], columns: null, raw: r.err.slice(0, 200) };
  }
}

export function record(c: Check, v: { pass: boolean | null; evidence: string }, elapsed_ms: number): Verdict {
  const verdict: Verdict = { id: c.id, title: c.title, pass: v.pass, evidence: v.evidence.slice(0, 600), elapsed_ms, at: new Date().toISOString() };
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(path.join(RESULTS, `${c.id}.json`), `${JSON.stringify(verdict, null, 2)}\n`);
  return verdict;
}
