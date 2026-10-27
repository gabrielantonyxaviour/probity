import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError, ERROR_TEXT } from "../../../app/schemas/errors";
import { classify, firstIssue } from "../../../app/api/error-handler";
import { RunInput } from "../../../app/schemas/api";
import { makeHarness, post, type Harness } from "../../helpers/api-harness";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

let h: Harness;
afterEach(async () => {
  await h?.close();
});
const typed = { input: { vendor: { legal_name: "Parsons Corporation" } }, options: {} };

describe("API errors are {error, code?} only", () => {
  it("a Zetaris failure whose body is a Spark exception yields the fixed envelope text", async () => {
    h = await makeHarness({
      script: () => {
        throw new AppError("zetaris_sql_error", "org.apache.spark.sql.AnalysisException: [TABLE_OR_VIEW_NOT_FOUND] The table USASPENDING.recipient cannot be found. at org.apache.spark.sql.catalyst.analysis.package$AnalysisErrorAt.failAnalysis");
      },
    });
    const r = await post(h, "/run", typed);
    const body = JSON.parse(r.body) as Record<string, unknown>;
    expect(body.error).toBe(ERROR_TEXT.internal_error);
    expect(body.code).toBe("internal_error");
    expect(r.body).not.toMatch(/Spark|catalyst|TABLE_OR_VIEW/);
  });
  it("adapter AppErrors on a plain route are mapped to fixed text and never carry the upstream message", async () => {
    h = await makeHarness({
      ports: { zetaris: { kind: "sample", ping: async () => ({ ok: true, latency_ms: 1 }), run: async () => { throw new AppError("zetaris_sql_error", "Spark: java.lang.NullPointerException at x.y.Z(Z.java:12) password=hunter2"); } } as never },
    });
    await post(h, "/run", { ...typed, run_id: "r-errtest-0001" });
    const { writeFileSync } = await import("node:fs");
    const path = await import("node:path");
    writeFileSync(path.join(h.dirs.logs, "queries-r-errtest-0001.jsonl"), `${JSON.stringify({ query_id: "11111111-2222-3333-4444-555555555555", template_id: "T05", sql: "SELECT 1", row_hash: "abcd", row_count: 1 })}\n`);
    const r = await post(h, "/zetaris/rerun", { run_id: "r-errtest-0001", query_id: "11111111-2222-3333-4444-555555555555" });
    expect(r.statusCode).toBe(502);
    expect(JSON.parse(r.body)).toEqual({ error: "Data layer query failed", code: "zetaris_sql_error" });
  });
  it("unknown routes, bad methods and malformed ids give {error, code}", async () => {
    h = await makeHarness();
    const nf = await h.app.inject({ method: "GET", url: "/nope" });
    expect(nf.statusCode).toBe(404);
    expect(JSON.parse(nf.body)).toEqual({ error: "Not found.", code: "not_found" });
    const bad = await h.app.inject({ method: "GET", url: "/runs/%2e%2e%2f" });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
    expect(Object.keys(JSON.parse(bad.body)).sort()).toEqual(["code", "error"]);
  });
  it("classify: zod errors name the first field; unknown errors are generic", () => {
    const r = RunInput.safeParse({ vendor: { uei: "x" } });
    if (r.success) throw new Error("unreachable");
    expect(firstIssue(r.error)).toMatch(/^vendor\.uei: /);
    expect(classify(new Error("db password=secret at /app/x.ts:1"))).toEqual({ status: 500, error: "Internal error.", code: "internal_error" });
    expect(classify(new AppError("busy", "Two runs are in progress; retry in 30 s.", { httpStatus: 429 })).status).toBe(429);
  });
});
