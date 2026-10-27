// DQ7, DQ8 and DQ9 after the DQ1/DQ2 sweep. A failed rule is a limitation, never a silent skip.
import type { GateDecision } from "../schemas/decision";
import type { CompiledQuery } from "../schemas/ports";
import { selectFallback } from "../templates/dq";
import { emit, type RunContext } from "../orchestration/ctx";
import { addLimitation, addPartial } from "../orchestration/state";
import { rowsOf, type Row } from "../policy/rows";
import {
  findingsFor,
  findingsForPayee,
  findingsForSharedAccount,
  itemsInRun,
  parseDqCounts,
  parseSharedCounts,
  type Finding,
} from "../policy/sweep";
import type { Step } from "./evidence-runner";

type RuleRun = GateDecision["sweep"]["rules_run"][number];
const RUN_ID = /^PR-\d{4}-\d{2}-\d{2}$/;
const VENDOR_ID = /^V-\d{5}$/;

function miss(s: RunContext["s"], rule: string, why: string): void {
  addPartial(s, `sweep_${rule}`);
  addLimitation(s, `Payment-run sweep unavailable: ${rule} ${why}`);
}

function step(template_id: Step["params"]["template_id"], extra: Record<string, unknown> = {}): Step {
  return {
    params: { template_id, ...extra } as Step["params"],
    purpose_field: null,
    candidate_vendor_id: null,
    issued_by: "sweep_runner",
    planned_by: "code",
    trace_agent: "sweep_runner",
  };
}

function read(template_id: "T20" | "T21", sql: string, columns: string[], limit: number): Step {
  const compiled = {
    template_id,
    params: { rule: "DQ8" },
    sql,
    columns,
    source: "dq",
    backing: "zetaris_table",
    limit,
  } as unknown as CompiledQuery;
  return { ...step(template_id, { rule: "DQ8" }), read: { compiled, rules: [], template_id } };
}

/** T09 is filtered by payment_run_id in SQL. vendor_id is only the template parameter. */
async function paymentItems(ctx: RunContext, paymentRunId: string): Promise<Row[]> {
  const { s } = ctx;
  const have = Object.values(s.extras.exposure_rows).flat();
  const cached = itemsInRun(have.length ? have : rowsOf(s, "T09"), paymentRunId);
  if (cached.length) return cached;
  const vendor = s.candidates.find((c) => VENDOR_ID.test(c.vendor_id))?.vendor_id;
  if (!vendor || !RUN_ID.test(paymentRunId)) return [];
  const res = await ctx.C2.run({
    ...step("T09", { vendor_id: vendor, payment_run_id: paymentRunId }),
    candidate_vendor_id: vendor,
  });
  return res.ok ? itemsInRun(res.record.rows, paymentRunId) : [];
}

export async function runExtraSweep(
  ctx: RunContext,
  underReview: string[],
  findings: Finding[],
  rules_run: RuleRun[],
  queryIds: string[],
): Promise<void> {
  const { s } = ctx;
  const pr = s.payment_run_id;
  const items = await paymentItems(ctx, pr);
  await sharedAccount(ctx, pr, underReview, items, findings, rules_run, queryIds);
  await bankWindow(ctx, pr, underReview, findings, rules_run, queryIds);
  await payeeName(ctx, pr, underReview, items, findings, rules_run, queryIds);
}

/** The vendor ids behind each shared account hash (contract: "Show account_hash and vendor_ids"), so the rule names them. */
function sharedGroups(rows: Row[]): { account_hash: string; vendor_ids: string[] }[] {
  const out: { account_hash: string; vendor_ids: string[] }[] = [];
  for (const r of rows) {
    const hash = typeof r.account_hash === "string" ? r.account_hash : null;
    const ids = String(r.vendor_ids ?? "").split(",").map((v) => v.trim()).filter((v) => VENDOR_ID.test(v));
    if (hash && ids.length > 1) out.push({ account_hash: hash, vendor_ids: ids });
  }
  return out.slice(0, 10);
}

