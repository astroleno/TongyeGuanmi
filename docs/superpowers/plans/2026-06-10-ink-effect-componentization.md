# Ink Effect Componentization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将当前 loader/hero 水墨特效拆成可复用 ES Modules，并新增 `data-ink-reveal` 关键词复用入口，让重点词可以复用品牌墨滴动效，同时避免每个正文关键词都创建重型 WebGL canvas。

**Architecture:** 保持静态站点，不引入框架和构建链。先用 legacy bridge 保护现状，再逐步把文字墨滴、场景水墨转场、UI 交互和 hero 编排拆到独立模块；关键词默认使用轻量 CSS/IntersectionObserver 效果，只有少量大字通过 WebGL 文字墨滴效果增强。

**Tech Stack:** Vanilla ES Modules, WebGL 1, Canvas 2D, GSAP + ScrollTrigger CDN, IntersectionObserver, CSS mask/pseudo-elements, Node.js verification script.

---

## Current Baseline

- `index.html` 当前使用 `<script src="js/main.js"></script>`，还不是 ES module。
- `js/main.js` 当前约 2254 行，混合了 loader 墨滴、hero 水墨转场、滚动控制、视频同步、WebGL shader、UI reveal、magnetic/tilt。
- `css/styles.css` 当前约 1397 行，loader 与 hero canvas 样式已存在，但没有可复用关键词样式文件。
- `package.json` 当前只有 `dev` 和 `dev:web`，没有结构化验证脚本。

## Target File Structure

```txt
index.html
package.json
scripts/
  check-ink-modules.mjs
css/
  styles.css
  components/
    ink-keyword.css
js/
  main.js
  legacy-main.js                 # bridge 阶段临时存在，最终删除
  site/
    runtime.js
  effects/
    ink-text-reveal.js
    ink-scene-transition.js
  components/
    ink-keyword.js
  ui/
    cursor-glow.js
    magnetic-tilt.js
    page-progress.js
    reveal.js
  sections/
    hero.js
```

## Public Contracts

```js
// js/effects/ink-text-reveal.js
export function createInkTextReveal(canvas, options = {}) {}
export function initLoaderInkReveal(options = {}) {}

// js/effects/ink-scene-transition.js
export function createInkSceneTransition(canvas, options = {}) {}

// js/components/ink-keyword.js
export function initInkKeywords(options = {}) {}

// js/site/runtime.js
export function createSiteRuntime(options = {}) {}

// js/sections/hero.js
export function initLayeredHero(options = {}) {}
export function initFallbackParallax(options = {}) {}
```

## Task 1: Create ES Module Bridge And Verification Script

**Files:**
- Modify: `index.html`
- Modify: `package.json`
- Move: `js/main.js` -> `js/legacy-main.js`
- Create: `js/main.js`
- Create: `scripts/check-ink-modules.mjs`

- [x] **Step 1: Move the current page script without editing its contents**

Run:

```bash
git mv js/main.js js/legacy-main.js
```

Expected: `js/legacy-main.js` contains the existing IIFE unchanged.

- [x] **Step 2: Create the module bridge**

Create `js/main.js`:

```js
import './legacy-main.js';
```

- [x] **Step 3: Change the script tag to module mode**

In `index.html`, replace the final script tag with:

```html
  <script type="module" src="js/main.js"></script>
```

- [x] **Step 4: Add structure verification**

Create `scripts/check-ink-modules.mjs`:

