# Homepage Transition Split Ink Remediation V3.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the user's full 0-18 homepage findings by replacing overlay ink with real split-scene bridges, stabilizing scroll ownership before adapter migration, and restoring missing copy/layout/endpoint contracts.

**Architecture:** This plan uses a hybrid split bridge: media sources (`canvas`/`video`/`image`/controlled offscreen canvas) may enter WebGL textures, while DOM/text sources are projected as cloned DOM layers with CSS clip/mask and a shared ink edge. Runtime progress windows are stabilized before bulk adapter work so fresh-page, forward, reverse, and direct-jump captures converge on the same visual owner.

**Tech Stack:** Static HTML build via `scripts/build-index.mjs`, vanilla ESM transition adapters, WebGL canvas effects for media, DOM projection layers for text/copy, CSS section layouts, Node verification scripts, Playwright capture artifacts in `output/playwright/`, and a small PNG sampling helper if screenshot-region pixel gates require decoding.

---

## Second Review Corrections

Three independent reviewers validated the V3 direction and identified blockers. Keep these corrections in force:

- **0-18 means 19 gates.** Existing `CROSSWALK` and `GATE_ORDER` cover only issues `1-15`. This plan must add issue `0`, split out `16/17/18`, and make strict gates fail when any user issue is missing.
- **DOM does not enter shader textures.** The project has no `html2canvas`/`dom-to-image` dependency, and ordinary DOM cannot be reliably drawn into WebGL. Text/copy sources use projection DOM layers, not texture uploads.
- **Verifier rules must change before projection work.** Current static checks forbid `cloneNode(true)` and require real DOM adoption. Projection mode intentionally clones and leaves real source DOM in place, so verifier expectations must be updated first.
- **Runtime stabilization moves earlier.** Scroll rewriting via `scrollToY(... immediate ...)` is a root cause of fresh/forward/reverse divergence. Stabilize progress windows before migrating AOD/Figure2/TTG/PH/Crane adapters.
- **Runtime migration is opt-in.** Do not globally remove legacy snap playback in Task 5. Add `data-transition-runtime-mode="progress-window"` and migrate one vertical slice at a time; unmigrated transitions keep legacy snap/playhead behavior until their adapter is converted.
- **TTG/PH exits are split bridges, not early receivers.** Only AOD, Figure3, and Crane exits use early receiver. TTG -> Lab and PH -> Education must split to next copy, then commit to independent full-screen copy scenes.
- **Figure2/Brand/Figure3 has two owners.** Figure2/proof commits to Brand. Brand/Figure3 then hands to Services. Do not collapse this into a vague Figure2 -> Figure3/Brand bridge.
- **Contact CTA is blocking.** `mailto:contact@example.com` is a placeholder. #18 cannot pass until Contact has a non-placeholder action or an explicitly accepted in-page fallback.
- **Desktop is the blocking acceptance scope.** Mobile capture remains optional smoke for regression awareness unless it reveals a severe blank screen or JavaScript runtime failure.

## Evidence Snapshot

Latest reviewed artifact:

`output/playwright/homepage-findings-playwright-review-2026-06-28/homepage-checkpoints.json`

Current strict gate result:

`Homepage transition gates: failed (5 passed, 10 failed)`

Key unstable samples:

| Sample | Fresh | Forward | Reverse | Meaning |
| --- | --- | --- | --- | --- |
| `4598` | `4598 method:none` | `3808 belief-method:entryInk` | `3808 belief-method:entryInk` | AOD/Method handoff is not stable. |
| `6762` | `6246 figure2:entry` | `6762 proofCopy` | `6246 figure2:entry` | Figure2 progress is collapsed by snap state. |
| `7873` | `6246 figure2:entry` | `7965 brand-services:scene` | `7873 brand:none` | Figure2/Brand/Figure3 ownership is inconsistent. |
| `10784` | `11694 lab:none` | `10853 services-lab:handoff` | `10853 lab:none` | TTG/Lab bridge is not stable. |
| `11616` | `11694 lab:none` | `11694 lab:none` | `10853 services-lab:entryInk` | Lab copy is still controlled by transition. |
| `14839` | `14899 education:none` | `14839 lab-education:handoff` | `14058 lab-education:entryInk` | PH/Education bridge is direction-dependent. |
| `18097` | `18157 philosophy-contact:handoff` | `17319 education-philosophy:none` | `17319 philosophy-contact:entryInk` | Crane/Contact endpoint is not stable. |

## Non-Negotiable Visual Contracts

