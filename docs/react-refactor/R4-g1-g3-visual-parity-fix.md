# R4 g1-g3 Visual Parity Fix

## Status

Draft for HITL confirmation before implementation.

Current g1-g3 work has validated the runtime contract path, harness shape, timeline checks, copy alignment, and regression plumbing. It does not yet satisfy visual parity with `main`. This document defines the g1-g3 visual parity返工 scope while preserving the existing R4 ownership and runtime architecture.

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

Preferred shape:

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

Candidate users:

- `method-top-method-bottom`
- `figure2-proof-opening-cards`
- `figure2-proof-cards-closing`

`figure2-proof-brand` remains a canonical segment and may keep a visual handoff to `brand`, but it must match the confirmed visual semantics rather than a generic fade.

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

Current implementation is a crossfade. It must become center ink expansion.

Required visual facts:

- Ink expands from center.
- It reveals the pattern canvas, not a flat fade.
- Pattern progress follows the legacy reveal window rather than jumping directly to the final compact state.
- Reduced motion jumps to the presented `pattern` state without running ink motion.

Implementation direction:

- Port the ink reveal behavior from `pattern-bloom-adapter` / `createInkSceneTransition`.
- Use a local transition canvas or reusable ink helper, but keep the `TransitionModule` interface.

### `pattern-star-map`

Current implementation is a crossfade. It must become the left-side pattern center ink expansion into star-map.

Required visual facts:

- Ink originates from the pattern/petal center on the left side.
- Pattern exits according to the main `SECOND_REVEAL_START -> SECOND_REVEAL_END` rhythm.
- Star-map / belief copy enters as in `main`, with the pattern ghost fading only after the ink handoff is visually complete.

Implementation direction:

- Port the exit ink behavior from `pattern-bloom-adapter`.
- Use the pattern canvas as the source/ghost and `star-map` as the receiver.

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

Current implementation fades from Figure2 into a plain proof screen. It must become Figure2 stage 2.

Required visual facts:

- Starts from the completed Figure2 background state.
- Ink expands into the proof paper state.
- The foreground arch remains visible as a blurred horizontal arch.
- The proof opening text appears over that retained Figure2/proof background.
- This is the only cinematic proof text entrance.
- It still keeps staged-snap policy and canonical segment identity.

Implementation direction:

- Extend the Figure2 controller/renderer so stage 2 can render:
  - completed intro state,
  - transition ink progress,
  - proof overlay reveal,
  - retained blurred near arch.
- Port the proof overlay reveal behavior from `figure2-homepage-adapter`.
- Avoid turning `figure2-distance-expand` into a scene; it remains a segment.

### `figure2-proof-opening-cards`

Current implementation is a fade. It should be reading/no-op visual behavior.

Required visual facts:

- Keep canonical segment.
- No cinematic transition.
- Cards appear as the next reading screen / scroll stop.
- The retained proof visual treatment should stay coherent with the stage 2 output.

Implementation direction:

- Use the reading transition helper.
- Remove fade-specific assertions and CSS variable animation expectations.

### `figure2-proof-cards-closing`

Current implementation is a fade. It should be reading/no-op visual behavior.

Required visual facts:

- Keep canonical segment.
- No cinematic transition.
- Closing copy appears as the next reading screen / scroll stop.

Implementation direction:

- Use the reading transition helper.
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
  - `hero-pattern` has an active ink canvas during transition.
  - `pattern-star-map` ink origin is left/pattern-centered.
  - pattern sampled frames show full-field -> compact collapse.

- g2:
  - `method-top-method-bottom` does not crossfade.
  - `method-bottom-figure2` has active ink surface.
  - figure videos do not loop and are terminal-paused after forward playback.
  - sampled Figure2 frames show foreground blur and layer parallax.

- g3:
  - `figure2-distance-expand` keeps Figure2/proof arch visual present while text appears.
  - `figure2-proof-opening-cards` and `figure2-proof-cards-closing` do not crossfade.
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

1. Add `createReadingSegmentTransition()` on R4 integration, with tests.
2. Fix g1 pattern canvas and ink transitions.
3. Fix g2 method reading, method-to-Figure2 ink, and Figure2 controller parity.
4. Fix g3 Figure2 stage 2 proof opening and reading/no-op proof text segments.
5. Rerun g1-g3 harnesses and regressions.
6. HITL review g1-g3 again.
7. Only after HITL approval, continue g4-g7.

## Open HITL Questions

- For `figure2-proof-brand`, should the handoff remain a cinematic ink handoff into `brand`, or should it be reduced to a reading/no-op handoff after the proof sequence?
- For proof cards/closing, should each canonical hold be exactly one viewport, or should it preserve the old overlay scroll spacing from `data-transition-post-scroll-vh="56"`?
- For pattern collapse, should React R4 match the exact main timing constants (`0..0.46`, `0.42..0.70`, `0.58..0.985`) or only the visual endpoints and perceived rhythm?
