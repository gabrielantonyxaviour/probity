"use client";
import { useEffect, useMemo, useState } from "react";
import { apiGet, ApiClientError } from "@/lib/api";
import { Sheet } from "@/components/ui/overlay";
import { Chip } from "@/components/ui/chip";
import { Alert, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { EVIDENCE } from "@/lib/copy";
import { LINEAGE } from "@/lib/copy-depth";
import { FACT_LABELS, SOURCE_LABELS } from "@/lib/labels";
import { actionLabel, agentDisplay, templateLabel } from "@/lib/labels-trace";
import { maskAccounts } from "@/lib/mask";
import { factValue } from "@/lib/fact-value";
import { QueryDetailUI } from "@/lib/lineage";
import { useReview } from "@/components/review/review-context";
import { LineageTrace } from "./LineageTrace";
import { RerunPanel } from "./RerunPanel";

type Detail = QueryDetailUI;

/** Evidence drawer ?evidence= / ?query= (01 section 7.3): value, lineage (source, USL table, query, rows), cited by, Re-run. */
export function EvidenceDrawer() {
  const r = useReview();
  const evId = r.param("evidence");
  const qParam = r.param("query");
  const open = !!(evId || qParam);
  const obs = useMemo(() => {
    if (!evId) return null;
    const all = [...r.state.observations.map((o) => o.observation), ...(r.decision?.fact_sheet.flatMap((f) => f.observations) ?? [])];
    return all.find((o) => o.evidence_id === evId) ?? null;
  }, [evId, r.state.observations, r.decision]);
  const queryId = qParam ?? obs?.query_id ?? null;
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<ApiClientError | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!queryId) return;
    let alive = true;
    setD(null);
    setErr(null);
    apiGet(`/runs/${encodeURIComponent(r.runId)}/queries/${encodeURIComponent(queryId)}`, QueryDetailUI)
      .then((x) => alive && setD(x))
      .catch((e) => alive && setErr(e instanceof ApiClientError ? e : new ApiClientError("network", String(e))));
    return () => {
      alive = false;
    };
  }, [queryId, r.runId, nonce]);

  const field = obs ? FACT_LABELS[obs.field] : null;
  const title = obs ? `${field} · ${SOURCE_LABELS[obs.source]}` : EVIDENCE.titleQuery(d?.template_id ?? templateLabel(null));
  const cited = useMemo(() => {
    if (!queryId) return { reasons: [] as string[], events: [] as string[] };
    const reasons = (r.decision?.reason_codes ?? []).filter((c) => (evId ? c.evidence_ids.includes(evId) : c.evidence_ids.some((e) => e.startsWith(`ev-${queryId.slice(0, 8)}`)))).map((c) => c.code);
    const events = r.state.trace.filter((e) => e.zetaris_query_ids.includes(queryId)).map((e) => EVIDENCE.citedByEvent(agentDisplay(e.agent_name).name, actionLabel(e.action), e.round));
    return { reasons, events };
  }, [queryId, evId, r.decision, r.state.trace]);
  const close = () => r.setParams({ evidence: null, query: null });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()} eyebrow={EVIDENCE.eyebrow} title={title} testId="evidence-drawer" closeLabel={EVIDENCE.close}>
      {err ? (
        <div className="p-sheet__cell"><Alert tone="conflict" actions={<Button onClick={() => setNonce((n) => n + 1)}>Retry</Button>}>{EVIDENCE.loadFailed} {err.message}</Alert></div>
      ) : !d ? (
        <div className="p-sheet__cell grid gap-3" data-testid="loading"><Skeleton w="50%" h={24} /><Skeleton w="80%" /><Skeleton w="65%" /></div>
      ) : (
        <>
          {obs ? (
            <div className="p-sheet__cell grid gap-3">
              <span className="t-eyebrow">{EVIDENCE.value}</span>
              <p className="t-mono-data text-fg" style={{ fontSize: 20, lineHeight: "26px" }} data-testid="evidence-value" title={obs.value ?? undefined}>{maskAccounts(factValue(obs.value))}</p>
            </div>
          ) : null}
          <div className="p-sheet__cell grid gap-3">
            <span className="t-eyebrow">{LINEAGE.eyebrow}</span>
            <LineageTrace d={d} obs={obs} />
          </div>
          <div className="p-sheet__cell grid gap-2">
            <span className="t-eyebrow">{EVIDENCE.citedBy}</span>
            {cited.reasons.length === 0 && cited.events.length === 0 ? <p className="t-ui-sm text-fg-muted">—</p> : null}
            {cited.reasons.length ? <div className="flex flex-wrap gap-2">{cited.reasons.map((c) => <Chip key={c}>{c}</Chip>)}</div> : null}
            <ul className="grid gap-1">{cited.events.map((e, i) => <li key={i} className="t-ui-sm text-fg-2">{e}</li>)}</ul>
          </div>
          <div className="p-sheet__cell">
            <RerunPanel queryId={d.query_id} rowCount={d.row_count} hasSql={!!d.sql} sampleMode={r.sample} />
          </div>
        </>
      )}
    </Sheet>
  );
}
