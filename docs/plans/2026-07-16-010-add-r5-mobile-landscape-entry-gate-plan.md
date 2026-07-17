---
title: R5 Mobile Landscape Entry Gate and Final Visual Polish
type: add
status: superseded
date: 2026-07-16
superseded_by: 1942f6a
follow_up: docs/plans/2026-07-17-012-fix-r5-portrait-interaction-motion-plan.md
---

# R5 Mobile Landscape Entry Gate and Final Visual Polish Implementation Plan

> **Status:** superseded by commit `1942f6a`; do not use this as an active execution plan
>
> **Supersession decision:** phone portrait is now a supported entry path. The blocking landscape gate is disabled through `MOBILE_LANDSCAPE_GATE_ENABLED = false`, and its pre-hydration shell was removed from `app/index.html`.
>
> **Historical value:** the capability detection and viewport-stability code may remain as compatibility infrastructure for a future optional landscape mode, but it must not block portrait access without a new product decision.

> **Execution mode:** rapid launch patch  
> **Scope:** mobile landscape entry gate + the seven newly reported visual/layout corrections  
> **Acceptance authority:** user visual review on desktop and a physical iPhone  
> **Important:** this plan intentionally avoids another full release qualification cycle.

## Supersession Notes

- The orientation gate, “开始浏览” requirement, and portrait warning are no longer release criteria.
- The typography and responsive-layout corrections that survived this plan are tracked by Plan 011 and were implemented in `1942f6a`.
- The remaining portrait work is interaction, motion, viewport behavior, navigation, and device validation; it is tracked by Plan 012.
- Do not re-enable the gate as a workaround for portrait defects. A reactivation requires an explicit product decision and a separate acceptance review.
- The tasks below are retained only as implementation history.

## Goal

Complete one small, reviewable patch that:

1. asks phone users to rotate to landscape before the story starts;
2. waits for an explicit “开始浏览” action before releasing the loader and interaction;
3. keeps iOS Safari within its actual browser limitations;
4. fixes the Hero, Pattern, Method, Proof, Services, and Education details listed below;
5. preserves the existing Hero → Pattern and Method → Figure2 cold-start optimizations;
6. stays within the existing JS/CSS hard budgets without raising either limit.

This is not a redesign or a new release-qualification project.

## Confirmed corrections

| Area | Required result |
| --- | --- |
| Mobile entry | Phone portrait is blocked by a landscape prompt; landscape becomes startable only after orientation is stable; story begins only after tapping “开始浏览”. |
| Hero copy | In `你的同行不是更聪明，只是更早把 AI 用进了生意里。`, the line beginning with `只是` starts about three Chinese-character spaces farther right. |
| Pattern copy | The right-side copy after Pattern contraction moves right by `5vw`. |
| Method | The wide first panel and two-column second panel become one continuous reading scroll; there is no scene transition between them. |
| Proof | Insert a visual line break immediately after `同野观幂做第四种：`. |
| Services | The second panel does not hesitate halfway through; first-panel right copy uses the standard subtitle size. |
| Reading layouts | Method, Services, and Education second panels use Lab’s two-column grid, gap, row rhythm, and sticky lead alignment. |
| Education | `先会用，` and `再出海。` render as exactly two lines, not four. |

## Constraints

- Do not change media assets, transition shaders, ink particles, or scene animation timing outside this list.
- Do not remove or weaken the current first-use preloading for Hero → Pattern and Method → Figure2.
- Do not add a heavy orientation library.
- Do not use user-agent sniffing as the main phone detector.
- Do not call `screen.orientation.lock()` or require fullscreen; iOS Safari does not provide a dependable path for either.
- Do not add literal ordinary spaces to create the Hero indent; HTML may collapse them.
- Do not raise the JS or CSS budget.
- Do not run the full release matrix for this patch.

## Implementation

### Task 1: Add a small phone landscape entry policy

**Create**

- `app/src/production/mobile-landscape-entry.ts`
- `app/src/production/mobile-landscape-entry.test.ts`

Keep the policy pure and dependency-free.

Use viewport dimensions from `window.visualViewport` when available, otherwise use `window.innerWidth` and `window.innerHeight`.

