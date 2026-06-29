# Homepage Scene Ownership Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation review handoffs, or `superpowers:executing-plans` for inline execution. Execute one checked task at a time and update each checkbox as it completes.

**Goal:** Build a narrow Homepage Scene Ownership Orchestrator that acts as a resource gate for foreground copy, canvas, mask, full-viewport layer, and release state for each directed transition window. The immediate product goal is to fix the visible failures reported on 2026-06-25: missing second-scene upper copy, missing bottom-up ink from second-scene upper to lower, duplicated star-map layers, AOD/method blank and position drift, figure2 return blank risk, figure3/services copy loss risk, and crane/contact premature cover.

**Architecture:** Keep `src/section-manifest.mjs` as the source of truth and preserve the existing timeline schema: `sectionSelector`, `sceneTarget`, and `copySelectors: [{ selector, entryOwner, unique }]`. Add derived `ownershipWindows` beside `timelineScenes` and `timelineJoins`; these windows reference join timing with `windowRef` and `releaseAtRef` instead of duplicating hand-tuned numeric ranges. Runtime adapters always report join-local raw transition progress into the controller; for simple joins this is host progress, and for split adapters such as Figure2 it is the raw progress of that join's bridge segment. The controller is a resource gate, not a renderer: adapters may animate only inside the foreground-copy/canvas/mask/layer rights they are granted.

**Tech Stack:** Vanilla JS modules, GSAP/ScrollTrigger, generated static HTML from `scripts/build-index.mjs`, npm verification scripts, Chrome DevTools Protocol/manual browser QA. Do not use Playwright unless the user explicitly authorizes browser automation for the verification phase.

---

## Scope Check

This plan is one cohesive change: homepage scene ownership and transition timing. It spans manifest generation, runtime controller, selected adapters, CSS state, and verification. Do not split it into unrelated styling or content refactors.

This is not a global linear duration table. Do not build a single sequence like `crane 0-800`, `contact 800-1400`, `aod 1400-2400`. The homepage is scroll-driven and can be fast-scrolled, reversed, reduced-motion, hash-visited, or post-scroll handed off. Each transition host owns its own directed join progress; the controller only arbitrates which scene is allowed to write each visual resource at the current raw progress.

This is also not a rendering engine. The orchestrator must not create GSAP timelines, calculate easing curves, draw canvas frames, or mutate per-frame transforms. It only grants or denies four write rights: foreground copy, canvas, mask, and full-viewport layer. `intentScene`, `committedScene`, `visualOwner`, `copyOwner`, and `transitionPhase` are debug and audit metadata; they must not become a second animation system.

The current `docs/superpowers/plans/2026-06-24-homepage-transition-single-timeline.md` introduced a single timeline contract. This plan supersedes the unfinished parts by making the timeline directed at the scene level. The earlier model reduced receiver/adoption issues, but it still allowed these failures:

- `belief` only has one copy wrapper, so the second-scene upper copy cannot appear as a distinct scene.
- `home-belief` is one join, but the intended experience has at least three scenes: first-scene exit, second-scene upper, second-scene lower.
- `pattern-bloom-adapter.js` still computes `beliefPinned`, `secondRevealProgress`, and `topSceneOpacity` locally.
- `aod-homepage-adapter.js` and `crane-homepage-adapter.js` still merge progress using `Math.max(progress, handoffProgress)`, causing target copy timing to jump relative to visual progress.
- `renderAodTransitionProgress()` accelerates visual progress, making AOD ink too fast for homepage handoff.
- The release/cleanup checks catch DOM leftovers, but not visual semantics such as copy missing under an opaque canvas.
- The current schema already uses `copySelectors` and generated `data-scene-copy`; this plan extends that schema instead of introducing a second one.
- Copy ownership alone is insufficient. When method DOM is visible but visually hidden, the root cause can be mask, paper layer, z-index, canvas opacity, or transform ownership. The orchestrator must decide owners for copy, canvas, mask, layer, and foreground authority together.

---

## Scene Ownership Orchestrator Contract

The directed scene timeline is the skeleton; the ownership model is the missing runtime contract. Implement both together, but keep the ownership layer small.

Manifest responsibilities:

```js
export const timelineScenes = [];
export const timelineJoins = [];
export const ownershipWindows = [];
```

Controller state shape:

```js
{
  intentScene: '',
  committedScene: '',
  transitionPhase: '',
  visualOwner: '',
  copyOwner: '',
  pendingCopyOwner: '',
  foregroundCopyOwner: '',
  canvasOwner: '',
  maskOwner: '',
  layerOwner: '',
  layerStack: [],
  releaseState: {},
  released: false
}
```

Enforcement fields:

```js
{
  foregroundCopyOwner: '',
  canvasOwner: '',
  maskOwner: '',
  layerOwner: '',
  releaseState: {}
}
```

Only the enforcement fields gate adapter writes. All other fields are for debugging, contract checks, and CDP audit output.

Ownership window shape:

```js
{
  id: 'crane-contact-copy-entry',
  joinId: 'philosophy-contact',
  windowRef: ['targetIn.0', 'presentAt'],
  transitionPhase: 'target-copy-entry',
  intentScene: 'contact',
  committedScene: 'philosophy',
  visualOwner: 'crane',
  pendingCopyOwner: 'contact',
  copyOwner: 'philosophy',
  foregroundCopyOwner: 'contact',
  foregroundCopyAllowedAfter: 'craneVisualClear',
  canvasOwner: 'crane',
  maskOwner: 'crane-transition',
  layerOwner: 'crane-transition',
  layerStack: ['philosophy-copy', 'crane-canvas', 'contact-copy'],
  releaseAtRef: 'cleanupAt',
  priority: 60
}
```

Interpretation rules:

- `intentScene` means the scene the user is moving toward.
- `committedScene` means the scene whose content is safe to treat as presented.
- `visualOwner` is audit metadata naming the adapter visually responsible for the current bridge.
- `canvasOwner` controls canvas drawing rights.
- `maskOwner` controls masks, paper covers, ink covers, and opaque transition layers.
- `layerOwner` controls z-index and full-viewport overlays.
- `copyOwner` is audit metadata naming the current readable copy before foreground handoff.
- `pendingCopyOwner` may prepare or pre-render copy but cannot put it in foreground.
- `foregroundCopyOwner` can become readable only after `foregroundCopyAllowedAfter` is satisfied.
- `windowRef` points to join timing fields and is resolved against the owning `timelineJoins[]` item. Use refs such as `targetIn.0`, `targetIn.1`, `sourceOut.0`, `commitAt`, `presentAt`, and `cleanupAt`.
- `releaseAtRef` points to the join timing field where fixed copy and transition layers may be released.
- Bare numeric `window: [start, end]` is not allowed for homepage ownership windows. Put timing numbers on the join, then derive ownership windows from those join fields.

Adapters must not decide real target copy presentation. They may compute local phase progress, render animation, and report milestones:

```js
timeline.updateJoin('philosophy-contact', progress, {
  milestones: {
    craneVisualClear: progress >= 0.56,
    contactCopyReady: contactCopyProgress > 0.04,
    contactCopyReadable: contactCopyProgress >= 0.82
  }
});
```

The orchestrator decides whether the reported milestones are enough for `foregroundCopyOwner`, `committedScene`, `releaseState`, and cleanup.

Single truth rules:

- Manifest owns structure: scenes, joins, timing fields, and derived ownership refs.
- Controller owns resource rights: foreground copy, canvas, mask, layer, and release.
- Adapter owns rendering only inside granted rights: canvas drawing, GSAP tweens, ink progress, and visual transforms.
- Reveal owns normal non-transition entry cleanup, but it must not decide timeline-owned target copy presentation.
- DOM classes and inline styles are effects of controller/adapter decisions, not independent state machines.
- Do not add adapter booleans named like `isTargetPresented`, `targetCommitted`, `copyReleased`, or `beliefPinned`; those are ownership/controller concepts.

Complexity budget:

- Add one manifest export: `ownershipWindows`.
- Add one controller responsibility: resource rights arbitration.
- Do not add a scheduler, render loop, or global duration table.
- Enforce only four write rights: `foregroundCopyOwner`, `canvasOwner`, `maskOwner`, and `layerOwner`.
- Keep `visualOwner`, `copyOwner`, `intentScene`, `committedScene`, and `transitionPhase` as audit metadata only.
- Ownership windows must use `windowRef` and `releaseAtRef`; no hand-tuned numeric ownership ranges.
- Add ownership windows only for conflict surfaces that can hide or duplicate real content: home-belief, belief-method/AOD, method-proof-brand/Figure2, brand-services/Figure3, and philosophy-contact/crane.
- Leave non-conflicting decoration and ordinary reveal behavior outside the orchestrator.

---

## Product Acceptance Criteria

1. **Second-scene upper text appears.** During the home-to-belief transition, the second-scene upper copy must appear on the right while the lotus is still resolving. The existing lower paragraph beginning with `AI 不是技术专家的玩具。` must not be used as the upper copy.

2. **Second-scene upper to lower uses bottom-up ink.** The transition from upper to lower belief scene must be an ink reveal rising from the bottom. It must not jump directly into the star-map lower scene, and it must not reuse the AOD ink timing.

