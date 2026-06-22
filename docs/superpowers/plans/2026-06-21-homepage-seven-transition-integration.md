# Homepage Seven Transition Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount the seven named transition visuals into the homepage narrative exactly once, while preserving the standalone route-entry contract and keeping two close narrative joins as ordinary scroll/card continuity.

**Architecture:** The existing route-entry pages remain standalone proofs; homepage integration uses a separate adapter layer mounted into declared homepage transition hosts. Top-level sections stay nav-stable, while Method is split into internal scenes and Enterprise/Scenario plus Education/Philosophy keep lightweight non-named continuity.

**Tech Stack:** Static HTML partials in `src/sections`, build-time manifest in `src/section-manifest.mjs`, ES modules, GSAP/ScrollTrigger/Lenis, route-entry visual components, canvas adapter for pattern bloom, CSS modules under `css/`.

---

## Context

The standalone route lifecycle contract is documented in:

- `.worktrees/transition-runtime-foundation-clean/docs/superpowers/plans/2026-06-20-transition-route-integration-contract.md`

That contract answers how independent transition routes initialize and clean up. It explicitly does not define homepage mounting. This plan defines the homepage-facing layer.

Current route/component status:

| Visual identity | Standalone entry | Homepage readiness | Notes |
|---|---|---|---|
| `ph-route-entry` | `ph-route-entry.html`, `js/ph-route-entry.js` | Needs homepage adapter extraction | Direct route-entry script owns local progress helpers. Adapter should reuse PH DOM/CSS but must not create a second global route lifecycle. |
| `aod-transition-route` | `aod-transition-route.html`, `js/aod-transition-route.js` | Component-ready | Uses `js/components/aod-transition.js`. |
| `crane-transition-route` | `crane-transition-route.html`, `js/crane-transition-route.js` | Component-ready | Uses `js/components/crane-transition.js` with native fallback behavior. |
| `pattern-bloom-component` | `pattern-bloom-component.html`, `js/transitions/pattern-bloom-adapter.js` | Adapter-ready | Canvas/rAF scene. Correctly not forced through `createTransitionRoute()`. |
| `figure3-transition-route` | `figure3-transition-route.html`, `js/figure3-transition-route.js` | Component-ready | Uses `js/components/figure3-transition.js`. |
| `figure2-transition-route` | `figure2-transition-route.html`, `js/figure2-transition-route.js` | Component-ready | Uses `js/components/figure2-transition.js`. |
| `ttg-transition-route` | `ttg-transition-route.html`, `js/ttg-transition-route.js` | Component-ready | Uses `js/components/ttg-transition.js`. Keep the registry/module spelling as `ttg`, not `tgg`. Keep `ttg.html` as the dedicated tuning playground. |

## Narrative Order

Use each named transition once:

| Homepage join | Transition | Narrative job |
|---|---|---|
| Hero -> Method-识场立法 | `aod` | From business anxiety into measurement, boundary-setting, and rule-making. |
| Method-识场立法 -> Method-共创 | `figure2` | From authority/rules into consultation, dialogue, and asking the right question. |
| Method-共创 -> Method-成器陪跑 | `pattern-bloom` | Convert fragmented stakeholder input into templates, assistants, knowledge bases, and operating habits. |
| Method-成器陪跑 -> Brand | `ttg` | Lift from concrete tools into “观幂”: seeing structure inside a complex system. |
| Brand -> Enterprise | `figure3-transition` | Unroll the brand philosophy into an explicit enterprise service menu. |
| Enterprise -> Scenario | ordinary card drilldown | These are the same commercial argument: “what to buy” -> “where it applies.” Avoid a named transition. |
| Scenario -> Education | `ph` | Move from commercial AI applications into learning, research, proportion, and a knowledge community. |
| Education -> Philosophy | ordinary quiet scroll | Education already carries the enlightenment tone. Let Philosophy collect values without another named effect. |
| Philosophy -> Contact | `crane` | Convert values into forward motion and a concrete diagnostic action. |

One-line flow:

```text
Hero -> aod -> Method-识场立法 -> figure2 -> Method-共创 -> pattern-bloom
-> Method-成器陪跑 -> ttg -> Brand -> figure3-transition -> Enterprise
-> ordinary drilldown -> Scenario -> ph -> Education -> ordinary quiet scroll
-> Philosophy -> crane -> Contact
```

## Structural Model

Keep the public nav sections stable:

