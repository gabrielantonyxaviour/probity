"use client";
import { Chip } from "@/components/ui/chip";
import { INJECTION } from "@/lib/copy-depth";
import { reasonTitle } from "@/lib/labels";
import { maskAccounts } from "@/lib/mask";
import { injectionOf, spanBox, type InjectionSpan } from "@/lib/model/depth";
import { useReview } from "./review-context";

const where = (s: InjectionSpan) => (INJECTION.channel[s.channel] ?? INJECTION.channel.pdf_text!)(s.page);
const finders = (s: InjectionSpan) => s.found_by.map((f) => INJECTION.foundBy[f] ?? f).join(", ");

/** D6: what the hidden text is, in an AP clerk's words, each passage quoted (never followed), and the red reason. */
export function InjectionCard({ onShow }: { onShow?: (page: number) => void }) {
  const { decision, setHl } = useReview();
  const inj = injectionOf(decision);
  if (!inj || !decision) return null;
  const hidden = inj.variant === "hidden" || inj.spans.some((s) => s.hidden);
  const r8 = decision.reason_codes.find((c) => c.code === "R8");
  return (
    <section className="ij" data-testid="injection-card" data-variant={hidden ? "hidden" : "visible"} role="note">
      <div className="ij__head">
        <span className="p-dot" style={{ color: "var(--conflict)" }} aria-hidden />
        <h3 className="t-ui t-medium text-fg">{hidden ? INJECTION.title : INJECTION.titleVisible}</h3>
        <span className="t-mono-label text-fg-muted">{INJECTION.spans(inj.spans.length)}</span>
      </div>
      <p className="t-ui-sm text-fg">{hidden ? INJECTION.explainHidden(INJECTION.outcome[decision.decision] ?? INJECTION.outcome.HOLD!) : INJECTION.explainVisible(INJECTION.outcome[decision.decision] ?? INJECTION.outcome.HOLD!)}</p>
      {r8 ? (
        <p className="ij__reason" data-testid="injection-reason">
          <Chip wrap tone="conflict" glyph="✕">R8 · {reasonTitle("R8", { variant: r8.variant })}</Chip>
        </p>
      ) : null}
      <ol className="ij__spans">
        {inj.spans.map((s) => (
          <li key={s.span_id} className="ij__span" data-testid="injection-span" data-span={s.span_id} data-channel={s.channel} data-hidden={s.hidden}>
            <span className="t-mono-label text-fg-2">{where(s)}</span>
            <blockquote className="ij__quote t-ui-sm t-wrap-any"><span className="t-mono-label text-conflict-text">{INJECTION.quoted}: </span>“{maskAccounts(s.text)}”</blockquote>
            <span className="flex flex-wrap items-center gap-2">
              <span className="t-mono-label text-fg-muted">{INJECTION.found(finders(s))}</span>
              {s.confirmed_by_model === true ? <Chip wrap tone="conflict" glyph="✓">{INJECTION.confirmed}</Chip> : s.confirmed_by_model === false ? <Chip tone="gap" glyph="○">{INJECTION.notConfirmed}</Chip> : null}
              {s.page && s.bbox && onShow ? (
                <button type="button" className="t-mono-label p-link text-fg-2" onClick={() => onShow(s.page!)} onMouseEnter={() => setHl({ field: null, claim: null })}>{INJECTION.showOnPage}</button>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      {inj.limitation ? <p className="t-ui-xs text-fg-muted">{inj.limitation}</p> : null}
    </section>
  );
}

/** Red bands over the page where hidden or instruction text sits (the text itself is about 1 pt tall, so it is widened). */
export function InjectionBoxes({ spans }: { spans: InjectionSpan[] }) {
  return (
    <>
      {spans.map((s) => {
        const [x0, y0, x1, y1] = spanBox(s);
        return (
          <span
            key={s.span_id}
            className="lt-inject"
            data-testid="injection-highlight"
            data-span={s.span_id}
            title={`${s.hidden ? INJECTION.box : INJECTION.boxVisible}: “${s.text}”`}
            style={{ left: `${x0 / 10}%`, top: `${y0 / 10}%`, width: `${(x1 - x0) / 10}%`, height: `${(y1 - y0) / 10}%` }}
          >
            <span className="lt-inject__tag t-mono-label">{s.hidden ? INJECTION.box : INJECTION.boxVisible}</span>
          </span>
        );
      })}
    </>
  );
}
