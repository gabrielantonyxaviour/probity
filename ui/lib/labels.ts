// Single source of display labels for facts, decisions, reasons and statuses (01 sections 11.2 to 11.5, 17.2, 17.3).
// Grok's copy tests import these constants. Trace, template and graph labels live in labels-trace.ts and labels-graph.ts.
import type { Decision, FactField, ReasonCodeId } from "@schemas/decision";

export type ReasonClass = "red" | "cap" | "info";

export type Tone = "agree" | "gap" | "conflict" | "info" | "neutral";

export const FACT_ORDER: readonly FactField[] = [
  "legal_name",
  "remit_address",
  "bank_account",
  "sender_domain",
  "callback_phone",
  "parent",
  "registrant",
  "invoice_refs",
] as const;

export const FACT_LABELS: Record<FactField, string> = {
  legal_name: "Legal name",
  remit_address: "Remit-to address",
  bank_account: "Bank account",
  sender_domain: "Sender domain",
  callback_phone: "Call-back phone",
  // Same words as the API's fact_sheet labels (app/policy/facts.ts), so a row keeps its name when the decision lands.
  parent: "Parent company (federal award ID, UEI)",
  registrant: "SEC registrant (company ID, CIK)",
  invoice_refs: "Invoice references",
};

export const SOURCE_LABELS = {
  request: "The request",
  vendor_master: "Our vendor master",
  usaspending: "USAspending",
  edgar: "SEC EDGAR",
} as const;
export type SourceKey = keyof typeof SOURCE_LABELS;

/** Fact-sheet column heads (01 section 7.1.5). */
export const FACT_COLUMNS = {
  fact: "Fact",
  claimed: "The request says",
  vendor_master: "Our vendor master",
  usaspending: "USAspending (federal awards)",
  edgar: "SEC EDGAR",
  result: "Result",
} as const;

export const ID_LABELS = {
  uei: "Federal award ID (UEI)",
  cik: "SEC company ID (CIK)",
  vendor_id: "Vendor ID",
  request_id: "Request",
  query_id: "Query ID",
  row_hash: "Row hash",
  sql_hash: "SQL hash",
} as const;

export const FACT_STATUS = {
  match: { glyph: "✓", word: "Agrees", tone: "agree" },
  gap: { glyph: "○", word: "Not found", tone: "gap" },
  mismatch: { glyph: "✕", word: "Conflicts", tone: "conflict" },
  ambiguous: { glyph: "⇄", word: "Ambiguous", tone: "conflict" },
} as const satisfies Record<string, { glyph: string; word: string; tone: Tone }>;

export const DECISION_UI = {
  HOLD: { word: "Hold", glyph: "✕", tone: "conflict", enum: "HOLD", chip: "✕ Hold" },
  CALLBACK_VERIFY: { word: "Call back first", glyph: "☎", tone: "gap", enum: "CALLBACK_VERIFY", chip: "☎ Call back first" },
  APPROVE: { word: "Approve", glyph: "✓", tone: "agree", enum: "APPROVE", chip: "✓ Approve" },
} as const satisfies Record<Decision, { word: string; glyph: string; tone: Tone; enum: string; chip: string }>;

export const DECISION_SUBLABEL = "decision on the bank-detail change";

/** Display order inside the Why groups (UI ordering only; the API order stays in the JSON). */
export const REASON_ORDER: Record<ReasonClass, readonly ReasonCodeId[]> = {
  red: ["R5", "R3", "R6", "R4", "R1", "R2", "R7"],
  cap: ["C1", "C5", "C2", "C3", "C4", "C6"],
  info: ["I1", "I2", "I3", "I4", "I5", "I6"],
};
export const CLASS_WORDS: Record<ReasonClass, string> = { red: "Blocks", cap: "Limits to call back", info: "Noted" };
export const CLASS_GLYPH: Record<ReasonClass, { glyph: string; tone: Tone }> = {
  red: { glyph: "✕", tone: "conflict" },
  cap: { glyph: "○", tone: "gap" },
  info: { glyph: "i", tone: "info" },
};

export const R4_TITLES = {
  multi_candidate: "Cannot determine which vendor this request is for. Do not guess.",
  name_multi_family: "Cannot determine which vendor this request is for. Do not guess.",
  link_rejected: "Identity Examiner rejected the link to our vendor",
  link_pending: "The link to our vendor was not examined, so it stays held",
} as const;

