# Homepage Runtime Integration Test Plan

## Overview

Test plan for the homepage snap runtime integration that wires the FSM-based scroll-to-playback engine to the existing timeline architecture.

## Test Environment Setup

### Prerequisites
- Lenis smooth scroll loaded (or fallback to native scroll)
- Homepage timeline manifest loaded
- Scene timeline controller initialized
- DOM elements with proper `data-scene-id` attributes

### Test Fixtures
```javascript
// Mock timeline for isolated testing
const mockTimeline = {
  labels: { 'scene-0': 0, 'scene-1': 1, 'scene-2': 2 },
  play: jest.fn(),
  pause: jest.fn(),
  eventCallback: jest.fn()
};

// Mock Lenis
const mockLenis = {
  scrollTo: jest.fn(),
  stop: jest.fn(),
  start: jest.fn(),
  velocity: 0
};
```

## Test Scenarios

### 1. FreeScroll → SnapAligning → SnappedArmed Transition

**Objective**: Verify snap behavior when user scrolls near scene boundary

**Steps**:
1. Start runtime in FreeScroll state at scroll position 0
2. Scroll to within 50px of scene boundary (e.g., scrollY = window.innerHeight - 40)
3. Stop scrolling (velocity drops below 0.5)

**Expected Behavior**:
- Runtime transitions from `FreeScroll` → `SnapAligning`
- Lenis.scrollTo() called with target = scene boundary
- After snap animation completes (600ms), transitions to `SnappedArmed`
- DOM attribute `data-homepage-runtime-state` updates to "SnappedArmed"
- Charge indicator resets to 0

**Assertions**:
```javascript
expect(runtime.getState().current).toBe('SnappedArmed');
expect(mockLenis.scrollTo).toHaveBeenCalledWith(
  window.innerHeight,
  expect.objectContaining({ duration: 0.6 })
);
expect(document.documentElement.getAttribute('data-homepage-runtime-state')).toBe('SnappedArmed');
expect(runtime.getChargeProgress()).toBe(0);
```

---

### 2. 10vh Accumulation from Different Input Sources

**Objective**: Verify charge accumulator works across wheel, touch, and keyboard inputs

**Steps**:
1. Enter SnappedArmed state at scene boundary
2. Dispatch wheel events totaling 10vh of delta:
   - Event 1: deltaY = 30px (3vh on 1000px viewport)
   - Event 2: deltaY = 40px (4vh)
   - Event 3: deltaY = 30px (3vh) → total = 10vh
3. Verify charge progress updates
4. Reset and test with touch events
5. Reset and test with keyboard events (ArrowDown)

**Expected Behavior**:
- Charge accumulator adds delta from all sources
- `--homepage-charge-progress` CSS variable updates on each event (throttled to 16ms)
- `data-homepage-charge-progress` attribute reflects percentage (0-100)
- At 10vh threshold, charge is complete

**Assertions**:
```javascript
// After 7vh accumulated
expect(runtime.getChargeProgress()).toBeCloseTo(0.7, 1);
expect(document.documentElement.style.getPropertyValue('--homepage-charge-progress')).toBe('0.700');

// After 10vh accumulated
expect(runtime.getChargeProgress()).toBe(1);
expect(document.documentElement.getAttribute('data-homepage-charge-progress')).toBe('100');
```

---

### 3. Forward Charge Triggers Playing

**Objective**: Verify playback starts after charge threshold is met

**Steps**:
1. Start in SnappedArmed state at scene 1 boundary
2. Scroll forward (down) accumulating 10vh
3. Wait for charge threshold

**Expected Behavior**:
- Runtime transitions to `TriggeredPlayback` → `Playing`
- Lenis.stop() called to lock scroll
- `document.body.style.overflow = 'hidden'`
- Timeline.play('scene-1') called
- Scene element gets `data-scene-state="playing"`
- Charge indicator resets

**Assertions**:
```javascript
expect(runtime.getState().current).toBe('Playing');
expect(mockLenis.stop).toHaveBeenCalled();
expect(document.body.style.overflow).toBe('hidden');
expect(mockTimeline.play).toHaveBeenCalledWith('scene-1');

const sceneElement = document.querySelector('[data-scene-id="belief-star"]');
expect(sceneElement.getAttribute('data-scene-state')).toBe('playing');
```

---

### 4. Reverse Charge at Scene Top Plays Previous Scene

**Objective**: Verify backward navigation triggers previous scene playback

**Steps**:
1. Start in SnappedArmed state at scene 2 boundary
2. Scroll backward (up) accumulating 10vh in negative direction
3. Wait for charge threshold

**Expected Behavior**:
- Runtime transitions to `TriggeredPlayback` → `Playing`
- Previous scene (scene 1) is targeted
- Timeline.play('scene-1') called (reverse direction)
- Scroll locks

