# ADR: JS-Controlled Snap for Homepage Timeline

**Status**: Accepted  
**Date**: 2026-06-29  
**Context**: Homepage master timeline visual migration (Phase 1)

## Context

The homepage timeline requires precise scene-to-scene navigation with coordinated visual state transitions. We evaluated three approaches:

1. **CSS `scroll-snap-type: mandatory`** — Native browser snap behavior
2. **Lenis smooth scroll + native snap** — Hybrid approach
3. **JS-controlled snap** — Programmatic scroll management

Key constraints:
- Existing codebase uses Lenis smooth scroll globally
- Current repo has **NO** `scroll-snap-type` containers (verified via codebase scan)
- Existing infrastructure: `lockScroll()`, `scrollToY()`, state machine in timeline runtime
- Must support deep links, hash navigation, resize events, reduced motion
- Mobile address bar behavior requires dynamic viewport handling

## Decision

**Use JS-controlled snap with Lenis `scrollTo()` as primary, `window.scrollTo()` as fallback.**

### Why JS-Snap

1. **No CSS Snap Infrastructure**: Codebase has zero scroll-snap containers — adding CSS snap would introduce new complexity
2. **Lenis Compatibility**: Lenis smooth scroll conflicts with `scroll-snap-type: mandatory` (browser forces instant snap, overriding smooth kinetics)
3. **Existing Alignment**: Timeline already uses `lockScroll()` and `scrollToY()` — JS-snap extends this pattern naturally
4. **State Machine Integration**: Runtime manages scene transitions, visual states, and playback — programmatic scroll control keeps state authority in one place

### Implementation Strategy

```javascript
// Primary: Use Lenis when available
if (window.lenis) {
  lenis.scrollTo(targetY, { duration: 0.8, easing: 'easeInOutCubic' });
} else {
  // Fallback: Direct window scroll
  window.scrollTo({ top: targetY, behavior: 'auto' });
}
```

Runtime controls:
- Lock scroll during scene charge/playback
- Calculate scene bounds at init and resize
- Snap to nearest scene on scroll stop
- Manage visual state transitions (charging → playing → presented → resting)

## Consequences

### Positive

- ✅ **Consistency**: Single source of truth for scroll control (runtime state machine)
- ✅ **Flexibility**: Can implement custom easing, duration, and interruption logic
- ✅ **Debugging**: Scroll behavior visible in JS, not hidden in browser snap heuristics
- ✅ **Graceful Degradation**: Works without Lenis via `window.scrollTo()` fallback

### Negative

- ❌ **Custom Implementation**: More code vs CSS one-liner (`scroll-snap-type: y mandatory`)
- ❌ **Performance**: JS scroll listeners vs native snap (mitigated by throttling)
- ❌ **Maintenance**: Must handle edge cases that CSS snap handles automatically

### Mitigations

- Use `IntersectionObserver` for scene visibility tracking (better performance than scroll listeners)
- Throttle scroll event handlers (16ms/60fps)
- Fallback matrix below ensures resilience

## Fallback Matrix

Must implement in **Phase 1**:

| Scenario | Detection | Fallback Behavior |
|----------|-----------|-------------------|
| **Lenis Unavailable** | `!window.lenis` | Use `window.scrollTo({ top, behavior: 'auto' })` for snap |
| **Hash/Deep Link** | `location.hash` matches scene ID | Parse hash, find scene, snap to target scene's `presented` state (skip charge/playback) |
| **Resize** | `window.addEventListener('resize')` | Recalculate scene bounds, maintain current scene index, continue playback if active |
| **Orientation Change** | `window.addEventListener('orientationchange')` | Recalculate bounds, snap to current scene's new position |
| **Visual Viewport Change** | `visualViewport.addEventListener('resize')` | Detect mobile address bar show/hide, recalc if height delta > 100px |
| **Mobile Address Bar** | Device detection + viewport units | Use `dvh` (dynamic viewport height) for scene height, `svh` (small viewport height) for safe areas |
| **Reduced Motion** | `prefers-reduced-motion: reduce` | Skip charge/playback animations, directly present scene content, disable smooth scroll (use `behavior: 'auto'`) |

### Reduced Motion Implementation

```javascript
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (prefersReducedMotion) {
  // Skip all timeline animations
  scene.setState('presented'); // Direct to final state
  window.scrollTo({ top: targetY, behavior: 'auto' }); // Instant snap
}
```

### Mobile Viewport Handling

```css
.scene {
  /* Use dynamic viewport height to account for address bar */
  height: 100dvh;
  min-height: 100svh; /* Fallback to small viewport height */
}
```

```javascript
const visualViewport = window.visualViewport;
let lastHeight = visualViewport.height;

visualViewport.addEventListener('resize', () => {
  const delta = Math.abs(visualViewport.height - lastHeight);
  if (delta > 100) { // Address bar threshold
    recalculateSceneBounds();
    lastHeight = visualViewport.height;
  }
});
```

## Alternatives Considered

### Alternative 1: CSS Scroll Snap

```css
.timeline-container {
  scroll-snap-type: y mandatory;
}
.scene {
  scroll-snap-align: start;
}
```

**Rejected because**:
- Conflicts with Lenis smooth scroll
- No existing CSS snap infrastructure in codebase
- Cannot coordinate with visual state machine
- Difficult to handle deep links and reduced motion

### Alternative 2: Lenis + Native Snap Hybrid

Use Lenis for smooth scroll between scenes, let browser handle snap on stop.

**Rejected because**:
- `scroll-snap-type: mandatory` overrides Lenis kinetics
- Snap timing not controllable (browser decides when to snap)
- Cannot guarantee visual state sync with snap event

## References

- Plan: `docs/PLAN-homepage-master-timeline-visual-migration-merged.md` (lines 35-43)
- Existing scroll infrastructure: `lockScroll()`, `scrollToY()` utilities
- Lenis documentation: [https://github.com/studio-freight/lenis](https://github.com/studio-freight/lenis)
- CSS Scroll Snap spec: [https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll_snap](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll_snap)

## Implementation Checklist

Phase 1 must include:

- [ ] Lenis `scrollTo()` with fallback to `window.scrollTo()`
- [ ] Hash/deep link detection and target scene snap
- [ ] Resize/orientation event handlers with bounds recalculation
- [ ] Visual viewport listener for mobile address bar
- [ ] `prefers-reduced-motion` detection and instant present mode
- [ ] `dvh`/`svh` viewport units for scene heights
- [ ] IntersectionObserver for scene visibility tracking
- [ ] Throttled scroll stop detection for snap trigger
