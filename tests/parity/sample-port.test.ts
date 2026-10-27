// The sample doubles (zetaris-sample, registrar-sample, search-sample) as units: param-aware answers, fail-closed behaviour,
// session tables, the ERP overlay, corrupt data. The compiled queries come from the real template kit, so the SQL text is the live one.
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordErpWrites } from "../../app/adapters/sample/erp-recorder";
import { createSampleDiscovery } from "../../app/adapters/sample/search-sample";
import { createSampleRegistrar } from "../../app/adapters/sample/registrar-sample";
import { resetSampleSessions } from "../../app/adapters/sample/sample-session";
import { loadSampleData, resetSampleData } from "../../app/adapters/sample/sample-store";
import { createSampleZetaris } from "../../app/adapters/sample/zetaris-sample";
import { templateKitFrom } from "../../app/orchestration/adapters/template-kit";
import { templates } from "../../app/templates/index";
import type { TemplateParams } from "../../app/schemas/templates";
import { editClaims, ROOT, runExample, sandbox } from "./support";

const cfg = { dirs: { sample: path.join(ROOT, "data/sample") } } as never;
const kit = templateKitFrom(templates as never);
const compile = (p: Record<string, unknown>) => kit.compile(p as TemplateParams, { session_tables: [] });
const O = { timeoutMs: 5000 };

beforeEach(() => {
  resetSampleData();
  resetSampleSessions();
});

