// Deterministic formatters (no locale, no time zone), so server and client render identical text.
export function usd(amount: number): string {
  const sign = amount < 0 ? "− " : "";
  const [whole, frac] = Math.abs(amount).toFixed(2).split(".");
  return `${sign}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}

/** 2026-10-27T14:32:09Z style input to "2026-10-27 14:32 UTC". Unparseable input is returned unchanged. */
export function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
