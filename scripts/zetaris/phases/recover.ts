// Inline activation when a SchemaStore view cannot be activated, and USL compile skip (03 §4.3, §5.3).
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { runZetaris, ZetarisError } from "../../../app/adapters/zetaris/index.ts";
import { loadZetarisConfig } from "../../../app/adapters/zetaris/config.ts";
import { viewJobs } from "../sql/views.ts";
import { ddlSha16 } from "../sql/usl.ts";
import type { Job } from "../sql/types.ts";

const INLINE = "zetaris/register/.generated/61_inline.sql";

export function publishAdmin(sql: string): void {
  mkdirSync("zetaris/register/.generated", { recursive: true });
  const text = sql.trim();
  if (!existsSync(INLINE)) writeFileSync(INLINE, `${text}\n`);
  else appendFileSync(INLINE, `\n\n-- @@\n\n${text}\n`);
}

export function inlineSql(sql: string): string | null {
  const bodies = new Map<string, string>();
  for (const job of viewJobs(loadZetarisConfig())) {
    const matched = job.sql.match(/SCHEMASTORE VIEW (\w+) WITH CONTAINER probity AS\n([\s\S]*)$/);
    if (matched) bodies.set(matched[1]!, matched[2]!);
  }
  let next = sql;
  let changed = false;
  for (const [name, body] of bodies) {
    const needle = `FROM probity.${name}`;
    if (!next.includes(needle)) continue;
    next = next.replaceAll(needle, `FROM (\n${body}\n) ${name}`);
    changed = true;
  }
  return changed ? next : null;
}

export function asInline(job: Job): Job | null {
  const sql = inlineSql(job.sql);
  if (!sql) return null;
  publishAdmin(sql);
  return { ...job, label: `${job.label}-inline`, sql };
}

/** Skip compile when LOAD USL succeeds and the state file sha matches. */
export async function maybeSkipCompile(rebuild: boolean): Promise<"skip" | "compile"> {
  try {
    await runZetaris("LOAD USL vendor360 NAMESPACE lightning.metastore.probity", {
      key: "query",
      kind: "sql",
      limit: 200,
      queryId: randomUUID(),
    });
  } catch {
    return "compile";
  }
  let stateSha;
  try {
    const parsed = JSON.parse(readFileSync("zetaris/.state/registration.json", "utf8")) as { ddl_sha?: string };
    stateSha = parsed.ddl_sha ?? "";
  } catch {
    stateSha = "";
  }
  const sha = ddlSha16();
  if (!rebuild && stateSha === sha && stateSha !== "") return "skip";
  if (!rebuild) {
    const why = stateSha ? "USL changed: rerun with --rebuild-usl" : "USL exists; rerun with --rebuild-usl";
    throw new ZetarisError("zetaris_bad_request", why, undefined, false);
  }
  const remove = "REMOVE USL vendor360 NAMESPACE lightning.metastore.probity";
  publishAdmin(remove);
  await runZetaris(remove, { key: "admin", kind: "ddl", limit: 50, queryId: randomUUID() });
  return "compile";
}
