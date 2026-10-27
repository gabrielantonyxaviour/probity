// G2 discovery floor for judge-typed names (J5, 04 §3.6 G2, 02 §2.7): name search -> exact-name candidates -> register the top
// candidate (T12) -> its parent defines the family -> ticker CIK (T16, soft) -> register the EDGAR table (T14) and read its phone.
// The search is discovery only (never evidence); every fact below comes from Zetaris session tables with a query_id.
import { nameSimilarity } from "../../engines/world-model/index";
import type { GapRequest } from "../../schemas/messages";
import type { TemplateId, TemplateParams } from "../../schemas/templates";
import { REGISTRANT_RULES, RECIPIENT_RULES } from "../../components/template-kit.port";
import type { Registrar } from "../../components/registrar";
import type { Step } from "../../components/evidence-runner";
import { emit, type RunContext } from "../../orchestration/ctx";
import { addLimitation, addPartial } from "../../orchestration/state";
import { nameNorm, toE164 } from "../../policy/normalise";
import { queriesOf, str } from "../../policy/rows";
import { findRecipient } from "./tools";

type Hit = { uei: string; name: string; recipient_level: "P" | "C" | "R"; amount: number };

const readStep = (template_id: "T12" | "T14", table: string, compiled: NonNullable<Step["read"]>["compiled"], rules: NonNullable<Step["read"]>["rules"], why: string): Step => ({
  params: { template_id, table } as unknown as TemplateParams, purpose_field: template_id === "T12" ? "parent" : "registrant", candidate_vendor_id: null,
  issued_by: "registry_scout", planned_by: "coverage_floor", why, read: { compiled, rules, template_id: template_id as TemplateId },
});

/** Group exact-name, awarded rows by UEI, preferring the child record. */
export function exactCandidates(hits: Hit[], name: string): { exact: Hit[]; zero: Hit[]; soft: Hit | null } {
  const n = nameNorm(name);
  const byUei = /^[A-Z0-9]{12}$/.test(name) && hits.some((h) => h.uei === name);
  const exactRows = byUei ? hits.filter((h) => h.uei === name) : hits.filter((h) => nameNorm(h.name) === n);
  const awarded = new Map<string, Hit>();
  for (const h of exactRows.filter((x) => (x.amount ?? 0) > 0)) {
    const prior = awarded.get(h.uei);
    if (!prior || (h.recipient_level === "C" && prior.recipient_level !== "C")) awarded.set(h.uei, h);
  }
  const exact = [...awarded.values()].sort((a, b) => b.amount - a.amount);
  const zero = exactRows.filter((x) => !(x.amount > 0));
  const soft = exact.length ? null : ([...hits].filter((h) => h.amount > 0 && nameSimilarity(nameNorm(h.name), n) >= 0.82).sort((a, b) => b.amount - a.amount)[0] ?? null);
  return { exact, zero, soft };
}

async function registerAndRead(ctx: RunContext, registrar: Registrar, hit: Hit): Promise<{ parent_uei: string | null; parent_name: string | null } | null> {
  const kit = ctx.deps.templates;
  const reg = await registrar.register({ template_id: "T12", uei: hit.uei, level: hit.recipient_level, why: `J5: exact-name registry record for the claimed name (${hit.name})` });
  if (!reg.ok || !kit.readRecipient) return null;
  const r = await ctx.C2.run(readStep("T12", reg.table, kit.readRecipient(reg.table), RECIPIENT_RULES, "read the registered recipient detail"));
  if (!r.ok) return null;
  const row = r.record.rows[0];
  return { parent_uei: str(row?.parent_uei), parent_name: str(row?.parent_name) };
}

async function readRegistrant(ctx: RunContext, registrar: Registrar, cik10: string, why: string): Promise<void> {
  const { s } = ctx;
  const kit = ctx.deps.templates;
  ctx.seen.ciks.add(cik10);
  const reg = await registrar.register({ template_id: "T14", cik10, why });
  if (!reg.ok || !kit.readRegistrant) return;
  const r = await ctx.C2.run(readStep("T14", reg.table, kit.readRegistrant(reg.table), REGISTRANT_RULES, "read the registered EDGAR submissions"));
  const row = r.ok ? r.record.rows[0] : undefined;
  if (!r.ok || !row) return;
  s.extras.j5_registrant = { cik: cik10, name: str(row.name), phone_e164: toE164(str(row.phone)), fetched_at: r.record.fetched_at };
}

export async function runDiscovery(ctx: RunContext, gap: GapRequest, registrar: Registrar): Promise<void> {
  const { s } = ctx;
  if (gap.params.cik10) return readRegistrant(ctx, registrar, gap.params.cik10.padStart(10, "0"), "J5: CIK given by the caller");
  const name = (gap.params.name ?? "").trim();
  if (!name) return;
  const found = await findRecipient(ctx, name, 8);
  if (!found.ok) return;
  const hits: Hit[] = found.rows.flatMap((r) => (typeof r.uei === "string" ? [{ uei: r.uei, name: String(r.name), recipient_level: (r.recipient_level as Hit["recipient_level"]) ?? "R", amount: Number(r.amount ?? 0) }] : []));
  const { exact, zero, soft } = exactCandidates(hits, name);
  for (const z of zero) emit(ctx, { agent_name: "registry_scout", action: "run_template", status: "success", template_id: "T15", note: "zero_award_record_ignored", source_mode: "discovery_only", input_summary: `T15 ${z.uei}`, output_summary: `other registry record with this name (no awards): ${z.uei}` });
  const top = exact[0] ?? soft;
  if (!top) {
    addPartial(s, "no_registry_hit");
    addLimitation(s, `No USAspending recipient matches "${name}".`);
    return;
  }
  if (!exact[0]) s.extras.j5_soft_candidate = true;
  const fam = await registerAndRead(ctx, registrar, top);
  const label = top.name;
  s.extras.j5_families.push({ key: fam?.parent_uei ?? top.uei, label, uei: top.uei });
  const parentName = fam?.parent_name ?? null;
  const second = exact[1];
  if (second && second.uei !== top.uei) {
    const inFamily = fam?.parent_uei ? queriesOf(s, "T10", (q) => q.params.parent_uei === fam.parent_uei).some((q) => q.rows.some((r) => str(r.child_uei) === second.uei)) : false;
    if (!inFamily) {
      const f2 = await registerAndRead(ctx, registrar, second);
      const key2 = f2?.parent_uei ?? second.uei;
      if (!s.extras.j5_families.some((f) => f.key === key2)) s.extras.j5_families.push({ key: key2, label: second.name, uei: second.uei });
    }
  }
  // F29: ticker -> CIK (soft; the Examiner approves or rejects it), then the EDGAR table for the phone
  const names = [...new Set([nameNorm(name), nameNorm(parentName ?? "")].filter((n) => /^[A-Z0-9& ]{2,120}$/.test(n)))];
  let cik: string | null = null;
  for (const n of names) {
    const r = await ctx.C2.run({ params: { template_id: "T16", name_norm: n }, purpose_field: "registrant", candidate_vendor_id: null, issued_by: "registry_scout", planned_by: "coverage_floor", why: "J5: ticker name -> CIK" });
    if (r.ok && r.record.rows[0]) {
      cik = str(r.record.rows[0].cik);
      break;
    }
  }
  if (!cik) {
    addLimitation(s, "No SEC registrant was found for this name; no independent number is available.");
    return;
  }
  await readRegistrant(ctx, registrar, cik.padStart(10, "0"), "J5: registrant found by ticker name");
}
