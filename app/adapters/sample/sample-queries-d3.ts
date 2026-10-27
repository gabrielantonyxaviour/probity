// Sample doubles for DQ7, DQ9 and T23. Computed from the sample store. Missing tables fail closed.
import { z } from "zod";
import { nameNorm } from "../../templates/name-norm";
import { AppError } from "../../schemas/errors";
import { cents, dec2, fromCents, text } from "./sample-format";
import type { Row } from "./sample-store";
import type { Usl } from "./sample-tables";

const empty = z.object({}).strict();
const vendorParams = z.object({ vendor_id: z.string().regex(/^V-\d{5}$/) }).strict();

function requireTables(u: Usl, names: (keyof Usl)[]): void {
  for (const name of names) {
    if (!Array.isArray(u[name])) throw new AppError("sample_data_missing", `${name} is missing from the sample store.`);
  }
}

function payee(value: unknown): string | null {
  if (value == null) return null;
  return nameNorm(String(value));
}

function same(a: string | null, b: unknown): boolean {
  const right = b == null ? null : String(b);
  return a === right;
}

export function sharedGroups(u: Usl): Row[] {
  requireTables(u, ["vendor_bank_account"]);
  const groups = new Map<string, { vendors: Set<string>; statuses: Set<string> }>();
  for (const row of u.vendor_bank_account) {
    const hash = text(row.account_hash);
    const vendor = text(row.vendor_id);
    if (!hash || !vendor) continue;
    const group = groups.get(hash) ?? { vendors: new Set<string>(), statuses: new Set<string>() };
    group.vendors.add(vendor);
    const status = text(row.status);
    if (status) group.statuses.add(status);
    groups.set(hash, group);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.vendors.size > 1)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 50)
    .map(([hash, group]) => ({
      account_hash: hash,
      vendor_count: String(group.vendors.size),
      vendor_ids: [...group.vendors].sort().join(","),
      statuses: [...group.statuses].sort().join(","),
    }));
}

export function dq7(p: Record<string, unknown>, u: Usl): Row[] {
  empty.parse(p);
  return sharedGroups(u);
}

export function dq7c(p: Record<string, unknown>, u: Usl): Row[] {
  empty.parse(p);
  requireTables(u, ["vendor_bank_account"]);
  const shared = new Set(sharedGroups(u).map((row) => String(row.account_hash)));
  const invalid = u.vendor_bank_account.filter((row) => shared.has(String(row.account_hash ?? ""))).length;
  return [{ total_rows: String(u.vendor_bank_account.length), invalid_rows: String(invalid) }];
}

export function dq9(p: Record<string, unknown>, u: Usl): Row[] {
  empty.parse(p);
  requireTables(u, ["payment_run_item", "vendor"]);
  const vendors = new Map(u.vendor.map((row) => [String(row.vendor_id), row]));
  return u.payment_run_item.flatMap((item) => {
    const vendor = vendors.get(String(item.vendor_id));
    if (!vendor) return [];
    const norm = payee(item.vendor_name);
    if (same(norm, vendor.name_norm)) return [];
    return [{
      item_id: item.item_id,
      vendor_id: item.vendor_id,
      vendor_name: item.vendor_name ?? null,
      legal_name: vendor.legal_name ?? null,
      legal_name_norm: vendor.name_norm ?? null,
      payee_norm: norm,
    }];
  }).slice(0, 500);
}

export function dq9c(p: Record<string, unknown>, u: Usl): Row[] {
  empty.parse(p);
  requireTables(u, ["payment_run_item", "vendor"]);
  const vendors = new Map(u.vendor.map((row) => [String(row.vendor_id), row]));
  let total = 0;
  let valid = 0;
  for (const item of u.payment_run_item) {
    const vendor = vendors.get(String(item.vendor_id));
    if (!vendor) continue;
    total += 1;
    if (same(payee(item.vendor_name), vendor.name_norm)) valid += 1;
  }
  return [{ total: String(total), valid: String(valid), invalid: String(total - valid) }];
}

function cikOf(value: unknown): string {
  const raw = text(value) ?? "";
  return /^\d+$/.test(raw) ? raw.padStart(10, "0") : raw;
}

export function t23(p: Record<string, unknown>, u: Usl): Row[] {
  const { vendor_id: vendorId } = vendorParams.parse(p);
  requireTables(u, ["vendor", "payment_run_item", "registry_entity", "sec_registrant"]);
  const vendors = u.vendor.filter((row) => String(row.vendor_id) === vendorId);
  if (!vendors.length) return [];
  const items = u.payment_run_item.filter((row) => String(row.vendor_id) === vendorId);
  const exposure = items.length ? fromCents(items.reduce((sum, row) => sum + cents(row.amount_usd), 0)) : null;
  const rows: Row[] = [];
  for (const vendor of vendors) {
    const entities = u.registry_entity.filter((row) => text(row.uei) === text(vendor.uei));
    const registrants = u.sec_registrant.filter((row) => cikOf(row.cik) === cikOf(vendor.registrant_cik));
    const entityLegs = entities.length ? entities : [undefined];
    const edgarLegs = registrants.length ? registrants : [undefined];
    for (const entity of entityLegs) {
      for (const edgar of edgarLegs) {
        rows.push({
          vendor_id: String(vendor.vendor_id),
          vendor_name: text(vendor.legal_name),
          uei: text(vendor.uei),
          usa_legal_name: text(entity?.legal_name),
          usa_address_line1: text(entity?.address_line1),
          usa_city: text(entity?.city_name),
          usa_state: text(entity?.state_code),
          usa_zip: text(entity?.zip),
          cik: text(edgar?.cik),
          edgar_legal_name: text(edgar?.legal_name),
          edgar_phone: text(edgar?.phone),
          edgar_ein: text(edgar?.ein),
          payment_item_count: items.length ? String(items.length) : null,
          total_exposure: exposure == null ? null : dec2(exposure),
        });
      }
    }
  }
  return rows.slice(0, 10);
}
