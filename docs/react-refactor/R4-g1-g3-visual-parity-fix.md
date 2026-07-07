# R4 g1-g3 Visual Parity Fix

## Status

Iteration plan for the post-`39f8a76f`返工.

`39f8a76f` proved the R4 runtime can host the g1-g3 spine, but it still approximates two main visuals with generic scene transitions:

- g1 uses `createInkSegmentTransition()` plus a circular clip instead of the legacy `pattern-bloom-adapter` / `createInkSceneTransition` composition.
- g3 keeps proof copy as independent scene handoffs instead of the legacy Figure2 field + `createProofScrollOverlay()` composition.

This iteration must replace those approximations with dedicated adapters while preserving the existing R4 runtime contract. The goal is visual parity, not a smaller substitute.

## Non-Negotiables

- Keep canonical spine unchanged.
- Keep group ownership unchanged.
- Do not change `DirectorEvent`, `LayerWindow`, visibility predicates, manifest policy semantics, or runtime state-machine contracts.
- Shared helpers may only land on `codex/react-refactor-r4-integration`.
- Do not fork private group versions of shared contracts or `transitions/shared/`.
- Do not continue groups 4-7 until g1-g3 visual parity has HITL approval.
- Existing tests that protect the wrong visual behavior must be rewritten instead of worked around.

## Ownership

| Group | Owns scenes | Owns segments | Visual parity source |
| --- | --- | --- | --- |
| g1 | `hero`, `pattern`, `star-map` | `hero-pattern`, `pattern-star-map` | `js/transitions/pattern-bloom-adapter.js`, `js/pattern-mirror-stage.js`, `css/sections/canvas-stage.css`, old home/belief handoff |
| g2 | `method-top`, `method-bottom`, `figure2-animation` | `method-top-method-bottom`, `method-bottom-figure2` | `src/sections/method.html`, `js/transitions/homepage/figure2-homepage-adapter.js`, `js/components/figure2-transition.js`, `css/figure2.css` |
| g3 | `figure2-proof-opening`, `figure2-proof-cards`, `figure2-proof-closing`, `brand` | `figure2-distance-expand`, `figure2-proof-opening-cards`, `figure2-proof-cards-closing`, `figure2-proof-brand` | `src/sections/method.html`, `js/transitions/homepage/figure2-homepage-adapter.js`, `js/components/figure2-transition.js`, `css/figure2.css` |

## Shared Helper Boundary

Add a transition helper only if it can reuse the current `TransitionModule` contract without runtime changes.

`createReadingSegmentTransition()` may remain for plain reading handoffs, but it must not be used as the primary implementation for:

- `hero-pattern`
- `pattern-star-map`
- `figure2-distance-expand`

Those segments need dedicated adapter semantics because their main behavior is not a generic ink reveal.

Allowed plain reading shape:

```ts
createReadingSegmentTransition({
  id,
  renderFrom?,
  renderTo?,
  onProgress?
})
```

Expected semantics:

- `from` layer remains stable until the natural reading handoff.
- `to` layer enters as the next reading screen without cinematic fade.
- `sample()` still returns legal nonblank visibility for `verifySegmentTimeline()`.
- Reduced motion remains a first-class branch.
- No manifest policy or machine event changes.

Candidate users after this iteration:

- `method-top-method-bottom`
- `figure2-proof-opening-cards`, only as a canonical cursor wrapper around the proof overlay scroll state.
- `figure2-proof-cards-closing`, only as a canonical cursor wrapper around the proof overlay scroll state.

`figure2-proof-brand` remains a canonical segment and may keep a visual handoff to `brand`, but it must match the confirmed visual semantics rather than a generic fade.

## Dedicated Adapter Boundary

### g1 `pattern-bloom` adapter

Add a dedicated R4 pattern transition adapter rather than extending generic ink:

- Owns both `hero-pattern` and `pattern-star-map`.
- Reuses the existing React `PatternBloomRenderer` canvas as the lotus/petal field source.
- Ports the main timing constants exactly:
  - `REVEAL_END = 0.46`
  - `BLOOM_START = 0.42`
  - `BLOOM_END = 0.70`
  - `SECOND_REVEAL_START = 0.58`
  - `SECOND_REVEAL_END = 0.985`