3. **Second-scene lower is the Perlin/no-stretch/centered-copy version.** The lower belief scene must use `assets/back2.png`, `perlinOverlay`, non-stretched image fitting, and centered readable typography.

4. **Star-map appears once per pass.** In home-to-belief, pattern canvas, exit ink, and star canvas must not all be visually dominant at the same time. The lower star-map scene must not re-enter as a second independent presentation.

5. **AOD-to-method has no blank handoff.** Method copy must become readable before AOD has fully cleared. The method copy must be at its intended viewport position, not only peeking from the bottom.

6. **Figure2-to-brand, figure3-to-services, and other visual bridges retain copy ownership.** No target copy remains hidden after transition completion, and no transition layer keeps covering readable copy after its cleanup point.

7. **Crane-to-contact is early but not premature.** Contact copy should enter before a blank frame appears, but it must not cover crane within the first visual beat. The crane scene must remain readable until the configured contact entry window.

8. **No receiver/adopted DOM returns.** The old `createHandoffReceiver()` adoption model stays removed from homepage runtime paths.

9. **Ownership is explicit for non-copy resources.** Every critical transition window must declare who owns the visual, copy, canvas, mask, layer stack, intent scene, committed scene, and release point. A visible copy cannot be considered fixed if an active mask or opaque layer still owns the foreground.

---

## Files To Modify

- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/src/sections/belief.html`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/src/section-manifest.mjs`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/scripts/build-index.mjs`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/scripts/check-homepage-timeline.mjs`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/scripts/check-homepage-transition-integration.mjs`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/scripts/check-homepage-visual-timeline-contract.mjs`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/scripts/audit-homepage-directed-timeline-cdp.mjs`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/package.json`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/homepage/scene-timeline-controller.js`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/homepage/scene-timeline-manifest.js`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/homepage-transition-runtime.js`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/pattern-bloom-adapter.js`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/components/aod-transition.js`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/homepage/aod-homepage-adapter.js`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/homepage/figure2-homepage-adapter.js`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/homepage/figure3-homepage-adapter.js`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/homepage/crane-homepage-adapter.js`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/css/sections/canvas-stage.css`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/css/components/homepage-continuity.css`

`js/transitions/homepage/scene-timeline-manifest.js` and `index.html` are generated files. Do not hand edit them.

---

## Implementation Tasks

### Task 0: Baseline And Guardrails

- [ ] Run `git status --short` in `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi` and record current branch and dirty files in the work log.
- [ ] Confirm the work branch is not `main`. If currently on `main`, create `codex/homepage-directed-scene-timeline`.
- [ ] Run `npm run build:page`.
- [ ] Run `npm run verify:homepage-timeline`.
- [ ] Run `npm run verify:all`.
- [ ] Do not start browser automation in this task. Browser automation waits until the CDP audit script exists.

### Task 1: Add A Failing Visual Timeline Contract Check

Create `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/scripts/check-homepage-visual-timeline-contract.mjs`.

Use this script to make the current failure explicit before changing runtime behavior:

```js
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function assertFile(relativePath) {
  const filePath = path.join(root, relativePath);
  assert.equal(existsSync(filePath), true, `${relativePath} must exist`);
}

function assertIncludes(source, needle, label) {
  assert.equal(source.includes(needle), true, `${label} must include ${needle}`);
}

function assertNotIncludes(source, needle, label) {
  assert.equal(source.includes(needle), false, `${label} must not include ${needle}`);
}