- `#method`
- `#services`
- `#education`
- `#contact`

Add internal scene hosts inside sections instead of turning every beat into a nav item:

```html
<section class="canvas-section canvas-section--method" id="method" data-section-id="method">
  <div class="homepage-scene" data-scene-id="method-field-law">...</div>
  <div class="scene-transition" data-transition-id="method-field-law__method-cocreation" data-transition-module="figure2"></div>
  <div class="homepage-scene" data-scene-id="method-cocreation">...</div>
  <div class="scene-transition" data-transition-id="method-cocreation__method-tooling" data-transition-module="pattern-bloom"></div>
  <div class="homepage-scene" data-scene-id="method-tooling">...</div>
</section>
```

Use `chapter-transition` for top-level joins and `scene-transition` for internal joins. Both host types should share the same adapter contract.

## Homepage Adapter Contract

Do not mount standalone route pages into the homepage. Do not call `createTransitionRoute()` from the homepage runtime. The homepage already owns scroll, loader, nav, hero, reveal, and smooth-scroll behavior.

Each homepage adapter exports:

```js
export function mountHomepageTransition({
  host,
  reduceMotion,
  progressSource,
  addCleanup,
  gsap,
  ScrollTrigger
}) {
  return {
    destroy() {}
  };
}
```

Adapter rules:

- `host` is the only mount target. Query inside `host`; do not query route-global selectors like `document.querySelector('[data-ttg-stage]')`.
- `progressSource()` returns `0..1` progress for this host. Adapters may tween toward it, but must not create a competing page-level Lenis lifecycle.
- `addCleanup()` registers every listener, rAF loop, timer, ScrollTrigger, tween, media event, observer, and inline mutation that must be disposed.
- Reduced motion renders a static useful final state immediately.
- Any failure changes that host to `data-transition-module="soft-divider"` and adds `chapter-transition--fallback` or `scene-transition--fallback`.

## Adapter Registry

Create one registry that can mount both top-level and internal hosts:

```js
export const homepageTransitionRegistry = {
  aod: () => import('./homepage/aod-homepage-adapter.js'),
  figure2: () => import('./homepage/figure2-homepage-adapter.js'),
  'pattern-bloom': () => import('./pattern-bloom-adapter.js'),
  ttg: () => import('./homepage/ttg-homepage-adapter.js'),
  'figure3-transition': () => import('./homepage/figure3-homepage-adapter.js'),
  ph: () => import('./homepage/ph-homepage-adapter.js'),
  crane: () => import('./homepage/crane-homepage-adapter.js')
};
```

The runtime mounts:

```js
const hosts = [
  ...document.querySelectorAll('.chapter-transition[data-transition-module]'),
  ...document.querySelectorAll('.scene-transition[data-transition-module]')
];
```

## Scene And Transition IDs

Use stable semantic ids rather than legacy section-only ids for new internal joins:

| Host type | `data-transition-id` | `data-transition-module` | From | To |
|---|---|---|---|---|
| `chapter-transition` | `hero-method` | `aod` | `home` | `method-field-law` |
| `scene-transition` | `method-field-law__method-cocreation` | `figure2` | `method-field-law` | `method-cocreation` |
| `scene-transition` | `method-cocreation__method-tooling` | `pattern-bloom` | `method-cocreation` | `method-tooling` |
| `chapter-transition` | `method-brand` | `ttg` | `method-tooling` | `brand` |
| `chapter-transition` | `brand-services` | `figure3-transition` | `brand` | `services` |
| Ordinary continuity | `services-lab` | `soft-drilldown` | `services` | `lab` |
| `chapter-transition` | `lab-education` | `ph` | `lab` | `education` |
| Ordinary continuity | `education-philosophy` | `soft-breath` | `education` | `philosophy` |
| `chapter-transition` | `philosophy-contact` | `crane` | `philosophy` | `contact` |

Keep legacy `data-transition="method-brand"` values only for existing top-level hosts that still pass through `scripts/build-index.mjs`. Internal scene transitions can use only `data-transition-id` unless the build script is extended to decorate them.

## File Structure

Create:

- `js/transitions/homepage-transition-runtime.js`
- `js/transitions/homepage-transition-registry.js`
- `js/transitions/homepage/aod-homepage-adapter.js`
- `js/transitions/homepage/figure2-homepage-adapter.js`
- `js/transitions/homepage/figure3-homepage-adapter.js`
- `js/transitions/homepage/ph-homepage-adapter.js`
- `js/transitions/homepage/crane-homepage-adapter.js`
- `js/transitions/homepage/ttg-homepage-adapter.js`
- `css/components/homepage-transitions.css`
- `scripts/check-homepage-transition-integration.mjs`

