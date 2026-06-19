# Transition Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract shared transition-route runtime utilities and migrate one small existing route (`ph-scroll.js`) as a pilot without changing visual behavior.

**Architecture:** This is Phase 2A/2B of the transition work, not the homepage chapter-transition registry. Add focused shared ES modules for library loading, scroll-scene setup, and video scrubbing; then migrate the smallest route to prove the contract before touching larger routes like `figure2`, `ttg`, `aod`, or `crane`.

**Tech Stack:** Vanilla ES modules, existing GSAP + ScrollTrigger + Lenis vendors, existing `initSmoothScroll()`, static HTML pages, Node-based structure verification.

---

## Scope Boundary

Implement now:

- Add shared runtime helper modules under `js/transitions/`.
- Migrate `js/ph-scroll.js` to those helpers.
- Add `scripts/check-transition-runtime.mjs`.
- Add `npm run verify:transition-runtime`.
- Keep `ph.html` unchanged.
- Keep `figure2`, `ttg`, `aod`, `crane`, `figure3`, and homepage runtime code unchanged.

Do not implement now:

- Do not add homepage `section-sync`.
- Do not add a chapter transition registry.
- Do not migrate `figure2-scroll.js`, `ttg-scroll.js`, `aod-scroll.js`, `crane-scroll.js`, or `figure3-transition.js`.
- Do not change any visible copy, CSS art direction, asset paths, or page layouts.
- Do not use Playwright.

## File Structure

- Create `js/transitions/load-libraries.js`
  - Owns reusable GSAP / ScrollTrigger / Lenis script loading for transition routes.
- Create `js/transitions/video-scrub.js`
  - Owns common muted inline scrub-video preparation, metadata wait, duration fallback, and progress-to-time seeking.
- Create `js/transitions/scroll-scene.js`
  - Owns shared scroll-scene setup around `initSmoothScroll()` and `ScrollTrigger.create()`.
- Modify `js/ph-scroll.js`
  - Pilot route using the shared helpers while preserving its current progress math and visual CSS variables.
- Create `scripts/check-transition-runtime.mjs`
  - Verifies helper exports, `ph-scroll.js` migration, and the package script.
- Modify `package.json`
  - Adds `verify:transition-runtime`.

## Task 0: Dirty Worktree Preflight

**Files:**
- Read-only check

- [ ] **Step 1: Inspect branch and dirty files**

Run:

```bash
git status --short --branch
```

Expected: output may include existing unrelated dirty files. Record them. Do not stage unrelated files.

- [ ] **Step 2: Verify Phase 2A inputs are not already modified**

Run:

```bash
git status --short -- js/transitions js/ph-scroll.js scripts/check-transition-runtime.mjs package.json
```

Expected before editing:

```txt
```

If any of these files are already modified, inspect them before editing and preserve user changes.

- [ ] **Step 3: Confirm current PH behavior constants**

Run:

```bash
rg -n "TRANSITION_DURATION_SECONDS|VIDEO_DURATION_FALLBACK|--ph-progress|--ph-video-opacity|data-ph-stage|data-ph-alpha-video|lerp: 0.08|wheelMultiplier: 0.82|syncTouch: false" js/ph-scroll.js ph.html
```

Expected output includes:

```txt
js/ph-scroll.js:...TRANSITION_DURATION_SECONDS = 2
js/ph-scroll.js:...VIDEO_DURATION_FALLBACK = 4.04
js/ph-scroll.js:...--ph-progress
js/ph-scroll.js:...--ph-video-opacity
js/ph-scroll.js:...lerp: 0.08
js/ph-scroll.js:...wheelMultiplier: 0.82
js/ph-scroll.js:...syncTouch: false
ph.html:...data-ph-stage
ph.html:...data-ph-alpha-video
```

## Task 1: Add Shared Library Loader

**Files:**
- Create: `js/transitions/load-libraries.js`

- [ ] **Step 1: Create the transition loader module**

Create `js/transitions/load-libraries.js` with this complete content:

