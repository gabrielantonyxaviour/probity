// Screen recorder for the film slots (docs/video/slots.json). Drives the production UI with a headless Chromium at
// 1920x1080 (deviceScaleFactor 2 by default, downsampled to 1080p by ffmpeg) and human-paced pointer movement.
//
//   npx tsx scripts/record/screen.ts --list
//   npx tsx scripts/record/screen.ts --slot R13 --out /tmp/rec               # one slot against the UI on :3100
//   npx tsx scripts/record/screen.ts --ui http://localhost:3100 --run S1=r-2026...   # all enabled slots into docs/video/raw
//   --scale 1|2   --headed   --api http://localhost:8787   --keep-frames
// R05 and R06 start real runs (Verify from the queue); every other slot reads finished runs. Record from
// `next build && next start` so the dev badge is not on screen (this script also hides it as a safety net).
// Zetaris-console slots (R10, and the challenge footage) are recorded by scripts/record/zetaris.ts.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { startCapture } from "./capture";
import { installCursor } from "./cursor";
import { ROOT, REQ, newestDecidedRun, type Ctx, type SlotDef, type SlotFn } from "./env";
import { SLOTS } from "./slots";

const HIDE_DEV_BADGE = "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none!important}html{scrollbar-width:none}";

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { slot: { type: "string" }, ui: { type: "string" }, api: { type: "string" }, out: { type: "string" }, scale: { type: "string" }, run: { type: "string" }, list: { type: "boolean" }, headed: { type: "boolean" }, "keep-frames": { type: "boolean" } },
  });
  const defs = (JSON.parse(readFileSync(path.join(ROOT, "docs/video/slots.json"), "utf8")) as { slots: SlotDef[] }).slots;
  const pick = values.slot ? new Set(values.slot.split(",")) : null;
  const chosen = defs.filter((s) => (pick ? pick.has(s.id) : s.enabled));
  if (values.list) {
    for (const s of defs) process.stdout.write(`${s.id}  ${s.enabled ? "on " : "off"}  ${String(s.seconds).padStart(3)} s  ${s.file}  ${(SLOTS as Record<string, SlotFn | undefined>)[s.id] ? "" : "(no recorder)"}  ${s.title}\n`);
    return 0;
  }
  const ui = (values.ui ?? process.env.PAYEE_UI_URL ?? "http://localhost:3100").replace(/\/+$/, "");
  const api = (values.api ?? process.env.PAYEE_API_URL ?? "http://localhost:8787").replace(/\/+$/, "");
  const out = path.resolve(values.out ?? path.join(ROOT, "docs/video/raw"));
  const scale = Number(values.scale ?? "2");
  const given = new Map((values.run ?? "").split(",").filter(Boolean).map((p) => p.split("=") as [string, string]));
  mkdirSync(out, { recursive: true });

  const browser = await chromium.launch({ headless: !values.headed, args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
  let failed = 0;
  for (const slot of chosen) {
    const fn = (SLOTS as Record<string, SlotFn | undefined>)[slot.id];
    if (!fn || slot.id === "R10") {
      process.stdout.write(`skip  ${slot.id}  ${fn ? "recorded by zetaris.ts" : "no recorder"}\n`);
      continue;
    }
    // Reads of finished runs are retried once (a cold Next dev compile can stall the first load); slots that start real runs are not.
    const tries = ["R04", "R05", "R06"].includes(slot.id) ? 1 : 2;
    let ok = false;
    for (let attempt = 1; attempt <= tries && !ok; attempt++) {
      const last = attempt === tries;
      ok = await (async (): Promise<boolean> => {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale, colorScheme: "dark", locale: "en-US" });
      const page = await context.newPage();
      await page.addInitScript(`document.addEventListener("DOMContentLoaded",()=>{const s=document.createElement("style");s.textContent=${JSON.stringify(HIDE_DEV_BADGE)};document.head.append(s)})`);
      await installCursor(page);
      const used: Record<string, string> = {};
      const ctx: Ctx = {
        page,
        ui,
        api,
        log: (l) => process.stdout.write(`      ${l}\n`),
        async run(request) {
          const key = Object.entries(REQ).find(([, v]) => v === request)?.[0];
          const id = given.get(request) ?? (key ? given.get(key) : undefined) ?? (await newestDecidedRun(api, request));
          if (!id) throw new Error(`no finished run for ${request}; pass --run ${key ?? request}=<run_id>`);
          used[request] = id;
          return id;
        },
      };
      const file = path.join(out, slot.file);
      const t0 = Date.now();
      const startedAt = new Date().toISOString();
      try {
        await page.goto(`${ui}/app`, { waitUntil: "domcontentloaded" }); // warm the app before the camera rolls
        await page.waitForTimeout(800);
        const cap = await startCapture(context, page, { workDir: path.join(out, `.frames-${slot.id}`), scale, ...(values["keep-frames"] ? { keepFrames: true } : {}) });
        let err: unknown = null;
        await fn(ctx).catch((e: unknown) => (err = e));
        const r = await cap.stop(file);
        if (err) throw err;
        writeFileSync(`${file}.json`, `${JSON.stringify({ slot: slot.id, file: slot.file, started_at: startedAt, seconds: Number(r.seconds.toFixed(1)), target_seconds: slot.seconds, frames: r.frames, scale, ui, runs: used }, null, 2)}\n`);
        process.stdout.write(`ok    ${slot.id}  ${slot.file}  ${r.seconds.toFixed(1)} s (target ${slot.seconds})  ${r.frames} frames  ${((Date.now() - t0) / 1000).toFixed(0)} s wall\n`);
        return true;
      } catch (e) {
        process.stdout.write(`${last ? "FAIL " : "retry"} ${slot.id}  ${e instanceof Error ? e.message.split("\n")[0] : "unknown"}\n`);
        return false;
      } finally {
        await context.close();
      }
      })();
    }
    if (!ok) failed++;
  }
  await browser.close();
  return failed ? 1 : 0;
}

process.exit(await main());
