// npm run gen:seed. Deterministic (mulberry32 20261027, WORLD_NOW 2026-10-27T07:00:00Z), no clock, no network.
//   --drop PT1,PT4 --out <dir>   counterfactual seed written under <dir> only (a full data/sample copy and db/ files)
//   --check                      regenerate in memory and byte-compare with the committed outputs; exit 1 on drift
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ERP_TABLES } from "../../app/schemas/erp";
import { buildSeed } from "../seed/build";
import { seedSql, tableJson } from "../seed/serialise";
import { PATTERNS } from "../seed/types";
import { entryFor, readManifest, ROOT, writeManifest, type OutputEntry } from "./manifest";

function render(drop: Set<string>): { files: Map<string, string>; counts: Record<string, number>; real: number; fictional: number } {
  const built = buildSeed(drop);
  const files = new Map<string, string>();
  for (const table of ERP_TABLES) {
    const json = tableJson(table, built.tables[table]);
    files.set(`db/seed/${table}.json`, json);
    files.set(`data/sample/erp/${table}.json`, json);
  }
  files.set("db/init/02-seed.sql", seedSql(built.tables));
  const counts = Object.fromEntries(ERP_TABLES.map((t) => [t, built.tables[t].length]));
  const vendors = built.vw.vendors;
  return { files, counts, real: vendors.filter((v) => !v.fictional).length, fictional: vendors.filter((v) => v.fictional).length };
}

function main(): void {
  const { values } = parseArgs({ options: { drop: { type: "string", multiple: true }, out: { type: "string" }, check: { type: "boolean" } } });
  const drop = new Set((values.drop ?? []).flatMap((d) => d.split(",")).map((d) => d.trim().toUpperCase()).filter(Boolean));
  const unknown = [...drop].filter((d) => !(PATTERNS as readonly string[]).includes(d));
  if (unknown.length > 0) throw new Error(`unknown pattern ${unknown.join(", ")}; valid: ${PATTERNS.join(" ")}`);
  if (drop.size > 0 && !values.out) throw new Error("--drop writes a counterfactual seed and needs --out <dir>; the committed seed is never overwritten");

  const t0 = Date.now();
  const { files, counts, real, fictional } = render(drop);
  if (values.check) {
    const drift = [...files].filter(([rel, content]) => !existsSync(path.join(ROOT, rel)) || readFileSync(path.join(ROOT, rel), "utf8") !== content).map(([rel]) => rel);
    if (drift.length > 0) {
      process.stderr.write(`gen:seed --check: drift in\n  ${drift.join("\n  ")}\n`);
      process.exit(1);
    }
    const mf = readManifest().outputs.seed ?? [];
    const stale = mf.filter((e) => entryFor(e.path, files.get(e.path) ?? "").sha256 !== e.sha256);
    if (mf.length !== files.size || stale.length > 0) {
      process.stderr.write("gen:seed --check: data/generated-manifest.json is out of date; run npm run gen:seed\n");
      process.exit(1);
    }
    process.stdout.write(`gen:seed --check ok (${files.size} files)\n`);
    return;
  }

  const base = values.out ? path.resolve(values.out) : ROOT;
  if (values.out && existsSync(path.join(ROOT, "data/sample"))) cpSync(path.join(ROOT, "data/sample"), path.join(base, "data/sample"), { recursive: true });
  for (const [rel, content] of files) {
    const target = path.join(base, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  if (!values.out) {
    const outputs: OutputEntry[] = [...files].map(([rel, content]) => entryFor(rel, content)).sort((a, b) => a.path.localeCompare(b.path));
    const m = readManifest();
    writeManifest({ ...m, real_named: real, fictional, rows: counts, outputs: { ...m.outputs, seed: outputs } });
  }
  process.stdout.write(`gen:seed wrote ${files.size} files to ${values.out ?? "repo"} in ${Date.now() - t0} ms (vendors ${real + fictional}: ${real} real-named, ${fictional} fictional)\n`);
}
main();
