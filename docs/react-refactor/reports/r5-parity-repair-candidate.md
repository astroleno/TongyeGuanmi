# R5 Production Parity Repair Candidate

Status: **current R5 is pre-visual, untagged, and unqualified.** Candidate-v2 through candidate-v8 remain immutable historical/unqualified records; the detailed v2–v6 facts below are retained without being rewritten as passes for any later source. Batch B/C are now integrated into the sole R5 stage branch, Batch A provenance remains on its independent remote branch, and current `assets/` plus production runtime implementation under `app/src/` excluding tests equal `b62ba647cbf5402299cd0a5eef46fff152c48524`. Release-control workflow/tests/tooling changes are outside the browser runtime payload. Final manual visual review has not run. No new candidate, current-HEAD RSS/finalization, rollback, exact-tag matrix, production cutover, or deployment is claimed.

## Candidate Identity Boundary

| Item | Value |
|---|---|
| branch | `codex/react-refactor-r5-parity-cutover` |
| repair base | `59065730712c6d9718928fd25cba23e33455395e` |
| rejected HITL head | `2501704d63dbd7c150861d21a31c2d39525c23e5` |
| rejected candidate | `react-refactor-r5-parity-repair-candidate-v2` |
| rejected v2 source / tag object | `0dc2a87b69af39a9a3960488fda56f6af664b54d` / `c31e464215bab4ea36e1884a59ded46e8a07ce63` |
| unqualified v3 source / tag object | `dee30b9275ecbd3b238b37dee0ea0c8cfd944427` / `f08ca22736fb43bcb988b9b67404bc9fa165e422` |
| unqualified v4 source / tag object | `905a4ef8f7c90cb64307587e00c6ff2ee4af4d99` / `e3b38639e214d0d9f07bc07595bf18a5c28faba5` |
| v4 qualified manifest / artifact tree | `200eed43753d6d48b2b56c647adc57285f4addd0784d2275c51cac17388a68c5` / `ff2e5b09c2e4ea796d3841a482c9c667bdcc46b320dfacb5207f43cc4c1c61b4` |
| unqualified v5 source / tag object | `a97369d1cfccff3f2e57b568714a01b42984affc` / `e3761e369697802482d22394b3cd970d8851f603` |
| v5 qualified manifest / memory evidence | `40180fac4a8e9ee8b926a976d884b1f3472ab0ac407dc11d0ba435fbb81447e4` / `340c23899669a6e48ebd3850f37b97b9f6a0b57c53498fad9574c746a8f25961` |
| v5 artifact tree / dist fingerprint | `ffbecc3a25d576a4196549889bd1d6fcd1ab709018531da0da140f3b6372a1e9` / `a2a0665efbf1cba6dd8f558e43ee430857cae018281b6be58c1799b399a84d98` |
| v5 manifest files / bytes | 102 / 159,680,911 |
| unqualified v6 source / tag object | `04e5c98172c90ec13a12024c5b5808bdff45e17a` / `07fa7f185efcf03540e1a866a8f37794f1b849d0` |
| v6 local manifest / memory evidence | `095096255a98efabfc0fb00a2efe0892fbfba689102403cc31fdf2f65a291069` / `c238b7be6e3f104197c899f3e2fb03986e68b389e1afc438a6be60f3aa3e2231` |
| v6 artifact tree / dist fingerprint | `ffbecc3a25d576a4196549889bd1d6fcd1ab709018531da0da140f3b6372a1e9` / `5b2bb07662e8ce16bdc4b926df154cb8190296bf6a6405eed759792027c7a204` |
| v6 manifest files / bytes | 102 / 159,680,911 |
| v6 failed workflow | `29227154713`; annotated ref overwritten before `deploy:prepare` |
| unqualified v7 source / tag object | `d0daed5adb83fbeff7c61e0e351673fc4dea4ff5` / `2f8049a3e83b393de0056287cdc16e8d79986ddf` |
| unqualified v8 source / tag object | `9a602e9fab2199ff2aa8753d46a25e0fc0f9d9c1` / `a8a8a86adb3a8dc63220e0d045115814ad18cd7e` |
| current R5 state | pre-visual / untagged / unqualified |
| current runtime/assets tree | `assets/` and production runtime implementation under `app/src/` excluding tests are identical to Batch C terminal `b62ba647cbf5402299cd0a5eef46fff152c48524`; release-control workflow/tests/tooling are outside this identity boundary |
| next candidate | none created; one new immutable tag only after visual acceptance and pre-freeze gate |
| deployable directory | identity-bound `dist/` from the clean exact tag only |
| release manifest | future candidate only: `dist/r5-release-manifest.json`, schema 3; final status must be `qualified` |

