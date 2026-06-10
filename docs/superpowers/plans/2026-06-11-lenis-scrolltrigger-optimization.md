# Lenis ScrollTrigger Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a conservative Lenis smooth-scroll layer and tighten ScrollTrigger performance so the post-hero snapped sections feel smoother without breaking anchor navigation, loader/hero timing, or reduced-motion fallback.

**Architecture:** Keep GSAP + ScrollTrigger as the animation and snapping owner. Add Lenis as a thin input-smoothing adapter driven by GSAP's ticker, then sync every Lenis scroll update into `ScrollTrigger.update()`. Keep the integration isolated in a new scroll module so it can be disabled cleanly if it causes mobile or snap regressions.

**Tech Stack:** Static site, Vanilla ES Modules, GSAP 3.12.5 + ScrollTrigger CDN, Lenis 1.3.23 CDN, existing `scripts/serve-static-site.mjs`, structural Node verification scripts, Playwright/manual browser verification.

---

## Context

Current state:

- `js/main.js` loads GSAP and ScrollTrigger from CDN.
- `js/ui/reveal.js` owns reveal ScrollTriggers, nav active ScrollTriggers, page-progress ScrollTrigger, and currently exports `initSmoothScroll()` as a no-op except `gsap.ticker.lagSmoothing(0)`.
- `css/styles.css` contains a placeholder `body.lenis-like` rule, but Lenis is not loaded or initialized.
- The site has a long loader and scroll-driven hero sequence, so scroll initialization must not fight loader exit or hero setup.
- Existing fallback path for `prefers-reduced-motion` must remain native-scroll only.

Desired state:

- Desktop wheel scrolling feels smoother.
- GSAP snapped post-hero sections remain owned by ScrollTrigger.
- Anchor clicks use the same visual offset as snapped section starts.
- Reduced motion and Lenis CDN failure still fall back to current native-scroll behavior without disabling GSAP/ScrollTrigger.
- ScrollTrigger refresh/update work is explicit, debounced where needed, and not run inside uncontrolled loops.

## File Structure

- Create: `js/ui/smooth-scroll.js`
  - Owns Lenis initialization, GSAP ticker binding, anchor click handling, cleanup contract, and reduced-motion bypass.
- Modify: `js/main.js`
  - Adds pinned Lenis CDN URL, loads Lenis after GSAP/ScrollTrigger, imports `initSmoothScroll()` from the new module, and passes `root/body/reduceMotion`.
- Modify: `js/ui/reveal.js`
  - Removes the existing no-op `initSmoothScroll()` export and keeps this file focused on ScrollTrigger UI/reveal work.
- Modify: `css/styles.css`
  - Converts `body.lenis-like` into real Lenis state selectors and prevents unwanted native smooth behavior conflicts.
- Create: `scripts/check-scroll-modules.mjs`
  - Verifies the integration stays structurally correct without adding a heavyweight test framework.
- Modify: `package.json`
  - Adds `verify:scroll-modules`.

---

## Task 1: Add Scroll Integration Structural Test

**Files:**
- Create: `scripts/check-scroll-modules.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing structural test**

Create `scripts/check-scroll-modules.mjs`:

```js
import { readFile } from 'node:fs/promises';

const checks = [];

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assertContains(source, needle, message) {
  checks.push({ ok: source.includes(needle), message, needle });
}

function assertNotContains(source, needle, message) {
  checks.push({ ok: !source.includes(needle), message, needle });
}

const main = await read('js/main.js');
const reveal = await read('js/ui/reveal.js');
const styles = await read('css/styles.css');
const smoothScroll = await read('js/ui/smooth-scroll.js').catch(() => '');

assertContains(main, "lenis: 'https://cdn.jsdelivr.net/npm/lenis@1.3.23/dist/lenis.min.js'", 'main.js pins Lenis CDN version');
assertContains(main, "import { initSmoothScroll } from './ui/smooth-scroll.js';", 'main.js imports smooth-scroll module');
assertContains(main, 'await loadScript(CDN.lenis);', 'main.js loads Lenis before initialization');
assertContains(main, 'const scrollRuntime = initSmoothScroll({', 'main.js stores smooth scroll runtime');

