// Canonical query guard (03 §1.4). Admin key: registrar texts, .generated statements, or one COMPILE USL payload.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ZetarisError } from "./errors";
import { maskSecrets } from "./mask";

export { maskSecrets };

export const QUERY_HEAD =
  /^(SELECT|WITH|RUN DQ|SHOW DQ (VALID|INVALID) RECORD|LIST DQ USL|LOAD USL|SHOW NAMESPACES OR TABLES IN|SHOW LIGHTNING (DATABASES|TABLES)|SHOW DATASOURCES|SHOW DATASOURCE TABLES|DESCRIBE DATASOURCE TABLE)\b/i;

const WRITE =
  /\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|REGISTER|ACTIVATE|COMPILE|GRANT|REVOKE|ASSIGN|CACHE|UNCACHE|TRUNCATE|EXPORT|MATERIALIZE)\b/i;

const WRITE_TOKENS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "MERGE",
  "DROP",
  "ALTER",
  "CREATE",
  "REGISTER",
  "ACTIVATE",
  "COMPILE",
  "GRANT",
  "REVOKE",
  "ASSIGN",
  "CACHE",
  "UNCACHE",
  "TRUNCATE",
  "EXPORT",
  "MATERIALIZE",
] as const;

export const QUERY_LIMIT = 8_000;

function reject(reason: string): never {
  throw new ZetarisError("zetaris_bad_request", `statement rejected by guard: ${reason}`, undefined, false);
}

/** Replace quoted literals with spaces and reject comments or semicolons outside them. */
export function bareSql(sql: string): string {
  let bare = "";
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!;
    if (c === "'" || c === '"') {
      const q = c;
      bare += " ";
      i++;
      while (i < sql.length) {
        if (sql[i] === q) {
          // SQL escapes a quote by doubling it. Step past both, or the second one looks like the closer.
          if (sql[i + 1] === q) {
            i += 2;
            continue;
          }
          break;
        }
        i++;
      }
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") reject("line_comment");
    if (c === "/" && sql[i + 1] === "*") reject("block_comment");
    if (c === ";") reject("semicolon");
    bare += c;
  }
  return bare;
}

export function assertQuery(sql: string): void {
  const text = sql.trim();
  if (!text) reject("empty");
  if (text.length > QUERY_LIMIT) reject("too_long");
  if (!QUERY_HEAD.test(text)) reject("statement_class");
  const bare = bareSql(text);
  const hit = bare.match(WRITE);
  if (hit) reject(`write_token:${hit[1]!.toUpperCase()}`);
  if (/^(SELECT|WITH)\b/i.test(text)) {
    const limits = [...bare.matchAll(/\bLIMIT\s+(\d+)\b/gi)];
    if (limits.length === 0) reject("limit_required");
    for (const m of limits) {
      const n = Number(m[1]);
      if (!Number.isInteger(n) || n < 1 || n > 500) reject("limit_range");
    }
  }
}

const SESSION_DROP = /^DROP TABLE session\.pp_(usa_r|usa_c|sec_s)_[a-z0-9]{10,12}(_pt|_mr)?$/i;

export function registrarOk(sql: string, patterns: RegExp[]): boolean {
  const text = sql.trim();
  return patterns.some((re) => re.test(text));
}

export function generatedStatements(dir = join(process.cwd(), "zetaris/register/.generated")): string[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".sql"));
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of names) {
    const raw = readFileSync(join(dir, name), "utf8");
    for (const part of raw.split(/\n-- @@\n/)) {
      const stmt = part
        .split("\n")
        .filter((line) => !line.startsWith("--"))
        .join("\n")
        .trim()
        .replace(/;+\s*$/, "");
      if (stmt) out.push(stmt);
    }
  }
  return out;
}

export function assertAdmin(sql: string, patterns: RegExp[], generated?: string[]): void {
  const text = sql.trim().replace(/;+\s*$/, "");
  if (!text) reject("empty");
  if (SESSION_DROP.test(text)) return;
  if (registrarOk(text, patterns)) return;
  if (/^COMPILE USL\b/i.test(text) && /\bDDL\b/.test(text)) return;
  const known = generated ?? generatedStatements();
  if (known.some((s) => s.trim() === text)) return;
  reject("admin_allow_list");
}

export function assertAllowed(sql: string, key: "query" | "admin", patterns: RegExp[] = []): void {
  if (key === "query") assertQuery(sql);
  else assertAdmin(sql, patterns);
}

export { WRITE_TOKENS };
