// Human-paced pointer for screen recordings. Headless Chromium draws no cursor, so a small DOM arrow follows the real
// mouse events (which are real Playwright input, not synthetic DOM events). Motion is a curved, eased path.
import type { Locator, Page } from "@playwright/test";

const ARROW =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="34" viewBox="0 0 28 34"><path d="M3 2 L3 26 L9.5 20.5 L14 31 L18.5 29 L14 18.5 L23 18 Z" fill="#f4f1ea" stroke="#0c0c0b" stroke-width="2" stroke-linejoin="round"/></svg>',
  );

const INIT = `(() => {
  const mk = () => {
    if (document.getElementById("__cur")) return;
    const d = document.createElement("div");
    d.id = "__cur";
    d.style.cssText = "position:fixed;left:0;top:0;width:28px;height:34px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);background:url('${ARROW}') no-repeat;transition:none";
    const r = document.createElement("div");
    r.id = "__ripple";
    r.style.cssText = "position:fixed;left:0;top:0;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:2px solid #f4f1ea;z-index:2147483646;pointer-events:none;opacity:0;transform:translate(-100px,-100px) scale(.4)";
    document.documentElement.append(r, d);
    addEventListener("mousemove", (e) => { d.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; r.dataset.x = e.clientX; r.dataset.y = e.clientY; }, true);
    addEventListener("mousedown", (e) => {
      r.style.transition = "none"; r.style.opacity = ".9"; r.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px) scale(.4)";
      requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transition = "opacity .45s ease-out, transform .45s ease-out"; r.style.opacity = "0"; r.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px) scale(1.3)"; }));
    }, true);
  };
  if (document.documentElement) mk(); else addEventListener("DOMContentLoaded", mk);
  new MutationObserver(mk).observe(document, { childList: true });
})();`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const pos = new WeakMap<Page, { x: number; y: number }>();
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function installCursor(page: Page): Promise<void> {
  await page.addInitScript(INIT);
}

export const dwell = (ms: number): Promise<void> => sleep(ms);

/** Move along a gentle arc; duration grows with distance (about 0.4 s to 1.4 s). */
export async function moveTo(page: Page, x: number, y: number): Promise<void> {
  const from = pos.get(page) ?? { x: 960, y: 1200 };
  const dist = Math.hypot(x - from.x, y - from.y);
  const ms = Math.min(1400, Math.max(420, 320 + dist * 0.85));
  const steps = Math.max(14, Math.round(ms / 16));
  const bow = Math.min(90, dist * 0.12) * (x >= from.x ? -1 : 1);
  const nx = -(y - from.y) / (dist || 1);
  const ny = (x - from.x) / (dist || 1);
  for (let i = 1; i <= steps; i++) {
    const t = ease(i / steps);
    const arc = Math.sin(Math.PI * t) * bow;
    await page.mouse.move(from.x + (x - from.x) * t + nx * arc, from.y + (y - from.y) * t + ny * arc);
    await sleep(ms / steps);
  }
  pos.set(page, { x, y });
}

async function centre(loc: Locator): Promise<{ x: number; y: number }> {
  await loc.scrollIntoViewIfNeeded({ timeout: 15_000 });
  const b = await loc.boundingBox();
  if (!b) throw new Error("target has no box");
  return { x: b.x + b.width * (0.42 + Math.random() * 0.16), y: b.y + b.height * (0.42 + Math.random() * 0.16) };
}

export async function hover(page: Page, loc: Locator, hold = 700): Promise<void> {
  const c = await centre(loc);
  await moveTo(page, c.x, c.y);
  await sleep(hold);
}

export async function click(page: Page, loc: Locator): Promise<void> {
  await hover(page, loc, 260 + Math.random() * 160);
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
  await sleep(220);
}

/** Wheel scroll in small eased steps so the page glides like a trackpad. */
export async function glide(page: Page, dy: number, ms = 1100): Promise<void> {
  const steps = Math.max(8, Math.round(ms / 24));
  let done = 0;
  for (let i = 1; i <= steps; i++) {
    const target = Math.round(dy * ease(i / steps));
    await page.mouse.wheel(0, target - done);
    done = target;
    await sleep(ms / steps);
  }
}

/** Type like a person: 55 to 110 ms between keys. */
export async function typeHuman(page: Page, text: string): Promise<void> {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(55 + Math.random() * 55);
  }
}
