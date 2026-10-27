// Graph labels: node types, edge types, context sources, flags (01 sections 9.1 to 9.4, 17.5).
import type { EntityType, GraphFlag } from "@schemas/graph";

export const COLUMNS = [
  { id: "request", label: "The request", x: 0 },
  { id: "erp", label: "Our records", x: 300 },
  { id: "usaspending", label: "USAspending", x: 600 },
  { id: "edgar", label: "SEC EDGAR", x: 900 },
] as const;
export type ColumnId = (typeof COLUMNS)[number]["id"];

export const NODE_TYPE_WORDS: Record<EntityType, string> = {
  request: "Request",
  document: "Document",
  claimed_party: "Claimed party",
  vendor_record: "Vendor record",
  legal_entity: "Legal entity",
  sec_registrant: "SEC filer",
  bank_account: "Bank account",
  address: "Address",
  phone: "Phone",
  domain: "Email domain",
};

export const EDGE_LABELS: Record<string, string> = {
  claims_to_be: "claims to be",
  candidate_vendor: "could be vendor",
  requests_pay_to: "asks us to pay into",
  requests_remit_to: "asks us to remit to",
  sent_from: "sent from",
  lists_phone: "lists phone",
  documented_by: "document",
  same_as: "is legal entity",
  child_of: "subsidiary of",
  registered_as: "SEC filer",
  pays_to: "we pay into",
  uses_domain: "emails from",
  reachable_at: "phone on file",
  located_at: "located at",
};

export function edgeLabel(type: string, context: string): string {
  if (type === "reachable_at" && context.startsWith("src:edgar")) return "registered phone";
  return EDGE_LABELS[type] ?? type.replace(/_/g, " ");
}

export function contextLabel(context: string): string {
  if (context === "src:erp") return "Vendor master";
  if (context === "src:usa_detail") return "USAspending detail";
  if (context.startsWith("src:usa_parents:")) return `USAspending parent list of ${context.split(":")[2]}`;
  if (context.startsWith("src:usa_children:")) return `USAspending subsidiaries of ${context.split(":")[2]}`;
  if (context === "src:edgar_business") return "EDGAR business address";
  if (context === "src:edgar_mailing") return "EDGAR mailing address";
  if (context === "src:edgar") return "SEC EDGAR";
  if (context.startsWith("cand:")) return "Candidate vendor";
  if (context.startsWith("src:request:")) return "On the request";
  return context;
}

/** Tag text per node flag (01 section 9.4). `conflict` and `ambiguous` render as badges instead. */
export const FLAG_TAGS: Record<GraphFlag, { tag: string; tone: "agree" | "gap" | "conflict" | "info" | "neutral"; fill?: boolean }> = {
  conflict: { tag: "Conflict", tone: "conflict" },
  ambiguous: { tag: "Possible vendor", tone: "conflict" },
  lookalike: { tag: "Lookalike", tone: "conflict" },
  fraud_confirmed: { tag: "Confirmed impersonation", tone: "conflict", fill: true },
  legitimate: { tag: "Confirmed legitimate", tone: "agree" },
  recent_change: { tag: "Recent change", tone: "gap" },
  do_not_use: { tag: "Do not use", tone: "conflict" },
  callback_number: { tag: "Call-back number", tone: "agree" },
  not_vendor_of_record: { tag: "Not our vendor", tone: "conflict" },
  new_this_run: { tag: "Discovered this run", tone: "info" },
  resolved: { tag: "Resolved", tone: "neutral" },
  dq_invalid: { tag: "Registry data gap", tone: "gap" },
  real_registry: { tag: "Real registry", tone: "neutral" },
};

export const LEGEND = [
  "Dashed box: claimed by the request",
  "Solid box: recorded by a source",
  "✓ green: link approved",
  "✕ red: rejected link or conflicting fact",
  "? amber: not yet examined",
  "Grey: superseded (history)",
  "Confirmed impersonation: from an earlier session",
] as const;

export const EDGE_STATE_WORDS = {
  recorded: "Recorded",
  claimed: "Claimed",
  approved: "Approved",
  rejected: "Rejected",
  pending: "Not yet examined",
  superseded: "Superseded",
} as const;

export const LEVEL_WORDS = { P: "parent", C: "subsidiary", R: "recipient" } as const;
