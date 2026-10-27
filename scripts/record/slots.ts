// One function per recording slot in docs/video/slots.json. Each performs the real action in the production UI:
// the pointer moves and clicks through Playwright input, the data on screen is whatever the live API returns.
import path from "node:path";
import type { Page } from "@playwright/test";
import { click, dwell, glide, hover } from "./cursor";
import { ROOT, REQ, type Ctx, type SlotFn } from "./env";

const T = (id: string) => `[data-testid="${id}"]`;
const open = async (c: Ctx, runId: string, q = ""): Promise<void> => {
  await c.page.goto(`${c.ui}/app/review/${runId}${q}`, { waitUntil: "domcontentloaded" });
  await c.page.waitForSelector(T("decision-card"), { timeout: 45_000 });
  await dwell(1200);
};
const settle = async (page: Page, sel: string, ms = 600_000) => page.waitForSelector(sel, { timeout: ms });

/** From the queue: click Verify on a request row (a real run starts). Falls back to Open, then Run again, on an already-checked row. */
async function verifyFromQueue(c: Ctx, requestId: string): Promise<void> {
  await c.page.goto(`${c.ui}/app`, { waitUntil: "domcontentloaded" });
  const row = c.page.locator(T(`inbox-item-${requestId}`)).first();
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
  // A letter that carries an instruction to an AI, uploaded through the New request form (real read by Nemotron Ultra).
  async R04(c) {
    await c.page.goto(`${c.ui}/app/new`, { waitUntil: "domcontentloaded" });
    await c.page.waitForSelector(T("new-form"), { timeout: 30_000 });
    await dwell(1200);
    const letter = path.join(ROOT, "tests/eval/nemotron/letters/s1-instruction/letter.pdf");
    const chooser = c.page.waitForEvent("filechooser");
    await click(c.page, c.page.getByRole("button", { name: /choose/i }).first());
    await (await chooser).setFiles(letter);
    await dwell(1200);
    await click(c.page, c.page.locator(`${T("new-form")} ${T("verify-button")}`));
    await settle(c.page, T("extraction-chip"), 240_000);
    await hover(c.page, c.page.locator(T("extraction-chip")).first(), 3500);
    const stop = c.page.locator(T("stop-button"));
    if (await stop.count()) {
      await click(c.page, stop);
      const ok = c.page.getByRole("button", { name: /stop/i }).last();
      if (await ok.isVisible().catch(() => false)) await click(c.page, ok);
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
    for (let i = 0; i < Math.min(await chips.count(), 3); i++) await hover(c.page, chips.nth(i), 1800);
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
    await dwell(1800);
    await hover(c.page, c.page.locator(T("evidence-sql")), 1500);
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
  // The sweep panel and the exposure strip.
  async R13(c) {
    await open(c, await c.run(REQ.S1));
    await hover(c.page, c.page.locator(T("exposure-strip")), 1800);
    await glide(c.page, 1150, 1300);
    const f = c.page.locator(T("sweep-finding"));
    for (let i = 0; i < Math.min(await f.count(), 3); i++) await hover(c.page, f.nth(i), 1300);
  },
};