Modify:

- `src/sections/method.html`
- `src/sections/brand.html`
- `src/sections/services.html`
- `src/sections/lab.html`
- `src/sections/education.html`
- `src/sections/philosophy.html`
- `src/sections/contact.html`
- `src/index.template.html`
- `src/section-manifest.mjs`
- `scripts/build-index.mjs`
- `scripts/check-section-transition-contract.mjs`
- `scripts/check-transition-runtime.mjs`
- `js/main.js`
- `css/styles.css`
- `css/sections/canvas-stage.css`
- `css/sections/source-copy.css`
- `package.json`

Already present prerequisites:

- `js/components/ttg-transition.js`
- `ttg-transition-route.html`
- `js/ttg-transition-route.js`

## Implementation Tasks

### Task 1: Split Homepage Narrative Into Stable Internal Scenes

**Files:**
- Modify: `src/sections/method.html`
- Modify: `src/sections/services.html`
- Modify: `src/sections/lab.html`
- Modify: `src/sections/education.html`
- Modify: `src/index.template.html`
- Modify: `css/sections/canvas-stage.css`
- Modify: `css/sections/source-copy.css`

- [ ] **Step 1: Add Method scene wrappers**

Wrap existing Method copy into three internal scenes:

```html
<div class="homepage-scene homepage-scene--method-field-law" data-scene-id="method-field-law">
  <div class="chapter-intro reveal">
    <span class="section-index">Method / 01</span>
    <h2>从“看得懂”到“用得上”的五步打法</h2>
    <p>你的生意怎么跑，你比谁都懂，我们不来重画流程。我们只做一件事：看现场，找出钱耗在哪、人卡在哪、订单为什么慢，把 AI 接进去。</p>
  </div>
  <ol class="process-list process-list--field-law" aria-label="AI 落地前两步">
    <li class="process-row reveal"><span>01</span><strong>识场</strong><p>先摸清最耗人、最容易断的环节：老师傅一走就带走的本事，先理出来；哪笔钱花得冤，先算清楚。不瞎铺摊子。</p></li>
    <li class="process-row reveal"><span>02</span><strong>立法</strong><p>给团队定一套能看懂、敢用的规矩。怎么问 AI、什么能信、哪些数据碰不得，先讲清楚，团队才敢用，也不乱用。</p></li>
  </ol>
</div>

<div class="scene-transition" data-transition-id="method-field-law__method-cocreation" data-transition-from="method-field-law" data-transition-to="method-cocreation" data-transition-module="figure2" data-transition-variant="questioning"></div>

<div class="homepage-scene homepage-scene--method-cocreation" data-scene-id="method-cocreation">
  <ol class="process-list process-list--cocreation" start="3" aria-label="AI 落地共创">
    <li class="process-row reveal"><span>03</span><strong>共创</strong><p>拉上你、你的中层和一线老员工一起设计。流程得让一线认账，不然做得再漂亮也推不动。</p></li>
  </ol>
</div>

<div class="scene-transition" data-transition-id="method-cocreation__method-tooling" data-transition-from="method-cocreation" data-transition-to="method-tooling" data-transition-module="pattern-bloom" data-transition-variant="fragments-to-system"></div>

<div class="homepage-scene homepage-scene--method-tooling" data-scene-id="method-tooling">
  <ol class="process-list process-list--tooling" start="4" aria-label="AI 落地成器陪跑">
    <li class="process-row reveal"><span>04</span><strong>成器</strong><p>把摸索出来的东西沉淀成模板、专属 AI 助手、知识库和自动流程。人走了，本事留在公司里。</p></li>
    <li class="process-row reveal"><span>05</span><strong>陪跑</strong><p>交付完不是结束。我们盯着用没用、好不好用，持续调、持续教，直到 AI 长进团队的日常。</p></li>
  </ol>
  <div class="quiet-proof quiet-proof--source reveal">...</div>
</div>
```

- [ ] **Step 2: Add Hero -> Method host**

In `src/index.template.html`, insert a top-level transition after `{{> sections/hero.html}}` and before `.long-canvas`:

