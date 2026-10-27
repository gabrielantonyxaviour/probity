// Reason codes R1-R7, C1-C6, I1-I6 on seeded evidence (04 §7.8 predicates and detail templates, §8.1 oracle sets).
import { describe, expect, it } from "vitest";
import { assertApproveInvariants, computeCodes, computeCodesFull, decide, previewCodes } from "../../../app/policy/gate";
import { phonesOnFileFromState } from "../../../app/policy/callback";
import type { PolicyState } from "../../../app/orchestration/state";
import { CL_L3, S1_HASH, T02, T05, T05B, T07, VENDORS } from "../_support/data";
import { cand, newState, seed } from "../_support/state";

const OWN_ROW = { via: "bank_change_request", owner_vendor_id: "V-10027", request_id: "BCR-2026-0412", bank_account_id: null, status: "pending", at_ts: "2026-10-22 15:12:00", vendor_name: null };
const codesOf = (s: PolicyState, atDecide = true) => computeCodes(s, { phonesAt: phonesOnFileFromState(s), atDecide, nowMs: Date.parse("2026-10-27T12:30:00Z") });
const ids = (s: PolicyState, atDecide = true) => codesOf(s, atDecide).map((c) => c.code);
const detail = (s: PolicyState, code: string) => codesOf(s).find((c) => c.code === code)?.detail;

function booz(opts: { domain?: string | null; reply?: string | null; address?: boolean; hard?: boolean } = {}): PolicyState {
  const s = newState({ claims: {
    claimed_name: "Booz Allen Hamilton Inc.", invoice_refs: ["INV-BAH-20931"],
    remit_address: opts.address === false ? null : { line1: "1 Commvault Way", unit: "Suite 205", city: "Tinton Falls", state: "NJ", zip: "07724" },
    bank: { bank_name: null, routing: "110000000", account_last4: "0141" },
  } });
  s.account_hash = S1_HASH;
  s.extras.account_last4 = "0141";
  s.eml = { from_domain: opts.domain === undefined ? "boozallen-payments.example" : opts.domain, reply_to_domain: opts.reply ?? null, date: null };
  s.candidates = [cand({ vendor_id: "V-10027", legal_name: "Booz Allen Hamilton Inc", uei: "JCBMLGPE6Z71", registrant_cik: "0001443646", hardness: opts.hard ? "hard" : "soft" })];
  seed(s, "T01", { vendor_id: "V-10027" }, [VENDORS["V-10027"]!]);
  seed(s, "T02", { vendor_id: "V-10027" }, T02["V-10027"]!);
  seed(s, "T05", { vendor_id: "V-10027" }, [T05["V-10027"]!]);
  seed(s, "T05b", { parent_uei: "MBPHTU7Y9S65" }, [T05B.MBPHTU7Y9S65!]);
  seed(s, "T08", { request_id: "BCR-2026-0412", vendor_id: "V-10027" }, []);
  return s;
}

