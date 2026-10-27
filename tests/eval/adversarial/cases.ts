// The case list for the adversarial eval: attack letters (with injection spans in the truth file), the legitimate near-duplicate, and
// the clean letters (every inbox letter except S10, plus optionally the clean/noise/scan eval variants).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { ResolvedInput } from "../../../app/agents/letter-reader/docs.port";
import type { Truth } from "../nemotron/score";

export type Group = "attack" | "legit" | "clean";
export type InjSpanTruth = { id: string; channel: string; visibility: string; text: string };
export type CaseTruth = Truth & { injection_spans?: InjSpanTruth[]; account_number?: string; adversarial?: { attacker_account?: string; on_file_account?: string; printed_account?: string; remit_address_block?: string; conflicting_address?: string; pressure_kinds?: string[]; must_not_flag?: string[]; hazard?: string } };
export type Case = { id: string; group: Group; label: string; pdf: string; png: string; eml: string | null; truth: CaseTruth | null };

const ROOT = process.cwd();
const json = <T>(f: string): T => JSON.parse(readFileSync(f, "utf8")) as T;

export function loadCases(o: { evalLetters: boolean }): Case[] {
  const out: Case[] = [];
  const adv = path.join(ROOT, "data/eval/adversarial");
  for (const id of readdirSync(adv).filter((d) => d.startsWith("adv-")).sort()) {
    const dir = path.join(adv, id);
    out.push({ id, group: id === "adv-06-near-duplicate-legit" ? "legit" : "attack", label: id, pdf: path.join(dir, "letter.pdf"), png: path.join(dir, "letter.png"), eml: null, truth: json<CaseTruth>(path.join(dir, "truth.json")) });
  }
  const s10 = path.join(ROOT, "input_examples/10-sable-harbor-injection");
  out.push({ id: "s10-sable-harbor", group: "attack", label: "S10 (BCR-2026-0407)", pdf: path.join(s10, "letter.pdf"), png: path.join(s10, "letter.png"), eml: path.join(s10, "headers.eml"), truth: json<CaseTruth>(path.join(ROOT, "data/truth/10-sable-harbor-injection.truth.json")) });
  const manifest = json<{ items: Array<{ request_id: string; scenario?: string | null; dir?: string; example_id?: string }> }>(path.join(ROOT, "data/inbox/manifest.json"));
  for (const it of manifest.items) {
    if (it.scenario === "S10") continue;
    const dir = path.join(ROOT, it.dir ?? path.join("data/inbox/items", it.request_id));
    const eml = path.join(dir, "headers.eml");
    out.push({ id: `inbox-${it.request_id}`, group: "clean", label: `${it.request_id}${it.scenario ? ` (${it.scenario})` : ""}`, pdf: path.join(dir, "letter.pdf"), png: path.join(dir, "letter.png"), eml: existsSync(eml) ? eml : null, truth: null });
  }
  if (o.evalLetters) {
    const base = path.join(ROOT, "tests/eval/nemotron/letters");
    for (const id of readdirSync(base).filter((d) => !d.startsWith(".")).sort()) {
      const dir = path.join(base, id);
      const truth = json<CaseTruth & { fields: Array<{ field: string; text: string; kind?: string }> }>(path.join(dir, "truth.json"));
      // The instruction variants carry one visible line addressed to an automated reviewer (marked in the truth file's `fields`).
      const inj = truth.fields.filter((f) => f.kind === "embedded_instruction").map((f, i) => ({ id: `${id}-V${i + 1}`, channel: "pdf_text_layer", visibility: "visible", text: f.text }));
      out.push({ id: `eval-${id}`, group: inj.length ? "attack" : "clean", label: id, pdf: path.join(dir, "letter.pdf"), png: path.join(dir, "letter.png"), eml: null, truth: inj.length ? { ...truth, injection_spans: inj } : truth });
    }
  }
  return out;
}

const sha = (f: string): string => createHash("sha256").update(readFileSync(f)).digest("hex");
export function resolved(c: Case): ResolvedInput {
  return {
    docs: [{ doc_index: 1, kind: "letter", filename: path.basename(c.pdf), media_type: "application/pdf", sha256: sha(c.pdf), page_count: 1, pdf_path: c.pdf, png_paths: [c.png] }],
    eml_headers: c.eml ? readFileSync(c.eml, "utf8") : null, example_id: c.id, channel: c.eml ? "email" : "mail", doc_pages: [],
  };
}
