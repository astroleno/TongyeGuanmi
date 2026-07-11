# R4 Pattern Terminal and Figure2 Single-Depth Handoff Implementation Plan

> **Status:** completed historical plan. The four planned commits landed through `55b8a12`; current release state is recorded in `docs/react-refactor/R4-CLOSEOUT.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Main-equivalent compact Pattern composition and make Figure2 → Proof Opening use one binary z-depth ownership field, with no Stage-2 depth speckles, horizontal figure wipe, or secondary dark band.

**Architecture:** Keep the canonical live Pattern, Figure2, and Proof Scene roots. Pattern keeps Main's existing center and scale constants, separates collapse-driven structural phase from continuous motion phase, and restores Main's compact per-ring cache/filter order on six persistent canvases. Figure2 architecture and figures share one transformed, binary SVG depth ownership field on full-screen surfaces; one effect-only WebGL Ink canvas renders the corrosion boundary above that field. The retained foreground arch remains outside the depth mask.

**Tech Stack:** React 19, TypeScript, Canvas 2D, SVG filters/masks, WebGL 1 GLSL, Vitest, Playwright, Vite, pnpm.

**Baseline:** `codex/r4-scene-identity` at `18a628395bbb` (`fix: align depth ink texture orientation`). Main comparison uses `main:js/pattern-mirror-stage.js` together with the production override in `main:js/transitions/pattern-bloom-adapter.js`.

---

## Scope and confirmed root causes

This plan contains two independent workstreams. Pattern and Figure2 must land as separate commits so either can be reverted without affecting the other.

### Finding 1 — Pattern's nominal geometry already matches Main; its phase routing does not

The following values in `app/src/scenes/pattern/patternBloomRenderer.ts` already match `main:js/pattern-mirror-stage.js` and must not be retuned:

| Contract | Main | R4 now |
|---|---:|---:|
| Desktop center | `0.24, 0.55` | `0.24, 0.55` |
| Mobile center | `0.50, 0.58` | `0.50, 0.58` |
| Desktop display size | `min(vmin × 1.34, width × 0.96)` | same |
| Mobile display size | `min(vmin × 1.34, width × 1.12)` | same |
| Source-flower scale | `0.702` | `0.702` |
| Terminal ring scales | `.08, .11, .16, .20, .24, .28` | same |

The actual divergence is at `app/src/scenes/pattern/patternBloomRenderer.ts:525-526` and `app/src/scenes/pattern/patternBloomRenderer.ts:629-641`:

```ts
private scrubPhase(progress = this.rotationProgress): number {
  return clamp(progress) * 4.2;
}

