// Template-row -> World Model writes (05 2.5). Only rows actually returned are written. Times come from the data
// (ERP dates, fetched_at, received_at), never from the wall clock. Normalisation comes from wm-norm (spine 9.4).
import type { Prov, RequestRecord } from "../schemas/engines";
import { nameNorm, normaliseAddress, registrableDomain, toE164, toIso, last4 } from "./wm-norm";
import type { Writer } from "./wm-writer";
import { g, s, phoneNode, type CurrentRequest, type IngestCtx, type Row } from "./wm-ingest-util";
import { ingestRegistryBatch } from "./wm-ingest-reg";

export type { CurrentRequest, TemplateRowsX } from "./wm-ingest-util";
/** Additive over the frozen RequestRecord: document kinds when the intake knows them (DEC-04 vocabulary). */
export type RequestRecordX = RequestRecord & {
  doc_kinds?: Record<string, string>;
  page_counts?: Record<string, number>;
};

const DOC_KINDS = ["letter", "eml_headers"];

/** F2 output. Provenance is the intake's own: manual for typed requests, file for documents. */
export async function ingestRequest(w: Writer, req: RequestRecordX, runId: string): Promise<CurrentRequest> {
  const rid = req.request_id;
  const at = toIso(req.received_at) ?? req.received_at;
  const prov: Prov = { kind: req.channel === "typed" ? "manual" : "file", by: "intake", at, runId };
  const c = req.claims;
  const ctx = `src:request:${rid}`;
  const reqId = await w.entity(
    "request",
    "req",
    rid,
    {
      request_id: rid,
      received_at: at,
      channel: req.channel,
      extraction_path: c.extraction_path,
      data_origin: "SYNTHETIC",
    },
    rid,
    prov,
  );

  const docs = req.doc_ids;
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i]!;
    const attrs: Record<string, unknown> = {
      doc_id: d,
      kind: req.doc_kinds?.[d] ?? DOC_KINDS[i] ?? "letter",
      watermark_text: c.watermark_text,
    };
    if (req.page_counts?.[d] !== undefined) attrs.page_count = req.page_counts[d];
    const docId = await w.entity("document", "doc", d, attrs, d, prov);
    await w.relate(reqId, "documented_by", docId, `${ctx}:${d}`, at, null, prov);
  }

  const claimed: CurrentRequest["claimed"] = [];
  const names: Array<[string | null, string]> = [
    [c.claimed_name, ctx],
    [c.letterhead_name, `${ctx}:letterhead`],
  ];
  for (const [name, context] of names) {
    if (!name || claimed.some((x) => x.norm === nameNorm(name))) continue;
    const id = await w.nameKeyed("claimed_party", name, { claimed_name: name }, prov);
    claimed.push({ id, norm: nameNorm(name) });
    await w.relate(reqId, "claims_to_be", id, context, at, null, prov);
  }

  if (req.account_hash) {
    const l4 = req.account_last4 ?? c.bank?.account_last4 ?? null;
    const acct = await w.entity(
      "bank_account",
      "acct",
      req.account_hash,
      { account_hash: req.account_hash, account_last4: l4, routing_last4: last4(c.bank?.routing) },
      l4 ? `…${l4}` : undefined,
      prov,
    );
    await w.relate(reqId, "requests_pay_to", acct, ctx, at, null, prov);
  }

  const addr = c.remit_address ? normaliseAddress(c.remit_address) : null;
  if (addr) {
    const id = await w.entity(
      "address",
      "addr",
      addr.key,
      { line1: addr.line1, unit: addr.unit, city: addr.city, state: addr.state, zip: addr.zip, display: addr.display },
      addr.display,
      prov,
      { ifAbsent: true },
    );
    await w.relate(reqId, "requests_remit_to", id, ctx, at, null, prov);
  }

  for (const [raw, label] of [
    [c.sender_domain, "from"],
    [c.reply_to_domain, "reply_to"],
  ] as const) {
    const d = registrableDomain(raw);
    if (!d) continue;
    const id = await w.entity("domain", "domain", d, { domain: d }, d, prov);
    await w.relate(reqId, "sent_from", id, `${ctx}:${label}`, at, null, prov);
  }

  for (const p of c.phones) {
    const e164 = p.e164 ?? toE164(p.number);
    if (!e164) continue;
    const id = await phoneNode(w, e164, prov);
    await w.relate(reqId, "lists_phone", id, `${ctx}:${e164}`, at, null, prov, { quote: p.quote });
  }

  for (const vid of req.candidate_vendor_ids) {
    const v = await w.entity(
      "vendor_record",
      "erp",
      vid,
      { vendor_id: vid, data_origin: "SYNTHETIC" },
      undefined,
      prov,
    );
    await w.relate(reqId, "candidate_vendor", v, `cand:${rid}:${vid}`, at, null, prov);
  }
  return { request_id: rid, received_at: at, account_hash: req.account_hash, claimed };
}

