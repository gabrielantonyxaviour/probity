// Formatting rules of 01 section 11.6. Everything is UTC and locale-independent so the recorded demo is stable.
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const p2 = (n: number) => String(n).padStart(2, "0");

function toDate(iso: string): Date | null {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Fri 30 Oct 2026" */
export function runDate(iso: string | null | undefined): string {
  const d = iso ? toDate(iso) : null;
  if (!d) return iso ?? "";
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** "30 Oct 2026" */
export function dayDate(iso: string | null | undefined): string {
  const d = iso ? toDate(iso) : null;
  if (!d) return iso ?? "";
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** "22 Oct 2026, 15:12 UTC" */
export function stamp(iso: string | null | undefined): string {
  const d = iso ? toDate(iso) : null;
  if (!d) return iso ?? "";
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} UTC`;
}
/** "15:12:04 UTC" */
export function clock(iso: string | null | undefined): string {
  const d = iso ? toDate(iso) : null;
  if (!d) return iso ?? "";
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} UTC`;
}
/** Value for <input type="datetime-local"> in UTC. */
export function localInput(d: Date): string {
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "$1,284,550.00". Callers pass payload fields; the UI never sums money (UI law 1). */
export function money(n: number): string {
  return USD.format(n);
}
const INT = new Intl.NumberFormat("en-US");
export function int(n: number): string {
  return INT.format(n);
}
export function latency(ms: number | null | undefined): string {
  if (ms == null) return "";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
export function tokens(inTok: number | null | undefined, outTok: number | null | undefined): string {
  if (inTok == null && outTok == null) return "tokens not reported";
  return `${int(inTok ?? 0)}/${int(outTok ?? 0)} tok`;
}
export function plural(n: number, one: string, many?: string): string {
  return `${int(n)} ${n === 1 ? one : (many ?? `${one}s`)}`;
}
export function hash8(h: string | null | undefined): string {
  return h ? h.slice(0, 8) : "";
}
/** Offset from run start: "+00:41.2" */
export function offset(ms: number): string {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = (t % 60000) / 1000;
  return `+${p2(m)}:${s.toFixed(1).padStart(4, "0")}`;
}
export function mmss(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds));
  return `${p2(Math.floor(t / 60))}:${p2(t % 60)}`;
}
export function account(last4: string | null | undefined): string {
  return last4 ? `•••• ${last4}` : "";
}
export function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
/** Round to whole seconds for the "Checked in {n} s" footer. */
export function seconds(n: number): number {
  return Math.round(n);
}
export function titleCaseKey(k: string): string {
  return k.replace(/_/g, " ");
}
