# Probity deck speaker notes

## 1. Probity: before the money moves, prove who is asking

Probity reads a vendor's bank-detail change, cross-examines every claim across sources that disagree, and decides: approve, call back first, or hold. Track T01, Solving Fragmented Intelligence, and the Nemotron prize. Team Zen. The letters and internal records are synthetic; the registry facts are real.

## 2. Problem and users

Dana runs AP controls at a federal integrator, Priya is the assistant controller, Tomas owns the vendor master. The moment is a bank-change request just before a payment run. Policy says call back on a number from a system of record; in practice that takes three or four systems and a phone. The public cases are the 2018 Defense payment diversion and the FBI's 2025 business email compromise losses.

## 3. The sources disagree

Registry facts disagree with each other and with the letter: a sibling company at the claimed address, a former name, an alias that names a different company. Every registry fact in this table is real public data from USAspending and SEC EDGAR.

## 4. Solution

This is not reconciling records. It is deciding whether to trust a claim before money moves. One request in; one decision out: approve, call back first, or hold, with a cited fact sheet, a call-back script that uses only independent numbers, the run exposure, and an unasked sweep of the rest of the payment run. Code decides; the models read, plan, critique and explain.

## 5. Agent workflow and architecture

Four agents, each with its own authority. The Examiner can block and nobody overrides it. When evidence is missing it sends the Scout back, at most two rounds, and it re-runs the decisive Zetaris query and compares row hashes before a new link counts. If anything fails closed, the answer is never approve. The World Model is the shared state.

## 6. Tech stack

TypeScript on Node 22 with Fastify, zod and pino; Next.js 15 for the interface; Postgres 16 and Docker; Zetaris running locally; Meterless Nightshift routing to pinned Nemotron models; the Meterless World Model for shared state.

## 7. How we used Zetaris

Three sources, one semantic layer: our vendor master and AP ledger, USAspending and SEC EDGAR join as vendor360, twelve tables. Every fact in a decision is a Zetaris query with an id you can re-run. The payment-run sweep is a Zetaris data-quality rule. We wrote up what Zetaris saved us and what a keyed REST template would add.

## 8. How we used Meterless and NVIDIA

The World Model keeps bitemporal edges, so the call-back number is chosen as of thirty days before the request, and a confirmed impersonation in one session is remembered in the next. Nightshift pins the two Nemotron lanes, tags every call with its own app id, logs the model per call and keeps the receipts. The quality numbers on this slide come from our own measured evaluation.

## 9. What was unique, and results

The call-back number is chosen by provenance, not convenience. The sweep of the whole payment run is a Zetaris data-quality rule. Discovery is narrowed by the claim. When the sources cannot say which vendor it is, it refuses to guess. And before a discovered link counts, the Examiner re-runs the query. The measured numbers come from the recorded runs.

## 10. Limits and what comes next

It does not prove who owns a bank account, it never applies a change or places a call, coverage at setup is six contractor families, SAM.gov and sanctions lists are not connected, and Nemotron is claimed only for calls whose returned model matched. Next: bank-account ownership validation, SAM.gov as Zetaris sources, keyed REST templates, a controller run view, and ERP write-back behind approval.
