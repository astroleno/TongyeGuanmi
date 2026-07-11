# R4 Ink Boundary, Pattern Continuation, and Proof Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every independently drawn Ink reveal edge with one shared Ink boundary, restore Pattern's full-field-to-compact second phase, make the Figure2 depth threshold affect the live depth field while retaining one foreground arch through Proof closing, and correct Crane alpha stacking.

**Architecture:** A deterministic `InkBoundaryFrame` becomes the only geometry source for both the effect-only WebGL Ink canvas and the live DOM reveal/conceal clips; Scene textures, DOM clones, and transition-owned endpoint renderers remain forbidden. Figure2's near arch becomes one Stage-owned retained visual, while a complementary binary depth mask swaps the live Figure2 depth field for the live Proof layer without touching that arch. Pattern-to-Star Map becomes a two-stage segment: first collapse the live Pattern, pause, then use the radial Ink boundary on the next Forward input.

**Tech Stack:** React 19, TypeScript 5.8, Vitest 3, Vite 7, WebGL 1 / GLSL ES 1.00, SVG masks, CSS custom properties and `clip-path`.

---

## Scope and non-negotiable contracts

- This plan does not reintroduce `PatternBloomTimeline`, `createInkSceneTransition`, target screenshots, target textures, DOM clones, `foreignObject`, or fake endpoint canvases.
- `from` and `to` remain the mounted canonical Scene roots throughout every transition.
- The Ink canvas remains effect-only and keeps `data-r4-ink-effect-only="true"`.
- A transition may have one Ink boundary only. WebGL body/particles and DOM reveal/conceal surfaces consume the same `InkBoundaryFrame` at the same progress.
- The boundary body is deterministic from segment seed, progress, viewport, mode, and origin. `uTime` may animate particles and wet texture, but may not move the body edge; this preserves `0 -> 1 -> 0 -> 1` and reverse symmetry.
- Radial G1 transitions resolve their origin from the actual Pattern center: desktop `0.24, 0.55`, mobile `0.50, 0.58`.
- Horizontal transitions keep their authored direction and timing, but the straight `inset(...)` receiver cut is removed.
- Figure2 depth threshold output remains strictly binary per pixel (`0` or `1`). The near foreground arch is excluded from this mask.
- No Playwright or visual review is required while implementing the code/test tasks below. The final manual checklist is a handoff to HITL after automated checks pass.

## 中文结论摘要

- G1 不是把 `0.24, 0.55` 改一遍就能解决：这组坐标目前只控制独立的圆形 `clip-path`，没有进入 Ink shader；实际同时存在纵向 Ink 和圆形裁切两套边界。
- G2、G4、G5、G6、G7 的水平硬线是同一个共享缺陷：接收 Scene 使用直线 `inset(...)`，Ink shader 又单独画一条噪声边界。应让两者消费同一个 Ink boundary frame。
- Pattern 的展开到收缩 renderer 和五层源素材仍在，丢失的是驱动 `0 -> 1` 的下半场以及中间暂停；应恢复成“第一次 Forward 只收缩，第二次 Forward 才径向进入 Star Map”。
- Figure2 → Proof 的阈值表本身已经是二值，错误在作用域：当前只 mask Proof 文案层；Figure2 景深场、Stage-owned Proof 背景和根背景都绕过了 mask。
- Proof 前景横拱不是被错误 mask，而是 Stage 单例在历史修改中被删掉了；应恢复一个 Stage-owned 节点，从 Figure2 保留到 Closing，并只在 Closing → Brand 时跟同一 Ink 边界退出。
- Crane 已经是 `normal` blend；剩余问题是主视频位于云层图片下面，同时又被 `--crane-video-opacity` 做了分数淡入。应提升层级并让 WebM 自身 alpha 负责透明度。

## Code findings

### Finding A — G1 currently runs two different boundaries

`app/src/transitions/shared/ink.ts:157-169` independently creates a target `clip-path`: horizontal origins become a straight `inset(...)`, while interior origins become a perfect `circle(...)`. Separately, `app/src/vendor/ink-scene-transition.js:88-160` renders an FBM Ink curtain whose body is always derived from vertical `sweepY`; it has no radial mode and no Ink-origin uniform.

`app/src/transitions/shared/ink.ts:226-233` records the supplied origin on the canvas, but uses only `origin.y` to choose `bottom-up` versus `top-down`. `origin.x` never reaches the shader. Therefore:

- `hero-pattern` declares `0.24, 0.55`, but the visible WebGL Ink still behaves like a bottom-up curtain;
- the target Pattern is simultaneously clipped by a separate circle at `0.24, 0.55`;
- `pattern-star-map` repeats the same split between a vertical Ink curtain and a circular target clip.

This directly explains G1-1, G1-2, G1-3, and G1-5. The origin constants are not the effective Ink origin; they currently drive only the second, independently drawn clip.

The desktop transition constants do already contain `0.24, 0.55`; changing those numbers alone cannot fix the defect because the shader never consumes them. Center ownership is also duplicated between CSS, the canvas renderer, and both transition files; the renderer uses `< 760` while the CSS media query includes `760px`. The implementation must centralize that breakpoint and center calculation instead of adding another transition constant.

### Finding B — Pattern's second half is no longer driven

`app/src/scenes/pattern/patternBloomRenderer.ts:163-176` still contains the full-field-to-compact renderer: progress `0` has large rings and progress `1` collapses them to the compact terminal composition. However:

- `renderPatternHold()` in `app/src/scenes/pattern/index.tsx:73-79` fixes the canonical Pattern hold at progress `0`;
- `app/src/transitions/pattern-star-map/index.ts` only calls `renderPatternHold()` once in `prepareEndpoints()`;
- it has no `renderSource` call and therefore never advances Pattern from `0` to `1`;
- `app/src/harness/r4/group1Manifest.ts:20-24` forces `pattern-star-map` to a single scrub segment and defines no stage pause.

The live Pattern collapse was removed when the dedicated timeline was replaced by generic Ink. The renderer and source assets remain; the missing part is timeline ownership and the extra input boundary. This confirms G1-4.

### Finding C — every reported hard horizontal line has one shared cause

All reported transitions use `createInkSegmentTransition()` with an origin outside the viewport:

| Segment | Direction | Current mapping |
|---|---|---|
| `method-bottom-figure2` | bottom-to-top | `figure2InkProgressForMethodBottom()` |
| `figure2-proof-brand` | bottom-to-top | full segment |
| `brand-figure3` | bottom-to-top | full segment |
| `services-ttg` | bottom-to-top | full segment |
| `ttg-lab` | top-to-bottom | starts after `TTG_LAB_ANIMATION_STOP` |
| `lab-ph` | top-to-bottom | full segment |
| `ph-education` | top-to-bottom | starts after `PH_EDUCATION_ANIMATION_STOP` |
| `education-crane` | bottom-to-top | full segment |

For all of them, `targetClipPath()` returns a straight `inset(...)`, while the Ink shader draws a separate noisy edge. Existing tests explicitly protect the unwanted behavior, for example `app/src/transitions/shared/ink.test.ts:264-270` and `app/src/transitions/figure2-proof-chain.test.ts:294-312` assert `inset(...)`.

This is one shared defect, not eight scene-specific defects. It explains G2-1, G4-1, G5-1, G6-1, and G7-1. `star-map-aod` contains the same architectural split in `renderLiveRevealClip()` and should migrate with the shared fix even though it was not called out again.

