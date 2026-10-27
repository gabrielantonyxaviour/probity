// Letter -> positioned runs (pt, origin top-left) and recorded field boxes (px). Text is measured with opentype.js on the bundled TTFs.
import { ascent, width } from "./fonts";
import { NOTICE_FOOTER, PAGE_H, PAGE_W, SCALE, watermarkText, type Box, type FieldHit, type FieldName, type HiddenHit, type HiddenSpan, type Laid, type Letter, type Mark, type Page, type Run } from "./model";

const M = 72; // 1 in margins
const CONTENT_W = PAGE_W - 2 * M;
const INK = "#111111";
const MUTED = "#555555";
const NBSP = "\u00a0";

interface Line { text: string; start: number }
/** Greedy wrap. Marked phrases flagged nobreak are glued with no-break spaces so they never split across lines. */
function wrap(text: string, marks: Mark[], font: Parameters<typeof width>[0], size: number, maxW: number): Line[] {
  let glued = text;
  for (const m of marks) if (m.nobreak) glued = glued.replace(m.text, m.text.replace(/ /g, NBSP));
  const words = glued.split(" ");
  const lines: Line[] = [];
  let cur = "";
  let pos = 0;
  let start = 0;
  for (const w of words) {
    const next = cur === "" ? w : `${cur} ${w}`;
    if (cur !== "" && width(font, next.replace(/\u00a0/g, " "), size) > maxW) {
      lines.push({ text: cur.replace(/\u00a0/g, " "), start });
      start = pos;
      cur = w;
    } else cur = next;
    pos += w.length + 1;
  }
  if (cur !== "") lines.push({ text: cur.replace(/\u00a0/g, " "), start });
  return lines;
}

class Builder {
  page: Page = { runs: [], rules: [] };
  pages: Page[] = [this.page];
  fields: FieldHit[] = [];
  hidden: HiddenHit[] = [];
  y = 0;
  text(text: string, x: number, baseline: number, o: { size: number; font: Run["font"]; color?: string; field?: FieldName; align?: "left" | "center" | "right" }): number {
    const w = width(o.font, text, o.size);
    const left = o.align === "center" ? PAGE_W / 2 - w / 2 : o.align === "right" ? PAGE_W - M - w : x;
    this.page.runs.push({ text, x: left, y: baseline, size: o.size, font: o.font, color: o.color ?? INK });
    if (o.field) this.record(o.field, text, [this.box(left, baseline, w, o.size, o.font)]);
    return w;
  }
  box(x: number, baseline: number, w: number, size: number, font: Run["font"]): Box {
    const top = baseline - ascent(font, size);
    return { page: this.pages.length, x: Math.round(x * SCALE), y: Math.round(top * SCALE), w: Math.round(w * SCALE), h: Math.round(size * 1.25 * SCALE) };
  }
  record(field: FieldName, text: string, boxes: Box[], kind?: Mark["kind"]): void { this.fields.push({ field, text, boxes, ...(kind ? { kind } : {}) }); }
  /** White 1 pt text: invisible on the page, present in the text layer. It never advances the cursor. */
  hide(s: HiddenSpan, baseline: number): void {
    const size = 1;
    const w = width("sans", s.text, size);
    this.page.runs.push({ text: s.text, x: M, y: baseline, size, font: "sans", color: "#ffffff", hidden: true });
    const box = this.box(M, baseline, w, size, "sans");
    this.hidden.push({ id: s.id, goal: s.goal, text: s.text, page: this.pages.length, after: s.after, size, color: "#ffffff", bbox_pt: [M, baseline - ascent("sans", size), M + w, baseline + 0.25], box });
    this.record("pressure_phrase", s.text, [box], "embedded_instruction");
  }
  rule(x1: number, y: number, x2: number, widthPt = 0.6, color = "#999999"): void { this.page.rules.push({ x1, y1: y, x2, y2: y, width: widthPt, color }); }
}