```html
<div class="chapter-transition" data-transition="hero-method" data-transition-id="hero-method" data-transition-from="home" data-transition-to="method-field-law" data-transition-module="aod" data-transition-variant="measure-order" aria-hidden="true"></div>
```

- [ ] **Step 3: Preserve ordinary continuity joins**

Keep Enterprise and Scenario as separate sections, but configure `services-lab` as non-named continuity:

```js
{
  id: 'services-lab',
  from: 'services',
  to: 'lab',
  module: 'soft-drilldown',
  variant: 'cards-to-scenarios'
}
```

Keep Education to Philosophy as non-named continuity:

```js
{
  id: 'education-philosophy',
  from: 'education',
  to: 'philosophy',
  module: 'soft-breath',
  variant: 'quiet-values'
}
```

- [ ] **Step 4: Run build and section contract**

Run:

```bash
npm run build:page
npm run verify:section-transitions
```

Expected:

```text
Section transition contract looks good.
```

### Task 2: Add Homepage Transition Runtime And Registry

**Files:**
- Create: `js/transitions/homepage-transition-runtime.js`
- Create: `js/transitions/homepage-transition-registry.js`
- Modify: `js/main.js`

- [ ] **Step 1: Create registry**

Create `js/transitions/homepage-transition-registry.js`:

```js
export const homepageTransitionRegistry = {
  aod: () => import('./homepage/aod-homepage-adapter.js'),
  figure2: () => import('./homepage/figure2-homepage-adapter.js'),
  'pattern-bloom': () => import('./pattern-bloom-adapter.js'),
  ttg: () => import('./homepage/ttg-homepage-adapter.js'),
  'figure3-transition': () => import('./homepage/figure3-homepage-adapter.js'),
  ph: () => import('./homepage/ph-homepage-adapter.js'),
  crane: () => import('./homepage/crane-homepage-adapter.js')
};
```

- [ ] **Step 2: Create runtime**

Create `js/transitions/homepage-transition-runtime.js`:

```js
import { homepageTransitionRegistry } from './homepage-transition-registry.js';

const NAMED_TRANSITION_SELECTOR = [
  '.chapter-transition[data-transition-module]',
  '.scene-transition[data-transition-module]'
].join(',');

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function createCleanupStack() {
  const cleanups = [];
  return {
    add(cleanup) {
      if (!cleanup) return;
      const destroy = typeof cleanup === 'function' ? cleanup : cleanup.destroy;
      if (typeof destroy === 'function') cleanups.push(() => destroy.call(cleanup));
    },
    destroy() {
      while (cleanups.length) cleanups.pop()();
    }
  };
}

function createHostProgressSource(host) {
  return () => {
    const viewportHeight = Math.max(1, window.innerHeight || 1);
    const rect = host.getBoundingClientRect();
    const scrollable = Math.max(1, host.offsetHeight - viewportHeight);
    return clamp(-rect.top / scrollable);
  };
}

function fallbackHost(host, error) {
  console.warn('Homepage transition failed; using soft divider.', error);
  host.dataset.transitionModule = 'soft-divider';
  host.classList.add('chapter-transition--fallback', 'scene-transition--fallback');
}

export async function initHomepageTransitions({
  root = document,
  reduceMotion = false,
  gsap = window.gsap,
  ScrollTrigger = window.ScrollTrigger
} = {}) {
  const cleanup = createCleanupStack();
  const hosts = [...root.querySelectorAll(NAMED_TRANSITION_SELECTOR)];

  await Promise.all(hosts.map(async (host) => {
    const moduleName = host.dataset.transitionModule;
    if (!moduleName || moduleName === 'soft-divider' || moduleName === 'soft-drilldown' || moduleName === 'soft-breath') return;

    const loadAdapter = homepageTransitionRegistry[moduleName];
    if (!loadAdapter) {
      fallbackHost(host, new Error(`Unknown homepage transition module: ${moduleName}`));
      return;
    }

    try {
      const adapterModule = await loadAdapter();
      const mount = adapterModule.mountHomepageTransition || adapterModule.mountPatternBloomTransition;
      if (typeof mount !== 'function') {
        throw new Error(`Transition module ${moduleName} has no homepage mount function.`);
      }

      cleanup.add(mount({
        host,
        reduceMotion,
        progressSource: createHostProgressSource(host),
        addCleanup: cleanup.add,
        gsap,
        ScrollTrigger
      }));
    } catch (error) {
      fallbackHost(host, error);
    }
  }));

  window.addEventListener('pagehide', cleanup.destroy, { once: true });

  return cleanup;
}
```

