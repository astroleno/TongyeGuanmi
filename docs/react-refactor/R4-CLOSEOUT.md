# R4 Closeout

Status: closed on 2026-07-12. R4 scene identity, transition ownership and g1-g7 visual work are complete; production assembly and cutover move to R5.

## Immutable references

| Purpose | Reference | Commit |
|---|---|---|
| Legacy static comparison | `react-refactor-legacy-static-baseline` | `a78b064d65f024a301a3b179c62a458a1445bbf6` |
| User-approved R4 visuals | `react-refactor-r4-visual-accepted` | `55b8a123a7a5b28647c40acc81783ee37cd58302` |
| R4 phase closeout / R5 parent | `react-refactor-r4-closeout` | tag points to the commit containing this record |

The integration target is the existing `codex/react-refactor-r4-integration` branch. It is fast-forwarded to the closeout tag; R4 is not merged directly to `main` because production cutover requires the R5 HITL gate.

## Acceptance record

- The user completed manual visual review on the primary `/harness/r4-g1` through `/harness/r4-g7` routes and reported no remaining visual issue at `55b8a12`.
- Canonical from/to scene identity, transition endpoint presentation, reverse initialization, effect-canvas ownership and dispose invariance are covered by the R4 contracts.
- Historical G1-G3 and G4-G7 iteration documents are evidence only; they no longer carry pending implementation or HITL status.

## TTG media closeout

Commit `5f53013` promoted the user-provided `ttg_figure-alpha-review-v2.webm` to the canonical TTG forward asset, generated a matching reverse asset, and regenerated the frame-zero poster. Runtime keys and canonical filenames remain unchanged, so no review-suffixed production path was introduced.

| Asset | SHA-256 |
|---|---|
| `assets/ttg_figure-alpha-scrub.webm` | `3b4ab3087b665fcad3f16e4e2716d8693d5d2ffe5f37c41b12cb72c48a012b51` |
| `assets/ttg_figure-alpha-scrub-reverse.webm` | `cc2836be61fb70a2047c7ab82e36f695f9db59938e4ef782342c928c4744e1c1` |
| `assets/ttg_figure-alpha-scrub-poster.png` | `8a99d1e472a8955d6f2ed132bae1cc0294197b95b64ac7f4d404212efbaddead` |

Both videos are VP9, `720 × 1280`, 24fps, 60 frames, 2.5 seconds, and carry `ALPHA_MODE=1`. The reverse frame order and poster alpha were checked against the supplied forward asset. R5 must still include human forward/reverse TTG playback in its device matrix because asset-level validation is not a visual judgment.

## Closeout verification

Run from `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity` after the TTG replacement and documentation updates:

| Check | Result |
|---|---|
| `pnpm -C app test` | 60 files, 402 tests passed |
| `pnpm -C app lint` | passed |
| `pnpm -C app typecheck` | passed |
| `pnpm -C app build` | passed |
| `pnpm -C app exec playwright test e2e/r4-g5.spec.ts` | Chromium 3/3 passed |
| TTG `ffprobe` alpha/frame/duration check | passed |

The production build still reports a `544.94 kB` initial JS chunk warning. That is not hidden or waived: R5 T5.1/T5.5 must separate harness imports from the public entry and establish the production bundle budget.

## Why R5 is still required

R4 proves the scene and transition modules, not a production website. At closeout:

- `/` still renders the R0 scaffold.
- `App.tsx` eagerly imports harnesses.
- `app/index.html` still has an empty client-only root rather than crawlable page copy.
- root dev/build/CI still default to the legacy static site.
- no production full-spine StoryApp, performance report or cutover/rollback runbook exists yet.

These are explicit R5 requirements, not R4 defects and not R6 cleanup.

## Worktree isolation

The closeout commits intentionally exclude the user's unrelated `app/package.json` / `pnpm-lock.yaml` Agentation changes and `.playwright-cli/` output. R5 must start from the closeout tag in a clean worktree so those local files cannot enter the release candidate accidentally.
