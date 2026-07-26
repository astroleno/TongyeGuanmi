# R5 Phone Single-Orchestration Root Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Do not spawn subagents without explicit user permission.

**Goal:** Preserve the accepted native-scroll/fixed-stage phone route while replacing Unit 7B's three competing local state machines with one canonical phone orchestration authority, then close the nine reported forward/reverse, layering, readiness, media-first-frame, and Safari edge-ownership failures without changing the approved visual design.

**Architecture:** `PhoneStoryShell` owns one phone-only cursor, one adjacent-intent router, one transition session, one scroll anchor, and one publisher for navigation/checkpoint/edge/layer state. Scene and transition adapters remain animation/media/rendering donors. They register capabilities and report evidence; they no longer decide legal predecessors, successors, durable phases, scroll landings, or cross-group completion. The implementation does not reuse the desktop XState Director and does not add another viewport clock or Safari overlay.

**Tech Stack:** React 19, TypeScript 5.8, Vitest 3, GSAP/ScrollTrigger for the accepted scroll-driven front half, requestAnimationFrame time ownership for phone ink, native/timeline video drivers for packed-alpha media, WebGL ink and packed-alpha compositors, CSS data-role layering, Vite 7.

---

## 1. Decision summary

This plan accepts the architecture correction in the attached review:

> Unit 7B reused the accepted Unit 4/5/6 scenes, animations, and adapters, but did not preserve their validated single orchestration ownership.

It also preserves the original product architecture:

- desktop continues to use Stage/Director;
- phone continues to use native document scroll plus one fixed cinematic stage;
- canonical scene/segment IDs, copy, navigation, media, and fallbacks remain shared;
- Unit 4/5/6 implementations remain visual and media donors;
- phone orchestration is phone-specific and does not import the desktop Director.

The root fix is not a collection of nine independent CSS or timing patches. It is one ownership correction with five supporting contracts:

1. one canonical phone cursor and legal adjacency graph;
2. one transition session and one scroll-anchor owner;
3. one dependency-closure/readiness owner with a bounded rollback;
4. one atomic endpoint/layer/edge commit;
5. one current-run presented-frame identity for packed-alpha playback.

## 2. Reviewed baseline

- Worktree: `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b`
- Branch: `codex/r5-phone-unit7b`
- Reviewed HEAD: `e883784`
- Relevant Unit 7B commits:
  - `71e5ef9`
  - `7e3e124`
  - `19053c4`
  - `e883784`
- Accepted donor references:
  - Unit 4: `3deb717`
  - Unit 5: `35b0aee`
  - Unit 6: `ab7353e`
  - Unit 7A: `eca6bc2`

Primary evidence:

- `docs/plans/2026-07-19-013-refactor-r5-responsive-story-architecture-plan.md`
- `app/src/production/phone/PhoneGradeAStory.tsx`
- `app/src/production/phone/PhoneBrandLabContinuation.tsx`
- `app/src/production/phone/PhoneLabContactContinuation.tsx`
- `app/src/production/phone/phone-transition-coordinator.ts`
- `app/src/production/phone/phone-target-presentation.ts`
- `app/src/production/phone/PhoneStageRail.css`
- accepted Unit 5/6 Git snapshots listed above

Architecture approved for inline execution on 2026-07-25. The amendments below
are part of the approved architecture and are not optional implementation
details:

- composite-run identity and canonical reverse progress;
- transactional visual rollback with retryability reported outside the cursor;
- gesture-epoch consumption/rearm;
- Strict Mode-safe capability leases and run-scoped mount retention;
- exact existing packed-alpha master/current Crane flock identity;
- early physical evidence, missing sequence/layer tests, and frozen build budgets.

Implementation correction confirmed by the user on 2026-07-25:

- Unit 7B must repair orchestration, preparation, handoff, rollback, and retry
  ownership; the accepted PH/Crane implementations did not depend on generated
  opening plates.
- Do not regenerate, replace, or rewrite PH/Crane media in this work.
- Forward packed-alpha preparation proves mounted topology only and does not
  pre-play hidden media. Native playback begins after the entry handoff.
- Keep the existing masters frozen and verify their file identities plus their
  decoded composed-RGBA first-frame hashes through a read-only verifier.

This correction supersedes the static-opening generation language later in the
original plan.

Budget correction confirmed by the user on 2026-07-25:

- Keep the `648 KiB` phone JavaScript ceiling as a hard build gate.
- Treat `4 KiB` of remaining headroom as a build warning, not a second hard
  gate.
- Optimize only real duplicated logic; do not compress lifecycle names,
  diagnostics, or transaction state merely to satisfy the recommended
  headroom.

## 3. Confirmed causes, hypotheses, and corresponding root contracts

| Reported problem | Evidence status | Root contract in this plan |
| --- | --- | --- |
| 1. Bottom white/paper exposure | Layer/edge ownership is confirmed as one failure path; the remaining physical Safari sampling path still requires cold-tab evidence | Controller alone publishes edge state; active endpoints use semantic layer roles above the permanent z=8 fallback; unresolved placeholders cannot become transition receivers; Task 1 records the physical owner before this is declared fixed |
| 2. Figure2 → Proof z-depth jumps | Confirmed progress-domain conflict: `0.72 → 1` is reset by generic `enter()/reverse()` calling `render(0)` | Transition progress is normalized once and mapped inside the Figure2 adapter; lifecycle methods cannot reset segment progress |
| 3. Proof → Brand omits Brand | Confirmed stacking fault: Brand is forced to z=0 below the z=8 paper | Brand is the registered `to` endpoint and receives the controller-owned `transition-endpoint` layer role before ink starts |
| 4. Brand flashes after Brand → Figure3 | Confirmed endpoint-release regression from `releaseBoundaryGeometryAtEndpoints` | Endpoint visibility is committed before clip/mask geometry is released; release is protected by a run-scoped geometry lease |
| 5. Reverse jumps/corrupts later runs | Confirmed split phase plus anchor regression; not an inherent “TTG selects Proof” rule | Only the boundary adjacent to the cursor can run; one session owns phase and accepted reverse overshoot/preserve semantics |
| 6. Crane first run shows only camera enlargement | Exact physical cause still requires run/frame evidence; the newly introduced hidden pre-play and stale handoff race is credible | Forward preparation proves topology without hidden playback; the orchestrator starts native playback only after the ink handoff, and playback failure rolls back instead of advancing the camera-only endpoint |
| 7. Crane reverse cannot reveal Education | Confirmed physical-coordinate fault: Education is above the locked viewport | Controller aligns the real Education document tail into the fixed transition plane for the reverse ink, without cloning it |
| 8. Lab → PH / PH → Education intermittently blank | Confirmed dependency-closure mismatch and infinite readiness polling | Static per-run closure includes PH, Education, both transitions, and source; unresolved readiness times out and rolls back to Lab |
| 9. Brand → Figure3 often appears not to trigger | Confirmed risk from stale phase, double ownership, and unbounded readiness; `0.16` is not a trigger window | Adjacent intent is retained for one boundary only; approach prewarm resolves the complete run closure; no boundary skipping |