- Uses a WebGL ink scene renderer derived from `js/effects/ink-scene-transition.js` for the visible ink surface, not the existing 2D radial canvas.
- Keeps scene IDs, segment IDs, manifest policy, `DirectorEvent`, `LayerWindow`, and visibility predicates unchanged.
- Does not move pattern ownership into `star-map`.

Segment mapping:

- `hero-pattern`: segment progress uses the main pattern-bloom constants directly. Center ink reveal comes from `0 -> 0.46`; bloom collapse comes from `0.42 -> 0.70`; `0.70 -> 1` holds the compact pattern. Pattern canvas remains visible at `bloomProgress=0`; ink controls reveal.
- `pattern-star-map`: global pattern bloom progress `0.58 -> 0.985`. Pattern source is held compact/ghosted, star-map receiver is revealed by the left/petal-center ink. Pattern exit opacity follows the main `topSceneExit` rhythm.

### g3 `figure2-proof-overlay` adapter

Add a dedicated proof overlay adapter rather than treating opening/cards/closing as unrelated screens:

- `figure2-distance-expand` starts from the completed Figure2 field.
- Stage 2 keeps the near foreground arch as the retained blurred horizontal arch.
- Ink reveal drives proof overlay reveal, using the same reveal-stop/reveal-edge semantics as `createProofScrollOverlay()`.
- Opening copy appears once during stage 2; later proof copy is normal vertical reading inside the same proof visual treatment.
- Canonical proof scenes remain as spine nodes and static fallback owners, but their visual state must share the same proof overlay shell.
- `figure2-proof-opening-cards` and `figure2-proof-cards-closing` update proof overlay scroll/page state; they must not introduce fade/cinematic scene transitions.

## g1 Required Fixes

### Pattern Renderer

Current React implementation uses a small fixed stack of PNG layers. It must be replaced with a canvas renderer migrated from `js/pattern-mirror-stage.js`.

Required visual facts:

- Initial pattern state is a full-screen petal field, not a small flower.
- Scroll/progress collapses the full-screen field into the star-map composition: constellation + petal + leaf feeling.
- Center, size, rotation, collapse timing, ring count, blur/filter, and final compact scale follow `main`.
- Desktop center follows the main transition center near the left side; mobile uses the mobile center.
- The renderer remains progress-idempotent: `0 -> 1 -> 0 -> 1` recreates the same visual state.

Implementation direction:

- Extract or port the deterministic parts of `createPatternBloomScene()`: layer configs, bloom rings, source flower texture, ring cache, center metrics, draw order.
- Replace the DOM layer stack in `scenes/pattern/` with a canvas-backed `PatternScene`.
- Keep asset ownership inside g1; do not make `star-map` responsible for pattern rendering.

### `hero-pattern`

Current implementation is a generic clipped ink approximation. It must become the first half of the dedicated pattern bloom adapter.

Required visual facts:

- Ink expands from center.
- It reveals the pattern canvas, not a flat fade.
- Pattern progress follows the legacy reveal window rather than jumping directly to the final compact state.
- Reduced motion jumps to the presented `pattern` state without running ink motion.

Implementation direction:

- Replace `createInkSegmentTransition()` for this segment with the dedicated pattern bloom timeline.
- Render the pattern canvas at `visible=true` even when `bloomProgress=0`.
- Drive reveal ink with `smoothStep(range01(progress, 0, 0.46))`.
- Drive bloom collapse with `range01(progress, 0.42, 0.70)`.
- Expose testable attributes for `data-pattern-bloom-progress`, `data-pattern-reveal-progress`, and `data-pattern-ink-renderer`.

### `pattern-star-map`

Current implementation is a generic clipped ink approximation. It must become the second half of the dedicated pattern bloom adapter.

Required visual facts:

- Ink originates from the pattern/petal center on the left side.
- Pattern exits according to the main `SECOND_REVEAL_START -> SECOND_REVEAL_END` rhythm.
- Star-map / belief copy enters as in `main`, with the pattern ghost fading only after the ink handoff is visually complete.

Implementation direction:

- Replace `createInkSegmentTransition()` for this segment with the dedicated pattern bloom timeline.
- Drive second reveal with `smoothStep(range01(globalProgress, 0.58, 0.985))`.
- Use the left/petal-center origin from main: desktop `0.24, 0.55`; mobile `0.50, 0.58`.
- Keep the pattern source as a ghost until the main `topSceneExit` window completes.
- Expose testable attributes for `data-pattern-second-reveal-progress`, `data-pattern-top-scene-opacity`, and `data-pattern-ink-renderer`.

## g2 Required Fixes

### `method-top-method-bottom`

Current implementation is a fade transition. It should be reading behavior only.

Required visual facts:

- Method top and bottom are two reading screens in the same method flow.
- No cinematic transition between them.
- The user should experience continuous downward reading, matching `src/sections/method.html`.
- Keep `method-top-method-bottom` as a canonical segment.

Implementation direction:

- Use `createReadingSegmentTransition()` or equivalent helper.
- Preserve the canonical segment and harness route.
- Update tests so fade is rejected.

### `method-bottom-figure2`

Current implementation is a fade transition. It must be the bottom-to-top ink handoff into Figure2.

Required visual facts:

- Method-bottom exits through the same broad ink language as the legacy `method-tooling__method-proof` entry into Figure2.
- Figure2 scene appears through ink, not opacity fade.
- Reduced motion jumps to the presented Figure2 opening state.

Implementation direction:

- Add an ink canvas to the Figure2 transition surface.
- Reuse the existing ink helper pattern where possible.
- Do not invent a new runtime milestone unless required by existing `TransitionModule` contract.

### `figure2-animation`

Current implementation is simplified and auto-loops videos. It must match `main`.

Required visual facts:

- Videos use `loop=false`.
- Videos do not autoplay just because the scene is visible.
- Downward progress starts video playback / seek progression.
- At the end of stage 1, videos stop on their terminal frame.
- Reverse/replay resets or seeks deterministically.
- People sizing and placement match `css/figure2.css`.
- Background mountain/cloud/far arcade/middle fresco/near arch all render.
- Stage 1 scroll pulls the camera closer:
  - foreground arch blurs and scales,
  - middle and far layers scale at different rates,
  - cloud and arcade have their own y/scale parallax,
  - figures lift and scale subtly.

Implementation direction:

- Port the controller concept from `js/components/figure2-transition.js`, especially:
  - `ARCH_LAYER_CAMERA`,
  - video prepare/seek/play/finish/reset behavior,
  - `renderStaticState({ introProgress, transitionProgress })`,
  - layer transforms and `--figure2-near-arch-blur`.
- Use React component refs for layers and videos, but keep imperative progress rendering in a renderer/controller module.
- Align CSS with `css/figure2.css` instead of the current enlarged figure layout.

## g3 Required Fixes

### `figure2-distance-expand`

Current implementation is still a generic ink handoff into a standalone proof scene. It must become Figure2 stage 2 plus proof overlay reveal.

Required visual facts:

- Starts from the completed Figure2 background state.
- Ink expands into the proof paper state.
- The foreground arch remains visible as a blurred horizontal arch.
- The proof opening text appears over that retained Figure2/proof background.
- This is the only cinematic proof text entrance.
- It still keeps staged-snap policy and canonical segment identity.

Implementation direction:

- Replace `createInkSegmentTransition()` for this segment with the dedicated Figure2 proof overlay timeline.
- Extend the Figure2 controller/renderer so stage 2 can render:
  - completed intro state,
  - transition ink progress,
  - proof overlay reveal,
  - retained blurred near arch.
- Port the proof overlay reveal behavior from `figure2-homepage-adapter`.
- Avoid turning `figure2-distance-expand` into a scene; it remains a segment.
- Expose testable attributes for `data-figure2-proof-overlay-progress`, `data-figure2-proof-reveal-stop`, and `data-figure2-retained-arch`.

### `figure2-proof-opening-cards`

Current implementation is a reading transition between independent proof scenes. It should instead update the shared proof overlay page/scroll state.

Required visual facts:

- Keep canonical segment.
- No cinematic transition.
- Cards appear as the next reading screen / scroll stop.
- The retained proof visual treatment should stay coherent with the stage 2 output.

Implementation direction:

- Keep the canonical segment.
- Use a proof overlay page timeline that visually moves from opening copy to cards inside one retained proof treatment.
- The proof arch and paper field remain present across both holds.
- Remove fade-specific assertions and CSS variable animation expectations.

### `figure2-proof-cards-closing`

