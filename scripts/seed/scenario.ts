// Scenario-bearing rows, exact per 02 section 4.4. Nothing here knows an outcome; the facts only make the policy fire.
import { BANKS, type AccountSpec, type CallLogSpec, type ContactSpec, type Drop, type ItemSpec, type VendorSpec } from "./types";

const MIGRATED = "2019-04-02T12:00:00Z";
const real = (id: string, name: string, uei: string, cik: string, remit: VendorSpec["remit"], domains: VendorSpec["domains"], created: string, legacy: string, prefix: string): VendorSpec => ({
  id, name, fictional: false, uei, cik, remit, status: "active", mergedInto: null, legacy, created, domains, category: "subcontract", prefix,
});
const fict = (id: string, name: string, remit: VendorSpec["remit"], domain: string, added: string, created: string, legacy: string | null, prefix: string, category: VendorSpec["category"]): VendorSpec => ({
  id, name: `${name} (fictional)`, fictional: true, uei: null, cik: null, remit, status: "active", mergedInto: null, legacy, created,
  domains: [{ domain, added }], category, prefix,
});

export function scenarioVendors(drop: Drop): VendorSpec[] {
  const v2xRemit = drop.has("PT7")
    ? { line1: "2100 Reston Pkwy", unit: "Ste 300", city: "Reston", state: "VA", zip: "20191" }
    : { line1: "2424 Garden of the Gods Rd", unit: null, city: "Colorado Springs", state: "CO", zip: "80919" };
  const saicDomains = drop.has("PT6") ? [] : [{ domain: "saic.example", added: MIGRATED }];
  const merged: VendorSpec = {
    id: "V-07734", name: "LEIDOS INC", fictional: false, uei: null, cik: null,
    remit: { line1: "11951 Freedom Dr", unit: null, city: "Reston", state: "VA", zip: "20190" },
    status: drop.has("PT9") ? "inactive" : "merged", mergedInto: drop.has("PT9") ? null : "V-10442", legacy: "SAP-0012040",
    created: "2009-03-02T14:30:00Z", domains: [], category: "subcontract", prefix: "LDI",
  };
  return [
    real("V-10027", "Booz Allen Hamilton Inc", "JCBMLGPE6Z71", "0001443646", { line1: "8283 Greensboro Dr", unit: null, city: "McLean", state: "VA", zip: "22102" }, [{ domain: "boozallen.example", added: MIGRATED }], "2011-05-16T14:00:00Z", "SAP-0031877", "BAH"),
    real("V-10442", "Leidos, Inc.", "UE9QJD4KK1L6", "0001336920", { line1: "1750 Presidents St", unit: "Fl 10", city: "Reston", state: "VA", zip: "20190" }, [{ domain: "leidos.example", added: MIGRATED }], "2013-10-01T14:00:00Z", "SAP-0040522", "LDS"),
    real("V-10587", "Science Applications International Corp", "MMLKPW9JLX64", "0001571123", { line1: "12010 Sunset Hills Rd", unit: null, city: "Reston", state: "VA", zip: "20190" }, saicDomains, "2013-10-01T14:00:00Z", "SAP-0040611", "SAI"),
    real("V-10311", "V2X, Inc.", "CG8SV4246V29", "0001601548", v2xRemit, drop.has("PT7") ? [{ domain: "v2x.example", added: "2022-07-11T15:00:00Z" }] : [{ domain: "vectrus.example", added: MIGRATED }, { domain: "v2x.example", added: "2022-07-11T15:00:00Z" }], "2015-02-09T14:00:00Z", "SAP-0044130", "VTX"),
    real("V-10198", "L3Harris Technologies, Inc.", "QM4EZDV15JL8", "0000202058", { line1: "1395 Troutman Blvd NE", unit: null, city: "Palm Bay", state: "FL", zip: "32905" }, [{ domain: "harris.example", added: MIGRATED }, { domain: "l3harris.example", added: "2019-07-01T15:00:00Z" }], "2012-08-20T14:00:00Z", "SAP-0035209", "LHX"),
    real("V-10112", "CACI, INC. - FEDERAL", "N3PBJAVNKF61", "0000016058", { line1: "14370 Newbrook Dr", unit: null, city: "Chantilly", state: "VA", zip: "20151" }, [{ domain: "caci.example", added: MIGRATED }], "2010-11-03T14:00:00Z", "SAP-0029954", "CAC"),
    fict("V-10812", "Quillan Ridge Fleet Services LLC", { line1: "4410 Wexmoor Commons Blvd", unit: "Ste 140", city: "Chesapeake", state: "VA", zip: "23320" }, "quillanridge.example", "2026-10-18T13:02:00Z", "2026-10-18T13:02:00Z", null, "QRF", "small"),
    fict("V-10763", "Tidewater Cable & Conduit LLC", { line1: "2207 Bramblecrest Rd", unit: null, city: "Norfolk", state: "VA", zip: "23502" }, "tidewatercable.example", "2021-03-15T15:00:00Z", "2021-03-15T15:00:00Z", null, "TCC", "facilities"),
    fict("V-10655", "Marrowstone Facility Partners LLC", { line1: "618 Old Ferry Landing Rd", unit: null, city: "Annapolis", state: "MD", zip: "21401" }, "marrowstone.example", MIGRATED, "2017-06-12T14:00:00Z", "SAP-0051288", "MFP", "facilities"),
    merged,
  ];
}

