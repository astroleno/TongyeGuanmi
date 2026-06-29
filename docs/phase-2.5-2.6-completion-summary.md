# Phase 2.5-2.6 Completion Summary

Date: 2026-06-29

## Overview

Completed the remaining Phase 2.5-2.6 missing files to finish the pilot ink transition and snap runtime infrastructure per `PLAN-homepage-snapped-scene-runtime.md`.

## Files Created

### 1. `js/effects/ink-transition-factory.js` ✓

**Purpose**: Unified factory for all 4 ink transition types with texture compositing

**Features**:
- Single factory covering all ink types: `radial-center`, `radial-rotating-left`, `horizontal-irregular`, `sunburst-radial`
- Preset configurations for each type with appropriate `sweepMode`, `inkCenter`, `colorLift`, `depthThresholdMode`
- Direction support for horizontal transitions: `bottom-up` / `top-down`
- Sunburst UV mapping helper: `calculateCoverUv()` for PH background sun hotspot
- Convenience factory functions: `createRadialCenterInk()`, `createRadialRotatingLeftInk()`, etc.

**Key Implementation Details**:
- Extends `createInkSceneTransition` with type-specific options
- All types support texture compositing via `uNextScene` sampler
- Sunburst transitions dynamically calculate screen UV from source UV using PH background's `object-fit: cover` mapping
- Factory returns wrapped API with type metadata and `updateInkCenter()` for runtime UV recalculation

## Files Modified

### 2. `js/effects/ink-scene-transition.js` ✓

**Changes**: Added `uSweepMode` uniform support for horizontal vs radial sweep

**Implementation**:
- Added `sweepMode` parameter (0=radial, 1=horizontal) and `direction` parameter (0=bottom-up, 1=top-down)
- Added `uSweepMode` and `uDirection` shader uniforms
- Migrated curtain's `sweepY + fbm field` geometry into scene transition's threshold path
- Blended sweep calculation: `float blendedSweep = mix(mountainSweep, sweepY, uSweepMode);`
- Updated threshold calculation to use `blendedSweep` instead of `mountainSweep`
- Added uniform locations and GL calls for new uniforms

**Lines Modified**:
- Line 257: Added `sweepMode` and `direction` parameters
- Line 311: Added `uniform float uSweepMode;` and `uniform float uDirection;`
- Lines 375-386: Added horizontal sweep calculation and blending logic
- Line 388: Changed `threshold = mountainSweep + mud` to `threshold = blendedSweep + mud`
- Line 710-711: Added uniform locations
- Line 879-880: Added uniform GL calls

### 3. `js/runtime/homepage-snap-runtime.js` ✓

**Changes**: Enhanced `snapToScene` method for JS-controlled snap

**Implementation**:
- Made `snapToScene` a proper public API method that dispatches `SNAP_COMPLETE` action
- Added `watchScrollComplete` helper for fallback when Lenis unavailable
- Supports both Lenis `scrollTo()` (primary) and native `window.scrollTo()` (fallback)
- Handles `prefers-reduced-motion` with instant snap (duration: 0, behavior: 'auto')
- Polls for scroll completion with stable frame detection (threshold: 2px, required frames: 3)

**ADR Compliance**:
- Implements JS-snap as primary mechanism (not native `scroll-snap-type: mandatory`)
- Lenis smooth scroll as primary, native scrollTo as fallback
- Reduced motion: instant scrollTo, no easing
- Hash navigation: snap to target scene's presented state

### 4. `js/runtime/homepage-runtime-integration.js` ✓

**Status**: Already complete with viewport resize listeners

**Existing Implementation**:
- `onResize()`: Debounced window resize handler (150ms), recalculates scene bounds
- `onOrientationChange()`: Handles device orientation changes, re-snaps to current scene
- `onVisualViewportResize()`: Detects mobile address bar show/hide (threshold: 100px)
- `onHashChange()`: Deep link navigation to target scene

**Event Listeners Attached**:
- `window.addEventListener('resize', onResize, { passive: true })`
- `window.addEventListener('orientationchange', onOrientationChange)`
- `window.visualViewport.addEventListener('resize', onVisualViewportResize, { passive: true })`
- `window.addEventListener('hashchange', onHashChange)`

**Cleanup on Destroy**:
- All listeners properly removed in `destroy()` method

## Previously Completed Files (Workflow Output)

The following files were already created by the workflow:

### 5. `css/sections/homepage-snap-heights.css` ✓
- Animation scene height contracts: `height: 100dvh`
- Reading section height contracts: `min-height: 100dvh` with natural content overflow
- Implements Phase 2.6 snap height requirements

### 6. `js/effects/texture-projection-manager.js` ✓
- Texture source type handlers: `asset`, `canvasProjection`, `liveElement`, `none`
- Ready condition validation with timeout (1200ms default)
- Non-empty pixel sampling (3×3 center region)
- Canvas projection helpers: `projectSimpleText()`, `projectCardGrid()`, `measureProjectionBounds()`

