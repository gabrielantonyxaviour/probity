"use client";
import type { GateDecision } from "@/lib/contracts";
import { INJECTION, READINGS } from "@/lib/copy-depth";
import { maskAccounts } from "@/lib/mask";
import { injectionOf, readingOf } from "@/lib/model/depth";
import { Card } from "./DossierSections";

const fieldName = (f: string) => READINGS.fields[f] ?? f.replace(/_/g, " ");

/** Dossier: the two letter readings (D1) and any text addressed to an automated reviewer (D6). Absent on older runs. */
export function LetterChecksSection({ d }: { d: GateDecision }) {
  const r = readingOf(d);
  const inj = injectionOf(d);
  if (!r && !inj) return null;
  return (
    <Card n="03a" title={READINGS.title}>
      {r ? (
        <>
          <p className="t-ui text-fg" data-testid="dossier-readings">
            {r.agreement != null ? `${Math.round(r.agreement * 100)}% · ` : ""}
            {r.material_disagreements.length ? READINGS.disagree(r.material_disagreements.map(fieldName).join(", ")) : r.status === "agree" ? READINGS.agreeAll(r.compared) : r.status === "single" ? READINGS.single : r.status === "none" ? READINGS.none : READINGS.agreeSome(r.agreed, r.compared)}
          </p>
          <div className="ds-scroll" tabIndex={0} role="region" aria-label={READINGS.title}>
            <table className="ds-table">
              <thead><tr>{READINGS.cols.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
              <tbody>
                {r.fields.map((f) => (
                  <tr key={f.field}><td>{fieldName(f.field)}{f.material ? ` · ${READINGS.decisive}` : ""}</td><td className="t-mono-data t-wrap-any">{f.a != null ? maskAccounts(f.a) : "—"}</td><td className="t-mono-data t-wrap-any">{f.b != null ? maskAccounts(f.b) : "—"}</td><td>{f.agree ? READINGS.agreeWord : READINGS.differWord}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="t-mono-label text-fg-muted t-wrap-any">{r.readings.map((x) => `${READINGS.reading[x.reading]}: ${x.status}${x.model_call_id ? ` · receipt ${x.model_call_id}` : ""}`).join(" | ")}</p>
        </>
      ) : null}
      {inj ? (
        <div className="grid gap-2 mt-3" data-testid="dossier-injection">
          <p className="t-ui text-fg">{inj.variant === "hidden" ? INJECTION.title : INJECTION.titleVisible}</p>
          <p className="t-ui-sm text-fg-2">{inj.variant === "hidden" ? INJECTION.explainHidden(INJECTION.outcome[d.decision] ?? INJECTION.outcome.HOLD!) : INJECTION.explainVisible(INJECTION.outcome[d.decision] ?? INJECTION.outcome.HOLD!)}</p>
          <ol className="grid gap-2">
            {inj.spans.map((s) => (
              <li key={s.span_id} className="t-ui-sm"><span className="t-mono-label text-fg-muted">{(INJECTION.channel[s.channel] ?? INJECTION.channel.pdf_text!)(s.page)}</span><br />{INJECTION.quoted}: “{maskAccounts(s.text)}”</li>
            ))}
          </ol>
        </div>
      ) : null}
    </Card>
  );
}
