// The hand-coded path: the same T05 fact sheet (vendor x USAspending recipient x SEC registrant) with fetch and pg, no Zetaris.
// Not re-implemented: retries and backoff, caching, query ids and re-run, the DQ rules, the session-table discovery, and the
// governed key split. Each is something the USL path gets from the platform or from app/adapters/zetaris.
import { createHash } from "node:crypto";
import net from "node:net";
import pg from "pg";

net.setDefaultAutoSelectFamilyAttemptTimeout(5000); // api.usaspending.gov: the IPv6 attempt stalls on some networks

export const COLUMNS = ["vendor_id", "vm_name", "uei", "registrant_cik", "remit_line1", "remit_city", "remit_state", "email_domains_on_file", "entity_key", "usa_name", "parent_uei", "usa_line1", "usa_city", "usa_state", "cik", "sec_name", "sec_phone", "sec_ein", "biz_street1", "biz_city", "biz_state"];
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const s = (v: unknown): string | null => (v == null || v === "" ? null : String(v));

// USAspending addresses recipients by an md5 of "UEI-<uei>" plus the level; the keyed search endpoint would be one more call.
const recipientId = (uei: string, level: string): string => {
  const h = createHash("md5").update(`UEI-${uei}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}-${level}`;
};
async function getJson(url: string, headers: Record<string, string>): Promise<J | null> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
  return (await res.json()) as J;
}

export async function directT05(vendorId: string, o: { erpUrl: string; secUserAgent: string }): Promise<{ rows: unknown[][]; ms: { erp: number; registries: number; total: number } }> {
  const t0 = Date.now();
  const db = new pg.Client({ connectionString: o.erpUrl });
  await db.connect();
  const v = (await db.query("SELECT * FROM vendor WHERE vendor_id = $1", [vendorId])).rows[0] as J | undefined;
  const doms = v ? (await db.query("SELECT DISTINCT lower(domain) AS d FROM vendor_domain WHERE vendor_id = $1 ORDER BY 1", [vendorId])).rows : [];
  await db.end();
  const tErp = Date.now() - t0;
  if (!v) return { rows: [], ms: { erp: tErp, registries: 0, total: tErp } };
  const t1 = Date.now();
  const [usa, sec] = await Promise.all([
    v.uei ? getJson(`https://api.usaspending.gov/api/v2/recipient/${recipientId(v.uei, "C")}/`, { accept: "application/json" }) : null,
    v.registrant_cik ? getJson(`https://data.sec.gov/submissions/CIK${v.registrant_cik}.json`, { "user-agent": o.secUserAgent, accept: "application/json" }) : null,
  ]);
  const b = sec?.addresses?.business ?? {};
  const row = [v.vendor_id, v.legal_name, v.uei, v.registrant_cik, v.remit_line1, v.remit_city, v.remit_state, doms.map((d: J) => d.d).join(",") || null,
    usa ? `${usa.uei}-${usa.recipient_level}` : null, usa?.name, usa?.parent_uei, usa?.location?.address_line1, usa?.location?.city_name, usa?.location?.state_code,
    sec?.cik, sec?.name, sec?.phone, s(sec?.ein), b.street1, b.city, b.stateOrCountry].map(s);
  return { rows: [row], ms: { erp: tErp, registries: Date.now() - t1, total: Date.now() - t0 } };
}
