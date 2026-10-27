import { existsSync, mkdirSync, utimesSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sweepUploads } from "../../../app/api/upload-docs";
import { makeHarness, post, type Harness } from "../../helpers/api-harness";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

let h: Harness;
afterEach(async () => {
  await h?.close();
});

function multipart(parts: Array<{ name: string; filename: string; type: string; data: Buffer }>) {
  const b = "----probitytest";
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: ${p.type}\r\n\r\n`), p.data, Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${b}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { "content-type": `multipart/form-data; boundary=${b}` } };
}
const png = () => sharp({ create: { width: 800, height: 1100, channels: 3, background: "#ffffff" } }).png().toBuffer();

describe("POST /uploads (06 §4.5)", () => {
  it("accepts a PNG letter and .eml headers, renders page urls, and serves the page", async () => {
    h = await makeHarness();
    const eml = Buffer.from("From: AP <ap@boozallen-payments.example>\r\nReply-To: pay@elsewhere.example\r\nDate: Thu, 22 Oct 2026 15:12:00 +0000\r\n\r\nbody");
    const m = multipart([{ name: "letter", filename: "letter.png", type: "image/png", data: await png() }, { name: "headers", filename: "headers.eml", type: "message/rfc822", data: eml }]);
    const r = await h.app.inject({ method: "POST", url: "/uploads", ...m });
    expect(r.statusCode).toBe(201);
    const body = JSON.parse(r.body) as { upload_id: string; documents: Array<Record<string, unknown>> };
    expect(body.upload_id).toMatch(/^up-[0-9a-f]{12}$/);
    expect(body.documents[0]).toMatchObject({ doc_index: 1, kind: "letter", mime: "image/png", pages: 1, text_layer: false, page_urls: [`/uploads/${body.upload_id}/files/letter-p1.png`] });
    expect(body.documents[1]).toMatchObject({ doc_index: 2, kind: "eml_headers", headers: { from: "AP <ap@boozallen-payments.example>", reply_to: "pay@elsewhere.example", date: "2026-10-22T15:12:00.000Z" } });
    const page = await h.app.inject({ method: "GET", url: body.documents[0]!.page_urls ? (body.documents[0]!.page_urls as string[])[0]! : "" });
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toBe("image/png");
    // an upload can be used by POST /run
    const run = await post(h, "/run", { input: { upload_id: body.upload_id }, options: {} });
    expect(run.statusCode).toBe(200);
    expect(JSON.parse((await h.app.inject({ method: "GET", url: `/runs/${(JSON.parse(run.body) as { run_id: string }).run_id}` })).body).input_ref).toEqual({ kind: "upload", upload_id: body.upload_id });
  });
  it("415 when the bytes disagree with the declared type, 400 without a letter, 404 for an unknown or expired upload", async () => {
    h = await makeHarness();
    const bad = multipart([{ name: "letter", filename: "letter.png", type: "image/png", data: Buffer.from("this is text, not an image") }]);
    const r = await h.app.inject({ method: "POST", url: "/uploads", ...bad });
    expect(r.statusCode).toBe(415);
    expect(JSON.parse(r.body)).toEqual({ error: "The letter must be a PNG, JPEG or PDF.", code: "unsupported_media_type" });
    const none = multipart([{ name: "headers", filename: "h.eml", type: "text/plain", data: Buffer.from("From: a@b.example\n\n") }]);
    expect((await h.app.inject({ method: "POST", url: "/uploads", ...none })).statusCode).toBe(400);
    expect((await h.app.inject({ method: "POST", url: "/uploads", payload: "{}", headers: { "content-type": "application/json" } })).statusCode).toBe(415);
    const gone = await post(h, "/run", { input: { upload_id: "up-0123456789ab" }, options: {} });
    expect(gone.statusCode).toBe(404);
    expect(JSON.parse(gone.body).error).toBe("Upload expired; upload again.");
    expect((await h.app.inject({ method: "GET", url: "/uploads/up-0123456789ab/files/letter.pdf" })).statusCode).toBe(404);
  });
  it("413 above MAX_UPLOAD_MB", async () => {
    h = await makeHarness({ env: { MAX_UPLOAD_MB: "1" } });
    const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(1_200_000)]);
    const r = await h.app.inject({ method: "POST", url: "/uploads", ...multipart([{ name: "letter", filename: "letter.png", type: "image/png", data: big }]) });
    expect(r.statusCode).toBe(413);
    expect(JSON.parse(r.body).code).toBe("payload_too_large");
  });
  it("the 24 h sweep removes old upload directories only", () => {
    const root = path.join(process.env.TMPDIR ?? "/tmp", `probity-sweep-${Date.now()}`);
    const old = path.join(root, "up-aaaaaaaaaaaa");
    const fresh = path.join(root, "up-bbbbbbbbbbbb");
    const other = path.join(root, "keep-me");
    for (const d of [old, fresh, other]) mkdirSync(d, { recursive: true });
    const past = new Date(Date.now() - 25 * 3600 * 1000);
    utimesSync(old, past, past);
    utimesSync(other, past, past);
    expect(sweepUploads(root)).toEqual(["up-aaaaaaaaaaaa"]);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(other)).toBe(true);
  });
});
