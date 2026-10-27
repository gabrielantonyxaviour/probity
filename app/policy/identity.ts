// Request attribution (F2, 04 §7.2): which vendor records can this request belong to?
// Score: domain_on_file 0.4 + invoice_ref 0.4 + (name_exact|alias_exact) 0.3 + name_fuzzy 0.15, capped at 1; keep >= 0.15.
// Hard iff domain_on_file AND (invoice_ref OR name_exact OR alias_exact).
import type { Candidate, QueryRecord } from "../orchestration/state";
import { nameNorm } from "./normalise";
// nameSimilarity is the vendored World Model export (04 §7.1), applied to name_norm values.
import { nameSimilarity } from "../engines/world-model/index";
import { str } from "./rows";

type Signal = Candidate["signals"][number];
export type AttributionInput = {
  claimed_names: string[]; // claimed_name and letterhead_name
  t03: QueryRecord[];
  t04: QueryRecord[]; // From then Reply-To
  t04b: QueryRecord[];
  alias: QueryRecord[]; // T06a-c
};

const W: Record<Signal, number> = { domain_on_file: 0.4, invoice_ref: 0.4, name_exact: 0.3, alias_exact: 0.3, name_fuzzy: 0.15 };

type Acc = { vendor_id: string; legal_name: string; uei: string | null; registrant_cik: string | null; signals: Set<Signal>; ev: Set<string>; qids: Set<string> };

export function attribute(inp: AttributionInput): Candidate[] {
  const byVendor = new Map<string, Acc>();
  const get = (id: string): Acc => {
    let a = byVendor.get(id);
    if (!a) {
      a = { vendor_id: id, legal_name: id, uei: null, registrant_cik: null, signals: new Set(), ev: new Set(), qids: new Set() };
      byVendor.set(id, a);
    }
    return a;
  };
  const learn = (a: Acc, r: Record<string, unknown>) => {
    if (str(r.legal_name)) a.legal_name = str(r.legal_name)!;
    if (str(r.uei)) a.uei = str(r.uei);
    if (str(r.registrant_cik)) a.registrant_cik = str(r.registrant_cik);
  };
  const names = inp.claimed_names.map(nameNorm).filter(Boolean);
  for (const q of inp.t03)
    for (const r of q.rows) {
      const id = str(r.vendor_id);
      if (!id) continue;
      const a = get(id);
      a.signals.add("invoice_ref");
      a.qids.add(q.query_id);
    }
  for (const q of inp.t04)
    for (const r of q.rows) {
      const id = str(r.vendor_id);
      if (!id) continue;
      const a = get(id);
      learn(a, r);
      a.signals.add("domain_on_file");
      a.qids.add(q.query_id);
    }
  for (const q of inp.t04b)
    for (const r of q.rows) {
      const id = str(r.vendor_id);
      if (!id) continue;
      const a = get(id);
      learn(a, r);
      const vn = str(r.name_norm) ?? nameNorm(str(r.legal_name));
      if (names.includes(vn)) a.signals.add("name_exact");
      else if (names.some((n) => nameSimilarity(n, vn) >= 0.82)) a.signals.add("name_fuzzy");
      a.qids.add(q.query_id);
    }
  for (const q of inp.alias)
    for (const r of q.rows) {
      const nn = nameNorm(str(r.name_norm) ?? str(r.name));
      if (!names.includes(nn)) continue;
      const key = str(r.key) ?? "";
      for (const a of byVendor.values()) {
        if ((a.uei && key.startsWith(a.uei)) || (a.registrant_cik && key === a.registrant_cik)) {
          a.signals.add("alias_exact");
          a.qids.add(q.query_id);
        }
      }
    }
  const out: Candidate[] = [];
  for (const a of byVendor.values()) {
    const sig = a.signals;
    const score = Math.min(
      1,
      (sig.has("domain_on_file") ? W.domain_on_file : 0) +
        (sig.has("invoice_ref") ? W.invoice_ref : 0) +
        (sig.has("name_exact") || sig.has("alias_exact") ? W.name_exact : 0) +
        (sig.has("name_fuzzy") ? W.name_fuzzy : 0),
    );
    if (score < 0.15) continue;
    const hard = sig.has("domain_on_file") && (sig.has("invoice_ref") || sig.has("name_exact") || sig.has("alias_exact"));
    out.push({
      vendor_id: a.vendor_id, legal_name: a.legal_name, uei: a.uei, registrant_cik: a.registrant_cik,
      signals: [...sig], score: Math.round(score * 100) / 100, hardness: hard ? "hard" : "soft", evidence_ids: [...a.qids],
    });
  }
  out.sort((x, y) => y.score - x.score || x.vendor_id.localeCompare(y.vendor_id));
  const hardOne = out.some((c) => c.hardness === "hard");
  if (hardOne && out.length > 1) {
    const kept = out.filter((c) => c.hardness === "hard" || c.signals.some((x) => x !== "name_fuzzy"));
    return kept;
  }
  return out;
}
