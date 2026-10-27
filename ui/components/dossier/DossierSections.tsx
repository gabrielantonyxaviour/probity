"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { GateDecision } from "@/lib/contracts";
import { Chip, StatusGlyph } from "@/components/ui/chip";
import { Alert } from "@/components/ui/misc";
import { DOSSIER, FIXED, MORE, SCRIPT, SWEEP, EXPO, DECISION } from "@/lib/copy";
import { FACT_STATUS, DECISION_UI, CLASS_WORDS, reasonTitle } from "@/lib/labels";
import { MODE_LABELS } from "@/lib/labels-trace";
import { isoText, money, plural, runDate, stamp } from "@/lib/format";
import { maskAccounts } from "@/lib/mask";
import { factValue } from "@/lib/fact-value";
import { groupReasons, hasLookalike } from "@/lib/model/reasons";
import { groupSweep, recName, ruleList, ruleName, ruleTable, uniqueItems } from "@/lib/model/sweep";
import { NemotronJobs } from "@/components/review/NemotronJobs";
import { ModelLedger } from "@/components/review/ModelLedger";
import { splitBanner } from "@/components/review/DecisionCard";

export function Card({ n, title, children, brk, id }: { n: string; title: string; children: ReactNode; brk?: boolean; id?: string }) {
  return (
    <section className={`ds-card ${brk ? "ds-card--break" : ""}`} id={id} data-testid={`dossier-section-${n}`} data-heading={title}>
      <div className="ds-card__head"><span className="t-mono-data text-fg-muted">{n}</span><h2 className="ds-title">{title}</h2></div>
      <div className="ds-card__body">{children}</div>
    </section>
  );
}

const Table = ({ head, children }: { head: readonly string[]; children: ReactNode }) => (
  <div className="ds-scroll" tabIndex={0} role="region" aria-label="Table"><table className="ds-table"><thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
);

export function DecisionSection({ d }: { d: GateDecision }) {
  const ui = DECISION_UI[d.decision];
  const [a, b] = splitBanner(d.banner_text);
  return (
    <Card n="01" title={DOSSIER.sections.decision}>
      <p className="t-decision text-fg flex items-center gap-3" data-testid="dossier-decision"><span aria-hidden>{ui.glyph}</span>{ui.word}</p>
      <p className="t-lede"><span className="text-fg">{a}</span><span className="text-fg-muted">{b}</span></p>
      <p className="t-ui-sm text-fg-muted">{DECISION.coverage(d.evidence_coverage.with_live_evidence, d.evidence_coverage.decisive_fields)}</p>
    </Card>
  );
}

export function MoneySection({ d }: { d: GateDecision }) {
  const e = d.exposure;
  const rows: Array<[string, string]> = [
    ["Payment run", EXPO.run(e.payment_run_id, runDate(e.scheduled_date), e.cutoff_local)],
    [e.scope === "candidates" ? "Possible vendors" : "This vendor", e.scope === "none" ? "not one of our vendors" : `${plural(e.vendor_item_count, "item")} · ${money(e.vendor_amount_usd)}`],
    ["Whole run", `${plural(e.run_item_count, "item")} · ${money(e.run_amount_usd)}`],
  ];
  return <Card n="02" title={DOSSIER.sections.money}><dl className="p-dl">{rows.map(([k, v]) => <div key={k}><dt className="t-ui-sm">{k}</dt><dd className="t-mono-data">{v}</dd></div>)}</dl></Card>;
}

export function ReasonsSection({ d }: { d: GateDecision }) {
  const g = groupReasons(d.reason_codes);
  const look = hasLookalike(d.reason_codes);
  const sid = d.memory_recalled.find((m) => m.engine === "world_model")?.session_id ?? null;
  const all = [...g.red, ...g.cap, ...g.info];
  return (
    <Card n="03" title={DOSSIER.sections.reasons}>
      <Table head={DOSSIER.reasonCols}>
        {all.map((r) => (
          <tr key={r.code} data-testid="dossier-reason"><td className="t-mono-data">{r.code}<br /><span className="text-fg-muted">{CLASS_WORDS[r.class]}</span></td><td>{reasonTitle(r.code, { variant: r.variant, lookalike: look, sessionId: sid })}</td><td>{r.detail}</td><td className="t-mono-data t-wrap-any">{r.evidence_ids.join(", ") || "—"}</td></tr>
        ))}
        {all.length === 0 ? <tr><td colSpan={4} className="text-fg-muted">{DOSSIER.noRows}</td></tr> : null}
      </Table>
    </Card>
  );
}