describe("red codes", () => {
  it("R1 fires on a lookalike with the exact detail, and on a Reply-To only", () => {
    const s = booz();
    expect(detail(s, "R1")).toBe("Sender domain boozallen-payments.example is not on file for Booz Allen Hamilton Inc (on file: boozallen.example); it imitates boozallen.");
    const rt = booz({ domain: "boozallen.example", reply: "remit-desk.example" });
    expect(detail(rt, "R1")).toBe("Sender domain remit-desk.example is not on file for Booz Allen Hamilton Inc (on file: boozallen.example).");
  });
  it("R1 never fires for an on-file sender, a missing Reply-To, or no headers", () => {
    expect(ids(booz({ domain: "boozallen.example" }))).not.toContain("R1");
    const none = booz();
    none.eml = null;
    expect(ids(none)).not.toContain("R1");
  });
  it("R2 fires when the claimed address matches nothing, with the family name", () => {
    const s = booz();
    expect(ids(s)).toContain("R2");
    expect(detail(s, "R2")).toBe("The claimed remit address 1 Commvault Way, Suite 205, Tinton Falls, NJ 07724 matches no address on file or in USAspending or SEC EDGAR for the Booz Allen Hamilton Inc family.");
    expect(ids(booz({ address: false }))).not.toContain("R2");
  });
  it("R2 becomes I3 when the family list has exactly 100 rows", () => {
    const s = booz();
    seed(s, "T10", { parent_uei: "MBPHTU7Y9S65" }, [{ child_uei: "AAA", child_name: "x", state_province: "VA", list_size: 100 }]);
    expect(ids(s)).not.toContain("R2");
    expect(ids(s)).toContain("I3");
  });
  it("R3 needs a hard match on a different UEI that no vendor carries; a vendor of record or a zip conflict does not", () => {
    const t11 = { row_key: "K-C", matched_uei: "KHK6E1JW9C15", matched_level: "C", matched_name: "BOOZ ALLEN HAMILTON INC", address_line1: "1 COMMVAULT WAY STE 205", city_name: "TINTON FALLS", state_code: "NJ", zip: "07724", via: "s", vendor_id_on_file: null };
    const s = booz();
    seed(s, "T11", { parent_uei: "MBPHTU7Y9S65", addr_key: "1 COMMVAULT WAY|TINTON FALLS|NJ" }, [t11]);
    expect(ids(s)).toContain("R3");
    expect(ids(s)).not.toContain("R2");
    expect(detail(s, "R3")).toBe("The claimed remit address belongs to BOOZ ALLEN HAMILTON INC (UEI KHK6E1JW9C15), a different entity that is not our vendor of record (V-10027, UEI JCBMLGPE6Z71).");
    const own = booz();
    seed(own, "T11", { parent_uei: "x", addr_key: "k" }, [{ ...t11, vendor_id_on_file: "V-99999" }]);
    expect(ids(own)).not.toContain("R3");
    const zip = booz();
    seed(zip, "T11", { parent_uei: "x", addr_key: "k" }, [{ ...t11, zip: "07999" }]);
    expect(ids(zip)).not.toContain("R3");
  });
  it("a failed tier-2 read never asserts that the address 'matches nothing': R2 steps aside for a held link (R4)", () => {
    const s = booz();
    const q = seed(s, "T11", { parent_uei: "MBPHTU7Y9S65", addr_key: "k" }, []);
    (q as { status: string }).status = "error";
    expect(ids(s)).not.toContain("R2");
    expect(detail(s, "R4")).toBe("The remit-address owner link for V-10027 was not examined, so it stays held.");
    expect(ids(s, false)).not.toContain("R4");
  });
  it("R4 variants: multi_candidate, link_rejected, link_pending (only at DECIDE, with the sample suffix)", () => {
    const m = booz();
    m.candidates.push(cand({ vendor_id: "V-10587", legal_name: "Science Applications International Corp" }));
    const r4 = codesOf(m).find((c) => c.code === "R4")!;
    expect(r4).toMatchObject({ variant: "multi_candidate", detail: "Cannot determine which vendor this request is for. Do not guess." });
    const p = booz();
    p.links.a = { link_id: "lnk-aaaaaaaaaaaaaaaa", type: "attribution", from: "req:BCR", to: "vendor:V-10027", evidence_ids: [], hardness: "soft", required: true, status: "pending", rule_hits: [], verdicts: [], requeried: false };
    expect(ids(p, true)).toContain("R4");
    expect(ids(p, false)).not.toContain("R4");
    expect(detail(p, "R4")).toBe("The attribution link for V-10027 was not examined, so it stays held.");
    p.mode = "sample";
    expect(detail(p, "R4")).toBe("The attribution link for V-10027 was not examined, so it stays held. Sample mode does not run the Examiner's model step.");
    p.links.a!.status = "rejected";
    p.links.a!.verdicts = [{ link_id: p.links.a!.link_id, verdict: "reject", rule_hits: ["B1"], missing_evidence: [], rationale: "name similarity only", model: null }];
    expect(detail(p, "R4")).toBe("Identity Examiner rejected the attribution link for V-10027: name similarity only.");
  });
  it("R5 comes from recalled known-bad artifacts and cites the session", () => {
    const s = booz();
    s.recalls.push({ engine: "world_model", memory_id: "f1", session_id: "s-2026-10-27T14:00:03Z", text: "", effect: "R5 known_bad_artifact", subject: "bank_account:0141", confidence: 1 });
    expect(detail(s, "R5")).toBe("Used in a request later confirmed as an impersonation (session s-2026-10-27T14:00:03Z).");
  });
  it("R6 names the other vendor and excludes this request and the vendor's own account", () => {
    const s = booz();
    seed(s, "T07", { account_hash: S1_HASH }, [...T07[S1_HASH]!, OWN_ROW]);
    expect(detail(s, "R6")).toBe("The requested account (ending 0141) is already on Quillan Ridge Fleet Services LLC (fictional) (V-10812), active since 2026-10-18.");
    const own = booz();
    seed(own, "T07", { account_hash: S1_HASH }, [{ via: "vendor_bank_account", owner_vendor_id: "V-10027", bank_account_id: "BA-1", status: "active", at_ts: "2026-01-01" }, OWN_ROW]);
    expect(ids(own)).not.toContain("R6");
  });
  it("R7 fires on a bad ABA checksum locally and on T08b", () => {
    const s = booz();
    s.claims!.bank!.routing = "11000000";
    expect(detail(s, "R7")).toBe("Routing number 11000000 is not a valid ABA routing number (DQ3 request_routing_valid).");
    const q = booz();
    seed(q, "T08b", { request_id: "BCR-2026-0412" }, [{ request_id: "BCR-2026-0412", new_routing: "110000000", routing_check: "invalid" }]);
    expect(ids(q)).toContain("R7");
  });
});

