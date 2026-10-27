import { describe, expect, it } from "vitest";
import { bannerText, holdPhrase, recommendations, summaryText } from "../../../app/policy/banners";
import { callbackEvidence, NO_NUMBER_LIMITATION, phonesOnFileFromState, selectCallback } from "../../../app/policy/callback";
import { mk } from "../../../app/policy/code-util";
import { CL_L3, T02, T05, VENDORS } from "../_support/data";
import { cand, newState, seed } from "../_support/state";

function s1() {
  const s = newState({ claims: { remit_address: { line1: "1 Commvault Way", unit: "Suite 205", city: "Tinton Falls", state: "NJ", zip: "07724" }, pressure_phrases: [{ quote: "Please do not use the old main number", kind: "avoid_verification" }] } });
  s.extras.request_phones = ["+17035550147"];
  s.candidates = [cand({ vendor_id: "V-10027", legal_name: "Booz Allen Hamilton Inc", uei: "JCBMLGPE6Z71", registrant_cik: "0001443646" })];
  seed(s, "T02", { vendor_id: "V-10027" }, T02["V-10027"]!);
  seed(s, "T05", { vendor_id: "V-10027" }, [T05["V-10027"]!]);
  return s;
}

describe("call-back selector (spine §4.5)", () => {
  it("picks the EDGAR registrant, lists both request and recently changed numbers as do-not-use, and never targets 555-01xx", () => {
    const s = s1();
    const { scripts, limitations } = selectCallback(s, phonesOnFileFromState(s));
    expect(limitations).toEqual([]);
    const sc = scripts[0]!;
    expect(sc).toMatchObject({ number_e164: "+17039025000", number_source: "edgar_registrant", source_ref: "CIK 0001443646", for_vendor_id: "V-10027" });
    expect(sc.do_not_use).toEqual([
      { number_display: "(703) 555-0147", reason: "appears only on the request" },
      { number_display: "(703) 555-0182", reason: "changed on file 2026-10-19, 3 days before the request" },
    ]);
    expect(sc.lines).toHaveLength(6);
    expect(sc.lines[1]).toBe("Ask for accounts receivable or treasury. Do not read out the new details first.");
    expect(sc.lines[2]).toBe("Ask them to state the bank name and the last four digits of the account they expect us to pay.");
    expect(sc.lines[3]).toBe("Ask them to state the remit-to address they expect. Compare it with: 1 Commvault Way, Suite 205, Tinton Falls, NJ 07724.");
    expect(sc.lines[5]).toBe("Record the outcome in Probity: confirmed, denied or no answer.");
    expect(sc.lines[0]!.split("Do not use")[0]).not.toMatch(/555-01\d\d/);
  });
  it("falls back to the vendor-master number on file 30 days before the request when there is no registrant", () => {
    const s = s1();
    const q = Object.values(s.queries).find((x) => x.template_id === "T05")!;
    q.rows = [{ ...q.rows[0], cik: null, sec_phone: null }];
    const { scripts } = selectCallback(s, phonesOnFileFromState(s));
    expect(scripts[0]).toMatchObject({ number_e164: "+17039025000", number_source: "vendor_master_pre_window", source_label: "Vendor master, on file since 2019-04-02", valid_since: "2019-04-02 00:00:00" });
  });
  it("returns [] and the escalation limitation when no number is independent", () => {
    const s = newState();
    s.extras.request_phones = ["+17035550147"];
    const r = selectCallback(s, () => []);
    expect(r.scripts).toEqual([]);
    expect(r.limitations).toEqual([NO_NUMBER_LIMITATION]);
  });
  it("R4 with two candidates yields one script each", () => {
    const s = newState();
    s.candidates = [cand({ vendor_id: "V-10442", legal_name: "Leidos, Inc.", uei: "UE9QJD4KK1L6", registrant_cik: "0001336920" }), cand({ vendor_id: "V-10587", legal_name: "SAIC", uei: "MMLKPW9JLX64", registrant_cik: "0001571123" })];
    seed(s, "T05", { vendor_id: "V-10442" }, [{ vendor_id: "V-10442", cik: "0001336920", sec_phone: "571-526-6000" }]);
    seed(s, "T05", { vendor_id: "V-10587" }, [{ vendor_id: "V-10587", cik: "0001571123", sec_phone: "703-676-4300" }]);
    const { scripts } = selectCallback(s, () => []);
    expect(scripts.map((x) => x.number_e164)).toEqual(["+15715266000", "+17036764300"]);
  });
  it("callback_evidence returns the T08 row that clears C1 with who logged it", () => {
    const s = newState({ received_at: "2026-10-20T14:05:00Z", request_id: "BCR-2026-0398" });
    s.candidates = [cand({ vendor_id: "V-10198", legal_name: "L3Harris Technologies, Inc." })];
    seed(s, "T08", { request_id: "BCR-2026-0398", vendor_id: "V-10198" }, [CL_L3]);
    const ev = callbackEvidence(s);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ log_id: "CL-20398", called_by: "M. Okonkwo (fictional)", phone_source: "edgar_registrant", phone_display: "(321) 727-9100" });
    expect(ev[0]!.evidence_id).toMatch(/^ev-[0-9a-f]{8}-\d+-cp$/);
  });
  it("uses the vendor fixture data unchanged", () => expect(VENDORS["V-10027"]!.uei).toBe("JCBMLGPE6Z71"));
});

