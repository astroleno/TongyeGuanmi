# R5 Phone State-Machine Acceptance

**Evidence session:** 2026-07-28 21:00 CST
**Worktree:** `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b`
**Branch:** `codex/r5-phone-unit7b`
**Plan:** `docs/superpowers/plans/2026-07-26-r5-phone-execution-layer-transaction-closure.md`
**Plan SHA-256:** `0bcb2f450bef5dae036b6880dac5138203b42c12b7572f36e169f8a47d3aa393`

## Acceptance status

The implementation and automated production gates are complete. Release DoD is
**not** complete: no physical iPhone is attached, and the iOS Simulator gesture
matrix could not be driven to completion by the available Computer Use window
bridge. This report deliberately does not convert either limitation into a
visual-success claim.

## Source-level cross-chunk closure

Generated-bundle inspection is no longer the primary defence. The production
build runs a source-time AST gate before Vite/Terser, and a source contract must
choose one of the following forms before it can enter the phone execution layer.

| Boundary family | Source contract | Enforcement |
| --- | --- | --- |
| Authority, intent, cinematic session/snapshot, scroll samples, stage frames and visual projection | Ordered readonly tuples, including `PhoneExecutionToken`, `PhoneIntent`, `PhoneCinematicSnapshot`, `PhoneCompositeSession`, `PhoneRuntimeScrollSample`, `PhoneDocumentScrollSample`, and `PhoneStageFrame`. | The static gate requires the tuple declarations and rejects raw identity, reducer-event, intent, and cinematic request objects outside the authority core. |
| Lazy media, ink, Figure2, timeline, endpoint and reverse-playback adapters | Callable bridge plus an ordered request tuple, including the Figure2, ink-runtime, timeline-video, packed-alpha, endpoint, compositor, and reverse-playback bridges. | The lazy execution graph rejects raw factory, timeline, ink, and Figure2 builder objects. |
| Unavoidable object-shaped third-party/React contracts | Explicit entry in `app/build/phone-cross-chunk-contract.json`, with source suffix, callee, and every executable field enumerated. | Vite injects the policy's `reservedPropertyNames` into Terser's property-mangle `reserved` list. The source gate rejects an undeclared callee, a new field, object spread, or a policy field missing from that reserve. |

The gate scans all non-test phone execution modules and the reachable literal
graphs of the four lazy Group 4–7 adapters. It resolves object-literal aliases
and named local forwarding wrappers, so neither
`const options = { ... }; createLazyAdapter(options)` nor
`startAdapter({ ... })` where `startAdapter` forwards to a runtime callee can
hide a cross-chunk object contract. The same protection covers indirect
`PhoneIntent` and `dispatch` payloads. Locally owned `Set`/`Map` storage is
recognised as local bookkeeping rather than a cross-chunk contract.

The key controls are:

- `app/scripts/verify-homepage-module-boundaries.mjs` — build-before-Vite AST
  gate and policy validation.
- `app/build/phone-cross-chunk-contract.json` — the single retained-object and
  mangle-reserve policy.
- `app/vite.config.ts` — fails configuration loading if policy fields are not
  reserved, then supplies the reserve list to Terser.
- `app/src/production/phone/phone-cross-chunk-execution-contract.test.ts` and
  `app/scripts/verify-homepage-module-boundaries.test.mjs` — positive and
  negative contract tests.

Fresh source-gate result:

```text
pnpm exec vitest run \
  src/production/phone/phone-cross-chunk-execution-contract.test.ts \
  scripts/verify-homepage-module-boundaries.test.mjs

2 files passed, 18 tests passed
```

The negative suite covers raw identity, direct/aliased/wrapped dispatch and
intent objects, cinematic-request objects, direct/aliased/wrapped lazy-factory
objects, wrapped unreserved policy fields, raw timeline context, raw ink/hero
adapters, missing property-mangle reserves, and object spread. It is
intentionally a source control, not a post-minification grep.