describe("cap codes", () => {
  it("C1 stands without a qualifying call-back, and is cleared only by an independent confirmed call on this request", () => {
    const s = newState({ received_at: "2026-10-20T14:05:00Z", request_id: "BCR-2026-0398" });
    s.candidates = [cand({ vendor_id: "V-10198", legal_name: "L3Harris Technologies, Inc.", uei: "QM4EZDV15JL8", registrant_cik: "0000202058", hardness: "hard" })];
    seed(s, "T08", { request_id: "BCR-2026-0398", vendor_id: "V-10198" }, [CL_L3]);
    expect(ids(s)).not.toContain("C1");
    const other = newState({ received_at: "2026-10-20T14:05:00Z", request_id: "BCR-2026-0500" });
    other.candidates = s.candidates;
    seed(other, "T08", { request_id: "BCR-2026-0500", vendor_id: "V-10198" }, [CL_L3]);
    expect(ids(other)).toContain("C1");
    const circular = newState({ received_at: "2026-10-20T14:05:00Z", request_id: "BCR-2026-0398" });
    circular.candidates = s.candidates;
    circular.extras.request_phones = ["+13217279100"];
    seed(circular, "T08", { request_id: "BCR-2026-0398", vendor_id: "V-10198" }, [CL_L3]);
    expect(ids(circular)).toContain("C1");
    const early = newState({ received_at: "2026-10-22T14:05:00Z", request_id: "BCR-2026-0398" });
    early.candidates = s.candidates;
    seed(early, "T08", { request_id: "BCR-2026-0398", vendor_id: "V-10198" }, [CL_L3]);
    expect(ids(early)).toContain("C1");
  });
  it("C2 flags a mirror or a stale cache as the best evidence of a decisive field, never a fresh cache", () => {
    const s = booz({ domain: "boozallen.example" });
    seed(s, "T11", { parent_uei: "p", addr_key: "k" }, [{ row_key: "r", matched_uei: "JCBMLGPE6Z71", address_line1: "1 COMMVAULT WAY STE 205", city_name: "TINTON FALLS", state_code: "NJ", zip: "07724", vendor_id_on_file: "V-10027" }], { mode: "mirror" });
    expect(ids(s)).not.toContain("C2"); // another USAspending observation of the same field is still live
    for (const o of Object.values(s.evidence)) if (o.source === "usaspending") o.mode = "mirror";
    expect(ids(s)).toContain("C2");
    expect(detail(s, "C2")).toBe("USAspending evidence is from a registry mirror, not a live source.");
    const fresh = booz({ domain: "boozallen.example", address: false });
    for (const q of Object.values(fresh.queries)) q.mode = "zetaris_cache";
    for (const o of Object.values(fresh.evidence)) o.mode = "zetaris_cache";
    expect(ids(fresh)).not.toContain("C2");
    for (const o of Object.values(fresh.evidence)) o.fetched_at = "2026-10-25T00:00:00Z";
    expect(ids(fresh)).toContain("C2");
    expect(detail(fresh, "C2")).toMatch(/evidence is from a cache older than 24 hours, not a live source\.$/);
  });
  it("C5 names how the phone was changed even when the World Model returns ISO times", () => {
    const s = booz();
    const iso = (vendor_id: string, at: string) => phonesOnFileFromState(s)(vendor_id, at).map((w) => ({ ...w, valid_from: new Date(w.valid_from.replace(" ", "T") + "Z").toISOString() }));
    const c5 = computeCodes(s, { phonesAt: iso, nowMs: Date.parse("2026-10-27T12:30:00Z") }).find((c) => c.code === "C5")!;
    expect(c5.detail).toBe("The vendor's phone on file was changed on 2026-10-19, 3 days before the request (email request).");
  });
  it("C3, C4, C5, C6", () => {
    const s = booz();
    s.candidates[0]!.uei = null;
    s.candidates[0]!.registrant_cik = null;
    expect(detail(s, "C3")).toBe("Booz Allen Hamilton Inc has no federal or SEC identifier on file; only internal records can be checked.");
    s.extras.has_documents = false;
    s.extras.has_eml = false;
    expect(detail(s, "C4")).toBe("Claims were typed in, not read from a document.");
    expect(detail(booz(), "C5")).toBe("The vendor's phone on file was changed on 2026-10-19, 3 days before the request (email request).");
    const none = newState();
    expect(detail(none, "C6")).toBe("No vendor of record matches this request.");
  });
});