```js
export const DEFAULT_TRANSITION_LIBRARY_SOURCES = {
  gsap: 'js/vendor/gsap.min.js',
  scrollTrigger: 'js/vendor/ScrollTrigger.min.js',
  lenis: 'js/vendor/lenis.min.js'
};

const scriptPromises = new Map();

function findScript(src) {
  return [...document.scripts].find((script) => {
    const scriptSrc = script.getAttribute('src') || '';
    return scriptSrc === src || script.src.endsWith(src);
  });
}

function isScriptLoaded(script) {
  return script.dataset.transitionRuntimeLoaded === 'true';
}

export function loadScript(src, timeout = 10000) {
  const existing = findScript(src);
  if (existing && isScriptLoaded(existing)) return Promise.resolve();
  if (scriptPromises.has(src)) return scriptPromises.get(src);

  const promise = new Promise((resolve, reject) => {
    const script = existing || document.createElement('script');
    let settled = false;
    const timer = window.setTimeout(() => finish(false, new Error(`Timed out loading ${src}`)), timeout);

    function finish(ok, value) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (ok) script.dataset.transitionRuntimeLoaded = 'true';
      if (!ok && !existing) script.remove();
      script.onload = null;
      script.onerror = null;
      ok ? resolve(value) : reject(value);
    }

    if (!existing) {
      script.src = src;
      script.async = false;
    }

    script.onload = () => finish(true);
    script.onerror = () => finish(false, new Error(`Failed to load ${src}`));
    if (!existing) document.head.appendChild(script);
  });

  scriptPromises.set(src, promise);
  promise.then(
    () => scriptPromises.delete(src),
    () => scriptPromises.delete(src)
  );
  return promise;
}

export async function loadTransitionLibraries({
  sources = DEFAULT_TRANSITION_LIBRARY_SOURCES,
  requireLenis = false,
  logger = console
} = {}) {
  if (!window.gsap) await loadScript(sources.gsap);
  if (!window.ScrollTrigger) await loadScript(sources.scrollTrigger);

  try {
    if (!window.Lenis && sources.lenis) await loadScript(sources.lenis);
  } catch (error) {
    if (requireLenis) throw error;
    logger?.warn?.('Lenis unavailable, keeping native scroll.', error);
  }

  if (!window.gsap || !window.ScrollTrigger) {
    throw new Error('GSAP ScrollTrigger unavailable.');
  }

  return {
    gsap: window.gsap,
    ScrollTrigger: window.ScrollTrigger,
    Lenis: window.Lenis || null
  };
}
```

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check js/transitions/load-libraries.js
```

Expected:

```txt
```

## Task 2: Add Shared Video Scrub Helpers

**Files:**
- Create: `js/transitions/video-scrub.js`

- [ ] **Step 1: Create the video scrub module**

Create `js/transitions/video-scrub.js` with this complete content:

```js
const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);

export function prepareScrubVideo(video, { source = null, load = true } = {}) {
  if (!video) return null;

  if (source && video.getAttribute('src') !== source) {
    video.setAttribute('src', source);
  }

  video.muted = true;
  video.loop = false;
  video.autoplay = false;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.pause();

  if (load && video.readyState < 1) video.load();
  return video;
}

export function waitForVideoMetadata(video, { timeoutMs = 1200 } = {}) {
  if (!video || video.readyState >= 1) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener('loadedmetadata', finish);
      video.removeEventListener('canplay', finish);
      video.removeEventListener('error', finish);
      resolve();
    };

    const timer = window.setTimeout(finish, timeoutMs);
    video.addEventListener('loadedmetadata', finish, { once: true });
    video.addEventListener('canplay', finish, { once: true });
    video.addEventListener('error', finish, { once: true });
    video.load();
  });
}

export function getVideoDuration(video, { fallbackSeconds = 1 } = {}) {
  return Number.isFinite(video?.duration) && video.duration > 0 ? video.duration : fallbackSeconds;
}

