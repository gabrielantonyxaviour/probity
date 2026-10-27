/**
 * Normalise a Nightshift base URL to `<origin>/v1` (05 §4.2). Trim, add `http://` when there is no scheme, strip trailing
 * slashes, strip one trailing `/v1/chat/completions | /v1/models | /healthz | /v1`, then append `/v1`. Never `/v1/v1`.
 * Accepts `host:8088`, `http://host:8088/`, `.../v1`, `.../v1/`, `.../v1/chat/completions`, `.../v1/models`, `.../healthz`, `http://[::1]:8088`.
 */
export function normaliseRuntimeUrl(raw: string): string {
  const trimmed = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const u = new URL(withScheme);
  const path = u.pathname
    .replace(/\/+$/, "")
    .replace(/\/v1\/chat\/completions$/, "")
    .replace(/\/v1\/models$/, "")
    .replace(/\/healthz$/, "")
    .replace(/\/v1$/, "");
  return `${u.origin}${path}/v1`;
}

/** `host:port` of a base URL, for status blocks that must not show a full URL. */
export function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "unknown";
  }
}
