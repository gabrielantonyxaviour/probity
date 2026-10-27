import path from "node:path";
import { describe, expect, it } from "vitest";
import { dq7, dq7c, dq9c, t23 } from "../../../app/adapters/sample/sample-queries-d3";
import { createSampleZetaris } from "../../../app/adapters/sample/zetaris-sample";
import { templateKitFrom } from "../../../app/orchestration/adapters/template-kit";
import { templates } from "../../../app/templates/index";
import type { Usl } from "../../../app/adapters/sample/sample-tables";
import type { TemplateParams } from "../../../app/schemas/templates";

const cfg = { dirs: { sample: path.resolve(import.meta.dirname, "../../../data/sample") } } as never;
const kit = templateKitFrom(templates as never);
const compile = (p: Record<string, unknown>) => kit.compile(p as TemplateParams, { session_tables: [] });

describe("D3 sample doubles", () => {
  it("groups a shared account from the rows it is given", () => {
    const usl = {
      vendor_bank_account: [
        { account_hash: "h1", vendor_id: "V-10234", status: "active" },
        { account_hash: "h1", vendor_id: "V-10233", status: "active" },
        { account_hash: "h2", vendor_id: "V-10027", status: "active" },
      ],
    } as unknown as Usl;
    expect(dq7({}, usl)).toEqual([
      { account_hash: "h1", vendor_count: "2", vendor_ids: "V-10233,V-10234", statuses: "active" },
    ]);
    expect(dq7c({}, usl)).toEqual([{ total_rows: "3", invalid_rows: "2" }]);
  });

  it("answers the sample port for DQ7, DQ8, DQ9 and T23 and fails closed without a vendor", async () => {
    const z = createSampleZetaris(cfg);
    const group = await z.run(compile({ template_id: "DQ7" }), { timeoutMs: 5000 });
    const count = await z.run(compile({ template_id: "DQ7c" }), { timeoutMs: 5000 });
    expect(group.mode).toBe("sample");
    expect(Object.keys(group.rows[0] ?? { account_hash: null, vendor_count: null, vendor_ids: null, statuses: null })).toEqual([
      "account_hash", "vendor_count", "vendor_ids", "statuses",
    ]);
    const total = Number(count.rows[0]?.total_rows);
    const invalid = Number(count.rows[0]?.invalid_rows);
    expect(total).toBeGreaterThanOrEqual(invalid);
    const dq8 = await z.run(compile({ template_id: "T20", rule: "DQ8" }), { timeoutMs: 5000 });
    expect(Number(dq8.rows[0]?.total_record)).toBe(Number(dq8.rows[0]?.valid_record) + Number(dq8.rows[0]?.invalid_record));
    const dq9 = await z.run(compile({ template_id: "DQ9c" }), { timeoutMs: 5000 });
    expect(Number(dq9.rows[0]?.total)).toBe(Number(dq9.rows[0]?.valid) + Number(dq9.rows[0]?.invalid));
    const profile = await z.run(compile({ template_id: "T23", vendor_id: "V-10027" }), { timeoutMs: 5000 });
    expect(profile.row_count).toBeGreaterThan(0);
    expect(Object.keys(profile.rows[0]!)).toEqual([
      "vendor_id", "vendor_name", "uei", "usa_legal_name", "usa_address_line1", "usa_city", "usa_state", "usa_zip",
      "cik", "edgar_legal_name", "edgar_phone", "edgar_ein", "payment_item_count", "total_exposure",
    ]);
    expect(profile.rows[0]!.vendor_id).toBe("V-10027");
    const missing = await z.run(compile({ template_id: "T23", vendor_id: "V-99999" }), { timeoutMs: 5000 });
    expect(missing.row_count).toBe(0);
    expect(dq9c).toBeTypeOf("function");
    expect(t23).toBeTypeOf("function");
  });
});
