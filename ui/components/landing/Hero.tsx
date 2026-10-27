import { MatrixCanvas } from "./matrix/MatrixCanvas";
import { PillLink } from "./PillLink";
import { HERO } from "./copy";
import { APP_HOME, REPO_URL } from "./routes";

/** Section 1: the claim, the two actions, the honesty notice, then the payment river. */
export function Hero() {
  return (
    <section id="top" className="l-hero" aria-labelledby="hero-title">
      <div className="l-hero-top">
        <div className="l-frame">
          <div className="l-hero-grid">
            <h1 id="hero-title" className="t-hero l-hero-title">
              {HERO.line1}
              <br />
              {HERO.line2}
            </h1>
            <p className="t-lede l-hero-lede">
              {HERO.lede} <span className="l-muted">{HERO.ledeMuted}</span>
            </p>
            <div className="l-hero-links">
              <div className="l-hero-pills">
                <PillLink href={APP_HOME} variant="accent" size="md">
                  {HERO.primary}
                </PillLink>
                <PillLink href={REPO_URL} size="md">
                  {HERO.secondary}
                </PillLink>
              </div>
              <p className="t-mono-label l-hero-note">{HERO.sources}</p>
            </div>
            <a className="l-announce" href="#cases">
              {HERO.announcement}
            </a>
          </div>
        </div>
      </div>
      <MatrixCanvas />
    </section>
  );
}
