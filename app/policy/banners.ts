// Banners, output.summary and recommendations: fixed copy filled by policy code (spine §4.2, §4.6, REV-26, REV-66).
// The UI and CLI print `banner_text` verbatim and never build it.
import type { Decision, GateDecision, ReasonCode } from "../schemas/decision";
import { isoDate, money, tidy } from "./normalise";

export type BannerVariant = GateDecision["banner_variant"];

/** HOLD primary phrase = the first fired red code in the order R5, R3, R6, R4, R1, R2, R7. */
const HOLD_ORDER = ["R5", "R3", "R6", "R4", "R1", "R2", "R7"] as const;

export function holdPhrase(codes: ReasonCode[]): string {
  const first = HOLD_ORDER.map((c) => codes.find((x) => x.code === c)).find((c) => !!c);
  switch (first?.code) {
    case "R5": return "a detail in this request was used in a confirmed impersonation";
    case "R3": return "the new address belongs to a different company, not our vendor";
    case "R6": return "the new bank account is already on another vendor";
    case "R4":
      return first.variant === "link_rejected" || first.variant === "link_pending"
        ? "the request could not be tied to our vendor with approved evidence"
        : "we cannot tell which vendor this request is for";
    case "R1": return "it was sent from a domain we don't have on file";
    case "R2": return "the new address matches none of this company's known addresses";
    case "R7": return "the routing number fails the bank checksum";
    default: return "a control failed";
  }
}

export type BannerInput = {
  decision: Decision;
  codes: ReasonCode[];
  vendor_name: string | null;
  candidates: Array<{ vendor_id: string; vendor_name: string; item_count: number; amount_usd: number }>;
  claimed_name: string | null;
  vendor_item_count: number;
  vendor_amount_usd: number;
  payment_run_id: string;
  callback: { number_display: string; source_label: string } | null;
  callback_date: string | null;
};

export function variantFor(i: BannerInput): BannerVariant {
  if (i.candidates.length >= 2) return "multi_candidate";
  if (!i.vendor_name) return "no_vendor";
  if (i.decision === "CALLBACK_VERIFY" && !i.callback) return "no_number";
  return "standard";
}

