// Title and end cards in the Griffin style (Newsreader light serif, Hanken Grotesk, IBM Plex Mono caps), rendered from
// the production app's own fonts and tokens, and the caption strips burned in by the mux.
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { Browser, Page } from "@playwright/test";
import { startCapture } from "../capture";

const CSS = `
@keyframes up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.a{opacity:0;animation:up 1s cubic-bezier(.2,.7,.2,1) forwards}
.mono{font-family:var(--font-mono);font-size:15px;letter-spacing:.06em;text-transform:uppercase;font-feature-settings:"zero" 1}
.serif{font-family:var(--font-serif);font-weight:300;letter-spacing:-.03em;font-optical-sizing:auto}
`;

const START = `
<div style="width:1260px">
  <div class="a mono" style="color:var(--fg-muted);animation-delay:.1s">Open Agent Hackathon 2026 &nbsp;·&nbsp; Solving fragmented intelligence</div>
  <div class="a" style="display:flex;align-items:center;gap:26px;margin:46px 0 30px;animation-delay:.5s">
    <span style="width:68px;height:68px;border:2px solid var(--fg-2);border-radius:14px;display:grid;place-items:center;font-size:40px;color:var(--fg)">&#10003;</span>
    <span class="serif" style="font-size:132px;line-height:1">Probity</span>
  </div>
  <div class="a serif" style="font-size:62px;line-height:1.08;animation-delay:1s;white-space:nowrap">Before the money moves, <span style="color:var(--fg-muted)">prove who is asking.</span></div>
  <div class="a" style="height:1px;background:var(--rule-strong);margin:54px 0 26px;animation-delay:1.5s"></div>
  <div class="a mono" style="color:var(--fg-2);animation-delay:1.6s">Agents that verify vendor bank-change requests</div>
</div>`;

const END = `
<div style="width:1260px">
  <div class="a" style="display:flex;align-items:center;gap:22px;animation-delay:.1s">
    <span style="width:52px;height:52px;border:2px solid var(--fg-2);border-radius:11px;display:grid;place-items:center;font-size:30px">&#10003;</span>
    <span class="serif" style="font-size:84px;line-height:1">Probity</span>
  </div>
  <div class="a serif" style="font-size:58px;line-height:1.1;margin-top:34px;animation-delay:.5s">Verify the bank change <span style="color:var(--fg-muted)">before the money moves.</span></div>
  <div class="a" style="height:1px;background:var(--rule-strong);margin:44px 0 30px;animation-delay:1s"></div>
  <div class="a" style="font-family:var(--font-sans);font-weight:300;font-size:25px;line-height:1.5;color:var(--fg-2);max-width:1120px;animation-delay:1.2s">
    <span style="color:var(--fg)">Grok (xAI) built the Zetaris data layer</span> (source registration, the unified vendor360 layer, data-quality rules, live checks) and wrote the independent end-to-end test suite. <span style="color:var(--fg)">Claude Code built the agents and the interface.</span>
  </div>
  <div class="a mono" style="color:var(--fg-muted);margin-top:34px;line-height:1.9;animation-delay:1.6s">
    Registry facts &nbsp;·&nbsp; Zetaris queries<br>Readings &nbsp;·&nbsp; NVIDIA Nemotron through Nightshift<br>Memory &nbsp;·&nbsp; World Model
  </div>
  <div class="a mono" style="color:var(--fg-2);margin-top:34px;animation-delay:2s">github.com/gabrielantonyxaviour/probity</div>
</div>`;

async function paint(page: Page, ui: string, html: string): Promise<void> {
  await page.goto(`${ui}/app`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  await page.evaluate(
    ({ css, body }) => {
      document.body.innerHTML = `<style>${css}</style><div style="position:fixed;inset:0;background:var(--bg-canvas);color:var(--fg);display:grid;place-items:center;font-family:var(--font-sans)">${body}</div>`;
    },
    { css: CSS, body: html },
  );
  await page.evaluate(() => document.fonts.ready.then(() => document.fonts.load('300 70px var(--font-serif)')).catch(() => undefined));
  await page.waitForTimeout(500);
}

/** Records the card's entrance animation, then holds. The mux pads the last frame to the planned length. */
export async function renderCard(browser: Browser, ui: string, kind: "start" | "end", outFile: string, holdMs: number): Promise<number> {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, colorScheme: "dark" });
  const page = await ctx.newPage();
  const work = `${outFile}.frames`;
  try {
    await paint(page, ui, kind === "start" ? START : END);
    // Replay the entrance from the top so the camera sees it.
    await page.evaluate(() => document.querySelectorAll<HTMLElement>(".a").forEach((e) => { e.style.animation = "none"; e.style.opacity = "0"; }));
    const cap = await startCapture(ctx, page, { workDir: work, scale: 2 });
    await page.evaluate(() => document.querySelectorAll<HTMLElement>(".a").forEach((e) => { e.style.animation = ""; e.style.opacity = ""; }));
    await page.waitForTimeout(holdMs);
    const r = await cap.stop(outFile);
    return r.seconds;
  } finally {
    rmSync(work, { recursive: true, force: true });
    await ctx.close();
  }
}

export type CaptionItem = { text: string; start: number; end: number };

/** One transparent 1920x220 PNG per caption, plus a blank one. Returns the file for each item and the blank. */
export async function renderCaptions(browser: Browser, ui: string, items: CaptionItem[], dir: string): Promise<{ files: string[]; blank: string }> {
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto(`${ui}/app`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    document.documentElement.style.cssText += ";background:transparent!important";
    document.body.style.cssText += ";background:transparent!important";
    document.body.innerHTML = '<div id="strip" style="position:fixed;left:0;right:0;bottom:0;height:220px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:46px"></div>';
  });
  const files: string[] = [];
  const shot = async (name: string, text: string): Promise<string> => {
    await page.evaluate((t) => {
      const el = document.getElementById("strip")!;
      el.innerHTML = t ? `<div style="max-width:1480px;text-align:center;padding:12px 28px 14px;border-radius:14px;background:rgba(12,12,11,.84);color:#f9f5ef;font-family:var(--font-sans);font-weight:400;font-size:38px;line-height:1.28;letter-spacing:-.005em">${t.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>` : "";
    }, text);
    const f = path.join(dir, name);
    await page.screenshot({ path: f, omitBackground: true, clip: { x: 0, y: 860, width: 1920, height: 220 } });
    return f;
  };
  const blank = await shot("blank.png", "");
  for (let i = 0; i < items.length; i++) files.push(await shot(`c${String(i).padStart(3, "0")}.png`, items[i]!.text));
  await ctx.close();
  return { files, blank };
}
