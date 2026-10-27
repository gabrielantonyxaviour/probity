// Insurance walkthrough: a calm, narrated screen recording of the real product on the production UI.
//
//   npx tsx scripts/record/insurance/run.ts                    # record, then mux (takes the Zetaris lock for the one re-run)
//   npx tsx scripts/record/insurance/run.ts --dry              # rehearsal: no Re-run click, so no Zetaris query and no lock
//   npx tsx scripts/record/insurance/run.ts --mux-only         # rebuild the mp4 from work/ (marks.json, clips) without recording
// Needs docs/video/insurance/audio/i01..i13 (python3 video/scripts/tts.py --script docs/video/insurance/vo.json --out docs/video/insurance/audio).
// Starts no run. Decided runs: S1 r-20261027T161052Z-29f3, S3 r-20261027T161748Z-5614.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { startCapture } from "../capture";
import { installCursor } from "../cursor";
import { approve, callback, dossier, graph, sweep, trust } from "./beats-b";
import { drawerAndRerun, inbox, letterThenDecision, openS1 } from "./beats-a";
import { captionItems, captionList, mux, type Plan } from "./mux";
import { renderCaptions, renderCard } from "./cards";
import { releaseZetarisLock, takeZetarisLock } from "./lock";
import { HIDE_CHROME, MASK_FICTIONAL } from "./mask";
import type { Stage } from "./stage";
import { INS_DIR, Track, loadSeg } from "./vo";

const S1 = "r-20261027T161052Z-29f3";
const S3 = "r-20261027T161748Z-5614";
const START_CARD = 5.2;

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { ui: { type: "string" }, dry: { type: "boolean" }, "mux-only": { type: "boolean" }, out: { type: "string" }, s1: { type: "string" }, s3: { type: "string" } } });
  const ui = (values.ui ?? "http://localhost:3100").replace(/\/+$/, "");
  const work = path.join(INS_DIR, "work");
  mkdirSync(work, { recursive: true });
  const out = path.resolve(values.out ?? path.join(INS_DIR, "probity-walkthrough.mp4"));
  const files = { start: path.join(work, "card-start.mp4"), main: path.join(work, "main.mp4"), end: path.join(work, "card-end.mp4"), meta: path.join(work, "marks.json") };
  const browser = await chromium.launch({ args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
  const dry = values.dry === true;
  const warnings: string[] = [];
  try {
    if (!values["mux-only"]) {
      if (!dry) await takeZetarisLock();
      let released = false;
      const releaseLock = () => { if (!released) { released = true; releaseZetarisLock(); } };
      try {
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, colorScheme: "dark", locale: "en-US" });
        const page = await context.newPage();
        await page.addInitScript(MASK_FICTIONAL);
        await page.addInitScript(`document.addEventListener("DOMContentLoaded",()=>{const s=document.createElement("style");s.textContent=${JSON.stringify(HIDE_CHROME)};document.head.append(s)})`);
        await installCursor(page);
        await page.goto(`${ui}/app`, { waitUntil: "domcontentloaded" });
        // The header chip reads "Nightshift unreachable" for a moment while the first readiness poll lands; film after it settles.
        await page.waitForFunction(() => /ultra/i.test(document.querySelector('[data-testid="system-chip"]')?.textContent ?? ""), null, { timeout: 60_000 }).catch(() => warnings.push("system chip never showed Ultra before the take"));
        await page.waitForTimeout(800);
        const track = new Track();
        const s: Stage = { page, ui, runS1: values.s1 ?? S1, runS3: values.s3 ?? S3, track, warnings, dry, releaseLock };
        const cap = await startCapture(context, page, { workDir: path.join(work, "frames-main"), scale: 2 });
        const t0 = Date.now() / 1000;
        let matched = false;
        let err: unknown = null;
        try {
          await inbox(s);
          await openS1(s);
          await letterThenDecision(s);
          matched = await drawerAndRerun(s);
          await graph(s);
          await callback(s);
          await sweep(s);
          await dossier(s);
          await trust(s);
          await approve(s);
        } catch (e) {
          err = e;
        }
        const endEpoch = Date.now() / 1000;
        const r = await cap.stop(files.main);
        await context.close();
        if (err) throw err;
        writeFileSync(files.meta, `${JSON.stringify({ startEpoch: r.startEpoch, endEpoch, t0, seconds: r.seconds, matched, marks: track.marks, warnings, dry, runs: { S1: s.runS1, S3: s.runS3 }, ui }, null, 1)}\n`);
      } finally {
        releaseLock();
      }
      await renderCard(browser, ui, "start", files.start, 3500);
      await renderCard(browser, ui, "end", files.end, 3500);
    }
    const meta = JSON.parse(readFileSync(files.meta, "utf8")) as { startEpoch: number; endEpoch: number; marks: Array<{ id: string; epoch: number }>; warnings: string[]; matched: boolean };
    let mainDur = meta.endEpoch - meta.startEpoch + 0.4;
    let marks = meta.marks.map((m) => ({ ...m, at: Math.max(0, m.epoch - meta.startEpoch) }));
    // The re-run waits on Zetaris with nothing to narrate: that span is played at 4x and captioned as such.
    const i05 = marks.find((m) => m.id === "i05");
    const i06 = marks.find((m) => m.id === "i06");
    let cut: Plan["cut"];
    if (i05 && i06) {
      const from = i05.at + loadSeg("i05").seconds + 1.6;
      const to = i06.at - 1.4;
      if (to - from > 10) cut = { from, to, speed: 4 };
    }
    const saved = cut ? (cut.to - cut.from) * (1 - 1 / cut.speed) : 0;
    if (cut) {
      const c = cut;
      marks = marks.map((m) => (m.at >= c.to ? { ...m, at: m.at - saved } : m));
      mainDur -= saved;
    }
    const i13 = loadSeg("i13");
    const plan: Plan = { startCard: START_CARD, main: mainDur, endCard: 0.9 + i13.seconds + 2.6, marks, ...(cut ? { cut } : {}) };
    // The end card narration starts 0.9 s into the end card; marks are relative to the start of the walkthrough clip.
    plan.marks.push({ id: "i13", epoch: 0, at: mainDur + 0.9 });
    const items = captionItems(plan);
    if (cut) items.push({ text: "Re-running the query live in Zetaris (shown at 4x speed)", start: cut.from, end: cut.from + (cut.to - cut.from) / cut.speed });
    items.sort((a, b) => a.start - b.start);
    const caps = await renderCaptions(browser, ui, items, path.join(work, "captions"));
    const total = plan.startCard + plan.main + plan.endCard;
    // captionItems times are relative to the main clip; the overlay runs on the whole timeline, so shift by the start card.
    const shifted = items.map((i) => ({ ...i, start: i.start + plan.startCard, end: i.end + plan.startCard }));
    const listFile = path.join(work, "captions.txt");
    captionList(shifted, caps.files, caps.blank, total, listFile);
    mux({ start: files.start, main: files.main, end: files.end, plan, capList: listFile, out });
    const bridge = path.resolve(INS_DIR, "../../../../_docs/probity-walkthrough.mp4");
    if (!values.out && !dry && existsSync(path.dirname(bridge))) copyFileSync(out, bridge);
    process.stdout.write(`ok  ${out}  ${total.toFixed(1)} s  rerun matched: ${meta.matched}\n`);
    for (const w of meta.warnings) process.stdout.write(`warn ${w}\n`);
    return 0;
  } finally {
    await browser.close();
  }
}

process.exit(await main());
