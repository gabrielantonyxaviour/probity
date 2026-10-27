// P1–P2 REST registration. USAspending sends Accept: application/json (live fix, 2026-10-27).
import type { ZetarisConfig } from "../../../app/adapters/zetaris/config.ts";
import { detailsOf, loadCovered, recipientId, DISCOVERY_UEI, type Family } from "../covered.ts";
import { describeBy, type Job } from "./types.ts";

const USA_DESC = describeBy("USAspending recipient API - real public data");
const SEC_DESC = describeBy("SEC EDGAR submissions API - real public data");
const GW_DESC = describeBy("Probity pass-through gateway - live registry calls reshaped");

function job(partial: Omit<Job, "file"> & { file?: string }): Job {
  return { file: partial.file ?? "20_rest.sql", ...partial };
}

function restTable(db: string, table: string, endpoint: string, header: string): string {
  return `CREATE LIGHTNING REST TABLE ${table} FROM ${db} REQUEST (
  endpoint "${endpoint}",
  method "GET",
  http_encoding "URLENCODED",
  response_type "JSON",
  insecure_ssl "false"
) HEADER (
  ${header}
) BODY ()`;
}

export function restJobs(cfg: ZetarisConfig, userAgent: string): Job[] {
  const families = loadCovered();
  const gateway = cfg.registryPath === "gateway";
  const db = gateway ? "source_gateway" : "usaspending";
  const origin = cfg.gatewayOrigin;
  const jobs: Job[] = [
    job({
      phase: "P1",
      label: "db-usaspending",
      file: "10_databases.sql",
      key: "admin",
      kind: "ddl",
      limit: 1000,
      sql: `CREATE LIGHTNING DATABASE usaspending DESCRIBE BY "${USA_DESC}"`,
    }),
    job({
      phase: "P1",
      label: "db-sec-edgar",
      file: "10_databases.sql",
      key: "admin",
      kind: "ddl",
      limit: 1000,
      sql: `CREATE LIGHTNING DATABASE sec_edgar DESCRIBE BY "${SEC_DESC}"`,
    }),
  ];
  if (gateway || cfg.erpPath === "gateway" || cfg.childrenShape === "wrapped") {
    jobs.push(
      job({
        phase: "P1",
        label: "db-source-gateway",
        file: "10_databases.sql",
        key: "admin",
        kind: "ddl",
        limit: 1000,
        sql: `CREATE LIGHTNING DATABASE source_gateway DESCRIBE BY "${GW_DESC}"`,
      }),
    );
  }
  const details = detailsOf(families);
  if (cfg.preregisterDiscovery) details.push(DISCOVERY_UEI);
  for (const detail of details) {
    const table = `usa_r_${detail.uei.toLowerCase()}`;
    const rid = recipientId(detail.uei, detail.level);
    const endpoint = gateway
      ? `${origin}/usaspending/recipient/${rid}`
      : `https://api.usaspending.gov/api/v2/recipient/${rid}/`;
    jobs.push(
      job({
        phase: "P2",
        label: `create-${db}.${table}`,
        key: "admin",
        kind: "ddl",
        limit: 1000,
        gapBeforeMs: 250,
        sql: restTable(db, table, endpoint, 'Accept "application/json"'),
      }),
      job({
        phase: "P2",
        label: `cache-${db}.${table}`,
        key: "admin",
        kind: "ddl",
        limit: 1000,
        sql: `CACHE TABLE ${db}.${table}`,
      }),
    );
  }
  const childDb = cfg.childrenShape === "wrapped" || gateway ? "source_gateway" : "usaspending";
  for (const family of families) {
    const table = `usa_c_${family.children.toLowerCase()}`;
    const endpoint =
      cfg.childrenShape === "wrapped" || gateway
        ? `${origin}/usaspending/children/${family.children}`
        : `https://api.usaspending.gov/api/v2/recipient/children/${family.children}/`;
    jobs.push(
      job({
        phase: "P2",
        label: `create-${childDb}.${table}`,
        key: "admin",
        kind: "ddl",
        limit: 1000,
        gapBeforeMs: 250,
        sql: restTable(childDb, table, endpoint, 'Accept "application/json"'),
      }),
      job({
        phase: "P2",
        label: `cache-${childDb}.${table}`,
        key: "admin",
        kind: "ddl",
        limit: 1000,
        sql: `CACHE TABLE ${childDb}.${table}`,
      }),
    );
  }
  for (const family of families) {
    const table = `sec_s_${family.cik}`;
    jobs.push(
      job({
        phase: "P2",
        label: `create-sec_edgar.${table}`,
        key: "admin",
        kind: "ddl",
        limit: 1000,
        gapBeforeMs: 500,
        sql: restTable(
          "sec_edgar",
          table,
          `https://data.sec.gov/submissions/CIK${family.cik}.json`,
          `user-agent "${userAgent}"`,
        ),
      }),
      job({
        phase: "P2",
        label: `cache-sec_edgar.${table}`,
        key: "admin",
        kind: "ddl",
        limit: 1000,
        sql: `CACHE TABLE sec_edgar.${table}`,
      }),
    );
  }
  // D5 / K1h. The direct company_tickers.json table inferred 10430 struct columns and the
  // map decode did not return within 60s (see zetaris/results/k1h.json). The gateway
  // serves the same file as {data:[...]}. userAgent stays on the per-CIK EDGAR tables.
  const gatewayDbAlready = gateway || cfg.erpPath === "gateway" || cfg.childrenShape === "wrapped";
  if (!gatewayDbAlready) {
    jobs.push(
      job({
        phase: "P2",
        label: "db-sec_tickers-source-gateway",
        file: "10_databases.sql",
        key: "admin",
        kind: "ddl",
        limit: 1000,
        sql: `CREATE LIGHTNING DATABASE source_gateway DESCRIBE BY "${GW_DESC}"`,
      }),
    );
  }
  jobs.push(
    job({
      phase: "P2",
      label: "drop-sec_tickers-wide",
      key: "admin",
      kind: "ddl",
      limit: 1000,
      sql: "DROP LIGHTNING DATABASE TABLE sec_edgar.sec_tickers",
    }),
    job({
      phase: "P2",
      label: "create-source_gateway.sec_tickers",
      key: "admin",
      kind: "ddl",
      limit: 1000,
      gapBeforeMs: 500,
      sql: `CREATE LIGHTNING REST TABLE sec_tickers FROM source_gateway REQUEST (
  endpoint "${origin}/sec/tickers",
  method "GET",
  http_encoding "URLENCODED",
  response_type "JSON",
  insecure_ssl "false"
) HEADER () BODY ()`,
    }),
    job({
      phase: "P2",
      label: "cache-source_gateway.sec_tickers",
      key: "admin",
      kind: "ddl",
      limit: 1000,
      sql: "CACHE TABLE source_gateway.sec_tickers",
    }),
  );
  return jobs;
}

export function familyList(): Family[] {
  return loadCovered();
}
