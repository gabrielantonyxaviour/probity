import { Check } from "lucide-react";
import { CodeCard } from "./CodeCard";
import { PillLink } from "./PillLink";
import { CHIP } from "./OutcomeCard";
import { RUN } from "./copy-more";
import { plural, usd } from "./format";
import type { LandingRun } from "./data/live-state";
import { APP_HOME, README_URL, evidenceHref, reviewHref } from "./routes";

/** Section 7: run it yourself. The decision and re-run cards are read from the latest HOLD run, never seeded. */
export function RunIt({ hold }: { hold: LandingRun | undefined }) {
  const chip = CHIP.HOLD;
  const e = hold?.exposure;
  const hash = hold?.t11_row_hash;
  return (
    <section id="run" className="l-section" aria-labelledby="run-h">
      <div className="l-run">
        <div className="l-run-text">
          <h2 id="run-h" className="t-heading">{RUN.heading}</h2>
          <p className="t-lede">{RUN.lede} <span className="l-muted">{RUN.ledeMuted}</span></p>
          <ul className="l-checks">
            {RUN.checks.map((c) => (
              <li key={c.title}>
                <span className="l-check-mark"><Check size={16} aria-hidden /></span>
                <span><span className="l-check-title">{c.title}</span> <span className="l-muted">{c.body}</span></span>
              </li>
            ))}
          </ul>
          <div className="l-run-pills">
            <PillLink href={APP_HOME} variant="accent" size="md">{RUN.primary}</PillLink>
            <PillLink href={README_URL} size="md">{RUN.secondary}</PillLink>
          </div>
        </div>
        <div className="l-run-cards l-linegrid">
          <div className="l-run-stack">
            <CodeCard title="// CLI"><pre className="l-pre">{RUN.cli}</pre></CodeCard>
            <CodeCard title="// DECISION">
              {hold && e ? (
                <div className="l-code-row">
                  <span className={`p-chip ${chip.cls}`}><span aria-hidden="true">{chip.glyph}</span> {chip.word}</span>
                  <span className="t-mono-label l-zero">{plural(e.vendor_item_count, "ITEM", "ITEMS")} {"·"} {usd(e.vendor_amount_usd)} IN {e.payment_run_id}</span>
                </div>
              ) : (
                <p className="t-mono-label l-code-missing">{RUN.missing}</p>
              )}
            </CodeCard>
            <CodeCard title="// RE-RUN IN ZETARIS" fade>
              {hold && hash ? (
                <div className="l-code-row">
                  <span className="t-mono-label l-zero">ROW HASH {hash.slice(0, 8)}{"…"}</span>
                  <a className="t-mono-label l-link" href={hold.t11_evidence_id ? evidenceHref(hold.run_id, hold.t11_evidence_id) : reviewHref(hold.run_id)}>
                    RE-RUN AND COMPARE {"→"}
                  </a>
                </div>
              ) : (
                <p className="t-mono-label l-code-missing">{RUN.missing}</p>
              )}
            </CodeCard>
          </div>
        </div>
      </div>
    </section>
  );
}