Treat a viewport as a gated phone only when all are true:

```ts
pointer: coarse
hover: none
Math.min(viewportWidth, viewportHeight) <= 500
```

Treat phone landscape as ready only when all are true:

```ts
viewportWidth >= 640
viewportHeight >= 300
viewportWidth - viewportHeight >= 48
```

Require the same landscape result for:

- two consecutive `requestAnimationFrame` samples;
- with no more than `2px` dimension drift;
- followed by a `180ms` quiet period.

This prevents iOS browser chrome and keyboard/toolbar resizing from rapidly opening and closing the gate.

The policy states are:

```text
desktop/tablet bypass
phone portrait blocked
phone landscape ready
experience started
started but portrait warning
```

Once started, never reset the story because orientation changes.

### Task 2: Add the entry overlay and connect it to StoryApp

**Create**

- `app/src/production/MobileLandscapeGate.tsx`
- `app/src/production/MobileLandscapeGate.test.tsx`

**Modify**

- `app/src/production/StoryApp.tsx`
- `app/index.html`
- `app/src/styles.css`
- `app/src/production/StoryNav.css`

Required behavior:

1. Desktop and non-phone touch devices bypass the gate.
2. Phone portrait shows a full-viewport “请横屏浏览” prompt.
3. After a stable landscape is detected, show the primary button `开始浏览`.
4. Before that button is tapped:
   - the Story loader may complete critical asset preparation;
   - the loader must not visually exit;
   - Stage input, navigation, playback, and runtime scene advancement remain disabled;
   - route-adjacent runtime prewarm remains disabled.
5. After the button is tapped:
   - release the loader;
   - enable Stage interaction and navigation;
   - start the existing adjacent prewarm path;
   - begin from the correct direct-entry or Hero state.
6. If the user rotates back to portrait after starting:
   - show a lighter “请转回横屏” warning;
   - make Stage and navigation inert;
   - allow an already-running transition to settle;
   - do not rewind, remount, or reset the current scene.
7. Returning to landscape hides the warning and resumes from the same state.

Use one derived boolean such as:

```ts
const experienceInteractive =
  presentationReady &&
  landscapeGateStarted &&
  landscapeCurrentlyAllowed &&
  !bootFailed;
```

Feed that same authority to Stage, input attachment, navigation visibility/interactivity, and prewarm scheduling. Do not create separate competing readiness flags.

Add a minimal pre-hydration portrait shell to `app/index.html` so an iPhone does not briefly expose Hero before React mounts. Preserve the existing no-JS escape/fallback.

For iOS:

- listen to `resize`, `orientationchange`, and `visualViewport.resize`;
- do not require `visualViewport.scale === 1`;
- keep videos `muted` and `playsInline`;
- do not add artificial video play/pause priming;
- do not attempt programmatic orientation lock.

### Task 3: Correct Hero, Pattern, and Proof copy placement

**Modify**

- `app/src/scenes/hero/index.tsx`
- `app/src/scenes/hero/progress.test.ts`
- `app/src/scenes/pattern/index.tsx` only if a dedicated class/hook is needed
- `app/src/styles.css`
- `app/src/scenes/figure2-proof/index.tsx`
- `app/src/scenes/figure2-proof-closing/index.tsx`
- `app/src/scenes/figure2-proof-scenes.test.ts`

#### Hero

Render the final sentence as two visual lines while preserving the complete accessible sentence:

```text
你的同行不是更聪明，
　　　只是更早把 AI 用进了生意里。
```

Implement the second-line offset with a span/class and an initial:

```css
padding-inline-start: 3em;
```

The first visual pass uses `3em` exactly as requested. Only adjust to `2em` or `4em` if the user asks after seeing it.

Do not change Hero reveal timing or Figure1 motion.

#### Pattern

Move the contracted-state right copy by:

```css
transform: translate3d(5vw, 0, 0);
```

Apply it to desktop and forced phone-landscape layouts. Keep the existing portrait fallback centered/readable behind the entry gate.

Do not change Pattern contraction timing, text reveal timing, or Pattern → Star Map transition behavior.

#### Proof

Render:

```text
同野观幂做第四种：
先进现场，再定章法，陪你跑到账上有数。
```

