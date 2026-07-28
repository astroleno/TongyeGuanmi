# R5 Phone Global Presentation Contract Recovery Implementation Plan

> **For agentic workers:** Execute inline in this recovery worktree. Do not dispatch subagents unless the user explicitly authorizes it. Keep each task test-first and commit only coherent, verified slices.

**Goal:** Extend the existing route-local phone reducer authority into one presentation transaction that commits every canonical hold and segment only after correct surface layering, live visual-viewport coverage, real media/compositor frame evidence, and target-content visibility are all true.

**Architecture:** The formal / route remains owned by one PhoneStoryShell authority, while /brand-lab stays an isolated scope:'brand-lab' QA shell created by the same runtime factory. Reducer state remains the only transaction state; scene adapters, CSS, media drivers, compositor callbacks, viewport observers, and DOM readers report typed presentation evidence into that transaction. Cinematic commits fail closed, reading holds fail open, and stale/expired evidence can only cause the active authority generation to retry or roll back.

**Tech Stack:** React 19, TypeScript 5.8, Vitest 3, Playwright WebKit, GSAP/ScrollTrigger, native video, WebGL packed-alpha compositor, CSS custom properties/data roles, Vite 7.

---

## 1. Approved boundaries and invariants

This plan supersedes earlier Unit 7B execution/closure plans for all work after
be9db27. The dirty files in the source worktree are diagnostic evidence only;
do not transplant that patch as a unit.

- Formal / has exactly one live authority: PhoneStoryShell.
- /brand-lab creates a separate route-local authority with scope:'brand-lab',
  but uses the same reducer, runtime factory, contracts, inputs, viewport
  implementation, media implementation, and timings.
- PhoneBrandLabStory must not own a second orchestration lifecycle and must not
  become a transitive formal-route import.
- The 16 canonical holds and 15 canonical segments in canonical-spine.ts are
  the exhaustive contract domain. Auxiliary proof sub-scenes remain internal
  adapters; they are not a second canonical topology.
- Do not change app/src/story/timings.ts, copy, scene order, media bytes/hash,
  Figure3/Services, PH/Education, or Crane/Contact forward/reverse compositor
  donor behavior.
- Keep the 648 KiB (663,552-byte) phone JavaScript hard cap.
- No Pattern-specific strip, overscan, negative bottom, or new occluding
  pseudo-element may be introduced.

## 2. File map and public contracts

| File | Responsibility |
| --- | --- |
| app/src/production/phone/phone-presentation-contract.ts | Exhaustive hold/segment manifest: surface owner, coverage owner, frame evidence, direct-entry evidence, effect host, relative layer policy, and reverse policy. |
| app/src/production/phone/phone-presentation-evidence.ts | Typed evidence tokens, generation/expiry validation, evidence aggregation, and fail-open/fail-closed classification. |
| app/src/production/phone/phone-story-state.ts | Stores evidence in the existing snapshot/session and transitions only when the manifest is satisfied. |
| app/src/production/phone/phone-story-presentation.ts | Converts canonical cursor plus accepted evidence into an atomic projection tuple. |
| app/src/production/phone/phone-story-projector.ts | Applies one revision of roles, coverage surface, edge, and visibility; rejects disconnected or unpresented selected surfaces. |
| app/src/production/phone/phone-story-runtime.ts | Exposes positional, minifier-safe reporting functions so lazy modules never transport mutable evidence objects across chunks. |
| app/src/production/phone/phone-viewport-coverage.ts | Maintains live visual viewport coverage separately from the frozen layout viewport. |
| app/src/production/phone/phone-layer-roles.ts | Defines semantic cross-surface layer ordering and resolves effect placement from the segment manifest. |

The reducer-facing evidence API must use the active execution identity:

~~~
type PhonePresentationEvidenceKind =
  | 'dom-reading'
  | 'static-poster'
  | 'native-video-frame'
  | 'packed-canvas-frame'
  | 'coverage'
  | 'effect-frame'
  | 'direct-entry';

type PhonePresentationEvidenceEvent = PhoneExecutionIdentity & {
  type: 'PRESENTATION_EVIDENCE_REPORTED';
  kind: PhonePresentationEvidenceKind;
  subject: PhoneSurfaceId | SegmentId;
  revision: number;
};
~~~

For stable holds without an execution session, runtime-owned reporting creates
the same evidence record with the authority id plus current projection revision.
The reducer must ignore every record whose authority, session, generation, leg,
projection revision, or subject does not match its active transaction.

## 3. Task 0 — isolate WIP and make the broken baseline executable

**Files:**

