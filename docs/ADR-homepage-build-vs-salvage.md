# ADR: Homepage Master Timeline Build vs Salvage Decision Matrix

**Status:** Accepted  
**Date:** 2026-06-29  
**Context:** Homepage Master Timeline Visual Migration (Strategy A: Real Takeover)

---

## Context

The homepage master timeline migration requires a clear decision matrix for what code to reuse, what to rebuild, and what to adapt from the current scroll-driven implementation. This decision impacts implementation complexity, visual fidelity, timeline control mechanism, and the ability to achieve Strategy A (real master takeover) versus falling back to Strategy B (honest rollback).

The current implementation (`homepage-transition-runtime.js`) uses:
- **Scroll-driven progress**: viewport intersection triggers snap playback
- **Snap coordinator**: manages scroll lock, RAF-driven playhead animation, and handoff sequencing
- **Legacy adapters**: mount transition visuals in `[data-transition-id]` hosts
- **Scene timeline controller**: derives state from join progress (committed/presented phases)
- **Component renderers**: `aod-transition.js`, `figure2-transition.js`, etc. draw visuals via CSS variables + video scrubbing

The target architecture (from `PLAN-homepage-master-timeline-visual-migration-merged.md`) requires:
- **Master stage**: sticky `100dvh` viewport with surface/copy/ink layers
- **State machine timeline**: time-driven autoplay with forward/reverse control
- **Surface producers**: draw into `[data-master-surface]` canvases sampled by `MasterInkCompositor`
- **No adapters in master mode**: producers own visual output, not adapters

---

## Decision

### SALVAGE (Keep As-Is)

#### 1. Visual Assets from Main Branch
**Files:**
- All image assets under `/img/`
- Video assets: AOD figure video, TTG animations, PH animations, crane video
- Depth maps: `back-depth.png`, `middle-depth.png` for ink transitions
- WebGL shader sources in `ink-scene-transition.js`

**Rationale:**
- These are production-proven visual sources with correct fidelity
- Recreating them would delay the migration by weeks
- They are not coupled to the scroll-driven timeline mechanism

**Migration Impact:** None. Assets remain in place, referenced by new producers.

---

#### 2. Component Visual Rendering Logic
**Files:**
- `js/components/aod-transition.js` (lines 1-130: `renderAodTransitionProgress`, CSS variable setters, video seeking)
- `js/components/figure2-transition.js` (equivalent render functions)
- `js/components/figure3-transition.js` (equivalent render functions)
- `js/components/ttg-transition.js` (equivalent render functions)
- `js/components/ph-transition.js` (equivalent render functions)
- `js/components/crane-transition.js` (equivalent render functions)

**What to salvage:**
```javascript
// From aod-transition.js lines 65-113
function setLayerProgress(section, progress, config) {
  const p = clamp(progress);
  const backdropExit = smoothStep(secondsRange(/*...*/));
  const fullscreen = smoothStep(secondsRange(/*...*/));
  // CSS variable calculations for sun-layer, cloud-layer, figure positioning
  section.style.setProperty('--aod-transition-progress', p.toFixed(4));
  section.style.setProperty('--aod-transition-sun-y', formatPx(/*...*/));
  // ... 20+ more CSS variable assignments
}
```

**Rationale:**
- These functions contain battle-tested animation curves, timing offsets, and visual math
- The CSS variable → DOM element relationship is already correct
- Separating visual calculations from timeline control is clean architecture

**Adapter pattern:**
```javascript
// NEW: js/transitions/homepage/aod-surface-producer.js
export function createAodSurfaceProducer(context) {
  return {
    mount(surfaceEntry) {
      const canvas = surfaceEntry.texture;
      // Draw figure video frame to canvas
      prepareCanvas(canvas);
      markReady(surfaceEntry, canvas);
    },
    render({ localProgress }) {
      // SALVAGED: reuse setLayerProgress logic to drive visual layers
      setLayerProgress(hostElement, localProgress, config);
      // Draw current video frame into canvas texture
      drawVideoFrameToCanvas(figureVideo, canvas, localProgress);
    }
  };
}
```