**Assertions**:
```javascript
expect(runtime.getState().current).toBe('Playing');
expect(runtime.getState().targetSceneIndex).toBe(1);
expect(mockTimeline.play).toHaveBeenCalledWith('scene-1');
```

---

### 5. Reading Scene Snap → Immediate Release

**Objective**: Verify reading scenes (with `allowNativeScroll: true`) don't lock scroll

**Steps**:
1. Navigate to reading scene (e.g., `belief-star`)
2. Scene snaps into view
3. Attempt to scroll within scene

**Expected Behavior**:
- Runtime enters `SnappedArmed` briefly
- On scroll attempt, immediately releases (no charge required)
- Native scroll allowed within scene bounds
- No playback triggered for reading scenes

**Assertions**:
```javascript
const scene = homepageTimeline.scenes.find(s => s.id === 'belief-star');
expect(scene.reading.allowNativeScroll).toBe(true);

// Scroll within scene
window.scrollTo(0, window.innerHeight + 100);

expect(runtime.getState().current).toBe('FreeScroll');
expect(document.body.style.overflow).not.toBe('hidden');
```

---

### 6. Long Reading Section: Scroll Past Bottom Before Arming Next

**Objective**: Verify extended reading scenes (with `overflow: 'extend', armNextAt: 'scrolled-past-bottom'`)

**Steps**:
1. Navigate to long reading scene (e.g., `method-lower`)
2. Scroll through multi-screen content
3. Reach bottom of scene content
4. Scroll past bottom

**Expected Behavior**:
- Scene allows native scroll until content bottom is reached
- Only after scrolling past bottom does next scene arm
- Runtime doesn't prematurely snap to next scene
- `armNextAt` condition must be met before arming

**Assertions**:
```javascript
const scene = homepageTimeline.scenes.find(s => s.id === 'method-lower');
expect(scene.reading.overflow).toBe('extend');
expect(scene.reading.armNextAt).toBe('scrolled-past-bottom');

// While scrolling within content
const contentBottom = getSceneContentBottom('method-lower');
window.scrollTo(0, contentBottom - 100);
expect(runtime.getState().current).toBe('ReadingScroll');

// After scrolling past bottom
window.scrollTo(0, contentBottom + 100);
// Now next scene can be armed
```

---

### 7. Timeout Recovery → Present Terminal → Release

**Objective**: Verify recovery mechanism when playback hangs

**Steps**:
1. Enter Playing state
2. Simulate stuck playback (timeline never calls onComplete)
3. Wait for recovery timeout (2000ms)

**Expected Behavior**:
- After 2000ms, runtime transitions to `RecoverPresentTarget`
- Scene is force-presented (skips to terminal state)
- Scene element gets `data-scene-state="presented"`
- Scroll unlocks
- Runtime resets to `FreeScroll`
- Error logged to console

**Assertions**:
```javascript
jest.useFakeTimers();

// Enter playing state but don't complete
runtime.triggerPlayback();
expect(runtime.getState().current).toBe('Playing');

// Advance time
jest.advanceTimersByTime(2000);

expect(runtime.getState().current).toBe('FreeScroll');
expect(document.body.style.overflow).not.toBe('hidden');

const sceneElement = document.querySelector('[data-scene-id="aod-animation"]');
expect(sceneElement.getAttribute('data-scene-state')).toBe('presented');

expect(console.warn).toHaveBeenCalledWith(
  expect.stringContaining('Timeout reached')
);
```

---

### 8. Prefers-Reduced-Motion: Skip Charge, Direct Present

**Objective**: Verify accessibility mode skips charge and jumps to presented state

**Steps**:
1. Initialize runtime with `reduceMotion: true`
2. Navigate to scene boundary
3. Attempt to scroll (would normally trigger charge)

**Expected Behavior**:
- Charge accumulator is bypassed
- Scene immediately jumps to presented state
- No playback animation
- Scroll position jumps directly to scene start
- `window.scrollTo()` called with `behavior: 'auto'`

**Assertions**:
```javascript
const runtime = createHomepageRuntimeIntegration({
  reduceMotion: true
});

// Scroll near scene boundary
window.scrollTo(0, window.innerHeight - 40);

// Scene should be immediately presented
const sceneElement = document.querySelector('[data-scene-id="belief-star"]');
expect(sceneElement.getAttribute('data-scene-state')).toBe('presented');

expect(runtime.getState().current).toBe('FreeScroll');
expect(runtime.getChargeProgress()).toBe(0); // Charge never accumulates
```

---

## Integration Test Matrix

