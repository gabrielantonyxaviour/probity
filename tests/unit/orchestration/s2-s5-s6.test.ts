// S2 (one name, two companies), S6 memory across runs, and S5-style discovery gaps, through the real orchestrator.
import { describe, expect, it } from "vitest";
import { GateDecisionSchema, type GateDecision } from "../../../app/schemas/decision";
import type { RunInput } from "../../../app/schemas/api";
import type { ExtractClaimsModel } from "../../../app/schemas/llm";
import { rig, s1Docs } from "../_support/harness";

const dec = (e: unknown): GateDecision => GateDecisionSchema.parse((e as { output: { artifacts: Array<{ data: unknown }> } }).output.artifacts[0]!.data);

const S2_LETTER = [
  "Science Applications International Corporation", "Accounts Receivable", "October 23, 2026", "Subject: Remittance address update",
  "New remit-to address: 12010 Sunset Hills Rd, Reston, VA 20190", "Bank: Calderwick Test Bank (fictional)", "Routing number: 110000000 (TEST ROUTING)",
  "Account number: 000999000163 (TEST ACCOUNT)", "Invoices: INV-LDS-88412, INV-LDS-88433", "J. Marsh (fictional), Receivables",
  "SYNTHETIC SAMPLE: not issued by Science Applications International Corporation", "Synthetic document generated for the Open Agent Hackathon 2026 by team Zen. Not a real request.",
];
const S2_MODEL: ExtractClaimsModel = {
  needs_human: null, account_number: "000999000163", unreadable_fields: [],
  claims: {
    claimed_name: "Science Applications International Corporation", letterhead_name: "Science Applications International Corporation",
    remit_address: { line1: "12010 Sunset Hills Rd", unit: null, city: "Reston", state: "VA", zip: "20190" }, bank: { bank_name: "Calderwick Test Bank (fictional)", routing: "110000000", account_last4: "0163" },
    sender_email: null, sender_domain: null, reply_to_domain: null, phones: [], effective_date: null, invoice_refs: ["INV-LDS-88412", "INV-LDS-88433"], signer_name: "J. Marsh (fictional)", pressure_phrases: [],
    watermark_text: "SYNTHETIC SAMPLE: not issued by Science Applications International Corporation",
    fields: [
      { field: "claimed_name", quote: "Science Applications International Corporation", page: 1, bbox_hint: null },
      { field: "remit_address", quote: "New remit-to address: 12010 Sunset Hills Rd, Reston, VA 20190", page: 1, bbox_hint: null },
      { field: "bank_routing", quote: "Routing number: 110000000 (TEST ROUTING)", page: 1, bbox_hint: null },
      { field: "bank_account", quote: "Account number: 000999000163 (TEST ACCOUNT)", page: 1, bbox_hint: null },
      { field: "invoice_ref", quote: "Invoices: INV-LDS-88412, INV-LDS-88433", page: 1, bbox_hint: null },
    ],
  },
};
const S2_INPUT: RunInput = { example_id: "02-saic-leidos-remit-change", request_id: "BCR-2026-0416", received_at: "2026-10-23T13:47:00Z", payment_run_id: "PR-2026-10-30", documents: [{ kind: "letter", file: "letter.pdf" }, { kind: "eml_headers", file: "headers.eml" }] };