export function seekVideoToProgress(video, progress, {
  fallbackSeconds = 1,
  endPaddingSeconds = 0.02,
  minDeltaSeconds = 0.016
} = {}) {
  if (!video || video.readyState < 1) return false;

  const duration = getVideoDuration(video, { fallbackSeconds });
  const safeProgress = clamp(progress);
  const maxTime = Math.max(0, duration - endPaddingSeconds);
  const targetTime = Math.min(maxTime, Math.max(0, safeProgress * duration));

  if (Math.abs(video.currentTime - targetTime) < minDeltaSeconds) return false;

  try {
    video.currentTime = targetTime;
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check js/transitions/video-scrub.js
```

Expected:

```txt
```

## Task 3: Add Shared Scroll Scene Helpers

**Files:**
- Create: `js/transitions/scroll-scene.js`

- [ ] **Step 1: Create the scroll scene module**

Create `js/transitions/scroll-scene.js` with this complete content:

```js
import { initSmoothScroll } from '../ui/smooth-scroll.js';

export function createReduceMotionState(query = '(prefers-reduced-motion: reduce)') {
  return Boolean(window.matchMedia?.(query)?.matches);
}

export function initTransitionScrollRuntime({
  root = document.documentElement,
  body = document.body,
  reduceMotion = false,
  smoothOptions = {},
  gsap = window.gsap,
  ScrollTrigger = window.ScrollTrigger
} = {}) {
  if (!gsap || !ScrollTrigger) {
    throw new Error('Transition scroll runtime requires GSAP and ScrollTrigger.');
  }

  gsap.registerPlugin(ScrollTrigger);

  const scrollRuntime = initSmoothScroll({
    root,
    body,
    reduceMotion,
    options: smoothOptions
  });

  return {
    gsap,
    ScrollTrigger,
    scrollRuntime,
    destroy() {
      scrollRuntime?.destroy?.();
    }
  };
}

export function createScrollProgressTrigger({
  ScrollTrigger = window.ScrollTrigger,
  trigger,
  start = 'top top',
  end = 'bottom bottom',
  invalidateOnRefresh = true,
  onUpdate = () => {},
  onLeave = () => {},
  onLeaveBack = () => {}
} = {}) {
  if (!ScrollTrigger || !trigger) {
    return {
      instance: null,
      destroy() {}
    };
  }

  const instance = ScrollTrigger.create({
    trigger,
    start,
    end,
    invalidateOnRefresh,
    onUpdate,
    onLeave,
    onLeaveBack
  });

  return {
    instance,
    destroy() {
      instance?.kill?.();
    }
  };
}
```

- [ ] **Step 2: Run syntax check**

Run:

```bash
node --check js/transitions/scroll-scene.js
```

Expected:

```txt
```

## Task 4: Migrate PH Route To Shared Runtime

**Files:**
- Modify: `js/ph-scroll.js`

- [ ] **Step 1: Replace PH scroll script**

Replace the complete content of `js/ph-scroll.js` with:

```js
import { loadTransitionLibraries } from './transitions/load-libraries.js';
import {
  createReduceMotionState,
  createScrollProgressTrigger,
  initTransitionScrollRuntime
} from './transitions/scroll-scene.js';
import {
  prepareScrubVideo,
  seekVideoToProgress,
  waitForVideoMetadata
} from './transitions/video-scrub.js';

const TRANSITION_DURATION_SECONDS = 2;
const VIDEO_DURATION_FALLBACK = 4.04;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const smoothStep = (value) => value * value * (3 - 2 * value);

const root = document.documentElement;
const body = document.body;
const stage = document.querySelector('[data-ph-stage]');
const alphaVideo = document.querySelector('[data-ph-alpha-video]');
const reduceMotion = createReduceMotionState();

let scrollScene = { destroy() {} };
let scrollTrigger = { destroy() {} };
let progressTween = null;
const playhead = { raw: 0 };

function setProgress(progress) {
  const p = clamp(progress, 0, 1);
  root.style.setProperty('--ph-progress', p.toFixed(4));
  root.style.setProperty('--ph-video-opacity', (1 - smoothStep(clamp((p - 0.98) / 0.02, 0, 1))).toFixed(4));
  seekVideoToProgress(alphaVideo, p, {
    fallbackSeconds: VIDEO_DURATION_FALLBACK,
    endPaddingSeconds: 0.02,
    minDeltaSeconds: 0.016
  });
}

function tweenToRawProgress(rawProgress) {
  const { gsap } = window;
  const target = clamp(rawProgress, 0, 1);
  const distance = Math.abs(target - playhead.raw);

  progressTween?.kill?.();
  progressTween = null;

  if (distance < 0.001 || !gsap) {
    playhead.raw = target;
    setProgress(playhead.raw);
    return;
  }

  progressTween = gsap.to(playhead, {
    raw: target,
    duration: Math.max(0.06, distance * TRANSITION_DURATION_SECONDS),
    ease: 'none',
    overwrite: true,
    onUpdate: () => setProgress(playhead.raw),
    onComplete: () => {
      playhead.raw = target;
      progressTween = null;
      setProgress(playhead.raw);
    }
  });
}

function resetTransition() {
  tweenToRawProgress(0);
}

async function init() {
  if (!stage || !alphaVideo) return;

  prepareScrubVideo(alphaVideo);

  if (reduceMotion) {
    playhead.raw = 1;
    setProgress(1);
    waitForVideoMetadata(alphaVideo).then(() => setProgress(1));
    return;
  }

  await waitForVideoMetadata(alphaVideo);

  const { gsap, ScrollTrigger } = await loadTransitionLibraries();
  scrollScene = initTransitionScrollRuntime({
    root,
    body,
    reduceMotion,
    gsap,
    ScrollTrigger,
    smoothOptions: {
      lerp: 0.08,
      wheelMultiplier: 0.82,
      syncTouch: false
    }
  });

  setProgress(0);

  scrollTrigger = createScrollProgressTrigger({
    ScrollTrigger,
    trigger: stage,
    start: 'top top',
    end: 'bottom bottom',
    invalidateOnRefresh: true,
    onUpdate: (self) => tweenToRawProgress(self.progress),
    onLeave: () => tweenToRawProgress(1),
    onLeaveBack: resetTransition
  });

  ScrollTrigger.refresh();
}

init().catch((error) => {
  console.warn('PH transition failed to initialize.', error);
  setProgress(0);
});

window.addEventListener('pagehide', () => {
  progressTween?.kill?.();
  scrollTrigger?.destroy?.();
  scrollScene?.destroy?.();
});
```

- [ ] **Step 2: Run PH syntax check**

Run:

```bash
node --check js/ph-scroll.js
```

Expected:

```txt
```

## Task 5: Add Transition Runtime Verification

**Files:**
- Create: `scripts/check-transition-runtime.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create the verification script**

Create `scripts/check-transition-runtime.mjs` with this complete content:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const packageJson = JSON.parse(read('package.json'));
const phScroll = read('js/ph-scroll.js');
const phHtml = read('ph.html');
const loadLibrariesSource = read('js/transitions/load-libraries.js');
const videoScrubSource = read('js/transitions/video-scrub.js');
const scrollSceneSource = read('js/transitions/scroll-scene.js');

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message);
}

