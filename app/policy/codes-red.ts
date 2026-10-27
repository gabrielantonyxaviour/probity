// Red reason codes R1-R7 (spine §4.3, 04 §7.8). Pure: computeCodes feeds them the run state.
import type { ReasonCode } from "../schemas/decision";
import type { PolicyState } from "../orchestration/state";
import { claimedAddress, listCapped, matchesFor, t11Matches } from "./address";
import { isValidAba } from "./aba";
import { mk } from "./code-util";
import { lookalikeOf, registrable, formatAddress, nameNorm } from "./normalise";
import { evidenceIds, failedReads, onFileDomains, queriesOf, rowsOf, str, type Row } from "./rows";

/** Plain words for a link type in reason text (an AP clerk reads it; no snake_case field names). */
const linkWords = (type: string): string => (type === "remit_owner" ? "remit-address owner" : type.replace(/_/g, " "));

export type RedOpts = { atDecide: boolean; sampleMode: boolean };
const names = (s: PolicyState): string => s.candidates.map((c) => c.legal_name).join(" or ") || "the vendor";

export function r1(s: PolicyState): ReasonCode | null {
  if (!s.eml || s.candidates.length === 0) return null;
  const ids = s.candidates.map((c) => c.vendor_id);
  // The on-file domains come from T01. If that read failed, they are unknown, not "none" (C2 reports the failed read).
  if (failedReads(s).some((f) => f.template_id === "T01")) return null;
  const onFile = onFileDomains(s, ids);
  const reg = onFile.map(registrable);
  const senders = [s.eml.from_domain, s.eml.reply_to_domain].filter((d): d is string => !!d);
  const bad = senders.find((d) => !reg.includes(registrable(d)));
  if (!bad) return null;
  const imitates = lookalikeOf(bad, onFile);
  const ev = ids.flatMap((v) => {
    const q = queriesOf(s, "T01", (x) => x.params.vendor_id === v)[0];
    return q ? evidenceIds(s, q, "sender_domain") : [];
  });
  const detail = `Sender domain ${bad} is not on file for ${names(s)} (on file: ${onFile.join(", ") || "none"})${
    imitates ? `; it imitates ${imitates}` : ""
  }.`;
  return mk("R1", detail, ev);
}

/** A tier-2 read for the claimed address was attempted and failed: the address could not be checked. */
export function tier2Failed(s: PolicyState): boolean {
  return Object.values(s.queries).some((q) => (q.template_id === "T11" || q.template_id === "T10") && q.status === "error");
}

export function r2(s: PolicyState): ReasonCode | null {
  const claimed = claimedAddress(s);
  if (!claimed || s.candidates.length === 0) return null;
  if (tier2Failed(s)) return null; // reported as R4 link_pending: the claim "matches nothing" would be unsupported
  if (failedReads(s).some((f) => ["T01", "T05", "T05b", "T07"].includes(f.template_id))) return null; // addresses unknown: C2
  const hasRegistry = s.candidates.some((c) => c.uei || c.registrant_cik);
  if (!hasRegistry) return null;
  const approvedSoft = (to: string) => Object.values(s.links).some((l) => l.type === "remit_owner" && l.status === "approved" && l.to === to);
  const ok = matchesFor(s).some((m) => m.kind === "hard" || approvedSoft(`addr:${m.addr.parts.key}`));
  if (ok) return null;
  if (listCapped(s)) return null; // I3 instead
  const family = s.candidates[0]!.legal_name;
  return mk("R2", `The claimed remit address ${formatAddress(s.claims!.remit_address!)} matches no address on file or in USAspending or SEC EDGAR for the ${family} family.`);
}

/** R3: a hard address match on an entity whose uei differs from the vendor's and that no vendor row carries. */
export function r3(s: PolicyState): { code: ReasonCode; row: Row; query_id: string } | null {
  const v = s.candidates.length === 1 ? s.candidates[0]! : null;
  if (!v) return null;
  for (const m of t11Matches(s)) {
    if (m.kind !== "hard") continue;
    const mu = str(m.row.matched_uei);
    if (!mu || mu === v.uei) continue;
    if (str(m.row.vendor_id_on_file)) continue;
    const q = s.queries[m.query_id]!;
    const rk = str(m.row.row_key) ?? undefined;
    const ev = evidenceIds(s, q, "remit_address", rk);
    const detail = `The claimed remit address belongs to ${str(m.row.matched_name)} (UEI ${mu}), a different entity that is not our vendor of record (${v.vendor_id}, UEI ${v.uei ?? "unknown"}).`;
    return { code: mk("R3", detail, ev), row: m.row, query_id: m.query_id };
  }
  return null;
}

export function linkVendorId(s: PolicyState, l: { from: string; to: string }): string {
  const v = [l.to, l.from].find((x) => x.startsWith("vendor:"));
  return v ? v.slice(7) : (s.candidates[0]?.vendor_id ?? "the vendor");
}

