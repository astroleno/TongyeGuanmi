# R5 phone visual-lease P0 checkpoint

Date: 2026-08-10  
Source: `e6cd61e509715c853aaef886f355dd587ffce52e`

## Scope

This checkpoint records automated evidence for the visual-lease closure work. It is not a release qualification: entity iPhone Safari evidence, candidate identity, and process-memory evidence are still outstanding.

## Closure ledger

| Area | Implementation evidence | Verification evidence |
| --- | --- | --- |
| Hero/loading handoff | `1802b19`, `b3c84be` keep Hero beneath the loader and require a monotonic handoff | Chromium full story and Hero handoff gates pass |
| Figure2 authority and Arch retirement | `e4e1fb5`, `a67b647` retire the Arch at the authority boundary and bind depth/media to one lease | Full Chromium/WebKit Arch-retirement and Figure2 z-depth tests pass |
| Figure2 dynamic coverage | `319c607`, `e6cd61e` share the real middle-camera dimensions, origin, scale, and middle-y transform with the opaque coverage pseudo; transparent depth surfaces expose the same backing camera | `phone-viewport-coverage` and `figure2-animation` tests pass; Chromium and WebKit Figure2 bottom-coverage tests pass |
| Hidden reverse playback | `319c607` pauses prepared reverse work while `document.hidden` and resumes from the same canonical progress after visibility returns | Deterministic hidden-prepare unit test passes |
| TTG reverse | `7c9e444` advances only after a presented decoder frame | Chromium/WebKit same-authority TTG reverse test passes |
| PH reverse | `0b847ed` rearms the current token after retire/restore | Chromium/WebKit token-bound PH reverse test passes |
| AOD presentation | `b3bb8f8` removes playback-time paper treatment | Chromium/WebKit AOD paper-treatment test passes |

## Automated result

- Vitest: 220 files, 1,805 tests passed.
- TypeScript, module-boundary, media inventory, and production build: passed.
- Chromium: 37 passed, 1 WebKit-only test skipped.
- WebKit: 38 passed.
- Final artifact rebuild is bound to source commit `e6cd61e...`.

## Release blockers remaining

- Phone JS: 659,438 B against the 659,456 B release cap; only 18 B remain. The planned 4 KiB safety margin is not met.
- `r5-release-manifest.json`: `candidate=null`, `qualification=pending-memory`; no annotated candidate or process-memory evidence exists.
- Entity iPhone Safari exploration and formal sign-off remain outstanding, including dynamic toolbar coverage and hidden reverse recovery.

## Decision

Implementation and automated P0 closure: **GO**.  
Formal release/sign-off: **NO-GO pending qualification**.
