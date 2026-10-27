// ZETARIS_DOWN_POLICY=degrade (SCR-06-8, S7) with the REAL sample port as the offline fallback: the live Zetaris port is unreachable, the
// real orchestrator runs L3Harris (S3) over data/sample, and the answer must be capped (C2), partial_success, labelled, never APPROVE.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSampleZetaris } from "../../app/adapters/sample/zetaris-sample";
import { recordErpWrites } from "../../app/adapters/sample/erp-recorder";
import { createSampleDiscovery } from "../../app/adapters/sample/search-sample";
import { createSampleRegistrar } from "../../app/adapters/sample/registrar-sample";
import { resetSampleSessions } from "../../app/adapters/sample/sample-session";
import { resetSampleData } from "../../app/adapters/sample/sample-store";
import { GateDecisionSchema, type GateDecision } from "../../app/schemas/decision";
import { templateKitFrom } from "../../app/orchestration/adapters/template-kit";
import { templates } from "../../app/templates/index";
import { rig, s1Docs } from "../unit/_support/harness";
import { S3_CLAIMS_MODEL, S3_EML, S3_INPUT, S3_LETTER } from "../unit/_support/s3";
import { ROOT } from "./support";

type Env = { status: string; run_id: string; output: { artifacts: Array<{ type: string; data?: unknown }> } };
const dec = (e: unknown): GateDecision => GateDecisionSchema.parse((e as Env).output.artifacts.find((a) => a.type === "gate_decision")!.data);

const cfg = { dirs: { sample: path.join(ROOT, "data/sample") } } as never;
const DOWN = { reason: "zetaris_unreachable", captured_at: "2026-10-27T12:30:47.167Z" };

/** What RunRegistry does when the preflight fails under the degrade policy: the sample ports replace the live ones for the run. */
async function degraded(input = S3_INPUT) {
  resetSampleData();
  resetSampleSessions();
  const docs = await s1Docs(S3_LETTER, S3_EML, "03-l3harris-bank-change");
  const r = await rig({ docs, script: { claims: S3_CLAIMS_MODEL } });
  const erp = recordErpWrites(r.erp); // what wiring does in live mode: the offline port sees this run's own request
  const zetaris = createSampleZetaris(cfg, { erp });
  r.deps.ports = { ...r.deps.ports, erp, zetaris, registrar: createSampleRegistrar(cfg), discovery: createSampleDiscovery(cfg) };
  r.deps.templates = templateKitFrom(templates as never); // real SQL text, as in production: the sample port applies the live query guard to it
  r.deps.offlineZetaris = zetaris;
  r.zetaris.unreachable = true;
  const run = () => r.run(input, { zetaris_down: DOWN });
  return { r, erp, run };
}

describe("ZETARIS_DOWN_POLICY=degrade over the real sample port", () => {
  it("S3 with Zetaris unreachable: CALLBACK_VERIFY with C2 only, partial_success, banner, offline evidence, call-back kept", async () => {
    const { run } = await degraded();
    const { env, tracer } = await run();
    const d = dec(env);
    expect((env as Env).status).toBe("partial_success");
    expect(d.decision).toBe("CALLBACK_VERIFY");
    expect(d.reason_codes.filter((c) => c.class !== "info").map((c) => c.code)).toEqual(["C2"]);
    expect(d.labels.mode_banner).toMatch(/^Zetaris unreachable: evidence from offline captures dated /);
    expect(d.callback_evidence[0]).toMatchObject({ log_id: "CL-20398", phone_source: "edgar_registrant" });
    const reads = tracer.events.filter((e) => e.agent_name === "evidence_runner" && e.action === "run_template");
    expect(reads.length).toBeGreaterThan(5);
    expect(reads.some((e) => e.source_mode === "live")).toBe(false);
    expect(reads.filter((e) => e.source_mode === "sample").length).toBeGreaterThan(5);
  });
  it("the offline port sees the request the degraded run just inserted (T08b reads its routing from it)", async () => {
    const { r, erp, run } = await degraded();
    await run();
    const rows = erp.snapshot().requests;
    expect(rows.map((x) => x.request_id)).toContain("BCR-2026-0398");
    const q = r.tracers.at(-1)!.events.find((e) => e.action === "run_template" && e.template_id === "T08b");
    expect(q?.rows).toBe(1);
  });
  it("with ZETARIS_DOWN_POLICY=error the same outage is a run error, not a degraded answer", async () => {
    const { r } = await degraded();
    r.deps.ports = { ...r.deps.ports, zetaris: r.zetaris, registrar: r.registrar };
    delete r.deps.offlineZetaris;
    r.deps.config.ZETARIS_DOWN_POLICY = "error";
    const { env } = await r.run(S3_INPUT);
    expect(env).toMatchObject({ status: "error", code: "zetaris_unavailable" });
  });
});
