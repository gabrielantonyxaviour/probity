import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ERP_TABLES } from "../../../app/schemas/erp";
import { nameNorm as appNameNorm } from "../../../app/policy/normalise";
import { buildSeed, type Tables } from "../../../scripts/seed/build";
import { seedSql, tableJson } from "../../../scripts/seed/serialise";
import { PATTERNS } from "../../../scripts/seed/types";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const base = buildSeed(new Set());
const T = base.tables;
const str = (v: unknown): string => String(v);

/** Same owners/counts logic as the payment_run_item_enriched view (02 section 4.2): any request status counts. */
function accountVendorCount(tables: Tables, hash: string, extra: { hash: string; owner: string }[] = []): number {
  const owners = new Set<string>();
  for (const b of tables.vendor_bank_account) if (b.account_hash === hash) owners.add(str(b.vendor_id));
  for (const r of tables.bank_change_request) if (r.new_account_hash === hash) owners.add(str(r.vendor_id ?? r.request_id));
  for (const e of extra) if (e.hash === hash) owners.add(e.owner);
  return owners.size;
}
const S1_HASH = "175dbd7da76270843def1d6ba77e9bf08cc9f0bcac9a452456da437e4893abe6";

describe("seed generator", () => {
  it("is deterministic", () => {
    const again = buildSeed(new Set());
    for (const t of ERP_TABLES) expect(tableJson(t, again.tables[t])).toBe(tableJson(t, T[t]));
    expect(seedSql(again.tables)).toBe(seedSql(T));
  });

  it("matches the committed outputs byte for byte", () => {
    for (const t of ERP_TABLES) {
      expect(readFileSync(path.join(ROOT, `db/seed/${t}.json`), "utf8")).toBe(tableJson(t, T[t]));
      expect(readFileSync(path.join(ROOT, `data/sample/erp/${t}.json`), "utf8")).toBe(tableJson(t, T[t]));
    }
    expect(readFileSync(path.join(ROOT, "db/init/02-seed.sql"), "utf8")).toBe(seedSql(T));
  });

  it("has the 02 section 4.3 counts", () => {
    expect(T.vendor).toHaveLength(40);
    expect(T.vendor.filter((v) => !v.is_fictional)).toHaveLength(7);
    expect(T.vendor.filter((v) => v.is_fictional)).toHaveLength(33);
    expect(T.vendor_domain).toHaveLength(46);
    expect(T.bank_change_request).toHaveLength(10);
    expect(T.bank_change_document).toHaveLength(0);
    expect(T.vendor_contact_log).toHaveLength(28);
    expect(T.payment_run).toHaveLength(11);
    expect(T.payment_run_item.filter((i) => i.payment_run_id === "PR-2026-10-30")).toHaveLength(15);
    expect(T.vendor_bank_account.filter((a) => a.status === "active")).toHaveLength(39);
  });

  it("leaves no request open", () => {
    expect(T.bank_change_request.every((r) => ["applied", "rejected", "withdrawn"].includes(str(r.status)))).toBe(true);
  });

  it("computes the fixed sums from seed amounts, never storing them", () => {
    const run = T.payment_run_item.filter((i) => i.payment_run_id === "PR-2026-10-30");
    const cents = (rows: typeof run): number => rows.reduce((s, r) => s + Math.round(Number(r.amount_usd) * 100), 0);
    expect(cents(run.filter((i) => i.vendor_id === "V-10027"))).toBe(128_455_000);
    expect(cents(run)).toBe(242_647_948);
    expect(JSON.stringify(T)).not.toMatch(/exposure|total_usd/);
  });

  it("stores every vendor name plain (no suffix, no synthetic wording); fictional vendors have no registry identifiers", () => {
    for (const v of T.vendor) {
      expect(str(v.legal_name)).not.toMatch(/fictional|synthetic/i);
      if (v.is_fictional) expect([v.uei, v.registrant_cik]).toEqual([null, null]);
      expect(v.legal_name_norm).toBe(appNameNorm(str(v.legal_name)));
    }
    expect(T.vendor.find((v) => v.vendor_id === "V-07734")).toMatchObject({ legal_name: "LEIDOS INC", is_fictional: false, status: "merged", merged_into: "V-10442" });
  });

  it("has no synthetic wording in any seeded value (vendors, banks, contacts, staff, call logs)", () => {
    expect(JSON.stringify(T).replaceAll("is_fictional", "")).not.toMatch(/fictional/i);
    for (const a of T.vendor_bank_account) expect(str(a.bank_name)).not.toMatch(/\btest\b/i);
  });

  it("uses only test banking data and synthetic contact data", () => {
    for (const a of T.vendor_bank_account) expect(str(a.routing)).toBe("110000000");
    for (const d of T.vendor_domain) expect(str(d.domain)).toMatch(/\.example$/);
    for (const c of T.vendor_contact.filter((c) => c.kind === "email")) expect(str(c.value)).toMatch(/\.example$/);
  });

  it("reproduces the scenario facts (PT1-PT10) from rows", () => {
    expect(T.vendor_bank_account.find((a) => a.bank_account_id === "BA-40812")?.account_hash).toBe(S1_HASH);
    expect(T.vendor_contact.filter((c) => c.vendor_id === "V-10027" && c.kind === "phone").map((c) => [c.value, c.valid_to])).toEqual([["(703) 902-5000", "2026-10-19T16:20:00Z"], ["(703) 555-0182", null]]);
    const logs = Object.fromEntries(T.vendor_contact_log.map((l) => [str(l.log_id), l]));
    expect(logs["CL-20398"]).toMatchObject({ phone_e164: "+13217279100", phone_source: "edgar_registrant", outcome: "confirmed", called_by: "M. Okonkwo" });
    expect(logs["CL-20427"]).toMatchObject({ phone_e164: "+17038417800", phone_source: "edgar_registrant" });
    expect(logs["CL-20389"]?.phone_source).toBe("request_letter");
    expect(T.vendor_domain.filter((d) => d.domain === "northgateinteriors.example")).toHaveLength(2);
    expect(T.vendor.find((v) => v.vendor_id === "V-10311")).toMatchObject({ remit_line1: "2424 Garden of the Gods Rd", remit_city: "Colorado Springs" });
    expect(T.payment_run_item.filter((i) => i.vendor_id === "V-10812").map((i) => i.item_id)).toEqual(["PRI-1030-0009"]);
  });

  it("makes the S1 account collide with exactly one other owner (check 4)", () => {
    expect(accountVendorCount(T, S1_HASH)).toBe(1);
    expect(accountVendorCount(T, S1_HASH, [{ hash: S1_HASH, owner: "V-10027" }])).toBe(2);
  });

  it("only the Northgate pair shares an account hash", () => {
    const owners = new Map<string, Set<string>>();
    for (const b of T.vendor_bank_account) owners.set(str(b.account_hash), (owners.get(str(b.account_hash)) ?? new Set()).add(str(b.vendor_id)));
    const shared = [...owners.values()].filter((s) => s.size > 1).map((s) => [...s].sort().join("+"));
    expect(shared).toEqual(["V-10233+V-10234"]);
  });
});

describe("counterfactual seeds (--drop)", () => {
  it("PT1 removes the cross-vendor account reuse", () => {
    const t = buildSeed(new Set(["PT1"])).tables;
    expect(t.vendor_bank_account.filter((a) => a.account_hash === S1_HASH)).toHaveLength(0);
    expect(accountVendorCount(t, S1_HASH, [{ hash: S1_HASH, owner: "V-10027" }])).toBe(1);
  });
  it("PT2 keeps the old main number open; PT4 removes the L3Harris call-back; PT6 removes the SAIC domain", () => {
    expect(buildSeed(new Set(["PT2"])).tables.vendor_contact.filter((c) => c.vendor_id === "V-10027" && c.kind === "phone")).toHaveLength(1);
    expect(buildSeed(new Set(["PT4"])).tables.vendor_contact_log.some((l) => l.log_id === "CL-20398")).toBe(false);
    expect(buildSeed(new Set(["PT6"])).tables.vendor_domain.some((d) => d.domain === "saic.example")).toBe(false);
  });
  it("every pattern id builds and passes the invariants", () => {
    for (const p of PATTERNS) expect(() => buildSeed(new Set([p]))).not.toThrow();
  });
});
