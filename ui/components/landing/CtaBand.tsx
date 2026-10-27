import { PillLink } from "./PillLink";
import { CTA } from "./copy-more";
import { APP_HOME } from "./routes";

/** Section 9: the closing line and one accent pill. No background canvas: the hero owns the page's one loop. */
export function CtaBand() {
  return (
    <section className="l-section l-section--bare" aria-label="Start">
      <div className="l-frame l-content l-content--cta l-cta">
        <h2 className="t-heading l-cta-h">{CTA.heading}</h2>
        <PillLink href={APP_HOME} variant="accent" size="md">{CTA.pill}</PillLink>
      </div>
    </section>
  );
}