export function ScriptSection({ d }: { d: GateDecision }) {
  return (
    <Card n="04" title={DOSSIER.sections.script}>
      {d.callback_scripts.length === 0 ? <p className="t-ui text-fg-2">{d.decision === "APPROVE" ? DOSSIER.noRows : SCRIPT.none}</p> : null}
      {d.callback_scripts.map((s, i) => (
        <div key={i} className="grid gap-2" data-testid="callback-script" data-vendor={s.for_vendor_id ?? ""}>
          {d.callback_scripts.length > 1 ? <p className="t-ui text-fg">{SCRIPT.forVendor(s.vendor_name ?? "", s.for_vendor_id)}</p> : null}
          <p className="t-figure" style={{ fontSize: 28 }} data-testid="callback-number">{s.number_display}</p>
          <p className="t-ui-sm text-fg-muted">{isoText(s.source_label)}</p>
          {s.do_not_use.length ? <div data-testid="do-not-use"><span className="t-eyebrow">{SCRIPT.doNotUse}</span>{s.do_not_use.map((x) => <p key={x.number_display} className="t-ui-sm"><span className="p-struck t-mono-data">{x.number_display}</span> {x.reason}</p>)}</div> : null}
          <ol className="grid gap-1">{s.lines.map((l, j) => <li key={j} className="t-ui-sm text-fg">{String(j + 1).padStart(2, "0")}  {isoText(l)}</li>)}</ol>
        </div>
      ))}
      <p className="t-mono-label text-fg-2 mt-2">{DOSSIER.outcomeBlock}</p>
    </Card>
  );
}

export function SweepSection({ d }: { d: GateDecision }) {
  const s = d.sweep;
  return (
    <Card n="05" title={DOSSIER.sections.sweep}>
      <p className="t-ui text-fg">{s.findings.length ? FIXED.sweepHeader(uniqueItems(s.findings), d.exposure.payment_run_id, money(s.amount_usd)) : SWEEP.none(d.exposure.payment_run_id, d.exposure.run_item_count, ruleList(s.rules_run.map((r) => r.rule)))}</p>
      {s.findings.length ? (
        <Table head={DOSSIER.sweepCols}>
          {groupSweep(s.findings).flatMap((it) =>
            it.findings.map((f, j) => (
              <tr key={it.item_id + f.rule} data-testid={j === 0 ? "sweep-finding" : "sweep-hit"} data-item={it.item_id}><td className="t-mono-data">{j === 0 ? it.item_id : ""}</td><td>{j === 0 ? `${it.vendor_name} (${it.vendor_id})` : ""}</td><td className="t-mono-data">{j === 0 ? money(it.amount_usd) : ""}</td><td>{f.rule} · {ruleName(f.rule)}</td><td>{f.detail}</td><td>{recName(f.recommendation)}</td><td className="t-mono-data">{f.query_id.slice(0, 8)}</td></tr>
            )),
          )}
        </Table>
      ) : null}
      {s.rules_run.length ? (
        <Table head={DOSSIER.sweepRuleCols}>
          {s.rules_run.map((r) => (
            <tr key={r.rule} data-testid="sweep-rule" data-rule={r.rule}><td className="t-mono-data">{r.rule}</td><td>{ruleName(r.rule)}</td><td className="t-mono-data t-wrap-any">{ruleTable(r.rule)}</td><td className="t-mono-data">{r.invalid} / {r.total}</td><td className="t-mono-data t-wrap-any">{r.query_id}</td></tr>
          ))}
        </Table>
      ) : null}
    </Card>
  );
}

export function ConflictsSection({ d }: { d: GateDecision }) {
  return (
    <Card n="06" title={DOSSIER.sections.conflicts}>
      {d.conflicts.length === 0 ? <p className="t-ui-sm text-fg-muted">{DOSSIER.noRows}</p> : (
        <Table head={DOSSIER.conflictCols}>{d.conflicts.map((c) => <tr key={c.conflict_id}><td>{c.description}</td><td>{c.resolution === "unresolved" ? MORE.resolved.unresolved : "Resolved"}</td><td>{c.resolution === "unresolved" ? "—" : c.by === "policy" ? "Policy" : "Identity Examiner"}</td></tr>)}</Table>
      )}
    </Card>
  );
}

