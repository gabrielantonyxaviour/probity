// Every landing link in one place. Product links stay in the same tab; sources open in a new tab (PillLink decides).
export const APP_HOME = "/app";
export const REPO_URL = "https://github.com/gabrielantonyxaviour/probity";
/** `/app/system` ships with the product shell (PRODUCT_UI_GUIDE section 5). If it does not, point this at the README. */
export const LIMITS_URL = "/app/system";
export const README_URL = `${REPO_URL}#readme`;
/** Footer anchor that lists every case citation (used while docs/real-cases.md is not on the public repo). */
export const CASES_SOURCES_HASH = "#cases-sources";

export type ReviewView = "trace" | "graph" | "letter";

export function reviewHref(runId: string): string {
  return `${APP_HOME}/review/${encodeURIComponent(runId)}`;
}

export function dossierHref(runId: string): string {
  return `${reviewHref(runId)}/dossier`;
}

export function viewHref(runId: string, view: ReviewView): string {
  const param = { trace: "trace=full", graph: "graph=full", letter: "letter=full" }[view];
  return `${reviewHref(runId)}?${param}`;
}

export function evidenceHref(runId: string, evidenceId: string): string {
  return `${reviewHref(runId)}?evidence=${encodeURIComponent(evidenceId)}`;
}

export function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
}
