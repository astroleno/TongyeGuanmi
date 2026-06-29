# Homepage Transition Single Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragmented homepage transition handoff with a single scene ownership contract so every scene, copy block, and transition frame has exactly one owner.

**Architecture:** Add a manifest-driven homepage scene timeline as the source of truth for transition joins, target presentation, copy reveal, and commit timing. Keep the existing visual adapters and their current progress policies at first, but make them report into one scene state instead of moving real target DOM or inventing separate presentation timelines. Global `.reveal` remains for ordinary scroll content, while timeline-owned content is presented by the scene timeline.

**Tech Stack:** Vanilla ES modules, existing GSAP + ScrollTrigger + Lenis vendors, current homepage transition adapters, CSS data attributes, Node verification scripts.

---

## Scope Boundary

Implement now:

- Add a homepage scene timeline manifest.
- Add a small runtime controller that owns scene progress, commit labels, and presentation ownership.
- Keep scroll-driven and snap playback-driven progress as implementation policies, but prevent either policy from independently owning target copy visibility.
- Replace target DOM adoption with timeline-owned native section presentation.
- Update pattern-bloom, AOD, figure2, figure3, and crane to use the shared ownership contract.
- Update global `.reveal` so timeline-owned targets are never hidden by ScrollTrigger after a transition commits.
- Add a structural verification script that fails when the old split ownership patterns return.

Do not implement now:

- Do not redesign visual assets.
- Do not rewrite the full animation engine into Rive, Theatre.js, Three.js, or a pure Canvas system in this plan.
- Do not convert every transition to pure scroll-driven progress in this plan.
- Do not tune final animation easing by eye before the ownership contract passes checks.
- Do not use Playwright unless the user explicitly authorizes it.
- Do not edit the existing untracked `shopify-editions-scroll-animation-research.md` file unless the user asks for that document.

## Diagnosis Calibration

The implementation should follow the calibrated diagnosis in `docs/homepage-transition-root-cause.md`.

Use these conclusions:

- Shopify is useful as a state ownership reference: one central section state feeds visual layers.
- The local Shopify crawl shows `activeSection`, `sectionMap`, `transitionProgress`, next-section rendering, crossfade shader uniforms, Rive assets, and Theatre project-state asset references. Do not assume the whole site is only a Rive or Theatre runtime.
- The current repo's bug is not merely "scroll progress vs playback progress". It is missing ownership of target presentation and copy visibility.
- Snap playback may remain as a progress policy. It must not be the sole authority that hides, suppresses, restores, or commits target copy.
- `home-belief` is scroll-driven; its bug is pattern-bloom local state plus section/reveal ownership, not a snap playback handoff.
- Figure2 has staged ranges and post-scroll handoff; the fix is overlapping target presentation ownership, not only changing the `0.72` split.
- Crane/contact flashing should be treated as receiver preview plus restore plus native target scroll, not primarily as direct-hash timer behavior.

## File Structure

- Create `js/transitions/homepage/scene-timeline-manifest.js`
  - Owns canonical scene ids, transition join ids, target selectors, commit labels, and target presentation policy.
- Create `js/transitions/homepage/scene-timeline-controller.js`
  - Owns active timeline state, scene commit, target presentation, input lock coordination, and adapter-facing state derivation.
- Create `js/transitions/homepage/timeline-debug.js`
  - Optional `?debugTimeline=1` overlay for progress, from/to scene, phase, and owner.
- Modify `js/transitions/homepage-transition-runtime.js`
  - Uses the timeline controller for playhead updates, completion, post-scroll handoff, and target presentation.
- Modify `js/transitions/homepage/section-presentation-controller.js`
  - Becomes a thin compatibility layer over timeline presentation ownership.
- Modify `js/transitions/homepage/handoff-receiver.js`
  - Remove real DOM adoption from active adapters; keep only a deprecated no-op export during migration if imports remain temporarily.
- Modify `js/transitions/pattern-bloom-adapter.js`
  - Receives timeline state and renders canonical `home -> belief` phases from labels instead of local semantic booleans.
- Modify `js/transitions/homepage/aod-homepage-adapter.js`
  - Removes `.method-edition-layout--after-handoff` receiver ownership and renders AOD visuals only.
- Modify `js/transitions/homepage/figure2-homepage-adapter.js`
  - Removes `.brand-definition-grid` receiver ownership and commits `#brand` through timeline state.
- Modify `js/transitions/homepage/figure3-homepage-adapter.js`
  - Adds timeline commit for `#services` so services copy cannot disappear after transition completion.
- Modify `js/transitions/homepage/crane-homepage-adapter.js`
  - Removes `.contact-endpoint` receiver ownership and commits `#contact` through timeline state.
- Modify `js/ui/reveal.js`
  - Skips `.reveal` nodes inside timeline-owned sections and exposes a deterministic `presentRevealWithin()` helper.
- Modify `css/components/homepage-continuity.css`
  - Replaces receiver and target-gate visibility logic with timeline state selectors.
- Modify `css/components/homepage-transitions.css`
  - Removes transition-host states that create blank background-only frames after commit.
- Modify `index.html`
  - Adds stable timeline ownership attributes to handoff target sections and copy wrappers.
- Create `scripts/check-homepage-timeline-contract.mjs`
  - Verifies the new ownership contract from source.
- Modify `package.json`
  - Adds `verify:homepage-timeline`.

## Task 0: Dirty Worktree Preflight

**Files:**
- Read-only check

- [ ] **Step 1: Inspect branch and dirty files**

Run:

```bash
git status --short --branch
```

Expected: output may include unrelated dirty or untracked files. Do not stage unrelated files.

- [ ] **Step 2: Check files this plan will modify**

Run:

```bash
git status --short -- index.html js/transitions js/ui/reveal.js css/components/homepage-continuity.css css/components/homepage-transitions.css scripts package.json
```