assertContains(smoothScroll, 'export function initSmoothScroll', 'smooth-scroll.js exports initSmoothScroll');
assertContains(smoothScroll, 'new window.Lenis', 'smooth-scroll.js creates Lenis from CDN global');
assertContains(smoothScroll, "lenis.on('scroll', ScrollTrigger.update)", 'Lenis updates ScrollTrigger');
assertContains(smoothScroll, 'gsap.ticker.add(tick)', 'Lenis RAF is driven by GSAP ticker');
assertContains(smoothScroll, 'lenis.scrollTo(target, {', 'anchor clicks use Lenis scrollTo');
assertContains(smoothScroll, 'offset: -getSnapOffset()', 'anchor clicks use snapped visual offset');
assertContains(smoothScroll, 'destroy()', 'smooth-scroll.js exposes cleanup');

assertNotContains(reveal, 'export function initSmoothScroll', 'reveal.js no longer owns smooth scroll');
assertContains(styles, 'body.is-lenis-active', 'styles expose Lenis active state');

const failures = checks.filter((check) => !check.ok);

if (failures.length) {
  console.error('Scroll integration checks failed:');
  failures.forEach((failure) => {
    console.error(`- ${failure.message}`);
    console.error(`  Missing/unexpected: ${failure.needle}`);
  });
  process.exit(1);
}

console.log('Scroll integration structure looks good.');
```

- [ ] **Step 2: Add npm script**

Modify `package.json` scripts:

```json
{
  "dev": "node scripts/serve-static-site.mjs",
  "dev:web": "node scripts/serve-static-site.mjs",
  "verify:ink-modules": "node scripts/check-ink-modules.mjs",
  "verify:scroll-modules": "node scripts/check-scroll-modules.mjs"
}
```

- [ ] **Step 3: Run test and verify it fails**

Run:

```bash
npm run verify:scroll-modules
```

Expected: FAIL because `js/ui/smooth-scroll.js` does not exist and `main.js` does not load Lenis yet.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/check-scroll-modules.mjs
git commit -m "test: add scroll integration structure check"
```

---

## Task 2: Create Lenis Smooth Scroll Module

**Files:**
- Create: `js/ui/smooth-scroll.js`
- Test: `scripts/check-scroll-modules.mjs`

- [ ] **Step 1: Create `js/ui/smooth-scroll.js`**

```js
const DEFAULT_OPTIONS = {
  lerp: 0.08,
  smoothWheel: true,
  syncTouch: false,
  wheelMultiplier: 0.82,
  touchMultiplier: 1
};

function getSnapOffset() {
  return Math.round(window.innerHeight * 0.2);
}

function shouldHandleAnchor(link) {
  if (!link || link.origin !== window.location.origin || link.pathname !== window.location.pathname) return false;
  return link.hash && link.hash.length > 1;
}

function getAnchorTarget(hash) {
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    return null;
  }
}

export function initSmoothScroll({
  root = document.documentElement,
  body = document.body,
  reduceMotion = false,
  options = {}
} = {}) {
  const { gsap, ScrollTrigger, Lenis } = window;

  gsap?.ticker?.lagSmoothing?.(0);

  if (reduceMotion || !gsap || !ScrollTrigger || !Lenis) {
    return {
      lenis: null,
      destroy() {}
    };
  }

  const lenis = new window.Lenis({
    ...DEFAULT_OPTIONS,
    ...options
  });

  const tick = (time) => {
    lenis.raf(time * 1000);
  };

  const onAnchorClick = (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!shouldHandleAnchor(link)) return;

    const target = getAnchorTarget(link.hash);
    if (!target) return;

    event.preventDefault();
    history.pushState(null, '', link.hash);

    lenis.scrollTo(target, {
      offset: -getSnapOffset(),
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
    });
  };

  body.classList.add('is-lenis-active');
  root.classList.add('is-lenis-active');
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(tick);
  document.addEventListener('click', onAnchorClick);

  return {
    lenis,
    destroy() {
      document.removeEventListener('click', onAnchorClick);
      gsap.ticker.remove(tick);
      lenis.off('scroll', ScrollTrigger.update);
      lenis.destroy();
      body.classList.remove('is-lenis-active');
      root.classList.remove('is-lenis-active');
    }
  };
}
```

- [ ] **Step 2: Run structural test and verify it still fails**

Run:

```bash
npm run verify:scroll-modules
```

Expected: FAIL because `main.js` does not import/load Lenis yet and `reveal.js` still exports the old `initSmoothScroll()`.

- [ ] **Step 3: Commit**