## Fresh automated evidence

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm typecheck` | 0 | TypeScript project build passed. |
| `pnpm build` | 0 | Boolean contract, source AST gate, Vite/Terser, media, release-build and performance gates passed. |
| `pnpm run verify:media:phone-masters` | 0 | All three packed-alpha masters and first-frame hashes passed. |
| frozen-path diff against `d4d29bc` | 0 | No diff in `assets/`, media contract, timings, or copy. |
| scoped ESLint excluding preserved `.tmp-r5-*.mjs` user scripts | 0 | All managed source, tests, and build scripts passed. |
| `pnpm test` | 1 | 214/215 files and 1252/1253 tests passed; the sole failure is the pre-existing, out-of-scope font-order mismatch described below. |
| `pnpm lint` | 1 | The only 26 errors are in four preserved untracked `.tmp-r5-*.mjs` browser-debug scripts; no managed file fails. |

The current production artifact passes the immutable hard cap:

```text
phone JS:       661,507 / 663,552 bytes
headroom:         2,045 bytes
largest lazy JS: 59,005 / 65,536 bytes
```

The build emits the existing warning that 2,045 bytes is below the recommended
4 KiB headroom. The hard cap was not raised. The generated release manifest is
`phase=prepare`, `qualification=pending-memory`; this acceptance does not claim
memory qualification.

## Production browser matrix

Both runs use `app/playwright.phone.config.ts`: production `pnpm preview`, one
worker, failure trace/screenshot, a 390×844 touch Chromium project and an iPhone
15 portrait WebKit project. The ordinary spec timeout remains 120 seconds. The
single two-round-trip case has a deliberate 300-second per-test override because
it preserves the real inter-epoch quiet window; shortening that cadence would
remove the momentum-separation assertion being qualified.

| Engine | Command result | Covered production journeys |
| --- | --- | --- |
| Chromium | `7 passed (6.6m)` | cold Hero→Contact; Contact→Hero reverse; two full-motion forward/reverse rounds in one authority; direct Contact Group 6–7 reverse boundary; reduced-motion round trip; every formal direct entry plus hash/menu/history; formal-vs-Brand–Lab scope and Group 4–5 QA reverse/forward. |
| WebKit | `7 passed (6.3m)` | The same seven production journeys and stable-contract assertions. |

The E2E stable helper asserts one live authority, matching authority/revision,
stable cursor/status, no session, free input, no anchor, corridor/landing
alignment, correct stage and exactly one stable surface, viewport coverage and
edge/theme agreement, navigation alignment, and the next native-or-claimed
input. The cold runtime probe also caps active WebGL/video owners at four.

Playwright WebKit is an engine gate only; it is not substituted for Simulator
Safari or physical Safari.

## iOS Simulator Safari evidence

| Field | Recorded value |
| --- | --- |
| Device | iPhone 17 Pro (`114786F4-1CAD-4FDC-8892-E196E2CF8E25`) |
| Runtime OS | iOS 26.3.1 |
| MobileSafari bundle version | 26.3 |
| Production URL | Local `pnpm preview --host 0.0.0.0 --port 4175` endpoint |
| Evidence session | 2026-07-28 CST |

| Required Simulator check | Result | Evidence / limitation |
| --- | --- | --- |
| Cold startup | Partial pass | Loader followed by the Hero/title was observed. |
| Warm startup | Not qualified | No repeatable warm-start sequence was captured. |
| Two complete forward/reverse rounds | Not qualified | Computer Use `drag`/`scroll` returned `noWindowsAvailable`; no gesture-chain result is claimed. |
| Toolbar expand/collapse | Not qualified | Same Computer Use limitation. |
| Orientation recovery | Not qualified | Same Computer Use limitation. |
| Foreground/background recovery | Not qualified | Same Computer Use limitation. |
| Pattern, Figure2, Figure3, PH, Crane bottom/right edge | Partial only | Front/Pattern/Star/AOD/Figure2 visual samples showed no visible seam; Figure3/PH/Crane and the full edge matrix were not reached. |
| Method/Services/Lab/Education native reading | Not qualified | Full native-reading traversal was not driven. |
| Direct entry and back/forward | Not qualified | Direct-entry navigation could not be reliably automated after the gesture bridge stalled. |
| Normal decode and media fallback | Not qualified | Visual normal-path samples were observed; neither full decode nor fallback matrix is qualified. |
| Reduced-motion full route | Not qualified | Full route could not be driven. |
| Formal `/` and `/brand-lab` ownership | Not qualified on Simulator | Covered by production Chromium/WebKit; Simulator-specific verification remains pending. |

The partial Simulator result is a tooling limitation, not evidence of an app
failure. It must not be promoted to a complete Simulator pass.

## Physical iPhone release gate

Fresh at 2026-07-28 21:00 CST, `xcrun xctrace list devices` lists the Mac plus
simulators only; no physical iPhone is attached. The following release-only
checks remain pending on real Safari: rapid swipe, slow drag, momentum tail,
expanded/collapsed address bar, background/lock recovery, all stable-edge seams,
Contact focus/pointer, and Brand–Lab re-entry without stale listeners/media/
momentum.

Accordingly, the permitted status is **“implementation and automated gates
complete”**, not **“release DoD complete.”**

## Non-R5 blockers recorded without scope expansion

1. `pnpm test` has one pre-existing failure in
   `src/production/global-assets.test.ts`. The exact `d4d29bc` baseline already
   contains the same assertion expecting SF Pro-first font order while its
   `src/styles.css` uses PingFang/Songti-first order. Neither file is in the R5
   phone task scope, and no source or test was changed to conceal it.
2. `pnpm lint` reaches only the four user-preserved untracked
   `app/.tmp-r5-*.mjs` debug scripts (26 `no-undef` errors). They were not
   deleted, rewritten, or globally ignored. Managed-source ESLint passes when
   those temporary files are excluded explicitly.

Neither blocker weakens the source-level cross-chunk contract gate; both must be
resolved separately before a literal all-green repository acceptance can be
claimed.
