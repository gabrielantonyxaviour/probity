// Runs only when the live ERP database is up (docker compose --profile live up -d payee-erp-db) and .env.db.local exists.
// 02 section 10 checks 2-4: grants, the DQ1 oracle list and the account_vendor_count behaviour across request statuses.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../../../scripts/gen/env-files";

loadEnv([".env.db.local"]);
const host = "127.0.0.1:55432";
const url = (user: string, pw?: string): string => `postgres://${user}:${pw}@${host}/payee_erp`;
const S1_HASH = "175dbd7da76270843def1d6ba77e9bf08cc9f0bcac9a452456da437e4893abe6";

async function reachable(): Promise<boolean> {
  const pw = process.env.ERP_ZETARIS_READER_PASSWORD;
  if (!pw) return false;
  const c = new pg.Client({ connectionString: url("zetaris_reader", pw), connectionTimeoutMillis: 1500 });
  try { await c.connect(); await c.end(); return true; } catch { return false; }
}
const live = await reachable();

describe.skipIf(!live)("live ERP database", () => {
  let reader: pg.Client;
  let app: pg.Client;
  beforeAll(async () => {
    reader = new pg.Client({ connectionString: url("zetaris_reader", process.env.ERP_ZETARIS_READER_PASSWORD) });
    app = new pg.Client({ connectionString: url("payee_app", process.env.PAYEE_APP_PASSWORD) });
    await reader.connect();
    await app.connect();
  });
  afterAll(async () => { await reader.end(); await app.end(); });

  it("zetaris_reader reads 40 vendors and cannot write", async () => {
    expect((await reader.query("SELECT count(*)::int AS n FROM vendor")).rows[0].n).toBe(40);
    await expect(reader.query("INSERT INTO payment_run VALUES ('PR-2099-01-01','2099-01-01','x','draft','SYNTHETIC')")).rejects.toThrow(/permission denied/);
  });

  it("payee_app may update status only", async () => {
    await expect(app.query("UPDATE bank_change_request SET claimed_name='x'")).rejects.toThrow(/permission denied/);
    await app.query("BEGIN");
    const res = await app.query("UPDATE bank_change_request SET status='held' WHERE request_id='BCR-2026-0117'");
    await app.query("ROLLBACK");
    expect(res.rowCount).toBe(1);
  });

  it("check 3: the DQ1 oracle lists exactly the two sweep items", async () => {
    const r = await reader.query(`SELECT item_id FROM payment_run_item_enriched WHERE payment_run_id='PR-2026-10-30'
      AND NOT (bank_changed_at IS NULL OR scheduled_date - bank_changed_at::date >= 30 OR (callback_confirmed_at IS NOT NULL AND callback_phone_source IN ('edgar_registrant','vendor_master_pre_window')))
      ORDER BY item_id`);
    expect(r.rows.map((x) => x.item_id)).toEqual(["PRI-1030-0009", "PRI-1030-0010"]);
    // Seed-state assertion: once a live check has written a runtime request (S1 holds the reused account), the item is
    // legitimately multi-owner, so the zero only holds on a freshly seeded database.
    const runtime = (await reader.query("SELECT count(*)::int AS n FROM bank_change_request WHERE data_origin='RUNTIME_INPUT'")).rows[0].n;
    if (runtime === 0) expect((await reader.query("SELECT count(*)::int AS n FROM payment_run_item_enriched WHERE payment_run_id='PR-2026-10-30' AND account_vendor_count > 1")).rows[0].n).toBe(0);
  });

  it("check 4: a request holding the S1 hash makes the V-10812 item multi-owner in every status", async () => {
    const owner = new pg.Client({ connectionString: `postgres://postgres:${process.env.POSTGRES_PASSWORD}@${host}/payee_erp` });
    await owner.connect();
    try {
      await owner.query("BEGIN");
      await owner.query(`INSERT INTO bank_change_request (request_id, vendor_id, candidate_vendor_ids, new_routing, new_account_last4, new_account_hash, received_at, channel, extraction_path, status)
        VALUES ('BCR-2026-0412','V-10027','V-10027','110000000','0141','${S1_HASH}','2026-10-22T15:12:00Z','email','text+deep','pending')
        ON CONFLICT (request_id) DO NOTHING`); // a live S1 check may already have written this request
      for (const status of ["pending", "held", "rejected"]) {
        await owner.query("UPDATE bank_change_request SET status=$1 WHERE request_id='BCR-2026-0412'", [status]);
        const n = (await owner.query("SELECT account_vendor_count AS n FROM payment_run_item_enriched WHERE item_id='PRI-1030-0009'")).rows[0].n;
        expect(Number(n)).toBe(2);
      }
    } finally {
      await owner.query("ROLLBACK");
      await owner.end();
    }
  });

  it("registry_stage exists with provenance columns and is readable", async () => {
    const c = new pg.Client({ connectionString: `postgres://zetaris_reader:${process.env.ERP_ZETARIS_READER_PASSWORD}@${host}/registry_stage` });
    await c.connect();
    const cols = (await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='usa_entity'")).rows.map((r) => r.column_name);
    expect(cols).toEqual(expect.arrayContaining(["fetched_at", "source_url", "data_origin"]));
    await c.end();
  });
});
