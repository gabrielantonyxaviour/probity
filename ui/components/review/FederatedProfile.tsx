"use client";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { QueryDetail } from "@/lib/contracts";
import { FEDERATED } from "@/lib/copy-depth";
import { money } from "@/lib/format";
import { Skeleton } from "@/components/ui/misc";
import { useReview } from "./review-context";

const GROUPS: Array<{ key: keyof typeof FEDERATED.systems; cols: string[] }> = [
  { key: "erp", cols: ["vendor_id", "vendor_name", "uei", "payment_item_count", "total_exposure"] },
  { key: "usaspending", cols: ["usa_legal_name", "usa_address_line1", "usa_city", "usa_state", "usa_zip"] },
  { key: "edgar", cols: ["cik", "edgar_legal_name", "edgar_phone", "edgar_ein"] },
];
const T23 = "T23";

function show(col: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (col === "total_exposure" && !Number.isNaN(Number(v))) return money(Number(v));
  return String(v);
}

/** The Zetaris query id of the run's T23 federated profile, from the trace or a cited observation. */
function useT23Query(): string | null {
  const { state, decision } = useReview();
  return useMemo(() => {
    const ev = state.trace.find((e) => (e.template_id as string | null | undefined) === T23 && e.status === "success" && (e.zetaris_query_ids?.length ?? 0) > 0);
    if (ev?.zetaris_query_ids?.[0]) return ev.zetaris_query_ids[0];
    const obs = decision?.fact_sheet.flatMap((r) => r.observations).find((o) => o.template_id === T23);
    return obs?.query_id ?? state.observations.find((o) => o.observation.template_id === T23)?.observation.query_id ?? null;
  }, [state.trace, state.observations, decision]);
}

/** D3 T23: one evidence item that spans the ERP, USAspending and SEC EDGAR in a single Zetaris query. */
export function FederatedProfile() {
  const { runId, openQuery } = useReview();
  const qid = useT23Query();
  const [d, setD] = useState<QueryDetail | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!qid) return;
    let alive = true;
    setErr(false);
    apiGet(`/runs/${encodeURIComponent(runId)}/queries/${encodeURIComponent(qid)}`, QueryDetail)
      .then((x) => alive && setD(x))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [runId, qid]);
  if (!qid) return null;
  const row = d?.rows[0] ?? null;
  const nulls = row ? GROUPS.flatMap((g) => g.cols).filter((c) => row[c] == null || row[c] === "") : [];
  return (
    <section className="p-card fd" data-testid="federated-profile" data-query-id={qid}>
      <div className="grid gap-1">
        <span className="t-eyebrow">{FEDERATED.eyebrow}</span>
        <h3 className="t-ui text-fg">{FEDERATED.title}</h3>
        <p className="t-ui-sm text-fg-2">{FEDERATED.lede}</p>
      </div>
      {err ? <p className="t-ui-sm text-conflict-text">{FEDERATED.error}</p> : !d ? (
        <div className="grid gap-2" aria-busy="true"><span className="sr-only">{FEDERATED.loading}</span><Skeleton w="80%" /><Skeleton w="60%" /></div>
      ) : row ? (
        <div className="fd__grid">
          {GROUPS.map((g) => (
            <div key={g.key} className="fd__sys" data-testid="federated-system" data-system={g.key}>
              <span className="t-mono-label text-fg">{FEDERATED.systems[g.key]}</span>
              <dl className="p-dl">
                {g.cols.map((c) => (
                  <div key={c}><dt className="t-ui-xs">{FEDERATED.cols[c] ?? c}</dt><dd className="t-mono-data t-wrap-any">{show(c, row[c])}</dd></div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      ) : null}
      {nulls.length ? <p className="t-ui-xs text-fg-muted">{FEDERATED.nulls(nulls.map((c) => FEDERATED.cols[c] ?? c).join(", "))}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="t-mono-label p-link text-fg-2" onClick={() => openQuery(qid)} data-testid="federated-open">{FEDERATED.open} {qid.slice(0, 8)}</button>
        {d ? <span className="t-mono-label text-fg-muted">{FEDERATED.meta(`${(d.latency_ms / 1000).toFixed(1)} s`, d.row_count)} · rows {d.row_hash.slice(0, 8)}</span> : null}
      </div>
    </section>
  );
}
