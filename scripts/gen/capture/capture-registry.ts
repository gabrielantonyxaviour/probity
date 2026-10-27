// npm run capture:registry (writes data/sample/registry + captures.json) and npm run capture:check (xfacts only, exit 1 on a changed predicate).
// The only generator that touches the network. SEC calls need SEC_USER_AGENT and are refused without it.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { sha256Hex } from "../contracts";
import { loadEnv, REPO } from "../env-files";
import { trimSubmissions } from "../../../services/source-gateway/trim";
import { RegistryHttp, recipientId, searchKey, type Got } from "./registry-io";
import { ALL_FAMILY_CIKS, loadUniverse } from "./universe";
import { runXFacts } from "./xfacts";

interface Item { source: string; url: string; file: string; http_status: number; sha256: string; bytes: number; latency_ms: number }
const SAMPLE = path.join(REPO, "data/sample");

async function capture(): Promise<void> {
  const http = new RegistryHttp(process.env.SEC_USER_AGENT);
  if (!process.env.SEC_USER_AGENT) throw new Error("SEC_USER_AGENT is not set; capture:registry refuses to call SEC without a declared User-Agent");
  const u = loadUniverse();
  const items: Item[] = [];
  const capturedAt = new Date().toISOString();
  const put = (source: string, rel: string, got: Got, content: string): void => {
    const file = path.join(SAMPLE, "registry", rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
    items.push({ source, url: got.url, file: `registry/${rel}`, http_status: got.status, sha256: sha256Hex(content), bytes: Buffer.byteLength(content), latency_ms: got.ms });
    process.stdout.write(`  ${source} ${rel} (${got.status}, ${got.ms} ms)\n`);
  };
  const ok = (got: Got): string => {
    if (got.status !== 200) throw new Error(`unexpected HTTP ${got.status} for ${got.url}`);
    return got.text;
  };
  for (const d of u.details) {
    const id = recipientId(d.uei, d.level);
    const got = await http.usa(`/recipient/${id}/`);
    put("D1", `usaspending/recipient/${id}.json`, got, `${JSON.stringify(JSON.parse(ok(got)), null, 1)}\n`);
  }
  for (const parent of u.children) {
    const got = await http.usa(`/recipient/children/${parent}/`);
    put("D2", `usaspending/children/${parent}.json`, got, `${JSON.stringify(JSON.parse(ok(got)))}\n`);
  }
  for (const kw of u.keywords) {
    const got = await http.usaSearch(kw, u.limit);
    put("D3", `usaspending/search/${searchKey(kw, u.limit)}.json`, got, `${JSON.stringify({ keyword: kw, ...(JSON.parse(ok(got)) as object) }, null, 1)}\n`);
  }
  for (const cik of u.ciks) {
    const got = await http.sec("data", `/submissions/CIK${cik}.json`);
    put("D4", `edgar/submissions/CIK${cik}.json`, got, `${JSON.stringify(trimSubmissions(JSON.parse(ok(got))), null, 1)}\n`);
  }
  const tk = await http.sec("www", "/files/company_tickers.json");
  const all = JSON.parse(ok(tk)) as Record<string, { cik_str: number; ticker: string; title: string }>;
  const wanted = new Set(ALL_FAMILY_CIKS().map((c) => Number(c)));
  const kept = Object.fromEntries(Object.entries(all).filter(([, v]) => wanted.has(v.cik_str)));
  put("D5", "edgar/company_tickers.json", tk, `${JSON.stringify(kept, null, 1)}\n`);
  const absent = [...wanted].filter((c) => !Object.values(all).some((v) => v.cik_str === c)).sort((a, b) => a - b);
  const derived = { tickers_total: Object.keys(all).length, tickers_kept: Object.keys(kept).length, family_ciks_without_ticker: absent.map((c) => String(c).padStart(10, "0")) };
  const lines = items.map((i) => `  ${JSON.stringify(i)}`).join(",\n");
  writeFileSync(path.join(SAMPLE, "captures.json"), `{"captured_at":${JSON.stringify(capturedAt)},"derived":${JSON.stringify(derived)},"items":[\n${lines}\n]}\n`);
  process.stdout.write(`captured ${items.length} items at ${capturedAt}\n`);
}

async function check(): Promise<void> {
  const result = await runXFacts(new RegistryHttp(process.env.SEC_USER_AGENT));
  let drifted = 0;
  try {
    const cap = JSON.parse(readFileSync(path.join(SAMPLE, "captures.json"), "utf8")) as { items: Item[] };
    const http = new RegistryHttp(process.env.SEC_USER_AGENT);
    for (const it of cap.items.filter((i) => i.source === "D2")) {
      const live = await http.usa(`/recipient/children/${path.basename(it.file, ".json")}/`);
      if (sha256Hex(`${JSON.stringify(JSON.parse(live.text))}\n`) !== it.sha256) drifted++;
    }
  } catch { /* no committed captures yet */ }
  for (const r of result) process.stdout.write(`${r.ok ? "ok  " : "FAIL"} ${r.id} ${r.ok ? "" : `expected ${JSON.stringify(r.expected)} got ${JSON.stringify(r.actual)}`}\n`);
  if (drifted > 0) process.stdout.write(`note: ${drifted} children list(s) differ byte-for-byte from the captures (amounts move daily; reported, not failed)\n`);
  if (result.some((r) => !r.ok)) process.exit(1);
  process.stdout.write("capture:check ok\n");
}

loadEnv();
const { values } = parseArgs({ options: { check: { type: "boolean" } } });
(values.check ? check() : capture()).catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
