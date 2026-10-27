import { describe, expect, it } from "vitest";
import { checkRationale, cleanRationale, extractTokens } from "../../../app/policy/number-check";
import { findingsFor, parseDqCounts, summariseSweep, sweepHeader } from "../../../app/policy/sweep";
import { attribute } from "../../../app/policy/identity";
import { buildExposure, runsToTry } from "../../../app/policy/exposure";
import { DQ1_INVALID, DQ2_INVALID, RUN_ITEMS } from "../_support/data";
import { cand } from "../_support/state";
import type { QueryRecord } from "../../../app/schemas/run-state";

const INPUT = {
  decision: "HOLD", vendor_name: "Booz Allen Hamilton Inc", vendor_id: "V-10027", request_id: "BCR-2026-0412", payment_run_id: "PR-2026-10-30",
  exposure: { vendor_item_count: 3, vendor_amount_display: "$1,284,550.00" },
  codes: [{ code: "R3", slug: "x", class: "red", detail: "The claimed remit address belongs to BOOZ ALLEN HAMILTON INC (UEI KHK6E1JW9C15), a different entity." }],
  callback: { number_display: "(703) 902-5000", number_source_label: "SEC EDGAR submissions, CIK 0001443646, fetched 2026-10-27T12:00:00Z" },
  do_not_use: ["(703) 555-0147"], sweep: { k: 2, amount_display: "$139,700.00" }, limitations: [],
};
const GOOD = "HOLD for Booz Allen Hamilton Inc in PR-2026-10-30. The new address belongs to a different Booz Allen company, UEI KHK6E1JW9C15. Three payments totalling $1,284,550.00 need review. Call (703) 902-5000 from SEC records, and do not use (703) 555-0147. 2 other items totalling $139,700.00 also fail controls.";

describe("rationale number check (04 §7.10)", () => {
  it("passes a faithful rationale and counts the tokens it checked", () => {
    const r = checkRationale(GOOD, INPUT);
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.checked).toBeGreaterThan(5);
  });
  it.each([
    ["a changed amount", GOOD.replace("$1,284,550.00", "$1,284,500.00"), /unknown token/],
    ["an invented phone", GOOD.replace("(703) 902-5000", "(703) 902-5001"), /unknown token/],
    ["an invented id", GOOD.replace("PR-2026-10-30", "PR-2026-10-31"), /unknown token/],
    ["a missing decision word", GOOD.replace("HOLD", "Hold"), /decision word HOLD missing/],
    ["another decision word", `${GOOD} It is not APPROVE.`, /other decision word APPROVE/],
    ["forbidden wording", GOOD.replace("different Booz Allen company", "fraudulent Booz Allen company"), /forbidden word/],
    ["too few sentences", "HOLD for Booz Allen Hamilton Inc. Call (703) 902-5000.", /sentence count/],
    ["a do_not_use number without a negation", GOOD.replace("and do not use (703) 555-0147", "and also try (703) 555-0147"), /do_not_use/],
  ])("rejects %s", (_n, text, re) => {
    const r = checkRationale(text, INPUT);
    expect(r.ok).toBe(false);
    expect(r.failures.join("|")).toMatch(re);
  });
  it("a company name that ends in 'Inc.' may also end a sentence: the count is read both ways", () => {
    const input = { ...INPUT, vendor_name: "L3Harris Technologies, Inc." };
    const t = "HOLD for L3Harris Technologies, Inc. in PR-2026-10-30. The new address belongs to a different company. Three payments totalling $1,284,550.00 need review. Call (703) 902-5000 and do not use (703) 555-0147.";
    expect(checkRationale(t, input).failures).toEqual([]);
    expect(checkRationale("HOLD for L3Harris Technologies, Inc. Call (703) 902-5000.", input).failures.join()).toMatch(/sentence count/);
  });
  it("joined sentences (\".; \") are put back before counting", () => {
    expect(cleanRationale("One thing.; Two thing. Three.Four")).toBe("One thing. Two thing. Three. Four");
  });
  it("normalises money to cents and phones to E.164 when extracting", () => {
    const t = extractTokens("Pay $87,400.00 or call (703) 902-5000 about UEI JCBMLGPE6Z71 and CIK 0001443646 on 2026-10-22.");
    expect(t.money).toEqual(["8740000"]);
    expect(t.phone).toEqual(["+17039025000"]);
    expect(t.uei).toEqual(["JCBMLGPE6Z71"]);
    expect(t.cik).toEqual(["0001443646"]);
    expect(t.date).toEqual(["2026-10-22"]);
  });
});

