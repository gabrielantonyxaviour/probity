// Puts the English OCR language data where the OCR adapter and the Docker image expect it (TESSDATA_DIR, default app/vendor/tessdata).
// The data ships inside the npm package @tesseract.js-data/eng (an app dependency), so this needs no network: it unpacks the
// package's eng.traineddata.gz, checks the size and writes a sha256 next to it. Safe to run again.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const PACKAGE_DIRS = ["4.0.0_best_int", "4.0.0"];
const MIN_BYTES = 1_000_000;

function findPackage(from: string): string | null {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    for (const v of PACKAGE_DIRS) {
      const d = path.join(dir, "node_modules", "@tesseract.js-data", "eng", v);
      if (existsSync(path.join(d, "eng.traineddata.gz")) || existsSync(path.join(d, "eng.traineddata"))) return d;
    }
    if (path.dirname(dir) === dir) return null;
  }
}

export function fetchTessdata(dest = process.env.TESSDATA_DIR ?? "app/vendor/tessdata"): { file: string; bytes: number; sha256: string; reused: boolean } {
  const out = path.resolve(dest);
  const file = path.join(out, "eng.traineddata");
  if (existsSync(file) && statSync(file).size >= MIN_BYTES) {
    const buf = readFileSync(file);
    return { file, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), reused: true };
  }
  const src = findPackage(process.cwd());
  if (!src) throw new Error("@tesseract.js-data/eng is not installed; run npm ci first.");
  const gz = path.join(src, "eng.traineddata.gz");
  const data = existsSync(gz) ? gunzipSync(readFileSync(gz)) : readFileSync(path.join(src, "eng.traineddata"));
  if (data.length < MIN_BYTES) throw new Error("The OCR language data looks truncated.");
  mkdirSync(out, { recursive: true });
  writeFileSync(file, data);
  const sha256 = createHash("sha256").update(data).digest("hex");
  writeFileSync(`${file}.sha256`, `${sha256}  eng.traineddata\n`);
  return { file, bytes: data.length, sha256, reused: false };
}

if (/fetch-tessdata\.ts$/.test(process.argv[1] ?? "")) {
  try {
    const r = fetchTessdata(process.argv[2]);
    process.stdout.write(`tessdata ${r.reused ? "already present" : "written"}: ${path.relative(process.cwd(), r.file)} (${(r.bytes / 1e6).toFixed(1)} MB, sha256 ${r.sha256.slice(0, 12)})\n`);
  } catch (e) {
    process.stderr.write(`fetch-tessdata failed: ${e instanceof Error ? e.message : "unknown error"}\n`);
    process.exit(1);
  }
}
