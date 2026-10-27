import { describe, expect, it } from "vitest";
import { isValidAba } from "../../../app/policy/aba";
import { parseEml } from "../../../app/policy/eml";
import { phoneHistory, phonesOnFileAt, recentEmailChange } from "../../../app/policy/contacts";
import { T02 } from "../_support/data";

describe("ABA checksum (R7)", () => {
  it("accepts the test routing and rejects a short or altered number", () => {
    expect(isValidAba("110000000")).toBe(true);
    expect(isValidAba("11000000")).toBe(false);
    expect(isValidAba("110000001")).toBe(false);
    expect(isValidAba("021000021")).toBe(true);
    expect(isValidAba(null)).toBe(false);
  });
});

describe("eml parser", () => {
  const raw = ["From: \"R. Castellane\" <AP-Remittance@boozallen-payments.example>", "Reply-To: other@remit-desk.example", "Date: Thu, 22 Oct 2026 15:12:00 +0000", "Subject: Update", " continued", "", "From: ignored@x.example"].join("\r\n");
  it("reads From, Reply-To and Date, lower-cases and ignores the body", () => {
    expect(parseEml(raw)).toMatchObject({ from_email: "ap-remittance@boozallen-payments.example", from_domain: "boozallen-payments.example", reply_to_domain: "remit-desk.example", date: "2026-10-22T15:12:00.000Z", subject: "Update continued" });
  });
  it("a missing Reply-To is null, never the From domain", () => {
    expect(parseEml("From: treasury@l3harris.example\r\nDate: Tue, 20 Oct 2026 14:05:00 +0000")!.reply_to_domain).toBeNull();
    expect(parseEml("")).toBeNull();
  });
});

describe("phonesOnFileAt (the PhonesAt oracle)", () => {
  const rows = T02["V-10027"]!.map((r) => ({ kind: String(r.kind), value: String(r.value), valid_from: String(r.valid_from), valid_to: (r.valid_to as string | null) ?? null }));
  it("returns the pre-change number 30 days before and the new number at the request", () => {
    expect(phonesOnFileAt(rows, "2026-09-22T00:00:00Z").map((p) => p.e164)).toEqual(["+17039025000"]);
    expect(phonesOnFileAt(rows, "2026-10-22T15:12:00Z").map((p) => p.e164)).toEqual(["+17035550182"]);
  });
  it("treats valid_to as exclusive and null as open", () => {
    expect(phonesOnFileAt(rows, "2026-10-19T00:00:00Z").map((p) => p.e164)).toEqual(["+17035550182"]);
    expect(phoneHistory(rows)).toHaveLength(2);
  });
  it("detects a recent email change", () => {
    const e = [{ kind: "email", value: "ap@x.example", valid_from: "2026-10-10", valid_to: null }];
    expect(recentEmailChange(e, "2026-10-22T00:00:00Z")).not.toBeNull();
    expect(recentEmailChange(e, "2026-12-22T00:00:00Z")).toBeNull();
  });
});