1. A split bridge must visibly hold previous content in the upper region and next content in the lower region during the bridge window.
2. `data-*` attributes are claims, not proof. Gates may use them to locate owners, but pass/fail must rely on sampled canvas/screenshot evidence and DOM geometry/visibility.
3. DOM/text/copy sources must be projected as DOM layers. Do not rasterize arbitrary DOM into a canvas to satisfy a shader API.
4. Media/canvas/video sources may be mixed in WebGL when they are real texture-capable elements.
5. AOD -> Method, Figure3 -> Services, and Crane -> Contact use early receiver in the final roughly 20% of animation.
6. TTG -> Lab and PH -> Education use split ink to the next chapter copy, then commit to independent full-screen copy scenes.
7. No progress window may have `copy=none`, `scene=none`, and no active bridge/foreground.
8. Fresh-page, same-page-forward, same-page-reverse, and direct-jump captures must resolve to the same primary owner for the same review window.
9. Each visible section boundary line has exactly one owner.
10. `homepageEndpointSpec.mode` must not be `undecided`.

## Complete User-Issue Gate Crosswalk

Pixel anchors are sampling aids, not exact product timing.

| User issue | Gate id | Sample anchors | Required closure |
| --- | --- | --- | --- |
| #0 | `nav-blur-depth` | `0`, `886`, `919` | Nav blur bbox height is about `2 * nav-h`, visible with nav, no hard one-line edge. |
| #1 | `home-pattern-no-dark-gap` | `736`, `886`, `919` | Pattern/Hero never falls into dark empty hold. |
| #2 | `belief-manifesto-copy` | `1293`, `1310`, `1699` | Belief has main copy plus restored right manifesto note. |
| #3 | `belief-star-split` | `1299`, `1843`, `2327` | Pattern/copy/star are staged; split bridge shows upper previous and lower next. |
| #4 | `belief-aod-entry` | `2700`, `2920`, `2937` | Star map does not independently scroll over AOD; split into AOD first frame. |
| #5 | `aod-scene-visible` | `2920`, `3767`, `4598` | AOD is primary and not covered by Belief star map. |
| #6 | `aod-method-receiver` | `4598`, `5368` | Method copy appears during AOD final window, centered/readable. |
| #7 | `method-figure2-entry` | `5368`, `6198`, `6451` | Method/proof enters Figure2 through split bridge. |
| #8 | `figure2-exit-no-blank` | `6745`, `6885`, `6920`, `7873` | Figure2 arch dissolves through ink; no blank gap before Brand/Figure3. |
| #9 | `figure3-services-receiver` | `7873`, `8703`, `9535` | Figure3 has no misplaced exit ink; Services copy enters final window. |
| #10 | `services-ttg-lab-split` | `9954`, `10784`, `11616` | Services -> TTG and TTG -> Lab use split bridges with correct top/bottom owners. |
| #11 | `lab-independent-dividers` | `11616` | Lab copy is an independent full viewport with one divider system. |
| #12 | `lab-column-rhythm` | `12139`, `12417` | Right list top-aligns with left lead. |
| #13 | `lab-ph-education-split` | `13177`, `14007`, `14839` | Lab -> PH and PH -> Education use split bridges with correct top/bottom owners. |
| #14 | `education-independent-dividers` | `14839` | Education copy is an independent full viewport with one divider system. |
| #15 | `education-column-rhythm` | `14839` | Education right list top-aligns with left lead. |
| #16 | `philosophy-no-empty-field` | `16059`, `16438` | No long blank field or orphan divider before Crane. |
| #17 | `crane-contact-receiver` | `16438`, `17268`, `18097` | Philosophy -> Crane uses split entry; Crane -> Contact uses early receiver. |
| #18 | `contact-endpoint-real` | `18097`, `18523` | Contact is one endpoint screen; CTA is light/readable and non-placeholder. |

## Correct Transition Ownership

| Window | Primitive | Owners |
| --- | --- | --- |
| Belief star -> AOD | `splitSceneBridge` | top=`belief`, bottom=`aod`; commit=`aod` |
| AOD -> Method | early receiver | AOD remains primary; Method projection enters; commit=`method` |
| Method -> Figure2 | `splitSceneBridge` | top=`method`, bottom=`figure2`; commit=`figure2` |
| Figure2/proof -> Brand | split/dissolve to copy | top=`figure2/proof`, bottom=`brand`; commit=`brand` |
| Brand/Figure3 -> Services | Figure3 animation + early receiver | Figure3 owns animation; Services projection enters; commit=`services` |
| Services -> TTG | `splitSceneBridge` | top=`services`, bottom=`ttg`; commit=`ttg` |
| TTG -> Lab copy | `splitSceneBridge` | top=`ttg`, bottom=`lab`; commit=`lab` |
| Lab -> PH | `splitSceneBridge` | top=`lab`, bottom=`ph`; commit=`ph` |
| PH -> Education copy | `splitSceneBridge` | top=`ph`, bottom=`education`; commit=`education` |
| Philosophy -> Crane | `splitSceneBridge` | top=`philosophy`, bottom=`crane`; commit=`crane` |
| Crane -> Contact | early receiver | Crane remains primary; Contact projection enters; commit=`contact` |

