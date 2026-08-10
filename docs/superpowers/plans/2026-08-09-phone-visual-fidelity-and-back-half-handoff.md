# Phone Visual Fidelity and Back-Half Handoff Repair Plan

> **For Codex:** Implement this plan in order. Keep the focused characterization tests red until each owning boundary is repaired. Do not add or upscale media assets in this pass.

**Goal:** Restore Star Map and Figure3 visual fidelity, remove the native-reading rebound before TTG/PH/Crane, and make PH/Crane motion start only in their authored playback segment.

**Architecture:** Preserve the current A/B presentation planes and fail-closed runtime. Repair three boundaries instead of patching individual scenes: (1) normal presentation must use canonical-resolution media, (2) every native-reading scene must mirror its live scroll position before the fixed source plane is exposed, and (3) decoder activation must be independent from playback-clock ownership.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Playwright WebKit, HTML video, Canvas 2D/WebGL packed-alpha compositor.

---

## 1. Confirmed root causes

### 1.1 Star Map Perlin is generated from a low-resolution mask

- `PhoneStarMap.tsx` currently feeds `assets/star-map-highlight-mask.webp` into `StarFieldReveal`.
- That mask is `420×236`; the canonical map `assets/back2.webp` is `1672×941`.
- `StarFieldReveal.prepareSource()` builds the dynamic highlight at the input image's dimensions, so the animated layer is physically only `420×236` before it is rotated, cover-scaled, and stretched across the phone viewport.
- The phone preset then applies `120 / 44 / 10 / 3px` blur passes. Device pixel ratio is capped at 2. Raising DPR alone cannot recover detail that was already lost in the `420×236` source.
- Git history identifies the regression boundary: commit `7a1d849` changed the reveal input from the full `back2.webp` source to the baked mask. The later alpha fix in `740aa64` fixed a full-field white wash, but retained the low-resolution input.

**Decision:** Restore full-resolution highlight extraction from the existing canonical `back2.webp`. Keep the current separate static image, `drawSource: false`, lifecycle ownership, and alpha/reporting fixes. Do not add another mask and do not tune blur/DPR until the full-resolution path has been compared with the pre-regression appearance.

### 1.2 Figure3's normal initial frame is deliberately the 640×360 poster

- `PhoneFigure3.tsx` proves `figure3-initial-poster` for Brand → Figure3 and stable Figure3.
- `assets/figure3-initial-paper.webp` is `640×360`, while the existing Figure3 motion is `1280×720`.
- The previous P0 plan deliberately made the poster the normal stable surface to prevent a video decode miss from rolling Brand back. That reliability decision is why the current initial frame is visibly softer. It solved the rollback by lowering normal-path visual quality.
- The repository already has everything needed to show the video's decoded frame zero through `prepareTimelineVideoFrame()` and `paper-compositor.ts`; a new 1920 poster is neither necessary nor authorized.

**Decision:** The decoded frame-zero Canvas becomes the normal Figure3 initial presentation. The existing poster remains only a bounded emergency fallback/direct-entry cover. The normal Brand → Figure3 path must not expose the poster when the video frame is available.

### 1.3 Figure3's unmoving bottom band is a layout-height defect

- `.phone-figure3__mount` and `.phone-figure3` use `min-block-size: max(80svh, 38rem)` rather than filling the presentation plane.
- On a `390×844` viewport, `80svh` is about `675px`, leaving about `169px` below the Figure3 mount.
- The Canvas and poster are `height: 100%` of that short mount, so the remaining viewport is only the paper/coverage color. It cannot move with the video.
- The existing preflight contact sheet visibly contains this band, while `paper-compositor.test.ts` incorrectly assumes a `390×844` Canvas and therefore never exercises the real CSS geometry.

**Decision:** Figure3 mount, scene, stage, poster, and Canvas must fill the complete phone presentation plane. Keep the current left-edge cover crop; change height ownership, not camera framing.

### 1.4 Services/Lab/Education rebound because the native document is replaced by a top-aligned duplicate

- Stable Services, Lab, and Education are rendered in `.phone-story__reading-flow` and use the document scroll position.
- As soon as a segment transaction begins, `nativeReadingEnabled` becomes false. The reading-flow is hidden immediately, before target modules/media and the ink surface are prepared.
- The source buffer then reveals a separate fixed visual copy. Its `render(1)` only adjusts opacity/camera variables; it does not inherit the native document's `scrollTop`, so it appears at the first screen.
- The preparation interval is therefore visible as a pause/rebound on the wrong source frame before the ink animation begins.
- Method already has the correct local pattern: `--phone-method-native-scroll-y` is captured synchronously before the touch is published. That contract was implemented only for Method, despite the shell routing every native scene through the same edge handoff.