describe("zetaris-sample", () => {
  const z = createSampleZetaris(cfg);
  it("answers with mode sample, the real SQL, computed hashes and no fake query ids", async () => {
    const q = compile({ template_id: "T01", vendor_id: "V-10027" });
    const r = await z.run(q, O);
    expect(r.mode).toBe("sample");
    expect(r.row_count).toBe(1);
    expect(r.rows[0]).toMatchObject({ vendor_id: "V-10027", legal_name: "Booz Allen Hamilton Inc", uei: "JCBMLGPE6Z71", created_at: "2011-05-16 14:00:00" });
    expect(r.sql_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(r.row_hash).toMatch(/^[0-9a-f]{16}$/);
    expect((await z.run(q, O)).row_hash).toBe(r.row_hash);
    expect(Object.keys(r.rows[0]!)).toEqual(q.columns);
  });
  it("is param-aware: different parameters give different rows, never the unfiltered store", async () => {
    const a = await z.run(compile({ template_id: "T01", vendor_id: "V-10027" }), O);
    const b = await z.run(compile({ template_id: "T01", vendor_id: "V-10442" }), O);
    const none = await z.run(compile({ template_id: "T01", vendor_id: "V-99999" }), O);
    expect(a.rows[0]!.vendor_id).toBe("V-10027");
    expect(b.rows[0]!.vendor_id).toBe("V-10442");
    expect(none.row_count).toBe(0);
    const inv = await z.run(compile({ template_id: "T03", invoice_nos: ["INV-BAH-20931"] }), O);
    expect(inv.rows.map((r) => r.invoice_no)).toEqual(["INV-BAH-20931"]);
    const t09 = await z.run(compile({ template_id: "T09", vendor_id: "V-10027", payment_run_id: "PR-2026-10-30" }), O);
    expect(t09.row_count).toBe(15);
    expect(t09.rows[0]).toMatchObject({ run_item_count: "15", run_amount_usd: "2426479.48" });
  });
  it("USL reads see only the setup-registered records; a session table adds the sibling after registration", async () => {
    const params = { template_id: "T11", parent_uei: "MBPHTU7Y9S65", addr_key: "1 COMMVAULT WAY|TINTON FALLS|NJ" };
    expect((await z.run(compile(params), O)).row_count).toBe(0);
    const reg = createSampleRegistrar(cfg);
    const made = await reg.register({ kind: "recipient", uei: "KHK6E1JW9C15", level: "C", run_id: "r-test" }, O);
    expect(made).toMatchObject({ table: "session.pp_usa_r_khk6e1jw9c15", status: "created" });
    expect((await reg.register({ kind: "recipient", uei: "KHK6E1JW9C15", level: "C", run_id: "r-test" }, O)).status).toBe("exists");
    const hit = await z.run(compile(params), O);
    expect(hit.rows[0]).toMatchObject({ matched_uei: "KHK6E1JW9C15", via: "session.pp_usa_r_khk6e1jw9c15", vendor_id_on_file: null });
    const read = await z.run(kit.readRecipient!("session.pp_usa_r_khk6e1jw9c15"), O);
    expect(read.rows[0]).toMatchObject({ uei: "KHK6E1JW9C15", city_name: "TINTON FALLS", state_code: "NJ" });
  });
  it("a session table that was never registered is a typed error, not an empty success", async () => {
    await expect(z.run(kit.readRecipient!("session.pp_usa_r_khk6e1jw9c15"), O)).rejects.toMatchObject({ code: "zetaris_session_missing" });
  });
  it("fails closed for a template without a sample implementation", async () => {
    const q = { ...compile({ template_id: "T01", vendor_id: "V-10027" }), template_id: "T13" } as never;
    await expect(z.run(q, O)).rejects.toMatchObject({ code: "sample_data_missing" });
    const t21 = compile({ template_id: "T21", rule: "DQ3" });
    await expect(z.run(t21, O)).rejects.toMatchObject({ code: "sample_data_missing" });
  });
  it("RUN DQ and SHOW DQ INVALID RECORD follow the data: the seed alone has 3 shared-account items (the Northgate pair); this run's own request makes it 4", async () => {
    const run = await z.run(compile({ template_id: "T20", rule: "DQ2" }), O);
    expect(run.rows[0]).toMatchObject({ name: "account_single_vendor", table: "payment_run_item", type: "Custom Data Quality", total_record: "154", valid_record: "151", invalid_record: "3" });
    const hash = "175dbd7da76270843def1d6ba77e9bf08cc9f0bcac9a452456da437e4893abe6";
    const requests = [{ request_id: "BCR-2026-0999", vendor_id: "V-10027", new_account_hash: hash, status: "pending", received_at: "2026-10-27T12:00:00Z" }];
    const zz = createSampleZetaris(cfg, { erp: { snapshot: () => ({ requests, callbacks: [] }) } });
    const inv = await zz.run(compile({ template_id: "T21", rule: "DQ2", payment_run_id: "PR-2026-10-30" }), O);
    expect(inv.row_count).toBe(4);
    expect(inv.rows.map((r) => r.item_id)).toContain("PRI-1030-0009");
    expect(inv.rows.map((r) => r.item_id)).toContain("PRI-1030-0015");
  });
  it("sees the ERP rows a run wrote (overlay): the request in T07, a call-back in T08", async () => {
    const hash = "175dbd7da76270843def1d6ba77e9bf08cc9f0bcac9a452456da437e4893abe6";
    const requests: Record<string, unknown>[] = [];
    const callbacks: Record<string, unknown>[] = [];
    const zz = createSampleZetaris(cfg, { erp: { snapshot: () => ({ requests, callbacks }) } });
    expect((await zz.run(compile({ template_id: "T07", account_hash: hash }), O)).rows.map((r) => r.via)).toEqual(["vendor_bank_account"]);
    requests.push({ request_id: "BCR-2026-0999", vendor_id: "V-10027", new_account_hash: hash, new_routing: "110000000", status: "pending", received_at: "2026-10-27T12:00:00Z" });
    expect((await zz.run(compile({ template_id: "T07", account_hash: hash }), O)).rows.map((r) => r.via)).toEqual(["vendor_bank_account", "bank_change_request"]);
    callbacks.push({ log_id: "CL-40001", vendor_id: "V-10027", request_id: "BCR-2026-0999", purpose: "bank_change_callback", phone_e164: "+17039025000", phone_source: "edgar_registrant", outcome: "confirmed", called_at: "2026-10-27T13:00:00Z", called_by: "M. Okonkwo (fictional)" });
    const t08 = await zz.run(compile({ template_id: "T08", request_id: "BCR-2026-0999", vendor_id: "V-10027" }), O);
    expect(t08.rows.at(-1)).toMatchObject({ log_id: "CL-40001", called_at: "2026-10-27 13:00:00" });
  });
});

describe("recordErpWrites (live-mode overlay for the degrade fallback)", () => {
  it("forwards every call and remembers the rows it wrote, including status changes", async () => {
    const calls: string[] = [];
    const inner = {
      nextRequestId: async () => "BCR-2026-0501",
      insertRequest: async (r: { request_id: string }) => (calls.push(`insert ${r.request_id}`), { request_id: r.request_id, reused: false }),
      insertDocuments: async () => undefined,
      setRequestStatus: async (id: string, st: string) => void calls.push(`status ${id} ${st}`),
      insertCallback: async () => ({ log_id: "CL-40009" }),
      ping: async () => true,
    };
    const rec = recordErpWrites(inner as never);
    await rec.insertRequest({ request_id: "BCR-2026-0501", status: "pending" } as never);
    await rec.setRequestStatus("BCR-2026-0501", "held");
    await rec.insertCallback({ vendor_id: "V-10027", request_id: "BCR-2026-0501", outcome: "confirmed" } as never);
    expect(calls).toEqual(["insert BCR-2026-0501", "status BCR-2026-0501 held"]);
    expect(rec.snapshot().requests).toEqual([{ request_id: "BCR-2026-0501", status: "held" }]);
    expect(rec.snapshot().callbacks[0]).toMatchObject({ log_id: "CL-40009", outcome: "confirmed" });
  });
});

describe("registrar-sample and search-sample", () => {
  it("registrar: no capture means unavailable with reason no_capture", async () => {
    const r = await createSampleRegistrar(cfg).register({ kind: "recipient", uei: "ZZZZZZZZZZZ9", level: "C", run_id: "r" }, O);
    expect(r).toMatchObject({ status: "unavailable", reason: "no_capture" });
    expect((await createSampleRegistrar(cfg).register({ kind: "registrant", cik10: "0000892537", run_id: "r" }, O)).status).toBe("created");
  });
  it("discovery: a captured keyword returns its candidates; an unknown name returns none", async () => {
    const d = createSampleDiscovery(cfg);
    const hit = await d.searchRecipients("ManTech International Corporation", { timeoutMs: 1000, limit: 8 });
    expect(hit.mode).toBe("sample");
    expect(hit.candidates.map((c) => c.uei)).toContain("KZA5CX3J8KE8");
    expect((await d.searchRecipients("Nonexistent Holdings LLC", { timeoutMs: 1000, limit: 8 })).candidates).toEqual([]);
  });
});

describe("sample data integrity", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "probity-sample-bad-"));
    cpSync(path.join(ROOT, "data/sample"), dir, { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  it("a capture that no longer matches its checksum fails closed", async () => {
    writeFileSync(path.join(dir, "registry/edgar/submissions/CIK0001443646.json"), "{}");
    expect(() => loadSampleData(dir)).toThrowError(/Sample data is missing or corrupt/);
    await expect(createSampleZetaris({ dirs: { sample: dir } } as never).run(compile({ template_id: "T01", vendor_id: "V-10027" }), O)).rejects.toMatchObject({ code: "sample_data_missing" });
    expect(await createSampleZetaris({ dirs: { sample: dir } } as never).ping(O)).toMatchObject({ ok: false });
  });
  it("a missing ERP table fails closed", () => {
    rmSync(path.join(dir, "erp/vendor.json"));
    expect(() => loadSampleData(dir)).toThrowError(/missing or corrupt/);
  });
});

describe("S8 edited claims (a temp copy of data/sample)", () => {
  it("S3 with the account that V-10812 already holds: HOLD with R6, because the offline run reads the same seed", async () => {
    const sb = sandbox(true);
    try {
      editClaims(sb, "03-l3harris-bank-change", (j) => {
        j.account_number = "000999000141";
        (j.bank as Record<string, unknown>).account_last4 = "0141";
      });
      const o = await runExample(sb, "03-l3harris-bank-change");
      expect(o.decision.decision).toBe("HOLD");
      expect(o.redCodes).toContain("R6");
    } finally {
      sb.cleanup();
    }
  });
});