Expected before implementation: no modified files from this task set. If any path is already modified, inspect it and preserve the user's changes.

- [ ] **Step 3: Record current split-ownership evidence**

Run:

```bash
rg -n "createHandoffReceiver|homepage-transition-target-gated|data-section-transition-state|setRevealPresentedWithin|suppressRevealOnceWithin|beliefPinned \\? 0\\.18|data-transition-handoff-phase|data-handoff-target-selector" index.html js css scripts
```

Expected: matches in runtime, handoff receiver, reveal integration, pattern-bloom adapter, CSS continuity, and `index.html`. These matches are the old contract this plan replaces.

## Task 1: Add A Failing Timeline Contract Check

**Files:**
- Create: `scripts/check-homepage-timeline-contract.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create the failing contract script**

Create `scripts/check-homepage-timeline-contract.mjs` with this complete content:

```js
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`Homepage timeline contract failed: ${message}`);
    process.exitCode = 1;
  }
}

function includes(file, needle) {
  return read(file).includes(needle);
}

const requiredFiles = [
  'js/transitions/homepage/scene-timeline-manifest.js',
  'js/transitions/homepage/scene-timeline-controller.js',
  'js/transitions/homepage/timeline-debug.js'
];

for (const file of requiredFiles) {
  assert(fs.existsSync(path.join(root, file)), `${file} must exist`);
}

if (fs.existsSync(path.join(root, 'js/transitions/homepage/scene-timeline-manifest.js'))) {
  const manifest = read('js/transitions/homepage/scene-timeline-manifest.js');
  for (const id of ['home-belief', 'belief-method', 'method-proof-brand', 'brand-services', 'philosophy-contact']) {
    assert(manifest.includes(`id: '${id}'`), `manifest must declare ${id}`);
  }
  assert(manifest.includes("variant: 'perlin-no-stretch-centered-copy'"), 'manifest must lock the requested belief second-scene variant');
}

if (fs.existsSync(path.join(root, 'js/transitions/homepage/scene-timeline-controller.js'))) {
  const controller = read('js/transitions/homepage/scene-timeline-controller.js');
  for (const exportName of ['createHomepageSceneTimeline', 'deriveJoinState', 'presentTimelineTarget']) {
    assert(controller.includes(`export function ${exportName}`), `controller must export ${exportName}`);
  }
}

const runtime = read('js/transitions/homepage-transition-runtime.js');
assert(runtime.includes('createHomepageSceneTimeline'), 'homepage runtime must use the scene timeline controller');
assert(!runtime.includes('beginTargetRevealGate('), 'runtime must not use target reveal gates as transition logic');

const reveal = read('js/ui/reveal.js');
assert(reveal.includes('data-entry-owner="timeline"'), 'reveal runtime must recognize timeline-owned content');
assert(reveal.includes('presentRevealWithin'), 'reveal runtime must expose presentRevealWithin');

const adapterFiles = [
  'js/transitions/homepage/aod-homepage-adapter.js',
  'js/transitions/homepage/figure2-homepage-adapter.js',
  'js/transitions/homepage/crane-homepage-adapter.js'
];

for (const file of adapterFiles) {
  const source = read(file);
  assert(!source.includes('createHandoffReceiver'), `${file} must not import createHandoffReceiver`);
  assert(!source.includes('homepage-handoff-receiver'), `${file} must not render receiver-owned target DOM`);
}

const patternBloom = read('js/transitions/pattern-bloom-adapter.js');
assert(!patternBloom.includes('beliefPinned ? 0.18 : 1'), 'pattern bloom must not clamp target scene opacity through beliefPinned');
assert(patternBloom.includes('timelineState'), 'pattern bloom must render from timelineState');

const continuityCss = read('css/components/homepage-continuity.css');
assert(!continuityCss.includes('homepage-transition-target-gated'), 'CSS must not hide target sections through homepage-transition-target-gated');
assert(continuityCss.includes('[data-entry-owner="timeline"]'), 'CSS must expose timeline-owned presentation states');

const index = read('index.html');
for (const selector of [
  'data-entry-owner="timeline"',
  'data-scene-target="belief"',
  'data-scene-target="method"',
  'data-scene-target="brand"',
  'data-scene-target="services"',
  'data-scene-target="contact"'
]) {
  assert(index.includes(selector), `index.html must include ${selector}`);
}

const packageJson = JSON.parse(read('package.json'));
assert(packageJson.scripts?.['verify:homepage-timeline'] === 'node scripts/check-homepage-timeline-contract.mjs', 'package.json must define verify:homepage-timeline');

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('Homepage timeline contract OK');
```

- [ ] **Step 2: Add the package script**

In `package.json`, add this script entry inside `scripts`:

```json
"verify:homepage-timeline": "node scripts/check-homepage-timeline-contract.mjs"
```

- [ ] **Step 3: Run the failing check**

Run:

```bash
npm run verify:homepage-timeline
```

Expected: FAIL. The missing files and old ownership patterns should be reported.

- [ ] **Step 4: Commit the failing contract**

Run:

```bash
git add scripts/check-homepage-timeline-contract.mjs package.json
git commit -m "test: add homepage timeline ownership contract"
```

## Task 2: Add The Scene Timeline Manifest

**Files:**
- Create: `js/transitions/homepage/scene-timeline-manifest.js`

- [ ] **Step 1: Create the manifest module**

Create `js/transitions/homepage/scene-timeline-manifest.js` with this complete content:

```js
export const HOMEPAGE_SCENES = Object.freeze({
  home: Object.freeze({ id: 'home', selector: '#home', copySelector: '.hero-content' }),
  belief: Object.freeze({
    id: 'belief',
    selector: '#belief',
    copySelector: '.belief-copy-wrap',
    variant: 'perlin-no-stretch-centered-copy'
  }),
  method: Object.freeze({
    id: 'method',
    selector: '#method',
    copySelector: '.method-edition-layout--after-handoff'
  }),
  methodProof: Object.freeze({
    id: 'method-proof',
    selector: '[data-scene-id="method-proof"]',
    copySelector: '.method-proof'
  }),
  brand: Object.freeze({
    id: 'brand',
    selector: '#brand',
    copySelector: '.brand-definition-grid'
  }),
  services: Object.freeze({
    id: 'services',
    selector: '#services',
    copySelector: '.enterprise-vertical-layout'
  }),
  lab: Object.freeze({
    id: 'lab',
    selector: '#lab',
    copySelector: '.scenario-layout'
  }),
  education: Object.freeze({
    id: 'education',
    selector: '#education',
    copySelector: '.education-layout'
  }),
  philosophy: Object.freeze({
    id: 'philosophy',
    selector: '#philosophy',
    copySelector: '.philosophy-list'
  }),
  contact: Object.freeze({
    id: 'contact',
    selector: '#contact',
    copySelector: '.contact-endpoint'
  })
});