```js
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));
const lineCount = (text) => text.split('\n').length;

const indexHtml = read('index.html');
assert.match(
  indexHtml,
  /<script\s+type="module"\s+src="js\/main\.js"><\/script>/,
  'index.html must load js/main.js as an ES module'
);

const mainJs = read('js/main.js');
const usesLegacyBridge = mainJs.includes("import './legacy-main.js';");
const usesFinalBoot = [
  "from './site/runtime.js'",
  "from './effects/ink-text-reveal.js'",
  "from './components/ink-keyword.js'",
  "from './sections/hero.js'"
].every((needle) => mainJs.includes(needle));

assert.ok(
  usesLegacyBridge || usesFinalBoot,
  'js/main.js must be either the temporary legacy bridge or the final module bootstrap'
);

if (!usesLegacyBridge) {
  assert.ok(lineCount(mainJs) <= 120, 'final js/main.js should stay under 120 lines');
  assert.ok(!exists('js/legacy-main.js'), 'js/legacy-main.js should be removed after final extraction');
}

if (exists('js/effects/ink-text-reveal.js')) {
  const inkText = read('js/effects/ink-text-reveal.js');
  assert.match(inkText, /export function createInkTextReveal/, 'ink text module must export createInkTextReveal');
  assert.match(inkText, /export function initLoaderInkReveal/, 'ink text module must export initLoaderInkReveal');
}

if (exists('js/effects/ink-scene-transition.js')) {
  const sceneInk = read('js/effects/ink-scene-transition.js');
  assert.match(sceneInk, /export function createInkSceneTransition/, 'scene ink module must export createInkSceneTransition');
}

if (exists('js/components/ink-keyword.js')) {
  const keyword = read('js/components/ink-keyword.js');
  assert.match(keyword, /export function initInkKeywords/, 'keyword module must export initInkKeywords');
  assert.match(keyword, /\[data-ink-reveal\]/, 'keyword module must scan data-ink-reveal markers');
}

if (exists('css/components/ink-keyword.css')) {
  const css = read('css/components/ink-keyword.css');
  assert.match(css, /\.ink-keyword/, 'keyword CSS must define .ink-keyword');
  assert.match(css, /prefers-reduced-motion/, 'keyword CSS must handle reduced motion');
}

console.log('Ink module structure looks good.');
```

- [x] **Step 5: Add the npm verification script**

Update `package.json` scripts to:

```json
{
  "dev": "node scripts/serve-static-site.mjs",
  "dev:web": "node scripts/serve-static-site.mjs",
  "verify:ink-modules": "node scripts/check-ink-modules.mjs"
}
```

- [x] **Step 6: Verify bridge mode**

Run:

```bash
npm run verify:ink-modules
```

Expected:

```txt
Ink module structure looks good.
```

- [ ] **Step 7: Commit the bridge**

```bash
git add index.html package.json scripts/check-ink-modules.mjs js/main.js js/legacy-main.js
git commit -m "chore: prepare ink effect module bridge"
```

## Task 2: Extract Loader Text Ink Reveal

**Files:**
- Create: `js/effects/ink-text-reveal.js`
- Modify: `js/legacy-main.js`
- Modify: `scripts/check-ink-modules.mjs`

- [x] **Step 1: Create the text reveal module from the existing loader function**

Create `js/effects/ink-text-reveal.js` by moving the current `initLoaderInkReveal()` implementation out of `js/legacy-main.js`. Keep the current vertex shader, fragment shader, text mask canvas, char mask canvas, texture upload, resize, render, start, and stop logic byte-for-byte where possible.

Use this exported module boundary:

```js
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function createInkTextReveal(canvas, options = {}) {
  const settings = {
    text: options.text || '',
    texts: options.texts || null,
    reduceMotion: Boolean(options.reduceMotion),
    startDelayMs: options.startDelayMs ?? 0,
    revealMs: options.revealMs ?? 900,
    holdMs: options.holdMs ?? 160,
    gapMs: options.gapMs ?? 120,
    autoStart: options.autoStart ?? false,
    mode: options.mode || 'sequence',
    hostElement: options.hostElement || canvas?.closest?.('.loader-word') || null,
    textElements: options.textElements || [],
    onReadyAtChange: options.onReadyAtChange || (() => {}),
    onReadyClass: options.onReadyClass || (() => {}),
    onFallback: options.onFallback || (() => {})
  };

  // Move the existing WebGL setup and render lifecycle here.
  // Preserve the current shader math and texture generation behavior.
  // The returned object must expose play(), render(), stop(), and destroy().
}

export function initLoaderInkReveal({
  canvas = document.querySelector('[data-loader-ink-canvas]'),
  body = document.body,
  reduceMotion = false,
  phrases,
  timings,
  onReadyAtChange = () => {}
} = {}) {
  const loaderWord = canvas?.closest?.('.loader-word') || null;
  const textElements = loaderWord ? Array.from(loaderWord.querySelectorAll('.loader-marquee-text')) : [];

  const revealFallbackText = () => {
    onReadyAtChange(performance.now());
    body.classList.add('is-loader-ink-ready', 'is-loader-text-ready');
    if (canvas) canvas.style.display = 'none';
  };

  if (!canvas || reduceMotion) {
    revealFallbackText();
    return null;
  }

  return createInkTextReveal(canvas, {
    texts: phrases,
    reduceMotion,
    startDelayMs: timings.startDelayMs,
    revealMs: timings.revealMs,
    holdMs: timings.holdMs,
    gapMs: timings.gapMs,
    autoStart: true,
    mode: 'loader-sequence',
    hostElement: loaderWord,
    textElements,
    onFallback: revealFallbackText,
    onReadyClass: () => body.classList.add('is-loader-ink-ready'),
    onReadyAtChange
  });
}
```

