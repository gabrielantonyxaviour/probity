// Zetaris challenge cut: real repository text as footage, in the same plain monospace viewer as terminal.ts.
// Every excerpt is copied verbatim from a file and asserted to exist in it before anything is drawn (a missing needle fails
// the scene), and the rendered text is refused if it carries a banned label. The viewer replays nothing.
//
//   npx tsx scripts/record/zetaris-terminal.ts --scene grok    --out docs/zetaris-challenge/raw   # zetaris-grok.mp4
//   npx tsx scripts/record/zetaris-terminal.ts --scene moments --out docs/zetaris-challenge/raw   # zetaris-moments.mp4
//   --scale 1|2   --headed
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "@playwright/test";
import { startCapture } from "./capture";
import { dwell, glide, installCursor } from "./cursor";
import { ROOT } from "./env";

type Pane = { title: string; text: string; hold: number; scroll?: number };
const BANNED = /synthetic|fictional|demo scenario|do not call|test routing|\(demo\)/i;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const abs = (rel: string) => (path.isAbsolute(rel) ? rel : path.join(ROOT, rel));
const read = (rel: string): string => {
  if (!existsSync(abs(rel))) throw new Error(`missing source file ${rel}`);
  return readFileSync(abs(rel), "utf8");
};
const MOMENTS = path.resolve(ROOT, "../_docs/zetaris-moments.md");

const wrapAt = (s: string, w: number, indent: string) => s.replace(new RegExp(`(.{1,${w}})(\\s|$)`, "g"), `$1\n${indent}`).trimEnd();