### Finding D — the binary depth mask is attached only to Proof

`app/src/transitions/figure2-distance-expand/index.ts:105-110` constructs `createDepthThresholdMask()` with `target: context.to.element`. The target is the Proof Scene layer, so only Proof copy is thresholded.

At the same time, `app/src/transitions/figure2-distance-expand/index.ts:142-149` renders the Figure2 source with `proofProgress: 0`; its background, cloud, far arcade, middle fresco, figures, and foreground arch receive no threshold mask and no proof-exit progress. The current test name at `app/src/transitions/figure2-proof-chain.test.ts:332` even codifies “mask the live Proof layer” rather than complementary source/receiver coverage.

This confirms G3-2. The binary table itself is correct: `thresholdTable()` emits only `0` and `1`. The attachment target and polarity coverage are wrong.

There are two additional coverage gaps in the same code path. `app/src/stage/Stage.tsx:55-82` owns the Proof paper ground outside the masked Proof layer and mounts it only after a Proof Scene becomes visible, so it cannot be prepared or thresholded with the receiver. Also, `.r4-figure2` owns an opaque dark root background outside any proposed child mask. Unless the Proof ground becomes a pre-mounted reveal target and the complete Figure2 field background moves inside the concealed depth wrapper, the background will still bypass the z-depth threshold even if the middle images are fixed.

### Finding E — the retained arch was explicitly removed

The current Proof components contain no `arch2d-alpha.png`, and `app/src/stage/Stage.tsx:80-82` mounts only a paper ground. Git history shows that commit `9b688faf` removed the Stage-owned `stage-proof-retained-arch` image while applying the live Proof depth mask. The remaining `.r4-proof__arch` CSS has no matching JSX.

The current Figure2 arch is still inside `figure2-animation`, so it disappears when that Scene layer settles hidden. This is why it cannot persist through opening, cards, and closing. A single Stage-owned arch—not one copy per Proof Scene—is required to satisfy G3-3 without reintroducing duplicate endpoint visuals.

### Finding F — Figure2 brightness is one CSS tuning point

`app/src/styles.css:1297-1306` gives the near arch `brightness(.82)`. The previously retained Stage arch used the same general grade. G2 and G3 are therefore observing the same foreground asset/grade, not two independent brightness bugs. This plan centralizes the value and starts at `.76`, leaving opacity, contrast, saturation, and blur behavior unchanged.

### Finding G — Crane is already `normal`, but it is behind clouds and additionally faded

`app/src/styles.css:3164-3186` already sets `mix-blend-mode: normal` and `filter: none` for the main Crane video, so multiply/overlay is no longer the cause.

Two code paths still make it appear translucent/occluded:

- `.crane-video-transition--figure` is `z-index: 2`, while the arch and front clouds are `3`, `4`, and `5`;
- `renderCraneAnimationProgress()` writes the fractional `reveal` value into `--crane-video-opacity` while also applying a reveal clip.

The alpha WebM should supply transparency itself. The main video wrapper must be above the landscape PNGs, and CSS opacity must be `1` during its active media interval. This confirms G7-2 is both stacking and redundant opacity—not blend mode.

## Target file structure

### New files

- `app/src/transitions/shared/inkBoundary.ts` — deterministic radial/horizontal boundary frame generation and reveal/conceal clip serialization.
- `app/src/transitions/shared/inkBoundary.test.ts` — geometry, determinism, reverse symmetry, origin, and complement tests.
- `app/src/stage/RetainedFigure2Arch.tsx` — one Stage-owned Figure2/Proof arch and its mounted/visible state calculation.
- `app/src/stage/RetainedFigure2Arch.test.tsx` — singleton ownership, direct-seek defaults, and visibility coverage.
- `app/src/stage/Stage.retained-proof.test.tsx` — pre-mounted Proof ground, retained arch continuity, and mask-target availability.

### Core files to modify

- `app/src/vendor/ink-scene-transition.js`
- `app/src/vendor/ink-scene-transition.d.ts`
- `app/src/vendor/ink-scene-transition.test.ts`
- `app/src/vendor/ink-scene-transition.lifecycle.test.ts`
- `app/src/transitions/shared/sceneInk.ts`
- `app/src/transitions/shared/ink.ts`
- `app/src/transitions/shared/ink.test.ts`
- `app/src/transitions/scene-identity.test.ts`
- `app/src/styles.css`

### G1 files to modify

- `app/src/scenes/pattern/index.tsx`
- `app/src/scenes/pattern/patternBloomRenderer.ts`
- `app/src/scenes/pattern/progress.test.ts`
- `app/src/transitions/hero-pattern/index.ts`
- `app/src/transitions/hero-pattern/index.test.ts`
- `app/src/transitions/pattern-star-map/index.ts`
- `app/src/transitions/pattern-star-map/index.test.ts`
- `app/src/story/manifest.ts`
- `app/src/story/manifest.test.ts`
- `app/src/harness/r4/group1Manifest.ts`
- `app/src/harness/r4/group1Manifest.test.ts`
- `app/src/harness/r4/Group1Harness.tsx`

### Horizontal Ink call sites to modify

- `app/src/transitions/star-map-aod/index.ts`
- Delete: `app/src/transitions/star-map-aod/inkCurtain.ts` — remove the second vendor pass-through API.
- Modify: `app/src/transitions/star-map-aod/inkCurtain.test.ts` — convert it to the AOD one-boundary integration/lifecycle contract.
- `app/src/transitions/method-bottom-figure2/index.ts`
- `app/src/transitions/figure2-proof-brand/index.ts`
- `app/src/transitions/brand-figure3/index.ts`
- `app/src/transitions/services-ttg/index.ts`
- `app/src/transitions/ttg-lab/index.ts`
- `app/src/transitions/lab-ph/index.ts`
- `app/src/transitions/ph-education/index.ts`
- `app/src/transitions/education-crane/index.ts`
- their existing transition/group contract tests.

### Figure2 / Proof files to modify

- `app/src/stage/Stage.tsx`
- `app/src/stage/Stage.retained-proof.test.tsx`
- `app/src/scenes/figure2-animation/index.tsx`
- `app/src/scenes/figure2-animation/progress.test.ts`
- `app/src/transitions/shared/depthThresholdMask.ts`
- `app/src/transitions/shared/depthThresholdMask.test.ts`
- `app/src/transitions/figure2-distance-expand/index.ts`
- `app/src/transitions/figure2-proof-chain.test.ts`
- `app/src/scenes/figure2-proof-scenes.test.ts`

### Crane files to modify

- `app/src/scenes/crane-animation/index.tsx`
- `app/src/scenes/group7-scenes.test.ts`
- `app/src/transitions/group7-transitions.test.ts`

---

### Task 1: Freeze the one-boundary contract with failing tests

**Files:**
- Create: `app/src/transitions/shared/inkBoundary.test.ts`
- Modify: `app/src/transitions/shared/ink.test.ts:114-346`
- Modify: `app/src/transitions/scene-identity.test.ts:1-45`
- Modify: `app/src/vendor/ink-scene-transition.test.ts`

- [x] **Step 1: Add failing deterministic boundary tests**

