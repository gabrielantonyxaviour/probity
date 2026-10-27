"use client";
import { useEffect, useMemo, useState } from "react";
import { QueryDetail } from "@/lib/contracts";
import { apiGet, ApiClientError } from "@/lib/api";
import { Sheet } from "@/components/ui/overlay";
import { Chip } from "@/components/ui/chip";
import { Alert, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { CopyIconButton } from "@/components/ui/copy-button";
import { Segmented } from "@/components/ui/tabs";
import { EVIDENCE, TOASTS } from "@/lib/copy";
import { FACT_LABELS, SOURCE_LABELS } from "@/lib/labels";
import { ACTION_LABELS, AGENT_DISPLAY, MODE_LABELS, templateLabel } from "@/lib/labels-trace";
import { latency, stamp } from "@/lib/format";
import { hasRealPhone } from "@/lib/phone";
import { maskAccounts } from "@/lib/mask";
import { useReview } from "@/components/review/review-context";
import { SqlBlock } from "./SqlBlock";
import { RerunPanel } from "./RerunPanel";
import type { z } from "zod";

type Detail = z.infer<typeof QueryDetail>;

function Tiles({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="stat-tiles">
      {items.map(([k, v]) => (
        <div key={k} className="stat-tile t-ui-xs"><span className="text-fg-muted">{k}</span><span className="t-mono-data">{v}</span></div>
      ))}
    </div>
  );
}

function IdRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="idrow">
      <span className="t-ui-xs text-fg-muted">{label}</span>
      <span className="flex items-center gap-2 min-w-0"><span className="t-mono-data t-wrap-any" title={value}>{value.length > 24 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value}</span><CopyIconButton text={value} label={`Copy ${label}`} toast={TOASTS.copied} /></span>
    </div>
  );
}

function Rows({ d }: { d: Detail }) {
  const cols = d.rows[0] ? Object.keys(d.rows[0]) : [];
  const shown = d.rows.slice(0, 50);
  const real = d.rows.some((r) => Object.values(r).some((v) => typeof v === "string" && hasRealPhone(v)));
  return (
    <div className="grid gap-2" data-testid="evidence-rows">
      <div className="rows-wrap" tabIndex={0}>
        <table>
          <caption className="sr-only">{real ? EVIDENCE.rowsCaption : EVIDENCE.rows(d.row_count)}</caption>
          <thead><tr>{cols.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{shown.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{maskAccounts(String(r[c] ?? ""))}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {d.row_count > shown.length ? <p className="t-ui-xs text-fg-muted">{EVIDENCE.showing(shown.length, d.row_count)}</p> : null}
      {real ? <p className="t-ui-xs text-fg-muted">{EVIDENCE.rowsCaption}</p> : null}
    </div>
  );
}

/** Evidence drawer ?evidence= / ?query= (01 section 7.3): value, Zetaris query, rows, cited by, Re-run. */
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
  const [view, setView] = useState<"sql" | "rows">("sql");
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!queryId) return;
    let alive = true;
    setD(null);
    setErr(null);
    apiGet(`/runs/${encodeURIComponent(r.runId)}/queries/${encodeURIComponent(queryId)}`, QueryDetail)
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
    const events = r.state.trace.filter((e) => e.zetaris_query_ids.includes(queryId)).map((e) => EVIDENCE.citedByEvent(AGENT_DISPLAY[e.agent_name].name, ACTION_LABELS[e.action], e.round));
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
          <div className="p-sheet__cell grid gap-3">
            <span className="t-eyebrow">{EVIDENCE.value}</span>
            {obs ? <p className="t-mono-data text-fg" style={{ fontSize: 20, lineHeight: "26px" }} data-testid="evidence-value">{maskAccounts(obs.value ?? "—")}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Chip tone={d.mode === "live" ? "real" : "gap"} glyph="●">{MODE_LABELS[d.mode]}</Chip>
              <Chip>{EVIDENCE.fetchedAt(stamp(d.fetched_at))}</Chip>
              <Chip>{latency(d.latency_ms)}</Chip>
            </div>
          </div>
          <div className="p-sheet__cell grid gap-3">
            <div className="p-code-card" style={{ display: "grid", gap: ".75em" }}>
              <div className="p-code-card__head t-mono-panel"><span>{`// ${d.template_id} · ${templateLabel(d.template_id)}`}</span></div>
              <p className="t-ui-xs text-fg-muted">{EVIDENCE.caption}</p>
              {Object.keys(d.params).length ? <Tiles items={Object.entries(d.params).map(([k, v]) => [k, maskAccounts(String(v))])} /> : null}
              <Segmented label="Query view" value={view} onChange={setView} items={[{ id: "sql", label: "SQL" }, { id: "rows", label: `Rows (${d.row_count})` }]} />
              {view === "sql" ? <SqlBlock sql={d.sql} /> : <Rows d={d} />}
              <div className="flex items-center justify-between gap-2"><CopyIconButton text={d.sql} label={EVIDENCE.copySql} toast={TOASTS.copied} /><span className="t-mono-label text-fg-muted">{EVIDENCE.copySql}</span></div>
              <div className="grid gap-2" data-testid="evidence-ids">
                <div className="idrow" data-testid="evidence-query-id"><span className="t-ui-xs text-fg-muted">{EVIDENCE.queryId}</span><span className="flex items-center gap-2"><span className="t-mono-data" title={d.query_id}>{d.query_id}</span><CopyIconButton text={d.query_id} label="Copy query id" toast={TOASTS.copied} /></span></div>
                <IdRow label={EVIDENCE.sqlHash} value={d.sql_hash} />
                <IdRow label={EVIDENCE.rowHash} value={d.row_hash} />
              </div>
              <p className="t-ui-xs text-fg-muted">{EVIDENCE.readThrough(d.source_label)}</p>
            </div>
          </div>
          {view === "sql" ? (
            <div className="p-sheet__cell grid gap-2"><span className="t-eyebrow">{EVIDENCE.rows(d.row_count)}</span><Rows d={d} /></div>
          ) : null}
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
