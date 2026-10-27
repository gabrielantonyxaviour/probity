// X1-X18 (02 section 3.2): the real registry disagreements the scenarios rely on, as JSON predicates over live data.
// Values avoid amounts that move daily. A changed predicate prints the new value and fails capture:check; the coordinator then
// updates spine 8.8 and 13, never the code. Baselines live in xfacts.expected.json (record with XFACTS_RECORD=1 after reviewing the output).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { recipientId, searchKey, type RegistryHttp } from "./registry-io";

// Registry JSON is read structurally and every access below is null-safe, so the predicates use a loose record type on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = Record<string, any>;
export interface XResult { id: string; ok: boolean; expected: unknown; actual: unknown }
const EXPECTED_FILE = path.join(import.meta.dirname, "xfacts.expected.json");

class Reg {
  private cache = new Map<string, Promise<unknown>>();
  constructor(private readonly http: RegistryHttp) {}
  private once<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (!this.cache.has(key)) this.cache.set(key, load());
    return this.cache.get(key) as Promise<T>;
  }
  detail(uei: string, level = "C"): Promise<J> { return this.once(`d${uei}${level}`, async () => JSON.parse((await this.http.usa(`/recipient/${recipientId(uei, level)}/`)).text)); }
  children(parent: string): Promise<J[]> { return this.once(`c${parent}`, async () => JSON.parse((await this.http.usa(`/recipient/children/${parent}/`)).text)); }
  search(keyword: string): Promise<J> { return this.once(`s${keyword}${searchKey(keyword)}`, async () => JSON.parse((await this.http.usaSearch(keyword, 8)).text)); }
  edgar(cik: string): Promise<J> { return this.once(`e${cik}`, async () => JSON.parse((await this.http.sec("data", `/submissions/CIK${cik}.json`)).text)); }
  tickers(): Promise<J> { return this.once("t", async () => JSON.parse((await this.http.sec("www", "/files/company_tickers.json")).text)); }
}
const loc = (d: J): unknown[] => [d.location?.address_line1 ?? null, d.location?.address_line2 ?? null, d.location?.city_name ?? null, d.location?.state_code ?? null, d.location?.zip ?? null];
const parentsOf = (d: J): string[] => (d.parents ?? []).map((p: J) => p.parent_uei).sort();
const aliases = (d: J, ...needles: string[]): boolean[] => needles.map((n) => (d.alternate_names ?? []).includes(n));
const former = (e: J, name: string): unknown => (e.formerNames ?? []).filter((f: J) => f.name === name).map((f: J) => [String(f.from).slice(0, 10), String(f.to).slice(0, 10)]);
const biz = (e: J): unknown[] => [e.addresses?.business?.street1, e.addresses?.business?.street2, e.addresses?.business?.city, e.addresses?.business?.stateOrCountry, e.addresses?.business?.zipCode];

