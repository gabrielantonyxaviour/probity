// Lock constants and shapes (05 2.8). Split from state-lock.ts for the 120-line cap.
export const LOCK_WAIT_MS = 15_000;
export const LOCK_POLL_MS = 250;
export const LOCK_STALE_MS = 600_000;
export const STATE_LOCKED_TEXT = "Another run is writing memory. Retry in a minute.";

export type LockInfo = {
  pid: number;
  hostname: string;
  session_id: string;
  kind: "api" | "cli";
  api_url: string | null;
  acquired_at: string;
};
export type LockMeta = Partial<Pick<LockInfo, "session_id" | "kind" | "api_url">> & {
  waitMs?: number;
  pollMs?: number;
  staleMs?: number;
};
