# tests/parity

S8 and the sample doubles. `npm run test:parity` (set `LIVE=1` to add the live comparison; without it only the offline half runs).

- `sample-vs-live.parity.test.ts`: S1 to S4 in SAMPLE_MODE through the real CLI route in a private log and world directory (no keys, no network). With `LIVE=1` it compares each against the newest fully live run of the same example from the running API: equal `decide(codes without C2)`, equal red codes (an R4 raised only by an unexamined soft link is tolerated offline), equal call-back number.
- `sample-port.test.ts`: the three doubles as units (param-aware rows, fail closed, session tables, ERP overlay, checksum and missing-file failures, edited claims).
- `degrade.test.ts`: `ZETARIS_DOWN_POLICY=degrade` over the real sample port with the real orchestrator.
- `support.ts`, `live.ts`: helpers. A parity mismatch means the captures are stale: recapture (`npm run capture:registry`), never edit the expectations.
