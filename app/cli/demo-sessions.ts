// `npm run demo:sessions` (05 §3.7, REV-52): three separate OS processes, each with its own session id, sharing one World Model
// directory. (a) S1 then a real fraud_confirmed outcome; (b) 06b, which must hit R5 on the artifacts session (a) flagged;
// (c) 06d-account-reuse, R5 on the account. With ENABLE_HMEM=true the E2 variant adds the note step and runs 06c instead.
// Every command is the real CLI; the table is read back from logs/run-*.json written by those processes.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "../config/env";
import { utcCompact } from "../lib/clock";
import { RunRecordSchema } from "../runtime/run-record";
import { readdirSync } from "node:fs";

const MAIN = path.resolve(import.meta.dirname, "main.ts");
const BY = "Tomás Okafor (fictional)";
type Session = { session_id: string | null; pid: number; run_ids: string[]; decision: string | null; codes: string[]; memory_recalled: unknown[] };

function runCli(args: string[], env: NodeJS.ProcessEnv): { code: number; pid: number } {
  const r = spawnSync(process.execPath, ["--import", "tsx", MAIN, ...args], { env, stdio: "inherit" });
  return { code: r.status ?? 1, pid: r.pid };
}

function runsSince(logs: string, sinceMs: number) {
  return readdirSync(logs)
    .filter((f) => /^run-.+\.json$/.test(f))
    .map((f) => RunRecordSchema.safeParse(JSON.parse(readFileSync(path.join(logs, f), "utf8"))))
    .flatMap((p) => (p.success && Date.parse(p.data.started_at) >= sinceMs ? [p.data] : []))
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
}

export async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({ args: argv, options: { fresh: { type: "boolean" }, sample: { type: "boolean" } } });
  const cfg = loadConfig(values.sample ? { ...process.env, SAMPLE_MODE: "true" } : process.env);
  const fresh = !!values.fresh || !!values.sample; // --sample implies --fresh
  const stamp = utcCompact(new Date());
  const env: NodeJS.ProcessEnv = { ...process.env, ...(values.sample ? { SAMPLE_MODE: "true" } : {}) };
  if (fresh) {
    const base = path.resolve(".demo", stamp);
    mkdirSync(path.join(base, "world"), { recursive: true });
    mkdirSync(path.join(base, "hmem"), { recursive: true });
    env.WORLD_DIR = path.join(base, "world");
    env.HMEM_DIR = path.join(base, "hmem");
  }
  const hmem = cfg.ENABLE_HMEM;
  const ex = (id: string) => path.join(cfg.dirs.examples, id);
  const plan: Array<{ label: string; steps: string[][]; demoEnv: boolean }> = [
    { label: "a", demoEnv: false, steps: [["run", "--local", "--input", path.join(ex("01-booz-allen-remit-change"), "request.json")], ["outcome", "--local", "--request", "BCR-2026-0412", "--outcome", "fraud_confirmed", "--by", BY]] },
    hmem
      ? { label: "b", demoEnv: true, steps: [["run", "--local", "--input", path.join(ex("06b-caci-lookalike"), "request.json")], ["note", "--local", "--vendor", "V-10112", "--by", BY, "--text", "CACI remits from Chantilly (UEI N3PBJAVNKF61). EDGAR's Reston address is the parent HQ. The address difference is expected."]] }
      : { label: "b", demoEnv: true, steps: [["run", "--local", "--input", path.join(ex("06b-caci-lookalike"), "request.json")]] },
    { label: "c", demoEnv: true, steps: [["run", "--local", "--input", hmem ? path.join(ex("06c-caci-clean"), "request.json") : path.join(cfg.dirs.examples, "06d-account-reuse.json")]] },
  ];

  const sessions: Session[] = [];
  let failed = false;
  for (const p of plan) {
    process.stdout.write(`\n=== session ${p.label}: a new process, a new session id ===\n`);
    const started = Date.now() - 1000;
    const penv = { ...env, ...(p.demoEnv ? { PAYEE_DEMO_SESSIONS: "1" } : {}) };
    let pid = 0;
    for (const step of p.steps) {
      if (step[0] === "note" && !hmem) {
        process.stdout.write("H-MEM not enabled\n");
        continue;
      }
      const r = runCli(step, penv);
      pid = r.pid;
      if (r.code !== 0 && r.code !== 3) {
        failed = true;
        process.stdout.write(`step "${step[0]}" exited ${r.code}; the later steps of session ${p.label} depend on it and are skipped\n`);
        break;
      }
    }
    const runs = runsSince(cfg.dirs.logs, started);
    const last = runs.at(-1);
    sessions.push({
      session_id: last?.session_id ?? null,
      pid,
      run_ids: runs.map((r) => r.run_id),
      decision: last?.decision ?? null,
      codes: last?.live.decision?.reason_codes.map((c) => c.code) ?? [],
      memory_recalled: last?.live.decision?.memory_recalled ?? [],
    });
  }
  process.stdout.write("\nsession  pid     decision          codes\n");
  for (const [i, s] of sessions.entries()) process.stdout.write(`${plan[i]!.label.padEnd(8)} ${String(s.pid).padEnd(7)} ${String(s.decision).padEnd(17)} ${s.codes.join(",")}\n`);
  mkdirSync(cfg.dirs.logs, { recursive: true });
  const file = path.join(cfg.dirs.logs, `demo-sessions-${stamp}.json`);
  writeFileSync(file, JSON.stringify({ sessions }, null, 2));
  process.stdout.write(`\nwrote ${path.relative(process.cwd(), file)}\n`);
  return failed ? 1 : 0;
}

if (/demo-sessions\.ts$/.test(process.argv[1] ?? "")) process.exit(await main(process.argv.slice(2)));
