// Tiny Zetaris REST client for the probe and the inbox primer. One statement per call, fresh queryId per call.
import { randomUUID } from "node:crypto";
import { loadEnv } from "./env-files";

export interface ZResult { http: number; ms: number; body: unknown; error: string | null }

export async function zetarisRun(sql: string, limit = 50): Promise<ZResult> {
  loadEnv();
  const key = process.env.ZETARIS_ADMIN_API_KEY ?? process.env.ZETARIS_API_KEY;
  if (!key) throw new Error("ZETARIS_API_KEY is not set");
  const origin = process.env.ZETARIS_API_ORIGIN ?? "http://localhost:8888";
  const t0 = Date.now();
  const res = await fetch(`${origin}/api/v1.0/sql-editor/sqls/run`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "x-org-id": process.env.ZETARIS_ORG_ID ?? "1", "x-request-id": randomUUID(), "content-type": "application/json" },
    body: JSON.stringify({ queryId: randomUUID(), sql, source: "SqlEditor", limit }),
    signal: AbortSignal.timeout(300_000),
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep the raw text */ }
  return { http: res.status, ms: Date.now() - t0, body, error: res.ok ? null : text.slice(0, 400) };
}
