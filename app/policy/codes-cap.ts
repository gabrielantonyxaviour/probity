// Cap reason codes C1-C6 (spine §4.3, 04 §7.8).
import type { FactField, Mode, Observation, ReasonCode } from "../schemas/decision";
import type { PhonesAt } from "../schemas/tools";
import type { PolicyState } from "../orchestration/state";
import { mk, SOURCE_LABEL } from "./code-util";
import { recentEmailChange } from "./contacts";
import { daysBetween, isoDate, toMs } from "./normalise";
import { acceptedEvidence, evidenceIds, failedReads, queriesOf, rowsOf, str } from "./rows";

const DAY = 86_400_000;
const INDEPENDENT = new Set(["edgar_registrant", "vendor_master_pre_window"]);

/** T08 rows that clear C1 (B4: never a request phone). Used by C1 and by callback_evidence. */
export function qualifyingCallbacks(s: PolicyState) {
  const vendors = s.candidates.map((c) => c.vendor_id);
  const out: Array<{ row: Record<string, unknown>; query_id: string; idx: number }> = [];
  for (const q of queriesOf(s, "T08"))
    q.rows.forEach((row, idx) => {
      const phone = str(row.phone_e164);
      const ok =
        str(row.purpose) === "bank_change_callback" &&
        str(row.outcome) === "confirmed" &&
        INDEPENDENT.has(str(row.phone_source) ?? "") &&
        !!s.request_id &&
        str(row.request_id) === s.request_id &&
        vendors.includes(str(row.vendor_id) ?? "") &&
        !!str(row.called_at) &&
        toMs(str(row.called_at)!) > toMs(s.received_at) &&
        !!phone &&
        !s.extras.request_phones.includes(phone);
      if (ok) out.push({ row, query_id: q.query_id, idx });
    });
  return out;
}

export function c1(s: PolicyState): ReasonCode | null {
  if (qualifyingCallbacks(s).length > 0) return null;
  const ev = queriesOf(s, "T08").flatMap((q) => evidenceIds(s, q));
  return mk("C1", "No call-back to an independent number is on record for this request.", ev);
}

const modeLabel = (m: Mode, stale: boolean): string =>
  m === "mirror" ? "a registry mirror" : m === "sample" ? "an offline sample" : stale ? "a cache older than 24 hours" : "a non-live source";

/** Best observation per field by rank live > passthrough > zetaris_cache > mirror > sample (04 §8.2). */
const RANK: Mode[] = ["live", "passthrough", "zetaris_cache", "mirror", "sample"];
export function isLiveEnough(o: { mode: Mode; fetched_at: string }, nowMs: number): boolean {
  if (o.mode === "live" || o.mode === "passthrough") return true;
  return o.mode === "zetaris_cache" && nowMs - toMs(o.fetched_at) <= DAY;
}
export function bestObservation(s: PolicyState, field: FactField) {
  return acceptedEvidence(s)
    .filter((o) => o.field === field)
    .sort((a, b) => RANK.indexOf(a.mode) - RANK.indexOf(b.mode))[0];
}

/** C2 over the given decisive fields: per source, the best observation of the field must be live enough (04 §8.2). */
export function c2(s: PolicyState, decisive: FactField[], nowMs: number): ReasonCode | null {
  // F22: a source taken down by options.simulate_outage always caps the decision. Its own reads were not run; joined views
  // (T05 carries EDGAR columns) may still show cached values, which is not the same as the source answering.
  const down = s.options?.simulate_outage?.[0];
  if (down) {
    const src = down === "erp" ? "vendor_master" : down;
    return mk("C2", `${SOURCE_LABEL[src]} was not reachable during this check (simulated outage), so its evidence is unknown.`, []);
  }
  // A decisive read that failed outright: its facts are unknown, so the decision can at most ask for a call-back.
  const failed = failedReads(s);
  if (failed.length) {
    const src = failed[0]!.source;
    return mk("C2", `${SOURCE_LABEL[src]} could not be read during this check (${failed.map((f) => f.template_id).join(", ")}), so its evidence is unknown.`, []);
  }
  const bad: Observation[] = [];
  for (const f of decisive) {
    const bySource = new Map<string, Observation>();
    for (const o of acceptedEvidence(s).filter((x) => x.field === f && x.source !== "request")) {
      const cur = bySource.get(o.source);
      if (!cur || RANK.indexOf(o.mode) < RANK.indexOf(cur.mode)) bySource.set(o.source, o);
    }
    for (const best of bySource.values()) if (!isLiveEnough(best, nowMs)) bad.push(best);
  }
  if (bad.length === 0) {
    // Mirror of the APPROVE invariant (gate.ts): a run that fell back to captures or a mirror mid-way caps here, so it ends
    // as CALLBACK_VERIFY with a reason instead of a policy_invariant error (live S3 re-evaluation, 15:54Z).
    const degraded = s.partial_reasons.some((r) => r !== "rationale_fallback" && /degraded|fallback|unreachable|mirror|sample/.test(r));
    return degraded ? mk("C2", "Some evidence in this check came from offline captures because Zetaris did not answer in time, so not every fact is live.", []) : null;
  }
  const o = bad[0]!;
  const stale = o.mode === "zetaris_cache";
  return mk("C2", `${SOURCE_LABEL[o.source]} evidence is from ${modeLabel(o.mode, stale)}, not a live source.`, bad.map((b) => b.evidence_id));
}

