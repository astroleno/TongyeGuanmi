# Complete Master Timeline Migration - Implementation Plan

**Date:** 2026-06-27
**Branch:** codex/homepage-directed-scene-timeline
**Goal:** Complete the Master Timeline migration and create Timeline Debug HUD component
**Estimated Effort:** 2-3 days

---

## Overview

Based on the architecture review, the Master Timeline infrastructure is 70% complete. This plan covers:

1. **Phase 1:** Complete adapter migration (Pattern Bloom, AOD, Figure2, Figure3, Crane)
2. **Phase 2:** Remove legacy ownership code
3. **Phase 3:** Create Timeline Debug HUD component
4. **Phase 4:** Verification and optimization

**Current Blockers:**
- Pattern Bloom adapter still calls `timeline?.updateJoin()` and creates local ink instances
- AOD and other adapters create adapter-local ink transitions
- Legacy ownership code still present in codebase
- HUD is not componentized

---

## Phase 1: Complete Adapter Migration

### Task 1: Migrate Pattern Bloom Adapter

**Goal:** Remove legacy API calls and local ink creation from Pattern Bloom

**Files:**
- Modify: `js/transitions/pattern-bloom-adapter.js`
- Create: Surface producer exports in adapter
- Test: `scripts/check-homepage-master-timeline.mjs`

#### Step 1: Remove legacy timeline ownership calls

Current code to remove:
```javascript
// Lines 213, 221
timeline?.updateJoin('home-belief', progress, { ... });
timeline?.updateJoin('belief-upper-lower', progress, { ... });

// Lines 230-232
const upperOwnership = timeline?.getOwnership?.('home-belief');
const lowerOwnership = timeline?.getOwnership?.('belief-upper-lower');
```

#### Step 2: Remove local ink transition creation

Remove:
```javascript
// Lines 83-95, 96-108
const revealInkTransition = createInkSceneTransition(revealInkCanvas, { ... });
const exitInkTransition = createInkSceneTransition(exitInkCanvas, { ... });
```

#### Step 3: Convert to lifecycle-only adapter

Replace mount function with:

```javascript
export function mountPatternBloomTransition({
  host,
  segments,
  registry,
  presenter,
  addCleanup
} = {}) {
  if (!host || host.dataset.patternBloomMounted === 'true') {
    return { destroy() {} };
  }

  host.dataset.patternBloomMounted = 'true';

  // Cleanup only
  const destroy = () => {
    delete host.dataset.patternBloomMounted;
  };

  addCleanup?.(destroy);

  return {
    render(state) {
      // Lifecycle hooks only - no rendering
      if (state.segment?.id === 'home-to-belief-upper') {
        // Optional: trigger events, update state
      }
      if (state.segment?.id === 'belief-upper-to-belief-lower') {
        // Optional: trigger events, update state
      }
    },
    renderIdle() {},
    destroy
  };
}
```

#### Step 4: Create Belief Star Surface Producer

Add to `js/sections/belief.js`:

```javascript
import { prepareSurface } from '../transitions/homepage/master-surface-renderer.js';

export function createBeliefStarSurfaceProducer({ registry, surfaceEntry }) {
  const canvas = surfaceEntry.textureProvider();

  // Initialize bloom animation
  let bloomScene = null;

  const initBloomScene = () => {
    if (!bloomScene) {
      // Import and create bloom scene
      bloomScene = createPatternBloomScene(canvas);
    }
    return bloomScene;
  };

  return {
    renderAt({ timelineProgress, blockProgress, localProgress, segmentId, state }) {
      prepareSurface(surfaceEntry);

      const scene = initBloomScene();

      // Render based on timeline position
      if (segmentId === 'home-to-belief-upper') {
        // Bloom reveal animation
        scene.renderReveal(localProgress);
      } else if (segmentId === 'belief-upper-to-belief-lower') {
        // Bloom transition animation
        scene.renderTransition(localProgress);
      } else {
        // Idle/settled state
        scene.renderIdle(timelineProgress);
      }
    },
    renderIdle({ timelineProgress }) {
      const scene = initBloomScene();
      scene.renderIdle(timelineProgress);
    },
    destroy() {
      bloomScene?.destroy?.();
      bloomScene = null;
    }
  };
}
```

#### Step 5: Register surface producer

In `js/transitions/homepage-transition-registry.js`:

```javascript
export const homepageSurfaceProducerRegistry = {
  // ... existing producers
  'belief-star': async (context) => (await import('../sections/belief.js')).createBeliefStarSurfaceProducer(context),
};
```

#### Step 6: Verify migration

