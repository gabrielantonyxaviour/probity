// Live count checks after P4 and P6. Numbers come from Zetaris, not from memory.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { runZetaris, ZetarisError } from "../../app/adapters/zetaris/index.ts";

async function countOf(sql: string): Promise<number> {
  const result = await runZetaris(sql, { key: "query", kind: "sql", limit: 5, queryId: randomUUID() });
  return Number(result.rows[0]?.[0] ?? 0);
}

function childExpected(): number {
  try {
    const parsed = JSON.parse(readFileSync("zetaris/results/rest_counts.json", "utf8")) as { counts?: Record<string, number> };
    return Object.entries(parsed.counts ?? {})
      .filter(([name]) => name.includes(".usa_c_"))
      .reduce((sum, [, n]) => sum + Number(n), 0);
  } catch {
    return 543;
  }
}

function verdict(id: string, pass: boolean, evidence: string, branch: string): void {
  mkdirSync("zetaris/results", { recursive: true });
  let rows: { id: string; pass: boolean | null; evidence: string; branch: string; at: string }[] = [];
  try {
    rows = JSON.parse(readFileSync("zetaris/results/kill_verdicts.json", "utf8")) as typeof rows;
  } catch {
    rows = [];
  }
  const next = rows.filter((row) => row.id !== id);
  next.push({ id, pass, evidence, branch, at: new Date().toISOString() });
  writeFileSync("zetaris/results/kill_verdicts.json", `${JSON.stringify(next, null, 2)}\n`);
}

export async function verifyPhase(phase: string): Promise<void> {
  if (phase === "P4") await verifyViews();
  if (phase === "P6") await verifyUsl();
}

async function verifyViews(): Promise<void> {
  const entity = await countOf("SELECT COUNT(*) AS n FROM probity.usa_entity_v LIMIT 1");
  const child = await countOf("SELECT COUNT(*) AS n FROM probity.usa_child_v LIMIT 1");
  const sec = await countOf("SELECT COUNT(*) AS n FROM probity.sec_registrant_v LIMIT 1");
  const former = await countOf("SELECT COUNT(*) AS n FROM probity.sec_former_v LIMIT 1");
  const expectedChild = childExpected();
  const gateSql = "SELECT concat(uei, '-', recipient_level) AS entity_key FROM probity.usa_entity_v LIMIT 20";
  await runZetaris(gateSql, { key: "query", kind: "sql", limit: 20, queryId: randomUUID() });
  const second = await runZetaris(gateSql, { key: "query", kind: "sql", limit: 20, queryId: randomUUID() });
  const gate = second.latencyMs <= 3000;
  verdict(
    "K1f",
    gate,
    `second_usa_entity_v_ms=${second.latencyMs}; usa_entity_v has no entity_key column, timed concat(uei, recipient_level)`,
    gate ? "cache_mode=sql" : "cache_gate_slow",
  );
  process.stdout.write(
    `P4 counts entity=${entity} child=${child} expected_child=${expectedChild} sec=${sec} former=${former} gate_ms=${second.latencyMs}\n`,
  );
  if (entity !== 12 || sec !== 6 || former < 6 || child !== expectedChild) {
    throw new ZetarisError("zetaris_sql_error", `view counts entity=${entity} child=${child}/${expectedChild} sec=${sec} former=${former}`);
  }
}

async function verifyUsl(): Promise<void> {
  const tables: [string, number][] = [
    ["registry_entity", 12],
    ["registry_child", childExpected()],
    ["sec_registrant", 6],
    ["vendor", 40],
    ["payment_run_item", 153],
    ["bank_change_request", 10],
  ];
  const got: Record<string, number> = {};
  for (const [name, expected] of tables) {
    const n = await countOf(`SELECT COUNT(*) AS n FROM lightning.metastore.probity.vendor360.${name} LIMIT 1`);
    got[name] = n;
    process.stdout.write(`P6 ${name} ${n} expected ${expected}\n`);
    // ERP tables take live writes (intake, call-backs), so seed counts are floors there.
    const mutable = name === "bank_change_request" || name === "payment_run_item" || name === "vendor";
    if (mutable ? n < expected : n !== expected) throw new ZetarisError("zetaris_sql_error", `${name} count ${n} != ${expected}`);
  }
  mkdirSync("zetaris/results", { recursive: true });
  writeFileSync("zetaris/results/usl_counts.json", `${JSON.stringify({ at: new Date().toISOString(), counts: got }, null, 2)}\n`);
}