function selectorText(html, className) {
  const pattern = new RegExp(`<[^>]+class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'm');
  const match = html.match(pattern);
  return match ? match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
}

assertFile('src/section-manifest.mjs');
assertFile('src/sections/belief.html');
assertFile('js/transitions/pattern-bloom-adapter.js');
assertFile('js/transitions/homepage/aod-homepage-adapter.js');
assertFile('js/transitions/homepage/crane-homepage-adapter.js');
assertFile('js/components/aod-transition.js');

const manifestUrl = pathToFileURL(path.join(root, 'src/section-manifest.mjs')).href;
const manifestModule = await import(`${manifestUrl}?contract=${Date.now()}`);
const timelineScenes = manifestModule.timelineScenes ?? [];
const timelineJoins = manifestModule.timelineJoins ?? [];
const ownershipWindows = manifestModule.ownershipWindows ?? [];
assert.ok(Array.isArray(timelineScenes), 'section manifest must export timelineScenes');
assert.ok(Array.isArray(timelineJoins), 'section manifest must export timelineJoins');
assert.ok(Array.isArray(ownershipWindows), 'section manifest must export ownershipWindows');

function scene(id) {
  return timelineScenes.find((item) => item.id === id);
}

function join(id) {
  return timelineJoins.find((item) => item.id === id);
}

function ownershipWindow(id) {
  return ownershipWindows.find((item) => item.id === id);
}

function resolveTimingRef(joinItem, ref) {
  if (ref === 'commitAt') return joinItem.commitAt;
  if (ref === 'presentAt') return joinItem.presentAt;
  if (ref === 'cleanupAt') return joinItem.cleanupAt;
  if (ref === 'sourceOut.0') return joinItem.sourceOut?.[0];
  if (ref === 'sourceOut.1') return joinItem.sourceOut?.[1];
  if (ref === 'targetIn.0') return joinItem.targetIn?.[0];
  if (ref === 'targetIn.1') return joinItem.targetIn?.[1];
  throw new Error(`Unknown ownership timing ref ${ref}`);
}

function copySelector(sceneId) {
  const [firstCopy] = scene(sceneId)?.copySelectors ?? [];
  return firstCopy?.selector ?? '';
}

assert.ok(scene('belief-upper'), 'timeline scene belief-upper must exist');
assert.ok(scene('belief-lower'), 'timeline scene belief-lower must exist');
assert.ok(join('home-belief'), 'join home-belief must remain as the home-to-upper join');
assert.ok(join('belief-upper-lower'), 'join belief-upper-lower must exist');
assert.ok(join('belief-method'), 'join belief-method must remain as the lower-to-method join');

assert.equal(scene('belief-upper').sectionId, 'belief', 'belief-upper belongs to #belief');
assert.equal(scene('belief-lower').sectionId, 'belief', 'belief-lower belongs to #belief');
assert.equal(scene('belief-upper').sectionSelector, '#belief', 'belief-upper uses the existing sectionSelector schema');
assert.equal(scene('belief-lower').sectionSelector, '#belief', 'belief-lower uses the existing sectionSelector schema');
assert.equal(scene('belief-upper').sceneTarget, 'belief', 'belief-upper uses the existing sceneTarget schema');
assert.equal(scene('belief-lower').sceneTarget, 'belief', 'belief-lower uses the existing sceneTarget schema');
assert.equal(copySelector('belief-upper'), '.belief-upper-copy-wrap', 'belief-upper copy selector is explicit');
assert.equal(copySelector('belief-lower'), '.belief-lower-copy-wrap', 'belief-lower copy selector is explicit');
assert.notEqual(copySelector('belief-upper'), copySelector('belief-lower'), 'upper and lower copy selectors differ');
assert.equal(join('home-belief').toScene, 'belief-upper', 'home-belief targets the upper belief scene');
assert.equal(join('belief-upper-lower').fromScene, 'belief-upper', 'upper-lower join starts from upper belief scene');
assert.equal(join('belief-upper-lower').toScene, 'belief-lower', 'upper-lower join targets lower belief scene');
assert.equal(join('belief-method').fromScene, 'belief-lower', 'belief-method starts from lower belief scene');

for (const id of [
  'home-belief-upper-copy',
  'belief-upper-lower-bottom-ink',
  'belief-method-aod-method-overlap',
  'method-proof-brand-figure2-brand-entry',
  'brand-services-figure3-services-entry',
  'philosophy-contact-copy-entry'
]) {
  const item = ownershipWindow(id);
  assert.ok(item, `ownership window ${id} must exist`);
  const joinItem = join(item.joinId);
  assert.ok(joinItem, `ownership window ${id} must reference a known join`);
  assert.ok(Array.isArray(item.windowRef) && item.windowRef.length === 2, `ownership window ${id} must define windowRef`);
  assert.ok(typeof item.windowRef[0] === 'string', `ownership window ${id} windowRef start must be a string ref`);
  assert.ok(typeof item.windowRef[1] === 'string', `ownership window ${id} windowRef end must be a string ref`);
  const start = resolveTimingRef(joinItem, item.windowRef[0]);
  const end = resolveTimingRef(joinItem, item.windowRef[1]);
  assert.ok(Number.isFinite(start), `ownership window ${id} start ref must resolve to a number`);
  assert.ok(Number.isFinite(end), `ownership window ${id} end ref must resolve to a number`);
  assert.ok(start < end, `ownership window ${id} start ref must be before end ref`);
  assert.equal(item.window, undefined, `ownership window ${id} must not define a hand-tuned numeric window`);
  assert.ok(item.visualOwner, `ownership window ${id} must define visualOwner`);
  assert.ok(item.copyOwner, `ownership window ${id} must define copyOwner`);
  assert.ok(item.pendingCopyOwner, `ownership window ${id} must define pendingCopyOwner`);
  assert.ok(item.foregroundCopyOwner, `ownership window ${id} must define foregroundCopyOwner`);
  assert.ok(
    item.foregroundCopyOwner === item.copyOwner || item.foregroundCopyAllowedAfter,
    `ownership window ${id} must define foregroundCopyAllowedAfter when foregroundCopyOwner differs from copyOwner`
  );
  assert.ok(item.canvasOwner, `ownership window ${id} must define canvasOwner`);
  assert.ok(item.maskOwner, `ownership window ${id} must define maskOwner`);
  assert.ok(item.layerOwner, `ownership window ${id} must define layerOwner`);
  assert.ok(item.intentScene, `ownership window ${id} must define intentScene`);
  assert.ok(item.committedScene, `ownership window ${id} must define committedScene`);
  assert.ok(Array.isArray(item.layerStack), `ownership window ${id} must define layerStack`);
  assert.ok(typeof item.releaseAtRef === 'string', `ownership window ${id} must define releaseAtRef`);
  assert.ok(Number.isFinite(resolveTimingRef(joinItem, item.releaseAtRef)), `ownership window ${id} releaseAtRef must resolve to a number`);
  assert.equal(item.releaseAt, undefined, `ownership window ${id} must not define a hand-tuned numeric releaseAt`);
  assert.ok(Number.isFinite(item.priority), `ownership window ${id} must define priority`);
}

const beliefHtml = read('src/sections/belief.html');
assertIncludes(beliefHtml, 'belief-upper-copy-wrap', 'belief section');
assertIncludes(beliefHtml, 'belief-lower-copy-wrap', 'belief section');

const upperText = selectorText(beliefHtml, 'belief-upper-copy');
const lowerText = selectorText(beliefHtml, 'belief-lower-copy');

assert.ok(upperText.length >= 12, 'upper belief copy must contain real text');
assert.ok(lowerText.length >= 12, 'lower belief copy must contain real text');
assert.notEqual(upperText, lowerText, 'upper and lower belief copy must not be the same text');
assertNotIncludes(upperText, 'AI 不是技术专家的玩具', 'upper belief copy');
assertIncludes(lowerText, 'AI 不是技术专家的玩具', 'lower belief copy');

const patternAdapter = read('js/transitions/pattern-bloom-adapter.js');
assertIncludes(patternAdapter, 'beliefUpperCopyComplete', 'pattern bloom adapter milestones');
assertIncludes(patternAdapter, 'upperToLowerInkComplete', 'pattern bloom adapter milestones');
assertIncludes(patternAdapter, 'beliefLowerCopyComplete', 'pattern bloom adapter milestones');
assertNotIncludes(patternAdapter, 'const beliefPinned = overlayActive && targetOpacity > 0.002', 'pattern bloom adapter');

const aodAdapter = read('js/transitions/homepage/aod-homepage-adapter.js');
assertNotIncludes(aodAdapter, 'Math.max(progress, handoffProgress)', 'AOD homepage timeline progress');
assertIncludes(aodAdapter, 'accelerate: false', 'AOD homepage visual progress');
assertIncludes(aodAdapter, 'methodCopyReadable', 'AOD homepage milestones');

const aodComponent = read('js/components/aod-transition.js');
assertIncludes(aodComponent, 'accelerate === false', 'AOD transition progress curve');

const craneAdapter = read('js/transitions/homepage/crane-homepage-adapter.js');
assertNotIncludes(craneAdapter, 'Math.max(progress, handoffProgress)', 'crane homepage timeline progress');
assertIncludes(craneAdapter, 'craneVisualClear', 'crane homepage milestones');
assertIncludes(craneAdapter, 'contactCopyReadable', 'crane homepage milestones');

for (const candidate of timelineJoins) {
  assert.ok(candidate.presentAt >= candidate.commitAt, `${candidate.id}: presentAt must be >= commitAt`);
  assert.ok(candidate.cleanupAt >= candidate.presentAt, `${candidate.id}: cleanupAt must be >= presentAt`);
}

console.log('Homepage visual timeline contract passed.');
```

Update `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/package.json`:

- [ ] Add `"verify:homepage-visual-timeline": "node scripts/check-homepage-visual-timeline-contract.mjs"`.
- [ ] Add `npm run verify:homepage-timeline && npm run verify:homepage-visual-timeline` inside `verify:all`.
- [ ] Run `npm run verify:homepage-visual-timeline` and confirm it fails on the current code for the expected reasons.

### Task 2: Split Belief Into Upper And Lower Scene Copy

Modify `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/src/sections/belief.html`.

The current single `.belief-copy-wrap` is not enough. Replace it with two explicit scene wrappers:

```html
<section class="canvas-section canvas-section--belief" id="belief" aria-label="同野观幂观点">
  <canvas class="belief-star-field" data-belief-star-field aria-hidden="true"></canvas>
  <div class="belief-star-wash" aria-hidden="true"></div>
  <div class="belief-scene-stack">
    <div class="belief-upper-scene" data-belief-scene="upper">
      <div class="belief-upper-copy-wrap">
        <p class="belief-upper-copy large-copy large-copy--standalone">你的同行不是更聪明，只是更早把 AI 用进了生意里。</p>
      </div>
    </div>
    <div class="belief-lower-scene" data-belief-scene="lower">
      <div class="belief-lower-copy-wrap">
        <p class="belief-lower-copy large-copy large-copy--standalone">AI 不是技术专家的玩具。它该帮你省下不该花的钱、多接几个客户，再把臃肿的岗位精简下来——能管好这几件事的，才是真利器。它决定了未来三年你是领跑还是追赶。</p>
      </div>
    </div>
  </div>
</section>
```

Implementation notes:

- [ ] Keep the lower paragraph exactly as the current `AI 不是技术专家的玩具。` paragraph.
- [ ] Use the existing hero subtitle as upper copy because it is the only second-scene upper copy currently present in source. If product owner supplies a different exact sentence before this task starts, use that exact sentence and update the verification expected text.
- [ ] Keep both wrappers in the real `#belief` section. Do not duplicate copy inside the transition host.
- [ ] Keep `#belief` as the section id so navigation and accessibility remain stable.

Modify `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/css/sections/canvas-stage.css` and `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/css/components/homepage-continuity.css` so the two belief scenes are timeline-owned individually while direct visits still show readable belief content:

```css
.belief-scene-stack {
  position: sticky;
  top: 0;
  min-height: 100svh;
}

.belief-upper-scene,
.belief-lower-scene {
  position: absolute;
  inset: 0;
  display: grid;
  align-items: center;
  min-height: 100svh;
  pointer-events: none;
}

.belief-upper-copy-wrap,
.belief-lower-copy-wrap {
  position: relative;
  z-index: 2;
  width: min(72rem, calc(100vw - 2 * clamp(1.5rem, 5vw, 7rem)));
  margin-inline: auto;
}

.belief-upper-scene {
  opacity: 0;
  visibility: hidden;
}

.belief-lower-scene {
  opacity: 1;
  visibility: visible;
}

.canvas-section--belief.is-pattern-bloom-pinned .belief-upper-scene {
  opacity: var(--belief-upper-opacity, 0);
  visibility: var(--belief-upper-visibility, hidden);
}

.canvas-section--belief.is-pattern-bloom-pinned .belief-lower-scene {
  opacity: var(--belief-lower-opacity, 1);
  visibility: var(--belief-lower-visibility, visible);
}

.canvas-section--belief.is-pattern-bloom-pinned .belief-upper-copy-wrap,
.canvas-section--belief.is-pattern-bloom-pinned .belief-lower-copy-wrap {
  opacity: var(--belief-scene-copy-opacity, 1);
  transform: translate3d(0, var(--belief-scene-copy-y, 0), 0);
  filter: blur(var(--belief-scene-copy-blur, 0));
  transition: none;
  will-change: opacity, transform, filter;
}

.belief-upper-scene .belief-upper-copy-wrap {
  max-width: min(38rem, 42vw);
  margin-left: auto;
  margin-right: clamp(3rem, 9vw, 12rem);
  text-align: left;
}

.belief-lower-scene .belief-lower-copy-wrap {
  max-width: min(70rem, 76vw);
  text-align: center;
}
```

- [ ] Replace the old `.belief-copy-wrap` rules in `css/sections/canvas-stage.css`.
- [ ] Replace the old `.canvas-section--belief .belief-copy-wrap` rules in `css/components/homepage-continuity.css`.
- [ ] Keep only `.belief-scene-stack` sticky. Do not make both `.belief-upper-scene` and `.belief-lower-scene` sticky because that changes the section's scroll height.
- [ ] Verify direct navigation to `#belief` shows the lower belief scene by default because `.belief-lower-scene` is visible outside active transition state.
- [ ] Ensure no `data-entry-owner="timeline"` is placed on the whole `#belief` section.

### Task 3: Make Manifest Scenes Directed, Not Section-Only

Modify `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/src/section-manifest.mjs`.

Add or update timeline scenes:

```js
{
  id: 'belief-upper',
  role: 'target',
  sectionId: 'belief',
  sectionSelector: '#belief',
  sceneTarget: 'belief',
  allowSectionOwner: false,
  copySelectors: [
    {
      selector: '.belief-upper-copy-wrap',
      entryOwner: 'timeline',
      unique: true
    }
  ]
},
{
  id: 'belief-lower',
  role: 'target',
  sectionId: 'belief',
  sectionSelector: '#belief',
  sceneTarget: 'belief',
  allowSectionOwner: false,
  copySelectors: [
    {
      selector: '.belief-lower-copy-wrap',
      entryOwner: 'timeline',
      unique: true
    }
  ]
}
```

Keep the existing `home-belief` id for the home-to-upper join, add a new `belief-upper-lower` join for the intra-belief scene change, and keep the existing `belief-method` id for the lower-to-method join:

```js
{
  id: 'home-belief',
  transitionId: 'home-belief',
  handoffId: 'home-belief',
  hostSelector: '[data-transition-id="home-belief"]',
  progressPolicy: 'scroll',
  fromScene: 'home',
  toScene: 'belief-upper',
  sourceOut: [0.58, 0.88],
  targetIn: [0.22, 0.46],
  commitAt: 0.42,
  presentAt: 0.46,
  cleanupAt: 0.58,
  commitCondition: ['progress:commitAt', 'lotusContracted', 'beliefUpperReady'],
  presentCondition: ['progress:presentAt', 'beliefUpperCopyComplete'],
  adapterVariant: 'lotus-to-belief-upper'
},
{
  id: 'belief-upper-lower',
  transitionId: 'home-belief',
  handoffId: 'home-belief',
  hostSelector: '[data-transition-id="home-belief"]',
  progressPolicy: 'scroll',
  fromScene: 'belief-upper',
  toScene: 'belief-lower',
  sourceOut: [0.58, 0.76],
  targetIn: [0.62, 0.88],
  commitAt: 0.72,
  presentAt: 0.88,
  cleanupAt: 0.94,
  commitCondition: ['progress:commitAt', 'upperCopyHeld', 'bottomUpInkStarted'],
  presentCondition: ['progress:presentAt', 'upperToLowerInkComplete', 'beliefLowerCopyComplete'],
  adapterVariant: 'bottom-up-ink-perlin-no-stretch-centered-copy'
},
{
  id: 'belief-method',
  transitionId: 'belief-method',
  handoffId: 'belief-method',
  hostSelector: '[data-transition-id="belief-method"]',
  progressPolicy: 'snap-playback',
  fromScene: 'belief-lower',
  toScene: 'method',
  sourceOut: [0.36, 0.74],
  targetIn: [0.48, 0.82],
  commitAt: 0.66,
  presentAt: 0.78,
  cleanupAt: 0.94,
  commitCondition: ['progress:commitAt', 'aodInkReadable', 'methodCopyReady'],
  presentCondition: ['progress:presentAt', 'methodCopyReadable'],
  adapterVariant: 'aod-ink-linear-method-overlap'
}
```

Add `ownershipWindows` in the same file:

```js
export const ownershipWindows = [
  {
    id: 'home-belief-upper-copy',
    joinId: 'home-belief',
    windowRef: ['targetIn.0', 'cleanupAt'],
    priority: 40,
    transitionPhase: 'target-copy-entry',
    intentScene: 'belief-upper',
    committedScene: 'home',
    visualOwner: 'pattern-bloom',
    pendingCopyOwner: 'belief-upper',
    copyOwner: 'home',
    foregroundCopyOwner: 'belief-upper',
    foregroundCopyAllowedAfter: 'beliefUpperReady',
    canvasOwner: 'pattern-bloom',
    maskOwner: 'pattern-reveal',
    layerOwner: 'pattern-bloom',
    layerStack: ['home-copy', 'pattern-canvas', 'belief-upper-copy'],
    releaseAtRef: 'cleanupAt'
  },
  {
    id: 'belief-upper-lower-bottom-ink',
    joinId: 'belief-upper-lower',
    windowRef: ['sourceOut.0', 'cleanupAt'],
    priority: 50,
    transitionPhase: 'intra-section-ink-handoff',
    intentScene: 'belief-lower',
    committedScene: 'belief-upper',
    visualOwner: 'pattern-bloom',
    pendingCopyOwner: 'belief-lower',
    copyOwner: 'belief-upper',
    foregroundCopyOwner: 'belief-lower',
    foregroundCopyAllowedAfter: 'upperToLowerInkComplete',
    canvasOwner: 'belief-star-field',
    maskOwner: 'bottom-up-ink',
    layerOwner: 'pattern-bloom',
    layerStack: ['belief-upper-copy', 'bottom-up-ink-mask', 'belief-star-canvas', 'belief-lower-copy'],
    releaseAtRef: 'cleanupAt'
  },
  {
    id: 'belief-method-aod-method-overlap',
    joinId: 'belief-method',
    windowRef: ['targetIn.0', 'cleanupAt'],
    priority: 60,
    transitionPhase: 'aod-method-copy-overlap',
    intentScene: 'method',
    committedScene: 'belief-lower',
    visualOwner: 'aod-transition',
    pendingCopyOwner: 'method',
    copyOwner: 'belief-lower',
    foregroundCopyOwner: 'method',
    foregroundCopyAllowedAfter: 'methodCopyReadable',
    canvasOwner: 'aod-transition',
    maskOwner: 'aod-ink',
    layerOwner: 'aod-transition',
    layerStack: ['belief-lower-copy', 'aod-canvas', 'aod-ink-mask', 'method-copy'],
    releaseAtRef: 'cleanupAt'
  },
  {
    id: 'method-proof-brand-figure2-brand-entry',
    joinId: 'method-proof-brand',
    windowRef: ['targetIn.0', 'cleanupAt'],
    priority: 60,
    transitionPhase: 'figure2-brand-copy-entry',
    intentScene: 'brand',
    committedScene: 'method-proof',
    visualOwner: 'figure2',
    pendingCopyOwner: 'brand',
    copyOwner: 'method-proof',
    foregroundCopyOwner: 'brand',
    foregroundCopyAllowedAfter: 'brandCopyReadable',
    canvasOwner: 'figure2',
    maskOwner: 'figure2-transition',
    layerOwner: 'figure2-transition',
    layerStack: ['method-proof-copy', 'figure2-canvas', 'brand-copy'],
    releaseAtRef: 'cleanupAt'
  },
  {
    id: 'brand-services-figure3-services-entry',
    joinId: 'brand-services',
    windowRef: ['targetIn.0', 'cleanupAt'],
    priority: 60,
    transitionPhase: 'figure3-services-copy-entry',
    intentScene: 'services',
    committedScene: 'brand',
    visualOwner: 'figure3',
    pendingCopyOwner: 'services',
    copyOwner: 'brand',
    foregroundCopyOwner: 'services',
    foregroundCopyAllowedAfter: 'servicesCopyReadable',
    canvasOwner: 'figure3',
    maskOwner: 'figure3-transition',
    layerOwner: 'figure3-transition',
    layerStack: ['brand-copy', 'figure3-canvas', 'services-copy'],
    releaseAtRef: 'cleanupAt'
  },
  {
    id: 'philosophy-contact-copy-entry',
    joinId: 'philosophy-contact',
    windowRef: ['targetIn.0', 'presentAt'],
    priority: 60,
    transitionPhase: 'target-copy-entry',
    intentScene: 'contact',
    committedScene: 'philosophy',
    visualOwner: 'crane',
    pendingCopyOwner: 'contact',
    copyOwner: 'philosophy',
    foregroundCopyOwner: 'contact',
    foregroundCopyAllowedAfter: 'craneVisualClear',
    canvasOwner: 'crane',
    maskOwner: 'crane-transition',
    layerOwner: 'crane-transition',
    layerStack: ['philosophy-copy', 'crane-canvas', 'contact-copy'],
    releaseAtRef: 'cleanupAt'
  }
];
```

Implementation requirements:

- [ ] Do not add a `timelineJoinAliases` system in this pass. Preserve `home-belief` and `belief-method` as real join ids.
- [ ] Export `ownershipWindows` from `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/src/section-manifest.mjs`.
- [ ] Every ownership window must reference a real `timelineJoins[].id`.
- [ ] Every ownership window must define `visualOwner`, `copyOwner`, `pendingCopyOwner`, `foregroundCopyOwner`, `foregroundCopyAllowedAfter` when foreground differs from current copy, `canvasOwner`, `maskOwner`, `layerOwner`, `intentScene`, `committedScene`, `layerStack`, `windowRef`, `releaseAtRef`, and `priority`.
- [ ] No ownership window may define bare numeric `window` or `releaseAt`; derive both from the referenced join.
- [ ] Include ownership windows for `method-proof-brand` and `brand-services` before migrating Figure2/Figure3 adapters.
- [ ] Keep `method-proof-brand`, `brand-services`, `services-lab`, `lab-education`, `education-philosophy`, and `philosophy-contact` in the manifest.
- [ ] Update `philosophy-contact` target timing to avoid the crane 180ms premature cover:

```js
targetIn: [0.58, 0.88],
commitAt: 0.72,
presentAt: 0.88,
cleanupAt: 0.96,
commitCondition: ['progress:commitAt', 'craneVisualClear', 'contactCopyReady'],
presentCondition: ['progress:presentAt', 'contactCopyReadable']
```

- [ ] Keep all `presentAt >= commitAt` and `cleanupAt >= presentAt`.
- [ ] Run `npm run build:page` and inspect generated `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/homepage/scene-timeline-manifest.js`.

### Task 4: Generate Copy-Level Timeline Attributes

Modify `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/scripts/build-index.mjs`.

Required generated attributes:

- [ ] Extend the import list at the top so it imports `ownershipWindows` from `../src/section-manifest.mjs`.
- [ ] `data-scene-target="belief"` on the `#belief` section.
- [ ] `data-scene-copy="belief-upper"` and `data-entry-owner="timeline"` on `.belief-upper-copy-wrap`.
- [ ] `data-scene-copy="belief-lower"` and `data-entry-owner="timeline"` on `.belief-lower-copy-wrap`.
- [ ] No `data-entry-owner="timeline"` on `section#belief`.
- [ ] No generated `data-entry-owner="timeline"` on a whole section unless the manifest scene explicitly sets `allowSectionOwner: true`.
- [ ] Extend `buildGeneratedTimelineManifest()` so the generated `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/homepage/scene-timeline-manifest.js` exports ownership windows:

```js
function buildGeneratedTimelineManifest() {
  return [
    '// Generated by scripts/build-index.mjs from src/section-manifest.mjs. Do not edit.',
    '',
    `export const timelineScenes = ${JSON.stringify(timelineScenes, null, 2)};`,
    '',
    `export const timelineJoins = ${JSON.stringify(timelineJoins, null, 2)};`,
    '',
    `export const ownershipWindows = ${JSON.stringify(ownershipWindows, null, 2)};`,
    ''
  ].join('\n');
}
```

Extend `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/scripts/check-homepage-timeline.mjs`:

- [ ] Assert every scene `copySelectors[].selector` resolves in built `index.html`.
- [ ] Assert every `copySelectors[].selector` resolves inside the declared `sectionId`.
- [ ] Assert `belief-upper` and `belief-lower` copy selectors resolve to different nodes.
- [ ] Assert no copy selector points at `[data-transition]` host content.
- [ ] Assert a transition host can have multiple joins.
- [ ] Replace the old hardcoded `home-belief` assertions with directed assertions: `home-belief.toScene === 'belief-upper'`, `belief-upper-lower.fromScene === 'belief-upper'`, `belief-upper-lower.toScene === 'belief-lower'`, and `belief-method.fromScene === 'belief-lower'`.
- [ ] Assert generated `ownershipWindows` exists, each `joinId` is known, and required owner fields are present.

Extend `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/scripts/check-homepage-transition-integration.mjs`:

- [ ] Replace the old `.belief-copy-wrap` selector assertion with `.belief-upper-copy-wrap` and `.belief-lower-copy-wrap`.
- [ ] Assert `.belief-scene-stack` exists inside `#belief`.
- [ ] Assert `.belief-lower-copy-wrap` contains `AI 不是技术专家的玩具`.
- [ ] Assert `.belief-upper-copy-wrap` does not contain `AI 不是技术专家的玩具`.
- [ ] Assert no integration check still requires the old single `.belief-copy-wrap` selector.

Add this exact guard near the existing homepage transition integration assertions:

```js
assert.ok(html.includes('belief-scene-stack'), 'belief scene stack must exist');
assert.ok(html.includes('belief-upper-copy-wrap'), 'belief upper copy wrapper must exist');
assert.ok(html.includes('belief-lower-copy-wrap'), 'belief lower copy wrapper must exist');
assert.equal(/class="[^"]*\bbelief-copy-wrap\b/.test(html), false, 'old single belief-copy-wrap must not remain');
```

Run:

```bash
npm run build:page
npm run verify:homepage-timeline
npm run verify:homepage-visual-timeline
npm run verify:homepage-transitions
```

`verify:homepage-visual-timeline` should still fail until adapter/runtime migration is complete.

### Task 5: Extend Scene Timeline Controller Into Scene Ownership Orchestrator

Modify `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/homepage/scene-timeline-controller.js`.

Add these public capabilities:

- [ ] Import `ownershipWindows` from `./scene-timeline-manifest.js` with `timelineScenes` and `timelineJoins`.
- [ ] `getJoinsForHost(hostElement)` returns every join whose `hostSelector` matches the host.
- [ ] `getOwnershipWindowsForJoin(joinId)` returns all ownership windows for the join.
- [ ] `createAdapterContext(hostElement)` returns:

```js
{
  host: hostElement,
  joins,
  getState(joinId) {},
  getOwnership(joinId) {},
  updateJoin(joinId, joinRawProgress, options) {},
  completeJoin(joinId, options) {},
  releaseJoin(joinId) {},
  update(joinRawProgress, options) {}
}
```

- [ ] `update(joinRawProgress, options)` remains as backward-compatible sugar for hosts with exactly one join.
- [ ] `updateJoin(joinId, joinRawProgress, options)` always receives raw progress for that join's own `0..1` directed timeline. For simple adapters this equals host progress. For split adapters this can be a named bridge progress, such as Figure2's brand bridge progress. It must call the existing `deriveTimelineState(join, joinRawProgress, milestones)` once.
- [ ] Adapter-local presentation phase progress such as `upperEnterProgress`, `lowerInkProgress`, `methodCopyProgress`, or `contactCopyProgress` must not be passed to `updateJoin()`.
- [ ] `updateJoin()` applies target opacity/fixed/release state only for that join's `toScene`.
- [ ] Once a join reaches `cleanupAt` and release criteria, later adapter renders with `progress=1` must not re-fix released copy.
- [ ] State is keyed by `join.id`, not by section id.
- [ ] Scene state is keyed by `scene.id`, allowing `belief-upper` and `belief-lower` to live in the same section without fighting each other.
- [ ] Add `const releasedJoinIds = new Set();` next to `presentedJoinIds`.
- [ ] Add `const ownershipStateByJoinId = new Map();` next to `stateByJoinId`.
- [ ] `releaseJoin(joinId)` adds to `releasedJoinIds`, clears fixed copies for that join's `toScene`, and removes `data-timeline-active-join` from that scene section when the active join matches.
- [ ] `getState(joinId)` returns the derived state plus `released: releasedJoinIds.has(joinId)`.
- [ ] `updateJoin()` must not call `setFixedCopy(copy, true)` when `releasedJoinIds.has(joinId)` and `joinRawProgress >= state.cleanupAt`.

Add ownership resolution:

```js
function resolveTimingRef(join, timing, ref) {
  if (ref === 'commitAt') return timing.commitAt;
  if (ref === 'presentAt') return timing.presentAt;
  if (ref === 'cleanupAt') return timing.cleanupAt;
  if (ref === 'sourceOut.0') return join.sourceOut?.[0] ?? 0;
  if (ref === 'sourceOut.1') return join.sourceOut?.[1] ?? 1;
  if (ref === 'targetIn.0') return join.targetIn?.[0] ?? 0;
  if (ref === 'targetIn.1') return join.targetIn?.[1] ?? 1;
  throw new Error(`Unknown ownership timing ref ${ref} for join ${join.id}`);
}

function resolveWindowRange(join, timing, windowItem) {
  const [startRef, endRef] = windowItem.windowRef || [];
  const start = resolveTimingRef(join, timing, startRef);
  const end = resolveTimingRef(join, timing, endRef);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new Error(`Invalid ownership window ${windowItem.id} for join ${join.id}`);
  }
  return [start, end];
}

function isWithinWindow(rawProgress, windowRange) {
  return rawProgress >= windowRange[0] && rawProgress <= windowRange[1];
}

function milestoneSatisfied(name, milestones) {
  if (!name) return true;
  return Boolean(milestones?.[name]);
}

function resolveOwnershipState(join, timelineState, milestones) {
  const rawProgress = timelineState.progress;
  const timing = resolveTiming(join);
  const activeWindow = ownershipWindows.find((windowItem) => (
    windowItem.joinId === join.id
    && isWithinWindow(rawProgress, resolveWindowRange(join, timing, windowItem))
  )) || null;

  if (!activeWindow) {
    return Object.freeze({
      activeJoinIds: [join.id],
      active: timelineState.active,
      priority: 0,
      intentScene: join.toScene,
      committedScene: timelineState.targetPresented ? join.toScene : join.fromScene,
      transitionPhase: timelineState.phase,
      visualOwner: join.fromScene,
      copyOwner: timelineState.targetPresented ? join.toScene : join.fromScene,
      pendingCopyOwner: join.toScene,
      foregroundCopyOwner: timelineState.targetPresented ? join.toScene : join.fromScene,
      canvasOwner: join.fromScene,
      maskOwner: '',
      layerOwner: '',
      layerStack: [],
      releaseState: {
        releaseAt: timelineState.cleanupAt,
        released: releasedJoinIds.has(join.id)
      },
      released: releasedJoinIds.has(join.id)
    });
  }

  const foregroundAllowed = milestoneSatisfied(activeWindow.foregroundCopyAllowedAfter, milestones);
  const foregroundCopyOwner = foregroundAllowed
    ? activeWindow.foregroundCopyOwner
    : activeWindow.copyOwner;
  const releaseAt = resolveTimingRef(join, timing, activeWindow.releaseAtRef);

  return Object.freeze({
    activeJoinIds: [join.id],
    active: true,
    priority: Number.isFinite(activeWindow.priority) ? activeWindow.priority : 0,
    intentScene: activeWindow.intentScene,
    committedScene: timelineState.targetPresented ? activeWindow.intentScene : activeWindow.committedScene,
    transitionPhase: activeWindow.transitionPhase,
    visualOwner: activeWindow.visualOwner,
    copyOwner: activeWindow.copyOwner,
    pendingCopyOwner: activeWindow.pendingCopyOwner,
    foregroundCopyOwner,
    canvasOwner: activeWindow.canvasOwner,
    maskOwner: activeWindow.maskOwner,
    layerOwner: activeWindow.layerOwner,
    layerStack: [...activeWindow.layerStack],
    releaseState: {
      releaseAt,
      released: releasedJoinIds.has(join.id)
    },
    released: releasedJoinIds.has(join.id)
  });
}
```

Store ownership per join, then recompute the global root state. Do not let the last `updateJoin()` call directly write owner attributes to `document.documentElement`; that creates a race where an inert update clears the active window.

```js
function chooseGlobalOwnershipState(states) {
  const activeStates = states.filter((state) => state && state.active && !state.released);
  if (!activeStates.length) return null;
  return activeStates
    .slice()
    .sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority;
      return right.releaseState.releaseAt - left.releaseState.releaseAt;
    })[0];
}

function applyGlobalOwnershipState(state) {
  const target = state || {
    transitionPhase: '',
    visualOwner: '',
    copyOwner: '',
    foregroundCopyOwner: '',
    canvasOwner: '',
    maskOwner: '',
    layerOwner: ''
  };

  rootElement.dataset.transitionPhase = target.transitionPhase;
  rootElement.dataset.sceneVisualOwner = target.visualOwner;
  rootElement.dataset.sceneCopyOwner = target.copyOwner;
  rootElement.dataset.sceneForegroundCopyOwner = target.foregroundCopyOwner;
  rootElement.dataset.sceneCanvasOwner = target.canvasOwner;
  rootElement.dataset.sceneMaskOwner = target.maskOwner;
  rootElement.dataset.sceneLayerOwner = target.layerOwner;
  rootElement.classList.toggle('homepage-scene-mask-active', Boolean(target.maskOwner));
  rootElement.classList.toggle('homepage-scene-layer-active', Boolean(target.layerOwner));
}

function recomputeGlobalOwnership() {
  const selected = chooseGlobalOwnershipState([...ownershipStateByJoinId.values()]);
  applyGlobalOwnershipState(selected);
  return selected;
}
```

- [ ] Store the latest ownership state in `ownershipStateByJoinId`.
- [ ] Call `recomputeGlobalOwnership()` after every `updateJoin()` and `releaseJoin()`.
- [ ] Set `data-scene-visual-owner`, `data-scene-copy-owner`, `data-scene-foreground-copy-owner`, `data-scene-canvas-owner`, `data-scene-mask-owner`, and `data-scene-layer-owner` on `document.documentElement` only inside `applyGlobalOwnershipState()`.
- [ ] Set `data-transition-phase` on `document.documentElement` only inside `applyGlobalOwnershipState()`.
- [ ] Add `homepage-scene-mask-active` to `document.documentElement` only when selected global `maskOwner` is non-empty.
- [ ] Add `homepage-scene-layer-active` to `document.documentElement` only when selected global `layerOwner` is non-empty.
- [ ] `getOwnership(joinId)` returns the latest ownership state or the inert state produced by `resolveOwnershipState(join, deriveTimelineState(join, 0), {})`.

Add controller invariants:

```js
function assertKnownJoin(joinId) {
  if (!joins.some((join) => join.id === joinId)) {
    throw new Error(`Unknown homepage timeline join: ${joinId}`);
  }
}

function assertTimelineCopyScene(scene) {
  const timelineCopies = (scene.copySelectors || []).filter((copy) => copy.entryOwner === 'timeline');
  if (!timelineCopies.length) {
    throw new Error(`Scene ${scene.id} has no timeline-owned copySelectors`);
  }
}
```

Do not silently no-op when a join or scene is missing.

### Task 6: Wire Runtime Context Without Guessing Shape

Modify `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/homepage-transition-runtime.js`.

Required behavior:

- [ ] Build the adapter context through `sceneTimeline.createAdapterContext(host)`.
- [ ] Pass it as `timeline`, not as a mutable `timelineState` snapshot.
- [ ] Adapters must call `timeline.getState(joinId)` each frame if they need controller state.
- [ ] Adapters must call `timeline.getOwnership(joinId)` each frame before changing canvas opacity, mask opacity, full-viewport layers, or real target copy visibility.
- [ ] If `ownership.canvasOwner` is not the adapter's scene id, the adapter may keep its canvas mounted but must not raise canvas opacity above `0.001`.
- [ ] If `ownership.maskOwner` is not the adapter's mask id, the adapter must not keep an opaque mask over the viewport.
- [ ] If `ownership.layerOwner` is not the adapter's layer id, the adapter must not keep a full-viewport layer above target copy.
- [ ] If `ownership.foregroundCopyOwner` is not the target scene id, the adapter must not make target copy foreground-readable.
- [ ] Runtime must not call `beginTargetRevealGate` for timeline-owned scenes.
- [ ] Runtime must keep existing behavior for non-timeline transitions.
- [ ] Post-scroll handoff completion must call timeline release on the specific join, not on the whole section.

Search and update every call site that passes:

```js
timelineState: adapterContext.state
```

Replace with:

```js
timeline: adapterContext
```

Run `rg "timelineState|beginTargetRevealGate|completePostScrollHandoff" js/transitions`.

### Task 7: Refactor Pattern Bloom Into Directed Phases

Modify `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/pattern-bloom-adapter.js`.

Replace the single `secondRevealProgress` ownership model with named phase progress:

```js
const lotusExitProgress = smoothStep(range01(progress, 0.10, 0.34));
const upperEnterProgress = smoothStep(range01(progress, 0.22, 0.46));
const upperHoldProgress = smoothStep(range01(progress, 0.46, 0.58));
const upperExitProgress = smoothStep(range01(progress, 0.58, 0.76));
const lowerInkProgress = smoothStep(range01(progress, 0.62, 0.88));
const lowerCopyProgress = smoothStep(range01(progress, 0.74, 0.92));
```

Required adapter outputs:

- [ ] Upper copy is controlled through `.belief-upper-scene` variables:

```js
rootStyle.setProperty('--belief-upper-opacity', String(upperOpacity));
rootStyle.setProperty('--belief-upper-visibility', upperOpacity > 0.01 ? 'visible' : 'hidden');
```

- [ ] Lower copy is controlled through `.belief-lower-scene` variables:

```js
rootStyle.setProperty('--belief-lower-opacity', String(lowerOpacity));
rootStyle.setProperty('--belief-lower-visibility', lowerOpacity > 0.01 ? 'visible' : 'hidden');
```

- [ ] Pattern canvas opacity, exit ink opacity, and star canvas opacity must be mutually gated:

```js
const patternOpacity = clamp(1 - lowerInkProgress);
const exitInkOpacity = lowerInkProgress > 0 && lowerInkProgress < 0.995 ? 1 : 0;
const starOpacity = smoothStep(range01(progress, 0.80, 0.94));
```

- [ ] Do not allow `patternOpacity > 0.35` and `starOpacity > 0.35` in the same frame.
- [ ] Bottom-up ink must use `inkCenterY` greater than `1` at start and move upward through progress.
- [ ] `exitInkTransition` continues to use `assets/back2.png`, `perlinOverlay: true`, and non-stretched fitting.
- [ ] The lower copy must not appear before the bottom-up ink has started.
- [ ] The upper copy must not be hidden before `upperHoldProgress` has completed.

Required timeline calls:

```js
timeline?.updateJoin('home-belief', progress, {
  milestones: {
    lotusContracted: lotusExitProgress >= 0.92,
    beliefUpperReady: upperEnterProgress > 0.05,
    beliefUpperCopyComplete: upperEnterProgress >= 0.998
  }
});

timeline?.updateJoin('belief-upper-lower', progress, {
  milestones: {
    upperCopyHeld: upperHoldProgress >= 0.8,
    bottomUpInkStarted: lowerInkProgress > 0.02,
    upperToLowerInkComplete: lowerInkProgress >= 0.998,
    beliefLowerCopyComplete: lowerCopyProgress >= 0.998
  }
});
```

Required ownership checks:

```js
const upperOwnership = timeline?.getOwnership('home-belief');
const lowerOwnership = timeline?.getOwnership('belief-upper-lower');
const patternOwnsLayer = upperOwnership?.layerOwner === 'pattern-bloom'
  || lowerOwnership?.layerOwner === 'pattern-bloom';
const patternOwnsMask = upperOwnership?.maskOwner === 'pattern-reveal'
  || lowerOwnership?.maskOwner === 'bottom-up-ink';
const starOwnsCanvas = lowerOwnership?.canvasOwner === 'belief-star-field';
```

- [ ] Pattern Bloom may keep its stage mounted while active, but must set the stage opacity to `0` when `patternOwnsLayer` is false.
- [ ] Pattern Bloom may render reveal or bottom-up ink masks only when `patternOwnsMask` is true.
- [ ] The belief star canvas may become visually dominant only when `starOwnsCanvas` is true.
- [ ] Upper copy can be foreground-readable only when `upperOwnership.foregroundCopyOwner === 'belief-upper'`.
- [ ] Lower copy can be foreground-readable only when `lowerOwnership.foregroundCopyOwner === 'belief-lower'`.

Remove these old local ownership assumptions:

- [ ] `beliefPinned`
- [ ] `topSceneOpacity` as the only gate for target scene.
- [ ] A single `beliefCopyComplete` milestone.
- [ ] Any write that treats `#belief` as one copy target.

Run:

```bash
npm run build:page
npm run verify:homepage-visual-timeline
```

At this point, the visual contract should pass for belief split and pattern milestones.

### Task 8: Slow AOD Visual Progress And Overlap Method Copy

Modify `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/components/aod-transition.js`.

Replace hardcoded acceleration with an option:

```js
function resolveVisualProgress(rawProgress, options = {}) {
  if (options.accelerate === false || options.progressCurve === 'linear') {
    return clamp(rawProgress);
  }
  return acceleratedProgress(rawProgress);
}
```

Then use:

```js
const visualProgress = resolveVisualProgress(rawProgress, options);
```

Modify `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/homepage/aod-homepage-adapter.js`.

Required behavior:

- [ ] Use join-local raw transition progress for timeline state. Do not merge with `handoffProgress` using `Math.max`.
- [ ] Call:

```js
renderAodTransitionProgress(section, progress, {
  accelerate: false,
  progressCurve: 'linear'
});
```

- [ ] Use a slower ink span:

```js
const inkProgress = smoothStep(range01(progress, 0.08, 0.92));
```

- [ ] Start method copy before AOD finishes:

```js
const methodCopyProgress = smoothStep(range01(progress, 0.48, 0.82));
```

- [ ] Report milestones:

```js
timeline?.updateJoin('belief-method', progress, {
  milestones: {
    aodInkReadable: inkProgress > 0.12 && inkProgress < 0.96,
    methodCopyReady: methodCopyProgress > 0.03,
    methodCopyReadable: methodCopyProgress >= 0.72,
    playbackComplete: progress >= 0.998
  }
});
```

Required ownership checks:

```js
const ownership = timeline?.getOwnership('belief-method');
const aodOwnsCanvas = ownership?.canvasOwner === 'aod-transition';
const aodOwnsMask = ownership?.maskOwner === 'aod-ink';
const aodOwnsLayer = ownership?.layerOwner === 'aod-transition';
const methodCanForeground = ownership?.foregroundCopyOwner === 'method';
```

- [ ] AOD canvas opacity must be `0` when `aodOwnsCanvas` is false.
- [ ] AOD ink mask must not cover the viewport when `aodOwnsMask` is false.
- [ ] AOD full-viewport layer must not sit above method copy when `aodOwnsLayer` is false.
- [ ] Method copy opacity can become readable only when `methodCanForeground` is true.

Modify CSS for method fixed copy:

- [ ] When method copy is timeline-fixed, its main copy block must sit within the central readable viewport band.
- [ ] Add a rule that keeps the first method layout from only appearing at the bottom:

```css
.method-edition-layout--after-handoff[data-timeline-fixed='true'],
.method-edition-layout--after-handoff.is-timeline-fixed {
  min-height: 100svh;
  display: grid;
  align-content: center;
  padding-block: clamp(5rem, 8svh, 8rem);
}
```

- [ ] Reconcile this with existing method section spacing so normal scroll layout still works after release.

Run:

```bash
npm run build:page
npm run verify:homepage-visual-timeline
```

### Task 9: Keep Figure2 And Figure3 Copy Release Under Timeline Control

Review and modify:

- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/homepage/figure2-homepage-adapter.js`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/homepage/figure3-homepage-adapter.js`

Required behavior:

- [ ] Adapters must report join-local raw transition progress through `timeline.updateJoin(joinId, joinRawProgress, milestones)`.
- [ ] Figure2 must use the brand bridge progress, not full host progress:

```js
const brandJoinProgress = transitionProgress;
timeline?.updateJoin('method-proof-brand', brandJoinProgress, {
  milestones: {
    brandCopyReadable: brandJoinProgress >= 0.72,
    playbackComplete: brandJoinProgress >= 0.998
  }
});
```

- [ ] Figure3 must use its services bridge progress, not an intro or host-wide progress:

```js
const servicesJoinProgress = progress;
timeline?.updateJoin('brand-services', servicesJoinProgress, {
  milestones: {
    servicesCopyReadable: servicesJoinProgress >= 0.72,
    playbackComplete: servicesJoinProgress >= 0.998
  }
});
```

- [ ] Adapters must call `timeline.getOwnership(joinId)` before changing canvas, mask, layer, or foreground copy state.
- [ ] `timeline.getOwnership('method-proof-brand')` must resolve the `method-proof-brand-figure2-brand-entry` window.
- [ ] `timeline.getOwnership('brand-services')` must resolve the `brand-services-figure3-services-entry` window.
- [ ] Adapters must not write final hidden styles to real target copy after `presentAt`.
- [ ] Adapters must not restart target copy if `timeline.getState(joinId).released === true`.
- [ ] Figure2 brand target must report `brandCopyReadable`.
- [ ] Figure3 services target must report `servicesCopyReadable`.
- [ ] Visual bridge cleanup must happen after `presentAt`, not before.
- [ ] There must be no path that leaves a blank parchment layer over target copy after transition completion.

Add static contract checks to `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/scripts/check-homepage-visual-timeline-contract.mjs`:

```js
const figure2Adapter = read('js/transitions/homepage/figure2-homepage-adapter.js');
assertIncludes(figure2Adapter, 'brandCopyReadable', 'figure2 homepage milestones');
assertNotIncludes(figure2Adapter, 'createHandoffReceiver', 'figure2 homepage adapter');

const figure3Adapter = read('js/transitions/homepage/figure3-homepage-adapter.js');
assertIncludes(figure3Adapter, 'servicesCopyReadable', 'figure3 homepage milestones');
assertNotIncludes(figure3Adapter, 'createHandoffReceiver', 'figure3 homepage adapter');
```

Run:

```bash
npm run build:page
npm run verify:homepage-visual-timeline
```

### Task 10: Fix Crane Contact Timing

Modify `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/homepage/crane-homepage-adapter.js`.

Required behavior:

- [ ] Use raw crane progress for scene rendering.
- [ ] Use a separate contact copy progress window:

```js
const contactCopyProgress = smoothStep(range01(progress, 0.58, 0.88));
```

- [ ] Remove `Math.max(progress, handoffProgress)` from timeline updates.
- [ ] Report milestones:

```js
timeline?.updateJoin('philosophy-contact', progress, {
  milestones: {
    craneVisualClear: progress >= 0.56,
    contactCopyReady: contactCopyProgress > 0.04,
    contactCopyReadable: contactCopyProgress >= 0.82,
    playbackComplete: progress >= 0.998
  }
});
```

Required ownership checks:

```js
const ownership = timeline?.getOwnership('philosophy-contact');
const craneOwnsCanvas = ownership?.canvasOwner === 'crane';
const craneOwnsMask = ownership?.maskOwner === 'crane-transition';
const craneOwnsLayer = ownership?.layerOwner === 'crane-transition';
const contactCanForeground = ownership?.foregroundCopyOwner === 'contact';
```

- [ ] Crane canvas can remain visible only while `craneOwnsCanvas` is true.
- [ ] Crane transition mask can remain visible only while `craneOwnsMask` is true.
- [ ] Crane layer can sit above contact only while `craneOwnsLayer` is true.
- [ ] Contact copy can be foreground-readable only when `contactCanForeground` is true.

- [ ] Keep crane visual above contact copy until `progress >= 0.56`.
- [ ] Allow contact copy to become readable before the crane layer has fully cleaned up.
- [ ] Ensure contact does not appear as a separate flash after cleanup.

Run:

```bash
npm run build:page
npm run verify:homepage-visual-timeline
```

### Task 11: Add CDP-Based Visual Audit Without Playwright

Create `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/scripts/audit-homepage-directed-timeline-cdp.mjs`.

Purpose: verify the visual semantics that static checks cannot prove. Use Chrome DevTools Protocol directly, not Playwright.

Required audit flow:

- [ ] Launch a local static server for the built page on an available port.
- [ ] Launch Chrome with remote debugging port.
- [ ] Visit the built homepage.
- [ ] Test two viewports: `1440x900` and `2940x1662`.
- [ ] Drive scroll with wheel events, not only `window.scrollTo`, so scroll-triggered runtime paths execute.
- [ ] Record screenshots under `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/output/playwright/homepage-directed-timeline-cdp/` to keep existing artifact convention.
- [ ] Stop Chrome and the local server before the script exits.

Required DOM probes:

```js
(() => {
  function info(selector) {
    const el = document.querySelector(selector);
    if (!el) return { exists: false };
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      exists: true,
      text: el.textContent.trim().replace(/\s+/g, ' '),
      opacity: Number(style.opacity),
      visibility: style.visibility,
      display: style.display,
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height
    };
  }

  return {
    scrollY: window.scrollY,
    owners: {
      visualOwner: document.documentElement.dataset.sceneVisualOwner || '',
      copyOwner: document.documentElement.dataset.sceneCopyOwner || '',
      foregroundCopyOwner: document.documentElement.dataset.sceneForegroundCopyOwner || '',
      canvasOwner: document.documentElement.dataset.sceneCanvasOwner || '',
      maskOwner: document.documentElement.dataset.sceneMaskOwner || '',
      layerOwner: document.documentElement.dataset.sceneLayerOwner || '',
      transitionPhase: document.documentElement.dataset.transitionPhase || ''
    },
    upper: info('.belief-upper-copy-wrap'),
    lower: info('.belief-lower-copy-wrap'),
    method: info('.method-edition-layout--after-handoff'),
    brand: info('.brand-definition-grid'),
    services: info('#services .reveal, #services h2, #services p'),
    contact: info('#contact .reveal, #contact h2, #contact p'),
    patternOpacity: Number(getComputedStyle(document.querySelector('.pattern-bloom-transition__stage') || document.body).opacity || 0),
    starOpacity: Number(getComputedStyle(document.querySelector('.belief-star-field') || document.body).opacity || 0),
    transitionPlaying: document.documentElement.className
  };
})()
```

Required audit assertions:

- [ ] Home-to-belief samples include a frame where upper copy opacity is at least `0.7`, lower copy opacity is less than `0.2`, and the upper text is not the `AI 不是技术专家的玩具。` paragraph.
- [ ] That upper-copy frame has `owners.foregroundCopyOwner === 'belief-upper'`, `owners.layerOwner === 'pattern-bloom'`, and `owners.maskOwner === 'pattern-reveal'`.
- [ ] Home-to-belief samples include a later frame where lower copy opacity is at least `0.7` and upper copy opacity is less than `0.2`.
- [ ] That lower-copy frame has `owners.foregroundCopyOwner === 'belief-lower'`, `owners.canvasOwner === 'belief-star-field'`, and `owners.maskOwner === 'bottom-up-ink'` until release.
- [ ] No sample has pattern canvas and star canvas both above `0.35` opacity.
- [ ] AOD-to-method has no sample after method copy progress starts where the viewport is visually blank and method DOM opacity is readable but covered by `owners.maskOwner === 'aod-ink'` or `owners.layerOwner === 'aod-transition'`.
- [ ] When method is visible during handoff, its top is between `12%` and `72%` of viewport height.
- [ ] Figure2-to-brand has no blank parchment sample after brand copy progress starts.
- [ ] Figure2-to-brand brand-readable samples have `owners.foregroundCopyOwner === 'brand'` and do not have an opaque `owners.maskOwner === 'figure2-transition'` after release.
- [ ] Figure3-to-services has no blank parchment sample after services copy progress starts.
- [ ] Figure3-to-services services-readable samples have `owners.foregroundCopyOwner === 'services'` and do not have an opaque `owners.maskOwner === 'figure3-transition'` after release.
- [ ] Crane-to-contact has no contact copy readability while `owners.foregroundCopyOwner !== 'contact'`, and no blank frame after contact progress starts.

Add package script:

```json
"audit:homepage-directed-timeline": "node scripts/audit-homepage-directed-timeline-cdp.mjs"
```

Do not run this script until Tasks 1-10 are complete.

### Task 12: Run Full Verification

Run the static checks:

```bash
npm run build:page
npm run verify:homepage-timeline
npm run verify:homepage-visual-timeline
npm run verify:homepage-transitions
npm run verify:all
git diff --check
```

Run the browser audit only after static checks pass:

```bash
npm run audit:homepage-directed-timeline
```

Manual browser QA, without Playwright:

- [ ] Open the local page in Chrome at normal window size.
- [ ] Slowly scroll home-to-belief and verify second-scene upper copy appears before lower copy.
- [ ] Verify upper-to-lower uses bottom-up ink.
- [ ] Verify lower belief scene uses the Perlin/no-stretch centered copy design.
- [ ] Verify AOD-to-method has no blank frame and method copy is not bottom-peeking.
- [ ] Verify figure2-to-brand has no long blank on return.
- [ ] Verify figure3-to-services copy remains readable.
- [ ] Verify crane-to-contact overlaps smoothly without premature cover.
- [ ] Repeat the same pass at near-fullscreen size.

### Task 13: Commit Handoff

- [ ] Run `git status --short`.
- [ ] Review generated `index.html` and `js/transitions/homepage/scene-timeline-manifest.js` to confirm they were produced by `npm run build:page`.
- [ ] Stage only intended files.
- [ ] Commit with:

```bash
git commit -m "fix: direct homepage scene timeline ownership"
```

- [ ] Push the branch if the user asks for push.

---

## Implementation Order

Do not jump directly to adapter tuning. The order matters:

1. Contract check.
2. Belief upper/lower markup.
3. Manifest scenes, joins, ownership windows, and generated attributes.
4. Controller multi-join support plus ownership arbitration.
5. Runtime context wiring and resource write authorization.
6. Pattern Bloom directed scenes.
7. AOD/method timing.
8. Figure2/Figure3 release checks.
9. Crane/contact timing.
10. CDP visual audit.
11. Full verification.

The expected midpoint is that `verify:homepage-visual-timeline` fails first, then passes after Tasks 2-10. Browser audit is only meaningful after that.

---

## Risk Controls

- Do not bring back `createHandoffReceiver()` for homepage transitions.
- Do not build a global page-duration timeline. Each transition host keeps its own raw progress, and the orchestrator arbitrates resource ownership.
- Do not turn the controller into a renderer. It must not create GSAP timelines, draw canvas, calculate easing curves, or set per-frame transforms.
- Do not enforce more than `foregroundCopyOwner`, `canvasOwner`, `maskOwner`, `layerOwner`, and release state.
- Do not add hand-tuned numeric ownership windows. Use `windowRef` and `releaseAtRef` derived from join timing.
- Do not solve missing text by duplicating real target DOM into transition hosts.
- Do not put `data-entry-owner="timeline"` on an entire section unless the manifest explicitly opts in with `allowSectionOwner: true`.
- Do not hide copy by restoring old inline `opacity: 0` or `visibility: hidden` styles after `presentAt`.
- Do not use `Math.max(progress, handoffProgress)` as target copy progress.
- Do not make AOD progress faster to hide blank frames.
- Do not remove the visual bridge layers before the target copy is readable.
- Do not treat `opacity: 1` as proof of success when `maskOwner` or `layerOwner` still owns an opaque foreground layer.
- Do not let adapters change canvas, mask, layer, or foreground copy state without checking `timeline.getOwnership(joinId)`.
- Do not use Playwright unless the user explicitly authorizes it.

---

## Self-Review Checklist

Before marking this plan complete, verify:

- [ ] The second-scene upper copy has its own DOM wrapper and timeline scene.
- [ ] The lower `AI 不是技术专家的玩具。` paragraph is not reused as upper copy.
- [ ] `home-belief` can drive multiple directed joins from one host.
- [ ] `ownershipWindows` exists and covers at least home-belief upper, belief upper-lower ink, AOD-method overlap, figure2-brand entry, figure3-services entry, and crane-contact copy entry.
- [ ] Every ownership window uses `windowRef` and `releaseAtRef`; none uses a bare numeric `window` or `releaseAt`.
- [ ] Controller enforces only foreground copy, canvas, mask, layer, and release state.
- [ ] Controller state exposes `visualOwner`, `copyOwner`, `foregroundCopyOwner`, `canvasOwner`, `maskOwner`, `layerOwner`, `intentScene`, `committedScene`, and `releaseState`.
- [ ] Pattern Bloom reports upper, upper-to-lower ink, and lower milestones.
- [ ] AOD visual progress is linear/slower on homepage.
- [ ] Method copy becomes readable before AOD cleanup.
- [ ] Crane/contact overlap is gated by `craneVisualClear`.
- [ ] Static verification includes the new visual timeline contract.
- [ ] CDP audit covers both normal and large viewport sizes.
- [ ] Generated files are built, not hand edited.

---

## Execution Notes

This plan should be executed as a single implementation branch. The most important first failing test is `npm run verify:homepage-visual-timeline`; it proves the current system lacks a real second-scene upper and that adapters still own timing and resource layers locally. The most important final proof is `npm run audit:homepage-directed-timeline`; it proves the ownership contract survives real scroll timing and visible pixels.