return this.scrubPhase() + this.motionElapsedSeconds + activeElapsed;
```

That combined phase is sent to decor layers, ring rotation, and the terminal `02/03/04` flower. At compact progress `1`, R4 therefore adds an artificial structural time offset on top of live time:

- layer `04`: extra `-36°`;
- layer `03`: extra `+36°`;
- layer `02`: extra approximately `-19.89°`;
- decor `05`: extra `+15.75°`;
- decor `06`: extra approximately `+13.75°`.

Because the authored layers use asymmetric anchors, this changes the visible centroid and footprint even though the scalar center and scale are correct. Main applies `progress × 4.2` only when rebuilding the kaleidoscope sample; decor and terminal flower rotation use elapsed motion time only.

Two cache mismatches amplify that apparent footprint error:

- at `app/src/scenes/pattern/patternBloomRenderer.ts:551`, persistent ring textures are always built with structural phase `0`, whereas Main rebuilds them from `progress × 4.2`;
- at `app/src/scenes/pattern/patternBloomRenderer.ts:613-616`, R4 applies each ring's blur/filter to the final, already-scaled composite. Main applies the filter while building a per-ring cache whose compact minimum is `320px`, then draws that cache unfiltered. R4's current contract is explicitly locked by the test named `keeps ring textures unfiltered and applies blur at final output size`, so this is not a missing tweak: it is a code/test contract that contradicts Main.

At the 1280×720 terminal frame, every Main ring cache is `320px`; R4 instead keeps all six at the shared object texture size and applies `8/6/4.25/...px` blur after scale. The result has a visibly swollen, softer outer footprint even though the authored `.08… .28` scale values are identical. The Pattern fix therefore must restore compact cache/filter semantics as well as phase routing; changing center or authored scale constants would compensate for the wrong layer and break the expanded hold.

### Finding 2 — the Stage-2 black points are the depth map leaking at its full-visible endpoint

`Figure2DistanceExpandTimeline` constructs `DepthThresholdMask` before the intro starts. `attachMask()` immediately assigns the dynamic depth mask to the live Figure2 depth field. At the staged pause:

```text
timeline progress = 0.72
proof reveal = 0
ownership gate = 0
```

The live Figure2 architecture should be fully visible, but it still passes through the SVG depth filter. `figure2-middle-depth.png` contains 143,114 near-black pixels, all concentrated in the central region shown in the supplied screenshot. Browser filter quantization around the `0.5001` intercept can turn those endpoint texels into holes, exposing the dark Stage below.

The fix is not a larger epsilon. A fully visible endpoint must bypass the dynamic mask completely:

- conceal target at ownership `0`: no depth mask;
- reveal target at ownership `1`: no depth mask;
- only `0 < ownership < 1` uses the transformed SVG threshold mask.

### Finding 3 — the unwanted horizontal transition is explicitly implemented twice

The Figure2 transition currently contains a second ownership field in addition to depth:

1. `applyFigureGate()` writes a horizontal `clip-path: inset(...)` to the two-person group.
2. `depthFrame()` adds `secondaryHorizontal`, and the shared shader renders a second dark occlusion belt for it.

The two people are intentionally absent from `DepthThresholdMask.targets`, so they never receive the binary z-depth field. This exactly explains all three reported symptoms: a depth expansion, a horizontal wipe, and a dark band moving on a separate trajectory.

The replacement contract is:

```text
visible Figure pixel = source media alpha × binary depth ownership
```

The source WebM may retain its authored alpha edge; the transition multiplier itself is strictly `0` or `1`. No transition opacity, horizontal clip, or secondary Ink field is allowed.

### Non-negotiable constraints

- Keep one canonical live `from` and one canonical live `to`; do not capture, clone, or rasterize either Scene.
- Keep Pattern's user-confirmed `02/03/04 = reverse/forward/reverse` (`010`) directions.
- Keep the foreground retained arch outside the Figure2 depth mask through Proof Closing.
- Keep the localized dark Ink core, but only around the one primary depth ownership boundary.
- Preserve the primary `InkFieldSpec.kind === 'horizontal'` path used by G2/G4/G5/G6/G7; delete only Figure2's nested `secondaryHorizontal` ownership field.
- Do not add review-route suffixes. Browser verification uses only `/harness/r4-g1` and `/harness/r4-g3`.
- Do not introduce a second figure-specific shader, gradient, wipe, or opacity timeline.

## File map

### Pattern workstream

- Modify: `app/src/scenes/pattern/patternBloomRenderer.ts` — Main geometry helpers, separated structural/motion phases, and compact per-ring cache/filter order.
- Modify: `app/src/scenes/pattern/patternBloomRenderer.test.ts` — renderer cache size, filter placement, and phase-routing regression tests.
- Modify: `app/src/scenes/pattern/progress.test.ts` — exact desktop/mobile geometry and compact-state contracts.
- Modify: `app/e2e/r4-g1.spec.ts` — canonical staged-pause diagnostics only.

### Figure2 workstream

- Modify: `app/src/scenes/figure2-animation/index.tsx` — full-screen figure depth-ownership surface.
- Modify: `app/src/scenes/figure2-animation/progress.test.ts` — canonical wrapper and unchanged figure presentation tests.
- Modify: `app/src/styles.css` — full-screen figure ownership surface; remove figure `clip-path` optimization.
- Modify: `app/src/transitions/shared/depthThresholdMask.ts` — exact full-visible endpoint bypass.
- Modify: `app/src/transitions/shared/depthThresholdMask.test.ts` — endpoint and reversible-mask tests.
- Modify: `app/src/transitions/figure2-distance-expand/index.ts` — one primary depth field for architecture, figures, and Proof.
- Modify: `app/src/transitions/figure2-proof-chain.test.ts` — binary figure ownership and no-horizontal-field tests.
- Modify: `app/src/transitions/shared/inkField.ts` — remove the unused secondary-horizontal frame contract.
- Modify: `app/src/transitions/shared/inkField.test.ts` — enforce one occlusion band per frame.
- Modify: `app/src/vendor/ink-scene-transition.js` — remove secondary-horizontal uniforms and shader branch.
- Modify: `app/src/vendor/ink-scene-transition.test.ts` — forbid secondary-horizontal shader symbols.
- Modify: `app/src/vendor/ink-scene-transition.lifecycle.test.ts` — upload only the primary ownership contract.
- Modify: `app/e2e/r4-g3.spec.ts` — canonical staged pause and single-depth transition assertions.
- Modify: `app/e2e/r4-ink-occlusion.spec.ts` — retain primary depth/SVG alignment; remove the rejected secondary probe.
- Modify: `app/src/harness/r4/inkE2eContract.test.ts` — keep E2E source contracts aligned with one depth field.

---

### Task 1: Lock Main-equivalent Pattern geometry and phase semantics

**Files:**

- Modify: `app/src/scenes/pattern/patternBloomRenderer.ts:1-251`
- Modify: `app/src/scenes/pattern/progress.test.ts`
- Modify: `app/src/scenes/pattern/patternBloomRenderer.test.ts`

- [ ] **Step 1: Write failing pure-geometry and phase tests**

In `patternBloomRenderer.test.ts`, extend the existing `./patternBloomRenderer` import with `patternFramePhases` and `patternObjectMetricsForViewport`, then add:

```ts
it('keeps Main object metrics at desktop and mobile sizes', () => {
  const desktop = patternObjectMetricsForViewport(1280, 720);
  expect(desktop.centerX).toBeCloseTo(307.2, 4);
  expect(desktop.centerY).toBeCloseTo(396, 4);
  expect(desktop.size).toBeCloseTo(964.8, 4);

  const mobile = patternObjectMetricsForViewport(390, 844);
  expect(mobile.centerX).toBeCloseTo(195, 4);
  expect(mobile.centerY).toBeCloseTo(489.52, 4);
  expect(mobile.size).toBeCloseTo(436.8, 4);
});

it('does not add collapse phase to decor or source-flower motion', () => {
  expect(patternFramePhases(1, 2)).toEqual({
    ringStructuralPhase: 4.2,
    liveMotionPhase: 2
  });
});
```

Keep the existing `010` direction assertion unchanged.

In `progress.test.ts`, strengthen the terminal snapshot without changing its imports:

```ts
expect(end.centerXRatio).toBe(0.24);
expect(end.centerYRatio).toBe(0.55);
expect(end.mobileCenterXRatio).toBe(0.50);
expect(end.mobileCenterYRatio).toBe(0.58);
expect(end.largestRingScale).toBe(0.08);
expect(end.compactRingScale).toBe(0.28);
```

- [ ] **Step 2: Run the Pattern tests and confirm RED**

Run:

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app exec vitest run src/scenes/pattern/progress.test.ts src/scenes/pattern/patternBloomRenderer.test.ts
```

Expected: FAIL because the two pure helpers are not exported.

- [ ] **Step 3: Add the Main geometry and phase helpers**

Add these definitions to `patternBloomRenderer.ts` and make the renderer consume them:

```ts
const PATTERN_STRUCTURAL_PHASE = 4.2;

export type PatternObjectMetrics = Readonly<{
  size: number;
  centerX: number;
  centerY: number;
}>;

export function patternObjectMetricsForViewport(
  width: number,
  height: number
): PatternObjectMetrics {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const center = patternCenterForViewport(safeWidth);
  const mobile = safeWidth <= PATTERN_MOBILE_MAX_WIDTH;
  const vmin = Math.min(safeWidth, safeHeight);
  const size = mobile
    ? Math.min(vmin * 1.34, safeWidth * 1.12)
    : Math.min(vmin * 1.34, safeWidth * 0.96);
  return {
    size,
    centerX: safeWidth * center.x,
    centerY: safeHeight * center.y
  };
}

export function patternFramePhases(
  collapseProgress: number,
  motionSeconds: number
): Readonly<{ ringStructuralPhase: number; liveMotionPhase: number }> {
  return {
    ringStructuralPhase: clamp(collapseProgress) * PATTERN_STRUCTURAL_PHASE,
    liveMotionPhase: Math.max(0, motionSeconds)
  };
}
```

Change `getObjectMetrics()` to compute CSS-space metrics and multiply once by DPR:

```ts
private getObjectMetrics(): ObjectMetrics {
  const cssMetrics = patternObjectMetricsForViewport(
    this.width / this.dpr,
    this.height / this.dpr
  );
  return {
    size: cssMetrics.size * this.dpr,
    centerX: cssMetrics.centerX * this.dpr,
    centerY: cssMetrics.centerY * this.dpr
  };
}
```

- [ ] **Step 4: Run the focused tests and confirm the geometry contract passes**

Run the Step 2 command again.

Expected: the new helper tests PASS; existing center, source scale, ring scale, and `010` tests remain green.

---

### Task 2: Restore Main's compact Pattern phase and cache/filter routing without per-frame allocations

**Files:**

- Modify: `app/src/scenes/pattern/patternBloomRenderer.ts:253-672`
- Modify: `app/src/scenes/pattern/patternBloomRenderer.test.ts`
- Modify: `app/e2e/r4-g1.spec.ts`

- [ ] **Step 1: Add failing cache-revision tests**

Extend the renderer harness so each ring canvas records its `clearRect` count. Replace the existing no-op `clearRect()` method on `FakeCanvasContext`; do not add a second method with the same name:

```ts
class FakeCanvasContext {
  clearRectCount = 0;

  clearRect(): void {
    this.clearRectCount += 1;
  }
}
```

Add a reusable ring-canvas selector and a structural refresh test:

```ts
it('rebuilds persistent ring textures for structural progress but not for idle motion', async () => {
  const harness = installRendererDom();
  const renderer = new PatternBloomRenderer(harness.canvas);
  await renderer.start();
  renderer.setMotionEnabled(true);
  for (let frame = 0; frame < 8 && harness.rafCount(); frame += 1) {
    harness.flushRaf(frame * 48);
  }

  const ringCanvases = () => harness.createElement.mock.results
    .map(({ value }) => value as FakeCanvas)
    .filter((canvas) => canvas.dataset.patternTextureRole === 'ring');
  const ringBuilds = () => ringCanvases()
    .reduce((sum, canvas) => sum + canvas.context.clearRectCount, 0);

  const initial = ringBuilds();
  renderer.setFrameProgress(1, 1);
  harness.flushRaf(480);
  const compact = ringBuilds();
  harness.flushRaf(528);

  expect(compact - initial).toBe(6);
  expect(ringBuilds()).toBe(compact);
  renderer.destroy();
});
```

Replace the existing test named `keeps ring textures unfiltered and applies blur at final output size` with the Main compact-cache contract:

```ts
it('bakes Main filters into six 320px terminal ring caches', async () => {
  const harness = installRendererDom();
  const renderer = new PatternBloomRenderer(harness.canvas);
  await renderer.start();
  renderer.setMotionEnabled(true);
  for (let frame = 0; frame < 8 && harness.rafCount(); frame += 1) {
    harness.flushRaf(frame * 48);
  }

  renderer.setFrameProgress(1, 1);
  harness.flushRaf(480);
  const ringCanvases = harness.createElement.mock.results
    .map(({ value }) => value as FakeCanvas)
    .filter((canvas) => canvas.dataset.patternTextureRole === 'ring');
  const outputContext = (harness.canvas as unknown as FakeCanvas).context;

  expect(ringCanvases.map((canvas) => canvas.width)).toEqual([320, 320, 320, 320, 320, 320]);
  expect(ringCanvases.every((canvas) => canvas.context.filteredDrawCount > 0)).toBe(true);
  expect(outputContext.filteredDrawCount).toBe(0);
  expect(outputContext.shadowBlur).toBeGreaterThan(0);
  renderer.destroy();
});
```

- [ ] **Step 2: Run the renderer test and confirm RED**

Run:

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app exec vitest run src/scenes/pattern/patternBloomRenderer.test.ts
```

Expected: FAIL because the ring textures are permanently fixed at structural phase `0`, share one oversized texture dimension, and defer filtering to the final composite.

- [ ] **Step 3: Separate live motion from structural phase**

Replace `scrubPhase()` and `motionPhase()` with elapsed-only motion:

```ts
private motionElapsed(now: number): number {
  const activeElapsed = this.animateMotion
    ? Math.max(0, now - this.motionStartedAt) / 1000
    : 0;
  return this.motionElapsedSeconds + activeElapsed;
}
```

Rename the shared flower texture constants and add a distinct compact ring-cache range:

```ts
const MIN_FLOWER_TEXTURE_SIZE = 640;
const MAX_FLOWER_TEXTURE_SIZE = 1180;
const MIN_RING_CACHE_SIZE = 320;
const MAX_RING_CACHE_SIZE = 1180;
```

Use the flower constants only in `resize()`. The `320px` ring minimum restores Main's compact filter scale. Keep the existing `1180px` R4 upper ceiling and 24fps structural throttle instead of raising expanded rings to Main's `1800px`; this fixes the reported terminal state without reintroducing the previous GPU/memory spike.

Add a structural cache key and a reusable per-ring drawing primitive:

```ts
private ringStructuralKey = '';

