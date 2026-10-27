// Beats 1 to 6 of the insurance walkthrough: the inbox, the S1 request, the letter, the decision, the evidence drawer
// and the one live Re-run in Zetaris. Every pointer move is cued to the narrated word.
import { click, glide, moveTo } from "../cursor";
import { T, glideTo, hover, moveFrac, openReview, pause, safe, type Stage } from "./stage";

export async function inbox(s: Stage): Promise<void> {
  const p = s.page;
  await p.waitForSelector(T("inbox-item-BCR-2026-0443"), { timeout: 30_000 });
  await pause(500);
  const c = s.track.say("i01");
  await moveTo(p, 1000, 480);
  await c.cue("bank details", 0.4);
  await safe(s, "row1", () => hover(p, p.locator(T("inbox-item-BCR-2026-0443")).first(), 600));
  await c.cue("Policy says", 0.4);
  await safe(s, "row2", () => hover(p, p.locator(T("inbox-item-BCR-2026-0431")).first(), 600));
  await c.cue("four systems", 0.4);
  await safe(s, "row3", () => hover(p, p.locator(T("inbox-item-BCR-2026-0416")).first(), 600));
  await c.cue("waiting", 1.8);
  await safe(s, "decided-tab", () => click(p, p.getByRole("tab", { name: /^decided/i })));
  await pause(600);
  await safe(s, "scroll-to-s1", async () => glideTo(p, p.locator(T("inbox-item-BCR-2026-0412")).first(), 420, 1500));
  await c.end(0.25);
}

export async function openS1(s: Stage): Promise<void> {
  const p = s.page;
  const c = s.track.say("i02");
  const row = p.locator(T("inbox-item-BCR-2026-0412")).first();
  await safe(s, "open-s1", async () => {
    await hover(p, row.locator(T("open-button")), 200);
    await c.cue("Booz", 0);
    await click(p, row.locator(T("open-button")));
    await p.waitForURL(/\/app\/review\//, { timeout: 30_000 });
    await p.waitForSelector(`${T("decision-card")}[data-decision]`, { timeout: 45_000 });
  });
  if (!p.url().includes(s.runS1)) await openReview(s, s.runS1);
  await c.cue("Three payments", 0.4);
  await safe(s, "exposure-1", () => moveFrac(p, p.locator(T("exposure-strip")), 0.32, 0.5, 300));
  await c.cue("due Friday", 0.6);
  await safe(s, "exposure-2", () => moveFrac(p, p.locator(T("exposure-strip")), 0.08, 0.5, 300));
  await c.end(0.3);
}

export async function letterThenDecision(s: Stage): Promise<void> {
  const p = s.page;
  const c = s.track.say("i03");
  await safe(s, "show-letter", async () => {
    await click(p, p.locator(T("show-letter")));
    await p.waitForSelector(T("letter-page"), { timeout: 15_000 }).catch(() => undefined);
  });
  await c.cue("quoted claims", 0.5);
  await safe(s, "claims", () => hover(p, p.locator(T("claims-list")).first(), 900));
  await c.cue("points back", 0.2);
  await safe(s, "highlight", () => hover(p, p.locator(T("letter-highlight")).first(), 700));
  await c.end(0.25);
  // The letter pane stays open once shown, and the watermark printed in the letter would stay on screen: reload to the decision view.
  await openReview(s, s.runS1);
  const d = s.track.say("i04");
  await safe(s, "banner", () => hover(p, p.locator(T("decision-banner")), 300));
  await d.cue("new address", 0.5);
  await safe(s, "r3", () => hover(p, p.locator(T("reason-code")).nth(0), 400));
  await d.cue("bank account", 0.5);
  await safe(s, "r6", () => hover(p, p.locator(T("reason-code")).nth(1), 400));
  await d.cue("sender's domain", 0.6);
  await safe(s, "r1", () => hover(p, p.locator(T("reason-code")).nth(2), 400));
  await d.cue("Code decides", 0);
  await safe(s, "to-facts", async () => {
    await moveTo(p, 960, 640);
    await glide(p, 1960, 2300);
  });
  await d.end(0.2);
}

/** Evidence drawer and the single Re-run in Zetaris. Returns true when the re-run matched. */
export async function drawerAndRerun(s: Stage): Promise<boolean> {
  const p = s.page;
  const c = s.track.say("i05");
  await c.cue("evidence drawer", 0.9);
  await safe(s, "cell", async () => {
    await click(p, p.locator(T("fact-cell-remit_address-usaspending")));
    await p.waitForSelector(T("evidence-drawer"), { timeout: 20_000 });
  });
  await c.cue("exact Zetaris query", 0.3);
  await safe(s, "sql", () => hover(p, p.locator(T("evidence-sql")).first(), 400));
  await c.cue("rows it returned", 0.4);
  await safe(s, "drawer-down", async () => {
    await moveTo(p, 1640, 640);
    await glide(p, 480, 2200);
  });
  await c.cue("lineage back", 0.5);
  await safe(s, "drawer-up", () => glide(p, -480, 1500));
  await c.cue("re-run that query", 1.2);
  const btn = p.locator(T("rerun-button"));
  await safe(s, "rerun-hover", () => hover(p, btn, 200));
  await c.cue("right here", 0.1);
  if (s.dry) {
    await c.end(0.1);
    await p.keyboard.press("Escape");
    await pause(700);
    return false;
  }
  await safe(s, "rerun-click", () => click(p, btn));
  await c.end(0.1);
  await safe(s, "rerun-result", async () => {
    await p.waitForSelector(T("rerun-result"), { timeout: 150_000 });
  });
  s.releaseLock();
  const attr = await p.locator(T("rerun-result-text")).first().getAttribute("data-match").catch(() => null);
  const matched = attr === "true";
  if (matched) {
    const r = s.track.say("i06");
    await safe(s, "result-hover", () => hover(p, p.locator(T("rerun-result")).first(), 500));
    await r.end(1.0);
  } else {
    s.warnings.push(`rerun did not report a match (data-match=${String(attr)}); i06 left out`);
    await pause(2500);
  }
  await p.keyboard.press("Escape");
  await pause(700);
  return matched;
}