- Create: docs/react-refactor/reports/r5-phone-presentation-recovery-baseline.md
- Modify: app/e2e/r5-phone-story.spec.ts
- Read-only guards: app/src/story/timings.ts, app/scripts/homepage-media-contract.mjs, app/scripts/verify-phone-packed-alpha-masters.mjs, app/scripts/verify-performance-budgets.mjs

- [ ] Record the source worktree branch, dirty file list, and reviewed head in
  the baseline report. Record that this recovery worktree starts at be9db27
  and that the source worktree remains untouched.

- [ ] Run and record immutable baseline gates:

~~~
cd app
pnpm run verify:media:phone-masters
pnpm typecheck
pnpm test
~~~

  Capture the media verifier JSON (source bytes, SHA-256, composed RGBA
  first-frame hashes, sizes) rather than copying or regenerating media. Record
  the phone budget source as 648 * 1024 = 663552 bytes.

- [ ] Add three browser contracts that are expected to fail at be9db27, then
  run each alone and record its failure:

  1. Hero cold-load sample sequence is loader -> primed-0 -> monotonically
     increasing -> complete and never contains a visible 1 -> 0 reset.
  2. An AOD video whose media time advances but whose compositor callback is
     withheld never exposes an animating transaction.
  3. A non-zero visualViewport offset has a persistent coverage root spanning
     left/top/right/bottom of that live viewport.

  The tests must observe runtime datasets/geometry and injected compositor or
  visualViewport behavior; they must not inspect source strings or CSS text.

- [ ] Leave the failures unskipped until their owning implementation task. Do
  not use test.fixme, regex assertions, a synthetic progress callback, or an
  opaque fullscreen overlay to make this baseline green.

- [ ] Commit the isolated baseline/tests as:

~~~
test(r5): capture presentation recovery baseline
~~~

## 4. Task 1 — install the exhaustive presentation manifest and reducer evidence

**Files:**

- Create: app/src/production/phone/phone-presentation-contract.ts
- Create: app/src/production/phone/phone-presentation-contract.test.ts
- Create: app/src/production/phone/phone-presentation-evidence.ts
- Create: app/src/production/phone/phone-presentation-evidence.test.ts
- Modify: app/src/production/phone/phone-story-presentation.ts
- Modify: app/src/production/phone/phone-story-state.ts
- Modify: app/src/production/phone/phone-story-state.test.ts
- Modify: app/src/production/phone/phone-story-runtime.ts
- Modify: app/src/production/phone/phone-story-runtime.test.ts
- Modify: app/src/production/phone/phone-story-projector.ts
- Modify: app/src/production/phone/phone-story-projector.test.ts
- Modify: app/src/production/phone/phone-story-orchestrator.types.ts
- Modify: app/src/production/phone/phone-story-orchestrator.ts

- [ ] Write failing exhaustive-manifest tests first. They must compile against
  canonicalSceneIds and canonicalSegments and prove every canonical record has
  a coverage owner, receiver surface, direct-entry evidence, and evidence
  policy. Each segment must name source, receiver, effect host, relative layer
  placement, first-frame evidence, and forward/reverse policy.

- [ ] Add immutable records, not scene-local switches:

~~~
export const sceneContracts = {
  hero: { evidence: 'static-poster', coverage: 'front:hero', ... },
  // every canonical scene
} as const satisfies Record<CanonicalSceneId, PhoneScenePresentationContract>;

export const segmentContracts = {
  'hero-pattern': { effect: 'front-ink', placement: 'above-both', ... },
  // every canonical segment
} as const satisfies Record<CanonicalSegmentId, PhoneSegmentPresentationContract>;
~~~

  The actual values must be mapped from currently registered surfaces and
  donor scene behavior; no generic default may hide an omitted scene.

- [ ] Add evidence storage to the existing PhoneStorySnapshot/session. Do not
  create a parallel store, React context, or event machine. A cinematic
  transition may leave preparing/verification only when its active contract is
  satisfied. A reading hold can commit with DOM/coverage fail-open evidence,
  while its diagnostics remain observable.

- [ ] Change projection creation so coverage surface, edge, surface roles, and
  projection revision come from the accepted contract record in one reducer
  revision. Projector preflight must reject a selected registered surface when
  its root is disconnected, hidden, inert, display:none, effectively
  transparent, or its presented callback reports false.

- [ ] Replace the runtime surface-registration API's boolean placeholder with
  an evidence reader:

~~~
registerPhoneRuntimeSurface(
  port, id, scene, kind, root, coverageRoot,
  () => readPhoneSurfacePresentation(root(), coverageRoot())
)
~~~

  Keep positional bridges at lazy boundaries. The concrete evidence object
  must be built and consumed in the authority chunk.