const c = (vendor: string, kind: "phone" | "email", value: string, from: string, to: string | null, via: ContactSpec["via"]): ContactSpec => ({ vendor, kind, value, from, to, via });

export function scenarioContacts(drop: Drop): ContactSpec[] {
  const bahPhone = drop.has("PT2")
    ? [c("V-10027", "phone", "(703) 902-5000", MIGRATED, null, "migration")]
    : [c("V-10027", "phone", "(703) 902-5000", MIGRATED, "2026-10-19T16:20:00Z", "migration"), c("V-10027", "phone", "(703) 555-0182", "2026-10-19T16:20:00Z", null, "email request")];
  return [
    ...bahPhone,
    c("V-10027", "email", "accounts.receivable@boozallen.example", MIGRATED, null, "migration"),
    c("V-10442", "phone", "571-526-6000", MIGRATED, null, "migration"), c("V-10442", "email", "ar.federal@leidos.example", MIGRATED, null, "migration"),
    c("V-10587", "phone", "703.676.4300", MIGRATED, null, "migration"), c("V-10587", "email", "ap@saic.example", MIGRATED, null, "migration"),
    c("V-10311", "phone", "(719) 555-0110", MIGRATED, "2022-07-11T15:00:00Z", "migration"),
    c("V-10311", "phone", "(571) 481-2000", "2022-07-11T15:00:00Z", null, "vendor_portal"),
    c("V-10311", "email", "ar@vectrus.example", MIGRATED, "2022-07-11T15:00:00Z", "migration"),
    c("V-10311", "email", "ar@v2x.example", "2022-07-11T15:00:00Z", null, "vendor_portal"),
    c("V-10198", "phone", "3217279100", "2019-07-01T15:00:00Z", null, "vendor_portal"), c("V-10198", "email", "treasury@l3harris.example", "2019-07-01T15:00:00Z", null, "vendor_portal"),
    c("V-10112", "phone", "(703) 841-7800", MIGRATED, null, "migration"), c("V-10112", "email", "treasury@caci.example", MIGRATED, null, "migration"),
    c("V-10812", "phone", "(757) 555-0163", "2026-10-18T13:02:00Z", null, "onboarding"), c("V-10812", "email", "billing@quillanridge.example", "2026-10-18T13:02:00Z", null, "onboarding"),
    c("V-10763", "phone", "(757) 555-0131", "2021-03-15T15:00:00Z", null, "onboarding"), c("V-10763", "email", "ar@tidewatercable.example", "2021-03-15T15:00:00Z", null, "onboarding"),
    c("V-10655", "phone", "(410) 555-0177", MIGRATED, null, "migration"), c("V-10655", "email", "accounts@marrowstone.example", MIGRATED, null, "migration"),
    c("V-07734", "phone", "703-555-0108", MIGRATED, "2020-01-15T15:00:00Z", "migration"),
  ];
}

/** Account numbers are generator-only; the database keeps hash and last four. */
export function scenarioAccounts(drop: Drop): AccountSpec[] {
  const pt3 = drop.has("PT3");
  const a = (id: string, vendor: string, bank: string, account: string, status: AccountSpec["status"], changed: string, source: string | null = null): AccountSpec => ({ id, vendor, bank, account, status, changed, source });
  return [
    a("BA-40027", "V-10027", BANKS.calderwick, "000999000512", "active", "2021-06-14T15:00:00Z"),
    a("BA-40442", "V-10442", BANKS.oldQuarry, "000999000538", "active", "2020-02-03T15:00:00Z"),
    a("BA-40587", "V-10587", BANKS.harborline, "000999000546", "active", "2019-09-30T15:00:00Z"),
    a("BA-40310", "V-10311", BANKS.calderwick, "000999000507", "superseded", "2019-04-02T12:00:00Z"),
    a("BA-40311", "V-10311", BANKS.harborline, "000999000553", "active", "2022-07-20T15:00:00Z"),
    a("BA-40198", "V-10198", BANKS.oldQuarry, "000999000561", "active", "2019-07-15T15:00:00Z"),
    a("BA-40112", "V-10112", BANKS.calderwick, "000999000604", "active", "2018-01-08T15:00:00Z"),
    a("BA-40812", "V-10812", BANKS.harborline, drop.has("PT1") ? "000999000149" : "000999000141", "active", "2026-10-18T13:02:00Z"),
    a("BA-40762", "V-10763", BANKS.calderwick, "000999000574", "superseded", "2021-03-15T15:00:00Z"),
    a("BA-40763", "V-10763", BANKS.oldQuarry, "000999000589", "active", pt3 ? "2026-08-24T18:05:00Z" : "2026-10-16T18:05:00Z", "BCR-2026-0389"),
    a("BA-40655", "V-10655", BANKS.harborline, "000999000596", "active", "2023-08-24T15:00:00Z"),
    a("BA-37734", "V-07734", BANKS.calderwick, "000999000501", "closed", "2019-04-02T12:00:00Z"),
  ];
}