| Test Case | Lenis | Native Scroll | Touch Device | Reduced Motion |
|-----------|-------|---------------|--------------|----------------|
| FreeScroll → SnapAligning | ✓ | ✓ | ✓ | ✓ |
| 10vh Accumulation | ✓ | ✓ | ✓ | Skip |
| Forward Charge | ✓ | ✓ | ✓ | Skip |
| Reverse Charge | ✓ | ✓ | ✓ | Skip |
| Reading Scene Release | ✓ | ✓ | ✓ | ✓ |
| Long Reading Overflow | ✓ | ✓ | ✓ | ✓ |
| Timeout Recovery | ✓ | ✓ | ✓ | ✓ |
| Reduced Motion | N/A | N/A | N/A | ✓ |

## Manual Testing Checklist

### Desktop (Chrome, Firefox, Safari)
- [ ] Smooth scroll with Lenis works
- [ ] Charge indicator appears and fills on scroll
- [ ] Playback starts after 10vh charge
- [ ] Reverse scroll navigates backward
- [ ] Reading scenes allow native scroll
- [ ] Timeout recovery works (simulate hang)

### Mobile (iOS Safari, Chrome Android)
- [ ] Touch scroll triggers charge
- [ ] Swipe gestures work correctly
- [ ] No janky transitions
- [ ] Scroll lock prevents overscroll

### Accessibility
- [ ] Reduced motion skips animations
- [ ] Keyboard navigation works (Space/Enter to trigger)
- [ ] Screen reader announces state changes
- [ ] Focus management during playback

### Edge Cases
- [ ] Rapid scroll bypasses snap (ReadingScroll state)
- [ ] Window resize recalculates scene bounds
- [ ] Page reload at arbitrary scroll position
- [ ] Direct hash navigation (#belief) works
- [ ] Browser back/forward button handling

## Performance Metrics

### Target Metrics
- State transition: < 16ms (1 frame)
- Charge indicator update: ~16ms (throttled)
- Snap animation: 600ms (configurable)
- Memory footprint: < 1MB
- No layout thrashing (batched DOM updates)

### Profiling
```javascript
// Measure state transition time
console.time('state-transition');
runtime.handleScroll();
console.timeEnd('state-transition');

// Measure charge indicator update
console.time('charge-update');
updateChargeIndicator(0.5);
console.timeEnd('charge-update');
```

## Debugging Tools

### Runtime Inspector
```javascript
// Expose runtime to window for debugging
window.__homepageRuntime = runtime;

// Inspect state
console.log(window.__homepageRuntime.getState());

// Manually trigger transitions
window.__homepageRuntime.triggerPlayback();
window.__homepageRuntime.reset();
```

### State Logger
```javascript
// Log all state transitions
runtime.onStateChange = (newState, prevState) => {
  console.log(
    `[Runtime] ${prevState.current} → ${newState.current}`,
    { scrollY: newState.scrollY, velocity: newState.velocity }
  );
};
```

### DOM Inspector
```html
<div id="runtime-debug" style="position:fixed;top:10px;right:10px;background:rgba(0,0,0,0.8);color:#0f0;padding:10px;font-family:monospace;font-size:12px;z-index:9999;">
  State: <span data-debug="state"></span><br>
  Scene: <span data-debug="scene"></span><br>
  Charge: <span data-debug="charge"></span>%<br>
  Locked: <span data-debug="locked"></span>
</div>

<script>
setInterval(() => {
  const state = window.__homepageRuntime.getState();
  document.querySelector('[data-debug="state"]').textContent = state.current;
  document.querySelector('[data-debug="scene"]').textContent = state.currentSceneIndex;
  document.querySelector('[data-debug="charge"]').textContent =
    Math.round(window.__homepageRuntime.getChargeProgress() * 100);
  document.querySelector('[data-debug="locked"]').textContent = state.isScrollLocked;
}, 100);
</script>
```

## Known Issues & Workarounds

### Issue 1: Lenis velocity not available on first scroll
**Workaround**: Cache previous scrollY and calculate velocity manually

### Issue 2: iOS overscroll bounce interferes with charge
**Workaround**: Use `overscroll-behavior: none` on body

### Issue 3: GSAP timeline not available during init
**Workaround**: Use mock timeline until actual timeline is ready, then swap

## Success Criteria

✅ All 8 test scenarios pass
✅ Manual testing checklist completed across 3 browsers
✅ Performance metrics meet targets
✅ No console errors during normal operation
✅ Accessibility requirements met
✅ Recovery mechanism handles all error cases

## Next Steps

1. Wire actual GSAP timeline (replace mockTimeline)
2. Add visual charge indicator component
3. Add haptic feedback on mobile (navigator.vibrate)
4. Add audio cues for state transitions (optional)
5. Integrate with analytics (track scene views, charge times)
