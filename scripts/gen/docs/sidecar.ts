// SAMPLE_MODE claims fixture and extraction ground truth, both derived from the same Letter that produced the pixels (02 section 5.5).
// The sidecar is a ClaimSet plus extracted_by, source_sha256[] and the transient account_number; app/ reads it only in SAMPLE_MODE.
import { ClaimSet, CLAIM_FIELD_TO_FACT, type ClaimFieldName } from "../../../app/schemas/messages";
import { toE164 } from "../contracts";
import { domainOf, type ParsedEml } from "./eml";
import { PX_H, PX_W, watermarkText, type FieldHit, type FieldName, type Laid, type Letter } from "./model";

export const EXTRACTED_BY = "generator ground truth (SAMPLE_MODE fixture)";
const PHONE_TEXT = /\(\d{3}\) \d{3}-\d{4}|\b\d{3}[-.]\d{3}[-.]\d{4}\b/g;

export function parseAddress(a: string): { line1: string; unit: string | null; city: string; state: string; zip: string } {
  const parts = a.split(", ");
  const tail = parts[parts.length - 1] as string;
  const [state, zip] = tail.split(" ") as [string, string];
  const city = parts[parts.length - 2] as string;
  return { line1: parts[0] as string, unit: parts.length === 4 ? (parts[1] as string) : null, city, state, zip };
}

const toName: Partial<Record<FieldName, ClaimFieldName>> = {
  claimed_name: "claimed_name", letterhead_name: "letterhead_name", remit_address: "remit_address", bank_routing: "bank_routing", bank_account: "bank_account",
  letterhead_phone: "phone", invoice_refs: "invoice_ref", effective_date: "effective_date", pressure_phrase: "pressure_phrase", signer_name: "signer_name", watermark: "watermark",
};
const hint = (h: FieldHit): [number, number, number, number] | null => {
  const b = h.boxes[0];
  if (!b) return null;
  const c = (v: number): number => Math.max(0, Math.min(1000, Math.round(v)));
  return [c((b.x / PX_W) * 1000), c((b.y / PX_H) * 1000), c(((b.x + b.w) / PX_W) * 1000), c(((b.y + b.h) / PX_H) * 1000)];
};

export function buildClaims(L: Letter, laid: Laid, eml: ParsedEml | null, sha: string[], exampleId: string) {
  const phones: { number: string; quote: string; e164: string }[] = [];
  const phoneSeen = new Set<string>();
  const texts = [L.head.contact?.text ?? "", ...L.paras.map((p) => p.text)];
  for (const t of texts) for (const m of t.match(PHONE_TEXT) ?? []) {
    const e = toE164(m);
    if (!phoneSeen.has(e)) { phoneSeen.add(e); phones.push({ number: m, quote: m, e164: e }); }
  }
  const fields: ReturnType<typeof ClaimSet.parse>["fields"] = [];
  const nameHit = laid.fields.find((f) => f.field === "claimed_name") ?? laid.fields.find((f) => f.field === "letterhead_name");
  for (const h of laid.fields) {
    const name = toName[h.field];
    if (!name) continue;
    const quote = h.field === "bank_account" ? (L.bank?.account ?? h.text) : h.field === "bank_routing" ? (L.bank?.routing ?? h.text) : h.text;
    fields.push({ field: name, fact_field: CLAIM_FIELD_TO_FACT[name], quote, page: h.boxes[0]?.page ?? 1, bbox_hint: hint(h), highlight_source: "text_layer" });
  }
  if (nameHit && nameHit.field !== "claimed_name") fields.unshift({ field: "claimed_name", fact_field: "legal_name", quote: L.claimedName, page: 1, bbox_hint: hint(nameHit), highlight_source: "text_layer" });
  const remit = L.remit ? parseAddress(L.remit.address) : null;
  const pressure = laid.fields.filter((f) => f.field === "pressure_phrase").map((f) => ({ quote: f.text, kind: f.kind ?? "urgency" }));
  const core = ClaimSet.parse({
    claimed_name: L.claimedName, letterhead_name: L.head.name, remit_address: remit,
    bank: L.bank ? { bank_name: L.bank.bank_name, routing: L.bank.routing.replace(/\D/g, ""), account_last4: L.bank.account.replace(/\D/g, "").slice(-4) } : null,
    sender_email: eml?.from ?? null, sender_domain: eml?.from ? domainOf(eml.from) : null, reply_to_domain: eml?.replyTo ? domainOf(eml.replyTo) : null,
    phones, effective_date: L.effectiveIso, invoice_refs: (laid.fields.find((f) => f.field === "invoice_refs")?.text.match(/INV-[A-Z]{3}-\d{5}/g)) ?? [],
    signer_name: L.signer, pressure_phrases: pressure, watermark_text: L.unmarked ? null : watermarkText(L.company), fields, extraction_path: "sidecar",
  });
  const account = L.bank ? L.bank.account.replace(/\D/g, "") : null;
  return { example_id: exampleId, extracted_by: EXTRACTED_BY, source_sha256: sha, account_number: account, ...core };
}

export function buildTruth(L: Letter, laid: Laid, exampleId: string, eml: ParsedEml | null) {
  return {
    example_id: exampleId, letter_id: L.id, synthetic: true, raster_px: [PX_W, PX_H],
    values: {
      claimed_name: L.claimedName, letterhead_name: L.head.name, remit_address: L.remit ? parseAddress(L.remit.address) : null,
      bank: L.bank ? { bank_name: L.bank.bank_name, routing: L.bank.routing, account_number: L.bank.account } : null,
      phones: [...new Set<string>([...(L.head.contact?.text.match(PHONE_TEXT) ?? []), ...L.paras.flatMap((p) => p.text.match(PHONE_TEXT) ?? [])])],
      effective_date: L.effectiveIso, signer_name: L.signer, signer_title: L.signerTitle, sender_email: eml?.from ?? null, reply_to: eml?.replyTo ?? null,
    },
    fields: laid.fields.map((f) => ({ field: f.field, text: f.text, ...(f.kind ? { kind: f.kind } : {}), boxes: f.boxes })),
  };
}