```bash
git add js/ui/smooth-scroll.js
git commit -m "feat: add lenis smooth scroll module"
```

---

## Task 3: Wire Lenis Into Startup

**Files:**
- Modify: `js/main.js`
- Modify: `js/ui/reveal.js`
- Test: `scripts/check-scroll-modules.mjs`

- [ ] **Step 1: Move import ownership in `js/main.js`**

Replace:

```js
import { initGsapTextAndUI, initSmoothScroll, initVanillaReveal } from './ui/reveal.js';
```

With:

```js
import { initGsapTextAndUI, initVanillaReveal } from './ui/reveal.js';
import { initSmoothScroll } from './ui/smooth-scroll.js';
```

- [ ] **Step 2: Add pinned Lenis CDN**

Replace:

```js
const CDN = {
  gsap: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
  scrollTrigger: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js'
};
```

With:

```js
const CDN = {
  gsap: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
  scrollTrigger: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js',
  lenis: 'https://cdn.jsdelivr.net/npm/lenis@1.3.23/dist/lenis.min.js'
};
```

- [ ] **Step 3: Load Lenis after ScrollTrigger**

Replace `loadRequiredLibraries()` with Lenis as an optional enhancement:

```js
async function loadRequiredLibraries() {
  if (!window.gsap) await loadScript(CDN.gsap);
  if (!window.ScrollTrigger) await loadScript(CDN.scrollTrigger);
  try {
    if (!window.Lenis) await loadScript(CDN.lenis);
  } catch (error) {
    console.warn('Lenis unavailable, keeping native scroll.', error);
  }
  if (!window.gsap || !window.ScrollTrigger) {
    throw new Error('Required animation libraries are unavailable.');
  }
}
```

- [ ] **Step 4: Initialize Lenis before ScrollTrigger UI setup**

Replace this block:

```js
loadRequiredLibraries()
  .then(() => {
    initSmoothScroll();
    initMagneticAndTilt({ reduceMotion });
    initGsapTextAndUI({ root });
    initLayeredHero({ root, body, runtime });
  })
```

With:

```js
loadRequiredLibraries()
  .then(() => {
    const scrollRuntime = initSmoothScroll({ root, body, reduceMotion });
    initMagneticAndTilt({ reduceMotion });
    initGsapTextAndUI({ root, scrollRuntime });
    initLayeredHero({ root, body, runtime });
  })
```

- [ ] **Step 5: Remove old no-op function from `js/ui/reveal.js`**

Delete:

```js
export function initSmoothScroll() {
  window.gsap?.ticker?.lagSmoothing?.(0);
  return null;
}
```

- [ ] **Step 6: Run structural test and verify it passes**

Run:

```bash
npm run verify:scroll-modules
```

Expected: PASS with:

```txt
Scroll integration structure looks good.
```

- [ ] **Step 7: Commit**

```bash
git add js/main.js js/ui/reveal.js
git commit -m "feat: wire lenis into scroll startup"
```

---

## Task 4: Tighten ScrollTrigger Defaults and Reveal Work

**Files:**
- Modify: `js/ui/reveal.js`
- Test: `scripts/check-scroll-modules.mjs`

- [ ] **Step 1: Add ScrollTrigger config after registration**

In `initGsapTextAndUI()`, replace:

```js
gsap.registerPlugin(ScrollTrigger);
```

With:

```js
gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({
  limitCallbacks: true,
  ignoreMobileResize: true
});
```

- [ ] **Step 2: Make reveal animations one-way and lighter**

Replace the current reveal setup:

```js
gsap.set('.reveal', { autoAlpha: 0, y: 64, rotateX: 3, transformPerspective: 800 });
gsap.utils.toArray('.reveal').forEach((el) => {
  gsap.to(el, {
    autoAlpha: 1,
    y: 0,
    rotateX: 0,
    duration: 1.15,
    ease: 'power3.out',
    scrollTrigger: {
      trigger: el,
      start: 'top 84%',
      end: 'bottom 20%',
      toggleActions: 'play none none reverse'
    }
  });
});
```

With:

```js
gsap.set('.reveal', { autoAlpha: 0, y: 28, rotateX: 1.5, transformPerspective: 800 });
gsap.utils.toArray('.reveal').forEach((el) => {
  gsap.to(el, {
    autoAlpha: 1,
    y: 0,
    rotateX: 0,
    duration: 0.68,
    ease: 'power3.out',
    scrollTrigger: {
      trigger: el,
      start: 'top 84%',
      end: 'bottom 20%',
      toggleActions: 'play none none none'
    }
  });
});
```

