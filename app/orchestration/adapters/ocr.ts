// OCR adapter (tesseract.js, local tessdata): fallback extraction path only (04 §2.2). Gap-fill for app/adapters/ocr.ts.
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createWorker, type Worker } from "tesseract.js";
import type { OcrPage, OcrPort } from "../../agents/letter-reader/docs.port";

export function createOcr(cfg: { dirs: { tessdata: string } }): OcrPort & { close(): Promise<void> } {
  let worker: Promise<Worker> | null = null;
  const get = (): Promise<Worker> => {
    // the configured dir first (baked into the image), then the language data package installed with tesseract.js
    const candidates = [cfg.dirs.tessdata, "node_modules/@tesseract.js-data/eng/4.0.0_best_int", "node_modules/@tesseract.js-data/eng/4.0.0"].map((d) => path.resolve(d));
    const dir = candidates.find((d) => existsSync(path.join(d, "eng.traineddata")) || existsSync(path.join(d, "eng.traineddata.gz")));
    if (!dir) return Promise.reject(new Error("OCR language data is missing"));
    const plain = existsSync(path.join(dir, "eng.traineddata"));
    return (worker ??= createWorker("eng", 1, { langPath: dir, gzip: !plain, cachePath: dir }));
  };
  return {
    async recognise(png: string): Promise<OcrPage> {
      const w = await get();
      const meta = await sharp(png).metadata();
      const { data } = await w.recognize(png, {}, { blocks: true });
      const words = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
      return {
        text: data.text,
        width: meta.width ?? 1236,
        height: meta.height ?? 1600,
        words: words.map((x) => ({ text: x.text, x0: x.bbox.x0, y0: x.bbox.y0, x1: x.bbox.x1, y1: x.bbox.y1 })),
      };
    },
    async close() {
      if (worker) await (await worker).terminate();
      worker = null;
    },
  };
}
