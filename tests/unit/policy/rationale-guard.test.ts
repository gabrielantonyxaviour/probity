import { describe, expect, it } from "vitest";
import { checkGrounded, groundRationale, reasonCarried } from "../../../app/policy/rationale-guard";

// Inputs shaped like rationaleInput() for the live S3 (APPROVE) and S1 (HOLD) decisions of 2026-10-27.
const S3 = {
  decision: "APPROVE", vendor_name: "L3Harris Technologies, Inc.", vendor_id: "V-10198", request_id: "BCR-2026-0398", payment_run_id: "PR-2026-10-30",
  summary: "Approve: every checked fact agrees, and an independent call-back confirmed the change on 2026-10-21.",
  exposure: { vendor_item_count: 1, vendor_amount_display: "$274,915.25" },
  codes: [],
  callback: { number_display: "(321) 727-9100", number_source_label: "SEC EDGAR submissions" },
  callback_confirmed: { number_display: "(321) 727-9100", called_on: "2026-10-21", log_id: "CL-20398" },
  do_not_use: ["(321) 555-0144"], sweep: { k: 2, amount_display: "$150,675.50" },
};
const S1 = {
  decision: "HOLD", vendor_name: "Booz Allen Hamilton Inc", vendor_id: "V-10027", request_id: "BCR-2026-0412", payment_run_id: "PR-2026-10-30",
  summary: "Hold: the new address belongs to a different company, not our vendor.",
  exposure: { vendor_item_count: 3, vendor_amount_display: "$1,284,550.00" },
  codes: [
    { class: "red", detail: "Sender domain boozallen-payments.example is not on file for Booz Allen Hamilton Inc (on file: boozallen.example); it imitates boozallen." },
    { class: "red", detail: "The claimed remit address belongs to BOOZ ALLEN HAMILTON INC (UEI KHK6E1JW9C15), a different entity that is not our vendor of record (V-10027, UEI JCBMLGPE6Z71)." },
    { class: "cap", detail: "No call-back to an independent number is on record for this request." },
  ],
  callback: { number_display: "(703) 902-5000", number_source_label: "SEC EDGAR submissions, CIK 0001443646, fetched 2026-10-27" },
  callback_confirmed: null, do_not_use: ["(703) 555-0147"], sweep: { k: 2, amount_display: "$150,675.50" },
};
const S1_GOOD = "HOLD for Booz Allen Hamilton Inc in PR-2026-10-30. The email came from boozallen-payments.example, which is not on file; the new remit address belongs to a different company, UEI KHK6E1JW9C15. No independent call-back is on record. Call (703) 902-5000 (SEC EDGAR submissions, CIK 0001443646, fetched 2026-10-27), and do not use (703) 555-0147. 2 other items totalling $150,675.50 in PR-2026-10-30 also fail payment controls.";
const S3_GOOD = "APPROVE for L3Harris Technologies, Inc. in PR-2026-10-30. Every checked fact agrees with our records. The call-back to (321) 727-9100 confirmed the change on 2026-10-21. 2 other items totalling $150,675.50 in PR-2026-10-30 also fail payment controls.";

