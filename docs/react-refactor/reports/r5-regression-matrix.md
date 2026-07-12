# R5 Production Regression Matrix

Status: parity-repair implementation and the final pre-freeze automated acceptance passed. Exact-tag smokes and rollback rehearsal remain.

Date: 2026-07-12. Branch: `codex/react-refactor-r5-parity-cutover`. Repair base: `59065730712c6d9718928fd25cba23e33455395e`.

The earlier results in `r5-candidate.md` belong to `react-refactor-r5-candidate-v3`. That tag does not contain this repair, so its counts are historical evidence only and are not carried forward as a pass claim.

## Frozen Matrix

| Project | Canonical traversal | Critical reverse | Input/navigation | Media/lifecycle | SEO/no-JS | Final result |
|---|---|---|---|---|---|---|
| desktop Chromium | all 18 holds | pilot, Figure2, PH/TTG, Contact recovery | wheel, touchpad deltas, PageUp/PageDown, menu, hash/history | normal/reduced, interruption, retry, disposal | required | pass: 20 applicable, 3 declared skips |
| desktop WebKit | all 18 holds | pilot, Figure2, PH/TTG | wheel, touchpad deltas, keyboard, menu/history | normal/reduced, decoded-frame handoff | required | pass: 9 applicable, 14 declared skips |
| Pixel 7 Chromium | all 18 holds | pilot, Figure2, PH/TTG | touch drag, keyboard contract, touch menu | portrait/landscape/dynamic viewport, disposal | required | pass: 12 applicable, 11 declared skips |
| iPhone 15 WebKit | all 18 holds | pilot, Figure2, PH/TTG | touch drag, keyboard contract, touch menu | portrait/landscape/dynamic viewport, decoded-frame handoff | required | pass: 11 applicable, 12 declared skips |

Layer invariants remain: visible layers ≤2 during transition, exactly one visible/interactable hold after settlement, bounded retiring layers, and no stale Hero layer during Contact reverse recovery.

## R1–R20 Coverage Map

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

The full reproduction/root-cause/minimum-file record is `../contract-diff/R5-production-parity-repair.md`.

## Final Commands

Run only after implementation and documentation are closed:

```bash
pnpm run verify:all
pnpm -C app exec playwright test
pnpm -C app exec playwright test --config playwright.release.config.ts
```

Recorded pre-freeze results: root lint/typecheck/build plus 76 test files and 493 tests passed; the historical harness passed 43/43; the four-project release matrix passed 52 applicable cases with 40 declared applicability skips; three hardware performance samples and the forward/reverse process-memory traversal passed. The remaining acceptance record is the identity-bound exact-tag build, exact-tag production/no-JS/direct-hash/key-direction smokes, and same-port rollback rehearsal.

## Acceptance Boundary

This repair intentionally has no screenshot baseline and no manual visual-review requirement. Browser tests assert state, DOM, input, media readiness, compositor ownership diagnostics, and resource lifecycle. After automated freeze, stop for HITL without merging or deploying.
