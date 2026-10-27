// P5: K3-toy, then vendor360 compile (03 §5.2, §9). ddl_sha is the file's sha256.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Job } from "./types.ts";

const TOY = `COMPILE USL IF NOT EXISTS toy DEPLOY NAMESPACE lightning.metastore.probity_toy DDL
CREATE TABLE toy_entity (
  entity_key varchar(16) NOT NULL PRIMARY KEY,
  legal_name varchar(200)
);
CREATE TABLE toy_vendor (
  vendor_id varchar(8) NOT NULL PRIMARY KEY,
  legal_name varchar(200)
);`;

function job(label: string, sql: string, key: Job["key"], kind: Job["kind"] = "ddl"): Job {
  return { phase: "P5", label, file: "50_usl.sql", key, kind, limit: key === "query" ? 50 : 1000, sql };
}

export function uslDdlText(): string {
  return readFileSync("zetaris/usl.ddl", "utf8").trim().replace(/;+\s*$/, "");
}

/** First 16 hex chars of sha256(file bytes), including the trailing newline. */
export function ddlSha16(): string {
  return createHash("sha256").update(readFileSync("zetaris/usl.ddl")).digest("hex").slice(0, 16);
}

export function uslJobs(): Job[] {
  const sha = ddlSha16();
  const ddl = uslDdlText();
  return [
    job("ns-metastore", "CREATE NAMESPACE IF NOT EXISTS lightning.metastore", "admin"),
    job("ns-probity", "CREATE NAMESPACE IF NOT EXISTS lightning.metastore.probity", "admin"),
    job("ns-toy", "CREATE NAMESPACE IF NOT EXISTS lightning.metastore.probity_toy", "admin"),
    job("compile-toy", TOY, "admin"),
    job(
      "activate-toy-entity",
      "ACTIVATE USL TABLE lightning.metastore.probity_toy.toy.toy_entity AS SELECT COALESCE(concat(uei, '-', recipient_level), '') AS entity_key, legal_name FROM probity.usa_entity_v",
      "admin",
    ),
    job(
      "activate-toy-vendor",
      "ACTIVATE USL TABLE lightning.metastore.probity_toy.toy.toy_vendor AS SELECT COALESCE(CAST(vendor_id AS STRING), '') AS vendor_id, CAST(legal_name AS STRING) AS legal_name FROM payee_erp.vendor",
      "admin",
    ),
    job(
      "dq-toy",
      "REGISTER DQ toy_named TABLE lightning.metastore.probity_toy.toy.toy_entity AS legal_name IS NOT NULL",
      "admin",
    ),
    {
      ...job("run-toy", "RUN DQ toy_named TABLE lightning.metastore.probity_toy.toy.toy_entity", "query", "ddl"),
      capture: "k3_toy_run_dq.json",
    },
    job("remove-toy", "REMOVE USL toy NAMESPACE lightning.metastore.probity_toy", "admin"),
    job("compile-vendor360", ddl, "admin"),
    job(
      "desc-usl",
      `UPDATE USL lightning.metastore.probity.vendor360 SET DESCRIPTION 'Probity vendor360 - ddl_sha=${sha}'`,
      "admin",
    ),
    job(
      "desc-payment-run-item",
      "UPDATE USL lightning.metastore.probity.vendor360.payment_run_item SET TABLE DESCRIPTION 'One row per payment-run line, denormalised with bank-change age, the best confirmed call-back and account reuse count so every DQ rule is same-row'",
      "admin",
    ),
    job(
      "desc-registry-entity",
      "UPDATE USL lightning.metastore.probity.vendor360.registry_entity SET TABLE DESCRIPTION 'USAspending recipient records, one per UEI and level. Real public data, cached at setup'",
      "admin",
    ),
  ];
}
