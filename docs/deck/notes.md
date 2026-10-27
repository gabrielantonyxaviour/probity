# Probity deck speaker notes

## 1. Probity: before the money moves, prove who is asking

Probity reads a vendor's bank-detail change, cross-examines every claim across sources that disagree, and decides: approve, call back first, or hold. Track T01, Solving Fragmented Intelligence, and the Nemotron prize. Team Zen. The registry facts are live public data from USAspending and SEC EDGAR, joined in Zetaris.

## 2. Problem and users

Dana runs AP controls at a federal integrator, Priya is the assistant controller, Tomas owns the vendor master. The moment is a bank-change request just before a payment run. Policy says call back on a number from a system of record; in practice that takes three or four systems and a phone, and the sources disagree: a sibling company at the claimed address, a former name, an alias that names a different company. The public cases are the 2018 Defense payment diversion and the FBI's 2025 business email compromise losses.

## 3. Product visuals

Four frames from live runs in the production interface. The letter that told the AI to approve it: the hidden lines are quoted as evidence and the request is held (R8). The S1 decision: hold, with a call-back number from SEC records. The evidence drawer: every registry and ledger fact traces back to its Zetaris rows, with source system, USL table, query id, SQL hash and row hash, and a Re-run in Zetaris button. The entity graph with the as-of scrubber: what was known when.

## 4. Solution

This is not reconciling records. It is deciding whether to trust a claim before money moves. One request in; one decision out: approve, call back first, or hold, with a cited fact sheet, a call-back script that uses only independent numbers, the run exposure, and an unasked sweep of the rest of the payment run. Code decides; the models read, plan, critique and explain.

## 5. Agent workflow and architecture

Four agents, each with its own authority. The Letter Reader reads the letter twice, in two independent Nemotron Ultra calls, and the readings must agree field by field; a material disagreement caps the decision at call-back. Text addressed to an AI reviewer is quoted as evidence and holds the request (R8); a call-back cannot clear it. The Examiner can block and nobody overrides it. When evidence is missing it sends the Scout back, at most two rounds, and it re-runs the decisive Zetaris query and compares row hashes before a new link counts. If anything fails closed, the answer is never approve.

## 6. Tech stack

TypeScript on Node 22 with Fastify, zod and pino; Next.js 15 for the interface; Postgres 16 and Docker; Zetaris running locally; Meterless Nightshift routing to two pinned Nemotron models; the Meterless World Model for shared state. Built Grok-first: Grok (xAI) built the Zetaris data layer (source registration, the unified vendor360 layer, data-quality rules, live checks) and wrote the independent end-to-end test suite; Claude Code built the agents and the interface.

## 7. How we used Zetaris

Three sources, one semantic layer: our vendor master and AP ledger, USAspending and SEC EDGAR join as vendor360, twelve tables. A hero run makes about thirty Zetaris queries; each has an id, and each registry and ledger fact traces back to its rows: source system, USL table, query id, SQL hash and row hash. The unasked sweep of the payment run is five Zetaris data-quality rules: DQ1, DQ2, DQ7 (one bank account on file for two vendors), DQ8 (registered with REGISTER DQ) and DQ9. T23 is one federated query across all three systems; it is informational and never changes a decision.

## 8. How we used Meterless and NVIDIA

The World Model keeps bitemporal edges: time travel shows the entity graph as it was known at any moment, the call-back number is chosen as of thirty days before the request, and a confirmed impersonation in one session is remembered in the next. Nightshift pins the two Nemotron lanes, tags every call with its own app id, logs the model per call and keeps the receipts. The quality numbers are from our own measured evaluation: small samples, labelled by our coding assistant, not by experts.

## 9. What was unique, and results

Two Ultra readings must agree before a claim counts. A letter that talks to the AI is evidence, never an instruction. The call-back number is chosen by provenance, not convenience. The unasked sweep of the whole payment run is five Zetaris data-quality rules. Before a discovered link counts, the Examiner re-runs the query. Every fact has lineage, and the graph can be replayed as of any moment. The measured numbers come from the recorded runs.

## 10. Future enhancements

Limits first: it does not prove who owns a bank account, it never applies a change or places a call, registry coverage at setup is six contractor families, SAM.gov and sanctions lists are not connected, and Zetaris latency puts a check at two to four minutes. Next: bank-account ownership validation, SAM.gov and exclusions as Zetaris sources, keyed REST templates, a controller run view, ERP write-back behind approval, and faster checks through Zetaris query caching.
