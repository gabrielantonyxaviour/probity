// The Zetaris lock shared by every lane (its driver is fragile under load): mkdir is the atomic acquire.
import { mkdirSync, rmdirSync } from "node:fs";

const LOCK = process.env.ZETARIS_LOCK ?? "/private/tmp/claude-501/-Users-gabrielantonyxaviour-Documents/f9d8281f-ddd2-44f0-a438-26c1027a8c54/scratchpad/zetaris.lock";

export async function takeZetarisLock(maxWaitMs = 20 * 60_000): Promise<void> {
  const until = Date.now() + maxWaitMs;
  for (;;) {
    try {
      mkdirSync(LOCK);
      return;
    } catch {
      if (Date.now() > until) throw new Error("zetaris lock not available");
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

export function releaseZetarisLock(): void {
  try {
    rmdirSync(LOCK);
  } catch {
    /* already released */
  }
}