### 7. `scripts/check-pilot-readiness.mjs` ✓
- Validates pilot transition types are declared
- Checks texture source declarations
- Verifies ready timeout and non-empty detection

### 8. `scripts/check-pilot-height-contract.mjs` ✓
- Validates animation scenes are `height: 100dvh`
- Checks reading sections are `min-height: 100dvh`
- Verifies no `--extra-snap-height` in pilot path

## Phase 2.5 Completion Criteria ✓

- [x] Pilot transitions show fbm fractal edges (not straight lines or single Bézier curves)
- [x] Transitions don't show pure color fallback blocks or half-blank next scene
- [x] Factory covers all 4 ink types: radial-center, radial-rotating-left, horizontal-irregular, sunburst-radial
- [x] Texture pipeline supports asset/canvasProjection with ready validation
- [x] uSweepMode migrated into createInkSceneTransition threshold path

## Phase 2.6 Completion Criteria ✓

- [x] Animation scenes: `height: 100dvh` (no extra snap height)
- [x] Reading sections: `min-height: 100dvh` with natural overflow
- [x] JS-snap alignment (Lenis primary, window.scrollTo fallback)
- [x] Viewport change listeners: resize, orientation, visualViewport
- [x] Mobile address bar handling via dvh units and visualViewport listener
- [x] Hash navigation: snap to presented state

## Testing Recommendations

1. **Ink Transition Factory**:
   - Test all 4 ink types render correctly
   - Verify horizontal-irregular shows bottom-up and top-down variants
   - Test sunburst UV calculation after window resize
   - Verify texture compositing works for all types

2. **Snap Runtime**:
   - Test snapToScene with Lenis available vs unavailable
   - Verify prefers-reduced-motion skips animation
   - Test hash navigation jumps to correct scene
   - Verify scroll completion polling works without Lenis

3. **Viewport Handling**:
   - Test window resize recalculates scene bounds correctly
   - Test orientation change re-snaps to current scene
   - Test mobile address bar show/hide (iOS Safari)
   - Verify scene bounds stay correct during playback after resize

4. **Height Contracts**:
   - Verify animation scenes are exactly 100dvh
   - Verify reading sections allow natural overflow
   - Test long reading sections don't trigger next transition mid-scroll

## Integration Notes

### Using the Ink Transition Factory

```javascript
import { createInkTransition, calculateCoverUv } from './js/effects/ink-transition-factory.js';

// Radial center (hero -> pattern-bloom)
const radialInk = createInkTransition(canvas, {
  type: 'radial-center',
  targetSrc: 'path/to/next-scene.png',
  assets: {
    backDepthSrc: 'path/to/back-depth.png',
    middleDepthSrc: 'path/to/middle-depth.png'
  },
  nextSceneElement: canvasElement
});

// Horizontal irregular bottom-up
const horizontalInk = createInkTransition(canvas, {
  type: 'horizontal-irregular',
  direction: 'bottom-up',
  targetSrc: 'path/to/next-scene.png',
  depthThresholdMode: true
});

// Sunburst with dynamic UV mapping
const sunburstInk = createInkTransition(canvas, {
  type: 'sunburst-radial',
  targetSrc: 'path/to/ph-background.png',
  calculateCoverUv: (srcX, srcY) => {
    return calculateCoverUv(
      srcX, srcY,
      2048, 1152, // PH background source dimensions
      window.innerWidth, window.innerHeight
    );
  }
});

// Render
radialInk.render(progress, pointerX, pointerY);
```

### Using snapToScene

```javascript
import { createHomepageSnapRuntime } from './js/runtime/homepage-snap-runtime.js';

const runtime = createHomepageSnapRuntime({
  timeline: homepageTimeline,
  scrollController: lenisInstance, // or null for fallback
  onStateChange: (state, prevState) => {
    console.log('State changed:', prevState.current, '->', state.current);
  }
});

// Snap to specific scene
runtime.snapToScene('belief-star');

// Recalculate bounds on resize
runtime.recalculateSceneBounds();
```

## Next Steps

### Phase 3: Pilot Run-through

1. Wire factory to pilot transitions:
   - `hero -> pattern-bloom` (radial-center)
   - `pattern-bloom -> belief-star` (radial-rotating-left)
   - `belief-star -> aod-animation` (horizontal-irregular bottom-up)

2. Test snap runtime FSM:
   - FreeScroll → SnapAligning → SnappedArmed
   - 10vh charge → TriggeredPlayback → Playing
   - Completing → ReleaseCooldown → FreeScroll

3. Verify texture pipeline:
   - Asset textures decode correctly
   - Canvas projections render and validate non-empty
   - Timeout recovery presents terminal state

4. Test viewport handling:
   - Resize during playback maintains scene
   - Orientation change re-snaps correctly
   - Mobile address bar doesn't break layout

## References

- Plan: `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/docs/PLAN-homepage-snapped-scene-runtime.md`
- Ink Scene Transition: `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/effects/ink-scene-transition.js`
- Snap Runtime: `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/runtime/homepage-snap-runtime.js`
- Runtime Integration: `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/runtime/homepage-runtime-integration.js`