assertIncludes(loadLibrariesSource, 'export function loadScript', 'load-libraries exports loadScript');
assertIncludes(loadLibrariesSource, 'export async function loadTransitionLibraries', 'load-libraries exports loadTransitionLibraries');
assertIncludes(loadLibrariesSource, 'const scriptPromises = new Map()', 'load-libraries caches script promises');
assertIncludes(videoScrubSource, 'export function prepareScrubVideo', 'video-scrub exports prepareScrubVideo');
assertIncludes(videoScrubSource, 'export function waitForVideoMetadata', 'video-scrub exports waitForVideoMetadata');
assertIncludes(videoScrubSource, 'export function seekVideoToProgress', 'video-scrub exports seekVideoToProgress');
assertIncludes(scrollSceneSource, 'export function createReduceMotionState', 'scroll-scene exports createReduceMotionState');
assertIncludes(scrollSceneSource, 'export function initTransitionScrollRuntime', 'scroll-scene exports initTransitionScrollRuntime');
assertIncludes(scrollSceneSource, 'export function createScrollProgressTrigger', 'scroll-scene exports createScrollProgressTrigger');

assertIncludes(phScroll, "from './transitions/load-libraries.js'", 'ph-scroll imports shared library loader');
assertIncludes(phScroll, "from './transitions/scroll-scene.js'", 'ph-scroll imports shared scroll scene helpers');
assertIncludes(phScroll, "from './transitions/video-scrub.js'", 'ph-scroll imports shared video scrub helpers');
assert.doesNotMatch(phScroll, /function loadScript|async function loadRequiredLibraries/, 'ph-scroll must not keep local script loader');
assert.doesNotMatch(phScroll, /function prepareVideo|function waitForVideoMetadata|function getVideoDuration|function seekVideo\(/, 'ph-scroll must not keep local video helpers');
assert.match(
  phScroll,
  /if \(reduceMotion\) \{\s+playhead\.raw = 1;\s+setProgress\(1\);\s+waitForVideoMetadata\(alphaVideo\)\.then\(\(\) => setProgress\(1\)\);\s+return;\s+\}\s+await waitForVideoMetadata\(alphaVideo\);/s,
  'ph-scroll must not block reduced-motion final state on metadata wait'
);
assertIncludes(phScroll, 'TRANSITION_DURATION_SECONDS = 2', 'ph-scroll keeps current transition duration');
assertIncludes(phScroll, 'VIDEO_DURATION_FALLBACK = 4.04', 'ph-scroll keeps current video fallback duration');
assert.match(
  phHtml,
  /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']js\/ph-scroll\.js["'])[^>]*><\/script>/,
  'ph.html must load js/ph-scroll.js as a module'
);
assert.equal(packageJson.scripts['verify:transition-runtime'], 'node scripts/check-transition-runtime.mjs');

