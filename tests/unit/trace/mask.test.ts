import { describe, expect, it, vi } from "vitest";
import { createMasker, last4Mask } from "../../../app/trace/mask";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

const SECRET = "zk_live_ABCDEF123456";
const TOKEN = "rtok_0123456789abcdef";
const SEC = "Probity Team zen-team@probity-demo.dev";
const m = createMasker({ secrets: [SECRET, TOKEN], secUserAgent: SEC });
const ACCOUNT = "000999000141";

describe("masking rules 1-7 (06 §8.3)", () => {
  it("1: exact secret values -> [REDACTED]", () => {
    expect(m.string(`key ${SECRET} and ${TOKEN}`)).toBe("key [REDACTED] and [REDACTED]");
  });
  it("2: transient values -> ••••<last4>", () => {
    m.registerTransient("run-1", ACCOUNT);
    expect(m.string(`acct ${ACCOUNT}`)).toBe("acct ••••0141");
    m.clearTransient("run-1");
    expect(m.string(`acct ${ACCOUNT}`)).toBe("acct ••••0141"); // still caught by rule 5
  });
  it("3: Bearer tokens", () => {
    expect(m.string("Authorization: Bearer abc.DEF-123_456xyz==")).toBe("Authorization: Bearer [REDACTED]");
    expect(m.string("Bearer short")).toBe("Bearer short");
  });
  it("4: secret-named keys, content_base64 byte count, but not token counts", () => {
    const out = m.deep({ authorization: "x", api_key: "y", METERLESS_RUNTIME_TOKEN: "z", password: "p", account_number: "123", content_base64: "AAAA", tokens_in: 12, tokens_out: 5, max_tokens: 800, nested: { token: "t" } });
    expect(out).toEqual({ authorization: "[REDACTED]", api_key: "[REDACTED]", METERLESS_RUNTIME_TOKEN: "[REDACTED]", password: "[REDACTED]", account_number: "[REDACTED]", content_base64: "[base64 4 bytes]", tokens_in: 12, tokens_out: 5, max_tokens: 800, nested: { token: "[REDACTED]" } });
  });
  it("5: account-like digit runs, and nothing else", () => {
    expect(m.string(`pay to ${ACCOUNT} now`)).toBe("pay to ••••0141 now");
    expect(m.string("call +17035550147 or 703-902-5000")).toBe("call +17035550147 or 703-902-5000");
    expect(m.string("routing 110000000")).toBe("routing 110000000"); // 9 digits are evidence, not secrets
  });
  it("5: a 64-hex hash containing a 12-digit run and a 13-digit epoch-ms survive unchanged", () => {
    const hash = "ab" + "123456789012" + "cd".repeat(25);
    expect(hash).toHaveLength(64);
    expect(m.string(hash)).toBe(hash);
    expect(m.deep({ account_hash: hash, created_at: 1793102982831, started_at_ms: "1793102982831", receipt_id: "rcpt_req_000999000141", zetaris_query_ids: ["00000000-0000-0000-0000-000099900014"] })).toEqual({
      account_hash: hash,
      created_at: 1793102982831,
      started_at_ms: "1793102982831",
      receipt_id: "rcpt_req_000999000141",
      zetaris_query_ids: ["00000000-0000-0000-0000-000099900014"],
    });
  });
  it("5: skips values under *_hash, *_id keys even when they are pure digits", () => {
    expect(m.deep({ row_hash: "123456789012345", query_id: "123456789012345" })).toEqual({ row_hash: "123456789012345", query_id: "123456789012345" });
    expect(m.deep({ note: "123456789012345" })).toEqual({ note: "••••2345" });
  });
  it("6: postgres URLs keep the user and lose the password", () => {
    expect(m.string("postgres://payee_app:s3cretpass@localhost:55432/payee_erp")).toBe("postgres://payee_app:[REDACTED]@localhost:55432/payee_erp");
    expect(m.string("postgresql://u:p@h/db")).toBe("postgres://u:[REDACTED]@h/db");
  });
  it("7: the SEC contact", () => {
    expect(m.string(`User-Agent: ${SEC}`)).toBe("User-Agent: <sec-contact>");
    expect(m.string("write to zen-team@probity-demo.dev")).toBe("write to <sec-contact>");
  });
  it("deep walks arrays and errors and leaves non-strings alone", () => {
    const out = m.deep({ list: [ACCOUNT, { x: `Bearer ${"a".repeat(20)}` }], n: 5, b: true, nil: null, err: new Error(`boom ${SECRET}`) }) as { list: unknown[]; err: { message: string; stack?: string } };
    expect(out.list[0]).toBe("••••0141");
    expect(JSON.stringify(out)).not.toContain(SECRET);
    expect(out.err.message).toBe("boom [REDACTED]");
  });
  it("last4Mask", () => {
    expect(last4Mask("000999000141")).toBe("••••0141");
  });
});
