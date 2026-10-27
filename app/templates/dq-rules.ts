// DQ expressions (03 §6). Same text for REGISTER DQ and the select_fallback forms.

export const USL = "lightning.metastore.probity.vendor360";

export type DqRule = {
  name: string;
  table: string;
  expr: string;
  needsRegistry: boolean;
};

export const DQ1_EXPR =
  "bank_changed_at IS NULL OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) >= 30 OR (callback_confirmed_at IS NOT NULL AND callback_phone_source IN ('edgar_registrant', 'vendor_master_pre_window'))";

export const DQ2_EXPR = "account_vendor_count <= 1";

export const DQ3_EXPR =
  "new_routing IS NULL OR (new_routing RLIKE '^[0-9]{9}$' AND pmod(3 * ((ascii(substr(new_routing, 1, 1)) - 48) + (ascii(substr(new_routing, 4, 1)) - 48) + (ascii(substr(new_routing, 7, 1)) - 48)) + 7 * ((ascii(substr(new_routing, 2, 1)) - 48) + (ascii(substr(new_routing, 5, 1)) - 48) + (ascii(substr(new_routing, 8, 1)) - 48)) + ((ascii(substr(new_routing, 3, 1)) - 48) + (ascii(substr(new_routing, 6, 1)) - 48) + (ascii(substr(new_routing, 9, 1)) - 48)), 10) = 0)";

export const DQ_RULES: readonly DqRule[] = [
  { name: "unverified_recent_bank_change", table: `${USL}.payment_run_item`, expr: DQ1_EXPR, needsRegistry: false },
  { name: "account_single_vendor", table: `${USL}.payment_run_item`, expr: DQ2_EXPR, needsRegistry: false },
  { name: "request_routing_valid", table: `${USL}.bank_change_request`, expr: DQ3_EXPR, needsRegistry: false },
  {
    name: "registry_has_address",
    table: `${USL}.registry_entity`,
    expr: "address_line1 IS NOT NULL AND address_line1 <> ''",
    needsRegistry: true,
  },
  {
    name: "sec_ein_present",
    table: `${USL}.sec_registrant`,
    expr: "ein IS NOT NULL AND ein <> '000000000'",
    needsRegistry: true,
  },
  {
    name: "sec_state_of_inc_present",
    table: `${USL}.sec_registrant`,
    expr: "state_of_inc IS NOT NULL AND state_of_inc <> ''",
    needsRegistry: true,
  },
];

export function registerDqSql(rule: DqRule): string {
  return `REGISTER DQ ${rule.name} TABLE ${rule.table} AS\n${rule.expr}`;
}

export function dqRulesSqlFile(): string {
  return DQ_RULES.map(registerDqSql).join("\n\n-- @@\n\n") + "\n";
}
