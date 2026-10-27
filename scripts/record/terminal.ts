// Records a real repository file as footage, in a plain monospace viewer with the file's path in the title bar.
// Used for the Zetaris challenge cut's Grok beat: the contract header, the session log (one block per slice, each with its
// UTC time) and kill_verdicts.json. The viewer shows file contents verbatim; it does not run or replay anything.
//
//   npx tsx scripts/record/terminal.ts --scene grok --out docs/zetaris-challenge/raw   # grok-session.mp4
//   --scale 1|2   --headed
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "@playwright/test";
import { startCapture } from "./capture";
import { dwell, glide, installCursor } from "./cursor";
import { ROOT } from "./env";

type Pane = { title: string; text: string };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const read = (rel: string) => (existsSync(path.join(ROOT, rel)) ? readFileSync(path.join(ROOT, rel), "utf8") : "");

function grokPanes(): Pane[] {
  const contract = read("zetaris/GROK_CONTRACT.md").split("\n").slice(0, 8).join("\n");
  // The log has no line break between a slice's prose and the next header; show one slice per block.
  const log = read("zetaris/grok-session.log").replace(/(=== SLICE)/g, "\n\n$1").trim();
  const rows = JSON.parse(read("zetaris/results/kill_verdicts.json") || "[]") as Array<{ id: string; pass: boolean | null; evidence: string; at: string }>;
  const verdicts = rows.map((v) => `${v.id.padEnd(7)} ${String(v.pass).padEnd(5)} ${v.at}  ${v.evidence.slice(0, 118)}`).join("\n");
  return [
    { title: "zetaris/GROK_CONTRACT.md (first lines)", text: contract },
    { title: "zetaris/grok-session.log", text: log },
    { title: "zetaris/results/kill_verdicts.json (id, pass, time, evidence)", text: verdicts },
  ];
}

const html = (p: Pane) => `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0c0c0b;color:#e8e4d8;font:22px/1.5 'JetBrains Mono','SF Mono',Menlo,monospace">
<div style="position:sticky;top:0;background:#171715;border-bottom:1px solid #2a2a27;padding:16px 40px;color:#9a968a;font-size:20px">${esc(p.title)}</div>
<pre style="margin:0;padding:32px 40px 600px;white-space:pre-wrap;word-break:break-word;max-width:1640px">${esc(p.text).replace(/(=== SLICE \d+ [0-9TZ:-]+ ===)/g, '<b style="color:#7fd1b9">$1</b>')}</pre>`;

async function show(page: Page, p: Pane, hold: number, scrollPx: number): Promise<void> {
  await page.setContent(html(p));
  await dwell(hold);
  if (scrollPx > 0) await glide(page, scrollPx, Math.min(9000, scrollPx * 5));
  await dwell(900);
}

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { scene: { type: "string" }, out: { type: "string" }, scale: { type: "string" }, headed: { type: "boolean" } } });
  if ((values.scene ?? "grok") !== "grok") throw new Error("scene must be: grok");
  const scale = Number(values.scale ?? "2");
  const out = path.resolve(values.out ?? path.join(ROOT, "docs/zetaris-challenge/raw"));
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: !values.headed, args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale, colorScheme: "dark" });
  const page = await context.newPage();
  await installCursor(page);
  try {
    const panes = grokPanes();
    await page.setContent(html(panes[0]!));
    const cap = await startCapture(context, page, { workDir: path.join(out, ".frames-grok"), scale });
    await show(page, panes[0]!, 2500, 0);
    await show(page, panes[1]!, 1500, 1900);
    await show(page, panes[2]!, 3000, 300);
    const file = path.join(out, "grok-session.mp4");
    const r = await cap.stop(file);
    writeFileSync(`${file}.json`, `${JSON.stringify({ scene: "grok", seconds: Number(r.seconds.toFixed(1)), frames: r.frames, scale, sources: ["zetaris/GROK_CONTRACT.md", "zetaris/grok-session.log", "zetaris/results/kill_verdicts.json"] }, null, 2)}\n`);
    process.stdout.write(`ok    grok-session.mp4  ${r.seconds.toFixed(1)} s  ${r.frames} frames\n`);
    return 0;
  } catch (e) {
    process.stdout.write(`FAIL  ${e instanceof Error ? e.message.split("\n")[0] : "unknown"}\n`);
    return 1;
  } finally {
    await browser.close();
  }
}

process.exit(await main());
