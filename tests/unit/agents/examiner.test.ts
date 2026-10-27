import { describe, expect, it } from "vitest";
import { evaluateGaps, requestEvidence, GAP_TOOLS } from "../../../app/agents/identity-examiner/coverage";
import { conflictId, guardConflict, raiseConflicts, ToolGuardError } from "../../../app/agents/identity-examiner/conflicts";
import { b1, b2Scan, b4Link, b4Scan, b5, b6 } from "../../../app/agents/identity-examiner/rules";
import { critiqueInput } from "../../../app/agents/identity-examiner/model-call";
import { T05, T05B, S1_HASH, T07, VENDORS } from "../_support/data";
import { cand, newState, seed } from "../_support/state";
import type { LinkState } from "../../../app/orchestration/state";

const link = (o: Partial<LinkState>): LinkState => ({ link_id: "lnk-1111111111111111", type: "attribution", from: "req:BCR-2026-0412", to: "vendor:V-10027", evidence_ids: [], hardness: "soft", required: true, status: "proposed", rule_hits: [], verdicts: [], requeried: false, ...o });

function s1() {
  const s = newState({ claims: { remit_address: { line1: "1 Commvault Way", unit: "Suite 205", city: "Tinton Falls", state: "NJ", zip: "07724" }, bank: { bank_name: null, routing: "110000000", account_last4: "0141" } } });
  s.account_hash = S1_HASH;
  s.candidates = [cand({ vendor_id: "V-10027", legal_name: "Booz Allen Hamilton Inc", uei: "JCBMLGPE6Z71", registrant_cik: "0001443646" })];
  seed(s, "T01", { vendor_id: "V-10027" }, [VENDORS["V-10027"]!]);
  seed(s, "T05", { vendor_id: "V-10027" }, [T05["V-10027"]!]);
  seed(s, "T05b", { parent_uei: "MBPHTU7Y9S65" }, [T05B.MBPHTU7Y9S65!]);
  return s;
}

describe("block rules B1-B6", () => {
  it("B1: name similarity alone blocks an attribution; a key (invoice, domain, alias) does not; the soft ticker registrant is exempt", () => {
    const s = s1();
    s.candidates[0]!.signals = ["name_exact"];
    expect(b1(s, link({}))?.rule).toBe("B1");
    s.candidates[0]!.signals = ["invoice_ref", "name_exact"];
    expect(b1(s, link({}))).toBeNull();
    expect(b1(s, link({ type: "registrant", from: "uei:x", to: "cik:0001443646" }))).toBeNull();
    expect(b1(s, link({ type: "alias", hardness: "soft" }))?.rule).toBe("B1");
  });
  it("B2 blocks observations whose query is discovery-only or unknown", () => {
    const s = s1();
    const rec = seed(s, "T01", { vendor_id: "V-10442" }, [VENDORS["V-10442"]!]);
    rec.mode = "discovery_only" as never;
    const hit = b2Scan(s);
    expect(hit.length).toBeGreaterThan(0);
    expect(Object.values(s.blocked_evidence)).toContain("B2");
  });
  it("B4 blocks a call-back row whose number is on the request, and a link resting only on request values", () => {
    const s = s1();
    s.extras.request_phones = ["+13217279100"];
    seed(s, "T08", { request_id: "BCR-2026-0398", vendor_id: "V-10198" }, [{ log_id: "CL-1", phone_e164: "+13217279100", purpose: "bank_change_callback", outcome: "confirmed", phone_source: "edgar_registrant", called_at: "2026-10-21", vendor_id: "V-10198", request_id: "BCR-2026-0398", called_by: "x" }]);
    expect(b4Scan(s)).toHaveLength(1);
    seed(s, "T08b", { request_id: "BCR-2026-0412" }, [{ request_id: "BCR-2026-0412", new_routing: "110000000", routing_check: "valid" }]);
    const only = Object.values(s.evidence).filter((o) => o.source === "request").map((o) => o.evidence_id);
    expect(b4Link(s, link({ evidence_ids: only }))?.rule).toBe("B4");
  });
  it("B5 marks parentage ambiguous when a children list names another parent", () => {
    const s = s1();
    seed(s, "T10", { parent_uei: "ZL41ERXMPAR3" }, [{ child_uei: "JCBMLGPE6Z71", child_name: "x", state_province: "VA", list_size: 5 }]);
    expect(b5(s, link({ type: "vendor_entity", from: "vendor:V-10027", to: "uei:JCBMLGPE6Z71-C" }))?.rule).toBe("B5");
  });
  it("B6 drops a rejection that rests on a list of exactly 100", () => {
    const s = s1();
    const q = seed(s, "T10", { parent_uei: "MBPHTU7Y9S65" }, [{ child_uei: "A", child_name: "x", state_province: "VA", list_size: 100 }]);
    expect(b6(s, q.evidence_ids)?.rule).toBe("B6");
    const small = seed(s, "T10", { parent_uei: "QSRTXLFKV857" }, [{ child_uei: "A", child_name: "x", state_province: "VA", list_size: 41 }]);
    expect(b6(s, small.evidence_ids)).toBeNull();
  });
});