describe("sweep (04 §9)", () => {
  it("reads RUN DQ counts by column name or by order and refuses an inconsistent total", () => {
    expect(parseDqCounts([{ total: 158, valid: 154, invalid: 4 }])).toEqual({ total: 158, valid: 154, invalid: 4 });
    expect(parseDqCounts([{ a: 10, b: 7, c: 3 }])).toEqual({ total: 10, valid: 7, invalid: 3 });
    expect(parseDqCounts([{ total: 10, valid: 7, invalid: 4 }])).toBeNull();
  });
  it("filters to the run, excludes the vendor under review and writes the exact copy", () => {
    const dq2 = findingsFor({ rule: "DQ2", rows: DQ2_INVALID, payment_run_id: "PR-2026-10-30", exclude_vendors: ["V-10027"], received_at: "2026-10-22T15:12:00Z", query_id: "q2" });
    expect(dq2).toHaveLength(1);
    expect(dq2[0]).toMatchObject({ item_id: "PRI-1030-0009", rule: "DQ2", recommendation: "hold_item", detail: "The account in this request is already on Quillan Ridge Fleet Services LLC (fictional) (V-10812), created 4 days before the request, scheduled for $87,400.00." });
    const dq1 = findingsFor({ rule: "DQ1", rows: DQ1_INVALID, payment_run_id: "PR-2026-10-30", exclude_vendors: [], received_at: "2026-10-22T15:12:00Z", query_id: "q1" });
    expect(dq1.map((f) => f.vendor_id)).toEqual(["V-10812", "V-10763"]);
    expect(dq1[1]!.detail).toBe("Bank details changed 14 days before payment with no call-back on an independent number.");
    const excl = findingsFor({ rule: "DQ1", rows: DQ1_INVALID, payment_run_id: "PR-2026-10-30", exclude_vendors: ["V-10812"], received_at: "2026-10-22T15:12:00Z", query_id: "q1" });
    expect(excl.map((f) => f.vendor_id)).toEqual(["V-10763"]);
  });
  it("counts distinct item ids once, sorts by amount and writes the header", () => {
    const f = [...findingsFor({ rule: "DQ1", rows: DQ1_INVALID, payment_run_id: "PR-2026-10-30", exclude_vendors: [], received_at: "2026-10-22T00:00:00Z", query_id: "a" }), ...findingsFor({ rule: "DQ2", rows: DQ2_INVALID, payment_run_id: "PR-2026-10-30", exclude_vendors: [], received_at: "2026-10-22T00:00:00Z", query_id: "b" })];
    const { k, amount_usd, sorted } = summariseSweep(f);
    expect(k).toBe(2);
    expect(amount_usd).toBe(139700);
    expect(sorted[0]!.amount_usd).toBeGreaterThanOrEqual(sorted.at(-1)!.amount_usd);
    expect(sweepHeader(k, "PR-2026-10-30", amount_usd)).toBe("Not asked, but checked: 2 other item(s) in PR-2026-10-30 ($139,700.00) fail payment controls.");
  });
});

const q = (template_id: string, params: Record<string, unknown>, rows: Array<Record<string, unknown>>): QueryRecord => ({ query_id: `q-${template_id}-${Math.random()}`, template_id: template_id as never, params, sql: "", sql_hash: "", issued_by: "evidence_runner", purpose_field: null, candidate_vendor_id: null, round: 0, status: "ok", mode: "live", rows, row_hash: "", row_count: rows.length, latency_ms: 1, fetched_at: "", retry_count: 0, error_code: null, evidence_ids: [] });

