# tests/judge

`bash tests/judge/judge-sim.sh [--local] [--steps J-1,J-3] [--keep] [--force]` does what a judge does (spec 07 section 3.7) on a fresh clone in a scratch directory: clone, README blocks, image builds, the sample stack on ports 18787/13100, S1 across a restart (no R5), every shipped input, the keyless live refusal, an offline container run, `npm ci`, `npm test`. Docker work is limited to compose project `probity-judge` and its images; there is no prune and nothing else is stopped.

- `--local` clones the local HEAD (use while the GitHub repository is private; uncommitted work is not tested).
- Host installs need `JUDGE_MIN_FREE_GB` (default 6) free disk; otherwise those steps print SKIP with the reason.
- A step whose input does not exist yet (an image that does not build, a missing spec file) prints FAIL, never SKIP.
- `readme-blocks.sh README.md judge [N]` prints the fenced blocks that follow a `<!-- judge-run -->` marker.
- Reports are written to `tests/judge/results/` (git-ignored).
