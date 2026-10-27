// UI contract layer. The frozen zod schemas live in app/schemas (FOUNDATION.md); the UI parses every response with them
// through the @schemas alias (the Docker build maps zod to ui/node_modules). Deviation from the brief: no duplicate parsers,
// so the UI can never drift from the frozen contract. Trace lines use a loose variant so one unknown field cannot hide an event.
import { z } from "zod";
import { TraceEventSchema, type TraceEvent } from "@schemas/trace";
import { log } from "../log";

export * from "@schemas/api";
export * from "@schemas/api-routes";
export * from "@schemas/decision";
export * from "@schemas/events";
export * from "@schemas/graph";
export * from "@schemas/messages";
export * from "@schemas/errors";
export * from "@schemas/patterns";
export { TraceEventSchema, type TraceEvent } from "@schemas/trace";

export const TraceEventUI = TraceEventSchema.loose();
export type TraceEventUI = z.infer<typeof TraceEventUI>;

/** Compile-time check: the loose parser still yields the frozen TraceEvent shape. */
const _traceCheck: z.ZodType<TraceEvent> = TraceEventUI;
void _traceCheck;

/** Parse a JSONL body; unparseable lines are logged and skipped. */
export function parseTraceLines(text: string): TraceEvent[] {
  const out: TraceEvent[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const r = TraceEventUI.safeParse(JSON.parse(t));
      if (r.success) out.push(r.data);
      else log.warn({ issues: r.error.issues.slice(0, 3) }, "trace line failed the contract");
    } catch {
      log.warn("trace line is not JSON");
    }
  }
  return out;
}