**Decision:** Generalize Method's native-scroll mirror contract to every `plane: native` scene. Before the transaction is published, the fixed visual copy must receive the exact live scroll offset (including an iOS rubber-band offset) and freeze it until commit or rollback.

### 1.5 Receiver activation and authored playback are incorrectly the same concept

- `phoneSegmentChoreography.mediaClockOwner` currently serves two unrelated purposes:
  1. selecting which video surfaces need an autoplay/gesture activation;
  2. setting `command.playback` to tell the leaf whether media should continue playing.
- `services-ttg`, `lab-ph`, and `education-crane` declare `mediaClockOwner: 'target'` even though their `targetProgress` remains `0` for the complete ink transition.
- TTG ignores `command.playback` and explicitly pauses after preparing frame zero, so this contract error is mostly hidden there.
- PH and Crane honor `command.playback`; they start during Lab → PH and Education → Crane preparation. At transition completion, `settle(0)` pauses them. This exactly produces the reported “moves briefly, then becomes a static zoom” behavior.
- `PhonePh.render()` and forward `PhoneCrane.render()` do not drive the video playhead; they advance CSS camera transforms and depend on native playback. If playback was consumed/paused during the incoming transition, the next outgoing segment can animate only the camera over a stale Canvas.
- Current unit tests mock `video.play()` and assert topology/proof, but do not execute the real two-segment sequence “incoming prime → stable hold → outgoing playback”. The 60-segment WebKit test checks commits and endpoint readiness, not media-time monotonicity or source-frame continuity.

**Decision:** Split receiver decoder priming from media-clock ownership. Incoming ink transitions prime an exact paused frame zero; outgoing cinematic transitions own actual playback.

---

## 2. Non-goals and guardrails

- Do not add, upscale, or re-encode Star Map or Figure3 assets.
- Do not restore the rejected 1920×1080 Figure3 poster.
- Do not replace the A/B plane runtime, add another recovery state machine, or weaken fail-closed rollback.
- Do not retune every scene independently. Services/Lab/Education share one native mirror contract; TTG/PH/Crane share one activation/playback contract.
- Do not treat the existing 96/96 WebKit result as a visual oracle. It proves traversal and endpoint readiness only.
- Do not run the full browser suite during the diagnostic loop. Use the focused WebKit cases below; run the broad suite only after the focused gates pass.

---

## 3. Implementation sequence

### Task 1: Add focused failing characterization

**Files:**

- Modify: `app/e2e/r5-phone-clean-presentation.spec.ts`
- Modify: `app/e2e/r5-phone-clean-assertions.ts`
- Test: `app/e2e/r5-phone-clean-presentation.spec.ts`

**Steps:**

1. Add one diagnostic sampler that records, on every animation frame:
   - shell scene/status/phase/progress;
   - document `scrollTop`;
   - native reading and fixed source bounding rectangles;
   - active source/receiver/effect visibility;
   - each relevant video's `currentTime`, `paused`, `seeking`, and `readyState`;
   - packed Canvas `data-packed-alpha-media-time` and frame generation.
2. Add a Star Map detail case that records the source natural dimensions and the reveal input dimensions. The current build must expose `420×236` as the dynamic highlight source.
3. Add a Figure3 case that asserts:
   - the normal stable surface is currently the poster;
   - its natural size is `640×360`;
   - the Figure3 Canvas bottom is above the visual viewport bottom on an `844px` viewport.
4. Add three native handoff cases from the real bottom edge:
   - Services → TTG;
   - Lab → PH;
   - Education → Crane.
   The first transaction frame must match the pre-intent bottom-edge source. These should fail because the fixed copy returns to its top.
5. Add media-time assertions:
   - PH and both Crane videos must stay at frame zero during their incoming ink transition;
   - PH must advance monotonically only during PH → Education;
   - Crane flock and figure must advance on their authored cues only during Crane → Contact.
   These should fail on the current build.

**Focused command:**

```bash
pnpm -C app exec playwright test \
  --config playwright.release.config.ts \
  --project phone-portrait-webkit \
  e2e/r5-phone-clean-presentation.spec.ts \
  --grep "Star Map fidelity|Figure3 initial surface|native reading handoff|incoming media stays parked|PH authored playback|Crane authored playback"
```

