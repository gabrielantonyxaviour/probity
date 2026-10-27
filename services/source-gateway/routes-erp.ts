// /erp/:table (only used when the JDBC route to Zetaris fails, K2): live reads as zetaris_reader, never cached, so intake inserts stay visible.
import type { FastifyInstance } from "fastify";
import pg from "pg";
import type { GatewayConfig } from "./config";
import { GatewayError } from "./errors";
import { parse, Params, sendJson } from "./reply";

export const ERP_REST_TABLES = [
  "vendor", "vendor_domain", "vendor_contact", "vendor_remit_history", "vendor_bank_account",
  "vendor_contact_log", "ap_invoice", "payment_run", "payment_run_item", "bank_change_request",
] as const;

const DATE = 1082, TIMESTAMPTZ = 1184, NUMERIC = 1700;
const types = {
  getTypeParser: (oid: number, format?: "text" | "binary") => {
    if (oid === DATE) return (v: string) => v; // YYYY-MM-DD as stored
    if (oid === TIMESTAMPTZ) return (v: string) => new Date(v).toISOString().replace(".000Z", "Z");
    if (oid === NUMERIC) return (v: string) => Number(v);
    return pg.types.getTypeParser(oid, format as "text");
  },
};

export function registerErpRoutes(app: FastifyInstance, cfg: GatewayConfig): void {
  let pool: pg.Pool | undefined;
  app.get("/erp/:table", async (req, reply) => {
    const { table } = parse(Params.table, req.params);
    if (!(ERP_REST_TABLES as readonly string[]).includes(table)) throw new GatewayError("invalid_input");
    if (!cfg.ERP_READER_DATABASE_URL) throw new GatewayError("erp_unavailable");
    pool ??= new pg.Pool({ connectionString: cfg.ERP_READER_DATABASE_URL, max: 3, connectionTimeoutMillis: 5000, types } as pg.PoolConfig);
    try {
      const res = await pool.query(`SELECT * FROM ${table} ORDER BY 1`);
      return sendJson(reply, { data: res.rows }, { mode: "erp", fetchedAt: new Date().toISOString(), upstreamStatus: "pg" });
    } catch {
      throw new GatewayError("erp_unavailable");
    }
  });
}
