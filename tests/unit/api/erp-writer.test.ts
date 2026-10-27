import { describe, expect, it, vi } from "vitest";
import type pg from "pg";
import { createErpWriter } from "../../../app/runtime/erp-writer";
import { createSampleErpWriter } from "../../../app/runtime/erp-sample";
import { sameClaims } from "../../../app/runtime/erp-rules";
import type { BankChangeRequestRow } from "../../../app/schemas/erp";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

const row = (over: Partial<BankChangeRequestRow> = {}): BankChangeRequestRow => ({
  request_id: "BCR-2026-0412", vendor_id: "V-10027", candidate_vendor_ids: "", claimed_name: "Booz Allen Hamilton Inc.", letterhead_name: "Booz Allen Hamilton Inc.",
  claimed_remit_line1: "1 Commvault Way", claimed_remit_unit: "Ste 205", claimed_remit_city: "Tinton Falls", claimed_remit_state: "NJ", claimed_remit_zip: "07724",
  new_routing: "110000000", new_account_last4: "0141", new_account_hash: "a".repeat(64), sender_domain: "boozallen-payments.example", reply_to_domain: null,
  letter_phones: "+17035550147", invoice_refs: "INV-BAH-20931", received_at: "2026-10-22T15:12:00Z", requested_effective: "2026-10-30", channel: "email",
  extraction_path: "text+deep", extraction_model: "nvidia/nemotron-3-ultra-550b-a55b", status: "pending", data_origin: "RUNTIME_INPUT", ...over,
});

function fakePool(handler: (sql: string, params?: unknown[]) => { rowCount?: number; rows?: unknown[] } | Error) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const pool = {
    on: () => pool,
    end: async () => undefined,
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, ...(params ? { params } : {}) });
      const r = handler(sql, params);
      if (r instanceof Error) throw r;
      return { rowCount: r.rowCount ?? r.rows?.length ?? 0, rows: r.rows ?? [] };
    },
  };
  return { pool: pool as unknown as pg.Pool, calls };
}

describe("claims identity (02 §4.2)", () => {
  it("ignores status, timestamps and the extraction path; notices any claim change", () => {
    expect(sameClaims(row(), row({ status: "held", received_at: "2026-10-23T00:00:00Z", extraction_path: "typed" }))).toBe(true);
    expect(sameClaims(row(), row({ new_account_hash: "b".repeat(64) }))).toBe(false);
    expect(sameClaims(row({ claimed_remit_unit: null }), row({ claimed_remit_unit: "" }))).toBe(true);
  });
});

describe("Postgres ErpWriterPort", () => {
  it("inserts a new request with the account hash only, and reuses an identical existing one", async () => {
    const f = fakePool((sql) => (sql.startsWith("INSERT INTO bank_change_request") ? { rowCount: 0, rows: [] } : { rows: [row({ received_at: "2026-10-22T15:12:00.000Z" })] }));
    const w = createErpWriter({ ERP_DATABASE_URL: "postgres://x" }, f.pool);
    expect(await w.insertRequest(row())).toEqual({ request_id: "BCR-2026-0412", reused: true });
    const insert = f.calls[0]!;
    expect(insert.sql).toContain("ON CONFLICT (request_id) DO NOTHING");
    expect(insert.sql).not.toMatch(/account_number/);
    const fresh = createErpWriter({ ERP_DATABASE_URL: "postgres://x" }, fakePool(() => ({ rowCount: 1, rows: [{ request_id: "BCR-2026-0412" }] })).pool);
    expect(await fresh.insertRequest(row())).toEqual({ request_id: "BCR-2026-0412", reused: false });
  });
  it("different claims under an existing id is a 409 request_conflict", async () => {
    const f = fakePool((sql) => (sql.startsWith("INSERT") ? { rowCount: 0 } : { rows: [row({ claimed_name: "Someone Else LLC" })] }));
    await expect(createErpWriter({ ERP_DATABASE_URL: "postgres://x" }, f.pool).insertRequest(row())).rejects.toMatchObject({ code: "request_conflict", httpStatus: 409, message: "This request id already exists with different claims." });
  });
  it("status updates need an existing request; callbacks get the next CL id", async () => {
    const w = createErpWriter({ ERP_DATABASE_URL: "postgres://x" }, fakePool((sql) => (sql.startsWith("UPDATE") ? { rowCount: 0 } : { rows: [{ log_id: "CL-40001" }] })).pool);
    await expect(w.setRequestStatus("BCR-2026-9999", "held")).rejects.toMatchObject({ code: "not_found" });
    expect(await w.insertCallback({ vendor_id: "V-10027", request_id: "BCR-2026-0412", purpose: "bank_change_callback", phone_e164: "+17039025000", phone_source: "edgar_registrant", outcome: "confirmed", called_at: "2026-10-27T15:00:00Z", called_by: "Priya Raman (fictional)", data_origin: "RUNTIME_INPUT" })).toEqual({ log_id: "CL-40001" });
  });
  it("a database failure leaves as the fixed erp_unavailable error with no pg text", async () => {
    const w = createErpWriter({ ERP_DATABASE_URL: "postgres://x" }, fakePool(() => Object.assign(new Error('password authentication failed for user "payee_app" host 10.1.2.3'), { code: "28P01" })).pool);
    const err = await w.nextRequestId().catch((e: Error) => e);
    expect(err).toMatchObject({ code: "erp_unavailable", message: "The vendor master database is not reachable.", httpStatus: 503 });
    expect(JSON.stringify(err)).not.toMatch(/10\.1\.2\.3|payee_app/);
    expect(await w.ping({ timeoutMs: 100 })).toBe(false);
  });
});

describe("in-memory ErpWriterPort (SAMPLE_MODE)", () => {
  it("behaves like the database: sequences, reuse, conflict, status, callbacks", async () => {
    const w = createSampleErpWriter({ dirs: { sample: "/nonexistent" } as never });
    expect(await w.nextRequestId()).toBe("BCR-2026-0500");
    expect(await w.nextRequestId()).toBe("BCR-2026-0501");
    expect(await w.insertRequest(row())).toMatchObject({ reused: false });
    expect(await w.insertRequest(row({ status: "held" }))).toMatchObject({ reused: true });
    await expect(w.insertRequest(row({ new_routing: "110000001" }))).rejects.toMatchObject({ code: "request_conflict" });
    await w.setRequestStatus("BCR-2026-0412", "held");
    expect(w.snapshot().requests[0]!.status).toBe("held");
    await expect(w.setRequestStatus("BCR-2026-7777", "held")).rejects.toMatchObject({ code: "not_found" });
    expect((await w.insertCallback({ vendor_id: "V-10027", request_id: null, purpose: "bank_change_callback", phone_e164: "+17039025000", phone_source: "edgar_registrant", outcome: "no_answer", called_at: "2026-10-27T15:00:00Z", called_by: "x y", data_origin: "RUNTIME_INPUT" })).log_id).toBe("CL-40001");
    expect(await w.ping({ timeoutMs: 1 })).toBe(true);
  });
});
