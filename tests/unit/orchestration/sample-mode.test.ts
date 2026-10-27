// SAMPLE_MODE (explicit only): sidecar claims bound to document hashes, default plan, rules-only A3, template rationale.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GateDecisionSchema } from "../../../app/schemas/decision";
import { AppError } from "../../../app/schemas/errors";
import { rig, S1_INPUT } from "../_support/harness";
import { S1_CLAIMS_MODEL } from "../_support/models-script";
import { S1_LETTER_LINES } from "../_support/letter";
import { FakeModels } from "../_support/fakes";

const sha = createHash("sha256").update(S1_LETTER_LINES.join("\n")).digest("hex");

async function sampleRig(opts: { bind?: boolean } = {}) {
  const r = await rig({ mode: "sample" });
  r.deps.config.SAMPLE_MODE = true;
  (r.zetaris as unknown as { mode: string }).mode = "sample";
  r.models.script = () => { throw new AppError("sample_mode", "no models offline"); };
  const dir = path.join(r.deps.config.dirs.sample, "claims");
  mkdirSync(dir, { recursive: true });
  const c = S1_CLAIMS_MODEL.claims!;
  const sidecar = {
    extracted_by: "generator ground truth (SAMPLE_MODE fixture)", source_sha256: opts.bind === false ? ["f".repeat(64)] : [sha, "e".repeat(64)], account_number: "000999000141",
    claims: { ...c, sender_email: null, sender_domain: "boozallen-payments.example", reply_to_domain: "boozallen-payments.example", phones: c.phones.map((p) => ({ ...p, e164: "+17035550147" })), fields: c.fields.map((f) => ({ ...f, fact_field: null, highlight_source: "none" })), extraction_path: "sidecar" },
  };
  writeFileSync(path.join(dir, "01-booz-allen-remit-change.claims.json"), JSON.stringify(sidecar));
  return r;
}

describe("SAMPLE_MODE S1", () => {
  it("decides HOLD with R1, R3, R6 plus the labelled R4 for the unexamined soft link, and calls no model", async () => {
    const r = await sampleRig();
    const { env, tracer } = await r.run();
    const e = env as { status: string; output: { artifacts: Array<{ type: string; data?: unknown }> }; agents: Array<{ role: string }> };
    const d = GateDecisionSchema.parse(e.output.artifacts[0]!.data);
    expect(d.decision).toBe("HOLD");
    expect(d.reason_codes.map((c) => c.code)).toEqual(expect.arrayContaining(["R1", "R3", "R6", "R4"]));
    expect(d.reason_codes.find((c) => c.code === "R4")!.detail).toContain("Sample mode does not run the Examiner's model step.");
    expect(d.mode).toBe("sample");
    expect(d.labels.mode_banner).toMatch(/^SAMPLE MODE: offline data captured 2026-10-27/);
    expect(d.models_used.every((m) => m.model === "none (SAMPLE_MODE)" && m.calls === 0)).toBe(true);
    expect(r.models.calls).toHaveLength(0);
    expect(d.rationale).toMatchObject({ source: "template", number_check: "fallback" });
    expect(e.status).toBe("success");
    expect(e.agents.every((a) => a.role.endsWith(" · SAMPLE_MODE: deterministic path, no model call"))).toBe(true);
    expect(tracer.events.some((x) => x.action === "load_fixture")).toBe(true);
    expect(tracer.events.some((x) => x.action === "extract_claims")).toBe(false);
    expect(tracer.events.filter((x) => x.action === "run_template" && x.agent_name === "evidence_runner" && x.planned_by === "default_plan").length).toBeGreaterThan(0);
    expect(tracer.events.some((x) => x.action === "gap_request" && x.rule === "G1")).toBe(true);
    expect(d.callback_scripts[0]!.number_e164).toBe("+17039025000");
    expect(JSON.stringify([env, tracer.events])).not.toContain("000999000141");
  });
  it("refuses a sidecar that is not bound to the supplied documents", async () => {
    const r = await sampleRig({ bind: false });
    const { env } = await r.run();
    expect((env as { output: { needs_human: string } }).output.needs_human).toBe("sample_mode_no_reader");
  });
  it("an offline run never approves a payment change", async () => {
    const r = await sampleRig();
    r.deps.ports.mode = "sample";
    const { env } = await r.run();
    expect((env as { output: { artifacts: Array<{ data: { decision: string } }> } }).output.artifacts[0]!.data.decision).not.toBe("APPROVE");
    void FakeModels;
    void S1_INPUT;
  });
});