private drawRingTexture(
  index: number,
  structuralPhase: number,
  metrics: ObjectMetrics
): void {
  const ring = bloomRings[index];
  const canvas = this.ringCanvases[index];
  const context = canvas?.getContext('2d');
  if (!ring || !canvas || !context) return;

  const structuralProgress = clamp(
    structuralPhase / PATTERN_STRUCTURAL_PHASE
  );
  const collapse = smoothstep(0.02, 1, structuralProgress);
  const drawSize = metrics.size * interpolate(
    ring.scale,
    ring.endScale,
    collapse
  );
  const cacheSize = Math.max(
    MIN_RING_CACHE_SIZE,
    Math.min(MAX_RING_CACHE_SIZE, Math.round(drawSize))
  );
  if (canvas.width !== cacheSize || canvas.height !== cacheSize) {
    canvas.width = cacheSize;
    canvas.height = cacheSize;
  }
  context.clearRect(0, 0, cacheSize, cacheSize);
  context.save();
  context.translate(cacheSize / 2, cacheSize / 2);
  this.drawOuterPetalKaleidoscope(
    context,
    cacheSize,
    0,
    ring.filter,
    structuralPhase,
    ring.spin
  );
  context.restore();
}

private refreshRingTextures(
  structuralPhase: number,
  metrics: ObjectMetrics
): void {
  const normalized = clamp(structuralPhase / PATTERN_STRUCTURAL_PHASE);
  const bucket = Math.round(normalized * 160);
  const key = `${bucket}:${Math.round(metrics.size)}`;
  if (
    key === this.ringStructuralKey
    && this.ringCanvases.every((canvas) => canvas.width > 0)
  ) return;

  const quantizedStructuralPhase = bucket / 160 * PATTERN_STRUCTURAL_PHASE;
  for (let index = 0; index < bloomRings.length; index += 1) {
    this.drawRingTexture(index, quantizedStructuralPhase, metrics);
  }
  this.ringTextureIndex = bloomRings.length;
  this.ringStructuralKey = key;
}
```

Delete the old `ringTextureSize` field and its assignments; each persistent canvas's dimensions now provide the size check. Keep `ringTextureIndex` because it is still the initial prewarm cursor. Remove `filter` from `RingCache`, remove `context.filter = ring.filter` from `drawPetalField()`, and let `drawOuterPetalKaleidoscope()` bake the filter into the cache exactly once per structural revision.

Make the existing one-ring-per-RAF prewarm delegate to the same drawing primitive, and mark the phase-zero set complete only after all six textures exist:

```ts
private buildNextRingTexture(): void {
  if (!this.textureSize || this.ringTextureIndex >= bloomRings.length) return;
  const metrics = this.getObjectMetrics();
  const index = this.ringTextureIndex;
  this.ringTextureIndex += 1;
  this.drawRingTexture(index, 0, metrics);
  if (this.ringTextureIndex === bloomRings.length) {
    this.ringStructuralKey = `0:${Math.round(metrics.size)}`;
  }
}
```

Reset `ringStructuralKey` to `''` and `ringTextureIndex` to `0` when the canvas width, height, or DPR changes, and after rebuilding source textures. Preserve the current prewarm invariant: at most one initial texture is built per animation frame; structural refreshes reuse all six canvases and allocate none.

- [ ] **Step 4: Route each phase to exactly one responsibility**

Update `renderFrame()` to use:

```ts
const motionSeconds = this.motionElapsed(now);
const phases = patternFramePhases(this.progress, motionSeconds);
this.refreshRingTextures(phases.ringStructuralPhase, metrics);

this.drawDecorLayers(phases.liveMotionPhase, metrics);
this.drawPetalField(
  this.progress,
  this.rotationProgress,
  metrics,
  phases.liveMotionPhase
);
this.drawSourceFlower(phases.liveMotionPhase, metrics);
```

The ring's field rotation remains collapse-driven in `buildRingCache()`. The kaleidoscope sample and per-ring cache size receive `ringStructuralPhase` through `refreshRingTextures()`. The final composite is unfiltered; decor and source flower never receive collapse time.

- [ ] **Step 5: Add canonical G1 staged-pause assertions**

In `app/e2e/r4-g1.spec.ts`, keep `page.goto('/harness/r4-g1')` and add assertions after the existing compact pause:

```ts
expect(compactPattern.patternProgress).toBe(1);
expect(compactPattern.patternFieldRotationDegrees).toBeCloseTo(0, 3);
expect(compactPattern.largestRingScale).toBeCloseTo(0.08, 3);
expect(compactPattern.compactRingScale).toBeCloseTo(0.28, 3);
```

Do not add a suffixed G1 route.

- [ ] **Step 6: Run Pattern verification**

Run:

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app exec vitest run src/scenes/pattern/patternBloomRenderer.test.ts src/scenes/pattern/progress.test.ts src/transitions/pattern-star-map/index.test.ts src/harness/r4/group1Manifest.test.ts
pnpm -C app exec playwright test e2e/r4-g1.spec.ts --project=chromium
```

Expected: all tests PASS; the canonical staged pause reports Main terminal scales with no new route.

- [ ] **Step 7: Commit the Pattern workstream**

```bash
git add app/src/scenes/pattern app/src/transitions/pattern-star-map/index.test.ts app/src/harness/r4/group1Manifest.test.ts app/e2e/r4-g1.spec.ts
git commit -m "fix: align compact pattern phase with main"
```

