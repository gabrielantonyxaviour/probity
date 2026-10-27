// A1 post-processing (04 §2.2 steps 1-6): zod parse is done by the caller; here code overrides, recomputes and verifies.
// The model never supplies sender_email, sender_domain, reply_to_domain, fact_field, extraction_path or highlight_source.
import type { ExtractClaimsModel } from "../../schemas/llm";
import { CLAIM_FIELD_TO_FACT, type ClaimSet, type ExtractionPath } from "../../schemas/messages";
import { parseEml, type ParsedEml } from "../../policy/eml";
import { normText, toE164 } from "../../policy/normalise";
import { matchQuote, normToken, type Bbox, type TextPage } from "./text-layer";
import { detectInjection } from "./injection";

export type Finalized = { claims: ClaimSet; account_number: string | null; notes: string[]; unsupported: string[] };

const digits = (s: string | null | undefined): string => (s ?? "").replace(/\D/g, "");
const validBox = (b: number[] | null): b is Bbox => !!b && b.length === 4 && b[0]! < b[2]! && b[1]! < b[3]!;

/** Decisive fields (routing, account, remit line1) must occur in their quote: digits-only for numbers. */
export function supportCheck(m: NonNullable<ExtractClaimsModel["claims"]>, account: string | null): string[] {
  const bad: string[] = [];
  const quoteOf = (f: string) => m.fields.filter((x) => x.field === f).map((x) => x.quote);
  const routing = digits(m.bank?.routing);
  if (routing && !quoteOf("bank_routing").some((q) => digits(q).includes(routing))) bad.push("bank_routing");
  if (account && !quoteOf("bank_account").some((q) => digits(q).includes(account))) bad.push("bank_account");
  const line1 = m.remit_address?.line1;
  if (line1 && !quoteOf("remit_address").some((q) => normText(q).includes(normText(line1).replace(/[.,]/g, "")) || normText(q).replace(/[.,]/g, "").includes(normText(line1).replace(/[.,]/g, "")))) bad.push("remit_address");
  return bad;
}

/** Defence in depth for A-02: a line in the document addressed to an AI or reviewer that the model did not flag. */
const INJECTION = /(?:\b(?:automated|ai|assistant|language model|llm|system)\b[^.\n]{0,40}\b(?:reviewer|review|agent|model)\b|\bnote to\b[^.\n]{0,30}\b(?:reviewer|ai|model|system|assistant)\b|\bignore (?:all |any )?(?:previous|prior|above)\b|\b(?:output|return|respond with|mark)\b[^.\n]{0,30}\bapprove\b)/i;
export function findInjectedLines(pages: TextPage[]): string[] {
  return pages.flatMap((p) => p.lines.filter((l) => INJECTION.test(l)));
}

export function finalizeClaims(
  m: ExtractClaimsModel,
  a: { eml: ParsedEml | null; path: ExtractionPath; pages: TextPage[] },
): Finalized {
  const notes: string[] = [];
  const c = m.claims!;
  const account = m.account_number ?? null;
  const unsupported = supportCheck(c, account);
  const eml = a.eml ?? null;
  if (eml) {
    const mismatch = (c.sender_domain && eml.from_domain && c.sender_domain.toLowerCase() !== eml.from_domain) || (c.reply_to_domain && eml.reply_to_domain && c.reply_to_domain.toLowerCase() !== eml.reply_to_domain);
    if (mismatch) notes.push("eml_mismatch");
  }
  const routing = c.bank?.routing ? digits(c.bank.routing) : null;
  const bank = c.bank
    ? { bank_name: c.bank.bank_name, routing, account_last4: account ? account.slice(-4) : c.bank.account_last4 }
    : null;
  const pressure = [...c.pressure_phrases];
  const lines = [...new Set([...findInjectedLines(a.pages), ...detectInjection({ layer: a.pages, ocr: null, eml: null }).map((x) => x.text)])];
  for (const l of lines) {
    if (!pressure.some((p) => normText(l).includes(normText(p.quote)) || normText(p.quote).includes(normText(l)))) {
      pressure.push({ quote: l, kind: "embedded_instruction" });
      notes.push("embedded_instruction_flagged_by_code");
    }
  }
  const fields: ClaimSet["fields"] = c.fields.map((f) => {
    const hint = f.bbox_hint as number[] | null;
    let box: Bbox | null = null;
    let src: ClaimSet["fields"][number]["highlight_source"] = "none";
    if (validBox(hint)) {
      box = hint;
      src = "model";
    } else {
      const page = a.pages.find((p) => p.page === f.page);
      const hit = page ? matchQuote(page, f.quote) : null;
      if (hit && page) {
        box = hit;
        src = page.source === "ocr" ? "ocr_match" : "text_layer";
      }
    }
    return { field: f.field, fact_field: CLAIM_FIELD_TO_FACT[f.field], quote: f.quote, page: f.page, bbox_hint: box, highlight_source: src };
  });
  for (const p of pressure.filter((x) => !fields.some((f) => f.field === "pressure_phrase" && normText(f.quote) === normText(x.quote)))) {
    const page = a.pages.find((pg) => pg.lines.includes(p.quote));
    const hit = page ? matchQuote(page, p.quote) : null;
    fields.push({ field: "pressure_phrase", fact_field: null, quote: p.quote, page: page?.page ?? 1, bbox_hint: hit, highlight_source: hit ? (page!.source === "ocr" ? "ocr_match" : "text_layer") : "none" });
  }
  const claims: ClaimSet = {
    claimed_name: c.claimed_name,
    letterhead_name: c.letterhead_name,
    remit_address: c.remit_address,
    bank,
    sender_email: eml?.from_email ?? c.sender_email,
    sender_domain: eml?.from_domain ?? c.sender_domain?.toLowerCase() ?? null,
    reply_to_domain: eml ? eml.reply_to_domain : (c.reply_to_domain?.toLowerCase() ?? null),
    phones: c.phones.map((p) => ({ number: p.number, quote: p.quote, e164: toE164(p.number) })).filter((p, i, all) => !p.e164 || all.findIndex((x) => x.e164 === p.e164) === i),
    effective_date: c.effective_date,
    invoice_refs: c.invoice_refs,
    signer_name: c.signer_name,
    pressure_phrases: pressure,
    watermark_text: c.watermark_text,
    fields,
    extraction_path: a.path,
  };
  return { claims, account_number: account, notes, unsupported };
}

export { parseEml, normToken };
