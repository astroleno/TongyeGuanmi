# R4 G4-G7 Integration Review

## Scope

- Integration branch: `codex/react-refactor-r4-integration`
- Final reviewed head: `77cd8032 test: refresh final r4 integration traces`
- Group merge order:
  1. G4 `13cc4829 feat: migrate r4 group4 figure3 services`
  2. G5 `0d781f9c feat: migrate r4 group5 ttg lab`
  3. G6 `0f8fafb3 feat: migrate r4 group6 ph education`
  4. G7 `be5846c1 feat: migrate r4 group7 crane contact`

## Contract Boundary

- G4-G7 feature commits do not modify `DirectorEvent`, `LayerWindow`, visibility predicates, `transitions/shared/*`, runtime shared contracts, or canonical spine order.
- The `186d1a94..HEAD` integration history does include one integration-level shared ink update:
  - `37fc0edd fix: align r4 ink transitions with main shader`
  - Touched `app/src/transitions/shared/figure2DepthInk.ts`, `app/src/transitions/shared/ink.ts`, `app/src/transitions/shared/sceneInk.ts`, and `app/src/vendor/ink-scene-transition.*`.
  - This was landed on `codex/react-refactor-r4-integration`, not privately in a G4-G7 group branch.

## Delivered Artifacts

- Group scenes:
  - G4: `app/src/scenes/figure3-animation/`, `app/src/scenes/services/`
  - G5: `app/src/scenes/ttg-animation/`, `app/src/scenes/lab/`
  - G6: `app/src/scenes/ph-animation/`, `app/src/scenes/education/`
  - G7: `app/src/scenes/crane-animation/`, `app/src/scenes/contact/`
- Group transitions:
  - G4: `app/src/transitions/brand-figure3/`, `app/src/transitions/figure3-services/`
  - G5: `app/src/transitions/services-ttg/`, `app/src/transitions/ttg-lab/`
  - G6: `app/src/transitions/lab-ph/`, `app/src/transitions/ph-education/`
  - G7: `app/src/transitions/education-crane/`, `app/src/transitions/crane-contact/`
- Harness routes:
  - `/harness/r4-g4`, `/harness/r4-g4-brand-figure3`, `/harness/r4-g4-figure3-services`
  - `/harness/r4-g5`, `/harness/r4-g5-services-ttg`, `/harness/r4-g5-ttg-lab`
  - `/harness/r4-g6`, `/harness/r4-g6-lab-ph`, `/harness/r4-g6-ph-education`
  - `/harness/r4-g7`, `/harness/r4-g7-education-crane`, `/harness/r4-g7-crane-contact`
  - Integration back-half route: `/harness/r4-back-half`
- Notes:
  - `docs/react-refactor/R4-g4-notes.md`
  - `docs/react-refactor/R4-g5-notes.md`
  - `docs/react-refactor/R4-g6-notes.md`
  - `docs/react-refactor/R4-g7-notes.md`
- Visual parity artifacts:
  - `artifacts/react-refactor/r4-g4/group4-old-new-figure3-side-by-side.png`
  - `artifacts/react-refactor/r4-g5/group5-old-new-ttg-side-by-side.png`
  - `artifacts/react-refactor/r4-g6/group6-old-new-ph-side-by-side.png`
  - `artifacts/react-refactor/r4-g7/group7-old-new-crane-side-by-side.png`
  - All four side-by-side files were checked at `1600 x 760`.

## Verification

- `pnpm -C app typecheck`: passed.
- `pnpm -C app test`: passed, 39 files / 179 tests.
- Playwright final sweep passed, 27 tests:
  - `app/e2e/r2-stage.spec.ts`
  - `app/e2e/r3-pilot.spec.ts`
  - `app/e2e/r4-g4.spec.ts`
  - `app/e2e/r4-g5.spec.ts`
  - `app/e2e/r4-g6.spec.ts`
  - `app/e2e/r4-g7.spec.ts`
  - `app/e2e/r4-back-half.spec.ts`
  - `app/e2e/smoke.spec.ts`

## Handoff State

- Integration worktree is clean after dropping obsolete protection stashes and restoring unrelated R4 G1 trace timestamp churn.
- HITL still needs final back-half visual parity approval before treating visual parity as signed off.
