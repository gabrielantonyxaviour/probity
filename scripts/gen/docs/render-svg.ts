// Page -> SVG (outlines only, no system fonts) -> PNG 1236x1600 via sharp.
import sharp from "sharp";
import { pathData } from "./fonts";
import { NOTICE_FOOTER, PAGE_H, PAGE_W, PX_H, PX_W, type Page } from "./model";
import { WM, watermarkTiles } from "./watermark";

export function pageSvg(page: Page, company: string, marked = true): string {
  const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${PX_W}" height="${PX_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">`, `<rect width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff"/>`];
  for (const r of page.rules) parts.push(`<line x1="${r.x1}" y1="${r.y1}" x2="${r.x2}" y2="${r.y2}" stroke="${r.color}" stroke-width="${r.width}"/>`);
  for (const run of page.runs.filter((r) => !r.hidden)) parts.push(`<path d="${pathData(run.font, run.text, run.x, run.y, run.size)}" fill="${run.color}"/>`);
  if (marked) {
    parts.push(`<g fill="${WM.color}" fill-opacity="${WM.opacity}">`);
    for (const t of watermarkTiles(company)) parts.push(`<path transform="translate(${t.x} ${t.y}) rotate(${WM.angle})" d="${t.d}"/>`);
    parts.push("</g>");
  }
  parts.push("</svg>");
  void NOTICE_FOOTER;
  return parts.join("");
}

export async function pageToPng(page: Page, company: string, marked = true): Promise<Buffer> {
  return sharp(Buffer.from(pageSvg(page, company, marked)), { density: 72 }).resize(PX_W, PX_H).flatten({ background: "#ffffff" }).png({ compressionLevel: 9 }).toBuffer();
}