describe("coverage rules G1-G5", () => {
  it("G1 fires for S1 with the tools of spine §10.4 and the claimed state, once per parent", () => {
    const s = s1();
    s.links.reg = link({ link_id: "lnk-2222222222222222", type: "registrant", from: "uei:MBPHTU7Y9S65-P", to: "cik:0001443646", hardness: "hard", status: "approved" });
    const g = evaluateGaps(s);
    expect(g.map((x) => x.rule)).toEqual(["G1"]);
    expect(g[0]).toMatchObject({ tools_allowed: GAP_TOOLS.G1, params: { parent_uei: "MBPHTU7Y9S65", state: "NJ", addr_key: "1 COMMVAULT WAY|TINTON FALLS|NJ" } });
    expect(g[0]!.gap_request_id).toBe("gap-r-test-1");
    expect(evaluateGaps(s)).toEqual([]);
    expect(requestEvidence(s, { rule: "G1", subject: "MBPHTU7Y9S65", params: { parent_uei: "MBPHTU7Y9S65", state: "NJ" }, reason: "again" })).toBeNull();
  });
  it("G1 does not fire when the claimed address already matches the vendor's own entity", () => {
    const s = s1();
    s.claims!.remit_address = { line1: "8283 Greensboro Dr", unit: null, city: "McLean", state: "VA", zip: "22102" };
    expect(evaluateGaps(s).map((x) => x.rule)).not.toContain("G1");
  });
  it("G4 fires once for >= 2 candidates", () => {
    const s = s1();
    s.candidates.push(cand({ vendor_id: "V-10587", legal_name: "SAIC" }));
    expect(evaluateGaps(s).map((x) => x.rule)).toContain("G4");
  });
  it("G5 is suppressed by an H-MEM known_benign recall", () => {
    const s = newState({ claims: { claimed_name: "CACI, INC. - FEDERAL" } });
    s.candidates = [cand({ vendor_id: "V-10112", legal_name: "CACI, INC. - FEDERAL", uei: "N3PBJAVNKF61", registrant_cik: "0000016058" })];
    seed(s, "T05", { vendor_id: "V-10112" }, [{ vendor_id: "V-10112", entity_key: "N3PBJAVNKF61-C", parent_uei: "QSRTXLFKV857", usa_line1: "14370 NEWBROOK DR", usa_city: "CHANTILLY", usa_state: "VA", cik: "0000016058", sec_name: "CACI INTERNATIONAL INC", biz_street1: "11487 Sunset Hills Road", biz_city: "Reston", biz_state: "VA" }]);
    seed(s, "T05b", { parent_uei: "QSRTXLFKV857" }, [{ p_entity_key: "QSRTXLFKV857-P", p_legal_name: "CACI INTERNATIONAL INC", p_address_line1: "12021 SUNSET HILLS RD", p_city_name: "RESTON", p_state_code: "VA" }]);
    expect(evaluateGaps(s).map((x) => x.rule)).toContain("G5");
    const quiet = newState({ claims: { claimed_name: "CACI, INC. - FEDERAL" } });
    quiet.candidates = s.candidates;
    quiet.queries = s.queries;
    quiet.evidence = s.evidence;
    quiet.suppressed_rules.push({ rule: "G5", subject: "V-10112", memory_id: "m1" });
    expect(evaluateGaps(quiet).map((x) => x.rule)).not.toContain("G5");
  });
  it("G2 for a name with no vendor of record", () => {
    const s = newState({ claims: { claimed_name: "Parsons Corporation" } });
    expect(evaluateGaps(s).map((x) => x.rule)).toEqual(["G2"]);
  });
});