- [ ] **Step 3: Mount from main runtime**

Modify `js/main.js` after GSAP and smooth scroll are ready:

```js
import { initHomepageTransitions } from './transitions/homepage-transition-runtime.js';
```

Inside the successful `loadRequiredLibraries().then(() => { ... })` block, after `initLayeredHero(...)`:

```js
initHomepageTransitions({
  root: document,
  reduceMotion,
  gsap: window.gsap,
  ScrollTrigger: window.ScrollTrigger
});
```

Inside the `reduceMotion` branch after `initVanillaReveal()`:

```js
initHomepageTransitions({
  root: document,
  reduceMotion: true
});
```

- [ ] **Step 4: Verify imports**

Run:

```bash
npm run build:page
node -e "import('./js/transitions/homepage-transition-registry.js').then(() => console.log('homepage transition registry import ok'))"
```

Expected:

```text
homepage transition registry import ok
```

### Task 3: Add Component-Ready Homepage Adapters

**Files:**
- Create: `js/transitions/homepage/aod-homepage-adapter.js`
- Create: `js/transitions/homepage/figure2-homepage-adapter.js`
- Create: `js/transitions/homepage/figure3-homepage-adapter.js`
- Create: `js/transitions/homepage/crane-homepage-adapter.js`
- Modify: `css/components/homepage-transitions.css`

- [ ] **Step 1: AOD adapter**

Create `js/transitions/homepage/aod-homepage-adapter.js`:

```js
import {
  prepareAodTransition,
  renderAodTransitionProgress,
  waitForAodTransitionMetadata
} from '../../components/aod-transition.js';

export function mountHomepageTransition({ host, reduceMotion = false, progressSource, addCleanup }) {
  host.classList.add('homepage-transition', 'homepage-transition--aod');
  host.innerHTML = `
    <section class="aod-transition" data-aod-transition data-aod-duration="2" data-aod-scroll-vh="20" aria-hidden="true">
      <div class="aod-transition__sticky">
        <div class="aod-transition__field">
          <img class="aod-transition__layer aod-transition__layer--cloud" data-aod-cloud-layer src="assets/aod_cloud-alpha.png" alt="" />
          <img class="aod-transition__layer aod-transition__layer--sun" data-aod-sun-layer src="assets/aod_sun-alpha.png" alt="" />
          <video class="aod-transition__figure" data-aod-figure-video src="assets/aod_figure-alpha-front.webm" muted preload="metadata" playsinline webkit-playsinline></video>
        </div>
      </div>
    </section>
  `;

  const section = host.querySelector('[data-aod-transition]');
  const { figureVideo } = prepareAodTransition(section, { progress: reduceMotion ? 1 : 0 });
  let raf = 0;
  let destroyed = false;

  const tick = () => {
    if (destroyed) return;
    renderAodTransitionProgress(section, reduceMotion ? 1 : progressSource());
    raf = requestAnimationFrame(tick);
  };

  if (!reduceMotion) tick();
  else waitForAodTransitionMetadata(section).then(() => !destroyed && renderAodTransitionProgress(section, 1));

  const destroy = () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    figureVideo?.pause?.();
    host.classList.remove('homepage-transition', 'homepage-transition--aod');
    host.replaceChildren();
  };

  addCleanup?.(destroy);
  return { destroy };
}
```

- [ ] **Step 2: Figure 3 adapter**

Create `js/transitions/homepage/figure3-homepage-adapter.js` using `prepareFigure3Transition()` and `renderFigure3TransitionProgress()` with the same rAF/progressSource pattern as AOD. Use:

