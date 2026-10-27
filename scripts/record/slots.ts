// One function per recording slot in docs/video/slots.json. Each performs the real action in the production UI:
// the pointer moves and clicks through Playwright input, the data on screen is whatever the live API returns.
import type { Page } from "@playwright/test";
import { click, dwell, glide, hover, moveTo } from "./cursor";
import { REQ, type Ctx, type SlotFn } from "./env";

const T = (id: string) => `[data-testid="${id}"]`;
const open = async (c: Ctx, runId: string, q = ""): Promise<void> => {
  await c.page.goto(`${c.ui}/app/review/${runId}${q}`, { waitUntil: "domcontentloaded" });
  await c.page.waitForSelector(T("decision-card"), { timeout: 45_000 });
  await dwell(1200);
};
const settle = async (page: Page, sel: string, ms = 600_000) => page.waitForSelector(sel, { timeout: ms });
const visible = async (page: Page, sel: string): Promise<boolean> => page.locator(sel).first().isVisible().catch(() => false);

/** D5: the graph as of the request, then Replay steps it forward event by event; it is paused on the decision. */
async function scrubAsOf(c: Ctx): Promise<void> {
  const scrub = c.page.locator(T("graph-asof")).first();
  await scrub.waitFor({ timeout: 30_000 });
  await scrub.evaluate((e) => window.scrollTo({ top: e.getBoundingClientRect().top + window.scrollY - 150, behavior: "smooth" }));
  await dwell(1500);
  const range = c.page.locator(T("graph-asof-range")).first();
  const b = await range.boundingBox();
  if (!b) return;
  await moveTo(c.page, b.x + 6, b.y + b.height / 2);
  await c.page.mouse.down();
  await c.page.mouse.up();
  await dwell(1800);
  await click(c.page, c.page.locator(T("graph-asof-play")).first());
  const chip = scrub.locator(".asof__head").first();
  for (let i = 0; i < 300; i++) {
    if (/\bdecision\b/i.test(await chip.innerText().catch(() => ""))) break;
    await dwell(100);
  }
  await c.page.mouse.down();
  await c.page.mouse.up();
  await dwell(300);
  await hover(c.page, c.page.locator(T("graph-asof-time")).first(), 1800);
}

