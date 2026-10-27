// Deterministic checks for the payment-river field. Exit code only (0 pass, 1 fail); no logging. Run with:
//   npx tsx ui/components/landing/matrix/field.check.ts
import assert from "node:assert/strict";
import { FIELD, computeFrame, diversionColumn, gateColumns } from "./matrix-field.ts";

const SIZES: ReadonlyArray<readonly [number, number]> = [
  [127, 20], // 1512 x 254
  [110, 20], // 1320 x 254
  [33, 14], // 390 x 180
  [60, 10], // 128px compact strip
];
const CAUGHT_MAX = 14;

function count(frame: Uint8Array, tier: number): number {
  let n = 0;
  for (const v of frame) if (v === tier) n++;
  return n;
}

for (const [cols, rows] of SIZES) {
  const a = computeFrame(cols, rows, FIELD.T_STATIC);
  const b = computeFrame(cols, rows, FIELD.T_STATIC);
  assert.deepEqual(a, b, `deterministic ${cols}x${rows}`);
  const reused = computeFrame(cols, rows, FIELD.T_STATIC, new Uint8Array(cols * rows));
  assert.deepEqual(a, reused, "an output buffer changes nothing");
  assert.ok(count(a, 6) > 0, `caught cells at T_STATIC ${cols}x${rows}`);
  assert.ok(count(a, 5) > 0, `diverted branch at T_STATIC ${cols}x${rows}`);
  assert.ok(count(a, 3) + count(a, 4) > 0, "river payments present");

  const gate = gateColumns(cols);
  assert.equal(gate.last - gate.first + 1, FIELD.gateCols, "gate is gateCols wide");
  const xd = diversionColumn(cols);
  let seenCaught = 0;
  let seenBranch = 0;
  for (let t = 0; t < 60; t += 0.5) {
    const f = computeFrame(cols, rows, t);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tier = f[r * cols + c];
        if (tier === 6) {
          seenCaught++;
          assert.ok(c >= gate.first && c <= gate.last, "caught cells sit in the gate columns only");
        }
        if (tier === 5) {
          seenBranch++;
          assert.ok(c >= xd && c < gate.first, "branch cells run from the diversion to the gate");
        }
        assert.ok(c <= gate.last || (tier !== 5 && tier !== 6), "the branch is empty past the gate");
      }
    }
    assert.ok(count(f, 6) <= CAUGHT_MAX, `at most ${CAUGHT_MAX} caught cells per frame`);
  }
  assert.ok(seenCaught > 0 && seenBranch > 0, "branch and gate show over time");
}

const early = computeFrame(127, 20, 0);
const later = computeFrame(127, 20, 3);
assert.notDeepEqual(early, later, "the river flows");
process.exit(0);
