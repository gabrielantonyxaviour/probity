// Observation building and the model-facing projection for C2 (03 §7.6). One row can yield several observations;
// the evidence-id row slot is a running counter per (query, fieldcode) so ids stay unique (spine §9.1, REV-25).
import type { Mode, Observation } from "../schemas/decision";
import type { QueryRecord } from "../schemas/run-state";
import type { ObservationRule } from "./template-kit.port";

export function buildObservations(
  rules: ObservationRule[],
  rec: Pick<QueryRecord, "query_id" | "template_id" | "sql_hash" | "row_hash" | "fetched_at" | "latency_ms" | "rows"> & { mode: Mode },
): Observation[] {
  const out: Observation[] = [];
  const slot = new Map<string, number>();
  const q8 = rec.query_id.replace(/-/g, "").slice(0, 8);
  rec.rows.forEach((row) => {
    for (const rule of rules) {
      if (rule.when && !rule.when(row)) continue;
      const value = rule.value(row);
      if (value === null || value === undefined || value === "") continue;
      const n = slot.get(rule.fieldcode) ?? 0;
      slot.set(rule.fieldcode, n + 1);
      out.push({
        evidence_id: `ev-${q8}-${n}-${rule.fieldcode}`,
        field: rule.field,
        source: rule.source,
        value,
        row_key: rule.row_key(row),
        template_id: rec.template_id,
        query_id: rec.query_id,
        sql_hash: rec.sql_hash,
        row_hash: rec.row_hash ?? "",
        mode: rec.mode,
        fetched_at: rec.fetched_at,
        latency_ms: rec.latency_ms,
      });
    }
  });
  return out;
}

/** Rows shown to a model: projected to llm_columns, at most 10, account hashes shortened to 12 chars. */
export function projectForModel(rows: Record<string, unknown>[], columns: string[]): Record<string, unknown>[] {
  return rows.slice(0, 10).map((r) => {
    const o: Record<string, unknown> = {};
    for (const c of columns.length ? columns : Object.keys(r)) {
      let v = r[c];
      if (/hash/.test(c) && typeof v === "string" && v.length > 12) v = `${v.slice(0, 12)}…`;
      if (v !== undefined) o[c] = v;
    }
    return o;
  });
}

const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/** One readable line per query for the trace (the demo reads these: "41 -> 1 in NJ"). */
export function summariseRows(template_id: string, rows: Record<string, unknown>[], params: Record<string, unknown>): string {
  const r = rows[0];
  const n = rows.length;
  if (n === 0) return "rows=0";
  switch (template_id) {
    case "T05":
      return `rows=1 ${s(r!.entity_key)} ${s(r!.usa_city)} ${s(r!.usa_state)}; parent ${s(r!.parent_uei) || "none"}; cik ${s(r!.cik) || "none"} phone ${s(r!.sec_phone) || "none"}`;
    case "T10":
      return `rows=${n} ${rows.map((x) => `${s(x.child_uei)} (${s(x.state_province)})`).slice(0, 3).join(", ")}; family list ${s(r!.list_size)} rows${params.state ? `, narrowed to ${s(params.state)}` : ""}`;
    case "T11":
      return `rows=${n} matched_uei=${s(r!.matched_uei)} level=${s(r!.matched_level)} ${s(r!.matched_name)} vendor_id_on_file=${s(r!.vendor_id_on_file) || "none"}`;
    case "T07":
      return `rows=${n} ${rows.map((x) => `${s(x.via)} ${s(x.owner_vendor_id) || s(x.request_id)}`).slice(0, 3).join("; ")}`;
    case "T09":
      return `run items=${s(r!.run_item_count)} ${n} rows`;
    case "T02":
      return `rows=${n} ${rows.map((x) => `${s(x.kind)} ${s(x.value)} ${s(x.valid_from).slice(0, 10)}->${s(x.valid_to).slice(0, 10) || "open"}`).slice(0, 3).join("; ")}`;
    case "T08":
      return `rows=${n} ${rows.map((x) => `${s(x.log_id)} ${s(x.outcome)} ${s(x.phone_source)}`).slice(0, 2).join("; ")}`;
    default: {
      const k = Object.keys(r!).slice(0, 3).map((c) => `${c}=${s(r![c]).slice(0, 40)}`).join(" ");
      return `rows=${n} ${k}`;
    }
  }
}

export function inputSummary(template_id: string, params: Record<string, unknown>): string {
  const p = Object.entries(params)
    .filter(([k]) => k !== "template_id")
    .map(([k, v]) => `${k}=${k === "account_hash" ? `${s(v).slice(0, 12)}…` : Array.isArray(v) ? v.join(",") : s(v)}`)
    .join(" ");
  return `${template_id} ${p}`;
}
