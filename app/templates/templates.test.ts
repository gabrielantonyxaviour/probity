import { describe, expect, it } from "vitest";
import { assertAdmin, assertQuery } from "../adapters/zetaris/guard.ts";
import { adminPatterns } from "../adapters/zetaris/admin-patterns.ts";
import { SAMPLE_TEMPLATE_IDS, TEMPLATE_IDS } from "../schemas/templates.ts";
import { templates } from "./index.ts";

const S1: Record<string, unknown> = {
  T01: { vendor_id: "V-10027" },
  T02: { vendor_id: "V-10027" },
  T03: { invoice_nos: ["INV-BAH-20931"] },
  T04: { domain: "boozallen-payments.example" },
  T04b: { token: "BOOZ" },
  T05: { vendor_id: "V-10027" },
  T05b: { parent_uei: "MBPHTU7Y9S65" },
  T06a: { name_norm: "BOOZ ALLEN" },
  T06b: { name_norm: "BOOZ ALLEN" },
  T06c: { name_norm: "BOOZ ALLEN" },
  T07: { account_hash: "175dbd7da76270843def1d6ba77e9bf08cc9f0bcac9a452456da437e4893abe6" },
  T08: { request_id: "BCR-2026-0412", vendor_id: "V-10027" },
  T08b: { request_id: "BCR-2026-0412" },
  T09: { vendor_id: "V-10027", payment_run_id: "PR-2026-10-30" },
  T10: { parent_uei: "MBPHTU7Y9S65", state: "NJ" },
  T11: { parent_uei: "MBPHTU7Y9S65", addr_key: "1 COMMVAULT WAY|TINTON FALLS|NJ" },
  T12: { uei: "KHK6E1JW9C15", level: "C", via: "direct" },
  T13: { parent_uei: "MBPHTU7Y9S65", via: "direct" },
  T16: { name_norm: "BOOZ ALLEN" },
  T20: { rule: "DQ1" },
  T21: { rule: "DQ1", payment_run_id: "PR-2026-10-30" },
  T22: { table: "payment_run_item" },
};

describe("templates", () => {
  it("sample() exists on exactly the cut-down set", () => {
    const withSample = TEMPLATE_IDS.filter((id) => typeof templates[id].sample === "function");
    expect(withSample).toEqual([...SAMPLE_TEMPLATE_IDS]);
  });

  it("S1 SQL passes the guard", () => {
    for (const [id, params] of Object.entries(S1)) {
      const template = templates[id as keyof typeof templates];
      const sql = template.sql(params as never);
      if (template.key === "query") assertQuery(sql);
      else assertAdmin(sql, adminPatterns());
    }
  });

  it("T15 is not a Zetaris statement", () => {
    expect(templates.T15.key).toBe("none");
    expect(() => templates.T15.sql({ name: "Booz Allen" } as never)).toThrow(/discovery/);
  });
});
