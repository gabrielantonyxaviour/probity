// World Model graph read surface (05 2.7): as-of validity, S1 picture, decision-driven flags, link verdicts.
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});
import type { GateDecision } from "../../app/schemas/decision";
import { ingestScenario, loadFixture, newWorld, S1_RUN } from "./helpers/fixtures";

describe("graph (05 2.7)", () => {
  it("re-evaluates edge validity for ?at= and keeps history visible", async () => {
    const w = newWorld();
    await ingestScenario(w, loadFixture("s1-rows.json"), S1_RUN);
    const phones = (at?: string) =>
      w
        .graphFor("BCR-2026-0412", { at })
        .edges.filter((e) => e.from === "vendor_record:erp:V-10027" && e.type === "reachable_at");
    const now = phones();
    expect(now.find((e) => e.to.endsWith("+17039025000"))).toMatchObject({
      state: "superseded",
      superseded: true,
      valid_to: "2026-10-19T16:20:00.000Z",
      source_label: "Vendor master",
    });
    expect(now.find((e) => e.to.endsWith("+17035550182"))).toMatchObject({ state: "open", valid_to: null });
    // Bitemporal (wm-read graphFor): before the request was received nothing about it was known.
    const before = w.graphFor("BCR-2026-0412", { at: "2026-09-22T15:12:00Z" });
    expect(before.as_of).toBe("2026-09-22T15:12:00.000Z");
    expect(before.edges).toEqual([]);
    const then = w.graphFor("BCR-2026-0412", { at: "2026-10-22T15:12:00Z" });
    const old = then.edges.filter((e) => e.type === "reachable_at" && e.from === "vendor_record:erp:V-10027");
    expect(old.find((e) => e.to.endsWith("+17039025000"))!.state).not.toBe("open");
    expect(old.find((e) => e.to.endsWith("+17035550182"))!.state).toBe("open");
    expect(() => w.graphFor("BCR-2026-0412", { at: "not a date" })).toThrow(/valid timestamp/);
    expect(w.graphFor("BCR-2026-9999").nodes).toEqual([]);
  });

  it("S1 picture: sibling address, runtime-discovered KHK6E1JW9C15, 41-subsidiary family, labels", async () => {
    const w = newWorld();
    await ingestScenario(w, loadFixture("s1-rows.json"), S1_RUN);
    const g = w.graphFor("BCR-2026-0412");
    const khk = g.nodes.find((n) => n.id === "legal_entity:uei:KHK6E1JW9C15-C")!;
    expect(khk).toMatchObject({
      group: "KHK6E1JW9C15",
      sublabel: "Subsidiary · Tinton Falls, NJ",
      source_lane: "usaspending",
    });
    expect(khk.provenance.url).toMatch(/^zetaris:\/\/T1[12]\//);
    expect(g.nodes.find((n) => n.id === "legal_entity:uei:MBPHTU7Y9S65-P")!.keys.family_size).toBe("41");
    expect(g.nodes.find((n) => n.type === "bank_account")).toMatchObject({
      label: "•••• 0141",
      source_lane: "request",
    });
    expect(JSON.stringify(g)).not.toMatch(/000999000141/);
    const labels = [...new Set(g.edges.map((e) => e.source_label))];
    expect(labels).toEqual(
      expect.arrayContaining([
        "Vendor master",
        "USAspending recipient",
        "USAspending children list",
        "SEC EDGAR",
        "This request",
        "Possible vendor",
      ]),
    );
    expect(g.nodes.find((n) => n.id.endsWith("+17039025000"))).toMatchObject({
      source_lane: "edgar",
      sublabel: null, // decision 8: no scenario label in the product (wm-read graphFor)
      flags: ["real_registry"],
    });
  });

  it("flags come from the run's decision; verdicts colour the edge; dq_invalid and fraud facts show", async () => {
    const w = newWorld();
    const s1 = loadFixture("s1-rows.json");
    await ingestScenario(w, s1, S1_RUN);
    const addr = "address:addr:1 COMMVAULT WAY|TINTON FALLS|NJ";
    const khk = "legal_entity:uei:KHK6E1JW9C15-C";
    const prov = (by: string) => ({ kind: "agent" as const, by, at: s1.request.received_at, runId: S1_RUN });
    await w.proposeLink(
      {
        link_id: "lnk-0123456789abcdef",
        type: "remit_owner",
        link_type: "remit_owner",
        from: addr,
        to: khk,
        evidence_ids: [],
        hardness: "soft",
        request_id: "BCR-2026-0412",
      },
      prov("identity_linker"),
    );
    expect(w.linkStatus("BCR-2026-0412")[0]).toMatchObject({ status: "pending", link_type: "remit_owner" });
    await w.recordVerdict(
      {
        link_id: "lnk-0123456789abcdef",
        verdict: "reject",
        rule_hits: ["R3"],
        missing_evidence: [],
        rationale: "x",
        model: null,
        link_type: "remit_owner",
        request_id: "BCR-2026-0412",
        from: addr,
        to: khk,
        confidence: 1,
      },
      prov("policy"),
    );
    expect(w.linkStatus("BCR-2026-0412")).toEqual([
      expect.objectContaining({ status: "rejected", by: "policy", model: null }),
    ]);
    const facts = w.linkFactsFor("BCR-2026-0412");
    expect(new Date(facts[0]!.fact.assertedAt).getTime()).toBeGreaterThan(Date.parse("2026-10-27T14:02:11Z"));
    await w.recordDqInvalid("sec_registrant:cik:0001443646", "DQ5", {
      kind: "api",
      by: "evidence_runner",
      at: "2026-10-27T14:03:00.000Z",
      url: "zetaris://T21/11111111-2222-4333-8444-555555555555",
      runId: S1_RUN,
    });
    const n = w.worldSeq();
    await w.recordDqInvalid("sec_registrant:cik:0001443646", "DQ5", {
      kind: "api",
      by: "evidence_runner",
      at: "2026-10-27T14:09:00.000Z",
      url: "zetaris://T21/11111111-2222-4333-8444-555555555555",
      runId: S1_RUN,
    });
    expect(w.worldSeq()).toBe(n);
    const decision = {
      decision_id: `dec-${S1_RUN}`,
      reason_codes: [
        { code: "R1", class: "red", detail: "Sender domain is a lookalike", evidence_ids: [] },
        { code: "R3", class: "red", detail: "", evidence_ids: [] },
        { code: "R6", class: "red", detail: "", evidence_ids: [] },
        { code: "C5", class: "cap", detail: "", evidence_ids: [] },
      ],
      callback_scripts: [
        {
          number_e164: "+17039025000",
          do_not_use: [
            { number_display: "(703) 555-0147", reason: "" },
            { number_display: "(703) 555-0182", reason: "" },
          ],
        },
      ],
      resolved: { vendor_id: "V-10027", registrant_cik: "0001443646", uei: "JCBMLGPE6Z71" },
    } as unknown as GateDecision;
    const g = w.graphFor("BCR-2026-0412", { decision });
    const flags = (id: string) => g.nodes.find((x) => x.id === id)?.flags;
    expect(flags("domain:domain:boozallen-payments.example")).toEqual(
      expect.arrayContaining(["conflict", "lookalike"]),
    );
    expect(flags(addr)).toContain("conflict");
    expect(flags("bank_account:acct:175dbd7da76270843def1d6ba77e9bf08cc9f0bcac9a452456da437e4893abe6")).toContain(
      "conflict",
    );
    expect(flags(khk)).toEqual(expect.arrayContaining(["not_vendor_of_record", "new_this_run", "real_registry"]));
    expect(flags("phone:e164:+17039025000")).toContain("callback_number");
    expect(flags("phone:e164:+17035550147")).toContain("do_not_use");
    expect(flags("phone:e164:+17035550182")).toEqual(expect.arrayContaining(["do_not_use", "recent_change"]));
    expect(flags("vendor_record:erp:V-10027")).toContain("resolved");
    expect(flags("legal_entity:uei:JCBMLGPE6Z71-C")).toContain("resolved");
    expect(flags("sec_registrant:cik:0001443646")).toEqual(expect.arrayContaining(["resolved", "dq_invalid"]));
    expect(g.edges.find((e) => e.from === khk && e.type === "located_at" && e.to === addr)!.verdict).toBe("rejected");
    expect(g.link_verdicts[0]).toMatchObject({ link_type: "remit_owner", status: "rejected", rule_hits: ["R3"] });
    expect(w.graphFor("BCR-2026-0412").nodes.find((x) => x.id === khk)!.flags).not.toContain("new_this_run");
  });
});
