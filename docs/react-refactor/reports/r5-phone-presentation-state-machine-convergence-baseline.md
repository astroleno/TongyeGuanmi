# R5 Phone Presentation State-Machine Convergence Baseline

Recorded 2026-07-29 after the global-presentation-contract WIP was frozen and
before ownership convergence starts.

## Checkpoint and scope

- Worktree: /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-presentation-recovery
- Branch: codex/r5-phone-presentation-contract-recovery
- Recovery baseline before this WIP: 16caf4616b899be22c669711e2323e4af92075e6
- Preserved, explicitly non-publishable checkpoint:
  14af18a002d5d9094c7caa30f38c529966a8bfd9
  (chore(r5): checkpoint presentation recovery wip)
- Checkpoint payload: 91 files changed, 4,078 insertions, 939 deletions.
- Worktree after the checkpoint and all baseline commands: clean.

The checkpoint intentionally preserves the reviewed WIP rather than treating
its partial gates as a release candidate. The prior baseline report remains at
docs/react-refactor/reports/r5-phone-presentation-recovery-baseline.md.

## Frozen inputs

The following packed-alpha masters passed pnpm run verify:media:phone-masters;
no bytes, source hashes, or composed first-frame hashes may change during
convergence.

| Source | Bytes | Source SHA-256 | Composed RGBA first-frame SHA-256 |
| --- | ---: | --- | --- |
| assets/ph-figure-motion-rgb-alpha.mp4 | 321,923 | 39ed325feaa4afcd2c59f7479e6ad75edbe6f4f063ab2243a04afe2660c4f8e1 | 1ecf7424a6f669b41123d9d0d9e5bcd85f3639c659c641f7cac3c1fdf51f102a |
| assets/crane-figure-motion-rgb-alpha.mp4 | 663,343 | 80e971968a290ab1b4176cc754acdd4aaf85fecf5137a85295ccd9e7152105f5 | bd3934157b65fcb87bb66f5bc2a5ac3c2933270cb9001d06e6aef5de39bca7c2 |
| assets/crane-flock-motion-rgb-alpha.mp4 | 1,341,930 | 6c82ceeb31ce814e137c880ae41650e5d24df26a202a4af8a3d8a9d60dbeff00 | ea843495a8293c8d1f9bf63627951b9c28cb0d395a007f2b2801f2cb4970a2d0 |

app/src/story/timings.ts, scene order, copy, and the Figure3/Services,
PH/Education, and Crane/Contact compositor donor semantics are also frozen.
The phone JavaScript hard cap remains 663,552 bytes.

## Current automated evidence

| Gate | Result at 14af18a |
| --- | --- |
| cd app && pnpm run verify:media:phone-masters | PASS |
| cd app && pnpm typecheck | PASS |
| cd app && pnpm test | PASS: 221 files, 1,276 tests |
| cd app && pnpm build | PASS: phone JS 634,120 bytes, 29,432 bytes below the 663,552-byte cap |
| cd app && env PLAYWRIGHT_PORT=4175 pnpm exec playwright test --config playwright.phone.config.ts --project=phone-webkit --grep "Task 0" | FAIL: 2 passed, 1 failed |

The WebKit failure happens before the test reaches its AOD assertion. While
driving the formal story from Hero toward AOD, hold:pattern is accepted as
stable even though its edge/theme remains #07110e, the preceding Hero value,
instead of Pattern's required #8f7f61. Captured artifacts:

- app/test-results/r5-phone-story-Task-0-does-c3bbb-ess-has-no-compositor-frame-phone-webkit/test-failed-1.png
- app/test-results/r5-phone-story-Task-0-does-c3bbb-ess-has-no-compositor-frame-phone-webkit/error-context.md

This proves a split-authority bug: cursor stability is published without a
same-revision presentation proof. It is a release blocker, not a flaky
browser-only discrepancy.

## Device boundary

Playwright WebKit remains an engine gate. It cannot substitute for the required
physical iPhone Safari acceptance of toolbar motion, lock/unlock,
foreground/background, slow decode, autoplay blocking, and rapid gestures.
