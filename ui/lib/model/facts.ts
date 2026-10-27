// Fact-sheet rows: the final rows come from the GateDecision; before the decision they are assembled from claims and
// `observation` events (01 sections 7.1.5, 17.4). Status and `why` are never computed here (UI law 1).
import type { ClaimSet, FactField, GateDecision, Observation, TraceEvent } from "../contracts";
import { FACT_LABELS, FACT_ORDER } from "../labels";
import type { LiveObservation } from "../run-store";

export const SOURCE_COLS = ["vendor_master", "usaspending", "edgar"] as const;
export type SourceCol = (typeof SOURCE_COLS)[number];
export type FactStatusKey = "match" | "mismatch" | "gap" | "ambiguous";

export type SourceCell = { source: SourceCol; observation: Observation | null; extra: number; blocked: boolean };
export type Provisional = "looking" | "scout" | "examiner";
export type FactRow = {
  field: FactField;
  label: string;
  claimed: string | null;
  claimIndexes: number[];
  cells: Record<SourceCol, SourceCell>;
  status: FactStatusKey | null;
  why: string | null;
  provisional: Provisional | null;
};

export function claimedValue(field: FactField, c: ClaimSet | null): string | null {
  if (!c) return null;
  switch (field) {
    case "legal_name":
      return c.claimed_name ?? c.letterhead_name;
    case "remit_address": {
      const a = c.remit_address;
      if (!a || !a.line1) return null;
      return [a.line1, a.unit, a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    }
    case "bank_account": {
      if (!c.bank) return null;
      const parts: string[] = [];
      if (c.bank.routing) parts.push(`Routing ${c.bank.routing}${c.bank.routing === "110000000" ? " (TEST ROUTING)" : ""}`);
      if (c.bank.account_last4) parts.push(`•••• ${c.bank.account_last4}${c.bank.routing === "110000000" ? " (TEST ACCOUNT)" : ""}`);
      return parts.join(" · ") || null;
    }
    case "sender_domain":
      return c.sender_domain ? (c.reply_to_domain && c.reply_to_domain !== c.sender_domain ? `${c.sender_domain} (Reply-To ${c.reply_to_domain})` : c.sender_domain) : null;
    case "callback_phone":
      return c.phones.length ? c.phones.map((p) => p.number).join(", ") : null;
    case "invoice_refs":
      return c.invoice_refs.length ? c.invoice_refs.join(", ") : null;
    default:
      return null;
  }
}

export function claimIndexesFor(field: FactField, c: ClaimSet | null): number[] {
  if (!c) return [];
  const out: number[] = [];
  c.fields.forEach((f, i) => {
    if (f.fact_field === field) out.push(i);
  });
  return out;
}

function emptyCells(): Record<SourceCol, SourceCell> {
  return {
    vendor_master: { source: "vendor_master", observation: null, extra: 0, blocked: false },
    usaspending: { source: "usaspending", observation: null, extra: 0, blocked: false },
    edgar: { source: "edgar", observation: null, extra: 0, blocked: false },
  };
}

function fillCells(cells: Record<SourceCol, SourceCell>, obs: Observation[]) {
  for (const o of obs) {
    if (o.source === "request") continue;
    const cell = cells[o.source];
    if (!cell.observation) {
      cell.observation = o;
      cell.blocked = !o.query_id;
    } else cell.extra += 1;
  }
}

export function provisionalMarkers(trace: TraceEvent[]): Map<FactField, Provisional> {
  const m = new Map<FactField, Provisional>();
  for (const e of trace) {
    if (!e.field) continue;
    if (e.action === "gap_request") m.set(e.field, "looking");
    else if (e.action === "record_finding" && /^contradicts/i.test(e.output_summary)) m.set(e.field, "scout");
    else if (e.action === "raise_conflict" || e.action === "reject_link" || e.action === "block_fact") m.set(e.field, "examiner");
  }
  return m;
}

export function buildFactRows(a: {
  decision: GateDecision | null;
  claims: ClaimSet | null;
  observations: LiveObservation[];
  trace: TraceEvent[];
}): FactRow[] {
  if (a.decision) {
    const byField = new Map(a.decision.fact_sheet.map((r) => [r.field, r]));
    return FACT_ORDER.filter((f) => byField.has(f)).map((field) => {
      const r = byField.get(field)!;
      const cells = emptyCells();
      fillCells(cells, r.observations);
      return {
        field,
        label: r.label || FACT_LABELS[field],
        claimed: r.claimed,
        claimIndexes: claimIndexesFor(field, a.claims),
        cells,
        status: r.status,
        why: r.why,
        provisional: null,
      };
    });
  }
  const marks = provisionalMarkers(a.trace);
  return FACT_ORDER.map((field) => {
    const cells = emptyCells();
    fillCells(cells, a.observations.filter((o) => o.field === field).map((o) => o.observation));
    return {
      field,
      label: FACT_LABELS[field],
      claimed: claimedValue(field, a.claims),
      claimIndexes: claimIndexesFor(field, a.claims),
      cells,
      status: null,
      why: null,
      provisional: marks.get(field) ?? null,
    };
  });
}
