"use client";
import { useMemo } from "react";
import { Chip, StatusGlyph } from "@/components/ui/chip";
import { Eyebrow } from "@/components/ui/misc";
import { FACTS } from "@/lib/copy";
import { FACT_COLUMNS, FACT_STATUS, SOURCE_LABELS } from "@/lib/labels";
import { MODE_LABELS } from "@/lib/labels-trace";
import { factValue } from "@/lib/fact-value";
import { buildFactRows, SOURCE_COLS, type FactRow, type SourceCell, type SourceCol } from "@/lib/model/facts";
import { useBreakpoint } from "@/lib/hooks/use-breakpoint";
import { READINGS } from "@/lib/copy-depth";
import { disagreedFacts, readingOf } from "@/lib/model/depth";
import { useReview } from "./review-context";

function Claimed({ row }: { row: FactRow }) {
  const { claims, hl, setHl, decision } = useReview();
  const value = row.claimed;
  const differ = disagreedFacts(readingOf(decision)).has(row.field);
  return (
    <span className="fs-cell fs-cell--static" data-testid={`fact-cell-${row.field}-request`} data-differ={differ || undefined}>
      {value ? (
        <span className="t-ui-sm text-fg t-clamp-2 t-wrap-any" title={value}>
          {value}
          {row.claimIndexes.map((i) => (
            <button key={i} type="button" className="lt-n ml-1" style={{ position: "static", display: "inline-block", border: 0 }} aria-label={`Quote ${i + 1} on the letter`} data-hl={hl.claim === i} onMouseEnter={() => setHl({ field: row.field, claim: i })} onMouseLeave={() => setHl({ field: null, claim: null })} onClick={() => setHl({ field: row.field, claim: i })}>
              {i + 1}
            </button>
          ))}
        </span>
      ) : (
        <span className="t-ui-sm text-fg-muted">{claims ? "—" : <span className="p-skel" style={{ width: "60%", height: 12 }} aria-hidden />}</span>
      )}
      {differ ? <span className="fs-differ block"><Chip tone="conflict" glyph="✕" testId="readings-differ">{READINGS.chip}</Chip></span> : null}
    </span>
  );
}

function SourceCellView({ row, cell, loading }: { row: FactRow; cell: SourceCell; loading: boolean }) {
  const { openEvidence } = useReview();
  const o = cell.observation;
  if (!o) {
    return (
      <span className="fs-cell fs-cell--static" data-testid={`fact-cell-${row.field}-${cell.source}`}>
        {loading && row.status === null ? <span className="p-skel" style={{ width: "50%", height: 12 }} aria-hidden /> : <span className="t-ui-sm text-fg-muted">—</span>}
      </span>
    );
  }
  const raw = o.value ?? "—";
  const val = factValue(o.value);
  const mode = o.mode !== "live" ? MODE_LABELS[o.mode] : null;
  const inner = (
    <>
      <span className={`t-ui-sm text-fg t-clamp-2 t-wrap-any ${cell.blocked ? "p-struck" : ""}`} title={raw}>{val}</span>
      <span className="flex flex-wrap gap-1 mt-1">
        {mode ? <Chip tone="gap" glyph="○">{mode}</Chip> : null}
        {cell.extra > 0 ? <span className="t-mono-label text-fg-muted">{FACTS.moreN(cell.extra)}</span> : null}
      </span>
      {cell.blocked ? <span className="t-ui-xs text-conflict-text block mt-1">{FACTS.blocked}</span> : null}
    </>
  );
  if (cell.blocked) return <span className="fs-cell fs-cell--static fs-fill" data-testid={`fact-cell-${row.field}-${cell.source}`}>{inner}</span>;
  return (
    <button type="button" className="fs-cell fs-fill" data-testid={`fact-cell-${row.field}-${cell.source}`} data-query-id={o.query_id} aria-label={FACTS.cellLabel(row.label, SOURCE_LABELS[cell.source], val)} onClick={() => openEvidence(o.evidence_id)}>
      {inner}
    </button>
  );
}

