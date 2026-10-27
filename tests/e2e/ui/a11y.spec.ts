import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { latestS1Hold } from "../helpers/runs";

async function serious(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    const fonts = (globalThis as unknown as { document: { fonts?: { ready: Promise<unknown> } } }).document.fonts;
    return fonts?.ready;
  });
  // The decision card fades in; axe reads a mid-fade colour as low contrast, so wait for running animations to settle.
  await page
    .waitForFunction(() => {
      const doc = (globalThis as unknown as { document: { getAnimations?: () => Array<{ playState: string }> } }).document;
      return (doc.getAnimations?.() ?? []).every((a) => a.playState !== "running");
    }, undefined, { timeout: 10_000 })
    .catch(() => undefined);
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

test("inbox has no serious or critical axe violations", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByTestId("inbox").or(page.getByTestId("empty-state"))).toBeVisible();
  expect(await serious(page), "axe on /app").toEqual([]);
});

test("review has no serious or critical axe violations", async ({ page, request }) => {
  const run = await latestS1Hold(request);
  await page.goto(`/app/review/${run.run_id}`);
  await expect(page.getByTestId("decision-card")).toBeVisible();
  expect(await serious(page), "axe on the review").toEqual([]);
});
