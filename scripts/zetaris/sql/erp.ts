// P3 JDBC datasource (03 §2.4). Password is substituted only in .generated/.
import type { Job } from "./types.ts";
import { describeBy } from "./types.ts";

const DESC = describeBy("Synthetic vendor master and AP ledger - Postgres");
const TABLES =
  "('vendor', 'vendor_domain', 'vendor_contact', 'vendor_remit_history', 'vendor_bank_account', 'vendor_contact_log', 'ap_invoice', 'payment_run', 'payment_run_item', 'bank_change_request')";

export function erpJobs(password: string, jdbcHost = "payee-erp-db:5432"): Job[] {
  const create = `CREATE DATASOURCE payee_erp DESCRIBE BY "${DESC}" OPTIONS (
  jdbcdriver "org.postgresql.Driver",
  jdbcurl "jdbc:postgresql://${jdbcHost}/payee_erp",
  username "zetaris_reader",
  password "${password}",
  fetchsize "1000"
)`;
  return [
    { phase: "P3", label: "datasource-payee-erp", file: "40_erp.sql", key: "admin", kind: "ddl", limit: 1000, sql: create },
    {
      phase: "P3",
      label: "register-payee-erp-tables",
      file: "40_erp.sql",
      key: "admin",
      kind: "ddl",
      limit: 1000,
      sql: `REGISTER DATASOURCE TABLES ${TABLES} FROM payee_erp`,
    },
    {
      phase: "P3",
      label: "show-payee-erp-tables",
      file: "40_erp.sql",
      key: "query",
      kind: "sql",
      limit: 100,
      sql: "SHOW DATASOURCE TABLES payee_erp",
    },
  ];
}

export const JDBC_HOSTS = ["payee-erp-db:5432", "host.docker.internal:55432", "host.lima.internal:55432"];