## 4. Non-goals and prohibited shortcuts

- Do not force phone through the desktop XState Director.
- Do not add a fourth local state machine beside Grade A, Group 4–5, and Group 6–7.
- Do not fix the Safari strip with new `dvh/lvh` formulas, overscan, gradients, pseudo-element feathers, scene replicas, or another fixed backplate. The physical review history already rejected those approaches.
- Do not solve transitions by cloning/capturing native document scenes.
- Do not change approved copy, camera composition, media timing, ink direction, or scene order.
- Do not make global z-index increments without semantic roles and an ownership test.
- Do not allow a missing adjacent boundary to make the router search for a later runnable boundary.
- Do not interpret module import success, `canplay`, or old Canvas pixels as current-run presentation readiness.
- Do not treat passing unit tests as physical Safari acceptance.

## 5. Canonical phone model

### 5.1 Cursor

Create a phone presentation cursor under `app/src/production/phone/`; do not add phone state to the shared product manifest:

```ts
export type PhoneTransitionPhase =
  | 'preparing'
  | 'entry'
  | 'awaiting-presented-frame'
  | 'media'
  | 'exit'
  | 'committing'
  | 'rolling-back';

export type PhoneStoryCursor =
  | Readonly<{
      kind: 'hold';
      scene: SceneId;
      revision: number;
    }>
  | Readonly<{
      kind: 'transition';
      sessionId: string;
      generation: number;
      run: PhoneRunId;
      legIndex: number;
      runSource: SceneId;
      runTarget: SceneId;
      segment: SegmentId;
      from: SceneId;
      to: SceneId;
      direction: 1 | -1;
      phase: PhoneTransitionPhase;
      progress: number;
    }>;
```

`progress` is always normalized to the canonical forward segment domain:
forward moves `0 → 1`, reverse moves `1 → 0`. An adapter may map that value
once into an authored timeline range; callers may not pre-map or direction-flip
it. `runSource` and `runTarget` remain the stable composite endpoints while
`from`, `to`, `segment`, and `legIndex` advance through individual legs.

`retryable` is not a cursor phase. It is a run result/diagnostic published after
the controller has transactionally restored `hold(runSource)` for forward
failure or `hold(runTarget)` for reverse failure.

### 5.2 Composite phone runs

One phone input can own more than one canonical segment without releasing the session between them:

| Phone run | Forward legs | Stable source → stable target |
| --- | --- | --- |
| AOD → Method | `aod-method-top` media/handoff | AOD → Method |
| Method → Figure2 | `method-bottom-figure2` timed ink | Method → Figure2 |
| Figure2 → Proof | `figure2-distance-expand` timed z-depth ink | Figure2 → Proof |
| Proof → Brand | `figure2-proof-brand` timed ink | Proof → Brand |
| Brand → Services | `brand-figure3` timed ink, then `figure3-services` media/dissolve | Brand → Services |
| Services → Lab | `services-ttg` timed ink, then `ttg-lab` media/dissolve | Services → Lab |
| Lab → Education | `lab-ph` timed ink, then `ph-education` media/dissolve | Lab → Education |
| Education → Contact | `education-crane` timed ink, then `crane-contact` media/dissolve | Education → Contact |

Reverse executes the same leg list in reverse order under the same session ID. Intermediate cinematic scenes are presented by the transition cursor; they are not independent native-scroll state machines.

### 5.3 State transition rules

```text
hold(source)
  → transition(first leg, preparing)
  → transition(entry leg, entry)
  → transition(media leg, awaiting-presented-frame)
  → transition(media leg, media)
  → transition(exit leg, exit)
  → transition(last leg, committing)
  → hold(target)

Any pre-commit failure follows:

```text
transition(active leg)
  → transition(active leg, rolling-back)
  → render exact composite source endpoint
  → restore source roles/edge/checkpoint/anchor
  → hold(composite source) + diagnostic(retryable)
```
```

Rules:

- only an event carrying the active `sessionId` and `generation` may mutate the cursor;
- a stale ready/media/complete callback is ignored;
- a transition cannot begin unless its source hold matches the run direction;
- failure before commit returns to the exact composite source hold for that
  direction, never merely to the active leg's intermediate cinematic scene;
- rollback renders every already-entered leg back to its source endpoint and
  restores media, geometry, layer, edge, checkpoint, and anchor before unlock;
- commit publishes endpoint visibility, layer roles, edge scene, navigation scene, and checkpoint as one transaction;
- geometry release and input unlock occur only after that transaction is visible;
- no local ref or scroll position may mark a different boundary complete.

### 5.4 One input path

`phone-transition-coordinator.ts` becomes an input adapter only:

```ts
export type PhoneIntent = Readonly<{
  gestureId: number;
  inputEpoch: number;
  direction: 1 | -1;
  source: 'touch' | 'wheel' | 'momentum' | 'programmatic';
  startY: number;
  projectedY: number;
  occurredAt: number;
}>;
```

One physical touch sequence, wheel burst, or promoted Safari momentum stream
has one `gestureId`. The orchestrator consumes at most one run per gesture.
After commit or rollback it discards every intent from the completed
`inputEpoch`; a new run requires touch release plus a new touchstart, or a
wheel/momentum quiet period followed by a fresh outward delta. This prevents
one reverse momentum tail from successively claiming Services → Brand and then
Brand → Proof.

It captures touch/wheel/momentum overshoot and calls `onIntent(intent)`. It does not:

- store a boundary array;
- call `canStart()` on every mounted component;
- choose the nearest available ref;
- set a final landing supplied by a child component.

The orchestrator looks up exactly one legal run from the current cursor and direction, then asks that run's registered geometry whether the intent crossed its edge.

## 6. Scroll-anchor contract

One session stores:

```ts
type PhoneScrollAnchor = Readonly<{
  triggerY: number;
  lockedY: number;
  completion: 'preserve' | 'source-edge' | 'target-edge';
}>;
```

Policies:

| Run family | Forward lock | Reverse lock | Completion |
| --- | --- | --- | --- |
| AOD | accepted AOD semantic edge | accepted AOD reverse edge | existing accepted AOD landing |
| Grade A single ink | authored boundary geometry | authored reverse boundary geometry | explicit source/target edge |
| Figure3/TTG/PH/Crane composite | exact boundary | `min(currentScrollY, boundaryY)` | preserve current presented position |

The composite policy restores the accepted Unit 5/6 behavior. No component may call:

- `session.moveTo(trackTop)`;
- `session.complete(trackTop - innerHeight)`;
- `window.scrollTo()` during an active transition.

The only exception is a controller-owned corrective write that restores the active session's `lockedY`.

## 7. Dependency-closure and readiness contract

### 7.1 Static closures

Define these closures once in `phone-story-runs.ts`:

