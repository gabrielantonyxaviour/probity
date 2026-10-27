"use client";
import { useMemo, useState } from "react";
import type { Observation } from "@/lib/contracts";
import { Chip } from "@/components/ui/chip";
import { CopyIconButton } from "@/components/ui/copy-button";
import { Segmented } from "@/components/ui/tabs";
import { EVIDENCE, TOASTS } from "@/lib/copy";
import { LINEAGE } from "@/lib/copy-depth";
import { MODE_LABELS, templateLabel } from "@/lib/labels-trace";
import { latency, stamp } from "@/lib/format";
import { maskAccounts } from "@/lib/mask";
import { lineageOf, matchedRows, obsSystem, SYSTEM_DETAIL, SYSTEM_LABEL, USL_PREFIX, type QueryDetailUI } from "@/lib/lineage";
import { SqlBlock } from "./SqlBlock";

function IdRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="idrow" data-testid={testId}>
      <span className="t-ui-xs text-fg-muted">{label}</span>
      <span className="flex items-center gap-2 min-w-0"><span className="t-mono-data t-wrap-any" title={value}>{value.length > 24 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value}</span><CopyIconButton text={value} label={`Copy ${label}`} toast={TOASTS.copied} /></span>
    </div>
  );
}

function Rows({ d, hit }: { d: QueryDetailUI; hit: Set<number> }) {
  const cols = d.rows[0] ? Object.keys(d.rows[0]) : [];
  const shown = d.rows.slice(0, 50);
  return (
    <div className="grid gap-2" data-testid="evidence-rows">
      <div className="rows-wrap" tabIndex={0}>
        <table>
          <caption className="sr-only">{EVIDENCE.rows(d.row_count)}</caption>
          <thead><tr>{cols.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{shown.map((r, i) => <tr key={i} data-matched={hit.has(i) || undefined}>{cols.map((c) => <td key={c}>{maskAccounts(String(r[c] ?? ""))}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {d.row_count > shown.length ? <p className="t-ui-xs text-fg-muted">{EVIDENCE.showing(shown.length, d.row_count)}</p> : null}
    </div>
  );
}

function Step({ n, label, children, testId }: { n: string; label: string; children: React.ReactNode; testId: string }) {
  return (
    <li className="lin__step" data-testid={testId}>
      <span className="lin__dot t-mono-label" aria-hidden>{n}</span>
      <div className="lin__body grid gap-2 min-w-0">
        <span className="t-eyebrow">{label}</span>
        {children}
      </div>
    </li>
  );
}

/** D4: source system -> USL table -> Zetaris query (id, SQL) -> row hash and the exact rows, as one trace. */
export function LineageTrace({ d, obs }: { d: QueryDetailUI; obs: Observation | null }) {
  const [view, setView] = useState<"sql" | "params">("sql");
  const sources = useMemo(() => lineageOf(d), [d]);
  const mine = obsSystem(obs?.source);
  const used = sources.filter((s) => s.source_system === mine);
  const primary = used.length ? used : sources;
  const others = sources.filter((s) => !primary.includes(s));
  const hit = useMemo(() => new Set(matchedRows(d.rows, obs?.row_key)), [d.rows, obs?.row_key]);
  const systems = [...new Set(primary.map((s) => s.source_system))];
  return (
    <ol className="lin" data-testid="evidence-lineage" aria-label={LINEAGE.eyebrow}>
      <Step n="01" label={LINEAGE.steps.source} testId="lineage-source">
        {(systems.length ? systems : mine ? [mine] : []).map((s) => (
          <div key={s} className="lin__src" data-system={s}>
            <span className="lin__sys t-ui-sm text-fg">{SYSTEM_LABEL[s]}</span>
            <span className="t-ui-xs text-fg-muted">{SYSTEM_DETAIL[s]}</span>
          </div>
        ))}
      </Step>
      <Step n="02" label={LINEAGE.steps.table} testId="lineage-table">
        {primary.length === 0 ? <p className="t-ui-xs text-fg-muted">{LINEAGE.noTable}</p> : null}
        {primary.map((s) => (
          <div key={s.usl_table} className="lin__table">
            <span className="t-mono-data t-wrap-any">
              {s.usl_table.startsWith(USL_PREFIX) ? <><span className="text-fg-muted">{USL_PREFIX}</span><span className="text-fg">{s.usl_table.slice(USL_PREFIX.length)}</span></> : s.usl_table}
            </span>
            <span className="flex items-center gap-2"><span className="t-ui-xs text-fg-muted">{s.usl_table.startsWith("session.") ? LINEAGE.session : LINEAGE.unified}</span><CopyIconButton text={s.usl_table} label="Copy table name" toast={TOASTS.copied} /></span>
          </div>
        ))}
        {others.length ? (
          <p className="t-ui-xs text-fg-muted">{LINEAGE.alsoJoined}: {others.map((s) => `${SYSTEM_LABEL[s.source_system]} (${s.usl_table.replace(USL_PREFIX, "")})`).join(", ")}</p>
        ) : null}
      </Step>
      <Step n="03" label={LINEAGE.steps.query} testId="lineage-query">
        <div className="grid gap-2" data-testid="evidence-ids">
          <IdRow label={EVIDENCE.queryId} value={d.query_id} testId="evidence-query-id" />
          <IdRow label={EVIDENCE.sqlHash} value={d.sql_hash} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip>{`${d.template_id} · ${templateLabel(d.template_id)}`}</Chip>
          <Chip tone={d.mode === "live" ? "real" : "gap"} glyph="●">{MODE_LABELS[d.mode]}</Chip>
          <Chip>{EVIDENCE.fetchedAt(stamp(d.fetched_at))}</Chip>
          <Chip>{latency(d.latency_ms)}</Chip>
        </div>
        <div className="p-code-card" style={{ display: "grid", gap: ".75em" }}>
          <div className="p-code-card__head t-mono-panel flex items-center justify-between gap-2">
            <span>{`// GET /runs/:id/queries/${d.query_id.slice(0, 8)}`}</span>
            <CopyIconButton text={d.sql} label={EVIDENCE.copySql} toast={TOASTS.copied} />
          </div>
          {Object.keys(d.params).length ? <Segmented label="Query view" value={view} onChange={setView} items={[{ id: "sql", label: "SQL" }, { id: "params", label: EVIDENCE.params }]} /> : null}
          {view === "sql" || !Object.keys(d.params).length ? <SqlBlock sql={d.sql} /> : (
            <div className="stat-tiles">{Object.entries(d.params).map(([k, v]) => <div key={k} className="stat-tile t-ui-xs"><span className="text-fg-muted">{k}</span><span className="t-mono-data">{maskAccounts(String(v))}</span></div>)}</div>
          )}
          <p className="t-ui-xs text-fg-muted">{EVIDENCE.caption} {EVIDENCE.readThrough(d.source_label)}.</p>
        </div>
      </Step>
      <Step n="04" label={`${LINEAGE.steps.rows} (${d.row_count})`} testId="lineage-rows">
        <IdRow label={EVIDENCE.rowHash} value={d.row_hash} testId="evidence-row-hash" />
        {obs ? <p className="t-ui-xs text-fg-muted">{hit.size ? LINEAGE.matched(hit.size) : LINEAGE.noMatch}</p> : null}
        <Rows d={d} hit={hit} />
      </Step>
    </ol>
  );
}