```ts
import { describe, expect, it } from 'vitest';
import { createInkBoundaryFrame } from './inkBoundary';

const viewport = { width: 1440, height: 900, samples: 96 } as const;

describe('InkBoundaryFrame', () => {
  it('builds the radial G1 edge around the Pattern center', () => {
    const frame = createInkBoundaryFrame(
      { kind: 'radial', origin: { x: 0.24, y: 0.55 }, seed: 'hero-pattern' },
      0.5,
      viewport
    );

    expect(frame.origin).toEqual({ x: 0.24, y: 0.55 });
    expect(frame.revealClipPath).toMatch(/^polygon\(/);
    expect(frame.revealClipPath).not.toContain('circle(');
    expect(frame.revealClipPath).not.toContain('inset(');
  });

  it('uses one organic profile for horizontal reveal and conceal', () => {
    const frame = createInkBoundaryFrame(
      { kind: 'horizontal', direction: 'bottom-to-top', seed: 'services-ttg' },
      0.5,
      viewport
    );

    expect(new Set(frame.profile).size).toBeGreaterThan(8);
    expect(frame.revealClipPath).toMatch(/^polygon\(/);
    expect(frame.concealClipPath).toMatch(/^polygon\(/);
    expect(frame.revealClipPath).not.toContain('inset(');
  });

  it('recreates the same boundary for forward and reverse sampling', () => {
    const spec = { kind: 'horizontal', direction: 'top-to-bottom', seed: 'ttg-lab' } as const;
    expect(createInkBoundaryFrame(spec, 0.63, viewport)).toEqual(
      createInkBoundaryFrame(spec, 0.63, viewport)
    );
  });
});
```

- [x] **Step 2: Make the shared Ink test reject the old independent clip**

Replace assertions that require `inset(...)` with assertions that require one boundary frame:

```ts
expect(toElement.dataset.r4InkBoundaryKind).toBe('horizontal');
expect(toElement.dataset.r4InkBoundaryProgress).toBe('0.7500');
expect(toElement.style.clipPath).toMatch(/^polygon\(/);
expect(toElement.style.clipPath).not.toContain('inset(');
expect(canvas.dataset.r4InkBoundaryRevision).toBe(toElement.dataset.r4InkBoundaryRevision);
```

- [x] **Step 3: Add static source guards**