export const HOMEPAGE_TIMELINE_JOINS = Object.freeze([
  Object.freeze({
    id: 'home-belief',
    hostSelector: '[data-transition-id="home-belief"]',
    module: 'pattern-bloom',
    from: 'home',
    to: 'belief',
    progressPolicy: 'scroll',
    variant: 'perlin-no-stretch-centered-copy',
    commitAt: 0.92,
    copyIn: [0.64, 0.92],
    copyOut: [0, 0],
    nativeReveal: 'continue',
    reducedMotion: 'jump-to-presented'
  }),
  Object.freeze({
    id: 'belief-method',
    hostSelector: '[data-transition-id="belief-method"]',
    module: 'aod',
    from: 'belief',
    to: 'method',
    progressPolicy: 'snap-playback',
    variant: 'measure-order',
    commitAt: 0.86,
    copyIn: [0.86, 1],
    copyOut: [0, 0.18],
    nativeReveal: 'skip',
    reducedMotion: 'jump-to-presented'
  }),
  Object.freeze({
    id: 'method-proof-brand',
    hostSelector: '[data-transition-id="method-tooling__method-proof"]',
    module: 'figure2',
    from: 'method-proof',
    to: 'brand',
    progressPolicy: 'snap-playback-post-scroll',
    variant: 'questioning',
    commitAt: 0.96,
    copyIn: [0.72, 0.96],
    copyOut: [0, 0.18],
    nativeReveal: 'skip',
    reducedMotion: 'jump-to-presented'
  }),
  Object.freeze({
    id: 'brand-services',
    hostSelector: '[data-transition-id="brand-services"]',
    module: 'figure3-transition',
    from: 'brand',
    to: 'services',
    progressPolicy: 'snap-playback',
    variant: 'fabric-menu',
    commitAt: 0.94,
    copyIn: [0.70, 0.94],
    copyOut: [0, 0.16],
    nativeReveal: 'skip',
    reducedMotion: 'jump-to-presented'
  }),
  Object.freeze({
    id: 'services-lab',
    hostSelector: '[data-transition-id="services-lab"]',
    module: 'ttg',
    from: 'services',
    to: 'lab',
    progressPolicy: 'snap-playback',
    variant: 'structure-field',
    commitAt: 0.94,
    copyIn: [0.70, 0.94],
    copyOut: [0, 0.16],
    nativeReveal: 'continue',
    reducedMotion: 'jump-to-presented'
  }),
  Object.freeze({
    id: 'lab-education',
    hostSelector: '[data-transition-id="lab-education"]',
    module: 'ph',
    from: 'lab',
    to: 'education',
    progressPolicy: 'snap-playback',
    variant: 'learning-sun',
    commitAt: 0.94,
    copyIn: [0.70, 0.94],
    copyOut: [0, 0.16],
    nativeReveal: 'continue',
    reducedMotion: 'jump-to-presented'
  }),
  Object.freeze({
    id: 'philosophy-contact',
    hostSelector: '[data-transition-id="philosophy-contact"]',
    module: 'crane',
    from: 'philosophy',
    to: 'contact',
    progressPolicy: 'snap-playback',
    variant: 'forward-motion',
    commitAt: 0.88,
    copyIn: [0.72, 0.88],
    copyOut: [0, 0.18],
    nativeReveal: 'skip',
    reducedMotion: 'jump-to-presented'
  })
]);

export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function range01(value, start, end) {
  if (end <= start) return value >= end ? 1 : 0;
  return clamp01((value - start) / (end - start));
}

export function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function findHomepageJoin(id) {
  return HOMEPAGE_TIMELINE_JOINS.find((join) => join.id === id) || null;
}

export function findHomepageScene(id) {
  return HOMEPAGE_SCENES[id] || null;
}

export function deriveJoinState(join, progress) {
  const safeProgress = clamp01(progress);
  const targetProgress = smooth01(range01(safeProgress, join.copyIn[0], join.copyIn[1]));
  const sourceProgress = 1 - smooth01(range01(safeProgress, join.copyOut[0], join.copyOut[1]));

  return Object.freeze({
    id: join.id,
    from: join.from,
    to: join.to,
    module: join.module,
    variant: join.variant,
    progress: safeProgress,
    sourceOpacity: sourceProgress,
    targetOpacity: targetProgress,
    targetCommitted: safeProgress >= join.commitAt,
    phase: safeProgress >= join.commitAt ? 'committed' : 'transitioning'
  });
}
```

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check js/transitions/homepage/scene-timeline-manifest.js
```

Expected:

```txt
```

- [ ] **Step 3: Commit the manifest**

Run:

```bash
git add js/transitions/homepage/scene-timeline-manifest.js
git commit -m "feat: add homepage scene timeline manifest"
```

## Task 3: Add The Timeline Controller

**Files:**
- Create: `js/transitions/homepage/scene-timeline-controller.js`

- [ ] **Step 1: Create the controller module**

Create `js/transitions/homepage/scene-timeline-controller.js` with this complete content:

```js
import {
  HOMEPAGE_TIMELINE_JOINS,
  deriveJoinState as deriveManifestJoinState,
  findHomepageJoin,
  findHomepageScene
} from './scene-timeline-manifest.js';
import { presentRevealWithin } from '../../ui/reveal.js';

const PRESENTED_STATE = 'presented';
const TRANSITIONING_STATE = 'transitioning';

function query(root, selector) {
  return selector ? root.querySelector(selector) : null;
}

function setDataState(element, state) {
  if (!element) return;
  element.dataset.entryOwner = 'timeline';
  element.dataset.entryState = state;
}

function markCopyPresented(root, scene) {
  const sceneElement = query(root, scene.selector);
  const copyElement = query(root, scene.copySelector);
  setDataState(sceneElement, PRESENTED_STATE);
  setDataState(copyElement, PRESENTED_STATE);
  if (copyElement) presentRevealWithin(copyElement);
  if (sceneElement) presentRevealWithin(sceneElement);
}

function markCopyTransitioning(root, scene) {
  const sceneElement = query(root, scene.selector);
  const copyElement = query(root, scene.copySelector);
  setDataState(sceneElement, TRANSITIONING_STATE);
  setDataState(copyElement, TRANSITIONING_STATE);
}

export function deriveJoinState(join, progress) {
  return deriveManifestJoinState(join, progress);
}

export function presentTimelineTarget(root, joinOrState) {
  const sceneId = joinOrState.to;
  const scene = findHomepageScene(sceneId);
  if (!scene) return false;
  markCopyPresented(root, scene);
  return true;
}

export function createHomepageSceneTimeline({ root = document, joins = HOMEPAGE_TIMELINE_JOINS, logger = console } = {}) {
  const active = new Map();
  const consumed = new Set();

  function getJoin(hostOrId) {
    const id = typeof hostOrId === 'string' ? hostOrId : hostOrId?.dataset?.transitionId;
    return joins.find((join) => join.id === id) || findHomepageJoin(id);
  }

  function begin(hostOrId) {
    const join = getJoin(hostOrId);
    if (!join) {
      logger?.warn?.('Unknown homepage timeline join', hostOrId);
      return null;
    }

    const sourceScene = findHomepageScene(join.from);
    const targetScene = findHomepageScene(join.to);
    if (sourceScene) markCopyTransitioning(root, sourceScene);
    if (targetScene) markCopyTransitioning(root, targetScene);

    const state = deriveJoinState(join, 0);
    active.set(join.id, state);
    return state;
  }

  function update(hostOrId, progress) {
    const join = getJoin(hostOrId);
    if (!join) return null;

    const state = deriveJoinState(join, progress);
    active.set(join.id, state);

    if (state.targetCommitted && !consumed.has(join.id)) {
      presentTimelineTarget(root, state);
      consumed.add(join.id);
    }

    return state;
  }

  function complete(hostOrId) {
    const join = getJoin(hostOrId);
    if (!join) return null;
    const state = update(join.id, 1);
    presentTimelineTarget(root, state);
    consumed.add(join.id);
    active.delete(join.id);
    return state;
  }

  function reset(hostOrId) {
    const join = getJoin(hostOrId);
    if (!join) return;
    active.delete(join.id);
    consumed.delete(join.id);
  }

  function getState(hostOrId) {
    const join = getJoin(hostOrId);
    return join ? active.get(join.id) || deriveJoinState(join, 0) : null;
  }

  return Object.freeze({
    begin,
    update,
    complete,
    reset,
    getState,
    getJoin,
    presentTarget: presentTimelineTarget
  });
}
```

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check js/transitions/homepage/scene-timeline-controller.js
```

Expected:

```txt
```

- [ ] **Step 3: Commit the controller**

Run:

```bash
git add js/transitions/homepage/scene-timeline-controller.js
git commit -m "feat: add homepage scene timeline controller"
```

## Task 4: Make Reveal Timeline-Aware

**Files:**
- Modify: `js/ui/reveal.js`

- [ ] **Step 1: Add the timeline ownership helpers**

In `js/ui/reveal.js`, add this code near the existing reveal helper exports:

```js
function isTimelineOwnedReveal(element) {
  return Boolean(element.closest('[data-entry-owner="timeline"]'));
}

export function presentRevealWithin(root = document) {
  const elements = root.matches?.('.reveal') ? [root] : [...root.querySelectorAll?.('.reveal') || []];
  for (const element of elements) {
    element.dataset.revealState = 'presented';
    if (window.gsap) {
      window.gsap.killTweensOf(element);
      window.gsap.set(element, { autoAlpha: 1, y: 0, clearProps: 'transform' });
    } else {
      element.style.opacity = '1';
      element.style.transform = 'none';
      element.style.visibility = 'visible';
    }
  }
}
```

- [ ] **Step 2: Skip timeline-owned nodes when ScrollTrigger reveal is initialized**

In the loop that creates `.reveal` ScrollTriggers, insert this guard before any `gsap.set()` or `gsap.to()` call for the element:

```js
if (isTimelineOwnedReveal(element)) {
  presentRevealWithin(element);
  return;
}
```

- [ ] **Step 3: Keep existing compatibility names alive**

If `setRevealPresentedWithin()` already exists, change its body to delegate:

```js
export function setRevealPresentedWithin(root = document) {
  presentRevealWithin(root);
}
```

If `suppressRevealOnceWithin()` already exists, keep the function exported and make it no-op for timeline-owned nodes:

```js
export function suppressRevealOnceWithin(root = document) {
  if (root.closest?.('[data-entry-owner="timeline"]') || root.querySelector?.('[data-entry-owner="timeline"]')) {
    presentRevealWithin(root);
    return;
  }

  const elements = root.matches?.('.reveal') ? [root] : [...root.querySelectorAll?.('.reveal') || []];
  for (const element of elements) {
    element.dataset.revealSuppressOnce = 'true';
  }
}
```

- [ ] **Step 4: Run syntax check**

Run:

```bash
node --check js/ui/reveal.js
```

Expected:

```txt
```

- [ ] **Step 5: Commit reveal ownership**

Run:

```bash
git add js/ui/reveal.js
git commit -m "feat: make reveal respect homepage timeline ownership"
```

## Task 5: Mark Timeline-Owned Targets In HTML

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add ownership attributes to the belief target**

Change the `#belief` section opening tag to include:

```html
data-entry-owner="timeline" data-scene-target="belief"
```

Change `.belief-copy-wrap` to:

```html
<div class="belief-copy-wrap" data-entry-owner="timeline" data-scene-target="belief">
```

- [ ] **Step 2: Add ownership attributes to the method target**

Change the `#method` section opening tag to include:

```html
data-entry-owner="timeline" data-scene-target="method"
```

Change `.method-edition-layout--after-handoff` to include:

```html
data-entry-owner="timeline" data-scene-target="method"
```

- [ ] **Step 3: Add ownership attributes to brand, services, and contact targets**

Change these opening tags:

```html
<section class="canvas-section canvas-section--brand" aria-label="品牌方法论" id="brand"
```

```html
<section class="canvas-section canvas-section--enterprise" id="services"
```

```html
<section class="canvas-section canvas-section--contact" id="contact"
```

Add the matching attributes:

```html
data-entry-owner="timeline" data-scene-target="brand"
```

```html
data-entry-owner="timeline" data-scene-target="services"
```

```html
data-entry-owner="timeline" data-scene-target="contact"
```

- [ ] **Step 4: Add ownership attributes to the target copy wrappers**

Update these target wrappers:

```html
<div class="brand-definition-grid reveal" data-entry-owner="timeline" data-scene-target="brand">
```

```html
<div class="enterprise-vertical-layout edition-vertical-layout" data-entry-owner="timeline" data-scene-target="services">
```

```html
<div class="canvas-track contact-endpoint reveal" data-entry-owner="timeline" data-scene-target="contact">
```

- [ ] **Step 5: Verify the attributes**

Run:

```bash
rg -n "data-entry-owner=\"timeline\"|data-scene-target=\"(belief|method|brand|services|contact)\"" index.html
```

Expected: matches for the five target scenes and their primary copy wrappers.

- [ ] **Step 6: Commit HTML ownership**

Run:

```bash
git add index.html
git commit -m "feat: mark homepage timeline-owned sections"
```

## Task 6: Wire Runtime To The Timeline Controller

**Files:**
- Modify: `js/transitions/homepage-transition-runtime.js`
- Modify: `js/transitions/homepage/section-presentation-controller.js`

- [ ] **Step 1: Import the timeline controller**

At the top of `js/transitions/homepage-transition-runtime.js`, add:

```js
import { createHomepageSceneTimeline } from './homepage/scene-timeline-controller.js';
```

- [ ] **Step 2: Create the timeline during runtime init**

Inside `initHomepageTransitions()`, after `presentationController` is created, add:

```js
const sceneTimeline = createHomepageSceneTimeline({
  root: document,
  logger: console
});
```

- [ ] **Step 3: Begin timeline ownership when a controller starts**

Inside `playController(controller, direction, options = {})`, immediately after the forward-direction guard succeeds, add:

```js
const timelineState = direction > 0 ? sceneTimeline.begin(controller.host) : null;
controller.timelineState = timelineState;
```

- [ ] **Step 4: Update timeline state from the same progress as the visual adapter**

Inside the progress update path used by snap playhead animation, after the code writes the new controller progress, add:

```js
if (controller.timelineState && direction > 0) {
  controller.timelineState = sceneTimeline.update(controller.host, controller.progressSource());
}
```

- [ ] **Step 5: Commit timeline target before runtime scroll completion**

Inside `completePlayback(controller, direction, options = {})`, before any `window.scrollTo()` or Lenis scroll call, add:

```js
if (direction > 0 && controller.timelineState) {
  controller.timelineState = sceneTimeline.complete(controller.host);
}
```

- [ ] **Step 6: Remove target gate calls from the forward path**

Delete calls to:

```js
beginTargetRevealGate(controller);
releaseTargetRevealGate(controller);
```

Keep the function definitions until the check script passes, then remove the unused definitions in the same commit.

- [ ] **Step 7: Make section presentation controller delegate to timeline-owned state**

In `js/transitions/homepage/section-presentation-controller.js`, change `markPresented(target)` so it sets the same data state used by the timeline:

```js
function markPresented(target) {
  if (!target) return;
  presentedSections.add(target);
  target.dataset.sectionHandoffState = 'presented';
  target.dataset.entryOwner = target.dataset.entryOwner || 'timeline';
  target.dataset.entryState = 'presented';
  setRevealPresentedWithin(target);
}
```

- [ ] **Step 8: Run syntax checks**

Run:

```bash
node --check js/transitions/homepage-transition-runtime.js
node --check js/transitions/homepage/section-presentation-controller.js
```

Expected:

```txt
```

- [ ] **Step 9: Commit runtime wiring**

Run:

```bash
git add js/transitions/homepage-transition-runtime.js js/transitions/homepage/section-presentation-controller.js
git commit -m "feat: drive homepage presentation from scene timeline"
```

