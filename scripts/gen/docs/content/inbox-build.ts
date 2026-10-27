// Builder for the everyday inbox items. Every fact (vendor name, address, phone, domain, run item) comes from the committed seed rows.
import type { EmlSpec } from "../eml";
import type { Channel, ExampleDoc } from "../example";
import type { Letter, Mark, Para } from "../model";
import type { SeedView, VendorView } from "../seed-view";
import { BANKS, RECIPIENT, ROUTING } from "./common";

export interface Ctx { v: VendorView; item: ReturnType<SeedView["openItem"]>; newRemit: string | null; account: string | null; phone: string }
export interface InboxSpec {
  no: string; slug: string; vendorId: string; received: string; channel: Channel; kinds: ("bank" | "remit")[];
  face: Letter["face"]; align: Letter["head"]["align"]; rule: boolean; headSize?: number; caps?: boolean;
  date: string; subject: string; salutation: string; closing: string; signer: string; title: string; effectiveIso: string | null;
  newRemit?: (v: VendorView) => string; account?: string; bank?: string; phoneNpa?: string; // phoneNpa set: letter phone differs from the master
  lookalike?: boolean; replyTo?: string; fromName?: string | null; fromLocal?: string; auth?: EmlSpec["auth"];
  headerOnFile?: boolean; // letterhead shows the on-file address (bank-only letters)
  body: (c: Ctx) => { paras: Para[] };
  emlBody: string[]; ip: string; scenarioTitle: string;
}

const refMark = (text: string): Mark => ({ text, field: "invoice_refs", nobreak: true });
export const marks = { ref: refMark };

export function address(r: { line1: string; unit: string | null; city: string; state: string; zip: string }): string {
  return [r.line1, ...(r.unit ? [r.unit] : []), r.city, `${r.state} ${r.zip}`].join(", ");
}

export function buildInbox(s: InboxSpec, seed: SeedView, index: number): ExampleDoc {
  const exampleId = `${11 + index}-${s.slug}`;
  const v = seed.vendor(s.vendorId);
  const item = seed.openItem(s.vendorId);
  const newRemit = s.newRemit ? s.newRemit(v) : null;
  const phone = s.phoneNpa ? seed.freePhone(s.phoneNpa) : v.phone;
  const company = v.name; // stored name, with ""
  const senderDomain = s.lookalike ? `${v.label}-payments.example` : v.domain;
  const email = `${s.fromLocal ?? "ap"}@${senderDomain}`;
  const { paras } = s.body({ v, item, newRemit, account: s.account ?? null, phone });
  const addr = newRemit ?? address(v.remit);
  const letter: Letter = {
    id: exampleId, company, claimedName: v.plainName, unmarked: true, effectiveIso: s.effectiveIso, face: s.face,
    head: { name: v.plainName, address: addr, align: s.align, rule: s.rule, ...(s.headSize ? { size: s.headSize } : {}), contact: { text: s.channel === "email" || s.channel === "vendor_portal" ? `${phone} · ${email}` : `Phone ${phone}`, phone, ...(s.channel === "mail" ? {} : { email }) } },
    date: s.date, recipient: RECIPIENT, subject: s.subject, ...(s.caps ? { caps: true } : {}), salutation: s.salutation, paras,
    ...(newRemit ? { remit: { label: "New remit-to address", address: newRemit } } : {}),
    ...(s.account ? { bank: { bank_name: s.bank ?? BANKS.harborline, routing: ROUTING, account: s.account, account_name: v.plainName } } : {}),
    closing: s.closing, signer: s.signer, signerTitle: s.title,
  };
  const subjectLine = s.channel === "email" ? s.subject : s.channel === "vendor_portal" ? `Vendor portal request: ${s.subject}` : `Scanned letter: ${s.subject}`;
  const eml: EmlSpec | undefined = s.channel === "email"
    ? { fromName: s.fromName === undefined ? s.signer : s.fromName, from: email, ...(s.replyTo ? { replyTo: s.replyTo } : {}), subject: s.subject, utc: s.received, senderIp: s.ip, auth: s.auth ?? { spf: "pass", dkim: "pass", dmarc: "pass" }, company, unmarked: true, body: s.emlBody }
    : undefined;
  const from = s.channel === "email" ? `${s.fromName === null ? "" : `"${s.fromName ?? s.signer}" `}<${email}>`.trim() : s.channel === "vendor_portal" ? `Vendor portal · ${v.name}` : `Mail scan · ${v.name} (postal)`;
  return {
    folder: `data/inbox/items/BCR-2026-${s.no}`, exampleId, requestId: `BCR-2026-${s.no}`, letter, channel: s.channel, receivedAt: s.received,
    paymentRunId: item?.run ?? "PR-2026-10-30", title: s.scenarioTitle, scenario: null, kinds: s.kinds, manifestName: v.name, from, subject: subjectLine, unmarked: true, ...(eml ? { eml } : {}),
  };
}