**Gate:** Keep the failure traces. Do not proceed based only on a screenshot or mocked command fixture.

### Task 2: Restore Star Map's canonical-resolution Perlin source

**Files:**

- Modify: `app/src/scenes/star-map/phone/PhoneStarMap.tsx`
- Modify: `app/src/scenes/star-map/phone/PhoneStarMap.test.tsx`
- Modify: `app/src/scenes/star-map/starFieldReveal.test.ts`
- Modify: `app/src/production/phone-story/manifest.ts`
- Modify: `app/src/production/phone-story/manifest.test.ts`
- Modify if the mask becomes unreferenced: `app/src/story/media.ts`
- Modify if the mask becomes unreferenced: `app/src/story/media.test.ts`
- Modify if the mask becomes unreferenced: `app/src/media/phone-media.ts`
- Modify if the mask becomes unreferenced: `app/src/media/phone-media.test.ts`

**Steps:**

1. Change only the reveal input back to `STAR_MAP_IMAGE` and use the full-resolution extraction path.
2. Preserve the separate decoded `<img>` as the static source and keep `drawSource: false`; this avoids double-painting the map.
3. Preserve current lifetime/ambient ownership and the current source + Canvas proof quorum.
4. Remove `media:star-map-highlight-mask` from the phone closure only after `rg` confirms no production consumer remains. Do not delete the asset in the same change unless explicitly approved.
5. Add tests that freeze the full-resolution extraction contract and ensure the static source is still painted exactly once.
6. Compare the focused screenshot with the frame before commit `7a1d849`. If the full-resolution path restores detail, do not change glow values or DPR. If it does not, stop and present the evidence before tuning.

**Expected code shape:**

```ts
const reveal = initStarFieldReveal({
  canvas,
  sourceUrl: STAR_MAP_IMAGE,
  autoplay: false,
  // current viewport, camera, noise, proof, and lifecycle settings remain
});
```

**Unit command:**

```bash
pnpm -C app test -- \
  src/scenes/star-map/phone/PhoneStarMap.test.tsx \
  src/scenes/star-map/starFieldReveal.test.ts \
  src/production/phone-story/manifest.test.ts
```

### Task 3: Make Figure3 frame zero the normal initial presentation and fill the viewport

**Files:**

- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.tsx`
- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.css`
- Modify: `app/src/scenes/figure3-animation/phone/paper-compositor.ts`
- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.test.tsx`
- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.clean.test.tsx`
- Modify: `app/src/scenes/figure3-animation/phone/paper-compositor.test.ts`
- Modify: `app/src/production/phone-story/manifest.ts`
- Modify: `app/src/production/phone-story/manifest.test.ts`
- Modify: `app/e2e/r5-phone-clean-presentation.spec.ts`

**Steps:**

1. Give Figure3 one explicit “initial composite” surface containing:
   - primary: decoded video frame zero painted into the existing paper Canvas;
   - fallback: the existing decoded 640×360 poster, kept behind the Canvas.
2. On Brand → Figure3, start frame-zero preparation under the existing source/ink cover. Do not call `play()` for authored motion.
3. Present the Canvas only after the same generation has decoded frame zero and `paper-compositor.paint()` succeeds. The poster must remain hidden on this normal path.
4. Keep the poster as a bounded fallback if frame-zero preparation misses the existing fallback deadline. Report which child won (`video-frame-zero` or `poster-fallback`) in proof detail so a fallback cannot be mistaken for successful sharp playback.
5. Do not let a frame-zero decode miss strand Brand: the fallback may still commit, but it must be diagnosable and must not become the ordinary path.
6. Change Figure3 CSS height ownership from `max(80svh, 38rem)` to the complete presentation plane. Mount, scene, canonical sticky/stage, poster, and Canvas must have the same viewport rect.
7. Keep `phoneFigure3PaperCoverRect()` left-anchored and cover-fitted. Do not change the camera crop while fixing height.
8. Update the compositor geometry test to derive the Canvas size from a real full-height host rather than hard-coding the desired result independently of CSS.

**Primary/fallback state:**

```text
preparing -> poster decoded behind cover
          -> video frame zero decoded and Canvas painted
          -> expose Canvas as normal initial composite

frame-zero deadline miss -> expose poster fallback with diagnostic detail
```

**Focused assertions:**

- Brand → Figure3 stable shows `figure3-paper-canvas`, not the poster, when frame zero is available.
- The decoded video is at `0 ± 0.05s` and paused.
- Canvas rect bottom equals the visual viewport bottom within 1px.
- Figure3 → Services starts from the same Canvas without a sharpness/crop swap.
- No new asset appears in `git status`.

