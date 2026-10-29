// F22 simulate_outage: the named source is really not queried, the trace says so, and C2 caps the decision.
import { describe, expect, it } from "vitest";
import { GateDecisionSchema } from "../../../app/schemas/decision";
import { outageOf } from "../../../app/components/outage";
import { rig, s1Docs } from "../_support/harness";
import { S1_CLAIMS_MODEL } from "../_support/models-script";
import { S3_CLAIMS_MODEL, S3_EML, S3_INPUT, S3_LETTER } from "../_support/s3";

type Env = { status: string; output: { artifacts: Array<{ type: string; data?: unknown }> } };

describe("simulate_outage (F22)", () => {
  it("maps outage names to template sources", () => {
    expect(outageOf(["edgar"], "edgar")).toBe("edgar");
    expect(outageOf(["erp"], "vendor_master")).toBe("erp");
    expect(outageOf(["usaspending"], "edgar")).toBeNull();
    expect(outageOf(undefined, "edgar")).toBeNull();
  });
  it("S3 with SEC EDGAR down never approves: EDGAR reads are not run and C2 names the outage", async () => {
    const docs = await s1Docs(S3_LETTER, S3_EML, "03-l3harris-bank-change");
    const r = await rig({ docs, script: { claims: S3_CLAIMS_MODEL } });
    const { env, tracer } = await r.run(S3_INPUT, { options: { simulate_outage: ["edgar"] } });
    const d = GateDecisionSchema.parse((env as Env).output.artifacts.find((a) => a.type === "gate_decision")!.data);
    expect(d.decision).not.toBe("APPROVE");
    expect(d.reason_codes.find((c) => c.code === "C2")?.detail).toBe("SEC EDGAR was not reachable during this check (simulated outage), so its evidence is unknown.");
    expect(d.limitations.join(" ")).toMatch(/Simulated outage \(test hook\): SEC EDGAR was not reachable/);
    expect(tracer.events.some((e) => e.note === "simulated_outage" && e.status === "error")).toBe(true);
    expect((env as Env).status).toBe("partial_success");
  });
  it("a vendor-master read that fails is unknown, not absent: no 'on file: none' R1, and C2 names the failed read", async () => {
    const docs = await s1Docs();
    const r = await rig({ docs, script: { claims: S1_CLAIMS_MODEL } });
    r.zetaris.failWith["T01"] = "zetaris_server";
    const { env } = await r.run();
    const d = GateDecisionSchema.parse((env as Env).output.artifacts.find((a) => a.type === "gate_decision")!.data);
    expect(d.reason_codes.some((c) => c.code === "R1")).toBe(false);
    expect(d.reason_codes.find((c) => c.code === "C2")?.detail).toMatch(/^Vendor master could not be read during this check \(T01\)/);
    expect(d.decision).not.toBe("APPROVE");
  });
  it("an S3 that would approve but fell back to captures mid-run ends CALLBACK_VERIFY with C2, not a policy_invariant error", async () => {
    const docs = await s1Docs(S3_LETTER, S3_EML, "03-l3harris-bank-change");
    const r = await rig({ docs, script: { claims: S3_CLAIMS_MODEL } });
    const { env } = await r.run(S3_INPUT, { zetaris_down: { reason: "zetaris_unreachable", captured_at: "2026-10-27" } });
    expect((env as Env).status).toBe("partial_success");
    const d = GateDecisionSchema.parse((env as Env).output.artifacts.find((a) => a.type === "gate_decision")!.data);
    expect(d.decision).toBe("CALLBACK_VERIFY");
    expect(d.reason_codes.map((c) => c.code)).toContain("C2");
  });
  it("a hosted-demo run is labelled as replayed recordings, never as a Zetaris outage, and still cannot approve", async () => {
    const docs = await s1Docs(S3_LETTER, S3_EML, "03-l3harris-bank-change");
    const r = await rig({ docs, script: { claims: S3_CLAIMS_MODEL } });
    const { env } = await r.run(S3_INPUT, { zetaris_down: { reason: "hosted_demo", captured_at: "2026-10-27" } });
    const e = env as Env;
    const d = GateDecisionSchema.parse(e.output.artifacts.find((a) => a.type === "gate_decision")!.data);
    const text = JSON.stringify(e);
    expect(text).toContain("Hosted demo: Zetaris results are replayed from recordings dated 2026-10-27");
    expect(text).not.toContain("Zetaris unreachable");
    expect(d.decision).not.toBe("APPROVE");
  });
});