export function EvidenceSection({ d, runId }: { d: GateDecision; runId: string }) {
  return (
    <Card n="07" title={DOSSIER.sections.evidence} brk>
      <Table head={DOSSIER.evidenceCols}>
        {d.fact_sheet.flatMap((f) => {
          const st = FACT_STATUS[f.status];
          return [
            <tr key={f.field} className="grp"><td colSpan={6}><span className="inline-flex items-center gap-2"><StatusGlyph glyph={st.glyph} tone={st.tone} /><b style={{ fontWeight: 400, color: "var(--fg)" }}>{f.label}</b> · {st.word} <span className="text-fg-muted">— {f.why}</span></span></td></tr>,
            ...f.observations.map((o) => (
              <tr key={`${o.evidence_id}${o.source}`} data-testid="evidence-row">
                <td className="text-fg-muted">{f.label}</td>
                <td className="t-wrap-any" title={o.value ?? undefined}>{maskAccounts(factValue(o.value))}</td>
                <td>{o.source === "request" ? DOSSIER.requestSource : ({ vendor_master: "Our vendor master", usaspending: "USAspending", edgar: "SEC EDGAR" } as Record<string, string>)[o.source]}</td>
                <td>{MODE_LABELS[o.mode]}</td>
                <td className="t-mono-data">{stamp(o.fetched_at)}</td>
                <td>{o.source === "request" ? "—" : <><Link className="t-mono-data p-link" href={`/app/review/${runId}?query=${o.query_id}`}>{o.query_id.slice(0, 8)}</Link><br /><span className="t-mono-label text-fg-muted t-wrap-any">SQL {o.sql_hash} · ROWS {o.row_hash}</span></>}</td>
              </tr>
            )),
          ];
        })}
      </Table>
    </Card>
  );
}

export function EditsSection({ d }: { d: GateDecision }) {
  return (
    <Card n="08" title={DOSSIER.sections.edits}>
      <div><Chip>{MORE.proposed}</Chip></div>
      {d.suggested_edits.length === 0 ? <p className="t-ui-sm text-fg-muted">{DOSSIER.noRows}</p> : <Table head={MORE.editCols}>{d.suggested_edits.map((e) => <tr key={e.vendor_id + e.field}><td className="t-mono-data">{e.vendor_id}</td><td>{e.field}</td><td>{e.current ?? "—"}</td><td>{e.suggested}</td><td className="t-mono-data">{e.evidence_ids.length}</td></tr>)}</Table>}
    </Card>
  );
}

export function RememberedSection({ d }: { d: GateDecision }) {
  return (
    <Card n="09" title={DOSSIER.sections.remembered}>
      {d.memory_recalled.length === 0 ? <p className="t-ui-sm text-fg-muted">{DOSSIER.noRows}</p> : (
        <Table head={["Engine", "Session", "What", "Effect"]}>{d.memory_recalled.map((m) => <tr key={m.memory_id}><td>{m.engine === "world_model" ? "World Model" : "H-MEM"}</td><td className="t-mono-data">{m.session_id}</td><td>{maskAccounts(m.text)}</td><td>{m.effect}</td></tr>)}</Table>
      )}
    </Card>
  );
}

export function TailSections({ d }: { d: GateDecision }) {
  const cost = d.cost;
  return (
    <>
      <Card n="10" title={DOSSIER.sections.summary}>
        <p className="t-ui text-fg-2 measure-body">{d.rationale.text || "—"}</p>
        <p className="t-ui-xs text-fg-muted">{d.rationale.source === "model" ? `${DECISION.numbersChecked}` : "Template text"}</p>
      </Card>
      <Card n="11" title={DOSSIER.sections.models}>
        <NemotronJobs />
        <ModelLedger defaultOpen />
        {cost ? <p className="t-mono-label text-fg-muted">{`${cost.deep_calls} deep · ${cost.fast_calls} fast calls`}</p> : null}
      </Card>
      <Card n="12" title={DOSSIER.sections.limitations}>
        <ul className="grid gap-2">{[...d.limitations, DOSSIER.fixedLimit].map((l) => <li key={l} className="t-ui-sm text-fg-2">{l}</li>)}</ul>
      </Card>
      <Card n="13" title={DOSSIER.sections.signoff}>
        <div className="ds-sign t-ui-sm text-fg">
          <p>{DOSSIER.signReviewed.replace(/_{3,}/g, "").replace("Date", "")}<span className="ds-blank" /> Date <span className="ds-blank" style={{ minWidth: 100 }} /></p>
          <p>{DOSSIER.signApproved.replace(/_{3,}/g, "").replace("Date", "")}<span className="ds-blank" /> Date <span className="ds-blank" style={{ minWidth: 100 }} /></p>
        </div>
      </Card>
    </>
  );
}

export const NoticeAlert = ({ text, tone = "info" }: { text: string; tone?: "info" | "gap" }) => <Alert tone={tone} testId={tone === "gap" ? "dossier-partial" : "synthetic-notice"}>{text}</Alert>;
