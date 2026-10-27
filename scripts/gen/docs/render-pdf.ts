// Page -> PDF with pdfkit. Letters keep a real text layer (embedded Plex); scans are an image plus a one-line invisible notice.
import PDFDocument from "pdfkit";
import { ascent, fontPath, type FontKey } from "./fonts";
import { PAGE_H, PAGE_W, watermarkText, type Page } from "./model";
import { WM, watermarkTiles } from "./watermark";
import { WORLD_NOW } from "../contracts";

const KEYS: FontKey[] = ["sans", "sansBold", "sansItalic", "serif", "serifBold"];

function open(title: string): PDFKit.PDFDocument {
  const when = new Date(WORLD_NOW);
  const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: false, compress: true, info: { Title: title, Author: "Synthetic sample, Open Agent Hackathon 2026 team Zen", Creator: "Probity document generator", Producer: "pdfkit", CreationDate: when, ModDate: when } });
  for (const k of KEYS) doc.registerFont(k, fontPath(k));
  return doc;
}
function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export function letterPdf(pages: Page[], company: string): Promise<Buffer> {
  const doc = open(watermarkText(company));
  for (const page of pages) {
    doc.addPage();
    for (const r of page.rules) doc.save().lineWidth(r.width).strokeColor(r.color).moveTo(r.x1, r.y1).lineTo(r.x2, r.y2).stroke().restore();
    for (const run of page.runs) doc.font(run.font).fontSize(run.size).fillColor(run.color).text(run.text, run.x, run.y - ascent(run.font, run.size), { lineBreak: false });
    doc.save().fillColor(WM.color).fillOpacity(WM.opacity);
    for (const t of watermarkTiles(company)) doc.save().translate(t.x, t.y).rotate(WM.angle).path(t.d).fill().restore();
    doc.restore();
  }
  return collect(doc);
}

/** Image-only scan. The single invisible text line is the synthetic notice (under 80 characters, so readers still take the OCR path). */
export function scanPdf(image: Buffer, company: string): Promise<Buffer> {
  const doc = open(watermarkText(company));
  doc.addPage();
  doc.image(image, 0, 0, { width: PAGE_W, height: PAGE_H });
  const notice = watermarkText(company);
  if (notice.length >= 80) throw new Error(`scan notice is ${notice.length} characters; it must stay under 80 so the Letter Reader falls back to OCR`);
  doc.save().fillOpacity(0).font("sans").fontSize(8).text(notice, 72, 30 - ascent("sans", 8), { lineBreak: false }).restore();
  return collect(doc);
}