| Run | Required scene adapters | Required transition adapters |
| --- | --- | --- |
| Method → Figure2 | Figure2 | Method→Figure2 |
| Figure2 → Proof | Figure2, Proof | Figure2→Proof |
| Proof → Brand | Proof, Brand | Proof→Brand |
| Brand → Services | Brand, Figure3, Services | Brand→Figure3, Figure3→Services |
| Services → Lab | Services, TTG, Lab | Services→TTG, TTG→Lab |
| Lab → Education | PH, Education plus shared Lab boundary | Lab→PH, PH→Education |
| Education → Contact | Education, Crane, Contact | Education→Crane, Crane→Contact |

The closure is the run contract. Group-local focus plans may request it, but may not redefine it. This removes the current contradiction where `focus='lab'` loads PH/Lab→PH while runtime readiness also requires Education/PH→Education.

### 7.2 Two readiness levels

1. **Dependency ready:** every required module is loaded, mounted, registered, and reports its static endpoint.
2. **Presentation topology ready:** the real target root, video, compositor,
   and Canvas are mounted and registered for the active run. Forward
   preparation must not play hidden media merely to manufacture readiness.
   Reverse endpoint preparation may still wait for the existing timeline seek
   to present the authored terminal frame.

Approach prewarm starts before the edge. If a gesture crosses before dependency readiness:

- retain only that adjacent intent;
- lock at the source edge;
- keep the source fully visible;
- wait no longer than the maximum relevant manifest build/media preparation timeout;
- start the transition if readiness closes;
- otherwise abort to source, publish `retryable`, unlock, and allow a later gesture to retry.

There is no infinite requestAnimationFrame poll.

Mounted capability registration is lease-based. A registration receives an
owner token; stale cleanup may unregister only its own token. React Strict Mode
mount → cleanup → remount and late lazy cleanup cannot remove the current
capability. Once a run begins preparing, its complete dependency closure is
pinned until commit or rollback finishes, so a focus change cannot unmount an
adapter mid-run.

## 8. Endpoint, layer, and edge transaction

### 8.1 Semantic layer roles

Replace group-specific specificity rules with controller-owned roles:

```text
z=8   persistent Safari edge fallback
z=9   native-under-stage source
z=10  persistent fixed cinematic stage
z=11  native stable reading owner
z=12  active native transition endpoint
```

Ink/depth canvases retain their authored local bands inside the fixed stage; they do not redefine the global document/stage order.

Roots receive:

```html
data-phone-surface-role="native-under-stage|native-stable|transition-endpoint"
data-phone-boundary-session="phone-session-N"
data-phone-boundary-endpoint="source|receiver"
```

Required examples:

- Proof → Brand: Brand is `transition-endpoint` before progress leaves zero.
- Brand → Figure3: Brand stays `transition-endpoint` until the endpoint commit hides it.
- Figure3 → Services: Services is `transition-endpoint` during the exit dissolve.
- Crane reverse: the real Education tail is aligned and becomes the reverse receiver at z=12.

### 8.2 Run-scoped geometry lease

Replace `releaseBoundaryGeometryAtEndpoints` with an explicit lease:

```ts
export type PhoneBoundaryGeometryLease = Readonly<{
  sessionId: string;
  generation: number;
  release(): void;
}>;
```

`phone-boundary-geometry.ts` owns a `WeakMap<HTMLElement, Owner>`. A transition may clear clip/mask/alignment styles only when its lease is still the current owner. Disposing an old Brand→Figure3 adapter cannot clear styles claimed by Figure3→Services.

Commit order:

1. render exact endpoint;
2. set source hidden/inert and receiver visible with final role;
3. publish cursor hold, edge, checkpoint, and navigation;
4. on the next animation frame, release clip/mask/alignment through the lease;
5. unlock input.

This closes the Brand flash without keeping stale masks indefinitely.

### 8.3 Single edge publisher

`usePhoneEdgeSurface` remains mounted once in `PhoneStoryShell`, but only the orchestrator calls it. Remove edge publications from:

- `PhoneGradeAStory`;
- `PhoneBrandLabContinuation`;
- `PhoneLabContactContinuation`;
- direct-entry child components.

The orchestrator derives edge scene from the cursor and active segment progress. No new Safari geometry workaround is part of this change.

## 9. Long-document endpoint alignment

Use the real native document root; do not clone Education or Lab.

Add an alignment helper with run-scoped restoration:

```ts
export type PhoneEndpointAlignment = 'viewport-start' | 'viewport-end';
```

- `viewport-start`: align root top to fixed host top.
- `viewport-end`: align root bottom to fixed host bottom.

Use `viewport-end` for the last readable screen of Lab and Education when they are reverse ink receivers. The helper stores previous inline transform variables and restores them only through the active geometry lease.

This makes Education copy physically present inside the Crane → Education reverse ink instead of remaining two screens above the locked viewport.

## 10. Packed-alpha preparation and frozen-master evidence

### 10.1 Separate static preparation from playback

For a forward PH/Crane entry:

- resolve `prepareTargetPresentation()` after the real packed-alpha topology is
  mounted and registered;
- do not call `video.play()` and then `pause()` during preparation;
- start native playback only after the entry ink completes and the user-owned transition session still matches.
- do not create or install derived frame-zero opening assets.

The current Crane flock masters are frozen for this work:

- `crane-flock-motion-rgb-alpha.mp4`:
  `6c82ceeb31ce814e137c880ae41650e5d24df26a202a4af8a3d8a9d60dbeff00`;
- `crane-flock-motion-hevc-alpha.mp4`:
  `cb225ebced83d05b7b412fd59026f3839273019b340d922f302d3491d67acd4e`;
- `crane-flock-motion.webm`:
  `708f45223f0cea5af23449d947050a86e5ec1ac959385561fa663ff44da5c37a`.

For reverse:

- prepare the terminal Canvas frame through the existing timeline/seek path;
- require both existing Crane Canvas surfaces to present the terminal endpoint
  before reverse playback begins.

### 10.2 Read-only master and first-frame qualification

Add a read-only verifier for the existing PH figure, Crane figure, and current
Crane flock packed RGB/alpha masters. For each source it must verify:

- frozen file byte count and SHA-256 from the production inventory;
- the SHA-256 of the first composed RGBA frame decoded directly from the
  side-by-side RGB/alpha master;
- expected composed dimensions and raw byte count.

The verifier must stream decoded pixels through memory only. It may not write
or regenerate any media asset.

## 11. Implementation tasks

### Task 1: Record the baseline and freeze donor expectations

**Read-only sources:**

- `app/src/production/phone/PhoneUnit7BIntegration.test.ts`
- `app/src/production/phone/PhoneGradeAStory.test.ts`
- `app/src/production/phone/PhoneBrandLabContinuation.test.ts`
- `app/src/production/phone/PhoneLabContactContinuation.test.ts`
- `app/src/production/phone/phone-lab-contact-timeline.test.ts`
- `app/src/production/phone/scenes/phone-packed-alpha-surface.test.ts`
- accepted Unit 4/5/6 snapshots at `3deb717`, `35b0aee`, and `ab7353e`

