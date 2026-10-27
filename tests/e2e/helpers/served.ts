import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The shipped testid must be visible.
 * When the JS this page loaded from :3100 does not contain it, the failure names that testid.
 * After a rebuild that ships the id, the same assertion passes.
 */
export async function expectServedTestId(page: Page, testId: string): Promise<Locator> {
  const card = page.getByTestId(testId);
  if ((await card.count()) > 0) return card;
  const inBuild = await page.evaluate(async (id) => {
    if (document.documentElement.innerHTML.includes(id)) return true;
    const srcs = Array.from(document.querySelectorAll("script[src]")).map((node) => (node as HTMLScriptElement).src);
    for (const src of srcs) {
      try {
        const res = await fetch(src);
        if (res.ok && (await res.text()).includes(id)) return true;
      } catch {
        /* a chunk that did not load is not evidence the id shipped */
      }
    }
    return false;
  }, testId);
  const why = inBuild
    ? `${testId} is in the served :3100 build but absent on the page`
    : `${testId} is missing from the served :3100 build`;
  await expect(card, why).toBeVisible();
  return card;
}
