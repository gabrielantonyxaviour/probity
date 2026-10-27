// Default seams for runAgent when the caller (the platform's run registry) passes the flat OrchestratorOpts: the template kit
// is loaded from the Zetaris lane's module, documents and OCR come from this lane's adapters. Nothing here returns data.
import { AppError } from "../schemas/errors";
import type { TemplateKit } from "../components/template-kit.port";
import { createDocuments } from "./adapters/documents";
import { createOcr } from "./adapters/ocr";
import { templateKitFrom, type TemplateLike } from "./adapters/template-kit";
import type { RunDeps } from "./ctx";
import type { RunAgentOptions } from "./run";

type Dirs = { examples: string; uploads: string; tessdata: string; logs: string; sample: string };
let kitCache: Promise<TemplateKit | null> | null = null;

async function loadKit(): Promise<TemplateKit | null> {
  kitCache ??= (async () => {
    for (const spec of ["../templates/index", "../zetaris/templates/index"]) {
      try {
        const mod = (await import(/* @vite-ignore */ spec)) as { templates?: Record<string, TemplateLike>; templateKit?: TemplateKit };
        if (mod.templateKit) return mod.templateKit;
        if (mod.templates) return templateKitFrom(mod.templates);
      } catch {
        /* try the next spec */
      }
    }
    return null;
  })();
  return kitCache;
}

let ocrCache: ReturnType<typeof createOcr> | null = null;

export async function loadDefaults(opts: RunAgentOptions): Promise<RunDeps> {
  const dirs = (opts.config as unknown as { dirs: Dirs }).dirs;
  const templates = opts.templates ?? (await loadKit());
  if (!templates) throw new AppError("internal_error", "Query templates are not available.");
  return {
    ports: opts.ports,
    templates,
    config: opts.config,
    makeTracer: opts.makeTracer,
    ...(opts.bus ? { bus: opts.bus } : {}),
    docs: opts.docs ?? createDocuments({ dirs }),
    ocr: opts.ocr ?? (ocrCache ??= createOcr({ dirs })),
    ...(opts.listPaymentRuns ? { listPaymentRuns: opts.listPaymentRuns } : {}),
    ...(opts.registerTransient ? { registerTransient: opts.registerTransient } : {}),
    ...(opts.offlineZetaris ? { offlineZetaris: opts.offlineZetaris } : {}),
    session_id: opts.session_id,
    ...(opts.now ? { now: opts.now } : {}),
  };
}
