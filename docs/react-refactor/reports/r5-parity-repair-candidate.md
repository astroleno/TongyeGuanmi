# R5 Production Parity Repair Candidate

Status: **candidate-v2 is immutable but `NEEDS WORK`; HITL rejected.** The exact tag/commit/manifest identity is valid, but exact-tag RSS repeated above the frozen aggregate budget and code review found five P1 lifecycle/release blockers. Candidate-v2 must not move or be published as qualified. The reserved successor is `react-refactor-r5-parity-repair-candidate-v3`, created only after the v3 closure plan passes in full.

## Candidate Identity Boundary

| Item | Value |
|---|---|
| branch | `codex/react-refactor-r5-parity-cutover` |
| repair base | `59065730712c6d9718928fd25cba23e33455395e` |
| rejected HITL head | `2501704d63dbd7c150861d21a31c2d39525c23e5` |
| rejected candidate | `react-refactor-r5-parity-repair-candidate-v2` |
| source commit | `0dc2a87b69af39a9a3960488fda56f6af664b54d` |
| annotated tag object | `c31e464215bab4ea36e1884a59ded46e8a07ce63` |
| reserved successor | `react-refactor-r5-parity-repair-candidate-v3` |
| deployable directory | identity-bound `dist/` from the clean exact tag only |
| release manifest | `dist/r5-release-manifest.json`, schema 2, `sourceDirty: false` |

Candidate-v2 source commit is `0dc2a87b69af39a9a3960488fda56f6af664b54d`, annotated tag object is `c31e464215bab4ea36e1884a59ded46e8a07ce63`, and manifest SHA-256 is `5b1f5815d6ac85a1291e4c6c7c7ba168620f590473569475a1c159b9c264f24e`. These identities remain audit records, not approval evidence.

## Candidate-v2 Review Blockers

- Candidate CI did not require RSS evidence, and the memory report/manifest did not bind commit, tag object, artifact digest, and memory pass into one upload gate.
- Production input swallowed opposing wheel/key/touch input while Director was `preparing`.
- Staged media preparation had no per-leg timeout, abort signal, or complete seek/error rejection path.
- TTG/PH/Figure2 preparation could mutate or activate a stale surface after timeline disposal.
- Figure2 park removed every active surface while `renderFigure2Hold()` did not restore the canonical forward posters.
- The 80ms video-frame fallback could report readiness without a presented frame, and Figure2 depth Ink did not fail its segment on renderer invalidation.

Exact-tag process-tree RSS samples were `1,527,169,024B` and `1,575,190,528B`, both above the `1,500,000,000B` budget. GPU, renderer, heap, layers, WebGL, and browser E2E budgets remained inside their component limits, but that does not waive the aggregate release gate.

## Immutable Historical Candidates

| Tag | Peeled commit | Status |
|---|---|---|
| `react-refactor-r5-candidate` | `0de4972de64455a14d8c36262e58cc6af5c4875b` | superseded; no parity repair |
| `react-refactor-r5-candidate-v2` | `a5bef3785b766dac0e5ecfc95e96d03cd5c51c90` | superseded; no parity repair |
| `react-refactor-r5-candidate-v3` | `59065730712c6d9718928fd25cba23e33455395e` | repair base only |
| `react-refactor-r5-parity-repair-candidate` | `18490690992bffef6c9705cd47438b9cd17e756a` | superseded by the rejected HITL findings; predates this closure |
| `react-refactor-r5-parity-repair-candidate-v2` | `0dc2a87b69af39a9a3960488fda56f6af664b54d` | immutable `NEEDS WORK`; RSS/lifecycle gates failed |

None may be moved or repointed. Candidate-v3 must be a new annotated tag on a newly qualified source commit.

## Closure Delivered

