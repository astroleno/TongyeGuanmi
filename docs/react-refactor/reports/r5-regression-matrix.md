# R5 Production Regression Matrix

Status: **OPEN / HITL rejected at reviewed head `2501704`.** The immutable candidate and post-candidate automation below are historical audit evidence only. They do not qualify the current runtime after the nine reported production regressions.

Date: 2026-07-12. Branch: `codex/react-refactor-r5-parity-cutover`. Repair base: `59065730712c6d9718928fd25cba23e33455395e`.

The earlier complete browser/release results belong to immutable tags, including `react-refactor-r5-parity-repair-candidate`. None contains R21/R22, so those counts remain historical evidence only and are not carried forward as a current-branch pass claim.

## Immutable Candidate Historical Matrix

| Project | Canonical traversal | Critical reverse | Input/navigation | Media/lifecycle | SEO/no-JS | Final result |
|---|---|---|---|---|---|---|
| desktop Chromium | all 18 holds | pilot, Figure2, PH/TTG, Contact recovery | wheel, touchpad deltas, PageUp/PageDown, menu, hash/history | normal/reduced, interruption, retry, disposal | required | pass: 20 applicable, 3 declared skips |
| desktop WebKit | all 18 holds | pilot, Figure2, PH/TTG | wheel, touchpad deltas, keyboard, menu/history | normal/reduced, decoded-frame handoff | required | pass: 9 applicable, 14 declared skips |
| Pixel 7 Chromium | all 18 holds | pilot, Figure2, PH/TTG | touch drag, keyboard contract, touch menu | portrait/landscape/dynamic viewport, disposal | required | pass: 12 applicable, 11 declared skips |
| iPhone 15 WebKit | all 18 holds | pilot, Figure2, PH/TTG | touch drag, keyboard contract, touch menu | portrait/landscape/dynamic viewport, decoded-frame handoff | required | pass: 11 applicable, 12 declared skips |

Layer invariants remain: visible layers ≤2 during transition, exactly one visible/interactable hold after settlement, bounded retiring layers, and no stale Hero layer during Contact reverse recovery.

## Historical R1–R22 Coverage Map (invalidated for current qualification)

