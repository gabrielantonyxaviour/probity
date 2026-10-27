// Evidence lineage (api-depth): QueryDetail.lineage from the SQL, the activation map and the registration record.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryDetail } from "../../../app/schemas/api-routes";
import { lineageFor, readRegistration, tablesIn, USL_PREFIX } from "../../../app/api/lineage";
import { makeHarness, post, type Harness } from "../../helpers/api-harness";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

const direct = { registry_path: "direct", erp_table_ref: "payee_erp" } as const;
const T = (t: string) => `${USL_PREFIX}${t}`;

describe("lineageFor", () => {
  it("places an ERP table on its Postgres object and names the tables a projection reads", () => {
    const l = lineageFor(`SELECT vendor_id FROM ${T("vendor")} WHERE status = 'active'`, [], direct)!;
    expect(l.sources).toEqual([
      {
        usl_table: T("vendor"),
        source_system: "erp_postgres",
        source_object: "payee_erp.public.vendor (with vendor_domain)",
        via_view: null,
      },
    ]);
    const pri = lineageFor(`SELECT * FROM ${T("payment_run_item")}`, [], direct)!.sources[0]!;
    expect(pri.source_object).toMatch(/^payee_erp\.public\.payment_run_item \(with payment_run, vendor,/);
  });

  it("registry tables name the flatten view and, when the rows carry it, the exact registered objects", () => {
    const rows = [
      { source_table: "usaspending.usa_r_jcbmlgpe6z71" },
      { source_table: "usaspending.usa_r_jcbmlgpe6z71" },
      { source_table: "usaspending.usa_r_mbphtu7y9s65" },
    ];
    const [s] = lineageFor(`SELECT * FROM ${T("registry_entity")} WHERE uei = 'X'`, rows, direct)!.sources;
    expect(s).toMatchObject({
      source_system: "usaspending",
      via_view: "probity.usa_entity_v",
      source_object: "usaspending.usa_r_jcbmlgpe6z71, usaspending.usa_r_mbphtu7y9s65",
    });
    const sec = lineageFor(`SELECT * FROM ${T("sec_registrant")}`, [], direct)!.sources[0]!;
    expect(sec).toMatchObject({
      source_system: "sec_edgar",
      source_object: "sec_edgar.sec_s_*",
      via_view: "probity.sec_registrant_v",
    });
    const gw = lineageFor(`SELECT * FROM ${T("registry_child")}`, [], { ...direct, registry_path: "gateway" })!
      .sources[0]!;
    expect(gw.source_object).toBe("source_gateway.usa_*");
  });

  it("a federated join lists every table once, in order; the literal text of a string is not a table", () => {
    const sql = `SELECT 1 FROM ${T("sec_registrant")} s JOIN ${T("vendor")} v ON v.registrant_cik = s.cik JOIN ${T("registry_entity")} e ON e.uei = v.uei WHERE v.legal_name = 'x FROM ${T("ap_invoice")}' AND v.vendor_id IN (SELECT vendor_id FROM ${T("vendor")})`;
    expect(tablesIn(sql)).toEqual([T("sec_registrant"), T("vendor"), T("registry_entity")]);
    expect(lineageFor(sql, [], direct)!.sources.map((x) => x.source_system)).toEqual([
      "sec_edgar",
      "erp_postgres",
      "usaspending",
    ]);
  });

  it("run-time REST session tables are registered by the run, not part of vendor360", () => {
    const l = lineageFor(
      `SELECT * FROM session.pp_usa_r_khk6e1jw9c15 a JOIN session.pp_sec_s_0001443646 b ON 1=1`,
      [],
      direct,
    )!;
    expect(l.sources[0]).toMatchObject({ usl_table: "session.pp_usa_r_khk6e1jw9c15", source_system: "usaspending" });
    expect(l.sources[0]!.source_object).toContain("api.usaspending.gov/api/v2/recipient/{recipient_id}");
    expect(l.sources[1]).toMatchObject({
      source_system: "sec_edgar",
      source_object: expect.stringContaining("data.sec.gov/submissions/CIK0001443646.json"),
    });
  });

  it("DQ runs name their target; SQL with no placeable table gives no lineage; unknown vendor360 tables are skipped", () => {
    expect(lineageFor(`RUN DQ account_single_vendor TABLE ${T("payment_run_item")}`, [], direct)!.sources).toHaveLength(
      1,
    );
    expect(lineageFor("SELECT 1", [], direct)).toBeUndefined();
    expect(lineageFor(`SELECT * FROM ${T("not_a_table")}`, [], direct)).toBeUndefined();
  });

  it("an unreadable or missing registration file falls back to the documented defaults", () => {
    expect(readRegistration("/nonexistent/registration.json")).toEqual(direct);
  });
});

let h: Harness;
afterEach(async () => {
  await h?.close();
});

describe("GET /runs/:id/queries/:qid", () => {
  it("adds lineage, validates against QueryDetail, and leaves queries without a placeable table unchanged", async () => {
    h = await makeHarness();
    await post(h, "/run", {
      input: { vendor: { legal_name: "Parsons Corporation" } },
      options: {},
      run_id: "r-lineage-0001",
    });
    const base = {
      template_id: "T04b",
      key: "query",
      params: {},
      sql_hash: "ab",
      row_count: 1,
      rows: [{ vendor_id: "V-10027" }],
      row_hash: "cd",
      mode: "live",
      fetched_at: "2026-10-27T16:11:32.583Z",
      latency_ms: 12,
    };
    const q1 = "11111111-2222-3333-4444-555555555551";
    const q2 = "11111111-2222-3333-4444-555555555552";
    mkdirSync(h.dirs.logs, { recursive: true });
    writeFileSync(
      path.join(h.dirs.logs, "queries-r-lineage-0001.jsonl"),
      [
        { ...base, query_id: q1, sql: `SELECT vendor_id FROM ${T("vendor")} LIMIT 20` },
        { ...base, query_id: q2, sql: "SELECT 1" },
      ]
        .map((x) => JSON.stringify(x))
        .join("\n") + "\n",
    );
    const a = JSON.parse((await h.app.inject({ method: "GET", url: `/runs/r-lineage-0001/queries/${q1}` })).body);
    expect(QueryDetail.safeParse(a).success).toBe(true);
    expect(a.lineage.sources[0]).toMatchObject({ usl_table: T("vendor"), source_system: "erp_postgres" });
    const b = JSON.parse((await h.app.inject({ method: "GET", url: `/runs/r-lineage-0001/queries/${q2}` })).body);
    expect("lineage" in b).toBe(false);
    expect(
      (await h.app.inject({ method: "GET", url: `/runs/r-lineage-0001/queries/11111111-2222-3333-4444-555555555559` }))
        .statusCode,
    ).toBe(404);
  });
});