```html
<section class="figure3-transition" data-figure3-transition data-figure3-duration="2" data-figure3-scroll-vh="20" aria-hidden="true">
  <div class="figure3-transition__sticky">
    <div class="figure3-transition__backdrop" aria-hidden="true"></div>
    <div class="figure3-transition__stage" aria-hidden="true">
      <video class="figure3-transition__video" data-figure3-alpha-video src="assets/figure3-alpha-scrub.webm" poster="assets/figure3-alpha-poster.png" muted preload="metadata" playsinline webkit-playsinline></video>
      <div class="figure3-transition__fill" data-figure3-fill aria-hidden="true"></div>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Figure 2 adapter**

Create `js/transitions/homepage/figure2-homepage-adapter.js` after checking `js/components/figure2-transition.js` exports. The adapter must instantiate the existing controller inside `host`, not against `document`. If the controller still assumes route DOM, first add an option to pass root elements into `createFigure2TransitionController(stage, { root, body })`, then use `host` as the root query scope.

- [ ] **Step 4: Crane adapter**

Create `js/transitions/homepage/crane-homepage-adapter.js` using `createCraneTransitionScene(hostStage)`. It must render `progressSource()` in rAF or use scene state's exposed `renderRawProgress` if available. Preserve the native fallback path that `crane-transition-route.js` already uses.

- [ ] **Step 5: Verify adapters import**

Run:

```bash
node -e "Promise.all([
  import('./js/transitions/homepage/aod-homepage-adapter.js'),
  import('./js/transitions/homepage/figure3-homepage-adapter.js'),
  import('./js/transitions/homepage/figure2-homepage-adapter.js'),
  import('./js/transitions/homepage/crane-homepage-adapter.js')
]).then(() => console.log('component adapters import ok'))"
```

Expected:

```text
component adapters import ok
```

### Task 4: Add TTG Homepage Adapter From Route-Entry Component

**Files:**
- Existing: `js/components/ttg-transition.js`
- Existing: `ttg-transition-route.html`
- Existing: `js/ttg-transition-route.js`
- Modify: `scripts/check-transition-runtime.mjs`
- Create: `js/transitions/homepage/ttg-homepage-adapter.js`

- [ ] **Step 1: Register and verify the TTG route-entry proof**

Add `ttg-transition-route.html` and `js/ttg-transition-route.js` to the route/runtime verification list in `scripts/check-transition-runtime.mjs`.

The route proof should stay shaped like this:

```js
import { createTtgTransitionScene } from './components/ttg-transition.js';
import { createTransitionRoute } from './transitions/route-entry.js';
```

The component contract is already available from `js/components/ttg-transition.js`:

```js
export function createTtgTransitionScene(stage, options = {}) {
  // returns prepare, mountReducedMotion, waitForMedia, mountGsap,
  // mountNativeFallback, renderRawProgress, and destroy
}
```

Do not reintroduce the tuning panel into `ttg-transition-route.html` or any homepage adapter. `ttg.html` remains the tuning playground.

- [ ] **Step 2: Create homepage TTG adapter**

Create `js/transitions/homepage/ttg-homepage-adapter.js`. It should mount the same TTG layer stack inside `host`, instantiate `createTtgTransitionScene(stage)`, call `prepare()`, and drive `scene.renderRawProgress(progressSource())`.

Adapter skeleton:

```js
import { createTtgTransitionScene } from '../../components/ttg-transition.js';