**Migration Impact:** Moderate. Extract rendering functions from adapters, wrap in producer contract.

---

#### 3. WebGL Shader Capabilities
**Files:**
- `js/effects/ink-scene-transition.js` (all 904 lines)
  - `createInkCurtainTransition` (lines 4-248)
  - `createInkSceneTransition` (lines 250-903)

**What to salvage:**
- Vertex/fragment shader source (WebGL ink flow, particle systems, noise functions)
- Texture layer management (depth maps, figure masks, next-scene sampling)
- Uniform binding and GPU state management
- The entire `render(progress, pointerX, pointerY)` signature

**Rationale:**
- This is 900 lines of GPU-accelerated visual code that took weeks to tune
- The shader math (fbm noise, threshold dissolve, edge particles) is not timeline-coupled
- `MasterInkCompositor` already expects to sample surface textures; ink shaders can draw into those surfaces

**Adapter pattern:**
```javascript
// SALVAGED: ink-scene-transition.js becomes a drawing primitive
import { createInkSceneTransition } from '../../effects/ink-scene-transition.js';

export function createBeliefStarSurfaceProducer(context) {
  const inkRenderer = createInkSceneTransition(canvas, {
    assets: { nextSceneSrc: '/img/belief-star-field.png' },
    colorLift: 0.32
  });
  
  return {
    render({ localProgress, state }) {
      inkRenderer.render(localProgress, pointerX, pointerY);
    }
  };
}
```

**Migration Impact:** Low. Ink shaders are already rendering primitives; just wire them to producer contract.

---

#### 4. DOM Structure and CSS Variables
**Files:**
- `css/components/homepage-continuity.css` (existing transition CSS)
- Generated `index.html` section structure (`#home`, `#belief`, etc.)

**What to salvage:**
- Public section IDs (`id="home"`, `id="belief"`) for accessibility and hash navigation
- CSS variable naming conventions (`--aod-transition-progress`, `--timeline-target-opacity`)
- Existing visual layer selectors (`[data-aod-sun-layer]`, `[data-aod-cloud-layer]`)

**Rationale:**
- Public IDs must remain for semantic HTML and direct hash linking (`/#belief`)
- CSS variable patterns are already proven and don't need refactoring
- Reusing variable names means less CSS rewrite

**Migration Impact:** Low. Master mode adds new CSS rules but doesn't remove existing variable-driven styling.

---

### REBUILD (Replace Completely)

#### 1. Timeline Control Mechanism
**Old:** `homepage-transition-runtime.js` lines 208-826 (`createHomepageSnapCoordinator`)
- Scroll-driven progress from `createElementScrollProgressSource()` (lines 127-135)
- Snap entry detection: `scrollY >= stagedForwardEntry` (line 677)
- `playController(controller, direction)` with RAF-driven `animateProgress()` (lines 596-640)
- Scroll lock via Lenis and scroll event blocking (lines 351-362)

**New:** Master runtime state machine (from plan Task 11)
- Time-driven autoplay with `playForward()` / `playReverse()` methods
- 10vh armed zone for snap triggers (not viewport intersection)
- Timeline coordinator owns RAF loop, not individual adapters
- Progress distributed to producers via `producerRegistry.render(blockProgress)`

**Why rebuild:**
- Scroll progress source fundamentally incompatible with master sticky stage
- Snap coordinator couples scroll lock to playback; master needs independent control
- RAF loops in adapters create duplicate animation ownership; master compositor needs single source of truth

**Migration Impact:** High. This is the core architectural change enabling Strategy A.

**Code deletion:**
```javascript
// DELETE: lines 127-157 (scroll progress sources)
function createElementScrollProgressSource(element) { /*...*/ }
function createHeroLinkedScrollProgressSource(element) { /*...*/ }

// DELETE: lines 208-826 (entire snap coordinator)
function createHomepageSnapCoordinator({ reduceMotion, scrollRuntime, /*...*/ }) {
  // 600+ lines of scroll-driven snap logic
}
```