## File Structure

Create:

- `js/effects/split-scene-ink-transition.js`: media/canvas previous+next compositor and ink edge renderer.
- `js/transitions/homepage/split-scene-bridge.js`: bridge root, DOM projection, owner metadata, clip/mask synchronization.
- Optional `scripts/lib/png-sampler.mjs`: screenshot-region sampler if gate implementation needs PNG decoding.

Modify:

- `package.json`: add static contract verification script and any PNG sampling dependency if used.
- `scripts/capture-homepage-checkpoints.mjs`: 0-18 crosswalk, direct-jump mode, active split bridge evidence, nav/contact metrics.
- `scripts/check-homepage-transition-gates.mjs`: strict 19-gate user issue checker.
- `scripts/check-handoff-ownership.mjs`: allow controlled projection clones and forbid uncontrolled adapter clones.
- `scripts/check-homepage-transition-integration.mjs`: change adoption assertions to projection assertions for new bridge paths.
- `scripts/check-section-transition-contract.mjs`: accept progress-window ownership metadata.
- `js/effects/ink-scene-transition.js`: keep old API, mark curtain as decorative-only for bridge purposes.
- `js/transitions/homepage-transition-runtime.js`: progress-window ownership before adapter migration.
- `src/section-manifest.mjs`: 0-18 transition windows, endpoint spec, source owner contracts, and `runtimeMode` declarations.
- `scripts/build-index.mjs`: emit `data-transition-runtime-mode` from manifest.
- `js/transitions/homepage/handoff-receiver.js`: projection mode with real DOM left in source section.
- `js/transitions/pattern-bloom-adapter.js`
- `js/transitions/homepage/aod-homepage-adapter.js`
- `js/transitions/homepage/figure2-homepage-adapter.js`
- `js/transitions/homepage/figure3-homepage-adapter.js`
- `js/transitions/homepage/ttg-homepage-adapter.js`
- `js/transitions/homepage/ph-homepage-adapter.js`
- `js/transitions/homepage/crane-homepage-adapter.js`
- `src/sections/belief.html`
- `src/sections/contact.html`
- `css/components/scroll-edge-blur-nav.css`
- `css/components/homepage-continuity.css`
- `css/components/homepage-transitions.css`
- `css/sections/canvas-stage.css`
- `css/sections/source-copy.css`
- `css/sections/paper-canvas-theme.css`
- relevant section CSS for `figure2`, `figure3`, `ttg`, `ph`, and `crane`.

## Task 1: Gate And Verifier Contracts First

**Files:**

- Modify: `package.json`
- Modify: `scripts/capture-homepage-checkpoints.mjs`
- Modify: `scripts/check-homepage-transition-gates.mjs`
- Modify: `scripts/check-handoff-ownership.mjs`
- Modify: `scripts/check-homepage-transition-integration.mjs`
- Modify: `scripts/check-section-transition-contract.mjs`
- Modify: `src/section-manifest.mjs`
- Optional create: `scripts/lib/png-sampler.mjs`

- [ ] **Step 1: Expand capture crosswalk to user issues #0-#18**

Replace the old 15-row `CROSSWALK` with the table in **Complete User-Issue Gate Crosswalk**. Keep legacy gate names only as internal aliases where useful; strict output must report user issues `0` through `18`.

- [ ] **Step 2: Make strict gate require 19 user issues**

In `scripts/check-homepage-transition-gates.mjs`, add:

```js
const EXPECTED_USER_ISSUES = Array.from({ length: 19 }, (_, issue) => issue);
```

Strict mode must fail when any issue is missing, even if all existing rows pass.

- [ ] **Step 3: Split claim fields from sampled evidence**

Capture bridge claims separately:

```js
{
  claimedTopOwner,
  claimedBottomOwner,
  previousReadyClaim,
  nextReadyClaim,
  splitProgressClaim
}
```

Gateable evidence must be sampled fields:

```js
{
  previousTopPixelRatio,
  previousTopPixelRatioSource,
  nextBottomPixelRatio,
  nextBottomPixelRatioSource,
  topOwnerElementHit,
  bottomOwnerElementHit
}
```

`data-*` claims may locate owners but cannot pass a gate by themselves.

- [ ] **Step 4: Add real split evidence gates**

For split bridge windows, require:

```js
previousTopPixelRatio >= 0.015
nextBottomPixelRatio >= 0.015
['sampled-canvas', 'sampled-screenshot', 'sampled-dom-geometry'].includes(previousTopPixelRatioSource)
['sampled-canvas', 'sampled-screenshot', 'sampled-dom-geometry'].includes(nextBottomPixelRatioSource)
claimedTopOwner !== claimedBottomOwner
topOwnerElementHit === true
bottomOwnerElementHit === true
```

