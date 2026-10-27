// ErpWriterPort over Postgres as `payee_app` (02 §4.2, 06 §6): INSERT bank_change_request / bank_change_document /
// vendor_contact_log and UPDATE only bank_change_request.status. No ORM. The raw account number never gets here: the row carries
// the hash and last4. Every database failure leaves as the fixed `erp_unavailable` error.
import pg from "pg";
import type { Config } from "../config/env";
import { AppError } from "../schemas/errors";
import type { BankChangeDocumentRow, BankChangeRequestRow } from "../schemas/erp";
import type { ErpWriterPort } from "../schemas/ports";
import { logger } from "../trace/logger";
import { erpUnavailable, requestConflict, requestNotFound, sameClaims } from "./erp-rules";

const COLS = [
  "request_id", "vendor_id", "candidate_vendor_ids", "claimed_name", "letterhead_name", "claimed_remit_line1", "claimed_remit_unit",
  "claimed_remit_city", "claimed_remit_state", "claimed_remit_zip", "new_routing", "new_account_last4", "new_account_hash",
  "sender_domain", "reply_to_domain", "letter_phones", "invoice_refs", "received_at", "requested_effective", "channel",
  "extraction_path", "extraction_model", "status", "data_origin",
] as const;

export function createErpWriter(cfg: Pick<Config, "ERP_DATABASE_URL">, pool?: pg.Pool): ErpWriterPort & { close(): Promise<void> } {
  if (!cfg.ERP_DATABASE_URL && !pool) throw erpUnavailable();
  const db = pool ?? new pg.Pool({ connectionString: cfg.ERP_DATABASE_URL, max: 5, statement_timeout: 10_000, connectionTimeoutMillis: 5000 });
  db.on("error", (err) => logger.warn(`erp pool error: ${err.name}`));

  /** Wrap any database failure as the fixed error; AppErrors we raise ourselves pass through. */
  const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof AppError) throw e;
      logger.warn(`erp query failed: ${e instanceof Error ? e.name : "error"} ${(e as { code?: string }).code ?? ""}`);
      throw erpUnavailable(e);
    }
  };

  return {
    nextRequestId: () => guard(async () => (await db.query("SELECT 'BCR-2026-' || lpad(nextval('bcr_seq')::text, 4, '0') AS id")).rows[0].id as string),

    insertRequest: (row: BankChangeRequestRow) =>
      guard(async () => {
        const params = COLS.map((c) => row[c]);
        const placeholders = COLS.map((_c, i) => `$${i + 1}`).join(", ");
        const ins = await db.query(`INSERT INTO bank_change_request (${COLS.join(", ")}) VALUES (${placeholders}) ON CONFLICT (request_id) DO NOTHING RETURNING request_id`, params);
        if (ins.rowCount === 1) return { request_id: row.request_id, reused: false };
        const existing = await db.query("SELECT * FROM bank_change_request WHERE request_id = $1", [row.request_id]);
        if (!existing.rows[0] || !sameClaims(existing.rows[0] as BankChangeRequestRow, row)) throw requestConflict();
        return { request_id: row.request_id, reused: true };
      }),

    insertDocuments: (rows: BankChangeDocumentRow[]) =>
      guard(async () => {
        for (const d of rows)
          await db.query(
            "INSERT INTO bank_change_document (doc_id, request_id, kind, filename, media_type, sha256, page_count, data_origin) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (doc_id) DO NOTHING",
            [d.doc_id, d.request_id, d.kind, d.filename, d.media_type, d.sha256, d.page_count, d.data_origin],
          );
      }),

    setRequestStatus: (request_id, status) =>
      guard(async () => {
        const r = await db.query("UPDATE bank_change_request SET status = $2 WHERE request_id = $1", [request_id, status]);
        if (r.rowCount === 0) throw requestNotFound(request_id);
      }),

    insertCallback: (row) =>
      guard(async () => {
        const r = await db.query(
          "INSERT INTO vendor_contact_log (log_id, vendor_id, request_id, purpose, phone_e164, phone_source, outcome, called_at, called_by, data_origin) VALUES ('CL-' || lpad(nextval('contact_log_seq')::text, 5, '0'), $1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING log_id",
          [row.vendor_id, row.request_id, row.purpose, row.phone_e164, row.phone_source, row.outcome, row.called_at, row.called_by, row.data_origin],
        );
        return { log_id: r.rows[0].log_id as string };
      }),

    async ping(o) {
      try {
        await Promise.race([db.query("SELECT 1"), new Promise((_res, rej) => setTimeout(() => rej(new Error("timeout")), o.timeoutMs).unref())]);
        return true;
      } catch {
        return false;
      }
    },

    close: () => db.end(),
  };
}
