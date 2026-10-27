// Judge proof F32: re-fetch the public registry facts the demo relies on (X1 to X9) from USAspending and SEC EDGAR, keyless,
// and diff them against (a) the baseline recorded when we captured them and (b) the committed capture files SAMPLE_MODE reads.
//   npx tsx scripts/verify-registry-facts.ts [--json] [--only X1,X2] [--baseline path]
// Needs Node 22 and network. SEC wants a declared User-Agent: set SEC_USER_AGENT, or the script sends a labelled default.
// Exit 0 = every fact matches; 1 = a fact changed (the new value is printed); 2 = a source could not be reached (not a diff).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PREDICATES } from "./gen/capture/xfacts";
import { recipientId, searchKey, type Got } from "./gen/capture/registry-io";

const ROOT = path.resolve(import.meta.dirname, "..");
const USA = "https://api.usaspending.gov/api/v2";
const SEC_UA = process.env.SEC_USER_AGENT && !/<.*>/.test(process.env.SEC_USER_AGENT) ? process.env.SEC_USER_AGENT : "Probity Verify probity-verify@example.com";
const CAPTURES = path.join(ROOT, "data/sample/registry");
const arg = (n: string): string | undefined => (process.argv.indexOf(`--${n}`) > 0 ? process.argv[process.argv.indexOf(`--${n}`) + 1] : undefined);
const BASELINE = path.resolve(ROOT, arg("baseline") ?? "scripts/gen/capture/xfacts.expected.json");
const ids = (arg("only")?.split(",") ?? Array.from({ length: 9 }, (_, i) => `X${i + 1}`)).filter((id) => id in PREDICATES);

const say = (s: string): void => void process.stdout.write(`${s}\n`);
type Fetcher = { usa(p: string): Promise<Got>; usaSearch(k: string, n: number): Promise<Got>; sec(host: "data" | "www", p: string): Promise<Got> };
class Unreachable extends Error {}

async function get(url: string, init: RequestInit): Promise<Got> {
  const t0 = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(9_000) });
      const text = await res.text();
      if ((res.status === 429 || res.status >= 500) && attempt === 0) continue;
      if (res.status !== 200) throw new Unreachable(`${url} answered HTTP ${res.status}`);
      return { url, status: res.status, text, ms: Date.now() - t0 };
    } catch (e) {
      if (e instanceof Unreachable) throw e;
      if (attempt === 1) throw new Unreachable(`${url} did not answer (${e instanceof Error ? e.message : "network"})`);
    }
  }
  throw new Unreachable(url);
}

const live: Fetcher = {
  usa: (p) => get(`${USA}${p}`, { headers: { accept: "application/json" } }),
  usaSearch: (keyword, limit) => get(`${USA}/recipient/`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ keyword, limit, page: 1, award_type: "all" }) }),
  sec: (host, p) => get(`https://${host === "data" ? "data" : "www"}.sec.gov${p}`, { headers: { "user-agent": SEC_UA, accept: "application/json" } }),
};

/** The committed captures, served through the same interface. A file that was never captured is "missing", not a diff. */
const captured: Fetcher = {
  async usa(p) {
    const m = /^\/recipient\/children\/([A-Z0-9]+)\/$/.exec(p);
    const file = m ? path.join(CAPTURES, "usaspending/children", `${m[1]}.json`) : path.join(CAPTURES, "usaspending/recipient", `${p.replace(/^\/recipient\//, "").replace(/\/$/, "")}.json`);
    return fromFile(file);
  },
  usaSearch: (k, n) => fromFile(path.join(CAPTURES, "usaspending/search", `${searchKey(k, n)}.json`)),
  sec: (_h, p) => fromFile(p.includes("company_tickers") ? path.join(CAPTURES, "edgar/company_tickers.json") : path.join(CAPTURES, "edgar/submissions", path.basename(p))),
};
async function fromFile(file: string): Promise<Got> {
  if (!existsSync(file)) throw new Unreachable(`no capture file ${path.relative(ROOT, file)}`);
  return { url: file, status: 200, text: readFileSync(file, "utf8"), ms: 0 };
}

/** A minimal stand-in for the capture lane's registry reader: the predicates only call these five methods. */
function reader(f: Fetcher) {
  const cache = new Map<string, Promise<unknown>>();
  const once = <T>(k: string, load: () => Promise<T>): Promise<T> => (cache.has(k) ? cache : cache.set(k, load())).get(k) as Promise<T>;
  const json = async (g: Promise<Got>) => JSON.parse((await g).text);
  return {
    detail: (uei: string, level = "C") => once(`d${uei}${level}`, () => json(f.usa(`/recipient/${recipientId(uei, level)}/`))),
    children: (parent: string) => once(`c${parent}`, () => json(f.usa(`/recipient/children/${parent}/`))),
    search: (kw: string) => once(`s${kw}`, () => json(f.usaSearch(kw, 8))),
    edgar: (cik: string) => once(`e${cik}`, () => json(f.sec("data", `/submissions/CIK${cik}.json`))),
    tickers: () => once("t", () => json(f.sec("www", "/files/company_tickers.json"))),
  };
}

type Outcome = { id: string; value: unknown; error: string | null };
async function evaluate(f: Fetcher): Promise<Outcome[]> {
  const r = reader(f) as never;
  return Promise.all(
    ids.map(async (id) => {
      try {
        return { id, value: await PREDICATES[id]!(r), error: null };
      } catch (e) {
        return { id, value: null, error: e instanceof Error ? e.message : "failed" };
      }
    }),
  );
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as Record<string, unknown>;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const t0 = Date.now();
const [liveRes, capRes] = await Promise.all([evaluate(live), evaluate(captured)]);
const rows = ids.map((id) => {
  const l = liveRes.find((x) => x.id === id)!;
  const c = capRes.find((x) => x.id === id)!;
  const status = l.error ? "unreachable" : !same(l.value, baseline[id]) ? "changed" : "match";
  const capture = c.error ? "missing" : same(c.value, baseline[id]) ? "match" : "differs";
  return { id, live_vs_baseline: status, capture_vs_baseline: capture, live: l.value, baseline: baseline[id], error: l.error };
});
const elapsed_ms = Date.now() - t0;
const changed = rows.filter((r) => r.live_vs_baseline === "changed");
const unreachable = rows.filter((r) => r.live_vs_baseline === "unreachable");

if (process.argv.includes("--json")) {
  say(JSON.stringify({ checked_at: new Date().toISOString(), elapsed_ms, rows }, null, 2));
} else {
  say(`Registry facts re-fetched from api.usaspending.gov and data.sec.gov at ${new Date().toISOString()} (${(elapsed_ms / 1000).toFixed(1)} s)`);
  say("fact  live vs recorded   committed capture vs recorded");
  for (const r of rows) say(`${r.id.padEnd(5)} ${r.live_vs_baseline.padEnd(18)} ${r.capture_vs_baseline}${r.error ? `   (${r.error})` : ""}`);
  for (const r of changed) say(`\n${r.id} CHANGED\n  recorded: ${JSON.stringify(r.baseline)}\n  live now: ${JSON.stringify(r.live)}`);
  say(changed.length || unreachable.length ? `\n${changed.length} changed, ${unreachable.length} unreachable of ${rows.length}.` : `\nAll ${rows.length} facts match what we recorded.`);
}
process.exit(changed.length ? 1 : unreachable.length ? 2 : 0);
