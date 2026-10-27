// Fact sheet (04 §8.2, REV-50): per-field status and the exact `why` templates. The UI never computes status.
import type { FactField, GateDecision, Observation, ReasonCode } from "../schemas/decision";
import type { PhonesAt } from "../schemas/tools";
import type { PolicyState } from "../orchestration/state";
import { claimedAddress, matchesFor } from "./address";
import { SOURCE_LABEL } from "./code-util";
import { bestObservation } from "./codes-cap";
import { edgarRegistrant } from "./callback";
import { formatAddress, nameNorm, phoneDisplay, registrable, tidy, toE164, toMs, lookalikeOf } from "./normalise";
import { acceptedEvidence, forVendor, onFileDomains, queriesOf, rowsOf, str, vendorRow } from "./rows";

type Sheet = GateDecision["fact_sheet"];
type Row = Sheet[number];
const LABELS: Record<FactField, string> = {
  legal_name: "Legal name",
  remit_address: "Remit-to address",
  bank_account: "Bank account",
  sender_domain: "Sender domain",
  callback_phone: "Call-back phone",
  invoice_refs: "Invoice references",
  parent: "Parent company (federal award ID, UEI)",
  registrant: "SEC registrant (company ID, CIK)",
};
export const FACT_ORDER: FactField[] = ["legal_name", "remit_address", "bank_account", "sender_domain", "callback_phone", "invoice_refs", "parent", "registrant"];
const MODE_RANK = ["live", "passthrough", "zetaris_cache", "mirror", "sample"];

const clean = (t: string): string => tidy(t.replace(/[{}]/g, "").replace(/\bnull\b/gi, "unknown").replace(/\s+/g, " ").trim());
const src = (o: Observation | undefined): string => (o ? SOURCE_LABEL[o.source] : "A record");

function obsFor(s: PolicyState, f: FactField): Observation[] {
  return acceptedEvidence(s)
    .filter((o) => o.field === f)
    .sort((a, b) => MODE_RANK.indexOf(a.mode) - MODE_RANK.indexOf(b.mode))
    .slice(0, 8);
}

function linkState(s: PolicyState, type: string): "approved" | "pending" | "rejected" | "none" {
  const ls = Object.values(s.links).filter((l) => l.type === type);
  if (ls.length === 0) return "none";
  if (ls.some((l) => l.status === "pending" || l.status === "proposed" || l.status === "ambiguous")) return "pending";
  if (ls.some((l) => l.status === "rejected")) return "rejected";
  return "approved";
}

export type FactOpts = { codes: ReasonCode[]; phonesAt: PhonesAt };

