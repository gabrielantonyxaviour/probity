// Sweep templates T20 and T21 (03 §6.1).
import { z } from "zod";
import { DQ_RULES, type DqRule } from "./dq-rules.ts";
import type { Template } from "./types.ts";

const RULE_ID: Record<string, DqRule> = {
  DQ1: DQ_RULES[0]!,
  DQ2: DQ_RULES[1]!,
  DQ3: DQ_RULES[2]!,
  DQ4: DQ_RULES[3]!,
  DQ5: DQ_RULES[4]!,
  DQ6: DQ_RULES[5]!,
};

const PRI_COLUMNS = ["item_id", "payment_run_id", "scheduled_date", "cutoff_local", "vendor_id", "vendor_name", "invoice_no", "bank_account_id", "amount_usd", "account_hash", "account_last4", "bank_changed_at", "callback_confirmed_at", "callback_phone_source", "account_vendor_count", "data_origin"];

function ruleOf(id: string): DqRule {
  const rule = RULE_ID[id];
  if (!rule) throw new Error(`unknown DQ rule ${id}`);
  return rule;
}

export const t20: Template<{ rule: string }> = {
  id: "T20",
  tier: "sweep",
  key: "query",
  usl: true,
  params: z.object({ rule: z.string() }).strict(),
  // RUN DQ answers with this exact header (zetaris/results/run_dq_*.json, live 2026-10-27).
  columns: ["name", "table", "type", "total_record", "valid_record", "invalid_record"],
  maxRows: 20,
  llm_columns: ["name", "total_record", "valid_record", "invalid_record"],
  expectRows: true,
  observations: [],
  sql: (p) => {
    const rule = ruleOf(p.rule);
    return `RUN DQ ${rule.name} TABLE ${rule.table}`;
  },
  sample: (_p, store) => (store.T20 ?? []).slice(0, 5),
};

export const t21: Template<{ rule: string; payment_run_id?: string }> = {
  id: "T21",
  tier: "sweep",
  key: "query",
  usl: true,
  params: z.object({ rule: z.string(), payment_run_id: z.string().optional() }).strict(),
  columns: PRI_COLUMNS,
  maxRows: 500,
  llm_columns: ["item_id", "payment_run_id", "vendor_id", "amount_usd"],
  expectRows: false,
  observations: [],
  sql: (p) => {
    const rule = ruleOf(p.rule);
    return `SHOW DQ INVALID RECORD ${rule.name} TABLE ${rule.table}`;
  },
  sample: (_p, store) => (store.T21 ?? []).slice(0, 20),
};

/** select_fallback forms when RUN DQ / SHOW DQ shape is wrong (03 §6.1). */
export function selectFallback(kind: "T20" | "T21", ruleId: string): string {
  const rule = ruleOf(ruleId);
  if (kind === "T20") {
    return `SELECT COUNT(*) AS total, SUM(CASE WHEN COALESCE((${rule.expr}), false) THEN 1 ELSE 0 END) AS valid FROM ${rule.table} LIMIT 1`;
  }
  return `SELECT ${PRI_COLUMNS.join(", ")} FROM ${rule.table} WHERE NOT COALESCE((${rule.expr}), false) LIMIT 500`;
}