If PNG screenshot sampling is implemented, use Playwright screenshot clips and decode them in Node. If not, DOM projection gates must combine `elementFromPoint`, bounding rect, computed opacity, and clip-path geometry; record the source as `sampled-dom-geometry`.

- [ ] **Step 5: Update handoff verifier for projection**

`scripts/check-handoff-ownership.mjs` must allow `cloneNode(true)` only inside `handoff-receiver.js` projection mode. It must still reject uncontrolled `cloneNode(true)` inside homepage adapters.

New projection assertions:

- `createHandoffReceiver` supports `mode: 'projection'`.
- projection mode does not insert a placeholder.
- projection mode does not set `data-handoff-adopted`.
- real source remains inside its original section while projection receiver is visible.
- legacy `mode: 'adopt'` remains allowed only for explicitly whitelisted old paths.

- [ ] **Step 6: Update homepage integration verifier**

Change assertions that say “must adopt the real target DOM” to “must project the real target source without adopting it” for new split/receiver paths.

Adapters migrated by this plan must call receiver helpers with `mode: 'projection'`.

- [ ] **Step 7: Add static contract verification to `verify:all`**

Add or update a static script so `npm run verify:all` verifies:

- crosswalk includes user issues `0-18`;
- split bridge helper exists;
- projection/adopt verifier rules match this plan;
- split bridge migration is phase-aware.

In Task 1, `verify:all` may report pending required split bridges, but it must not fail solely because unmigrated homepage adapters still use `createInkCurtainTransition`. A curtain ban becomes enforced per transition only after that transition is migration-enforced.

A transition is migration-enforced when either condition is true:

- `src/section-manifest.mjs` declares `bridge: 'splitSceneBridge'`, `contract.bridgeType: 'splitSceneBridge'`, or `runtimeMode: 'progress-window'` for that transition.
- the corresponding adapter imports or calls `createSplitSceneBridge`.

Once a transition is migration-enforced, static checks must fail if `createInkCurtainTransition` is still used as required scene bridge evidence for that transition.

- [ ] **Step 8: Run baseline and expect failure**

Run:

```bash
npm run build:page
npm run verify:all
npm run capture:homepage-checkpoints -- --mode=all --desktop-only --output-name=homepage-transition-v31-baseline
npm run verify:homepage-transition-gates -- --strict --input output/playwright/homepage-transition-v31-baseline/homepage-checkpoints.json
```

Expected: current implementation fails strict 19-issue gates. This confirms the new gates detect the known missing behavior.

## Task 2: Layout, Copy, Endpoint Prerequisites

**Files:**

- Modify: `css/components/scroll-edge-blur-nav.css`
- Modify: `src/sections/belief.html`
- Modify: `css/sections/canvas-stage.css`
- Modify: `css/sections/source-copy.css`
- Modify: `src/sections/contact.html`
- Modify: `css/sections/paper-canvas-theme.css`
- Modify: `src/section-manifest.mjs`

- [ ] **Step 1: Restore nav blur depth**

Use the demo-equivalent blur height:

```css
.scroll-edge-blur {
  --scroll-edge-blur-height: calc(var(--nav-h) * 2 + env(safe-area-inset-top, 0px));
  height: var(--scroll-edge-blur-height);
}
```

Keep existing nav-driven visibility, but do not reduce the blur band below this depth.

- [ ] **Step 2: Restore Belief manifesto note**

Update `src/sections/belief.html` so `.belief-copy-wrap` includes:

```html
<article class="belief-manifesto-note manifesto-note">
  <span class="card-label">一句话讲清我们干什么</span>
  <h3>让 AI 从一场培训，变成账上的数字。</h3>
  <p>我们不卖课、不卖软件，而是进到你的业务现场，把 AI 做成团队天天在用、月底对得上账的东西。</p>
</article>
```

Source: `/Users/aitoshuu/Downloads/tongyeme 2/index.html`.

- [ ] **Step 3: Restore Belief desktop two-column layout**

In `css/sections/canvas-stage.css`, make `.belief-copy-wrap` a desktop two-column layout and mobile stacked layout. Preserve `.belief-copy-wrap` as the observer target.

- [ ] **Step 4: Remove duplicate divider ownership**

In `css/sections/source-copy.css`, keep one divider owner per independent scene:

- stage border or pseudo-element, not both;
- signals rows use internal separators only;
- `11616` and `14839` must not show parallel divider lines.

- [ ] **Step 5: Align Lab and Education columns**

Create a shared alignment anchor for left lead and right list/screen. Gate target: right first readable block aligns with the left heading band.

- [ ] **Step 6: Decide endpoint policy**

Use `contact-only` unless product explicitly approves visible footer composition:

```js
export const homepageEndpointSpec = {
  mode: 'contact-only',
  snapTarget: '#contact',
  footerVisibleRatioMin: 0,
  footerVisibleRatioMax: 0.12,
  tolerancePx: 8,
  approvalSource: '2026-06-28-v31-contact-only-endpoint'
};
```