export function mountHomepageTransition({ host, reduceMotion = false, progressSource, addCleanup }) {
  host.classList.add('homepage-transition', 'homepage-transition--ttg');
  host.innerHTML = `
    <section
      class="ttg-scroll"
      data-ttg-transition
      data-ttg-stage
      data-ttg-duration="2.5"
      data-ttg-scroll-vh="153"
      data-ttg-video-duration="2.459"
      data-ttg-bg-travel-vh="14.3"
      data-ttg-middle-travel-vh="23.5"
      data-ttg-front-y-vh="29.2"
      data-ttg-front-travel-vh="13.1"
      data-ttg-front-overlay-opacity="0.2"
      data-ttg-figure-scale="0.80"
      data-ttg-figure-y-vh="-8.5"
      data-ttg-figure-travel-vh="16.5"
      style="--ttg-scroll-vh: 153; --ttg-front-overlay-opacity: 0.2;"
      aria-hidden="true"
    >
      <div class="ttg-sticky">
        <div class="ttg-field">
          <div class="ttg-layer-stack" aria-hidden="true">
            <img class="ttg-layer ttg-layer--bg" src="assets/ttg_bg.png" alt="" />
            <img class="ttg-layer ttg-layer--middle" src="assets/ttg_middle-alpha.png" alt="" />
            <img class="ttg-layer ttg-layer--middle-overlay" src="assets/ttg_middle-original-overlay-alpha.png" alt="" />
            <img class="ttg-layer ttg-layer--front" src="assets/ttg_front-original-overlay-alpha.png?v=ttg-front-image15-blend80-v1" alt="" />
            <img class="ttg-layer ttg-layer--front-overlay" src="assets/ttg_front-alpha.png?v=ttg-front-image15-blend80-v1" alt="" />
            <video
              class="ttg-layer ttg-layer--figure is-active"
              data-ttg-figure-video
              src="assets/ttg_figure-alpha-scrub.webm?v=ttg-figure-blue-v2"
              poster="assets/ttg_figure-alpha-scrub-poster.png?v=ttg-figure-blue-v2"
              width="720"
              height="1280"
              muted
              preload="metadata"
              playsinline
              webkit-playsinline
            ></video>
            <video
              class="ttg-layer ttg-layer--figure"
              data-ttg-figure-video-reverse
              src="assets/ttg_figure-alpha-scrub-reverse.webm?v=ttg-figure-blue-v2"
              width="720"
              height="1280"
              muted
              preload="metadata"
              playsinline
              webkit-playsinline
            ></video>
          </div>
        </div>
      </div>
    </section>
  `;

  const stage = host.querySelector('[data-ttg-stage]');
  const scene = createTtgTransitionScene(stage);
  if (!scene) throw new Error('TTG homepage transition could not initialize.');

  let raf = 0;
  let destroyed = false;

  const render = () => {
    if (destroyed) return;
    scene.renderRawProgress(reduceMotion ? 1 : progressSource());
    raf = requestAnimationFrame(render);
  };

  scene.prepare();
  if (reduceMotion) {
    scene.mountReducedMotion();
  } else {
    scene.waitForMedia().finally(render);
  }

  const destroy = () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    scene.destroy();
    host.replaceChildren();
    host.classList.remove('homepage-transition', 'homepage-transition--ttg');
  };

  addCleanup?.(destroy);
  return { destroy };
}
```

- [ ] **Step 3: Verify TTG route and homepage adapter**

Run:

```bash
npm run verify:transition-runtime
node -e "import('./js/transitions/homepage/ttg-homepage-adapter.js').then(() => console.log('ttg homepage adapter import ok'))"
```

Expected:

```text
Transition runtime contract looks good.
ttg homepage adapter import ok
```

### Task 5: PH Component Extraction And Homepage Adapter

**Files:**
- Create: `js/components/ph-transition.js`
- Create: `js/transitions/homepage/ph-homepage-adapter.js`

- [ ] **Step 1: Extract PH render helpers**

Create `js/components/ph-transition.js` and move the route-local PH render helpers out of `js/ph-route-entry.js`:

```js
import {
  prepareScrubVideo,
  seekVideoToProgress,
  waitForVideoMetadata
} from '../transitions/video-scrub.js';

const VIDEO_DURATION_FALLBACK = 76 / 30;
const BG_PARALLAX_Y = -18;
const FRONT_PARALLAX_Y = 230;
const FIGURE_PARALLAX_Y = 135;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothStep = (value) => {
  const p = clamp(value);
  return p * p * (3 - 2 * p);
};

function acceleratedProgress(rawProgress) {
  const p = clamp(rawProgress);
  return clamp(0.78 * p + 0.22 * p * p);
}

export function getPhTransitionElements(stage) {
  return {
    alphaVideo: stage?.querySelector('[data-ph-alpha-video]') || null
  };
}

export function preparePhTransition(stage, { progress = 0 } = {}) {
  const { alphaVideo } = getPhTransitionElements(stage);
  prepareScrubVideo(alphaVideo);
  renderPhTransitionProgress(stage, progress);
  return { alphaVideo };
}

export function renderPhTransitionProgress(stage, rawProgress, options = {}) {
  if (!stage) return;

  const { alphaVideo } = getPhTransitionElements(stage);
  const p = acceleratedProgress(rawProgress);
  const eased = smoothStep(p);

  stage.style.setProperty('--ph-progress', p.toFixed(4));
  stage.style.setProperty('--ph-bg-parallax-y', `${(eased * BG_PARALLAX_Y).toFixed(2)}px`);
  stage.style.setProperty('--ph-front-parallax-y', `${(eased * FRONT_PARALLAX_Y).toFixed(2)}px`);
  stage.style.setProperty('--ph-figure-parallax-y', `${(eased * FIGURE_PARALLAX_Y).toFixed(2)}px`);

  seekVideoToProgress(options.alphaVideo ?? alphaVideo, p, {
    fallbackSeconds: options.videoDurationFallback ?? VIDEO_DURATION_FALLBACK,
    endPaddingSeconds: 0.02,
    minDeltaSeconds: 0.016
  });
}

