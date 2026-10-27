import { execFileSync } from "node:child_process";

export type ErpSnapshot = { request_id: string; status: string; documents: number; contact_logs: number };

/** Read-only ERP row state. No account numbers, hashes, or phone columns. */
export function erpSnapshot(requestId: string): ErpSnapshot {
  if (!/^BCR-\d{4}-\d{4}$/.test(requestId)) throw new Error("refusing an unexpected request id");
  const sql = [
    "SELECT COALESCE((SELECT status FROM bank_change_request WHERE request_id = '" + requestId + "'), 'ABSENT')",
    "|| '|' || (SELECT count(*) FROM bank_change_document WHERE request_id = '" + requestId + "')",
    "|| '|' || (SELECT count(*) FROM vendor_contact_log WHERE request_id = '" + requestId + "')",
  ].join(" ");
  const out = execFileSync("docker", ["exec", "payee-erp-db", "psql", "-U", "postgres", "-d", "payee_erp", "-At", "-c", sql], { encoding: "utf8" }).trim();
  const [status, documents, contactLogs] = out.split("|");
  return { request_id: requestId, status: status ?? "ABSENT", documents: Number(documents ?? 0), contact_logs: Number(contactLogs ?? 0) };
}
