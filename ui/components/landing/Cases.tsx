import { PillLink } from "./PillLink";
import { CITATIONS } from "./citations";
import { CASES } from "./copy-more";
import { CASES_SOURCES_HASH } from "./routes";

/** Section 6: three real cases, each figure with its linked source. 3-up from 1120, a scroll-snap carousel below. */
export function Cases() {
  return (
    <section id="cases" className="l-section" aria-labelledby="cases-h">
      <div className="l-frame l-content">
        <div className="l-cases-head">
          <h2 id="cases-h" className="t-heading">{CASES.heading}</h2>
          <PillLink href={CASES_SOURCES_HASH}>{CASES.link}</PillLink>
        </div>
        <p className="t-lede l-cases-lede">
          {CASES.lede}{" "}
          <a className="l-cite-inline" href={CITATIONS.ic3.url} target="_blank" rel="noopener noreferrer">({CITATIONS.ic3.label})</a>{" "}
          <span className="l-muted">{CASES.ledeMuted}</span>
        </p>
        <ul className="l-cases" tabIndex={0} aria-label="Cases">
          {CASES.cards.map((c) => (
            <li key={c.figure} className="l-case">
              <article>
                <div className="l-case-cover l-dotgrid"><span className="l-case-figure">{c.figure}</span></div>
                <p className="t-eyebrow l-case-eyebrow">{c.eyebrow}</p>
                <h3 className="l-case-title">{c.title}</h3>
                <p className="t-mono-label l-case-cite">
                  {c.cites.map((cite, i) => (
                    <span key={cite.url}>
                      {i > 0 ? " · " : ""}
                      <a href={cite.url} target="_blank" rel="noopener noreferrer">{cite.label}</a>
                    </span>
                  ))}
                  {" · "}{c.cites[0].date.toUpperCase()}
                </p>
              </article>
            </li>
          ))}
        </ul>
        <p className="l-cases-note">{CASES.note}</p>
      </div>
    </section>
  );
}
