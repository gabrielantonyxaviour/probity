// API entry (06 §3): loadConfig -> buildContainer -> buildServer -> listen -> boot sweep -> background warm-up. Locks are
// released on SIGINT/SIGTERM. Boot is fast (<= 5 s): everything slow runs after the port is open.
import "./lib/net";
import { ConfigError, liveMissing, loadConfig } from "./config/env";
import { buildServer } from "./api/server";
import { sweepUploads } from "./api/upload-docs";
import { closeErpPool } from "./api/erp-read";
import { buildContainer } from "./runtime/container";
import { runWarmup } from "./runtime/warmup";
import { NightshiftClient } from "./adapters/nightshift/client";
import { logger } from "./trace/logger";

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    logger.fatal(err instanceof ConfigError ? err.message : "Configuration could not be loaded.");
    process.exit(1);
  }
  const container = await buildContainer(config, { kind: "api" });
  const app = await buildServer(container);
  await app.listen({ host: config.HOST, port: config.PORT });
  const missing = liveMissing(config);
  logger.info(
    `probity api listening on ${config.HOST}:${config.PORT} mode=${config.SAMPLE_MODE ? "sample" : "live"} session=${container.sessionId}` +
      (missing.length ? ` unconfigured=${missing.join(",")}` : ""),
  );

  const boot = container.registry.boot();
  if (boot.interrupted.length) logger.warn(`marked ${boot.interrupted.length} run(s) interrupted by the restart`);
  sweepUploads(config.dirs.uploads);
  const sweeper = setInterval(() => sweepUploads(config.dirs.uploads), 3600_000);
  sweeper.unref();

  if (!config.SAMPLE_MODE && container.models instanceof NightshiftClient && config.METERLESS_RUNTIME_TOKEN) {
    runWarmup(config, container.models)
      .then((w) => logger.info(`nightshift warm-up finished exit=${w.exit_code} fast=${String(w.lanes.fast?.state)} deep=${String(w.lanes.deep?.state)}`))
      .catch((err: unknown) => logger.warn({ err }, "nightshift warm-up failed"));
  }

  // One bad promise must not take the API down mid-demo: log it (masked) and keep serving. A real crash still exits.
  process.on("unhandledRejection", (reason) => {
    logger.error(`unhandled rejection: ${reason instanceof Error ? `${reason.name}: ${reason.message}` : "non-error rejection"}`);
  });

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info(`${signal}: shutting down`);
    try {
      await app.close();
      await container.ports.world.close().catch(() => undefined);
      await container.ports.memory.close().catch(() => undefined);
      await closeErpPool();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

await main();
