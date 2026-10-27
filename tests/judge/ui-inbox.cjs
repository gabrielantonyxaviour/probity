// J-5: the sample UI shows the inbox in a real browser. Usage: BASE_URL=http://localhost:13100 PW_FROM=<dir with node_modules/playwright> node ui-inbox.cjs
// Exit 0 = inbox rows rendered, the sample notice is shown and no banned wording is on screen; exit 3 = Playwright not installed (caller prints SKIP).
/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CommonJS script run outside the TypeScript build */
/* global document */
let chromium;
for (const base of (process.env.PW_FROM || '').split(':').filter(Boolean)) {
  try { ({ chromium } = require(require.resolve('playwright', { paths: [base] }))); break; } catch { /* next */ }
}
if (!chromium) { console.log('playwright not found in: ' + (process.env.PW_FROM || '(none)')); process.exit(3); }
const base = process.env.BASE_URL || 'http://localhost:3100';
(async () => {
  const browser = await chromium.launch();
  try {
    const failures = [];
    for (const [w, h] of [[390, 800], [1280, 900]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/app`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => /TO REVIEW\s*\d+/i.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
      const text = await page.innerText('body');
      const m = /TO REVIEW\s*(\d+)/i.exec(text);
      if (!m || Number(m[1]) < 1) failures.push(`${w}px: inbox shows no requests to review`);
      if (!/SAMPLE MODE/i.test(text)) failures.push(`${w}px: sample-mode notice missing`);
      if (/synthetic|fictional|demo scenario|do not call|TEST ROUTING/i.test(text)) failures.push(`${w}px: banned wording on screen`);
      if (errors.length) failures.push(`${w}px: page errors ${errors.slice(0, 2).join(' | ')}`);
      await page.close();
    }
    if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
    console.log('inbox rendered at 390 and 1280 px, no page errors');
  } finally { await browser.close(); }
})();
