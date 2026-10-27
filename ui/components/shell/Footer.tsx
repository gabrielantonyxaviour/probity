import { FIXED } from "@/lib/copy";

export function Footer() {
  return (
    <footer className="app-footer">
      <div className="app-footer__row t-ui-xs">
        <p data-testid="sources-notice">{FIXED.sourcesNotice}</p>
        <p className="t-mono-label">{FIXED.policy}</p>
        <p>{FIXED.traceIds}</p>
      </div>
    </footer>
  );
}
