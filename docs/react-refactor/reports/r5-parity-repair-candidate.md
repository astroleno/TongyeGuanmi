# R5 Production Parity Repair Candidate

Status: **candidate-v6 is immutable and unqualified after its remote tag workflow failed the annotated-tag identity setup.** Candidate-v2 remains immutable `NEEDS WORK`; candidate-v3/v4/v5 remain immutable and unqualified. V6 locally passed identity-bound RSS/finalization, exact HTTP smokes, same-port rollback, 44/44 default E2E, and 54/54 applicable release E2E with 42 project-declared skips. GitHub Actions run `29227154713` then showed that `actions/checkout@v4` first fetched tag object `07fa7f1`, but subsequently forced peeled commit `04e5c98` into the local tag ref; `deploy:prepare` correctly rejected that lightweight ref before memory, E2E, or upload. Commit `6b4b238` explicitly restores the remote annotated ref and verifies its type and peeled source, reserving `react-refactor-r5-parity-repair-candidate-v7` for a complete repeat before HITL review.

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
| v7 CI identity closure head | `6b4b238` |
| reserved successor | `react-refactor-r5-parity-repair-candidate-v7` |
| deployable directory | identity-bound `dist/` from the clean exact tag only |
| release manifest | `dist/r5-release-manifest.json`, schema 3; final status must be `qualified` |

Candidate-v2 source commit is `0dc2a87b69af39a9a3960488fda56f6af664b54d`, annotated tag object is `c31e464215bab4ea36e1884a59ded46e8a07ce63`, and manifest SHA-256 is `5b1f5815d6ac85a1291e4c6c7c7ba168620f590473569475a1c159b9c264f24e`. These identities remain audit records, not approval evidence.

Candidate-v3 exact RSS passed at `1,491,533,824B` with tag object/source/artifact/draft identity correctly bound. Finalization then rejected `sourceDirty: true`; no qualified v3 manifest or upload exists. Commit `e71b970` makes release evidence dist-only, asserts the runner cannot write the tracked archive, and moves candidate E2E behind finalization.

Candidate-v4 qualified its schema-3 artifact and memory evidence (`1,423,048,704B` browser-tree peak RSS), then passed exact root/no-JS/old-URL/media-range smokes and exact-v4 → legacy → byte-identical exact-v4 rollback on port `4173`. The final default Playwright matrix passed 42/44. Figure2 reverse completion was blank because transition disposal parked every video after the hold commit; the TTG first-pause assertion still counted only videos even though the qualified memory design intentionally owns the terminal still during reverse preparation. The release matrix was not run. V4 remains immutable and unqualified.

Candidate-v5 qualified the corrected runtime at `1,475,641,344B` browser-tree peak RSS, finalized the schema-3 artifact, passed exact root/footer/no-JS/direct-hash/old-URL/media-range smokes, and passed exact-v5 → legacy → byte-identical exact-v5 rollback on port `4173`. The final default matrix passed 44/44. The four-project release matrix then passed 49 applicable cases, declared 42 project skips, and failed 5 cases: the TTG terminal-still assertion in all four projects and the AOD endpoint-reconstruction assertion in desktop Chromium. Because any final matrix failure is fail-closed, v5 remains immutable and unqualified even though the runtime behavior matched the documented contracts.

Candidate-v6 qualified the corrected release oracles locally at `1,495,842,816B` browser-tree peak RSS, finalized the schema-3 artifact, passed exact root/footer/no-JS/direct-hash/old-URL/media-range smokes, and passed exact-v6 → legacy → byte-identical exact-v6 rollback on port `4173`. Its final default matrix passed 44/44; the four-project release matrix passed all 54 applicable cases with 42 declared skips. The tag-triggered GitHub Actions run nevertheless failed before `deploy:prepare`: checkout fetched the correct annotated object and then overwrote `refs/tags/react-refactor-r5-parity-repair-candidate-v6` with its peeled commit. Because remote workflow qualification and upload are mandatory, local green evidence cannot waive that failure; v6 remains immutable and unqualified.

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

None may be moved or repointed. Candidate-v7 must be a new annotated tag on a newly qualified source commit.

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

The following pre-freeze evidence was regenerated from the corrected branch source; historical pass counts were not carried forward:

| Gate | Required result | Current record |
|---|---|---|
| root `pnpm run verify:all` | full tests, lint, typecheck, build, release/static checks, and budgets pass | exact v6 passed 83 Vitest files / 568 tests plus lint, typecheck, build, release/static checks, and frozen budgets; v7 repeat pending |
| final default browser matrix | all historical/harness contracts pass on exact v7 | exact v6 passed 44/44; v7 rerun pending and last |
| final four-project release matrix | every applicable desktop/mobile Chromium/WebKit case passes; skips are declared only by project applicability | exact v6 passed 54/54 applicable with 42 declared skips; v7 pending and last |
| focused HITL closure | ordinary input and AOD/Figure2/TTG/PH/Ink lifecycle contracts pass | exact v6 passed all default/release cases; v7 exact-tag rerun pending |
| process memory/disposal | all 18 holds forward/reverse remain below `1,500,000,000B` | exact v6 passed `1,495,842,816B`; v7 rerun required because source changed |
| lifecycle code review | preparing input, timeout/abort/error, dispose generation, hold re-entry, presented frame, and depth Ink are closed | pass by code and 568-test suite |
| release upload gate | checkout restores the remote annotated object; memory evidence is mandatory and bound to exact tag/source/artifact/draft manifest | v6 failed remote setup; `6b4b238` contract test and clobbered-ref simulation pass; v7 workflow pending |
| exact-tag build/smokes | annotated tag peels to clean source; manifest qualification and root/no-JS/hash/media smokes pass | local v6 passed; pending v7 freeze and remote workflow |
| same-port rollback | exact v7 → immutable legacy → byte-identical exact v7 | v6 passed; pending v7 repeat |

The earlier matrix split (desktop Chromium 21 / 3 declared skips, desktop WebKit 9 / 15, Pixel 7 Chromium 13 / 11, iPhone 15 WebKit 11 / 13) is historical candidate-v2 evidence only. V5's 49 pass / 42 skip / 5 fail and v6's local 54 pass / 42 skip records are audit history, not v7 qualification; both browser suites run last from exact v7. The v6 memory profile retained 3 maximum mounted layers and 1 maximum settled WebGL context; its GPU process peaked at `349,093,888B`, renderer at `843,776,000B`, heap at `39,458,674B`, and canvas ownership at `11,657,408` pixels.

## Freeze And Stop Boundary

Commit and push this fail-closed/pre-freeze record, create the new annotated `react-refactor-r5-parity-repair-candidate-v7`, then require restored annotated-tag identity in CI, identity-bound memory, exact-tag smokes, same-port rollback, and final exact-tag E2E. Any failure leaves v7 unqualified and forbids a passed handoff.

This closure does not authorize moving any tag, merging or deploying `main`, creating `react-refactor-r5-cutover`, or starting R6 cleanup.
