// Evidence lineage for GET /runs/:id/queries/:qid (lanes/ui-depth.md item 1). Source system -> USL table -> Zetaris query.
// Built from the query's own SQL (the tables it names), the P6 activation map (which registered object each vendor360
// table is projected from) and zetaris/.state/registration.json (which registry path the setup used). No row data is
// invented: the USAspending `source_table` column on the returned rows, when present, names the exact registered objects.
import { existsSync, readFileSync } from "node:fs";
import { QueryLineage } from "../schemas/api-routes";

type Source = QueryLineage["sources"][number];
type Sys = Source["source_system"];
type Row = Record<string, unknown>;

export const USL_PREFIX = "lightning.metastore.probity.vendor360.";
export const REGISTRATION_FILE = "zetaris/.state/registration.json";

type Path = { registry_path: "direct" | "gateway"; erp_table_ref: string };

/** Registration facts that change what a table is read from. Missing or unreadable file: the documented defaults. */
export function readRegistration(file = REGISTRATION_FILE): Path {
  const dflt: Path = { registry_path: "direct", erp_table_ref: "payee_erp" };
  try {
    if (!existsSync(file)) return dflt;
    const j = JSON.parse(readFileSync(file, "utf8")) as Partial<Path>;
    return {
      registry_path: j.registry_path === "gateway" ? "gateway" : "direct",
      erp_table_ref:
        typeof j.erp_table_ref === "string" && /^[\w]+$/.test(j.erp_table_ref) ? j.erp_table_ref : dflt.erp_table_ref,
    };
  } catch {
    return dflt;
  }
}

/** vendor360 table -> [system, flatten view it is activated from (null for a direct ERP projection), ERP tables it reads]. */
const USL: Record<string, { system: Sys; view: string | null; erp?: string[] }> = {
  registry_entity: { system: "usaspending", view: "probity.usa_entity_v" },
  registry_child: { system: "usaspending", view: "probity.usa_child_v" },
  registry_parent: { system: "usaspending", view: "probity.usa_parent_v" },
  registry_alias: { system: "usaspending", view: "probity.usa_alias_v + probity.sec_former_v" },
  sec_registrant: { system: "sec_edgar", view: "probity.sec_registrant_v" },
  vendor: { system: "erp_postgres", view: null, erp: ["vendor", "vendor_domain"] },
  vendor_contact: { system: "erp_postgres", view: null, erp: ["vendor_contact"] },
  vendor_bank_account: { system: "erp_postgres", view: null, erp: ["vendor_bank_account"] },
  vendor_contact_log: { system: "erp_postgres", view: null, erp: ["vendor_contact_log"] },
  ap_invoice: { system: "erp_postgres", view: null, erp: ["ap_invoice"] },
  bank_change_request: { system: "erp_postgres", view: null, erp: ["bank_change_request"] },
  payment_run_item: {
    system: "erp_postgres",
    view: null,
    erp: [
      "payment_run_item",
      "payment_run",
      "vendor",
      "vendor_bank_account",
      "vendor_contact_log",
      "bank_change_request",
    ],
  },
};

/** Tables the SQL reads: FROM, JOIN and `RUN DQ ... TABLE` targets, string literals ignored, first appearance order. */
export function tablesIn(sql: string): string[] {
  const bare = sql.replace(/'(?:[^']|'')*'/g, "''");
  const out: string[] = [];
  for (const m of bare.matchAll(/\b(?:FROM|JOIN|TABLE)\s+([A-Za-z_][\w.]*)/gi)) {
    const t = m[1]!;
    if (t.includes(".") && !out.includes(t)) out.push(t);
  }
  return out;
}

const distinct = (xs: string[]) => [...new Set(xs)];

/** Registered objects named by the rows' own `source_table` column (the registry views stamp it on every row). */
function rowObjects(rows: Row[]): string[] {
  return distinct(
    rows.map((r) => r.source_table).filter((v): v is string => typeof v === "string" && /^[\w.]+$/.test(v)),
  ).slice(0, 4);
}

function uslSource(short: string, p: Path, rows: Row[]): Source | null {
  const u = USL[short];
  if (!u) return null;
  const table = `${USL_PREFIX}${short}`;
  if (u.system === "erp_postgres") {
    const [first, ...rest] = u.erp!;
    const obj = `${p.erp_table_ref}.public.${first}${rest.length ? ` (with ${rest.join(", ")})` : ""}`;
    return { usl_table: table, source_system: u.system, source_object: obj, via_view: null };
  }
  const named = rowObjects(rows);
  const wildcard =
    u.system === "sec_edgar"
      ? "sec_edgar.sec_s_*"
      : p.registry_path === "gateway"
        ? "source_gateway.usa_*"
        : "usaspending.usa_*";
  const obj = named.length ? named.join(", ") : wildcard;
  return { usl_table: table, source_system: u.system, source_object: obj, via_view: u.view };
}

/** Run-time REST session tables (T12 to T14): registered by Probity during the run, never part of the vendor360 layer. */
function sessionSource(table: string, p: Path): Source | null {
  const name = table.replace(/^session\./i, "").toLowerCase();
  if (/^pp_usa_[rc]_/.test(name)) {
    const host = p.registry_path === "gateway" ? "source_gateway" : "api.usaspending.gov";
    const ep = name.startsWith("pp_usa_c_") ? "recipient/children/{parent_uei}" : "recipient/{recipient_id}";
    return {
      usl_table: table,
      source_system: "usaspending",
      source_object: `${host}/api/v2/${ep} (REST session table ${name})`,
      via_view: null,
    };
  }
  const sec = /^pp_sec_s_(\d{10})/.exec(name);
  if (sec)
    return {
      usl_table: table,
      source_system: "sec_edgar",
      source_object: `data.sec.gov/submissions/CIK${sec[1]}.json (REST session table ${name})`,
      via_view: null,
    };
  return null;
}

/** The additive `lineage` field, or undefined when the SQL names no table Probity can place. */
export function lineageFor(sql: string, rows: Row[], reg: Path = readRegistration()): QueryLineage | undefined {
  const sources: Source[] = [];
  for (const t of tablesIn(sql)) {
    const lower = t.toLowerCase();
    const s = lower.startsWith(USL_PREFIX)
      ? uslSource(lower.slice(USL_PREFIX.length), reg, rows)
      : lower.startsWith("session.")
        ? sessionSource(t, reg)
        : null;
    if (s) sources.push(s);
  }
  return sources.length ? { sources } : undefined;
}
