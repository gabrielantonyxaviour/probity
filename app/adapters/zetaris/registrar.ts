// T12–T14 session registration (03 §7.3, §7.5). Query key probes; admin key creates.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { sessionName, t12, t13, t14 } from "../../templates/ddl.ts";
import { runZetaris, ZetarisError } from "./index.ts";

const STATE = "zetaris/.state/session_tables.json";

type Via = "direct" | "passthrough" | "mirror";

export type RegisterInput =
  | { kind: "recipient"; uei: string; level: "P" | "C" | "R"; via: Via }
  | { kind: "children"; parent_uei: string; via: Via }
  | { kind: "edgar"; cik10: string; via: Via };

function names(): string[] {
  try {
    const parsed = JSON.parse(readFileSync(STATE, "utf8")) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function remember(table: string): void {
  const current = names();
  if (!current.includes(table)) current.push(table);
  mkdirSync("zetaris/.state", { recursive: true });
  writeFileSync(STATE, `${JSON.stringify(current, null, 2)}\n`);
}

function statement(input: RegisterInput): { sql: string; table: string } {
  if (input.kind === "recipient") {
    return { sql: t12.sql(input), table: sessionName("usa_r", input.uei, input.via) };
  }
  if (input.kind === "children") {
    return { sql: t13.sql(input), table: sessionName("usa_c", input.parent_uei, input.via) };
  }
  return { sql: t14.sql(input), table: sessionName("sec_s", input.cik10, input.via) };
}

async function probe(table: string): Promise<boolean> {
  try {
    await runZetaris(`SELECT 1 AS present FROM session.${table} LIMIT 1`, {
      key: "query",
      kind: "sql",
      limit: 1,
      queryId: randomUUID(),
    });
    return true;
  } catch (err) {
    if (err instanceof ZetarisError && (err.code === "zetaris_session_missing" || err.code === "zetaris_sql_error" || err.code === "zetaris_bad_request")) {
      return false;
    }
    throw err;
  }
}

export async function registerSession(input: RegisterInput): Promise<{ table: string; reused: boolean; note?: string }> {
  const { sql, table } = statement(input);
  const known = names().includes(table);
  if (await probe(table)) {
    if (!known) remember(table);
    return { table, reused: true };
  }
  await runZetaris(sql, { key: "admin", kind: "ddl", limit: 10, queryId: randomUUID() });
  remember(table);
  return known ? { table, reused: false, note: "recreated_after_restart" } : { table, reused: false };
}
