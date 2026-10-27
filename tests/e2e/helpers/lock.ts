import { mkdirSync, rmdirSync } from "node:fs";

/** Shared with the other lanes. Hold it across a live Zetaris query or a run, and never past eight minutes. */
export const ZETARIS_LOCK = "/private/tmp/claude-501/-Users-gabrielantonyxaviour-Documents/f9d8281f-ddd2-44f0-a438-26c1027a8c54/scratchpad/zetaris.lock";

const HOLD_MS = 8 * 60 * 1000;
const WAIT_MS = 8 * 60 * 1000;

export async function acquireZetarisLock(): Promise<{ release: () => void; heldMs: () => number }> {
  const waitStart = Date.now();
  for (;;) {
    try {
      mkdirSync(ZETARIS_LOCK);
      break;
    } catch {
      if (Date.now() - waitStart > WAIT_MS) throw new Error("timed out waiting for the Zetaris lock");
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
  const heldAt = Date.now();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(cap);
    try {
      rmdirSync(ZETARIS_LOCK);
    } catch {
      // Another holder already removed it.
    }
  };
  const cap = setTimeout(release, HOLD_MS);
  return { release, heldMs: () => Date.now() - heldAt };
}
