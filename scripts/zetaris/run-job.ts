import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runZetaris, ZetarisError, maskSecrets } from "../../app/adapters/zetaris/index.ts";
import type { Job } from "./sql/types.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runJob(job: Job): Promise<{ status: "ok" | "exists"; rows: unknown[][]; columns: string[] | null; latencyMs: number; queryId: string }> {
  if (job.sql.includes("<SEC_USER_AGENT>") || job.sql.includes("<ERP_ZETARIS_READER_PASSWORD>")) {
    throw new ZetarisError("zetaris_bad_request", `refusing to send a placeholder in ${job.label}`, undefined, false);
  }
  if (job.gapBeforeMs) await sleep(job.gapBeforeMs);
  return attempt(job, false);
}

async function attempt(job: Job, retried: boolean): Promise<{ status: "ok" | "exists"; rows: unknown[][]; columns: string[] | null; latencyMs: number; queryId: string }> {
  const queryId = randomUUID();
  try {
    const result = await runZetaris(job.sql, { key: job.key, kind: job.kind, limit: job.limit, queryId });
    process.stdout.write(`${job.phase} ${job.label} ok ${result.latencyMs}ms ${queryId}\n`);
    return { status: "ok", rows: result.rows, columns: result.columns, latencyMs: result.latencyMs, queryId };
  } catch (err) {
    const typed = err instanceof ZetarisError ? err : new ZetarisError("zetaris_sql_error", "query failed");
    if (typed.code === "zetaris_already_exists") {
      process.stdout.write(`${job.phase} ${job.label} exists\n`);
      return { status: "exists", rows: [], columns: null, latencyMs: 0, queryId };
    }
    const retry = !retried && typed.retryable;
    if (retry) {
      const wait = /429/.test(typed.message) ? 60_000 : 5_000;
      process.stdout.write(`${job.phase} ${job.label} retry ${typed.code} after ${wait}ms\n`);
      await sleep(wait);
      return attempt(job, true);
    }
    throw typed;
  }
}

export function fail(phase: string, job: Job | undefined, err: unknown, hint: string): never {
  const typed = err instanceof ZetarisError ? err : new ZetarisError("zetaris_sql_error", "phase failed");
  const line = {
    phase,
    label: job?.label ?? null,
    code: typed.code,
    message: typed.message,
    statement: job ? maskSecrets(job.sql).slice(0, 500) : null,
    hint,
  };
  mkdirSync("zetaris/results", { recursive: true });
  appendFileSync(join("zetaris/results", "register-failures.jsonl"), `${JSON.stringify(line)}\n`);
  process.stderr.write(`${JSON.stringify(line)}\n`);
  process.exit(2);
}
