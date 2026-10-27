// The offline data behind SAMPLE_MODE (06 section 6.5). Loads and validates every capture at first use and fails closed with
// `sample_data_missing` when a file is absent, corrupt or does not match its recorded sha256. Registry captures are real
// USAspending and SEC EDGAR responses; the ERP tables are the synthetic seed (same bytes as db/seed). Nothing here invents rows.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AppError } from "../../schemas/errors";

export type Row = Record<string, unknown>;
const lax = z.looseObject;
const Loc = lax({ address_line1: z.string().nullable().optional(), address_line2: z.string().nullable().optional(), city_name: z.string().nullable().optional(), state_code: z.string().nullable().optional(), zip: z.string().nullable().optional(), country_code: z.string().nullable().optional() });
const RecipientJson = lax({ name: z.string(), uei: z.string(), recipient_id: z.string(), recipient_level: z.enum(["P", "C", "R"]), alternate_names: z.array(z.string()).nullable().optional(), parent_uei: z.string().nullable().optional(), parent_name: z.string().nullable().optional(), location: Loc.nullable().optional(), total_transaction_amount: z.number().nullable().optional() });
const ChildJson = lax({ recipient_id: z.string(), name: z.string(), uei: z.string().nullable(), amount: z.number().nullable(), state_province: z.string().nullable() });
const Addr = lax({ street1: z.string().nullable().optional(), street2: z.string().nullable().optional(), city: z.string().nullable().optional(), stateOrCountry: z.string().nullable().optional(), zipCode: z.string().nullable().optional() });
const EdgarJson = lax({ cik: z.string(), name: z.string(), tickers: z.array(z.string()).optional(), ein: z.string().nullable().optional(), sic: z.string().nullable().optional(), sicDescription: z.string().nullable().optional(), stateOfIncorporation: z.string().nullable().optional(), phone: z.string().nullable().optional(), addresses: lax({ business: Addr.nullable().optional(), mailing: Addr.nullable().optional() }).optional(), formerNames: z.array(lax({ name: z.string(), from: z.string().nullable().optional(), to: z.string().nullable().optional() })).optional() });
const SearchJson = lax({ keyword: z.string(), results: z.array(lax({ id: z.string(), uei: z.string().nullable(), name: z.string(), recipient_level: z.string().nullable().optional(), amount: z.number().nullable().optional() })) });
const TickersJson = z.record(z.string(), lax({ cik_str: z.number(), ticker: z.string(), title: z.string() }));
const CapturesJson = lax({ captured_at: z.string(), items: z.array(lax({ file: z.string(), sha256: z.string(), bytes: z.number() })) });

export type Recipient = z.infer<typeof RecipientJson>;
export type Child = z.infer<typeof ChildJson>;
export type Edgar = z.infer<typeof EdgarJson>;
export type SearchFile = z.infer<typeof SearchJson>;

export type ErpTables = {
  vendor: Row[]; vendor_domain: Row[]; vendor_contact: Row[]; vendor_bank_account: Row[]; vendor_contact_log: Row[];
  ap_invoice: Row[]; bank_change_request: Row[]; payment_run: Row[]; payment_run_item: Row[];
};
export type SampleData = {
  dir: string;
  captured_at: string;
  erp: ErpTables;
  recipients: Map<string, Recipient>; // key `${uei}-${level}`
  children: Map<string, Child[]>; // key parent UEI
  registrants: Map<string, Edgar>; // key cik10
  tickers: { cik: string; ticker: string; title: string }[];
  searches: Map<string, SearchFile>; // key capture file stem
  /** Records registered at setup in the live USL; the rest are reachable only through a registered session table. */
  covered: { ueis: Set<string>; ciks: Set<string> } | null;
};

const missing = (what: string): AppError => new AppError("sample_data_missing", `Sample data is missing or corrupt: ${what}.`);

function readJson<T>(file: string, schema: z.ZodType<T>, what: string): T {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw missing(what);
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw missing(what);
  return r.data;
}

