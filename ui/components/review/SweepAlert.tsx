"use client";
import { Alert } from "@/components/ui/misc";
import { Chip } from "@/components/ui/chip";
import { SWEEP, FIXED } from "@/lib/copy";
import { money } from "@/lib/format";
import { currentStep } from "@/lib/model/stepper";
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
  return (
    <section id="sweep" data-testid="sweep-banner">
      <Alert tone="info">
        <p className="t-ui text-fg">
          {none ? SWEEP.none(run, decision.exposure.run_item_count) : FIXED.sweepHeader(s.findings.length, run, money(s.amount_usd))}
        </p>
        {!none ? (
          <ul className="sw-rows">
            {s.findings.map((f) => (
              <li key={`${f.item_id}${f.rule}`} className="sw-row" data-testid="sweep-finding" data-item={f.item_id}>
                <p className="t-ui-sm text-fg">
                  <span className="t-mono-data">{f.item_id}</span> · <span className="t-wrap-any">{f.vendor_name}</span> (<span className="t-mono-data">{f.vendor_id}</span>) · <span className="t-mono-data">{money(f.amount_usd)}</span>
                </p>
                <p className="t-ui-sm text-fg-2">{f.detail}</p>
                <div className="sw-chips">
                  <Chip wrap tone="info" glyph="i">{f.rule} · {SWEEP.rules[f.rule]}</Chip>
                  <Chip wrap tone="gap" glyph="○">{SWEEP.recs[f.recommendation]}</Chip>
                  <button type="button" className="t-mono-label p-link text-fg-2" onClick={() => openQuery(f.query_id)}>query {f.query_id.slice(0, 8)}</button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {s.rules_run.length > 0 ? (
          <div className="sw-foot">
            {s.rules_run.map((r) => (
              <button key={r.rule} type="button" className="t-mono-label p-link text-fg-2 text-left" onClick={() => openQuery(r.query_id)}>
                {SWEEP.footer(r.rule, r.invalid, r.total)}
              </button>
            ))}
          </div>
        ) : null}
      </Alert>
    </section>
  );
}