**New structure:**
```javascript
// NEW: master-runtime-coordinator.js
export function createMasterRuntimeCoordinator({ timeline, producers, compositor }) {
  let raf = 0;
  let currentBlock = null;
  
  function playForward(blockId) {
    const block = timeline.getBlock(blockId);
    const target = block.targetProgress;
    animateBlockProgress(block, target, () => {
      compositor.render(block.progress);
      producers.renderAll(block.progress);
    });
  }
  
  return { playForward, playReverse, seek };
}
```

---

#### 2. Scroll Trigger Logic
**Old:** `homepage-transition-runtime.js` lines 641-688 (`updateControllerState`)
- Viewport intersection math: `hostTop - viewportHeight * controller.snapEntryVh` (line 649)
- Forward entry at `scrollY >= stagedForwardEntry` (line 677)
- Backward entry at `scrollY <= backwardEntry` (line 684)

**New:** 10vh armed zone from scroll-map
- Master scroll map converts scroll position to timeline VH
- Armed zone: timeline position within 10vh of block boundary
- Snap trigger when scroll direction changes within armed zone

**Why rebuild:**
- Viewport intersection cannot work when master stage is sticky (stage doesn't scroll)
- Old logic measures `hostTop` of `[data-transition-id]` elements; master has no transition hosts
- Armed zone based on timeline coordinates, not DOM element positions

**Migration Impact:** High. Requires `master-scroll-map.js` rewrite to track timeline geometry.

**Code deletion:**
```javascript
// DELETE: lines 641-688
function updateControllerState(controller, scrollY, direction) {
  const hostTop = getDocumentTop(controller.host); // ❌ No host in master mode
  const forwardEntry = hostTop - viewportHeight * controller.snapEntryVh; // ❌ Viewport intersection
  if (scrollY >= stagedForwardEntry) playController(controller, 1); // ❌ Scroll-driven
}
```

**New structure:**
```javascript
// NEW: from plan Task 3, master-scroll-map.js
export function createMasterScrollMap({ track, totalVh }) {
  function scrollYForTimelineVh(vh) {
    return state.startY + (vh / totalVh) * state.scrollablePx;
  }
  
  function getArmedBlock(scrollY) {
    const timelineVh = ((scrollY - state.startY) / state.scrollablePx) * totalVh;
    return blocks.find(block => 
      Math.abs(timelineVh - block.startVh) < 10 // 10vh armed zone
    );
  }
  
  return { scrollYForTimelineVh, getArmedBlock };
}
```

---

#### 3. Seek/Scrub Patterns
**Old:** Adapter-local progress sources (lines 872-882)
```javascript
const progressSource = isScrollDriven
  ? createElementScrollProgressSource(host)
  : () => snapController.progressSource();

await mount({
  host,
  progressSource, // Each adapter reads progress independently
  timeline,
  gsap,
  ScrollTrigger
});
```

**New:** Centralized producer rendering
```javascript
// From plan Section 6, producer contract
export function createAodSurfaceProducer(context) {
  return {
    render({ localProgress, blockProgress, timelineProgress, state }) {
      // Receives progress from master runtime, does not poll scroll
      drawFrame(localProgress);
    }
  };
}
```

**Why rebuild:**
- Old pattern: each adapter polls scroll via `progressSource()`
- New pattern: master runtime pushes progress to all producers in one RAF tick
- Prevents desync where different adapters read scroll at different times

**Migration Impact:** Moderate. Changes producer contract but visual rendering logic is salvaged.

---

### ADAPT (Modify Carefully)

#### 1. Adapters Must Expose playForward/playReverse
**Old signature:**
```javascript
// From homepage-transition-registry.js, adapter mount returns RAF cleanup
export async function mountHomepageTransition({ host, progressSource, timeline }) {
  let raf = 0;
  function tick() {
    const progress = progressSource(); // Adapter polls scroll
    renderTransition(progress);
    raf = requestAnimationFrame(tick);
  }
  tick();
  return { destroy: () => cancelAnimationFrame(raf) };
}
```

**New signature:**
```javascript
// Producers are not adapters; they receive push-based render calls
export function createAodSurfaceProducer(context) {
  return {
    mount(surfaceEntry) { /* one-time setup */ },
    render({ localProgress, blockProgress, state }) { /* draw frame */ },
    destroy() { /* cleanup */ }
  };
}
```

**Why adapt:**
- Old adapters own RAF loop; new producers are passive render targets
- Master runtime owns playback timing; producers just draw when told
- This enables compositor to sample all surfaces in sync

**Migration checklist for each transition:**
- [ ] Extract rendering logic from `mountHomepageTransition()`
- [ ] Remove RAF loop and `progressSource` polling
- [ ] Wrap in producer contract with `render({ localProgress })`
- [ ] Draw into canvas texture, not just set CSS variables
- [ ] Call `markReady(surfaceEntry, canvas)` when texture is valid

**Example adaptation:**
```javascript
// OLD: js/transitions/homepage/aod-homepage-adapter.js
export async function mountHomepageTransition({ host, progressSource }) {
  let raf = 0;
  function tick() {
    const progress = progressSource();
    renderAodTransitionProgress(host, progress); // ← SALVAGE THIS
    raf = requestAnimationFrame(tick);
  }
  tick();
  return { destroy: () => cancelAnimationFrame(raf) };
}

// NEW: js/transitions/homepage/aod-surface-producer.js
export function createAodSurfaceProducer(context) {
  const canvas = context.texture;
  const ctx = canvas.getContext('2d');
  
  return {
    render({ localProgress }) {
      renderAodTransitionProgress(hostElement, localProgress); // ← REUSED
      drawCurrentFrameToCanvas(ctx, figureVideo, localProgress); // ← NEW
    }
  };
}
```

---

#### 2. Manifest Structure Needs homepageTimeline Schema
**Old:** `scene-timeline-manifest.js` (lines 1-328)
- `timelineScenes` with `copySelectors` array (lines 3-148)
- `timelineJoins` with `progressPolicy`, `sourceOut`, `targetIn` ranges (lines 150-327)
- Used by `scene-timeline-controller.js` (deleted in plan)

**New:** Must extend for master runtime
- Add `surfaceKey` mapping: which `[data-master-surface]` canvas each scene renders to
- Add `blockType`: `'hold'`, `'transition'`, or `'bridge'`
- Keep `commitAt`, `presentAt`, `cleanupAt` timing (plan lines 82-113 already use these)

**Adapt manifest:**
```javascript
// KEEP: timelineJoins structure
export const timelineJoins = [
  {
    id: "home-belief",
    transitionId: "home-belief",
    fromScene: "home",
    toScene: "belief",
    sourceOut: [0.72, 0.98],
    targetIn: [0.3, 0.62],
    commitAt: 0.72,
    presentAt: 0.8,
    cleanupAt: 0.96
  }
];

// ADD: surface mapping
export const surfaceManifest = [
  { sceneId: "home", surfaceKey: "home.visual", producer: "hero" },
  { sceneId: "belief", surfaceKey: "belief.star", producer: "belief-star" },
  { bridgeId: "belief-method", surfaceKey: "aod.bridge", producer: "aod" }
];
```

**Why adapt, not rebuild:**
- Existing `commitAt`/`presentAt` timing is correct (from plan Section 1, line 57)
- Copy selectors are already correct (plan Task 8 reuses them)
- Only need to add surface routing for producers

**Migration Impact:** Low. Manifest extends but doesn't break existing structure.

---

#### 3. Snap Behavior from CSS to JS-Controlled
**Old:** CSS scroll-snap + snap coordinator scroll lock
```css
.homepage-transition--snapped {
  /* CSS manages fixed positioning during snap */
}
```
```javascript
// Scroll lock in snap coordinator (lines 351-362)
function lockScroll() {
  scrollLockDepth += 1;
  root.documentElement?.classList?.add('homepage-transition-snap-active');
  lenis?.stop?.();
}
```

**New:** Master stage sticky positioning + scroll range preservation
```css
/* From plan Task 3 */
html[data-master-dom-mode="master-visible"] [data-homepage-master-stage] {
  position: sticky;
  top: 0;
  height: 100dvh;
}

[data-homepage-master-scroll-spacer] {
  height: calc(var(--homepage-master-track-vh, 1) * 1vh);
}
```

**Why adapt:**
- Snap behavior must move from scroll event blocking to scroll-range geometry
- CSS sticky stage stays in viewport, but scroll range is preserved by spacer
- No scroll lock needed; scroll drives timeline progress without stopping

**Migration Impact:** Moderate. CSS changes in Task 3, but snap coordinator deletion is in rebuild category.

---

## Consequences

### Positive
1. **Salvaging visual renderers** cuts implementation time by 3-5 days (from plan estimate)
2. **Reusing WebGL shaders** preserves production-proven ink effects without GPU code rewrite
3. **Keeping CSS variables** minimizes styling churn and regression risk
4. **Rebuilding timeline control** enables true master takeover (Strategy A requirement)

### Negative
1. **Adapter → producer migration** requires touching all 8 transition files
2. **Loss of scroll-driven progress** means existing ScrollTrigger-based adapters cannot run in master mode (intentional per plan)
3. **Manifest extension** requires careful schema design to avoid breaking existing timeline controller

### Risks
1. **Salvaged rendering logic** assumes specific DOM structure; if master copy/surface layers differ, CSS variable application may fail
2. **WebGL shader reuse** assumes canvas texture dimensions match old stage dimensions; resolution mismatches could cause visual artifacts
3. **Producer timing** depends on manifest `commitAt`/`presentAt` being correct; if timings drift from old adapters, visual reveals will desync

### Mitigation
- **Task 0 baseline screenshots** (plan lines 203-322): capture legacy visual output before salvage integration
- **Task 7 fidelity comparison** (plan lines 912-1199): compare salvaged producer output against baseline before Strategy A decision
- **Targeted CDP probes** (plan lines 673-718, 1016-1081): verify non-empty canvas pixels before final acceptance

---

## References

### Plan Sections
- **Section 1 (Current Verified State):** Lines 49-63 confirm adapters currently mount, must be removed
- **Section 2 (Non-Negotiable Invariants):** Lines 65-93 require single runtime, real surfaces, no adapters
- **Task 5 (Guard Legacy Adapters):** Lines 779-831 explicitly stops adapter mounting in master mode
- **Task 6 (Smoke Producers):** Lines 833-908 replaces observer producers with deterministic drawing
- **Task 7 (Real Visual Producers):** Lines 910-1199 requires real assets, not smoke/fallback
- **Task 8 (Copy Migration):** Lines 1201-1340 reuses existing copy selectors from manifest

### Source Files
- `js/transitions/homepage-transition-runtime.js` (911 lines): scroll-driven snap coordinator, rebuild target
- `js/transitions/homepage/scene-timeline-controller.js` (250 lines): already deleted per plan line 62
- `js/effects/ink-scene-transition.js` (904 lines): salvage entire file as drawing primitive
- `js/components/aod-transition.js` (295 lines): salvage `renderAodTransitionProgress` (lines 115-129)
- `js/transitions/homepage/scene-timeline-manifest.js` (328 lines): adapt with surface mapping

### Related ADRs
- None yet; this is the first ADR for homepage master timeline migration

---

**Decision Maker:** Migration implementation team  
**Stakeholders:** Frontend architecture, visual design fidelity owners, CDP audit reviewers
