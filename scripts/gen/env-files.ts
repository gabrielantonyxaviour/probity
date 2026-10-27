// Minimal .env loader for scripts. Never prints values; process env wins. Handles unquoted values with spaces (SEC_USER_AGENT).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import net from "node:net";

export const REPO = path.resolve(import.meta.dirname, "../..");
net.setDefaultAutoSelectFamilyAttemptTimeout(5000); // slow first connects to api.usaspending.gov

export function loadEnv(files: string[] = [".env.local", ".env.db.local", ".env"]): void {
  for (const name of files) {
    const file = path.join(REPO, name);
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").split("\n")) {
      if (raw.trimStart().startsWith("#")) continue;
      const m = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(raw);
      if (!m) continue;
      let v = m[2] as string;
      v = /^(["']).*\1$/.test(v) ? v.slice(1, -1) : v.replace(/\s+#.*$/, "");
      if (process.env[m[1] as string] === undefined && v !== "" && !/^<.*>$/.test(v)) process.env[m[1] as string] = v;
    }
  }
}
