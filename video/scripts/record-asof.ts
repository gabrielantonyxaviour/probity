// R14 "What was known when": the S1 review's entity graph, the as-of scrubber taken back to when the request arrived,
// then played forward to now. Reads a finished run only (the graph comes from the World Model; nothing starts, nothing
// queries Zetaris). Uses the same recorder pieces as scripts/record/screen.ts (screencast capture, human pointer).
//
//   npx tsx video/scripts/record-asof.ts --run r-2026...           # writes docs/video/raw/v11-asof.mp4 (+ .json)
//   --ui http://localhost:3100   --out <dir>   --scale 1|2
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { startCapture } from "../../scripts/record/capture";
import { installCursor, hover, click, dwell } from "../../scripts/record/cursor";
import { ROOT, REQ, newestDecidedRun } from "../../scripts/record/env";

const HIDE_DEV_BADGE = "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none!important}html{scrollbar-width:none}";
const T = (id: string) => `[data-testid="${id}"]`;

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { run: { type: "string" }, ui: { type: "string" }, api: { type: "string" }, out: { type: "string" }, scale: { type: "string" } } });
  const ui = (values.ui ?? "http://localhost:3100").replace(/\/+$/, "");
  const api = (values.api ?? "http://localhost:8787").replace(/\/+$/, "");
  const out = path.resolve(values.out ?? path.join(ROOT, "docs/video/raw"));
  const scale = Number(values.scale ?? "2");
  const run = values.run ?? (await newestDecidedRun(api, REQ.S1));
  if (!run) throw new Error("no finished S1 run; pass --run <run_id>");
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale, colorScheme: "dark", locale: "en-US" });
  const page = await context.newPage();
  await page.addInitScript(`document.addEventListener("DOMContentLoaded",()=>{const s=document.createElement("style");s.textContent=${JSON.stringify(HIDE_DEV_BADGE)};document.head.append(s)})`);
  await installCursor(page);
  // Warm the page and its graph before the camera rolls, then start from the graph region at "now".
  await page.goto(`${ui}/app/review/${run}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(T("decision-card"), { timeout: 45_000 });
  const region = page.locator(T("entity-graph-region"));
  await region.scrollIntoViewIfNeeded();
  await page.waitForSelector(T("graph-asof"), { timeout: 45_000 });
  await page.evaluate(() => window.scrollBy(0, -120));
  await dwell(1500);
  const file = path.join(out, "v11-asof.mp4");
  const cap = await startCapture(context, page, { workDir: path.join(out, ".frames-R14"), scale });
  let err: unknown = null;
  try {
    await hover(page, page.locator(T("entity-graph")), 1600);
    const range = page.locator(T("graph-asof-range"));
    await hover(page, range, 600);
    await range.focus();
    await page.keyboard.press("Home"); // back to when the request arrived
    await dwell(2600);
    await hover(page, page.locator(T("graph-asof-time")), 800);
    await click(page, page.locator(T("graph-asof-play"))); // forward through what was learned, to now
    await dwell(6500);
  } catch (e) {
    err = e;
  }
  const r = await cap.stop(file);
  await browser.close();
  if (err) throw err;
  writeFileSync(`${file}.json`, `${JSON.stringify({ slot: "R14", file: "v11-asof.mp4", seconds: Number(r.seconds.toFixed(1)), frames: r.frames, scale, ui, runs: { [REQ.S1]: run } }, null, 2)}\n`);
  process.stdout.write(`ok    R14  ${file}  ${r.seconds.toFixed(1)} s  run ${run}\n`);
  return 0;
}

process.exit(await main());
