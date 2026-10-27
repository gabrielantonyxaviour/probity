// Gateway errors. Every response body is { error, code } and nothing else; upstream bodies and stack traces never reach the client.
export const GATEWAY_ERRORS = {
  invalid_input: { status: 400, error: "The request parameters are not valid." },
  upstream_not_found: { status: 404, error: "The upstream source has no record for this identifier." },
  upstream_unavailable: { status: 502, error: "The upstream source did not answer." },
  sec_user_agent_missing: { status: 503, error: "SEC_USER_AGENT is not configured, so SEC requests are refused." },
  not_found: { status: 404, error: "No such route." },
  mirror_miss: { status: 404, error: "Not in the offline capture." },
  erp_unavailable: { status: 502, error: "The ERP database did not answer." },
} as const;
export type GatewayErrorCode = keyof typeof GATEWAY_ERRORS;

export class GatewayError extends Error {
  constructor(readonly code: GatewayErrorCode, readonly upstreamStatus?: number) {
    super(GATEWAY_ERRORS[code].error);
  }
  get status(): number { return GATEWAY_ERRORS[this.code].status; }
  body(): { error: string; code: GatewayErrorCode } { return { error: this.message, code: this.code }; }
}
