import { expect, type Page } from "@playwright/test";

/** Collects page errors, console errors, and failed `/api` responses for the happy-path pages. */
export function attachClean(page: Page): () => void {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.status() < 400) return;
    if (!res.url().includes("/api/")) return;
    failed.push(`${res.status()} ${res.url()}`);
  });
  return () => {
    expect(failed, `failed /api requests:\n${failed.join("\n")}`).toEqual([]);
    expect(errors, `console or page errors:\n${errors.join("\n")}`).toEqual([]);
  };
}
