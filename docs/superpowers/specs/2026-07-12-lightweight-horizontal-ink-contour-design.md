# Lightweight Horizontal Ink Contour Design

## Status

Approved in conversation on 2026-07-12. This design supersedes the Unit B proposal that required a shared two-dimensional rank image, complementary source/receiver SVG masks, or a scene-texture WebGL compositor.

Unit A remains unchanged: `ttg-lab` and `ph-education` use staged media dissolve and stay outside Generic Ink.

## Problem

The retained horizontal Generic Ink transitions currently use two different ownership fronts:

- the incoming scene uses a one-dimensional `inset(...)` gate derived from `inkOwnershipGateProgress()`;
- the WebGL Ink uses a procedural front derived from progress, FBM, breakup, and tendrils.

At normal speed the existing high-alpha seam occlusion hides most of the difference. During slow inspection, the Ink front can move ahead of the incoming scene and expose a trailing straight boundary. The problem must be repaired in both playback directions, but forward and reverse do not need to reuse the same random shape and pixel-perfect matching is not required.

## Goals

- Preserve exactly two live canonical scene roots, `from` and `to`, for the full transition.
- Keep Pattern, Star Map, video, and other scene-owned motion live while visible.
- Give every fresh transition invocation a visibly different erosion contour, including fresh reverse invocations.
- Keep the Ink front and the scene ownership boundary visually aligned within one active transition.
- Repair forward and reverse independently, including endpoint entry, active playback, interruption, re-entry, and disposal.
- Retain the organic erosion character without a full-resolution mask, SVG filter pipeline, DOM snapshot, or scene-texture compositor.
- Bound CPU, GPU, memory, and style-update cost independently of DPR.

## Non-goals

- Pixel-identical source, receiver, and Ink alpha.
- Replaying the same contour in a later reverse traversal.
- Randomizing the ownership contour every animation frame.
- Migrating the two radial transitions in this unit.
- Migrating `figure2-distance-expand`, which retains its independent depth contract.
- Replacing live DOM scenes with raster captures.

## Scope

The lightweight contour contract applies to the seven retained horizontal Generic Ink transitions:

1. `star-map-aod`
2. `method-bottom-figure2`
3. `figure2-proof-brand`
4. `brand-figure3`
5. `services-ttg`
6. `lab-ph`
7. `education-crane`

The shared path covers all seven so the same horizontal Ink primitive does not retain two different ownership-speed contracts. The two radial transitions, `hero-pattern` and `pattern-star-map`, keep their current live-scene behavior in this unit.

## Architecture

### Scene ownership

The transition remains a two-scene composition:

```text
live from scene (underlay)
live to scene (contour-clipped overlay)
run-owned WebGL Ink canvas (effect-only overlay)
```

The source scene stays fully live beneath the target. Normal transitions therefore need only synchronize the target reveal contour with the Ink macro front. They do not apply a complementary mask to the full source scene.

`ownershipSurfaces` remains available for independent retained planes. A retained reveal surface consumes the same reveal contour as `to`; a retained conceal surface consumes the complementary polygon. This exception does not change canonical scene identity.

### Per-invocation variation

Every newly built transition invocation derives an appearance seed from the stable authored segment seed and the unique `runId`. Consequently:

- a fresh forward invocation gets a new contour;
- a fresh reverse invocation gets a new contour;
- repeated visits get new contours;
- all frames belonging to the current timeline use one contour, preventing frame-to-frame flicker;
- an in-place direction change on the same timeline keeps its current contour until that timeline ends.

The seed is not persisted across completed invocations and is not included in SEO or no-JS output.

### Lightweight contour profile

A horizontal contour profile contains:

- a numeric per-invocation seed;
- 32 normalized signed samples across Stage X;
- a small immutable byte representation for WebGL upload;
- a revision derived from the authored seed, run seed, direction, and sample bytes.

The samples are generated once with deterministic seeded value noise and smoothed across adjacent columns. They describe only the macro ownership front. The fixed sample count does not scale with viewport size or DPR.

The profile is owned by the timeline and released with it. No global Blob URL, image cache, snapshot cache, or cross-run profile cache is introduced.

