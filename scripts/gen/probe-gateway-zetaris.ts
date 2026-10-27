// Gateway probe (brief D6): can Zetaris parse USAspending through the gateway, and does it parse the API directly?
// Creates database probe_gw with one REST table per case (G0-G3 through the gateway, Z1-Z3 direct), SELECTs, compares with curl,
// writes logs/gateway-probe-<UTC>[-CASE].json and drops probe_gw.* only (never PROBE_SEC / PROBE_USA / the Zetaris lane's objects).
//   npx tsx scripts/gen/probe-gateway-zetaris.ts [--origin http://source-gateway:8790] [--keep]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadEnv, REPO } from "./env-files";
import { zetarisRun, type ZResult } from "./zetaris-rest";

const RECIPIENT = "ffca72e5-fba2-798a-6969-2a6c45e9f985-C";
const USA = "https://api.usaspending.gov/api/v2/recipient";
const DB = "probe_gw";
interface Case { id: string; table: string; url: (o: string) => string; header: string; select: string; verify: (rows: unknown[][], cols: string[], expected: Expected) => string | null }
interface Expected { name: string; city: string; childCount: number }

const hasCorrupt = (cols: string[]): boolean => cols.includes("_corrupt_record");
const nameCity = (rows: unknown[][], cols: string[], e: Expected): string | null => {
  if (hasCorrupt(cols)) return "only _corrupt_record was inferred";
  const row = rows[0];
  if (!row) return "no rows";
  const flat = row.map((v) => String(v));
  return flat.includes(e.name) && flat.includes(e.city) ? null : `expected ${e.name} / ${e.city}, got ${JSON.stringify(flat).slice(0, 160)}`;
};
const CASES: Case[] = [
  { id: "G0", table: "g0_debug", url: (o) => `${o}/debug/headers`, header: "", select: "SELECT * FROM probe_gw.g0_debug", verify: (r, c) => (hasCorrupt(c) || !r[0] ? "no parsed row" : null) },
  { id: "G1", table: "g1_raw", url: (o) => `${o}/usaspending/recipient/${RECIPIENT}`, header: "", select: "SELECT name, location.city_name AS city, uei FROM probe_gw.g1_raw", verify: nameCity },
  { id: "G2", table: "g2_flat", url: (o) => `${o}/usaspending/recipient/${RECIPIENT}?shape=flat`, header: "", select: "SELECT legal_name, city_name, uei, parents_json FROM probe_gw.g2_flat", verify: nameCity },
  { id: "G3", table: "g3_children", url: (o) => `${o}/usaspending/children/MBPHTU7Y9S65`, header: "", select: "SELECT size(data) AS n FROM probe_gw.g3_children",
    verify: (r, c, e) => (hasCorrupt(c) ? "only _corrupt_record was inferred" : Number(r[0]?.[0]) === e.childCount ? null : `expected size(data) ${e.childCount}, got ${String(r[0]?.[0])}`) },
  { id: "Z1", table: "z1_direct", url: () => `${USA}/${RECIPIENT}/`, header: 'accept "application/json"', select: "SELECT name, location.city_name AS city, uei FROM probe_gw.z1_direct", verify: nameCity },
  { id: "Z2", table: "z2_direct_format", url: () => `${USA}/${RECIPIENT}/?format=json`, header: "", select: "SELECT name, location.city_name AS city, uei FROM probe_gw.z2_direct_format", verify: nameCity },
  { id: "Z3", table: "z3_direct_children", url: () => `${USA}/children/MBPHTU7Y9S65/`, header: 'accept "application/json"', select: "SELECT count(*) AS n FROM probe_gw.z3_direct_children",
    verify: (r, c, e) => (hasCorrupt(c) ? "only _corrupt_record was inferred" : Number(r[0]?.[0]) === e.childCount ? null : `expected ${e.childCount} rows, got ${String(r[0]?.[0])}`) },
];

