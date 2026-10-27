// Shared bits for the template-row mappers: tolerant row accessors and the per-call context.
import type { Prov, TemplateRows } from "../schemas/engines";
import { displayPhone, isTestRange, type Addr } from "./wm-norm";
import type { Writer } from "./wm-writer";

export type Row = Record<string, unknown>;
/** Additive: the executor may pass the template params (T02/T07/T10 rows do not carry the key they were queried by). */
export type TemplateRowsX = TemplateRows & { params?: Record<string, unknown> };

export type CurrentRequest = {
  request_id: string;
  received_at: string;
  account_hash: string | null;
  claimed: Array<{ id: string; norm: string }>;
};

export type IngestCtx = {
  w: Writer;
  runId: string;
  batch: TemplateRowsX;
  prov: Prov;
  req: CurrentRequest | null;
  notes: string[];
};

function dig(row: Row, path: string): unknown {
  if (path in row) return row[path];
  let cur: unknown = row;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Row)[part];
  }
  return cur;
}

/** First non-empty value among the candidate column names (flat name, dotted path or nested object). */
export function g(row: Row, ...names: string[]): unknown {
  for (const n of names) {
    const v = dig(row, n);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}
export function s(row: Row, ...names: string[]): string | null {
  const v = g(row, ...names);
  return v === null ? null : String(v).trim() || null;
}
/** An array column that may arrive as a real array or as a JSON string (`alternate_names_json`). */
export function arr(row: Row, ...names: string[]): unknown[] {
  const v = g(row, ...names);
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

export const levelWord = (l: string | null): string =>
  l === "P" ? "Parent" : l === "C" ? "Subsidiary" : l === "R" ? "Recipient" : "Entity";

export async function phoneNode(w: Writer, e164: string, prov: Prov): Promise<string> {
  const display = displayPhone(e164);
  return w.entity("phone", "e164", e164, { e164, display, is_test_range: isTestRange(e164) }, display, prov);
}

export async function legalEntity(
  c: IngestCtx,
  uei: string,
  level: string,
  extra: Record<string, unknown>,
  name?: string,
): Promise<string> {
  return c.w.entity(
    "legal_entity",
    "uei",
    `${uei}-${level}`,
    { uei, recipient_level: level, ...extra, data_origin: "REAL" },
    name,
    c.prov,
  );
}
export async function addressNode(c: IngestCtx, a: Addr): Promise<string> {
  return c.w.entity(
    "address",
    "addr",
    a.key,
    { line1: a.line1, unit: a.unit, city: a.city, state: a.state, zip: a.zip, display: a.display },
    a.display,
    c.prov,
    { ifAbsent: true },
  );
}
export const first = (c: IngestCtx) => c.batch.fetched_at;