export function c3(s: PolicyState): ReasonCode | null {
  const v = s.candidates.find((c) => !c.uei && !c.registrant_cik);
  if (!v || s.candidates.length !== 1) return null;
  return mk("C3", `${v.legal_name} has no federal or SEC identifier on file; only internal records can be checked.`);
}

export function c4(s: PolicyState): ReasonCode | null {
  return !s.extras.has_documents && !s.extras.has_eml ? mk("C4", "Claims were typed in, not read from a document.") : null;
}

export function c5(s: PolicyState, phonesAt: PhonesAt): ReasonCode | null {
  const at = s.received_at;
  const atMs = toMs(at);
  for (const c of s.candidates) {
    const rows = rowsOf(s, "T02", (q) => q.params.vendor_id === c.vendor_id);
    const q = queriesOf(s, "T02", (x) => x.params.vendor_id === c.vendor_id)[0];
    const recent = phonesAt(c.vendor_id, at).find((w) => toMs(w.valid_from) > atMs - 30 * DAY);
    if (recent) {
      const src = rows.find((r) => str(r.kind) === "phone" && str(r.valid_from) && toMs(str(r.valid_from)!) === toMs(recent.valid_from));
      return mk(
        "C5",
        `The vendor's phone on file was changed on ${isoDate(recent.valid_from)}, ${daysBetween(recent.valid_from, at)} days before the request (${str(src?.changed_via) ?? "unknown source"}).`,
        q ? evidenceIds(s, q, "callback_phone", str(src?.contact_id) ?? undefined) : [],
      );
    }
    const em = recentEmailChange(
      rows.map((r) => ({ kind: String(r.kind), value: String(r.value), valid_from: String(r.valid_from), valid_to: str(r.valid_to), changed_via: str(r.changed_via) })),
      at,
    );
    if (em)
      return mk("C5", `The vendor's email on file was changed on ${isoDate(em.valid_from)}, ${daysBetween(em.valid_from, at)} days before the request (${em.changed_via ?? "unknown source"}).`, q ? evidenceIds(s, q, "sender_domain") : []);
  }
  return null;
}

/** C7 (D1): the two independent readings of the letter disagree on a material field. A call-back does not clear it:
 *  Probity never approves a letter whose readings disagree on where the money goes; a person compares the letter. */
const C7_WORDS: Record<string, string> = { account_number: "account number", routing: "routing number", payee: "payee name", remit_address: "remit-to address", phones: "phone numbers" };
export function c7(s: PolicyState): ReasonCode | null {
  const d = s.extras.letter_reading;
  if (!d || d.status !== "disagree" || d.material_disagreements.length === 0) return null;
  const parts = d.fields.filter((f) => f.material && !f.agree).map((f) => `${C7_WORDS[f.field] ?? f.field} (text layer ${f.a ?? "none"}, rendered page ${f.b ?? "none"})`);
  return mk("C7", `The two independent readings of the letter disagree on the ${parts.join("; ")}.`);
}

export function c6(s: PolicyState): ReasonCode | null {
  if (s.options?.simulate_outage?.includes("erp")) return null; // the vendor master was down, not empty: C2 says so instead
  return s.candidates.length === 0 ? mk("C6", "No vendor of record matches this request.") : null;
}