During the move, replace direct references as follows:

```txt
LOADER_PHRASES              -> settings.texts
LOADER_START_DELAY_MS       -> settings.startDelayMs
LOADER_REVEAL_MS            -> settings.revealMs
LOADER_HOLD_MS              -> settings.holdMs
LOADER_GAP_MS               -> settings.gapMs
loaderReadyAt = value       -> settings.onReadyAtChange(value)
body.classList.add(...)     -> settings.onReadyClass()
loaderWord                  -> settings.hostElement
loaderTextEls               -> settings.textElements
```

- [x] **Step 2: Import the loader reveal module in the legacy file**

At the top of `js/legacy-main.js`, before the IIFE, add:

```js
import { initLoaderInkReveal } from './effects/ink-text-reveal.js';
```

Inside `js/legacy-main.js`, remove the old local `function initLoaderInkReveal() { ... }` definition and keep the existing bottom call site with this replacement:

```js
initLoaderInkReveal({
  body,
  reduceMotion,
  phrases: LOADER_PHRASES,
  timings: {
    startDelayMs: LOADER_START_DELAY_MS,
    revealMs: LOADER_REVEAL_MS,
    holdMs: LOADER_HOLD_MS,
    gapMs: LOADER_GAP_MS
  },
  onReadyAtChange(value) {
    loaderReadyAt = value;
  }
});
```

- [x] **Step 3: Verify exports and runtime smoke**

Run:

```bash
npm run verify:ink-modules
npm run dev
```

Expected:

```txt
Ink module structure looks good.
```

Manual browser check at the dev server URL:

```txt
Loader still reveals “同人于野” then “观象知幂”.
Loader exits.
Hero intro still starts after loader hidden.
No shader compile warning appears in the console.
```

- [ ] **Step 4: Commit loader extraction**

```bash
git add js/legacy-main.js js/effects/ink-text-reveal.js scripts/check-ink-modules.mjs
git commit -m "refactor: extract ink text reveal effect"
```

## Task 3: Add Reusable Keyword Ink Component

**Files:**
- Create: `js/components/ink-keyword.js`
- Create: `css/components/ink-keyword.css`
- Modify: `css/styles.css`
- Modify: `js/legacy-main.js`
- Modify: `index.html`

- [x] **Step 1: Add keyword component CSS**

Create `css/components/ink-keyword.css`:

```css
.ink-keyword {
  position: relative;
  display: inline-block;
  color: var(--ink);
  isolation: isolate;
}

.ink-keyword--light {
  text-shadow: 0 0 0 rgba(232, 213, 154, 0);
  transition: color .42s ease, text-shadow .42s ease;
}

.ink-keyword--light::after {
  content: "";
  position: absolute;
  left: -.12em;
  right: -.12em;
  bottom: .02em;
  height: .48em;
  z-index: -1;
  border-radius: 50%;
  background:
    radial-gradient(circle at 18% 60%, rgba(56, 166, 154, .28), transparent 56%),
    radial-gradient(circle at 74% 46%, rgba(232, 213, 154, .24), transparent 52%),
    linear-gradient(90deg, rgba(183, 91, 52, .10), rgba(56, 166, 154, .18));
  filter: blur(.04em);
  opacity: 0;
  transform: scaleX(.42) translateY(.08em);
  transform-origin: 12% 50%;
  transition: opacity .5s ease, transform .7s cubic-bezier(.2, .8, .2, 1);
}

.ink-keyword--light.is-ink-visible {
  color: #fff4d8;
  text-shadow: 0 10px 34px rgba(232, 213, 154, .14);
}

.ink-keyword--light.is-ink-visible::after {
  opacity: .72;
  transform: scaleX(1) translateY(.08em);
}

.ink-keyword--webgl {
  display: inline-grid;
  vertical-align: baseline;
}

.ink-keyword__text,
.ink-keyword__canvas {
  grid-area: 1 / 1;
}

.ink-keyword__text {
  opacity: .82;
}

.ink-keyword__canvas {
  width: calc(100% + .28em);
  height: calc(100% + .36em);
  margin: -.18em -.14em;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
}

.ink-keyword--webgl.is-ink-visible .ink-keyword__canvas {
  opacity: 1;
  visibility: visible;
}

@media (prefers-reduced-motion: reduce) {
  .ink-keyword,
  .ink-keyword--light,
  .ink-keyword--light::after {
    transition-duration: .001ms;
  }

  .ink-keyword--light::after {
    opacity: .34;
    transform: scaleX(1) translateY(.08em);
  }
}
```

