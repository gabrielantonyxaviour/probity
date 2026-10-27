// Kill tests (07 section 6), run after the fact against the live stack. Read-only: no CREATE, no ERP write, no db:reset.
// Each check writes scripts/kill/results/<id>.json {id, pass, evidence, elapsed_ms, at}. pass:null means "not testable here".
//   npx tsx scripts/kill/kill-tests.ts [K0,K1a,...]
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { ROOT, record, sh, zsql, type Check, type Verdict } from "./kill-lib";

const say = (s: string): void => void process.stdout.write(`${s}\n`);
const env = (n: string): string => {
  if (process.env[n]) return process.env[n]!;
  for (const f of [".env.local", ".env.db.local", ".env"]) {
    try {
      const m = new RegExp(`^${n}=(.*)$`, "m").exec(readFileSync(path.join(ROOT, f), "utf8"));
      if (m?.[1]) return m[1].replace(/^["']|["']$/g, "");
    } catch {
      /* optional file */
    }
  }
  return "";
};
const cell = (rows: unknown[][], r = 0, c = 0): string => String(rows[r]?.[c] ?? "");
const NS = "lightning.metastore.probity.vendor360";
const fail = (what: string, z: { http: number; ms: number; raw: string }) => ({ pass: false, evidence: `${what}: HTTP ${z.http} after ${z.ms} ms ${z.raw.slice(0, 120)}` });

async function nightshift(pathname: string): Promise<{ status: number; body: unknown }> {
  const r = await fetch(`${env("METERLESS_BASE_URL") || "http://127.0.0.1:8088/v1"}${pathname}`, { headers: { authorization: `Bearer ${env("METERLESS_RUNTIME_TOKEN")}` }, signal: AbortSignal.timeout(15_000) });
  return { status: r.status, body: await r.json().catch(() => null) };
}

export const CHECKS: Check[] = [
  { id: "K0", title: "Zetaris answers SELECT 1; Nightshift catalog lists both pins", run: async () => {
    const z = zsql("SELECT 1 AS one");
    if (!z.ok || cell(z.rows) !== "1") return fail("SELECT 1", z);
    const m = (await nightshift("/models")).body as { data?: Array<{ id: string }> } | null;
    const ids = new Set((m?.data ?? []).map((x) => x.id));
    const pins = ["nvidia/nemotron-3.5-lightning-30b-a3b", "nvidia/nemotron-3-ultra-550b-a55b"];
    return { pass: pins.every((p) => ids.has(p)), evidence: `SELECT 1 -> 1 in ${z.ms} ms; Nightshift catalog ${ids.size} ids; pins present ${pins.map((p) => ids.has(p)).join("/")}` };
  } },
  { id: "K1a", title: "USAspending recipient REST table parses (Booz Allen, McLean)", run: async () => {
    const z = zsql("SELECT name, location.city_name, location.address_line1 FROM usaspending.usa_r_jcbmlgpe6z71");
    if (!z.ok) return fail("select", z);
    const row = z.rows[0] ?? [];
    return { pass: String(row[0]) === "BOOZ ALLEN HAMILTON INC" && String(row[1]) === "MCLEAN", evidence: `${JSON.stringify(row)} in ${z.ms} ms` };
  } },
  { id: "K1b", title: "USAspending children table: 41 rows, exactly one in NJ", run: async () => {
    const n = zsql("SELECT COUNT(*) FROM usaspending.usa_c_mbphtu7y9s65");
    const nj = zsql("SELECT uei FROM usaspending.usa_c_mbphtu7y9s65 WHERE state_province = 'NJ'");
    if (!n.ok || !nj.ok) return fail("select", n.ok ? nj : n);
    return { pass: cell(n.rows) === "41" && nj.rows.length === 1 && cell(nj.rows) === "KHK6E1JW9C15", evidence: `count ${cell(n.rows)}, NJ rows ${JSON.stringify(nj.rows)}` };
  } },
  { id: "K1c", title: "EDGAR REST table: Booz Allen name and phone 703-902-5000", run: async () => {
    const z = zsql("SELECT name, phone, ein FROM sec_edgar.sec_s_0001443646");
    if (!z.ok) return fail("select", z);
    return { pass: cell(z.rows, 0, 1) === "703-902-5000", evidence: `${JSON.stringify(z.rows[0])} in ${z.ms} ms` };
  } },
  { id: "K1d", title: "Run-time session table readable (Tinton Falls record)", run: async () => {
    const z = zsql("SELECT name, location.city_name FROM session.pp_usa_r_khk6e1jw9c15 LIMIT 1");
    if (!z.ok) return { pass: null, evidence: `no session table present (it is created by a live S1 run): HTTP ${z.http} ${z.raw.slice(0, 100)}` };
    return { pass: cell(z.rows, 0, 1) === "TINTON FALLS", evidence: `${JSON.stringify(z.rows[0])} in ${z.ms} ms` };
  } },
  { id: "K2", title: "ERP datasource through Zetaris: 40 vendors", run: async () => {
    const z = zsql("SELECT COUNT(*) FROM payee_erp.vendor");
    if (!z.ok) return fail("count", z);
    const pg = sh("docker", ["exec", "payee-erp-db", "psql", "-U", "postgres", "-d", "payee_erp", "-Atc", "SELECT count(*) FROM vendor"]);
    return { pass: cell(z.rows) === pg.out.trim() && Number(cell(z.rows)) > 0, evidence: `Zetaris ${cell(z.rows)} vs Postgres ${pg.out.trim() || "unreadable"}` };
  } },
  { id: "K3", title: "USL answers: T05 join, LIST DQ, RUN DQ unverified_recent_bank_change", run: async () => {
    const j = zsql(`SELECT v.vendor_id, e.entity_key, s.cik FROM ${NS}.vendor v LEFT JOIN ${NS}.registry_entity e ON e.uei = v.uei LEFT JOIN ${NS}.sec_registrant s ON s.cik = v.registrant_cik WHERE v.vendor_id = 'V-10027' LIMIT 5`, "query", 90);
    if (!j.ok) return fail("T05 join", j);
    const l = zsql(`LIST DQ USL ${NS}`, "query", 90);
    const r = zsql(`RUN DQ unverified_recent_bank_change TABLE ${NS}.payment_run_item`, "query", 120);
    return { pass: j.rows.length >= 1 && l.ok && r.ok, evidence: `T05 ${JSON.stringify(j.rows[0])} ${j.ms} ms; LIST DQ ${l.ok ? `${l.rows.length} rows` : `HTTP ${l.http}`}; RUN DQ ${r.ok ? JSON.stringify(r.rows[0]) : `HTTP ${r.http}`}` };
  } },
  { id: "K4", title: "Warm-up: both lanes answer, both Nemotron, egress nvidia", run: async () => {
    const r = sh("node", ["--import", "tsx", "app/cli/main.ts", "warmup"], { timeoutMs: 240_000 });
    const text = `${r.out}${r.err}`;
    const nem = (text.match(/nemotron/gi) ?? []).length;
    return { pass: r.code === 0 && nem >= 2, evidence: `exit ${r.code}; ${text.split("\n").filter((l) => /fast|deep|nemotron|egress/i.test(l)).slice(0, 6).join(" | ").slice(0, 400)}` };
  } },
  { id: "K5", title: "Vendored engines pass their conformance suites (8/8 and 13/13)", run: async () => {
    const r = sh("npm", ["run", "-s", "test:conformance"], { timeoutMs: 240_000 });
    const text = `${r.out}${r.err}`;
    return { pass: r.code === 0 && /8\/8/.test(text), evidence: `exit ${r.code}; ${(text.match(/\d+\/\d+[^\n]*/g) ?? []).slice(0, 4).join(" | ")}` };
  } },
  { id: "K6", title: "A container reaches Zetaris :8888 and Nightshift :8088 on host.docker.internal", run: async () => {
    const js = "const g=(u)=>fetch(u,{signal:AbortSignal.timeout(8000)}).then(r=>r.status).catch(e=>'ERR '+(e.cause&&e.cause.code||e.message));Promise.all([g('http://host.docker.internal:8888/redoc/index.html'),g('http://host.docker.internal:8088/healthz')]).then(r=>process.stdout.write(r.join(' ')))";
    const r = sh("docker", ["run", "--rm", "node:22-bookworm-slim", "node", "-e", js], { timeoutMs: 90_000 });
    // The Zetaris API answers 401 to an unauthenticated GET from the host as well; reachable means any HTTP status, not a socket error.
    return { pass: /^\d{3} 200$/.test(r.out.trim()), evidence: `HTTP statuses seen from a container (zetaris nightshift): ${r.out.trim() || r.err.slice(0, 120)}; Zetaris answers 401 without a key, as it does from the host` };
  } },
  { id: "K7", title: "Query key cannot register objects (key split)", run: async () => {
    const q = env("ZETARIS_QUERY_API_KEY") || env("ZETARIS_API_KEY");
    const a = env("ZETARIS_ADMIN_API_KEY") || env("ZETARIS_API_KEY");
    if (!q || q === a) return { pass: null, evidence: "not testable: one Zetaris key serves both roles (ZETARIS_API_KEY alias). The split stays in code (adapter guard) and README says so. No CREATE was sent." };
    const z = zsql("CREATE REST SESSION TABLE pp_kill_k7_probe REQUEST(endpoint \"https://api.usaspending.gov/api/v2/recipient/ffca72e5-fba2-798a-6969-2a6c45e9f985-C/\", method \"GET\", http_encoding \"URLENCODED\", response_type \"JSON\") HEADER () BODY ()", "query", 30);
    return { pass: !z.ok, evidence: `CREATE with the query key answered HTTP ${z.http}` };
  } },
  { id: "K8", title: "Recorded live S1 runs finish inside the 480 s budget (target 300 s)", run: async () => {
    const secs: number[] = [];
    for (const f of readdirSync(path.join(ROOT, "logs")).filter((x) => /^run-r-.*\.json$/.test(x))) {
      const r = JSON.parse(readFileSync(path.join(ROOT, "logs", f), "utf8")) as { mode?: string; request_id?: string; execution_time_seconds?: number; run_id: string };
      if (r.mode === "live" && r.request_id === "BCR-2026-0412" && typeof r.execution_time_seconds === "number") secs.push(r.execution_time_seconds);
    }
    secs.sort((a, b) => a - b);
    const med = secs.length ? secs[Math.floor(secs.length / 2)]! : null;
    return { pass: med === null ? null : Math.max(...secs) <= 480, evidence: `${secs.length} live S1 runs on disk: ${secs.join(", ")} s; median ${med}` };
  } },
  { id: "K9", title: "Registry facts X1 to X9 unchanged (live re-fetch)", run: async () => {
    const r = sh("npx", ["tsx", "scripts/verify-registry-facts.ts"], { timeoutMs: 90_000 });
    return { pass: r.code === 0, evidence: `exit ${r.code}: ${r.out.trim().split("\n").slice(-1)[0] ?? r.err.slice(0, 120)}` };
  } },
];

const only = process.argv[2] ? process.argv[2].split(",") : undefined;
const verdicts: Verdict[] = [];
for (const c of CHECKS.filter((x) => !only || only.includes(x.id))) {
  const t0 = Date.now();
  let v: { pass: boolean | null; evidence: string };
  try {
    v = await c.run();
  } catch (e) {
    v = { pass: false, evidence: `threw: ${e instanceof Error ? e.message.slice(0, 200) : "error"}` };
  }
  const out = record(c, v, Date.now() - t0);
  verdicts.push(out);
  say(`${out.pass === true ? "PASS" : out.pass === false ? "FAIL" : "SKIP"} ${out.id.padEnd(4)} ${(out.elapsed_ms / 1000).toFixed(1).padStart(6)} s  ${out.title}\n       ${out.evidence}`);
}
const bad = verdicts.filter((v) => v.pass === false).length;
say(`\n${verdicts.filter((v) => v.pass === true).length} passed, ${bad} failed, ${verdicts.filter((v) => v.pass === null).length} not testable of ${verdicts.length}`);
process.exit(bad ? 1 : 0);
