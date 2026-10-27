import { test, expect } from "@playwright/test";
import { getJson, asRecord } from "../helpers/api";
import { latestS1Hold } from "../helpers/runs";

test("S1 entity graph shows the decision path and the full view", async ({ page, request }) => {
  const run = await latestS1Hold(request);
  const { status, body } = await getJson(request, `/runs/${run.run_id}/graph`);
  expect(status, "GET /runs/:id/graph").toBe(200);
  const nodes = asRecord(body, "graph").nodes as { flags?: string[] }[];
  expect(nodes.some((n) => (n.flags ?? []).includes("conflict")), "API graph has a conflict node").toBe(true);

  await page.goto(`/app/review/${run.run_id}`);
  await expect(page.getByTestId("decision-card")).toBeVisible({ timeout: 15_000 });
  const review = page.getByTestId("review-page");
  const vp = page.viewportSize()?.width ?? 1440;
  const width = vp >= 1440 ? "wide" : vp >= 768 ? "medium" : "narrow";
  await expect(review).toHaveAttribute("data-width", width, { timeout: 15_000 });
  // Below wide the graph lives on the Graph tab. Narrow defaults to the table, which has no graph-edge.
  if (width !== "wide") await page.getByRole("tab", { name: "Graph" }).click({ timeout: 15_000 });
  const graph = page.getByTestId("entity-graph");
  await expect(graph).toBeVisible({ timeout: 15_000 });
  if ((await page.getByTestId("graph-edge").count()) === 0) {
    await page.getByRole("button", { name: "Diagram", exact: true }).click({ timeout: 15_000 });
  }
  await graph.scrollIntoViewIfNeeded({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Decision path" })).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
  await expect(page.getByTestId("graph-node").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("graph-edge").first()).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('[data-testid="graph-node"][data-conflict="true"]').first()).toBeVisible({ timeout: 15_000 });

  await page.goto(`/app/review/${run.run_id}?graph=full`);
  await expect(page.getByTestId("entity-graph")).toHaveAttribute("data-full", "true", { timeout: 15_000 });
  await expect(page).toHaveURL(/[?&]graph=full/, { timeout: 15_000 });
});