async function sharedAccount(
  ctx: RunContext,
  pr: string,
  underReview: string[],
  items: Row[],
  findings: Finding[],
  rules_run: RuleRun[],
  queryIds: string[],
): Promise<void> {
  const { s } = ctx;
  const counts = await ctx.C2.run(step("DQ7c"));
  const groups = await ctx.C2.run(step("DQ7"));
  if (!counts.ok || !groups.ok) return miss(s, "DQ7", "could not be run.");
  const parsed = parseSharedCounts(counts.record.rows);
  if (!parsed) return miss(s, "DQ7", "returned an unreadable count.");
  const mine = findingsForSharedAccount({ groups: groups.record.rows, items, exclude_vendors: underReview, query_id: groups.record.query_id });
  findings.push(...mine);
  queryIds.push(groups.record.query_id);
  rules_run.push({ rule: "DQ7", ...parsed, query_id: counts.record.query_id, groups: sharedGroups(groups.record.rows) });
  emit(ctx, {
    agent_name: "sweep_runner", action: "dq_run", status: "success", rule: "DQ7", template_id: "DQ7",
    zetaris_query_ids: [counts.record.query_id, groups.record.query_id], rows: mine.length,
    input_summary: `DQ7 shared bank account, findings attached to ${pr}`,
    output_summary: `DQ7 total=${parsed.total} valid=${parsed.valid} invalid=${parsed.invalid}; in ${pr}: ${mine.length}`,
  });
}

async function bankWindow(
  ctx: RunContext,
  pr: string,
  underReview: string[],
  findings: Finding[],
  rules_run: RuleRun[],
  queryIds: string[],
): Promise<void> {
  const { s } = ctx;
  let counts = await ctx.C2.run(step("T20", { rule: "DQ8" }));
  let rows = await ctx.C2.run(step("T21", { rule: "DQ8", payment_run_id: pr }));
  if (!counts.ok) counts = await ctx.C2.run(read("T20", selectFallback("T20", "DQ8"), ["total", "valid"], 1));
  if (!rows.ok) rows = await ctx.C2.run(read("T21", selectFallback("T21", "DQ8"), [], 500));
  if (!counts.ok || !rows.ok) return miss(s, "DQ8", "could not be run.");
  const parsed = parseDqCounts(counts.record.rows);
  if (!parsed) return miss(s, "DQ8", "returned an unreadable count.");
  const mine = findingsFor({ rule: "DQ8", rows: rows.record.rows, payment_run_id: pr, exclude_vendors: underReview, received_at: s.received_at, query_id: rows.record.query_id });
  findings.push(...mine);
  queryIds.push(rows.record.query_id);
  rules_run.push({ rule: "DQ8", ...parsed, query_id: counts.record.query_id });
  emit(ctx, {
    agent_name: "sweep_runner", action: "dq_run", status: "success", rule: "DQ8", template_id: "T20",
    zetaris_query_ids: [counts.record.query_id, rows.record.query_id], rows: mine.length,
    input_summary: `DQ8 bank change before a large payment, filtered to ${pr}`,
    output_summary: `DQ8 total=${parsed.total} valid=${parsed.valid} invalid=${parsed.invalid}; in ${pr}: ${mine.length}`,
  });
}

async function payeeName(
  ctx: RunContext,
  pr: string,
  underReview: string[],
  items: Row[],
  findings: Finding[],
  rules_run: RuleRun[],
  queryIds: string[],
): Promise<void> {
  const { s } = ctx;
  const counts = await ctx.C2.run(step("DQ9c"));
  const detail = await ctx.C2.run(step("DQ9"));
  if (!counts.ok || !detail.ok) return miss(s, "DQ9", "could not be run.");
  const parsed = parseDqCounts(counts.record.rows);
  if (!parsed) return miss(s, "DQ9", "returned an unreadable count.");
  if (!items.length && detail.record.rows.length) miss(s, "DQ9", "findings were not attached because this payment run's items were not available.");
  const mine = findingsForPayee({ rows: detail.record.rows, items, exclude_vendors: underReview, query_id: detail.record.query_id });
  findings.push(...mine);
  queryIds.push(detail.record.query_id);
  rules_run.push({ rule: "DQ9", ...parsed, query_id: counts.record.query_id });
  emit(ctx, {
    agent_name: "sweep_runner", action: "dq_run", status: "success", rule: "DQ9", template_id: "DQ9",
    zetaris_query_ids: [counts.record.query_id, detail.record.query_id], rows: mine.length,
    input_summary: `DQ9 payee name mismatch, attached to items in ${pr}`,
    output_summary: `DQ9 total=${parsed.total} valid=${parsed.valid} invalid=${parsed.invalid}; in ${pr}: ${mine.length}`,
  });
}
