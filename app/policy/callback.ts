// Call-back number selection: the provenance rule (spine §4.5, F9) and callback_evidence (REV-46).
import type { GateDecision } from "../schemas/decision";
import type { PhonesAt } from "../schemas/tools";
import type { Candidate, PolicyState } from "../orchestration/state";
import { qualifyingCallbacks } from "./codes-cap";
import { phoneHistory, type ContactRow } from "./contacts";
import { daysBetween, formatAddress, isoDate, phoneDisplay, tidy, toE164, toMs } from "./normalise";
import { acceptedEvidence, forVendor, queriesOf, rowsOf, str, vendorRow } from "./rows";

export type CallbackScript = GateDecision["callback_scripts"][number];
export const NO_NUMBER_LIMITATION = "No independent number found; escalate to the contracting officer for a verified contact.";
const DAY = 86_400_000;

export type EdgarRegistrant = { cik: string; phone_e164: string; fetched_at: string };

/** The EDGAR registrant phone for a candidate: T05's sec_phone, else a registered registrant (J5) when supplied. */
export function edgarRegistrant(s: PolicyState, c: Candidate | null, extra?: EdgarRegistrant | null): EdgarRegistrant | null {
  if (c) {
    const q = queriesOf(s, "T05", forVendor(c.vendor_id))[0];
    const r = q?.rows[0];
    const phone = toE164(str(r?.sec_phone));
    if (q && r && phone && str(r.cik)) return { cik: str(r.cik)!, phone_e164: phone, fetched_at: q.fetched_at };
  }
  return extra ?? null;
}

function doNotUse(s: PolicyState, vendorId: string | null, eligible: Set<string>, phonesAt: PhonesAt, rowsFor: ContactRow[]) {
  const out: CallbackScript["do_not_use"] = [];
  const seen = new Set<string>();
  const add = (e164: string, reason: string) => {
    if (eligible.has(e164) || seen.has(e164)) return;
    seen.add(e164);
    out.push({ number_display: phoneDisplay(e164), reason });
  };
  for (const e164 of s.extras.request_phones) add(e164, "appears only on the request");
  if (vendorId) {
    const at = s.received_at;
    const hist = rowsFor.length ? phoneHistory(rowsFor) : phonesAt(vendorId, at);
    for (const w of hist) {
      const from = toMs(w.valid_from);
      if (from <= toMs(at) && from > toMs(at) - 30 * DAY && (w.valid_to === null || toMs(w.valid_to) > toMs(at) - 30 * DAY)) {
        add(w.e164, `changed on file ${isoDate(w.valid_from)}, ${daysBetween(w.valid_from, at)} days before the request`);
      }
    }
  }
  return out;
}

export function scriptLines(s: PolicyState, number_display: string, label: string, dnu: CallbackScript["do_not_use"]): string[] {
  const lines = [
    dnu.length
      ? `Call ${number_display} (${label}). Do not use ${dnu.map((d) => d.number_display).join(", ")}.`
      : `Call ${number_display} (${label}).`,
    "Ask for accounts receivable or treasury. Do not read out the new details first.",
    "Ask them to state the bank name and the last four digits of the account they expect us to pay.",
  ];
  const a = s.claims?.remit_address;
  if (a?.line1) lines.push(`Ask them to state the remit-to address they expect. Compare it with: ${formatAddress(a)}.`);
  const pp = s.claims?.pressure_phrases ?? [];
  if (pp.length) {
    const avoid = pp.find((p) => p.kind === "avoid_verification");
    lines.push(
      avoid
        ? `The request asked you to avoid the number on file ("${avoid.quote}"). Treat that as a warning sign.`
        : `The request contained pressure language ("${pp[0]!.quote}"). Treat that as a warning sign.`,
    );
  }
  lines.push("Record the outcome in Probity: confirmed, denied or no answer.");
  return lines.map(tidy);
}