/** From the queue: click Verify on a request row (a real run starts). Falls back to Open, then Run again, on an already-checked row. */
async function verifyFromQueue(c: Ctx, requestId: string): Promise<void> {
  await c.page.goto(`${c.ui}/app`, { waitUntil: "domcontentloaded" });
  const row = c.page.locator(T(`inbox-item-${requestId}`)).first();
  await dwell(1500);
  if (!(await row.isVisible().catch(() => false))) {
    const decidedTab = c.page.getByRole("tab", { name: /^Decided/ }).first(); // an already-checked request sits under Decided
    if (await decidedTab.count()) await click(c.page, decidedTab);
  }
  await row.waitFor({ timeout: 30_000 });
  await dwell(1500);
  const verify = row.locator(T("verify-button"));
  if (await verify.count()) {
    await click(c.page, verify);
    return;
  }
  await click(c.page, row.locator(T("open-button")));
  await c.page.waitForURL(/\/app\/review\//, { timeout: 30_000 });
  const again = c.page.locator(T("run-again"));
  await again.waitFor({ timeout: 30_000 });
  await dwell(1200);
  await click(c.page, again);
}

export const SLOTS: Record<string, SlotFn> = {
  // S1 pitch: the letter full screen, the watermark, then the remit address and the phone.
  async R01(c) {
    await open(c, await c.run(REQ.S1), "?letter=full");
    await settle(c.page, T("letter-page"), 30_000).catch(() => undefined);
    await dwell(2200);
    const marks = c.page.locator(T("letter-highlight"));
    const n = Math.min(await marks.count(), 3);
    for (let i = 0; i < n; i++) await hover(c.page, marks.nth(i), 1300);
    await dwell(800);
  },
  // S1 decision: the Hold banner, then the sweep banner.
  async R02(c) {
    await open(c, await c.run(REQ.S1));
    await hover(c.page, c.page.locator(T("decision-banner")), 2400);
    await glide(c.page, 1150, 1400);
    await hover(c.page, c.page.locator(T("sweep-banner")), 2200);
  },
  // The trace rail, A1 to A4: the handoff ribbon, then down the timeline.
  async R03(c) {
    await open(c, await c.run(REQ.S1));
    await hover(c.page, c.page.locator(T("handoff-ribbon")), 1800);
    const rows = c.page.locator(T("timeline-event"));
    for (const i of [0, 3, 6]) if ((await rows.count()) > i) await hover(c.page, rows.nth(i), 1300);
    await glide(c.page, 700, 1200);
    await dwell(1200);
  },
  // S10: the letter with hidden 1 pt instruction lines. HOLD R8, then the letter full size: the quoted passages, the red
  // bands on the page, and the two independent readings that agree.
  async R04(c) {
    await open(c, await c.run(REQ.S10));
    await hover(c.page, c.page.locator(T("decision-banner")), 2000);
    if (await visible(c.page, T("show-letter"))) await click(c.page, c.page.locator(T("show-letter")).first());
    await dwell(600);
    const expand = c.page.getByRole("button", { name: "Expand letter" }).first();
    if (await expand.count()) await click(c.page, expand);
    const dlg = (await c.page.locator('[role="dialog"]').count()) ? c.page.locator('[role="dialog"]').last() : c.page.locator("body");
    const card = dlg.locator(T("injection-card")).first();
    await card.waitFor({ timeout: 20_000 });
    await dwell(800);
    await hover(c.page, dlg.locator(T("injection-reason")).first(), 1500);
    await hover(c.page, dlg.locator(T("injection-span")).first(), 1600);
    const show = card.getByRole("button", { name: /show on the page/i }).first();
    if (await show.count()) await click(c.page, show);
    await dwell(1200);
    const marks = dlg.locator(T("injection-highlight"));
    for (let i = 0; i < Math.min(await marks.count(), 2); i++) await hover(c.page, marks.nth(i), 1400);
    const agree = dlg.locator(T("readings-card")).first();
    if (await agree.count()) {
      await agree.evaluate((e) => e.scrollIntoView({ block: "center", behavior: "smooth" }));
      await dwell(1000);
      await hover(c.page, dlg.locator(T("readings-agreement")).first(), 2000);
    }
  },
  // S1 live, end to end from the queue: Verify, the live stream, the decision reveal.
  async R05(c) {
    await verifyFromQueue(c, REQ.S1);
    await c.page.waitForURL(/\/app\/review\//, { timeout: 60_000 });
    await settle(c.page, `${T("decision-card")}[data-decision]`, 600_000);
    await dwell(2500);
    await hover(c.page, c.page.locator(T("decision-banner")), 3500);
    await glide(c.page, 600, 1200);
    await dwell(2000);
  },
  // S2: two plausible vendors, the system refuses to guess.
  async R06(c) {
    await verifyFromQueue(c, REQ.S2);
    await c.page.waitForURL(/\/app\/review\//, { timeout: 60_000 });
    await settle(c.page, `${T("needs-human")}, ${T("decision-card")}[data-decision]`, 600_000);
    await dwell(2500);
    await hover(c.page, c.page.locator(`${T("needs-human")}, ${T("decision-banner")}`).first(), 3500);
  },
  // Memory carried across sessions: the run whose R5 chips come from the World Model.
  async R07(c) {
    await open(c, await c.run(REQ.S6));
    const chips = c.page.locator(T("memory-chip"));
    await chips.first().waitFor({ timeout: 20_000 });
    await hover(c.page, c.page.locator(T("decision-banner")), 2200);
    for (let i = 0; i < Math.min(await chips.count(), 3); i++) await hover(c.page, chips.nth(i), 2600);
    const r5 = c.page.locator(`${T("reason-code")}[data-code="R5"], ${T("why-list")} li`).first();
    if (await r5.count()) await hover(c.page, r5, 2200);
    const gate = c.page.locator(T("timeline-event")).filter({ hasText: /memory/i }).first();
    if (await gate.count()) await hover(c.page, gate, 2400);
  },
  async R08() {
    throw new Error("R08 (S7 outage) is disabled in slots.json and needs the sample ports (STATUS F16/F22)");
  },
  // The evidence drawer, then Re-run in Zetaris, then the match.
  async R09(c) {
    await open(c, await c.run(REQ.S1));
    await glide(c.page, 2000, 1400);
    await click(c.page, c.page.locator(T("fact-cell-remit_address-usaspending")));
    await c.page.waitForSelector(T("evidence-drawer"), { timeout: 20_000 });
    await dwell(1200);
    for (const step of ["lineage-source", "lineage-table", "lineage-query", "lineage-rows"]) {
      const el = c.page.locator(T(step)).first();
      if (await el.count()) await hover(c.page, el, 1300);
    }
    await click(c.page, c.page.locator(T("rerun-button")));
    await settle(c.page, T("rerun-result"), 90_000);
    await hover(c.page, c.page.locator(T("rerun-result")), 3000);
  },
  // Zetaris UI: LIST DQ USL, RUN DQ. Driven by the Zetaris recorder in zetaris.ts (a different origin and login).
  async R10() {
    throw new Error("R10 runs through scripts/record/zetaris.ts");
  },
  // What Nemotron did, then the ledger.
  async R11(c) {
    await open(c, await c.run(REQ.S1));
    await c.page.locator(T("nemotron-jobs")).scrollIntoViewIfNeeded();
    await dwell(1000);
    const jobs = c.page.locator(T("nemotron-job"));
    for (let i = 0; i < Math.min(await jobs.count(), 3); i++) await hover(c.page, jobs.nth(i), 1400);
  },
  async R12() {
    throw new Error("R12 (S5 Parsons) is disabled in slots.json and needs the T16 sec_ticker_v view (STATUS F29)");
  },
  // The sweep panel and the exposure strip: the findings (DQ7's shared account first), then the rule rows.
  async R13(c) {
    await open(c, await c.run(REQ.S1));
    await hover(c.page, c.page.locator(T("exposure-strip")), 1500);
    const dq7 = c.page.locator(`${T("sweep-hit")}[data-rule="DQ7"]`).first();
    if (await dq7.count()) await hover(c.page, dq7, 2200);
    const f = c.page.locator(T("sweep-finding"));
    for (let i = 0; i < Math.min(await f.count(), 3); i++) await hover(c.page, f.nth(i), 1000);
    const rules = c.page.locator(T("sweep-rules")).first();
    if (await rules.count()) await hover(c.page, rules, 1500);
    const rule = c.page.locator(`${T("sweep-rule")}[data-rule="DQ7"]`).first();
    if (await rule.count()) await hover(c.page, rule, 2000);
  },
  // S1 entity graph, time travel: the as-of scrubber back to the request (the New Jersey entity absent), replayed to the decision.
  async R14(c) {
    await open(c, await c.run(REQ.S1));
    await scrubAsOf(c);
  },
};