```ts
expect(inkSource).not.toContain('function targetClipPath');
expect(inkSource).not.toContain('return `inset(');
expect(inkSource).not.toContain('return `circle(');
expect(inkSource).not.toContain('clipProgress?:');
expect(inkSource).not.toContain('inkProgress?:');
expect(inkSource).toContain('boundaryProgress?:');
```

Keep the existing clone/target-texture prohibitions and add `createInkTargetTexture(`, `targetSrc:`, and `nextSceneElement:` to the production scan if they are not already covered.

- [x] **Step 4: Run the focused tests and confirm failure**

Run:

```bash
pnpm -C app exec vitest run \
  src/transitions/shared/inkBoundary.test.ts \
  src/transitions/shared/ink.test.ts \
  src/transitions/scene-identity.test.ts \
  src/vendor/ink-scene-transition.test.ts
```

Expected: FAIL because `inkBoundary.ts`, the boundary datasets, and the unified renderer API do not exist, while current code still emits `inset(...)`/`circle(...)`.

- [x] **Step 5: Commit the red contract**

```bash
git add app/src/transitions/shared/inkBoundary.test.ts \
  app/src/transitions/shared/ink.test.ts \
  app/src/transitions/scene-identity.test.ts \
  app/src/vendor/ink-scene-transition.test.ts
git commit -m "test: define single ink boundary contract"
```

### Task 2: Implement deterministic Ink boundary frames

**Files:**
- Create: `app/src/transitions/shared/inkBoundary.ts`
- Modify: `app/src/vendor/ink-scene-transition.js:16-280`
- Modify: `app/src/vendor/ink-scene-transition.d.ts:1-35`
- Modify: `app/src/vendor/ink-scene-transition.lifecycle.test.ts`

- [x] **Step 1: Define the public geometry types**

```ts
export type InkOrigin = Readonly<{ x: number; y: number }>;

export type InkBoundarySpec =
  | Readonly<{ kind: 'radial'; origin: InkOrigin; seed: string }>
  | Readonly<{ kind: 'horizontal'; direction: 'top-to-bottom' | 'bottom-to-top'; seed: string }>;

export type InkBoundaryFrame = Readonly<{
  kind: InkBoundarySpec['kind'];
  origin: InkOrigin;
  progress: number;
  profile: Uint8Array;
  revealClipPath: string;
  concealClipPath: string | null;
  revision: string;
}>;

export function createInkBoundaryFrame(
  spec: InkBoundarySpec,
  progress: number,
  viewport: Readonly<{ width: number; height: number; samples?: number }>
): InkBoundaryFrame;
```

- [x] **Step 2: Implement a progress-only seeded profile**

Use a stable string hash and smooth adjacent samples. The body profile must not read `performance.now()`, `Date.now()`, or random state.

```ts
function sampleOffset(seed: number, index: number, progress: number): number {
  const energy = Math.sin(clamp(progress) * Math.PI);
  const low = hash01(seed ^ Math.floor(index / 8)) - 0.5;
  const high = hash01(seed ^ index * 0x45d9f3b) - 0.5;
  return (low * 0.080 + high * 0.026) * energy;
}
```

For horizontal mode, serialize the sampled y-edge plus the appropriate viewport edge into both reveal and conceal polygons. For radial mode, serialize 96 angle samples around the supplied origin using aspect-correct radius; return `concealClipPath: null` because G1 does not need an outside-hole clip.

- [x] **Step 3: Replace the vertical-only shader body edge**

Rename the vendor entry point to `createInkBoundaryTransition()` and upload `InkBoundaryFrame.profile` to a 1D `LUMINANCE` texture on each boundary revision. The fragment shader selects geometry explicitly:

```glsl
uniform sampler2D uBoundaryProfile;
uniform float uBoundaryKind; // 0 horizontal, 1 radial
uniform float uBoundaryDirection; // 0 bottom-to-top, 1 top-to-bottom
uniform vec2 uBoundaryOrigin;

float sampledBoundary(float coordinate) {
  return texture2D(uBoundaryProfile, vec2(fract(coordinate), 0.5)).r;
}

float horizontalEdge(vec2 uv) {
  float edgeY = sampledBoundary(uv.x);
  return uBoundaryDirection < 0.5 ? uv.y - edgeY : edgeY - uv.y;
}

float radialEdge(vec2 uv, float aspect) {
  vec2 delta = (uv - uBoundaryOrigin) * vec2(aspect, 1.0);
  float angle = atan(delta.y, delta.x) / 6.28318530718 + 0.5;
  float radius = sampledBoundary(angle);
  return radius - length(delta);
}

float edge = mix(horizontalEdge(uv), radialEdge(uv, aspect), uBoundaryKind);
```

Keep FBM, wet texture, veins, and particles, but derive `body`, `feather`, and particle windows from this shared `edge`. Time-based noise may decorate the band; it must not alter which side of the boundary owns a pixel.

- [x] **Step 4: Keep lifecycle and effect-only guarantees**

The new renderer must release the profile texture with the existing WebGL resources and must not accept target Scene sources:

```ts
export type InkBoundaryTransition = {
  render(frame: InkBoundaryFrame, pointerX?: number, pointerY?: number): void;
  prewarm(frame: InkBoundaryFrame): void;
  destroy(): void;
};
```

- [x] **Step 5: Run geometry and vendor tests**

```bash
pnpm -C app exec vitest run \
  src/transitions/shared/inkBoundary.test.ts \
  src/vendor/ink-scene-transition.test.ts \
  src/vendor/ink-scene-transition.lifecycle.test.ts
```

Expected: PASS; repeated progress produces byte-identical profiles and destroy releases the new texture once.

- [x] **Step 6: Commit the boundary engine**

```bash
git add app/src/transitions/shared/inkBoundary.ts \
  app/src/vendor/ink-scene-transition.js \
  app/src/vendor/ink-scene-transition.d.ts \
  app/src/vendor/ink-scene-transition.test.ts \
  app/src/vendor/ink-scene-transition.lifecycle.test.ts
git commit -m "feat: add deterministic ink boundary engine"
```

### Task 3: Make shared Ink consume one boundary frame

**Files:**
- Modify: `app/src/transitions/shared/sceneInk.ts:1-130`
- Modify: `app/src/transitions/shared/ink.ts:14-430`
- Modify: `app/src/transitions/shared/ink.test.ts`

- [x] **Step 1: Replace origin/clip dual controls with an explicit boundary API**

```ts
export type InkBoundaryRoots = Readonly<{
  from: HTMLElement | null;
  to: HTMLElement | null;
  stage: HTMLElement | null;
}>;

export type InkBoundarySurfaces = Readonly<{
  reveal?: readonly HTMLElement[];
  conceal?: readonly HTMLElement[];
}>;

export type InkSegmentOptions = {
  id: SegmentId;
  boundary: InkBoundarySpec | ((roots: InkBoundaryRoots) => InkBoundarySpec);
  boundaryProgress?: (progress: number) => number;
  boundarySurfaces?: (roots: InkBoundaryRoots) => InkBoundarySurfaces;
  prepareEndpoints(roots: InkEndpointRoots): void;
  renderSource?: (root: HTMLElement | null, progress: number) => void;
  renderSourceProgress?: 'static' | 'remaining' | 'forward' | ((progress: number) => number);
  // existing timing, stops, root selector, and readiness fields remain
};
```

Delete `origin`, `clipTarget`, `revealMode`, `clipProgress`, and `inkProgress` after all call sites compile against this API.

- [x] **Step 2: Resolve one frame inside `progress()`**

```ts
const boundaryProgress = clamp(this.options.boundaryProgress?.(clamped) ?? clamped);
const frame = createInkBoundaryFrame(
  this.boundarySpec,
  boundaryProgress,
  viewportFor(activeSurfaceHost)
);

for (const element of [liveToElement, ...(surfaces.reveal ?? [])]) {
  applyRevealBoundary(element, frame);
}
for (const element of surfaces.conceal ?? []) {
  applyConcealBoundary(element, frame);
}
this.inkRenderer?.render(frame);
```

`applyRevealBoundary()` and `applyConcealBoundary()` must write the same `revision` and progress datasets as the canvas. This makes disagreement testable without reading pixels.

- [x] **Step 3: Preserve terminal surfaces safely**

At `p=1`, clear the receiver reveal clip because the target is fully canonical. For a concealed auxiliary source surface, synchronously set `visibility: hidden` before clearing its clip so disposal cannot flash it. At `p=0`, restore that auxiliary surface to its canonical visible state. Clear all temporary datasets in both cases.

- [x] **Step 4: Update the renderer wrapper and canvas metadata**

Rename the shared wrapper to `createBoundaryInkRenderer()`, mark the canvas renderer as `boundary`, and retain `r4InkEffectOnly=true`. Do not add any target readiness, upload, or capture dataset.

- [x] **Step 5: Run shared contract tests**

```bash
pnpm -C app exec vitest run \
  src/transitions/shared/inkBoundary.test.ts \
  src/transitions/shared/ink.test.ts \
  src/transitions/shared/sceneInk.lifecycle.test.ts \
  src/transitions/scene-identity.test.ts
```

Expected: PASS; receiver, auxiliary surfaces, and effect canvas report the same boundary revision; no test expects `inset(...)`.

- [x] **Step 6: Commit shared integration**

```bash
git add app/src/transitions/shared/sceneInk.ts \
  app/src/transitions/shared/ink.ts \
  app/src/transitions/shared/ink.test.ts \
  app/src/transitions/shared/sceneInk.lifecycle.test.ts \
  app/src/transitions/scene-identity.test.ts
git commit -m "refactor: unify ink effect and scene boundary"
```

### Task 4: Migrate every horizontal Ink segment off the hard line

**Files:**
- Modify all files listed under “Horizontal Ink call sites to modify”
- Modify: `app/src/harness/r3/pilot-contract.test.ts`
- Modify: `app/src/transitions/figure2-proof-chain.test.ts`
- Modify: `app/src/transitions/group4-transitions.test.ts`
- Modify: `app/src/transitions/group5-transitions.test.ts`
- Modify: `app/src/transitions/group6-transitions.test.ts`
- Modify: `app/src/transitions/group7-transitions.test.ts`

- [x] **Step 1: Migrate bottom-to-top segments**

Use this exact boundary shape for `method-bottom-figure2`, `figure2-proof-brand`, `brand-figure3`, `services-ttg`, and `education-crane`:

```ts
boundary: {
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: '<segment-id>'
}
```

For `method-bottom-figure2`, replace both old progress callbacks with:

```ts
boundaryProgress: figure2InkProgressForMethodBottom
```

- [x] **Step 2: Migrate top-to-bottom segments**

Use:

```ts
boundary: {
  kind: 'horizontal',
  direction: 'top-to-bottom',
  seed: '<segment-id>'
}
```

Apply this to `ttg-lab`, `lab-ph`, and `ph-education`. Preserve their existing delayed mappings by renaming each local `inkProgress()` callback to `boundaryProgress()` and passing it once.

- [x] **Step 3: Migrate `star-map-aod` to the same boundary controller**

Delete `renderLiveRevealClip()` from `app/src/transitions/star-map-aod/index.ts`. Delete the local `inkCurtain.ts` pass-through and consume the shared boundary renderer directly. Use the AOD scene's existing effect canvas with a bottom-to-top boundary frame, and apply that same frame to `[data-aod-reveal-surface]`. Preserve its current color/cover/fade preset and canonical AOD Scene root. Convert `inkCurtain.test.ts` from testing the deleted alias to asserting that AOD receiver and canvas share one boundary revision and that disposal releases the vendor resources once.

- [x] **Step 4: Replace hard-line assertions**

For each segment, assert:

```ts
expect(receiver.style.clipPath).toMatch(/^polygon\(/);
expect(receiver.style.clipPath).not.toContain('inset(');
expect(receiver.dataset.r4InkBoundaryKind).toBe('horizontal');
expect(receiver.dataset.r4InkBoundaryRevision).toBe(effectCanvas.dataset.r4InkBoundaryRevision);
```

Also keep forward/reverse endpoint, independent disposal, effect-only canvas, and Scene identity checks.

- [x] **Step 5: Run all horizontal transition contracts**

```bash
pnpm -C app exec vitest run \
  src/harness/r3/pilot-contract.test.ts \
  src/transitions/star-map-aod/inkCurtain.test.ts \
  src/transitions/method-bottom-figure2/index.test.ts \
  src/transitions/figure2-proof-chain.test.ts \
  src/transitions/group4-transitions.test.ts \
  src/transitions/group5-transitions.test.ts \
  src/transitions/group6-transitions.test.ts \
  src/transitions/group7-transitions.test.ts
```

Expected: PASS; all listed horizontal segments use polygonal Ink profiles and none uses a straight `inset` receiver boundary.

- [x] **Step 6: Commit horizontal migration**

```bash
git add app/src/transitions/star-map-aod \
  app/src/transitions/method-bottom-figure2 \
  app/src/transitions/figure2-proof-brand \
  app/src/transitions/brand-figure3 \
  app/src/transitions/services-ttg \
  app/src/transitions/ttg-lab \
  app/src/transitions/lab-ph \
  app/src/transitions/ph-education \
  app/src/transitions/education-crane \
  app/src/harness/r3/pilot-contract.test.ts \
  app/src/transitions/figure2-proof-chain.test.ts \
  app/src/transitions/group4-transitions.test.ts \
  app/src/transitions/group5-transitions.test.ts \
  app/src/transitions/group6-transitions.test.ts \
  app/src/transitions/group7-transitions.test.ts
git commit -m "fix: align horizontal scene reveal to ink boundary"
```

### Task 5: Restore G1 radial Ink and Pattern's second input phase

**Files:**
- Modify all files listed under “G1 files to modify”

- [x] **Step 1: Add failing Pattern-center tests**

```ts
expect(patternCenterForViewport(1440)).toEqual({ x: 0.24, y: 0.55 });
expect(patternCenterForViewport(760)).toEqual({ x: 0.50, y: 0.58 });
```

Use the same helper for Pattern renderer metrics and both transition boundary specs. Do not keep separate hard-coded transition origins.

Make `760px` explicitly mobile in that helper so CSS, the canvas center, and the Ink origin agree at the breakpoint. The Pattern Scene should expose the resolved center through its existing CSS variables; transitions read the same resolved values rather than defining constants of their own.

- [x] **Step 2: Make `hero-pattern` radial-only**

Keep the live Pattern at its expanded hold (`progress=0`) and configure:

```ts
boundary: ({ to }) => ({
  kind: 'radial',
  origin: readPatternCenter(to),
  seed: 'hero-pattern'
})
```

Do not drive Pattern collapse inside `hero-pattern`. Its sole job is Hero → fully expanded Pattern via the radial Ink boundary.

- [x] **Step 3: Convert `pattern-star-map` to two staged phases**

Use two 1800 ms phases so the existing 1800 ms Ink duration is preserved and the new collapse receives an equally explicit input phase:

```ts
export const PATTERN_COLLAPSE_STOP = 0.5;
export const PATTERN_COLLAPSE_MS = 1800;
export const PATTERN_STAR_MAP_INK_MS = 1800;

function boundaryProgress(progress: number): number {
  return range01(progress, PATTERN_COLLAPSE_STOP, 1);
}

function collapseProgress(progress: number): number {
  return range01(progress, 0, PATTERN_COLLAPSE_STOP);
}
```

Bind the radial boundary to the canonical source Pattern and map source progress explicitly:

```ts
boundary: ({ from }) => ({
  kind: 'radial',
  origin: readPatternCenter(from),
  seed: 'pattern-star-map'
}),
boundaryProgress,
renderSourceProgress: collapseProgress,
renderSource: (root, mapped) => renderPatternProgress(root, mapped, {
  visible: true,
  copyProgress: 1,
  rotationProgress: mapped
}),
sample: (progress) => samplePatternThenStarMap(boundaryProgress(progress))
```

`samplePatternThenStarMap(0)` must keep the canonical Pattern visible and the canonical Star Map hidden for the entire first stage. Only a positive radial boundary progress may expose Star Map. Do not remove or replace the five canonical `02`-`06` rotor/source-art layers: stage `0` must end with the canvas bloom compact, rotation terminal, and the lotus/constellation/twining-branch composition still mounted.

- [x] **Step 4: Change the manifest policy**

```ts
case 'pattern-star-map':
  return {
    policy: stagedPolicy(
      [PATTERN_COLLAPSE_STOP],
      [PATTERN_COLLAPSE_MS, PATTERN_STAR_MAP_INK_MS]
    ),
    virtualDuration: PATTERN_COLLAPSE_MS + PATTERN_STAR_MAP_INK_MS
  };
```

Remove the `group1Manifest.ts` scrub override. The first Forward ends at `stage:0` with Pattern compact and Star Map hidden; the second Forward runs radial Ink to Star Map. Reverse performs those phases in the opposite order.

- [x] **Step 5: Add staged behavior tests**

```ts
timeline.progress(PATTERN_COLLAPSE_STOP);
expect(patternRoot.dataset.patternProgress).toBe('1.0000');
expect(context.from.visibility.visible).toBe(true);
expect(context.to.visibility.visible).toBe(false);
expect(effectCanvas.dataset.r4InkActive).toBe('false');
expect(patternRoot.querySelectorAll('[data-pattern-rotor]')).toHaveLength(5);

timeline.progress(0.75);
expect(context.to.visibility.visible).toBe(true);
expect(context.to.element?.dataset.r4InkBoundaryKind).toBe('radial');
expect(context.to.element?.dataset.r4InkBoundaryOrigin).toBe('0.2400,0.5500');
```

Also assert `timeline.pauses` contains `stage:0`, first/second Forward require separate runtime inputs, and reverse returns compact Pattern before expanding it.

- [x] **Step 6: Run G1 and manifest tests**

```bash
pnpm -C app exec vitest run \
  src/scenes/pattern/progress.test.ts \
  src/transitions/hero-pattern/index.test.ts \
  src/transitions/pattern-star-map/index.test.ts \
  src/story/manifest.test.ts \
  src/harness/r4/group1Manifest.test.ts \
  src/runtime/director.actor.test.ts \
  src/story/segment-player.test.ts
```

Expected: PASS; G1 has no curtain mode, Pattern collapse and radial handoff are separate staged inputs, and endpoints remain canonical.

- [x] **Step 7: Commit G1 restoration**

```bash
git add app/src/scenes/pattern \
  app/src/transitions/hero-pattern \
  app/src/transitions/pattern-star-map \
  app/src/story/manifest.ts \
  app/src/story/manifest.test.ts \
  app/src/harness/r4/group1Manifest.ts \
  app/src/harness/r4/group1Manifest.test.ts \
  app/src/harness/r4/Group1Harness.tsx \
  app/src/runtime/director.actor.test.ts \
  app/src/story/segment-player.test.ts
git commit -m "fix: restore staged pattern collapse and radial handoff"
```

### Task 6: Create one retained Figure2/Proof foreground arch

**Files:**
- Create: `app/src/stage/RetainedFigure2Arch.tsx`
- Create: `app/src/stage/RetainedFigure2Arch.test.tsx`
- Modify: `app/src/stage/Stage.tsx:8-102`
- Modify: `app/src/scenes/figure2-animation/index.tsx:1-319`
- Modify: `app/src/scenes/figure2-animation/progress.test.ts`
- Modify: `app/src/styles.css:207-225,1128-1306`

- [x] **Step 1: Write the singleton ownership test**

The Stage should mount one arch whenever Figure2 or any Proof Scene is in the layer window, even if that member is preloaded but hidden. The Scene components themselves must not render `arch2d-alpha.png`.

```ts
expect(markup.match(/data-stage-retained-figure2-arch=/g)).toHaveLength(1);
expect(figure2Markup).not.toContain('r4-figure2__near-arch');
expect(proofOpeningMarkup).not.toContain('r4-proof__arch');
expect(proofCardsMarkup).not.toContain('r4-proof__arch');
expect(proofClosingMarkup).not.toContain('r4-proof__arch');
```

- [x] **Step 2: Implement the retained component**

```tsx
const RETAINED_ARCH_SCENES = new Set<SceneId>([
  'figure2-animation',
  'figure2-proof-opening',
  'figure2-proof-cards',
  'figure2-proof-closing'
]);

export function RetainedFigure2Arch({ mounted, visible }: { mounted: boolean; visible: boolean }) {
  if (!mounted) return null;
  return (
    <img
      className="stage-proof-retained-arch"
      data-stage-retained-figure2-arch="true"
      data-visible={String(visible)}
      src={FIGURE2_NEAR_ARCH_SRC}
      alt=""
      aria-hidden="true"
    />
  );
}
```

Mount state comes from layer-window membership; visible state comes from the maximum visibility of the four owning scenes. This ensures the node exists before `method-bottom-figure2` begins and remains the same DOM node through Proof closing.

- [x] **Step 3: Move Figure2 arch progress to the retained node**

Remove the in-Scene near-arch `<img>`. `renderFigure2AnimationProgress()` should resolve the Stage retained node and write scale/blur to it; CSS supplies terminal defaults for direct Proof seeks.

```ts
const retainedArch = root
  ?.closest<HTMLElement>('[data-testid="r2-stage"]')
  ?.querySelector<HTMLElement>('[data-stage-retained-figure2-arch="true"]');

retainedArch?.style.setProperty('--r4-figure2-near-arch-scale', nearArchScale.toFixed(4));
retainedArch?.style.setProperty('--r4-figure2-near-arch-blur', `${nearArchBlur.toFixed(2)}px`);
```

- [x] **Step 4: Centralize and darken the grade**

```css
.stage-proof-retained-arch {
  --r4-figure2-near-arch-brightness: .76;
  opacity: .98;
  filter:
    blur(var(--r4-figure2-near-arch-blur, 3.6px))
    brightness(var(--r4-figure2-near-arch-brightness))
    contrast(1.08)
    saturate(.84)
    sepia(.04);
  transform: translate3d(-50%, -50%, 0)
    scale(var(--r4-figure2-near-arch-scale, 1.135));
}

.stage-proof-retained-arch[data-visible="false"] {
  opacity: 0;
  visibility: hidden;
}
```

Keep it at `z-index: 72`, above Scene layers and below the Ink effect canvas at `90`.

- [x] **Step 5: Add the retained arch to Method → Figure2 reveal surfaces**

```ts
boundarySurfaces: ({ stage }) => ({
  reveal: [
    stage?.querySelector<HTMLElement>('[data-stage-retained-figure2-arch="true"]')
  ].filter((element): element is HTMLElement => Boolean(element))
})
```

The arch and Figure2 receiver must report the same boundary revision during G2.

- [x] **Step 6: Run Stage and Figure2 tests**

```bash
pnpm -C app exec vitest run \
  src/stage/RetainedFigure2Arch.test.tsx \
  src/stage/Stage.reading.test.ts \
  src/scenes/figure2-animation/progress.test.ts \
  src/transitions/method-bottom-figure2/index.test.ts \
  src/scenes/figure2-proof-scenes.test.ts
```

Expected: PASS; exactly one retained arch exists, follows Figure2 intro progress, remains terminal through all Proof holds, and enters G2 on the same Ink boundary.

- [x] **Step 7: Commit retained foreground**

```bash
git add app/src/stage/RetainedFigure2Arch.tsx \
  app/src/stage/RetainedFigure2Arch.test.tsx \
  app/src/stage/Stage.tsx \
  app/src/scenes/figure2-animation/index.tsx \
  app/src/scenes/figure2-animation/progress.test.ts \
  app/src/scenes/figure2-proof-scenes.test.ts \
  app/src/transitions/method-bottom-figure2/index.ts \
  app/src/transitions/method-bottom-figure2/index.test.ts \
  app/src/styles.css
git commit -m "fix: retain one figure2 foreground arch through proof"
```

### Task 7: Apply complementary binary depth masks to live Figure2 and live Proof

**Files:**
- Modify: `app/src/scenes/figure2-animation/index.tsx:256-309`
- Modify: `app/src/styles.css:1156-1320`
- Modify: `app/src/stage/Stage.tsx:55-82`
- Create: `app/src/stage/Stage.retained-proof.test.tsx`
- Modify: `app/src/transitions/shared/depthThresholdMask.ts:1-173`
- Modify: `app/src/transitions/shared/depthThresholdMask.test.ts`
- Modify: `app/src/transitions/figure2-distance-expand/index.ts:85-205`
- Modify: `app/src/transitions/figure2-proof-chain.test.ts:321-399`

- [x] **Step 1: Group the source pixels that should threshold**

Move Figure2 field background, middle camera, cloud, far arcade, middle fresco, figures, and contact shadows into one live wrapper:

```tsx
<div className="r4-figure2__field">
  <div className="r4-figure2__depth-field" data-figure2-depth-field="true">
    <div className="r4-figure2__middle-camera">...</div>
    <div className="r4-figure2__figures">...</div>
  </div>
</div>
```

Move `.r4-figure2__field` background and pseudo-element styling to `.r4-figure2__depth-field`. Move the opaque `.r4-figure2` fallback background there as well and leave the Scene root/outer field transparent; otherwise the root would remain visible through every concealed depth pixel. The retained Stage arch is outside this wrapper and therefore cannot receive the depth mask.

In `Stage.tsx`, split Proof-ground state into `mounted` and `visible`: mount the single `[data-figure2-retained-ground]` whenever any Proof Scene belongs to the layer window, but make it visible only when Proof presentation is active. This makes the same ground node queryable before `figure2-distance-expand` starts, while avoiding a second background inside any Proof Scene.

```css
.stage-proof-retained-ground[data-visible="false"] {
  opacity: 0;
  visibility: hidden;
}
```

Do not conditionally remove either retained node merely because its owner is temporarily hidden; clip/mask preparation depends on stable node identity.

- [x] **Step 2: Expand the mask API to reveal and conceal targets**

```ts
export type DepthThresholdTarget = Readonly<{
  element: HTMLElement;
  polarity: 'reveal' | 'conceal';
}>;

export function createDepthThresholdMask(options: {
  host: HTMLElement | null;
  targets: readonly DepthThresholdTarget[];
  depthSrc: string;
  runId: string;
  steps?: number;
}): DepthThresholdMask | null;
```

Create two SVG masks from the same depth image and threshold index:

- reveal table: `table[index]`;
- conceal table: `1 - table[index]`.

Both remain `feComponentTransfer type="discrete"`, so every alpha value is exactly `0` or `1`.

- [x] **Step 3: Attach both polarities in the transition**

```ts
const fromRoot = sceneRoot(context.from.element, 'figure2-animation');
const depthField = fromRoot?.querySelector<HTMLElement>('[data-figure2-depth-field="true"]') ?? null;
const proofGround = sharedStageHost(context)
  ?.querySelector<HTMLElement>('[data-figure2-retained-ground="true"]') ?? null;

this.depthMask = createDepthThresholdMask({
  host: sharedStageHost(context),
  targets: [
    ...(depthField ? [{ element: depthField, polarity: 'conceal' as const }] : []),
    ...(proofGround ? [{ element: proofGround, polarity: 'reveal' as const }] : []),
    ...(context.to.element ? [{ element: context.to.element, polarity: 'reveal' as const }] : [])
  ],
  depthSrc: FIGURE2_DEPTH_IMAGE,
  runId: context.runId
});
```

Continue rendering the live Figure2 terminal frame with `proofProgress: 0`; the inverse binary mask—not opacity—removes its complete depth field. Continue rendering the live Proof hold once; the same reveal mask exposes both the canonical Proof layer and its one Stage-owned paper ground. Never apply either mask to `[data-stage-retained-figure2-arch]`.

- [x] **Step 4: Replace the current Proof-only test**

```ts
expect(proofLayer.style.getPropertyValue('mask-image')).toContain('depth-threshold-reveal-mask');
expect(proofGround.style.getPropertyValue('mask-image')).toContain('depth-threshold-reveal-mask');
expect(depthField.style.getPropertyValue('mask-image')).toContain('depth-threshold-conceal-mask');
expect(retainedArch.style.getPropertyValue('mask-image')).toBe('');
expect(proofLayer.dataset.r4DepthMaskValues).toBe('1,0');
expect(proofGround.dataset.r4DepthMaskValues).toBe('1,0');
expect(depthField.dataset.r4DepthMaskValues).toBe('0,1');
```

At a given pixel/index, assert `reveal + conceal === 1`. Repeat at start, middle, end, and after reverse sampling.

- [x] **Step 5: Verify endpoint disposal**

At `p=0`, disposal must leave Figure2 depth field fully visible and Proof hidden. At `p=1`, disposal must leave Proof fully visible, Figure2 hidden, and retained arch visible. Both SVG masks must be removed without a presentation change.

- [x] **Step 6: Run depth and Proof tests**

```bash
pnpm -C app exec vitest run \
  src/stage/Stage.retained-proof.test.tsx \
  src/transitions/shared/depthThresholdMask.test.ts \
  src/scenes/figure2-animation/progress.test.ts \
  src/transitions/figure2-proof-chain.test.ts \
  src/scenes/figure2-proof-scenes.test.ts
```

Expected: PASS; binary mask values remain `{0,1}`, source/receiver masks are complementary, and the retained foreground arch has no mask.

- [x] **Step 7: Commit live depth threshold coverage**

```bash
git add app/src/scenes/figure2-animation/index.tsx \
  app/src/scenes/figure2-animation/progress.test.ts \
  app/src/stage/Stage.tsx \
  app/src/stage/Stage.retained-proof.test.tsx \
  app/src/transitions/shared/depthThresholdMask.ts \
  app/src/transitions/shared/depthThresholdMask.test.ts \
  app/src/transitions/figure2-distance-expand/index.ts \
  app/src/transitions/figure2-proof-chain.test.ts \
  app/src/scenes/figure2-proof-scenes.test.ts \
  app/src/styles.css
git commit -m "fix: threshold live figure2 depth field into proof"
```

### Task 8: Keep the arch through Closing and remove it with Closing → Brand Ink

**Files:**
- Modify: `app/src/transitions/figure2-proof-brand/index.ts:1-22`
- Modify: `app/src/transitions/figure2-proof-chain.test.ts`
- Modify: `app/src/stage/RetainedFigure2Arch.tsx`
- Modify: `app/src/stage/RetainedFigure2Arch.test.tsx`

- [x] **Step 1: Add the retained arch as a concealed source surface**

```ts
boundarySurfaces: ({ stage }) => ({
  conceal: [
    stage?.querySelector<HTMLElement>('[data-stage-retained-figure2-arch="true"]')
  ].filter((element): element is HTMLElement => Boolean(element))
})
```

The closing copy remains the canonical `from` Scene. Brand remains the canonical `to` Scene. The retained arch is an auxiliary source surface only; it is not copied into either Scene.

- [x] **Step 2: Prove Closing transitions do not touch the arch**

For `figure2-proof-opening-cards` and `figure2-proof-cards-closing`, assert the retained node identity, filter, transform, opacity, and clip path are unchanged before and after both forward and reverse SectionHandoff transitions.

- [x] **Step 3: Prove Closing → Brand uses the same boundary revision**

```ts
timeline.progress(0.7);
expect(brandLayer.dataset.r4InkBoundaryRevision).toBe(
  retainedArch.dataset.r4InkBoundaryRevision
);
expect(retainedArch.style.clipPath).toMatch(/^polygon\(/);
expect(retainedArch.style.clipPath).not.toContain('inset(');
```

At `p=1`, assert Brand is visible, Proof is hidden, and retained arch is synchronously hidden before disposal clears temporary geometry. At reverse `p=0`, assert the same retained node is restored.

- [x] **Step 4: Run Proof-chain tests**

```bash
pnpm -C app exec vitest run \
  src/stage/RetainedFigure2Arch.test.tsx \
  src/transitions/figure2-proof-chain.test.ts
```

Expected: PASS; opening/cards/closing never alter the arch, and only `figure2-proof-brand` removes it on the same horizontal Ink boundary as the closing copy.

- [x] **Step 5: Commit Proof exit ownership**

```bash
git add app/src/transitions/figure2-proof-brand/index.ts \
  app/src/transitions/figure2-proof-chain.test.ts \
  app/src/stage/RetainedFigure2Arch.tsx \
  app/src/stage/RetainedFigure2Arch.test.tsx
git commit -m "fix: exit retained proof arch with closing ink"
```

### Task 9: Correct Crane alpha stacking and remove redundant opacity fade

**Files:**
- Modify: `app/src/scenes/crane-animation/index.tsx:87-142`
- Modify: `app/src/styles.css:3140-3255`
- Modify: `app/src/scenes/group7-scenes.test.ts:62-75`
- Modify: `app/src/transitions/group7-transitions.test.ts`

- [x] **Step 1: Write the failing stacking test**

```ts
expect(stylesheet).toMatch(
  /\.crane-video-transition--figure\s*\{[^}]*z-index:\s*6;/s
);
expect(stylesheet).toMatch(
  /\.crane-layer--cloud-front-second\s*\{[^}]*z-index:\s*5;/s
);
```

The main figure sits above all landscape PNGs and below the existing front/flock video at `z-index: 8`.

- [x] **Step 2: Make natural alpha own transparency**

Replace the fractional opacity calculation with an active-state value:

```ts
const figureActive = time >= FIGURE_START_SECONDS;
const videoOpacity = figureActive ? 1 : 0;
section?.style.setProperty('--crane-video-opacity', videoOpacity.toFixed(4));
```

Keep the current clip/unmask geometry and media-time mapping. Keep `mix-blend-mode: normal` and `filter: none`. Return `videoOpacity` from `renderCraneAnimationProgress()` so tests can assert it directly.

- [x] **Step 3: Add progress tests**

```ts
expect(renderCraneAnimationProgress(root, 0).videoOpacity).toBe(0);
expect(renderCraneAnimationProgress(root, 0.4).videoOpacity).toBe(1);
expect(renderCraneAnimationProgress(root, 0.8).videoOpacity).toBe(1);
```

Keep the existing forward/reverse media-time assertions to prevent a stacking fix from changing playback.

- [x] **Step 4: Run G7 tests**

```bash
pnpm -C app exec vitest run \
  src/scenes/group7-scenes.test.ts \
  src/transitions/group7-transitions.test.ts
```

Expected: PASS; main Crane uses normal blend, natural video alpha, full CSS opacity while active, and z-index above all cloud/arch PNGs.

- [x] **Step 5: Commit Crane correction**

```bash
git add app/src/scenes/crane-animation/index.tsx \
  app/src/scenes/group7-scenes.test.ts \
  app/src/transitions/group7-transitions.test.ts \
  app/src/styles.css
git commit -m "fix: place crane alpha video above landscape layers"
```

### Task 10: Run full regression and prepare HITL review

**Files:**
- Modify: `docs/superpowers/plans/2026-07-11-r4-ink-boundary-pattern-proof-polish.md` only for final checkmarks/results. If a gate exposes a stale assertion, return to the task that owns that exact test and fix it there; do not loosen Scene identity, reverse, disposal, effect-only canvas, or binary-mask contracts.

- [x] **Step 1: Run the static forbidden-pattern scan**

```bash
rg -n \
  'targetClipPath|createInkTargetTexture|targetSrc:|nextSceneElement:|cloneNode\(|<foreignObject|renderToProgress|clipProgress\?:|inkProgress\?:' \
  app/src/transitions app/src/vendor \
  -g '!*.test.*'
```

Expected: no matches. Any match is a blocker, not an accepted exception.

- [x] **Step 2: Run focused G1-G7 regression**

```bash
pnpm -C app exec vitest run \
  src/transitions/hero-pattern/index.test.ts \
  src/transitions/pattern-star-map/index.test.ts \
  src/transitions/method-bottom-figure2/index.test.ts \
  src/transitions/figure2-proof-chain.test.ts \
  src/transitions/group4-transitions.test.ts \
  src/transitions/group5-transitions.test.ts \
  src/transitions/group6-transitions.test.ts \
  src/transitions/group7-transitions.test.ts
```

Expected: PASS.

- [x] **Step 3: Run the full non-visual gate**

```bash
pnpm -C app test
pnpm -C app typecheck
pnpm -C app lint
pnpm -C app build
git diff --check
```

Expected: all commands exit `0`.

- [x] **Step 4: Confirm required automated acceptance facts**

- G1 Hero → Pattern and Pattern → Star Map report `boundaryKind=radial` and the actual Pattern origin.
- Pattern stage `0` ends compact with Star Map hidden; stage `1` alone runs radial Ink.
- Every horizontal segment reports one shared boundary revision across effect canvas and receiver.
- No receiver uses `inset(...)`.
- Figure2 depth field and both Proof receiver surfaces (copy plus retained ground) use complementary binary masks; retained arch has no depth mask.
- Exactly one retained arch DOM node exists through Figure2/Proof and exits only with Proof → Brand.
- Crane main figure is above landscape PNGs and has CSS opacity `1` while active.
- Forward, reverse, reduced motion, `0 -> 1 -> 0 -> 1`, p=0/p=1 disposal, Scene identity, and effect cleanup remain green.

- [x] **Step 5: Hand the following routes to HITL without running them in this implementation pass**

```text
/harness/r4-g1
/harness/r4-g2-method-bottom-figure2
/harness/r4-g3
/harness/r4-g4-brand-figure3
/harness/r4-g5
/harness/r4-g6
/harness/r4-g7
```

Manual review order:

1. G1: confirm both Ink transitions are radial from the Pattern center; first Forward inside `pattern-star-map` collapses Pattern only, second Forward enters Star Map.
2. G2/G4/G5/G6/G7: inspect the Ink edge throughout forward and reverse; no straight horizontal line may lead or trail the Ink body.
3. G3: confirm middle/far/background/figures switch in binary depth order, the foreground arch never thresholds, and the same arch persists through Closing.
4. Proof → Brand: confirm closing copy and retained arch leave on the same Ink edge.
5. G7: confirm natural-alpha Crane pixels cover the cloud PNGs and no CSS translucency remains during active playback.

- [x] **Step 6: Commit the completed plan record**

```bash
git add docs/superpowers/plans/2026-07-11-r4-ink-boundary-pattern-proof-polish.md
git diff --cached --check
git commit -m "docs: record r4 ink boundary implementation"
```

## Implementation result (2026-07-11)

- Base: `b71574924b26f5967bde9688ab4798890540cf0c` on `codex/r4-scene-identity`.
- Task commits: `3e597b6`, `0c65283`, `0adecec`, `d96b420`, `b8158d5`, `24eed73`, `1531cd9`, `79b1a71`, `80a0007`.
- Forbidden-pattern scan: PASS, no matches.
- Focused G1-G7 regression: PASS, 8 files / 92 tests.
- Full unit regression: PASS, 59 files / 372 tests.
- `typecheck`, `lint`, production `build`, and `git diff --check`: PASS.
- Automated acceptance facts in Step 4 are covered by the focused and full suites, including reverse, reduced-motion, disposal, Scene identity, shared boundary revision, complementary depth masks, singleton retained arch, and Crane stacking contracts.
- The production build still reports Vite's non-blocking chunk-size advisory; it exits `0` and is outside this plan's visual-correction scope.
- Playwright and manual visual review were intentionally not run. The seven routes in Step 5 remain the HITL handoff set.

## Requirement-to-task traceability

| User requirement | Implemented by |
|---|---|
| G1-1 Pattern-center origin | Tasks 2, 3, 5 |
| G1-2 radial rather than horizontal + circle double transition | Tasks 1-3, 5 |
| G1-3 Pattern → Star Map left-center radial | Task 5 |
| G1-4 restore collapse before another Forward enters Star Map | Task 5 |
| G1-5 correct radial from/to set | Tasks 3, 5 |
| G2-1 remove independent horizontal line, including reverse | Tasks 1-4, 6 |
| G3-1 darken near foreground arch | Task 6 |
| G3-2 binary z-depth affects middle/far/background, not only Proof text | Task 7 |
| G3-3 retain foreground arch through Closing and remove with Proof → Brand | Tasks 6-8 |
| G4-1 Brand → Figure3 hard line | Task 4 |
| G5-1 Services → TTG and TTG → Lab hard line | Task 4 |
| G6-1 Lab → PH and PH → Education hard line | Task 4 |
| G7-1 Education → Crane hard line | Task 4 |
| G7-2 Crane alpha stacking/opacity | Task 9 |

## Self-review result

- Every G1-G7 requirement maps to at least one implementation task.
- The plan preserves canonical Scene identity and explicitly forbids the texture/capture approach that previously caused `1a-1b-2a-2b`.
- The hard-line defect is fixed once in shared architecture and then migrated across all callers; there is no per-transition substitute line.
- Pattern collapse and radial handoff are separate runtime inputs, not two animations compressed into one transition.
- The depth mask has explicit reveal/conceal polarity and leaves one retained arch outside both masks.
- No placeholders or deferred implementation steps remain.