export const SAMPLE_R4_LINE =
  "Sample mode does not run the Examiner's model step, so soft links stay held. Live mode examines them with Nemotron 3 Ultra.";
export const SAMPLE_C2_LINE = "Sample mode never approves: captured data is not live evidence (C2).";

const REASON_TITLES: Record<ReasonCodeId, string> = {
  R1: "Sent from a domain we don't have on file",
  R2: "New remit-to address matches none of this company's known addresses",
  R3: "New address belongs to a different company, not our vendor",
  R4: R4_TITLES.multi_candidate,
  R5: "Used in a request later confirmed as an impersonation",
  R6: "This bank account is already on another vendor",
  R7: "Routing number fails the bank checksum",
  C1: "No call-back on an independent number yet",
  C2: "Some evidence comes from a captured copy, not the live source",
  C3: "Only our own records cover this vendor",
  C4: "Details were typed, not read from a document",
  C5: "Vendor phone or email changed on file shortly before the request",
  C6: "Not one of our vendors",
  I1: "Registries disagree on this company's address or name",
  I2: "Request uses a former company name",
  I3: "Subsidiary list has exactly 100 rows and may be cut off, so absence proves nothing",
  I4: "Registries list different parent companies",
  I5: "Registry record has a data gap",
  I6: "Request uses pressure language",
};

export function reasonTitle(
  code: ReasonCodeId,
  o: { variant?: keyof typeof R4_TITLES; lookalike?: boolean; sessionId?: string | null } = {},
): string {
  if (code === "R4") return R4_TITLES[o.variant ?? "multi_candidate"];
  if (code === "R1") return o.lookalike ? `${REASON_TITLES.R1} · lookalike` : REASON_TITLES.R1;
  if (code === "R5") {
    const where = o.sessionId ? `session ${o.sessionId}` : "earlier in this session";
    return `${REASON_TITLES.R5} (${where}).`;
  }
  return REASON_TITLES[code];
}

/** Status chips for the queue and the review head (01 section 11.5). */
export const STATUS_CHIPS = {
  none: { glyph: "○", word: "Not checked", tone: "neutral" },
  HOLD: { glyph: "✕", word: "Hold", tone: "conflict" },
  CALLBACK_VERIFY: { glyph: "☎", word: "Call back first", tone: "gap" },
  APPROVE: { glyph: "✓", word: "Approve", tone: "agree" },
  needs_human: { glyph: "○", word: "Needs a person", tone: "gap" },
  error: { glyph: "✕", word: "Stopped", tone: "conflict" },
  stopped: { glyph: "■", word: "Stopped by you", tone: "neutral" },
  partial: { glyph: "○", word: "Partial result", tone: "gap" },
} as const satisfies Record<string, { glyph: string; word: string; tone: Tone }>;

/** The ERP's own disposition of a request closed before Probity checked it (GET /requests erp_status). */
export const ERP_CHIPS = {
  applied: { glyph: "✓", word: "Applied in ERP", tone: "neutral" },
  rejected: { glyph: "✕", word: "Rejected in ERP", tone: "neutral" },
  withdrawn: { glyph: "–", word: "Withdrawn", tone: "neutral" },
} as const satisfies Record<string, { glyph: string; word: string; tone: Tone }>;
export type ErpClosed = keyof typeof ERP_CHIPS;
export const erpClosed = (s: string | null | undefined): s is ErpClosed => s === "applied" || s === "rejected" || s === "withdrawn";

export const CHANGE_LABELS = {
  bank: "Bank account",
  remit: "Remit-to address",
  both: "Bank account and remit-to address",
  typed: "Typed details",
} as const;

export const CHANNEL_LABELS = { email: "Email", vendor_portal: "Vendor portal", mail: "Mail", typed: "Typed" } as const;

export const PRESSURE_KINDS = {
  urgency: "Urgency",
  avoid_verification: "Avoid verification",
  secrecy: "Secrecy",
  new_contact: "New contact",
  embedded_instruction: "Instruction to an AI",
} as const;

export const FLAG_KEY_WORDS: Record<string, string> = {
  fraud_flag: "Impersonation flag",
  fraud_confirmed: "Confirmed impersonation",
  legitimate: "Confirmed legitimate",
};

export const SEVERITY_EDGE = { agree: "✓", conflict: "✕", gap: "○", info: "i", neutral: "" } as const;
