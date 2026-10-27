// P2 checks: COUNT > 0 and detail/EDGAR fields equal a direct curl. No secret is printed.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { runZetaris } from "../../app/adapters/zetaris/index.ts";
import { detailsOf, loadCovered, recipientId, type Family } from "./covered.ts";

function curl(url: string, userAgent?: string): Promise<string> {
  const args = ["-sS", "--max-time", "45"];
  if (userAgent) args.push("-A", userAgent);
  args.push(url);
  return new Promise((resolve, reject) => {
    execFile("curl", args, { maxBuffer: 12_000_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

async function q(sql: string): Promise<unknown[][]> {
  const result = await runZetaris(sql, { key: "query", kind: "sql", limit: 5, queryId: randomUUID() });
  return result.rows;
}

const same = (a: unknown, b: unknown) => String(a ?? "").trim() === String(b ?? "").trim();

export async function verifyRest(userAgent: string): Promise<{ ok: boolean; counts: Record<string, number>; notes: string[] }> {
  const families = loadCovered();
  const counts: Record<string, number> = {};
  const notes: string[] = [];
  let ok = true;
  for (const detail of detailsOf(families)) {
    const table = `usaspending.usa_r_${detail.uei.toLowerCase()}`;
    const url = `https://api.usaspending.gov/api/v2/recipient/${recipientId(detail.uei, detail.level)}/`;
    const live = JSON.parse(await curl(url)) as { name?: string; uei?: string; location?: { city_name?: string } };
    const rows = await q(`SELECT name, uei, location.city_name AS city FROM ${table} LIMIT 1`);
    const n = Number((await q(`SELECT COUNT(*) AS n FROM ${table} LIMIT 1`))[0]?.[0] ?? 0);
    counts[table] = n;
    const row = rows[0] ?? [];
    if (n < 1 || !same(row[0], live.name) || !same(row[1], live.uei) || !same(row[2], live.location?.city_name)) {
      ok = false;
      notes.push(`${table} mismatch n=${n}`);
    }
  }
  for (const family of families) ok = (await checkChildren(family, counts, notes)) && ok;
  for (const family of families) ok = (await checkEdgar(family, userAgent, counts, notes)) && ok;
  return { ok, counts, notes };
}

async function checkChildren(family: Family, counts: Record<string, number>, notes: string[]): Promise<boolean> {
  const table = `usaspending.usa_c_${family.children.toLowerCase()}`;
  const live = JSON.parse(await curl(`https://api.usaspending.gov/api/v2/recipient/children/${family.children}/`)) as unknown[];
  const n = Number((await q(`SELECT COUNT(*) AS n FROM ${table} LIMIT 1`))[0]?.[0] ?? 0);
  counts[table] = n;
  if (!Array.isArray(live) || n !== live.length) {
    notes.push(`${table} count ${n} != live ${Array.isArray(live) ? live.length : "na"}`);
    return false;
  }
  return true;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function checkEdgar(family: Family, userAgent: string, counts: Record<string, number>, notes: string[]): Promise<boolean> {
  await wait(500);
  const table = `sec_edgar.sec_s_${family.cik}`;
  const live = JSON.parse(await curl(`https://data.sec.gov/submissions/CIK${family.cik}.json`, userAgent)) as { name?: string; phone?: string };
  const rows = await q(`SELECT name, phone FROM ${table} LIMIT 1`);
  const n = Number((await q(`SELECT COUNT(*) AS n FROM ${table} LIMIT 1`))[0]?.[0] ?? 0);
  counts[table] = n;
  const row = rows[0] ?? [];
  if (n < 1 || !same(row[0], live.name) || !same(row[1], live.phone)) {
    notes.push(`${table} name/phone mismatch`);
    return false;
  }
  return true;
}
