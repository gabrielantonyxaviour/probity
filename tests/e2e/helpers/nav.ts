import { expect, type Page } from "@playwright/test";

export async function gotoInbox(page: Page): Promise<void> {
  await page.goto("/app");
  await expect(page.getByTestId("inbox").or(page.getByTestId("empty-state")).or(page.getByTestId("error-banner"))).toBeVisible();
}

/** Decided and closed rows sit off the default "To review" tab. */
export async function showAll(page: Page): Promise<void> {
  const bar = page.locator('[aria-label="Request filter"]');
  await expect(bar).toBeVisible();
  await bar.getByRole("tab", { name: /All/ }).or(bar.getByRole("button", { name: /All/ })).click();
}

export async function openRequest(page: Page, requestId: string): Promise<void> {
  await gotoInbox(page);
  await showAll(page);
  const row = page.getByTestId(`inbox-item-${requestId}`);
  await expect(row).toBeVisible();
  await row.getByTestId("open-button").click();
  await expect(page).toHaveURL(new RegExp(`/app/review/`));
  await expect(page.getByTestId("decision-card")).toBeVisible();
}

/** Letter body: a tab below 768, an open column from 768 to 1439, a collapsed rail at 1440 once decided. */
export async function openLetter(page: Page): Promise<void> {
  const vp = page.viewportSize()?.width ?? 1440;
  const width = vp >= 1440 ? "wide" : vp >= 768 ? "medium" : "narrow";
  await expect(page.getByTestId("review-page")).toHaveAttribute("data-width", width);
  if (width === "narrow") await page.getByRole("tab", { name: "Letter", exact: true }).click();
  if (width === "wide") {
    const show = page.getByTestId("show-letter");
    if (await show.isVisible()) await show.click();
  }
  await expect(page.getByTestId("letter-pane")).toBeVisible();
}
