import { describe, expect, it } from "vitest";
import { agentRoles, errorEnvelope, finalizeEnvelope } from "../../../app/api/envelope";
import { AGENT_ROLES, FALLBACK_ROLE_SUFFIX, SAMPLE_ROLE_SUFFIX } from "../../../app/schemas/api";
import { ERROR_TEXT } from "../../../app/schemas/errors";
import { decisionFixture, envelopeFixture } from "../../helpers/fixtures";

describe("agents[] roles (04 §2.1, REV-59)", () => {
  it("SAMPLE_MODE: every role ends with the sample suffix", () => {
    const roles = agentRoles("sample", decisionFixture());
    expect(roles).toHaveLength(4);
    for (const [i, r] of roles.entries()) expect(r.role).toBe(`${AGENT_ROLES[i]!.role}${SAMPLE_ROLE_SUFFIX}`);
  });
  it("live: an agent with calls:0 (or no models_used row) ends with the fallback suffix; agents with calls keep the base text", () => {
    const d = decisionFixture();
    const roles = agentRoles("live", d); // letter_reader and gate_officer called; scout and examiner did not
    expect(roles.find((r) => r.name === "letter_reader")!.role).toBe(AGENT_ROLES[0]!.role);
    expect(roles.find((r) => r.name === "gate_officer")!.role).toBe(AGENT_ROLES[3]!.role);
    expect(roles.find((r) => r.name === "registry_scout")!.role.endsWith(FALLBACK_ROLE_SUFFIX)).toBe(true);
    const zero = agentRoles("live", { ...d, models_used: d.models_used.map((m) => ({ ...m, calls: 0 })) });
    expect(zero.every((r) => r.role.endsWith(FALLBACK_ROLE_SUFFIX))).toBe(true);
  });
  it("a needs-human run has no ledger to judge by: base roles stand", () => {
    expect(agentRoles("live", null).map((r) => r.role)).toEqual(AGENT_ROLES.map((r) => r.role));
  });
  it("finalizeEnvelope rebuilds roles, fixes the ids and validates; junk becomes internal_error", () => {
    const ctx = { run_id: "r-1-aaaa", trace_id: "t-aaaaaaaa", mode: "sample" as const, seconds: 2 };
    const ok = finalizeEnvelope(envelopeFixture("r-other", "t-other"), ctx);
    expect(ok).toMatchObject({ run_id: "r-1-aaaa", trace_id: "t-aaaaaaaa", status: "success" });
    if (ok.status !== "error") expect(ok.agents[0]!.role.endsWith(SAMPLE_ROLE_SUFFIX)).toBe(true);
    expect(finalizeEnvelope({ nonsense: true }, ctx)).toMatchObject({ status: "error", code: "internal_error" });
  });
  it("run-level error envelope text is ERROR_TEXT[code], whatever the upstream said", () => {
    const e = finalizeEnvelope({ status: "error", code: "zetaris_unavailable", error: "org.apache.spark.sql.AnalysisException: Table not found at 10.0.0.5", recoverable: false }, { run_id: "r-2-bbbb", trace_id: "t-bbbbbbbb", mode: "live", seconds: 1 });
    expect(e).toMatchObject({ error: ERROR_TEXT.zetaris_unavailable, code: "zetaris_unavailable", recoverable: true });
    expect(errorEnvelope({ run_id: "r", trace_id: "t", code: "cancelled", seconds: 0 }).recoverable).toBe(false);
  });
});