describe("conflicts (REV-51)", () => {
  it("attribution, remit_owner and account conflicts get stable ids and the exact sentences", () => {
    const s = s1();
    const t11 = seed(s, "T11", { parent_uei: "MBPHTU7Y9S65", addr_key: "k" }, [{ row_key: "KHK6E1JW9C15-C", matched_uei: "KHK6E1JW9C15", matched_level: "C", matched_name: "BOOZ ALLEN HAMILTON INC", address_line1: "1 COMMVAULT WAY STE 205", city_name: "TINTON FALLS", state_code: "NJ", zip: "07724", vendor_id_on_file: null }]);
    seed(s, "T07", { account_hash: S1_HASH }, T07[S1_HASH]!);
    s.request_id = "BCR-2026-0412";
    const made = raiseConflicts(s);
    const ro = made.find((c) => c.conflict_id.startsWith("cf-remit_owner"))!;
    expect(ro.description).toBe("The new remit address is a real BOOZ ALLEN HAMILTON INC address, but it belongs to UEI KHK6E1JW9C15, not to UEI JCBMLGPE6Z71 that we contract with and pay.");
    expect(ro).toMatchObject({ resolution: "resolved", by: "identity_examiner", description_source: "template" });
    expect(ro.conflict_id).toBe(conflictId("remit_owner", "KHK6E1JW9C15"));
    expect(made.find((c) => c.conflict_id.startsWith("cf-account"))!.description).toBe("The requested account is already on Quillan Ridge Fleet Services LLC (fictional) (V-10812).");
    expect(raiseConflicts(s)).toEqual([]);
    void t11;
    s.candidates.push(cand({ vendor_id: "V-10587", legal_name: "SAIC" }));
    expect(raiseConflicts(s)[0]!.description).toBe("This request could belong to Booz Allen Hamilton Inc (V-10027) or SAIC (V-10587); the evidence does not decide which.");
  });
  it("a model-written conflict needs two accepted observations that differ in value or source", () => {
    const s = s1();
    const ids = Object.keys(s.evidence);
    expect(() => guardConflict(s, [ids[0]!])).toThrow(ToolGuardError);
    expect(() => guardConflict(s, [ids[0]!, ids[0]!])).toThrow(ToolGuardError);
    expect(() => guardConflict(s, ids.slice(0, 3))).not.toThrow();
  });
});

describe("soft-link critique input (04 §6.3 partition rule)", () => {
  it("puts invoice and name rows that agree under supporting; the sender domain is left to policy code (R1), never a contradiction", () => {
    const s = s1();
    s.eml = { from_domain: "boozallen-payments.example", reply_to_domain: null, date: null };
    seed(s, "T03", { invoice_nos: ["INV-BAH-20931"] }, [{ invoice_no: "INV-BAH-20931", vendor_id: "V-10027" }]);
    seed(s, "T04b", { token: "BOOZ" }, [{ vendor_id: "V-10027", legal_name: "Booz Allen Hamilton Inc", name_norm: "BOOZ ALLEN HAMILTON INC", uei: "JCBMLGPE6Z71", registrant_cik: "0001443646" }]);
    const input = critiqueInput(s, link({})) as { scope: string; supporting: Array<{ field: string }>; contradicting: Array<{ field: string }> };
    expect(input.supporting.map((o) => o.field).sort()).toEqual(["invoice_refs", "legal_name", "legal_name"]);
    expect(input.contradicting).toEqual([]);
    expect(input.scope).toContain("judged separately by policy code");
  });
});