- [ ] **Step 7: Replace Contact placeholder CTA**

`contact@example.com` must be removed. Acceptable targets:

- a confirmed company email/form/booking URL; or
- an explicit in-page fallback added in this branch, such as a small contact request form or modal target with `id="contact-request"`.

Do not mark #18 complete with a self-link that does nothing.

- [ ] **Step 8: Make Contact CTA visually light/readable**

Add Contact-specific button styling so the primary appointment action is clearly readable on the endpoint background.

- [ ] **Step 9: Verify static layout prerequisites**

Run:

```bash
npm run build:page
npm run verify:all
```

Expected: static verification passes. Dynamic visual gates may still fail until transition tasks land.

## Task 3: Hybrid Split Bridge Primitive

**Files:**

- Create: `js/effects/split-scene-ink-transition.js`
- Create: `js/transitions/homepage/split-scene-bridge.js`
- Modify: `js/effects/ink-scene-transition.js`
- Modify: `scripts/check-homepage-transition-integration.mjs`

- [ ] **Step 1: Define typed source descriptors**

`split-scene-bridge.js` must accept:

```js
{
  kind: 'domProjection',
  owner: 'services',
  element: servicesCopyElement
}
```

```js
{
  kind: 'mediaTexture',
  owner: 'ttg',
  element: ttgCanvasOrVideoElement
}
```

```js
{
  kind: 'canvasTexture',
  owner: 'aod',
  element: aodCanvasElement
}
```

DOM/text/copy sources always use `domProjection`. They must not be passed to WebGL texture code.

- [ ] **Step 2: Create bridge root API**

Expose:

```js
export function createSplitSceneBridge({
  host,
  transitionId,
  previous,
  next,
  direction = 'down',
  className = ''
}) {
  return {
    root,
    inkCanvas,
    update(progress, options = {}) {},
    destroy() {}
  };
}
```

The bridge root owns projection layers, ink canvas, evidence attributes, and clip synchronization.

- [ ] **Step 3: Create media compositor API**

`split-scene-ink-transition.js` exposes:

```js
export function createSplitSceneInkTransition(canvas, {
  previousTexture,
  nextTexture,
  direction = 'down',
  seed = 1,
  maxDevicePixelRatio = 1.5
}) {
  return {
    update(progress, options = {}) {},
    resize() {},
    destroy() {}
  };
}
```

This API is for texture-capable media only.

- [ ] **Step 4: Synchronize DOM projection clips with the ink edge**

For DOM projection sources, update CSS variables on the bridge root:

```css
--split-progress: 0;
--split-edge-y: 50%;
--split-feather: 9%;
```

Upper owner projection is clipped above the edge; lower owner projection is clipped below the edge. The ink canvas overlays the edge and never replaces DOM text.

- [ ] **Step 5: Demote curtain**

`createInkCurtainTransition` remains allowed for decorative foreground ink only. Integration checks must fail if it is used as a required scene bridge for:

- `belief-method`
- `method-tooling__method-proof`
- `services-lab`
- `lab-education`
- `philosophy-contact`

- [ ] **Step 6: Add performance fallback**

Bridge implementation must support:

- capped DPR for ink canvas;
- no dual live-video textures;
- projection-only fallback when WebGL is unavailable;
- reduced-motion fallback with no blank owner;
- `data-split-quality="full|projection-only|reduced-motion"`.

## Task 4: Projection Receiver And Verifier Sync

**Files:**

- Modify: `js/transitions/homepage/handoff-receiver.js`
- Modify: `scripts/check-handoff-ownership.mjs`
- Modify: `scripts/check-homepage-transition-integration.mjs`
- Modify: `css/components/homepage-continuity.css`

- [ ] **Step 1: Add projection mode**

Add:

```js
createHandoffReceiver({
  host,
  source,
  className,
  mode: 'projection'
})
```

Projection mode clones the source into a receiver layer and leaves real source DOM in place.

- [ ] **Step 2: Preserve legacy adoption behind explicit mode**

Existing adoption behavior may remain as `mode: 'adopt'`, but new homepage bridge work must use `mode: 'projection'`.

- [ ] **Step 3: Stop hard section hiding for projection**

Do not use whole-section `visibility:hidden` target gating while a projection receiver is responsible for visual continuity. Apply opacity/clip to projection layers only.

- [ ] **Step 4: Update verifier assertions**

Static checks must assert:

- projection clones are allowed only in the shared receiver/bridge helper;
- adapters do not call `cloneNode(true)` directly;
- projection mode does not insert placeholders;
- projection mode does not set `data-handoff-adopted`;
- projection callers use `mode: 'projection'`.

- [ ] **Step 5: Verify static compatibility**

Run:

```bash
npm run verify:all
```

Expected: static checks pass with projection rules before adapter migration begins.

