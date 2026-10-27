// One-line JSON replies with the three provenance headers (X-Fetched-At, X-Gateway-Mode, X-Upstream-Status).
import type { FastifyReply } from "fastify";
import { z } from "zod";
import { GatewayError } from "./errors";

export const RECIPIENT_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}-[PCR]$/;
export const Params = {
  recipient: z.object({ recipient_id: z.string().regex(RECIPIENT_ID) }),
  parent: z.object({ parent_uei: z.string().regex(/^[A-Z0-9]{12}$/) }),
  cik: z.object({ cik10: z.string().regex(/^[0-9]{10}$/) }),
  table: z.object({ table: z.string().regex(/^[a-z_]{3,40}$/) }),
  shape: z.object({ shape: z.enum(["raw", "flat"]).default("raw") }),
};

export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new GatewayError("invalid_input");
  return r.data;
}

export type Mode = "passthrough" | "mirror" | "erp";
export function sendJson(reply: FastifyReply, body: unknown, meta: { mode: Mode; fetchedAt: string; upstreamStatus: number | string; capturedAt?: string }): FastifyReply {
  reply.header("x-fetched-at", meta.fetchedAt).header("x-gateway-mode", meta.mode).header("x-upstream-status", String(meta.upstreamStatus));
  if (meta.capturedAt) reply.header("x-captured-at", meta.capturedAt);
  return reply.type("application/json; charset=utf-8").send(JSON.stringify(body));
}
