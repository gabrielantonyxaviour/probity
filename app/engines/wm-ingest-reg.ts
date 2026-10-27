// Registry-side mappers: USAspending recipient detail and children, SEC EDGAR, name matches (05 2.5).
// Row shapes are tolerant: flattened Zetaris columns (usa_*, biz_*, sec_*) and the raw API objects both work.
import { nameNorm, normaliseAddress } from "./wm-norm";
import { addressNode, arr, first, g, legalEntity, s, type IngestCtx, type Row } from "./wm-ingest-util";
import { registrant, registrantContacts, t14, t16 } from "./wm-ingest-edgar";

const MAX_CHILD_WRITES = 12; // a 41-row family list is never written in full (05 2.5)

async function t05(c: IngestCtx, rows: Row[]): Promise<void> {
  for (const r of rows) {
    const vid = s(r, "vendor_id");
    if (!vid) continue;
    const vname = s(r, "vm_name", "legal_name");
    const vendor = await c.w.entity(
      "vendor_record",
      "erp",
      vid,
      vname
        ? { vendor_id: vid, legal_name: vname, data_origin: "SYNTHETIC" }
        : { vendor_id: vid, data_origin: "SYNTHETIC" },
      vname ?? undefined,
      c.prov,
    );
    const created = (c.w.world.view("graph").entity(vendor)?.attrs.created_at as string | undefined) ?? first(c);
    const ek = s(r, "entity_key");
    let top: string | null = null;
    if (ek && ek.includes("-")) {
      const [uei, level] = ek.split("-") as [string, string];
      const name = s(r, "usa_name");
      const ent = await legalEntity(c, uei, level, { legal_name: name, state: s(r, "usa_state") }, name ?? undefined);
      top = ent;
      await c.w.relate(vendor, "same_as", ent, "src:erp", created, null, c.prov);
      const addr = normaliseAddress({ line1: s(r, "usa_line1"), city: s(r, "usa_city"), state: s(r, "usa_state") });
      if (addr)
        await c.w.relate(ent, "located_at", await addressNode(c, addr), "src:usa_detail", first(c), null, c.prov);
      const p = s(r, "parent_uei");
      if (p && p !== uei) {
        top = await legalEntity(c, p, "P", {});
        await c.w.relate(ent, "child_of", top, "src:usa_detail", first(c), null, c.prov);
      }
    }
    const cik = s(r, "cik");
    if (cik) {
      const name = s(r, "sec_name");
      const reg = await registrant(c, cik, { name, ein: s(r, "sec_ein") }, name ?? undefined);
      await registrantContacts(c, reg, r);
      if (top) await c.w.relate(top, "registered_as", reg, "src:erp_registrant", first(c), null, c.prov);
    }
  }
}

/** T05b / T05b-shaped: the family parent's own location. */
async function t05b(c: IngestCtx, rows: Row[]): Promise<void> {
  for (const r of rows) {
    const key = s(r, "p_entity_key");
    if (!key) continue;
    const uei = key.split("-")[0]!;
    const name = s(r, "p_legal_name");
    const ent = await legalEntity(c, uei, "P", { legal_name: name, state: s(r, "p_state_code") }, name ?? undefined);
    const addr = normaliseAddress({
      line1: s(r, "p_address_line1"),
      city: s(r, "p_city_name"),
      state: s(r, "p_state_code"),
      zip: s(r, "p_zip"),
    });
    if (addr) await c.w.relate(ent, "located_at", await addressNode(c, addr), "src:usa_detail", first(c), null, c.prov);
  }
}

/** T06a/b/c: the claimed name equals a registry name or alias. Needs the current request's claimed_party. */
async function t06(c: IngestCtx, rows: Row[]): Promise<void> {
  if (!c.req) {
    c.notes.push("t06 skipped: no request in this run");
    return;
  }
  for (const r of rows) {
    const key = s(r, "key");
    if (!key) continue;
    const norm = s(r, "name_norm") ?? nameNorm(s(r, "name") ?? "");
    const party = c.req.claimed.find((p) => p.norm === norm) ?? c.req.claimed[0];
    if (!party) continue;
    const name = s(r, "name");
    const isCik = /^\d{10}$/.test(key);
    let target: string;
    let ctx: string;
    if (isCik) {
      target = await registrant(c, key, { name }, name ?? undefined);
      ctx = `src:edgar_former:${key}`;
    } else {
      const [uei, lvl] = key.includes("-") ? (key.split("-") as [string, string]) : [key, "C"];
      target = await legalEntity(c, uei, lvl, {}, undefined);
      ctx = `src:usa_alias:${uei}-${lvl}`;
    }
    const from = s(r, "valid_from") ? new Date(String(g(r, "valid_from"))).toISOString() : first(c);
    await c.w.relate(party.id, "name_matches", target, ctx, from, null, c.prov, {
      alias_name: name,
      alias_source: s(r, "alias_source") ?? s(r, "via"),
      alias_valid_to: s(r, "valid_to"),
    });
  }
}

