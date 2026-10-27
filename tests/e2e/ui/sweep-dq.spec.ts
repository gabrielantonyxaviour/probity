import { test, expect, type APIRequestContext } from "@playwright/test";
import { getJson } from "../helpers/api";
import { latestS1Hold, listRuns, runRecord, type RunSummary } from "../helpers/runs";

const WANTED = ["DQ7", "DQ8", "DQ9"] as const;
const SHARED = ["V-10233", "V-10234"];

type Rule = { rule: string; total: number; valid: number; invalid: number; query_id: string };
type Finding = { rule: string; vendor_id: string };

type Hit = { runId: string; rules: Rule[]; findings: Finding[]; sweepText: string };

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function rulesOf(decision: Record<string, unknown>): { rules: Rule[]; findings: Finding[] } | null {
  const sweep = obj(decision.sweep);
  if (!sweep || !Array.isArray(sweep.rules_run)) return null;
  const rules = sweep.rules_run as Rule[];
  const findings = Array.isArray(sweep.findings) ? (sweep.findings as Finding[]) : [];
  if (!WANTED.every((id) => rules.some((r) => r.rule === id))) return null;
  return { rules, findings };
}

async function sweepFrom(request: APIRequestContext, run: RunSummary): Promise<Hit | null> {
  const { status, body } = await getJson(request, `/runs/${encodeURIComponent(run.run_id)}`);
  if (status !== 200) return null;
  const decision = obj(obj(obj(body)?.live)?.decision);
  if (!decision) return null;
  const parsed = rulesOf(decision);
  if (!parsed) return null;
  return { runId: run.run_id, ...parsed, sweepText: JSON.stringify(decision.sweep) };
}

async function findSweep(request: APIRequestContext): Promise<Hit | null> {
  const decided = (await listRuns(request)).filter((r) => r.decision);
  decided.sort((a, b) => b.started_at.localeCompare(a.started_at));
  const slice = decided.slice(0, 20);
  for (let i = 0; i < slice.length; i += 5) {
    const hits = await Promise.all(slice.slice(i, i + 5).map((r) => sweepFrom(request, r)));
    const hit = hits.find((h) => h);
    if (hit) return hit;
  }
  return null;
}

test("DQ7, DQ8 and DQ9 are evaluated on a decided sweep", async ({ page, request }) => {
  const found = await findSweep(request);
  if (!found) {
    const s1 = await latestS1Hold(request);
    const detail = await runRecord(request, s1.run_id);
    const decision = obj(obj(detail.live)?.decision);
    const rules = obj(decision?.sweep);
    const present = Array.isArray(rules?.rules_run) ? (rules.rules_run as { rule?: string }[]).map((r) => r.rule ?? "?") : [];
    expect(found, `DQ7 to DQ9 absent from sweep on ${s1.run_id}; rules present: ${present.join(", ") || "none"}`).toBeTruthy();
  }
  const hit = found as Hit;
  for (const id of WANTED) {
    const rule = hit.rules.find((r) => r.rule === id);
    expect(rule, id).toBeTruthy();
    expect(Number.isInteger(rule?.total), `${id} total`).toBe(true);
    expect(Number.isInteger(rule?.valid), `${id} valid`).toBe(true);
    expect(Number.isInteger(rule?.invalid), `${id} invalid`).toBe(true);
    expect(rule?.total ?? -1, `${id} total`).toBeGreaterThanOrEqual(0);
    expect(rule?.invalid ?? -1, `${id} invalid`).toBeGreaterThanOrEqual(0);
    expect(typeof rule?.query_id, `${id} query id`).toBe("string");
    expect(rule?.query_id.length, `${id} query id`).toBeGreaterThan(0);
  }
  const dq7 = hit.rules.find((r) => r.rule === "DQ7") as Rule;
  const dq7Findings = hit.findings.filter((f) => f.rule === "DQ7");
  const surfaced = dq7.invalid > 0 || dq7Findings.length > 0;
  if (surfaced) {
    for (const vendor of SHARED) expect(hit.sweepText, `DQ7 names ${vendor}`).toContain(vendor);
  }

  await page.goto(`/app/review/${hit.runId}`);
  await expect(page.getByTestId("decision-card")).toBeVisible();
  const banner = page.getByTestId("sweep-banner");
  await expect(banner).toBeVisible();
  for (const id of WANTED) {
    const rule = hit.rules.find((r) => r.rule === id) as Rule;
    const row = banner.locator(`[data-testid="sweep-rule"][data-rule="${id}"]`);
    await expect(row, `${id} row`).toBeVisible();
    await expect(row).toHaveAttribute("data-invalid", String(rule.invalid));
    const count = rule.invalid > 0 ? `${rule.invalid} of ${rule.total} rows invalid` : `all ${rule.total} rows valid`;
    await expect(row).toContainText(count);
  }
  if (surfaced) {
    for (const vendor of SHARED) await expect(banner, `DQ7 row shows ${vendor}`).toContainText(vendor);
  }
});
