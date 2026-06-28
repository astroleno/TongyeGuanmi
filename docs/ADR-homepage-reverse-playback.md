# ADR: Homepage Reverse Playback Strategy

## Status

**Proposed** — Must be implemented in Phase 1 of master timeline migration

## Context

The homepage master timeline requires bidirectional playback to support natural scroll behavior: users must be able to scroll both forward (down the page) and backward (up the page) through the visual narrative. The `SnappedArmed` state machine monitors scroll delta in both directions and must trigger appropriate playback strategies for each scene and transition block.

## Decision

Implement a declarative reverse playback matrix where every scene and block explicitly declares its reverse strategy. The state machine will invoke the appropriate playback method based on scroll direction:

- **Positive scroll delta** → `playForward()` for the current block
- **Negative scroll delta at scene top** → `playReverse()` to return to the previous scene

## Reverse Playback Matrix

Each visual resource must declare one of three reverse strategies:

| Scene/Block | Reverse Resource | Strategy | Fallback |
|-------------|------------------|----------|----------|
| **ink transitions** | shader time-reversible | `playReverse()` same transition | N/A |
| **pattern-bloom** | layer animations | reverse stage animation | show prev scene terminal |
| **aod-animation** | no reverse webm | terminal state fallback | belief-star terminal |
| **figure2-animation** | `figure2*-reverse*` exists | use reverse resource | terminal if missing segment |
| **figure3-animation** | no reverse webm | terminal state fallback | brand terminal |
| **ttg-animation** | `ttg_figure-alpha-scrub-reverse.webm` | use reverse resource | N/A |
| **ph-animation** | no reverse webm | terminal state fallback | education terminal |
| **crane-animation** | no reverse webm | terminal state fallback | philosophy terminal |

## Strategy Definitions

### 1. Time-Reversible Shader (ink transitions)

**When:** The visual is GPU shader-driven and deterministic based on time parameter.

**How:** Pass descending time values to the same shader program.

```js
function playReverse() {
  // Same shader, time flows backward
  requestAnimationFrame(() => {
    const reverseTime = endTime - (currentTime - startTime);
    inkCompositor.render({ time: reverseTime });
  });
}
```

**Constraint:** NEVER use `video.playbackRate = -1` or `video.currentTime` seek to simulate reverse.

### 2. Reverse Stage Animation (pattern-bloom)

**When:** The visual is CSS/JS animation-driven with reversible keyframes.

**How:** Apply reverse animation timing or replay keyframes in reverse order.

```js
function playReverse() {
  element.style.animation = 'bloom-reverse 0.8s ease-out';
  // Or manually step through keyframes backward
}
```

**Fallback:** If reverse animation is incomplete, jump to previous scene's terminal state.

### 3. Reverse Video Resource (figure2, ttg)

**When:** A dedicated reverse video file exists (`*-reverse.webm`).

**How:** Load and play the reverse video file as a separate resource.

```js
async function playReverse() {
  if (!reverseVideo) {
    reverseVideo = await loadVideo('figure2-alpha-scrub-reverse.webm');
  }
  reverseVideo.currentTime = 0;
  reverseVideo.play();
}
```

**Fallback:** If reverse video segment is missing or fails to load, jump to terminal state of previous scene.

### 4. Terminal State Fallback (aod, figure3, ph, crane)

**When:** No reverse resource exists and reverse animation is not feasible.

**How:** Jump immediately to the terminal (final) state of the previous scene.

```js
function playReverse() {
  // No smooth reverse available
  const prevScene = getPreviousScene(currentScene);
  jumpToTerminalState(prevScene);
}
```

**Constraint:** Visual degradation (lack of smooth transition) is acceptable. Blank screens or broken states are NOT acceptable.

## State Machine Integration

The `SnappedArmed` state monitors scroll delta and triggers playback:

```js
class SnappedArmed {
  onScroll(deltaY) {
    if (deltaY > CHARGE_THRESHOLD) {
      // Positive charge → forward
      this.transition.playForward();
      this.state = 'SnappedPlaying';
    } else if (deltaY < -CHARGE_THRESHOLD && this.atSceneTop()) {
      // Negative charge at scene top → reverse
      this.transition.playReverse();
      this.state = 'SnappedReversingToPrevious';
    }
  }
}
```

## Implementation Requirements

### Phase 1 (Required for Master Timeline Launch)

1. **Declarative Strategy Registry**

   Every scene block must declare its reverse strategy in configuration:

   ```js
   {
     blockId: 'belief-lower-to-method',
     reverseStrategy: 'terminal-fallback',
     reverseFallbackScene: 'belief.lower',
     reverseFallbackState: 'terminal'
   }
   ```

2. **Static Validation**

   Build-time check must enforce that every block declares a reverse strategy:

   ```js
   // In scripts/check-homepage-master-timeline.mjs
   for (const block of transitionBlocks) {
     assert.ok(
       block.reverseStrategy,
       `Block ${block.id} must declare reverseStrategy`
     );
   }
   ```

3. **Runtime Dispatch**

   State machine must call the appropriate strategy method:

   ```js
   function playReverse(block) {
     switch (block.reverseStrategy) {
       case 'time-reversible':
         return playReverseShader(block);
       case 'reverse-resource':
         return playReverseVideo(block);
       case 'terminal-fallback':
         return jumpToTerminalState(block.reverseFallbackScene);
       default:
         throw new Error(`Unknown reverse strategy: ${block.reverseStrategy}`);
     }
   }
   ```

