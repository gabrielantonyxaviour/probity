// Re-export of the URL helpers so the Nightshift module is self-contained (05 §4.2 names `url.ts`).
export { normaliseRuntimeUrl as normalizeBaseUrl, hostOf } from "../../config/runtime-url";
