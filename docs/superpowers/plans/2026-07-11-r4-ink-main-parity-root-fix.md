# R4 Ink Main-Parity Root Fix Implementation Plan

> **Status:** completed historical plan. Implementation and contract follow-ups landed before the user-approved R4 head `55b8a12`; current release state is recorded in `docs/react-refactor/R4-CLOSEOUT.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not spawn subagents without explicit user permission.

**Goal:** Restore the Main-quality Ink erosion/particle field without reintroducing fake endpoint Scenes, correct the two radial origins and Pattern composition, align the Figure2 binary z-depth handoff, remove the Figure3 staged duplicate, and restore the intended Crane occlusion stack.

**Architecture:** The visible transition edge is owned by one procedural WebGL Ink field with three rank modes: horizontal, radial, and depth. Horizontal/radial live DOM ownership uses only a coarse `inset()` or `circle()` gate hidden inside a localized dark Ink core; it never supplies the visible edge. Figure2 keeps a live binary SVG depth mask because live DOM pixels must remain `0/1`, while the same depth transform drives an effect-only Ink canvas above it. Canonical `from`/`to` Scene roots stay mounted and unique; no target capture, clone, texture, or transition-only endpoint is allowed.

**Tech Stack:** React 19, TypeScript 5.8, Vitest 3, Vite 7, WebGL 1 / GLSL ES 1.00, SVG filters for the Figure2 binary mask only, Canvas 2D for Pattern, CSS `clip-path` for hidden ownership gates.

---

## Analysis baseline and review-route contract

- Reviewed branch: `codex/r4-scene-identity`
- Reviewed HEAD: `6441ce9423a91c4008f9c924eb3bba2bcf4d9029`
- Compared against `main`: `a78b064d65f024a301a3b179c62a458a1445bbf6`
- Method: code and Git-history inspection only; no page launch, Playwright, screenshot, or visual judgment.
- Human review routes are frozen to exactly:
  - `/harness/r4-g1`
  - `/harness/r4-g2`
  - `/harness/r4-g3`
  - `/harness/r4-g4`
  - `/harness/r4-g5`
  - `/harness/r4-g6`
  - `/harness/r4-g7`
- This plan does not add, rename, or ask the reviewer to use any route suffix. Existing internal harness modes are not design-review evidence.

## Executive conclusion

The current defects are not seven independent scene-tuning problems. There are five code-level root causes:

1. Commit `0c65283` replaced Main's procedural 2D Ink edge with a 96-sample CPU profile and a CSS/WebGL polygon boundary. The FBM, mud, ripple, breakup, and tendril terms are still calculated, but they no longer move the body edge. Particles are therefore attached to a simplified, crisp edge instead of an eroded one.
2. That profile is rebuilt, serialized into long `clip-path` strings, and uploaded with `gl.texImage2D` on almost every animation frame. Staged media renderers also keep rewriting terminal video times during the Ink tail. These are concrete hot-path regressions consistent with the reported stutter.
3. Pattern was split into two renderers: five full-size DOM rotors plus a Canvas renderer containing only layers `03/04`. Rotation progress is frozen during collapse, DPR fell from Main's `1.25` to `0.625`, and blur is baked into a maximum 512px texture before being enlarged. This explains the `011` direction, composition drift, soft/elliptical appearance, and excessive blur.
4. Figure2's depth image is masked in the outer field's object-bounding-box coordinates while the visible middle scene is translated and scaled inside `.r4-figure2__middle-camera`. The binary threshold is real, but it is not in the same camera space and it has no Main-style Ink erosion canvas above it.
5. Figure3 → Services is explicitly authored as a staged segment with a stop at `0.997`; Services is already complete before that stop. The next Forward only traverses the final `0.003`, so the current “pause then repeat Services” behavior is exactly what the manifest requests.

The Crane issue is simpler: its main alpha video is `z-index: 6`, above the building and both front clouds. The requested stack—and Main—is `back cloud 1 < main video 2 < building 3 < front clouds 4/5`.

---

## Code findings

### Finding A — the current Ink edge is no longer Main's erosion field

Main's horizontal shader builds its edge from the full procedural field:

```glsl
float field = (broad - 0.5) * 0.118
  + (wet - 0.5) * 0.078
  + (pore - 0.5) * 0.024
  + mud * 0.10
  + ripple;