- [x] **Step 2: Import the component stylesheet**

At the first line of `css/styles.css`, add:

```css
@import url("./components/ink-keyword.css");
```

- [x] **Step 3: Create the keyword scanner**

Create `js/components/ink-keyword.js`:

```js
import { createInkTextReveal } from '../effects/ink-text-reveal.js';

const SELECTOR = '[data-ink-reveal]';

export function initInkKeywords({
  root = document,
  selector = SELECTOR,
  reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
  maxWebglKeywords = 2
} = {}) {
  const elements = Array.from(root.querySelectorAll(selector))
    .filter((element) => element instanceof HTMLElement && element.dataset.inkBound !== 'true');

  let webglCount = 0;
  const instances = elements.map((element) => {
    element.dataset.inkBound = 'true';
    const wantsWebgl = (element.dataset.inkReveal || '').toLowerCase() === 'webgl';
    const canUseWebgl = wantsWebgl && !reduceMotion && webglCount < maxWebglKeywords;
    if (canUseWebgl) webglCount += 1;
    return canUseWebgl ? setupWebglKeyword(element) : setupLightKeyword(element);
  });

  if (!instances.length) {
    return { destroy() {} };
  }

  const play = (target) => {
    const instance = instances.find((item) => item.element === target);
    if (instance) instance.play();
  };

  let observer = null;
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        play(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.35, rootMargin: '0px 0px -8% 0px' });

    instances.forEach((instance) => observer.observe(instance.element));
  } else {
    instances.forEach((instance) => instance.play());
  }

  return {
    destroy() {
      if (observer) observer.disconnect();
      instances.forEach((instance) => instance.destroy());
    }
  };
}

function setupLightKeyword(element) {
  element.classList.add('ink-keyword', 'ink-keyword--light');

  return {
    element,
    play() {
      element.classList.add('is-ink-visible');
    },
    destroy() {
      element.classList.remove('ink-keyword', 'ink-keyword--light', 'is-ink-visible');
      delete element.dataset.inkBound;
    }
  };
}

function setupWebglKeyword(element) {
  const text = element.textContent.trim();
  element.classList.add('ink-keyword', 'ink-keyword--webgl');
  element.setAttribute('aria-label', text);

  const textSpan = document.createElement('span');
  textSpan.className = 'ink-keyword__text';
  textSpan.textContent = text;

  const canvas = document.createElement('canvas');
  canvas.className = 'ink-keyword__canvas';
  canvas.setAttribute('aria-hidden', 'true');

  element.textContent = '';
  element.append(textSpan, canvas);

  const effect = createInkTextReveal(canvas, {
    text,
    autoStart: false,
    mode: 'single-reveal',
    hostElement: element,
    textElements: [textSpan]
  });

  return {
    element,
    play() {
      element.classList.add('is-ink-visible');
      effect?.play?.({ text, mode: 'reveal' });
    },
    destroy() {
      effect?.destroy?.();
      element.textContent = text;
      element.classList.remove('ink-keyword', 'ink-keyword--webgl', 'is-ink-visible');
      element.removeAttribute('aria-label');
      delete element.dataset.inkBound;
    }
  };
}
```

- [x] **Step 4: Wire keyword initialization**

At the top of `js/legacy-main.js`, add:

```js
import { initInkKeywords } from './components/ink-keyword.js';
```

Near the existing bottom initialization block, after `initLoaderInkReveal(...)`, add:

```js
initInkKeywords({ reduceMotion, maxWebglKeywords: 2 });
```

- [x] **Step 5: Mark a small first batch of important words**

Apply `data-ink-reveal` sparingly. Use one WebGL keyword and several light keywords:

```html
<p class="large-copy"><span data-ink-reveal="webgl">AI</span> 不应只是少数专家的工具，而应成为更多人可以理解、使用和共创的能力。</p>
```

```html
<h3><span data-ink-reveal>共创</span></h3>
```

```html
<h3><span data-ink-reveal>成器</span></h3>
```

```html
<h2>我们把 <span data-ink-reveal>AI</span> 放回真实的业务语境。</h2>
```

Do not mark every card title in this first pass. The visual rhythm should remain selective.