---

### Task 3: Make binary depth-mask endpoints exact

**Files:**

- Modify: `app/src/transitions/shared/depthThresholdMask.ts:20-310`
- Modify: `app/src/transitions/shared/depthThresholdMask.test.ts`
- Modify: `app/src/transitions/figure2-distance-expand/index.ts:45-275`
- Modify: `app/src/transitions/figure2-proof-chain.test.ts`

- [ ] **Step 1: Add failing endpoint tests**

Extend `depthThresholdMask.test.ts`:

```ts
it('bypasses the dynamic mask at fully visible endpoints and restores it in between', () => {
  const document = new FakeDocument();
  const host = new FakeNode(document);
  const reveal = new FakeNode(document);
  const conceal = new FakeNode(document);
  const mask = createDepthThresholdMask({
    host: host as unknown as HTMLElement,
    targets: [
      { element: reveal as unknown as HTMLElement, polarity: 'reveal' },
      { element: conceal as unknown as HTMLElement, polarity: 'conceal' }
    ],
    depthSrc: '/depth.png',
    runId: 'endpoint-contract:1'
  });

  mask?.render(0, depthTransform);
  expect(conceal.style.getPropertyValue('mask-image')).toBe('');
  expect(reveal.style.getPropertyValue('mask-image')).toContain('depth-threshold-reveal-mask');

  mask?.render(0.37, depthTransform);
  expect(conceal.style.getPropertyValue('mask-image')).toContain('depth-threshold-conceal-mask');
  expect(reveal.style.getPropertyValue('mask-image')).toContain('depth-threshold-reveal-mask');

  mask?.render(1, depthTransform);
  expect(reveal.style.getPropertyValue('mask-image')).toBe('');
  expect(conceal.style.getPropertyValue('mask-image')).toContain('depth-threshold-conceal-mask');

  mask?.render(0.37, depthTransform);
  expect(conceal.style.getPropertyValue('mask-image')).toContain('depth-threshold-conceal-mask');
  expect(reveal.style.getPropertyValue('mask-image')).toContain('depth-threshold-reveal-mask');

  mask?.render(0, depthTransform);
  expect(conceal.style.getPropertyValue('mask-image')).toBe('');
  expect(reveal.style.getPropertyValue('mask-image')).toContain('depth-threshold-reveal-mask');
  mask?.dispose();
  expect(host.children).toHaveLength(0);
});
```

In `figure2-proof-chain.test.ts`, add a staged-pause check that the architecture's mask is absent at `FIGURE2_INTRO_END`.

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app exec vitest run src/transitions/shared/depthThresholdMask.test.ts src/transitions/figure2-proof-chain.test.ts
```

Expected: FAIL because `attachMask()` currently leaves the dynamic mask active at both full-visible endpoints.

- [ ] **Step 3: Store the managed URL on each attached target**

Change `AttachedTarget` to include `maskUrl`, and split managed-style application from restoration:

```ts
type AttachedTarget = Readonly<{
  element: HTMLElement;
  polarity: DepthThresholdPolarity;
  maskUrl: string;
  previousStyles: ReadonlyMap<string, string>;
}>;

function applyManagedMask(target: AttachedTarget): void {
  target.element.style.setProperty('mask-image', target.maskUrl);
  target.element.style.setProperty('-webkit-mask-image', target.maskUrl);
  target.element.style.setProperty('mask-size', '100% 100%');
  target.element.style.setProperty('-webkit-mask-size', '100% 100%');
  target.element.style.setProperty('mask-repeat', 'no-repeat');
  target.element.style.setProperty('-webkit-mask-repeat', 'no-repeat');
  target.element.style.setProperty('mask-mode', 'alpha');
  target.element.style.setProperty('-webkit-mask-mode', 'alpha');
}

function restoreManagedMaskStyles(target: AttachedTarget): void {
  for (const property of MASK_STYLE_PROPERTIES) {
    const previous = target.previousStyles.get(property) ?? '';
    if (previous) target.element.style.setProperty(property, previous);
    else target.element.style.removeProperty(property);
  }
}
```

Finish `attachMask()` through the new helper so it stores the URL and still installs the initial mask:

```ts
const attached: AttachedTarget = { ...target, maskUrl, previousStyles };
applyManagedMask(attached);
target.element.setAttribute('data-r4-depth-mask-run', runId);
target.element.setAttribute('data-r4-depth-mask-polarity', target.polarity);
return attached;
```

Change `restoreTarget()` to call `restoreManagedMaskStyles(target)` before removing the four `data-r4-depth-mask-*` diagnostics. This preserves pre-existing inline styles during both endpoint bypass and final disposal.

- [ ] **Step 4: Toggle only fully visible endpoints**

Inside `render()` use the ownership progress already passed by the caller:

```ts
const fullyVisible = (target.polarity === 'conceal' && clamped === 0)
  || (target.polarity === 'reveal' && clamped === 1);