## Task 7: Stop Moving Target DOM In Handoff Adapters

**Files:**
- Modify: `js/transitions/homepage/aod-homepage-adapter.js`
- Modify: `js/transitions/homepage/figure2-homepage-adapter.js`
- Modify: `js/transitions/homepage/crane-homepage-adapter.js`
- Modify: `js/transitions/homepage/handoff-receiver.js`

- [ ] **Step 1: Remove receiver imports from target adapters**

Delete this import from AOD, figure2, and crane adapters:

```js
import { createHandoffReceiver } from './handoff-receiver.js';
```

- [ ] **Step 2: Remove AOD target receiver creation and updates**

In `js/transitions/homepage/aod-homepage-adapter.js`, delete the `methodReceiver` creation block and delete the render-loop call that updates it:

```js
methodReceiver.update(Math.max(progress, handoffProgress), {
  start: 0.58,
  end: 0.94
});
```

Keep AOD ink and field visual rendering intact.

- [ ] **Step 3: Remove figure2 brand receiver creation and updates**

In `js/transitions/homepage/figure2-homepage-adapter.js`, delete the `brandReceiver` creation block and delete the render-loop call that updates it:

```js
brandReceiver.update(Math.max(postProgress, handoffProgress), {
  start: 0.58,
  end: 0.96
});
```

Keep the figure2 visual stages and method-proof source content intact for this pass.

- [ ] **Step 4: Remove crane contact receiver creation and updates**

In `js/transitions/homepage/crane-homepage-adapter.js`, delete the `contactReceiver` creation block and delete the render-loop call that updates it:

```js
contactReceiver.update(Math.max(progress, handoffProgress), {
  start: 0.58,
  end: 0.94
});
```

Keep crane visual rendering intact.

- [ ] **Step 5: Deprecate the old receiver module without deleting it**

Replace the body of `createHandoffReceiver()` in `js/transitions/homepage/handoff-receiver.js` with this compatibility implementation:

```js
export function createHandoffReceiver() {
  return Object.freeze({
    adopt() {},
    update() {},
    restore() {},
    destroy() {}
  });
}
```

This keeps accidental remaining imports harmless while the contract script prevents new active usage.

- [ ] **Step 6: Confirm no target adapter imports remain**

Run:

```bash
rg -n "createHandoffReceiver|homepage-handoff-receiver" js/transitions/homepage/aod-homepage-adapter.js js/transitions/homepage/figure2-homepage-adapter.js js/transitions/homepage/crane-homepage-adapter.js
```

Expected:

```txt
```

- [ ] **Step 7: Run syntax checks**

Run:

```bash
node --check js/transitions/homepage/aod-homepage-adapter.js
node --check js/transitions/homepage/figure2-homepage-adapter.js
node --check js/transitions/homepage/crane-homepage-adapter.js
node --check js/transitions/homepage/handoff-receiver.js
```

Expected:

```txt
```

- [ ] **Step 8: Commit receiver removal**

Run:

```bash
git add js/transitions/homepage/aod-homepage-adapter.js js/transitions/homepage/figure2-homepage-adapter.js js/transitions/homepage/crane-homepage-adapter.js js/transitions/homepage/handoff-receiver.js
git commit -m "refactor: stop moving target DOM during homepage handoffs"
```

## Task 8: Make Pattern Bloom Render From Timeline State

**Files:**
- Modify: `js/transitions/pattern-bloom-adapter.js`

- [ ] **Step 1: Import timeline helpers**

Add:

```js
import { deriveJoinState, findHomepageJoin, range01, smooth01 } from './homepage/scene-timeline-manifest.js';
```

- [ ] **Step 2: Create the home-belief join state inside render**

Inside the render function that currently computes `overlayActive`, `secondRevealProgress`, and `beliefPinned`, add:

```js
const homeBeliefJoin = findHomepageJoin('home-belief');
const timelineState = deriveJoinState(homeBeliefJoin, progress);
```

- [ ] **Step 3: Replace the opacity clamp**

Replace:

```js
const topSceneOpacity = canvasRevealed && secondRevealProgress < 0.998
  ? Math.min(lotusOpacity, beliefPinned ? 0.18 : 1)
  : 0;
```

with:

```js
const topSceneOpacity = timelineState.sourceOpacity;
const beliefSceneOpacity = timelineState.targetOpacity;
const beliefCopyProgress = timelineState.targetOpacity;
```

- [ ] **Step 4: Lock the requested second-scene variant**

Set the belief transition visual options to the manifest variant:

```js
const beliefSceneVariant = homeBeliefJoin.variant;
```

Use `beliefSceneVariant` where the adapter currently relies on hard-coded belief variant names. Keep the image fit as non-stretching:

```js
const beliefImageFit = 'contain';
const beliefPerlinOverlay = true;
```

- [ ] **Step 5: Keep local decorative progress only for drawing**

Keep `secondRevealProgress`, lotus drawing progress, and ink transition progress for visual drawing only. Do not use those local values to decide whether the belief copy exists, whether the belief scene is presented, or whether the previous scene is allowed to become fully transparent.

- [ ] **Step 6: Run syntax check**

Run:

```bash
node --check js/transitions/pattern-bloom-adapter.js
```

Expected:

```txt
```

- [ ] **Step 7: Commit pattern-bloom timeline rendering**

Run:

```bash
git add js/transitions/pattern-bloom-adapter.js
git commit -m "refactor: drive pattern bloom from homepage timeline state"
```

## Task 9: Give Figure3 A Real Target Commit

**Files:**
- Modify: `js/transitions/homepage/figure3-homepage-adapter.js`
- Modify: `index.html`

- [ ] **Step 1: Add handoff metadata to the brand-services transition**

In `index.html`, update the `brand-services` transition div to include:

```html
data-transition-handoff-target="#services" data-transition-handoff-phase="after-playback" data-handoff-id="brand-services" data-handoff-owner="target-section" data-target-entry-policy="skip" data-target-entry-suppress-once="true" data-handoff-scroll-to="#services" data-handoff-reduced-motion="jump-to-presented" data-handoff-target-selector=".enterprise-vertical-layout"
```

- [ ] **Step 2: Add adapter support for timeline state**

In `js/transitions/homepage/figure3-homepage-adapter.js`, update the existing adapter factory signature so it accepts `timelineState` if the runtime passes it:

```js
export function mountHomepageTransition({ host, reduceMotion = false, progressSource, timelineState, addCleanup }) {
```

This preserves the current export name used by `homepage-transition-runtime.js`.

- [ ] **Step 3: Use timeline progress only for target presentation hooks**

Inside the render loop, add:

```js
const joinState = typeof timelineState === 'function' ? timelineState() : null;
if (joinState?.targetCommitted) {
  host.dataset.timelineCommitted = 'true';
}
```

Do not duplicate services copy inside the transition adapter.

- [ ] **Step 4: Run syntax checks**

Run:

```bash
node --check js/transitions/homepage/figure3-homepage-adapter.js
```

Expected:

```txt
```

- [ ] **Step 5: Commit figure3 handoff**

Run:

```bash
git add index.html js/transitions/homepage/figure3-homepage-adapter.js
git commit -m "feat: commit services section through homepage timeline"
```

## Task 10: Replace CSS Gates With Timeline States

**Files:**
- Modify: `css/components/homepage-continuity.css`
- Modify: `css/components/homepage-transitions.css`

- [ ] **Step 1: Remove target-gate hiding rules**

In `css/components/homepage-continuity.css`, delete selectors that contain:

```css
.homepage-transition-target-gated
[data-section-transition-state="gated-in"]
```

- [ ] **Step 2: Add timeline-owned defaults**

Add this block to `css/components/homepage-continuity.css`:

```css
[data-entry-owner="timeline"] {
  transition-property: opacity, transform, filter;
  transition-duration: 420ms;
  transition-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);
}

[data-entry-owner="timeline"][data-entry-state="transitioning"] {
  opacity: var(--timeline-target-opacity, 1);
}

[data-entry-owner="timeline"][data-entry-state="presented"] {
  opacity: 1;
  visibility: visible;
  transform: none;
  filter: none;
}
```

- [ ] **Step 3: Remove receiver presentation CSS**

In `css/components/homepage-continuity.css`, delete selectors that contain:

```css
.homepage-handoff-receiver
.homepage-handoff-receiver__content
```

- [ ] **Step 4: Prevent transition hosts from owning post-commit blanks**

In `css/components/homepage-transitions.css`, add:

```css
.homepage-transition[data-timeline-committed="true"] {
  pointer-events: none;
}
```

If a host rule sets an opaque background only for completed snapped transitions, restrict that rule to active playback:

```css
.homepage-transition.homepage-transition--playing {
  background: var(--transition-seam-color);
}
```

- [ ] **Step 5: Verify old CSS gates are gone**

Run:

```bash
rg -n "homepage-transition-target-gated|homepage-handoff-receiver|data-section-transition-state=\"gated-in\"" css/components/homepage-continuity.css css/components/homepage-transitions.css
```

Expected:

```txt
```

- [ ] **Step 6: Commit CSS state cleanup**

Run:

```bash
git add css/components/homepage-continuity.css css/components/homepage-transitions.css
git commit -m "refactor: replace homepage handoff gates with timeline states"
```

## Task 11: Add Optional Timeline Debug Overlay

**Files:**
- Create: `js/transitions/homepage/timeline-debug.js`
- Modify: `js/transitions/homepage-transition-runtime.js`

- [ ] **Step 1: Create the debug overlay module**

Create `js/transitions/homepage/timeline-debug.js` with this complete content:

```js
export function createTimelineDebugOverlay({ enabled = new URLSearchParams(window.location.search).has('debugTimeline') } = {}) {
  if (!enabled) {
    return Object.freeze({ update() {}, destroy() {} });
  }

  const node = document.createElement('aside');
  node.setAttribute('aria-hidden', 'true');
  node.style.cssText = [
    'position:fixed',
    'right:12px',
    'bottom:12px',
    'z-index:99999',
    'max-width:320px',
    'padding:10px 12px',
    'background:rgba(0,0,0,.76)',
    'color:#fff',
    'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    'border:1px solid rgba(255,255,255,.22)',
    'border-radius:6px',
    'pointer-events:none',
    'white-space:pre-wrap'
  ].join(';');
  document.body.appendChild(node);

  function update(state) {
    if (!state) {
      node.textContent = 'timeline: idle';
      return;
    }

    node.textContent = [
      `join: ${state.id}`,
      `from: ${state.from}`,
      `to: ${state.to}`,
      `phase: ${state.phase}`,
      `progress: ${state.progress.toFixed(3)}`,
      `sourceOpacity: ${state.sourceOpacity.toFixed(3)}`,
      `targetOpacity: ${state.targetOpacity.toFixed(3)}`,
      `committed: ${String(state.targetCommitted)}`
    ].join('\n');
  }

  function destroy() {
    node.remove();
  }

  return Object.freeze({ update, destroy });
}
```

- [ ] **Step 2: Wire debug overlay to runtime**

In `js/transitions/homepage-transition-runtime.js`, add:

```js
import { createTimelineDebugOverlay } from './homepage/timeline-debug.js';
```

Inside `initHomepageTransitions()`, after creating `sceneTimeline`, add:

```js
const timelineDebug = createTimelineDebugOverlay();
```

After each `sceneTimeline.update()` and `sceneTimeline.complete()` call, add:

```js
timelineDebug.update(controller.timelineState);
```

- [ ] **Step 3: Run syntax checks**

Run:

```bash
node --check js/transitions/homepage/timeline-debug.js
node --check js/transitions/homepage-transition-runtime.js
```

Expected:

```txt
```

- [ ] **Step 4: Commit debug overlay**

Run:

```bash
git add js/transitions/homepage/timeline-debug.js js/transitions/homepage-transition-runtime.js
git commit -m "chore: add homepage timeline debug overlay"
```

## Task 12: Update Existing Verification Scripts

**Files:**
- Modify: `scripts/check-homepage-transition-integration.mjs`
- Modify: `scripts/check-handoff-ownership.mjs`
- Modify: `scripts/check-section-transition-contract.mjs`

- [ ] **Step 1: Stop asserting the old pattern-bloom clamp**

In `scripts/check-homepage-transition-integration.mjs`, delete checks that require:

```js
'beliefPinned ? 0.18 : 1'
```

Add a check that requires:

```js
'timelineState'
```

- [ ] **Step 2: Stop requiring handoff receiver usage**

In `scripts/check-homepage-transition-integration.mjs`, delete checks that require AOD, figure2, or crane to call:

```js
createHandoffReceiver
```

Add checks that require the same adapters to avoid receiver imports:

```js
assert(!source.includes('createHandoffReceiver'), `${file} must not move target DOM`);
```

- [ ] **Step 3: Make handoff ownership forbid real target adoption**

In `scripts/check-handoff-ownership.mjs`, add assertions that fail if active adapters contain:

```js
source.classList.add('homepage-handoff-receiver__content')
marker.parentNode.insertBefore(source, marker)
receiver.appendChild(source)
```

- [ ] **Step 4: Make section contract require timeline owner on handoff targets**

In `scripts/check-section-transition-contract.mjs`, add checks for handoff target sections:

```js
assert(target.dataset.entryOwner === 'timeline', `${id} target must be timeline-owned`);
assert(target.dataset.sceneTarget, `${id} target must declare data-scene-target`);
```

- [ ] **Step 5: Run the updated verification scripts**

Run:

```bash
npm run verify:homepage-timeline
npm run verify:all
```

Expected: `verify:homepage-timeline` passes. `verify:all` passes or fails only on unrelated existing checks; investigate any failure touching homepage transition files before committing.

- [ ] **Step 6: Commit verification updates**

Run:

```bash
git add scripts/check-homepage-transition-integration.mjs scripts/check-handoff-ownership.mjs scripts/check-section-transition-contract.mjs
git commit -m "test: enforce homepage timeline ownership contract"
```

## Task 13: Final Static Verification

**Files:**
- Read-only check

- [ ] **Step 1: Run focused source checks**

Run:

```bash
npm run verify:homepage-timeline
```

Expected:

```txt
Homepage timeline contract OK
```

- [ ] **Step 2: Run all repository checks**

Run:

```bash
npm run verify:all
```

Expected: all configured checks pass.

- [ ] **Step 3: Search for removed ownership patterns**

Run:

```bash
rg -n "createHandoffReceiver|homepage-transition-target-gated|homepage-handoff-receiver|beliefPinned \\? 0\\.18|beginTargetRevealGate" js css scripts index.html
```

Expected: no active runtime, adapter, CSS, or verification dependency on these patterns. A deprecated no-op export in `js/transitions/homepage/handoff-receiver.js` is acceptable only if no active adapter imports it.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff --stat HEAD
git diff -- index.html js/transitions js/ui/reveal.js css/components/homepage-continuity.css css/components/homepage-transitions.css scripts package.json
```

Expected: diff only contains the timeline ownership refactor described in this plan.

## Task 14: Manual QA Without Playwright

**Files:**
- Read-only check

- [ ] **Step 1: Start the local site**

Run:

```bash
npm run dev
```

Expected: the command prints a local URL. Keep the server running for manual browser review.

- [ ] **Step 2: Review the eight reported flows**

Open the site manually and check these flows:

```txt
1. home -> belief top: no black frame after transition completion.
2. belief top -> belief lower state: lotus and right copy share one reveal timing.
3. belief lower state: perlin/no-stretch variant appears and copy is centered.
4. belief -> method/AOD: AOD is the next presented state after ink completes.
5. AOD -> method copy: no blank gap.
6. figure2 -> brand: brand copy follows the second figure2 phase without blank gap.
7. figure3 -> services: services copy remains visible after transition.
8. crane -> contact: no preview-then-second-contact flash.
```

- [ ] **Step 3: Review the debug overlay**

Open the same page with:

```txt
?debugTimeline=1
```

Expected: each transition shows one join id, one source, one target, one phase, and one committed state. No transition should show a committed target while the native target copy is invisible.

- [ ] **Step 4: Stop the dev server**

Stop the terminal process with `Ctrl-C`.

## Final Commit

- [ ] **Step 1: Confirm working tree contains only intentional files**

Run:

```bash
git status --short
```

Expected: only files modified by this plan are listed. Do not stage unrelated files.

- [ ] **Step 2: Create the integration commit if earlier commits were squashed locally**

Run:

```bash
git add index.html js/transitions js/ui/reveal.js css/components/homepage-continuity.css css/components/homepage-transitions.css scripts package.json
git commit -m "refactor: unify homepage transition timeline ownership"
```

Expected: commit succeeds when changes have not already been committed task by task. If all task commits already exist, this command reports no staged changes.

## Rollback Plan

If the refactor causes a critical runtime failure:

1. Revert the final integration commit or the task commits in reverse order.
2. Keep `docs/homepage-transition-root-cause.md` and this plan.
3. Re-run `npm run verify:all` after reverting.
4. Restore the branch to the last passing commit before attempting a smaller migration.