### Task 4: Generalize native reading scroll mirroring

**Files:**

- Modify: `app/src/production/phone-story/PhoneStoryShell.tsx`
- Modify: `app/src/production/phone-story/styles.css`
- Modify: `app/src/production/phone-story/PhoneStoryShell.test.tsx`
- Modify: `app/src/scenes/method-top/phone/PhoneMethodTop.tsx`
- Modify: `app/src/scenes/method-top/phone/PhoneMethodTop.css`
- Modify: native visual wrappers in:
  - `app/src/scenes/figure2-proof/phone/PhoneFigure2Proof.tsx`
  - `app/src/scenes/brand/phone/PhoneBrand.tsx`
  - `app/src/scenes/services/phone/PhoneServices.tsx`
  - `app/src/scenes/lab/phone/PhoneLab.tsx`
  - `app/src/scenes/education/phone/PhoneEducation.tsx`
  - `app/src/scenes/contact/phone/PhoneContact.tsx`
- Modify the corresponding focused scene tests only where the shared marker is asserted.

**Steps:**

1. Replace the Method-specific shell selector with a shared `data-phone-native-mirror="<scene-id>"` contract.
2. Before publishing a native-edge touch intent, read the live `scrollTop` and synchronously apply it to the active scene's fixed visual mirror.
3. Freeze that value while `data-phone-reading="disabled"`. Do not recompute from the document after the transaction starts.
4. Apply one shared transform variable to the mirror:

```css
[data-phone-native-mirror] {
  transform: translate3d(0, calc(-1 * var(--phone-native-scroll-y, 0px)), 0);
}
```

5. Migrate Method to the shared variable so there is one contract, not a Method special case plus six copies.
6. Verify both directions:
   - forward at the document bottom freezes the exact bottom/rubber-band position;
   - reverse at the document top freezes `0px`.
7. On rollback, restore the native reading flow at its previous scroll position; do not jump to the canonical landing.

**Focused assertions:**

- The pixel/geometry difference between the last native frame and first fixed source frame is within the existing transition tolerance.
- Services, Lab, and Education no longer expose their first screen during `preparing` or `presenting-source`.
- The transition may wait for target preparation, but that wait is visually on the unchanged source frame.

### Task 5: Separate decoder activation from playback ownership

**Files:**

- Modify: `app/src/production/phone-story/manifest.ts`
- Modify: `app/src/production/phone-story/machine.ts`
- Modify: `app/src/production/phone-story/runtime.ts`
- Modify: `app/src/production/phone-story/protocol.ts` only if the owner type belongs there after review
- Modify: `app/src/production/phone-story/choreography.test.ts`
- Modify: `app/src/production/phone-story/manifest.test.ts`
- Modify: `app/src/production/phone-story/machine.test.ts`
- Modify: `app/src/production/phone-story/runtime.test.ts`
- Modify: `app/src/media/phone-packed-alpha-surface.ts`
- Modify: `app/src/media/phone-packed-alpha-surface.test.ts`
- Modify: `app/src/scenes/ph-animation/phone/PhonePh.tsx`
- Modify: `app/src/scenes/ph-animation/phone/PhonePh.clean.test.tsx`
- Modify: `app/src/scenes/crane-animation/phone/PhoneCrane.tsx`
- Modify: `app/src/scenes/crane-animation/phone/PhoneCrane.clean.test.tsx`
- Audit/test: `app/src/scenes/ttg-animation/phone/PhoneTtg.tsx`

**Steps:**

1. Add an `activationOwner: 'none' | 'source' | 'target'` channel next to `mediaClockOwner`.
2. Make the machine use `activationOwner` to select video surfaces and activation credit.
3. Keep the runtime's `command.playback` derived only from `mediaClockOwner`.
4. Set the three incoming ink segments to:

```ts
// Services -> TTG, Lab -> PH, Education -> Crane
activationOwner: 'target',
mediaClockOwner: 'none',
targetProgress: 0
```

5. Keep the outgoing cinematic segments as:

```ts
// TTG -> Lab, PH -> Education, Crane -> Contact
activationOwner: 'source',
mediaClockOwner: 'source'
```

6. Extend the packed-alpha surface with an exact initial-frame preparation mode. A non-playback activation must:
   - create the current generation;
   - authorize muted inline media;
   - pause;
   - seek/present `0s`;
   - report the generation only after the Canvas media time is within the initial-frame tolerance.
