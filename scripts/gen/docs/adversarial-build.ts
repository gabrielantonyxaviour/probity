// Writes data/eval/adversarial/**: six adversarial letters for the D1/D2 evaluation, each with a truth file (values, boxes, injection spans,
// and what a correct reader does). Fictional vendors only, so no watermark. Read by the proofs lane's eval runner through index.json.
import { sha256Hex } from "../contracts";
import type { Files, Rendered } from "./build";
import { adversarialSet, type Adversarial } from "./content/adversarial";
import { injectionSpans } from "./injection-truth";
import type { Letter } from "./model";
import type { SeedView } from "./seed-view";
import { buildTruth } from "./sidecar";

const DIR = "data/eval/adversarial";
const json = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;

export const README = `# Adversarial eval letters

Six letters for the Letter Reader evaluation (D1 two-reading reconciliation, D2 model per step). Written by \`npm run gen:docs\`; do not edit by hand.
Every vendor is a fictional seed row, so the letters carry no watermark; every bank value is a test value, every phone is 555-01xx and every
email domain ends \`.example\`. \`index.json\` lists them; each folder has \`letter.pdf\`, \`letter.png\` and \`truth.json\`
(\`values\`, \`fields\` with boxes, \`injection_spans\`, \`adversarial.expect\`).

| Letter | Hazard |
|---|---|
| adv-01-inject-visible-json | a visible 7 pt grey "processing metadata" JSON line that tries to set the decision |
| adv-02-inject-hidden-extraction | white 1 pt text that tells the reader to report a different account than the table shows |
| adv-03-inject-business-voice | an instruction to "automated tools" with no AI, system or ignore keywords |
| adv-04-digit-swap | the printed account differs from the on-file account by two swapped digits; the letter says nothing changed |
| adv-05-conflicting-address | a remit-to block and a different P.O. box in the body |
| adv-06-near-duplicate-legit | a legitimate re-issue of an earlier letter (\`original.pdf\`); nothing may be flagged |
`;

async function one(a: Adversarial, seed: SeedView, render: (l: Letter) => Promise<Rendered>, files: Files): Promise<unknown> {
  const r = await render(a.letter);
  const dir = `${DIR}/${a.id}`;
  files.set(`${dir}/letter.pdf`, r.pdf);
  files.set(`${dir}/letter.png`, r.png);
  const spans = injectionSpans(a.letter, r.laid, a.visibleGoals ? { visibleGoals: a.visibleGoals } : {});
  const truth = {
    ...buildTruth(a.letter, r.laid, a.id, null),
    adversarial: { hazard: a.hazard, vendor_id: a.vendorId, expect: a.expect, pressure_kinds: a.pressure_kinds, must_not_flag: a.must_not_flag, ...(a.extra ?? {}) },
    injection_spans: spans,
    account_number: a.letter.bank?.account ?? null,
  };
  files.set(`${dir}/truth.json`, json(truth));
  if (a.original) {
    const o = await render(a.original);
    files.set(`${dir}/original.pdf`, o.pdf);
    files.set(`${dir}/original.png`, o.png);
  }
  void seed;
  return { id: a.id, dir, hazard: a.hazard, vendor_id: a.vendorId, letter_sha256: sha256Hex(r.pdf), injection_spans: spans.length, pressure_kinds: a.pressure_kinds };
}

export async function addAdversarial(files: Files, seed: SeedView, render: (l: Letter) => Promise<Rendered>): Promise<void> {
  const items: unknown[] = [];
  for (const a of adversarialSet(seed)) items.push(await one(a, seed, render, files));
  files.set(`${DIR}/README.md`, README);
  files.set(`${DIR}/index.json`, json({ synthetic: true, generated_by: "scripts/make_documents.ts", items }));
}
