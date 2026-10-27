import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { validateTyped, emptyTyped, checkLetter } from "../components/new/validation";
import { NEW, FIXED, DOSSIER, SHELL } from "./copy";
import { money, offset, runDate, stamp, latency, tokens } from "./format";
import { maskAccounts } from "./mask";
import { splitBanner } from "../components/review/DecisionCard";
import { reasonTitle } from "./labels";
import { hasRealPhone } from "./phone";
import { systemView } from "./system-status";

const BANNED = /\b(fraud(?:ulent)?|fraud detected|reconcil\w*|AI-powered|magic|thinking…|confidence score|guaranteed|real-time)\b/i;

function strings(o: unknown, out: string[] = []): string[] {
  if (typeof o === "string") out.push(o);
  else if (typeof o === "function") out.push(String((o as (...a: string[]) => unknown)("a", "b", "c", "d", "e", "f", "g", "h")));
  else if (Array.isArray(o)) o.forEach((x) => strings(x, out));
  else if (o && typeof o === "object") Object.values(o).forEach((x) => strings(x, out));
  return out;
}

describe("copy and formatting", () => {
  it("contains none of the banned words (01 section 11.9)", async () => {
    const all = await import("./copy");
    for (const s of strings(Object.values(all))) expect(s, s).not.toMatch(BANNED);
  });
  it("source files contain no banned words outside the fraud_* key mapping", () => {
    const root = path.resolve(__dirname, "..");
    const bad: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        if (["node_modules", ".next", "landing", "(marketing)"].some((x) => f.startsWith(x))) continue;
        const p = path.join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|css)$/.test(f) && !f.endsWith(".test.ts")) {
          readFileSync(p, "utf8").split("\n").forEach((line, i) => {
            if (/reconcil|AI-powered|real-time|\bfraud/i.test(line) && !/fraud_(flag|confirmed)|fraud_flag/.test(line)) bad.push(`${p}:${i + 1}`);
          });
        }
      }
    };
    walk(root);
    expect(bad).toEqual([]);
  });
  it("uses the spine fixed strings verbatim", () => {
    expect(FIXED.syntheticNotice).toBe("Internal records and letters are synthetic, made for this demo. Registry facts are real public data from USAspending and SEC EDGAR.");
    expect(FIXED.sweepHeader(2, "PR-2026-10-30", "$159,220.00")).toBe("Not asked, but checked: 2 other item(s) in PR-2026-10-30 ($159,220.00) fail payment controls.");
    expect(DOSSIER.sections.models).toContain("Nemotron");
    expect(SHELL.systemSample).toBe("Sample data · no live calls");
  });
  it("validates the typed form with the exact messages (AC-NEW-1, AC-NEW-3)", () => {
    expect(validateTyped(emptyTyped).name).toBe(NEW.v.nameOrUei);
    expect(validateTyped({ ...emptyTyped, uei: "abc" }).uei).toBe(NEW.v.uei);
    expect(validateTyped({ ...emptyTyped, name: "x co", routing: "1234", account: "123456789012" })).toMatchObject({ routing: NEW.v.routing, account: NEW.v.account });
    expect(validateTyped({ ...emptyTyped, name: "x co", line1: "1 Main St", state: "n" }).state).toBe(NEW.v.state);
    expect(validateTyped({ ...emptyTyped, name: "x co", email: "nope" }).email).toBe(NEW.v.email);
    expect(validateTyped({ ...emptyTyped, name: "x co", routing: "110000000", account: "000999000123" })).toEqual({});
    expect(checkLetter(null)).toBe(NEW.v.noLetter);
    expect(checkLetter(new File(["x"], "a.txt", { type: "text/plain" }))).toBe(NEW.v.wrongType);
  });
  it("formats money, dates, latency and tokens per 01 section 11.6", () => {
    expect(money(1284550)).toBe("$1,284,550.00");
    expect(runDate("2026-10-30")).toBe("Fri 30 Oct 2026");
    expect(stamp("2026-10-22T15:12:00Z")).toBe("22 Oct 2026, 15:12 UTC");
    expect(latency(812)).toBe("812 ms");
    expect(latency(6100)).toBe("6.1 s");
    expect(tokens(1204, 233)).toBe("1,204/233 tok");
    expect(tokens(null, null)).toBe("tokens not reported");
    expect(offset(41200)).toBe("+00:41.2");
  });
  it("masks test account numbers and keeps the banner text intact when split", () => {
    expect(maskAccounts("Account number: 000999000141 (TEST ACCOUNT)")).toBe("Account number: •••• 0141 (TEST ACCOUNT)");
    const b = "Hold: the new address belongs to a different company, not our vendor. Do not change bank details for X. 3 payment(s) totalling $1.00 in PR-1 need review before release.";
    const [a, c] = splitBanner(b);
    expect(a + c).toBe(b);
    expect(splitBanner("Approve: every checked fact agrees, and an independent call-back confirmed the change on 21 Oct 2026.")[1]).toBe("");
  });
  it("titles R-codes per variant and detects real phones", () => {
    expect(reasonTitle("R4", { variant: "multi_candidate" })).toBe("Cannot determine which vendor this request is for. Do not guess.");
    expect(reasonTitle("R1", { lookalike: true })).toContain("lookalike");
    expect(reasonTitle("R5", { sessionId: "s-1" })).toBe("Used in a request later confirmed as an impersonation (session s-1).");
    expect(hasRealPhone("(703) 902-5000")).toBe(true);
    expect(hasRealPhone("(703) 555-0147")).toBe(false);
  });
  it("derives the system chip from /readyz including the down states", () => {
    expect(systemView(null, null).long).toBe("Checking services");
    const lane = (state: string) => ({ requested_model: "nvidia/x", pin_source: "env", state, last_model: "nvidia/x", last_latency_ms: 1, checked_at: "t" });
    const ready = (over: Record<string, unknown> = {}, mode = "live") => ({ ready: true, mode, checks: { zetaris_query: { status: "ok" }, zetaris_admin: { status: "ok" }, nightshift: { status: "online", base_url_host: null, catalog_count: 1, lanes: { fast: lane("confirmed_nemotron"), deep: lane("confirmed_nemotron"), vision: {} } }, erp_db: { status: "ok" }, world_model: { status: "ok" }, hmem: { status: "disabled" }, sample_data: { status: "ok" }, sec_user_agent: { status: "ok" }, ...over }, features: { simulate_outage: false, rerun: true, hmem: false } }) as never;
    expect(systemView(ready(), null).long).toBe("Zetaris live · Nemotron: Lightning ✓ Ultra ✓");
    expect(systemView(ready({ zetaris_query: { status: "offline" } }), null).long).toBe("Zetaris unreachable");
    expect(systemView(ready({}, "sample"), null).long).toBe("Sample data · no live calls");
  });
});