describe("rationale grounding guard (F12)", () => {
  it("passes faithful HOLD and APPROVE notes", () => {
    expect(checkGrounded(S1_GOOD, S1).failures).toEqual([]);
    expect(checkGrounded(S3_GOOD, S3).failures).toEqual([]);
  });
  it("rejects the live S3 text that invented a limit on an APPROVE", () => {
    const live = "APPROVE for L3Harris Technologies, Inc. in PR-2026-10-30. The vendor amount of $274,915.25 exceeds the limit; the vendor item count of 1 exceeds the maximum allowed 0; the vendor ID V-10198 conflicts with the prohibited vendor list. (321) 727-9100 (SEC EDGAR submissions); do not use (321) 555-0144. 2 other items totalling $150,675.50 also fail payment controls.";
    const f = groundRationale(live, S3).join("|");
    expect(f).toMatch(/claim not in the decision: "exceed"/);
    expect(f).toMatch(/"limit"/);
    expect(f).toMatch(/"prohibit"/);
  });
  it("rejects an APPROVE that states a problem, but not the sweep sentence about other items", () => {
    expect(groundRationale(S3_GOOD.replace("Every checked fact agrees with our records.", "The sender domain is not on file."), S3).join()).toMatch(/APPROVE text states a problem/);
    expect(groundRationale(S3_GOOD, S3)).toEqual([]);
  });
  it("rejects a HOLD that leaves out a red reason, or every cap", () => {
    expect(groundRationale(S1_GOOD.replace(" No independent call-back is on record.", ""), S1).join()).toMatch(/confirm-first reasons left out; add one sentence starting "Confirm first:" that states "No call-back/);
    expect(groundRationale(S1_GOOD.replace("boozallen-payments.example", "a lookalike domain"), S1).join()).toMatch(/reason left out: "Sender domain/);
  });
  it("ties counts and amounts to their facts", () => {
    expect(groundRationale(S1_GOOD.replace("2 other items", "3 other items"), S1).join()).toMatch(/sweep count 3 is not 2/);
    expect(groundRationale(`${S1_GOOD} 2 payments totalling $1,284,550.00 need review.`, S1).join()).toMatch(/payment count 2 is not 3/);
    expect(groundRationale(S1_GOOD.replace("Call (703) 902-5000", "Call (703) 555-0147"), S1).join()).toMatch(/call-back number/);
    expect(groundRationale(S1_GOOD, { ...S1, sweep: { k: 0, amount_display: "$0.00" } }).join()).toMatch(/sweep found nothing/);
    expect(groundRationale(S1_GOOD.replace("do not use (703) 555-0147", "do not use (703) 902-5000"), S1).join()).toMatch(/also called do-not-use/);
    expect(groundRationale(S1_GOOD.replace("No independent call-back is on record.", "All red reasons above apply."), S1).join()).toMatch(/internal labels/);
  });
  it("rejects field names, reason-code ids and machine timestamps", () => {
    expect(groundRationale(`${S1_GOOD} The remit_owner link stays open.`, S1).join()).toMatch(/field name/);
    expect(groundRationale(`${S1_GOOD} See R3.`, S1).join()).toMatch(/reason-code id/);
    expect(groundRationale(S1_GOOD.replace("fetched 2026-10-27", "fetched 2026-10-27T14:02:39.700Z"), S1).join()).toMatch(/machine timestamp/);
  });
  it("a reason without anchors is carried by its content words", () => {
    expect(reasonCarried("No call-back to an independent number is on record for this request.", "No independent call-back is on record.")).toBe(true);
    expect(reasonCarried("No call-back to an independent number is on record for this request.", "Please review.")).toBe(false);
  });
  it("two candidates: both call-back numbers must be named, and neither may be called do-not-use", () => {
    const S2 = { ...S1, vendor_name: "Science Applications International Corp or Leidos, Inc.", codes: [{ class: "red", detail: "Cannot determine which vendor this request is for. Do not guess." }], callback: null, do_not_use: [],
      callback_per_candidate: [{ number_display: "(703) 676-4300" }, { number_display: "(571) 526-6000" }] };
    const good = "HOLD for Science Applications International Corp or Leidos, Inc. in PR-2026-10-30. We cannot determine which vendor this request is for, so do not guess. Call Science Applications International Corp on (703) 676-4300 and Leidos, Inc. on (571) 526-6000. 2 other items totalling $150,675.50 in PR-2026-10-30 also fail payment controls.";
    expect(groundRationale(good, S2)).toEqual([]);
    expect(groundRationale(good.replace("and Leidos, Inc. on (571) 526-6000", "and do not use (571) 526-6000"), S2).join()).toMatch(/also called do-not-use|call-back sentence missing/);
  });
  it("a null sweep means no sentence about other items", () => {
    expect(groundRationale(S1_GOOD, { ...S1, sweep: null }).join()).toMatch(/sweep found nothing/);
  });
});

describe("cleanRationale sentence starts", () => {
  it("capitalises a new sentence but not the word after a company abbreviation", async () => {
    const { cleanRationale } = await import("../../../app/policy/number-check");
    expect(cleanRationale("APPROVE for L3Harris Technologies, Inc. in PR-2026-10-30. every checked fact agrees.")).toBe(
      "APPROVE for L3Harris Technologies, Inc. in PR-2026-10-30. Every checked fact agrees.",
    );
    expect(cleanRationale("Call (703) 902-5000.; do not use (703) 555-0147.")).toBe("Call (703) 902-5000. Do not use (703) 555-0147.");
  });
});
