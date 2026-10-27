"use client";
import { Alert } from "@/components/ui/misc";
import { Chip } from "@/components/ui/chip";
import { SWEEP, FIXED } from "@/lib/copy";
import { money } from "@/lib/format";
import { currentStep } from "@/lib/model/stepper";
import { groupSweep, recName, ruleList, ruleName, ruleTable, uniqueItems } from "@/lib/model/sweep";
import { useReview } from "./review-context";

/** R-SWEEP: the agent volunteering a finding, info tone (01 section 7.1.3). Header and findings come from the payload. */
export function SweepAlert() {
  const { decision, state, running, openQuery } = useReview();
  if (!decision) return null;
  const s = decision.sweep;
  const run = decision.exposure.payment_run_id;
  const sweeping = running && currentStep(state.trace, state.stage) <= 7 && s.rules_run.length === 0 && s.findings.length === 0;
  if (sweeping) {
    return (
      <section id="sweep" data-testid="sweep-banner">
        <Alert tone="info" role="status"><span className="text-fg-2">{SWEEP.running(run)}</span></Alert>
      </section>
    );
  }
  const none = s.findings.length === 0;
  const items = groupSweep(s.findings);
  return (
    <section id="sweep" data-testid="sweep-banner">
      <Alert tone="info">
        <p className="t-ui text-fg" data-testid="sweep-header">
          {none ? SWEEP.none(run, decision.exposure.run_item_count, ruleList(s.rules_run.map((r) => r.rule))) : FIXED.sweepHeader(uniqueItems(s.findings), run, money(s.amount_usd))}
        </p>
        {!none ? (
          <ul className="sw-rows">
            {items.map((it) => (
              <li key={it.item_id} className="sw-row" data-testid="sweep-finding" data-item={it.item_id} data-rules={it.findings.map((f) => f.rule).join(",")}>
                <p className="t-ui-sm text-fg">
                  <span className="t-mono-data">{it.item_id}</span> · <span className="t-wrap-any">{it.vendor_name}</span> (<span className="t-mono-data">{it.vendor_id}</span>) · <span className="t-mono-data">{money(it.amount_usd)}</span>
                </p>
                {it.findings.map((f) => (
                  <div key={f.rule} className="sw-hit" data-testid="sweep-hit" data-rule={f.rule}>
                    <p className="t-ui-sm text-fg-2">{f.detail}</p>
                    <div className="sw-chips">
                      <Chip wrap tone="info" glyph="i">{f.rule} · {ruleName(f.rule)}</Chip>
                      <Chip wrap tone="gap" glyph="○">{recName(f.recommendation)}</Chip>
                      <button type="button" className="t-mono-label p-link text-fg-2" onClick={() => openQuery(f.query_id)} data-testid="sweep-query">{SWEEP.query(f.query_id.slice(0, 8))}</button>
                    </div>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        ) : null}
        {s.rules_run.length > 0 ? (
          <div className="sw-rules" data-testid="sweep-rules">
            <p className="t-eyebrow">{SWEEP.rulesHead}</p>
            <ul>
              {s.rules_run.map((r) => (
                <li key={r.rule} className="sw-rule" data-testid="sweep-rule" data-rule={r.rule} data-invalid={r.invalid}>
                  <span className="t-mono-data text-fg">{r.rule}</span>
                  <span className="t-ui-sm text-fg-2 min-w-0">
                    {ruleName(r.rule)} <span className="t-mono-label text-fg-muted t-wrap-any">· {ruleTable(r.rule)}</span>
                    {r.groups?.map((g) => (
                      <span key={g.account_hash} className="block t-mono-label text-fg t-wrap-any" data-testid="sweep-rule-group">{SWEEP.sharedBy(g.vendor_ids, g.account_hash.slice(0, 8))}</span>
                    ))}
                  </span>
                  <span className={`t-ui-sm ${r.invalid > 0 ? "text-fg" : "text-fg-2"}`}>{r.invalid > 0 ? SWEEP.ruleLine(r.invalid, r.total) : SWEEP.ruleClean(r.total)}</span>
                  <button type="button" className="t-mono-label p-link text-fg-2 text-left" onClick={() => openQuery(r.query_id)} data-testid="sweep-rule-query" title={r.query_id}>{SWEEP.query(r.query_id.slice(0, 8))}</button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Alert>
    </section>
  );
}