export const RUN_1030_ITEMS: ItemSpec[] = [
  { run: "PR-2026-10-30", vendor: "V-10027", invoice: "INV-BAH-20931", account: "BA-40027", cents: 61240000 },
  { run: "PR-2026-10-30", vendor: "V-10027", invoice: "INV-BAH-20944", account: "BA-40027", cents: 43115000 },
  { run: "PR-2026-10-30", vendor: "V-10027", invoice: "INV-BAH-20967", account: "BA-40027", cents: 24100000 },
  { run: "PR-2026-10-30", vendor: "V-10442", invoice: "INV-LDS-88412", account: "BA-40442", cents: 35682040 },
  { run: "PR-2026-10-30", vendor: "V-10587", invoice: "INV-SAI-41207", account: "BA-40587", cents: 19840000 },
  { run: "PR-2026-10-30", vendor: "V-10198", invoice: "INV-LHX-73318", account: "BA-40198", cents: 27491525 },
  { run: "PR-2026-10-30", vendor: "V-10349", invoice: "INV-CRS-11872", account: null, cents: 4821000 },
  { run: "PR-2026-10-30", vendor: "V-10471", invoice: "INV-OTC-30455", account: null, cents: 1264075 },
  { run: "PR-2026-10-30", vendor: "V-10812", invoice: "INV-QRF-10044", account: "BA-40812", cents: 8740000 },
  { run: "PR-2026-10-30", vendor: "V-10763", invoice: "INV-TCC-55021", account: "BA-40763", cents: 6327550 },
  { run: "PR-2026-10-30", vendor: "V-10655", invoice: "INV-MFP-20788", account: "BA-40655", cents: 4198000 },
  { run: "PR-2026-10-30", vendor: "V-10528", invoice: "INV-CHH-60913", account: null, cents: 987500 },
  { run: "PR-2026-10-30", vendor: "V-10604", invoice: "INV-RNS-44176", account: null, cents: 2346018 },
  { run: "PR-2026-10-30", vendor: "V-10718", invoice: "INV-BPM-37702", account: null, cents: 631240 },
];
export const RUN_1103_ITEMS: ItemSpec[] = [
  { run: "PR-2026-11-03", vendor: "V-10311", invoice: "INV-VTX-90215", account: "BA-40311", cents: 31875000 },
  { run: "PR-2026-11-03", vendor: "V-10112", invoice: "INV-CAC-77104", account: "BA-40112", cents: 40230000 },
  { run: "PR-2026-11-03", vendor: "V-10442", invoice: "INV-LDS-88433", account: "BA-40442", cents: 12994000 },
];

export function scenarioCallLogs(drop: Drop): CallLogSpec[] {
  const L = (id: string, vendor: string, request: string, phone: string, source: CallLogSpec["source"], outcome: CallLogSpec["outcome"], at: string, by: string): CallLogSpec => ({ id, vendor, request, purpose: "bank_change_callback", phone, source, outcome, at, by });
  const out = [
    L("CL-20389", "V-10763", "BCR-2026-0389", "+17575550119", "request_letter", "confirmed", drop.has("PT3") ? "2026-08-24T13:40:00Z" : "2026-10-16T13:40:00Z", "J. Whitfield (fictional)"),
    L("CL-20371", "V-10604", "BCR-2026-0371", "+15715550138", "vendor_master_pre_window", "confirmed", "2026-10-06T14:10:00Z", "J. Whitfield (fictional)"),
    L("CL-20398", "V-10198", "BCR-2026-0398", "+13217279100", "edgar_registrant", "confirmed", "2026-10-21T14:30:00Z", "M. Okonkwo (fictional)"),
    L("CL-20427", "V-10112", "BCR-2026-0427", "+17038417800", "edgar_registrant", "confirmed", "2026-10-26T15:05:00Z", "T. Okafor (fictional)"),
    L("CL-20233", "V-10592", "BCR-2026-0233", "+12405550152", "vendor_master_pre_window", "denied", "2026-06-11T16:00:00Z", "M. Okonkwo (fictional)"),
  ];
  const skip = new Set<string>();
  if (drop.has("PT4")) skip.add("CL-20398");
  if (drop.has("PT5")) skip.add("CL-20427");
  if (drop.has("PT10")) skip.add("CL-20371");
  return out.filter((l) => !skip.has(l.id));
}
