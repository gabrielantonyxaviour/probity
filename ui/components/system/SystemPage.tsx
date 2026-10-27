import type { LaneCell, ModelPerStep } from "@/lib/model-per-step";
import { SYSTEM } from "@/lib/copy-depth";
import { SystemLanes } from "./SystemLanes";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round((v <= 1 ? v * 100 : v) * 10) / 10}%`);
const n = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("en-US"));

function Lane({ c, chosen, label, lane }: { c: LaneCell | null; chosen: boolean; label: string | null; lane: string }) {
  if (!c) return <td className="text-fg-muted" data-lane={lane}>{SYSTEM.notMeasured}</td>;
  return (
    <td data-chosen={chosen || undefined} data-lane={lane} className={chosen ? "sy-chosen" : undefined}>
      {chosen ? <span className="t-mono-label text-fg block">{SYSTEM.chosen}</span> : null}
      <span className="sy-metric sy-metric--wrap"><span className="t-mono-label text-fg-muted">{label ?? SYSTEM.cols.accuracy}</span> <span className="t-mono-data text-fg">{c.metric ?? pct(c.accuracy)}</span></span>
      <span className="sy-metric"><span className="t-mono-label text-fg-muted">{SYSTEM.cols.latency}</span> <span className="t-mono-data">{ms(c.p50)} / {ms(c.p95)}</span></span>
      <span className="sy-metric"><span className="t-mono-label text-fg-muted">{SYSTEM.cols.tokens}</span> <span className="t-mono-data">{n(c.tokensIn)} → {n(c.tokensOut)}</span></span>
      <span className="sy-metric"><span className="t-mono-label text-fg-muted">{SYSTEM.cols.calls}</span> <span className="t-mono-data">{n(c.n)}{c.answered != null && c.n != null && c.answered !== c.n ? ` (${n(c.answered)} answered)` : ""}{c.receipts != null ? ` · ${SYSTEM.receipts(c.receiptsOf != null ? `${n(c.receipts)}/${n(c.receiptsOf)}` : n(c.receipts))}` : ""}</span></span>
    </td>
  );
}

const isDeep = (uses: string | null) => !!uses && /ultra|deep|550b/i.test(uses);
const isFast = (uses: string | null) => !!uses && /lightning|fast|30b/i.test(uses);
const ms = (v: number | null) => (v == null ? "—" : `${(v / 1000).toFixed(1)} s`);

/** System page: live lanes from /readyz, then the measured model-per-step table (D2). */
export function SystemPage({ data, source }: { data: ModelPerStep | null; source: string }) {
  return (
    <div className="sy-page" data-testid="system-page">
      <header className="grid gap-2">
        <span className="t-eyebrow">{SYSTEM.eyebrow}</span>
        <h1 className="t-app-title text-fg">{SYSTEM.title}</h1>
        <p className="t-ui text-fg-2" style={{ maxWidth: 720 }}>{SYSTEM.lede}</p>
      </header>
      <SystemLanes />
      <section className="grid gap-3" data-testid="model-per-step">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="t-heading text-fg">{SYSTEM.tableTitle}</h2>
          <span className="t-mono-label text-fg-muted">{data?.measuredAt ? SYSTEM.measured(data.measuredAt.slice(0, 16).replace("T", " ")) : null} · {source}</span>
        </div>
        {!data ? (
          <p className="t-ui text-fg-2" data-testid="model-per-step-empty">{SYSTEM.empty}</p>
        ) : (
          <div className="ds-scroll" tabIndex={0} role="region" aria-label={SYSTEM.tableTitle}>
            <table className="ds-table sy-table">
              <thead><tr><th scope="col">{SYSTEM.cols.step}</th><th scope="col">{SYSTEM.cols.uses}</th><th scope="col">{SYSTEM.cols.fast}</th><th scope="col">{SYSTEM.cols.deep}</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.step} data-testid="model-step-row" data-step={r.step}>
                    <td><span className="text-fg">{r.step}</span></td>
                    <td><span className="t-mono-data text-fg t-wrap-any">{r.uses ?? "—"}</span>{r.why ? <span className="t-ui-xs text-fg-2 block mt-1">{r.why}</span> : null}</td>
                    <Lane c={r.fast} chosen={isFast(r.uses)} label={r.metric} lane={SYSTEM.cols.fast} />
                    <Lane c={r.deep} chosen={isDeep(r.uses)} label={r.metric} lane={SYSTEM.cols.deep} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="t-ui-xs text-fg-muted">{SYSTEM.foot} {SYSTEM.reasoning}</p>
      </section>
    </div>
  );
}
