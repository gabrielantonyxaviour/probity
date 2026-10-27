// `--save-example <dir>` (SCR-07-4): proof that an output file came from a real run. Writes request.json, response.json,
// the masked trace and receipts, stdout.txt and RECORDED.md, and appends {file, sha256, run_id, mode, captured_at, git_sha}
// to the parent directory's MANIFEST.json. Never read by app/ or ui/.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Config } from "../config/env";
import { sha256 } from "../lib/hash";
import type { RunEnvelope, RunErrorEnvelope } from "../schemas/api";
import { masker } from "../trace/mask";

function gitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "uncommitted";
  }
}

export function saveExample(a: { dir: string; cfg: Config; request: unknown; envelope: RunEnvelope | RunErrorEnvelope; stdout: string; mode: string }): string[] {
  const dir = path.resolve(a.dir);
  mkdirSync(dir, { recursive: true });
  const runId = a.envelope.run_id;
  const written: string[] = [];
  const put = (name: string, text: string) => {
    writeFileSync(path.join(dir, name), text);
    written.push(name);
  };
  put("request.json", `${JSON.stringify(masker.deep(a.request), null, 2)}\n`);
  put("response.json", `${JSON.stringify(masker.deep(a.envelope), null, 2)}\n`);
  put("stdout.txt", `${masker.string(a.stdout)}\n`);
  for (const kind of ["trace", "receipts"] as const) {
    const src = path.join(a.cfg.dirs.logs, `${kind}-${runId}.jsonl`);
    if (existsSync(src)) {
      copyFileSync(src, path.join(dir, `${kind}-${runId}.jsonl`));
      written.push(`${kind}-${runId}.jsonl`);
    }
  }
  const at = new Date().toISOString();
  put("RECORDED.md", `# Recorded run\n\nrun_id: ${runId}\nmode: ${a.mode}\ncaptured_at: ${at}\nstatus: ${a.envelope.status}\n\nThis folder was written by \`probity run --save-example\` from a real run. Nothing in app/ or ui/ reads it.\n`);

  const manifestFile = path.join(path.dirname(dir), "MANIFEST.json");
  const manifest: Array<Record<string, unknown>> = existsSync(manifestFile) ? (JSON.parse(readFileSync(manifestFile, "utf8")) as Array<Record<string, unknown>>) : [];
  const sha = gitSha();
  for (const f of written) {
    const rel = `${path.basename(dir)}/${f}`;
    const entry = { file: rel, sha256: sha256(readFileSync(path.join(dir, f))), run_id: runId, mode: a.mode, captured_at: at, git_sha: sha };
    const i = manifest.findIndex((m) => m.file === rel);
    if (i >= 0) manifest[i] = entry;
    else manifest.push(entry);
  }
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  return written;
}
