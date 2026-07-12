# R5 Production Parity Repair Candidate

Status: **candidate-v2 requalification in progress.** The nine HITL regressions reported against `2501704d63dbd7c150861d21a31c2d39525c23e5` have implementation-level closure, but no new candidate is accepted until the complete gate is regenerated from one clean exact source.

## Candidate Identity Boundary

| Item | Value |
|---|---|
| branch | `codex/react-refactor-r5-parity-cutover` |
| repair base | `59065730712c6d9718928fd25cba23e33455395e` |
| rejected HITL head | `2501704d63dbd7c150861d21a31c2d39525c23e5` |
| reserved new candidate | `react-refactor-r5-parity-repair-candidate-v2` |
| source commit | resolved by `git rev-parse react-refactor-r5-parity-repair-candidate-v2^{commit}` after freeze |
| annotated tag object | resolved by `git rev-parse refs/tags/react-refactor-r5-parity-repair-candidate-v2` after freeze |
| deployable directory | identity-bound `dist/` from the clean exact tag only |
| release manifest | `dist/r5-release-manifest.json`, schema 2, `sourceDirty: false` |

The manifest digest is recorded outside the tagged source because the manifest contains the source commit identity. Embedding that digest in the same commit would be self-referential.

## Immutable Historical Candidates

| Tag | Peeled commit | Status |
|---|---|---|
| `react-refactor-r5-candidate` | `0de4972de64455a14d8c36262e58cc6af5c4875b` | superseded; no parity repair |
| `react-refactor-r5-candidate-v2` | `a5bef3785b766dac0e5ecfc95e96d03cd5c51c90` | superseded; no parity repair |
| `react-refactor-r5-candidate-v3` | `59065730712c6d9718928fd25cba23e33455395e` | repair base only |
| `react-refactor-r5-parity-repair-candidate` | `18490690992bffef6c9705cd47438b9cd17e756a` | superseded by the rejected HITL findings; predates this closure |

None may be moved, repointed, or published as candidate-v2.

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

The following evidence must come from the final source; historical pass counts are not carried forward:

| Gate | Required result | Current record |
|---|---|---|
| root `pnpm run verify:all` | full tests, lint, typecheck, build, release/static checks, and budgets pass | pending final exact-source run |
| default browser matrix | all historical/harness contracts pass | pending final run |
| four-project release matrix | every applicable desktop/mobile Chromium/WebKit case passes; skips are declared only by project applicability | pending final run |
| focused HITL closure | ordinary input, AOD/Figure2/TTG/PH direction changes, loader Ink, receiver uniqueness, and horizontal readback pass | pending final run |
| frame pacing | focused first-decode and steady-playback samples stay inside the frozen budgets | pending final run |
| process memory/disposal | all 18 holds forward/reverse; parked reverse surfaces and denser contour remain bounded | pending final run |
| exact-tag build/smokes | annotated tag peels to clean source; identity-bound manifest and root/no-JS/hash/media smokes pass | pending candidate freeze |
| same-port rollback | candidate-v2 → immutable legacy → identical candidate-v2 | pending candidate freeze |

## Freeze And Stop Boundary

After every pre-freeze gate passes, create and push the new annotated tag `react-refactor-r5-parity-repair-candidate-v2`, build with explicit `R5_CANDIDATE_TAG` and `R5_SOURCE_COMMIT`, record the external manifest digest, run exact-tag smokes and rollback, then stop for user HITL.

This closure does not authorize moving any tag, merging or deploying `main`, creating `react-refactor-r5-cutover`, or starting R6 cleanup.
