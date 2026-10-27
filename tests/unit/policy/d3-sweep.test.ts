import { describe, expect, it } from "vitest";
import { findingsFor, findingsForPayee, findingsForSharedAccount, parseDqCounts, parseSharedCounts } from "../../../app/policy/sweep";

describe("D3 sweep policy", () => {
  it("derives DQ7 valid by subtraction and rejects a broken identity", () => {
    expect(parseSharedCounts([{ total_rows: 52, invalid_rows: 2 }])).toEqual({ total: 52, valid: 50, invalid: 2 });
    expect(parseSharedCounts([{ total_rows: 2, invalid_rows: 3 }])).toBeNull();
  });

  it("reads a DQ8 fallback that returns total and valid only", () => {
    expect(parseDqCounts([{ total: 4, valid: 3 }])).toEqual({ total: 4, valid: 3, invalid: 1 });
    expect(parseDqCounts([{ total: 10, valid: 7, invalid: 4 }])).toBeNull();
  });

  it("attaches a shared account to this run's items and keeps the reviewer sentence", () => {
    const findings = findingsForSharedAccount({
      groups: [{ account_hash: "abc", vendor_ids: "V-10234,V-10233", vendor_count: 2 }],
      items: [
        { item_id: "PRI-1030-0077", vendor_id: "V-10233", vendor_name: "Northwind Supply", amount_usd: 1200 },
        { item_id: "PRI-1030-0001", vendor_id: "V-10027", vendor_name: "Booz Allen Hamilton Inc", amount_usd: 50 },
      ],
      exclude_vendors: ["V-10027"],
      query_id: "q-group",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      item_id: "PRI-1030-0077",
      rule: "DQ7",
      recommendation: "hold_item",
      query_id: "q-group",
    });
    expect(findings[0]!.detail).toContain("This account hash is on file for more than one vendor.");
    expect(findings[0]!.detail).toContain("account_hash abc");
    expect(findings[0]!.detail).toContain("V-10234,V-10233");
  });

  it("uses the DQ8 sentence and the payee sentence on rows that belong to the run", () => {
    const dq8 = findingsFor({
      rule: "DQ8",
      rows: [{ item_id: "PRI-1", payment_run_id: "PR-2026-10-30", vendor_id: "V-10812", vendor_name: "Quillan Ridge Fleet Services LLC", amount_usd: 150000 }],
      payment_run_id: "PR-2026-10-30",
      exclude_vendors: ["V-10027"],
      received_at: "2026-10-22T15:12:00Z",
      query_id: "q8",
    });
    expect(dq8[0]!.detail).toBe("This payment is above 100000 and is scheduled within 14 days after a bank change, with no verified callback on the item.");
    expect(dq8[0]!.recommendation).toBe("hold_item");
    const dq9 = findingsForPayee({
      rows: [{ item_id: "PRI-1", vendor_id: "V-10812", vendor_name: "Other", payee_norm: "OTHER" }],
      items: [{ item_id: "PRI-1", vendor_id: "V-10812", vendor_name: "Quillan Ridge Fleet Services LLC", amount_usd: 150000 }],
      exclude_vendors: [],
      query_id: "q9",
    });
    expect(dq9[0]!.detail).toBe("The payee name on this payment item does not match the vendor legal name after normalisation.");
    expect(dq9[0]!.amount_usd).toBe(150000);
  });
});
