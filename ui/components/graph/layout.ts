// Deterministic entity-graph layout (01 section 9.5, 17.5; AC-GRF-3). No force layout, no randomness: the same input gives the
// same positions. Columns x = 0 / 300 / 600 / 900. The server sends no positions.
import type { GraphPayload } from "@schemas/graph";
import { COLUMNS, type ColumnId } from "@/lib/labels-graph";

type PNode = GraphPayload["nodes"][number];
type PEdge = GraphPayload["edges"][number];

export type LNode = {
  id: string;
  node: PNode | null;
  group: { parentId: string; label: number; size: number; shown: number } | null;
  col: ColumnId;
  x: number;
  y: number;
  w: number;
  h: number;
  pill: boolean;
  claimed: boolean;
};
export type Handle = "l" | "r" | "t" | "b";
/** A horizontal run through the gap between two cards of a column the edge would otherwise cross (flow coordinates). */
export type Via = { x1: number; x2: number; y: number };
export type LEdge = { id: string; edge: PEdge | null; from: string; to: string; sh: Handle; th: Handle; claimed: boolean; via?: Via };
export type Layout = { nodes: LNode[]; edges: LEdge[]; docCount: number };
export type LayoutOptions = { visible?: Set<string> | null; showHistory?: boolean; family?: { parentUei: string | null; size: number | null } | null };

