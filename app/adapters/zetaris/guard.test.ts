import { describe, expect, it } from "vitest";
import { WRITE_TOKENS, assertAdmin, assertQuery, maskSecrets } from "./guard";
import { ZetarisError } from "./errors";

function rejected(sql: string): string {
  try {
    assertQuery(sql);
  } catch (err) {
    return err instanceof ZetarisError ? err.message : "other";
  }
  return "allowed";
}

describe("query guard", () => {
  it("allows a limited select", () => {
    expect(() => assertQuery("SELECT 1 AS one LIMIT 1")).not.toThrow();
  });

  it("rejects a semicolon outside quotes", () => {
    expect(rejected("SELECT 1 AS one; SELECT 2 AS two LIMIT 1")).toContain("semicolon");
    expect(() => assertQuery("SELECT 'a;b' AS one LIMIT 1")).not.toThrow();
    expect(() => assertQuery(`SELECT '[.,''"()]' AS c FROM t LIMIT 1`)).not.toThrow();
  });

  it("rejects line comments", () => {
    expect(rejected("SELECT 1 AS one LIMIT 1 -- note")).toContain("line_comment");
  });

  it("rejects block comments", () => {
    expect(rejected("SELECT 1 /* hidden */ AS one LIMIT 1")).toContain("block_comment");
  });

  it("rejects each write token outside literals", () => {
    for (const token of WRITE_TOKENS) {
      expect(rejected(`SELECT 1 AS one FROM t ${token} x LIMIT 1`)).toContain("write_token");
    }
    expect(() => assertQuery("SELECT 'INSERT' AS word LIMIT 1")).not.toThrow();
  });

  it("rejects a missing limit", () => {
    expect(rejected("SELECT 1 AS one")).toContain("limit_required");
  });

  it("rejects a limit above 500", () => {
    expect(rejected("SELECT 1 AS one LIMIT 501")).toContain("limit_range");
  });

  it("rejects statements over 8000 characters", () => {
    expect(rejected(`SELECT '${"a".repeat(8001)}' AS one LIMIT 1`)).toContain("too_long");
  });

  it("rejects a statement class outside the allow list", () => {
    expect(rejected("SHOW TABLES IN session")).toContain("statement_class");
  });
});

describe("admin guard", () => {
  it("allows one COMPILE USL payload and rejects arbitrary admin SQL", () => {
    expect(() => assertAdmin("COMPILE USL IF NOT EXISTS vendor360 DEPLOY NAMESPACE lightning.metastore.probity DDL\nCREATE TABLE t (id varchar(8))", [], [])).not.toThrow();
    expect(() => assertAdmin("SELECT 1 AS one LIMIT 1", [], [])).toThrow(ZetarisError);
  });

  it("allows a statement that matches a generated file", () => {
    const sql = "CREATE LIGHTNING DATABASE sec_edgar DESCRIBE BY \"SEC EDGAR submissions API - real public data\"";
    expect(() => assertAdmin(sql, [], [sql])).not.toThrow();
  });
});

describe("masking", () => {
  it("redacts password, user-agent and bearer values", () => {
    const masked = maskSecrets('HEADER ( user-agent "Probity team@example.com" password "s3cret" ) ' + "Bearer " + "abcdefghijklmnop");
    expect(masked).not.toContain("team@example.com");
    expect(masked).not.toContain("s3cret");
    expect(masked).not.toContain("abcdefghijklmnop");
    expect(masked).toContain("[REDACTED]");
  });
});
