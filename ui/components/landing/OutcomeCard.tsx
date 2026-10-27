import { PillLink } from "./PillLink";
import { ANSWERS } from "./copy";
import { stamp, usd, plural } from "./format";
import { APP_HOME } from "./routes";
import type { LandingDecision, LandingRun } from "./data/live-state";
import { JsonLines } from "./CodeCard";

export const CHIP: Record<LandingDecision, { glyph: string; word: string; cls: string; title: string }> = {
  HOLD: { glyph: "✕", word: "HOLD", cls: "p-chip--hold", title: "Hold" },
  CALLBACK_VERIFY: { glyph: "○", word: "CALL BACK FIRST", cls: "p-chip--callback", title: "Call back first" },
  APPROVE: { glyph: "✓", word: "APPROVE", cls: "p-chip--approve", title: "Approve" },
};
const CLASS_GLYPH = { red: "✕", cap: "○", info: "i" } as const;
const MODE_BADGE = { live: "LIVE", sample: "SAMPLE RUN", mirror: "MIRROR DATA" } as const;

/** The subset of the run's GateDecision shown behind the CARD / JSON toggle. Every value comes from the run. */
export function runSubset(run: LandingRun) {
  return {
    run_id: run.run_id,
    request_id: run.request_id,
    decision: run.decision,
    banner_text: run.banner_text,
    decided_at: run.decided_at,
    mode: run.mode,
    exposure: {
      payment_run_id: run.exposure.payment_run_id,
      vendor_item_count: run.exposure.vendor_item_count,
      vendor_amount_usd: run.exposure.vendor_amount_usd,
    },
    reason_codes: run.reasons,
    callback_script: run.script,
  };
}

type Props = { decision: LandingDecision; run: LandingRun | undefined; api: "up" | "down"; view: "card" | "json" };

/** A real check result, read from the product at request time. No run: an honest empty or down state. */
export function OutcomeCard({ decision, run, api, view }: Props) {
  if (!run) {
    return (
      <div className="l-card l-card--empty">
        <p className="t-mono-label l-card-eyebrow">{CHIP[decision].word}</p>
        <p className="l-card-empty">{api === "down" ? ANSWERS.down : ANSWERS.empty}</p>
        <PillLink href={APP_HOME}>{ANSWERS.openQueue}</PillLink>
      </div>
    );
  }
  if (view === "json") return <JsonLines value={runSubset(run)} />;
  const chip = CHIP[run.decision];
  const e = run.exposure;
  return (
    <article className="l-card">
      <header className="l-card-head">
        <span className={`p-chip ${chip.cls}`}>
          <span aria-hidden="true">{chip.glyph}</span> {chip.word}
        </span>
        <span className="l-card-badges">
          <span className="p-badge">{MODE_BADGE[run.mode]}</span>
          <span className="p-badge">DEMO {"·"} SYNTHETIC</span>
        </span>
      </header>
      <div className="l-card-body">
        <p className="l-card-banner">{run.banner_text}</p>
        <dl className="l-card-dl">
          <div><dt>Run</dt><dd className="l-zero">{run.run_id}</dd></div>
          <div><dt>Request</dt><dd className="l-zero">{run.request_id}</dd></div>
          <div><dt>Decided</dt><dd className="l-zero">{stamp(run.decided_at)}</dd></div>
          {e.vendor_item_count > 0 ? (
            <div>
              <dt>At stake</dt>
              <dd className="l-zero">{plural(e.vendor_item_count, "item", "items")} {"·"} {usd(e.vendor_amount_usd)} {"·"} {e.payment_run_id}</dd>
            </div>
          ) : null}
          {run.script ? (
            <div><dt>Call</dt><dd className="l-zero">{run.script.number_display}</dd></div>
          ) : null}
          {run.reasons.length > 0 ? (
            <div>
              <dt>Reasons</dt>
              <dd className="l-reasons">
                {run.reasons.map((r) => (
                  <span key={r.code} className="p-chip">
                    <span aria-hidden="true">{CLASS_GLYPH[r.class]}</span> {r.code}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="l-card-note">{ANSWERS.synthetic(run.claimed_name)}</p>
      </div>
    </article>
  );
}