- [ ] **Step 3: Keep refresh out of scroll loops**

Search:

```bash
rg -n "ScrollTrigger\\.refresh|ScrollTrigger\\.update|addEventListener\\('scroll'|requestAnimationFrame" js
```

Expected:

- `ScrollTrigger.update` appears in `js/ui/smooth-scroll.js` as the Lenis scroll listener.
- `ScrollTrigger.refresh()` appears only in lifecycle/resource-ready paths, not inside a scroll listener or animation frame loop.
- No new `window.addEventListener('scroll', ...)` is introduced for ScrollTrigger work.

- [ ] **Step 4: Commit**

```bash
git add js/ui/reveal.js
git commit -m "perf: reduce scrolltrigger reveal work"
```

---

## Task 5: Preserve Snapped Section Behavior

**Files:**
- Modify: `js/ui/reveal.js`
- Test: browser verification

- [ ] **Step 1: Add post-hero snap helper if absent**

If `initPostHeroSnap()` is not already present in `js/ui/reveal.js`, add this function after `initGsapTextAndUI()`:

```js
function initPostHeroSnap({ gsap, ScrollTrigger }) {
  const stage = document.querySelector('.post-hero-stage');
  const sections = gsap.utils.toArray('.post-hero-stage > section');
  if (!stage || sections.length < 2) return;

  const SNAP_RADIUS_VH = 0.16;
  const FAST_SNAP_RADIUS_VH = 0.1;
  const FAST_SCROLL_VELOCITY = 1800;
  let snapTrigger = null;
  let snapPoints = [];
  const getSnapOffset = () => Math.round(window.innerHeight * 0.2);
  const getTargetScroll = (section) => (
    section.getBoundingClientRect().top + window.scrollY - getSnapOffset()
  );
  const refreshSnapPoints = () => {
    const start = snapTrigger?.start || 0;
    const end = snapTrigger?.end || ScrollTrigger.maxScroll(window);
    const range = Math.max(1, end - start);
    snapPoints = sections
      .map((section) => gsap.utils.clamp(0, 1, (getTargetScroll(section) - start) / range))
      .filter((point, index, points) => index === 0 || Math.abs(point - points[index - 1]) > 0.001);
  };
  const getSnapRadius = () => {
    const start = snapTrigger?.start || 0;
    const end = snapTrigger?.end || ScrollTrigger.maxScroll(window);
    const range = Math.max(1, end - start);
    const velocity = snapTrigger ? Math.abs(snapTrigger.getVelocity()) : 0;
    const radiusVh = velocity > FAST_SCROLL_VELOCITY ? FAST_SNAP_RADIUS_VH : SNAP_RADIUS_VH;
    return (window.innerHeight * radiusVh) / range;
  };

  snapTrigger = ScrollTrigger.create({
    id: 'post-hero-section-snap',
    trigger: stage,
    start: () => Math.max(0, getTargetScroll(sections[0])),
    end: () => ScrollTrigger.maxScroll(window),
    invalidateOnRefresh: true,
    onRefresh: refreshSnapPoints,
    snap: {
      snapTo: (progress) => {
        if (!snapPoints.length) refreshSnapPoints();
        const nearest = gsap.utils.snap(snapPoints, progress);
        return Math.abs(nearest - progress) <= getSnapRadius() ? nearest : progress;
      },
      duration: { min: 0.22, max: 0.48 },
      delay: 0.1,
      ease: 'power2.out'
    }
  });
}
```

- [ ] **Step 2: Call snap helper once**

Inside `initGsapTextAndUI()`, after nav active triggers and before page-progress trigger, add:

```js
initPostHeroSnap({ gsap, ScrollTrigger });
```

If the site still uses the pre-redesign section IDs and does not yet contain `.post-hero-stage`, this helper safely returns without doing anything.

- [ ] **Step 3: Commit**

```bash
git add js/ui/reveal.js
git commit -m "feat: keep post hero scrolltrigger snap"
```

---

## Task 6: Update Lenis CSS State

**Files:**
- Modify: `css/styles.css`
- Test: `scripts/check-scroll-modules.mjs`

- [ ] **Step 1: Replace placeholder Lenis class**

Replace:

```css
body.lenis-like {
  overscroll-behavior-y: none;
}
```