export function waitForPhTransitionMetadata(stage) {
  const { alphaVideo } = getPhTransitionElements(stage);
  return waitForVideoMetadata(alphaVideo);
}
```

- [ ] **Step 2: Create homepage adapter**

Create `js/transitions/homepage/ph-homepage-adapter.js` using the same adapter contract as AOD. The adapter should mount PH as Scenario -> Education transition and render reduced motion at progress `1`.

- [ ] **Step 3: Verify PH adapter import**

Run:

```bash
node -e "import('./js/transitions/homepage/ph-homepage-adapter.js').then(() => console.log('ph homepage adapter import ok'))"
```

Expected:

```text
ph homepage adapter import ok
```

### Task 6: Build-Time And Verification Contract Updates

**Files:**
- Modify: `src/section-manifest.mjs`
- Modify: `scripts/check-section-transition-contract.mjs`
- Create: `scripts/check-homepage-transition-integration.mjs`
- Modify: `package.json`

- [ ] **Step 1: Update executable modules**

Update `src/section-manifest.mjs`:

```js
export const executableTransitionModules = [
  'soft-divider',
  'soft-drilldown',
  'soft-breath',
  'aod',
  'figure2',
  'pattern-bloom',
  'ttg',
  'figure3-transition',
  'ph',
  'crane'
];
```

- [ ] **Step 2: Add homepage integration check**

Create `scripts/check-homepage-transition-integration.mjs` to assert:

- Every named module appears exactly once in generated `index.html`.
- `services-lab` uses `soft-drilldown`.
- `education-philosophy` uses `soft-breath`.
- `ttg` is only considered valid when `js/components/ttg-transition.js`, `ttg-transition-route.html`, and `js/ttg-transition-route.js` exist.
- Internal `.scene-transition` hosts have `data-transition-id`, `data-transition-from`, `data-transition-to`, and `data-transition-module`.

- [ ] **Step 3: Add package script**

Add to `package.json`:

```json
"verify:homepage-transitions": "node scripts/check-homepage-transition-integration.mjs"
```

- [ ] **Step 4: Run full verification**

Run:

```bash
npm run build:page
npm run verify:section-transitions
npm run verify:transition-runtime
npm run verify:homepage-transitions
```

Expected:

```text
Section transition contract looks good.
Transition runtime contract looks good.
Homepage transition integration looks good.
```

## Acceptance Criteria

- The seven named visuals appear exactly once on the homepage.
- `ttg-transition-route.html` remains a route-entry proof and `ttg` homepage use goes through `js/components/ttg-transition.js`.
- `pattern-bloom` remains a canvas adapter and is not forced through `createTransitionRoute()`.
- Enterprise -> Scenario and Education -> Philosophy do not use named transitions.
- The homepage transition runtime does not create a competing global smooth-scroll lifecycle.
- Every adapter has reduced-motion, failure fallback, and cleanup behavior.
- Existing route-entry standalone pages still pass `npm run verify:transition-runtime`.
- `npm run build:page` regenerates `index.html` with the intended transition metadata.

## Risks And Guardrails

- **Risk:** TTG is heavier than the other adapters because it mounts multiple layered images plus forward/reverse scrub videos.
  **Guardrail:** Homepage adapter must reuse `createTtgTransitionScene(stage)`, keep all queries scoped to `host`, pause media in `destroy()`, and preserve `ttg-transition-route.html` as the standalone proof.

- **Risk:** Internal Method scene transitions may conflict with existing reveal timing.
  **Guardrail:** Keep internal scene hosts as normal DOM children and use the same `.reveal` classes; do not add new nav anchors.

- **Risk:** Several adapters may seek video on every rAF.
  **Guardrail:** Keep existing `seekVideoToProgress()` min-delta thresholds and pause media on cleanup.

- **Risk:** Homepage failures could blank the page if adapter imports throw.
  **Guardrail:** Runtime catches each adapter independently and falls back only that host to soft divider.

## Self-Review

- Spec coverage: This plan covers all seven named visuals, the two ordinary joins, the route-entry contract boundary, and the now-present TTG route-entry component.
- Placeholder scan: No implementation step relies on unspecified transition ordering or unnamed files. TTG is called out as route-entry-ready with concrete homepage adapter targets.
- Type consistency: The adapter interface is `mountHomepageTransition({ host, reduceMotion, progressSource, addCleanup, gsap, ScrollTrigger })` throughout. The registry keys match the proposed `data-transition-module` values.
