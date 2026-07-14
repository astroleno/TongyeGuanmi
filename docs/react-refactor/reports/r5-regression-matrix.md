# R5 Production Regression Matrix

Status: **pre-visual, untagged, unqualified.** Candidate-v2 through candidate-v8 are immutable historical/unqualified records. The current R5 `assets/` and `app/` excluding the non-runtime release CI contract test `app/src/production/release-manifest.test.ts` are identical to Batch C terminal `b62ba647cbf5402299cd0a5eef46fff152c48524`, but final manual visual review has not run and no current candidate exists. This matrix is therefore a future qualification contract, not a claim that current-HEAD exact-tag browser, RSS, or rollback gates passed.

Updated: 2026-07-14. Branch: `codex/react-refactor-r5-parity-cutover`. A new immutable candidate may be named and created once only after visual acceptance and the pre-freeze gate.

## Required Project Matrix

| Project | Canonical traversal | Critical reverse | Input/navigation | Media/lifecycle | SEO/no-JS | Current record |
|---|---|---|---|---|---|---|
| desktop Chromium | all 18 holds | AOD, Figure2, TTG/PH, Contact | wheel/touchpad, keyboard, menu, hash/history | normal/reduced, same-run reversal, retry, disposal | required | historical exact-v6: 22 pass / 2 declared skips; current candidate: none |
| desktop WebKit | all applicable holds | AOD, Figure2, TTG/PH | wheel/touchpad, keyboard, menu/history | decoded-frame handoff and depth readiness | required | historical exact-v6: 9 pass / 15 declared skips; current candidate: none |
| Pixel 7 Chromium | all applicable holds | Figure2, TTG/PH | touch drag, keyboard contract, touch menu | portrait/landscape/dynamic viewport, disposal | required | historical exact-v6: 13 pass / 11 declared skips; current candidate: none |
| iPhone 15 WebKit | all applicable holds | Figure2, TTG/PH | touch drag, keyboard contract, touch menu | portrait/landscape/dynamic viewport, decoded-frame handoff | required | historical exact-v6: 10 pass / 14 declared skips; current candidate: none |

Layer invariants are unchanged: at most two visible layers during transition, exactly one visible/interactable settled hold, bounded retiring layers, one canonical receiver root, and no Hero current/visible fallback during Contact reverse.

## R1–R22 Deterministic Ownership

The R1–R22 rows retain their implementation-level owners. Browser qualification is intentionally not carried across source identities; after final visual acceptance and a fresh pre-freeze gate, every applicable row must run again from the one newly frozen exact tag.

| ID | Assertion owners | Required proof |
|---|---|---|
| R1 AOD alpha | AOD progress tests; production browser suite | first third clears all paper backings while layer opacity and the single copy cue remain correct |
| R2 Crane 3000ms | manifest and group-7 tests | one 3000ms authority owns renderer, transition, media, and copy timing |
| R3 Hero ↔ Pattern motion | scene-motion tests; group-1 browser suite | visible Pattern revision advances in both directions and releases when hidden |
| R4 collapsed Pattern motion | Pattern → Star Map tests | wall-clock rotation remains live through staged pause/Ink and structural collapse stays deterministic |
| R5 Star Map Perlin/copy | Star Map progress tests; production browser suite | visible Perlin revision advances; hidden/reduced stops; copy opacity and actual color are opaque |
| R6 Ink lifecycle | shared/custom Ink lifecycle tests; pilot browser suite | fresh generation/context on repeated runs; context loss fails locally; no bare polygon continuation |
| R7 loader/Hero | loader sequence/controller/StoryLoader tests; production/performance browser suites | one lazy live Ink controller covers both phrases; bounded fallback/disposal; Hero intro starts once |
| R8 progressive nav | StoryNav tests; production browser suite | exact sibling DOM, seven blur layers+tint, committed visibility/inert/tab order |
| R9 reading ownership | gesture gate, reading handoff, input controller, production browser suite | content consumes physical pixels first and one owner controls the edge gesture |
| R10 10svh commitment | gesture gate/input tests; production browser suite | 9.9svh cannot fire; ordinary cadence crossing 10svh fires exactly once; all reset causes work |
| R11 footer/filing | SiteFooter/static-shell tests; no-JS suite; build verifier | interactive/static footer and MIIT link share one source |
| R12 favicon | global asset tests; build verifier | emitted SVG is byte-identical and never a data URL |
| R13 Contact recovery | recovery and Director tests; production browser suite | normal/failure/menu/hash races never make Hero current or visible |
| R14 reading entry | Director/Stage reading tests; production browser suite | forward/menu/hash top; reverse sequential exact bottom; one entry token |
| R15 Figure2 reverse/depth | directional controller, Figure2 progress/proof-chain/depth-mask tests; release suite | native direction surface presents decreasing intermediates; no seek storm; depth waits for ready mask |
| R16 fonts | global assets/static-shell tests; build verifier | emitted TTF identity, canonical tokens, no Inter-first or synthetic weight |
| R17 retained arch | retained-arch/proof-chain tests; Ink occlusion suite | one foreground arch stays outside masks and above Figure2 Ink until its authored exit |
| R18 PH/TTG reliability | directional controller, staged handoff, group-5/6 tests | same-run direction changes, delayed readiness, rejection, interruption, and stale callbacks remain generation-local |
| R19 TTG reverse surface | directional controller/TTG tests; alpha browser suite | fixed first reverse frame is presented before activation; intermediate playback; atomic forward-start restore |
| R20 edge-only grade | shared Ink tests; pilot/readback suites | production cover alpha is zero; dark remains explicit harness-only |
| R21 shared horizontal contour | contour/field/Ink/vendor tests; all consumers; readback suite | one per-run 128-sample contour drives complementary polygons and 1×128 texture; opaque aligned core at every sample; one upload/revision |
| R22 TTG/PH internal dissolve | staged handoff and group-5/6 tests; browser paths | 600ms two-surface dissolve in both directions; one receiver; zero internal Ink/mask/particles |

The reproduction/root-cause/minimum-file record is `../contract-diff/R5-production-parity-repair.md`.

## Final Commands

```bash
pnpm run verify:all
R5_CANDIDATE_TAG=<new-candidate-tag> \
R5_SOURCE_COMMIT="$(git rev-parse HEAD)" pnpm run deploy:build
pnpm -C app exec playwright test
pnpm -C app exec playwright test --config playwright.release.config.ts
```

Candidate-v2 recorded 44/44 default cases and 54 applicable release cases with 42 declared project skips; candidate-v4 recorded 42/44 default cases and stopped before release; candidate-v5 recorded 44/44 default, then 49 pass / 42 skip / 5 fail in release; candidate-v6 recorded 44/44 default and 54 pass / 42 skip in release but failed its remote identity setup. Candidate-v7 and candidate-v8 were later superseded by additional fail-closed/parity fixes. All v2–v8 records are immutable and unqualified; none qualifies the current pre-visual HEAD. A future candidate handoff must record fresh exact-tag counts and declared skips.

## Acceptance Boundary

No screenshot baseline or aesthetic acceptance is inferred from nonvisual gates. The current goal stops before final manual visual review and does not run this exact-tag matrix. Never move an old tag, create a candidate before visual/pre-freeze acceptance, merge/deploy by implication, create a cutover tag, or start R6.