- [ ] Run the current focused suite and record its exact count/output in the implementation log.
- [x] Baseline recorded at `e883784`: 6 files / 46 tests pass, proving the
  reported physical failures are not represented by the existing suite.
- [ ] Record the accepted donor invariants that must not change:
  - Figure2 scroll reaches authored progress `0.72` before the timed z-depth leg;
  - Unit 5/6 reverse lock uses `min(currentScrollY, boundaryY)`;
  - composite visual completion does not force a new document landing;
  - AOD retains its accepted single-source forward/reverse contract.
  - Unit 7A Figure3 keeps its canonical initial/terminal paper plates and
    presented-frame handoff.
  - TTG keeps terminal/source frame retention without a completion-time re-seek.
  - the three current Crane flock master hashes listed in §10.1 remain exact.
- [ ] Before changing edge ownership, record a cold physical-iPhone sample of
  the element visually owning the bottom pixel row, `innerHeight`,
  `visualViewport.height/offsetTop`, stage-canvas height, and active endpoint
  roles. If no physical device is available during implementation, keep this
  item open and do not claim the strip physically accepted.
- [ ] Confirm the current suite passes despite the reported defects; this is the coverage gap baseline.
- [ ] For every later task, add or enable the smallest failing assertion first, run it to observe the expected failure, implement only that owning contract, then rerun it green before committing.

Run:

```bash
pnpm -C app test -- \
  src/production/phone/PhoneUnit7BIntegration.test.ts \
  src/production/phone/PhoneGradeAStory.test.ts \
  src/production/phone/PhoneBrandLabContinuation.test.ts \
  src/production/phone/PhoneLabContactContinuation.test.ts \
  src/production/phone/phone-lab-contact-timeline.test.ts \
  src/production/phone/scenes/phone-packed-alpha-surface.test.ts
```

Expected: the existing suite passes. This task is read-only and creates no commit.

### Task 2: Add the pure canonical phone state and run graph

**Files:**

- Create: `app/src/production/phone/phone-story-state.ts`
- Create: `app/src/production/phone/phone-story-state.test.ts`
- Create: `app/src/production/phone/phone-story-runs.ts`
- Create: `app/src/production/phone/phone-story-runs.test.ts`
- Modify: `app/src/production/phone/types.ts`

- [ ] Define `PhoneStoryCursor`, `PhoneTransitionPhase`, session events, stale-generation rejection, and failure rollback.
- [ ] Store `run`, `legIndex`, `runSource`, and `runTarget` in every transition
  cursor; a composite second-leg failure must roll back to the composite source.
- [ ] Prove canonical segment progress is forward `0 → 1` and reverse `1 → 0`
  for every timed/media adapter.
- [ ] Define composite runs only by canonical `SceneId`/`SegmentId`; do not duplicate canonical scene order.
- [ ] Add a lookup from `hold + direction` to exactly one run.
- [ ] Add direct-entry plans for stable readings and cinematic scene starts.
- [ ] Define dependency closures and anchor policies beside each run.
- [ ] Prove every run leg is a real adjacent canonical segment.
- [ ] Prove the reverse leg order is the exact forward order reversed.
- [ ] Prove no stable hold has two forward or two reverse run owners.

Run:

```bash
pnpm -C app test -- \
  src/production/phone/phone-story-state.test.ts \
  src/production/phone/phone-story-runs.test.ts
```

Expected: pass.

Commit:

```bash
git add app/src/production/phone/phone-story-state.ts \
  app/src/production/phone/phone-story-state.test.ts \
  app/src/production/phone/phone-story-runs.ts \
  app/src/production/phone/phone-story-runs.test.ts \
  app/src/production/phone/types.ts
git commit -m "feat(r5): define canonical phone story runs"
```

### Task 3: Replace boundary scanning with one intent router and session owner

**Files:**

- Rewrite: `app/src/production/phone/phone-transition-coordinator.ts`
- Rewrite: `app/src/production/phone/phone-transition-coordinator.test.ts`
- Create: `app/src/production/phone/phone-story-orchestrator.ts`
- Create: `app/src/production/phone/phone-story-orchestrator.test.ts`
- Create: `app/src/production/phone/PhoneStoryOrchestratorContext.tsx`
- Modify: `app/src/production/phone/PhoneStoryShell.tsx`
- Modify: `app/src/production/phone/PhoneTransitionCoordinator.css`

- [ ] Make the coordinator emit `PhoneIntent` only.
- [ ] Remove the `boundaries[]` scan and the “skip unavailable, claim next runnable edge” behavior/test.
- [ ] Implement one orchestrator at shell scope with:
  - cursor reducer;
  - active session/generation;
  - one input lock;
  - one corrective scroll anchor;
  - scene/transition capability registries;
  - one pending adjacent intent.
- [ ] Allocate one `gestureId` per touch sequence/wheel burst and one
  `inputEpoch` per accepted run.
- [ ] Consume at most one run per gesture; discard stale momentum/touch intents
  after commit/rollback and require a fresh rearm before another boundary.
- [ ] Reject duplicate owners when two components register the same canonical boundary.
- [ ] Expose a stable context API; do not drive React rendering at 60fps through context values.
- [ ] Publish diagnostic root attributes from the orchestrator:
  - `data-phone-cursor`;
  - `data-phone-session`;
  - `data-phone-segment`;
  - `data-phone-transition-phase`;
  - `data-phone-anchor-y`.
- [ ] Preserve interactive controls and Contact CTA exclusions.

Run:

```bash
pnpm -C app test -- \
  src/production/phone/phone-transition-coordinator.test.ts \
  src/production/phone/phone-story-orchestrator.test.ts
```

Expected: pass; no test may expect a later boundary to run while the adjacent boundary is unavailable.

Commit:

```bash
git add app/src/production/phone/phone-transition-coordinator.ts \
  app/src/production/phone/phone-transition-coordinator.test.ts \
  app/src/production/phone/phone-story-orchestrator.ts \
  app/src/production/phone/phone-story-orchestrator.test.ts \
  app/src/production/phone/PhoneStoryOrchestratorContext.tsx \
  app/src/production/phone/PhoneStoryShell.tsx \
  app/src/production/phone/PhoneTransitionCoordinator.css
git commit -m "refactor(r5): centralize phone transition sessions"
```

### Task 4: Centralize dependency closure, mounting readiness, and timeout rollback

**Files:**

- Create: `app/src/production/phone/phone-transition-readiness.ts`
- Create: `app/src/production/phone/phone-transition-readiness.test.ts`
- Modify: `app/src/production/phone/module-loaders.ts`
- Modify: `app/src/production/phone/module-loaders.test.ts`
- Modify: `app/src/production/phone/usePhoneGradeAAdapters.ts`
- Modify: `app/src/production/phone/usePhoneGroup45Adapters.ts`
- Modify: `app/src/production/phone/usePhoneGroup45Adapters.test.ts`
- Modify: `app/src/production/phone/usePhoneGroup67Adapters.ts`
- Modify: `app/src/production/phone/usePhoneGroup67Adapters.test.ts`
- Delete after migration: `app/src/production/phone/phone-target-presentation.ts`
- Delete after migration: `app/src/production/phone/phone-target-presentation.test.ts`

