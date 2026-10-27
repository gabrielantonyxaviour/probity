// Cross-process write lock for the World Model and H-MEM (05 2.8, REV-66): `${dir}/.world/.lock`, created with
// openSync(p, "wx"). Held per run or per write, never for the process life. Reload check: state-reload.ts.
import { closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { AppError } from "../schemas/errors";
import {
  LOCK_POLL_MS,
  LOCK_STALE_MS,
  LOCK_WAIT_MS,
  STATE_LOCKED_TEXT,
  type LockInfo,
  type LockMeta,
} from "./lock-types";

export { fileSignature, sigChanged, sleepSync, type FileSig } from "./state-reload";
export type { LockInfo, LockMeta } from "./lock-types";

/** Route maps to 409 {error, code:"state_locked"}; the CLI maps it to exit 4 `world_model_locked`. */
export class StateLockedError extends AppError {
  readonly cliCode = "world_model_locked" as const;
  constructor(readonly holder: LockInfo | null) {
    super("state_locked", STATE_LOCKED_TEXT, { retryable: true, httpStatus: 409 });
    this.name = "StateLockedError";
  }
}

export const lockPath = (dir: string): string => path.join(dir, ".world", ".lock");
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function readHolder(p: string): { info: LockInfo | null; raw: string } {
  try {
    const raw = readFileSync(p, "utf-8");
    try {
      return { info: JSON.parse(raw) as LockInfo, raw };
    } catch {
      return { info: null, raw }; // half-written: wait, unless the file itself is old
    }
  } catch {
    return { info: null, raw: "" };
  }
}

function isStale(p: string, info: LockInfo | null, staleMs: number): boolean {
  if (!info) {
    try {
      return Date.now() - statSync(p).mtimeMs > staleMs;
    } catch {
      return true;
    }
  }
  if (Date.now() - Date.parse(info.acquired_at) > staleMs) return true;
  if (info.hostname !== hostname()) return false;
  try {
    process.kill(info.pid, 0);
    return false;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "ESRCH";
  }
}

/** Acquire the lock or throw StateLockedError after the wait. Returns the release function (idempotent). */
export async function acquireStateLock(dir: string, meta: LockMeta = {}): Promise<() => void> {
  const p = lockPath(dir);
  mkdirSync(path.dirname(p), { recursive: true });
  const deadline = Date.now() + (meta.waitMs ?? LOCK_WAIT_MS);
  for (;;) {
    try {
      const fd = openSync(p, "wx");
      const body = JSON.stringify({
        pid: process.pid,
        hostname: hostname(),
        session_id: meta.session_id ?? `pid-${process.pid}`,
        kind: meta.kind ?? "cli",
        api_url: meta.api_url ?? null,
        acquired_at: new Date().toISOString(),
      } satisfies LockInfo);
      writeSync(fd, body);
      closeSync(fd);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        try {
          if (readHolder(p).raw === body) unlinkSync(p); // never remove a lock another process took over
        } catch {
          /* already gone */
        }
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    const held = readHolder(p);
    if (isStale(p, held.info, meta.staleMs ?? LOCK_STALE_MS)) {
      try {
        if (readHolder(p).raw === held.raw) unlinkSync(p);
      } catch {
        /* lost the race to another cleaner */
      }
      continue;
    }
    if (Date.now() >= deadline) throw new StateLockedError(held.info);
    await sleep(meta.pollMs ?? LOCK_POLL_MS);
  }
}

export async function withStateLock<T>(dir: string, fn: () => Promise<T> | T, meta: LockMeta = {}): Promise<T> {
  const release = await acquireStateLock(dir, meta);
  try {
    return await fn();
  } finally {
    release();
  }
}

/** Who holds the lock now (the CLI uses it to decide whether to forward to a running API), or null. */
export function lockHolder(dir: string): LockInfo | null {
  const h = readHolder(lockPath(dir));
  return h.info && !isStale(lockPath(dir), h.info, LOCK_STALE_MS) ? h.info : null;
}
