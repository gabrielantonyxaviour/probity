import { describe, expect, it } from "vitest";
import { assertQuery } from "../adapters/zetaris/guard.ts";
import { TemplateParams } from "../schemas/templates.ts";
import { selectFallback, t20, t21 } from "./dq.ts";
import { DQ7_SQL, DQ7C_SQL, DQ9_SQL, DQ9C_SQL, T23_COLUMNS, T23_LINEAGE, t23, t23Sql, t23Trace } from "./d3.ts";

describe("D3 templates", () => {
  it("DQ7, DQ9 and T23 statements pass the query guard", () => {
    for (const sql of [DQ7_SQL, DQ7C_SQL, DQ9_SQL, DQ9C_SQL, t23Sql("V-10027")]) {
      expect(() => assertQuery(sql)).not.toThrow();
    }
    expect(() => assertQuery("LIST DQ")).not.toThrow();
  });

  it("rejects extra params and accepts the strict shapes", () => {
    expect(TemplateParams.safeParse({ template_id: "DQ7" }).success).toBe(true);
    expect(TemplateParams.safeParse({ template_id: "DQ7", vendor_id: "V-10027" }).success).toBe(false);
    expect(TemplateParams.safeParse({ template_id: "DQ9c" }).success).toBe(true);
    expect(TemplateParams.safeParse({ template_id: "T23", vendor_id: "V-10027" }).success).toBe(true);
    expect(TemplateParams.safeParse({ template_id: "T23", vendor_id: "nope" }).success).toBe(false);
    expect(TemplateParams.safeParse({ template_id: "T20", rule: "DQ8" }).success).toBe(true);
    expect(TemplateParams.safeParse({ template_id: "T20", rule: "DQ7" }).success).toBe(false);
  });

  it("T23 has the 14 columns and the lineage sentence names the three legs", () => {
    expect(t23.columns).toEqual([...T23_COLUMNS]);
    expect(t23.maxRows).toBe(10);
    expect(t23.observations).toEqual([]);
    expect(t23.sql({ vendor_id: "V-10027" })).toContain("payee_erp.vendor");
    expect(t23.sql({ vendor_id: "V-10027" })).toContain("sec_registrant");
    expect(T23_LINEAGE).toContain("One Zetaris query across ERP, USAspending and SEC EDGAR");
    expect(T23_LINEAGE).toContain("JDBC");
    expect(T23_LINEAGE).toContain("not direct REST");
    expect(T23_LINEAGE).toContain("Pushdown was not shown");
    expect(T23_LINEAGE.length).toBeLessThanOrEqual(300);
    const traced = t23Trace([{ vendor_id: "V-10027", usa_legal_name: null }]);
    expect(traced.length).toBeLessThanOrEqual(300);
    expect(traced).toContain("One Zetaris query");
  });

  it("DQ8 select fallback is the registered boolean", () => {
    expect(t20.sql({ rule: "DQ8" })).toBe(
      "RUN DQ bank_change_before_large_payment TABLE lightning.metastore.probity.vendor360.payment_run_item",
    );
    expect(t21.sql({ rule: "DQ8" })).toContain("SHOW DQ INVALID RECORD bank_change_before_large_payment");
    const count = selectFallback("T20", "DQ8");
    const rows = selectFallback("T21", "DQ8");
    expect(count).toContain("amount_usd <= 100000");
    expect(count).not.toContain("REGISTER");
    expect(rows).toContain("WHERE NOT COALESCE");
    expect(rows).toContain("LIMIT 500");
    expect(() => assertQuery(count)).not.toThrow();
    expect(() => assertQuery(rows)).not.toThrow();
  });
});