7. In PH and Crane, branch on `command.playback`:
   - `false`: prime and hold exact frame zero;
   - `true`: create a fresh forward generation, start at zero, and keep native playback running.
8. Make `settle(0)` prove frame zero rather than merely calling `pause()` at whatever time activation reached.
9. Preserve reverse seek-driven behavior and endpoint proof. Do not replace it with native reverse playback.
10. Add an integration unit test that runs the exact two-attempt sequence on the same retained leaf:
    - incoming target activation with `playback: false`;
    - `settle(0)` and stable rebind;
    - outgoing source activation with `playback: true`.

**Critical test expectations:**

- Incoming PH/Crane activation receives `playback: false`.
- Outgoing PH/Crane activation receives `playback: true`.
- Incoming Canvas time stays within `0.05s` and media is paused.
- Outgoing media and Canvas time increase monotonically.
- Crane flock and figure generations are both current; neither reuses the incoming priming generation as an active playback run.

**Unit command:**

```bash
pnpm -C app test -- \
  src/production/phone-story/choreography.test.ts \
  src/production/phone-story/machine.test.ts \
  src/production/phone-story/runtime.test.ts \
  src/media/phone-packed-alpha-surface.test.ts \
  src/scenes/ph-animation/phone/PhonePh.clean.test.tsx \
  src/scenes/crane-animation/phone/PhoneCrane.clean.test.tsx
```

### Task 6: Focused visual/media acceptance before the broad suite

**Files:**

- Modify: `app/e2e/r5-phone-clean-presentation.spec.ts`
- Update after evidence exists: `docs/react-refactor/reports/r5-phone-clean-runtime-baseline.md`

**Steps:**

1. Run the focused WebKit command from Task 1.
2. Require all of the following before broad verification:
   - Star Map dynamic detail is restored without a new mask/asset;
   - Figure3 normal initial surface is video frame zero and fills the viewport;
   - Services/Lab/Education preserve their last native frame through preparation;
   - PH is parked during Lab → PH and plays during PH → Education;
   - Crane is parked during Education → Crane and both videos play during Crane → Contact;
   - no single-frame rollback, first-screen flash, premature playback, or static-only zoom appears in 60fps sampling.
3. Run focused repetitions twice in both directions. A single green traversal is not enough for retained decoder/generation bugs.
4. Only then run:

```bash
pnpm -C app test
pnpm -C app typecheck
pnpm -C app run verify:phone-architecture:cutover
pnpm -C app build
pnpm -C app exec playwright test \
  --config playwright.release.config.ts \
  --project phone-portrait-webkit \
  e2e/r5-phone-clean-presentation.spec.ts
git diff --check
```

5. Perform physical iPhone Safari acceptance on the same production build. Record:
   - normal and Low Power Mode;
   - toolbar expanded/collapsed;
   - two forward/reverse cycles through Services → TTG → Lab → PH → Education → Crane → Contact;
   - Star Map and Figure3 sharpness at rest and in motion.

**Release gate:** Do not call the P0 complete until the physical iPhone run confirms the visual issues, even if WebKit and Vitest are green.

---

## 4. Why the previous verification passed

The existing automation proved the wrong layer for these failures:

- Star Map tests proved Canvas readiness, not highlight source resolution or edge detail.
- Figure3 tests explicitly expected the static poster and mocked a full-height Canvas, so both the blur and bottom band were frozen as acceptable behavior.
- The complete 60-segment test proved commit sequence, endpoint readiness, resource counts, and visible content. It did not compare the native last frame with the fixed first frame and did not require PH/Crane media time to advance in the correct segment.
- Runtime tests asserted `mediaClockOwner: 'target'` while `targetProgress: 0`, but never asserted that this sent `playback: true` to a real retained PH/Crane leaf.
- Mocked `HTMLMediaElement.play()` resolves immediately; that cannot expose iPhone decoder timing, playhead consumption, or a stale packed Canvas.

The new gates therefore measure the visible source frame and physical media time, not only state-machine success.

---

## 5. Expected outcome

- Star Map's Perlin layer has the pre-regression fine-line/detail character.
- Figure3 enters on the existing video's sharp first frame, with no new poster asset and no unmoving bottom band.
- Services → TTG, Lab → PH, and Education → Crane begin from the exact last native-reading frame without a pause/rebound to the first screen.
- PH and Crane remain parked during incoming ink, then play continuously in their authored outgoing segment.
- Failure fallback and rollback remain bounded and navigable, but fallback visuals are observable rather than silently treated as the normal path.