export function buildFactSheet(s: PolicyState, o: FactOpts): Sheet {
  const has = (c: string) => o.codes.some((x) => x.code === c);
  const multi = s.candidates.length >= 2;
  const vendor = s.candidates.length === 1 ? s.candidates[0]! : null;
  const vName = vendor?.legal_name ?? s.candidates.map((c) => c.legal_name).join(" or ") ?? "the vendor";
  const claims = s.claims;
  const rows: Sheet = [];
  const mk = (field: FactField, claimed: string | null, status: Row["status"], why: string): void => {
    rows.push({ field, label: LABELS[field], claimed, observations: obsFor(s, field), status: multi ? "ambiguous" : status, why: clean(why) });
  };

  // legal_name
  {
    const claimed = claims?.claimed_name ?? claims?.letterhead_name ?? null;
    if (!claimed) mk("legal_name", null, "gap", "The request does not state a company name.");
    else {
      const n = nameNorm(claimed);
      const hit = obsFor(s, "legal_name").find((x) => nameNorm(x.value) === n);
      const aliasHit = rowsOf(s, "T06a").some((r) => nameNorm(str(r.name_norm)) === n && ownKey(s, str(r.key)));
      if (hit) mk("legal_name", claimed, linkOk(s, "vendor_entity"), `${src(hit)} lists ${hit.value}; the request says ${claimed}.`);
      else if (aliasHit) mk("legal_name", claimed, "match", `${claimed} is a former or alternate name of ${vName}; the request says ${claimed}.`);
      else if (obsFor(s, "legal_name").length === 0) mk("legal_name", claimed, "gap", "No record was found to compare the name with.");
      else mk("legal_name", claimed, "mismatch", `No record for ${vName} uses the name ${claimed}.`);
    }
  }
  // remit_address
  {
    const a = claimedAddress(s);
    const claimed = claims?.remit_address ? formatAddress(claims.remit_address) : null;
    const r3 = o.codes.find((c) => c.code === "R3");
    if (!a) mk("remit_address", null, "gap", "The request does not state a remit-to address.");
    else if (r3) {
      const m = /belongs to (.+?) \(UEI ([A-Z0-9]+)\)/.exec(r3.detail);
      mk("remit_address", claimed, "mismatch", `This address belongs to ${m?.[1] ?? "another entity"} (UEI ${m?.[2] ?? "unknown"}), not our vendor.`);
    } else if (has("R2")) mk("remit_address", claimed, "mismatch", `No record lists ${claimed}.`);
    else {
      const m = matchesFor(s).find((x) => x.kind === "hard") ?? matchesFor(s)[0];
      const link = linkState(s, "remit_owner");
      if (m && (m.kind === "hard" || link === "approved")) mk("remit_address", claimed, "match", `${SOURCE_LABEL[m.addr.source]} lists ${m.addr.label}; the request says ${claimed}.`);
      else if (link === "pending") mk("remit_address", claimed, "ambiguous", `The match for ${claimed} has not been approved yet.`);
      else mk("remit_address", claimed, "gap", `No record could be compared with ${claimed}.`);
    }
  }
  // bank_account
  {
    const b = claims?.bank;
    const claimed = b ? `routing ${b.routing ?? "unknown"}, account ending ${s.extras.account_last4 ?? b.account_last4 ?? "unknown"}` : null;
    const r6 = o.codes.find((c) => c.code === "R6");
    if (!b) mk("bank_account", null, "gap", "The request does not change bank details.");
    else if (r6) {
      const m = /already on (.+?) \((.+?)\),/.exec(r6.detail);
      mk("bank_account", claimed, "mismatch", `The account is already on ${m?.[1] ?? "another owner"} (${m?.[2] ?? "unknown"}).`);
    } else mk("bank_account", claimed, "gap", "New account; not on any other vendor. Ownership is not verified.");
  }
  // sender_domain
  {
    const ds = [s.eml?.from_domain, s.eml?.reply_to_domain].filter((x): x is string => !!x);
    const claimed = ds.length ? [...new Set(ds)].join(", ") : null;
    if (!s.eml || ds.length === 0) mk("sender_domain", claimed, "gap", "No email headers were supplied.");
    else {
      const onFile = onFileDomains(s, s.candidates.map((c) => c.vendor_id));
      const bad = ds.find((d) => !onFile.map(registrable).includes(registrable(d)));
      if (bad) {
        const l = lookalikeOf(bad, onFile);
        mk("sender_domain", claimed, "mismatch", `${bad} is not on file for ${vName}${l ? `; it looks like ${l}` : ""}.`);
      } else mk("sender_domain", claimed, "match", `${ds[0]} is on file for ${vName}.`);
    }
  }
  // callback_phone
  {
    const phones = s.extras.request_phones;
    const claimed = phones.length ? phones.map(phoneDisplay).join(", ") : null;
    if (phones.length === 0) mk("callback_phone", null, "gap", "The request lists no phone number; the script uses the independent number.");
    else {
      const indep = new Set<string>();
      const pre = new Date(toMs(s.received_at) - 30 * 86_400_000).toISOString();
      for (const c of s.candidates) {
        const e = edgarRegistrant(s, c);
        if (e) indep.add(e.phone_e164);
        for (const w of o.phonesAt(c.vendor_id, pre)) indep.add(w.e164);
      }
      const bad = phones.find((p) => !indep.has(p));
      if (bad) mk("callback_phone", claimed, "mismatch", `${phoneDisplay(bad)} appears only on the request.`);
      else mk("callback_phone", claimed, "match", `The request's number is the independent number from ${src(bestObservation(s, "callback_phone"))}.`);
    }
  }
  // invoice_refs
  {
    const refs = claims?.invoice_refs ?? [];
    if (refs.length === 0) mk("invoice_refs", null, "gap", "No invoice references were claimed.");
    else {
      const t3 = rowsOf(s, "T03");
      const other = refs.map((r) => ({ r, row: t3.find((x) => str(x.invoice_no) === r) })).find((x) => x.row && vendor && str(x.row.vendor_id) !== vendor.vendor_id);
      const missing = refs.find((r) => !t3.some((x) => str(x.invoice_no) === r));
      if (other) mk("invoice_refs", refs.join(", "), "ambiguous", `${other.r} belongs to ${nameOf(s, str(other.row!.vendor_id))} (${str(other.row!.vendor_id)}).`);
      else if (missing && !vendor) mk("invoice_refs", refs.join(", "), "gap", `${missing} was not found in the ledger.`);
      else if (missing) mk("invoice_refs", refs.join(", "), "gap", `${missing} was not found in the ledger.`);
      else mk("invoice_refs", refs.join(", "), "match", `All ${refs.length} invoice references belong to ${vName}.`);
    }
  }
  // parent
  {
    const t5 = vendor ? vendorRow(s, vendor.vendor_id, "T05") : null;
    const puei = str(t5?.parent_uei);
    const pb = puei ? rowsOf(s, "T05b", (q) => q.params.parent_uei === puei)[0] : null;
    const link = linkState(s, "vendor_entity");
    if (has("I4") || link === "pending") mk("parent", null, "ambiguous", `USAspending lists more than one parent for ${vendor?.uei ?? "this entity"}.`);
    else if (puei && link === "approved") mk("parent", null, "match", `USAspending lists ${str(pb?.p_legal_name) ?? puei} (${puei}) as the parent.`);
    else mk("parent", null, "gap", "No parent record was found.");
  }
  // registrant
  {
    const t5 = vendor ? vendorRow(s, vendor.vendor_id, "T05") : null;
    const cik = str(t5?.cik);
    const link = linkState(s, "registrant");
    if (link === "pending") mk("registrant", null, "ambiguous", "The SEC registrant was found by ticker and is not yet approved.");
    else if (cik && link !== "rejected") mk("registrant", null, "match", `SEC EDGAR registrant ${cik} ${str(t5?.sec_name) ?? ""}.`);
    else mk("registrant", null, "gap", "No SEC registrant was found.");
  }
  void queriesOf;
  void forVendor;
  void toE164;
  return rows;
}

function linkOk(s: PolicyState, type: string): Row["status"] {
  const st = linkState(s, type);
  return st === "pending" ? "ambiguous" : "match";
}
function ownKey(s: PolicyState, key: string | null): boolean {
  if (!key) return false;
  return s.candidates.some((c) => (c.uei && key.startsWith(c.uei)) || (c.registrant_cik && key === c.registrant_cik));
}
function nameOf(s: PolicyState, id: string | null): string {
  return s.candidates.find((c) => c.vendor_id === id)?.legal_name ?? "another vendor";
}