const base = { codes: [] as ReturnType<typeof mk>[], vendor_name: "Booz Allen Hamilton Inc", candidates: [{ vendor_id: "V-10027", vendor_name: "Booz Allen Hamilton Inc", item_count: 3, amount_usd: 1284550 }], claimed_name: "Booz Allen Hamilton Inc.", vendor_item_count: 3, vendor_amount_usd: 1284550, payment_run_id: "PR-2026-10-30", callback: { number_display: "(703) 902-5000", source_label: "SEC EDGAR submissions, CIK 0001443646, fetched 2026-10-27T12:00:00Z" }, callback_date: "2026-10-21" };

describe("banners, summary and recommendations", () => {
  it("HOLD phrase follows R5, R3, R6, R4, R1, R2, R7", () => {
    expect(holdPhrase([mk("R1", ""), mk("R3", ""), mk("R6", "")])).toBe("the new address belongs to a different company, not our vendor");
    expect(holdPhrase([mk("R1", ""), mk("R6", "")])).toBe("the new bank account is already on another vendor");
    expect(holdPhrase([mk("R5", ""), mk("R3", "")])).toBe("a detail in this request was used in a confirmed impersonation");
    expect(holdPhrase([mk("R2", ""), mk("R7", "")])).toBe("the new address matches none of this company's known addresses");
    expect(holdPhrase([mk("R4", "", [], { variant: "link_pending" }), mk("R1", "")])).toBe("the request could not be tied to our vendor with approved evidence");
  });
  it("S1 HOLD banner with the exposure from T09", () => {
    const b = bannerText({ ...base, decision: "HOLD", codes: [mk("R3", "")] });
    expect(b).toEqual({ variant: "standard", text: "Hold: the new address belongs to a different company, not our vendor. Do not change bank details for Booz Allen Hamilton Inc. 3 payment(s) totalling $1,284,550.00 in PR-2026-10-30 need review before release." });
  });
  it("multi_candidate, no_vendor, no_number and APPROVE variants", () => {
    const two = [{ vendor_id: "V-10442", vendor_name: "Leidos, Inc.", item_count: 2, amount_usd: 100 }, { vendor_id: "V-10587", vendor_name: "Science Applications International Corp", item_count: 1, amount_usd: 50.5 }];
    const multi = bannerText({ ...base, decision: "HOLD", codes: [mk("R4", "", [], { variant: "multi_candidate" })], candidates: two, vendor_name: null, vendor_item_count: 3, vendor_amount_usd: 150.5 });
    expect(multi.variant).toBe("multi_candidate");
    expect(multi.text).toBe("Hold: we cannot tell which vendor this request is for. Do not change bank details for either Leidos, Inc. or Science Applications International Corp. 3 payment(s) totalling $150.50 in PR-2026-10-30 need review before release.");
    const none = bannerText({ ...base, decision: "CALLBACK_VERIFY", vendor_name: null, candidates: [], claimed_name: "Zephyrine Orbital Logistics LLC", callback: null });
    expect(none).toEqual({ variant: "no_vendor", text: "Call back first: Zephyrine Orbital Logistics LLC is not one of our vendors, so there is nothing to change yet. No independent number was found: escalate to the contracting officer for a verified contact. Do not use the numbers on the request." });
    expect(bannerText({ ...base, decision: "CALLBACK_VERIFY", callback: null })).toEqual({ variant: "no_number", text: "Call back before changing anything. No independent number was found: escalate to the contracting officer for a verified contact. Do not use the numbers on the request." });
    expect(bannerText({ ...base, decision: "CALLBACK_VERIFY" }).text).toBe("Call back before changing anything. Use (703) 902-5000 (SEC EDGAR submissions, CIK 0001443646, fetched 2026-10-27T12:00:00Z). Do not use the numbers on the request.");
    expect(bannerText({ ...base, decision: "APPROVE" }).text).toBe("Approve: every checked fact agrees, and an independent call-back confirmed the change on 2026-10-21.");
  });
  it("banners and summaries never contain braces, empty parens, 'for .' or null", () => {
    const all = [
      bannerText({ ...base, decision: "HOLD", codes: [mk("R1", "")] }).text,
      bannerText({ ...base, decision: "CALLBACK_VERIFY" }).text,
      summaryText({ ...base, decision: "HOLD", codes: [mk("R3", "")] }),
      summaryText({ ...base, decision: "CALLBACK_VERIFY" }),
      summaryText({ ...base, decision: "APPROVE" }),
    ];
    for (const t of all) expect(t).not.toMatch(/[{}]|\(\)|for \.|null/);
  });
  it("output.summary templates", () => {
    expect(summaryText({ ...base, decision: "HOLD", codes: [mk("R3", "")] })).toBe("Hold: Booz Allen Hamilton Inc (V-10027). The new address belongs to a different company, not our vendor.");
    expect(summaryText({ ...base, decision: "CALLBACK_VERIFY" })).toBe("Call back first: Booz Allen Hamilton Inc (V-10027). Proof is incomplete until an independent call-back confirms the change.");
    expect(summaryText({ ...base, decision: "APPROVE" })).toBe("Approve: Booz Allen Hamilton Inc (V-10027). Every checked fact agrees and an independent call-back confirmed the change.");
  });
  it("recommendations carry the do-not-call suffix on every phone", () => {
    const r = recommendations({ decision: "HOLD", vendor_id: "V-10027", callbacks: [{ number_display: "(703) 902-5000", number_source: "edgar_registrant" }], callback_date: null, no_number: false, findings: [{ item_id: "PRI-1030-0009", vendor_name: "Quillan Ridge Fleet Services LLC (fictional)", amount_usd: 87400 }] });
    expect(r).toEqual(["Do not change bank details for V-10027.", "Call (703) 902-5000 (SEC EDGAR) (demo scenario: do not call)", "Review PRI-1030-0009 (Quillan Ridge Fleet Services LLC (fictional), $87,400.00) before release."]);
  });
});
