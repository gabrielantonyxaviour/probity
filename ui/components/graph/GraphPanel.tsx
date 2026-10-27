"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus, X, ScanLine } from "lucide-react";
import { Eyebrow, Alert, Skeleton } from "@/components/ui/misc";
import { Button, IconButton } from "@/components/ui/button";
import { Segmented } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/field";
import { apiGet } from "@/lib/api";
import { QueryDetail } from "@/lib/contracts";
import { GRAPH } from "@/lib/copy";
import { COLUMNS, LEGEND } from "@/lib/labels-graph";
import { useBreakpoint } from "@/lib/hooks/use-breakpoint";
import { useReview } from "@/components/review/review-context";
import { conflictPath, decisionPath, factFieldOf, provisionalNodes } from "./derive";
import { GraphCanvas } from "./GraphCanvas";
import { GraphPopover, type PopTarget } from "./GraphPopover";
import { GraphTable } from "./GraphTable";
import { layoutGraph } from "./layout";

function useT10() {
  const { state, runId } = useReview();
  const ev = state.trace.find((e) => e.template_id === "T10" && e.zetaris_query_ids[0]);
  const qid = ev?.zetaris_query_ids[0] ?? null;
  const [q, setQ] = useState<{ state: string | null; rows: number; source: string; id: string } | null>(null);
  useEffect(() => {
    if (!qid) return;
    let alive = true;
    apiGet(`/runs/${encodeURIComponent(runId)}/queries/${encodeURIComponent(qid)}`, QueryDetail)
      .then((d) => alive && setQ({ state: String(d.params.state ?? d.params.state_province ?? "") || null, rows: d.row_count, source: d.source_label, id: d.query_id }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [qid, runId]);
  return q;
}

/** R-GRAPH (01 section 9, 17.5): React Flow canvas with a deterministic layout, Decision path | Everything, Table view. */
export function GraphPanel() {
  const r = useReview();
  const bp = useBreakpoint();
  const { payload, error, loading, unavailable, retry } = r.graph;
  const decided = r.decided;
  const [viewSel, setViewSel] = useState<"path" | "all" | null>(null);
  const [display, setDisplay] = useState<"diagram" | "table" | null>(null);
  const [history, setHistory] = useState(false);
  const [highlight, setHighlight] = useState<boolean | null>(null);
  const [legend, setLegend] = useState(false);
  const [pop, setPop] = useState<PopTarget | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  const [zoomCmd, setZoomCmd] = useState<{ dir: 1 | -1; n: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const t10 = useT10();
  const full = r.param("graph") === "full";

  const view = viewSel ?? (decided ? "path" : "all");
  const show = display ?? (bp === "narrow" ? "table" : "diagram");
  const holdOrCb = r.decision?.decision !== "APPROVE";
  const hl = highlight ?? (decided && holdOrCb);

  const family = useMemo(() => ({ parentUei: r.decision?.resolved.parent_uei ?? null, size: r.decision?.resolved.family_size ?? null }), [r.decision]);
  const allLayout = useMemo(() => (payload ? layoutGraph(payload, { showHistory: history, family }) : null), [payload, history, family]);
  const visible = useMemo(() => (payload && view === "path" && decided ? decisionPath(payload, r.decision) : null), [payload, view, decided, r.decision]);
  const layout = useMemo(() => (payload ? layoutGraph(payload, { visible, showHistory: history, family }) : null), [payload, visible, history, family]);
  const cpath = useMemo(() => (payload && layout && hl ? conflictPath(payload, new Set(layout.nodes.map((n) => n.id))) : null), [payload, layout, hl]);
  const prov = useMemo(() => (decided ? new Map<string, never>() : provisionalNodes(r.state.trace)), [decided, r.state.trace]);
  const pulseIds = useMemo(() => new Set(payload && decided && r.running ? payload.nodes.filter((n) => n.flags.includes("conflict")).map((n) => n.id) : []), [payload, decided, r.running]);
  const groupSub = t10 && family.size != null && t10.state ? GRAPH.groupSub(family.size, t10.rows, t10.state) : null;

  const onOpen = useCallback(
    (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
      if (!payload || !layout) return;
      const box = wrap.current?.getBoundingClientRect();
      const target = e.currentTarget as HTMLElement;
      const nb = target.getBoundingClientRect();
      const x = nb.left - (box?.left ?? 0) + nb.width + 8;
      const y = nb.top - (box?.top ?? 0);
      const l = layout.nodes.find((n) => n.id === id);
      if (l?.group) {
        setPop({ x, y, kind: "group", label: GRAPH.groupLabel(l.group.label), body: GRAPH.groupBody(t10?.state ?? "NJ", l.group.size, t10?.source ?? "the Zetaris table"), queryId: t10?.id ?? null });
        return;
      }
      const n = payload.nodes.find((q) => q.id === id)!;
      const edge = payload.edges.find((ed) => (ed.from === id || ed.to === id) && ed.evidence_ids.length > 0);
      setPop({ x, y, kind: "node", node: n, evidenceId: edge?.evidence_ids[0] ?? null, field: factFieldOf(n) });
    },
    [payload, layout, t10],
  );
  const toFact = (field: string) => {
    setPop(null);
    document.querySelector(`[data-testid="fact-row-${field}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  let body;
  if (error && !payload) {
    body = <div style={{ padding: 16 }}><Alert tone="conflict" role="alert" testId="graph-error" actions={<Button onClick={retry}>Retry</Button>}>{unavailable ? GRAPH.unavailable : GRAPH.error}</Alert></div>;
  } else if (loading && !payload) {
    body = <div className="gr__canvas" data-testid="loading"><div className="gr__cols" style={{ display: "grid" }}>{COLUMNS.map((c) => <div key={c.id} className="gr__col"><span className="t-eyebrow">{c.label}</span></div>)}</div></div>;
  } else if (!payload || !layout || layout.nodes.length === 0) {
    body = <div className="gr__canvas"><div className="gr__cols" style={{ display: "grid" }}>{COLUMNS.map((c) => <div key={c.id} className="gr__col"><span className="t-eyebrow">{c.label}</span></div>)}</div><div className="gr-empty"><p className="t-mono-ui text-fg-muted">{GRAPH.empty}</p></div></div>;
  } else if (show === "table") {
    body = <GraphTable payload={payload} layout={view === "all" ? allLayout! : layout} />;
  } else {
    body = (
      <div className="gr__canvas" ref={wrap}>
        <GraphCanvas layout={layout} payload={payload} dimNodes={cpath?.nodes ?? null} dimEdges={cpath?.edges ?? null} provisional={prov} pulseIds={pulseIds} highlightId={pop?.kind === "node" ? pop.node.id : null} groupSub={groupSub} onOpen={onOpen} fitNonce={fitNonce} zoomCmd={zoomCmd} />
        {pop ? <GraphPopover t={pop} onClose={() => setPop(null)} onEvidence={(id) => { setPop(null); r.openEvidence(id); }} onFact={toFact} onQuery={(id) => { setPop(null); r.openQuery(id); }} /> : null}
      </div>
    );
  }

  const total = payload ? allLayout?.nodes.filter((n) => !n.group).length ?? 0 : 0;
  const panel = (
    <div className="gr" data-testid="entity-graph" data-full={full || undefined}>
      <div className="gr__bar">
        {show === "diagram" ? (
          <span className="flex items-center gap-2">
            <IconButton label={GRAPH.fit} small onClick={() => setFitNonce((n) => n + 1)}><ScanLine /></IconButton>
            <IconButton label={GRAPH.zoomOut} small onClick={() => setZoomCmd({ dir: -1, n: Date.now() })}><Minus /></IconButton>
            <IconButton label={GRAPH.zoomIn} small onClick={() => setZoomCmd({ dir: 1, n: Date.now() })}><Plus /></IconButton>
          </span>
        ) : null}
        <Segmented label="Graph scope" value={view} onChange={setViewSel} items={[{ id: "path", label: GRAPH.path }, { id: "all", label: GRAPH.everything(total) }]} />
        <Segmented label="Graph view" value={show} onChange={setDisplay} items={[{ id: "diagram", label: GRAPH.diagram }, { id: "table", label: GRAPH.table }]} />
        {show === "diagram" ? (
          <label className="flex items-center gap-2 t-mono-label text-fg-2"><Switch checked={hl} onCheckedChange={setHighlight} label={GRAPH.highlight} />{GRAPH.highlight}</label>
        ) : null}
        <label className="flex items-center gap-2 t-mono-label text-fg-2"><Switch checked={history} onCheckedChange={setHistory} label={GRAPH.history} />{GRAPH.history}</label>
        <span className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={() => setLegend((l) => !l)} aria-expanded={legend}>{GRAPH.legend}</Button>
          {full ? <Button variant="ghost" onClick={() => r.setParams({ graph: null })} icon={<X />}>Close</Button> : <IconButton label={GRAPH.expand} small onClick={() => r.setParams({ graph: "full" }, "push")}><Maximize2 /></IconButton>}
        </span>
      </div>
      {legend ? <ul className="gr-legend t-ui-xs text-fg-2">{LEGEND.map((l) => <li key={l}>{l}</li>)}</ul> : null}
      {body}
      {payload?.truncated ? <p className="t-ui-xs text-fg-muted p-3">{GRAPH.truncated}</p> : null}
    </div>
  );

  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") r.setParams({ graph: null }); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [full, r]);

  return (
    <section data-testid="entity-graph-region" className="grid gap-3">
      <div className="grid gap-1"><Eyebrow>{GRAPH.heading}</Eyebrow><p className="t-ui-sm text-fg-muted">{GRAPH.sub}</p></div>
      {full ? <><div className="gr-full">{panel}</div><Skeleton w="100%" h={24} /></> : panel}
    </section>
  );
}