## Task 5: Runtime Progress-Window Stabilization

**Files:**

- Modify: `js/transitions/homepage-transition-runtime.js`
- Modify: `src/section-manifest.mjs`
- Modify: `scripts/build-index.mjs`
- Modify: `scripts/capture-homepage-checkpoints.mjs`

- [ ] **Step 1: Add opt-in runtime mode**

Add a manifest field that builds into `data-transition-runtime-mode`:

```js
{
  id: 'services-lab',
  runtimeMode: 'progress-window'
}
```

Allowed values:

- `legacy-snap`: existing snap/playhead behavior; default for missing values.
- `stage-playback`: existing staged playback with explicit snap/hold behavior.
- `scroll-progress`: current `data-transition-drive="scroll"` behavior.
- `progress-window`: new owner-window mode driven by anchors and current scroll.

Do not reuse `data-transition-mode`; it already has different semantics.

- [ ] **Step 2: Keep legacy snap for unmigrated transitions**

Unmigrated AOD/Figure2/Figure3/TTG/PH/Crane adapters keep legacy snap/playhead behavior until their vertical slice is migrated. Progress-window gates may report pending status for legacy transitions, but they must not pass those transitions as structurally correct.

- [ ] **Step 3: Define progress source formula**

For `runtimeMode: 'progress-window'`, derive progress from anchors and current scroll:

```js
const startY = top(progressStartAnchor) + startOffsetVh * viewportHeight;
const endY = top(progressEndAnchor) + endOffsetVh * viewportHeight;
const progress = clamp((scrollY - startY) / Math.max(1, endY - startY), 0, 1);
```

Progress depends only on current `scrollY`, anchors, offsets, and viewport height. Direction may be diagnostic metadata, but it must not change the owner result for the same `scrollY`.

For ordinary scroll in `progress-window` mode, do not call `scrollToY(..., { immediate: true })` at the end of normal playback windows.

Allowed exceptions:

- explicit nav/hash jump;
- reduced-motion fallback;
- user-triggered skip action.

- [ ] **Step 4: Add progress-window ownership metadata**

Each transition contract declares semantic windows. Example:

```js
{
  id: 'services-lab',
  runtimeMode: 'progress-window',
  progressStartAnchor: '#services',
  progressEndAnchor: '#lab',
  startOffsetVh: 0,
  endOffsetVh: -0.15,
  windows: [
    { name: 'services-copy', from: 0, to: 0.18, owner: 'services', priority: 10 },
    { name: 'services-ttg-split', from: 0.16, to: 0.42, bridge: 'splitSceneBridge', topOwner: 'services', bottomOwner: 'ttg', commitOwner: 'ttg', priority: 20 },
    { name: 'ttg-scene', from: 0.40, to: 0.72, owner: 'ttg', priority: 10 },
    { name: 'ttg-lab-split', from: 0.70, to: 1, bridge: 'splitSceneBridge', topOwner: 'ttg', bottomOwner: 'lab', commitOwner: 'lab', priority: 20 }
  ]
}
```

Runtime and capture should expose:

```text
data-transition-current-window
data-transition-primary-owner
data-transition-top-owner
data-transition-bottom-owner
```

- [ ] **Step 5: Add direct-jump capture mode**

Extend capture so direct jump, fresh-page, forward, and reverse samples can be compared for the same user issue.

- [ ] **Step 6: Verify stability baseline**

Run:

```bash
npm run capture:homepage-checkpoints -- --mode=all --desktop-only --output-name=homepage-transition-v31-runtime-stability
npm run verify:homepage-transition-gates -- --strict --input output/playwright/homepage-transition-v31-runtime-stability/homepage-checkpoints.json
```

Expected: strict gates may still fail because adapters are not migrated, but owner divergence caused by scroll rewriting should be reduced or explicitly reported.

## Task 6: Home/Belief/AOD Vertical Slice

**Files:**

- Modify: `js/transitions/pattern-bloom-adapter.js`
- Modify: `js/transitions/homepage/aod-homepage-adapter.js`
- Modify: `js/components/aod-transition.js`
- Modify: `css/components/homepage-continuity.css`
- Modify: `css/sections/canvas-stage.css`

- [ ] **Step 1: Define Home/Belief windows**

Use:

| Window | Progress | Required visual |
| --- | --- | --- |
| `pattern-entry` | `0.00-0.32` | Hero remains covered by visible pattern. |
| `belief-upper-copy` | `0.28-0.62` | Belief main copy and manifesto note are visible. |
| `belief-star-split` | `0.58-0.86` | Split from upper copy to star map. |
| `belief-settled` | `0.84-1.00` | Star map/copy owns scene; Hero cannot reappear. |

- [ ] **Step 2: Fix Hero lifetime**

After `belief-settled` in forward progress, keep Hero visually suppressed until progress returns before Home/Belief entry. Do not rely on a narrow `revealProgress > 0.92` class.