const CARD = { w: 200, h: 56 };
const PILL = { w: 200, h: 36 };
const GAP = 28; // room for the conflict badge that sits 8 px above a card's top edge
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z/g;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Node sublabel as shown: ISO timestamps read as "22 Oct 2026, 15:12 UTC"; the request card adds its document count. */
export function nodeSub(n: PNode, docCount = 0): string | null {
  const s = n.sublabel?.replace(ISO, (m) => {
    const d = new Date(m);
    return Number.isNaN(d.getTime()) ? m : `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
  }) ?? null;
  if (n.type !== "request" || !docCount) return s;
  const docs = `${docCount} document${docCount === 1 ? "" : "s"}`;
  return s ? `${s} · ${docs}` : docs;
}
const NO_TAG = new Set(["conflict", "ambiguous", "resolved", "real_registry"]);

/** Deterministic height estimate from label lengths and tag count, so rows never overlap (text wraps at 200 px). */
export function estimateHeight(n: PNode, pill: boolean, docCount = 0): number {
  const sub = nodeSub(n, docCount);
  const titleLines = Math.min(2, Math.max(1, Math.ceil(n.label.length / 20)));
  const subLines = sub ? Math.min(4, Math.ceil(sub.length / 20)) : 0;
  const tags = n.flags.filter((f) => !NO_TAG.has(f)).length;
  const h = 20 + 18 * titleLines + 15 * subLines + (tags ? 8 + 29 * tags : 0);
  return Math.max(pill ? PILL.h : CARD.h, h);
}
const COL_X: Record<ColumnId, number> = { request: 0, erp: 300, usaspending: 600, edgar: 900 };
const PILL_TYPES = new Set(["bank_account", "address", "phone", "domain"]);
const REQUEST_ORDER = ["request", "claimed_party", "bank_account", "address", "domain", "phone"];

export function isPill(type: string) {
  return PILL_TYPES.has(type);
}

/** Which column a node sits in: attributes go to "The request" when any request edge points at them (shared nodes). */
export function columnOf(n: PNode, requestTargets: Set<string>): ColumnId {
  if (n.type === "request" || n.type === "claimed_party" || n.type === "document") return "request";
  if (isPill(n.type) && requestTargets.has(n.id)) return "request";
  if (n.source_lane === "request") return "request";
  return n.source_lane;
}

function rank(n: PNode, parents: Set<string>): number {
  if (n.type === "legal_entity") {
    if (parents.has(n.id)) return 0;
    if (n.flags.includes("resolved")) return 1;
    if (n.flags.some((f) => ["conflict", "not_vendor_of_record", "new_this_run"].includes(f))) return 2;
    return 3;
  }
  if (n.type === "vendor_record") return n.flags.includes("resolved") ? 0 : 1;
  if (n.type === "sec_registrant") return 0;
  return 5;
}

const COL_ORDER: ColumnId[] = ["request", "erp", "usaspending", "edgar"];
const handleY = (n: LNode) => n.y + n.h / 2;

/**
 * An edge between columns that are not neighbours runs across the middle column. When its straight line would pass
 * behind a card there, route it through the nearest free gap between that column's cards instead.
 */
export function routeAround(a: LNode, b: LNode, placed: LNode[]): Via | undefined {
  const ia = COL_ORDER.indexOf(a.col);
  const ib = COL_ORDER.indexOf(b.col);
  if (Math.abs(ia - ib) < 2) return undefined;
  const [l, r] = ia < ib ? [a, b] : [b, a];
  const x0 = l.x + l.w;
  const y0 = handleY(l);
  const x1 = r.x;
  const y1 = handleY(r);
  const mid = COL_ORDER[Math.min(ia, ib) + 1]!;
  const cards = placed.filter((p) => p.col === mid).sort((p, q) => p.y - q.y);
  if (cards.length === 0) return undefined;
  const cx0 = cards[0]!.x;
  const cx1 = cx0 + cards[0]!.w;
  const yAt = (x: number) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  const lo = Math.min(yAt(cx0), yAt(cx1));
  const hi = Math.max(yAt(cx0), yAt(cx1));
  const hit = cards.some((c) => hi >= c.y - 6 && lo <= c.y + c.h + 6);
  if (!hit) return undefined;
  const gaps = [cards[0]!.y - GAP / 2, ...cards.map((c, i) => (cards[i + 1] ? (c.y + c.h + cards[i + 1]!.y) / 2 : c.y + c.h + GAP))];
  const want = (y0 + y1) / 2;
  const y = gaps.reduce((best, g) => (Math.abs(g - want) < Math.abs(best - want) ? g : best), gaps[0]!);
  return { x1: cx0 - 16, x2: cx1 + 16, y };
}

function handles(a: LNode, b: LNode): [Handle, Handle] {
  if (a.col === b.col) return a.y <= b.y ? ["b", "t"] : ["t", "b"];
  return a.x < b.x ? ["r", "l"] : ["l", "r"];
}

export function layoutGraph(payload: GraphPayload, o: LayoutOptions = {}): Layout {
  const visible = o.visible ?? null;
  const edgesAll = payload.edges.filter((e) => (o.showHistory ? true : !e.superseded && e.state !== "superseded"));
  const requestIds = new Set(payload.nodes.filter((n) => n.type === "request").map((n) => n.id));
  const requestTargets = new Set(edgesAll.filter((e) => requestIds.has(e.from)).map((e) => e.to));
  const docIds = new Set(payload.nodes.filter((n) => n.type === "document").map((n) => n.id));
  const nodes = payload.nodes.filter((n) => !docIds.has(n.id) && (!visible || visible.has(n.id)));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const parents = new Set(edgesAll.filter((e) => e.type === "child_of").map((e) => e.to));
  const docTotal = docIds.size;

  const byCol = new Map<ColumnId, PNode[]>();
  for (const n of nodes) {
    const c = columnOf(n, requestTargets);
    byCol.set(c, [...(byCol.get(c) ?? []), n]);
  }
  const placed: LNode[] = [];
  for (const col of COLUMNS) {
    const list = [...(byCol.get(col.id) ?? [])].sort((a, b) => {
      if (col.id === "request") {
        const d = REQUEST_ORDER.indexOf(a.type) - REQUEST_ORDER.indexOf(b.type);
        return d || a.id.localeCompare(b.id);
      }
      const d = rank(a, parents) - rank(b, parents);
      if (d) return d;
      if (col.id === "erp") return (a.keys.vendor_id ?? a.id).localeCompare(b.keys.vendor_id ?? b.id) || a.id.localeCompare(b.id);
      return a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
    });
    let y = 48;
    for (const n of list) {
      const pill = isPill(n.type);
      const h = estimateHeight(n, pill, n.type === "request" ? docTotal : 0);
      placed.push({ id: n.id, node: n, group: null, col: col.id, x: COL_X[col.id], y, w: CARD.w, h, pill, claimed: col.id === "request" && n.type !== "request" ? true : n.type === "request" });
      y += h + GAP;
    }
  }

  // Collapsed family group (17.5 item 4): only when the parent carries a known family size.
  const fam = o.family;
  const parentNode = fam?.parentUei ? placed.find((p) => p.node?.keys.uei === fam.parentUei) : undefined;
  if (fam && fam.size != null && parentNode) {
    const shown = edgesAll.filter((e) => e.type === "child_of" && e.to === parentNode.id && nodeIds.has(e.from)).length;
    const us = placed.filter((p) => p.col === "usaspending");
    const y = (us.length ? Math.max(...us.map((p) => p.y + p.h)) : 48) + 16;
    const g: LNode = { id: `group:${parentNode.id}`, node: null, group: { parentId: parentNode.id, label: Math.max(0, fam.size - shown), size: fam.size, shown }, col: "usaspending", x: COL_X.usaspending, y, w: CARD.w, h: CARD.h, pill: false, claimed: false };
    placed.push(g);
  }

  const index = new Map(placed.map((p) => [p.id, p]));
  const edges: LEdge[] = [];
  for (const e of edgesAll) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (!a || !b) continue;
    const [sh, th] = handles(a, b);
    edges.push({ id: e.id, edge: e, from: e.from, to: e.to, sh, th, claimed: requestIds.has(e.from), via: routeAround(a, b, placed) });
  }
  const group = placed.find((p) => p.group);
  if (group && group.group) {
    const p = index.get(group.group.parentId)!;
    const [sh, th] = handles(group, p);
    edges.push({ id: `${group.id}->${p.id}`, edge: null, from: group.id, to: p.id, sh, th, claimed: false });
  }
  const docCount = payload.nodes.filter((n) => n.type === "document").length;
  return { nodes: placed, edges, docCount };
}
