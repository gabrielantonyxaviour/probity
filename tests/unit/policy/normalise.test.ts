import { describe, expect, it } from "vitest";
import { accountHash, addrKey, daysBetween, lookalikeOf, money, nameNorm, nameToken, parseAddrKey, phoneDisplay, registrable, toE164, zipsConflict } from "../../../app/policy/normalise";

describe("name_norm (spine §9.4)", () => {
  it.each([
    ["Booz Allen Hamilton Inc.", "BOOZ ALLEN HAMILTON INC"],
    ["BOOZ ALLEN HAMILTON INC", "BOOZ ALLEN HAMILTON INC"],
    ["Booz Allen Hamilton Holding Corporation", "BOOZ ALLEN HAMILTON HOLDING CORP"],
    ["Science Applications International Corporation", "SCIENCE APPLICATIONS INTERNATIONAL CORP"],
    ["LEIDOS, INC.", "LEIDOS INC"],
    ["HARRIS CORP /DE/", "HARRIS CORP"],
    ["Quillan Ridge Fleet Services LLC (fictional)", "QUILLAN RIDGE FLEET SERVICES LLC"],
    ["Acme Incorporated", "ACME INC"],
    ["Acme Company Limited", "ACME CO LTD"],
    ["  Vectrus,  Inc. ", "VECTRUS INC"],
  ])("%s -> %s", (a, b) => expect(nameNorm(a)).toBe(b));
  it("derives the T04b token: first token of 3+ chars that is not a stop word", () => {
    expect(nameToken("Booz Allen Hamilton Inc.")).toBe("BOOZ");
    expect(nameToken("The Parsons Corporation")).toBe("PARSONS");
    expect(nameToken("L3Harris Technologies, Inc.")).toBe("L3HARRIS");
    expect(nameToken("V2X, Inc.")).toBe("V2X");
    expect(nameToken("Co Inc")).toBeNull();
  });
});

describe("addr_key", () => {
  it("moves the unit out and maps suffixes", () => {
    expect(addrKey({ line1: "1 Commvault Way", unit: "Suite 205", city: "Tinton Falls", state: "NJ" })).toMatchObject({ key: "1 COMMVAULT WAY|TINTON FALLS|NJ", unit: "STE 205" });
    expect(addrKey({ line1: "1 COMMVAULT WAY STE 205", city: "TINTON FALLS", state: "NJ" })!.key).toBe("1 COMMVAULT WAY|TINTON FALLS|NJ");
    expect(addrKey({ line1: "2100 Reston Parkway, Suite 300", city: "Reston", state: "VA" })!.key).toBe("2100 RESTON PKWY|RESTON|VA");
    expect(addrKey({ line1: "11487 Sunset Hills Road", city: "Reston", state: "VA" })!.key).toBe("11487 SUNSET HILLS RD|RESTON|VA");
    expect(addrKey({ line1: "1025 West NASA Boulevard", city: "Melbourne", state: "FL" })!.key).toBe(addrKey({ line1: "1025 W NASA BLVD", city: "MELBOURNE", state: "FL" })!.key);
    expect(addrKey({ line1: "5875 Trinity Pkwy #300", city: "Centreville", state: "VA" })).toMatchObject({ key: "5875 TRINITY PKWY|CENTREVILLE|VA", unit: "UNIT 300" });
  });
  it("same key for the same place written two ways; different place differs", () => {
    const a = addrKey({ line1: "12010 Sunset Hills Rd", city: "Reston", state: "VA" })!.key;
    const b = addrKey({ line1: "12021 Sunset Hills Rd", city: "Reston", state: "VA" })!.key;
    expect(a).not.toBe(b);
  });
  it("returns null without a number, city or state, and parses a key back", () => {
    expect(addrKey({ line1: "PO Box 12", city: "X", state: "VA" })).toBeNull();
    expect(addrKey({ line1: "1 Main St", city: null, state: "VA" })).toBeNull();
    expect(parseAddrKey("1 COMMVAULT WAY|TINTON FALLS|NJ")).toEqual({ number: "1", street: "COMMVAULT WAY", city: "TINTON FALLS", state: "NJ" });
  });
  it("compares zips only when both exist", () => {
    expect(zipsConflict("07724", "07724-1234")).toBe(false);
    expect(zipsConflict("07724", "07725")).toBe(true);
    expect(zipsConflict(null, "07725")).toBe(false);
  });
});

describe("domains and phones", () => {
  it("flags a lookalike only as a whole token run", () => {
    expect(lookalikeOf("boozallen-payments.example", ["boozallen.example"])).toBe("boozallen");
    expect(lookalikeOf("caci-payments.example", ["caci.example"])).toBe("caci");
    expect(lookalikeOf("saic.example", ["saic.example"])).toBeNull();
    expect(lookalikeOf("remit-desk.example", ["caci.example"])).toBeNull();
    expect(lookalikeOf("boozallenpayments.example", ["boozallen.example"])).toBeNull();
    expect(registrable("ap.mail.leidos.example")).toBe("leidos.example");
  });
  it("normalises phones to E.164 and displays them nationally", () => {
    expect(toE164("(703) 555-0147")).toBe("+17035550147");
    expect(toE164("703-902-5000")).toBe("+17039025000");
    expect(toE164("7038417800")).toBe("+17038417800");
    expect(toE164("nope")).toBeNull();
    expect(phoneDisplay("+17039025000")).toBe("(703) 902-5000");
  });
});

describe("money, dates, hashes", () => {
  it("formats money and counts days in UTC", () => {
    expect(money(1284550)).toBe("$1,284,550.00");
    expect(money(87400)).toBe("$87,400.00");
    expect(daysBetween("2026-10-19 00:00:00", "2026-10-22T15:12:00Z")).toBe(3);
  });
  it("hashes the S1 account as the spec does", () => {
    expect(accountHash("110000000", "000999000141")).toBe("175dbd7da76270843def1d6ba77e9bf08cc9f0bcac9a452456da437e4893abe6");
  });
});
