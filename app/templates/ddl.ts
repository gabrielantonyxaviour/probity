// Registrar templates T12–T14, T22, and T30 (03 §7.3). T15 is the non-Zetaris name search.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { loadZetarisConfig, requireSecUserAgent } from "../adapters/zetaris/config.ts";
import { LIT } from "./lit.ts";
import type { Template } from "./types.ts";

function recipientId(uei: string, level: string): string {
  const hex = createHash("md5").update(`UEI-${uei}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}-${level}`;
}

function origin(): string {
  return loadZetarisConfig().gatewayOrigin.replace(/\/+$/, "");
}

const REQ = `method "GET", http_encoding "URLENCODED", response_type "JSON", insecure_ssl "false"`;

export function sessionName(kind: "usa_r" | "usa_c" | "sec_s", id: string, via: string): string {
  const suffix = via === "passthrough" ? "_pt" : via === "mirror" ? "_mr" : "";
  return `pp_${kind}_${id.toLowerCase()}${suffix}`;
}

export const t12: Template<{ uei: string; level: string; via: string }> = {
  id: "T12",
  tier: 2,
  key: "admin",
  usl: false,
  params: z.object({ uei: z.string(), level: z.string(), via: z.string() }).strict(),
  columns: [],
  maxRows: 1,
  llm_columns: [],
  expectRows: false,
  observations: [],
  sql: (p) => {
    const uei = p.uei.toUpperCase();
    if (!LIT.uei.test(uei)) throw new Error("lit rejected: uei");
    const rid = recipientId(uei, p.level);
    const direct = `https://api.usaspending.gov/api/v2/recipient/${rid}/`;
    const endpoint = p.via === "direct" ? direct : `${origin()}${p.via === "mirror" ? "/mirror" : ""}/usaspending/recipient/${rid}/`;
    const table = sessionName("usa_r", uei, p.via);
    return `CREATE REST SESSION TABLE ${table} REQUEST (endpoint "${endpoint}", ${REQ}) HEADER ( Accept "application/json" ) BODY ()`;
  },
};

export const t13: Template<{ parent_uei: string; via: string }> = {
  id: "T13",
  tier: 2,
  key: "admin",
  usl: false,
  params: z.object({ parent_uei: z.string(), via: z.string() }).strict(),
  columns: [],
  maxRows: 1,
  llm_columns: [],
  expectRows: false,
  observations: [],
  sql: (p) => {
    const uei = p.parent_uei.toUpperCase();
    if (!LIT.uei.test(uei)) throw new Error("lit rejected: uei");
    const direct = `https://api.usaspending.gov/api/v2/recipient/children/${uei}/`;
    const endpoint = p.via === "direct" ? direct : `${origin()}${p.via === "mirror" ? "/mirror" : ""}/usaspending/children/${uei}/`;
    return `CREATE REST SESSION TABLE ${sessionName("usa_c", uei, p.via)} REQUEST (endpoint "${endpoint}", ${REQ}) HEADER ( Accept "application/json" ) BODY ()`;
  },
};

export const t14: Template<{ cik10: string; via: string }> = {
  id: "T14",
  tier: 2,
  key: "admin",
  usl: false,
  params: z.object({ cik10: z.string(), via: z.string() }).strict(),
  columns: [],
  maxRows: 1,
  llm_columns: [],
  expectRows: false,
  observations: [],
  sql: (p) => {
    const cik = p.cik10;
    if (!LIT.cik10.test(cik)) throw new Error("lit rejected: cik");
    const ua = requireSecUserAgent(loadZetarisConfig());
    return `CREATE REST SESSION TABLE ${sessionName("sec_s", cik, p.via)} REQUEST (endpoint "https://data.sec.gov/submissions/CIK${cik}.json", ${REQ}) HEADER ( user-agent "${ua}" ) BODY ()`;
  },
};

export const t15: Template<{ name: string }> = {
  id: "T15",
  tier: 2,
  key: "none",
  usl: false,
  params: z.object({ name: z.string() }).strict(),
  columns: [],
  maxRows: 0,
  llm_columns: [],
  expectRows: false,
  observations: [],
  sql: () => {
    throw new Error("T15 is the discovery adapter, not a Zetaris statement");
  },
};

const T22_FILE: Record<string, string> = {
  bank_change_request: "activate-bank_change_request.sql",
  vendor_contact_log: "activate-vendor_contact_log.sql",
  payment_run_item: "activate-payment_run_item.sql",
};

export const t22: Template<{ table: string }> = {
  id: "T22",
  tier: 2,
  key: "admin",
  usl: true,
  params: z.object({ table: z.string() }).strict(),
  columns: [],
  maxRows: 1,
  llm_columns: [],
  expectRows: false,
  observations: [],
  sql: (p) => {
    const file = T22_FILE[p.table];
    if (!file) throw new Error(`T22 table ${p.table} is not re-activated`);
    return readFileSync(join("zetaris/activate", file), "utf8").trim();
  },
};

export const t30: Template<{ query_id: string }> = {
  id: "T30",
  tier: 2,
  key: "query",
  usl: false,
  params: z.object({ query_id: z.string() }).strict(),
  columns: [],
  maxRows: 500,
  llm_columns: [],
  expectRows: false,
  observations: [],
  sql: (p) => {
    if (!/^[0-9a-f-]{36}$/.test(p.query_id)) throw new Error("lit rejected: query_id");
    let names: string[];
    try {
      names = readdirSync("logs").filter((name) => name.startsWith("queries-") && name.endsWith(".jsonl"));
    } catch {
      names = [];
    }
    for (const name of names) {
      for (const line of readFileSync(join("logs", name), "utf8").split("\n")) {
        if (!line.includes(p.query_id)) continue;
        const parsed = JSON.parse(line) as { query_id?: string; queryId?: string; sql?: string };
        if ((parsed.query_id === p.query_id || parsed.queryId === p.query_id) && parsed.sql) return parsed.sql;
      }
    }
    throw new Error(`stored SQL for ${p.query_id} was not found`);
  },
};
