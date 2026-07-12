# Lightweight Horizontal Ink Contour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace visibly lagging horizontal Generic Ink ownership gates with a lightweight per-invocation random erosion contour shared by the live target boundary and the WebGL macro front, with correct independent forward and reverse behavior.

**Architecture:** Keep the canonical `from` and `to` DOM scenes live and keep the Ink canvas effect-only. Each horizontal timeline creates one 32-sample contour from the authored seed plus unique `runId`; the DOM target consumes it as a polygon and WebGL consumes the same bytes as a one-row texture. Fresh forward and reverse invocations differ, while one active timeline remains continuous.

**Tech Stack:** TypeScript, React scene layers, Vitest/jsdom, WebGL 1 GLSL, CSS `clip-path`, Playwright functional contracts, pnpm/Vite.

---

## File map

- Create `app/src/transitions/shared/horizontalInkContour.ts`: run variation, 32-sample contour generation, interpolation, reveal/conceal polygon serialization.
- Create `app/src/transitions/shared/horizontalInkContour.test.ts`: deterministic-within-key, cross-run variation, endpoint, direction, and complement contracts.
- Modify `app/src/transitions/shared/inkField.ts`: horizontal frames carry contour, revision, threshold, and polygon ownership; radial/depth stay on existing contracts.
- Modify `app/src/transitions/shared/inkField.test.ts`: prove horizontal contour behavior and preserve radial/depth behavior.
- Modify `app/src/transitions/shared/ink.ts`: create one contour per run, pass it to every horizontal frame, apply/clear diagnostics, retain live scenes.
- Modify `app/src/transitions/shared/ink.test.ts`: target-only ownership, fresh-run variation, both directions, interruption, endpoints, and cleanup.
- Modify `app/src/transitions/shared/sceneInk.ts` and lifecycle tests: forward contour frames into the run-owned renderer and expose lifecycle diagnostics.
- Modify `app/src/vendor/ink-scene-transition.js` and lifecycle tests: one-row texture upload, shared threshold, bounded micro-displacement, horizontal seam-belt removal, release/context lifecycle.
- Modify `app/src/transitions/star-map-aod/index.ts` and `inkCurtain.test.ts`: opt the custom horizontal transition into the per-run contour.
- Modify the seven horizontal consumer/group tests and `app/e2e/r4-ink-occlusion.spec.ts`: bidirectional consumer contracts without screenshots.
- Modify architecture, contract-diff, regression, performance, candidate, and rollback documents for release evidence.
- Delete the uncommitted superseded `inkBoundaryMask*` and two-dimensional `inkBoundaryProfile*` exploration before implementation is staged.

## Task 1: Replace the superseded 2D experiment with a lightweight contour primitive

**Files:**
- Create: `app/src/transitions/shared/horizontalInkContour.ts`
- Create: `app/src/transitions/shared/horizontalInkContour.test.ts`
- Restore: `app/src/transitions/shared/inkField.ts`
- Restore: `app/src/transitions/shared/inkField.test.ts`
- Delete untracked exploration: `app/src/transitions/shared/inkBoundaryMask.ts`
- Delete untracked exploration: `app/src/transitions/shared/inkBoundaryMask.test.ts`
- Delete untracked exploration: `app/src/transitions/shared/inkBoundaryProfile.ts`
- Delete untracked exploration: `app/src/transitions/shared/inkBoundaryProfile.test.ts`

- [ ] **Step 1: Remove the superseded uncommitted SVG/2D profile exploration with `apply_patch` and restore `inkField.ts` plus its test to `HEAD` behavior before writing the new failing tests.**

- [ ] **Step 2: Write failing contour tests.**

Cover these concrete contracts:

```ts
const first = createHorizontalInkContour({ authoredSeed: 'services-ttg', variationKey: 'epoch:1' });
const replay = createHorizontalInkContour({ authoredSeed: 'services-ttg', variationKey: 'epoch:1' });
const nextRun = createHorizontalInkContour({ authoredSeed: 'services-ttg', variationKey: 'epoch:2' });

expect(first.samples).toHaveLength(32);
expect(first.samples).toEqual(replay.samples);
expect(first.revision).toBe(replay.revision);
expect(nextRun.revision).not.toBe(first.revision);
expect(nextRun.samples).not.toEqual(first.samples);
```

Also assert:

```ts
expect(horizontalInkPolygon(first, 'bottom-to-top', 0, 'reveal')).toContain('100.000%');
expect(horizontalInkPolygon(first, 'bottom-to-top', 1, 'reveal')).toContain('0.000%');
expect(horizontalInkPolygon(first, 'top-to-bottom', 0.5, 'reveal'))
  .not.toBe(horizontalInkPolygon(first, 'top-to-bottom', 0.5, 'conceal'));
expect(horizontalInkOffset(first, 0.5)).toBeGreaterThanOrEqual(-1);
expect(horizontalInkOffset(first, 0.5)).toBeLessThanOrEqual(1);
```

- [ ] **Step 3: Run the test and verify it fails because the module does not exist.**

Run:

```bash
pnpm --dir app vitest run src/transitions/shared/horizontalInkContour.test.ts
```

Expected: FAIL resolving `./horizontalInkContour`.

- [ ] **Step 4: Implement the focused contour API.**

Use this public shape:

```ts
export const HORIZONTAL_INK_CONTOUR_SAMPLES = 32;
export const HORIZONTAL_INK_CONTOUR_AMPLITUDE = 0.055;

export type HorizontalInkContour = Readonly<{
  seed: number;
  revision: string;
  samples: Uint8Array;
}>;

export function createHorizontalInkContour(input: {
  authoredSeed: string;
  variationKey: string;
}): HorizontalInkContour;

export function horizontalInkOffset(contour: HorizontalInkContour, x: number): number;

export function horizontalInkPolygon(
  contour: HorizontalInkContour,
  direction: 'bottom-to-top' | 'top-to-bottom',
  threshold: number,
  ownership: 'reveal' | 'conceal'
): string;
```

Generate a seeded, smoothed three-octave value-noise contour once. Encode signed samples into `0..255`; interpolate adjacent samples in `horizontalInkOffset()`. Multiply the decoded offset by `HORIZONTAL_INK_CONTOUR_AMPLITUDE * sin(PI * threshold)` when serializing CSS points so both endpoints collapse to exact canonical geometry.

- [ ] **Step 5: Run the focused test.**

Run:

```bash
pnpm --dir app vitest run src/transitions/shared/horizontalInkContour.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run typecheck for the new module.**

Run:

```bash
pnpm --dir app typecheck
```

Expected: PASS with the pre-existing Ink API restored.

- [ ] **Step 7: Commit and push the primitive phase.**

```bash
git add app/src/transitions/shared/horizontalInkContour.ts app/src/transitions/shared/horizontalInkContour.test.ts
git commit -m "feat(ink): add lightweight horizontal contour"
git push origin codex/react-refactor-r5-parity-cutover
```

## Task 2: Make horizontal `InkFieldFrame` own one threshold and polygon pair

**Files:**
- Modify: `app/src/transitions/shared/inkField.ts`
- Modify: `app/src/transitions/shared/inkField.test.ts`

- [ ] **Step 1: Add failing frame tests for a supplied run contour.**

The tests must construct one contour and prove every progress sample retains object identity:

```ts
const contour = createHorizontalInkContour({ authoredSeed: 'lab-ph', variationKey: 'epoch:7' });
const early = createInkFieldFrame(spec, 0.2, viewport, { contour });
const late = createInkFieldFrame(spec, 0.8, viewport, { contour });

