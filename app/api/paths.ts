// Safe file resolution (06 §10.1): ids and names match their regexes, then `path.resolve` must stay inside the base directory.
// No directory listing, no user-supplied path ever reaches the filesystem unresolved.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { EXAMPLE_ID, FILE_NAME, UPLOAD_ID } from "../schemas/patterns";
import { fail } from "./error-handler";

export const isInside = (base: string, target: string): boolean => {
  const b = path.resolve(base);
  const t = path.resolve(target);
  return t === b || t.startsWith(b + path.sep);
};

export function safeJoin(base: string, ...parts: string[]): string {
  const target = path.resolve(base, ...parts);
  if (!isInside(base, target)) throw fail("not_found", "Not found.");
  return target;
}

export const isFile = (p: string): boolean => existsSync(p) && statSync(p).isFile();
export const isDir = (p: string): boolean => existsSync(p) && statSync(p).isDirectory();

export function checkExampleId(id: string): string {
  if (!EXAMPLE_ID.test(id)) throw fail("not_found", "Example not found.");
  return id;
}
export function checkUploadId(id: string): string {
  if (!UPLOAD_ID.test(id)) throw fail("not_found", "Upload not found.");
  return id;
}
export function checkFileName(name: string): string {
  if (!FILE_NAME.test(name)) throw fail("not_found", "File not found.");
  return name;
}

export const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
  ".eml": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};
