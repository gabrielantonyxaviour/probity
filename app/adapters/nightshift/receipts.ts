// logs/receipts-<run_id>.jsonl (REV-64): one masked ReceiptLine per model call. Nightshift's own receipt lookup is not
// available on this edition (501), so the app persists them itself. `receipt_envelope` is null: receipts are never claimed signed.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ReceiptLine } from "../../schemas/models";
import type { Lane } from "../../schemas/trace";
import { logger } from "../../trace/logger";
import type { Masker } from "../../trace/mask";
import type { ParsedResponse } from "./response";

export type CallMeta = { call_id: string; run_id: string; agent: string; lane: Lane; requested_model: string };

/**
 * Nightshift sends `hmem: null` (and similar) on some calls; the pinned shape has them optional objects, so a null is dropped.
 * A missing hmem record means nothing was injected, so the 08 R18 jq path `.receipt.hmem.injected` resolves to 0, marked as derived.
 */
function dropNulls(r: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!r) return r;
  const out = { ...r };
  for (const k of ["winning_route", "egress", "hmem"]) if (out[k] === null) delete out[k];
  if (!out.hmem) out.hmem = { injected: 0, derived: "no hmem record in the receipt" };
  return out;
}

export function buildReceiptLine(meta: CallMeta, p: ParsedResponse): ReceiptLine {
  return {
    call_id: meta.call_id,
    run_id: meta.run_id,
    agent: meta.agent,
    lane: meta.lane,
    requested_model: meta.requested_model,
    envelope: {
      requested_model: meta.requested_model,
      provider_model: p.provider_model,
      routed_model: p.routed_model,
      app: p.app,
      structured_output: p.structured_output,
    },
    receipt: dropNulls(p.receipt) as ReceiptLine["receipt"],
    cross_check: p.cross_check as ReceiptLine["cross_check"],
  };
}

export class ReceiptStore {
  constructor(
    private readonly dir: string,
    private readonly masker: Masker,
  ) {
    mkdirSync(dir, { recursive: true });
  }
  file = (runId: string): string => path.join(this.dir, `receipts-${runId}.jsonl`);

  /** Validate, mask, append. A failure is logged and never breaks the model call. Returns the line as written. */
  append(line: ReceiptLine): ReceiptLine | null {
    const parsed = ReceiptLine.safeParse(line);
    if (!parsed.success) {
      logger.error({ call_id: line.call_id }, "receipt_line_invalid");
      return null;
    }
    const masked = this.masker.deep(parsed.data);
    try {
      appendFileSync(this.file(line.run_id), `${JSON.stringify(masked)}\n`);
    } catch (err) {
      logger.error({ call_id: line.call_id, err }, "receipt_write_failed");
    }
    return masked;
  }
  read(runId: string): ReceiptLine[] {
    const f = this.file(runId);
    if (!existsSync(f)) return [];
    return readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => ReceiptLine.parse(JSON.parse(l)));
  }
}
