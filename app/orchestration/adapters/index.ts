// Adapters this lane supplies where no lane brief assigned the file (06 §3 lists them under Sol-B1). The integrator adds
// one-line facades: app/adapters/documents.ts, ocr.ts, erp-writer.ts, sample/erp-writer-sample.ts, zetaris/port.ts, templates kit.
export { createDocuments } from "./documents";
export { createOcr } from "./ocr";
export { createErpWriter } from "./erp-writer";
export { createSampleErpWriter, type SampleErpWriter } from "./erp-writer-sample";
export { createZetarisPort, registryCachedAt, type PortDeps } from "./zetaris-port";
export { templateKitFrom } from "./template-kit";
export { createRegistrarPort } from "./registrar-port";
