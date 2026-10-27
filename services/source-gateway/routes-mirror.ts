// /mirror/*: the offline captures served through the same shapes as the live routes. Every response is labelled with X-Captured-At.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { GatewayConfig } from "./config";
import { GatewayError } from "./errors";
import { flatRecipient, wrapChildren } from "./flat";
import { parse, Params, sendJson } from "./reply";
import { tickersList } from "./trim";

export function registerMirrorRoutes(app: FastifyInstance, cfg: GatewayConfig): void {
  const base = path.join(cfg.SAMPLE_DATA_DIR, "registry");
  const capturedAt = (): string => {
    const f = path.join(cfg.SAMPLE_DATA_DIR, "captures.json");
    return existsSync(f) ? String((JSON.parse(readFileSync(f, "utf8")) as { captured_at?: string }).captured_at ?? "unknown") : "unknown";
  };
  const read = (rel: string): unknown => {
    const f = path.join(base, rel);
    if (!existsSync(f)) throw new GatewayError("mirror_miss");
    return JSON.parse(readFileSync(f, "utf8")) as unknown;
  };
  const meta = (): { mode: "mirror"; fetchedAt: string; upstreamStatus: string; capturedAt: string } => {
    const at = capturedAt();
    return { mode: "mirror", fetchedAt: at, upstreamStatus: "mirror", capturedAt: at };
  };
  app.get("/mirror/usaspending/recipient/:recipient_id", async (req, reply) => {
    const { recipient_id } = parse(Params.recipient, req.params);
    const { shape } = parse(Params.shape, req.query);
    const body = read(`usaspending/recipient/${recipient_id}.json`) as Record<string, unknown>;
    const m = meta();
    return sendJson(reply, shape === "flat" ? flatRecipient(body, m.fetchedAt) : body, m);
  });
  app.get("/mirror/usaspending/children/:parent_uei", async (req, reply) => {
    const { parent_uei } = parse(Params.parent, req.params);
    const { shape } = parse(Params.shape, req.query);
    return sendJson(reply, wrapChildren(read(`usaspending/children/${parent_uei}.json`), parent_uei, shape), meta());
  });
  app.get("/mirror/edgar/submissions/:cik10", async (req, reply) => {
    const { cik10 } = parse(Params.cik, req.params);
    return sendJson(reply, read(`edgar/submissions/CIK${cik10}.json`), meta());
  });
  app.get("/mirror/edgar/tickers", async (_req, reply) => sendJson(reply, tickersList(read("edgar/company_tickers.json") as Record<string, unknown>), meta()));
}
