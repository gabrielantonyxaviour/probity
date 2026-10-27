import { test, expect, type Locator, type APIRequestContext, type Page } from "@playwright/test";
import { asRecord, getJson } from "../helpers/api";
import { latestS1Hold } from "../helpers/runs";

/** USL names the drawer must show: the vendor360 layer, or a session table registered this run. */
const USL = /lightning\.metastore\.probity\.vendor360\.|session\.pp_/;

const SOURCES = [
  { cell: "usaspending", system: "usaspending", label: "USAspending" },
  { cell: "vendor_master", system: "erp_postgres", label: "ERP Postgres" },
  { cell: "edgar", system: "sec_edgar", label: "SEC EDGAR" },
] as const;

async function titled(row: Locator): Promise<string> {
  const title = await row.locator(".t-mono-data").getAttribute("title");
  expect(title, "id row title").toBeTruthy();
  return title ?? "";
}

function tablesFromSql(sql: string): string[] {
  const out: string[] = [];
  for (const m of sql.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_][\w.]*)/gi)) {
    const t = m[1] ?? "";
    if (t.includes(".") && !out.includes(t)) out.push(t);
  }
  return out;
}

function apiTables(detail: Record<string, unknown>): string[] {
  const lineage = detail.lineage;
  if (!lineage || typeof lineage !== "object") return tablesFromSql(String(detail.sql ?? ""));
  const sources = (lineage as { sources?: unknown }).sources;
  if (!Array.isArray(sources)) return tablesFromSql(String(detail.sql ?? ""));
  const named = sources.flatMap((s) => {
    if (!s || typeof s !== "object") return [];
    const table = (s as { usl_table?: unknown }).usl_table;
    return typeof table === "string" ? [table] : [];
  });
  return named.length ? named : tablesFromSql(String(detail.sql ?? ""));
}

async function openCell(page: Page, request: APIRequestContext, runId: string, cell: string, system: string, label: string): Promise<void> {
  const buttons = page.locator(`button[data-testid^="fact-cell-"][data-testid$="-${cell}"]`);
  const count = await buttons.count();
  expect(count, `${label} fact cell`).toBeGreaterThan(0);
  let sawMatch = false;
  const tried: string[] = [];
  for (let i = 0; i < count; i++) {
    const cellBtn = buttons.nth(i);
    const qid = await cellBtn.getAttribute("data-query-id");
    if (!qid) continue;
    tried.push(qid);
    await cellBtn.click();
    const drawer = page.getByTestId("evidence-drawer");
    await expect(drawer).toBeVisible();
    const lineage = drawer.getByTestId("evidence-lineage");
    await expect(lineage, `${label} lineage`).toBeVisible();
    const source = lineage.getByTestId("lineage-source");
    await expect(source.locator(`[data-system="${system}"]`)).toBeVisible();
    await expect(source).toContainText(label);
    const table = lineage.getByTestId("lineage-table");
    await expect(table).toContainText(USL);
    const query = lineage.getByTestId("lineage-query");
    const shownId = await titled(query.getByTestId("evidence-query-id"));
    expect(shownId, `${label} query id`).toBe(qid);
    const sqlHash = await titled(query.locator('[data-testid="evidence-ids"] .idrow').nth(1));
    const rowHash = await titled(lineage.getByTestId("evidence-row-hash"));
    expect(sqlHash.length, `${label} SQL hash`).toBeGreaterThan(8);
    expect(rowHash.length, `${label} row hash`).toBeGreaterThan(8);

    const { status, body } = await getJson(request, `/runs/${encodeURIComponent(runId)}/queries/${encodeURIComponent(qid)}`);
    expect(status, `GET /runs/${runId}/queries/${qid}`).toBe(200);
    const detail = asRecord(body, "query detail");
    expect(detail.query_id).toBe(qid);
    expect(detail.sql_hash).toBe(sqlHash);
    expect(detail.row_hash).toBe(rowHash);
    const tables = apiTables(detail);
    const tableText = await table.innerText();
    expect(tables.some((t) => tableText.includes(t)), `${label} USL table agrees with the query (${tables.join(", ")})`).toBe(true);
    expect(tables.some((t) => USL.test(t)), `${label} API names a vendor360 or session table`).toBe(true);

    const matched = lineage.getByTestId("lineage-rows").locator("tr[data-matched]");
    if ((await matched.count()) > 0) {
      await expect(matched.first()).toBeVisible();
      sawMatch = true;
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      break;
    }
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  }
  expect(tried.length, `${label} opened a query`).toBeGreaterThan(0);
  expect(sawMatch, `${label} highlighted the matching row (tried ${tried.join(", ")})`).toBe(true);
}

test("S1 evidence lineage shows source, USL table, query and the matching row", async ({ page, request }) => {
  const run = await latestS1Hold(request);
  await page.goto(`/app/review/${run.run_id}`);
  await expect(page.getByTestId("decision-card")).toBeVisible();
  for (const src of SOURCES) {
    await openCell(page, request, run.run_id, src.cell, src.system, src.label);
  }
});