- [ ] **Step 3: Convert Belief -> AOD**

Use `splitSceneBridge`:

- previous: `domProjection` or controlled canvas projection for Belief/star owner;
- next: `canvasTexture` or `mediaTexture` for AOD first frame;
- top owner: `belief`;
- bottom owner: `aod`.

- [ ] **Step 4: Convert AOD -> Method**

Use early receiver:

- AOD remains visible in upper/primary region;
- Method `domProjection` reaches readable opacity before AOD falls below threshold;
- text is centered in the reading zone.

- [ ] **Step 5: Capture slice**

Run:

```bash
npm run build:page
npm run capture:homepage-checkpoints -- --mode=all --desktop-only --output-name=homepage-transition-v31-home-belief-aod
npm run verify:homepage-transition-gates -- --strict --input output/playwright/homepage-transition-v31-home-belief-aod/homepage-checkpoints.json
```

Expected: issues #0-#6 pass.

## Task 7: Figure2, Brand, Figure3, Services Slice

**Files:**

- Modify: `js/components/figure2-transition.js`
- Modify: `js/transitions/homepage/figure2-homepage-adapter.js`
- Modify: `js/transitions/homepage/figure3-homepage-adapter.js`
- Modify: `js/components/figure3-transition.js`
- Modify: `css/figure2.css`
- Modify: `css/components/figure3-transition.css`

- [ ] **Step 1: Method -> Figure2 split**

Use:

- previous: Method `domProjection`;
- next: Figure2 `mediaTexture`/canvas first frame;
- commit owner: `figure2`.

- [ ] **Step 2: Figure2/proof -> Brand**

Figure2 foreground arch dissolves through the bridge. Commit owner must be `brand`, not Figure3.

- [ ] **Step 3: Brand/Figure3 -> Services**

Keep Figure3 transition as the visual animation owner. Remove misplaced exit ink. Services copy enters through early receiver during the final Figure3 window.

- [ ] **Step 4: Clean ink lifetime**

Inactive Figure2/Figure3 ink surfaces must not remain `opacity:1` or active after commit.

- [ ] **Step 5: Capture slice**

Run:

```bash
npm run build:page
npm run capture:homepage-checkpoints -- --mode=all --desktop-only --output-name=homepage-transition-v31-figure-brand-services
npm run verify:homepage-transition-gates -- --strict --input output/playwright/homepage-transition-v31-figure-brand-services/homepage-checkpoints.json
```

Expected: issues #7-#9 pass.

## Task 8: TTG/Lab And PH/Education Slice

**Files:**

- Modify: `js/transitions/homepage/ttg-homepage-adapter.js`
- Modify: `js/components/ttg-transition.js`
- Modify: `js/transitions/homepage/ph-homepage-adapter.js`
- Modify: `js/components/ph-transition.js`
- Modify: `css/ttg.css`
- Modify: `css/ph.css`
- Modify: `css/sections/source-copy.css`

- [ ] **Step 1: Services -> TTG split**

Use `splitSceneBridge`:

- top owner: `services`;
- bottom owner: `ttg`;
- next source: TTG first frame/media;
- commit owner: `ttg`.

- [ ] **Step 2: TTG -> Lab split**

Use `splitSceneBridge`, not early receiver:

- top owner: `ttg`;
- bottom owner: `lab`;
- Lab copy is `domProjection`;
- commit owner: `lab`.

- [ ] **Step 3: Make Lab independent**

After the TTG -> Lab split, Lab copy is a full-screen independent scene with one divider system.

- [ ] **Step 4: Lab -> PH split**

Use `splitSceneBridge`:

- top owner: `lab`;
- bottom owner: `ph`;
- commit owner: `ph`.

- [ ] **Step 5: PH -> Education split**

Use `splitSceneBridge`, not early receiver:

- top owner: `ph`;
- bottom owner: `education`;
- Education copy is `domProjection`;
- commit owner: `education`.

- [ ] **Step 6: Make Education independent**

Education copy is a full-screen independent scene with one divider system and right-column top alignment.

- [ ] **Step 7: Capture slice**

Run:

```bash
npm run build:page
npm run capture:homepage-checkpoints -- --mode=all --desktop-only --output-name=homepage-transition-v31-ttg-ph
npm run verify:homepage-transition-gates -- --strict --input output/playwright/homepage-transition-v31-ttg-ph/homepage-checkpoints.json
```

Expected: issues #10-#15 pass.

## Task 9: Philosophy/Crane/Contact Slice

**Files:**

- Modify: `js/transitions/homepage/crane-homepage-adapter.js`
- Modify: `js/components/crane-transition.js`
- Modify: `css/crane.css`
- Modify: `src/sections/contact.html`
- Modify: `css/sections/paper-canvas-theme.css`
- Modify: `src/section-manifest.mjs`

