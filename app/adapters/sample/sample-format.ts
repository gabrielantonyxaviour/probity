// Value formats the live Zetaris answers in (checked against logs/queries-*.jsonl of the 27 Oct live runs): decimals and ints as
// strings, TIMESTAMP casts as "YYYY-MM-DD HH:MM:SS", raw timestamp columns of SHOW DQ as "... .0", DATE as "YYYY-MM-DD".
export const text = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** ISO instant -> "2026-10-22 15:12:00" (the CAST(ts AS STRING) form). */
export function tsText(iso: unknown): string | null {
  const s = text(iso);
  if (!s) return null;
  return s.replace("T", " ").replace(/Z$/, "").replace(/\.0+$/, "");
}
/** The raw timestamp form SHOW DQ INVALID RECORD returns. */
export const tsRaw = (iso: unknown): string | null => {
  const t = tsText(iso);
  return t === null ? null : /\.\d+$/.test(t) ? t : `${t}.0`;
};
export const dateText = (v: unknown): string | null => text(v)?.slice(0, 10) ?? null;
export const dec2 = (n: unknown): string | null => (n === null || n === undefined || n === "" ? null : Number(n).toFixed(2));
export const cents = (n: unknown): number => Math.round(Number(n) * 100);
export const fromCents = (c: number): string => (c / 100).toFixed(2);

const DAY = 86_400_000;
/** datediff(CAST(a AS DATE), CAST(b AS DATE)) in whole days. */
export function dateDiffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / DAY);
}

/** ABA routing checksum (DQ3). */
export function abaValid(routing: unknown): boolean {
  const r = text(routing);
  if (r === null) return true;
  if (!/^[0-9]{9}$/.test(r)) return false;
  const d = [...r].map(Number);
  return (3 * (d[0]! + d[3]! + d[6]!) + 7 * (d[1]! + d[4]! + d[7]!) + (d[2]! + d[5]! + d[8]!)) % 10 === 0;
}

/** Project a full row onto the declared columns (the order the template declares). */
export function project(row: Record<string, unknown>, columns: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(columns.map((c) => [c, row[c] ?? null]));
}