- [ ] Add `loadPhoneRunDependencyClosure(runId)` that resolves all scene and transition module IDs in parallel through the existing shared cache.
- [ ] Use the run definition as the only dependency list.
- [ ] Wait separately for module resolution and registered mounted handles.
- [ ] Register mounted handles through owner-token leases so Strict Mode cleanup
  and stale lazy cleanup cannot unregister the latest handle.
- [ ] Pin the complete run closure from preparation through commit/rollback.
- [ ] Use `AbortSignal` plus a real timer; cover both:
  - readiness never becomes true;
  - target preparation starts and rejects/stalls.
- [ ] On timeout, keep/restore the source endpoint and return a typed retryable result.
- [ ] Enter `rolling-back`, render every entered leg to the composite source,
  restore source roles/edge/checkpoint/anchor, then publish `hold(source)`;
  only after that may the retryable diagnostic and input unlock be published.
- [ ] Update Group 6–7 Lab focus so the Lab→Education closure includes PH, Education, Lab→PH, and PH→Education before execution.
- [ ] Update Group 4–5 to prewarm a complete Brand→Services or Services→Lab run, not a partial entry ref.
- [ ] Remove all unbounded per-frame readiness polling.

Run:

```bash
pnpm -C app test -- \
  src/production/phone/phone-transition-readiness.test.ts \
  src/production/phone/module-loaders.test.ts \
  src/production/phone/usePhoneGroup45Adapters.test.ts \
  src/production/phone/usePhoneGroup67Adapters.test.ts
```

Expected: pass, including deterministic timeout with fake timers.

Commit:

```bash
git add app/src/production/phone
git commit -m "fix(r5): close phone run dependencies before handoff"
```

### Task 5: Add atomic endpoint geometry leases and semantic layer roles

**Files:**

- Create: `app/src/production/phone/phone-boundary-geometry.ts`
- Create: `app/src/production/phone/phone-boundary-geometry.test.ts`
- Create: `app/src/production/phone/phone-surface-roles.ts`
- Create: `app/src/production/phone/phone-surface-roles.test.ts`
- Modify: `app/src/production/phone/phone-ink.ts`
- Modify: `app/src/production/phone/transitions/PhoneInkTransition.tsx`
- Modify: `app/src/production/phone/PhoneStageRail.css`
- Modify: `app/src/production/phone/PhoneBrandLabStory.css`
- Modify: `app/src/production/phone/PhoneLabContactContinuation.css`
- Modify: `app/src/production/phone/PhoneGradeAStory.css`
- Modify: `app/src/transitions/brand-figure3/phone.ts`
- Modify: `app/src/transitions/brand-figure3/phone.test.ts`
- Modify: `app/src/production/phone/transitions/figure2-proof-brand.ts`
- Modify: `app/src/production/phone/transitions/grade-a-transitions.test.ts`

- [ ] Implement a `WeakMap`-backed geometry owner keyed by session and generation.
- [ ] Remove `releaseBoundaryGeometryAtEndpoints` from the phone ink API and all callers.
- [ ] Give phone transition handles explicit `begin`, `commitEndpoint`, and `releaseEndpoint` operations.
- [ ] Ensure `dispose()` can release only its own lease.
- [ ] Commit source/receiver visibility before releasing clip/mask geometry.
- [ ] Replace Grade A/Group 4–5/Group 6–7 z-index exceptions with controller-authored data roles.
- [ ] Delete the rule that forces Brand/Services/Lab to z=0 merely because Grade A is active.
- [ ] Keep the accepted persistent edge fallback at z=8 and fixed stage at z=10.
- [ ] Ensure every active native transition endpoint is z=12.
- [ ] Keep lazy stage placeholders transparent and ineligible as receivers; native document placeholders use the controller's current edge surface and stable geometry.

Run:

```bash
pnpm -C app test -- \
  src/production/phone/phone-boundary-geometry.test.ts \
  src/production/phone/phone-surface-roles.test.ts \
  src/production/phone/phone-layer-contract.test.ts \
  src/production/phone/transitions/grade-a-transitions.test.ts \
  src/transitions/brand-figure3/phone.test.ts
```

Expected: pass; the Brand source cannot flash after endpoint release, and Brand is visible inside Proof→Brand.

Commit:

```bash
git add app/src/production/phone app/src/transitions/brand-figure3
git commit -m "fix(r5): commit phone endpoints before geometry release"
```

### Task 6: Migrate Grade A to the canonical orchestrator

**Files:**

- Create: `app/src/production/phone/phone-grade-a-runtime.ts`
- Create: `app/src/production/phone/phone-grade-a-runtime.test.ts`
- Modify: `app/src/production/phone/PhoneGradeAStory.tsx`
- Modify: `app/src/production/phone/PhoneGradeAStory.test.ts`
- Modify: `app/src/production/phone/transitions/figure2-distance-expand.tsx`
- Modify: `app/src/production/phone/transitions/grade-a-transitions.test.ts`
- Modify: `app/src/production/phone/scenes/PhoneFigure2.tsx`
- Modify: `app/src/production/phone/scenes/PhoneFigure2Proof.tsx`
- Modify: `app/src/production/phone/scenes/PhoneMethodTop.tsx`
- Modify: `app/src/production/phone/types.ts`

- [ ] Remove `completedInk`, `inkRun`, autonomous replay, boundary reconciliation, and local registrations from `PhoneGradeAStory`.
- [ ] Retain only:
  - document tracks;
  - scene/transition refs;
  - adapter mount readiness;
  - authored Figure2 scroll sampling before the timed boundary;
  - registration of geometry/render capabilities.
- [ ] Make Figure2→Proof adapter `render(progress)` accept normalized segment progress and map internally:

```ts
const timelineProgress =
  FIGURE2_INTRO_END + (1 - FIGURE2_INTRO_END) * clamp(progress);
```

- [ ] Make `enter()`/`reverse()` set direction or prepare state only; they may not render zero.
- [ ] Preserve the foreground arch as an independent retained layer.
- [ ] During Figure2→Proof, apply z-depth to Figure2 person/middle/far/background and leave the arch outside it; Proof copy is the real receiver throughout the transition.
- [ ] Register Proof→Brand with the real Brand root as receiver before the run becomes executable.
- [ ] Acquire and hold Brand receiver alignment through the same geometry lease;
  assert its bounding rect occupies the fixed transition plane before progress
  leaves zero and remains aligned until the Brand hold commits.
- [ ] Remove Grade A calls to checkpoint, scene, and edge publishers; the orchestrator owns them.

Run:

