import { describe, expect, it } from "vitest";
import { ZetarisError } from "./errors";
import { parseResult, rowHash } from "./response";

describe("response", () => {
  it("hashes the same rows to the same 16 hex chars", () => {
    const rows = [["1"]];
    const a = rowHash(["one"], rows);
    const b = rowHash(["one"], [["1"]]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("keeps values as received", () => {
    expect(rowHash(["n"], [["1"]])).not.toBe(rowHash(["n"], [[1]]));
  });

  it("maps an empty data array to no rows", () => {
    const parsed = parseResult({ headers: ["one"], data: [], total: 0 });
    expect(parsed.rows).toEqual([]);
    expect(parsed.columns).toEqual(["one"]);
  });

  it("throws zetaris_shape_mismatch when headers differ", () => {
    expect(() => parseResult({ headers: ["two"], data: [["1"]] }, ["one"])).toThrow(ZetarisError);
  });
});
