# End-to-end tests

Playwright drives the running Probity UI (`http://localhost:3100`) and API (`http://localhost:8787`). Run the commands from the repository root.

```bash
npx playwright test --grep-invert @live --workers=3
npx playwright test --grep @live --workers=1
```

`narrow` (390×844), `medium` (834×1112) and `wide` (1440×900) skip `@live`. The `live` project runs only `@live` and needs `--workers=1`: the S10 injection check and the Stop check each take the shared Zetaris lock, and they must not start together. The lock is released within eight minutes. Do not remove a lock this lane does not hold. A marker file under `tests/e2e/live-*-result.json` stops a second Verify on the same request.

Do not start a new `@live` run on an API that still has the failed template cache. The 16:31Z process (PID 77561) failed every new run in about 1 second with `Query templates are not available.` Later restarts (17:24Z, then 17:35Z) load the templates. Check `lanes/RESTART-REQUESTS.md` and `GET /readyz` before a new Verify. Each `@live` test reads the first `GET /runs/:id/trace` event and, when a run dies in under 5 seconds without being cancelled, fails with that event's `output_summary`. A Stop counts only when the stage is `CANCELLED` and the envelope code is `cancelled` (the detail status stays `error`). A run that fails on its own is reported as a product defect with the trace text.

`PAYEE_UI_URL` and `PAYEE_API_URL` override the two origins.

Depth specs: `lineage.spec.ts` (D4), `asof.spec.ts` (D5), `readings.spec.ts` (D1), `injection.spec.ts` (D6), `sweep-dq.spec.ts` (DQ7–DQ9), `dialogs.spec.ts` (call-back and outcome), `stop.spec.ts` (Stop). What each one asserts, and which failures are product defects, is in `PROGRESS.md`.