```bash
pnpm -C app test -- \
  src/production/phone/phone-grade-a-runtime.test.ts \
  src/production/phone/PhoneGradeAStory.test.ts \
  src/production/phone/transitions/grade-a-transitions.test.ts \
  src/production/phone/scenes/PhoneFigure2.test.tsx \
  src/production/phone/scenes/PhoneFigure2Proof.test.tsx \
  src/transitions/figure2-proof-chain.test.ts
```

Expected:

- no sample below `FIGURE2_INTRO_END` during Figure2→Proof;
- Proof appears during the z-depth ink;
- Brand appears during Proof→Brand;
- no Grade A-local durable phase remains.

Commit:

```bash
git add app/src/production/phone
git commit -m "refactor(r5): move Grade A into canonical phone runs"
```

### Task 7: Migrate Brand → Services → Lab and restore accepted reverse anchors

**Files:**

- Create: `app/src/production/phone/phone-brand-lab-runtime.ts`
- Create: `app/src/production/phone/phone-brand-lab-runtime.test.ts`
- Modify: `app/src/production/phone/PhoneBrandLabContinuation.tsx`
- Modify: `app/src/production/phone/PhoneBrandLabContinuation.test.ts`
- Modify: `app/src/production/phone/PhoneBrandLabStory.visual-contract.test.ts`
- Modify: `app/src/production/phone/phone-lab-contact-timeline.ts`
- Modify: `app/src/production/phone/phone-lab-contact-timeline.test.ts`
- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.tsx`
- Modify: `app/src/scenes/ttg-animation/phone/PhoneTtg.tsx`
- Modify: `app/src/transitions/figure3-services/phone.ts`
- Modify: `app/src/transitions/services-ttg/phone.ts`
- Modify: `app/src/transitions/ttg-lab/phone.ts`

- [ ] Remove `visualRunPhaseRef`, `visualRunRef`, local session, local timeouts, local landing calculations, and local boundary registrations.
- [ ] Register:
  - Brand→Figure3 timed ink capability;
  - Figure3 playback capability and Figure3→Services progress sink;
  - Services→TTG timed ink capability;
  - TTG playback capability and TTG→Lab progress sink.
- [ ] Keep one controller session across each two-leg composite run.
- [ ] Use `min(currentScrollY, boundaryY)` for reverse lock.
- [ ] Preserve scroll position on composite completion; do not use `trackTop - innerHeight`.
- [ ] Keep accepted endpoint-retention/media-slot rules as rendering policy, not navigation phase.
- [ ] Ensure the completed Brand→Figure3 endpoint hides Brand before its geometry lease releases.
- [ ] Remove local checkpoint/scene/edge publications.

Run:

```bash
pnpm -C app test -- \
  src/production/phone/phone-brand-lab-runtime.test.ts \
  src/production/phone/PhoneBrandLabContinuation.test.ts \
  src/production/phone/PhoneBrandLabStory.visual-contract.test.ts \
  src/production/phone/phone-lab-contact-timeline.test.ts \
  src/transitions/brand-figure3/phone.test.ts \
  src/transitions/figure3-services/phone.test.ts \
  src/transitions/services-ttg/phone.test.ts \
  src/transitions/ttg-lab/phone.test.ts
```

Expected:

- Brand→Figure3 cannot be skipped or visually stall behind unresolved readiness;
- reverse Services→Brand never visits Proof;
- reverse Lab→Services preserves the already-presented anchor;
- TTG cannot flash its terminal/source frame after completion.

Commit:

```bash
git add app/src/production/phone \
  app/src/scenes/figure3-animation/phone \
  app/src/scenes/ttg-animation/phone \
  app/src/transitions/brand-figure3 \
  app/src/transitions/figure3-services \
  app/src/transitions/services-ttg \
  app/src/transitions/ttg-lab
git commit -m "refactor(r5): unify Brand through Lab phone ownership"
```

### Task 8: Migrate Lab → Education → Contact and align reverse document tails

**Files:**

- Create: `app/src/production/phone/phone-document-endpoint-alignment.ts`
- Create: `app/src/production/phone/phone-document-endpoint-alignment.test.ts`
- Create: `app/src/production/phone/phone-lab-contact-runtime.ts`
- Create: `app/src/production/phone/phone-lab-contact-runtime.test.ts`
- Modify: `app/src/production/phone/PhoneLabContactContinuation.tsx`
- Modify: `app/src/production/phone/PhoneLabContactContinuation.test.ts`
- Modify: `app/src/production/phone/PhoneLabContactContinuation.css`
- Modify: `app/src/production/phone/PhoneGroup67DirectEntry.tsx`
- Modify: `app/src/production/phone/phone-entry-plan.ts`
- Modify: `app/src/production/phone/phone-entry-plan.test.ts`
- Modify: `app/src/transitions/lab-ph/phone.ts`
- Modify: `app/src/transitions/ph-education/phone.ts`
- Modify: `app/src/transitions/education-crane/phone.ts`
- Modify: `app/src/transitions/crane-contact/phone.ts`

- [ ] Remove `phasesRef`, `runRef`, local session, local landing calculation, and local boundary registrations.
- [ ] Use the complete Lab→Education and Education→Contact closures before execution.
- [ ] Register PH/Crane media events against the active orchestrator session/generation.
- [ ] Preserve accepted reverse anchor overshoot and completion position.
- [ ] Align the real Lab/Education document tail to the fixed viewport during reverse ink.
- [ ] Keep Education visible and z=12 throughout Crane→Education reverse ink.
- [ ] Release alignment only after the controller commits the Education hold.
- [ ] Generalize direct entry so the shell initializes the canonical cursor; child components no longer publish independent state.
- [ ] Remove local checkpoint/scene/edge publications.

Run:

```bash
pnpm -C app test -- \
  src/production/phone/phone-document-endpoint-alignment.test.ts \
  src/production/phone/phone-lab-contact-runtime.test.ts \
  src/production/phone/PhoneLabContactContinuation.test.ts \
  src/production/phone/phone-entry-plan.test.ts \
  src/transitions/lab-ph/phone.test.ts \
  src/transitions/ph-education/phone.test.ts \
  src/transitions/education-crane/phone.test.ts \
  src/transitions/crane-contact/phone.test.ts
```

Expected:

- Lab→PH and PH→Education cannot remain in permanent readiness wait;
- PH reverse returns to Lab without an offscreen target;
- Crane reverse visibly contains Education copy;
- no Group 6–7-local durable phase remains.

Commit:

```bash
git add app/src/production/phone \
  app/src/transitions/lab-ph \
  app/src/transitions/ph-education \
  app/src/transitions/education-crane \
  app/src/transitions/crane-contact