| ID | Deterministic assertion owner | Required proof | Final result |
|---|---|---|---|
| R1 AOD alpha | `aod-animation/progress.test.ts`, `r5-production.spec.ts` | first third has transparent AOD backings, full layer opacity, one copy cue | pass |
| R2 Crane 3000ms | `manifest.test.ts`, `group7-transitions.test.ts`, `group7-transitions` browser coverage | manifest/transition/renderer/media/copy use one 3000ms authority | pass |
| R3 Hero ↔ Pattern motion | `scene-motion.test.ts`, `hero-pattern/index.test.ts`, `r4-g1.spec.ts` | visible Pattern revision grows in both directions; lease releases | pass |
| R4 collapsed Pattern motion | `pattern-star-map/index.test.ts`, `r4-g1.spec.ts` | rotation grows during staged pause and ink stage | pass |
| R5 Star Map Perlin | `pattern-star-map/index.test.ts`, `r4-g1.spec.ts` | visible Star Map revision grows forward/reverse; hidden/reduced stops | pass |
| R6 ink reliability | `sceneInk.lifecycle.test.ts`, `star-map-aod/inkCurtain.test.ts`, `r3-pilot.spec.ts` | fresh generation/canvas/context and active ink body for ≥10 alternating runs | pass |
| R7 loader/Hero | `StoryLoader.test.tsx`, `hero/motion.test.ts`, `r5-production.spec.ts`, `r5-performance.spec.ts` | two phrases, safety exit, 2.7s intro, stacking/parallax cleanup, LCP | pass |
| R8 progressive nav | `StoryNav.test.tsx`, `r5-production.spec.ts` | exact sibling DOM, seven blur layers+tint, committed visibility/inert/tab order | pass |
| R9 reading ownership | `reading-handoff.test.ts`, `input-controller.test.ts`, `r5-production.spec.ts` | content pixels are consumed to the physical edge for every input class | pass |
| R10 10svh commitment | same as R9 plus `charge.test.ts` | 9.9svh cannot fire; one threshold+residual intent fires at 10svh; all reset causes | pass |
| R11 footer/filing | `SiteFooter.test.tsx`, `static-shell.test.ts`, `r5-nojs.spec.ts`, build verifier | interactive/static exact shared footer and MIIT link | pass |
| R12 favicon | `global-assets.test.ts`, build verifier | emitted SVG bytes equal `assets/favicon.svg`; no data URL | pass |
| R13 Contact recovery | `recovery.test.ts`, Director machine/actor tests, `r5-production.spec.ts` | normal/timeout/endpoint-failure/menu-hash races never make Hero current/visible | pass |
| R14 reading entry | Director tests, `Stage.reading.test.ts`, `r5-production.spec.ts` | forward/menu/hash top; reverse sequential exact bottom; one token only | pass |
| R15 Figure2 reverse | `figure2-animation/progress.test.ts`, `figure2-proof-chain.test.ts`, production matrix | multiple decreasing intermediate media frames | pass |
| R16 fonts | `global-assets.test.ts`, `static-shell.test.ts`, build verifier | emitted TTF identity, canonical tokens, no Inter-first/synthetic weight | pass |
| R17 retained arch | `RetainedFigure2Arch.test.tsx`, `figure2-proof-chain.test.ts`, ink occlusion browser test | one arch, absent from masks, above Figure2 ink, exits under Proof → Brand | pass |
| R18 PH/TTG reliability | timeline-driver tests, `media-ready.test.ts`, group5/group6 transition tests | ≥20 alternating/interrupted/re-entry runs; both directions and rejection/recovery | pass |
| R19 TTG reverse endpoint | timeline-driver tests, `r5-ttg-alpha.spec.ts` | target frame presented before swap; no stale terminal/standing frame | pass |
| R20 edge-only grade | `sceneInk.lifecycle.test.ts`, shared ink tests, pilot contract/browser test | production cover alpha zero; explicit dark harness preset shares geometry | pass |
| R21 shared horizontal contour | contour/Ink field/vendor lifecycle tests, group4–group7 consumer tests, `r4-ink-occlusion.spec.ts` | one per-run 32-sample contour drives live polygons and the 1×32 texture; forward/reverse fresh runs align without SVG/snapshot compositor | pass: deterministic suites plus affected Chromium 3/3 |
| R22 TTG/PH internal dissolve | `stagedMediaHandoff.test.ts`, group5/group6 transition tests and affected Chromium paths | 600ms two-surface dissolve in both directions; zero internal Ink canvas/mask/particles | pass: deterministic suites plus affected Chromium 9/9 |

The full reproduction/root-cause/minimum-file record is `../contract-diff/R5-production-parity-repair.md`.

## Requalification Commands

Canonical commands retained by the repository:

```bash
pnpm run verify:all
pnpm -C app exec playwright test
pnpm -C app exec playwright test --config playwright.release.config.ts
pnpm -C app evidence:memory
```

Historical review implementation `14743aa5ef9e0399441863afcfd73599782721a3`:

- root lint/typecheck/build, static-shell/release verification, 78 test files / 504 tests, and all frozen bundle budgets passed;
- default historical/functional browser matrix passed 43/43;
- four-project release coverage passed all 52 applicable cases with 40 declared project skips. The first desktop Chromium hardware sample encountered host-load jitter; that single performance gate was repeated in isolation and passed without repeating the other 91 cases;
- affected TTG/PH staged-handoff browser contracts passed 9/9 and Ink ownership passed 3/3;
- process-memory traversed all 18 holds forward and reverse and passed RSS/GPU/renderer/heap/layer/WebGL budgets;
- same-port clean-worktree review → immutable legacy → identical review rehearsal passed root/footer/no-JS/manifest/media-range and PageDown/PageUp smokes.

These results remain audit evidence only. HITL showed that their models did not close gesture cadence, cold reverse presentation, same-run staged reversal, receiver-entry timing, loader Ink ownership, or horizontal core coverage. The final matrix must be regenerated from the corrected exact source rather than carrying these pass labels forward.

## Acceptance Boundary

Deterministic closure does not perform aesthetic acceptance. After the corrected source passes the full gate and a new versioned immutable candidate is created, stop for user HITL. Do not merge or deploy by implication, and never move an existing tag.
