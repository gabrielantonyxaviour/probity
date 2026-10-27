// /erp/:table against the live ERP database (skipped when it is not up).
import path from "node:path";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../../../scripts/gen/env-files";
import { loadConfig } from "../../../services/source-gateway/config";
import { buildApp } from "../../../services/source-gateway/server";

loadEnv([".env.db.local"]);
const url = process.env.ERP_READER_DATABASE_URL;
async function up(): Promise<boolean> {
  if (!url) return false;
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1500 });
  try { await c.connect(); await c.end(); return true; } catch { return false; }
}
const live = await up();

describe.skipIf(!live)("gateway /erp", () => {
  const app = buildApp(loadConfig({ LOG_LEVEL: "silent", ERP_READER_DATABASE_URL: url, SAMPLE_DATA_DIR: path.resolve("data/sample") } as NodeJS.ProcessEnv));
  it("serves live rows with ISO times and numbers", async () => {
    const r = await app.inject("/erp/payment_run_item");
    const body = JSON.parse(r.body);
    expect(r.headers["x-gateway-mode"]).toBe("erp");
    expect(body.data.length).toBeGreaterThan(100);
    expect(typeof body.data[0].amount_usd).toBe("number");
    const v = JSON.parse((await app.inject("/erp/vendor_contact")).body).data.find((c: { valid_to: string | null }) => c.valid_to === "2026-10-19T16:20:00Z");
    expect(v).toBeTruthy();
  });
  it("rejects tables outside the ten", async () => {
    expect((await app.inject("/erp/bank_change_document")).statusCode).toBe(400);
    expect((await app.inject("/erp/pg_shadow")).statusCode).toBe(400);
  });
});