const stem = (f: string): string => path.basename(f).replace(/\.json$/, "");

function coveredSet(dir: string): SampleData["covered"] {
  const f = path.resolve(dir, "..", "covered_vendors.json");
  if (!existsSync(f)) return null;
  try {
    const j = JSON.parse(readFileSync(f, "utf8")) as { families?: { details?: { uei?: string }[]; registrant_cik?: string }[] };
    const ueis = new Set<string>();
    const ciks = new Set<string>();
    for (const fam of j.families ?? []) {
      for (const d of fam.details ?? []) if (d.uei) ueis.add(d.uei);
      if (fam.registrant_cik) ciks.add(fam.registrant_cik);
    }
    return ueis.size ? { ueis, ciks } : null;
  } catch {
    return null;
  }
}

function load(dir: string): SampleData {
  const captures = readJson(path.join(dir, "captures.json"), CapturesJson, "captures.json");
  const recipients = new Map<string, Recipient>();
  const children = new Map<string, Child[]>();
  const registrants = new Map<string, Edgar>();
  const searches = new Map<string, SearchFile>();
  let tickers: SampleData["tickers"] = [];
  for (const it of captures.items) {
    const file = path.join(dir, it.file);
    let bytes: Buffer;
    try {
      bytes = readFileSync(file);
    } catch {
      throw missing(it.file);
    }
    if (bytes.length !== it.bytes || createHash("sha256").update(bytes).digest("hex") !== it.sha256) throw missing(`${it.file} does not match its recorded checksum`);
    if (it.file.startsWith("registry/usaspending/recipient/")) {
      const r = readJson(file, RecipientJson, it.file);
      recipients.set(`${r.uei}-${r.recipient_level}`, r);
    } else if (it.file.startsWith("registry/usaspending/children/")) children.set(stem(it.file), readJson(file, z.array(ChildJson), it.file));
    else if (it.file.startsWith("registry/edgar/submissions/")) {
      const e = readJson(file, EdgarJson, it.file);
      registrants.set(e.cik.padStart(10, "0"), e);
    } else if (it.file.startsWith("registry/usaspending/search/")) searches.set(stem(it.file), readJson(file, SearchJson, it.file));
    else if (it.file === "registry/edgar/company_tickers.json")
      tickers = Object.values(readJson(file, TickersJson, it.file)).map((t) => ({ cik: String(t.cik_str).padStart(10, "0"), ticker: t.ticker, title: t.title }));
  }
  const tbl = (t: string): Row[] => readJson(path.join(dir, "erp", `${t}.json`), z.array(z.record(z.string(), z.unknown())), `erp/${t}.json`);
  const erp: ErpTables = {
    vendor: tbl("vendor"), vendor_domain: tbl("vendor_domain"), vendor_contact: tbl("vendor_contact"), vendor_bank_account: tbl("vendor_bank_account"),
    vendor_contact_log: tbl("vendor_contact_log"), ap_invoice: tbl("ap_invoice"), bank_change_request: tbl("bank_change_request"), payment_run: tbl("payment_run"), payment_run_item: tbl("payment_run_item"),
  };
  return { dir, captured_at: captures.captured_at, erp, recipients, children, registrants, tickers, searches, covered: coveredSet(dir) };
}

const cache = new Map<string, { mtime: number; data: SampleData }>();

/** Loads once per directory (reloads when captures.json changes); throws `sample_data_missing` on any problem. */
export function loadSampleData(dir: string): SampleData {
  const abs = path.resolve(dir);
  let mtime: number;
  try {
    mtime = statSync(path.join(abs, "captures.json")).mtimeMs;
  } catch {
    throw missing("captures.json");
  }
  const hit = cache.get(abs);
  if (hit && hit.mtime === mtime) return hit.data;
  const data = load(abs);
  cache.set(abs, { mtime, data });
  return data;
}

export const resetSampleData = (): void => cache.clear();
