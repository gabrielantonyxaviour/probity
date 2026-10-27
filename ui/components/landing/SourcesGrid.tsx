import { SOURCES_HEADING, SOURCE_CELLS } from "./copy";

const SLUGS = ["vm", "ph", "us", "sec", "zet", "nem", "ns", "wm", "ag", "sql"] as const;

/** Which half a cell sits in at the 6, 4 and 2 column layouts, so its popover opens toward the page centre. */
function sides(i: number): string {
  const c6 = i === 0 ? 1 : i === 1 ? 2 : i === 2 ? 5 : i === 3 ? 6 : i - 3;
  const c4 = i === 0 ? 1 : i === 1 ? 4 : ((i - 2) % 4) + 1;
  const c2 = (i % 2) + 1;
  const pick = (c: number, n: number) => (c <= n / 2 ? "l" : "r");
  return `src-6-${pick(c6, 6)} src-4-${pick(c4, 4)} src-2-${pick(c2, 2)}`;
}

/** Section 2: the source legend. Olive dot = synthetic record, teal dot = live registry. Popovers open on hover and focus. */
export function SourcesGrid() {
  return (
    <section className="l-sources" aria-label="Sources">
      <ul className="l-sources-grid">
        {SOURCE_CELLS.slice(0, 2).map((cell, i) => (
          <Cell key={cell.label} cell={cell} i={i} />
        ))}
        <li className="l-src-head">
          <span>
            {SOURCES_HEADING.lead}
            <b>{SOURCES_HEADING.count}</b>
            {SOURCES_HEADING.tail}
          </span>
        </li>
        {SOURCE_CELLS.slice(2).map((cell, i) => (
          <Cell key={cell.label} cell={cell} i={i + 2} />
        ))}
      </ul>
    </section>
  );
}

function Cell({ cell, i }: { cell: (typeof SOURCE_CELLS)[number]; i: number }) {
  const id = `src-pop-${SLUGS[i]}`;
  return (
    <li className={`l-src l-src-${SLUGS[i]} ${sides(i)}`}>
      <button type="button" className="l-src-btn" aria-describedby={id}>
        {cell.dot ? <span className={`l-dot l-dot--${cell.dot}`} aria-hidden="true" /> : null}
        {cell.label}
        {cell.dot ? (
          <span className="l-sr-only">{cell.dot === "real" ? " (live registry)" : " (synthetic records)"}</span>
        ) : null}
      </button>
      <span id={id} role="tooltip" className="l-pop">
        {cell.pop}
      </span>
    </li>
  );
}
