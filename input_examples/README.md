# input_examples

Synthetic requests for `POST /run` (each folder's `request.json` is a complete body) and for the CLI. Written by `npm run gen:docs`; do not
edit by hand. Every letter page carries the "SYNTHETIC SAMPLE" watermark and footer, every bank detail is a test value, every email domain ends
`.example`. See `data/README.md`.

| Example | Request | What it exercises |
|---|---|---|
| `01-booz-allen-remit-change/` | BCR-2026-0412 | polished letter, lookalike sender domain, genuine sibling address, account already held by a newer vendor |
| `02-saic-leidos-remit-change/` | BCR-2026-0416 | a legitimate-looking request that cannot be attributed to one vendor |
| `03-l3harris-bank-change/` | BCR-2026-0398 | a clean bank change already verified by a call-back on an independent number |
| `04-v2x-remit-change/` | BCR-2026-0418 | former company name; low-quality scan (image-only PDF, so the reader falls back to OCR) |
| `06b-caci-lookalike/` | BCR-2026-0431 | obvious impersonation: lookalike domain, urgency, "do not call" |
| `05-judge-name-only.json`, `05b-judge-private-company.json` | none | a company name only (listed registrant; private company) |
| `06d-account-reuse.json` | BCR-2026-0446 | a typed bank change reusing an account from a confirmed impersonation |

The ten everyday inbox requests live in `data/inbox/items/`.
