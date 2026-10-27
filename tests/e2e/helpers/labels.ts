import type { Page } from "@playwright/test";

const BANNED = /demo scenario|synthetic|do not call/i;

type El = {
  childNodes: { nodeType: number; textContent: string | null }[];
  closest: (sel: string) => unknown;
  getAttribute: (name: string) => string | null;
  tagName: string;
  getBoundingClientRect: () => { width: number; height: number };
};

/** Visible synthetic/demo copy. Text inside the letter document pane is ignored. */
export async function bannedLabels(page: Page): Promise<string[]> {
  return page.evaluate((source) => {
    const g = globalThis as unknown as {
      document: { body: unknown; querySelectorAll: (s: string) => El[] };
      getComputedStyle: (el: El) => { display: string; visibility: string };
    };
    const re = new RegExp(source, "i");
    const hits: string[] = [];
    const hidden = (el: El) => {
      const st = g.getComputedStyle(el);
      return st.display === "none" || st.visibility === "hidden";
    };
    for (const el of g.document.querySelectorAll('[data-testid="synthetic-notice"]')) {
      if (hidden(el)) continue;
      const text = [...el.childNodes].map((n) => n.textContent ?? "").join(" ").replace(/\s+/g, " ").trim();
      hits.push(`synthetic-notice: ${text.slice(0, 180)}`);
    }
    for (const el of g.document.querySelectorAll("body *")) {
      if (el.closest('[data-testid="letter-pane"], [data-testid="letter-page"]')) continue;
      if (hidden(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      for (const n of el.childNodes) {
        if (n.nodeType !== 3) continue;
        const text = (n.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!text || !re.test(text)) continue;
        const testid = el.closest("[data-testid]") ? (el.closest("[data-testid]") as El).getAttribute("data-testid") : el.tagName.toLowerCase();
        const line = `${testid ?? el.tagName.toLowerCase()}: ${text.slice(0, 180)}`;
        if (!hits.includes(line)) hits.push(line);
      }
    }
    return hits;
  }, BANNED.source);
}