Candidate-v2 source commit is `0dc2a87b69af39a9a3960488fda56f6af664b54d`, annotated tag object is `c31e464215bab4ea36e1884a59ded46e8a07ce63`, and manifest SHA-256 is `5b1f5815d6ac85a1291e4c6c7c7ba168620f590473569475a1c159b9c264f24e`. These identities remain audit records, not approval evidence.

Candidate-v3 exact RSS passed at `1,491,533,824B` with tag object/source/artifact/draft identity correctly bound. Finalization then rejected `sourceDirty: true`; no qualified v3 manifest or upload exists. Commit `e71b970` makes release evidence dist-only, asserts the runner cannot write the tracked archive, and moves candidate E2E behind finalization.

Candidate-v4 qualified its schema-3 artifact and memory evidence (`1,423,048,704B` browser-tree peak RSS), then passed exact root/no-JS/old-URL/media-range smokes and exact-v4 → legacy → byte-identical exact-v4 rollback on port `4173`. The final default Playwright matrix passed 42/44. Figure2 reverse completion was blank because transition disposal parked every video after the hold commit; the TTG first-pause assertion still counted only videos even though the qualified memory design intentionally owns the terminal still during reverse preparation. The release matrix was not run. V4 remains immutable and unqualified.

Candidate-v5 qualified the corrected runtime at `1,475,641,344B` browser-tree peak RSS, finalized the schema-3 artifact, passed exact root/footer/no-JS/direct-hash/old-URL/media-range smokes, and passed exact-v5 → legacy → byte-identical exact-v5 rollback on port `4173`. The final default matrix passed 44/44. The four-project release matrix then passed 49 applicable cases, declared 42 project skips, and failed 5 cases: the TTG terminal-still assertion in all four projects and the AOD endpoint-reconstruction assertion in desktop Chromium. Because any final matrix failure is fail-closed, v5 remains immutable and unqualified even though the runtime behavior matched the documented contracts.

Candidate-v6 qualified the corrected release oracles locally at `1,495,842,816B` browser-tree peak RSS, finalized the schema-3 artifact, passed exact root/footer/no-JS/direct-hash/old-URL/media-range smokes, and passed exact-v6 → legacy → byte-identical exact-v6 rollback on port `4173`. Its final default matrix passed 44/44; the four-project release matrix passed all 54 applicable cases with 42 declared skips. The tag-triggered GitHub Actions run nevertheless failed before `deploy:prepare`: checkout fetched the correct annotated object and then overwrote `refs/tags/react-refactor-r5-parity-repair-candidate-v6` with its peeled commit. Because remote workflow qualification and upload are mandatory, local green evidence cannot waive that failure; v6 remains immutable and unqualified.

Candidate-v7 is fixed at `d0daed5adb83fbeff7c61e0e351673fc4dea4ff5`. Follow-up review found that reverse Figure2 depth Ink had no active person surfaces and that empty Ubuntu RSS samples could incorrectly pass; later commits closed those issues. Candidate-v7 therefore remains immutable and unqualified.

Candidate-v8 is fixed at `9a602e9fab2199ff2aa8753d46a25e0fc0f9d9c1`. The R5 branch subsequently added slow-gesture, Hero/media continuity, multiscale Ink, and transition-regression fixes before the Batch B/C asset chain. No v8 evidence is carried forward to that later source identity, so v8 remains immutable and unqualified.

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
| `react-refactor-r5-parity-repair-candidate-v3` | `dee30b9275ecbd3b238b37dee0ea0c8cfd944427` | immutable unqualified; RSS passed, dirty-tree finalization failed closed |
| `react-refactor-r5-parity-repair-candidate-v4` | `905a4ef8f7c90cb64307587e00c6ff2ee4af4d99` | immutable unqualified; RSS/finalization/rollback passed, final default E2E failed 2/44 |
| `react-refactor-r5-parity-repair-candidate-v5` | `a97369d1cfccff3f2e57b568714a01b42984affc` | immutable unqualified; RSS/finalization/rollback/default E2E passed, release E2E failed 5/54 applicable cases |
| `react-refactor-r5-parity-repair-candidate-v6` | `04e5c98172c90ec13a12024c5b5808bdff45e17a` | immutable unqualified; all local exact gates passed, remote workflow lost annotated tag identity before prepare |
| `react-refactor-r5-parity-repair-candidate-v7` | `d0daed5adb83fbeff7c61e0e351673fc4dea4ff5` | immutable unqualified; follow-up review found Figure2 depth-surface and RSS fail-closed gaps |
| `react-refactor-r5-parity-repair-candidate-v8` | `9a602e9fab2199ff2aa8753d46a25e0fc0f9d9c1` | immutable unqualified; superseded by later parity fixes and the Batch B/C source identity |

