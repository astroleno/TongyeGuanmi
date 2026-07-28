# R5 Phone Presentation Recovery Baseline

Recorded 2026-07-29 before recovery implementation.

## Isolation

- Recovery worktree: /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-presentation-recovery
- Recovery branch: codex/r5-phone-presentation-contract-recovery
- Recovery base: be9db27509d7a1189d3b5ab8e83c6181485c353a
- Source diagnostic worktree: /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b
- Source diagnostic branch: codex/r5-phone-unit7b, ahead of origin by 13 commits.

The source worktree was not edited. Its WIP remains diagnostic-only:

- app/e2e/r5-phone-story.spec.ts
- app/playwright.release.config.ts
- app/scripts/verify-homepage-module-boundaries.mjs
- app/scripts/verify-homepage-module-boundaries.test.mjs
- app/src/production/StoryNav.css
- app/src/production/phone/PhoneStageRail.css
- app/src/production/phone/aod-autoplay.test.ts
- app/src/production/phone/aod-autoplay.ts
- app/src/production/phone/phone-gsap-driver.test.ts
- app/src/production/phone/phone-gsap-driver.ts
- app/src/production/phone/phone-layer-contract.test.ts
- app/src/production/phone/scenes/PhoneMethodTop.css
- app/src/production/phone/usePhoneStageRuntime.test.ts
- app/src/production/phone/usePhoneStageRuntime.ts
- its untracked Playwright/debug scripts and two July 26 plan drafts.

## Frozen inputs

- app/src/story/timings.ts SHA-256:
  40a542bdad8f9336ba5586a5450a1ea992794fa724915895d74a516323be88bd
- The recovery worktree has no diff for timings.ts or the three donor masters.
- The phone JavaScript hard cap remains 648 KiB = 663,552 bytes.

| Master | Packed dimensions | Duration | File bytes | SHA-256 | Composed RGBA dimensions | Composed first-frame SHA-256 |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| assets/ph-figure-motion-rgb-alpha.mp4 | 1408 x 396 | 1.533008 s | 321,923 | 39ed325feaa4afcd2c59f7479e6ad75edbe6f4f063ab2243a04afe2660c4f8e1 | 704 x 396 | 1ecf7424a6f669b41123d9d0d9e5bcd85f3639c659c641f7cac3c1fdf51f102a |
| assets/crane-figure-motion-rgb-alpha.mp4 | 1408 x 396 | 2.500000 s | 663,343 | 80e971968a290ab1b4176cc754acdd4aaf85fecf5137a85295ccd9e7152105f5 | 704 x 396 | bd3934157b65fcb87bb66f5bc2a5ac3c2933270cb9001d06e6aef5de39bca7c2 |
| assets/crane-flock-motion-rgb-alpha.mp4 | 2560 x 720 | 2.466667 s | 1,341,930 | 6c82ceeb31ce814e137c880ae41650e5d24df26a202a4af8a3d8a9d60dbeff00 | 1280 x 720 | ea843495a8293c8d1f9bf63627951b9c28cb0d395a007f2b2801f2cb4970a2d0 |

The full frozen homepage media inventory also passed during the production
build: 56 emitted files, 8 HEVC-alpha sources, and 6 portrait packed-alpha
sources.

## Existing automated gates

| Command | Result |
| --- | --- |
| cd app && pnpm run verify:media:phone-masters | PASS; all three source, byte, and composed-frame identities above match. |
| cd app && pnpm typecheck | PASS. |
| cd app && pnpm test | PASS; 215 files and 1,253 tests. |
| cd app && pnpm build | PASS; formal static gates and media inventory pass. Phone budget actual is 661,507 bytes, leaving 2,045 bytes; this is below the existing recommended 4 KiB warning threshold but below neither hard cap. |

Those green gates do not prove user-visible presentation behavior.

## Browser contracts deliberately failing at be9db27

The following contracts were added to app/e2e/r5-phone-story.spec.ts and run
against the built production artifact through playwright.phone.config.ts.

| Contract | Reproduced baseline failure |
| --- | --- |
| Hero loader -> primed zero -> monotonic entrance | WebKit's first loader-exposed Hero sample was progress 1.0000, not <= 0.001. This is the completed-state-before-reset flash. |
| AOD liveness without compositor frame | With the AOD WebGL context withheld and video play resolved/currentTime advanced, both Chromium and WebKit observed transaction phase animating. A visible packed-canvas frame was never available. |
| Live visual viewport coverage | With a non-zero live visualViewport offset, Chromium reported coverage right 390 where the live right edge required >= 979; WebKit reported 393 where >= 979 was required. The existing hook publishes diagnostics but does not update the coverage plane. |

These failures are required red tests, not accepted regressions. They remain
enabled until their owner tasks implement the presentation contract.

## Device boundary

Playwright WebKit is an engine gate only. This baseline does not claim physical
iPhone Safari acceptance for toolbar movement, lock/unlock, foreground/
background, slow decoder, or continuous gestures. Those cases remain release
blocking acceptance work after the automated recovery gates are green.