- [x] **Step 6: Verify keyword module**

Run:

```bash
npm run verify:ink-modules
npm run dev
```

Manual browser check:

```txt
The selected words gain ink emphasis when entering the viewport.
Only the large manifesto “AI” creates a WebGL canvas.
Reduced-motion mode still shows readable emphasized words without animated reveal.
No layout shift is visible when a keyword becomes active.
```

- [ ] **Step 7: Commit keyword component**

```bash
git add index.html css/styles.css css/components/ink-keyword.css js/legacy-main.js js/components/ink-keyword.js
git commit -m "feat: add reusable ink keyword component"
```

## Task 4: Extract Hero Scene Ink Transition

**Files:**
- Create: `js/effects/ink-scene-transition.js`
- Modify: `js/legacy-main.js`
- Modify: `scripts/check-ink-modules.mjs`

- [x] **Step 1: Move the nested scene transition factory**

Create `js/effects/ink-scene-transition.js` by moving the current nested `createInkTransition(canvas, options = {})` function out of `initLayeredHero()`.

Export it under the new name:

```js
export function createInkSceneTransition(canvas, options = {}) {
  // Move the current createInkTransition body here.
}
```

Inside the moved function, keep the current scene shader, depth texture handling, figure video mask upload, render API, and `prewarm()` API unchanged. Replace references to outer constants with explicit options:

```txt
HERO_NEXT_SCENE_SRC     -> options.targetSrc || options.assets.nextSceneSrc
HERO_BACK_DEPTH_SRC     -> options.assets.backDepthSrc
HERO_MIDDLE_DEPTH_SRC   -> options.assets.middleDepthSrc
smoothStep(value)       -> local smoothStep(value)
```

Add this local helper inside `js/effects/ink-scene-transition.js`:

```js
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const smoothStep = (value) => value * value * (3 - 2 * value);
```

- [x] **Step 2: Import and call the extracted transition**

At the top of `js/legacy-main.js`, add:

```js
import { createInkSceneTransition } from './effects/ink-scene-transition.js';
```

Inside `initLayeredHero()`, replace:

```js
const introInkTransition = createInkTransition(introInkCanvas, {
```

with:

```js
const introInkTransition = createInkSceneTransition(introInkCanvas, {
  assets: {
    nextSceneSrc: HERO_NEXT_SCENE_SRC,
    backDepthSrc: HERO_BACK_DEPTH_SRC,
    middleDepthSrc: HERO_MIDDLE_DEPTH_SRC
  },
```

Replace:

```js
const inkTransition = createInkTransition(inkCanvas, {
```

with:

```js
const inkTransition = createInkSceneTransition(inkCanvas, {
  assets: {
    nextSceneSrc: HERO_NEXT_SCENE_SRC,
    backDepthSrc: HERO_BACK_DEPTH_SRC,
    middleDepthSrc: HERO_MIDDLE_DEPTH_SRC
  },
```

Then remove the old nested `function createInkTransition(canvas, options = {}) { ... }` from `js/legacy-main.js`.

- [x] **Step 3: Verify scene transition**

Run:

```bash
npm run verify:ink-modules
npm run dev
```

Manual browser check:

```txt
First hero background still appears through the intro ink pass.
Scroll transition to the second scene still renders.
Figure mask still affects the opening ink texture.
No WebGL context lost warning appears in the console.
```

- [ ] **Step 4: Commit scene transition extraction**

```bash
git add js/legacy-main.js js/effects/ink-scene-transition.js scripts/check-ink-modules.mjs
git commit -m "refactor: extract hero ink scene transition"
```

## Task 5: Split Runtime, UI, And Hero Modules

**Files:**
- Create: `js/site/runtime.js`
- Create: `js/ui/page-progress.js`
- Create: `js/ui/cursor-glow.js`
- Create: `js/ui/magnetic-tilt.js`
- Create: `js/ui/reveal.js`
- Create: `js/sections/hero.js`
- Modify: `js/main.js`
- Delete: `js/legacy-main.js`

- [x] **Step 1: Create site runtime**

Create `js/site/runtime.js`:

