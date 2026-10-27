"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { ReactFlow, ReactFlowProvider, useReactFlow, useViewport, type NodeTypes, type EdgeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphPayload } from "@schemas/graph";
import { COLUMNS, contextLabel, edgeLabel } from "@/lib/labels-graph";
import { dayDate } from "@/lib/format";
import { GRAPH } from "@/lib/copy";
import { ProbityEdge, type GEdge, type GEdgeData } from "./edges";
import { ProbityNode, type GNode } from "./nodes";
import type { Layout } from "./layout";
import type { Provisional } from "./derive";

type PEdge = GraphPayload["edges"][number];
export function edgeState(e: PEdge, claimed: boolean): GEdgeData["state"] {
  if (e.superseded || e.state === "superseded" || e.state === "closed") return "superseded";
  if (e.verdict === "approved") return "approved";
  if (e.verdict === "rejected") return "rejected";
  if (e.verdict === "pending") return "pending";
  return claimed ? "claimed" : "recorded";
}

const nodeTypes: NodeTypes = { probity: ProbityNode as unknown as NodeTypes[string] };
const edgeTypes: EdgeTypes = { probity: ProbityEdge as unknown as EdgeTypes[string] };

function Guides() {
  const { x, zoom } = useViewport();
  return (
    <div className="gr__cols" aria-hidden style={{ display: "block" }}>
      {COLUMNS.map((c) => (
        <div key={c.id} style={{ position: "absolute", top: 0, bottom: 0, left: x + (c.x - 20) * zoom, borderLeft: c.x === 0 ? "0" : "var(--line)", paddingLeft: 12, paddingTop: 10 }}>
          <span className="t-eyebrow" style={{ whiteSpace: "nowrap" }}>{c.label}</span>
        </div>
      ))}
    </div>
  );
}

type Props = {
  layout: Layout;
  payload: GraphPayload;
  dimNodes: Set<string> | null;
  dimEdges: Set<string> | null;
  provisional: Map<string, Provisional>;
  pulseIds: Set<string>;
  highlightId: string | null;
  groupSub: string | null;
  onOpen: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
  fitNonce: number;
  zoomCmd: { dir: 1 | -1; n: number } | null;
};

function Inner(p: Props) {
  const rf = useReactFlow();
  const moved = useRef(false);
  const conflictFlag = useMemo(() => new Set(p.payload.nodes.filter((n) => n.flags.some((f) => f === "conflict" || f === "ambiguous")).map((n) => n.id)), [p.payload]);
  const nodes = useMemo<GNode[]>(
    () =>
      p.layout.nodes.map((l) => ({
        id: l.id,
        type: "probity" as const,
        position: { x: l.x, y: l.y },
        draggable: false,
        selectable: false,
        focusable: false,
        width: l.w,
        height: l.h,
        data: {
          node: l.node,
          group: l.group ? { label: l.group.label, size: l.group.size, shown: l.group.shown, sub: p.groupSub } : null,
          claimed: l.claimed && l.node?.type !== "request",
          dim: !!p.dimNodes && !p.dimNodes.has(l.id),
          provisional: p.provisional.get(l.id) ?? null,
          pulse: p.pulseIds.has(l.id),
          docCount: p.layout.docCount,
          highlighted: p.highlightId === l.id,
          onOpen: p.onOpen,
        },
      })),
    [p.layout, p.dimNodes, p.provisional, p.pulseIds, p.highlightId, p.groupSub, p.onOpen],
  );
  const byId = useMemo(() => new Map(p.payload.nodes.map((n) => [n.id, n])), [p.payload]);
  const edges = useMemo<GEdge[]>(
    () =>
      p.layout.edges.map((l) => {
        const e = l.edge;
        const from = byId.get(l.from);
        const to = byId.get(l.to);
        const state = e ? edgeState(e, l.claimed) : "recorded";
        const conflict = !!e && (conflictFlag.has(l.to) || conflictFlag.has(l.from)) && (l.claimed || e.type === "located_at");
        const label = e ? edgeLabel(e.type, e.context) : GRAPH.groupLabel(0).replace(/^\d+ /, "");
        const same = p.layout.nodes.find((n) => n.id === l.from)?.col === p.layout.nodes.find((n) => n.id === l.to)?.col;
        const title = e ? `${from?.label ?? l.from} ${label} ${to?.label ?? l.to} · ${contextLabel(e.context)} · from ${e.valid_from ? dayDate(e.valid_from) : "—"} until ${e.valid_to ? dayDate(e.valid_to) : "now"}${e.verdict ? ` · ${e.verdict}` : ""}` : "";
        return {
          id: l.id,
          type: "probity" as const,
          source: l.from,
          target: l.to,
          sourceHandle: l.sh,
          targetHandle: l.th,
          selectable: false,
          data: { label, state, conflict, dim: !!p.dimEdges && !p.dimEdges.has(l.id), validTo: e?.valid_to ?? null, same: !!same, testState: state === "approved" || state === "rejected" || state === "superseded" ? state : "recorded", title, via: l.via ?? null },
        };
      }),
    [p.layout, p.dimEdges, byId, conflictFlag],
  );
  const fit = useCallback(() => void rf.fitView({ padding: 0.08, minZoom: 0.4, maxZoom: 1.1, duration: 400 }), [rf]);
  useEffect(() => {
    if (!moved.current) void rf.fitView({ padding: 0.08, minZoom: 0.4, maxZoom: 1.1, duration: 0 });
  }, [rf, p.layout.nodes.length]);
  useEffect(() => {
    if (p.fitNonce > 0) {
      moved.current = false;
      fit();
    }
  }, [p.fitNonce, fit]);
  useEffect(() => {
    if (!p.zoomCmd) return;
    void (p.zoomCmd.dir > 0 ? rf.zoomIn({ duration: 230 }) : rf.zoomOut({ duration: 230 }));
    moved.current = true;
  }, [p.zoomCmd, rf]);
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      elementsSelectable={false}
      zoomOnScroll={false}
      zoomActivationKeyCode={["Meta", "Control"]}
      panOnScroll={false}
      minZoom={0.3}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
      onMoveStart={(e) => { if (e) moved.current = true; }}
      colorMode="system"
    >
      <Guides />
    </ReactFlow>
  );
}

export function GraphCanvas(p: Props) {
  return (
    <ReactFlowProvider>
      <div style={{ position: "absolute", inset: 0 }} data-testid="graph-canvas">
        <Inner {...p} />
      </div>
    </ReactFlowProvider>
  );
}
