import { describe, expect, it } from "vitest";
import { statementTimeoutMs } from "./client.ts";
import { DQ7_SQL, DQ9C_SQL, t23Sql } from "../../templates/d3.ts";
import { selectFallback } from "../../templates/dq.ts";

const cfg = { ddlTimeoutMs: 120_000, sqlTimeoutMs: 45_000 };

describe("statement timeout", () => {
  it("keeps an ordinary select on the SQL cap", () => {
    expect(statementTimeoutMs("SELECT 1 AS one LIMIT 1", "sql", cfg)).toBe(45_000);
  });

  it("gives RUN DQ, DQ7, DQ8 and DQ9 the DDL ceiling", () => {
    expect(statementTimeoutMs("RUN DQ bank_change_before_large_payment TABLE t", "sql", cfg)).toBe(120_000);
    expect(statementTimeoutMs(DQ7_SQL, "sql", cfg)).toBe(120_000);
    expect(statementTimeoutMs(selectFallback("T20", "DQ8"), "sql", cfg)).toBe(120_000);
    expect(statementTimeoutMs(DQ9C_SQL, "sql", cfg)).toBe(120_000);
  });

  it("gives the federated profile at least 300s even when kind is sql", () => {
    expect(statementTimeoutMs(t23Sql("V-10027"), "sql", cfg)).toBe(300_000);
    expect(statementTimeoutMs(t23Sql("V-10027"), "ddl", { ddlTimeoutMs: 400_000, sqlTimeoutMs: 45_000 })).toBe(400_000);
  });
});
