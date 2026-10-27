// The seam between the evidence runner and the Zetaris lane's template module (03 §7.2). The runner never writes SQL:
// it hands validated params to `compile` (the only place that can construct a CompiledQuery) and reads the
// observation rules and projections from `info`. The integrator implements this over `templates` + `compile.ts`.
import type { Mode, Observation } from "../schemas/decision";
import type { CompiledQuery } from "../schemas/ports";
import type { TemplateId, TemplateParams } from "../schemas/templates";

export type ObservationRule = {
  field: Observation["field"];
  fieldcode: "ln" | "ra" | "ba" | "sd" | "cp" | "pa" | "rg" | "ir";
  source: Observation["source"];
  when?: (row: Record<string, unknown>) => boolean;
  value: (row: Record<string, unknown>) => string | null;
  row_key: (row: Record<string, unknown>) => string;
};

export type TemplateInfo = {
  tier: 1 | 2 | "sweep";
  key: "query" | "admin" | "none";
  llm_columns: string[];
  max_rows: number;
  /** false: an empty result is a finding, not an error. */
  expect_rows: boolean;
  observations: ObservationRule[];
};

export type CompileContext = {
  /** Registrar-confirmed session tables of this run (T11 branches, T10 session form), at most 4. */
  session_tables: string[];
  /** T10 narrower retry: add the claimed state filter. */
  narrower?: boolean;
};

export interface TemplateKit {
  compile(params: TemplateParams, ctx: CompileContext): CompiledQuery;
  info(id: TemplateId): TemplateInfo;
  /** K1d2 fallback (03 §9): T11 as separate reads (the USL branch, one per run-registered recipient table, then a vendor lookup by UEI). */
  t11Split?(p: { parent_uei: string; addr_key: string }, sessionTables: string[]): { reads: CompiledQuery[]; vendorByUei: (ueis: string[]) => CompiledQuery };
  /** J5: a compiled single-row SELECT over a registered session recipient table (name, parent, location). */
  readRecipient?(table: string): CompiledQuery;
  /** J5: a compiled single-row SELECT over a registered session EDGAR table (cik, name, phone, business address). */
  readRegistrant?(table: string): CompiledQuery;
}

export type RowModeNote = { mode: Mode; note?: string };

/** Observation rules for the J5 session-table reads (same field codes and sources as the T05/T05b map, 03 §7.6). */
export const RECIPIENT_RULES: ObservationRule[] = [
  { field: "legal_name", fieldcode: "ln", source: "usaspending", value: (r) => str(r.name), row_key: (r) => str(r.uei) ?? "" },
  { field: "parent", fieldcode: "pa", source: "usaspending", value: (r) => (str(r.parent_uei) ? `${str(r.parent_uei)} ${str(r.parent_name) ?? ""}`.trim() : null), row_key: (r) => str(r.uei) ?? "", when: (r) => !!str(r.parent_uei) },
  { field: "remit_address", fieldcode: "ra", source: "usaspending", value: (r) => [r.address_line1, r.city_name, r.state_code, r.zip].map(str).filter(Boolean).join(", ") || null, row_key: (r) => str(r.uei) ?? "", when: (r) => !!str(r.address_line1) },
];
export const REGISTRANT_RULES: ObservationRule[] = [
  { field: "registrant", fieldcode: "rg", source: "edgar", value: (r) => `${str(r.cik) ?? ""} ${str(r.name) ?? ""}`.trim(), row_key: (r) => str(r.cik) ?? "" },
  { field: "callback_phone", fieldcode: "cp", source: "edgar", value: (r) => str(r.phone), row_key: (r) => str(r.cik) ?? "", when: (r) => !!str(r.phone) },
  { field: "legal_name", fieldcode: "ln", source: "edgar", value: (r) => str(r.name), row_key: (r) => str(r.cik) ?? "" },
];
const str = (v: unknown): string | null => (v === null || v === undefined || String(v).trim() === "" || String(v) === "null" ? null : String(v).trim());
