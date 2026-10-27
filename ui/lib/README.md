# ui/lib

Owner: UI lane. `api.ts` (zod-parsed fetchers), `use-run.ts` + `run-store.ts` (SSE or polling into one reducer),
`copy*.ts` and `labels*.ts` (every user-facing string; Grok imports them), `format.ts`, `model/` (pure view models: stepper,
fact sheet, trace, Nemotron jobs, banners), `contracts/` (zod parsers from `@schemas/*`), `log.ts` (pino browser).
