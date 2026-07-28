# R5 Phone Execution-Layer Baseline

## Scope and immutable inputs

- Worktree: `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b`
- Branch: `codex/r5-phone-unit7b`
- Starting HEAD: `d4d29bc2fc5e4312b435caa19003e05742ffda23`
- Execution plan: `docs/superpowers/plans/2026-07-26-r5-phone-execution-layer-transaction-closure.md`
- Plan SHA-256: `0bcb2f450bef5dae036b6880dac5138203b42c12b7572f36e169f8a47d3aa393`
- Frozen paths: `assets/`, `app/scripts/homepage-media-contract.mjs`,
  `app/src/story/timings.ts`, and `app/src/story/copy.ts`

This report is a Task 0 failure-contract baseline, not a visual acceptance or
release report. The existing untracked `.playwright-cli/`, `app/.playwright-cli/`,
and both plan documents were observed before the task and are excluded from every
Task 0 change and commit.

## First red run

Command:

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b/app
pnpm exec vitest run \
  src/production/phone/phone-story-sequence.test.ts \
  src/production/phone/phone-story-orchestrator.test.ts \
  src/production/phone/phone-transition-coordinator.test.ts \
  src/production/phone/phone-story-presentation.test.ts \
  src/production/phone/PhoneBrandLabStory.test.ts \
  src/production/phone/phone-stable-presentation.test.ts
```

Result: exit `1`; `24 failed | 32 passed (56 total)`.

| Contract | Observed red evidence | Responsible task |
| --- | --- | --- |
| Projection schema | `phoneStoryPresentation()` has no `commitState`, stage/surface, or landing fields. | 1 |
| Composite leg projection | The second `lab-education` leg still reports `lab-to-ph` instead of `ph-to-education`. | 1 |
| Stable publication | All 12 normal holds lack `data-phone-stable-scene`, `data-phone-input-state`, and `data-phone-projection-state`. | 2 |
| Stable atomicity | Subscriber observes `hold:services` while `phoneTransitionLock=locked` and `phoneAnchorY=100`. | 2 |
| Direct cinematic identity | Figure3, TTG, PH, and Crane direct sessions expose only session/generation, not authority/leg/direction identity. | 2 |
| Stable callback owner | `PhoneStableSceneAdapter.commit()` runs twice during registration/diagnostics. | 2 |
| QA lifecycle | `PhoneBrandLabStory` retains `entryScene`, `currentScene`, `stageScene`, edge publication, and `onPresentation`. | 2 and 6 |
| Native input | An unclaimed wheel calls `preventDefault()` and synchronously advances scroll from `400` to `650`. | 3 |
| Late intent | A previously unclaimed input restarts `aod-method` after source reconciliation. | 3 |
| Grade A progress owner | `PhoneGradeAStory` keeps `runView` and its own document `scroll` listener. | 5 |

The tests above are deliberately registered with Vitest `it.fails` until their
named migration task restores them to ordinary tests. They were first run as
ordinary tests and failed for the listed architectural reason; they are not
skips, nor are they a replacement for the Task 10 E2E gate.

## Browser and device baseline status

No fresh Chrome 390x844, iOS Simulator Safari, or physical-iPhone run is
recorded by Task 0. The executable symptoms above are the current baseline;
Task 10 must replace this section with fresh engine/device evidence. In
particular, this report makes no visual-success or release claim.

## Task 0 green form

After registering the verified temporary expected failures, the same targeted
Vitest command exits `0` with `56 passed (56)`.

Fresh Task 0 verification:

| Command | Exit | Result |
| --- | ---: | --- |
| targeted expected-failure Vitest command | 0 | 6 files, 56 tests passed |
| `pnpm typecheck` | 0 | TypeScript project build completed |
| `pnpm build` | 0 | Vite build and its boolean/module/media/release/performance gates completed |
| `pnpm lint` | 1 | pre-existing `no-unsafe-finally` at `phone-orchestrated-session.ts:151`; Task 0 did not modify that file and Task 1 owns its refactor |
| Unit 4–7A / rendering donor Vitest command | 0 | 11 files, 51 tests passed |
| `node scripts/verify-phone-packed-alpha-masters.mjs` | 0 | all three packed-alpha masters and first-frame hashes passed |
| frozen-path diff against `d4d29bc` | 0 | no diff in media, media contract, timings, or copy |

The fresh build records `phoneJsRawBytes=663529`, below the hard cap of
`663552`, with `23` bytes of headroom. The performance verifier warns that this
is below the recommended 4 KiB headroom; no budget was changed.

The lint failure is deliberately not treated as a Task 0 success. It must be
removed before the final Task 10 full-lint acceptance; it is recorded here so
the later Task 1 session migration cannot mistake it for a new regression.

## Task 10 replacement status — 2026-07-28

Task 10 implementation evidence now lives in
`docs/react-refactor/reports/r5-phone-state-machine-acceptance.md`. The former
Task 0 browser/device absence is no longer the implementation baseline:

- source-time cross-chunk contract and mangle-reserve gates pass before Vite;
- production Chromium and WebKit each pass all seven R5 phone journeys,
  including cold start, reverse, direct entries, history, reduced motion, and
  two complete rounds within one authority;
- production build, media-master verification, typecheck, and frozen-path diff
  pass, while the phone bundle remains below its immutable hard cap.

Release DoD is still open, not because of a generated-bundle-only diagnosis,
but because no physical iPhone is attached and Simulator Safari cannot complete
the prescribed gesture/toolbar/orientation/background matrix with the available
Computer Use bridge. The acceptance report also records the separate baseline
font-test failure and preserved temporary-script lint errors without changing
their out-of-scope source.
