// The low-quality scan (04): rotate 1.2 deg, blur 0.7, 0.8% salt-and-pepper, greyscale, 6% brightness gradient, JPEG q30 round trip.
// Applied after the watermark and footer are drawn, so they survive. Seeded, so the output is reproducible.
import sharp from "sharp";
import { PX_H, PX_W } from "./model";
import { Rng } from "../../seed/rng";

export interface Scan { png: Buffer; jpg: Buffer }
export async function degrade(png: Buffer): Promise<Scan> {
  const rng = Rng.for("scan-04");
  const rotated = await sharp(png).rotate(1.2, { background: "#ffffff" }).blur(0.7).greyscale().toBuffer();
  const meta = await sharp(rotated).metadata();
  const left = Math.floor(((meta.width ?? PX_W) - PX_W) / 2);
  const top = Math.floor(((meta.height ?? PX_H) - PX_H) / 2);
  const cropped = await sharp(rotated).extract({ left, top, width: PX_W, height: PX_H }).toBuffer();
  const gradient = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PX_W}" height="${PX_H}"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.06"/></linearGradient></defs><rect width="${PX_W}" height="${PX_H}" fill="url(#g)"/></svg>`);
  const shaded = await sharp(cropped).composite([{ input: gradient }]).greyscale().raw().toBuffer({ resolveWithObject: true });
  const px = shaded.data;
  const hits = Math.floor(px.length * 0.008);
  for (let i = 0; i < hits; i++) px[rng.int(0, px.length - 1)] = rng.chance(0.5) ? 0 : 255;
  const jpg = await sharp(px, { raw: { width: shaded.info.width, height: shaded.info.height, channels: shaded.info.channels } }).jpeg({ quality: 30 }).toBuffer();
  const out = await sharp(jpg).greyscale().png({ compressionLevel: 9, palette: true, colours: 64 }).toBuffer();
  return { png: out, jpg };
}