// ---- ERP templates ----------------------------------------------------------------------------------------------
async function t01(c: IngestCtx, rows: Row[]): Promise<void> {
  for (const r of rows) {
    const vid = s(r, "vendor_id");
    const name = s(r, "legal_name");
    if (!vid || !name) continue;
    const created = toIso(g(r, "created_at")) ?? c.batch.fetched_at;
    const v = await c.w.entity(
      "vendor_record",
      "erp",
      vid,
      {
        vendor_id: vid,
        legal_name: name,
        status: s(r, "status"),
        created_at: created,
        data_origin: s(r, "data_origin") ?? "SYNTHETIC",
      },
      name,
      c.prov,
    );
    const addr = normaliseAddress({
      line1: s(r, "remit_line1"),
      unit: s(r, "remit_unit"),
      city: s(r, "remit_city"),
      state: s(r, "remit_state"),
      zip: s(r, "remit_zip"),
    });
    if (addr) {
      const a = await c.w.entity(
        "address",
        "addr",
        addr.key,
        {
          line1: addr.line1,
          unit: addr.unit,
          city: addr.city,
          state: addr.state,
          zip: addr.zip,
          display: addr.display,
        },
        addr.display,
        c.prov,
        { ifAbsent: true },
      );
      await c.w.relate(v, "located_at", a, "src:erp", created, null, c.prov);
    }
    const domains = (s(r, "email_domains_on_file") ?? "").split(",").map((d) => registrableDomain(d.trim()));
    for (const d of new Set(domains)) {
      if (!d) continue;
      const dom = await c.w.entity("domain", "domain", d, { domain: d }, d, c.prov);
      await c.w.relate(v, "uses_domain", dom, `src:erp_domain:${d}`, created, null, c.prov);
    }
  }
}

/** Phones only, oldest first (W5: a newer edge closes an older open one, never the reverse). */
async function t02(c: IngestCtx, rows: Row[]): Promise<void> {
  const phones = rows
    .filter((r) => s(r, "kind") === "phone")
    .map((r) => ({
      r,
      from: toIso(g(r, "valid_from")),
      to: toIso(g(r, "valid_to")),
      e164: toE164(s(r, "value")),
      vid: s(r, "vendor_id") ?? (c.batch.params?.vendor_id as string | undefined) ?? null,
    }))
    .sort((a, b) => (a.from ?? "").localeCompare(b.from ?? ""));
  for (const p of phones) {
    if (!p.vid || !p.from || !p.e164) {
      c.notes.push(`t02 row skipped: ${!p.vid ? "no vendor_id" : !p.from ? "no valid_from" : "unparseable phone"}`);
      continue;
    }
    const v = await c.w.entity(
      "vendor_record",
      "erp",
      p.vid,
      { vendor_id: p.vid, data_origin: "SYNTHETIC" },
      undefined,
      c.prov,
    );
    const ph = await phoneNode(c.w, p.e164, c.prov);
    await c.w.relate(v, "reachable_at", ph, "src:erp", p.from, p.to, c.prov);
  }
}

/** Other holders of the requested account. Context is per account (SCR-05-3 deviation): T07 sees one hash, not the account history. */
async function t07(c: IngestCtx, rows: Row[]): Promise<void> {
  const hash = (c.batch.params?.account_hash as string | undefined) ?? c.req?.account_hash ?? null;
  if (!hash) return;
  const acct = await c.w.entity("bank_account", "acct", hash, { account_hash: hash }, undefined, c.prov);
  const ctx = `src:erp_account:${hash.slice(0, 12)}`;
  for (const r of rows) {
    const at = toIso(g(r, "at_ts")) ?? c.batch.fetched_at;
    const vid = s(r, "owner_vendor_id", "vendor_id");
    if (s(r, "via") === "vendor_bank_account" && vid) {
      const name = s(r, "vendor_name");
      const v = await c.w.entity(
        "vendor_record",
        "erp",
        vid,
        name
          ? { vendor_id: vid, legal_name: name, data_origin: "SYNTHETIC" }
          : { vendor_id: vid, data_origin: "SYNTHETIC" },
        name ?? undefined,
        c.prov,
      );
      await c.w.relate(v, "pays_to", acct, ctx, at, null, c.prov);
    } else if (
      s(r, "via") === "bank_change_request" &&
      s(r, "request_id") &&
      s(r, "request_id") !== c.req?.request_id
    ) {
      const rid = s(r, "request_id")!;
      const q = await c.w.entity("request", "req", rid, { request_id: rid, data_origin: "SYNTHETIC" }, rid, c.prov);
      await c.w.relate(q, "requests_pay_to", acct, `src:request:${rid}`, at, null, c.prov);
    }
  }
}

export async function ingestBatch(c: IngestCtx): Promise<void> {
  const rows = c.batch.rows as Row[];
  switch (c.batch.template_id) {
    case "T01":
      return t01(c, rows);
    case "T02":
      return t02(c, rows);
    case "T07":
      return t07(c, rows);
    default:
      return ingestRegistryBatch(c, rows);
  }
}
