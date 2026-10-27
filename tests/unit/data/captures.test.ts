import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Covered, loadUniverse } from "../../../scripts/gen/capture/universe";
import { recipientId, searchKey } from "../../../scripts/gen/capture/registry-io";
import { PREDICATES } from "../../../scripts/gen/capture/xfacts";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SAMPLE = path.join(ROOT, "data/sample");
const caps = JSON.parse(readFileSync(path.join(SAMPLE, "captures.json"), "utf8")) as { captured_at: string; items: { source: string; file: string; sha256: string; http_status: number }[] };
const dirSize = (d: string): number => readdirSync(d).reduce((s, n) => { const p = path.join(d, n); return s + (statSync(p).isDirectory() ? dirSize(p) : statSync(p).size); }, 0);

describe("registry captures", () => {
  it("stay under 1 MB with the whole sample store", () => {
    expect(dirSize(SAMPLE)).toBeLessThan(1_000_000);
  });
  it("list every file with a matching sha256: 17 details, 8 children, 4 searches, 8 EDGAR, 1 tickers", () => {
    const by = (s: string): number => caps.items.filter((i) => i.source === s).length;
    expect([by("D1"), by("D2"), by("D3"), by("D4"), by("D5")]).toEqual([17, 8, 4, 8, 1]);
    for (const i of caps.items) {
      expect(i.http_status).toBe(200);
      expect(createHash("sha256").update(readFileSync(path.join(SAMPLE, i.file))).digest("hex")).toBe(i.sha256);
    }
    expect(caps.captured_at).toMatch(/^2026-10-27T/);
  });
  it("capture Parsons, ManTech and the discovery record KHK6E1JW9C15", () => {
    const has = (uei: string, level: string): boolean => caps.items.some((i) => i.file.endsWith(`${recipientId(uei, level)}.json`));
    expect(has("FFCMDLMXRK49", "P")).toBe(true);
    expect(has("KZA5CX3J8KE8", "P")).toBe(true);
    expect(has("KHK6E1JW9C15", "C")).toBe(true);
    expect(caps.items.some((i) => i.file.endsWith("CIK0000275880.json"))).toBe(true);
    expect(caps.items.some((i) => i.file.endsWith("CIK0000892537.json"))).toBe(true);
  });
  it("search files are keyed sha16(lower(keyword)|8)", () => {
    const u = loadUniverse();
    for (const k of u.keywords) expect(caps.items.some((i) => i.file.endsWith(`${searchKey(k)}.json`))).toBe(true);
  });
  it("the X predicates exist for X1-X18 and X1 is the New Jersey record", () => {
    expect(Object.keys(PREDICATES)).toEqual(Array.from({ length: 18 }, (_, i) => `X${i + 1}`));
    const exp = JSON.parse(readFileSync(path.join(ROOT, "scripts/gen/capture/xfacts.expected.json"), "utf8")) as { X1: { nj: string[] } };
    expect(exp.X1.nj).toEqual(["KHK6E1JW9C15"]);
  });
  it("the committed X1 children list has exactly one NJ child", () => {
    const kids = JSON.parse(readFileSync(path.join(SAMPLE, "registry/usaspending/children/MBPHTU7Y9S65.json"), "utf8")) as { uei: string; state_province: string }[];
    expect(kids).toHaveLength(41);
    expect(kids.filter((k) => k.state_province === "NJ").map((k) => k.uei)).toEqual(["KHK6E1JW9C15"]);
  });
});

describe("covered vendors", () => {
  const cv = Covered.parse(JSON.parse(readFileSync(path.join(ROOT, "data/covered_vendors.json"), "utf8")));
  it("has the six families of spine 8.7 and registers KHK6E1JW9C15 only under discovery", () => {
    expect(cv.families.map((f) => f.family)).toEqual(["Booz Allen", "Leidos", "SAIC", "V2X", "L3Harris", "CACI"]);
    expect(cv.families.flatMap((f) => f.details.map((d) => `${d.uei}-${d.level}`)).filter((x) => x.startsWith("KHK6E1JW9C15"))).toEqual([]);
    expect(cv.discovery.map((d) => d.uei)).toEqual(["KHK6E1JW9C15"]);
    expect(cv.families.reduce((n, f) => n + f.details.length, 0)).toBe(12);
    expect(cv.judge_set.filter((f) => f.capture).map((f) => f.family)).toEqual(["Parsons", "ManTech"]);
  });
});