```bash
npm run build:page
npm run verify:homepage-master-timeline
```

Expected: No errors related to Pattern Bloom legacy APIs

---

### Task 2: Migrate AOD Adapter

**Goal:** Convert AOD to surface producer pattern

**Files:**
- Modify: `js/transitions/homepage/aod-homepage-adapter.js`

#### Step 1: Remove local ink creation

Remove:
```javascript
createInkCurtainTransition(...)
```

#### Step 2: Export surface producer

```javascript
import { prepareSurface } from './master-surface-renderer.js';

export function createAodSurfaceProducer({ registry, surfaceEntry }) {
  return {
    renderAt({ localProgress, state, surfaceKey }) {
      const bridgeSurface = prepareSurface(registry.surfaceFor('aod.bridge'));

      // Render AOD visual to bridge surface
      renderAodBridge(bridgeSurface, localProgress, {
        sourceScene: state.scenes.get('belief.lower'),
        targetScene: state.scenes.get('method')
      });
    },
    renderIdle() {},
    destroy() {}
  };
}

export function mountHomepageTransition({ host, segments, registry, presenter }) {
  return {
    render(state) {
      if (state.segment?.id !== 'belief-lower-to-method') return;
      // Lifecycle hooks only
    },
    renderIdle() {},
    destroy() {}
  };
}
```

#### Step 3: Register producer

```javascript
'aod': async (context) => (await import('./homepage/aod-homepage-adapter.js')).createAodSurfaceProducer(context),
```

---

### Task 3: Migrate Figure2 Adapter

**Files:**
- Modify: `js/transitions/homepage/figure2-homepage-adapter.js`

#### Step 1: Remove ink creation and proof reparenting

Remove:
```javascript
createInkCurtainTransition(...)
appendChild(proof...)
```

#### Step 2: Export surface producer with deterministic video seek

```javascript
export function createFigure2SurfaceProducer({ registry, surfaceEntry }) {
  let video = null;

  return {
    renderAt({ localProgress, segmentId, state }) {
      const surface = prepareSurface(surfaceEntry);

      if (!video) {
        video = surface.querySelector('video') || surface;
      }

      if (!(video instanceof HTMLVideoElement)) return;

      // Deterministic video seek - no playback
      video.pause();
      const clipStart = 0;
      const clipEnd = video.duration || 10;
      video.currentTime = clipStart + localProgress * (clipEnd - clipStart);
    },
    destroy() {
      video = null;
    }
  };
}
```

---

### Task 4: Migrate Figure3 Adapter

**Files:**
- Modify: `js/transitions/homepage/figure3-homepage-adapter.js`

Similar pattern to Figure2 - remove ink creation, add surface producer.

---

### Task 5: Migrate Crane Adapter

**Files:**
- Modify: `js/transitions/homepage/crane-homepage-adapter.js`

Similar pattern - remove ink creation, add surface producer.

---

### Task 6: Verify All Adapters Migrated

```bash
# Check for legacy API usage
grep -n "timeline?.updateJoin\|timeline?.getOwnership" js/transitions/**/*.js

# Should return: no matches

# Check for local ink creation
grep -n "createInkCurtainTransition\|createInkSceneTransition" js/transitions/homepage/*-adapter.js

# Should return: no matches (except imports in master-ink-compositor.js)

# Run verification
npm run verify:homepage-master-timeline
```

Expected: All checks pass

---

## Phase 2: Remove Legacy Code

### Task 7: Remove Legacy Timeline Controller

**Files:**
- Delete: `js/transitions/homepage/scene-timeline-controller.js`
- Modify: Any files importing it

#### Step 1: Verify no imports

```bash
grep -r "scene-timeline-controller" js/transitions/
```

Expected: No matches in homepage runtime or adapters

#### Step 2: Remove file

```bash
git rm js/transitions/homepage/scene-timeline-controller.js
```

---

### Task 8: Clean Legacy CSS

**Files:**
- Modify: `css/components/homepage-continuity.css`

Remove selectors:
```css
[data-timeline-foreground-blocked] { ... }
.homepage-timeline-copy-active { ... }
.homepage-timeline-source-active { ... }
[data-timeline-fixed] { ... }
```

---

### Task 9: Remove ownershipWindows from manifest

**Files:**
- Modify: `src/section-manifest.mjs`

Remove:
```javascript
export const ownershipWindows = [...];
```

Update static checks to assert it's undefined.

---

## Phase 3: Create Timeline Debug HUD Component

### Task 10: Create Timeline Debug HUD Component

**Goal:** Convert ultrathink HUD into reusable debug component

