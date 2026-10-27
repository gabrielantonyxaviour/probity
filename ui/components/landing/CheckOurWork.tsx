import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { CHECK } from "./copy-more";
import { systemChip, type LandingState } from "./data/live-state";
import { APP_HOME, LIMITS_URL, REPO_URL, dossierHref, isExternal } from "./routes";

/** Section 8: four link cards. The live-demo card carries the product's system chip, read from /readyz. */
export function CheckOurWork({ state }: { state: LandingState }) {
  const hold = state.byDecision.HOLD;
  const sample = hold?.mode === "sample";
  const hrefs: Record<string, string> = {
    demo: APP_HOME,
    code: REPO_URL,
    dossier: hold ? dossierHref(hold.run_id) : APP_HOME,
    limits: LIMITS_URL,
  };
  return (
    <section className="l-section" aria-labelledby="check-h">
      <div className="l-frame l-content">
        <div className="l-check-head">
          <h2 id="check-h" className="t-heading">{CHECK.heading}</h2>
          <p className="t-lede l-muted">{CHECK.lede}</p>
        </div>
        <ul className="l-linkcards">
          {CHECK.cards.map((c) => {
            const href = hrefs[c.key];
            const Arrow = c.icon === "ArrowUpRight" ? ArrowUpRight : ArrowRight;
            const title = c.key === "dossier" ? (sample ? "Sample dossier" : "Latest dossier") : c.title;
            const inner = (
              <>
                <span className="l-lc-title">{title}</span>
                <span className="l-lc-icon"><Arrow size={20} aria-hidden /></span>
                <span className="l-lc-desc">{c.body}</span>
                {c.key === "demo" ? <span className="t-mono-label l-lc-chip">{systemChip(state)}</span> : null}
              </>
            );
            return (
              <li key={c.key}>
                {isExternal(href) ? (
                  <a className="l-linkcard" href={href} target="_blank" rel="noopener noreferrer">{inner}</a>
                ) : (
                  <Link className="l-linkcard" href={href}>{inner}</Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
