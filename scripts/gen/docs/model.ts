// Document content model. One Letter per example; the layout, the PNG, the PDF, the truth file and the sidecar all derive from it.
import type { FontKey } from "./fonts";

export type FieldName =
  | "letterhead_name" | "letterhead_address" | "letterhead_phone" | "letterhead_email" | "date" | "recipient" | "subject" | "invoice_refs"
  | "remit_address" | "bank_name" | "bank_routing" | "bank_account" | "account_name" | "effective_date" | "pressure_phrase" | "signer_name"
  | "signer_title" | "watermark" | "claimed_name";
export type PressureKind = "urgency" | "avoid_verification" | "secrecy" | "new_contact" | "embedded_instruction";

/** A substring of a paragraph that gets its own recorded box (and, for pressure phrases, a kind). */
export interface Mark { text: string; field: FieldName; kind?: PressureKind; nobreak?: boolean }
export interface Para { text: string; marks?: Mark[]; font?: FontKey; size?: number; after?: number; color?: string }

/** Text a human cannot see (white, 1 pt) that pdftotext still extracts: a prompt-injection attack in the PDF text layer (D6). */
export interface HiddenSpan { id: string; text: string; after: "letterhead" | "bank" | "signer"; goal: string }

export interface Letter {
  id: string;
  company: string; // the impersonated company: "SYNTHETIC SAMPLE: not issued by {company}"
  claimedName: string;
  effectiveIso: string | null;
  face: { body: FontKey; head: FontKey; headBold: FontKey; sign: FontKey };
  head: { name: string; address?: string; contact?: { text: string; phone?: string; email?: string }; align: "left" | "center" | "right"; rule: boolean; size?: number };
  date: string;
  recipient: string[];
  subject?: string;
  caps?: boolean;
  salutation: string;
  paras: Para[];
  remit?: { label: string; address: string };
  bank?: { bank_name: string; routing: string; account: string; account_name: string };
  closing: string;
  signer: string;
  signerTitle: string;
  /** Fictional vendor: no diagonal watermark, no synthetic footer line (decision 8). Only allowed when `company` is a fictional vendor row of the seed (safety.ts checks db/seed/vendor.json). */
  unmarked?: boolean;
  hidden?: HiddenSpan[];
}

export interface Box { page: number; x: number; y: number; w: number; h: number } // px on the 1236x1600 raster
export interface FieldHit { field: FieldName; text: string; boxes: Box[]; kind?: PressureKind }
export interface Run { text: string; x: number; y: number; size: number; font: FontKey; color: string; hidden?: boolean }
export interface Rule { x1: number; y1: number; x2: number; y2: number; width: number; color: string }
export interface Page { runs: Run[]; rules: Rule[] }
export interface HiddenHit { id: string; goal: string; text: string; page: number; after: HiddenSpan["after"]; size: number; color: string; bbox_pt: [number, number, number, number]; box: Box }
export interface Laid { pages: Page[]; fields: FieldHit[]; hidden?: HiddenHit[] }

export const PAGE_W = 612;
export const PAGE_H = 792;
export const PX_W = 1236;
export const PX_H = 1600;
export const SCALE = PX_H / PAGE_H;
export const NOTICE_FOOTER = "Synthetic document generated for the Open Agent Hackathon 2026 by team Zen. Not a real request.";
export const watermarkText = (company: string): string => `SYNTHETIC SAMPLE: not issued by ${company}`;