export function bannerText(i: BannerInput): { text: string; variant: BannerVariant } {
  const variant = variantFor(i);
  const label =
    variant === "multi_candidate"
      ? `either ${i.candidates[0]!.vendor_name} or ${i.candidates[1]!.vendor_name}`
      : (i.vendor_name ?? "this requester");
  const noVendorLine = `${i.claimed_name ?? "This requester"} is not one of our vendors.`;
  let text: string;
  if (i.decision === "HOLD") {
    const head = `Hold: ${holdPhrase(i.codes)}.`;
    const items = `${i.vendor_item_count} payment(s) totalling ${money(i.vendor_amount_usd)} in ${i.payment_run_id} need review before release.`;
    text =
      variant === "no_vendor"
        ? `${head} ${noVendorLine}`
        : `${head} Do not change bank details for ${label}. ${items}`;
  } else if (i.decision === "CALLBACK_VERIFY") {
    if (variant === "no_vendor")
      text = i.callback
        ? `Call back first: ${i.claimed_name ?? "This requester"} is not one of our vendors, so there is nothing to change yet. Before onboarding or paying it, confirm through ${i.callback.number_display} (${i.callback.source_label}).`
        : `Call back first: ${i.claimed_name ?? "This requester"} is not one of our vendors, so there is nothing to change yet. No independent number was found: escalate to the contracting officer for a verified contact. Do not use the numbers on the request.`;
    else if (!i.callback)
      text = "Call back before changing anything. No independent number was found: escalate to the contracting officer for a verified contact. Do not use the numbers on the request.";
    else text = `Call back before changing anything. Use ${i.callback.number_display} (${i.callback.source_label}). Do not use the numbers on the request.`;
  } else {
    text = `Approve: every checked fact agrees, and an independent call-back confirmed the change on ${i.callback_date ?? "record"}.`;
  }
  return { text: tidy(text), variant };
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** output.summary (REV-66). */
export function summaryText(i: BannerInput): string {
  const variant = variantFor(i);
  const label = i.decision === "HOLD" ? "Hold" : i.decision === "CALLBACK_VERIFY" ? "Call back first" : "Approve";
  if (variant === "no_vendor") return tidy(`${label}: ${i.claimed_name ?? "This requester"} is not one of our vendors.`);
  if (variant === "multi_candidate") {
    const [a, b] = i.candidates;
    return tidy(`${label}: this request could be for ${a!.vendor_name} (${a!.vendor_id}) or ${b!.vendor_name} (${b!.vendor_id}). We cannot tell which vendor it is for.`);
  }
  const phrase =
    i.decision === "HOLD"
      ? holdPhrase(i.codes)
      : i.decision === "CALLBACK_VERIFY"
        ? "proof is incomplete until an independent call-back confirms the change"
        : "every checked fact agrees and an independent call-back confirmed the change";
  const id = i.candidates[0]?.vendor_id ?? "";
  return tidy(`${label}: ${i.vendor_name} (${id}). ${cap(phrase)}.`);
}

export const NEEDS_HUMAN_SUMMARY = "The letter could not be read. A person must review it.";
export const NEEDS_HUMAN_RECOMMENDATION = "Have a person read the letter and enter the claims.";
export const SYNTHETIC_NOTICE =
  "Internal records and letters are synthetic, made for this demo. Registry facts are real public data from USAspending and SEC EDGAR.";
export const SAMPLE_BANNER =
  "SAMPLE MODE: offline data captured 2026-10-27; no live Zetaris or Nemotron calls. Decisions are computed by the same policy code.";
export const mirrorLabel = (captured_at: string): string => `Registry mirror, captured ${captured_at}. Live source unavailable.`;
export const zetarisDownLabel = (captured_at: string): string => `Zetaris unreachable: evidence from offline captures dated ${captured_at}.`;
export const simulatedOutageLabel = (source: string): string => `Simulated outage of ${source} (test hook).`;

export type RecInput = {
  decision: Decision;
  vendor_id: string | null;
  callbacks: Array<{ number_display: string; number_source: "edgar_registrant" | "vendor_master_pre_window" }>;
  callback_date: string | null;
  no_number: boolean;
  findings: Array<{ item_id: string; vendor_name: string; amount_usd: number }>;
};
const srcShort = (s: "edgar_registrant" | "vendor_master_pre_window") => (s === "edgar_registrant" ? "SEC EDGAR" : "vendor master");

/** recommendations[]: plain actions; phones end " (demo scenario: do not call)" (REV-41). */
export function recommendations(r: RecInput): string[] {
  const out: string[] = [];
  const call = (c: RecInput["callbacks"][number]) => `Call ${c.number_display} (${srcShort(c.number_source)}) (demo scenario: do not call)`;
  if (r.decision === "APPROVE") out.push(`Apply the bank change for ${r.vendor_id} in the ERP (call-back confirmed ${r.callback_date ?? "on record"}).`);
  else if (r.decision === "CALLBACK_VERIFY") {
    for (const c of r.callbacks) out.push(`${call(c)} before changing anything.`);
    if (r.no_number) out.push("No independent number found; escalate to the contracting officer for a verified contact.");
  } else {
    out.push(r.vendor_id ? `Do not change bank details for ${r.vendor_id}.` : "Do not change bank details for this requester.");
    for (const c of r.callbacks) out.push(call(c));
    if (r.no_number) out.push("No independent number found; escalate to the contracting officer for a verified contact.");
    for (const f of r.findings) out.push(`Review ${f.item_id} (${f.vendor_name}, ${money(f.amount_usd)}) before release.`);
  }
  return out;
}

export const dateOf = isoDate;
