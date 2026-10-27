import { test, expect, type Locator, type Page } from "@playwright/test";
import { asRecord, getJson } from "../helpers/api";
import { pageOverflow } from "../helpers/layout";
import { latestS1Hold, listRuns } from "../helpers/runs";
import { attachClean } from "../helpers/watch";

const SIBLING = "KHK6E1JW9C15";
const DOMAIN = "boozallen-payments.example";

type GNode = { id: string; label: string; flags: string[]; keys?: { uei?: string } };
type GPayload = { nodes: GNode[]; edges: unknown[]; link_verdicts: unknown[] };

function graphOf(body: unknown): GPayload {
  const g = asRecord(body, "graph");
  expect(Array.isArray(g.nodes), "nodes").toBe(true);
  expect(Array.isArray(g.edges), "edges").toBe(true);
  expect(Array.isArray(g.link_verdicts), "link_verdicts").toBe(true);
  return g as GPayload;
}

function hasSibling(nodes: GNode[]): boolean {
  return nodes.some((n) => n.id.includes(SIBLING) || n.keys?.uei === SIBLING);
}

async function counts(scrub: Locator): Promise<{ nodes: number; edges: number }> {
  const live = scrub.locator("[aria-live='polite']");
  await expect(live).toHaveText(/\d+ nodes · \d+ edges known/);
  const m = (await live.innerText()).match(/(\d+) nodes · (\d+) edges/);
  expect(m, "scrubber counts").toBeTruthy();
  return { nodes: Number(m?.[1]), edges: Number(m?.[2]) };
}

async function openGraph(page: Page): Promise<{ width: "narrow" | "medium" | "wide" }> {
  const vp = page.viewportSize()?.width ?? 1440;
  const width = vp >= 1440 ? "wide" : vp >= 768 ? "medium" : "narrow";
  await expect(page.getByTestId("review-page")).toHaveAttribute("data-width", width);
  if (width !== "wide") await page.getByRole("tab", { name: "Graph" }).click();
  await expect(page.getByTestId("entity-graph")).toBeVisible();
  return { width };
}

test("S1 as-of scrubber changes the graph from request time to now", async ({ page, request }) => {
  const assertClean = attachClean(page);
  const ats: string[] = [];
  page.on("request", (req) => {
    if (!req.url().includes("/graph?at=")) return;
    ats.push(new URL(req.url()).searchParams.get("at") ?? "");
  });
  const run = await latestS1Hold(request);
  await page.goto(`/app/review/${run.run_id}`);
  await expect(page.getByTestId("decision-card")).toBeVisible();
  const { width } = await openGraph(page);
  const graph = page.getByTestId("entity-graph");
  if (width === "narrow") await expect(page.getByTestId("graph-table")).toBeVisible();
  const scrub = graph.getByTestId("graph-asof");
  await expect(scrub).toBeVisible();
  const range = graph.getByTestId("graph-asof-range");
  const time = graph.getByTestId("graph-asof-time");
  await expect(range).toBeVisible();
  await expect(graph.getByTestId("graph-asof-play")).toBeVisible();
  await expect(time).not.toHaveText(/^\s*$/);

  await range.focus();
  await range.press("Home");
  await expect(scrub.getByText("Request received").first()).toBeVisible();
  await expect.poll(() => ats.filter(Boolean).length).toBeGreaterThan(0);
  const at = [...ats].filter(Boolean).sort()[0] ?? "";
  await expect(time).toContainText(at.slice(11, 19));
  const earlyUi = await counts(scrub);
  const earlyRes = await getJson(request, `/runs/${encodeURIComponent(run.run_id)}/graph?at=${encodeURIComponent(at)}`);
  expect(earlyRes.status, "GET graph?at=").toBe(200);
  const early = graphOf(earlyRes.body);
  expect(early.nodes.length, "early node count").toBe(earlyUi.nodes);
  expect(early.edges.length, "early edge count").toBe(earlyUi.edges);
  expect(hasSibling(early.nodes), "sibling absent as of the request").toBe(false);
  expect(early.link_verdicts.length, "link verdicts as of the request").toBe(0);
  const earlyDomain = early.nodes.find((n) => n.label === DOMAIN);
  expect(earlyDomain, "lookalike domain as of the request").toBeTruthy();
  expect(earlyDomain?.flags ?? []).not.toContain("conflict");
  expect(earlyDomain?.flags ?? []).not.toContain("lookalike");

  const earlier = graph.getByRole("button", { name: "Earlier" });
  const later = graph.getByRole("button", { name: "Later" });
  await expect(earlier).toBeDisabled();
  const atReceived = await time.innerText();
  await later.click();
  await expect(time).not.toHaveText(atReceived);
  await earlier.click();
  await expect(time).toHaveText(atReceived);
  await expect(earlier).toBeDisabled();

  await softNoHScroll(page, "as-of graph on the default view");
  await range.focus();
  await range.press("End");
  await expect(scrub.getByText("Now", { exact: true }).first()).toBeVisible();
  const nowUi = await counts(scrub);
  expect(nowUi.nodes, "node count changes").not.toBe(earlyUi.nodes);
  expect(nowUi.edges, "edge count changes").not.toBe(earlyUi.edges);
  const nowRes = await getJson(request, `/runs/${encodeURIComponent(run.run_id)}/graph`);
  expect(nowRes.status, "GET graph").toBe(200);
  const now = graphOf(nowRes.body);
  expect(now.nodes.length, "now node count").toBe(nowUi.nodes);
  expect(now.edges.length, "now edge count").toBe(nowUi.edges);
  expect(hasSibling(now.nodes), "sibling present now").toBe(true);
  expect(now.link_verdicts.length, "link verdicts now").toBe(6);
  const nowDomain = now.nodes.find((n) => n.label === DOMAIN);
  expect(nowDomain?.flags ?? []).toEqual(expect.arrayContaining(["conflict", "lookalike"]));

  if (width === "narrow") await page.getByRole("button", { name: "Diagram", exact: true }).click();
  const sibling = graph.locator(`[data-node-id*="${SIBLING}"]`);
  const domain = graph.locator(`[data-node-id="domain:domain:${DOMAIN}"]`);
  await expect(sibling).toBeVisible();
  await expect(domain).toHaveAttribute("data-conflict", "true");
  await expect(domain).toContainText("Lookalike");
  await range.focus();
  await range.press("Home");
  await expect(scrub.getByText("Request received").first()).toBeVisible();
  await expect(sibling).toHaveCount(0);
  await expect(domain).toBeVisible();
  await expect(domain).not.toHaveAttribute("data-conflict", "true");
  await softNoHScroll(page, "as-of graph at the request");
  assertClean();
});

async function softNoHScroll(page: Page, where: string): Promise<void> {
  const box = await pageOverflow(page);
  expect.soft(
    box.scrollWidth,
    `${where} scrollWidth ${box.scrollWidth} > innerWidth ${box.innerWidth}; offenders ${JSON.stringify(box.offenders)}`,
  ).toBeLessThanOrEqual(box.innerWidth);
}

test("as-of scrubber is absent when the run has no decision", async ({ page, request }) => {
  const runs = (await listRuns(request)).filter((r) => !r.decision && r.request_id);
  runs.sort((a, b) => b.started_at.localeCompare(a.started_at));
  test.skip(runs.length === 0, "no run without a decision in the history (archived after the wave-3 ERP reset)");
  const run = runs[0];
  await page.goto(`/app/review/${run.run_id}`);
  await openGraph(page);
  await expect(page.getByTestId("graph-asof")).toHaveCount(0);
});
