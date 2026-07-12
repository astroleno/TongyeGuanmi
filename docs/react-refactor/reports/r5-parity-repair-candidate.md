# R5 Production Parity Repair Candidate

Status: **pre-freeze automated qualification passed; candidate-v2 freeze authorized.** The nine HITL regressions reported against `2501704d63dbd7c150861d21a31c2d39525c23e5` have implementation and automated closure. Exact-tag identity, rollback, and the final E2E rerun are recorded in the external handoff because they can only be generated after the immutable tag exists. User HITL approval remains pending.

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

The following pre-freeze evidence was regenerated from the corrected branch source; historical pass counts were not carried forward:

| Gate | Required result | Current record |
|---|---|---|
| root `pnpm run verify:all` | full tests, lint, typecheck, build, release/static checks, and budgets pass | pass: 82 Vitest files / 545 tests, lint, typecheck, builds, release/static checks, and frozen budgets |
| default browser matrix | all historical/harness contracts pass | pass: 44 / 44 |
| four-project release matrix | every applicable desktop/mobile Chromium/WebKit case passes; skips are declared only by project applicability | pass: 54 applicable / 54; 42 declared project skips |
| focused HITL closure | ordinary input, AOD/Figure2/TTG/PH direction changes, loader Ink, receiver uniqueness, and horizontal readback pass | pass on desktop and mobile Chromium; first-decode/activation reported separately from steady playback |
| frame pacing | focused first-decode and steady-playback samples stay inside the frozen budgets | pass: desktop aggregate p95 17.5ms, 2 / 759 over 50ms; mobile p95 18.2ms, 2 / 758 |
| process memory/disposal | all 18 holds forward/reverse; parked reverse surfaces and denser contour remain bounded | pass on clean repeat: tree RSS 1,451,737,088B; GPU 351,125,504B; renderer 755,056,640B; heap 39,200,008B → 11,967,697B |
| exact-tag build/smokes | annotated tag peels to clean source; identity-bound manifest and root/no-JS/hash/media smokes pass | post-freeze external record required |
| same-port rollback | candidate-v2 → immutable legacy → identical candidate-v2 | post-freeze external record required |

The release matrix split is desktop Chromium 21 pass / 3 declared skips, desktop WebKit 9 / 15, Pixel 7 Chromium 13 / 11, and iPhone 15 WebKit 11 / 13. Four-project no-JS passed. The accepted process-memory repeat also recorded 3 maximum mounted layers, 1 maximum settled WebGL context, and a disposed Contact snapshot of 2 layers / 0 WebGL / 2 videos with 3 canvases and 2 videos released. One earlier host-contaminated tree-RSS sample of 1,537,753,088B was invalidated and repeated from a fresh browser boundary as permitted by the evidence rule.

## Freeze And Stop Boundary

Create and push the new annotated tag `react-refactor-r5-parity-repair-candidate-v2`, build with explicit `R5_CANDIDATE_TAG` and `R5_SOURCE_COMMIT`, record the external source/tag/manifest identity, run exact-tag smokes, same-port rollback, and the final exact-tag E2E, then stop for user HITL.

This closure does not authorize moving any tag, merging or deploying `main`, creating `react-refactor-r5-cutover`, or starting R6 cleanup.
