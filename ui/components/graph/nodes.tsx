"use client";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { AtSign, Banknote, BookUser, Building2, FileText, Landmark, Layers, MapPin, Phone, UserRound } from "lucide-react";
import type { GraphPayload } from "@schemas/graph";
import { Chip } from "@/components/ui/chip";
import { nodeSub } from "./layout";
import { FLAG_TAGS } from "@/lib/labels-graph";
import { GRAPH } from "@/lib/copy";
import { FLAG_KEY_WORDS } from "@/lib/labels";
import type { Provisional } from "./derive";

type PNode = GraphPayload["nodes"][number];
export type GNodeData = {
  node: PNode | null;
  group: { label: number; size: number; shown: number; sub: string | null } | null;
  claimed: boolean;
  dim: boolean;
  provisional: Provisional | null;
  pulse: boolean;
  docCount: number;
  highlighted: boolean;
  onOpen: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
};
export type GNode = Node<GNodeData, "probity">;

const ICONS = { request: FileText, document: FileText, claimed_party: UserRound, vendor_record: BookUser, legal_entity: Building2, sec_registrant: Landmark, bank_account: Banknote, address: MapPin, phone: Phone, domain: AtSign } as const;
const TAG_ORDER = ["not_vendor_of_record", "new_this_run", "fraud_confirmed", "lookalike", "recent_change", "callback_number", "legitimate", "dq_invalid"] as const;

function sessionOf(n: PNode): string | null {
  const f = n.facts.find((x) => x.predicate === "fraud_flag");
  return f?.session_id ?? null;
}

export function ProbityNode({ id, data }: NodeProps<GNode>) {
  const n = data.node;
  const g = data.group;
  const Icon = g ? Layers : ICONS[n!.type];
  const flags = n?.flags ?? [];
  const conflict = flags.includes("conflict") || flags.includes("ambiguous");
  const pill = !!n && ["bank_account", "address", "phone", "domain"].includes(n.type);
  const struck = flags.includes("do_not_use");
  const title = g ? (g.size ? GRAPH.groupLabel(g.label) : "") : n!.label;
  const sub = g ? g.sub : nodeSub(n!, data.docCount);
  return (
    <div
      role="button"
      tabIndex={0}
      className="gr-node nopan"
      data-testid={g ? "graph-group" : "graph-node"}
      data-node-id={id}
      data-type={n?.type ?? "group"}
      data-claimed={data.claimed || undefined}
      data-pill={pill || undefined}
      data-conflict={conflict || data.provisional === "flagged" || undefined}
      data-resolved={flags.includes("resolved") || undefined}
      data-callback={flags.includes("callback_number") || undefined}
      data-dim={data.dim || undefined}
      data-pulse={data.pulse || undefined}
      style={data.provisional ? { border: `2px dashed ${data.provisional === "nomatch" ? "var(--gap)" : "var(--conflict)"}`, boxShadow: "none" } : data.highlighted ? { boxShadow: "inset 0 0 0 1px var(--fg)" } : undefined}
      aria-label={`${title}${sub ? `, ${sub}` : ""}`}
      onClick={(e) => data.onOpen(id, e)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          data.onOpen(id, e);
        }
      }}
    >
      {(["l", "r", "t", "b"] as const).map((h) => {
        const pos = { l: Position.Left, r: Position.Right, t: Position.Top, b: Position.Bottom }[h];
        return (
          <span key={h}>
            <Handle type="source" id={h} position={pos} style={{ opacity: 0, pointerEvents: "none" }} isConnectable={false} />
            <Handle type="target" id={h} position={pos} style={{ opacity: 0, pointerEvents: "none" }} isConnectable={false} />
          </span>
        );
      })}
      {conflict ? <Chip className="gr-badge" tone="conflict" glyph={flags.includes("ambiguous") ? "⇄" : "✕"}>{flags.includes("ambiguous") ? "Possible vendor" : "Conflict"}</Chip> : null}
      <span className="flex items-start gap-2">
        <Icon size={16} className="text-fg-muted" style={{ flex: "none", marginTop: 1 }} aria-hidden />
        <span className="grid gap-0.5 min-w-0">
          <span className="gr-node__t" style={struck ? { textDecoration: "line-through 1px var(--conflict)" } : undefined}>{title}</span>
          {sub ? <span className="gr-node__s">{sub}</span> : null}
        </span>
      </span>
      <span className="gr-node__tags">
        {struck ? <Chip tone="conflict" glyph="✕">{FLAG_TAGS.do_not_use.tag}</Chip> : null}
        {TAG_ORDER.filter((f) => flags.includes(f)).map((f) => {
          const t = FLAG_TAGS[f];
          const s = f === "fraud_confirmed" && n ? sessionOf(n) : null;
          return <Chip key={f} tone={t.tone} glyph={t.tone === "agree" ? "✓" : t.tone === "info" ? "●" : t.tone === "gap" ? "○" : "✕"} fill={t.fill}>{s ? `${FLAG_KEY_WORDS.fraud_confirmed} · ${s}` : t.tag}</Chip>;
        })}
        {data.provisional === "nomatch" ? <Chip prov tone="gap" glyph="○">{GRAPH.noMatchYet}</Chip> : null}
        {data.provisional === "flagged" ? <Chip prov tone="conflict" glyph="✕">{GRAPH.flagged}</Chip> : null}
      </span>
    </div>
  );
}