field -= openingBreakup * edgeBand * 0.045;
float edge = p + tendril * (0.058 + wet * 0.116) - (sweepY + field);
```

Current `app/src/vendor/ink-scene-transition.js:89-130` instead samples `uBoundaryProfile` and sets `edge` directly from `horizontalEdge()` or `radialEdge()`. `broad`, `wet`, `pore`, `mud`, `openingBreakup`, and `tendril` are still calculated, but none of them modifies that edge.

Consequences:

- the visible ownership line is a smoothed 1D profile, not a 2D corrosion field;
- radial mode is an angular 96-sample outline, not Ink expanding through the picture plane;
- particles still exist, but `particleWindow` is measured from the simplified edge, so they look detached and unlike Main;
- `openingBreakup` only colors the feather; it no longer breaks the boundary itself.

This confirms problem A and every repeated “edge too clear / particles wrong” report.

### Finding B — the hard line is the actual live Scene cut showing through the effect canvas

`app/src/transitions/shared/inkBoundary.ts:27-181` creates 96-point `polygon(...)` strings for both horizontal and radial transitions. `app/src/transitions/shared/ink.ts:341-389` writes those polygons onto the live receiver and any retained reveal/conceal surfaces, then renders a separate WebGL canvas above them.

The WebGL core is not an opaque ownership mask. At the current preset its base alpha is roughly:

```text
0.14 + 0.82 × 0.72 = 0.7304
```

It also begins fading at progress `0.78`. A bright receiver edge can therefore show through the semi-transparent Ink body. Dark scenes hide that seam better, which matches the observation that Lab → PH and PH → Education look more convincingly eroded on the dark side while bright-side edges remain obvious.

This is why tweaking individual transition directions did not remove the line: the line belongs to the shared live Scene cut, not to G2/G4/G5/G6/G7 separately.

### Finding C — the shared Ink path has avoidable per-frame CPU, DOM, and GPU upload work

Every progress sample currently does all of the following:

1. allocates and smooths two 96-value JavaScript arrays;
2. allocates a `Uint8Array` profile;
3. expands it back into arrays and 96 formatted point strings;
4. joins one or two long CSS polygons;
5. hashes the full profile;
6. writes `clip-path` to one or more live DOM surfaces;
7. uploads the 1×96 texture with `gl.texImage2D`.

`profileRevision()` includes `progress.toFixed(6)`, so the revision changes on normal animation frames even when the quantized profile barely changes. `app/src/vendor/ink-scene-transition.js:273-289` consequently uploads the profile again.

There is a second staged-tail cost. `InkSegmentTimeline.progress()` always calls `renderSource`, even when the mapped source progress has already reached `1`. In PH → Education, `app/src/scenes/ph-animation/index.tsx:44-51` then assigns `video.currentTime` unconditionally on every terminal call. TTG has the same endpoint pattern. This gives PH → Education an additional media-seek hotspot during its Ink tail.

Code inspection cannot assign an exact frame-time percentage without profiling, but these are real, repeated hot-path writes absent from the intended uniform-only Ink render path. They are sufficient to treat the reported stutter as an implementation regression, not just subjective animation timing.

### Finding D — Hero → Pattern uses the wrong origin in code

`app/src/transitions/hero-pattern/index.ts:18-21` explicitly calls `readPatternCenter(to)`, resolving to the left Pattern center on desktop. The desired origin is the screen center and must be `{ x: 0.5, y: 0.5 }`, independent of Pattern's layout.

Pattern → Star Map is different: `app/src/transitions/pattern-star-map/index.ts:33-36` correctly resolves the live Pattern center and should keep doing so.

The two radial transitions therefore share one shader mode but intentionally use different origins:

| Segment | Required radial origin |
|---|---|
| Hero → Pattern | screen center `0.5, 0.5` |
| Pattern → Star Map | live Pattern center, desktop `0.24, 0.55`, mobile `0.50, 0.58` |

### Finding E — Pattern is a two-renderer hybrid, not the Main composition

Main's `js/pattern-mirror-stage.js` uses one Canvas renderer for all five art layers:

- `05/06`: decor layers;
- `03/04`: kaleidoscope petal source;
- `02/03/04`: terminal source flower, with authored anchors and `SOURCE_FLOWER_SCALE = 0.702`.

Current code diverges in four important ways:

1. `app/src/scenes/pattern/patternBloomRenderer.ts:30-101` only loads `03/04` into the Canvas renderer.
2. `app/src/scenes/pattern/index.tsx:39,146-159` adds all five assets again as independent full-size DOM rotors.
3. CSS rotates `02` reverse, `03` forward, `04` forward, which is the reported `011`; the requested compact flower is `02/03/04 = reverse/forward/reverse`, or `010`.
4. `renderPatternHold()` fixes `rotationProgress: 1`, and Pattern → Star Map also fixes `rotationProgress: 1` while collapse progress changes. Main couples collapse and field rotation, so the current sequence freezes a key part of the authored rotation.

The softness regression is also structural. Current Pattern uses `DPR_LIMIT = 0.625`, versus Main's `1.25`, and bakes `blur(8px)`/`blur(6px)` into a texture capped at 512px before scaling it to several viewport widths. The same numeric blur values therefore become much softer after enlargement. The filter constants did not become larger; the rasterization strategy magnified them.

The “ellipse / compressed / layers not aligned” report is consistent with the same split: viewport-sized DOM images and a separately anchored square Canvas flower no longer share one transform and one authored center.

### Finding F — Figure2's binary mask and visible camera use different coordinate spaces

`app/src/transitions/shared/depthThresholdMask.ts:180-193` creates an object-bounding-box mask and places the depth image at `0,0,1,1` with `xMidYMid slice`.

The mask is attached to `.r4-figure2__depth-field`, but its visible architecture is inside `.r4-figure2__middle-camera`. The same outer wrapper also contains the figure videos, even though `figure2-middle-depth.png` describes the architecture rather than those alpha silhouettes. At the end of the intro, code has moved the middle camera to approximately:

- scale: `1.012 + 0.13 = 1.142`;
- vertical translation: `-34px`;
- transform origin: `50% 56%`.

The depth image receives none of that transform, and one architectural map is also being reused as the figure mask. The user's “z-depth seems offset from the enlarged/moved picture” observation is therefore correct.

The edge is hard for a separate reason: the current mask only thresholds depth luminance. Main's `depthThresholdMode` adds broad/wet/pore FBM, ripple, tendrils, embers, and particles around the depth rank. None of that effect path is present in the current live binary-mask implementation.

The current exclusion of the Stage-owned foreground arch is correct and must remain. That arch stays live through Opening, Cards, and Closing, then joins Closing copy in the shared horizontal Ink transition to Brand.

### Finding G — Proof Opening has duplicate type rules and is larger than Main's transition scale

Current CSS defines both:

- `.r4-proof__lead h2`: `clamp(40px, 4.7vw, 82px)`;
- `.r4-proof-page .method-proof__closing`: `clamp(34px, 3.7vw, 58px)`.

The latter wins in the current page because of specificity, but the duplicated sources make the scale unstable. Main's Figure2 transition overlay uses `clamp(28px, 2.3vw, 42px)`. The current effective upper bound is therefore 16px larger, while the kicker stays 12px, producing the reported hierarchy gap.

Opening should consume one Proof type token derived from the Main transition scale. This is a CSS-system issue, not an animation issue.

### Finding H — Figure3's duplicate Services presentation is explicitly encoded

`app/src/story/manifest.ts:170-174` maps `figure3-services` to a staged policy sourced from the legacy inventory:

```json
{
  "stageStops": [0.997],
  "stagePlayMs": [2000, 620]
}
```

At the same time, `app/src/transitions/figure3-services/index.ts`:

- shows complete Services copy at progress `0.8`;
- finishes receiver paper/wash at the `0.997` stage stop;
- publishes a pause label at that stop;
- hides Figure3 at the stop.

The first Forward therefore reaches a visually complete Services frame and enters `staged-paused`; the second Forward advances only to `1` and settles the same Services Scene. The pause and apparent duplicate are deterministic consequences of this policy.

The legacy inventory should remain historical evidence. The canonical R4 manifest should override Figure3 → Services to one 2000ms snap segment rather than mutating the inventory to pretend the legacy seed never existed.

### Finding I — Crane's main alpha video is in the wrong layer band

Current styles are already correct on blend and filter:

```css
mix-blend-mode: normal;
filter: none;
```

The problem is `.crane-video-transition--figure { z-index: 6; }`, while the landscape is:

```text
back cloud 1
building/arch 3
front cloud 4
second front cloud 5
```

At `6`, the alpha video is above all of them, so none can occlude it. The required stack is exactly Main's stack: set the main figure wrapper back to `2`. Keep the separate front flock video at `8`.

---

## Dark-field discussion and decision

### The compositor constraint

With the confirmed “one live `from`, one live `to`, no fake Scene” contract, WebGL cannot directly cut pixels out of an arbitrary sibling DOM subtree. There are only three implementation families:

1. rasterize/capture the target and composite it inside WebGL;
2. apply a browser DOM mask/clip to the live target;
3. use a simple live-target ownership gate and hide that gate under an opaque-enough effect layer.

Option 1 recreates the fake/duplicate Scene problem already rejected. An exact dynamic 2D DOM mask for every Ink pixel would require a separate SVG/raster mask path and would again create a second boundary implementation. The viable contract-preserving solution is option 3.

### Recommendation: localized dark Ink core, not a full-screen dark fade

| Option | Result | Decision |
|---|---|---|
| No dark core | Bright live-target cut remains visible | Reject |
| Full-screen dim/black frame | Hides seam but creates a new fade and brightness jump | Reject |
| Local dark Ink body and seam-occlusion belt | Preserves live Scenes, makes corrosion readable, hides coarse ownership gate | **Recommend** |

Recommended behavior:

- the procedural Ink shader owns the only visible edge and particle field;
- a dark green-black core follows that edge;
- only a narrow seam-occlusion belt needs near-opaque alpha; the rest of the Ink body can remain close to Main's translucent wash;
- the receiver's simple `inset()` or `circle()` gate stays entirely inside that dark belt and is never presented as the visual edge;
- there is no independent global dim overlay on `from` or `to`;
- at `p=0` and `p=1`, the effect canvas is fully absent, so endpoint brightness is unchanged.

Initial shared tuning envelope for the first visual pass:

- core/body alpha: Main-like `0.72–0.82`;
- seam-occlusion belt: minimum `0.92` while the live gate is active;
- erosion band: approximately `0.10–0.14` normalized height at a 900px viewport;
- outgoing Scene global dim: `0`;
- separate per-segment vignettes: forbidden.

These are starting constraints, not final art-direction numbers. Tune one shared preset after reviewing all seven canonical routes; do not create per-page Ink forks.

### Layer model

```text
top     effect-only Ink canvas
        - procedural erosion edge
        - particles / embers / tendrils
        - localized dark seam-occlusion belt

