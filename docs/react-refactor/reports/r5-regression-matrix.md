# R5 Production Regression Matrix

Status: automated candidate matrix passed; final physical-device/visual acceptance remains the HITL gate.

Date: 2026-07-12. Base: `react-refactor-r4-closeout` (`c2a52db`). Candidate branch: `codex/react-refactor-r5-parity-cutover`.

## Environment

- macOS 15.6.1, Apple M4.
- Google Chrome 149.0.7827.201, Playwright 1.61.1 bundled WebKit.
- CI contract: Ubuntu, Node 22, Playwright Chromium + WebKit, one worker.
- Release config: 1440×900 desktop Chrome/WebKit, Pixel 7 Chrome emulation, iPhone 15 WebKit emulation.

## Device And Input Matrix

| Project | Full forward | Critical reverse | Input/navigation | Motion/viewport | no-JS | TTG alpha | Result |
|---|---|---|---|---|---|---|---|
| desktop Chromium | all 18 holds | hero/pilot/Figure2 chains | mouse wheel, touchpad-sized deltas, PageUp/PageDown, menu, history, all hashes | normal + reduced | pass | forward + reverse | pass |
| desktop WebKit | all 18 holds | hero/pilot/Figure2 chains | wheel, touchpad-sized deltas, keyboard, menu/history | normal + reduced | pass | forward + reverse | pass |
| Pixel 7 / Chromium | all 18 holds | hero/pilot/Figure2 chains | touchscreen swipe, keyboard contract, touch menu | portrait/landscape/dynamic height + reduced | pass | forward + reverse | pass |
| iPhone 15 / WebKit | all 18 holds | hero/pilot/Figure2 chains | touchscreen swipe, keyboard contract, touch menu | portrait/landscape/dynamic height + reduced | pass | forward + reverse | pass |

All full-spine runs assert hold identity plus: visible layers ≤2 during transition, exactly 1 at hold, interactable layers ≤1 and mounted layers ≤4 transiently. The memory profile tightens settled holds to ≤3.

## Functional Coverage

| Area | Evidence | Result |
|---|---|---|
| Public root | `[data-production-story-app=true]`, no R0 scaffold, title/description, initial `hero` LayerWindow | pass |
| Canonical direct entry | all 18 scene hashes plus `#home/#method/#services/#education/#contact`; retired `#philosophy` resolves to hero | pass |
| History/menu | menu uses pushState; back/forward seek and refresh restore the intended hold | pass |
| Reading handoff | PageDown scrolls inside Method first; only bottom-edge input charges the next segment; reverse uses top edge | pass |
| reduced-motion | same state contract, no cinematic Ink surface, first transition settles under 2 seconds | pass |
| Slow network | a blocked Pattern prefetch does not delay the current Hero hold; AOD media delayed 700 ms remains on the normal path without PREPARE_TIMEOUT | pass |
| Media failure | a media request abort triggers PREPARE_TIMEOUT, recovery lands on a static endpoint, input reverses, the route is restored, and forward retry succeeds | pass |
| Offline/online recovery | Chromium is switched offline after boot, a cache-busted required media load fails, recovery reaches the static endpoint without network access, then online restore permits reverse and forward traversal | pass |
| Abort/stale/duplicate events | R2/R3 harness covers seek abort, stale completion, duplicate/stale mediaReady and recovery idempotence | pass |
| Build timeout | R2 plus every R4 group verifies timeout recovery without input lock | pass |
| Legacy/default paths | `/aod.html`, other standalone paths and `/harness/r4-g1` return production 404; no old bootstrap/query runtime | pass |
| Production boundary | release JS scan finds no harness/scaffold marker; harness loads only behind DEV/explicit build gate | pass |

## TTG Forward/Reverse Alpha

`r5-ttg-alpha.spec.ts` runs on all four projects and verifies:

- both 720×1280 forward/reverse alpha WebM files reach metadata-ready state;
- duration remains 2.4–2.6 seconds;
- forward staged playback activates the forward surface at opacity >0.9;
- `ttg-lab` reverse activates the reverse surface at opacity >0.9 and returns to `ttg-animation` without runtime error;
- poster/first-frame content remains available before playback.

Visual evidence is under `artifacts/react-refactor/r5-candidate/visual/`, including desktop forward/reverse TTG frames, Pattern, home and mobile Services.

## Test Commands

```bash
pnpm -C app exec playwright test
pnpm -C app exec playwright test --config playwright.release.config.ts
```

- Historical harness regression: 41/41 passed.
- Release candidate matrix: 47 passed, 25 intentional project skips across 72 project cases; skips only avoid duplicate exhaustive hash/network/performance probes or inapplicable pointer/touch cases.

## HITL Boundary

Automated WebKit emulation is not a claim of physical Safari certification. HITL must still inspect a real desktop Safari, iOS Safari and Android Chrome session, including touch feel, browser chrome height, visual rhythm and TTG alpha edges. Any blank frame, black flash, duplicate scene/copy or stuck input blocks approval.