git commit -m "refactor(r5): unify Lab through Contact phone ownership"
```

### Task 9: Bind packed-alpha presentation evidence to the active run

**Files:**

- Create: `app/scripts/verify-phone-packed-alpha-masters.mjs`
- Modify: `app/package.json`
- Modify: `app/src/production/phone/scenes/phone-packed-alpha-surface.ts`
- Modify: `app/src/production/phone/scenes/phone-packed-alpha-surface.test.ts`
- Modify: `app/src/production/phone/phone-native-autoplay.ts`
- Modify: `app/src/production/phone/phone-native-autoplay.test.ts`
- Modify: `app/src/scenes/ph-animation/phone/PhonePh.tsx`
- Modify: `app/src/scenes/crane-animation/phone/PhoneCrane.tsx`
- Modify: `app/src/scenes/crane-animation/phone/PhoneCrane.autoplay.ts`
- Modify: `app/src/transitions/group6-transitions.test.ts`
- Modify: `app/src/transitions/group7-transitions.test.ts`
- Modify: `app/e2e/r5-crane-media.spec.ts`

- [ ] Remove preparation-time `video.play()`/`pause()` priming.
- [ ] Make forward preparation prove real mounted topology without starting
  hidden playback.
- [ ] Assert the three current Crane flock master hashes remain unchanged.
- [ ] Verify the frozen PH/Crane packed master identities and decoded composed
  first-frame RGBA hashes without writing files.
- [ ] Begin PH/Crane native playback only after the entry handoff commits media
  ownership to the cinematic scene.
- [ ] On native playback failure, abort to the source hold; do not continue camera-only motion.
- [ ] Keep the existing reverse terminal-frame timeline preparation.

Run:

```bash
pnpm -C app test -- \
  src/production/phone/scenes/phone-packed-alpha-surface.test.ts \
  src/production/phone/phone-native-autoplay.test.ts \
  src/transitions/group6-transitions.test.ts \
  src/transitions/group7-transitions.test.ts
```

Expected: pass. Forward preparation performs no hidden play/pause, reverse
preparation retains the authored endpoint contract, and the frozen master plus
first-frame hashes match.

Commit:

```bash
git add app/scripts/verify-phone-packed-alpha-masters.mjs app/package.json \
  app/src/production/phone/scenes/phone-packed-alpha-surface.ts \
  app/src/production/phone/scenes/phone-packed-alpha-surface.test.ts \
  app/src/production/phone/phone-native-autoplay.ts \
  app/src/production/phone/phone-native-autoplay.test.ts \
  app/src/scenes/ph-animation/phone/PhonePh.tsx \
  app/src/scenes/crane-animation/phone \
  app/src/transitions/group6-transitions.test.ts \
  app/src/transitions/group7-transitions.test.ts \
  app/e2e/r5-crane-media.spec.ts
git commit -m "fix(r5): bind packed-alpha playback to phone handoff"
```

### Task 10: Move AOD time ownership into the same phone authority

**Files:**

- Modify: `app/src/production/phone/usePhoneStageRuntime.ts`
- Modify: `app/src/production/phone/phone-stage-timeline.ts`
- Modify: `app/src/production/phone/phone-stage-timeline.test.ts`
- Modify: `app/src/production/phone/phone-transition-stage.ts`
- Modify: `app/src/production/phone/aod-autoplay.ts`
- Modify: `app/src/production/phone/scenes/PhoneAod.tsx`
- Modify: `app/src/production/phone/PhoneStoryShell.tsx`

- [ ] Keep ScrollTrigger as the front-half progress sampler and renderer.
- [ ] Reconcile Hero/Pattern/Star scroll samples into the canonical cursor:
  - stable samples publish `hold(scene)`;
  - active Hero→Pattern, Pattern→Star, and Star→AOD ranges publish the matching canonical `transition(segment, progress)`;
  - the controller assigns a scroll-run session/generation so stale refresh callbacks cannot overwrite a later time-owned run.
- [ ] Remove the front runtime's direct checkpoint, navigation-scene, and edge-scene publications; the orchestrator derives all three from the reconciled cursor.
- [ ] Remove its durable `aodRunState`, local session, and boundary registration.
- [ ] Register AOD playback as an orchestrator scene capability.
- [ ] Convert scroll progress/crossing into an orchestrator intent/reconciliation event.
- [ ] Let the canonical cursor own AOD forward/complete/reverse state and the AOD→Method commit.
- [ ] Keep local visibility/progress memoization only as rendering cache.
- [ ] Preserve the accepted AOD single-source playback, alpha mapping, first-run ownership, and reverse timing.
- [ ] Verify the Method seam has no second transition owner.

Run:

```bash
pnpm -C app test -- \
  src/production/phone/phone-stage-timeline.test.ts \
  src/production/phone/aod-autoplay.test.ts \
  src/production/phone/phone-story-orchestrator.test.ts