async function t10(c: IngestCtx, rows: Row[]): Promise<void> {
  const parent = (c.batch.params?.parent_uei as string | undefined) ?? s(rows[0] ?? {}, "parent_uei");
  if (!parent) {
    c.notes.push("t10 skipped: no parent_uei");
    return;
  }
  const size = Number(g(rows[0] ?? {}, "list_size") ?? 0);
  const p = await legalEntity(c, parent, "P", size > 0 ? { family_size: size } : {});
  for (const r of rows.slice(0, MAX_CHILD_WRITES)) {
    const uei = s(r, "child_uei");
    if (!uei) continue;
    const name = s(r, "child_name");
    const ch = await legalEntity(c, uei, "C", { legal_name: name, state: s(r, "state_province") }, name ?? undefined);
    await c.w.relate(ch, "child_of", p, `src:usa_children:${parent}`, first(c), null, c.prov);
  }
}

async function t11(c: IngestCtx, rows: Row[]): Promise<void> {
  const parent = c.batch.params?.parent_uei as string | undefined;
  for (const r of rows) {
    const uei = s(r, "matched_uei");
    if (!uei) continue;
    const name = s(r, "matched_name");
    const ent = await legalEntity(
      c,
      uei,
      s(r, "matched_level") ?? "C",
      { legal_name: name, state: s(r, "state_code") },
      name ?? undefined,
    );
    const addr = normaliseAddress({
      line1: s(r, "address_line1"),
      city: s(r, "city_name"),
      state: s(r, "state_code"),
      zip: s(r, "zip"),
    });
    if (addr) await c.w.relate(ent, "located_at", await addressNode(c, addr), "src:usa_detail", first(c), null, c.prov);
    if (parent && parent !== uei) {
      const p = await legalEntity(c, parent, "P", {});
      await c.w.relate(ent, "child_of", p, `src:usa_children:${parent}`, first(c), null, c.prov);
    }
  }
}

/** T12: a registrar-confirmed session detail table (raw USAspending recipient object). */
async function t12(c: IngestCtx, rows: Row[]): Promise<void> {
  for (const r of rows) {
    const uei = s(r, "uei");
    const level = s(r, "recipient_level") ?? "C";
    if (!uei) continue;
    const name = s(r, "name", "legal_name");
    const alts = arr(r, "alternate_names", "alternate_names_json").map(String);
    const ent = await legalEntity(
      c,
      uei,
      level,
      { legal_name: name, alternate_names: alts, state: s(r, "location.state_code", "state_code") },
      name ?? undefined,
    );
    const addr = normaliseAddress({
      line1: s(r, "location.address_line1", "address_line1"),
      unit: s(r, "location.address_line2", "address_line2"),
      city: s(r, "location.city_name", "city_name"),
      state: s(r, "location.state_code", "state_code"),
      zip: s(r, "location.zip", "zip"),
    });
    if (addr) await c.w.relate(ent, "located_at", await addressNode(c, addr), "src:usa_detail", first(c), null, c.prov);
    const detailParent = s(r, "parent_uei");
    if (detailParent && detailParent !== uei) {
      await c.w.relate(
        ent,
        "child_of",
        await legalEntity(c, detailParent, "P", {}),
        "src:usa_detail",
        first(c),
        null,
        c.prov,
      );
    }
    for (const p of arr(r, "parents", "parents_json") as Row[]) {
      const pu = s(p, "parent_uei", "uei");
      if (!pu || pu === uei) continue;
      const pn = s(p, "parent_name", "name");
      const pe = await legalEntity(c, pu, "P", pn ? { legal_name: pn } : {}, pn ?? undefined);
      await c.w.relate(ent, "child_of", pe, `src:usa_parents:${pu}`, first(c), null, c.prov);
    }
  }
}

export async function ingestRegistryBatch(c: IngestCtx, rows: Row[]): Promise<void> {
  switch (c.batch.template_id) {
    case "T05":
      return t05(c, rows);
    case "T05b":
      return t05b(c, rows);
    case "T06":
    case "T06a":
    case "T06b":
    case "T06c":
      return t06(c, rows);
    case "T10":
      return t10(c, rows);
    case "T11":
      return t11(c, rows);
    case "T12":
      return t12(c, rows);
    case "T14":
      return t14(c, rows);
    case "T16":
      return t16(c, rows);
    default:
      return; // T03/T04/T04b/T08/T08b/T09/T20/T21: policy inputs only
  }
}
