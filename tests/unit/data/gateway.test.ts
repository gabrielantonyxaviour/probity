// Source gateway: in-process Fastify against a local stub that behaves like Django REST Framework (HTML for Accept: text/html).
import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../../services/source-gateway/config";
import { buildApp } from "../../../services/source-gateway/server";
import { flatRecipient, wrapChildren } from "../../../services/source-gateway/flat";
import { trimSubmissions } from "../../../services/source-gateway/trim";
import { TokenBucket } from "../../../services/source-gateway/upstream";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const REG = path.join(ROOT, "data/sample/registry");
const readJson = (rel: string): Record<string, unknown> => JSON.parse(readFileSync(path.join(REG, rel), "utf8"));
const RID = "ffca72e5-fba2-798a-6969-2a6c45e9f985-C";

const seen: { url: string; accept: string | undefined; ua: string | undefined }[] = [];
let flaky = 0;
const stub = http.createServer((req, res) => {
  seen.push({ url: req.url ?? "", accept: req.headers.accept, ua: req.headers["user-agent"] });
  const accept = req.headers.accept ?? "*/*";
  if (req.url?.includes("RETRY0000001")) { if (flaky++ === 0) { res.writeHead(429, { "retry-after": "0" }); res.end(); return; } res.writeHead(200, { "content-type": "application/json" }); res.end("[]"); return; }
  if (/text\/html/.test(accept) && !/^application\/json/.test(accept)) { res.writeHead(200, { "content-type": "text/html" }); res.end("<html>DRF</html>"); return; }
  if (req.url === `/api/v2/recipient/${RID}/`) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(readJson(`usaspending/recipient/${RID}.json`))); return; }
  if (req.url === "/api/v2/recipient/children/MBPHTU7Y9S65/") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(readJson("usaspending/children/MBPHTU7Y9S65.json"))); return; }
  if (req.url === "/submissions/CIK0001443646.json") { res.writeHead(200); res.end(JSON.stringify({ ...readJson("edgar/submissions/CIK0001443646.json"), filings: { recent: { big: 1 } } })); return; }
  res.writeHead(400, { "content-type": "application/json" });
  res.end('{"detail":"Recipient not found"}');
});
let origin = "";
beforeAll(async () => { await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r)); origin = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`; });
afterAll(() => { stub.close(); });

const app = (extra: Record<string, string> = {}): ReturnType<typeof buildApp> =>
  buildApp(loadConfig({ LOG_LEVEL: "silent", USASPENDING_UPSTREAM: origin, SEC_DATA_UPSTREAM: origin, SEC_WWW_UPSTREAM: origin, SEC_USER_AGENT: "Probity test contact@example.test", RETRY_DELAY_MS: "10", SAMPLE_DATA_DIR: path.join(ROOT, "data/sample"), ...extra } as NodeJS.ProcessEnv));

describe("source gateway", () => {
  it("answers /healthz with one-line JSON", async () => {
    const r = await app().inject("/healthz");
    expect(r.statusCode).toBe(200);
    expect(r.body).toBe('{"ok":true}');
    expect(r.headers["content-type"]).toBe("application/json; charset=utf-8");
  });

  it("asks upstream for JSON, so the HTML page is never returned (root cause of _corrupt_record)", async () => {
    seen.length = 0;
    const r = await app().inject(`/usaspending/recipient/${RID}`);
    expect(r.statusCode).toBe(200);
    expect(seen[0]?.accept).toBe("application/json");
    expect(JSON.parse(r.body).name).toBe("BOOZ ALLEN HAMILTON INC");
    expect(r.body).not.toContain("\n");
    expect(r.headers["x-gateway-mode"]).toBe("passthrough");
    expect(r.headers["x-upstream-status"]).toBe("200");
    expect(r.headers["x-fetched-at"]).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it("flat shape is one object with the usa_entity_v columns", async () => {
    const r = await app().inject(`/usaspending/recipient/${RID}?shape=flat`);
    const o = JSON.parse(r.body);
    expect(Object.keys(o)).toEqual(["uei", "recipient_level", "recipient_id", "legal_name", "parent_uei", "parent_name", "address_line1", "address_line2", "city_name", "state_code", "zip", "country_code", "total_transaction_amount", "parents_json", "alternate_names_json", "fetched_at"]);
    expect(o).toMatchObject({ uei: "JCBMLGPE6Z71", legal_name: "BOOZ ALLEN HAMILTON INC", city_name: "MCLEAN", parent_uei: "MBPHTU7Y9S65" });
    expect(JSON.parse(o.parents_json)[0].parent_uei).toBe("MBPHTU7Y9S65");
  });

  it("wraps the children array and adds list_size in flat shape", async () => {
    const raw = JSON.parse((await app().inject("/usaspending/children/MBPHTU7Y9S65")).body);
    expect(raw.data).toHaveLength(41);
    expect(Object.keys(raw.data[0])).toEqual(["recipient_id", "name", "duns", "uei", "amount", "state_province"]);
    const flat = JSON.parse((await app().inject("/usaspending/children/MBPHTU7Y9S65?shape=flat")).body);
    expect(flat.data[0]).toMatchObject({ parent_uei: "MBPHTU7Y9S65", list_size: 41 });
    expect(flat.data.filter((c: { state_province: string }) => c.state_province === "NJ").map((c: { uei: string }) => c.uei)).toEqual(["KHK6E1JW9C15"]);
  });

  it("projects EDGAR submissions to header metadata and sends the declared User-Agent", async () => {
    seen.length = 0;
    const r = await app().inject("/edgar/submissions/0001443646");
    const o = JSON.parse(r.body);
    expect(o.filings).toBeUndefined();
    expect(o).toMatchObject({ cik: "0001443646", ein: "000000000", phone: "703-902-5000" });
    expect(seen[0]?.ua).toBe("Probity test contact@example.test");
  });

  it("refuses SEC calls without SEC_USER_AGENT", async () => {
    const r = await app({ SEC_USER_AGENT: "" }).inject("/edgar/submissions/0001443646");
    expect(r.statusCode).toBe(503);
    expect(JSON.parse(r.body)).toEqual({ error: "SEC_USER_AGENT is not configured, so SEC requests are refused.", code: "sec_user_agent_missing" });
  });

  it("validates input and maps upstream not-found to evidence", async () => {
    const a = app();
    for (const url of ["/usaspending/recipient/abc", "/usaspending/children/lower12345678", "/edgar/submissions/123", `/usaspending/recipient/${RID}?shape=bogus`]) {
      const r = await a.inject(url);
      expect(r.statusCode, url).toBe(400);
      expect(Object.keys(JSON.parse(r.body)).sort()).toEqual(["code", "error"]);
      expect(JSON.parse(r.body).code).toBe("invalid_input");
    }
    const nf = await a.inject("/usaspending/children/ZZZZZZZZZZZZ");
    expect(nf.statusCode).toBe(404);
    expect(JSON.parse(nf.body).code).toBe("upstream_not_found");
  });

  it("retries once on 429 and returns 502 when the upstream stays down", async () => {
    flaky = 0;
    seen.length = 0;
    const ok = await app().inject("/usaspending/children/RETRY0000001");
    expect(ok.statusCode).toBe(200);
    expect(seen.filter((s) => s.url.includes("RETRY0000001"))).toHaveLength(2);
    const dead = await app({ USASPENDING_UPSTREAM: "http://127.0.0.1:9", UPSTREAM_TIMEOUT_MS: "500" }).inject(`/usaspending/recipient/${RID}`);
    expect(dead.statusCode).toBe(502);
    expect(JSON.parse(dead.body).code).toBe("upstream_unavailable");
  });

  it("exposes /debug/headers only when GATEWAY_DEBUG=1", async () => {
    expect((await app().inject("/debug/headers")).statusCode).toBe(404);
    const r = await app({ GATEWAY_DEBUG: "1" }).inject({ url: "/debug/headers", headers: { accept: "text/html, */*; q=0.2" } });
    expect(JSON.parse(r.body)).toEqual({ accept: "text/html, */*; q=0.2", user_agent: "lightMyRequest", accept_encoding: null });
  });

  it("mirror routes serve the captures and say so", async () => {
    const r = await app().inject(`/mirror/usaspending/recipient/${RID}?shape=flat`);
    expect(r.statusCode).toBe(200);
    expect(r.headers["x-gateway-mode"]).toBe("mirror");
    expect(r.headers["x-captured-at"]).toBe(JSON.parse(readFileSync(path.join(ROOT, "data/sample/captures.json"), "utf8")).captured_at);
    const miss = await app().inject("/mirror/usaspending/children/ABCDEFGHIJKL");
    expect(JSON.parse(miss.body).code).toBe("mirror_miss");
  });

  it("answers unknown routes with { error, code }", async () => {
    const r = await app().inject("/nope");
    expect(r.statusCode).toBe(404);
    expect(JSON.parse(r.body).code).toBe("not_found");
  });
});

describe("shapes and limits", () => {
  it("flat and wrap are pure", () => {
    expect(flatRecipient({ uei: "X", name: "N", location: {} }, "t").fetched_at).toBe("t");
    expect(wrapChildren({ not: "an array" }, "P", "flat").data).toEqual([]);
    expect(trimSubmissions({ cik: 5, name: "A" }).cik).toBe("0000000005");
  });
  it("the SEC bucket never exceeds 4 requests per second", async () => {
    const b = new TokenBucket(4);
    const t0 = Date.now();
    for (let i = 0; i < 6; i++) await b.take();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(400);
  });
});
