// Records the Zetaris console (http://localhost:3000) for R10 (LIST DQ USL, RUN DQ) and for the Zetaris challenge cut
// (the product's query history). The sign-in uses the local platform's admin login from ../zetaris-platform/.env,
// read in this process and never printed. Statements are typed into the real SQL Workspace and run with its Run button.
//
//   npx tsx scripts/record/zetaris.ts --scene dq --out docs/video/raw        # R10: v08-zetaris-dq.mp4
//   npx tsx scripts/record/zetaris.ts --scene history --out docs/zetaris-challenge/raw
//   npx tsx scripts/record/zetaris.ts --scene usl --out docs/zetaris-challenge/raw    # the sources and SHOW NAMESPACES (vendor360, 12)
//   --scale 1|2   --headed   --zui http://localhost:3000
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "@playwright/test";
import { startCapture } from "./capture";
import { click, dwell, hover, moveTo, typeHuman } from "./cursor";
import { ROOT, readEnvFile } from "./env";

const NS = "lightning.metastore.probity.vendor360";
const SCENES: Record<string, { file: string; run: (p: Page) => Promise<void> }> = {
  dq: { file: "v08-zetaris-dq.mp4", run: dqScene },
  history: { file: "zetaris-history.mp4", run: historyScene },
  usl: { file: "zetaris-usl.mp4", run: uslScene },
};

async function signIn(p: Page, email: string, password: string): Promise<void> {
  await p.goto(`${process.env.ZUI ?? "http://localhost:3000"}/login`, { waitUntil: "domcontentloaded" });
  const user = p.locator('input[type="text"]');
  await user.waitFor({ timeout: 30_000 });
  await click(p, user);
  await typeHuman(p, email);
  await click(p, p.locator('input[type="password"]'));
  await p.keyboard.type(password, { delay: 40 });
  await click(p, p.getByRole("button", { name: /sign in/i }));
  await p.waitForSelector("text=AI Data Gateway", { timeout: 60_000 });
}

async function openWorkspace(p: Page): Promise<void> {
  const sql = p.locator("button:has-text('SQL Workspace')").first();
  await sql.waitFor({ timeout: 15_000 });
  await click(p, sql);
  await click(p, p.getByText("New Query").first());
  await p.waitForSelector(".monaco-editor", { timeout: 30_000 });
  await dwell(900);
}

async function runStatement(p: Page, sql: string): Promise<void> {
  const editor = p.locator(".monaco-editor").first();
  await click(p, editor);
  await p.keyboard.press("Meta+a");
  await p.keyboard.press("Backspace");
  await typeHuman(p, sql);
  await p.keyboard.press("Escape"); // close any suggestion popup without accepting it
  await dwell(700);
  const play = p.locator("button:has(svg.lucide-play), button[title*='Run' i], button[aria-label*='Run' i]").first();
  if (await play.count()) await click(p, play);
  else {
    await moveTo(p, 1558, 121);
    await p.mouse.down();
    await p.mouse.up();
  }
  await p.waitForSelector("text=/Total Count/", { timeout: 420_000 }); // the workspace shows this footer once rows are back; a loaded Spark can take minutes
  await dwell(2600);
}

async function dqScene(p: Page): Promise<void> {
  await openWorkspace(p);
  await runStatement(p, `LIST DQ USL ${NS}`);
  await runStatement(p, `RUN DQ account_single_vendor TABLE ${NS}.payment_run_item`);
  await hover(p, p.locator("text=invalid_record").first(), 1800).catch(() => undefined);
}

/** Home cards (the registered sources and the one USL), then SHOW NAMESPACES in the SQL Workspace: vendor360, 12 tables.
 *  (The Data Explorer's USL node did not finish loading while the stack was busy, so the statement is the reliable view.) */
async function uslScene(p: Page): Promise<void> {
  await dwell(1500);
  await hover(p, p.locator("button:has-text('Register Data Source')").first(), 2200);
  await hover(p, p.locator("button:has-text('Unified Semantic Layer')").last(), 1800);
  await openWorkspace(p);
  await runStatement(p, "SHOW NAMESPACES OR TABLES IN lightning.metastore.probity");
}

async function historyScene(p: Page): Promise<void> {
  await openWorkspace(p);
  await click(p, p.getByText("History").first());
  await dwell(3500);
  await hover(p, p.locator("text=/vendor360|probity/i").first(), 2500).catch(() => undefined);
}

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { scene: { type: "string" }, out: { type: "string" }, scale: { type: "string" }, headed: { type: "boolean" }, zui: { type: "string" } } });
  const scene = SCENES[values.scene ?? "dq"];
  if (!scene) throw new Error(`scene must be one of ${Object.keys(SCENES).join(", ")}`);
  if (values.zui) process.env.ZUI = values.zui;
  const env = readEnvFile(path.resolve(ROOT, "../zetaris-platform/.env"));
  if (!env.ZETARIS_ADMIN_EMAIL || !env.ZETARIS_ADMIN_PASSWORD) throw new Error("zetaris-platform/.env has no admin login");
  const scale = Number(values.scale ?? "2");
  const out = path.resolve(values.out ?? path.join(ROOT, "docs/video/raw"));
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: !values.headed, args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale, colorScheme: "dark" });
  const page = await context.newPage();
  const { installCursor } = await import("./cursor");
  await installCursor(page);
  try {
    await page.goto(`${process.env.ZUI ?? "http://localhost:3000"}/login`, { waitUntil: "domcontentloaded" });
    const cap = await startCapture(context, page, { workDir: path.join(out, `.frames-zetaris-${values.scene ?? "dq"}`), scale });
    let err: unknown = null;
    await (async () => {
      await signIn(page, env.ZETARIS_ADMIN_EMAIL!, env.ZETARIS_ADMIN_PASSWORD!);
      await scene.run(page);
    })().catch((e: unknown) => (err = e));
    const file = path.join(out, scene.file);
    const r = await cap.stop(file);
    if (err) throw err;
    writeFileSync(`${file}.json`, `${JSON.stringify({ scene: values.scene ?? "dq", file: scene.file, seconds: Number(r.seconds.toFixed(1)), frames: r.frames, scale, recorded_at: new Date().toISOString() }, null, 2)}\n`);
    process.stdout.write(`ok    ${scene.file}  ${r.seconds.toFixed(1)} s  ${r.frames} frames\n`);
    return 0;
  } catch (e) {
    process.stdout.write(`FAIL  ${e instanceof Error ? e.message.split("\n")[0] : "unknown"}\n`);
    return 1;
  } finally {
    await browser.close();
  }
}

process.exit(await main());