const trimWord = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n).replace(/\s+\S*$/, "")} ...`);

/** The slice header (`=== SLICE 1 <utc> ===`) in force at the needle, or the stated label. */
function excerpt(rel: string, needle: string, label?: string): string {
  const src = read(rel);
  const at = src.indexOf(needle);
  if (at < 0) throw new Error(`excerpt not found in ${rel}: ${needle.slice(0, 60)}`);
  let head = label ?? "";
  if (!head) {
    for (const m of src.slice(0, at).matchAll(/=== (slice|SLICE) (\d+) ([^=]+?) ===/g)) head = `slice ${m[2]}, ${m[3]}`;
  }
  return `${rel.replace(/^.*\/(lanes|zetaris)\//, "$1/")}  (${head})\n  ${wrapAt(needle, 104, "  ")}\n`;
}

function grokPanes(): Pane[] {
  const contract = read("zetaris/GROK_CONTRACT.md").split("\n");
  const pick = (start: string) => contract.find((l) => l.startsWith(start)) ?? "";
  const head = [contract[0], pick("- No git commit"), pick("- Do not restart"), pick("- Edit ONLY")]
    .filter(Boolean)
    .map((l) => l!.split(/(?<=\.)\s+/).reduce((acc, sent) => (acc && acc.length + sent.length > 200 ? acc : `${acc} ${sent}`.trim()), ""))
    .join("\n\n");
  const L = "lanes/grok-zetaris-session.log";
  const W = "lanes/grok-zetaris-wire-session.log";
  const S = "zetaris/grok-session.log";
  const log = [
    excerpt(S, "The USAspending failure is an HTML page: Zetaris is sent the browsable API unless the table sets `Accept: application/json`."),
    excerpt(S, "The 12-table compile was rejected. The toy compile, which has a semicolon between tables, succeeded, so I am comparing that payload with the vendor360 DDL."),
    excerpt(S, "The Zetaris lane is live and the second registration finished with exit 0."),
    excerpt(L, "The Zetaris driver restarted on its own while the gateway database create was in flight."),
    excerpt(L, "The invalid count did not move by one: it stayed at 3, jumped to 11 on the follow-up, then returned to 3."),
    excerpt(W, "The contract is specific: DQ8 gets registered, DQ7 and DQ9 stay select-only, and T23 is a DDL-kind profile."),
    excerpt(W, "Query `69140160-985b-481e-992e-b820e7549924`, 24120 ms, 1 row, 14 columns, 8 payment items, exposure 2578271.76, hash `0f35932553f8614e`."),
    excerpt("lanes/grok-e2e-depth-session.log", "DQ7 vendor ids. Sweep on that run: DQ7 invalid 2 of 52, `findings` `[]`, JSON has no `V-10233` or `V-10234`. Trace seq 47 names both vendors.", "independent end-to-end suite, report of the 16:29Z slice"),
  ];
  const rows = JSON.parse(read("zetaris/results/kill_verdicts.json")) as Array<{ id: string; pass: boolean | null; evidence: string; at: string }>;
  const verdicts = rows.map((v) => `${v.id.padEnd(6)} ${(v.pass === null ? "NOT RUN" : v.pass ? "pass" : "FAIL").padEnd(8)} ${v.at.slice(11, 19)}Z  ${trimWord(v.evidence, 84)}`).join("\n");
  const tally = `${rows.length} checks: ${rows.filter((v) => v.pass === true).length} passed, ${rows.filter((v) => v.pass === false).length} failed, ${rows.filter((v) => v.pass === null).length} not run (${rows.filter((v) => v.pass === null).map((v) => v.id).join(", ")})`;
  return [
    { title: "zetaris/GROK_CONTRACT.md  (the written contract Grok worked under)", text: head, hold: 4000 },
    { title: "Grok's own session logs, verbatim, each with its UTC slice time", text: log.slice(0, 4).join("\n"), hold: 8500 },
    { title: "Grok's own session logs, verbatim, each with its UTC slice time", text: log.slice(4).join("\n"), hold: 10000 },
    { title: "zetaris/results/kill_verdicts.json  (what Grok verified, and what it left unverified)", text: `${verdicts}\n\n${tally}`, hold: 9000 },
  ];
}

/** Rows of _docs/zetaris-moments.md by timestamp prefix, cells verbatim. */
function momentCard(stamp: string): string {
  const row = read(MOMENTS).split("\n").find((l) => l.startsWith(`| ${stamp} |`));
  if (!row) throw new Error(`no moments row for ${stamp}`);
  const [, when, tried, happened, saved] = row.split("|").map((c) => c.trim());
  const wrap = (s: string) => wrapAt(s, 96, "            ");
  return `${when}  UTC\n\ntried     ${wrap(tried ?? "")}\n\nhappened  ${wrap(happened ?? "")}\n\nsaved     ${wrap(saved ?? "")}\n`;
}

function momentsPanes(): Pane[] {
  const t = "_docs/zetaris-moments.md  (the log we kept while building, one row per moment)";
  return [
    { title: t, text: momentCard("2026-10-27 12:13"), hold: 5600 },
    { title: t, text: momentCard("2026-10-27 12:43"), hold: 14100 },
    { title: t, text: momentCard("2026-10-27 15:57"), hold: 21100 },
  ];
}

const html = (p: Pane) => `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0c0c0b;color:#e8e4d8;font:24px/1.55 'JetBrains Mono','SF Mono',Menlo,monospace">
<div style="position:sticky;top:0;background:#171715;border-bottom:1px solid #2a2a27;padding:16px 40px;color:#9a968a;font-size:20px">${esc(p.title)}</div>
<pre style="margin:0;padding:32px 40px 700px;white-space:pre-wrap;word-break:break-word;max-width:1700px">${esc(p.text).replace(/^(\S[^\n]*\(slice[^\n]*\))$/gm, '<b style="color:#7fd1b9">$1</b>').replace(/^(\S[^\n]*\(independent[^\n]*\))$/gm, '<b style="color:#7fd1b9">$1</b>').replace(/^(2026-10-27 \d\d:\d\d {2}UTC)/m, '<b style="color:#7fd1b9">$1</b>')}</pre>`;

async function show(page: Page, p: Pane): Promise<void> {
  await page.setContent(html(p));
  await dwell(p.hold);
  if (p.scroll) await glide(page, p.scroll, Math.min(9000, p.scroll * 5));
  await dwell(900);
}

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { scene: { type: "string" }, out: { type: "string" }, scale: { type: "string" }, headed: { type: "boolean" } } });
  const scene = values.scene ?? "grok";
  if (scene !== "grok" && scene !== "moments") throw new Error("scene must be: grok, moments");
  const panes = scene === "grok" ? grokPanes() : momentsPanes();
  const banned = panes.map((p) => p.text.match(BANNED)?.[0]).find(Boolean);
  if (banned) throw new Error(`rendered text carries a banned label: ${banned}`);
  const scale = Number(values.scale ?? "2");
  const out = path.resolve(values.out ?? path.join(ROOT, "docs/zetaris-challenge/raw"));
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: !values.headed, args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale, colorScheme: "dark" });
  const page = await context.newPage();
  await installCursor(page);
  try {
    await page.setContent(html(panes[0]!));
    const cap = await startCapture(context, page, { workDir: path.join(out, `.frames-zt-${scene}`), scale });
    for (const p of panes) await show(page, p);
    await page.evaluate(() => { document.body.style.opacity = "0.995"; }); // the screencast sends frames on change only; this closes the last hold
    await dwell(500);
    const file = path.join(out, `zetaris-${scene}.mp4`);
    const r = await cap.stop(file);
    writeFileSync(`${file}.json`, `${JSON.stringify({ scene, seconds: Number(r.seconds.toFixed(1)), frames: r.frames, scale, panes: panes.map((p) => p.title) }, null, 2)}\n`);
    process.stdout.write(`ok    zetaris-${scene}.mp4  ${r.seconds.toFixed(1)} s  ${r.frames} frames\n`);
    return 0;
  } catch (e) {
    process.stdout.write(`FAIL  ${e instanceof Error ? e.message.split("\n")[0] : "unknown"}\n`);
    return 1;
  } finally {
    await browser.close();
  }
}

process.exit(await main());