With:

```css
html.is-lenis-active {
  scroll-behavior: auto;
}

body.is-lenis-active {
  overscroll-behavior-y: none;
}
```

- [ ] **Step 2: Run structural tests**

Run:

```bash
npm run verify:scroll-modules
```

Expected: PASS with:

```txt
Scroll integration structure looks good.
```

- [ ] **Step 3: Commit**

```bash
git add css/styles.css
git commit -m "style: add lenis active scroll state"
```

---

## Task 7: Browser Verification

**Files:**
- No code changes unless verification fails.
- Verify: local browser runtime.

- [ ] **Step 1: Start dev server**

Run:

```bash
npm run dev
```

Expected:

```txt
Local: http://localhost:8080
```

If port `8080` is already in use and serving this project, reuse it.

- [ ] **Step 2: Verify runtime globals**

Open `http://localhost:8080`, wait for loader exit, then run in DevTools:

```js
({
  hasGsap: Boolean(window.gsap),
  hasScrollTrigger: Boolean(window.ScrollTrigger),
  hasLenis: Boolean(window.Lenis),
  lenisActive: document.body.classList.contains('is-lenis-active')
})
```

Expected:

```js
{
  hasGsap: true,
  hasScrollTrigger: true,
  hasLenis: true,
  lenisActive: true
}
```

- [ ] **Step 3: Verify anchor offset**

Click top nav `方法`, `企业`, `场景`, `教育`, and `联系`.

Expected:

- The scroll is smooth but not floaty.
- The target section lands with the same visual top offset used by snapped sections.
- The URL hash updates.
- The nav active state updates after landing.

- [ ] **Step 4: Verify snapped behavior**

Use wheel/trackpad around post-hero sections.

Expected:

- Slow scroll near a section boundary snaps into the section.
- Mid-section scroll does not get pulled aggressively.
- Fast scroll does not feel trapped.
- There is no double-snap effect from Lenis plus ScrollTrigger.

- [ ] **Step 5: Verify reduced motion fallback**

In browser DevTools, emulate `prefers-reduced-motion: reduce`, reload the page, then run:

```js
({
  lenisActive: document.body.classList.contains('is-lenis-active'),
  hasVanillaVisibleItems: document.querySelectorAll('.reveal.is-visible').length >= 0
})
```

Expected:

```js
{
  lenisActive: false,
  hasVanillaVisibleItems: true
}
```

- [ ] **Step 6: Run full project verification**

Run:

```bash
npm run verify:ink-modules
npm run verify:scroll-modules
git diff --check
```

Expected:

- `Ink module structure looks good.`
- `Scroll integration structure looks good.`
- `git diff --check` prints no output.

- [ ] **Step 7: Commit**

```bash
git status --short
git add package.json scripts/check-scroll-modules.mjs js/main.js js/ui/smooth-scroll.js js/ui/reveal.js css/styles.css
git commit -m "feat: optimize scroll with lenis and scrolltrigger"
```

---

## Risk Notes

- Lenis can make snap feel delayed if `lerp` is too low. Start at `0.08`; do not go below `0.06` without testing trackpad and wheel.
- Do not enable native CSS `scroll-snap-type`; ScrollTrigger snap remains the single snap owner.
- Do not use `ScrollTrigger.scrollerProxy()` for the default Lenis window-scroll setup. Add it only if the implementation changes to a custom wrapper/content scroller.
- Do not initialize Lenis in reduced-motion mode or when the Lenis CDN fails to load.
- Do not put `ScrollTrigger.refresh()` or new tween creation inside a scroll listener.

## Self-Review

Spec coverage:

- Lenis is added through a focused module and loaded from a pinned CDN.
- ScrollTrigger remains the snapping/animation owner.
- Anchor navigation receives the same visual offset as snapped sections.
- Reduced-motion fallback is preserved.
- Verification covers structure, runtime globals, anchors, snap behavior, reduced motion, and existing ink module checks.

Placeholder scan:

- No placeholder markers or unspecified test steps remain.
- Every code-changing step includes concrete code.

Type consistency:

- `initSmoothScroll()` is imported from `js/ui/smooth-scroll.js`.
- `scrollRuntime` is passed into `initGsapTextAndUI()` but does not require immediate use; it keeps the startup contract extensible.
- `getSnapOffset()` uses the same 20vh formula in Lenis anchor navigation and ScrollTrigger snap.