- [ ] Test stale authority/session/generation/revision evidence, target
  disconnect, reading fail-open, cinematic fail-closed, direct-entry retry,
  rollback, and formal/brand-lab trace isomorphism.

- [ ] Commit:

~~~
feat(r5): gate phone commits on presentation evidence
~~~

## 5. Task 2 — prime Hero before the loader exposes it

**Files:**

- Modify: app/src/production/phone/scenes/PhoneHero.tsx
- Modify: app/src/production/phone/scenes/PhoneHero.css
- Modify: app/src/production/phone/scenes/PhoneHero.test.tsx
- Modify: app/src/production/phone/usePhoneFixedStageRegistration.ts
- Modify: app/src/production/phone/usePhoneFixedStageRegistration.test.ts
- Modify: app/src/production/phone/PhoneStoryShell.tsx
- Modify: app/e2e/r5-phone-story.spec.ts

- [ ] First make the Hero sequence test fail against the completed CSS initial
  value and delayed stage registration.

- [ ] In PhoneHero's layout effect, synchronously call renderEntrance(0), or
  its pure DOM/CSS equivalent, before onReady(). This priming path must not
  call ensureIntroInk, create the Hero WebGL compositor, preload a future
  cinematic surface, or start a timer.

- [ ] Make onReady report static-poster/DOM evidence only after the primed
  root is connected and visible. Preserve the loader's ordering:

~~~
loader -> hero primed at 0 -> authority registration -> one startEntrance
       -> monotonic progress -> complete
~~~

- [ ] Scope startEntrance to the current authority generation; remounts and
  Strict Mode cleanup/replay must not create a second entrance or a late
  reset. Direct entries below Hero must not instantiate Hero GPU/ink runtime.

- [ ] Verify React unit lifecycle, fixed-stage registration, desktop
  unaffected behavior, and browser frame sampling in Chromium + WebKit.

- [ ] Commit:

~~~
fix(r5): prime Hero before phone loader exposure
~~~

## 6. Task 3 — make AOD commit on compositor presentation, not media liveness

**Files:**

- Modify: app/src/media/packed-alpha-video.ts
- Modify: app/src/media/packed-alpha-video.test.ts
- Modify: app/src/production/phone/scenes/phone-packed-alpha-surface.ts
- Modify: app/src/production/phone/scenes/phone-packed-alpha-surface.test.ts
- Modify: app/src/production/phone/scenes/PhoneAod.tsx
- Modify: app/src/production/phone/scenes/PhoneAod.test.tsx
- Modify: app/src/production/phone/aod-autoplay.ts
- Modify: app/src/production/phone/aod-autoplay.test.ts
- Modify: app/src/production/phone/usePhoneStageRuntime.ts
- Modify: app/src/production/phone/usePhoneStageRuntime.test.ts
- Modify: app/src/production/mobile-media-unlock.ts
- Create: app/src/production/phone/phone-media-gesture-lease.ts
- Create: app/src/production/phone/phone-media-gesture-lease.test.ts

- [ ] Start with failing unit tests for play() resolved/no successful
  texImage2D + drawArrays, slow successful frame, texture-upload failure,
  context loss, stale token, reverse endpoint, and background/resume.

- [ ] Emit the packed-canvas-frame evidence only immediately after a successful
  texture upload and drawArrays for the active compositor. Carry a run-local
  callback from PhoneAod through phone-packed-alpha-surface; reject a frame
  from a retired canvas, wrong endpoint, old session, or old generation.
  loadeddata, canplay, timeupdate, seeked, currentTime > 0, and play()
  resolution remain decoder-liveness signals only.

- [ ] Split the current six-second deadline into:

~~~
prepare deadline: topology/source/decoder has not become usable
progress watchdog: reset after every accepted media/compositor progress update
~~~

  On either expiry, dispatch one active-session failure, release the media
  lease, restore the correct source hold, and leave the same authority able to
  retry. Do not send the transaction to an unrelated input-only state.

- [ ] Replace global play -> pause unlocking for phone-owned visible media with
  an authority-scoped gesture lease. The gesture handler may ask the active
  AOD transaction to retry inside its activation token; it must not play/pause
  arbitrary mounted phone videos outside the reducer transaction. Preserve
  unrelated desktop/media behavior.

- [ ] Cover forward and reverse, reduced motion static endpoint, retry after
  blocked play, context loss recovery, unmount cleanup, and all timers/RAF/
  leases cleared on disposal.

