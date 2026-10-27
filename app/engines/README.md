# app/engines

Owner: engines lane (Meterless World Model E1, H-MEM E2). See `lanes/engines.md` for the contract, row shapes and verification.

- `world-model/index.ts`, `hmem/index.ts`: one-line facades over `vendor/meterless/*` (byte-identical upstream, Apache-2.0, commit `1742dec`).
- `wm-adapter.ts` (`createWorld(env)`), `wm-writer.ts`, `wm-ingest*.ts`, `wm-outcome.ts`, `wm-links.ts`, `wm-read.ts`, `wm-graph*.ts`: the `WorldModelPort`.
- `state-lock.ts`, `state-reload.ts`, `lock-types.ts`: cross-process lock (one lock for both stores) and reload check.
- `memory-gate.ts`: C6 `recall()`.
- `hmem-adapter.ts` (`createMemory(env)`, disabled by default), `hmem-enabled.ts`, `hmem-notes.ts`: E2, deleted with `hmem/` at the 16:00Z cut.
- `wm-norm.ts`: reshapes `app/policy/normalise.ts` results for the mappers; nothing is re-implemented.
