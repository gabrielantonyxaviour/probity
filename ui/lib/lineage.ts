// D4 evidence lineage: source system -> USL table -> Zetaris query -> rows. Derived from the stored query's own SQL
// and rows (live data). When the API sends the additive `lineage` field (contract in lanes/ui-depth.md), it wins.
import { z } from "zod";
import { QueryDetail } from "@/lib/contracts";

export const USL_PREFIX = "lightning.metastore.probity.vendor360.";

export const SourceSystem = z.enum(["usaspending", "sec_edgar", "erp_postgres", "letter"]);
export type SourceSystem = z.infer<typeof SourceSystem>;

/** Additive QueryDetail field (optional; older API builds omit it). */
export const LineageField = z.object({
  sources: z.array(
    z.object({
      usl_table: z.string(),
      source_system: SourceSystem,
      source_object: z.string().nullable(),
    }),
  ),
});
export const QueryDetailUI = QueryDetail.extend({ lineage: LineageField.optional() });
export type QueryDetailUI = z.infer<typeof QueryDetailUI>;

export const SYSTEM_LABEL: Record<SourceSystem, string> = {
  usaspending: "USAspending",
  sec_edgar: "SEC EDGAR",
  erp_postgres: "ERP Postgres",
  letter: "The request",
};
export const SYSTEM_DETAIL: Record<SourceSystem, string> = {
  usaspending: "api.usaspending.gov, registered in Zetaris as a REST source",
  sec_edgar: "data.sec.gov submissions, registered in Zetaris as a REST source",
  erp_postgres: "payee-erp Postgres, registered in Zetaris as a JDBC source",
  letter: "The change request and its letter",
};

const ERP = new Set(["vendor", "vendor_contact", "vendor_bank_account", "vendor_contact_log", "ap_invoice", "bank_change_request", "payment_run_item"]);

export function systemOf(table: string): SourceSystem | null {
  const t = table.toLowerCase();
  if (t.startsWith("session.pp_usa_") || t.includes("usaspending")) return "usaspending";
  if (t.includes("sec_") || t.includes("edgar")) return "sec_edgar";
  const short = t.startsWith(USL_PREFIX) ? t.slice(USL_PREFIX.length) : null;
  if (!short) return null;
  if (short.startsWith("registry_")) return "usaspending";
  if (short.startsWith("sec_")) return "sec_edgar";
  if (ERP.has(short)) return "erp_postgres";
  return null;
}

export type LineageSource = { usl_table: string; source_system: SourceSystem; source_object: string | null };

/** Tables named in FROM / JOIN clauses, in order of first appearance. */
export function tablesIn(sql: string): string[] {
  const out: string[] = [];
  for (const m of sql.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_][\w.]*)/gi)) {
    const t = m[1]!;
    if (t.includes(".") && !out.includes(t)) out.push(t);
  }
  return out;
}

export function lineageOf(d: QueryDetailUI): LineageSource[] {
  if (d.lineage?.sources.length) return d.lineage.sources;
  return tablesIn(d.sql).flatMap((t) => {
    const s = systemOf(t);
    return s ? [{ usl_table: t, source_system: s, source_object: t.startsWith("session.") ? t.slice("session.".length) : null }] : [];
  });
}

const OBS_SYSTEM: Record<string, SourceSystem> = { usaspending: "usaspending", edgar: "sec_edgar", vendor_master: "erp_postgres", request: "letter" };
export const obsSystem = (source: string | undefined): SourceSystem | null => (source ? OBS_SYSTEM[source] ?? null : null);

/** Rows that carry the observation's row key (exact cell match), so the drawer can mark the rows this fact used. */
export function matchedRows(rows: Array<Record<string, unknown>>, rowKey: string | undefined): number[] {
  if (!rowKey) return [];
  const k = rowKey.trim().toLowerCase();
  const strip = (v: string) => v.replace(/-[CP]$/i, "");
  return rows.flatMap((r, i) =>
    Object.values(r).some((v) => v != null && (String(v).trim().toLowerCase() === k || strip(String(v).trim().toLowerCase()) === strip(k))) ? [i] : [],
  );
}
