"use client";
import type { GraphPayload } from "@schemas/graph";
import { GRAPH } from "@/lib/copy";
import { COLUMNS, EDGE_STATE_WORDS, FLAG_TAGS, contextLabel, edgeLabel } from "@/lib/labels-graph";
import { dayDate } from "@/lib/format";
import { maskAccounts } from "@/lib/mask";
import { edgeState } from "./GraphCanvas";
import type { Layout } from "./layout";

/** Accessible Table view: one row per edge (01 section 9.9). Default at narrow widths. */
export function GraphTable({ payload, layout }: { payload: GraphPayload; layout: Layout }) {
  const byId = new Map(payload.nodes.map((n) => [n.id, n]));
  const colRank = new Map(layout.nodes.map((n) => [n.id, [COLUMNS.findIndex((c) => c.id === n.col), n.y] as const]));
  const rows = layout.edges.filter((e) => e.edge).sort((a, b) => {
    const ra = colRank.get(a.from) ?? [9, 0];
    const rb = colRank.get(b.from) ?? [9, 0];
    return ra[0] - rb[0] || ra[1] - rb[1] || a.id.localeCompare(b.id);
  });
  const label = (id: string) => {
    const n = byId.get(id);
    if (!n) return id;
    const flags = n.flags.filter((f) => f !== "real_registry" && f !== "resolved").map((f) => FLAG_TAGS[f].tag);
    return <span>{maskAccounts(n.label)}{flags.length ? <span className="text-fg-muted"> · {flags.join(", ")}</span> : null}</span>;
  };
  return (
    <div className="gr-table-wrap" data-testid="graph-table" tabIndex={0} role="region" aria-label="Entity graph table">
      <table className="ledger" style={{ minWidth: 720 }}>
        <caption className="sr-only">{GRAPH.heading}</caption>
        <thead><tr>{GRAPH.tableCols.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => {
            const e = r.edge!;
            const st = edgeState(e, r.claimed);
            return (
              <tr key={r.id} data-testid="graph-edge-row" data-state={st === "rejected" ? "rejected" : st === "approved" ? "approved" : st === "superseded" ? "superseded" : undefined}>
                <td>{label(e.from)}</td>
                <td>{edgeLabel(e.type, e.context)}</td>
                <td>{label(e.to)}</td>
                <td>{contextLabel(e.context)}</td>
                <td className="t-mono-data">{e.valid_from ? dayDate(e.valid_from) : "—"} → {e.valid_to ? dayDate(e.valid_to) : "now"}</td>
                <td>{EDGE_STATE_WORDS[st]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
