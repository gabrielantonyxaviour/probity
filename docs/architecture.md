# Architecture

Probity is one process tree on a developer machine: a Fastify API, a Next.js review UI, a hand-written orchestrator, and three local services it depends on (Zetaris on :8888, Meterless Nightshift on :8088, and a Postgres ERP on :55432). The short diagram is in [`README.md`](../README.md) section 5; this page adds the trust boundaries and the evidence path.

## Components

| Part | Kind | Does | Code |
|---|---|---|---|
| Letter Reader (A1) | Agent, Nemotron 3 Ultra | Turns the letter's text layer or OCR text into quoted claims (field, value, page, box) | `app/agents/`, `app/prompts/letter_reader.md` |
| Registry Scout (A2) | Agent, Nemotron 3.5 Lightning | Chooses allow-listed query templates per claimed field, with tool calls; a coverage rule in code sets the floor | `app/agents/`, `app/templates/` |
| Identity Examiner (A3) | Agent, rules first, Nemotron 3 Ultra on soft links | Blocks or admits links and facts; re-runs the decisive Zetaris queries itself and compares `row_hash`; can send the Scout back (up to 2 rounds) | `app/agents/`, `app/policy/` |
| Gate Officer (A4) | Policy code plus a Lightning writer | Reason codes, verdict, call-back selection, exposure, sweep, rationale (number-checked) | `app/policy/gate.ts` |
| Orchestrator | Code | State machine with a 480 s budget, retries, fallbacks, fail-closed rules | `app/orchestration/run.ts` |
| Evidence Runner, Registrar, Sweep Runner | Code | Run templates; register a session table at run time (admin key, allow-listed DDL); run `RUN DQ` over the payment run | `app/templates/`, `app/adapters/zetaris/` |
| Identity Linker, Memory Gate | Code over the Meterless World Model | Event-sourced graph with bitemporal edges; recalls earlier confirmed impersonations | `app/engines/`, `vendor/meterless/world-model/` |
| Zetaris | Platform | Joins USAspending, SEC EDGAR and the ERP in the `vendor360` USL; keeps a `query_id` per query; runs data-quality rules | `zetaris/` |
| Nightshift | Platform | Routes each model call to the pinned NVIDIA Nemotron id and returns a receipt | `app/adapters/nightshift.ts` |

## Trust boundaries

1. **Models write; code decides.** A model returns claims, link critiques and wording. The verdict comes from `app/policy/gate.ts`. A model failure leaves soft links `pending`, which raises R4 and holds the request.
2. **Models never write SQL.** They pick templates; the SQL is generated in code and checked by a query guard before it is sent.
3. **One reader, one writer.** The Evidence Runner uses the query key; only the Registrar issues DDL. (On this build both roles hold the same Zetaris key, so the split is enforced in code, not by Zetaris grants.)
4. **No raw account numbers leave the process.** Zetaris sees `sha256(routing:account)` and the last four digits.
5. **Letters leave the machine only to NVIDIA**, through Nightshift (receipt `egress.destination: "nvidia"`).

## Evidence path

Every cell of the fact sheet carries a lineage: the public source (USAspending or EDGAR URL, or the ERP table), the REST or JDBC table Zetaris registered for it, the activated `vendor360` table, the template and SQL, the Zetaris `query_id`, and the returned rows with their `row_hash`. `POST /zetaris/rerun` executes the same SQL again and reports whether the `row_hash` matches. In the hero run (`r-20261027T140116Z-e306`) the run made 25 Zetaris queries and 12 Nemotron calls; the per-query record is in `zetaris/results/query_history.md`.

## One request, in order

1. Intake hashes the account, inserts the request row in the ERP and attributes candidate vendors.
2. The Letter Reader extracts claims from the letter.
3. The Memory Gate recalls earlier confirmed impersonations (rule R5).
4. The Scout and Evidence Runner gather registry and ledger facts through Zetaris.
5. The Identity Linker writes facts and link proposals to the World Model; the Examiner accepts, blocks or asks for more.
6. The Gate Officer computes the decision, picks the call-back number, and the Sweep Runner checks the rest of the payment run.
7. The API streams each step over server-sent events; the UI shows the decision, fact sheet, graph and model ledger.

Failure handling is in README section 10.