**Files:**
- Create: `js/debug/timeline-debug-hud.js`
- Create: `css/debug/timeline-debug-hud.css`

#### Step 1: Create HUD component module

```javascript
// js/debug/timeline-debug-hud.js

export function createTimelineDebugHUD({
  model,
  registry,
  getCurrentState,
  container = document.body
}) {
  // Create HUD DOM
  const hud = document.createElement('div');
  hud.className = 'timeline-debug-hud';
  hud.innerHTML = `
    <div class="timeline-debug-hud__header">
      <h3>Timeline Debug</h3>
      <button class="timeline-debug-hud__toggle">Toggle</button>
    </div>
    <div class="timeline-debug-hud__body">
      <div class="timeline-debug-hud__section">
        <h4>Timeline Position</h4>
        <div class="timeline-debug-hud__progress-bar">
          <div class="timeline-debug-hud__progress-fill"></div>
        </div>
        <div class="timeline-debug-hud__stats">
          <span class="hud-stat" data-stat="scrollVh">0 vh</span>
          <span class="hud-stat" data-stat="segment">-</span>
          <span class="hud-stat" data-stat="progress">0%</span>
        </div>
      </div>

      <div class="timeline-debug-hud__section">
        <h4>Active Scenes</h4>
        <div class="timeline-debug-hud__scenes"></div>
      </div>

      <div class="timeline-debug-hud__section">
        <h4>Surfaces</h4>
        <div class="timeline-debug-hud__surfaces"></div>
      </div>

      <div class="timeline-debug-hud__section">
        <h4>Ink State</h4>
        <div class="timeline-debug-hud__ink"></div>
      </div>
    </div>
  `;

  container.appendChild(hud);

  let isOpen = true;
  let scrubbing = false;

  const toggle = hud.querySelector('.timeline-debug-hud__toggle');
  toggle.addEventListener('click', () => {
    isOpen = !isOpen;
    hud.classList.toggle('is-closed', !isOpen);
  });

  // Update HUD with current state
  function update(state) {
    if (!state) return;

    // Update progress
    const progressBar = hud.querySelector('.timeline-debug-hud__progress-fill');
    const progressPct = (state.scrollVh / model.totalVh) * 100;
    progressBar.style.width = `${progressPct}%`;

    // Update stats
    hud.querySelector('[data-stat="scrollVh"]').textContent =
      `${state.scrollVh.toFixed(1)} / ${model.totalVh.toFixed(1)} vh`;
    hud.querySelector('[data-stat="segment"]').textContent =
      state.segment?.id || 'hold';
    hud.querySelector('[data-stat="progress"]').textContent =
      `${(state.localProgress * 100).toFixed(1)}%`;

    // Update scenes
    const scenesContainer = hud.querySelector('.timeline-debug-hud__scenes');
    scenesContainer.innerHTML = '';
    for (const [sceneId, sceneState] of state.scenes.entries()) {
      if (!sceneState.active) continue;

      const sceneEl = document.createElement('div');
      sceneEl.className = 'hud-scene';
      sceneEl.innerHTML = `
        <strong>${sceneId}</strong>
        <span class="hud-scene__role">${sceneState.role}</span>
        <div class="hud-scene__visual">
          opacity: ${sceneState.visual.opacity.toFixed(2)},
          y: ${sceneState.visual.translateY.toFixed(0)}px
        </div>
        <div class="hud-scene__copy">
          opacity: ${sceneState.copy.opacity.toFixed(2)},
          readable: ${sceneState.copy.readable}
        </div>
      `;
      scenesContainer.appendChild(sceneEl);
    }

    // Update surfaces
    const surfacesContainer = hud.querySelector('.timeline-debug-hud__surfaces');
    surfacesContainer.innerHTML = '';
    for (const [surfaceKey, surfaceEntry] of registry.surfaceEntries()) {
      const surfaceEl = document.createElement('div');
      surfaceEl.className = 'hud-surface';

      let textureStatus = 'unknown';
      try {
        const texture = surfaceEntry.textureProvider();
        textureStatus = texture ? 'ready' : 'missing';
      } catch (e) {
        textureStatus = 'error';
      }

      surfaceEl.innerHTML = `
        <span>${surfaceKey}</span>
        <span class="hud-surface__status hud-surface__status--${textureStatus}">
          ${textureStatus}
        </span>
      `;
      surfacesContainer.appendChild(surfaceEl);
    }

    // Update ink state
    const inkContainer = hud.querySelector('.timeline-debug-hud__ink');
    if (state.segment?.transition?.type === 'ink') {
      const inkConfig = state.segment.transition.ink;
      inkContainer.innerHTML = `
        <div>Variant: ${inkConfig.variant}</div>
        <div>Source: ${inkConfig.sourceSurfaceKey}</div>
        <div>Target: ${inkConfig.targetSurfaceKey}</div>
        <div>Window: [${inkConfig.window?.[0]?.toFixed(2)}, ${inkConfig.window?.[1]?.toFixed(2)}]</div>
      `;
    } else {
      inkContainer.innerHTML = '<em>No ink transition</em>';
    }
  }

  // Enable scrubbing
  function enableScrubbing(onScrub) {
    const progressBar = hud.querySelector('.timeline-debug-hud__progress-bar');

    progressBar.addEventListener('mousedown', (e) => {
      scrubbing = true;
      handleScrub(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (!scrubbing) return;
      handleScrub(e);
    });

    window.addEventListener('mouseup', () => {
      scrubbing = false;
    });

    function handleScrub(e) {
      const rect = progressBar.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const scrollVh = x * model.totalVh;
      onScrub(scrollVh);
    }
  }

  return Object.freeze({
    update,
    enableScrubbing,
    show() {
      hud.style.display = 'block';
    },
    hide() {
      hud.style.display = 'none';
    },
    destroy() {
      hud.remove();
    }
  });
}
```

