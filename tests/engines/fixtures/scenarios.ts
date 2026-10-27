// Scenario request records for the engine fixtures (spine section 13, 02 section 5.4). Used by make.ts only.
import { accountHash } from "../../../app/policy/normalise";
import type { RequestRecord } from "../../../app/schemas/engines";
import type { ClaimSet } from "../../../app/schemas/messages";

export type Scenario = "S1" | "S2" | "S3" | "S4" | "S6b" | "S6d";

type Spec = {
  id: string;
  received_at: string;
  candidates: string[];
  channel: RequestRecord["channel"];
  claimed: string;
  letterhead: string | null;
  remit: { line1: string; unit: string | null; city: string; state: string; zip: string | null } | null;
  account: string | null;
  from: string;
  replyTo: string | null;
  phone: string | null;
  invoices: string[];
  signer: string | null;
  docs: number;
};

const SPECS: Record<Scenario, Spec> = {
  S1: {
    id: "BCR-2026-0412",
    received_at: "2026-10-22T15:12:00Z",
    candidates: ["V-10027"],
    channel: "email",
    claimed: "Booz Allen Hamilton Inc.",
    letterhead: "Booz Allen Hamilton Inc.",
    remit: { line1: "1 Commvault Way", unit: "Suite 205", city: "Tinton Falls", state: "NJ", zip: "07724" },
    account: "000999000141",
    from: "ap-remittance@boozallen-payments.example",
    replyTo: "ap-remittance@boozallen-payments.example",
    phone: "(703) 555-0147",
    invoices: ["INV-BAH-20931", "INV-BAH-20944", "INV-BAH-20967"],
    signer: "R. Castellane (fictional)",
    docs: 2,
  },
  S2: {
    id: "BCR-2026-0416",
    received_at: "2026-10-23T13:47:00Z",
    candidates: ["V-10442", "V-10587"],
    channel: "email",
    claimed: "Science Applications International Corporation",
    letterhead: "Science Applications International Corporation",
    remit: { line1: "12010 Sunset Hills Rd", unit: null, city: "Reston", state: "VA", zip: "20190" },
    account: "000999000163",
    from: "ap@saic.example",
    replyTo: null,
    phone: null,
    invoices: ["INV-LDS-88412", "INV-LDS-88433"],
    signer: "D. Marchetti (fictional)",
    docs: 2,
  },
  S3: {
    id: "BCR-2026-0398",
    received_at: "2026-10-20T14:05:00Z",
    candidates: ["V-10198"],
    channel: "email",
    claimed: "L3Harris Technologies, Inc.",
    letterhead: "L3Harris Technologies, Inc.",
    remit: null,
    account: "000999000198",
    from: "treasury@l3harris.example",
    replyTo: null,
    phone: "(321) 555-0144",
    invoices: [],
    signer: "K. Albrecht (fictional)",
    docs: 2,
  },
  S4: {
    id: "BCR-2026-0418",
    received_at: "2026-10-23T16:30:00Z",
    candidates: ["V-10311"],
    channel: "email",
    claimed: "V2X, Inc.",
    letterhead: "Vectrus, Inc.",
    remit: { line1: "2100 Reston Parkway", unit: "Suite 300", city: "Reston", state: "VA", zip: "20191" },
    account: null,
    from: "ar@v2x.example",
    replyTo: null,
    phone: "(571) 555-0121",
    invoices: [],
    signer: "L. Haverford (fictional)",
    docs: 2,
  },
  S6b: {
    id: "BCR-2026-0431",
    received_at: "2026-10-26T12:58:00Z",
    candidates: ["V-10112"],
    channel: "email",
    claimed: "CACI Internationl Inc",
    letterhead: "CACI Internationl Inc",
    remit: { line1: "11487 Sunset Hills Rd", unit: null, city: "Reston", state: "VA", zip: null },
    account: "000999000420",
    from: "ap@caci-payments.example",
    replyTo: "caci.treasury.desk@remit-desk.example",
    phone: "(703) 555-0147",
    invoices: [],
    signer: null,
    docs: 2,
  },
  S6d: {
    id: "BCR-2026-0446",
    received_at: "2026-10-27T09:30:00Z",
    candidates: ["V-10198"],
    channel: "typed",
    claimed: "L3Harris Technologies, Inc.",
    letterhead: null,
    remit: null,
    account: "000999000141",
    from: "treasury@l3harris.example",
    replyTo: null,
    phone: null,
    invoices: [],
    signer: null,
    docs: 0,
  },
};

const domainOf = (email: string | null) => (email ? email.split("@")[1]! : null);

export function buildRequest(sc: Scenario): RequestRecord {
  const s = SPECS[sc];
  const hash = s.account ? accountHash("110000000", s.account) : null;
  const claims: ClaimSet = {
    claimed_name: s.claimed,
    letterhead_name: s.letterhead,
    remit_address: s.remit,
    bank: s.account ? { bank_name: null, routing: "110000000", account_last4: s.account.slice(-4) } : null,
    sender_email: s.from,
    sender_domain: domainOf(s.from),
    reply_to_domain: domainOf(s.replyTo),
    phones: s.phone ? [{ number: s.phone, quote: `Treasury Operations ${s.phone}` }] : [],
    effective_date: null,
    invoice_refs: s.invoices,
    signer_name: s.signer,
    pressure_phrases: [],
    watermark_text: `SYNTHETIC SAMPLE: not issued by ${s.claimed}`,
    fields: [],
    extraction_path: s.channel === "typed" ? "typed" : "sidecar",
  };
  return {
    request_id: s.id,
    received_at: s.received_at,
    claims,
    account_hash: hash,
    account_last4: s.account ? s.account.slice(-4) : null,
    candidate_vendor_ids: s.candidates,
    doc_ids: Array.from({ length: s.docs }, (_, i) => `DOC-${s.id}-${i + 1}`),
    channel: s.channel,
  };
}