- [ ] **Step 1: Remove Philosophy empty field**

Every sampled progress between Philosophy and Crane must have Philosophy copy, Crane scene, or split bridge as primary owner. No orphan divider.

- [ ] **Step 2: Philosophy -> Crane split**

Use `splitSceneBridge`:

- top owner: `philosophy`;
- bottom owner: `crane`;
- commit owner: `crane`.

- [ ] **Step 3: Crane -> Contact early receiver**

Use early receiver:

- Crane remains visible during final window;
- Contact `domProjection` becomes readable before Crane exits;
- commit owner: `contact`.

- [ ] **Step 4: Make Contact endpoint one screen**

Contact occupies one endpoint viewport. The final capture must not require a long scroll tail.

- [ ] **Step 5: Capture slice**

Run:

```bash
npm run build:page
npm run capture:homepage-checkpoints -- --mode=all --desktop-only --output-name=homepage-transition-v31-crane-contact
npm run verify:homepage-transition-gates -- --strict --input output/playwright/homepage-transition-v31-crane-contact/homepage-checkpoints.json
```

Expected: issues #16-#18 pass.

## Task 10: Final Verification And HUD Review

**Files:**

- Modify only if gates reveal a missed contract.

- [ ] **Step 1: Static verification**

```bash
npm run verify:all
```

Expected: exit 0.

- [ ] **Step 2: Full capture**

```bash
npm run capture:homepage-checkpoints -- --mode=all --desktop-only --output-name=homepage-transition-v31-final
```

Expected: required desktop artifacts are written under:

`output/playwright/homepage-transition-v31-final/`

Mobile is not part of the blocking acceptance scope for this desktop-focused remediation.

- [ ] **Step 3: Strict 19-issue gates**

```bash
npm run verify:homepage-transition-gates -- --strict --input output/playwright/homepage-transition-v31-final/homepage-checkpoints.json
```

Expected: all user issues `0-18` pass; no missing issue rows.

- [ ] **Step 4: Wheel smoke**

```bash
npm run smoke:homepage-transition-wheel -- --output-name=homepage-transition-v31-wheel-final
```

Expected: wheel smoke passes forward and reverse traversal without blank owners.

- [ ] **Step 5: Optional mobile smoke**

After desktop gates and HUD review pass, optionally run:

```bash
npm run capture:homepage-checkpoints -- --mode=all --output-name=homepage-transition-v31-mobile-smoke
```

Expected: mobile artifacts are informational smoke for regression awareness. They do not block this desktop-focused acceptance unless they reveal a severe blank screen or JavaScript runtime failure.

- [ ] **Step 6: HUD visual acceptance**

Automated gates, including `sampled-dom-geometry`, prove structural ownership and visibility only. They do not prove ink rhythm, visual softness, or overall aesthetic quality. Desktop HUD visual review is a required blocking acceptance step.

Open:

```text
http://localhost:8080/index.html?calibrate=timeline&v=homepage-transition-v31-final
```

Manual review must confirm:

- nav blur is a soft progressive band;
- every split bridge shows previous/next split, not overlay-only ink;
- no dark gap, blank field, or orphan divider appears;
- AOD/Figure3/Crane exits reveal copy during final animation windows;
- TTG/PH exits split to Lab/Education copy;
- Lab/Education right columns top-align with left leads;
- Contact is one endpoint screen and CTA is readable/non-placeholder.

## Completion Criteria

The branch is complete only when all are true:

- `npm run verify:all` passes.
- strict gate output reports user issues `0-18` all passed.
- `npm run smoke:homepage-transition-wheel -- --output-name=homepage-transition-v31-wheel-final` passes.
- `homepageEndpointSpec.mode` is not `undecided`.
- Contact CTA is not `contact@example.com` and not a no-op self-link.
- HUD visual review confirms the user's 0-18 findings are closed by behavior, not labels or estimated metrics.
- Mobile smoke is optional and non-blocking for this desktop acceptance, except for severe blank-screen or JavaScript runtime failures.

## Execution And Quality Risks

- Implementation volume is high across adapters, runtime ownership, gates, and CSS; expect multiple capture/gate iterations.
- `sampled-dom-geometry` can prove owner structure and visibility, but it cannot prove ink rhythm or softness.
- A geometry gate can pass while the ink still feels overlay-like or visually harsh; desktop HUD review remains the final authority for the user's visual findings.
- Progress-window migration is opt-in by transition id. Do not globally convert every transition in one pass.

## Implementation Notes

- Do not keep adding `createInkCurtainTransition` canvases to bridge adapters.
- Do not rasterize arbitrary DOM text into WebGL textures.
- Do not move real target DOM into transition containers for new work.
- Do not hide entire target sections while relying on a receiver.
- Do not treat exact pixels like `736`, `1293`, or `18097` as product truth.
- Keep screenshots and JSON from every major phase in `output/playwright/`.