describe("info codes", () => {
  it("I1 fires when the parent location and EDGAR disagree and carries known_benign when suppressed", () => {
    const s = newState();
    s.candidates = [cand({ vendor_id: "V-10112", legal_name: "CACI, INC. - FEDERAL", uei: "N3PBJAVNKF61", registrant_cik: "0000016058" })];
    seed(s, "T05", { vendor_id: "V-10112" }, [{ vendor_id: "V-10112", entity_key: "N3PBJAVNKF61-C", parent_uei: "QSRTXLFKV857", cik: "0000016058", sec_name: "CACI INTERNATIONAL INC", biz_street1: "11487 Sunset Hills Road", biz_city: "Reston", biz_state: "VA" }]);
    seed(s, "T05b", { parent_uei: "QSRTXLFKV857" }, [{ p_entity_key: "QSRTXLFKV857-P", p_legal_name: "CACI INTERNATIONAL INC", p_address_line1: "12021 SUNSET HILLS RD", p_city_name: "RESTON", p_state_code: "VA", p_zip: "20190" }]);
    const i1 = codesOf(s).find((c) => c.code === "I1")!;
    expect(i1.detail).toBe("USAspending lists 12021 SUNSET HILLS RD, RESTON, VA; SEC EDGAR lists 11487 Sunset Hills Road, Reston, VA.");
    expect(i1.annotation).toBeUndefined();
    s.suppressed_rules.push({ rule: "G5", subject: "V-10112", memory_id: "m1" });
    expect(codesOf(s).find((c) => c.code === "I1")!.annotation).toBe("known_benign");
  });
  it("I2 recognises a former name of the vendor's own registrant", () => {
    const s = newState({ claims: { claimed_name: null, letterhead_name: "Vectrus, Inc." } });
    s.candidates = [cand({ vendor_id: "V-10311", legal_name: "V2X, Inc.", uei: "CG8SV4246V29", registrant_cik: "0001601548" })];
    seed(s, "T06a", { name_norm: "VECTRUS INC" }, [{ via: "alias", key: "0001601548", name: "Vectrus, Inc.", name_norm: "VECTRUS INC", alias_source: "edgar_former", valid_from: "2014-04-04", valid_to: "2022-06-15" }]);
    expect(detail(s, "I2")).toBe("'Vectrus, Inc.' is a former or alternate name of V2X, Inc. (SEC EDGAR former name, 2014-04-04–2022-06-15).");
  });
  it("I4 counts distinct parents; I5 reports placeholders and empty addresses with the code-check suffix; I6 quotes the first phrase", () => {
    const s = booz();
    s.claims!.pressure_phrases = [{ quote: "Do not call us.", kind: "avoid_verification" }];
    expect(detail(s, "I6")).toBe('The request says: "Do not call us."');
    expect(detail(s, "I5")).toBe("SEC EDGAR data gap: EIN is the placeholder 000000000 for Booz Allen Hamilton Holding Corp. (checked in code)");
    seed(s, "T10", { parent_uei: "ZL41ERXMPAR3" }, [{ child_uei: "JCBMLGPE6Z71", child_name: "x", state_province: "VA", list_size: 5 }]);
    expect(detail(s, "I4")).toBe("USAspending lists 2 different parents for JCBMLGPE6Z71: MBPHTU7Y9S65, ZL41ERXMPAR3.");
  });
});

