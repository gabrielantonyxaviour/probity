// In-memory ERP writer for SAMPLE_MODE (06 §6): same idempotency and conflict rules as Postgres; lost on restart (stated).
// Gap-fill for app/adapters/sample/erp-writer-sample.ts. `rows()` lets the sample store see what intake wrote.
import { AppError } from "../../schemas/errors";
import type { BankChangeDocumentRow, BankChangeRequestRow, ContactLogRow } from "../../schemas/erp";
import type { ErpWriterPort } from "../../schemas/ports";
import { claimFingerprint } from "./erp-compare";

export type SampleErpWriter = ErpWriterPort & {
  requests(): BankChangeRequestRow[];
  documents(): BankChangeDocumentRow[];
  callbacks(): ContactLogRow[];
};

export function createSampleErpWriter(): SampleErpWriter {
  const reqs = new Map<string, BankChangeRequestRow>();
  const docs: BankChangeDocumentRow[] = [];
  const logs: ContactLogRow[] = [];
  let bcr = 499;
  let cl = 40000;
  return {
    async nextRequestId() {
      bcr += 1;
      return `BCR-2026-${String(bcr).padStart(4, "0")}`;
    },
    async insertRequest(row) {
      const prior = reqs.get(row.request_id);
      if (!prior) {
        reqs.set(row.request_id, { ...row });
        return { request_id: row.request_id, reused: false };
      }
      if (claimFingerprint(prior) !== claimFingerprint(row)) throw new AppError("request_conflict", "This request id already exists with different claims.", { httpStatus: 409 });
      return { request_id: row.request_id, reused: true };
    },
    async insertDocuments(rows) {
      for (const d of rows) if (!docs.some((x) => x.doc_id === d.doc_id)) docs.push(d);
    },
    async setRequestStatus(id, status) {
      const r = reqs.get(id);
      if (r) r.status = status;
    },
    async insertCallback(row) {
      cl += 1;
      const log_id = `CL-${String(cl).padStart(5, "0")}`;
      logs.push({ ...row, log_id });
      return { log_id };
    },
    async ping() {
      return true;
    },
    requests: () => [...reqs.values()],
    documents: () => docs,
    callbacks: () => logs,
  };
}
