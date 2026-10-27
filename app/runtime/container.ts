// Composition root (06 §1.2): builds config-derived services once per process: the tracer, the model client, the ports,
// the run registry. The API and the in-process CLI both use it, so the terminal and the UI show the same run.
import type { Config } from "../config/env";
import { createModelClient } from "../adapters/nightshift";
import type { ModelClient } from "../schemas/models";
import type { Ports } from "../schemas/ports";
import { bus } from "../trace/bus";
import { SESSION_ID } from "../trace/logger";
import { configureTracer } from "../trace/tracer";
import type { LineSink } from "../trace/stdout";
import type { TraceWriter } from "../trace/writer";
import { RunRegistry } from "./run-registry";
import { wirePorts } from "./wiring";

export type Container = {
  config: Config;
  sessionId: string;
  startedAt: number;
  models: ModelClient;
  ports: Ports;
  writer: TraceWriter;
  registry: RunRegistry;
  wiring: Record<string, string>;
};
export type ContainerOverrides = Partial<Pick<Ports, "zetaris" | "registrar" | "discovery" | "erp" | "world" | "memory">> & {
  models?: ModelClient;
  samplePorts?: Pick<Ports, "zetaris" | "registrar" | "discovery"> | null;
  sessionId?: string;
  traceSink?: LineSink;
  kind?: "api" | "cli";
};

export async function buildContainer(config: Config, o: ContainerOverrides = {}): Promise<Container> {
  const sessionId = o.sessionId ?? SESSION_ID;
  const writer = configureTracer(config, { session_id: sessionId, ...(o.traceSink ? { sink: o.traceSink } : {}) });
  const models = o.models ?? createModelClient(config);
  const wired = await wirePorts(config, models, { session_id: sessionId, kind: o.kind ?? "api", api_url: `http://localhost:${config.PORT}` });
  const { models: _m, samplePorts, sessionId: _s, kind: _k, traceSink: _t, ...portOverrides } = o;
  const ports: Ports = { ...wired.ports, ...portOverrides };
  const registry = new RunRegistry(config, ports, samplePorts === undefined ? wired.samplePorts : samplePorts, writer, bus, sessionId);
  return { config, sessionId, startedAt: Date.now(), models, ports, writer, registry, wiring: wired.report };
}