expect(early.contour).toBe(contour);
expect(late.contour).toBe(contour);
expect(early.revision).toBe(contour.revision);
expect(early.threshold).toBe(inkOwnershipGateProgress(0.2));
expect(early.ownership.revealClip).toMatch(/^polygon\(/);
expect(early.ownership.concealClip).toMatch(/^polygon\(/);
expect(early.ownership.revealClip).not.toContain('inset(');
```

Retain explicit tests that radial uses `circle(...)` and depth keeps its existing depth transform/occlusion contract.

- [ ] **Step 2: Run the frame test and verify it fails on the missing contour option and fields.**

```bash
pnpm --dir app vitest run src/transitions/shared/inkField.test.ts
```

Expected: FAIL on `contour`, `revision`, or `threshold`.

- [ ] **Step 3: Implement a discriminated horizontal frame without changing radial/depth behavior.**

Add the optional fourth argument:

```ts
type InkFieldFrameOptions = Readonly<{ contour?: HorizontalInkContour }>;

export function createInkFieldFrame(
  spec: InkFieldSpec,
  progress: number,
  viewport: InkViewport,
  options: InkFieldFrameOptions = {}
): InkFieldFrame;
```

For horizontal frames, resolve the provided contour and serialize reveal/conceal polygons using one `threshold = inkOwnershipGateProgress(progress)`. A deterministic `variationKey: 'static-frame'` fallback is allowed only for direct utility callers; transition timelines must always supply their run contour.

- [ ] **Step 4: Run contour and frame tests together.**

```bash
pnpm --dir app vitest run src/transitions/shared/horizontalInkContour.test.ts src/transitions/shared/inkField.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit and push the frame phase.**

```bash
git add app/src/transitions/shared/horizontalInkContour.ts app/src/transitions/shared/horizontalInkContour.test.ts app/src/transitions/shared/inkField.ts app/src/transitions/shared/inkField.test.ts
git commit -m "refactor(ink): share horizontal ownership threshold"
git push origin codex/react-refactor-r5-parity-cutover
```

## Task 3: Integrate per-invocation contours into live DOM timelines

**Files:**
- Modify: `app/src/transitions/shared/ink.ts`
- Modify: `app/src/transitions/shared/ink.test.ts`
- Modify: `app/src/transitions/star-map-aod/index.ts`
- Modify: `app/src/transitions/star-map-aod/inkCurtain.test.ts`

- [ ] **Step 1: Write failing shared-timeline tests.**

Assert that two contexts with different `runId` values receive different revisions, while multiple progress calls on one timeline retain the same revision. At `p=0.25` and `p=0.75`, assert the target clip is a polygon, both playback directions produce nonblank two-layer samples, and endpoint/dispose cleanup removes:

```text
data-r4-ink-contour-revision
data-r4-ink-contour-threshold
data-r4-ink-contour-seed
data-r4-ink-contour-direction
data-r4-ink-contour-samples
```

Also assert no `mask-image`, SVG element, snapshot dataset, or replacement scene root is introduced.

- [ ] **Step 2: Run shared Ink tests and verify the new assertions fail.**

```bash
pnpm --dir app vitest run src/transitions/shared/ink.test.ts
```

Expected: FAIL because timelines still use authored-only seeds and `inset(...)` diagnostics.

- [ ] **Step 3: Create and retain one contour in `InkSegmentTimeline`.**

After resolving `fieldSpec`, use:

```ts
this.horizontalContour = this.fieldSpec.kind === 'horizontal'
  ? createHorizontalInkContour({
      authoredSeed: this.fieldSpec.seed,
      variationKey: context.runId
    })
  : null;
```

Pass `{ contour: this.horizontalContour }` to prewarm and every progress frame. Apply contour diagnostics to managed reveal/conceal surfaces and the effect canvas, and remove them through the existing boundary cleanup path.

- [ ] **Step 4: Opt custom `star-map-aod` into the same run contour.**

Create the contour once inside `buildTimeline(context)` using `context.runId`, then pass it into both prewarm and render frame creation. Extend its test to cover fresh forward/reverse run variation, stable within-timeline revision, and endpoint cleanup.

- [ ] **Step 5: Run the focused timeline suites.**

```bash
pnpm --dir app vitest run src/transitions/shared/ink.test.ts src/transitions/star-map-aod/inkCurtain.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit and push the live-DOM phase.**

```bash
git add app/src/transitions/shared/ink.ts app/src/transitions/shared/ink.test.ts app/src/transitions/star-map-aod/index.ts app/src/transitions/star-map-aod/inkCurtain.test.ts
git commit -m "feat(ink): vary live horizontal contours per transition"
git push origin codex/react-refactor-r5-parity-cutover
```

## Task 4: Make WebGL consume the same macro contour once per revision

**Files:**
- Modify: `app/src/transitions/shared/sceneInk.ts`
- Modify: `app/src/transitions/shared/sceneInk.lifecycle.test.ts`
- Modify: `app/src/vendor/ink-scene-transition.js`
- Modify: `app/src/vendor/ink-scene-transition.lifecycle.test.ts`

- [ ] **Step 1: Write failing renderer lifecycle tests.**

The fake WebGL context must record `texImage2D`, `activeTexture`, and `deleteTexture`. Render the same contour at three progress values and assert one upload; render a second revision and assert a second upload; destroy and assert the contour texture is released once. Radial and depth frames must not upload a horizontal contour.

- [ ] **Step 2: Run the two renderer lifecycle suites and verify failure.**

```bash
pnpm --dir app vitest run src/transitions/shared/sceneInk.lifecycle.test.ts src/vendor/ink-scene-transition.lifecycle.test.ts
```

Expected: FAIL because no contour texture or upload revision exists.

- [ ] **Step 3: Add the one-row WebGL texture and uniforms.**

Create a second texture unit for horizontal contour bytes and uniforms equivalent to:

```glsl
uniform sampler2D uContourMap;
uniform float uContourReady;
uniform float uOwnershipThreshold;

float horizontalContour(vec2 uv, float threshold) {
  float signedSample = texture2D(uContourMap, vec2(uv.x, 0.5)).r * 2.0 - 1.0;
  return signedSample * 0.055 * sin(clamp(threshold, 0.0, 1.0) * 3.14159265) * uContourReady;
}
```

For horizontal mode, compute the macro rank from directional Y plus this contour and use `uOwnershipThreshold` for the front. Keep `uProgress` for energy, fade, and particles. Bound the remaining procedural displacement to the visible edge band; do not let it create a second macro front.

- [ ] **Step 4: Remove the old horizontal seam belt only.**

Retain existing radial/depth behavior, but prevent horizontal alpha from being forced through `uOcclusionAlphaMin`. The organic Ink body and edge remain visible; no second straight ownership belt is added.

- [ ] **Step 5: Upload only when `frame.contour.revision` changes and expose counts.**

Use the existing generation guards. Set `data-r4-ink-contour-texture-uploads`, contour revision, and threshold on the effect canvas; clear them on destroy. Release the contour texture alongside existing buffer/program/depth resources.

Add a focused test in `sceneInk.lifecycle.test.ts` that makes renderer creation unavailable for a horizontal frame and expects timeline build to reject through the existing build/recovery path. Do not continue with only the DOM polygon visible. Keep the established radial/depth unavailable-renderer behavior unchanged in this unit.

- [ ] **Step 6: Run renderer, shared timeline, and field suites.**

```bash
pnpm --dir app vitest run \
  src/transitions/shared/horizontalInkContour.test.ts \
  src/transitions/shared/inkField.test.ts \
  src/transitions/shared/ink.test.ts \
  src/transitions/shared/sceneInk.lifecycle.test.ts \
  src/vendor/ink-scene-transition.lifecycle.test.ts \
  src/transitions/star-map-aod/inkCurtain.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run typecheck and lint.**

```bash
pnpm --dir app typecheck
pnpm --dir app lint
```

Expected: PASS.

- [ ] **Step 8: Commit and push the WebGL phase.**

```bash
git add app/src/transitions/shared/sceneInk.ts app/src/transitions/shared/sceneInk.lifecycle.test.ts app/src/vendor/ink-scene-transition.js app/src/vendor/ink-scene-transition.lifecycle.test.ts
git commit -m "feat(ink): align shader with live contour front"
git push origin codex/react-refactor-r5-parity-cutover
```

## Task 5: Migrate and verify all horizontal consumers in both directions

**Files:**
- Modify tests under:
  - `app/src/transitions/method-bottom-figure2/`
  - `app/src/transitions/figure2-proof-brand/`
  - `app/src/transitions/brand-figure3/`
  - `app/src/transitions/services-ttg/`
  - `app/src/transitions/lab-ph/`
  - `app/src/transitions/education-crane/`
- Modify: `app/src/transitions/figure2-proof-chain.test.ts`
- Modify: `app/src/transitions/group4-transitions.test.ts`
- Modify: `app/src/transitions/group5-transitions.test.ts`
- Modify: `app/src/transitions/group6-transitions.test.ts`
- Modify: `app/src/transitions/group7-transitions.test.ts`
- Modify: `app/src/harness/r3/pilot-contract.test.ts`
- Modify: `app/src/harness/r4/inkE2eContract.test.ts`
- Modify: `app/e2e/r4-ink-occlusion.spec.ts`

- [ ] **Step 1: Update failing consumer assertions from horizontal inset gates to contour contracts.**

For every horizontal transition, sample forward `0.25 → 0.75` and reverse `0.75 → 0.25`; assert:

- target/managed surface clip starts with `polygon(`;
- contour threshold moves in the requested direction;
- contour revision remains stable during that timeline;
- a new reverse context uses a different run appearance seed;
- max visible canonical scenes remains two;
- no `mask-image`, SVG, scene snapshot, or replacement root exists;
- `ttg-lab` and `ph-education` still have no Ink canvas;
- reduced motion and dispose leave no contour styles or datasets.

For retained Figure2 surfaces, assert reveal and conceal polygons share revision/threshold and are complementary without masking the full source scene.

- [ ] **Step 2: Run affected Vitest suites and fix only contract mismatches.**

```bash
pnpm --dir app vitest run \
  src/transitions/method-bottom-figure2/index.test.ts \
  src/transitions/figure2-proof-chain.test.ts \
  src/transitions/group4-transitions.test.ts \
  src/transitions/group5-transitions.test.ts \
  src/transitions/group6-transitions.test.ts \
  src/transitions/group7-transitions.test.ts \
  src/harness/r3/pilot-contract.test.ts \
  src/harness/r4/inkE2eContract.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the single affected functional browser contract without screenshots.**

```bash
pnpm --dir app exec playwright test e2e/r4-ink-occlusion.spec.ts
```

Expected: all applicable Chromium/WebKit cases PASS, with no screenshot generation.

- [ ] **Step 4: Run affected lifecycle and bidirectional suites once more.**

```bash
pnpm --dir app vitest run \
  src/transitions/shared/sceneInk.lifecycle.test.ts \
  src/vendor/ink-scene-transition.lifecycle.test.ts \
  src/transitions/star-map-aod/inkCurtain.test.ts \
  src/transitions/figure2-proof-chain.test.ts \
  src/transitions/group4-transitions.test.ts \
  src/transitions/group5-transitions.test.ts \
  src/transitions/group6-transitions.test.ts \
  src/transitions/group7-transitions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit and push the consumer phase.**

```bash
git add \
  app/src/transitions/method-bottom-figure2/index.test.ts \
  app/src/transitions/figure2-proof-chain.test.ts \
  app/src/transitions/group4-transitions.test.ts \
  app/src/transitions/group5-transitions.test.ts \
  app/src/transitions/group6-transitions.test.ts \
  app/src/transitions/group7-transitions.test.ts \
  app/src/harness/r3/pilot-contract.test.ts \
  app/src/harness/r4/inkE2eContract.test.ts \
  app/e2e/r4-ink-occlusion.spec.ts
git commit -m "test(ink): cover bidirectional horizontal contours"
git push origin codex/react-refactor-r5-parity-cutover
```

## Task 6: Closure documentation and one final release matrix

**Files:**
- Modify: `docs/react-refactor/ARCHITECTURE.md`
- Modify: `docs/react-refactor/contract-diff/R5-production-parity-repair.md`
- Modify: `docs/react-refactor/reports/r5-regression-matrix.md`
- Modify: `docs/react-refactor/reports/r5-performance-budget.md`
- Modify: `docs/react-refactor/reports/r5-parity-repair-candidate.md`
- Modify: `docs/react-refactor/runbooks/react-cutover-rollback.md`
- Modify only if generated by the canonical build: release manifest/evidence artifacts already tracked by the repository

- [ ] **Step 1: Update architecture and contract evidence.**

Record the final contract accurately:

- two live scene roots plus one effect-only canvas;
- per-invocation random 32-sample horizontal contours;
- independent forward/reverse correctness, not shape replay;
- target/Ink macro alignment only, not pixel identity;
- no SVG, snapshot, or scene-texture compositor;
- Unit A staged dissolve remains separately revertible.

- [ ] **Step 2: Run the complete automated release matrix exactly once after implementation is complete.**

Run the repository's canonical gates once in this order and record exact counts/results:

```bash
pnpm run verify:all
pnpm -C app exec playwright test
pnpm -C app exec playwright test --config playwright.release.config.ts
pnpm -C app evidence:memory
```

The default and release Playwright commands include the historical harness, production functional matrix, SEO/no-JS cases, and performance cases defined by their configurations. Run the same-port corrected-branch → immutable legacy baseline → corrected-branch rollback rehearsal from separate clean worktrees as documented in `docs/react-refactor/runbooks/react-cutover-rollback.md`, using the final branch commit as the corrected source.

Do not move or reuse `react-refactor-r5-parity-repair-candidate`. Creating and pushing a new annotated candidate tag requires separate user authorization and is outside this implementation request. Record branch commit identity for this review build and leave exact-new-tag build evidence pending.

Do not capture screenshots and do not perform visual acceptance.

Expected: all required automated gates PASS; only declared project-applicability skips remain.

- [ ] **Step 3: Restore mechanically generated traces or temporary evidence not required by the repository contract.**

Use non-destructive path-specific restoration and verify `git status --short` contains only intended source, tests, and release documentation.

- [ ] **Step 4: Commit and push Closure.**

```bash
git add \
  docs/react-refactor/ARCHITECTURE.md \
  docs/react-refactor/contract-diff/R5-production-parity-repair.md \
  docs/react-refactor/reports/r5-regression-matrix.md \
  docs/react-refactor/reports/r5-performance-budget.md \
  docs/react-refactor/reports/r5-parity-repair-candidate.md \
  docs/react-refactor/runbooks/react-cutover-rollback.md
git commit -m "docs(release): record horizontal ink contour closure"
git push origin codex/react-refactor-r5-parity-cutover
```

- [ ] **Step 5: Report final commit chain, pushed branch, automated verification results, and remaining HITL visual acceptance to the user.**