type Pred = (r: Reg) => Promise<unknown>;
export const PREDICATES: Record<string, Pred> = {
  X1: async (r) => ({ nj: (await r.children("MBPHTU7Y9S65")).filter((c) => c.state_province === "NJ").map((c) => c.uei), children: (await r.children("MBPHTU7Y9S65")).length, khk: loc(await r.detail("KHK6E1JW9C15")), jcb: loc(await r.detail("JCBMLGPE6Z71")), parent: loc(await r.detail("MBPHTU7Y9S65", "P")) }),
  X2: async (r) => { const e = await r.edgar("0001443646"); return { ein: e.ein, phone: e.phone, former: former(e, "EXPLORER HOLDING CORP") }; },
  X3: async (r) => ({ ue9: aliases(await r.detail("UE9QJD4KK1L6"), "LEIDOS INC", "SCIENCE APPLICATIONS INTERNATIONAL CORPORATION"), mdsSaic: ((await r.detail("MDSWM6MB1BH7")).alternate_names ?? []).filter((a: string) => /SAIC|SCIENCE APPLICATIONS/.test(a)).length > 3, leidosFormer: former(await r.edgar("0001336920"), "SAIC, Inc."), saicFormer: former(await r.edgar("0001571123"), "SAIC Gemini, Inc.") }),
  X4: async (r) => { const d = await r.detail("UE9QJD4KK1L6"); const p = await r.detail("MDSWM6MB1BH7"); return { parent_uei: d.parent_uei, parents: parentsOf(d), child: loc(d), parentLoc: loc(p) }; },
  X5: async (r) => ({ parents: parentsOf(await r.detail("MMLKPW9JLX64")) }),
  X6: async (r) => { const d = await r.detail("CG8SV4246V29", "P"); const e = await r.edgar("0001601548"); return { location: loc(d), vectrus: aliases(d, "VECTRUS  INC."), former: [former(e, "Vectrus, Inc."), former(e, "Exelis MSCO Inc.")], business: biz(e), phone: e.phone, inc: e.stateOfIncorporation }; },
  X7: async (r) => { const e = await r.edgar("0000016058"); const c = await r.detail("N3PBJAVNKF61"); return { edgar: biz(e), phone: e.phone, parent: loc(await r.detail("QSRTXLFKV857", "P")), child: loc(c), childParents: parentsOf(c), childParentNames: (c.parents ?? []).map((p: J) => p.parent_name).sort() }; },
  X8: async (r) => { const e = await r.edgar("0000202058"); const d = await r.detail("QM4EZDV15JL8"); return { former: former(e, "HARRIS CORP /DE/"), phone: e.phone, child: loc(d), aliases: aliases(d, "HARRIS CORPORATION", "HARRIS CORPORATION (6860)") }; },
  X9: async (r) => ({ stateOfIncorporation: (await r.edgar("0001336920")).stateOfIncorporation }),
  X10: async (r) => ({ caci: (await r.edgar("0000016058")).formerNames.some((f: J) => f.name === "CACI INTERNATIONAL INC /DE/"), lockheed: (await r.edgar("0000936468")).formerNames.some((f: J) => f.name === "LOCKHEED MARTIN CORP") }),
  X11: async (r) => ({ inLeidosList: (await r.children("ZL41ERXMPAR3")).some((c) => c.uei === "MMLKPW9JLX64"), inSaicList: (await r.children("RE7WMNV9L719")).some((c) => c.uei === "MMLKPW9JLX64"), selfParented: (await r.detail("MMLKPW9JLX64", "P")).parent_uei === "MMLKPW9JLX64" }),
  X12: async (r) => { const s = await r.search("Booz Allen Hamilton Inc"); const sun = await r.detail("EJKTQ884VTM3", "P"); const inSearch = (s.results ?? []).some((x: J) => x.uei === "EJKTQ884VTM3"); const ann = (await r.children("MBPHTU7Y9S65")).filter((c) => c.uei === "VWE7ANVJJ948").map((c) => c.state_province); return { sunnyvale: [sun.recipient_level, sun.parent_uei, ...loc(sun).slice(0, 4), sun.total_transaction_amount === 0], inSearch, annapolisChildState: ann, parentAlias: ((await r.detail("MBPHTU7Y9S65", "P")).alternate_names ?? []).includes("BOOZ ALLEN HAMILTON INC") }; },
  X13: async (r) => { const a = await r.detail("FFCMDLMXRK49", "P"); const b = await r.detail("QF9PHLXT2886", "P"); const e = await r.edgar("0000275880"); return { a: [a.name, ...loc(a)], b: [b.name, ...loc(b)], bAlias: aliases(b, "MICHAEL BAKER INTERNATIONAL  INC"), edgar: biz(e), former: former(e, "PARSON CORP") }; },
  X14: async (r) => { const d = await r.detail("KZA5CX3J8KE8", "P"); const e = await r.edgar("0000892537"); const t = Object.values(await r.tickers()) as J[]; return { location: loc(d), aliases: aliases(d, "CARLYLE HOLDING CORP", "STANDARDAERO", "STANDARD AERO LIMITED"), tickers: e.tickers, inTickerFile: t.some((x) => x.cik_str === 892537) }; },
  X15: async (r) => { const e = await r.edgar("0001032220"); const d = await r.detail("RBGHRKKXVQ83", "P"); const c = await r.detail("TREKW6J3QSF5"); return { street: [e.addresses?.business?.street1, e.addresses?.business?.street2], parent: loc(d), childUnit: c.location?.address_line2 ?? c.location?.address_line1, childParents: parentsOf(c) }; },
  X16: async (r) => aliases(await r.detail("ZL41ERXMPAR3", "P"), "LEIDOS SECURITY DETECTION & AUTOMATION  INC.", "L3 SECURITY & DETECTION SYSTEMS  INC.").concat(aliases(await r.detail("SJULQDJ8NZU7", "P"), "LEIDOS SECURITY DETECTION & AUTOMATION  INC.", "L3 SECURITY & DETECTION SYSTEMS  INC.")),
  X17: async (r) => { const d = await r.detail("EELEC8QCC3N8"); return { parent_uei: d.parent_uei, parents: parentsOf(d), listed: (await r.children("QSRTXLFKV857")).some((c) => c.uei === "EELEC8QCC3N8"), listSize: (await r.children("QSRTXLFKV857")).length }; },
  X18: async (r) => { const d = await r.detail("SMNWM6HN79X5"); return { parents: parentsOf(d), names: (d.parents ?? []).map((p: J) => [p.parent_uei, p.parent_name]).sort() }; },
};

export async function runXFacts(http: RegistryHttp): Promise<XResult[]> {
  const reg = new Reg(http);
  const expected: Record<string, unknown> = existsSync(EXPECTED_FILE) ? (JSON.parse(readFileSync(EXPECTED_FILE, "utf8")) as Record<string, unknown>) : {};
  const out: XResult[] = [];
  const actualAll: Record<string, unknown> = {};
  for (const [id, pred] of Object.entries(PREDICATES)) {
    let actual: unknown;
    try { actual = await pred(reg); } catch (e) { actual = { error: e instanceof Error ? e.message : "predicate failed" }; }
    actualAll[id] = actual;
    out.push({ id, ok: JSON.stringify(actual) === JSON.stringify(expected[id]), expected: expected[id], actual });
  }
  if (process.env.XFACTS_RECORD === "1") { writeFileSync(EXPECTED_FILE, `${JSON.stringify(actualAll, null, 1)}\n`); return out.map((r) => ({ ...r, ok: true })); }
  return out;
}
