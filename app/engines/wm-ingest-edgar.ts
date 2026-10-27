// SEC EDGAR side of the registry mappers (05 2.5): registrants, their phone and addresses, former names, tickers.
import { normaliseAddress, toE164 } from "./wm-norm";
import { addressNode, arr, first, phoneNode, s, type IngestCtx, type Row } from "./wm-ingest-util";

export async function registrant(
  c: IngestCtx,
  cik: string,
  extra: Record<string, unknown>,
  name?: string,
): Promise<string> {
  const attrs: Record<string, unknown> = { cik, ...extra, data_origin: "REAL" };
  for (const k of Object.keys(attrs)) if (attrs[k] === null) delete attrs[k];
  return c.w.entity("sec_registrant", "cik", cik, attrs, name, c.prov);
}

/** Phone, business address and (optionally) mailing address of an EDGAR registrant row. */
export async function registrantContacts(c: IngestCtx, rid: string, r: Row): Promise<void> {
  const e164 = toE164(s(r, "sec_phone", "phone", "phone_raw"));
  if (e164)
    await c.w.relate(rid, "reachable_at", await phoneNode(c.w, e164, c.prov), "src:edgar", first(c), null, c.prov);
  const biz = normaliseAddress({
    line1: s(r, "biz_street1", "addresses.business.street1"),
    unit: s(r, "biz_street2", "addresses.business.street2"),
    city: s(r, "biz_city", "addresses.business.city"),
    state: s(r, "biz_state", "addresses.business.stateOrCountry"),
    zip: s(r, "biz_zip", "addresses.business.zipCode"),
  });
  if (biz) await c.w.relate(rid, "located_at", await addressNode(c, biz), "src:edgar_business", first(c), null, c.prov);
  const mail = normaliseAddress({
    line1: s(r, "mail_street1", "addresses.mailing.street1"),
    unit: s(r, "mail_street2", "addresses.mailing.street2"),
    city: s(r, "mail_city", "addresses.mailing.city"),
    state: s(r, "mail_state", "addresses.mailing.stateOrCountry"),
    zip: s(r, "mail_zip", "addresses.mailing.zipCode"),
  });
  if (mail)
    await c.w.relate(rid, "located_at", await addressNode(c, mail), "src:edgar_mailing", first(c), null, c.prov);
}

/** T14: a registrar-confirmed EDGAR session table (submissions projection or sec_registrant_v columns). */
export async function t14(c: IngestCtx, rows: Row[]): Promise<void> {
  for (const r of rows) {
    const raw = s(r, "cik");
    if (!raw) continue;
    const cik = raw.padStart(10, "0");
    const name = s(r, "name", "legal_name", "sec_name");
    const former = (arr(r, "formerNames", "former_names") as Row[]).map((f) => ({
      name: s(f, "name"),
      from: s(f, "from"),
      to: s(f, "to"),
    }));
    const reg = await registrant(
      c,
      cik,
      {
        name,
        ein: s(r, "ein", "sec_ein"),
        state_of_inc: s(r, "stateOfIncorporation", "state_of_inc"),
        former_names: former,
      },
      name ?? undefined,
    );
    await registrantContacts(c, reg, r);
  }
}

/** T16: ticker discovery. Soft: the link fact stays pending until A3 approves it. */
export async function t16(c: IngestCtx, rows: Row[]): Promise<void> {
  const from =
    (c.batch.params?.from_entity_id as string | undefined) ??
    (c.batch.params?.entity_key ? `legal_entity:uei:${c.batch.params.entity_key}` : null);
  if (!from) {
    c.notes.push("t16 skipped: no from_entity_id");
    return;
  }
  for (const r of rows) {
    const cik = s(r, "cik")?.padStart(10, "0");
    if (!cik) continue;
    const title = s(r, "title");
    const reg = await registrant(c, cik, { name: title }, title ?? undefined);
    await c.w.relate(from, "registered_as", reg, "src:ticker", first(c), null, c.prov, { ticker: s(r, "ticker") });
  }
}