/** One script per target vendor (R4 with >=2 candidates gives one each). Returns [] plus a limitation when none is eligible. */
export function selectCallback(
  s: PolicyState,
  phonesAt: PhonesAt,
  opts: { registrantFor?: (c: Candidate | null) => EdgarRegistrant | null } = {},
): { scripts: CallbackScript[]; limitations: string[] } {
  const targets: Array<Candidate | null> = s.candidates.length ? s.candidates : [null];
  const scripts: CallbackScript[] = [];
  const limitations: string[] = [];
  const preWindow = new Date(toMs(s.received_at) - 30 * DAY).toISOString();
  for (const c of targets) {
    const rowsFor: ContactRow[] = c
      ? rowsOf(s, "T02", forVendor(c.vendor_id)).map((r) => ({
          kind: String(r.kind), value: String(r.value), valid_from: String(r.valid_from), valid_to: str(r.valid_to), changed_via: str(r.changed_via),
        }))
      : [];
    const edgar = edgarRegistrant(s, c, opts.registrantFor?.(c) ?? null);
    const pre = c ? phonesAt(c.vendor_id, preWindow) : [];
    const eligible = new Set<string>([...(edgar ? [edgar.phone_e164] : []), ...pre.map((w) => w.e164)]);
    const dnu = doNotUse(s, c?.vendor_id ?? null, eligible, phonesAt, rowsFor);
    if (edgar) {
      const label = `SEC EDGAR submissions, CIK ${edgar.cik}, fetched ${edgar.fetched_at}`;
      scripts.push({
        for_vendor_id: c?.vendor_id ?? null, vendor_name: c?.legal_name ?? null, number_e164: edgar.phone_e164,
        number_display: phoneDisplay(edgar.phone_e164), number_source: "edgar_registrant", source_ref: `CIK ${edgar.cik}`,
        source_label: label, valid_since: null, do_not_use: dnu, lines: scriptLines(s, phoneDisplay(edgar.phone_e164), label, dnu),
      });
    } else if (pre[0] && c) {
      const w = pre[0];
      const label = `Vendor master, on file since ${isoDate(w.valid_from)}`;
      scripts.push({
        for_vendor_id: c.vendor_id, vendor_name: c.legal_name, number_e164: w.e164, number_display: phoneDisplay(w.e164),
        number_source: "vendor_master_pre_window", source_ref: c.vendor_id, source_label: label, valid_since: w.valid_from,
        do_not_use: dnu, lines: scriptLines(s, phoneDisplay(w.e164), label, dnu),
      });
    }
  }
  if (scripts.length === 0) limitations.push(NO_NUMBER_LIMITATION);
  return { scripts, limitations };
}

/** The T08 rows that clear C1 (REV-46). `[]` when C1 stands. */
export function callbackEvidence(s: PolicyState): GateDecision["callback_evidence"] {
  const obs = acceptedEvidence(s);
  return qualifyingCallbacks(s).flatMap(({ row, query_id }) => {
    const log_id = str(row.log_id);
    const e164 = str(row.phone_e164);
    const ev = obs.find((o) => o.query_id === query_id && o.field === "callback_phone" && o.row_key === log_id);
    const src = str(row.phone_source);
    if (!log_id || !e164 || !ev || (src !== "edgar_registrant" && src !== "vendor_master_pre_window")) return [];
    return [{
      log_id, vendor_id: str(row.vendor_id)!, phone_e164: e164, phone_display: phoneDisplay(e164), phone_source: src,
      outcome: "confirmed" as const, called_at: str(row.called_at)!, called_by: str(row.called_by) ?? "unknown", query_id, evidence_id: ev.evidence_id,
    }];
  });
}

/** Pure oracle for the World Model port (REV-55): phones on file at `at` from the T02 rows in state. */
export function phonesOnFileFromState(s: PolicyState): PhonesAt {
  return (vendor_id, at) => {
    const rows = rowsOf(s, "T02", forVendor(vendor_id)).map((r) => ({
      kind: String(r.kind), value: String(r.value), valid_from: String(r.valid_from), valid_to: str(r.valid_to),
    }));
    return phoneWindowsAt(rows, at);
  };
}
import { phonesOnFileAt as phoneWindowsAt } from "./contacts";
export { vendorRow };