describe("verdict function, ordering and APPROVE invariants", () => {
  it("decide is the spine function over classes", () => {
    expect(decide([])).toBe("APPROVE");
    expect(decide([{ class: "info" }, { class: "cap" }])).toBe("CALLBACK_VERIFY");
    expect(decide([{ class: "cap" }, { class: "red" }])).toBe("HOLD");
  });
  it("sorts red, then cap, then info, then by number", () => {
    const s = booz();
    s.claims!.pressure_phrases = [{ quote: "q", kind: "urgency" }];
    seed(s, "T07", { account_hash: S1_HASH }, T07[S1_HASH]!);
    const order = ids(s);
    expect(order).toEqual([...order].sort((a, b) => ({ R: 0, C: 1, I: 2 })[a[0]!]! - { R: 0, C: 1, I: 2 }[b[0]!]! || Number(a.slice(1)) - Number(b.slice(1))));
  });
  it("S3 shape: no codes, APPROVE, full live coverage; an offline or degraded run can never reach APPROVE", () => {
    const s = newState({ received_at: "2026-10-20T14:05:00Z", request_id: "BCR-2026-0398", claims: { claimed_name: "L3Harris Technologies, Inc.", bank: { bank_name: null, routing: "110000000", account_last4: "0198" } } });
    s.eml = { from_domain: "l3harris.example", reply_to_domain: null, date: null };
    s.candidates = [cand({ vendor_id: "V-10198", legal_name: "L3Harris Technologies, Inc.", uei: "QM4EZDV15JL8", registrant_cik: "0000202058", hardness: "hard", signals: ["domain_on_file", "name_exact"] })];
    seed(s, "T01", { vendor_id: "V-10198" }, [VENDORS["V-10198"]!]);
    seed(s, "T02", { vendor_id: "V-10198" }, T02["V-10198"]!);
    seed(s, "T05", { vendor_id: "V-10198" }, [{ ...T05["V-10198"]!, biz_street1: "1395 Troutman Blvd NE", biz_city: "Palm Bay", biz_state: "FL" }]);
    seed(s, "T05b", { parent_uei: "SJULQDJ8NZU7" }, [{ ...T05B.SJULQDJ8NZU7!, p_address_line1: "1395 TROUTMAN BLVD NE", p_city_name: "PALM BAY", p_state_code: "FL" }]);
    seed(s, "T07", { account_hash: "a".repeat(64) }, [{ via: "bank_change_request", owner_vendor_id: "V-10198", request_id: "BCR-2026-0398", bank_account_id: null, status: "pending", at_ts: "2026-10-20 14:05:00", vendor_name: null }]);
    seed(s, "T08", { request_id: "BCR-2026-0398", vendor_id: "V-10198" }, [CL_L3]);
    s.account_hash = "a".repeat(64);
    for (const l of ["attribution", "vendor_entity"] as const) s.links[l] = { link_id: `lnk-${l.length.toString(16).padStart(16, "0")}`, type: l, from: "a", to: "b", evidence_ids: [], hardness: "hard", required: true, status: "approved", rule_hits: [], verdicts: [], requeried: false };
    const r = computeCodesFull(s, { phonesAt: phonesOnFileFromState(s), nowMs: Date.parse("2026-10-27T12:30:00Z") });
    expect(r.codes.map((c) => c.code)).toEqual(["I5"].filter((c) => r.codes.some((x) => x.code === c)));
    expect(r.codes.filter((c) => c.class !== "info")).toEqual([]);
    expect(decide(r.codes)).toBe("APPROVE");
    expect(r.coverage.with_live_evidence).toBe(r.coverage.decisive_fields);
    expect(() => assertApproveInvariants(s, r.codes, r.coverage)).not.toThrow();
    s.mode = "sample";
    expect(() => assertApproveInvariants(s, r.codes, r.coverage)).toThrow(/APPROVE invariant/);
    s.mode = "live";
    s.links.attribution!.status = "pending";
    expect(() => assertApproveInvariants(s, r.codes, r.coverage)).toThrow(/required link/);
    s.links.attribution!.status = "approved";
    for (const o of Object.values(s.evidence)) o.mode = "sample";
    const off = computeCodesFull(s, { phonesAt: phonesOnFileFromState(s), nowMs: Date.parse("2026-10-27T12:30:00Z") });
    expect(off.codes.map((c) => c.code)).toContain("C2");
    expect(decide(off.codes)).toBe("CALLBACK_VERIFY");
  });
  it("previewCodes skips the pending-link clause", () => {
    const s = booz();
    s.links.a = { link_id: "lnk-aaaaaaaaaaaaaaaa", type: "attribution", from: "a", to: "vendor:V-10027", evidence_ids: [], hardness: "soft", required: true, status: "pending", rule_hits: [], verdicts: [], requeried: false };
    expect(previewCodes(s, phonesOnFileFromState(s)).map((c) => c.code)).not.toContain("R4");
  });
});