Use an explicit `<br />` or two block spans in both the canonical combined Proof scene and its compatibility closing component. Keep the underlying copy value intact for static fallback and copy-baseline checks.

### Task 4: Make Method one continuous reading scene

**Modify**

- `app/src/scenes/method-top/index.tsx`
- `app/src/scenes/method-top/copy.test.ts`
- `app/src/story/canonical-spine.ts`
- `app/src/story/spine.test.ts`
- `app/src/story/manifest.ts`
- `app/src/story/manifest.test.ts`
- `app/src/production/module-loaders.ts`
- `app/src/production/module-loaders.test.ts`
- `app/src/production/navigation.test.ts`
- `app/src/styles.css`

Compose the current Method wide panel and the current Method two-column panel inside one `method-top` scene and one native reading scrollport:

```text
Method scene scrollport
├── panel 1: full-width opening
└── panel 2: Lab-aligned two-column details
```

Required runtime changes:

- mark `method-top` as the reading scene;
- retire `method-bottom` from the canonical scene list;
- retire `method-top-method-bottom` from the canonical segment list;
- keep the existing external scene/segment types or files only as compatibility code if removing them would create unnecessary churn;
- point the Figure2 handoff from the combined Method scene to `figure2-animation`;
- the existing ID `method-bottom-figure2` may remain as a compatibility ID for this rapid patch, but its canonical `from` scene becomes `method-top`;
- preserve its existing Figure2 preload/GPU-surface reuse behavior.

Scroll behavior:

- forward entry from AOD starts at the top of Method panel 1;
- normal wheel/touch scrolling moves directly into panel 2 with no ink, fade, semantic hold, or runtime transition;
- downward input hands off to Figure2 only after the Method scrollport reaches its real bottom;
- reverse entry from Figure2 lands at Method’s bottom and then scrolls upward continuously through panel 2 to panel 1.

Do not replace the internal boundary with a zero-duration transition. It must be real reading scroll.

### Task 5: Align Method, Services, and Education second panels to Lab

**Modify**

- `app/src/scenes/services/index.tsx`
- `app/src/scenes/education/index.tsx`
- `app/src/styles.css`

Use Lab as the exact layout reference rather than creating three similar-but-different variants.

Consolidate shared CSS where it reduces bytes:

```css
grid-template-columns: minmax(260px, 0.72fr) minmax(0, 1.42fr);
gap: clamp(36px, 6vw, 88px);
```

Match Lab’s:

- outer horizontal padding;
- sticky lead-column top offset;
- row heading height;
- detail row proportions;
- divider-free internal reading flow;
- mobile-landscape compaction.

Do not change the copy or semantic order of any of the three parts.

#### Services first panel

Promote the right-side signal copy from the current small label size to the standard part subtitle token:

```css
font-size: var(--r4-part-row-title-size);
font-family: var(--r4-font-traditional);
font-weight: 600;
```

Use the existing standard token; do not introduce a new font-size constant.

#### Services second panel

The reported middle hesitation must not be solved by weakening the global reading governor.

First remove Services-only excess scroll height, oversized row proportions, or sticky spacing created by its divergent grid. Verify that steady input passes from row `02` to `03` without:

- a semantic hold;
- an internal transition;
- scroll snapping;
- an artificial spacer.

If a hesitation remains after Lab alignment, adjust only Services-specific padding/min-height. Do not change global reading acceleration or edge handoff behavior.

#### Education second panel

The component already has separate `先会用，` and `再出海。` spans. Make each span one unbroken visual line:

```css
.r4-education__lead h2 span {
  display: block;
  white-space: nowrap;
}
```

The Lab-aligned left column must be wide enough that the result is exactly:

```text
先会用，
再出海。
```

### Task 6: Preserve phone-landscape composition

**Modify**

- `app/src/styles.css`
- `app/src/production/StoryNav.css`

Existing `max-width` rules must not accidentally turn a landscape phone back into the portrait/one-column composition.

Add one compact landscape-phone condition shared by affected components:

```css
@media
  (orientation: landscape)
  and (max-height: 500px)
  and (hover: none)
  and (pointer: coarse) {
  /* compact horizontal layouts */
}
```

In this mode:

- Hero remains legible with the new `3em` second-line indent;
- Pattern copy stays on the right and receives the `5vw` shift;
- Method panel 1 remains full-width;
- Method/Services/Education panel 2 remain two-column;
- topbar reservation and menu controls keep the same height, padding, border, and radius;
- text is compacted only enough to avoid clipping;
- no content is hidden merely to fit the viewport.

Prefer grouped selectors and existing design tokens to remain inside the CSS budget.

## Rapid verification

### Required automated checks

Run these once after all edits are complete:

```bash
pnpm --dir app lint
pnpm --dir app typecheck
pnpm --dir app exec vitest run \
  src/production/mobile-landscape-entry.test.ts \
  src/production/MobileLandscapeGate.test.tsx \
  src/production/StoryNav.test.tsx \
  src/production/module-loaders.test.ts \
  src/production/navigation.test.ts \
  src/scenes/hero/progress.test.ts \
  src/scenes/pattern/progress.test.ts \
  src/scenes/method-top/copy.test.ts \
  src/scenes/figure2-proof-scenes.test.ts \
  src/story/spine.test.ts \
  src/story/manifest.test.ts \
  src/transitions/method-bottom-figure2/index.test.ts
pnpm --dir app build
git diff --check
```

The single final build is the budget gate:

- JS must remain at or below the existing hard cap;
- CSS must remain at or below the existing hard cap;
- do not raise either cap;
- if it fails, report the exact byte delta and reduce duplicated code/CSS before proceeding.

The removal of the production Method subscene/transition and shared Lab layout CSS should fund the small landscape-gate code.

### Explicitly not required for this quick patch

Do **not** run these unless a focused check exposes a wider regression:

- full `pnpm test`;
- full `pnpm test:release`;
- the complete Chromium/WebKit project matrix;
- `verify:media:deep`, because no media changes are in scope;
- memory qualification;
- immutable candidate freeze;
- rollback qualification;
- repeated builds between tasks.

Do not add broad new regression suites for purely visual spacing.

### Focused browser/device check

The user’s visual review is the release authority for this patch.

Preferred check: one physical iPhone Safari session plus one desktop browser session.

Only if a physical iPhone is unavailable during implementation, run one focused mobile-WebKit orientation case; do not run the full Playwright suite.

## Visual acceptance checklist

### Phone entry

- Portrait first load shows the landscape prompt, not an interactive Hero.
- Rotating to landscape does not immediately start the story.
- `开始浏览` appears only after orientation is stable.
- Tapping it starts from Hero/direct entry once, without a remount flash.
- iOS browser chrome expansion/collapse does not flicker the gate.
- Rotating to portrait mid-story pauses interaction without resetting position.
- Returning to landscape resumes from the same scene.

### Copy and layout

- Hero `只是` begins at the requested initial `3em` indent.
- Pattern contracted copy is visibly `5vw` farther right.
- Method panels scroll as one continuous document with no transition between them.
- Proof breaks immediately after `做第四种：`.
- Services first-panel right copy reads as a standard subtitle.
- Services rows pass through the middle without an artificial stop.
- Method, Services, and Education second panels align with Lab.
- Education lead is exactly two lines.

### Regression guard

- Hero → Pattern first use remains warm.
- Method → Figure2 first use remains warm.
- Desktop navigation and scene order are unchanged except for removal of the internal Method transition.
- No media, ink, particle, or transition visual is altered.

## Delivery sequence

1. Implement all changes in one working pass.
2. Run the targeted checks once.
3. Run one production build and inspect budgets once.
4. Present desktop and physical-iPhone views for user visual acceptance.
5. Make only the user-requested spacing corrections, if any.
6. Re-run only the directly affected targeted test plus `git diff --check`; rebuild only when production code/CSS changed.
7. Commit and ship after visual approval.

## Done definition

This plan is complete when:

- the phone landscape gate follows the stated iOS-safe flow;
- all seven visual/layout corrections pass user visual review;
- Method is structurally one reading scene;
- the two known cold-start transitions do not regress;
- targeted lint, typecheck, tests, final build, and `git diff --check` pass;
- JS/CSS limits remain unchanged;
- no unnecessary full qualification run has been performed.
