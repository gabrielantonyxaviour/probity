// Positional rows, declared columns, row_hash (03 §1.2). Values are hashed as received.
import { createHash } from "node:crypto";
import { ZetarisError } from "./errors";

export function rowHash(columns: readonly string[] | null, rows: readonly unknown[][]): string {
  const objs = rows.map((row) => {
    const raw: Record<string, unknown> = {};
    row.forEach((value, i) => {
      raw[columns?.[i] ?? `c${i}`] = value;
    });
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(raw).sort()) sorted[key] = raw[key];
    return sorted;
  });
  return createHash("sha256").update(JSON.stringify(objs)).digest("hex").slice(0, 16);
}

export function sqlHash(sql: string): string {
  return createHash("sha256").update(sql).digest("hex").slice(0, 16);
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((v) => String(v));
}

/** Column metadata. Live REST uses `headers` (verified 2026-10-27); the spec names the others. */
export function columnMeta(body: Record<string, unknown>): string[] | null {
  return (
    stringList(body.headers) ??
    stringList(body.columns) ??
    stringList(body.columnNames) ??
    stringList(body.metadata) ??
    stringList(body.schema)
  );
}

export function parseResult(
  body: unknown,
  expectColumns?: readonly string[],
): { rows: unknown[][]; columns: string[] | null; rawKeys: string[] } {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rawKeys = Object.keys(record);
  const data = record.data;
  const rows = data == null ? [] : Array.isArray(data) ? (data as unknown[][]) : [];
  if (data != null && !Array.isArray(data)) {
    throw new ZetarisError("zetaris_shape_mismatch", "response data is not an array", 200, false);
  }
  const columns = columnMeta(record);
  if (expectColumns && columns) {
    const same =
      columns.length === expectColumns.length &&
      columns.every((c, i) => c.toLowerCase() === expectColumns[i]!.toLowerCase());
    if (!same) {
      throw new ZetarisError(
        "zetaris_shape_mismatch",
        `columns ${columns.join(",")} != ${expectColumns.join(",")}`,
        200,
        false,
      );
    }
  }
  return { rows, columns, rawKeys };
}

export function rowsAsObjects(columns: readonly string[] | null, rows: readonly unknown[][]): Record<string, unknown>[] {
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    row.forEach((value, i) => {
      obj[columns?.[i] ?? `c${i}`] = value;
    });
    return obj;
  });
}