#### Step 2: Create HUD styles

```css
/* css/debug/timeline-debug-hud.css */

.timeline-debug-hud {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 400px;
  max-height: 80vh;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.9);
  color: #fff;
  font-family: monospace;
  font-size: 12px;
  border-radius: 8px;
  padding: 16px;
  z-index: 10000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.timeline-debug-hud.is-closed .timeline-debug-hud__body {
  display: none;
}

.timeline-debug-hud__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  border-bottom: 1px solid #333;
  padding-bottom: 8px;
}

.timeline-debug-hud__header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: bold;
}

.timeline-debug-hud__toggle {
  background: #333;
  border: none;
  color: #fff;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 4px;
}

.timeline-debug-hud__section {
  margin-bottom: 16px;
}

.timeline-debug-hud__section h4 {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: #888;
  text-transform: uppercase;
}

.timeline-debug-hud__progress-bar {
  height: 24px;
  background: #222;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  margin-bottom: 8px;
}

.timeline-debug-hud__progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4CAF50, #8BC34A);
  transition: width 0.1s linear;
}

.timeline-debug-hud__stats {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.hud-stat {
  padding: 4px 8px;
  background: #222;
  border-radius: 4px;
}

.hud-scene {
  padding: 8px;
  background: #1a1a1a;
  border-radius: 4px;
  margin-bottom: 8px;
  border-left: 3px solid #4CAF50;
}

.hud-scene strong {
  display: block;
  margin-bottom: 4px;
}

.hud-scene__role {
  display: inline-block;
  padding: 2px 6px;
  background: #333;
  border-radius: 3px;
  font-size: 10px;
  margin-left: 8px;
}

.hud-scene__visual,
.hud-scene__copy {
  font-size: 11px;
  color: #888;
  margin-top: 4px;
}

.hud-surface {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  border-bottom: 1px solid #222;
}

.hud-surface__status {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
}

.hud-surface__status--ready {
  background: #4CAF50;
  color: #000;
}

.hud-surface__status--missing {
  background: #FFC107;
  color: #000;
}

.hud-surface__status--error {
  background: #F44336;
  color: #fff;
}
```

---

### Task 11: Integrate HUD into Master Runtime

**Files:**
- Modify: `js/transitions/homepage-transition-runtime.js`

Add HUD initialization in development mode:

```javascript
import { createTimelineDebugHUD } from '../debug/timeline-debug-hud.js';

async function createHomepageMasterRuntime(options = {}) {
  // ... existing setup

  // Create HUD in development mode
  let debugHUD = null;
  if (options.enableDebugHUD || document.documentElement.dataset.debugTimeline === 'true') {
    debugHUD = createTimelineDebugHUD({
      model: masterTimelineModel,
      registry: masterSceneRegistry,
      getCurrentState: () => previousMasterState
    });

    // Enable scrubbing
    debugHUD.enableScrubbing((scrollVh) => {
      window.scrollTo({
        top: masterScrollMap.scrollYForPosition(scrollVh),
        behavior: 'auto'
      });
    });
  }

  function renderMasterTimelineFrame() {
    // ... existing render logic

    // Update HUD
    debugHUD?.update(state);
  }

  return {
    start: startMasterTimelineRuntime,
    destroy() {
      destroyMasterTimelineRuntime();
      debugHUD?.destroy();
    }
  };
}
```

