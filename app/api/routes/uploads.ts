// POST /uploads (multipart: `letter` required, `headers` optional) and GET /uploads/:upload_id/files/:file (rendered PNG pages only).
import { createReadStream } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { newUploadId } from "../../lib/ids";
import { UploadResponse } from "../../schemas/api-routes";
import { fail, parse } from "../error-handler";
import { checkFileName, checkUploadId, isFile, safeJoin } from "../paths";
import { processUpload, type UploadInput } from "../upload-docs";

const Params = z.object({ upload_id: z.string(), file: z.string() });

export function registerUploads(app: FastifyInstance): void {
  app.post("/uploads", async (req, reply) => {
    if (!req.isMultipart()) throw fail("unsupported_media_type", "Send multipart/form-data with a `letter` file.");
    const got: Partial<Record<"letter" | "headers", { filename: string; data: Buffer }>> = {};
    for await (const part of req.parts()) {
      if (part.type !== "file") continue;
      if (part.fieldname !== "letter" && part.fieldname !== "headers") {
        await part.toBuffer().catch(() => undefined);
        throw fail("invalid_input", `${part.fieldname}: unexpected file field; use \`letter\` and \`headers\`.`);
      }
      const data = await part.toBuffer().catch(() => {
        throw fail("payload_too_large", `${part.fieldname}: the limit is ${app.ctx.config.MAX_UPLOAD_MB} MB.`);
      });
      got[part.fieldname] = { filename: part.filename, data };
    }
    if (!got.letter) throw fail("invalid_input", "letter: a PNG, JPEG or PDF file is required.");
    const id = newUploadId();
    const dir = path.join(app.ctx.config.dirs.uploads, id);
    const input: UploadInput = { letter: got.letter, ...(got.headers ? { headers: got.headers } : {}) };
    const documents = await processUpload(dir, id, input);
    return reply.code(201).send(UploadResponse.parse({ upload_id: id, documents }));
  });

  app.get("/uploads/:upload_id/files/:file", async (req, reply) => {
    const { upload_id, file } = parse(Params, req.params);
    checkUploadId(upload_id);
    checkFileName(file);
    if (!file.endsWith(".png")) throw fail("not_found", "File not found.");
    const target = safeJoin(app.ctx.config.dirs.uploads, upload_id, file);
    if (!isFile(target)) throw fail("not_found", "File not found.");
    return reply.header("content-type", "image/png").header("cache-control", "private, max-age=3600").send(createReadStream(target));
  });
}
