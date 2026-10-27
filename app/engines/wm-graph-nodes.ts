// Node labels, keys, lanes and facts for the graph payload (05 2.7). Bank accounts show the last four digits only.
import type { Entity } from "./world-model/index.ts";
import type { GraphPayload } from "../schemas/graph";
import { levelWord } from "./wm-ingest-util";
import { latestFacts, type GraphCtx } from "./wm-graph-flags";

type NodeBody = Pick<GraphPayload["nodes"][number], "label" | "sublabel" | "group" | "keys" | "source_lane" | "facts">;
type Lane = NodeBody["source_lane"];

const RECORD_LANE: Record<string, Lane> = {
  request: "request",
  document: "request",
  claimed_party: "request",
  vendor_record: "erp",
  legal_entity: "usaspending",
  sec_registrant: "edgar",
};
const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const strKeys = (o: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(o)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)]),
  );

/** Attribute nodes sit in the request lane when a request edge points at them, else in the lane of their first owner. */
function laneOf(ctx: GraphCtx, e: Entity): Lane {
  const fixed = RECORD_LANE[e.type];
  if (fixed) return fixed;
  const inc = ctx.rels.filter((r) => r.from === e.id || r.to === e.id).sort((a, b) => a.id.localeCompare(b.id));
  const other = (r: (typeof inc)[number]) => ctx.ents.get(r.from === e.id ? r.to : r.from);
  if (inc.some((r) => other(r)?.type === "request")) return "request";
  for (const r of inc) {
    const lane = RECORD_LANE[other(r)?.type ?? ""];
    if (lane) return lane;
  }
  return "erp";
}

function registryPlace(ctx: GraphCtx, e: Entity): string | null {
  const r = ctx.rels.find((x) => x.from === e.id && x.type === "located_at" && x.context === "src:usa_detail");
  const a = r ? ctx.ents.get(r.to) : undefined;
  const city = str(a?.attrs.city);
  const state = str(a?.attrs.state);
  return city && state ? `${city}, ${state}` : (state ?? str(e.attrs.state));
}

export function describeNode(ctx: GraphCtx, e: Entity): NodeBody {
  const a = e.attrs;
  const facts = [...latestFacts(ctx, e.id).entries()]
    .filter(([p]) => p === "fraud_flag" || p.startsWith("dq_invalid:"))
    .map(([predicate, f]) => ({
      predicate,
      value: f.value,
      session_id: (f.value as { session_id?: string } | null)?.session_id,
    }))
    .map((f) => (f.session_id === undefined ? { predicate: f.predicate, value: f.value } : f))
    .sort((x, y) => x.predicate.localeCompare(y.predicate));
  const body = (
    label: string,
    sublabel: string | null,
    keys: Record<string, unknown>,
    group: string | null = null,
  ): NodeBody => ({ label, sublabel, group, keys: strKeys(keys), source_lane: laneOf(ctx, e), facts });
  const name = e.name ?? str(a.legal_name) ?? e.id;
  switch (e.type) {
    case "vendor_record":
      return body(name, `Vendor ID ${str(a.vendor_id) ?? ""}`.trim(), { vendor_id: a.vendor_id });
    case "legal_entity": {
      const place = registryPlace(ctx, e);
      return body(
        name,
        [levelWord(str(a.recipient_level)), place].filter(Boolean).join(" · "),
        { uei: a.uei, recipient_level: a.recipient_level, family_size: a.family_size },
        str(a.uei),
      );
    }
    case "sec_registrant":
      return body(name, `CIK ${str(a.cik) ?? ""}`.trim(), { cik: a.cik });
    case "bank_account":
      return body(
        `•••• ${str(a.account_last4) ?? "????"}`,
        str(a.routing_last4) ? `routing …${str(a.routing_last4)}` : null,
        { account_last4: a.account_last4 },
      );
    case "address":
      return body(str(a.display) ?? name, null, { addr_key: e.id.replace(/^address:addr:/, "") });
    case "phone":
      return body(str(a.display) ?? name, null, { e164: a.e164 });
    case "domain":
      return body(str(a.domain) ?? name, null, { domain: a.domain });
    case "request":
      return body(str(a.request_id) ?? name, str(a.received_at) ? `received ${str(a.received_at)}` : null, {
        request_id: a.request_id,
      });
    case "document":
      return body(str(a.doc_id) ?? name, str(a.kind), { doc_id: a.doc_id });
    default:
      return body(name, null, {});
  }
}