```js
export function createSiteRuntime({
  body = document.body,
  loaderSequenceTotalMs,
  heroLoaderExitMs,
  reduceMotion = false
} = {}) {
  let loaderReadyAt = performance.now() + loaderSequenceTotalMs;

  const setLoaderReadyAt = (value) => {
    loaderReadyAt = value;
  };

  const playLoaderExit = (loader, onComplete) => {
    if (!loader) {
      body.classList.add('is-loader-hidden');
      onComplete();
      return;
    }

    let finished = false;
    let safetyTimer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(safetyTimer);
      body.classList.add('is-loader-hidden');
      loader.style.visibility = 'hidden';
      onComplete();
    };

    safetyTimer = window.setTimeout(finish, heroLoaderExitMs + 420);
    onComplete();

    if (reduceMotion || !window.gsap) {
      loader.classList.add('loader-css-exit');
      window.setTimeout(finish, reduceMotion ? 90 : heroLoaderExitMs);
      return;
    }

    const { gsap } = window;
    const word = loader.querySelector('.loader-word');
    const movingText = gsap.utils.toArray(loader.querySelectorAll('.loader-marquee-text'));

    gsap.set([word, ...movingText].filter(Boolean), { animationPlayState: 'paused' });
    gsap.timeline({
      defaults: { ease: 'power3.inOut' },
      onComplete: finish
    })
      .set(loader, { pointerEvents: 'none' })
      .to(word, {
        autoAlpha: 0,
        duration: 0.24,
        ease: 'power2.out'
      }, 0)
      .to(loader, {
        autoAlpha: 0,
        duration: 0.30,
        ease: 'power2.out'
      }, 0.02)
      .to({}, { duration: 0.04 });
  };

  const markLoaded = (delay = 300) => {
    const loaderDelay = Math.max(0, delay, loaderReadyAt - performance.now() + 40);
    window.setTimeout(() => {
      const wasLoaded = body.classList.contains('is-loaded');
      body.classList.add('is-loaded');
      if (wasLoaded) return;
      window.dispatchEvent(new CustomEvent('site:loaded'));

      const loader = document.querySelector('.loading-screen');
      let hiddenDispatched = false;
      const dispatchHidden = () => {
        if (hiddenDispatched) return;
        hiddenDispatched = true;
        window.dispatchEvent(new CustomEvent('site:loader-hidden'));
      };
      playLoaderExit(loader, dispatchHidden);
    }, loaderDelay);
  };

  return {
    setLoaderReadyAt,
    markLoaded
  };
}
```

- [x] **Step 2: Move small UI functions**

Move the existing `updatePageProgress`, `initCursorGlow`, `initMagneticAndTilt`, `initVanillaReveal`, `initGsapTextAndUI`, and `initSmoothScroll` functions into the matching `js/ui/*.js` files.

Use these exports:

```js
// js/ui/page-progress.js
export function initPageProgress({ root = document.documentElement } = {}) {}
```

```js
// js/ui/cursor-glow.js
export function initCursorGlow({ root = document.documentElement, reduceMotion = false, lerp } = {}) {}
```

```js
// js/ui/magnetic-tilt.js
export function initMagneticAndTilt({ reduceMotion = false } = {}) {}
```

```js
// js/ui/reveal.js
export function initVanillaReveal() {}
export function initGsapTextAndUI({ root = document.documentElement } = {}) {}
export function initSmoothScroll() {}
```

Move the current function bodies unchanged except for passing `root`, `reduceMotion`, and `lerp` through options.

- [x] **Step 3: Move hero functions**

Create `js/sections/hero.js` and move the current `initFallbackParallax()` and `initLayeredHero()` bodies into it.

Use this export boundary:

```js
import { createInkSceneTransition } from '../effects/ink-scene-transition.js';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const lerp = (a, b, t) => a + (b - a) * t;

export function initFallbackParallax(options = {}) {
  // Move current initFallbackParallax body here and replace markLoaded(...) with options.runtime.markLoaded(...).
}

export function initLayeredHero(options = {}) {
  // Move current initLayeredHero body here and replace createInkTransition(...) with createInkSceneTransition(...).
}
```

Pass constants through `options.config`:

```js
const config = {
  heroVideoSrc: 'assets/figure1.webm',
  heroBackSceneSrc: 'assets/back1.png',
  heroNextSceneSrc: 'assets/back2.png',
  heroBackDepthSrc: 'assets/back1_depth.png',
  heroMiddleDepthSrc: 'assets/middle1_depth.png',
  heroIntroDurationSeconds: 2.7,
  heroTitleStartProgress: 0.78,
  heroSubtitleStartOffsetSeconds: 0.42,
  heroLoaderReadyDelayMs: 0,
  heroPreTransitionRangeVh: 50,
  heroSceneTransitionRangeVh: 100,
  heroVideoSegmentSeconds: 2,
  heroBackBaseScale: 1.10,
  heroBackScrollScaleDelta: 0.10,
  heroBackImageBoxScale: 1.12,
  heroMiddleBaseYVh: 1,
  heroMiddleBaseScale: 0.98,
  heroMiddleScrollScaleDelta: 0.32,
  heroFigureBaseYVh: 12,
  heroFigureBaseScale: 1
};
```