describe("request attribution (04 §7.2)", () => {
  it("S1: invoice refs + exact name, domain not on file -> V-10027 soft 0.70", () => {
    const c = attribute({
      claimed_names: ["Booz Allen Hamilton Inc."],
      t03: [q("T03", {}, [{ invoice_no: "INV-BAH-20931", vendor_id: "V-10027" }])], t04: [q("T04", {}, [])],
      t04b: [q("T04b", {}, [{ vendor_id: "V-10027", legal_name: "Booz Allen Hamilton Inc", name_norm: "BOOZ ALLEN HAMILTON INC", uei: "JCBMLGPE6Z71", registrant_cik: "0001443646" }])], alias: [],
    });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ vendor_id: "V-10027", hardness: "soft", score: 0.7, uei: "JCBMLGPE6Z71" });
  });
  it("S2: the domain says SAIC and the invoices say Leidos -> two candidates", () => {
    const c = attribute({
      claimed_names: ["Science Applications International Corporation"],
      t03: [q("T03", {}, [{ invoice_no: "INV-LDS-88412", vendor_id: "V-10442" }])],
      t04: [q("T04", {}, [{ vendor_id: "V-10587", legal_name: "Science Applications International Corp", email_domains_on_file: "saic.example" }])],
      t04b: [q("T04b", {}, [{ vendor_id: "V-10587", legal_name: "Science Applications International Corp", name_norm: "SCIENCE APPLICATIONS INTERNATIONAL CORP", uei: "MMLKPW9JLX64", registrant_cik: "0001571123" }, { vendor_id: "V-10442", legal_name: "Leidos, Inc.", name_norm: "LEIDOS INC", uei: "UE9QJD4KK1L6", registrant_cik: "0001336920" }])],
      alias: [q("T06a", {}, [{ via: "alias", key: "UE9QJD4KK1L6-C", name: "SCIENCE APPLICATIONS INTERNATIONAL CORPORATION", name_norm: "SCIENCE APPLICATIONS INTERNATIONAL CORP" }])],
    });
    expect(c.map((x) => x.vendor_id).sort()).toEqual(["V-10442", "V-10587"]);
    expect(c.find((x) => x.vendor_id === "V-10587")!.hardness).toBe("hard");
    expect(c.find((x) => x.vendor_id === "V-10442")!.hardness).toBe("soft");
  });
  it("drops fuzzy-only candidates next to a hard one and keeps scores above 0.15", () => {
    const c = attribute({
      claimed_names: ["Leidos Inc"], t03: [], t04: [q("T04", {}, [{ vendor_id: "V-10442", legal_name: "Leidos, Inc.", email_domains_on_file: "leidos.example" }])],
      t04b: [q("T04b", {}, [{ vendor_id: "V-10442", legal_name: "Leidos, Inc.", name_norm: "LEIDOS INC", uei: null, registrant_cik: null }, { vendor_id: "V-07734", legal_name: "LEIDOS INCO", name_norm: "LEIDOS INCO" }])], alias: [],
    });
    expect(c.map((x) => x.vendor_id)).toEqual(["V-10442"]);
  });
});

describe("exposure and payment-run selection", () => {
  it("sums the candidate's items in cents and keeps SQL-computed run totals", () => {
    const e = buildExposure({ payment_run_id: "PR-2026-10-30", scheduled_date: "2026-10-30", cutoff_local: "14:00 ET", candidates: [cand({ vendor_id: "V-10027", legal_name: "Booz Allen Hamilton Inc" })], rows: RUN_ITEMS });
    expect(e).toMatchObject({ scope: "vendor", vendor_item_count: 3, vendor_amount_usd: 1284550, run_item_count: 14, run_amount_usd: 3104920 });
    expect(e.by_vendor).toEqual([{ vendor_id: "V-10027", vendor_name: "Booz Allen Hamilton Inc", item_count: 3, amount_usd: 1284550 }]);
    expect(buildExposure({ payment_run_id: "PR-2026-10-30", scheduled_date: "", cutoff_local: "", candidates: [], rows: [] }).scope).toBe("none");
  });
  it("tries scheduled or draft runs on or after the request date, earliest first", () => {
    const runs = [
      { payment_run_id: "PR-2026-11-03", scheduled_date: "2026-11-03", cutoff_local: "14:00 ET", status: "scheduled" },
      { payment_run_id: "PR-2026-10-30", scheduled_date: "2026-10-30", cutoff_local: "14:00 ET", status: "scheduled" },
      { payment_run_id: "PR-2026-10-16", scheduled_date: "2026-10-16", cutoff_local: "14:00 ET", status: "released" },
    ];
    expect(runsToTry(runs, "2026-10-22T15:12:00Z").map((r) => r.payment_run_id)).toEqual(["PR-2026-10-30", "PR-2026-11-03"]);
  });
});