None may be moved or repointed. The next candidate must use one new annotated tag created once, only after final visual acceptance and the fresh pre-freeze gate.

## Closure Delivered

- One cadence-independent physical gesture owner for reading edges and ordinary holds; 10svh emits exactly one Director intent and all lifecycle reset causes are explicit.
- Presented-frame leg preparation shared by AOD, Figure2, TTG, and staged media; Figure2 uses native direction-specific surfaces and depth ownership waits for mask readiness.
- TTG/PH same-run reversal and receiver-entry ownership are fixed without restoring chapter-internal Ink.
- One lazy app-owned loader Ink controller owns font readiness, text masks, FBM/wet edge/droplets, context loss, fallback, and complete disposal; Hero intro starts once.
- Star Map production copy is opaque while Perlin remains independently motion-leased.
- Horizontal Generic Ink uses one per-run 128-sample contour for complementary DOM ownership and a 1×128 texture, with an aligned opaque core, one upload per revision, zero production cover alpha, and typed renderer failure.
- The canonical 18 holds / 17 segments, ids, hashes, copy, Director/SegmentPlayer/Stage/LayerWindow architecture, lazy production/harness boundary, and no-JS shell are unchanged.
- SegmentPlayer now owns a timeout and abort signal for every staged leg; strict frame readiness rejects seek, media, abort, and missing-frame-callback failures.
- Preparation is invisible until a synchronous commit. Stale/disposed Figure2, TTG, and PH work cannot reactivate old surfaces; Figure2 hold and depth Ink restore/fail deterministically.
- Opposing production input reaches the Director during `preparing`; candidate workflow upload is gated by exact commit/tag/artifact/draft-manifest memory identity.
- TTG uses an exact decoded terminal still plus visually precomposited foreground layers, and inactive/disposed directional decoders are reset. Three fresh-browser preflights pass the unchanged `1,500,000,000B` RSS ceiling.

Detailed reproduction, root causes, ownership, and corrected contracts are in `../contract-diff/R5-production-parity-repair.md`.

## Qualification Gate

The current handoff deliberately stops before visual review and candidate freeze. Historical pass counts are not carried forward:

| Gate | Required result | Current record |
|---|---|---|
| final pre-visual nonbrowser gate | full tests, lint, typecheck, build, release/static checks, inventory, references, and budgets pass | required on final untagged HEAD; final handoff records the result |
| runtime/assets identity | no `assets/` or non-test production runtime difference under `app/src/` from Batch C terminal | required: exact equality with `b62ba647cbf5402299cd0a5eef46fff152c48524`; release-control workflow/tests/tooling are checked separately |
| final manual visual | user reviews the unchanged Batch C production/runtime tree | not run; next action |
| new candidate freeze | one fresh annotated tag after visual acceptance and pre-freeze gate | not created |
| process memory/disposal | all 18 holds forward/reverse remain below `1,500,000,000B` | not run for current HEAD; historical results do not qualify it |
| exact-tag browser matrices | every applicable desktop/mobile Chromium/WebKit case passes | not run because no current candidate exists |
| exact-tag build/smokes and upload | annotated tag, source, artifact, memory, and manifest identities agree | not run because no current candidate exists |
| same-port rollback | exact candidate → immutable legacy → byte-identical exact candidate | not run because no current candidate exists |

The earlier matrix split (desktop Chromium 21 / 3 declared skips, desktop WebKit 9 / 15, Pixel 7 Chromium 13 / 11, iPhone 15 WebKit 11 / 13) is historical candidate-v2 evidence only. V5's 49 pass / 42 skip / 5 fail and v6's local 54 pass / 42 skip records remain audit history, not current qualification. The v6 memory profile retained 3 maximum mounted layers and 1 maximum settled WebGL context; its GPU process peaked at `349,093,888B`, renderer at `843,776,000B`, heap at `39,458,674B`, and canvas ownership at `11,657,408` pixels.

## Freeze And Stop Boundary

Commit and push the pre-visual R5 branch without creating a tag, then stop at the final manual visual entry. If visual review passes, rerun the pre-freeze gate and create exactly one new annotated candidate; only that future identity may enter CI, identity-bound memory, exact-tag smokes, same-port rollback, and final exact-tag E2E.

This handoff does not authorize moving any tag, running qualification early, merging or deploying `main`, creating `react-refactor-r5-cutover`, or starting R6 cleanup.
