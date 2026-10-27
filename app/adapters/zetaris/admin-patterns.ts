// Whole-text allow regexes for T12–T14 (03 §7.3), plus the configured gateway host.
import { loadZetarisConfig } from "./config";

function esc(host: string): string {
  return host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function gatewayHosts(): string[] {
  const origin = loadZetarisConfig().gatewayOrigin;
  let host = "host.docker.internal";
  try {
    host = new URL(origin).hostname;
  } catch {
    /* keep default */
  }
  return [...new Set([host, "source-gateway", "host.docker.internal", "host.lima.internal"])];
}

function hostAlt(): string {
  return gatewayHosts().map(esc).join("|");
}

const ACCEPT = String.raw`HEADER \( Accept "application/json" \)`;
const REQ = String.raw`method "GET", http_encoding "URLENCODED", response_type "JSON", insecure_ssl "false"`;

/** Direct USAspending needs Accept, or Django REST returns HTML and Spark stores _corrupt_record. */
export function t12Pattern(): RegExp {
  const gw = `https?://(?:${hostAlt()})(?::\\d+)?(?:/mirror)?/usaspending/recipient`;
  return new RegExp(
    `^CREATE REST SESSION TABLE pp_usa_r_[a-z0-9]{12}(_pt|_mr)? REQUEST \\(endpoint "(https://api\\.usaspending\\.gov/api/v2/recipient|${gw})/[0-9a-f-]{36}-[PCR]/?", ${REQ}\\) ${ACCEPT} BODY \\(\\)$`,
  );
}

export function t13Pattern(): RegExp {
  const gw = `https?://(?:${hostAlt()})(?::\\d+)?(?:/mirror)?/usaspending/children`;
  return new RegExp(
    `^CREATE REST SESSION TABLE pp_usa_c_[a-z0-9]{12}(_pt|_mr)? REQUEST \\(endpoint "(https://api\\.usaspending\\.gov/api/v2/recipient/children|${gw})/[A-Z0-9]{12}/?", ${REQ}\\) ${ACCEPT} BODY \\(\\)$`,
  );
}

export function t14Pattern(userAgent: string | undefined): RegExp {
  const ua = (userAgent ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^CREATE REST SESSION TABLE pp_sec_s_[0-9]{10}(_pt|_mr)? REQUEST \\(endpoint "https://data\\.sec\\.gov/submissions/CIK[0-9]{10}\\.json", ${REQ}\\) HEADER \\( user-agent "${ua}" \\) BODY \\(\\)$`,
  );
}

export function adminPatterns(): RegExp[] {
  return [t12Pattern(), t13Pattern(), t14Pattern(loadZetarisConfig().secUserAgent)];
}
