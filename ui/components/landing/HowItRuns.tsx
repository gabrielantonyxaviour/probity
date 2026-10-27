"use client";

import Link from "next/link";
import { useRef } from "react";
import { CheckStack } from "./CheckStack";
import { PillLink } from "./PillLink";
import { HOW, STEPS } from "./copy";
import { PANELS, useScrollStory } from "./useScrollStory";

type Props = { watchHref: string; dossierHref: string; sample: boolean };

/** Section 3: sticky scrollytelling, intro plus four steps (blueprint section 3, motion.md 1.5). */
export function HowItRuns({ watchHref, dossierHref, sample }: Props) {
  const ref = useRef<HTMLElement>(null);
  const { step, goTo } = useScrollStory(ref);
  const active = step === 0 ? null : STEPS[step - 1];
  const accent = active?.accent ?? "var(--fg)";

  return (
    <section id="how" ref={ref} className="l-section l-story" style={{ ["--accent" as string]: accent }} data-step={step}>
      <div className="l-story-sticky l-frame">
        <div className="l-story-left">
          <ol className="l-story-list l-story-prev" aria-label="Earlier steps">
            {STEPS.slice(0, Math.max(0, step - 1)).map((s, i) => (
              <li key={s.num} className="l-story-item" style={{ ["--i" as string]: i }}>
                <button type="button" className="t-eyebrow l-step-btn" onClick={() => goTo(i + 1)}>
                  <b>{s.num}</b>
                  {s.title}
                </button>
              </li>
            ))}
          </ol>

          <div className="l-story-track" aria-hidden="true">
            <span className="l-story-marker" />
          </div>

          <div className="l-panel" key={step}>
            {active === null ? (
              <>
                <h2 className="t-heading l-fade-1 l-panel-heading">
                  {HOW.heading.before}
                  <em>{HOW.heading.em}</em>
                </h2>
                <p className="t-lede l-fade-2 l-panel-lede">{HOW.lede}</p>
                <p className="l-fade-3 l-panel-link">
                  <Link className="l-link" href={watchHref}>
                    {sample ? HOW.watchSample : HOW.watchLatest}
                  </Link>
                </p>
              </>
            ) : (
              <>
                <p className="t-eyebrow l-wipe">
                  <b>{active.num}</b>
                  {active.title}
                </p>
                <h3 className="l-fade-1 l-panel-step">{active.heading}</h3>
                <p className="l-fade-2 l-panel-desc">{active.body}</p>
                {step === PANELS - 1 ? (
                  <div className="l-fade-3 l-panel-cta">
                    <ul className="l-legend" aria-label="The three answers">
                      {HOW.legend.map((m) => (
                        <li key={m.key} className="t-mono-label" data-on={m.key === "hold" || undefined} data-k={m.key}>
                          <span aria-hidden="true">{m.glyph}</span> {m.word}
                        </li>
                      ))}
                    </ul>
                    <PillLink href={dossierHref}>{sample ? HOW.dossierSample : HOW.dossierLatest}</PillLink>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <ol className="l-story-list l-story-next" aria-label="Later steps">
            {STEPS.slice(step).map((s, i) => (
              <li key={s.num} className="l-story-item" style={{ ["--i" as string]: i }}>
                <button type="button" className="t-eyebrow l-step-btn" onClick={() => goTo(step + 1 + i)}>
                  <b>{s.num}</b>
                  {s.title}
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="l-story-right l-dotgrid">
          <CheckStack activePlate={step === 0 ? null : step - 1} />
        </div>

        <ol className="l-sr-only">
          {STEPS.map((s) => (
            <li key={s.num}>
              {s.eyebrow}: {s.body}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