- [x] **Step 4: Replace bridge with final bootstrap**

Replace `js/main.js` with:

```js
import { initInkKeywords } from './components/ink-keyword.js';
import { initLoaderInkReveal } from './effects/ink-text-reveal.js';
import { createSiteRuntime } from './site/runtime.js';
import { initLayeredHero, initFallbackParallax } from './sections/hero.js';
import { initCursorGlow } from './ui/cursor-glow.js';
import { initMagneticAndTilt } from './ui/magnetic-tilt.js';
import { initPageProgress } from './ui/page-progress.js';
import { initGsapTextAndUI, initSmoothScroll, initVanillaReveal } from './ui/reveal.js';

const root = document.documentElement;
const body = document.body;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CDN = {
  gsap: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
  scrollTrigger: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js'
};

const LOADER_PHRASES = ['同人于野', '观象知幂'];
const LOADER_START_DELAY_MS = 180;
const LOADER_REVEAL_MS = 1150;
const LOADER_HOLD_MS = 220;
const LOADER_GAP_MS = 160;
const LOADER_PHRASE_MS = LOADER_REVEAL_MS + LOADER_HOLD_MS + LOADER_REVEAL_MS;
const LOADER_SEQUENCE_TOTAL_MS = LOADER_START_DELAY_MS + LOADER_PHRASE_MS * LOADER_PHRASES.length + LOADER_GAP_MS;
const HERO_LOADER_EXIT_MS = 420;

function loadScript(src, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const finish = (ok, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (!ok) {
        script.onerror = null;
        script.onload = null;
        script.remove();
      }
      ok ? resolve(value) : reject(value);
    };
    const timer = window.setTimeout(() => finish(false, new Error(`Timed out loading ${src}`)), timeout);
    script.src = src;
    script.async = false;
    script.onload = () => finish(true);
    script.onerror = () => finish(false, new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function loadRequiredLibraries() {
  if (!window.gsap) await loadScript(CDN.gsap);
  if (!window.ScrollTrigger) await loadScript(CDN.scrollTrigger);
  if (!window.gsap || !window.ScrollTrigger) {
    throw new Error('Required animation libraries are unavailable.');
  }
}

const runtime = createSiteRuntime({
  body,
  loaderSequenceTotalMs: LOADER_SEQUENCE_TOTAL_MS,
  heroLoaderExitMs: HERO_LOADER_EXIT_MS,
  reduceMotion
});

initPageProgress({ root });
initCursorGlow({ root, reduceMotion, lerp: (a, b, t) => a + (b - a) * t });
initLoaderInkReveal({
  body,
  reduceMotion,
  phrases: LOADER_PHRASES,
  timings: {
    startDelayMs: LOADER_START_DELAY_MS,
    revealMs: LOADER_REVEAL_MS,
    holdMs: LOADER_HOLD_MS,
    gapMs: LOADER_GAP_MS
  },
  onReadyAtChange: runtime.setLoaderReadyAt
});
initInkKeywords({ reduceMotion, maxWebglKeywords: 2 });

if (reduceMotion) {
  initMagneticAndTilt({ reduceMotion });
  initFallbackParallax({ root, reduceMotion, runtime });
  initVanillaReveal();
} else {
  loadRequiredLibraries()
    .then(() => {
      initSmoothScroll();
      initMagneticAndTilt({ reduceMotion });
      initGsapTextAndUI({ root });
      initLayeredHero({ root, body, runtime });
    })
    .catch((error) => {
      console.warn('CDN libraries unavailable, switching to fallback.', error);
      initMagneticAndTilt({ reduceMotion });
      initFallbackParallax({ root, reduceMotion, runtime });
      initVanillaReveal();
    });
}
```

- [x] **Step 5: Delete the bridge file**

Run:

```bash
git rm js/legacy-main.js
```

- [x] **Step 6: Verify final module bootstrap**

Run:

```bash
npm run verify:ink-modules
wc -l js/main.js js/effects/ink-text-reveal.js js/effects/ink-scene-transition.js js/components/ink-keyword.js js/sections/hero.js
npm run dev
```

