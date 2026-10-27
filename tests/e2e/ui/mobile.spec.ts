import { test, expect, type Page } from "@playwright/test";
import { assertNoHScroll } from "../helpers/layout";
import { latestS1Hold } from "../helpers/runs";

async function checkWidth(page: Page, width: number, height: number, runId: string): Promise<void> {
  await page.setViewportSize({ width, height });
  const routes: [string, string][] = [
    ["/", "#hero-title"],
    ["/app", "[data-testid='inbox'], [data-testid='empty-state'], [data-testid='error-banner']"],
    [`/app/review/${runId}`, "[data-testid='decision-card']"],
    [`/app/review/${runId}/dossier`, "[data-testid='dossier']"],
  ];
  for (const [path, ready] of routes) {
    await page.goto(path);
    await expect(page.locator(ready).first()).toBeVisible();
    await assertNoHScroll(page, `${path} at ${width}x${height}`);
  }
}

test("no horizontal scroll at 390x844 @viewport", async ({ page, request }) => {
  const run = await latestS1Hold(request);
  await checkWidth(page, 390, 844, run.run_id);
});

test("no horizontal scroll at the project viewport @viewport", async ({ page, request }) => {
  const run = await latestS1Hold(request);
  const vp = page.viewportSize() ?? { width: 1440, height: 900 };
  await checkWidth(page, vp.width, vp.height, run.run_id);
});
