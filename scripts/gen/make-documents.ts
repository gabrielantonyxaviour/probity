// npm run gen:docs. Writes input_examples/**, data/inbox/**, data/sample/claims/**, tests/fixtures/docs/**, tests/eval/fixtures/{a02,a03}/**
// and, with --eval-variants, tests/eval/nemotron/letters/**. --only 01,04 renders a subset. --check compares without writing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { buildDocuments, type Files } from "./docs/build";
import { entryFor, readManifest, ROOT, writeManifest } from "./manifest";

const BINARY = /\.(png|pdf)$/;
const pages = (b: Buffer): number => (b.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;

export async function checkFiles(files: Files, root = ROOT): Promise<string[]> {
  const drift: string[] = [];
  for (const [rel, content] of files) {
    const file = path.join(root, rel);
    if (!existsSync(file)) { drift.push(`${rel} (missing)`); continue; }
    const disk = readFileSync(file);
    if (!BINARY.test(rel)) { if (disk.toString("utf8") !== content.toString()) drift.push(rel); continue; }
    const fresh = content as Buffer;
    const ratio = Math.abs(disk.length - fresh.length) / Math.max(1, fresh.length);
    if (ratio > 0.03) drift.push(`${rel} (size ${disk.length} vs ${fresh.length})`);
    else if (rel.endsWith(".pdf") && pages(disk) !== pages(fresh)) drift.push(`${rel} (page count)`);
    else if (rel.endsWith(".png")) {
      const [a, b] = await Promise.all([sharp(disk).metadata(), sharp(fresh).metadata()]);
      if (a.width !== b.width || a.height !== b.height) drift.push(`${rel} (dimensions)`);
    }
  }
  return drift;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { only: { type: "string" }, "eval-variants": { type: "boolean" }, check: { type: "boolean" } } });
  const evalDir = path.join(ROOT, "tests/eval/nemotron/letters");
  const evalVariants = values["eval-variants"] === true || (values.check === true && existsSync(evalDir));
  const t0 = Date.now();
  const files = await buildDocuments({ ...(values.only ? { only: values.only.split(",") } : {}), evalVariants });
  if (values.check) {
    const drift = await checkFiles(files);
    if (drift.length > 0) { process.stderr.write(`gen:docs --check: drift in\n  ${drift.join("\n  ")}\n`); process.exit(1); }
    process.stdout.write(`gen:docs --check ok (${files.size} files)\n`);
    return;
  }
  for (const [rel, content] of files) {
    const target = path.join(ROOT, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  if (!values.only) {
    const m = readManifest();
    const outputs = [...files].map(([rel, c]) => entryFor(rel, c)).sort((a, b) => a.path.localeCompare(b.path));
    writeManifest({ ...m, outputs: { ...m.outputs, documents: outputs } });
  }
  process.stdout.write(`gen:docs wrote ${files.size} files in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
}
main().catch((e: unknown) => { process.stderr.write(`${e instanceof Error ? e.stack ?? e.message : String(e)}\n`); process.exit(1); });
