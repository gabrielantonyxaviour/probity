// Shared pieces for the walkthrough choreography.
import type { Locator, Page } from "@playwright/test";
import { glide, moveTo } from "../cursor";
import type { Track } from "./vo";

export type Stage = {
  page: Page;
  ui: string;
  runS1: string;
  runS3: string;
  track: Track;
  /** Rehearsal: no click on Re-run in Zetaris, so no query is sent. */
  dry: boolean;
  warnings: string[];
  /** Taken before the capture starts, released right after the one Zetaris re-run answers. */
  releaseLock: () => void;
};

export const T = (id: string): string => `[data-testid="${id}"]`;

/** Run a pointer step; a missing target is logged and skipped so one miss cannot derail the timing of the whole take. */
export async function safe(s: Stage, what: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    s.warnings.push(`${what}: ${e instanceof Error ? e.message.split("\n")[0] : "failed"}`);
  }
}

export async function moveFrac(page: Page, loc: Locator, fx: number, fy: number, hold = 500): Promise<void> {
  const b = await loc.boundingBox();
  if (!b) throw new Error("no box");
  await moveTo(page, b.x + b.width * fx, b.y + b.height * fy);
  await new Promise((r) => setTimeout(r, hold));
}

/** Scroll the page so the target's top sits at `y`, gliding like a trackpad. */
export async function glideTo(page: Page, loc: Locator, y = 300, ms = 1800): Promise<void> {
  const b = await loc.boundingBox();
  if (!b) throw new Error("no box");
  await moveTo(page, 960, 640);
  await glide(page, Math.round(b.y - y), ms);
}

export async function toTop(page: Page, ms = 1600): Promise<void> {
  const y = await page.evaluate(() => window.scrollY);
  if (y < 4) return;
  await moveTo(page, 960, 640);
  await glide(page, -y, ms);
}

export const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Hover a target if it exists and is on the page; a short scroll timeout keeps a missing element from stalling the take. */
export async function hover(page: Page, loc: Locator, hold = 600): Promise<void> {
  const first = loc.first();
  if ((await loc.count()) === 0) throw new Error("not on the page");
  await first.scrollIntoViewIfNeeded({ timeout: 3000 });
  const b = await first.boundingBox();
  if (!b) throw new Error("no box");
  await moveTo(page, b.x + b.width * (0.4 + Math.random() * 0.2), b.y + b.height * (0.4 + Math.random() * 0.2));
  await pause(hold);
}

export async function openReview(s: Stage, runId: string): Promise<void> {
  await s.page.goto(`${s.ui}/app/review/${runId}`, { waitUntil: "domcontentloaded" });
  await s.page.waitForSelector(`${T("decision-card")}[data-decision]`, { timeout: 45_000 });
  await pause(500);
}
