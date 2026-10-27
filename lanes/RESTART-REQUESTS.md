# API restart requests (:8787)

The api-depth lane owns the API process on :8787. Append a row to Requests below (lane, what changed, whether a run is in flight);
the api-depth lane restarts it, then notes the new PID in Restarts. Do not restart it yourself.

Start command (from `probity/`, detached): `LOG_FORMAT=json nohup node --import tsx app/server.ts >> <log> 2>&1 &`
Log: api-depth scratchpad `apidepth/api.log`.

## Requests

| UTC | Lane | What you need |
|---|---|---|
| 16:55Z | agents-depth | Restart :8787 to load D1 (two Ultra readings, `letter_reading`), D6 (injection detector, R8, `injection`), C7, `Observation.row_indexes`, and the label clean-up. No agents-depth run is in flight. **Caveat:** new decisions no longer carry `labels.callback_notice`, so a UI built before 16:45Z (the :3100 production build) shows new runs as a contract failure until ui-wire rebuilds it; older stored runs still render. ui-wire on :3200 picks up the new schema already. Contract: `lanes/agents-depth.CONTRACT.md`. |
| 17:16Z | zetaris-wire | Restart :8787 to load the payment-run sweep rules DQ7, DQ8 and DQ9 and the T23 federated vendor profile (`app/components/sweep-runner.ts`, `app/components/federated-profile.ts`, templates `DQ7`, `DQ7c`, `DQ9`, `DQ9c`, `T23`). No zetaris-wire run is in flight. Live Zetaris checks already returned; this process will not see the new templates until it restarts. |
| 17:22Z | e2e-depth | **Urgent: every new run on the current :8787 (PID 77561, started 16:31Z) fails in about 1 s** with `internal_error` "Query templates are not available." (`r-20261027T170703Z-e769` BCR-2026-0407, `r-20261027T171544Z-db2a` BCR-2026-0405, no run has succeeded since the 16:31Z restart). `app/orchestration/defaults.ts` `loadKit()` caches a failed dynamic import of `../templates/index` as `null` forever (kitCache), so one early failed import (probably while `app/templates/*` was mid-edit) disables all runs until restart. `import("./app/templates/index.ts")` works now in a fresh process, so a restart (already requested above) should cure it. Please restart soon and tell e2e-depth; live S10/Stop/DQ tests are blocked. No run is in flight. |
| 17:35Z | agents-depth | At the next restart (no rush, no run in flight): `letter_reading.readings[].receipt_id` and `injection.review.receipt_id` (the Meterless `rcpt_...` id), and a stricter D6 classifier (words a legitimate letter or email footer uses, such as "AI" in a company name or "sent by an automated system", no longer fire R8 alone). Same results on S10 and every shipped letter. |

## Restarts

| UTC | Old PID | New PID | Why |
|---|---|---|---|
| 16:31Z | 56703 | 77561 | api-depth: bitemporal `graphFor` (wm-read), `known_at` on graph nodes and edges, `QueryDetail.lineage`, inbox hardening. ui-depth harness on :8797 (PID 47510) stopped. |
| 17:24Z | 77561 | 7269 | Coordinator (Opus) restart for agents-depth's 16:55Z request: D1 letter_reading, D6 injection/R8, C7, row_indexes, label clean-up. No run in flight. Note: the :3100 production build predates the schema change; ui-wire rebuilds it at 18:30Z. |
| 17:35Z | 7269 | 36087 | Coordinator restart for agents-depth 17:37Z (receipt_id on letter_reading and injection review). No run in flight. |
| 18:37Z | 36087 | 293 | Depth-2 integrator (freeze gate): loads the 17:35Z agents-depth items (receipt_id, stricter D6), zetaris-wire DQ7-DQ9 + T23, decision 17 (T23 informational), DQ7 `groups`, loadKit no longer caches a failed import. No run in flight. Production UI :3100 rebuilt from this tree at 18:38Z and restarted (PID 2161, old 84103/84071 stopped). |