```

Expected: pass; one canonical cursor now spans the complete phone story, while the desktop Director remains untouched.

Commit:

```bash
git add app/src/production/phone
git commit -m "refactor(r5): unify AOD with phone orchestration"
```

### Task 11: Remove duplicate state paths and enforce architecture

**Files:**

- Modify: `app/src/production/phone/PhoneUnit7BIntegration.test.ts`
- Modify: `app/scripts/verify-homepage-module-boundaries.mjs`
- Modify: `app/src/production/phone/phone-presentation-contract.test.ts`
- Modify: `app/src/production/phone/PhoneStoryShell.tsx`
- Delete obsolete duplicate Group 6–7 wrappers after loader cutover:
  - `app/src/production/phone/transitions/lab-ph.ts`
  - `app/src/production/phone/transitions/ph-education.ts`
  - `app/src/production/phone/transitions/education-crane.ts`
  - `app/src/production/phone/transitions/crane-contact.ts`
- Modify: `app/src/production/phone/module-loaders.ts`

- [ ] Point Group 6–7 loading to the single canonical phone adapters under `app/src/transitions/*/phone.ts`.
- [ ] Remove obsolete production wrapper implementations once parity tests pass.
- [ ] Add source/architecture checks that reject:
  - `completedInk`;
  - `visualRunPhaseRef`;
  - `phasesRef`;
  - child-owned `PhoneTransitionSession`;
  - child calls to `window.scrollTo()` in an active run;
  - child calls to checkpoint/scene/edge publishers;
  - `releaseBoundaryGeometryAtEndpoints`;
  - more than one `usePhoneEdgeSurface`;
  - more than one phone intent coordinator.
- [ ] Keep scene-specific markup and visual constants outside the shell/orchestrator.
- [ ] Keep the orchestrator below the architecture plan's 300-line target by separating pure state, run data, readiness, and DOM capability registration.

Run:

```bash
pnpm -C app test -- \
  src/production/phone/PhoneUnit7BIntegration.test.ts \
  src/production/phone/phone-presentation-contract.test.ts
pnpm -C app typecheck
pnpm -C app lint
node app/scripts/verify-homepage-module-boundaries.mjs
```

Expected: all pass and no deleted wrapper remains in the module graph.

Commit:

```bash
git add app/src/production/phone app/scripts/verify-homepage-module-boundaries.mjs
git commit -m "refactor(r5): remove split phone state ownership"
```

### Task 12: Full sequence, release, and physical-iPhone acceptance

**Files:**

- Create: `app/src/production/phone/phone-story-sequence.test.ts`
- Create: `app/src/production/phone/phone-layer-contract.test.ts`
- Modify: `app/e2e/r5-phone-story.spec.ts`
- Modify: `app/e2e/r5-crane-media.spec.ts`
- Modify: `app/scripts/capture-r5-visual-evidence.mjs` only if the existing capture cannot record the new diagnostic fields
- Create: `docs/react-refactor/evidence/r5-phone-orchestration-acceptance.md`

- [ ] Add one critical browser sequence that executes the full forward path and full reverse path twice in the same page lifetime.
- [ ] Assert cursor adjacency, session generation, lock release, stable final scroll anchor, and absence of retryable/error state after each leg.
- [ ] Exercise a delayed dependency and prove source rollback rather than boundary skipping.
- [ ] Exercise direct entry for Brand, Figure3, Services, TTG, Lab, PH,
  Education, Crane, and Contact.
- [ ] Exercise React Strict Mode register → cleanup → remount and prove stale
  cleanup cannot remove the current capability.
- [ ] Exercise a single fast reverse momentum burst and prove it can commit only
  one adjacent run before a fresh input rearm.
- [ ] Run focused tests first:

```bash
pnpm -C app test -- \
  src/production/phone/phone-story-state.test.ts \
  src/production/phone/phone-story-runs.test.ts \
  src/production/phone/phone-story-orchestrator.test.ts \
  src/production/phone/phone-story-sequence.test.ts \
  src/production/phone/phone-layer-contract.test.ts \
  src/production/phone/PhoneUnit7BIntegration.test.ts
```

- [ ] Run all static gates:

```bash
pnpm -C app typecheck
pnpm -C app lint
pnpm -C app test
pnpm -w run build
```

Run the unchanged build/performance budget after Tasks 3, 6, 7, 8, 9, and 10,
not only here. The current frozen baseline is phone/total JS `659,404 /
663,552` bytes with `4,148` bytes headroom; no task may raise a budget to pass.

- [ ] Run only the critical phone browser projects required to validate the full state trace:

```bash
pnpm -C app exec playwright test \
  e2e/r5-phone-story.spec.ts \
  e2e/r5-crane-media.spec.ts \
  --config playwright.release.config.ts
```

Browser automation is a state/DOM/media contract gate, not evidence that physical Safari edge sampling is fixed.

- [ ] Perform physical iPhone review from a genuinely cold tab with the address bar expanded.
- [ ] Record:
  - iPhone/iOS/Safari version;
  - viewport and visualViewport metrics;
  - commit SHA and short validation route;
  - cursor/session/phase trace;
  - first PH/Crane video and Canvas generation/timestamps.
- [ ] Verify slow and fast forward gestures at all eight phone runs.
- [ ] Verify full reverse Contact→Method without reloading.
- [ ] Repeat forward/reverse twice to catch stale generation and endpoint release.
- [ ] Background/foreground during TTG and Crane, then resume.
- [ ] Collapse/expand Safari toolbar through Pattern, AOD, Figure2, Brand, PH, and Crane.
- [ ] Confirm all nine original reports are closed:
  1. no exposed white/paper strip caused by a lower receiver or empty placeholder;
  2. Figure2→Proof z-depth is continuous;
  3. Proof participates in Figure2→Proof;
  4. Brand participates in Proof→Brand;
  5. Brand does not flash after Brand→Figure3;
  6. reverse does not jump to Proof or corrupt later runs;
  7. Crane first run shows current-run flock/figure frames, not camera-only motion;
  8. Crane reverse visibly reveals Education;
  9. Lab→PH, PH→Education, and Brand→Figure3 trigger reliably or roll back visibly with retry.

Do not declare completion until physical acceptance is recorded.

Commit after acceptance:

```bash
git add app/e2e docs/react-refactor/evidence/r5-phone-orchestration-acceptance.md
git commit -m "test(r5): accept canonical phone orchestration"
```

## 12. Test matrix required before completion

| Layer | Required proof |
| --- | --- |
| Pure state | adjacency, forward/reverse leg order, stale event rejection, failure rollback |
| Intent | touch, wheel, Safari momentum overshoot, interactive target exclusion |
| Readiness | module delay, mounted-handle delay, never-ready timeout, preparation reject, abort |
| Anchor | exact Grade A edges, preserved Unit 5/6 reverse overshoot, no child landing writes |
| Geometry | run lease, stale release rejection, atomic endpoint visibility |
| Layering | every active receiver above z=8 fallback; no Grade A-specific Brand suppression |
| Figure2 | normalized 0→1 maps monotonically to authored 0.72→1; Proof is live receiver |
| Media | no hidden forward priming, frozen master/first-frame hashes, PH/Crane forward, reverse prepared frame, stall rollback |
| Sequence | two full forward/reverse loops without reload |
| Direct entry | stable and cinematic entries initialize one cursor and one dependency closure |
| Reduced motion | same legal cursor order and endpoint commits without media |
| Physical Safari | cold/warm, toolbar, backgrounding, slow/fast gesture, visual correctness |

## 13. Issue-to-task traceability

| Issue | Primary tasks |
| --- | --- |
| Bottom exposure | 4, 5, 12 |
| Figure2→Proof jump | 1, 6 |
| Proof absent from z-depth | 5, 6 |
| Brand absent from Proof→Brand | 5, 6 |
| Brand flash | 5, 7 |
| Reverse state corruption | 2, 3, 7, 8, 10 |
| Crane first-run flock failure | 1, 9, 12 |
| Education absent in Crane reverse | 5, 8 |
| Lab→PH / PH→Education missing | 4, 8 |
| Brand→Figure3 unreliable | 2, 3, 4, 7 |

## 14. Rollback boundaries

Each implementation commit must leave typecheck and its focused tests passing. If a phase fails physical review:

- state graph/controller commits remain if their pure sequence gates pass;
- visual endpoint/layer commits can be reverted independently;
- packed-alpha generation changes can be reverted independently;
- no accepted Unit 4/5/6 donor commit is rewritten;
- do not restore the three local phase stores as a fallback;
- rollback returns to the immediately preceding verified commit, then fixes the violated contract at its owning module.

## 15. Definition of done

The work is complete only when all are true:

- phone still uses native scroll plus one fixed stage;
- desktop Director behavior is unchanged;
- one `PhoneStoryCursor` is the only durable semantic state;
- one active session and one scroll anchor exist at runtime;
- only the cursor-adjacent run can start;
- every run dependency closure is bounded and rollback-safe;
- Grade A, Group 4–5, and Group 6–7 contain no durable transition phases;
- Brand and Lab seams have exactly one boundary owner;
- endpoint geometry release is run-scoped and atomic;
- edge publication has one caller;
- PH/Crane forward playback begins only after the canonical handoff, reverse
  retains terminal-frame preparation, and frozen media/first-frame hashes pass;
- full forward and reverse paths pass automated state gates;
- the complete physical-iPhone journey is accepted and recorded.