Current implementation is a reading transition between independent proof scenes. It should instead update the shared proof overlay page/scroll state.

Required visual facts:

- Keep canonical segment.
- No cinematic transition.
- Closing copy appears as the next reading screen / scroll stop.

Implementation direction:

- Keep the canonical segment.
- Use a proof overlay page timeline that visually moves from cards to closing inside one retained proof treatment.
- The proof arch and paper field remain present across both holds.
- Preserve copy baseline and segment harness.

### `figure2-proof-brand`

Keep canonical segment. Its visual treatment should not be a generic fade.

Required visual facts:

- It is the handoff out of the proof sequence into `brand`.
- Match the confirmed legacy intent: proof visual and copy hand off together, then `brand` becomes the receiver.
- If HITL confirms no additional cinematic motion after proof text screens, implement as a minimal reading-to-brand handoff; otherwise port the old `method-proof-brand` receiver behavior.

## Test Changes

Existing tests are allowed to fail during返工 if they protect incorrect visual behavior. Replace them with tests that protect visual facts.

### Unit / Contract

- Pattern renderer:
  - `0 -> 1 -> 0 -> 1` idempotence.
  - progress `0` has large/full-field parameters.
  - progress `1` has compact/final parameters.
  - desktop/mobile center values match main-derived constants.

- Figure2 renderer/controller:
  - videos have `loop=false`.
  - progress `0` resets/pauses videos at segment start.
  - stage 1 progress `1` finishes videos and pauses on terminal frame.
  - cloud/farArcade/middle/nearArch transforms differ by expected scale/y values.
  - near arch blur increases with stage 1 progress.

- Reading helper:
  - `verifySegmentTimeline()` passes.
  - no crossfade-only behavior is required.
  - reduced motion branch exists.

### Playwright / Harness

- g1:
  - `hero-pattern` uses the dedicated pattern bloom adapter, not `createInkSegmentTransition()`.
  - `hero-pattern` has a WebGL ink canvas during transition and reports `data-pattern-ink-renderer="scene"`.
  - At progress `0.20`, bloom progress is `0`, pattern canvas opacity is `1`, and ink reveal is active.
  - At progress `0.70`, bloom progress is `1`.
  - `pattern-star-map` ink origin is left/pattern-centered.
  - `pattern-star-map` second reveal progresses forward, not reversed.
  - pattern sampled frames show full-field -> compact collapse.

- g2:
  - `method-top-method-bottom` does not crossfade.
  - `method-bottom-figure2` has active ink surface.
  - figure videos do not loop and are terminal-paused after forward playback.
  - sampled Figure2 frames show foreground blur and layer parallax.

- g3:
  - `figure2-distance-expand` uses the dedicated proof overlay adapter, not `createInkSegmentTransition()`.
  - `figure2-distance-expand` keeps Figure2/proof arch visual present while text appears.
  - `figure2-proof-opening-cards` and `figure2-proof-cards-closing` update proof overlay page/scroll state and do not crossfade.
  - retained arch exists and remains visible on opening, cards, and closing holds.
  - `figure2-proof-brand` matches the confirmed handoff behavior.

### Regression

After each fixed group lands on integration:

- `pnpm -C app test`
- `pnpm run verify:copy`
- R2 Playwright suite
- R3 pilot regression suite
- Current group e2e suite
- HITL visual parity against `main`

## Implementation Order

1. Add the shared WebGL ink scene renderer port used by dedicated adapters.
2. Replace g1 `hero-pattern` and `pattern-star-map` with the dedicated pattern bloom timeline.
3. Replace g3 `figure2-distance-expand` with the dedicated proof overlay timeline.
4. Convert proof opening/cards/closing visual shells to one shared proof overlay treatment while preserving scene IDs and static fallbacks.
5. Update tests that currently protect generic ink/independent scene behavior.
6. Rerun g1-g3 harnesses and regressions.
7. HITL review g1-g3 again.
8. Only after HITL approval, continue g4-g7.

## Closed Decisions For This Iteration

- Pattern timing must match exact main constants.
- Proof cards/closing must read as normal continuous proof content, not cinematic transitions.
- `figure2-proof-brand` remains in scope only for regression safety; do not spend this iteration redesigning its final handoff unless the dedicated overlay changes break it.
