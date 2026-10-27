import { describe, expect, it } from "vitest";
import { GateDecisionSchema } from "../../../app/schemas/decision";
import { rationaleInput, templateRationale } from "../../../app/agents/gate-officer/rationale";
import { rig } from "../_support/harness";
import { defaultRationale, type RationaleInput } from "../_support/models-script";
import { checkGrounded } from "../../../app/policy/rationale-guard";
import { FACT_ORDER } from "../../../app/policy/facts";

async function s1Decision(script = {}) {
  const r = await rig({ script });
  const { env, tracer } = await r.run();
  const d = GateDecisionSchema.parse((env as { output: { artifacts: Array<{ data: unknown }> } }).output.artifacts[0]!.data);
  return { d, tracer, r };
}

describe("rationale (04 §6.4, §7.10)", () => {
  it("a faithful model rationale passes the number check", async () => {
    const { d, tracer } = await s1Decision();
    expect(d.rationale).toMatchObject({ source: "model", number_check: "passed" });
    expect(tracer.events.some((e) => e.action === "number_check" && e.note === "passed")).toBe(true);
  });
  it("a rationale with an invented amount is regenerated once, then falls back to the exact template", async () => {
    const { d, r, tracer } = await s1Decision({ rationale: (i: RationaleInput) => `HOLD for ${i.vendor_name} in ${i.payment_run_id}. The total is $9,999,999.00 across all payments. The new address does not match our records here. Call the vendor on a known number. Review all items before release.` });
    expect(d.rationale.source).toBe("template");
    expect(d.rationale.number_check).toBe("fallback");
    expect(r.models.calls.filter((c) => c.agent === "gate_officer")).toHaveLength(2);
    expect(tracer.events.filter((e) => e.action === "number_check").map((e) => e.status)).toEqual(["needs_revision", "needs_revision", "success"]);
    expect(d.rationale.text).toBe(templateRationale(d));
    expect(d.rationale.text).toMatch(/^HOLD: do not change the bank details for Booz Allen Hamilton Inc before PR-2026-10-30\. /);
    expect(d.rationale.text).not.toMatch(/Reasons: |_[a-z]|\d{2}:\d{2}:\d{2}/);
    expect(d.rationale.text).toContain("Call (703) 902-5000 (SEC EDGAR submissions");
    expect(d.rationale.text).toContain("Separately, 2 other items totalling $139,700.00 in PR-2026-10-30 fail payment controls.");
    // the plain template carries every red and cap reason it shows, and states nothing the decision does not
    expect(checkGrounded(d.rationale.text, rationaleInput(d) as never).failures.filter((f) => !/sentence count|left out/.test(f))).toEqual([]);
  });
  it("a first failure followed by a good answer is marked regenerated", async () => {
    let n = 0;
    const { d } = await s1Decision({ rationale: (i: RationaleInput) => (n++ === 0 ? `HOLD for ${i.vendor_name} in ${i.payment_run_id}. The total is $1.00 across all payments here. The new address does not match our records here. Call the vendor on a known number. Review all items.` : defaultRationale(i)) });
    expect(d.rationale.number_check).toBe("regenerated");
    expect(d.rationale.source).toBe("model");
  });
  it("the model input carries pre-formatted amounts and no forbidden wording", async () => {
    const { d } = await s1Decision();
    const input = rationaleInput(d);
    expect(input.exposure).toEqual({ vendor_item_count: 3, vendor_amount_display: "$1,284,550.00" });
    expect(JSON.stringify(input)).not.toMatch(/fraud|scam|criminal/i);
  });
});

describe("fact sheet (04 §8.2)", () => {
  it("lists all eight fields in order and every why is one clean line", async () => {
    const { d } = await s1Decision();
    expect(d.fact_sheet.map((f) => f.field)).toEqual(FACT_ORDER);
    for (const f of d.fact_sheet) expect(f.why).not.toMatch(/[{}]|\bnull\b|\n/);
    const by = Object.fromEntries(d.fact_sheet.map((f) => [f.field, f]));
    expect(by.remit_address).toMatchObject({ status: "mismatch", why: "This address belongs to BOOZ ALLEN HAMILTON INC (UEI KHK6E1JW9C15), not our vendor." });
    expect(by.bank_account).toMatchObject({ status: "mismatch", why: "The account is already on Quillan Ridge Fleet Services LLC (fictional) (V-10812)." });
    expect(by.sender_domain!.status).toBe("mismatch");
    expect(by.sender_domain!.why).toBe("boozallen-payments.example is not on file for Booz Allen Hamilton Inc; it looks like boozallen.");
    expect(by.callback_phone).toMatchObject({ status: "mismatch", why: "(703) 555-0147 appears only on the request." });
    expect(by.invoice_refs).toMatchObject({ status: "match", why: "All 3 invoice references belong to Booz Allen Hamilton Inc." });
    expect(by.parent!.status).toBe("match");
    expect(by.registrant).toMatchObject({ status: "match" });
    expect(by.legal_name!.status).toBe("match");
  });
});