- [ ] Commit:

~~~
fix(r5): require packed AOD compositor frames before commit
~~~

## 7. Task 4 — split frozen layout geometry from live coverage geometry

**Files:**

- Create: app/src/production/phone/phone-viewport-coverage.ts
- Create: app/src/production/phone/phone-viewport-coverage.test.ts
- Modify: app/src/production/phone/usePhoneViewportGeometry.ts
- Modify: app/src/production/phone/phone-viewport.test.ts
- Modify: app/src/production/phone/PhoneStoryShell.tsx
- Modify: app/src/production/phone/PhoneStoryShell.css
- Modify: app/src/production/phone/PhoneStageRail.tsx
- Modify: app/src/production/phone/PhoneStageRail.css
- Modify: app/src/production/phone/PhoneLabContactShell.tsx
- Modify: app/src/production/phone/PhoneLabContactShell.test.tsx
- Modify: app/src/production/phone/PhoneLabContactShell.css
- Modify: app/e2e/r5-phone-story.spec.ts

- [ ] Write tests that feed a live visualViewport sequence with changing
  offsetLeft/offsetTop/width/height and assert one coalesced coverage revision
  per animation frame, CSS variables for all four edges, and no
  ScrollTrigger refresh during toolbar-only motion.

- [ ] Introduce two snapshot functions:

~~~
readLayoutViewport(): { width, height, revision } // width/orientation/fullscreen only
readCoverageViewport(): { left, top, right, bottom, width, height, revision }
~~~

  Layout snapshot remains the frozen ScrollTrigger clock. Coverage snapshot is
  updated on every visualViewport resize/scroll and drives the shared stage
  canvas/coverage plane.

- [ ] Move Lab/Contact's duplicated local visual viewport lifecycle onto the
  shared coverage primitive. All Front, Grade A, Group 4-5, Group 6-7, and
  native-reading surfaces must resolve through the same coverage owner.

- [ ] Apply coverage edge, coverage root, and surface role in one projector
  revision. The fix must cover actual visual viewport geometry, not only a
  fixed inset:0 canvas in Playwright.

- [ ] Run the injected non-zero-offset contract, toolbar resize/scroll
  simulations, formal direct entries, and no-white-edge screenshots in WebKit.

- [ ] Commit:

~~~
fix(r5): maintain live phone coverage viewport
~~~

## 8. Task 5 — centralize effect-layer presentation for every segment

**Files:**

- Create: app/src/production/phone/phone-layer-roles.ts
- Create: app/src/production/phone/phone-layer-roles.test.ts
- Create: app/src/production/phone/phone-effect-presentation.test.ts
- Modify: app/src/production/phone/phone-story-projector.ts
- Modify: app/src/production/phone/PhoneStageRail.css
- Modify: app/src/production/phone/PhoneTransitionCoordinator.css
- Modify: app/src/production/phone/PhoneGradeAStory.css
- Modify: app/src/production/phone/PhoneBrandLabStory.css
- Modify: app/src/production/phone/PhoneLabContactContinuation.css
- Modify: affected scene/transition adapters under app/src/production/phone/scenes and app/src/production/phone/transitions
- Modify: app/e2e/r5-phone-story.spec.ts

- [ ] Define the only cross-surface ordering:

~~~
coverage < retained < fixed < stable < endpoints < transition-effect
~~~

  Numeric z-index values live in phone-layer-roles.ts or one CSS custom
  property translation. Same z-index plus DOM order is forbidden for effects
  and endpoints.

- [ ] Resolve each segment's explicit placement from its manifest:
  above-both, between, or inside-owner. Scene-local z-index values may remain
  only inside a declared local stacking context; no local value can escape and
  outrank a role owned by the projector.

- [ ] Test all 15 canonical segments forward/reverse at progress 0, 0.5, and
  1. For each sample assert source/receiver/effect host roles, semantic layer
  order, matching active token, real effect frame evidence, and post-commit
  resource release. Preserve special Figure3/Services, PH/Education, and
  Crane/Contact compositor donor semantics.

- [ ] Delete string/regex tests that merely find z-index literals. Retain
  static checks only for manifest exhaustiveness and prohibited ownership
  boundaries.

- [ ] Commit:

~~~
feat(r5): enforce global phone effect-layer contracts
~~~

## 9. Task 6 — make every formal direct entry prove visible target content

**Files:**

