// In-memory ErpWriterPort for SAMPLE_MODE (06 §6.5): same behaviour as the Postgres writer (identical claims reuse a row, different
// claims are a 409, status changes need an existing request), seeded from data/sample/erp. Lost on restart, and said so.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Config } from "../config/env";
import type { BankChangeDocumentRow, BankChangeRequestRow } from "../schemas/erp";
import type { ErpWriterPort } from "../schemas/ports";
import { pad, requestConflict, requestNotFound, sameClaims } from "./erp-rules";

export function createSampleErpWriter(cfg: Pick<Config, "dirs">): ErpWriterPort & { snapshot(): { requests: BankChangeRequestRow[]; documents: BankChangeDocumentRow[]; callbacks: unknown[] } } {
  const requests = new Map<string, BankChangeRequestRow>();
  const documents = new Map<string, BankChangeDocumentRow>();
  const callbacks: unknown[] = [];
  const seed = path.join(cfg.dirs.sample, "erp", "bank_change_request.json");
  if (existsSync(seed)) for (const r of JSON.parse(readFileSync(seed, "utf8")) as BankChangeRequestRow[]) requests.set(r.request_id, r);
  let bcr = 500;
  let cl = 40001;

  return {
    async nextRequestId() {
      let id = `BCR-2026-${pad(bcr++, 4)}`;
      while (requests.has(id)) id = `BCR-2026-${pad(bcr++, 4)}`;
      return id;
    },
    async insertRequest(row) {
      const existing = requests.get(row.request_id);
      if (existing) {
        if (!sameClaims(existing, row)) throw requestConflict();
        return { request_id: row.request_id, reused: true };
      }
      requests.set(row.request_id, { ...row });
      return { request_id: row.request_id, reused: false };
    },
    async insertDocuments(rows) {
      for (const d of rows) if (!documents.has(d.doc_id)) documents.set(d.doc_id, d);
    },
    async setRequestStatus(request_id, status) {
      const r = requests.get(request_id);
      if (!r) throw requestNotFound(request_id);
      requests.set(request_id, { ...r, status });
    },
    async insertCallback(row) {
      const log_id = `CL-${pad(cl++, 5)}`;
      callbacks.push({ ...row, log_id });
      return { log_id };
    },
    async ping() {
      return true;
    },
    snapshot: () => ({ requests: [...requests.values()], documents: [...documents.values()], callbacks: [...callbacks] }),
  };
}
