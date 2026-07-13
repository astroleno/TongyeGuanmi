# R5 Production Regression Matrix

Status: **candidate-v4 deterministic contracts and nonbrowser gate pass; final browser qualification is pending.** Candidate-v3 failed closed before E2E because manifest finalization rejected a dirty tree. Browser counts from candidate-v2 and earlier heads remain historical only. Both v4 Playwright suites run last from the immutable exact tag.

Date: 2026-07-13. Branch: `codex/react-refactor-r5-parity-cutover`. Intended immutable tag after all gates pass: `react-refactor-r5-parity-repair-candidate-v4`.

## Required Project Matrix

| Project | Canonical traversal | Critical reverse | Input/navigation | Media/lifecycle | SEO/no-JS | Current record |
|---|---|---|---|---|---|---|
| desktop Chromium | all 18 holds | AOD, Figure2, TTG/PH, Contact | wheel/touchpad, keyboard, menu, hash/history | normal/reduced, same-run reversal, retry, disposal | required | pending exact-v4 run |
| desktop WebKit | all applicable holds | AOD, Figure2, TTG/PH | wheel/touchpad, keyboard, menu/history | decoded-frame handoff and depth readiness | required | pending exact-v4 run |
| Pixel 7 Chromium | all applicable holds | Figure2, TTG/PH | touch drag, keyboard contract, touch menu | portrait/landscape/dynamic viewport, disposal | required | pending exact-v4 run |
| iPhone 15 WebKit | all applicable holds | Figure2, TTG/PH | touch drag, keyboard contract, touch menu | portrait/landscape/dynamic viewport, decoded-frame handoff | required | pending exact-v4 run |

Layer invariants are unchanged: at most two visible layers during transition, exactly one visible/interactable settled hold, bounded retiring layers, one canonical receiver root, and no Hero current/visible fallback during Contact reverse.

## R1–R22 Deterministic Ownership

Every row has implementation-level coverage in the 83-file / 568-test nonbrowser suite. Browser qualification is intentionally not inferred from candidate-v2 and is repeated only after v4 freeze.

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
pnpm -C app exec playwright test
pnpm -C app exec playwright test --config playwright.release.config.ts
R5_CANDIDATE_TAG=react-refactor-r5-parity-repair-candidate-v4 \
R5_SOURCE_COMMIT="$(git rev-parse HEAD)" pnpm run deploy:build
```

Candidate-v2 recorded 44 / 44 default cases and 54 applicable release cases with 42 declared project skips; those counts are baseline history, not v4 evidence. The final handoff records fresh exact-v4 counts and declared skips after both commands complete.

## Acceptance Boundary

No screenshot baseline or aesthetic acceptance is inferred from these gates. After the complete branch gate, clean exact-tag build/smokes, and same-port rollback pass, stop for user HITL. Never move an old tag, merge/deploy by implication, create a cutover tag, or start R6.
