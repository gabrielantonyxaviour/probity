import { expect, type Page } from "@playwright/test";

export type Overflow = { testid: string | null; tag: string; id: string; className: string; right: number };

type Box = { width: number; height: number; right: number };
type El = {
  children: El[];
  getBoundingClientRect: () => Box;
  getAttribute: (name: string) => string | null;
  tagName: string;
  id: string;
  className: string;
};

/** `documentElement.scrollWidth <= innerWidth`, plus the elements that stick out past the viewport. */
export async function pageOverflow(page: Page): Promise<{ scrollWidth: number; innerWidth: number; offenders: Overflow[] }> {
  return page.evaluate(() => {
    const g = globalThis as unknown as { innerWidth: number; document: { documentElement: { scrollWidth: number }; querySelectorAll: (s: string) => El[] } };
    const innerWidth = g.innerWidth;
    const scrollWidth = g.document.documentElement.scrollWidth;
    const nodes = [...g.document.querySelectorAll("body *")];
    const bad = nodes.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > innerWidth + 1;
    });
    const leaves = bad.filter((el) => ![...el.children].some((child) => bad.includes(child)));
    return {
      scrollWidth,
      innerWidth,
      offenders: leaves.slice(0, 8).map((el) => ({
        testid: el.getAttribute("data-testid"),
        tag: el.tagName.toLowerCase(),
        id: el.id,
        className: String(el.className).slice(0, 100),
        right: Math.round(el.getBoundingClientRect().right),
      })),
    };
  });
}

export async function assertNoHScroll(page: Page, where: string): Promise<void> {
  const box = await pageOverflow(page);
  expect(
    box.scrollWidth,
    `${where} scrollWidth ${box.scrollWidth} > innerWidth ${box.innerWidth}; offenders ${JSON.stringify(box.offenders)}`,
  ).toBeLessThanOrEqual(box.innerWidth);
}
