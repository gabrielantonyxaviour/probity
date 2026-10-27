# Upstream: Meterless H-MEM reference

- Repository: github.com/Meterless/Meterless
- Path: `engines/hmem/reference/src/*.ts` (10 files)
- Commit: `1742dec56a66e58eef9dda2d2b865823758ca8cd` (2026-10-19)
- Copied: 2026-10-27
- Status: unchanged; Apache-2.0; declared as pre-existing third-party code.
- `LICENSE` is the upstream Apache-2.0 text, byte-identical. No per-file headers were added.
- Conformance: `tests/engines/hmem/runner.ts` and `tests/engines/hmem/vectors/vectors.json` are the upstream
  `engines/hmem/conformance/{runner.ts,vectors/vectors.json}`, unchanged.
- Our module is `app/engines/hmem/index.ts` (a one-line re-export of this directory). H-MEM is optional
  (`ENABLE_HMEM=true`); the 16:00Z removal deletes this directory.

## sha256

    432e8b86ed0b5883d435e5ab4a12160d1f40d194cbdb4c119d3b710cbb0301a3  vendor/meterless/hmem/conflictDetection.ts
    d12594d667ec068690c6b81e020cd62ade91671316a1ab9b529259304aceb009  vendor/meterless/hmem/dreaming.ts
    89433327ee1075a8049bc8518cdf5cabf51ad67802e192266841cdee727b6d10  vendor/meterless/hmem/embeddings.ts
    9c481889afcdd70086d3bb3470842fa2330215e4d7760d826d103accdf8c1cdf  vendor/meterless/hmem/index.ts
    6072693d654ea1c34a9adbf6ce80101eeb1eeb56273d264f6ceb4859ffde6562  vendor/meterless/hmem/memoryMining.ts
    4fe120b1b64fe7225b9b28fda59514c114de9e885d22c5bf0aa035788b6d629d  vendor/meterless/hmem/memoryRetrieval.ts
    a1eac8de8c0fde0e503e1212f3cb98295a661c2a8bad93ad82e51985885e6fd0  vendor/meterless/hmem/memoryStore.ts
    3ce0d4f3233d0ad7c133a2cbaf39b6122467022e0aa378a160a0d463e2264cef  vendor/meterless/hmem/sleepCycle.ts
    263253dd3342c488ce773d7e728d77aec983c1833873602b59ce1a6c7999e20e  vendor/meterless/hmem/trustLedger.ts
    becb504870a67646a20a421ffe04d8732db63418393423d2186c074b182f54c7  vendor/meterless/hmem/types.ts
    63e29fc8231b53757a77fbc371071c91d768621efa1e68b1d9ff8d1bb7c4a0ef  vendor/meterless/hmem/LICENSE
