"use client";
import { Chip } from "@/components/ui/chip";
import { READINGS } from "@/lib/copy-depth";
import { int } from "@/lib/format";
import { modelShort } from "@/lib/labels-trace";
import { maskAccounts } from "@/lib/mask";
import { readingOf, type DualReading } from "@/lib/model/depth";
import { useReview } from "./review-context";

const fieldName = (f: string) => READINGS.fields[f] ?? f.replace(/_/g, " ");
const secs = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)} s`);

function headline(r: DualReading): { text: string; tone: "agree" | "gap" | "conflict" } {
  if (r.status === "single") return { text: READINGS.single, tone: "gap" };
  if (r.status === "none") return { text: READINGS.none, tone: "gap" };
  if (r.material_disagreements.length > 0) return { text: READINGS.disagree(r.material_disagreements.map(fieldName).join(", ")), tone: "conflict" };
  if (r.agreed === r.compared) return { text: READINGS.agreeAll(r.compared), tone: "agree" };
  return { text: READINGS.agreeSome(r.agreed, r.compared), tone: "gap" };
}

/** D1: both Ultra readings of the letter side by side, field by field; a disagreeing field is marked. */
export function ReadingsCard() {
  const { decision } = useReview();
  const r = readingOf(decision);
  if (!r || r.readings.length === 0) return null;
  const h = headline(r);
  const byId = new Map(r.readings.map((x) => [x.reading, x]));
  const score = r.agreement != null ? `${Math.round(r.agreement * 100)}%` : null;
  return (
    <section className="p-card rd" data-testid="readings-card" data-status={r.status} data-agreement={r.agreement ?? ""}>
      <div className="rd__head">
        <div className="grid gap-1 min-w-0">
          <span className="t-eyebrow">{READINGS.eyebrow}</span>
          <h3 className="t-ui text-fg">{READINGS.title}</h3>
        </div>
        {score ? <span className="t-figure rd__score" data-testid="readings-agreement" style={{ color: h.tone === "conflict" ? "var(--conflict-text)" : h.tone === "agree" ? "var(--agree)" : "var(--fg)" }}>{score}</span> : null}
      </div>
      <p className={`t-ui-sm ${h.tone === "conflict" ? "text-conflict-text" : "text-fg-2"}`} data-testid="readings-summary">{h.text}</p>
      <div className="rd__who">
        {(["A", "B"] as const).map((id) => {
          const x = byId.get(id);
          if (!x) return null;
          return (
            <div key={id} className="rd__reader" data-testid="reading" data-reading={id} data-status={x.status}>
              <span className="t-mono-label text-fg">{READINGS.reading[id]}{r.primary === id ? <span className="text-fg-muted"> · {READINGS.used}</span> : null}</span>
              <span className="t-mono-label text-fg-muted t-wrap-any">
                {x.status === "ok" ? `${modelShort(x.model ?? x.requested_model ?? "")} · ${READINGS.meta(secs(x.latency_ms), x.tokens_in != null ? int(x.tokens_in) : "—", x.tokens_out != null ? int(x.tokens_out) : "—")}` : READINGS.failed(x.error_code)}
              </span>
              {x.model_call_id ? <span className="t-mono-label text-fg-muted t-wrap-any">receipt {x.model_call_id}{x.egress_destination ? ` · ${x.egress_destination}` : ""}</span> : null}
            </div>
          );
        })}
      </div>
      {r.fields.length > 0 ? (
        <ul className="rd__fields" aria-label={READINGS.title}>
          {r.fields.map((f) => (
            <li key={f.field} data-testid="reading-field" data-field={f.field} data-agree={f.agree} data-material={f.material} className={`rd__field ${f.agree ? "" : f.material ? "rd__row--conflict" : "rd__row--gap"}`}>
              <div className="rd__fhead">
                <span className="t-ui-sm text-fg">{fieldName(f.field)}{f.material ? <span className="t-mono-label text-fg-muted"> · {READINGS.decisive}</span> : null}</span>
                {f.agree ? <Chip tone="agree" glyph="✓">{READINGS.agreeWord}</Chip> : <Chip tone={f.material ? "conflict" : "gap"} glyph={f.material ? "✕" : "○"}>{READINGS.differWord}</Chip>}
              </div>
              {f.agree ? (
                <span className="t-mono-data text-fg-2 t-wrap-any">{f.a != null ? maskAccounts(f.a) : "—"}</span>
              ) : (
                <dl className="rd__ab">
                  <div><dt className="t-mono-label text-fg-muted">A</dt><dd className="t-mono-data text-fg t-wrap-any">{f.a != null ? maskAccounts(f.a) : "—"}</dd></div>
                  <div><dt className="t-mono-label text-fg-muted">B</dt><dd className="t-mono-data text-fg t-wrap-any">{f.b != null ? maskAccounts(f.b) : "—"}</dd></div>
                </dl>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
