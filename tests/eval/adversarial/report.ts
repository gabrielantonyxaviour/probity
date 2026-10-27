// Render docs/evidence/adversarial-eval.{json,md} from tests/eval/results/adversarial/cases.jsonl (the recorded live runs).
//   npx tsx tests/eval/adversarial/report.ts [--tag final] [--out docs/evidence]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildAdversarial } from "./build";
import { renderAdversarial } from "./render";

const arg = (n: string): string | undefined => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = path.resolve(process.cwd(), arg("out") ?? "docs/evidence");
const result = buildAdversarial(arg("tag") ?? "final");
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, "adversarial-eval.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(path.join(OUT, "adversarial-eval.md"), renderAdversarial(result));
const raw = path.join(process.cwd(), "tests/eval/results/adversarial/cases.jsonl");
const tag = arg("tag") ?? "final";
if (existsSync(raw)) writeFileSync(path.join(OUT, "adversarial-eval-cases.jsonl"), `${readFileSync(raw, "utf8").split("\n").filter((l) => l && (JSON.parse(l) as { tag: string }).tag === tag).join("\n")}\n`);
process.stdout.write(`wrote ${path.relative(process.cwd(), OUT)}/adversarial-eval.{json,md}: ${result.letters.total} letters, ${result.spans.length} injected spans\n`);