function ResultView({ row }: { row: FactRow }) {
  if (row.status) {
    const s = FACT_STATUS[row.status];
    return (
      <span className="fs-cell fs-cell--static">
        <span className="t-ui-sm t-medium flex items-baseline gap-1.5"><StatusGlyph glyph={s.glyph} tone={s.tone} /><span style={{ color: "var(--fg)" }}>{s.word}</span></span>
        {row.why ? <span className="t-ui-xs text-fg-muted block mt-1">{row.why}</span> : null}
      </span>
    );
  }
  return (
    <span className="fs-cell fs-cell--static">
      {row.provisional === "looking" ? <Chip prov tone="gap" glyph="○" wrap>{FACTS.provisional.looking}</Chip>
        : row.provisional === "scout" ? <Chip prov tone="conflict" glyph="✕" wrap>{FACTS.provisional.flaggedScout}</Chip>
        : row.provisional === "examiner" ? <Chip prov tone="conflict" glyph="✕" wrap>{FACTS.provisional.flaggedExaminer}</Chip>
        : <span className="t-ui-sm text-fg-muted">{FACTS.checking}</span>}
    </span>
  );
}

function Dot({ col }: { col: SourceCol }) {
  return <span className="fs-dot" style={{ background: col === "vendor_master" ? "var(--source-synthetic)" : "var(--source-real)" }} aria-hidden />;
}

function Table({ rows, loading }: { rows: FactRow[]; loading: boolean }) {
  const { hl, setHl } = useReview();
  return (
    <div className="fs-wrap" tabIndex={0} role="region" aria-label="Fact sheet table">
      <table className="fs" data-testid="fact-sheet">
        <colgroup><col style={{ width: "14%" }} /><col style={{ width: "17%" }} /><col style={{ width: "17%" }} /><col style={{ width: "17%" }} /><col style={{ width: "15%" }} /><col style={{ width: "20%" }} /></colgroup>
        <thead>
          <tr>
            <th scope="col" className="sticky-l">{FACT_COLUMNS.fact}</th>
            <th scope="col">{FACT_COLUMNS.claimed}</th>
            {SOURCE_COLS.map((c) => <th key={c} scope="col"><Dot col={c} />{FACT_COLUMNS[c]}</th>)}
            <th scope="col" className="sticky-r">{FACT_COLUMNS.result}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field} data-testid={`fact-row-${row.field}`} data-status={row.status ?? "checking"} data-hl={hl.field === row.field ? "true" : undefined} onMouseEnter={() => setHl({ field: row.field, claim: null })} onMouseLeave={() => setHl({ field: null, claim: null })}>
              <td className="sticky-l"><span className="fs-cell fs-cell--static t-ui-sm text-fg">{row.label}</span></td>
              <td><Claimed row={row} /></td>
              {SOURCE_COLS.map((c) => <td key={c}><SourceCellView row={row} cell={row.cells[c]} loading={loading} /></td>)}
              <td className="sticky-r"><ResultView row={row} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cards({ rows, loading }: { rows: FactRow[]; loading: boolean }) {
  const { hl, setHl } = useReview();
  return (
    <div className="fs-cards" data-testid="fact-sheet">
      {rows.map((row) => (
        <article key={row.field} className="fs-card" data-testid={`fact-row-${row.field}`} data-status={row.status ?? "checking"} data-hl={hl.field === row.field ? "true" : undefined} onMouseEnter={() => setHl({ field: row.field, claim: null })}>
          <div className="flex items-start justify-between gap-3"><span className="t-ui text-fg">{row.label}</span><ResultView row={row} /></div>
          <div className="fs-card__line"><span className="t-mono-label text-fg-muted">{FACT_COLUMNS.claimed}</span><Claimed row={row} /></div>
          {SOURCE_COLS.map((c) => (
            <div key={c} className="fs-card__line"><span className="t-mono-label text-fg-muted"><Dot col={c} />{SOURCE_LABELS[c]}</span><SourceCellView row={row} cell={row.cells[c]} loading={loading} /></div>
          ))}
        </article>
      ))}
    </div>
  );
}

/** R-FACTS (01 section 7.1.5, 17.4): 8 rows x 6 columns, source cells are buttons, status and why come from the API. */
export function FactSheet() {
  const { state, decision, claims, sample } = useReview();
  const bp = useBreakpoint();
  const rows = useMemo(() => buildFactRows({ decision, claims, observations: state.observations, trace: state.trace }), [decision, claims, state.observations, state.trace]);
  return (
    <section id="facts" className="grid gap-3" data-testid="fact-sheet-region">
      <div className="region-head" style={{ marginBottom: 0 }}><Eyebrow>{FACTS.heading}</Eyebrow></div>
      <div className="fs-legend">{FACTS.legend.map(([g, w, t]) => <Chip key={w} tone={t} glyph={g}>{w}</Chip>)}</div>
      <p className="t-ui-xs text-fg-muted measure-body">{sample ? FACTS.captionSample : FACTS.captionLive}</p>
      {bp === "narrow" ? <Cards rows={rows} loading={!decision} /> : <Table rows={rows} loading={!decision} />}
    </section>
  );
}
