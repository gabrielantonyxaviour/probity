// T20 (RUN DQ counts) and T21 (SHOW DQ INVALID RECORD) over the rebuilt payment_run_item, bank_change_request and registry tables.
// The rule expressions are the ones in app/templates/dq-rules.ts, evaluated in TypeScript with the same null handling (COALESCE to false).
import { z } from "zod";
import { DQ_RULES, type DqRule } from "../../templates/dq-rules";
import { AppError } from "../../schemas/errors";
import { abaValid, dateDiffDays, tsRaw } from "./sample-format";
import type { Row } from "./sample-store";
import type { Usl } from "./sample-tables";

const IDS = ["DQ1", "DQ2", "DQ3", "DQ4", "DQ5", "DQ6"] as const;
const ruleOf = (id: string): DqRule => DQ_RULES[IDS.indexOf(id as (typeof IDS)[number])] ?? (() => { throw new AppError("zetaris_bad_request", "Unknown data quality rule."); })();
const RULE = z.object({ rule: z.string().regex(/^DQ[1-6]$/), payment_run_id: z.string().optional() });

const TRUSTED = new Set(["edgar_registrant", "vendor_master_pre_window"]);
const checks: Record<string, (r: Row) => boolean> = {
  DQ1: (r) => !r.bank_changed_at || dateDiffDays(String(r.scheduled_date), String(r.bank_changed_at)) >= 30 || (!!r.callback_confirmed_at && TRUSTED.has(String(r.callback_phone_source))),
  DQ2: (r) => Number(r.account_vendor_count) <= 1,
  DQ3: (r) => abaValid(r.new_routing),
  DQ4: (r) => r.address_line1 != null && r.address_line1 !== "",
  DQ5: (r) => r.ein != null && r.ein !== "" && r.ein !== "000000000",
  DQ6: (r) => r.state_of_inc != null && r.state_of_inc !== "",
};
const tableOf = (rule: DqRule, u: Usl): Row[] =>
  rule.table.endsWith("payment_run_item") ? u.payment_run_item : rule.table.endsWith("bank_change_request") ? u.bank_change_request : rule.table.endsWith("registry_entity") ? u.registry_entity : u.sec_registrant;

export function t20(p: Record<string, unknown>, u: Usl): Row[] {
  const { rule: id } = RULE.parse(p);
  const rule = ruleOf(id);
  const rows = tableOf(rule, u);
  const valid = rows.filter(checks[id]!).length;
  return [{ name: rule.name, table: rule.table.split(".").pop(), type: "Custom Data Quality", total_record: String(rows.length), valid_record: String(valid), invalid_record: String(rows.length - valid) }];
}

export function t21(p: Record<string, unknown>, u: Usl): Row[] {
  const { rule: id } = RULE.parse(p);
  const rule = ruleOf(id);
  // The declared T21 columns are the payment_run_item activation order; the other rules answer in their own table's shape and have no sample.
  if (!rule.table.endsWith("payment_run_item")) throw new AppError("sample_data_missing", `No offline sample for ${id} invalid records.`);
  return u.payment_run_item
    .filter((r) => !checks[id]!(r))
    .sort((a, b) => String(a.item_id).localeCompare(String(b.item_id)))
    .slice(0, 500)
    .map((r) => ({ ...r, bank_changed_at: tsRaw(r.bank_changed_at), callback_confirmed_at: tsRaw(r.callback_confirmed_at) }));
}
