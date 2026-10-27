"use client";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";
import { dayDate } from "@/lib/format";
import type { Via } from "./layout";

export type GEdgeData = {
  label: string;
  state: "recorded" | "claimed" | "approved" | "rejected" | "pending" | "superseded";
  conflict: boolean;
  dim: boolean;
  validTo: string | null;
  same: boolean;
  testState: string;
  title: string;
  via?: Via | null;
};

const seg = (xa: number, ya: number, xb: number, yb: number) => `C ${(xa + xb) / 2} ${ya}, ${(xa + xb) / 2} ${yb}, ${xb} ${yb}`;

/** Source to the gap, straight through it, then on to the target: the edge never passes behind a card. */
export function viaPath(sx: number, sy: number, tx: number, ty: number, v: Via): [string, number, number] {
  const [ax, bx] = sx <= tx ? [v.x1, v.x2] : [v.x2, v.x1];
  return [`M ${sx} ${sy} ${seg(sx, sy, ax, v.y)} L ${bx} ${v.y} ${seg(bx, v.y, tx, ty)}`, (ax + bx) / 2, v.y];
}
export type GEdge = Edge<GEdgeData, "probity">;

export function edgeVisual(state: GEdgeData["state"], conflict: boolean) {
  if (state === "approved") return { stroke: "var(--edge-approved)", w: 2, dash: undefined, mark: "✓", always: true };
  if (state === "rejected") return { stroke: "var(--edge-rejected)", w: 2, dash: "6 4", mark: "✕", always: true };
  if (state === "pending") return { stroke: "var(--edge-pending)", w: 2, dash: "2 4", mark: "?", always: true };
  if (state === "superseded") return { stroke: "var(--edge-superseded)", w: 1, dash: undefined, mark: null, always: false };
  if (conflict) return { stroke: "var(--conflict)", w: 2, dash: state === "claimed" ? "6 4" : undefined, mark: "✕", always: true };
  if (state === "claimed") return { stroke: "var(--edge-recorded)", w: 1.5, dash: "6 4", mark: null, always: false };
  return { stroke: "var(--edge-recorded)", w: 1.5, dash: undefined, mark: null, always: false };
}

export function ProbityEdge(p: EdgeProps<GEdge>) {
  const d = p.data!;
  const v = edgeVisual(d.state, d.conflict);
  const args = { sourceX: p.sourceX, sourceY: p.sourceY, targetX: p.targetX, targetY: p.targetY, sourcePosition: p.sourcePosition, targetPosition: p.targetPosition };
  const [path, lx, ly] = d.via ? viaPath(p.sourceX, p.sourceY, p.targetX, p.targetY, d.via) : d.same ? getSmoothStepPath({ ...args, borderRadius: 12 }) : getBezierPath(args);
  const label = d.state === "superseded" && d.validTo ? `until ${dayDate(d.validTo)}` : d.state === "pending" ? "not yet examined" : d.label;
  const solid = !v.dash;
  // Same-column edges run down the request column past other cards: their label would sit on top of a card, and the
  // card already carries its own Conflict badge, so the label shows only when the edge is selected.
  return (
    <g data-testid="graph-edge" data-state={d.testState} data-edge-id={p.id} style={{ opacity: d.dim ? 0.3 : d.state === "superseded" ? 0.5 : 1, transition: "opacity var(--dur-4) ease" }}>
      <title>{d.title}</title>
      <BaseEdge id={p.id} path={path} style={{ stroke: v.stroke, strokeWidth: v.w, strokeDasharray: v.dash }} className={solid ? "gr-edge-draw" : undefined} pathLength={solid ? 1 : undefined} markerEnd={p.markerEnd} />
      <EdgeLabelRenderer>
        <div className="gr-edge-label nodrag nopan" style={{ left: lx, top: ly, color: v.stroke === "var(--edge-recorded)" ? "var(--fg-2)" : v.stroke, opacity: d.dim ? 0.3 : 1, display: (v.always && !d.same) || p.selected ? undefined : "none" }} data-testid="graph-edge-label">
          {v.mark ? <span aria-hidden>{v.mark} </span> : null}{label}
        </div>
      </EdgeLabelRenderer>
    </g>
  );
}