---

### Task 12: Add HUD Toggle via URL Parameter

Enable HUD with `?debug=timeline`:

```javascript
// js/transitions/homepage-transition-runtime.js

const urlParams = new URLSearchParams(window.location.search);
const enableDebugHUD = urlParams.get('debug') === 'timeline'
  || document.documentElement.dataset.debugTimeline === 'true';
```

---

## Phase 4: Verification and Optimization

### Task 13: Run Static Verification

```bash
# Build page
npm run build:page

# Run all homepage checks
npm run verify:homepage-master-timeline
npm run verify:homepage-timeline
npm run verify:homepage-visual-timeline
npm run verify:handoff-ownership
npm run verify:all

# Verify no legacy API usage
grep -r "timeline?.updateJoin\|timeline?.getOwnership\|createInkCurtainTransition" js/transitions/homepage/ js/transitions/pattern-bloom-adapter.js

# Should return: no matches (except in master-ink-compositor.js)
```

---

### Task 14: Browser Testing

**Test Checklist:**

- [ ] Load page with `?debug=timeline`
- [ ] Verify HUD appears and shows timeline state
- [ ] Scroll through all segments
- [ ] Verify no duplicate scenes
- [ ] Verify no blank ink frames
- [ ] Test scrubbing via HUD progress bar
- [ ] Test forward scroll direction
- [ ] Test reverse scroll direction
- [ ] Verify belief.upper and belief.lower transition smoothly
- [ ] Verify Figure2 video seeks deterministically
- [ ] Verify all surface producers render correctly

**Browser Audit (if authorized):**

```bash
npm run audit:homepage-directed-timeline -- \
  --focused-bridges \
  --segments=home-to-belief-upper,belief-upper-to-belief-lower,belief-lower-to-method,method-proof-to-brand,brand-to-services,philosophy-to-contact
```

---

### Task 15: Performance Optimization

#### Verify RAF efficiency

- [ ] Confirm only one RAF loop for master timeline
- [ ] Confirm no adapter-local RAF loops
- [ ] Profile with Chrome DevTools Performance tab
- [ ] Target 60fps during scroll

#### Optimize surface producers

- [ ] Cache texture providers
- [ ] Avoid unnecessary canvas redraws
- [ ] Use `prepareSurface()` efficiently

---

## Acceptance Criteria

### Critical (Must Pass)

- [ ] No legacy API calls in any adapter (`timeline?.updateJoin`, `timeline?.getOwnership`)
- [ ] No adapter-local ink creation (`createInkCurtainTransition` in adapters)
- [ ] All adapters use surface producer pattern
- [ ] Static verification passes: `npm run verify:all`
- [ ] Timeline Debug HUD component works with `?debug=timeline`
- [ ] HUD shows accurate timeline state in real-time
- [ ] Scrubbing works via HUD progress bar

### Important (Should Pass)

- [ ] No visual regressions during scroll
- [ ] Belief upper/lower transition smoothly
- [ ] Figure2 video seeks deterministically
- [ ] All surfaces render correctly
- [ ] Forward and reverse scroll symmetrical

### Nice to Have

- [ ] Browser audit passes (if authorized)
- [ ] Performance profiling shows 60fps
- [ ] HUD has additional debugging features (scene inspector, surface texture preview)

---

## Rollback Plan

If critical issues discovered:

1. **Revert adapter changes:**
   ```bash
   git checkout HEAD -- js/transitions/pattern-bloom-adapter.js
   git checkout HEAD -- js/transitions/homepage/aod-homepage-adapter.js
   # ... etc
   ```

2. **Re-enable legacy ownership:**
   ```bash
   git checkout HEAD -- src/section-manifest.mjs
   npm run build:page
   ```

3. **Disable master timeline flag:**
   ```bash
   # In scripts/build-index.mjs
   data-master-timeline-enabled="false"
   ```

---

## Estimated Timeline

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Phase 1: Adapter Migration | 1-6 | 1 day |
| Phase 2: Legacy Cleanup | 7-9 | 0.5 day |
| Phase 3: HUD Component | 10-12 | 0.5 day |
| Phase 4: Verification | 13-15 | 0.5 day |
| **Total** | | **2.5 days** |

---

## Next Steps

1. Start with Task 1 (Pattern Bloom migration)
2. Run verification after each task
3. Commit incrementally
4. Test in browser before moving to next task
5. Create HUD component after all adapters migrated
6. Final verification and optimization

---

**End of Implementation Plan**