- One cadence-independent physical gesture owner for reading edges and ordinary holds; 10svh emits exactly one Director intent and all lifecycle reset causes are explicit.
- Presented-frame leg preparation shared by AOD, Figure2, TTG, and staged media; Figure2 uses native direction-specific surfaces and depth ownership waits for mask readiness.
- TTG/PH same-run reversal and receiver-entry ownership are fixed without restoring chapter-internal Ink.
- One lazy app-owned loader Ink controller owns font readiness, text masks, FBM/wet edge/droplets, context loss, fallback, and complete disposal; Hero intro starts once.
- Star Map production copy is opaque while Perlin remains independently motion-leased.
- Horizontal Generic Ink uses one per-run 128-sample contour for complementary DOM ownership and a 1×128 texture, with an aligned opaque core, one upload per revision, zero production cover alpha, and typed renderer failure.
- The canonical 18 holds / 17 segments, ids, hashes, copy, Director/SegmentPlayer/Stage/LayerWindow architecture, lazy production/harness boundary, and no-JS shell are unchanged.

Detailed reproduction, root causes, ownership, and corrected contracts are in `../contract-diff/R5-production-parity-repair.md`.

## Qualification Gate

The following pre-freeze evidence was regenerated from the corrected branch source; historical pass counts were not carried forward:

| Gate | Required result | Current record |
|---|---|---|
| root `pnpm run verify:all` | full tests, lint, typecheck, build, release/static checks, and budgets pass | pass: 82 Vitest files / 545 tests, lint, typecheck, builds, release/static checks, and frozen budgets |
| default browser matrix | all historical/harness contracts pass | pass: 44 / 44 |
| four-project release matrix | every applicable desktop/mobile Chromium/WebKit case passes; skips are declared only by project applicability | pass: 54 applicable / 54; 42 declared project skips |
| focused HITL closure | ordinary input, AOD/Figure2/TTG/PH direction changes, loader Ink, receiver uniqueness, and horizontal readback pass | pass on desktop and mobile Chromium; first-decode/activation reported separately from steady playback |
| frame pacing | focused first-decode and steady-playback samples stay inside the frozen budgets | pass: desktop aggregate p95 17.5ms, 2 / 759 over 50ms; mobile p95 18.2ms, 2 / 758 |
| process memory/disposal | all 18 holds forward/reverse; parked reverse surfaces and denser contour remain bounded | **fail:** exact-tag tree RSS 1,527,169,024B and 1,575,190,528B; historical branch repeat 1,451,737,088B does not override exact failures |
| lifecycle code review | preparing input, timeout/abort/error, dispose generation, and hold re-entry are closed | **fail:** five P1 and two P2 blockers recorded above |
| exact-tag build/smokes | annotated tag peels to clean source; identity-bound manifest and root/no-JS/hash/media smokes pass | pass for v2 identity; insufficient without RSS/lifecycle gates |
| same-port rollback | candidate-v2 → immutable legacy → identical candidate-v2 | pass for v2 artifact; insufficient without RSS/lifecycle gates |

The release matrix split is desktop Chromium 21 pass / 3 declared skips, desktop WebKit 9 / 15, Pixel 7 Chromium 13 / 11, and iPhone 15 WebKit 11 / 13. Four-project no-JS passed. The historical qualifying memory repeat recorded 3 maximum mounted layers, 1 maximum settled WebGL context, and a disposed Contact snapshot of 2 layers / 0 WebGL / 2 videos with 3 canvases and 2 videos released; the later exact-tag aggregate RSS failures are authoritative for v2 release status.

## Freeze And Stop Boundary

Implement `../../plans/2026-07-13-003-fix-r5-candidate-v3-lifecycle-gates-plan.md`, then create a new annotated `react-refactor-r5-parity-repair-candidate-v3` only if identity-bound memory, exact-tag smokes, same-port rollback, and final exact-tag E2E all pass.

This closure does not authorize moving any tag, merging or deploying `main`, creating `react-refactor-r5-cutover`, or starting R6 cleanup.
