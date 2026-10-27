// P7 REGISTER DQ from the template source (03 §6).
import { DQ_RULES, registerDqSql } from "../../../app/templates/dq-rules.ts";
import type { Job } from "./types.ts";

export function dqJobs(): Job[] {
  return DQ_RULES.map((rule) => ({
    phase: "P7" as const,
    label: `dq-${rule.name}`,
    file: "70_dq.sql",
    key: "admin" as const,
    kind: "ddl" as const,
    limit: 1000,
    sql: registerDqSql(rule),
  }));
}