describe("S2: one name, two companies -> refuses to guess", () => {
  it("holds with R4 multi_candidate, two scripts, a G4 gap and an unresolved attribution conflict", async () => {
    const docs = await s1Docs(S2_LETTER, "From: AP <ap@saic.example>\r\nDate: Fri, 23 Oct 2026 13:47:00 +0000", "02-saic-leidos-remit-change");
    const r = await rig({ docs, script: { claims: S2_MODEL } });
    const { env, tracer } = await r.run(S2_INPUT);
    const d = dec(env);
    expect(d.decision).toBe("HOLD");
    const codes = d.reason_codes.map((c) => c.code);
    expect(codes).toContain("R4");
    expect(codes).not.toContain("R1");
    expect(d.reason_codes.find((c) => c.code === "R4")).toMatchObject({ variant: "multi_candidate", detail: "Cannot determine which vendor this request is for. Do not guess." });
    expect(d.resolved.candidate_vendor_ids.sort()).toEqual(["V-10442", "V-10587"]);
    expect(d.callback_scripts.map((s) => s.number_e164).sort()).toEqual(["+15715266000", "+17036764300"]);
    expect(d.callback_scripts.every((s) => s.number_source === "edgar_registrant")).toBe(true);
    expect(tracer.events.some((e) => e.action === "gap_request" && e.rule === "G4")).toBe(true);
    expect(d.conflicts.find((c) => c.conflict_id.startsWith("cf-attribution"))).toMatchObject({ resolution: "unresolved", by: "policy" });
    expect(d.banner_variant).toBe("multi_candidate");
    expect(d.banner_text).toMatch(/^Hold: we cannot tell which vendor this request is for\. Do not change bank details for either /);
    expect(d.exposure.scope).toBe("candidates");
  });
});

describe("S6: memory across runs (R5)", () => {
  it("a phone and an account confirmed bad in an earlier session hold the next request with R5 naming that session", async () => {
    const r = await rig();
    r.world.bad = [
      { entity_id: "acct", kind: "bank_account", value_display: "••••0141", fact_id: "fact-1", request_id: "BCR-2026-0412", session_id: "s-2026-10-27T14:00:03Z", by: "analyst", asserted_at: "2020-01-01T00:00:00.000Z" },
    ];
    const typed = await r.run({
      request_id: "BCR-2026-0446", received_at: "2026-10-27T09:30:00Z", payment_run_id: "PR-2026-10-30",
      vendor: { legal_name: "L3Harris Technologies, Inc." },
      claims: { claimed_name: "L3Harris Technologies, Inc.", sender_email: "treasury@l3harris.example", bank: { routing: "110000000", account_number: "000999000141" } },
    });
    const d = dec(typed.env);
    expect(d.decision).toBe("HOLD");
    expect(d.reason_codes.map((c) => c.code)).toEqual(expect.arrayContaining(["R5", "R6", "C4"]));
    expect(d.reason_codes.find((c) => c.code === "R5")!.detail).toBe("Used in a request later confirmed as an impersonation (session s-2026-10-27T14:00:03Z).");
    expect(d.banner_text).toMatch(/^Hold: a detail in this request was used in a confirmed impersonation\./);
    expect(d.memory_recalled[0]).toMatchObject({ engine: "world_model", session_id: "s-2026-10-27T14:00:03Z" });
    expect(typed.tracer.events.some((e) => e.action === "memory_recall" && e.engine === "world_model" && e.output_summary.includes("1 hit"))).toBe(true);
  });
  it("a fresh store has no R5", async () => {
    const r = await rig();
    const typed = await r.run({ vendor: { legal_name: "L3Harris Technologies, Inc." }, claims: { claimed_name: "L3Harris Technologies, Inc.", bank: { routing: "110000000", account_number: "000999000141" } } });
    expect(dec(typed.env).reason_codes.map((c) => c.code)).not.toContain("R5");
  });
});

