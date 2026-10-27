// Shared CLI plumbing: config loading with fixed-text failures, the in-process container, exit codes, output capture.
import { ConfigError, loadConfig, type Config } from "../config/env";
import { buildServer } from "../api/server";
import { logger } from "../trace/logger";
import { buildContainer, type Container } from "../runtime/container";

export const EXIT = { ok: 0, error: 1, invalid: 2, partial: 3, locked: 4 } as const;

/** Print a line to stdout (the CLI's only output channel). */
export const out = (line = ""): void => void process.stdout.write(`${line}\n`);
export const err = (line: string): void => void process.stderr.write(`${line}\n`);

export function loadConfigOrExit(): Config | null {
  try {
    return loadConfig();
  } catch (e) {
    err(`[ERROR] ${e instanceof ConfigError ? e.message : "Configuration could not be loaded."}`);
    return null;
  }
}

export const apiBase = (cfg: Config, flag?: string): string => (flag ?? cfg.PAYEE_API_URL ?? `http://localhost:${cfg.PORT}`).replace(/\/+$/, "");

/** An in-process API (container + Fastify without a listener): CLI commands call the same routes the UI does, via inject. */
export async function openLocal(cfg: Config, o: { quiet?: boolean } = {}) {
  if (!process.env.LOG_LEVEL) logger.level = "warn"; // the CLI prints the run's trace lines itself; keep request logs out of the terminal
  const container: Container = await buildContainer(cfg, { kind: "cli", ...(o.quiet ? { traceSink: () => undefined } : {}) });
  const app = await buildServer(container);
  // Ctrl-C stops the in-process run at its next boundary and releases the World Model lock before exiting.
  const onSigint = () => {
    void container.registry
      .cancelAll()
      .then(() => new Promise((r) => setTimeout(r, 1500)))
      .finally(async () => {
        for (let i = 0; i < 4; i++) await container.ports.world.close().catch(() => undefined);
        process.exit(130);
      });
  };
  process.once("SIGINT", onSigint);
  return {
    container,
    app,
    async close() {
      process.off("SIGINT", onSigint);
      await app.close();
      await container.ports.world.close().catch(() => undefined);
    },
  };
}

/** Map an HTTP status of a failed API call to a CLI exit code. */
export function exitForHttp(status: number, code?: string): number {
  if (status >= 200 && status < 300) return EXIT.ok;
  if (code === "busy" || code === "state_locked" || code === "world_model_locked") return EXIT.locked;
  if (status === 400 || status === 404 || status === 415 || status === 422) return EXIT.invalid;
  return EXIT.error;
}