middle  live `to` Scene
        - simple coarse ownership clip, hidden under Ink core

bottom  live `from` Scene
        - unchanged endpoint renderer
```

If the dark-core approach is rejected, the remaining exact per-pixel alternative is target rasterization/WebGL compositing, which conflicts with the established unique-Scene contract. That would require an explicit architecture change before implementation.

---

## Target Ink architecture

| Mode | Procedural rank | Live ownership | Authored use |
|---|---|---|---|
| `horizontal` | top/bottom sweep plus Main FBM erosion | coarse `inset()` hidden under core | most section handoffs |
| `radial` | aspect-correct distance from supplied origin plus the same FBM erosion | coarse `circle()` hidden under core | Hero → Pattern; Pattern → Star Map |
| `depth` | transformed depth-map rank plus Main threshold noise | complementary binary SVG mask; no SVG path | Figure2 → Proof Opening |

All modes share:

- one `edge` function;
- one `body/feather/hot` derivation;
- one particle/ember/tendril field;
- one dark-core preset;
- one effect-only canvas lifecycle;
- one deterministic segment seed.

Body erosion should be deterministic from `seed + progress + viewport`; particle drift may use time but must not move Scene ownership. This preserves reverse/scrub repeatability without returning to a 96-sample CPU profile.

## Non-negotiable implementation contracts

- Keep the canonical live `from` and `to` roots; `rootIdentity()` must remain stable.
- Do not add target Scene textures, screenshots, `foreignObject`, `cloneNode`, DOM replicas, or transition-only endpoint renderers.
- Delete the 96-point `polygon(...)` Ink boundary system and its per-frame LUMINANCE upload.
- Radial/horizontal transitions must not use an SVG path or SVG mask.
- Figure2 may keep an SVG filter mask only for live binary depth ownership; it must not contain an authored radial/horizontal path.
- Figure2 Scene pixels remain strictly `0` or `1`; semi-transparent Ink particles are effect pixels, not Scene opacity.
- Keep the retained Figure2 foreground arch outside the depth mask through Proof Closing.
- Keep Pattern's staged collapse pause. The first input collapses Pattern; the next input starts Pattern → Star Map Ink.
- Remove only the Figure3 → Services staged pause. TTG → Lab, PH → Education, Pattern → Star Map, and Figure2 → Proof retain their intentional stage boundaries.
- Do not change canonical review routes.
- No Playwright or visual review is part of the implementation tasks below. Human visual acceptance starts only after the code/test gate passes.

---

## Planned file changes

### Delete

- `app/src/transitions/shared/inkBoundary.ts`
- `app/src/transitions/shared/inkBoundary.test.ts`

### Create

- `app/src/transitions/shared/inkField.ts`
- `app/src/transitions/shared/inkField.test.ts`

### Shared Ink core

- `app/src/vendor/ink-scene-transition.js`
- `app/src/vendor/ink-scene-transition.d.ts`
- `app/src/vendor/ink-scene-transition.test.ts`
- `app/src/vendor/ink-scene-transition.lifecycle.test.ts`
- `app/src/transitions/shared/sceneInk.ts`
- `app/src/transitions/shared/sceneInk.lifecycle.test.ts`
- `app/src/transitions/shared/ink.ts`
- `app/src/transitions/shared/ink.test.ts`
- `app/src/transitions/scene-identity.test.ts`
- `app/src/styles.css`

### Ink consumers

- `app/src/transitions/star-map-aod/index.ts`
- `app/src/transitions/star-map-aod/inkCurtain.test.ts`
- `app/src/transitions/hero-pattern/index.ts`
- `app/src/transitions/hero-pattern/index.test.ts`
- `app/src/transitions/pattern-star-map/index.ts`
- `app/src/transitions/pattern-star-map/index.test.ts`
- `app/src/transitions/method-bottom-figure2/index.ts`
- `app/src/transitions/figure2-proof-brand/index.ts`
- `app/src/transitions/brand-figure3/index.ts`
- `app/src/transitions/services-ttg/index.ts`
- `app/src/transitions/ttg-lab/index.ts`
- `app/src/transitions/lab-ph/index.ts`
- `app/src/transitions/ph-education/index.ts`
- `app/src/transitions/education-crane/index.ts`
- `app/src/transitions/method-bottom-figure2/index.test.ts`
- `app/src/transitions/figure2-proof-chain.test.ts`
- `app/src/transitions/group4-transitions.test.ts`
- `app/src/transitions/group5-transitions.test.ts`
- `app/src/transitions/group6-transitions.test.ts`
- `app/src/transitions/group7-transitions.test.ts`

### Pattern

- `app/src/scenes/pattern/index.tsx`
- `app/src/scenes/pattern/patternBloomRenderer.ts`
- `app/src/scenes/pattern/patternBloomRenderer.test.ts`
- `app/src/scenes/pattern/progress.test.ts`
- `app/src/styles.css`

### Figure2 / Proof

- `app/src/scenes/figure2-animation/index.tsx`
- `app/src/scenes/figure2-animation/progress.test.ts`
- `app/src/transitions/shared/depthThresholdMask.ts`
- `app/src/transitions/shared/depthThresholdMask.test.ts`
- `app/src/transitions/figure2-distance-expand/index.ts`
- `app/src/transitions/figure2-proof-chain.test.ts`
- `app/src/scenes/figure2-proof-scenes.test.ts`
- `app/src/styles.css`

### Figure3, media endpoint idempotence, and Crane

- `app/src/story/manifest.ts`
- `app/src/story/manifest.test.ts`
- `app/src/transitions/figure3-services/index.ts`
- `app/src/transitions/group4-transitions.test.ts`
- `app/e2e/r4-g4.spec.ts` — update assertions only; do not run Playwright in this implementation pass.
- `app/src/scenes/ph-animation/index.tsx`
- `app/src/scenes/ttg-animation/index.tsx`
- `app/src/transitions/group5-transitions.test.ts`
- `app/src/transitions/group6-transitions.test.ts`
- `app/src/scenes/group7-scenes.test.ts`
- `app/src/styles.css`

---

## Implementation tasks

### Task 1: Freeze the recovered Ink contract with failing tests

**Files:**

- Create: `app/src/transitions/shared/inkField.test.ts`
- Modify: `app/src/transitions/shared/ink.test.ts`
- Modify: `app/src/vendor/ink-scene-transition.test.ts`
- Modify: `app/src/vendor/ink-scene-transition.lifecycle.test.ts`
- Modify: `app/src/transitions/scene-identity.test.ts`

- [ ] **Step 1: Add mode and ownership-envelope tests**

Define tests for an `InkFieldSpec` union containing `horizontal`, `radial`, and `depth`. Assert:

```ts
expect(heroField).toMatchObject({ kind: 'radial', origin: { x: 0.5, y: 0.5 } });
expect(patternStarField).toMatchObject({ kind: 'radial', origin: { x: 0.24, y: 0.55 } });
expect(horizontalFrame.ownership.revealClip).toMatch(/^inset\(/);
expect(radialFrame.ownership.revealClip).toMatch(/^circle\(/);
expect(horizontalFrame.ownership.revealClip).not.toContain('polygon(');
expect(frame.ownership.edge).toBeGreaterThanOrEqual(frame.occlusion.coreMin);
expect(frame.ownership.edge).toBeLessThanOrEqual(frame.occlusion.coreMax);
```

The ownership-envelope assertion is the code-level guarantee that the coarse live clip cannot outrun the dark Ink core.

- [ ] **Step 2: Add shader-source guards for Main erosion terms**

Assert the vendor shader contains `field`, `openingBreakup`, `tendril`, and a final edge expression that includes the procedural field. Reject the current profile path:

```ts
expect(source).not.toContain('uBoundaryProfile');
expect(source).not.toContain('sampledBoundary');
expect(source).not.toContain('gl.LUMINANCE');
expect(source).not.toContain('frame.profile');
expect(source).toContain('float field =');
expect(source).toMatch(/float edge = .*field/);
```

- [ ] **Step 3: Add lifecycle tests forbidding per-frame texture uploads**

Mock WebGL and render multiple horizontal/radial frames. Assert no `texImage2D` call occurs after initialization. For depth mode, assert the depth image uploads once when loaded and not once per progress sample.

- [ ] **Step 4: Keep Scene identity and fake-target prohibitions**

Extend the production-source scan to reject:

```text
createInkTargetTexture
nextSceneElement
targetSrc
foreignObject
cloneNode(
data-transition-ghost used as an endpoint Scene
```

Do not reject effect-only canvases or the Figure2 depth texture.

- [ ] **Step 5: Run the focused tests and confirm they fail for the expected reasons**

Run:

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app exec vitest run src/transitions/shared/inkField.test.ts src/transitions/shared/ink.test.ts src/vendor/ink-scene-transition.test.ts src/vendor/ink-scene-transition.lifecycle.test.ts src/transitions/scene-identity.test.ts
```

Expected failures: missing `inkField.ts`, current `uBoundaryProfile`, current `polygon(...)`, and repeated profile upload.

### Task 2: Replace the CPU profile engine with one procedural Ink field

**Files:**

- Delete: `app/src/transitions/shared/inkBoundary.ts`
- Delete: `app/src/transitions/shared/inkBoundary.test.ts`
- Create: `app/src/transitions/shared/inkField.ts`
- Modify: `app/src/vendor/ink-scene-transition.js`
- Modify: `app/src/vendor/ink-scene-transition.d.ts`
- Modify: `app/src/transitions/shared/sceneInk.ts`
- Modify: `app/src/transitions/shared/sceneInk.lifecycle.test.ts`
- Modify: `app/src/transitions/shared/ink.ts`
- Modify: `app/src/transitions/shared/ink.test.ts`
- Modify: `app/src/styles.css`

- [ ] **Step 1: Implement the field model without sampled geometry**

`inkField.ts` should export:

```ts
type InkFieldSpec =
  | { kind: 'horizontal'; direction: 'top-to-bottom' | 'bottom-to-top'; seed: string }
  | { kind: 'radial'; origin: { x: number; y: number }; seed: string }
  | { kind: 'depth'; depthSrc: string; seed: string; transform: InkDepthTransform };

type InkFieldFrame = {
  spec: InkFieldSpec;
  progress: number;
  seed: number;
  ownership: { revealClip: string | null; concealClip: string | null; edge: number };
  occlusion: { coreMin: number; coreMax: number };
};
```

Do not include `profile`, `revision`, sampled points, or polygon serialization.

- [ ] **Step 2: Restore Main's erosion body and generalize its rank source**

Port Main's broad/wet/pore/mud/ripple/opening-breakup/tendril edge calculation. Compute one base rank per mode:

```glsl
float baseRank = horizontalRank(...);
baseRank = mix(baseRank, radialRank(...), radialMode);
baseRank = mix(baseRank, depthRank(...), depthMode);
float field = ...;
float edge = uProgress + tendril * (...) - (baseRank + field);
```

Derive body, feather, hot band, veins, particles, ember, and color from this same `edge`.

- [ ] **Step 3: Separate deterministic body phase from particle time**

Hash the segment seed once and pass it as a uniform. Body erosion must be stable at the same progress in forward, reverse, and scrub. Allow wall-clock time only in particle drift/color flicker, not in the base ownership edge.

- [ ] **Step 4: Implement the localized dark core**

Add a seam-occlusion belt centered on the procedural edge. Its minimum active alpha is `0.92`; outside that belt, retain Main-like body alpha. Do not add a full-screen overlay or change endpoint Scene filters/brightness.

- [ ] **Step 5: Replace visible polygons with hidden coarse ownership gates**

Horizontal uses `inset()`, radial uses `circle()`. Offset the gate into the Ink core envelope. Keep the receiver fully hidden until the core has faded in, and finish the gate before the core begins fading out. Rename the diagnostic mode from `live-clip` to `ink-occluded-live-gate` so tests and future reviewers do not mistake the coarse gate for the visible Ink edge.

- [ ] **Step 6: Make source rendering idempotent in the Ink timeline**

Track the last `(sourceRoot, mappedSourceProgress)` pair. Call `renderSource` only when the root changes or mapped progress changes beyond epsilon. Continue rendering the WebGL field every active frame.

- [ ] **Step 7: Preserve lifecycle and endpoint presentation**

At `p=0` and `p=1`, clear ownership clips, remove all Ink attributes, destroy WebGL resources, and preserve the same live endpoint presentation before and after `dispose()`.

- [ ] **Step 8: Run focused tests**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app exec vitest run src/transitions/shared/inkField.test.ts src/transitions/shared/ink.test.ts src/transitions/shared/sceneInk.lifecycle.test.ts src/vendor/ink-scene-transition.test.ts src/vendor/ink-scene-transition.lifecycle.test.ts src/transitions/scene-identity.test.ts
```

- [ ] **Step 9: Commit the shared engine**

```bash
git add app/src/transitions/shared app/src/vendor/ink-scene-transition.js app/src/vendor/ink-scene-transition.d.ts app/src/vendor/ink-scene-transition.test.ts app/src/vendor/ink-scene-transition.lifecycle.test.ts app/src/transitions/scene-identity.test.ts app/src/styles.css
git commit -m "fix: restore procedural ink erosion field"
```

### Task 3: Migrate every Ink consumer and correct radial origins

**Files:**

- Modify: all files listed under “Ink consumers” above.

- [ ] **Step 1: Move Star Map → AOD onto `InkFieldFrame`**

Remove local boundary-frame marking and profile revisions. Reuse the shared renderer and hidden ownership gate while keeping its existing effect canvas mounted in the AOD Scene.

- [ ] **Step 2: Set Hero → Pattern to the screen center**

Replace `readPatternCenter(to)` with a named constant:

```ts
export const HERO_PATTERN_INK_ORIGIN = Object.freeze({ x: 0.5, y: 0.5 });
```

Keep Pattern → Star Map on `readPatternCenter(from)`.

- [ ] **Step 3: Keep exactly two radial consumers**

Add a static contract test that the R4 transition registry has radial mode only for:

```text
hero-pattern
pattern-star-map
```

All other shared Ink consumers remain horizontal, except Figure2 → Proof which uses depth mode.

- [ ] **Step 4: Migrate horizontal transitions without scene-specific edge code**

Keep their current direction and staged timing, but remove all assumptions about polygon revisions. Their only visual-boundary implementation must be the shared shader.

- [ ] **Step 5: Run transition contract tests**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app exec vitest run src/transitions/hero-pattern/index.test.ts src/transitions/pattern-star-map/index.test.ts src/transitions/star-map-aod/inkCurtain.test.ts src/transitions/method-bottom-figure2/index.test.ts src/transitions/figure2-proof-chain.test.ts src/transitions/group4-transitions.test.ts src/transitions/group5-transitions.test.ts src/transitions/group6-transitions.test.ts src/transitions/group7-transitions.test.ts
```

- [ ] **Step 6: Commit consumer migration**

```bash
git add app/src/transitions
git commit -m "fix: unify radial and horizontal ink consumers"
```

### Task 4: Restore Pattern as one authored composition

**Files:**

- Modify: `app/src/scenes/pattern/index.tsx`
- Modify: `app/src/scenes/pattern/patternBloomRenderer.ts`
- Modify: `app/src/scenes/pattern/patternBloomRenderer.test.ts`
- Modify: `app/src/scenes/pattern/progress.test.ts`
- Modify: `app/src/transitions/pattern-star-map/index.ts`
- Modify: `app/src/transitions/pattern-star-map/index.test.ts`
- Modify: `app/src/styles.css`

- [ ] **Step 1: Add failing composition-parity tests**

Assert one Pattern art renderer, all five source assets, the compact direction tuple, Main anchors/scales, and coupled collapse/rotation:

```ts
expect(patternLayerDirections()).toEqual({ '02': -1, '03': 1, '04': -1 });
expect(patternSourceFlowerScale()).toBeCloseTo(0.702, 3);
expect(renderPatternHoldState().fieldRotationDegrees).toBeCloseTo(120, 3);
expect(collapseFrame.rotationProgress).toBe(collapseFrame.collapseProgress);
```

- [ ] **Step 2: Remove the five independent DOM rotors**

Delete `PATTERN_ROTOR_IDS`, `.r4-pattern-scene__rotors`, rotor frames, and rotor animations. Keep the ground, one Pattern Canvas, wash, and canonical copy in the same live Pattern Scene.

- [ ] **Step 3: Restore all five layers in the Canvas renderer**

Reintroduce Main's authored roles, anchors, base angles, source scale, and terminal source flower. Apply the user-confirmed `010` direction to `02/03/04`; do not copy Main's current `04` direction blindly.

- [ ] **Step 4: Restore coupled rotation during collapse**

`renderPatternHold()` should use collapse `0`, rotation `0`, and copy `1`. Pattern → Star Map should pass the mapped collapse progress as rotation progress rather than fixing rotation at `1`.

- [ ] **Step 5: Fix blur in output space**

Restore Main's `DPR_LIMIT = 1.25`. Keep persistent ring canvases, but store unfiltered kaleidoscope art and apply each ring's filter at final draw size, or use output-size cache buckets. Do not bake `blur(8px)` into a 512px texture and then enlarge it.

- [ ] **Step 6: Preserve the staged Pattern pause**

Keep `PATTERN_COLLAPSE_STOP`, its first 1800ms stage, and the second 1800ms radial Ink stage. Tests must prove the first input ends on compact Pattern without active Ink and the next input starts Pattern → Star Map.

- [ ] **Step 7: Run focused Pattern tests**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app exec vitest run src/scenes/pattern/patternBloomRenderer.test.ts src/scenes/pattern/progress.test.ts src/transitions/hero-pattern/index.test.ts src/transitions/pattern-star-map/index.test.ts src/harness/r4/group1Manifest.test.ts
```

- [ ] **Step 8: Commit Pattern restoration**

```bash
git add app/src/scenes/pattern app/src/transitions/hero-pattern app/src/transitions/pattern-star-map app/src/harness/r4/group1Manifest.test.ts app/src/styles.css
git commit -m "fix: restore pattern bloom composition and timing"
```

### Task 5: Align Figure2 binary depth ownership with the Ink field

**Files:**

- Modify: `app/src/scenes/figure2-animation/index.tsx`
- Modify: `app/src/scenes/figure2-animation/progress.test.ts`
- Modify: `app/src/transitions/shared/depthThresholdMask.ts`
- Modify: `app/src/transitions/shared/depthThresholdMask.test.ts`
- Modify: `app/src/transitions/figure2-distance-expand/index.ts`
- Modify: `app/src/transitions/figure2-proof-chain.test.ts`
- Modify: `app/src/scenes/figure2-proof-scenes.test.ts`
- Modify: `app/src/styles.css`

- [ ] **Step 1: Add failing camera-space alignment tests**

Extend `Figure2AnimationRenderState` with a depth transform containing the actual cover size, camera scale, translation, and transform origin. At intro `1`, assert the depth mask and middle camera consume the same values.

- [ ] **Step 2: Separate depth-ranked architecture from figure silhouettes**

Create a `data-figure2-depth-ranked-field` wrapper for background, cloud, far arcade, and middle architecture. Keep the figure group outside that wrapper but inside the same canonical Figure2 Scene. The depth image must not be reused as a spatial mask for the figures. Conceal the figure group with a late binary ownership gate hidden under the depth Ink core; do not fade it with intermediate Scene opacity.

- [ ] **Step 3: Move the architectural mask from object-bounding-box to shared Stage coordinates**

Use `maskUnits="userSpaceOnUse"` and `maskContentUnits="userSpaceOnUse"`. Size the depth image from the same cover calculation used by the visible middle scene, then apply the terminal camera transform returned by `renderFigure2AnimationProgress()`.

- [ ] **Step 4: Replace 1536-value per-frame table writes**

Keep a final `type="discrete"` transfer so output is strictly binary, but drive the threshold with a preceding linear offset/intercept. Progress should update a constant number of attributes, not six 256-value strings per frame.

- [ ] **Step 5: Add the depth-mode effect-only Ink canvas**

Mount the shared Ink renderer in `depth` mode with `figure2-middle-depth.png` and the same camera transform. Render only dark Ink body, corrosion band, tendrils, embers, and particles; do not sample or reproduce the Proof Scene.

- [ ] **Step 6: Keep Scene alpha binary and complementary**

The live depth-ranked architecture uses conceal polarity. The Stage Proof ground and live Proof Opening root use reveal polarity. The separately gated figure group must also remain binary. Tests must keep:

```ts
expect(new Set(maskValues)).toEqual(new Set([0, 1]));
expect(reveal[index] + conceal[index]).toBe(1);
```

The foreground retained arch must not be in either target list.

- [ ] **Step 7: Consolidate Proof Opening typography**

Define one Proof opening title token matching Main's Figure2 transition scale:

```css
--r4-proof-opening-title-size: clamp(28px, 2.3vw, 42px);
```

Remove or narrow the competing `40–82` and `34–58` opening rules so one selector owns the result. Preserve the 12px kicker.

- [ ] **Step 8: Verify retained-arch lifetime**

Assert the same Stage-owned arch identity and presentation through Figure2, Opening, Cards, and Closing. Only Closing → Brand may apply the shared horizontal Ink conceal gate to it.

- [ ] **Step 9: Run focused Figure2/Proof tests**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app exec vitest run src/scenes/figure2-animation/progress.test.ts src/transitions/shared/depthThresholdMask.test.ts src/transitions/figure2-proof-chain.test.ts src/scenes/figure2-proof-scenes.test.ts src/stage/RetainedFigure2Arch.test.tsx src/stage/Stage.retained-proof.test.tsx
```

- [ ] **Step 10: Commit Figure2/Proof alignment**

```bash
git add app/src/scenes/figure2-animation app/src/transitions/shared/depthThresholdMask.ts app/src/transitions/shared/depthThresholdMask.test.ts app/src/transitions/figure2-distance-expand app/src/transitions/figure2-proof-chain.test.ts app/src/scenes/figure2-proof-scenes.test.ts app/src/stage app/src/styles.css
git commit -m "fix: align binary depth ink with figure2 camera"
```

### Task 6: Remove the unintended Figure3 staged pause

**Files:**

- Modify: `app/src/story/manifest.ts`
- Modify: `app/src/story/manifest.test.ts`
- Modify: `app/src/transitions/figure3-services/index.ts`
- Modify: `app/src/transitions/group4-transitions.test.ts`
- Modify: `app/e2e/r4-g4.spec.ts`

- [ ] **Step 1: Add a failing one-input contract**

Assert `figure3-services` uses `policy.kind === 'snap'`, has no pause labels, lasts 2000ms, and one Forward settles directly on the Services hold.

- [ ] **Step 2: Override the legacy seed in the canonical manifest**

Keep the migration inventory unchanged as historical evidence. In `policyAndDuration()`, return `snapPolicy('figure3-services')` and `FIGURE3_SERVICES_DURATION_MS`.

- [ ] **Step 3: Remove stage-stop math from the transition**

Use endpoint `1` as the receiver completion boundary. Keep the copy cue at `0.8`, but ensure Services stays continuously presented from cue through settle and `dispose()`.

- [ ] **Step 4: Update integration expectations**

Replace the expected `staged-paused` phase with direct Services hold in the canonical G4 flow. Do not add or use a new review route. Do not run Playwright in this pass.

- [ ] **Step 5: Run unit/integration tests**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app exec vitest run src/story/manifest.test.ts src/transitions/group4-transitions.test.ts src/runtime/director.actor.test.ts src/runtime/director.machine.test.ts
```

- [ ] **Step 6: Commit Figure3 policy correction**

```bash
git add app/src/story/manifest.ts app/src/story/manifest.test.ts app/src/transitions/figure3-services app/src/transitions/group4-transitions.test.ts app/e2e/r4-g4.spec.ts
git commit -m "fix: remove duplicate figure3 services stage"
```

### Task 7: Remove staged-tail media seeks and restore Crane occlusion

**Files:**

- Modify: `app/src/scenes/ph-animation/index.tsx`
- Modify: `app/src/scenes/ttg-animation/index.tsx`
- Modify: `app/src/transitions/group5-transitions.test.ts`
- Modify: `app/src/transitions/group6-transitions.test.ts`
- Modify: `app/src/scenes/group7-scenes.test.ts`
- Modify: `app/src/transitions/group7-transitions.test.ts`
- Modify: `app/src/styles.css`

- [ ] **Step 1: Count media-time writes in staged-tail tests**

Give fake videos a `currentTime` setter counter. Sample multiple progress points after TTG/PH animation has reached `1`; assert the terminal media time is not assigned again for each Ink frame.

- [ ] **Step 2: Make terminal seeks idempotent**

Apply the same epsilon guard used by normal `seekVideo()` inside `finishVideo()`. Combined with the shared `renderSource` memoization, terminal media writes should occur once per root/endpoint, not once per Ink frame.

- [ ] **Step 3: Restore the Crane main-video layer to `z-index: 2`**

Keep:

```text
back cloud 1
main alpha video 2
building/arch 3
front cloud 4
second front cloud 5
front flock video 8
```

Do not change the main video's `normal` blend, `filter: none`, or alpha WebM source.

- [ ] **Step 4: Run G5–G7 focused tests**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app exec vitest run src/scenes/group5-scenes.test.ts src/scenes/group6-scenes.test.ts src/scenes/group7-scenes.test.ts src/transitions/group5-transitions.test.ts src/transitions/group6-transitions.test.ts src/transitions/group7-transitions.test.ts
```

- [ ] **Step 5: Commit media and Crane fixes**

```bash
git add app/src/scenes/ph-animation app/src/scenes/ttg-animation app/src/scenes/group7-scenes.test.ts app/src/transitions/group5-transitions.test.ts app/src/transitions/group6-transitions.test.ts app/src/transitions/group7-transitions.test.ts app/src/styles.css
git commit -m "fix: remove media tail jank and restore crane occlusion"
```

### Task 8: Run the complete code gate and prepare canonical-route HITL

**Files:**

- No production changes unless a check exposes a regression.

- [ ] **Step 1: Run static forbidden-path scans**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
rg -n 'polygon\(|uBoundaryProfile|profileRevision|gl\.LUMINANCE' app/src/transitions/shared/ink* app/src/transitions/star-map-aod app/src/vendor/ink-scene-transition.js
rg -n 'createInkTargetTexture|foreignObject|cloneNode\(' app/src/transitions app/src/vendor
```

Expected result: no matches.

- [ ] **Step 2: Run the full automated suite**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app test
pnpm -C app typecheck
pnpm -C app lint
pnpm -C app build
git diff --check
git status --short
```

Expected result: all commands pass and the worktree is clean after the final commit.

- [ ] **Step 3: Do not run Playwright or claim visual completion**

Automated success means the code is ready for human visual acceptance, not that the visual result has passed.

- [ ] **Step 4: Hand off only the canonical route checklist**

| Route | Required visual checks after implementation |
|---|---|
| `/harness/r4-g1` | Hero radial starts at screen center; one procedural edge with particles; Pattern uses `010`, Main-like size/blur; collapse pause remains; Pattern-center radial enters Star Map |
| `/harness/r4-g2` | Method → Figure2 follows the eroded Ink edge with no bright horizontal seam or hitch in either direction |
| `/harness/r4-g3` | depth mask aligns with the terminal camera; Scene pixels are binary; Ink erosion/particles soften the threshold; foreground arch remains; Opening type scale is reduced; Closing → Brand uses shared Ink |
| `/harness/r4-g4` | Brand → Figure3 uses shared Ink; one Forward from Figure3 reaches Services with no staged pause or repeated Services |
| `/harness/r4-g5` | Services → TTG and TTG → Lab share the same corrosion quality; no terminal media hitch |
| `/harness/r4-g6` | Lab → PH and PH → Education keep the convincing dark-side erosion, remove the bright seam, and PH → Education no longer stutters |
| `/harness/r4-g7` | Education → Crane uses shared Ink; main alpha video is behind the building and two front clouds but in front of the back cloud |

- [ ] **Step 5: Record the final verification commit**

If Task 8 required any test-only corrections:

```bash
git add app
git commit -m "test: close r4 ink recovery verification"
```

Otherwise, do not create an empty commit.

---

## Acceptance criteria by reported issue

### Problem A / shared component

- Main-style procedural terms move the body edge again.
- Horizontal, radial, and depth modes use one particle/erosion implementation.
- No 96-point profile, polygon serializer, or per-frame boundary texture upload remains.
- No bright live-target cut is visible outside the dark Ink core.
- No full-screen dim, vignette, or endpoint brightness mutation is introduced.

### G1

- Hero → Pattern origin is screen center.
- Both radial transitions use the Ink shader, not authored SVG/polygon paths.
- Pattern compact flower direction is `010` for `02/03/04`.
- Pattern art is rendered by one composition with Main anchors, scales, and collapse rotation.
- Expanded blur is output-space/Main-like rather than magnified from a 512px cache.
- Pattern collapse and Pattern → Star Map remain two input stages.

### G2 / G4 / G5 / G6 / G7 horizontal Ink

- One shared procedural boundary supplies corrosion and particles.
- The live ownership gate is fully hidden by the localized dark core.
- Forward and reverse use the same field at the same progress.
- Staged source media is not repeatedly sought after reaching its terminal frame.

### G3

- Depth-ranked background/middle/far architecture and the terminal Figure2 camera share the same cover/scale/translation coordinate system.
- Figure silhouettes are not spatially cut by the architectural depth image; their separate late gate remains binary and hidden by Ink.
- Live Scene mask values are only `0` and `1`.
- The effect-only Ink field may be translucent, but it never substitutes for Proof or Figure2 Scene content.
- Foreground retained arch is not depth-masked and persists through Closing.
- Proof Opening uses one Main-derived type token.

### Figure3 → Services

- No `staged-paused` state exists for this segment.
- A single Forward plays Figure3 and settles Services.
- Services presentation is continuous across copy cue, endpoint, and dispose.

### Crane

- Main video remains `normal` blend with its native alpha.
- It is above only the back cloud and below the building plus both front clouds.
- Front flock video remains at the front.

---

## Risks and guardrails

- **Dark-core tuning is visual:** the architecture is code-deterministic, but exact alpha/band width requires human review. Tune the shared preset only after checking all seven canonical routes.
- **Live DOM cannot be sampled directly by WebGL:** do not “improve” edge exactness by reintroducing target capture or fake Scene textures.
- **Depth map is a simplified rank source:** align it exactly to the middle-camera transform; cloud/far layers may only approximate that depth ordering because they have separate parallax transforms. This is the accepted weakened version, but the middle architecture must not be visibly offset.
- **Pattern fidelity versus memory:** restore output-space blur and Main DPR without recreating large canvases every progress frame. Persistent/bucketed caches are required.
- **Reduced motion:** it must still jump directly to the unique endpoint with no Ink canvas, mask residue, or media replay.
- **Route discipline:** no implementation or review instruction may create a new G1–G7 review route variant.
