// recordOutcome (05 2.9): fail-safe flagging of a confirmed impersonation so it never poisons a real vendor's
// identifiers. Flags the requested bank account; request phones not held by any vendor or registrant; From and
// Reply-To domains only when no vendor holds them. Skipped values come back with a reason.
import { externalId } from "./world-model/index.ts";
import { AppError } from "../schemas/errors";
import type { OutcomeWrite, Prov } from "../schemas/engines";
import type { Writer } from "./wm-writer";
import { allRelationships } from "./wm-read";

/** Additive over the frozen OutcomeWrite: values the route knows are protected (T04 hits, edgar/pre-window numbers). */
export type OutcomeWriteX = OutcomeWrite & { protected?: { phones_e164: string[]; domains: string[] } };
export type OutcomeResult = {
  flagged: Array<{ entity_id: string; kind: "bank_account" | "phone" | "domain" }>;
  skipped: Array<{ value: string; reason: string }>;
};

export async function recordOutcome(w: Writer, o: OutcomeWriteX): Promise<OutcomeResult> {
  const reqId = externalId("request", "req", o.request_id);
  if (!w.world.view("graph").entity(reqId)) {
    throw new AppError("not_found", `No request ${o.request_id} in the World Model.`, { httpStatus: 404 });
  }
  const rels = allRelationships(w);
  const held = (to: string, type: string, ownerTypes: string[]) =>
    rels.some((r) => r.to === to && r.type === type && ownerTypes.some((t) => r.from.startsWith(`${t}:`)));
  const targets = (type: string) => rels.filter((r) => r.from === reqId && r.type === type).map((r) => r.to);

  const flagged: OutcomeResult["flagged"] = [];
  const skipped: OutcomeResult["skipped"] = [];
  const todo: Array<{ id: string; kind: "bank_account" | "phone" | "domain" }> = [];
  for (const id of targets("requests_pay_to")) todo.push({ id, kind: "bank_account" });

  const protPhones = new Set(o.protected?.phones_e164 ?? []);
  for (const id of targets("lists_phone")) {
    const e164 = id.replace(/^phone:e164:/, "");
    if (protPhones.has(e164))
      skipped.push({
        value: e164,
        reason: "independent number for the vendor (registrant or earlier vendor-master number)",
      });
    else if (held(id, "reachable_at", ["vendor_record", "sec_registrant"]))
      skipped.push({ value: e164, reason: "held by a vendor record or registrant" });
    else todo.push({ id, kind: "phone" });
  }
  const protDomains = new Set(o.protected?.domains ?? []);
  for (const id of targets("sent_from")) {
    const d = id.replace(/^domain:domain:/, "");
    if (protDomains.has(d)) skipped.push({ value: d, reason: "on file for a vendor (T04)" });
    else if (held(id, "uses_domain", ["vendor_record"])) skipped.push({ value: d, reason: "on file for a vendor" });
    else if (!todo.some((t) => t.id === id)) todo.push({ id, kind: "domain" });
  }

  const prov: Prov = { kind: "manual", by: `analyst:${o.by}`, at: o.at, runId: o.run_id };
  for (const t of todo) {
    await w.fact(
      t.id,
      "fraud_flag",
      { status: o.outcome, request_id: o.request_id, session_id: o.session_id, by: o.by },
      prov,
      1,
    );
    flagged.push({ entity_id: t.id, kind: t.kind });
  }
  return { flagged, skipped };
}
