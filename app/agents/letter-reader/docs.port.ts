// Document resolution port (06 §4.2). The platform lane's documents.ts implements it: magic bytes, sharp, pdftoppm,
// pdftotext, sibling PNGs, sha256 per document, parsed .eml header text. A1 consumes the result; it never reads the disk
// for anything the port did not hand over (except the PDF text layer, via the path the port supplies).
import type { DocKind, DocPage, RunInput } from "../../schemas/api";
import type { Channel } from "../../schemas/erp";

export type ResolvedDoc = {
  doc_index: number;
  kind: DocKind;
  filename: string;
  media_type: "application/pdf" | "image/png" | "message/rfc822";
  sha256: string;
  page_count: number;
  /** Absolute path of the PDF (text layer via pdftotext -bbox-layout). */
  pdf_path?: string;
  /** One PNG per page (display and OCR). */
  png_paths?: string[];
};

export type ResolvedInput = {
  docs: ResolvedDoc[];
  /** Raw header text of the .eml, headers only. */
  eml_headers: string | null;
  example_id: string | null;
  channel: Channel;
  doc_pages: DocPage[];
};

export interface DocumentsPort {
  resolve(input: RunInput, o?: { signal?: AbortSignal }): Promise<ResolvedInput>;
}

export type OcrWord = { text: string; x0: number; y0: number; x1: number; y1: number };
export type OcrPage = { text: string; width: number; height: number; words: OcrWord[] };
export interface OcrPort {
  recognise(pngPath: string, o?: { signal?: AbortSignal }): Promise<OcrPage>;
}