describe("S5: a judge's own company (name only) -> discovery, a soft CIK link approved by Ultra, an SEC call-back number", () => {
  const hits = [
    { uei: "FFCMDLMXRK49", name: "PARSONS CORPORATION", recipient_level: "P" as const, amount: 1_070_000_000 },
    { uei: "FFCMDLMXRK49", name: "PARSONS CORPORATION", recipient_level: "C" as const, amount: 0 },
    { uei: "QF9PHLXT2886", name: "THE PARSONS CORPORATION", recipient_level: "P" as const, amount: 500_000 },
  ];
  it("searches as discovery only, registers the entity and the registrant, and scripts the EDGAR number only after approval", async () => {
    const r = await rig({ discovery: hits });
    const { env, tracer } = await r.run({ vendor: { legal_name: "Parsons Corporation" } });
    const d = dec(env);
    expect(d.decision).toBe("CALLBACK_VERIFY");
    expect(d.reason_codes.map((c) => c.code)).toEqual(expect.arrayContaining(["C1", "C4", "C6"]));
    const ev = tracer.events;
    expect(ev.find((e) => e.action === "run_template" && e.template_id === "T15")).toMatchObject({ source_mode: "discovery_only" });
    expect(ev.some((e) => e.note === "zero_award_record_ignored")).toBe(true);
    expect(ev.filter((e) => e.action === "register_source").map((e) => e.template_id)).toEqual(["T12", "T14"]);
    expect(d.callback_scripts).toHaveLength(1);
    expect(d.callback_scripts[0]).toMatchObject({ number_e164: "+17039888500", number_source: "edgar_registrant", for_vendor_id: null });
    expect(ev.some((e) => e.action === "approve_link" && e.model && e.link_id)).toBe(true);
    for (const row of d.fact_sheet) for (const o of row.observations) expect(o.query_id).toBeTruthy();
    expect(JSON.stringify(Object.values(d.fact_sheet).flatMap((f) => f.observations.map((o) => o.template_id)))).not.toContain("T15");
  });
  it("without an approved registrant link there is no SEC script (escalation instead)", async () => {
    const r = await rig({ discovery: hits, script: { critique: (i) => ({ link_id: (i.link as { link_id: string }).link_id, verdict: "reject", confidence: 0.9, cited_evidence_ids: [((i.supporting as Array<{ evidence_id: string }>)[0] ?? (i.contradicting as Array<{ evidence_id: string }>)[0])!.evidence_id], missing_evidence: [], conflict: null, rationale: "the ticker names a different company" }) } });
    const d = dec((await r.run({ vendor: { legal_name: "Parsons Corporation" } })).env);
    expect(d.callback_scripts).toEqual([]);
    expect(d.limitations).toContain("No independent number found; escalate to the contracting officer for a verified contact.");
    expect(d.banner_variant).toBe("no_vendor");
  });
  it("a name with no registry hit is capped and partial, never invented", async () => {
    const r = await rig({ discovery: [] });
    const out = await r.run({ vendor: { legal_name: "Zephyrine Orbital Logistics LLC" } });
    const d = dec(out.env);
    expect(d.callback_scripts).toEqual([]);
    expect(d.limitations.join(" ")).toContain('No USAspending recipient matches "Zephyrine Orbital Logistics LLC"');
    expect((out.env as { status: string }).status).toBe("partial_success");
    expect(out.tracer.events.some((e) => e.action === "register_source")).toBe(false);
  });
});

describe("J5 with only a CIK or a UEI", () => {
  it("a CIK alone reads the registrant directly and its number is scripted without a ticker guess", async () => {
    const r = await rig();
    const d = dec((await r.run({ vendor: { cik: "275880" } })).env);
    expect(d.callback_scripts[0]).toMatchObject({ number_e164: "+17039888500", number_source: "edgar_registrant" });
    expect(d.reason_codes.map((c) => c.code)).toEqual(expect.arrayContaining(["C4", "C6", "C1"]));
    expect(d.decision).toBe("CALLBACK_VERIFY");
  });
  it("a UEI alone is searched as the keyword and registered when the search confirms it", async () => {
    const r = await rig({ discovery: [{ uei: "FFCMDLMXRK49", name: "PARSONS CORPORATION", recipient_level: "P", amount: 1_070_000_000 }] });
    const { tracer } = await r.run({ vendor: { uei: "FFCMDLMXRK49" } });
    expect(tracer.events.filter((e) => e.action === "register_source").map((e) => e.template_id)).toContain("T12");
  });
});
