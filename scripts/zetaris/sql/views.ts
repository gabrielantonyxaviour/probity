// Flatten views (03 §2.3). No comments are emitted; the query guard rejects them.
import type { ZetarisConfig } from "../../../app/adapters/zetaris/config.ts";
import { loadCovered } from "../covered.ts";
import type { Job } from "./types.ts";

const bt = (name: string) => `\`${name}\``;

function view(name: string, body: string): Job {
  return {
    phase: "P4",
    label: `view-${name}`,
    file: "30_views.sql",
    key: "admin",
    kind: "ddl",
    limit: 1000,
    sql: `CREATE OR REPLACE SCHEMASTORE VIEW ${name} WITH CONTAINER probity AS\n${body}`,
  };
}

function entityBranch(db: string, table: string): string {
  const src = `${db}.${table}`;
  return `SELECT
    '${src}' AS source_table,
    CAST(uei AS STRING) AS uei,
    CAST(recipient_level AS STRING) AS recipient_level,
    CAST(recipient_id AS STRING) AS recipient_id,
    CAST(name AS STRING) AS legal_name,
    CAST(parent_uei AS STRING) AS parent_uei,
    CAST(parent_name AS STRING) AS parent_name,
    CAST(location.address_line1 AS STRING) AS address_line1,
    CAST(location.address_line2 AS STRING) AS address_line2,
    CAST(location.city_name AS STRING) AS city_name,
    CAST(location.state_code AS STRING) AS state_code,
    CAST(location.zip AS STRING) AS zip,
    CAST(location.country_code AS STRING) AS country_code,
    CAST(total_transaction_amount AS DECIMAL(18,2)) AS total_transaction_amount,
    to_json(parents) AS parents_json,
    to_json(alternate_names) AS alternate_names_json
  FROM ${src}`;
}

function childBranch(db: string, parent: string, wrapped: boolean): string {
  const table = `usa_c_${parent.toLowerCase()}`;
  const src = `${db}.${table}`;
  if (wrapped) {
    return `SELECT '${parent}' AS parent_uei, CAST(c.uei AS STRING) AS child_uei,
      CAST(c.recipient_id AS STRING) AS child_recipient_id, CAST(c.name AS STRING) AS child_name,
      CAST(c.state_province AS STRING) AS state_province, CAST(c.amount AS DECIMAL(18,2)) AS amount,
      CAST(COUNT(*) OVER () AS INT) AS list_size, '${src}' AS source_table
    FROM ${src} LATERAL VIEW explode(data) AS c`;
  }
  return `SELECT '${parent}' AS parent_uei, CAST(uei AS STRING) AS child_uei,
    CAST(recipient_id AS STRING) AS child_recipient_id, CAST(name AS STRING) AS child_name,
    CAST(state_province AS STRING) AS state_province, CAST(amount AS DECIMAL(18,2)) AS amount,
    CAST(COUNT(*) OVER () AS INT) AS list_size, '${src}' AS source_table
  FROM ${src}`;
}

function secBranch(cik: string): string {
  const src = `sec_edgar.sec_s_${cik}`;
  return `SELECT
    '${src}' AS source_table,
    CAST(cik AS STRING) AS cik,
    CAST(name AS STRING) AS legal_name,
    CAST(ein AS STRING) AS ein,
    CAST(${bt("stateOfIncorporation")} AS STRING) AS state_of_inc,
    CAST(phone AS STRING) AS phone,
    CAST(sic AS STRING) AS sic,
    CAST(${bt("sicDescription")} AS STRING) AS sic_description,
    CAST(addresses.business.street1 AS STRING) AS biz_street1,
    CAST(addresses.business.street2 AS STRING) AS biz_street2,
    CAST(addresses.business.city AS STRING) AS biz_city,
    CAST(addresses.business.${bt("stateOrCountry")} AS STRING) AS biz_state,
    CAST(addresses.business.${bt("zipCode")} AS STRING) AS biz_zip,
    CAST(addresses.mailing.street1 AS STRING) AS mail_street1,
    CAST(addresses.mailing.street2 AS STRING) AS mail_street2,
    CAST(addresses.mailing.city AS STRING) AS mail_city,
    CAST(addresses.mailing.${bt("stateOrCountry")} AS STRING) AS mail_state,
    CAST(addresses.mailing.${bt("zipCode")} AS STRING) AS mail_zip,
    get_json_object(to_json(tickers), '$[0]') AS ticker,
    to_json(${bt("formerNames")}) AS former_names_json
  FROM ${src}`;
}

export function viewJobs(cfg: ZetarisConfig): Job[] {
  const families = loadCovered();
  const usaDb = cfg.registryPath === "gateway" ? "source_gateway" : "usaspending";
  const childDb = cfg.childrenShape === "wrapped" || cfg.registryPath === "gateway" ? "source_gateway" : "usaspending";
  const wrapped = cfg.childrenShape === "wrapped" || cfg.registryPath === "gateway";
  const details = families.flatMap((f) => f.details);
  const entity = `SELECT * FROM (\n  ${details.map((d) => entityBranch(usaDb, `usa_r_${d.uei.toLowerCase()}`)).join("\n  UNION ALL\n  ")}\n) u`;
  const children = `SELECT * FROM (\n  ${families.map((f) => childBranch(childDb, f.children, wrapped)).join("\n  UNION ALL\n  ")}\n) c`;
  const secs = `SELECT * FROM (\n  ${families.map((f) => secBranch(f.cik)).join("\n  UNION ALL\n  ")}\n) s`;
  return [
    {
      phase: "P4",
      label: "container-probity",
      file: "30_views.sql",
      key: "admin",
      kind: "ddl",
      limit: 1000,
      sql: "CREATE SCHEMASTORE CONTAINER probity",
    },
    view("usa_entity_v", entity),
    view(
      "usa_parent_v",
      `SELECT concat(e.uei, '-', e.recipient_level) AS entity_key, e.uei AS uei,
       CAST(p.parent_uei AS STRING) AS parent_uei, CAST(p.parent_name AS STRING) AS parent_name, e.source_table AS source_table
FROM probity.usa_entity_v e
LATERAL VIEW explode(from_json(e.parents_json, 'array<struct<parent_uei:string,parent_name:string,parent_id:string,parent_duns:string>>')) AS p`,
    ),
    view(
      "usa_alias_v",
      `SELECT concat(e.uei, '-', e.recipient_level) AS entity_key, CAST(a AS STRING) AS alias_name, e.source_table AS source_table
FROM probity.usa_entity_v e
LATERAL VIEW explode(from_json(e.alternate_names_json, 'array<string>')) AS a`,
    ),
    view("usa_child_v", children),
    view("sec_registrant_v", secs),
    view(
      "sec_former_v",
      `SELECT s.cik AS cik, CAST(f.name AS STRING) AS former_name,
       CAST(substr(f.${bt("from")}, 1, 10) AS DATE) AS valid_from, CAST(substr(f.${bt("to")}, 1, 10) AS DATE) AS valid_to,
       s.source_table AS source_table
FROM probity.sec_registrant_v s
LATERAL VIEW explode(from_json(s.former_names_json, 'array<struct<name:string,${bt("from")}:string,${bt("to")}:string>>')) AS f
WHERE upper(trim(CAST(f.name AS STRING))) <> upper(trim(s.legal_name))`,
    ),
  ];
}
