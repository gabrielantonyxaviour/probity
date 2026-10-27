// Tiny concurrency helpers (04 §1): no dependency, no timers that fake progress.
export class Semaphore {
  private waiting: Array<() => void> = [];
  private active = 0;
  constructor(readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((r) => this.waiting.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

/** Run fn over items with at most `limit` in flight; results keep input order. Rejections become `{error}`. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> {
  const sem = new Semaphore(Math.max(1, limit));
  return Promise.all(
    items.map((it, i) =>
      sem.run(async () => {
        try {
          return { ok: true as const, value: await fn(it, i) };
        } catch (error) {
          return { ok: false as const, error };
        }
      }),
    ),
  );
}

/** Settle all promises, but stop waiting after `ms` (late results are ignored by the caller). */
export async function allSettledWithin<T>(promises: Promise<T>[], ms: number): Promise<PromiseSettledResult<T>[] | "timeout"> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<"timeout">((r) => {
    timer = setTimeout(() => r("timeout"), ms);
  });
  try {
    return await Promise.race([Promise.allSettled(promises), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Reject-on-abort wrapper: the in-flight promise is left to finish and ignored (no server-side cancel). */
export function abortable<T>(p: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return p;
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    const onAbort = () => reject(new Error("aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}
