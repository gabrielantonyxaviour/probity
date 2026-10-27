// Where the World Model lives (05 2.8, REV-20/53). WORLD_DIR is the base directory; the engine appends `.world/`.
import os from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";

export type EngineEnv = {
  WORLD_DIR?: string | undefined;
  SAMPLE_MODE?: boolean | undefined;
  PAYEE_DEMO_SESSIONS?: string | boolean | undefined;
  session_id?: string;
  kind?: "api" | "cli";
  api_url?: string | null;
};

export const samplePath = (): string => path.join(os.tmpdir(), "probity-sample");
let sampleWiped = false;

/** WORLD_DIR is the base directory; the engine appends `.world/`. Unset: `.` live, tmpdir/probity-sample in SAMPLE_MODE. */
export function resolveWorldDir(env: EngineEnv): string {
  return env.WORLD_DIR ?? (env.SAMPLE_MODE ? samplePath() : ".");
}

/** The fixed sample directory is wiped once at process start unless PAYEE_DEMO_SESSIONS=1 (REV-20). Live is never wiped. */
export function maybeWipeSample(env: EngineEnv, dir: string): void {
  const keep = env.PAYEE_DEMO_SESSIONS ?? process.env.PAYEE_DEMO_SESSIONS;
  if (
    !env.SAMPLE_MODE ||
    env.WORLD_DIR ||
    dir !== samplePath() ||
    sampleWiped ||
    keep === true ||
    keep === "1" ||
    keep === "true"
  )
    return;
  sampleWiped = true;
  rmSync(path.join(dir, ".world"), { recursive: true, force: true });
  rmSync(path.join(dir, "hmem"), { recursive: true, force: true }); // H-MEM lives beside the world in sample mode
}
