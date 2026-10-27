// ERP writer (06 §10.2, 02 §4.2): the only code that writes Postgres, as the `payee_app` role (INSERT on three tables,
// UPDATE of bank_change_request.status). Gap-fill for app/adapters/erp-writer.ts: the integrator adds the one-line facade
// `export { createErpWriter } from "../orchestration/adapters/erp-writer"`. Raw account numbers never reach this file.
import pg from "pg";
import { AppError } from "../../schemas/errors";
import type { BankChangeDocumentRow, BankChangeRequestRow, ContactLogRow } from "../../schemas/erp";
import type { ErpWriterPort, Opts } from "../../schemas/ports";
import { claimFingerprint } from "./erp-compare";

const COLS = [
  "request_id", "vendor_id", "candidate_vendor_ids", "claimed_name", "letterhead_name", "claimed_remit_line1", "claimed_remit_unit", "claimed_remit_city",
  "claimed_remit_state", "claimed_remit_zip", "new_routing", "new_account_last4", "new_account_hash", "sender_domain", "reply_to_domain", "letter_phones",
  "invoice_refs", "received_at", "requested_effective", "channel", "extraction_path", "extraction_model", "status", "data_origin",
] as const;

const down = (e: unknown): AppError =>
  e instanceof AppError ? e : new AppError("erp_unavailable", "The vendor master database is not reachable.", { retryable: true, cause: e });

export function createErpWriter(cfg: { ERP_DATABASE_URL?: string | undefined }): ErpWriterPort & { close(): Promise<void> } {
  let pool: pg.Pool | null = null;
  const get = (): pg.Pool => {
    if (!cfg.ERP_DATABASE_URL) throw new AppError("erp_unavailable", "The vendor master database is not configured.");
    return (pool ??= new pg.Pool({ connectionString: cfg.ERP_DATABASE_URL, max: 5, statement_timeout: 10_000, connectionTimeoutMillis: 5_000 }));
  };
  return {
    async nextRequestId() {
      try {
        const r = await get().query<{ id: string }>("SELECT 'BCR-2026-' || lpad(nextval('bcr_seq')::text, 4, '0') AS id");
        return r.rows[0]!.id;
      } catch (e) {
        throw down(e);
      }
    },
    async insertRequest(row: BankChangeRequestRow) {
      try {
        const ph = COLS.map((_, i) => `$${i + 1}`).join(", ");
        const vals = COLS.map((c) => (row as Record<string, unknown>)[c] ?? null);
        const ins = await get().query(`INSERT INTO bank_change_request (${COLS.join(", ")}) VALUES (${ph}) ON CONFLICT (request_id) DO NOTHING RETURNING request_id`, vals);
        if (ins.rowCount === 1) return { request_id: row.request_id, reused: false };
        const ex = await get().query<BankChangeRequestRow & { received_at: Date }>("SELECT * FROM bank_change_request WHERE request_id = $1", [row.request_id]);
        const prior = ex.rows[0];
        if (!prior) throw new AppError("erp_unavailable", "The vendor master database did not return the request.");
        const same = claimFingerprint({ ...prior, received_at: new Date(prior.received_at).toISOString() }) === claimFingerprint(row);
        if (!same) throw new AppError("request_conflict", "This request id already exists with different claims.", { httpStatus: 409 });
        return { request_id: row.request_id, reused: true };
      } catch (e) {
        throw down(e);
      }
    },
    async insertDocuments(rows: BankChangeDocumentRow[]) {
      try {
        for (const d of rows)
          await get().query(
            "INSERT INTO bank_change_document (doc_id, request_id, kind, filename, media_type, sha256, page_count, data_origin) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (doc_id) DO NOTHING",
            [d.doc_id, d.request_id, d.kind, d.filename, d.media_type, d.sha256, d.page_count, d.data_origin],
          );
      } catch (e) {
        throw down(e);
      }
    },
    async setRequestStatus(request_id, status) {
      try {
        await get().query("UPDATE bank_change_request SET status = $2 WHERE request_id = $1", [request_id, status]);
      } catch (e) {
        throw down(e);
      }
    },
    async insertCallback(row: Omit<ContactLogRow, "log_id">) {
      try {
        const r = await get().query<{ log_id: string }>(
          "INSERT INTO vendor_contact_log (log_id, vendor_id, request_id, purpose, phone_e164, phone_source, outcome, called_at, called_by, data_origin) VALUES ('CL-' || lpad(nextval('contact_log_seq')::text, 5, '0'), $1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING log_id",
          [row.vendor_id, row.request_id, row.purpose, row.phone_e164, row.phone_source, row.outcome, row.called_at, row.called_by, row.data_origin],
        );
        return { log_id: r.rows[0]!.log_id };
      } catch (e) {
        throw down(e);
      }
    },
    async ping(_o: Opts) {
      try {
        await get().query("SELECT 1");
        return true;
      } catch {
        return false;
      }
    },
    async close() {
      await pool?.end();
      pool = null;
    },
  };
}