- Create: app/src/production/phone/phone-direct-entry-presentation.test.ts
- Modify: app/src/production/phone/usePhoneStageRuntime.ts
- Modify: app/src/production/phone/PhoneGradeAStory.tsx
- Modify: app/src/production/phone/PhoneBrandLabContinuation.tsx
- Modify: app/src/production/phone/PhoneLabContactContinuation.tsx
- Modify: app/src/production/phone/phone-story-projector.ts
- Modify: app/src/production/phone/phone-entry-plan.ts
- Modify: app/src/production/phone/phone-entry-plan.test.ts
- Modify: app/e2e/r5-phone-story.spec.ts

- [ ] Replace every production () => true surface registration with a concrete
  adapter/root evidence reader. Evidence must include connected, non-hidden,
  non-inert, non-display:none, near-opaque, viewport-intersecting DOM where
  appropriate, non-zero media/canvas rect, and active identity's actual frame
  for cinematic scenes.

- [ ] Define direct-entry predicates in the manifest:

  - Reading Method, Proof, Services, Lab, Education: required heading/body
    nodes are non-empty, visible, intersect the live viewport, and retain
    usable WebKit CJK font rendering.
  - Figure2, Figure3, TTG, PH, Crane: active poster/canvas/video has a
    non-zero rectangle and current identity frame evidence.
  - Brand and Contact: key static content is rendered and visible.

- [ ] Make direct entry wait/retry through the existing transaction if required
  geometry/evidence is not yet mounted. It may not publish a stable cursor
  merely because a surface registration exists. Reading content remains
  fail-open before ScrollTrigger enters; cinematic content remains fail-closed.

- [ ] Add browser coverage for all 12 formal direct entry endpoints via initial
  URL, hash, menu, and history. Verify formal and brand-lab output the same
  snapshot/effect trace after authority identity is ignored.

- [ ] Commit:

~~~
fix(r5): verify phone direct-entry presentation
~~~

## 10. Task 7 — replace fake gates and complete release/device acceptance

**Files:**

- Modify: app/scripts/verify-homepage-module-boundaries.mjs
- Modify: app/scripts/verify-homepage-module-boundaries.test.mjs
- Modify: app/src/production/phone/phone-layer-contract.test.ts
- Modify: app/src/production/phone/phone-presentation-contract.test.ts
- Modify: app/e2e/r5-phone-story.spec.ts
- Modify: docs/react-refactor/reports/r5-phone-state-machine-acceptance.md
- Create: docs/react-refactor/reports/r5-phone-presentation-contract-acceptance.md

- [ ] Remove gates that claim a rendered frame from currentTime > 0, callback
  source order, or a z-index regex. Keep static gates for manifest
  exhaustiveness, runtime-factory/module graph isolation, no QA graph in
  formal route, positional cross-chunk contracts, and no local presentation
  authority.

- [ ] Keep behavior in unit/integration/browser tests. Add negative tests for
  stale evidence, a transparent effect host, coverage mismatch, hidden target,
  compositor loss, and cleanup after route unmount.

- [ ] Run the full automated gate:

~~~
cd app
pnpm typecheck
pnpm test
pnpm run verify:media:phone-masters
pnpm build
pnpm exec playwright test --config playwright.phone.config.ts e2e/r5-phone-story.spec.ts
~~~

  Record browser/version, build budget JSON, failures/retries, and any
  limitations. Do not call WebKit engine evidence a substitute for device
  evidence.

- [ ] Complete and record physical iPhone Safari acceptance for cold/warm
  load, toolbar expanded/collapsed/moving, lock/unlock, foreground/background,
  slow decoder, continuous gestures, and two complete Hero -> Contact -> Hero
  cycles in normal and reduced motion. A failure in this matrix blocks release.

- [ ] Final acceptance must prove:

  1. one authority per mounted route and no remaining listener/RAF/timeout/media lease after unmount;
  2. 16 holds and 15 segments meet evidence/layer/coverage contracts;
  3. Hero never visibly resets from completed to zero;
  4. AOD animates only after a real compositor draw and recovers to Method;
  5. live viewport edges never expose html/body white;
  6. all 12 direct entries show the actual target;
  7. timings/media/donor contracts have no diff; and
  8. desktop typecheck/unit/build/key playback checks remain green.

- [ ] Commit:

~~~
test(r5): validate global phone presentation contract
~~~

## 11. Execution order and rollback policy

Execute Tasks 0 through 7 in order. Do not merge a task that makes a local
scene look correct while bypassing the contract manifest or reducer evidence.
Every transaction failure must use the current authority to restore the source
projection, release transaction-scoped resources, and allow a fresh gesture or
direct-entry retry. Never use a CSS-only completion, a timer-only AOD success,
or a cursor-only direct-entry completion to mask missing user-visible evidence.
