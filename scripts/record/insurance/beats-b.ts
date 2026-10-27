// Beats 7 to 12: graph, call-back, sweep and exposure, dossier, why it is trustworthy, and the S3 approve.
import { click, glide, moveTo } from "../cursor";
import { T, glideTo, hover, moveFrac, openReview, pause, safe, toTop, type Stage } from "./stage";

export async function graph(s: Stage): Promise<void> {
  const p = s.page;
  const c = s.track.say("i07");
  const canvas = p.locator(T("graph-canvas"));
  await safe(s, "to-graph", () => glideTo(p, p.locator(T("entity-graph")), 70, 2600));
  await c.cue("what the request claims", 0.5);
  await safe(s, "col1", () => moveFrac(p, canvas, 0.14, 0.45));
  await c.cue("what our records say", 0.5);
  await safe(s, "col2", () => moveFrac(p, canvas, 0.4, 0.4));
  await c.cue("registries say", 0.5);
  await safe(s, "col3", () => moveFrac(p, canvas, 0.68, 0.4));
  await c.cue("decision path", 0.4);
  await safe(s, "quillan", () => hover(p, canvas.getByText(/Quillan Ridge/), 600));
  await c.cue("conflicts are marked", 0.5);
  await safe(s, "conflict", () => hover(p, canvas.getByText(/conflict/i), 600));
  await c.end(0.3);
}

export async function callback(s: Stage): Promise<void> {
  const p = s.page;
  const c = s.track.say("i08");
  await safe(s, "to-top", () => toTop(p, 1900));
  await c.cue("call-back is", 0.5);
  await safe(s, "number", () => hover(p, p.locator(T("callback-number")), 800));
  await c.cue("do not use", 0.5);
  await safe(s, "dnu", () => hover(p, p.locator(T("do-not-use")), 800));
  await c.cue("call script", 0.5);
  await safe(s, "script", () => hover(p, p.locator(T("callback-script")), 400));
  await c.end(0.3);
}

export async function sweep(s: Stage): Promise<void> {
  const p = s.page;
  const c = s.track.say("i09");
  await safe(s, "strip", () => moveFrac(p, p.locator(T("exposure-strip")), 0.45, 0.5, 300));
  await c.cue("rest of Friday", 0.3);
  await safe(s, "strip2", () => moveFrac(p, p.locator(T("exposure-strip")), 0.62, 0.5, 300));
  await c.cue("Two more payments", 1.2);
  await safe(s, "to-sweep", async () => {
    await moveTo(p, 960, 640);
    await glide(p, 1400, 2000);
  });
  await c.cue("fail payment controls", 0.3);
  await safe(s, "finding", () => hover(p, p.locator(T("sweep-finding")).first(), 500));
  await c.cue("data-quality rules", 0.3);
  await safe(s, "finding3", () => hover(p, p.locator(T("sweep-finding")).nth(2), 500));
  await c.end(0.3);
}

export async function dossier(s: Stage): Promise<void> {
  const p = s.page;
  await safe(s, "up", () => toTop(p, 1500));
  const c = s.track.say("i10");
  await c.cue("Everything exports", 0.3);
  await safe(s, "export", async () => {
    await click(p, p.locator(T("export-dossier")));
    await p.waitForURL(/\/dossier/, { timeout: 30_000 });
    await p.waitForSelector(T("dossier"), { timeout: 30_000 });
  });
  await c.cue("reasons", 0.2);
  await safe(s, "dos1", async () => {
    await moveTo(p, 960, 640);
    await glide(p, 760, 2600);
  });
  await c.cue("queries behind", 0.8);
  await safe(s, "dos2", () => glide(p, 760, 2200));
  await c.end(0.3);
}

export async function trust(s: Stage): Promise<void> {
  const p = s.page;
  await safe(s, "back", async () => {
    await click(p, p.getByRole("link", { name: /back to review/i }).first());
    await p.waitForSelector(`${T("decision-card")}[data-decision]`, { timeout: 45_000 });
  });
  if (!p.url().includes(`/review/${s.runS1}`) || p.url().includes("dossier")) await openReview(s, s.runS1);
  const c = s.track.say("i11");
  const tab = (name: RegExp) => p.getByRole("tab", { name }).first();
  await c.cue("Zetaris queries", 0.9);
  await safe(s, "tab-zetaris", () => click(p, tab(/^zetaris/i)));
  await safe(s, "rail-hover1", () => hover(p, p.locator(T("timeline-event")).first(), 500));
  await c.cue("Nemotron models", 0.9);
  await safe(s, "tab-models", () => click(p, tab(/^models/i)));
  await safe(s, "rail-hover2", () => hover(p, p.locator(T("timeline-event")).first(), 500));
  await c.cue("receipt", 0.3);
  await safe(s, "rail-hover3", () => hover(p, p.locator(T("timeline-event")).nth(1), 500));
  await c.cue("World Model", 0.9);
  await safe(s, "tab-key", () => click(p, tab(/^key steps/i)));
  await safe(s, "memory", () => hover(p, p.getByText(/world model/i), 500));
  await c.cue("unknown", 0.6);
  await safe(s, "coverage", () => hover(p, p.locator(T("coverage")).first(), 500));
  await c.end(0.4);
}

export async function approve(s: Stage): Promise<void> {
  const p = s.page;
  await openReview(s, s.runS3);
  const c = s.track.say("i12");
  await c.cue("approves", 0.5);
  await safe(s, "banner", () => hover(p, p.locator(T("decision-banner")), 500));
  await c.cue("call-back number", 0.5);
  await safe(s, "number", () => hover(p, p.locator(T("callback-number")), 600));
  await c.end(1.0);
  await pause(300);
}