export function r4(s: PolicyState, o: RedOpts): ReasonCode | null {
  if (s.candidates.length >= 2)
    return mk("R4", "Cannot determine which vendor this request is for. Do not guess.", [], { variant: "multi_candidate" });
  if (s.extras.j5_families.length >= 2 && s.candidates.length === 0)
    return mk("R4", "Cannot determine which vendor this request is for. Do not guess.", [], { variant: "name_multi_family" });
  const links = Object.values(s.links).filter((l) => l.required);
  const rej = links.find((l) => l.status === "rejected");
  if (rej) {
    const vendor = linkVendorId(s, rej);
    const reason = rej.verdicts.at(-1)?.rationale || rej.rule_hits.join(", ") || "evidence did not support it";
    return mk("R4", `Identity Examiner rejected the ${linkWords(rej.type)} link for ${vendor}: ${reason}.`, rej.evidence_ids, { variant: "link_rejected" });
  }
  if (o.atDecide && s.candidates.length === 1 && claimedAddress(s) && tier2Failed(s) && !matchesFor(s).some((m) => m.kind === "hard")) {
    const suffix = o.sampleMode ? " Sample mode does not run the Examiner's model step." : "";
    return mk("R4", `The ${linkWords("remit_owner")} link for ${s.candidates[0]!.vendor_id} was not examined, so it stays held.${suffix}`, [], { variant: "link_pending" });
  }
  if (o.atDecide) {
    const pend = links.find((l) => l.status === "pending" || l.status === "proposed");
    if (pend) {
      const vendor = linkVendorId(s, pend);
      const suffix = o.sampleMode ? " Sample mode does not run the Examiner's model step." : "";
      return mk("R4", `The ${linkWords(pend.type)} link for ${vendor} was not examined, so it stays held.${suffix}`, pend.evidence_ids, { variant: "link_pending" });
    }
  }
  return null;
}

export function r5(s: PolicyState): ReasonCode | null {
  const hit = s.recalls.find((r) => r.engine === "world_model" && r.effect.startsWith("R5"));
  if (!hit) return null;
  return mk("R5", `Used in a request later confirmed as an impersonation (session ${hit.session_id}).`);
}

export function r6(s: PolicyState): ReasonCode | null {
  const vendors = s.candidates.map((c) => c.vendor_id);
  const cands: Array<{ q: ReturnType<typeof queriesOf>[number]; r: Row; idx: number }> = [];
  for (const q of queriesOf(s, "T07"))
    q.rows.forEach((r, idx) => {
      const via = str(r.via);
      const owner = str(r.owner_vendor_id);
      const rid = str(r.request_id);
      const mine = (owner ?? rid ?? "");
      if (via === "vendor_bank_account" && owner && !vendors.includes(owner)) cands.push({ q, r, idx });
      else if (via === "bank_change_request" && rid && rid !== s.request_id && !vendors.includes(mine)) cands.push({ q, r, idx });
    });
  if (cands.length === 0) return null;
  cands.sort((a, b) => (str(a.r.via) === "vendor_bank_account" ? 0 : 1) - (str(b.r.via) === "vendor_bank_account" ? 0 : 1));
  const { q, r } = cands[0]!;
  const last4 = s.extras.account_last4 ?? "????";
  const otherId = str(r.owner_vendor_id) ?? str(r.request_id) ?? "unknown";
  const otherName = str(r.vendor_name) ?? (str(r.via) === "bank_change_request" ? "another request" : otherId);
  const when = (str(r.at_ts) ?? "").slice(0, 10) || "an unknown date";
  const status = str(r.status) ?? "recorded";
  const rk = str(r.bank_account_id) ?? str(r.request_id) ?? undefined;
  return mk("R6", `The requested account (ending ${last4}) is already on ${otherName} (${otherId}), ${status} since ${when}.`, evidenceIds(s, q, "bank_account", rk));
}

export function r7(s: PolicyState): ReasonCode | null {
  const routing = s.claims?.bank?.routing ?? null;
  const t08b = rowsOf(s, "T08b").find((r) => str(r.routing_check) === "invalid");
  const localBad = routing !== null && !isValidAba(routing);
  if (!t08b && !localBad) return null;
  const q = queriesOf(s, "T08b")[0];
  return mk("R7", `Routing number ${routing ?? str(t08b?.new_routing) ?? "unknown"} is not a valid ABA routing number (DQ3 request_routing_valid).`, q ? evidenceIds(s, q) : []);
}

/** R8 (D6): the request contains text addressed to an automated reviewer. The detail never repeats that text: it goes to the
 *  rationale writer, and the spans themselves are in decision.injection for the UI. */
export function r8(s: PolicyState): ReasonCode | null {
  const counted = s.extras.injection?.spans.filter((x) => x.counted) ?? [];
  const legacy = counted.length === 0 && !s.extras.injection ? (s.claims?.pressure_phrases ?? []).filter((p) => p.kind === "embedded_instruction").length : 0;
  if (counted.length === 0 && legacy === 0) return null;
  const hidden = counted.filter((x) => x.hidden).length;
  const page = counted.filter((x) => !x.hidden && x.channel !== "email_body").length;
  const email = counted.filter((x) => x.channel === "email_body").length;
  const parts = [
    hidden ? `${hidden} hidden line${hidden === 1 ? "" : "s"} in the PDF text layer (white, 1 pt, not visible on the page)` : null,
    page ? `${page} line${page === 1 ? "" : "s"} on the page` : null,
    email ? `${email} paragraph${email === 1 ? "" : "s"} in the email body` : null,
    legacy ? `${legacy} quoted passage${legacy === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return mk("R8", `The request contains text addressed to an automated reviewer: ${parts.join(", ")}. It was quoted and ignored.`, [], { variant: hidden ? "hidden" : "visible" });
}

/** name_multi_family helper used by the G2 floor: groups exact-name registry candidates by family key. */
export const familyKey = (parent: string | null, uei: string): string => parent ?? uei;
export const sameName = (a: string | null | undefined, b: string | null | undefined): boolean => !!a && !!b && nameNorm(a) === nameNorm(b);

export function computeRed(s: PolicyState, o: RedOpts): ReasonCode[] {
  return [r1(s), r2(s), r3(s)?.code ?? null, r4(s, o), r5(s), r6(s), r7(s), r8(s)].filter((c): c is ReasonCode => c !== null);
}
