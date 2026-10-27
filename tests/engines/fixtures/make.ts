// Generates tests/engines/fixtures/{s1,s2}-rows.json, contacts.json and s6-requests.json from data/sample/ (the ERP
// seed and the real registry captures). Never hand-edit the outputs. Zetaris is not called: query ids are derived from
// the template and params, and the fixture meta says so. Scenario claims follow spine section 13 / 02 section 5.4.
//   npx tsx tests/engines/fixtures/make.ts            (SAMPLE_DATA_DIR overrides data/sample)
import fs from "node:fs";
import path from "node:path";
import { toE164 } from "../../../app/policy/normalise";
import { buildRequest, type Scenario } from "./scenarios";
import { FETCHED, ROOT, SAMPLE, t01, t02, t02Rows, t05, t05b, t06, t07, t10, t11, t12 } from "./builders";

const OUT = import.meta.dirname;
const meta = {
  generated_by: "tests/engines/fixtures/make.ts",
  source: "data/sample (ERP seed + registry captures)",
  fetched_at: FETCHED,
  query_ids: "derived from template and params (no Zetaris in unit tests)",
};
const write = (name: string, body: unknown) =>
  fs.writeFileSync(path.join(OUT, name), `${JSON.stringify(body, null, 2)}\n`);

const s1: Scenario = "S1";
const s2: Scenario = "S2";
write("s1-rows.json", {
  meta,
  request: buildRequest(s1),
  batches: [
    t01("V-10027"),
    t02("V-10027"),
    t05("V-10027"),
    t05b("MBPHTU7Y9S65"),
    t07(),
    t10("MBPHTU7Y9S65", "NJ"),
    t11("MBPHTU7Y9S65", "KHK6E1JW9C15", "C"),
    t12("KHK6E1JW9C15", "C"),
  ],
});
write("s2-rows.json", {
  meta,
  request: buildRequest(s2),
  batches: [
    t01("V-10442"),
    t01("V-10587"),
    t02("V-10442"),
    t02("V-10587"),
    t05("V-10442"),
    t05("V-10587"),
    t06("Science Applications International Corporation", [
      ["UE9QJD4KK1L6", "C"],
      ["MMLKPW9JLX64", "C"],
    ]),
    t12("UE9QJD4KK1L6", "C"),
  ],
});
// REV-55 oracle: T02 rows for every S1-S4 vendor at their scenario's received_at
const oracle = [
  ["V-10027", "S1"],
  ["V-10442", "S2"],
  ["V-10587", "S2"],
  ["V-10198", "S3"],
  ["V-10311", "S4"],
].map(([vendor_id, sc]) => ({
  vendor_id,
  scenario: sc,
  received_at: buildRequest(sc as Scenario).received_at,
  t02: t02Rows(vendor_id!),
  t01: t01(vendor_id!),
  t02_batch: t02(vendor_id!),
}));
write("contacts.json", { meta, oracle });
write("s6-requests.json", {
  meta,
  s6b: buildRequest("S6b"),
  s6d: buildRequest("S6d"),
  s3: buildRequest("S3"),
  t01_caci: t01("V-10112"),
  t02_caci: t02("V-10112"),
  t01_l3: t01("V-10198"),
  toE164: toE164("(703) 555-0147"),
});
process.stdout.write(`fixtures written from ${path.relative(ROOT, SAMPLE)}\n`);