const ddl = (c: Case, origin: string): string =>
  `CREATE LIGHTNING REST TABLE ${c.table} FROM ${DB} REQUEST (endpoint "${c.url(origin)}", method "GET", http_encoding "URLENCODED", response_type "JSON", insecure_ssl "false") HEADER (${c.header}) BODY ()`;

function table(res: ZResult): { cols: string[]; rows: unknown[][] } {
  const b = res.body as { headers?: string[]; data?: unknown[][] };
  return { cols: b.headers ?? [], rows: b.data ?? [] };
}

async function cleanup(): Promise<void> {
  for (const c of CASES) await zetarisRun(`DROP LIGHTNING DATABASE TABLE ${DB}.${c.table}`);
  await zetarisRun(`DROP LIGHTNING DATABASE ${DB}`);
}

async function getJson(url: string): Promise<unknown> {
  for (let i = 0; ; i++) {
    try { return await (await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) })).json(); } catch (e) { if (i >= 2) throw e; }
  }
}
async function expectedFromCurl(): Promise<Expected> {
  const detail = (await getJson(`${USA}/${RECIPIENT}/`)) as { name: string; location: { city_name: string } };
  const kids = (await getJson(`${USA}/children/MBPHTU7Y9S65/`)) as unknown[];
  return { name: detail.name, city: detail.location.city_name, childCount: kids.length };
}

async function main(): Promise<void> {
  loadEnv();
  const { values } = parseArgs({ options: { origin: { type: "string" }, keep: { type: "boolean" } } });
  const origin = values.origin ?? process.env.GATEWAY_ORIGIN_FOR_ZETARIS ?? "http://host.docker.internal:8790";
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const logs = path.join(REPO, "logs");
  mkdirSync(logs, { recursive: true });
  const expected = await expectedFromCurl();
  await cleanup();
  const created = await zetarisRun(`CREATE LIGHTNING DATABASE ${DB} DESCRIBE BY "Probity gateway probe"`);
  if (created.http >= 300) throw new Error(`cannot create ${DB}: ${created.error}`);
  const summary: Record<string, unknown>[] = [];
  for (const c of CASES) {
    const sql = ddl(c, origin);
    const create = await zetarisRun(sql);
    const select = create.http < 300 ? await zetarisRun(c.select) : null;
    const t = select && select.http < 300 ? table(select) : { cols: [], rows: [] };
    const problem = create.http >= 300 ? `create failed: ${create.error}` : !select || select.http >= 300 ? `select failed: ${select?.error}` : c.verify(t.rows, t.cols, expected);
    const entry = { case: c.id, endpoint: c.url(origin), ddl: sql, create_http: create.http, create_ms: create.ms, select_sql: c.select, select_http: select?.http ?? null, select_ms: select?.ms ?? null, columns: t.cols, rows: t.rows.slice(0, 3), parsed: problem === null, problem, expected_from_curl: expected, at: new Date().toISOString() };
    writeFileSync(path.join(logs, `gateway-probe-${stamp}-${c.id}.json`), `${JSON.stringify(entry, null, 2)}\n`);
    summary.push({ case: c.id, parsed: entry.parsed, create_ms: entry.create_ms, select_ms: entry.select_ms, problem });
    process.stdout.write(`${c.id}: parsed=${entry.parsed ? "y" : "n"} ms=${entry.create_ms}/${entry.select_ms ?? "-"}${problem ? ` (${problem.slice(0, 140)})` : ""}${c.id === "G0" ? ` accept=${JSON.stringify(t.rows[0]?.[t.cols.indexOf("accept")] ?? null)}` : ""}\n`);
  }
  writeFileSync(path.join(logs, `gateway-probe-${stamp}.json`), `${JSON.stringify({ origin, expected, summary }, null, 2)}\n`);
  if (!values.keep) await cleanup();
}
main().catch((e: unknown) => { process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`); process.exit(1); });
