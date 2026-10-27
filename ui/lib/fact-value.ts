// Display wording for fact-sheet source values. The API sends ERP rows as compact strings ("vendor_bank_account, V-10812,
// active, 2026-10-18 13:02:00"); an AP reader should not see table names or SQL timestamps. Pure re-wording of the same
// values: unknown shapes pass through unchanged, and the raw value stays available as the cell's title.
import { dayDate } from "./format";

const day = (s: string) => dayDate(s.slice(0, 10));
const ACCOUNT = /^vendor_bank_account, (V-\d+), (\w+), (\d{4}-\d{2}-\d{2})/;
const BCR = /^bank_change_request, (V-\d+), (\w+), (\d{4}-\d{2}-\d{2})/;
const PHONE_WINDOW = /^(.+?) \((\d{4}-\d{2}-\d{2})[^→]*→ (null|\d{4}-\d{2}-\d{2})[^)]*\)$/;

const BARE_PHONE = /^(?:\+?1)?([2-9]\d{2})-?([2-9]\d{2})-?(\d{4})$/;
/** "3217279100" and "321-727-9100" read as "(321) 727-9100"; anything else is unchanged. */
const phone = (s: string) => {
  const m = BARE_PHONE.exec(s.trim());
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : s;
};

export function factValue(value: string | null | undefined): string {
  if (!value) return "—";
  const p = phone(value);
  if (p !== value) return p;
  let m = ACCOUNT.exec(value);
  if (m) return `On ${m[1]}, ${m[2]} since ${day(m[3])}`;
  m = BCR.exec(value);
  if (m) return `Change request for ${m[1]}, ${m[2]}, ${day(m[3])}`;
  m = PHONE_WINDOW.exec(value);
  if (m) return m[3] === "null" ? `${phone(m[1])}, on file since ${day(m[2])}` : `${phone(m[1])}, on file ${day(m[2])} to ${day(m[3])}`;
  return value;
}