console.log('Transition runtime structure looks good.');
```

- [ ] **Step 2: Add package script**

In `package.json`, add only this entry to the existing `scripts` object after `verify:section-transitions`. Do not delete, reorder, or rewrite unrelated scripts.

```json
"verify:transition-runtime": "node scripts/check-transition-runtime.mjs"
```

Expected: the existing `scripts` object still contains its previous entries and also contains:

```json
"verify:transition-runtime": "node scripts/check-transition-runtime.mjs"
```

- [ ] **Step 3: Run verification script syntax check**

Run:

```bash
node --check scripts/check-transition-runtime.mjs
```

Expected:

```txt
```

- [ ] **Step 4: Run transition runtime verification**

Run:

```bash
npm run verify:transition-runtime
```

Expected final line:

```txt
Transition runtime structure looks good.
```

## Task 6: Full Static Verification

**Files:**
- Verify all Phase 2A/2B changes.

- [ ] **Step 1: Run syntax checks**

Run:

```bash
node --check js/transitions/load-libraries.js
node --check js/transitions/video-scrub.js
node --check js/transitions/scroll-scene.js
node --check js/ph-scroll.js
node --check scripts/check-transition-runtime.mjs
```

Expected:

```txt
```

- [ ] **Step 2: Run existing verification**

Run:

```bash
npm run verify:copy
npm run verify:ink-modules
npm run verify:scroll-modules
npm run verify:section-transitions
npm run verify:transition-runtime
```

Expected final lines include:

```txt
Copy aligns with /Users/aitoshuu/Downloads/tongyeme/index.html.
Ink module structure looks good.
Scroll integration structure looks good.
Section transition contract looks good.
Transition runtime structure looks good.
```

- [ ] **Step 3: Check whitespace**

Run:

```bash
git diff --check -- js/transitions/load-libraries.js js/transitions/video-scrub.js js/transitions/scroll-scene.js js/ph-scroll.js scripts/check-transition-runtime.mjs package.json
```

Expected:

```txt
```

- [ ] **Step 4: Confirm untouched routes remain untouched**

Run:

```bash
git diff --name-only -- ph.html js/figure2-scroll.js js/ttg-scroll.js js/aod-scroll.js js/crane-scroll.js js/figure3-transition.js js/main.js js/sections/hero.js
```

Expected:

```txt
```

## Task 7: Manual PH Route QA

**Files:**
- Manual browser inspection only

- [ ] **Step 1: Start static server**

Run:

```bash
npm run dev
```

Expected: server prints a local URL. If another process already serves the site, use the existing URL and do not start a second server.

- [ ] **Step 2: Open PH route**

Open the local server URL printed in Step 1, with the path changed to:

```txt
/ph.html
```

Expected:

```txt
- Page loads without console errors from ph-scroll.js.
- The PH scene starts at progress 0.
- Scrolling advances the alpha video scrub.
- Leaving the scroll section reaches progress 1.
- Scrolling back resets the transition toward progress 0.
```

- [ ] **Step 3: Reduced-motion PH check**

Enable reduced motion in the browser or OS and reload `ph.html`.

Expected:

```txt
- Page remains readable.
- PH progress resolves to the final state.
- No GSAP/ScrollTrigger initialization error appears.
```

- [ ] **Step 4: Vendor failure fallback check**

Use browser DevTools request blocking to block `js/vendor/gsap.min.js`, then reload `ph.html`.

Expected:

```txt
- Page remains readable at the PH start state.
- Console shows the existing PH initialization warning.
- No blank page or uncaught module syntax error appears.
```

## Task 8: Commit Phase 2A/2B Pilot

**Files:**
- Stage only Phase 2A/2B files.

- [ ] **Step 1: Inspect final status**

Run:

```bash
git status --short --branch
```

Expected: unrelated dirty files may remain. Only the files listed in Step 2 should be staged.

- [ ] **Step 2: Stage exact files**

Run:

```bash
git add js/transitions/load-libraries.js js/transitions/video-scrub.js js/transitions/scroll-scene.js js/ph-scroll.js scripts/check-transition-runtime.mjs package.json docs/superpowers/plans/2026-06-19-transition-runtime-foundation.md
```

Expected: only listed files are staged.

- [ ] **Step 3: Confirm staged files**

Run:

```bash
git diff --cached --name-only
```

Expected output:

```txt
docs/superpowers/plans/2026-06-19-transition-runtime-foundation.md
js/ph-scroll.js
js/transitions/load-libraries.js
js/transitions/scroll-scene.js
js/transitions/video-scrub.js
package.json
scripts/check-transition-runtime.mjs
```

- [ ] **Step 4: Commit**

Run:

```bash
git commit -m "refactor: add transition runtime foundation"
```

Expected: commit succeeds.

- [ ] **Step 5: Push only when requested**

Do not push as part of this plan unless the user explicitly asks for push.

## Acceptance Criteria

- `js/transitions/load-libraries.js`, `video-scrub.js`, and `scroll-scene.js` exist and pass syntax checks.
- `js/ph-scroll.js` imports all three shared helper modules.
- `js/ph-scroll.js` no longer contains local `loadScript`, `loadRequiredLibraries`, `prepareVideo`, `waitForVideoMetadata`, `getVideoDuration`, or `seekVideo` helper definitions.
- Reduced-motion PH initialization sets the final CSS state before waiting for video metadata.
- `ph.html` is unchanged.
- `ph.html` still loads `js/ph-scroll.js` with `type="module"`.
- `figure2`, `ttg`, `aod`, `crane`, `figure3`, and homepage scripts are unchanged.
- `npm run verify:transition-runtime` passes.
- Existing `verify:copy`, `verify:ink-modules`, `verify:scroll-modules`, and `verify:section-transitions` still pass.
- Manual PH QA confirms no visible regression in normal, reduced-motion, and vendor-failure fallback modes.

## Follow-Up Plan Trigger

Create a separate migration plan only after this pilot passes manual QA. The next safest route candidates are:

1. `js/figure3-transition.js` because it is small and uses one scrub video.
2. `js/crane-scroll.js` because it has two transition videos but clear scene boundaries.
3. `js/aod-scroll.js` because it has custom playback/tween logic.
4. `js/ttg-scroll.js` and `js/figure2-scroll.js` last because they are larger and more experimental.
