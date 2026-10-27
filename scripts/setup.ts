// npm run setup: prepares a fresh clone for sample mode and for live mode. Idempotent, prints names only (never a secret value).
// 1 Node version, 2 runtime folders, 3 OCR language data, 4 PDF tools, 5 the offline sample data (checksums), 6 .env from .env.example,
// 7 which live keys are still unset. Exit 1 only when something sample mode needs is broken.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { loadSampleData } from "../app/adapters/sample/sample-store";
import { fetchTessdata } from "./fetch-tessdata";

const rows: Array<{ ok: boolean | "warn"; what: string; detail: string }> = [];
const add = (ok: boolean | "warn", what: string, detail: string): void => void rows.push({ ok, what, detail });

const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
add(major > 22 || (major === 22 && minor >= 12) ? true : false, "Node >= 22.12", process.versions.node);

for (const d of ["logs", "uploads", ".world", "data/hmem"]) mkdirSync(d, { recursive: true });
add(true, "runtime folders", "logs, uploads, .world, data/hmem");

try {
  const t = fetchTessdata();
  add(true, "OCR language data", `${t.file.split("/").slice(-3).join("/")} (${(t.bytes / 1e6).toFixed(1)} MB${t.reused ? ", already there" : ""})`);
} catch (e) {
  add("warn", "OCR language data", `${e instanceof Error ? e.message : "failed"} (only the scanned-letter path needs it)`);
}

const pdf = spawnSync("pdftotext", ["-v"], { encoding: "utf8" });
add(pdf.error ? "warn" : true, "poppler (pdftotext, pdftoppm)", pdf.error ? "not found: install poppler (brew install poppler) to upload PDFs" : "found");

try {
  const d = loadSampleData(process.env.SAMPLE_DATA_DIR ?? "data/sample");
  add(true, "offline sample data", `${d.recipients.size} recipients, ${d.registrants.size} registrants, ${d.erp.vendor.length} vendors, captured ${d.captured_at}`);
} catch (e) {
  add(false, "offline sample data", e instanceof Error ? e.message : "failed");
}

const envFile = [".env", ".env.local"].find((f) => existsSync(f));
if (!envFile && existsSync(".env.example")) {
  copyFileSync(".env.example", ".env");
  add("warn", ".env", "created from .env.example; fill the live keys before a live run (sample mode needs none)");
}
const have = envFile ?? (existsSync(".env") ? ".env" : null);
const text = have ? readFileSync(have, "utf8") : "";
const unset = ["ZETARIS_API_KEY", "METERLESS_RUNTIME_TOKEN", "SEC_USER_AGENT"].filter((k) => {
  const m = new RegExp(`^${k}=(.*)$`, "m").exec(text);
  const value = (m?.[1] ?? "").replace(/\s+#.*$/, "").trim();
  return !value || /^<.*>$/.test(value);
});
add(unset.length ? "warn" : true, "live keys", unset.length ? `still unset: ${unset.join(", ")} (live mode only)` : "set");

for (const r of rows) process.stdout.write(`${r.ok === true ? "ok   " : r.ok === "warn" ? "warn " : "FAIL "} ${r.what.padEnd(30)} ${r.detail}\n`);
process.stdout.write("\nSample mode:  npm run sample -- --input input_examples/01-booz-allen-remit-change/request.json\nLive mode:    npm run live:up, then npm run dev:api (see README section 7C)\n");
process.exit(rows.some((r) => r.ok === false) ? 1 : 0);