if (fullyVisible) restoreManagedMaskStyles(target);
else applyManagedMask(target);
```

Keep the opposite, fully hidden endpoint masked. Layer visibility continues to own whether hidden Scenes participate.

- [ ] **Step 5: Align Scene visibility with ownership rather than raw segment progress**

Rewrite `sampleFigure2Proof()` in `figure2-distance-expand/index.ts`:

```ts
function sampleFigure2Proof(progress: number): Figure2ProofSample {
  const reveal = figure2ProofRevealProgress(clamp(progress));
  const ownership = inkOwnershipGateProgress(reveal);
  if (ownership === 1) {
    return { from: hiddenVisibility(), to: holdVisibility(false) };
  }
  if (ownership === 0) {
    return { from: holdVisibility(false), to: hiddenVisibility() };
  }
  return { from: holdVisibility(false), to: holdVisibility(false) };
}
```

This prevents the hidden Proof Scene from relying on a quantized depth mask during the reveal delay.

- [ ] **Step 6: Run endpoint tests and confirm GREEN**

Run the Step 2 command.

Expected: PASS at `0 → mid → 1 → mid → 0`, with exact full-visible endpoints and restored masks during active transition.

- [ ] **Step 7: Commit the endpoint fix**

```bash
git add app/src/transitions/shared/depthThresholdMask.ts app/src/transitions/shared/depthThresholdMask.test.ts app/src/transitions/figure2-distance-expand/index.ts app/src/transitions/figure2-proof-chain.test.ts
git commit -m "fix: make figure2 depth endpoints exact"
```

---

### Task 4: Put both figures on the one primary z-depth ownership surface

**Files:**

- Modify: `app/src/scenes/figure2-animation/index.tsx:300-365`
- Modify: `app/src/scenes/figure2-animation/progress.test.ts`
- Modify: `app/src/styles.css:1070-1295`
- Modify: `app/src/transitions/figure2-distance-expand/index.ts:80-338`
- Modify: `app/src/transitions/figure2-proof-chain.test.ts`

- [ ] **Step 1: Add failing Scene-structure and transition tests**

Update the Figure2 markup test to require one full-screen ownership wrapper:

```ts
expect(markup.match(/data-figure2-figure-depth-surface=/g)).toHaveLength(1);
expect(markup.match(/data-figure2-figure-field=/g)).toHaveLength(1);
```

Update the transition fixture to connect that wrapper, then assert at a mid-transition sample:

```ts
const figureDepthSurface = new FakeElement();
figureDepthSurface.ownerDocument = document;
fromRoot.connect(
  '[data-figure2-figure-depth-surface="true"]',
  figureDepthSurface
);
fromRoot.connect('[data-figure2-figure-field="true"]', figureField);

expect(figureDepthSurface.style.getPropertyValue('mask-image'))
  .toContain('depth-threshold-conceal-mask');
expect(figureField.style.clipPath).toBe('');
expect(fromRoot.style.getPropertyValue('--r4-figure2-figure-opacity')).toBe('1.0000');
expect(figureField.style.getPropertyValue('opacity')).toBe('');
expect(figureDepthSurface.dataset.r4DepthMaskValues).toBe('0,1');
expect(inkCanvas?.dataset.r4InkSecondaryGateKind).toBeUndefined();
expect(retainedArch.style.getPropertyValue('mask-image')).toBe('');
```

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app exec vitest run src/scenes/figure2-animation/progress.test.ts src/transitions/figure2-proof-chain.test.ts
```

Expected: FAIL because no full-screen figure depth surface exists and the figures still use a horizontal clip.

- [ ] **Step 3: Add the full-screen canonical wrapper**

In `Figure2AnimationScene`, wrap the existing figure group without duplicating it:

```tsx
<div
  className="r4-figure2__figure-depth-surface"
  data-figure2-figure-depth-surface="true"
>
  <div
    ref={(element) => registerHandle?.('figures', element)}
    className="r4-figure2__figures"
    data-figure2-figure-field="true"
    aria-label="子问老子人物动画"
  >
    <div className="r4-figure2__people-contact-shadow" aria-hidden="true" />
    <figure className="r4-figure2__figure r4-figure2__figure--left">
      <video
        ref={(element) => {
          leftVideoRef.current = element;
          registerHandle?.('left-video', element);
        }}
        data-figure2-video
        data-media-key={FIGURE2_LEFT_MEDIA_KEY}
        src={LEFT_VIDEO}
        poster={LEFT_POSTER}
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      />
      <figcaption>问道者</figcaption>
    </figure>
    <figure className="r4-figure2__figure r4-figure2__figure--right">
      <video
        ref={(element) => {
          rightVideoRef.current = element;
          registerHandle?.('right-video', element);
        }}
        data-figure2-video
        data-media-key={FIGURE2_RIGHT_MEDIA_KEY}
        src={RIGHT_VIDEO}
        poster={RIGHT_POSTER}
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      />
      <figcaption>老子</figcaption>
    </figure>
  </div>
</div>
```

Add CSS:

```css
.r4-figure2__figure-depth-surface {
  position: absolute;
  inset: 0;
  z-index: 16;
  overflow: hidden;
  pointer-events: none;
}

.r4-figure2__figures {
  z-index: 0;
  will-change: transform;
}
```

Remove `clip-path` from `.r4-figure2__figures` `will-change`. Keep its current bottom, size, transform origin, videos, and contact shadow unchanged.

- [ ] **Step 4: Replace the horizontal figure gate with the depth target**

In the transition constructor, select the full-screen wrapper and add it as `conceal`:

```ts
const figureDepthSurface = fromRoot?.querySelector<HTMLElement>(
  '[data-figure2-figure-depth-surface="true"]'
) ?? null;

targets: [
  ...(depthField ? [{ element: depthField, polarity: 'conceal' as const }] : []),
  ...(figureDepthSurface
    ? [{ element: figureDepthSurface, polarity: 'conceal' as const }]
    : []),
  ...(proofGround ? [{ element: proofGround, polarity: 'reveal' as const }] : []),
  ...(context.to.element
    ? [{ element: context.to.element, polarity: 'reveal' as const }]
    : [])
]
```

Delete all of the following from `figure2-distance-expand/index.ts`:

- `figureGateProgress()`;
- `applyFigureGate()`;
- `clearFigureGate()`;
- `figureField` transition ownership state;
- `data-r4-ink-secondary-gate-*` writes;
- the fourth `createInkFieldFrame()` argument;
- figure-gate disposal code.

The retained arch selector must never be added to `DepthThresholdMask.targets`.

