# R5 phone visual-lease P0 checkpoint

Date: 2026-08-10  
Source: `047119a75deab5ab1936da97652669231a3f0cb0`

## Scope

This checkpoint records automated evidence for the visual-lease closure work. It is not a release qualification: entity iPhone Safari evidence, candidate identity, and process-memory evidence are still outstanding.

## Closure ledger

| Area | Implementation evidence | Verification evidence |
| --- | --- | --- |
| Hero/loading handoff | `1802b19`, `b3c84be` keep Hero beneath the loader and require a monotonic handoff | Chromium full story and Hero handoff gates pass |
| Figure2 authority and Arch retirement | `e4e1fb5`, `a67b647` retire the Arch at the authority boundary and bind depth/media to one lease | Full Chromium/WebKit Arch-retirement and Figure2 z-depth tests pass |
| Figure2 dynamic coverage | `319c607`, `daa72ad` share the real middle-camera dimensions, origin, scale, and middle-y transform with the opaque coverage pseudo; the pseudo expands through `--portrait-coverage-bottom` and transparent depth surfaces expose the same backing camera | Static checks plus Chromium/WebKit physical and dynamic-viewport texture/coverage tests pass; block-level texture and fallback-band checks replace the old 2.5% aggregate check |
| Hidden reverse playback | `319c607` pauses prepared reverse work while `document.hidden` and resumes from the same canonical progress after visibility returns | Deterministic hidden-prepare unit test passes |
| TTG reverse | `7c9e444` advances only after a presented decoder frame | Chromium/WebKit same-authority TTG reverse test passes |
| PH reverse | `0b847ed`, `daa72ad` rearm the current token after retire/restore and record the decoder mediaTime at each WebGL draw | Chromium/WebKit token-bound PH reverse test verifies exact authority/session/generation/leg prefix, direction `-1`, monotonic descending mediaTime, and a fresh token on the second cycle |
| AOD presentation | `b3bb8f8` removes playback-time paper treatment | Chromium/WebKit AOD paper-treatment test passes |

## Automated result

- Vitest: 220 files, 1,805 tests passed.
- TypeScript, module-boundary, media inventory, and production build: passed.
- Chromium: 38 passed, 1 WebKit-only test skipped.
- WebKit: 39 passed.
- Focused Figure2 physical/dynamic coverage and PH token-bound reverse: Chromium 3/3, WebKit 3/3.
- The full browser matrix ran on the preceding docs-only checkpoint; the post-`047119a` exact media-time stamp was rechecked by the PH reverse test on both engines (1/1 each).
- Final artifact rebuild is bound to source commit `047119a...`.

## Release blockers remaining

- Phone JS: 659,438 B against the 659,456 B release cap; only 18 B remain. The planned 4 KiB safety margin is not met.
- `r5-release-manifest.json`: `candidate=null`, `qualification=pending-memory`; no annotated candidate or process-memory evidence exists.
- Entity iPhone Safari exploration and formal sign-off remain outstanding, including dynamic toolbar coverage and hidden reverse recovery.

## Decision

Implementation and automated P0 closure: **GO**.  
Formal release/sign-off: **NO-GO pending qualification**.