export function layoutLetter(L: Letter): Laid {
  const b = new Builder();
  const body = L.face.body;
  const H = L.head;
  const hideAfter = (point: HiddenSpan["after"], baseline: number): void => { (L.hidden ?? []).filter((h) => h.after === point).forEach((h, i) => b.hide(h, baseline + i * 1.4)); };
  // header notice (real text in the PDF so the text layer carries the synthetic label); fictional vendors carry none
  if (!L.unmarked) b.text(watermarkText(L.company), M, 30, { size: 8, font: "sans", color: "#777777", field: "watermark" });
  let y = 78;
  const nameSize = H.size ?? 18;
  b.text(H.name, M, y, { size: nameSize, font: L.face.headBold, field: "letterhead_name", align: H.align });
  y += 15;
  if (H.address) { b.text(H.address, M, y, { size: 9, font: L.face.head, color: MUTED, field: "letterhead_address", align: H.align }); y += 12; }
  if (H.contact) {
    const w = width(L.face.head, H.contact.text, 9);
    const left = H.align === "center" ? PAGE_W / 2 - w / 2 : H.align === "right" ? PAGE_W - M - w : M;
    b.text(H.contact.text, M, y, { size: 9, font: L.face.head, color: MUTED, align: H.align });
    const sub = (s: string | undefined, field: FieldName): void => {
      if (!s) return;
      const at = H.contact?.text.indexOf(s) ?? -1;
      if (at < 0) throw new Error(`${L.id}: contact text lacks ${s}`);
      b.record(field, s, [b.box(left + width(L.face.head, H.contact?.text.slice(0, at) ?? "", 9), y, width(L.face.head, s, 9), 9, L.face.head)]);
    };
    sub(H.contact.phone, "letterhead_phone");
    sub(H.contact.email, "letterhead_email");
    y += 12;
  }
  if (H.rule) { b.rule(M, y + 2, PAGE_W - M, 0.9, "#333333"); }
  hideAfter("letterhead", y + 16);
  y += 30;
  b.text(L.date, M, y, { size: 11, font: body, field: "date" });
  y += 26;
  for (const r of L.recipient) { b.text(r, M, y, { size: 11, font: body }); y += 14; }
  b.record("recipient", L.recipient.join(" / "), [{ page: 1, x: Math.round(M * SCALE), y: Math.round((y - 14 * L.recipient.length - 8) * SCALE), w: Math.round(250 * SCALE), h: Math.round(14 * L.recipient.length * SCALE) }]);
  y += 12;
  if (L.subject) {
    const s = L.caps ? L.subject.toUpperCase() : L.subject;
    b.text(`Subject: ${s}`, M, y, { size: 11, font: L.face.headBold, field: "subject" });
    y += 24;
  }
  b.text(L.salutation, M, y, { size: 11, font: body });
  y += 20;
  for (const p of L.paras) {
    const size = p.size ?? 11;
    const font = p.font ?? body;
    const marks = p.marks ?? [];
    const lines = wrap(p.text, marks, font, size, CONTENT_W);
    for (const ln of lines) {
      b.text(ln.text, M, y, { size, font, ...(p.color ? { color: p.color } : {}) });
      for (const m of marks) {
        const at = p.text.indexOf(m.text);
        if (at < 0) throw new Error(`${L.id}: mark "${m.text}" is not in its paragraph`);
        const end = at + m.text.length;
        const lo = Math.max(at, ln.start);
        const hi = Math.min(end, ln.start + ln.text.length);
        if (lo >= hi) continue;
        const x0 = M + width(font, ln.text.slice(0, lo - ln.start), size);
        const w = width(font, ln.text.slice(lo - ln.start, hi - ln.start), size);
        const existing = b.fields.find((f) => f.field === m.field && f.text === m.text);
        const box = b.box(x0, y, w, size, font);
        if (existing) existing.boxes.push(box); else b.record(m.field, m.text, [box], m.kind);
      }
      y += 15;
    }
    y += p.after ?? 8;
  }
  if (L.remit) {
    b.text(L.remit.label, M, y, { size: 11, font: L.face.headBold });
    y += 15;
    b.text(L.remit.address, M + 12, y, { size: 11, font: body, field: "remit_address" });
    y += 24;
  }
  if (L.bank) {
    if (!L.remit) y += 14;
    const rows: [string, string, FieldName][] = [
      ["Bank", L.bank.bank_name, "bank_name"],
      ["Routing number", `${L.bank.routing}  TEST ROUTING`, "bank_routing"],
      ["Account number", `${L.bank.account}  TEST ACCOUNT`, "bank_account"],
      ["Account name", L.bank.account_name, "account_name"],
    ];
    const colX = M + 150;
    b.rule(M, y - 12, PAGE_W - M, 0.8, "#333333");
    for (const [label, value, field] of rows) {
      b.text(label, M + 6, y + 2, { size: 10, font: L.face.head, color: MUTED });
      b.text(value, colX, y + 2, { size: 11, font: L.face.body, field });
      b.rule(M, y + 10, PAGE_W - M, 0.5, "#bbbbbb");
      y += 22;
    }
    y += 8;
  }
  hideAfter("bank", y - 10);
  y += 4;
  b.text(L.closing, M, y, { size: 11, font: body });
  y += 30;
  b.text(L.signer, M, y, { size: 12, font: L.face.sign, field: "signer_name" });
  if (L.signerTitle !== "") { y += 15; b.text(L.signerTitle, M, y, { size: 11, font: body, field: "signer_title" }); }
  if (y > PAGE_H - 70) throw new Error(`${L.id}: letter does not fit on one page (y=${Math.round(y)})`);
  hideAfter("signer", y + 14);
  if (!L.unmarked) b.text(NOTICE_FOOTER, M, PAGE_H - 28.8, { size: 8, font: "sans", color: "#777777" });
  return { pages: b.pages, fields: b.fields, ...(b.hidden.length ? { hidden: b.hidden } : {}) };
}