- [ ] **Step 5: Run Figure2 unit tests and confirm GREEN**

Run the Step 2 command plus:

```bash
pnpm -C app exec vitest run src/transitions/shared/depthThresholdMask.test.ts src/stage/RetainedFigure2Arch.test.tsx src/stage/Stage.retained-proof.test.tsx
```

Expected: architecture and figure ownership are complementary binary masks, figures have no clip path, and the retained arch remains untouched.

---

### Task 5: Delete the secondary-horizontal Ink contract from the shared renderer

**Files:**

- Modify: `app/src/transitions/shared/inkField.ts:29-59,154-189`
- Modify: `app/src/transitions/shared/inkField.test.ts`
- Modify: `app/src/vendor/ink-scene-transition.js:50-66,182-206,300-319,483-502`
- Modify: `app/src/vendor/ink-scene-transition.test.ts`
- Modify: `app/src/vendor/ink-scene-transition.lifecycle.test.ts`
- Modify: `app/e2e/r4-ink-occlusion.spec.ts`
- Modify: `app/src/harness/r4/inkE2eContract.test.ts`

- [ ] **Step 1: Change tests to forbid a second ownership band**

Update the shared frame test:

```ts
expect(Object.keys(frame.occlusion).sort()).toEqual([
  'alphaMin',
  'coreMax',
  'coreMin',
  'gateRank'
]);
```

Update shader source tests:

```ts
expect(shaderSource).not.toContain('uSecondaryHorizontalGate');
expect(shaderSource).not.toContain('secondaryOwnershipOcclusion');
expect(shaderSource).toContain('max(alpha, seamOcclusion)');
```

Update `inkE2eContract.test.ts` so G3 requires the figure depth surface and forbids `r4InkSecondaryGateKind`.

Replace the depth-frame test that currently supplies `secondaryHorizontal` with a three-argument `createInkFieldFrame(spec, 0.5, viewport)` call. Assert the primary depth spec/transform and the four exact `occlusion` keys above. Delete the dedicated secondary direction/rank assertions.

In `ink-scene-transition.lifecycle.test.ts`, rename the upload test to `uploads one primary ownership occlusion contract`, construct the same three-argument frame, keep the primary `uniform1f`/`uniform2f` assertions, and replace the secondary upload expectation with:

```ts
const uniformNames = gl.getUniformLocation.mock.calls.map(([, name]) => name);
expect(uniformNames).not.toContain('uSecondaryHorizontalGate');
expect(uniformNames).not.toContain('uSecondaryHorizontalCore');
expect(gl.uniform4f).not.toHaveBeenCalledWith(
  'uSecondaryHorizontalGate',
  expect.anything(),
  expect.anything(),
  expect.anything(),
  expect.anything()
);
```

- [ ] **Step 2: Run shared tests and confirm RED**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app exec vitest run src/transitions/shared/inkField.test.ts src/vendor/ink-scene-transition.test.ts src/vendor/ink-scene-transition.lifecycle.test.ts src/harness/r4/inkE2eContract.test.ts
```

Expected: FAIL while the secondary types, uniforms, and uploads still exist.

- [ ] **Step 3: Collapse `InkFieldFrame` back to one occlusion band**

Use this shape:

```ts
export type InkFieldFrame = Readonly<{
  spec: InkFieldSpec;
  progress: number;
  seed: number;
  ownership: Readonly<{
    revealClip: string | null;
    concealClip: string | null;
    edge: number;
  }>;
  occlusion: InkOcclusionBand;
}>;
```

Delete `InkHorizontalOcclusionBand`, `InkFieldFrameOptions`, the fourth `createInkFieldFrame()` argument, and `secondaryHorizontal`. Return `occlusionBand(edge)` directly.

- [ ] **Step 4: Remove the second shader branch**

Delete both secondary uniforms, their locations, and their uploads. Replace the seam composition with:

```glsl
float seamOcclusion = max(
  proceduralOcclusion,
  primaryOwnershipOcclusion
);
```

Do not change particle, erosion, primary ownership alpha, texture orientation, or blend-function constants.

- [ ] **Step 5: Simplify the browser alpha probe**

In `r4-ink-occlusion.spec.ts`:

- remove `secondaryMin` from `AlphaProbe`;
- remove the depth-only secondary frame option;
- remove secondary sample reads and assertions;
- retain the vertically asymmetric depth fixture and same-row SVG/WebGL primary alpha assertion.

- [ ] **Step 6: Run shared tests and confirm GREEN**

Run the Step 2 command.

Expected: all shared Ink tests PASS and production source has no secondary-horizontal symbol.

- [ ] **Step 7: Commit the single-depth ownership workstream**

```bash
git add app/src/scenes/figure2-animation app/src/transitions/figure2-distance-expand app/src/transitions/shared app/src/vendor/ink-scene-transition.js app/src/vendor/ink-scene-transition.test.ts app/src/vendor/ink-scene-transition.lifecycle.test.ts app/src/transitions/figure2-proof-chain.test.ts app/src/styles.css app/e2e/r4-ink-occlusion.spec.ts app/src/harness/r4/inkE2eContract.test.ts
git commit -m "fix: use one binary depth field for figure2 proof"
```

---

### Task 6: Update canonical G3 browser contracts

**Files:**

- Modify: `app/e2e/r4-g3.spec.ts`
- Modify: `app/src/harness/r4/inkE2eContract.test.ts`

- [ ] **Step 1: Replace secondary-gate diagnostics with figure-depth diagnostics**

In `Group3VisualSnapshot`, remove:

```ts
proofInkSecondaryGateKind
proofInkSecondaryGateRank
figureGateClip
```

Add:

```ts
figureDepthSurfaceMask: string;
figureClip: string;
```

Read them from the canonical live Figure2 Scene:

```ts
const figureDepthSurface = figureRoot?.querySelector<HTMLElement>(
  '[data-figure2-figure-depth-surface="true"]'
);
const figureField = figureRoot?.querySelector<HTMLElement>(
  '[data-figure2-figure-field="true"]'
);