import { describeConflictsOnce } from "../../../app/agents/identity-examiner/describe";
import { linkSeeds } from "../../../app/components/identity-linker";
import { Budget } from "../../../app/orchestration/budget";
import type { RunContext } from "../../../app/orchestration/ctx";
import { FakeModels } from "../_support/fakes";

describe("describe_conflicts guard (REV-51)", () => {
  async function ctxWith(reply: (items: Array<{ conflict_id: string; template: string }>) => unknown) {
    const s = s1();
    const t11 = seed(s, "T11", { parent_uei: "MBPHTU7Y9S65", addr_key: "k" }, [{ row_key: "KHK6E1JW9C15-C", matched_uei: "KHK6E1JW9C15", matched_level: "C", matched_name: "BOOZ ALLEN HAMILTON INC", address_line1: "1 COMMVAULT WAY STE 205", city_name: "TINTON FALLS", state_code: "NJ", zip: "07724", vendor_id_on_file: null }]);
    void t11;
    raiseConflicts(s);
    s.budget.deadline_ms = Date.now() + 480_000;
    const models = new FakeModels((req) => ({ content: JSON.stringify({ items: reply((JSON.parse(String(req.messages.at(-1)!.content)) as { items: Array<{ conflict_id: string; template: string }> }).items) }) }));
    const ctx = { s, budget: new Budget(s), signal: new AbortController().signal, callIndex: 0, deps: { ports: { models } }, tracer: { emit: () => undefined } } as unknown as RunContext;
    return { s, ctx, models };
  }
  it("keeps a faithful model sentence and marks it as model-written", async () => {
    const { s, ctx } = await ctxWith((items) => items.map((i) => ({ conflict_id: i.conflict_id, description: "USAspending lists the new remit address under UEI KHK6E1JW9C15, a different entity from UEI JCBMLGPE6Z71 that we contract with and pay." })));
    await describeConflictsOnce(ctx);
    expect(s.conflicts[0]).toMatchObject({ description_source: "model" });
    expect(s.conflicts[0]!.description).toContain("KHK6E1JW9C15");
  });
  it("keeps the template when the model drops an id, adds advice, or invents a number", async () => {
    for (const bad of ["The address belongs to another entity, so it should be blocked.", "It belongs to UEI KHK6E1JW9C15 and UEI JCBMLGPE6Z71, paid $9,999.00.", "Different entity at UEI KHK6E1JW9C15 versus UEI JCBMLGPE6Z71. Do not pay. Really."]) {
      const { s, ctx } = await ctxWith((items) => items.map((i) => ({ conflict_id: i.conflict_id, description: bad })));
      const before = s.conflicts[0]!.description;
      await describeConflictsOnce(ctx);
      expect(s.conflicts[0]).toMatchObject({ description: before, description_source: "template" });
    }
  });
  it("runs at most once per run", async () => {
    const { ctx, models } = await ctxWith((items) => items.map((i) => ({ conflict_id: i.conflict_id, description: i.template })));
    await describeConflictsOnce(ctx);
    await describeConflictsOnce(ctx);
    expect(models.calls).toHaveLength(1);
  });
});

describe("link seeds (C3)", () => {
  it("S1 yields attribution (soft), vendor_entity (hard), registrant (hard); a zip conflict makes the remit link soft", () => {
    const s = s1();
    const kinds = linkSeeds(s).map((x) => `${x.type}:${x.hardness}`);
    expect(kinds).toEqual(["attribution:soft", "vendor_entity:hard", "registrant:hard"]);
    seed(s, "T11", { parent_uei: "p", addr_key: "k" }, [{ row_key: "r", matched_uei: "KHK6E1JW9C15", matched_level: "C", matched_name: "x", address_line1: "1 COMMVAULT WAY STE 205", city_name: "TINTON FALLS", state_code: "NJ", zip: "07999", vendor_id_on_file: null }]);
    expect(linkSeeds(s).find((x) => x.type === "remit_owner")!.hardness).toBe("soft");
  });
});