### Phase 2 (Future Enhancement)

- Add reverse resources for `aod`, `figure3`, `ph`, and `crane` to replace terminal-fallback with smooth reverse playback.
- Implement reverse keyframe animations for `pattern-bloom` to avoid terminal jumps.
- Add reverse playback rate control for fine-tuned scrubbing.

## Constraints

### Mandatory

- **NEVER use video seek for reverse simulation** (Plan line 294)
  
  Rationale: Video seek is non-deterministic, frame-skipping, and creates visible jank. Only dedicated reverse video resources or time-reversible shaders are acceptable.

- **Every scene must declare reverse strategy**
  
  Rationale: Undeclared strategy leads to runtime errors or blank screens during backward scroll.

- **Visual degradation acceptable, blank screens not**
  
  Rationale: A terminal-state jump is visually abrupt but functional. A blank screen is a broken user experience.

- **Static validation must enforce strategy declaration**
  
  Rationale: Catch missing reverse strategies at build time, not at runtime when users scroll backward.

### Recommended

- Prefer time-reversible shaders over reverse video resources (smaller bundle size, no duplicate asset).
- Prefer reverse video resources over terminal fallbacks (smoother UX).
- Document visual degradation in terminal-fallback blocks for future enhancement prioritization.

## Consequences

### Positive

- **Predictable behavior:** Every block has an explicit reverse strategy, no runtime guessing.
- **Performance:** Time-reversible shaders avoid duplicate video assets.
- **Graceful degradation:** Terminal fallbacks ensure no blank screens even when reverse assets are missing.
- **Build-time safety:** Static validation catches missing strategy declarations before production.

### Negative

- **Phase 1 visual quality:** Some blocks (aod, figure3, ph, crane) will jump to terminal states instead of smooth reverse transitions.
- **Asset bundle impact:** Blocks with reverse video resources (`figure2-reverse`, `ttg-reverse`) add to bundle size.
- **Maintenance burden:** Adding new transition blocks requires declaring reverse strategy and updating validation.

### Mitigation

- **Phase 1 ships with terminal fallbacks documented:** Track which blocks need reverse assets in Phase 2.
- **Bundle size monitoring:** Use code-split lazy loading for reverse video resources.
- **Validation automation:** Static check enforces reverse strategy declaration, reducing manual review burden.

## Validation

### Static Checks

Create `scripts/check-homepage-reverse-playback-contract.mjs`:

```js
import assert from 'node:assert/strict';
import { transitionBlocks } from '../src/homepage-transition-manifest.mjs';

const VALID_STRATEGIES = new Set([
  'time-reversible',
  'reverse-animation',
  'reverse-resource',
  'terminal-fallback'
]);

for (const block of transitionBlocks) {
  assert.ok(
    block.reverseStrategy,
    `${block.id} must declare reverseStrategy`
  );
  assert.ok(
    VALID_STRATEGIES.has(block.reverseStrategy),
    `${block.id} reverseStrategy must be one of: ${[...VALID_STRATEGIES].join(', ')}`
  );
  
  if (block.reverseStrategy === 'terminal-fallback') {
    assert.ok(
      block.reverseFallbackScene,
      `${block.id} terminal-fallback must declare reverseFallbackScene`
    );
  }
  
  if (block.reverseStrategy === 'reverse-resource') {
    assert.ok(
      block.reverseResourcePath,
      `${block.id} reverse-resource must declare reverseResourcePath`
    );
  }
}

console.log('Homepage reverse playback contract passed.');
```

Add to `package.json`:

```json
"verify:homepage-reverse-playback": "node scripts/check-homepage-reverse-playback-contract.mjs"
```

### Runtime Checks

Add to `scripts/audit-homepage-directed-timeline-cdp.mjs`:

```js
// Test reverse playback from each scene
for (const sceneId of ['belief', 'method', 'brand', 'services']) {
  await scrollToScene(sceneId);
  await page.evaluate(() => window.scrollBy(0, -200)); // Trigger reverse
  await page.waitForTimeout(800);
  
  const result = await page.evaluate(() => ({
    currentScene: getCurrentScene(),
    hasBlankFrame: isCanvasBlank('[data-master-ink-canvas]'),
    stateValid: isStateValid()
  }));
  
  assert.equal(result.hasBlankFrame, false, `${sceneId} reverse must not show blank frame`);
  assert.equal(result.stateValid, true, `${sceneId} reverse must maintain valid state`);
}
```

## References

- Plan lines 289-311: "STATE MACHINE: SnappedArmed monitors both positive and negative delta"
- Plan line 294: "NEVER use seek for reverse simulation"
- Plan lines 298-309: Reverse Playback Matrix table
- `js/transitions/homepage/state-machine.js` (to be created)
- `js/transitions/homepage/master-surface-producer-registry.js` (existing)

## Related Decisions

- [ADR: Homepage Master Timeline Architecture](#) — Overall timeline architecture
- [ADR: Homepage Snapped Scene State Machine](#) — State machine implementation
- [ADR: Homepage Surface Producer Contract](#) — Producer drawing interface

---

**Last Updated:** 2026-06-29  
**Authors:** Implementation team  
**Status:** Proposed — Awaiting Phase 1 implementation