### One boundary threshold

`InkFieldFrame` exposes two different progress concepts:

- `progress`: authored animation progress used for energy, grade, fade, and particles;
- `threshold`: the canonical ownership position used by the DOM contour and WebGL macro front.

Both forward and reverse call the same pure threshold function. Forward increases it and reverse decreases it. Direction changes do not use a separate reverse formula.

The old condition in which DOM used the remapped ownership gate while the shader body used raw progress is removed for horizontal frames.

### DOM contour

The target reveal boundary is a `clip-path: polygon(...)` generated from the 32 contour samples and the current threshold:

- bottom-to-top polygons enclose the region below the sampled front;
- top-to-bottom polygons enclose the region above the sampled front;
- complementary retained surfaces enclose the inverse region;
- the contour amplitude eases to zero near both endpoints so endpoint cleanup cannot flash;
- endpoint settle removes temporary clip and diagnostics.

One polygon style value is updated per managed surface per progress frame. No `mask-image`, SVG element, PNG encoding, Blob URL, canvas readback, DOM rasterization, or per-frame allocation of rank images is used.

### WebGL contour

The 32 samples are uploaded once as a tiny one-row texture owned by the existing run-owned Ink renderer. The horizontal shader samples the same macro contour and uses `threshold` as its ownership front.

Existing FBM, wetness, pores, tendrils, particles, and embers remain, but their displacement from the shared macro contour is bounded to the visible Ink band. They can make each edge look richer without letting the main Ink body outrun the target contour by a visibly separate band.

Radial and depth shader paths do not allocate or sample the horizontal contour texture.

### Grade and occlusion

`edge-only` and `dark` may change color, body alpha, and particles, but not the run contour, revision, or threshold.

The old `0.92` ownership seam belt is removed from horizontal ownership. Any local opacity around the front comes from the authored Ink body/edge itself rather than a second straight-line occlusion gate.

## Lifecycle and fallback

- The profile and WebGL texture are run-owned and generation-guarded.
- Rebuild, re-entry, and a fresh reverse invocation receive a fresh contour.
- Resize reuses normalized samples and updates only viewport-dependent geometry; it does not reseed.
- Renderer destruction releases the one-row texture exactly once.
- WebGL context loss follows the existing fresh run-owned renderer recovery path.
- Renderer unavailability keeps the existing generation-scoped diagnostics/recovery behavior; the contour adds no SVG, snapshot, or scene-texture fallback and does not change that pre-existing failure policy.
- Reduced motion jumps between canonical endpoints and leaves no polygon, texture, or diagnostic residue.

## Diagnostics

During an active horizontal Ink transition, the target, managed retained surfaces, and effect canvas report:

- contour revision;
- ownership threshold;
- run appearance seed;
- contour direction;
- contour sample count.

Diagnostics are removed at endpoints and disposal. They are lifecycle evidence, not styling inputs.

## Verification

Implementation uses targeted tests during development:

1. Contour unit tests: sample count, bounds, smoothing, per-run variation, same-timeline stability, endpoint collapse, forward/reverse threshold behavior, and complementary polygons.
2. Shared Ink tests: only horizontal frames carry contours; target and Ink diagnostics match; no SVG/mask/snapshot path; radial and depth remain unchanged.
3. Shader lifecycle tests: one texture upload per revision, no per-frame upload, release on destroy/context replacement, and no horizontal texture for radial/depth.
4. Consumer contract tests for all seven transitions, including both directions, retained surfaces, interruption, re-entry, reduced motion, and disposal.
5. One affected functional browser contract pass without screenshots or visual assertions.
6. After all implementation and closure work, one complete release matrix covering functionality, lifecycle, SEO/no-JS, rollback evidence, build, lint, typecheck, unit tests, and required browser suites.

Final visual acceptance remains HITL and is performed by the user.

## Rollback

Unit A and Unit B remain separate commits. Unit B can be reverted without restoring Ink to `ttg-lab` or `ph-education`. The rollback restores the previous horizontal `inset` ownership path and shader uniforms together; partial rollback of only DOM or only WebGL ownership is not supported.
