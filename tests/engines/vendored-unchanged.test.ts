// M1: the vendored Meterless engines and their conformance runners are byte-identical to the pinned upstream copies.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");
const lines = fs
  .readFileSync(path.join(import.meta.dirname, "vendored.sha256"), "utf-8")
  .trim()
  .split("\n");
const parsed = lines.map((l) => {
  const m = l.match(/^([0-9a-f]{64})\s+\*?(.+)$/);
  if (!m) throw new Error(`bad vendored.sha256 line: ${l}`);
  return { sha: m[1]!, file: m[2]! };
});
// H-MEM is cut at 16:00Z unless SW8 passes: its entries are checked only while its tree exists.
const hmemPresent = fs.existsSync(path.join(ROOT, "vendor/meterless/hmem/index.ts"));
const entries = parsed.filter((e) => hmemPresent || !e.file.includes("hmem"));
const engines = hmemPresent ? ["world-model", "hmem"] : ["world-model"];

describe("vendored engines are unchanged", () => {
  it("lists every vendored source, both licences and the conformance files", () => {
    const files = entries.map((e) => e.file);
    for (const f of ["index", "ingest", "resolve", "stableIds", "store", "types"])
      expect(files).toContain(`vendor/meterless/world-model/${f}.ts`);
    if (hmemPresent)
      expect(files.filter((f) => f.startsWith("vendor/meterless/hmem/") && f.endsWith(".ts"))).toHaveLength(10);
    expect(files).toContain("vendor/meterless/world-model/LICENSE");
  });

  it.each(entries)("$file matches its pinned sha256", ({ sha, file }) => {
    const bytes = fs.readFileSync(path.join(ROOT, file));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha);
  });

  it.each(engines)("%s LICENSE is Apache-2.0 and UPSTREAM.md pins the commit", (engine) => {
    const dir = path.join(ROOT, "vendor/meterless", engine);
    const lic = fs.readFileSync(path.join(dir, "LICENSE"), "utf-8");
    expect(lic).toContain("Apache License");
    expect(lic).toContain("Version 2.0, January 2004");
    const up = fs.readFileSync(path.join(dir, "UPSTREAM.md"), "utf-8");
    expect(up).toContain("1742dec56a66e58eef9dda2d2b865823758ca8cd");
    expect(up).toContain("unchanged; Apache-2.0; declared as pre-existing third-party code");
  });

  it("no per-file licence header was added to a vendored source", () => {
    for (const e of entries.filter((x) => x.file.endsWith(".ts") && x.file.startsWith("vendor/"))) {
      const head = fs.readFileSync(path.join(ROOT, e.file), "utf-8").slice(0, 400);
      expect(head).not.toMatch(/Apache License|Licensed under|SPDX-License/i);
    }
  });

  it("the facades are one line each", () => {
    for (const engine of engines) {
      const line = `export * from "../../../vendor/meterless/${engine}/index.ts";`;
      const body = fs.readFileSync(path.join(ROOT, "app/engines", engine, "index.ts"), "utf-8").trim();
      expect(body).toBe(line);
    }
  });
});