figureDepthSurfaceMask: figureDepthSurface
  ? window.getComputedStyle(figureDepthSurface).maskImage
  : 'none',
figureClip: figureField
  ? window.getComputedStyle(figureField).clipPath
  : 'none'
```

- [ ] **Step 2: Assert an exact staged pause**

Immediately after canonical G3 reaches `staged-paused`, assert:

```ts
expect(stagedFigure.depthFieldMask).toBe('none');
expect(stagedFigure.figureDepthSurfaceMask).toBe('none');
expect(stagedFigure.figureClip).toBe('none');
expect(stagedFigure.activeInkSegments).not.toContain('figure2-distance-expand');
```

This is the browser regression for the black-point endpoint: no depth image participates in the fully visible Stage-2 frame.

- [ ] **Step 3: Assert one active depth field during the handoff**

At the existing mid-transition sample, assert:

```ts
expect(proofTransitionVisual?.proofInkBoundaryKind).toBe('depth');
expect(proofTransitionVisual?.depthFieldMask).not.toBe('none');
expect(proofTransitionVisual?.figureDepthSurfaceMask).not.toBe('none');
expect(proofTransitionVisual?.figureClip).toBe('none');
expect(proofTransitionVisual?.depthMaskValues).toBe('1,0');
```

Delete all positive assertions for a secondary horizontal gate. Keep the retained foreground arch assertions.

- [ ] **Step 4: Run canonical browser verification**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app exec playwright test e2e/r4-g3.spec.ts e2e/r4-ink-occlusion.spec.ts --project=chromium
```

Expected: both specs PASS using `/harness/r4-g3` and the existing unsuffixed route in the alpha diagnostic. No new route is created.

- [ ] **Step 5: Commit browser contracts**

```bash
git add app/e2e/r4-g3.spec.ts app/e2e/r4-ink-occlusion.spec.ts app/src/harness/r4/inkE2eContract.test.ts
git commit -m "test: cover figure2 single-depth ownership"
```

---

### Task 7: Full verification and human handoff

**Files:**

- Verify only; do not change production code during this task.

- [ ] **Step 1: Run all non-browser gates**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app test
pnpm -C app typecheck
pnpm -C app lint
pnpm -C app build
git diff --check
```

Expected: every command exits `0`; the existing Vite chunk-size warning is non-blocking.

- [ ] **Step 2: Run the two canonical browser suites and the primary Ink diagnostic**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app exec playwright test e2e/r4-g1.spec.ts e2e/r4-g3.spec.ts e2e/r4-ink-occlusion.spec.ts --project=chromium
```

Expected: all selected tests PASS.

- [ ] **Step 3: Run forbidden-path scans**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
! rg -n "secondaryHorizontal|SecondaryHorizontal|uSecondaryHorizontal|r4InkSecondaryGate|figureGateProgress|applyFigureGate|data-figure2-figure-gate" app/src --glob '!**/*.test.*'
! rg -n "cloneNode\(|createImageBitmap|html2canvas|foreignObject|captureStream" app/src/transitions app/src/scenes --glob '!**/*.test.*'
```

Expected: both commands exit `0` because the inner `rg` finds no production-code matches.

- [ ] **Step 4: Confirm commit and worktree boundaries**

```bash
git status --short
git log --oneline -6
```

Expected: only the user's pre-existing dirty items remain outside the implementation commits. At plan time these include `app/package.json`, `pnpm-lock.yaml`, `.playwright-cli/`, `artifacts/ttg-alpha-review-v1/`, the three `assets/ttg_figure-alpha-scrub-*review-v1*` files, and previously untracked plan files. Re-read `git status --short` before every commit and preserve any additional concurrent user files.

- [ ] **Step 5: Hand off the exact manual review checklist**

Use only:

```text
/harness/r4-g1
/harness/r4-g3
```

Review:

- G1: compact Pattern stays centered at desktop `24%,55%` or mobile `50%,58%`; the terminal flower footprint matches Main; `010` motion remains; the pause precedes radial Ink.
- G3 Stage 2: the architecture and both figures are intact with no black depth speckles and no active Ink.
- G3 handoff: architecture and figures dissolve through the same z-depth ordering; no horizontal wipe, no opposing dark band, and no intermediate transition opacity.
- G3 retained arch: the blurred foreground arch remains unchanged through Opening, Cards, and Closing.

Do not mark the visual task complete until these human checks pass.

---

## Acceptance checklist

- [ ] Pattern center, display-size formula, source scale, ring end scales, and `010` directions remain unchanged.
- [ ] Pattern collapse phase no longer adds artificial terminal rotation to decor or source-flower motion.
- [ ] Pattern ring textures consume collapse structural phase and do not rebuild while progress is unchanged.
- [ ] Pattern terminal rings use per-ring compact caches with baked filters; the final composite has no ring filter.
- [ ] Figure2 architecture has no depth mask at the Stage-2 full-visible endpoint.
- [ ] The two figures live inside one full-screen canonical depth-ownership surface.
- [ ] Architecture and figures use the same transformed binary conceal mask.
- [ ] Proof root and retained Proof ground use the complementary binary reveal mask.
- [ ] Figure transition ownership values contain only `0` and `1`; source video alpha remains authored.
- [ ] No Figure2 horizontal clip or secondary-horizontal shader path remains.
- [ ] The retained foreground arch is never depth-masked.
- [ ] Only one effect-only Ink canvas exists for Figure2 → Proof Opening.
- [ ] Forward, reverse, endpoint disposal, and Scene identity tests remain green.
- [ ] Manual review uses only unsuffixed G1 and G3 routes.
