// Template surface (03 §7.2). Template and ObservationRule are not in the frozen schemas.
// TODO(schemas): export Template, ObservationRule, and SampleStore from app/schemas.
import type { FactField, SourceKind } from "../schemas/decision.ts";
import type { TemplateId } from "../schemas/templates.ts";

export type Row = Record<string, unknown>;
export type FieldCode = "ln" | "ra" | "ba" | "sd" | "cp" | "pa" | "rg" | "ir";

export type ObservationRule = {
  field: FactField;
  fieldcode: FieldCode;
  source: SourceKind;
  when?: (row: Row) => boolean;
  value: (row: Row) => string | null;
  row_key: (row: Row) => string;
};

export type SampleStore = Record<string, Row[]>;

export type Template<P> = {
  id: TemplateId;
  tier: 1 | 2 | "sweep";
  key: "query" | "admin" | "none";
  usl: boolean;
  params: { parse: (input: unknown) => P };
  columns: string[];
  maxRows: number;
  llm_columns: string[];
  expectRows: boolean;
  observations: ObservationRule[];
  sql: (p: P) => string;
  sample?: (p: P, store: SampleStore) => Row[];
};

export function cell(row: Row, key: string): string | null {
  const value = row[key];
  if (value == null || value === "") return null;
  return String(value);
}

export function joined(row: Row, keys: string[]): string | null {
  const parts = keys.map((key) => cell(row, key)).filter((part): part is string => part != null);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function obs(
  field: FactField,
  fieldcode: FieldCode,
  source: SourceKind,
  rowKey: string,
  value: (row: Row) => string | null,
  when?: (row: Row) => boolean,
): ObservationRule {
  return { field, fieldcode, source, row_key: (row) => cell(row, rowKey) ?? "", value, when };
}