Expected:

```txt
Ink module structure looks good.
js/main.js is under 120 lines.
js/legacy-main.js no longer exists.
```

Manual browser check:

```txt
Loader sequence works.
Hero intro works.
Hero scroll scene transition works.
Selected keywords animate once when entering viewport.
Fallback path works when GSAP CDN is blocked.
Reduced-motion path remains readable and avoids heavy animation.
```

- [ ] **Step 7: Commit final module split**

```bash
git add js css index.html package.json scripts/check-ink-modules.mjs
git commit -m "refactor: split site effects into focused modules"
```

## Task 6: Performance Guardrails And Documentation

**Files:**
- Modify: `docs/superpowers/plans/2026-06-10-ink-effect-componentization.md`
- Create: `docs/ink-effects-usage.md`
- Modify: `scripts/check-ink-modules.mjs`

- [x] **Step 1: Add usage documentation**

Create `docs/ink-effects-usage.md`:

````md
# Ink Effects Usage

## Markup

Use the light keyword treatment for normal emphasis:

```html
<span data-ink-reveal>共创</span>
```

Use the WebGL treatment only for large, high-impact words:

```html
<span data-ink-reveal="webgl">AI</span>
```

## Rules

- Use WebGL ink on loader, hero, section-scale headings, or one key word in a large statement.
- Use light ink for normal body keywords and card titles.
- Keep `maxWebglKeywords` at `2` unless a performance pass proves more is safe.
- Do not mark every repeated keyword on the page.
- Reduced-motion users must still see readable emphasis without animated reveal.

## Current Entry Points

- Loader text reveal: `js/effects/ink-text-reveal.js`
- Hero scene transition: `js/effects/ink-scene-transition.js`
- Keyword scanner: `js/components/ink-keyword.js`
- Keyword CSS: `css/components/ink-keyword.css`
````

- [x] **Step 2: Strengthen verification with usage constraints**

Append these checks to `scripts/check-ink-modules.mjs`:

```js
if (exists('index.html')) {
  const webglKeywordMatches = indexHtml.match(/data-ink-reveal="webgl"/g) || [];
  assert.ok(webglKeywordMatches.length <= 2, 'index.html should not declare more than two WebGL ink keywords');
}

if (exists('docs/ink-effects-usage.md')) {
  const usage = read('docs/ink-effects-usage.md');
  assert.match(usage, /data-ink-reveal/, 'ink effects usage doc must show the keyword marker');
  assert.match(usage, /maxWebglKeywords/, 'ink effects usage doc must explain the WebGL keyword budget');
}
```

- [x] **Step 3: Run final verification**

Run:

```bash
npm run verify:ink-modules
git status --short
```

Expected:

```txt
Ink module structure looks good.
Only the planned implementation files appear as modified or added.
```

- [ ] **Step 4: Commit docs and guardrails**

```bash
git add docs/ink-effects-usage.md docs/superpowers/plans/2026-06-10-ink-effect-componentization.md scripts/check-ink-modules.mjs
git commit -m "docs: document ink effect reuse guardrails"
```

## Acceptance Criteria

- `index.html` loads `js/main.js` with `type="module"`.
- `js/main.js` is only the bootstrap and stays under 120 lines after bridge removal.
- `js/legacy-main.js` is removed by the final module split.
- Loader text ink reveal still plays the current two-phrase sequence.
- Hero scene ink transition still renders the current background/depth/figure-mask effect.
- `data-ink-reveal` works for selected keywords.
- Default keyword effect is light and does not create WebGL contexts.
- WebGL keyword usage is capped at two instances on this page.
- Reduced-motion mode preserves readable emphasis.
- `npm run verify:ink-modules` passes.

## Self-Review

**Spec coverage:** The plan covers the review request: static site remains, `main.js` becomes a small ES module bootstrap, ink text reveal and hero scene transition become reusable effect modules, keywords use `data-ink-reveal`, heavy WebGL is budgeted, and docs explain reuse rules.

**No vague work items:** Newly authored files include concrete code. Existing shader-heavy functions are explicitly moved from current source without changing shader math, which is safer than retyping long GLSL blocks in the plan.

**Type consistency:** Export names are consistent across public contracts, verification script checks, imports, and final bootstrap: `createInkTextReveal`, `initLoaderInkReveal`, `createInkSceneTransition`, `initInkKeywords`, `createSiteRuntime`, `initLayeredHero`, `initFallbackParallax`.
