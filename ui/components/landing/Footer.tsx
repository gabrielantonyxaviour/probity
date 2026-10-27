import Link from "next/link";
import { CITATIONS } from "./citations";
import { FOOTER } from "./copy-more";
import type { LandingRun } from "./data/live-state";
import { APP_HOME, LIMITS_URL, README_URL, REPO_URL, dossierHref, isExternal } from "./routes";

type L = { label: string; href: string };

function Item({ link }: { link: L }) {
  if (!link.href) return <span className="l-foot-plain">{link.label}</span>;
  return isExternal(link.href) ? (
    <a className="l-foot-link" href={link.href} target="_blank" rel="noopener noreferrer">{link.label} {"↗"}</a>
  ) : (
    <Link className="l-foot-link" href={link.href}>{link.label}</Link>
  );
}

/** Section 10: legal column, four link columns, copyright bar. `#cases-sources` lists every case citation. */
export function Footer({ hold }: { hold: LandingRun | undefined }) {
  const dossier = hold ? dossierHref(hold.run_id) : APP_HOME;
  const demoVideo = process.env.DEMO_VIDEO_URL;
  const columns: { head: string; id?: string; links: L[] }[] = [
    { head: "PRODUCT", links: [
      { label: "Open the app", href: APP_HOME }, { label: "Change requests", href: APP_HOME },
      { label: hold?.mode === "sample" ? "Sample dossier" : "Latest dossier", href: dossier }, { label: "Sources", href: LIMITS_URL },
    ] },
    { head: "EVIDENCE", links: [
      { label: "USAspending", href: "https://www.usaspending.gov" }, { label: "SEC EDGAR", href: "https://www.sec.gov/edgar" },
      { label: "Zetaris", href: "https://www.zetaris.com" }, { label: "NVIDIA Nemotron", href: "https://developer.nvidia.com/nemotron" },
    ] },
    { head: "CASES", id: "cases-sources", links: [
      { label: CITATIONS.usao.label, href: CITATIONS.usao.url }, { label: "Baltimore OIG 25-0028-I", href: CITATIONS.baltimore.url },
      { label: "Town of Arlington letter", href: CITATIONS.arlington.url }, { label: CITATIONS.ic3.label, href: CITATIONS.ic3.url },
    ] },
    { head: "PROJECT", links: [
      { label: "GitHub", href: REPO_URL }, { label: "README", href: README_URL },
      ...(demoVideo ? [{ label: "Video", href: demoVideo }] : []),
      { label: "Team Zen", href: "" },
    ] },
  ];
  return (
    <footer className="l-section l-footer">
      <div className="l-foot-wrap">
      <div className="l-frame l-foot-grid">
        <div className="l-foot-legal">
          <p>{FOOTER.legal}</p>
          <p className="t-mono-label">{FOOTER.policy}</p>
        </div>
        {columns.map((c) => (
          <nav key={c.head} className="l-foot-col" id={c.id} aria-label={c.head}>
            <h2 className="l-foot-head">{c.head}</h2>
            <ul>{c.links.map((l) => <li key={l.label}><Item link={l} /></li>)}</ul>
          </nav>
        ))}
      </div>
      </div>
      <div className="l-foot-bar">
        <div className="l-frame l-foot-bar-row">
          <p>{FOOTER.left}</p>
          <p>{FOOTER.right}</p>
        </div>
      </div>
    </footer>
  );
}
