import { describe, expect, it } from "vitest";
import { lineageOf, matchedRows, systemOf, tablesIn, type QueryDetailUI } from "./lineage";

const base = { query_id: "q", template_id: "T05", template_name: "T05", key: "query", params: {}, sql_hash: "s", row_count: 0, rows: [], row_hash: "r", mode: "live", fetched_at: "2026-10-27T14:01:54.014Z", latency_ms: 1, source_label: "live" } as const;

describe("lineage", () => {
  it("reads every table of a federated join and maps it to its source system", () => {
    const sql = "SELECT v.vendor_id FROM lightning.metastore.probity.vendor360.vendor v JOIN lightning.metastore.probity.vendor360.registry_entity e ON e.uei = v.uei JOIN lightning.metastore.probity.vendor360.sec_registrant s ON s.cik = v.registrant_cik";
    expect(tablesIn(sql)).toHaveLength(3);
    const l = lineageOf({ ...base, sql } as QueryDetailUI);
    expect(l.map((x) => x.source_system)).toEqual(["erp_postgres", "usaspending", "sec_edgar"]);
  });
  it("maps runtime session tables to USAspending and prefers the API field", () => {
    expect(systemOf("session.pp_usa_r_khk6e1jw9c15")).toBe("usaspending");
    expect(systemOf("lightning.metastore.probity.vendor360.payment_run_item")).toBe("erp_postgres");
    expect(systemOf("something.else")).toBeNull();
    const api = { ...base, sql: "SELECT 1 FROM a.b", lineage: { sources: [{ usl_table: "x.y", source_system: "sec_edgar", source_object: "sec_s_1" }] } } as QueryDetailUI;
    expect(lineageOf(api)[0]!.source_system).toBe("sec_edgar");
  });
  it("marks the rows that carry the observation's row key", () => {
    const rows = [{ key: "JCBMLGPE6Z71-C" }, { key: "KHK6E1JW9C15-C" }, { uei: "KHK6E1JW9C15" }];
    expect(matchedRows(rows, "KHK6E1JW9C15")).toEqual([1, 2]);
    expect(matchedRows(rows, "")).toEqual([]);
  });
});
