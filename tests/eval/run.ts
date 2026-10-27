// `npm run eval` entry. What exists today: the report that turns recorded live evidence into docs/eval.md, and the live Nemotron eval
// (`npm run eval:nemotron`). The sample-mode oracle matrix of spec 07 section 3.6 needs the SAMPLE_MODE query doubles (wave 2, F16) and
// is not built, so --mode sample refuses instead of printing a green result it did not earn.
//   npx tsx tests/eval/run.ts [--mode report|sample]
import { spawnSync } from "node:child_process";

const i = process.argv.indexOf("--mode");
const mode = i > 1 ? process.argv[i + 1] : "report";
if (mode === "sample") {
  process.stderr.write("eval --mode sample: not available. The sample-mode oracle cases need the SAMPLE_MODE query doubles (app/adapters/sample/*, status F16). Run `npm run eval:nemotron` for the live model eval and `tsx tests/eval/run.ts` to re-render docs/eval.md.\n");
  process.exit(2);
}
const r = spawnSync("npx", ["tsx", "tests/eval/report.ts"], { stdio: "inherit" });
process.exit(r.status ?? 1);
