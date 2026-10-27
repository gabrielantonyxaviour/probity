import { test, expect, type APIRequestContext } from "@playwright/test";
import { getJson } from "../helpers/api";
import { openLetter } from "../helpers/nav";
import { expectServedTestId } from "../helpers/served";
import { latestS1Hold, listRuns, type RunSummary } from "../helpers/runs";
import { attachClean } from "../helpers/watch";

const ULTRA = "nvidia/nemotron-3-ultra-550b-a55b";

type Reading = {
  reading: string;
  input: string;
  instructions: string;
  status: string;
  model: string | null;
  requested_model: string | null;
};

type FieldRow = { field: string; agree: boolean; material: boolean };

type Dual = {
  status: string;
  readings: Reading[];
  fields: FieldRow[];
  agreement: number | null;
};

type Hit = { runId: string; dual: Dual };

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

async function dualFrom(request: APIRequestContext, run: RunSummary): Promise<Hit | null> {
  const { status, body } = await getJson(request, `/runs/${encodeURIComponent(run.run_id)}`);
  if (status !== 200) return null;
  const decision = obj(obj(body)?.live)?.decision;
  const raw = obj(decision)?.letter_reading;
  const dual = obj(raw);
  if (!dual || !Array.isArray(dual.readings)) return null;
  return { runId: run.run_id, dual: dual as unknown as Dual };
}

/** Newest decided runs first. A run that grows `letter_reading` is a new id at the head of the list. */
async function findDual(request: APIRequestContext): Promise<Hit | null> {
  const decided = (await listRuns(request)).filter((r) => r.decision);
  decided.sort((a, b) => b.started_at.localeCompare(a.started_at));
  const slice = decided.slice(0, 20);
  for (let i = 0; i < slice.length; i += 5) {
    const hits = await Promise.all(slice.slice(i, i + 5).map((r) => dualFrom(request, r)));
    const hit = hits.find((h) => h);
    if (hit) return hit;
  }
  return null;
}

test("two letter readings are shown and compared", async ({ page, request }) => {
  const assertClean = attachClean(page);
  const found = await findDual(request);
  if (!found) {
    const s1 = await latestS1Hold(request);
    expect(found, `D1 not landed: decision.letter_reading is absent on ${s1.run_id}`).toBeTruthy();
  }
  const hit = found as Hit;
  const { dual } = hit;
  expect(["agree", "disagree", "single", "none"], "reading status").toContain(dual.status);
  expect(dual.readings.map((r) => r.reading), `D1 status ${dual.status} does not include both readings`).toEqual(
    expect.arrayContaining(["A", "B"]),
  );
  const a = dual.readings.find((r) => r.reading === "A");
  const b = dual.readings.find((r) => r.reading === "B");
  expect(a?.input, "reading A input").toBe("text_layer");
  expect(a?.instructions, "reading A instructions").toBe("transcribe");
  expect(b?.input, "reading B input").toBe("ocr");
  expect(b?.instructions, "reading B instructions").toBe("visual");
  for (const r of [a, b]) {
    if (r?.status !== "ok") continue;
    expect(r.model ?? r.requested_model, `${r.reading} model`).toBe(ULTRA);
  }
  if (dual.status === "agree" || dual.status === "disagree") {
    expect(dual.agreement, "agreement").toBeGreaterThanOrEqual(0);
    expect(dual.agreement, "agreement").toBeLessThanOrEqual(1);
    expect(dual.fields.length, "compared fields").toBeGreaterThan(0);
  }

  await page.goto(`/app/review/${hit.runId}`);
  await expect(page.getByTestId("decision-card")).toBeVisible();
  await openLetter(page);
  const card = await expectServedTestId(page, "readings-card");
  await expect(card).toHaveAttribute("data-status", dual.status);
  await expect(card).not.toContainText("(fictional)");
  for (const r of dual.readings.filter((row) => row.reading === "A" || row.reading === "B")) {
    const who = card.locator(`[data-testid="reading"][data-reading="${r.reading}"]`);
    await expect(who).toBeVisible();
    await expect(who).toHaveAttribute("data-status", r.status);
  }
  if (typeof dual.agreement === "number") {
    await expect(card.getByTestId("readings-agreement")).toHaveText(`${Math.round(dual.agreement * 100)}%`);
  }
  for (const f of dual.fields) {
    const row = card.locator(`[data-testid="reading-field"][data-field="${f.field}"]`);
    await expect(row).toHaveAttribute("data-agree", String(f.agree));
    await expect(row).toHaveAttribute("data-material", String(f.material));
  }
  assertClean();
});
