"use client";

import { Check, PhoneCall, ShieldX } from "lucide-react";
import { useId, useRef, useState } from "react";
import { OutcomeCard } from "./OutcomeCard";
import { PillLink } from "./PillLink";
import { ANSWERS } from "./copy";
import { APP_HOME, reviewHref } from "./routes";
import type { LandingDecision, LandingRun } from "./data/live-state";
import { useAutoplay } from "./useAutoplay";

type Props = { runs: Partial<Record<LandingDecision, LandingRun>>; api: "up" | "down" };

const ORDER: { key: LandingDecision; copy: typeof ANSWERS.hold | typeof ANSWERS.callback | typeof ANSWERS.approve }[] = [
  { key: "HOLD", copy: ANSWERS.hold },
  { key: "CALLBACK_VERIFY", copy: ANSWERS.callback },
  { key: "APPROVE", copy: ANSWERS.approve },
];
const HOLD_ICONS = [ShieldX, Check, PhoneCall] as const;

/** Section 4: approve, call back or hold. Autoplay accordion with the live result for each answer. */
export function Outcomes({ runs, api }: Props) {
  const id = useId();
  const rootRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [view, setView] = useState<"card" | "json">("card");
  const { stop } = useAutoplay({ rootRef, listRef, ms: 8000, onAdvance: () => setActive((a) => (a + 1) % ORDER.length) });

  return (
    <section id="outcomes" ref={rootRef} className="l-section" aria-labelledby={`${id}-h`}>
      <div className="l-frame l-content l-out">
        <div className="l-out-left">
          <h2 id={`${id}-h`} className="t-heading">
            {ANSWERS.heading}
          </h2>
          <div className="l-acc" ref={listRef}>
            {ORDER.map(({ key, copy }, i) => {
              const open = i === active;
              const run = runs[key];
              const href = run ? reviewHref(run.run_id) : APP_HOME;
              return (
                <div key={key} className="l-acc-item" data-open={open || undefined}>
                  <h3 className="l-acc-h">
                    <button
                      type="button"
                      className="l-acc-title"
                      aria-expanded={open}
                      aria-controls={`${id}-b${i}`}
                      onClick={() => {
                        stop();
                        setActive(i);
                      }}
                    >
                      {copy.title}
                    </button>
                  </h3>
                  <div id={`${id}-b${i}`} role="region" aria-label={copy.title} className="l-acc-body" inert={!open}>
                    <div className="l-acc-inner">
                      <p className="l-acc-text">{copy.body}</p>
                      {key === "HOLD" ? (
                        <ul className="l-acc-features">
                          {ANSWERS.hold.features.map((f, n) => {
                            const Icon = HOLD_ICONS[n];
                            return (
                              <li key={f}>
                                <Icon size={20} aria-hidden="true" />
                                {f}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                      {key === "CALLBACK_VERIFY" ? <p className="l-acc-caption">{ANSWERS.callback.caption}</p> : null}
                      <PillLink href={href}>{copy.pill}</PillLink>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="l-out-visual l-dotgrid">
          <div className="l-out-stage" data-view={view}>
            <div className="l-out-layers l-out-cardlayer">
              {ORDER.map(({ key }, i) => (
                <div key={key} className="l-out-layer" data-on={i === active || undefined} aria-hidden={i !== active}>
                  <OutcomeCard decision={key} run={runs[key]} api={api} view="card" />
                </div>
              ))}
            </div>
            <div className="l-out-layers l-out-jsonlayer l-linegrid" aria-hidden={view !== "json"}>
              {ORDER.map(({ key }, i) => (
                <div key={key} className="l-out-layer" data-on={i === active || undefined}>
                  <OutcomeCard decision={key} run={runs[key]} api={api} view="json" />
                </div>
              ))}
            </div>
          </div>
          <div className="l-seg" role="group" aria-label="View">
            {(["card", "json"] as const).map((v) => (
              <button key={v} type="button" className="l-seg-btn t-mono-ui" aria-pressed={view === v} onClick={() => setView(v)}>
                {v === "card" ? "CARD" : "JSON"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
