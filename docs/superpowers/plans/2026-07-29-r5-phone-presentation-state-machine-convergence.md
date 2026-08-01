# R5 Phone Presentation State-Machine Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (- [ ]) syntax for tracking. Do not dispatch subagents unless the
> user explicitly authorizes it.

**Goal:** Make every formal phone hold, segment, direct entry, AOD run, and
Hero first frame commit through one route-local presentation transaction whose
stable state proves the intended content is actually presented.

**Architecture:** PhoneStoryShell remains the sole formal-route authority and
/brand-lab creates an isolated scope: brand-lab instance from the same runtime
factory. Converge the current reducer, orchestration, projection, evidence,
viewport, and layer decisions into four bounded modules: manifest.ts, private
pure machine.ts, runtime.ts, and presentation.ts. Scenes and transitions become
token-bound, stateless drivers that report facts; they never independently
publish stable state.

**Tech Stack:** React 19, TypeScript 5.8, Vitest 3, Playwright WebKit,
GSAP/ScrollTrigger, native video, WebGL packed-alpha compositor, Vite 7.

---

## Status, baseline, and non-negotiable invariants

The prior global-presentation-contract recovery plan is superseded. Its WIP is
retained only by checkpoint 14af18a; the current baseline, including the
reproduced WebKit Pattern failure, is recorded in
docs/react-refactor/reports/r5-phone-presentation-state-machine-convergence-baseline.md.

The following remain immutable throughout every task:

1. app/src/story/timings.ts, media byte streams and hashes, scene order, and
   copy do not change.
2. Figure3/Services, PH/Education, and Crane/Contact retain current forward
   and reverse compositor donor behavior.
3. The canonical spine remains exactly 16 holds and 15 segments.
4. Formal / contains one authority; /brand-lab is route-local QA scope and
   must not enter the formal module graph.
5. The phone bundle remains at or below 663,552 bytes. The baseline uses
   634,120 bytes, leaving 29,432 bytes.
6. No Pattern-specific strip, negative bottom, overscan, opaque masking
   element, synthetic completion callback, or CSS-only stable workaround may
   be introduced.
7. Every source change is test-first, cohesive, and committed only when its
   named gate is green except for an explicitly recorded browser known-red.

## Authoritative release-regression amendment — 2026-08-01

This amendment supersedes every earlier claim in this document that a Task 10
run, a root-route pixel gate, a `7/7` browser result, or a completed/frozen
ledger is release evidence. It does **not** discard the route-local machine,
manifest, immutable-token, or leaf-fact architecture. The failure is lower in
the stack: presentation **execution** still has more than one writer for
visible surfaces, media playheads, and landings.

**Current disposition:** implementation execution **NO-GO**; automated
qualification **invalidated**; release **NO-GO**. This is based on a clean,
fresh production rebuild at commit `8e2ae7e`, not a cached preview. Do not
create a release candidate, publish to CDN, run release qualification, or
claim a browser/device pass until the three active ledgers below are closed in
order.

Earlier pass counts remain useful historical diagnostics only. In particular,
cursor, surface-role, DOM-rectangle, CSS-number, or late screenshot assertions
cannot establish that a visible surface was continuously painted, that a media
timeline advanced once, or that one and only one execution owner drove it.

### Current execution-authority audit

| Affected chain | Confirmed symptom | Current split writer / discontinuity | Required ownership after cutover |
| --- | --- | --- | --- |
| Loader → Hero; Star Map | Hero presents poster → black/packed-canvas gap → entrance; Star Map remains at revision `2 → 2` in `hold:star-map`. | `PhoneStageRail.css` exposes the opening poster before `PhoneStoryShell.tsx` activates the Hero compositor. `PhoneStarMap.tsx` stores `active` in a ref without calling the real `updateActive()` renderer control. | Hero leaf owns one continuous opening surface and reports a real post-paint first frame; Star Map leaf owns only its Perlin renderer start/stop from its declarative `active` input. |
| AOD → Method | The first forward gesture at `hold:aod-animation` scrolls roughly 700px; AOD remains paused at time zero and Method is already near the viewport before playback begins. | `phone-stage-timeline.ts` treats `0.985` as an autoplay trigger while the AOD hold begins near `0.80`; native rail progress can therefore advance independently of the transaction. | The AOD→Method runner owns the first boundary intent, input lock, source playback, authored cue, Method admission, settle, and abort. The rail observer reports facts only. |
| Method → Figure2 → Proof | Figure2 initially lands about one viewport below view, then later starts; Figure2→Proof repeatedly jumps `2.6 → 0 → 2.6 → 0`. | `PhoneGradeAStory.tsx` drives Figure2 while its proof snapshot is active, and `figure2-distance-expand.tsx` drives the same Figure2 timeline again. The forward landing is derived from an upstream trigger rather than the rendered Figure2 origin. | `PhoneFigure2` is the sole writer of its media timeline. The transition may render only Ink/effect output; the runner owns landing/admission/settle and receives the leaf's fact reports. |

The state machine remains the only authority that may commit a stable hold.
The runner remains the only authority that may accept input, create a
transaction, lock/unlock input, choose an admission/playback/settle phase,
choose a landing, or dispose the transaction. A leaf receives its immutable
snapshot/driver input, performs its own renderer/media operation exactly once,
and reports an observed fact. It cannot use an imperative `enter()`, `leave()`,
or transition callback to acquire a second presentation writer.

### Freeze and sequencing rule

Until Tasks 8–11 complete, freeze AOD unrelated to its own ledger, Figure2
unrelated to its own ledger, Figure3, TTG, Groups 4–7, media hashes, authored
timings, and direct-entry behavior. Do not turn an active ledger into a broad
compatibility cleanup. Each task must first install its deterministic
known-red gates, then hard-cut the one vertical execution chain, then commit
only after its named gates are green.

The only permitted order is:

1. Hero + Star Map continuous opening execution.
2. AOD → Method first-intent execution.
3. Method → Figure2 → Proof single-media-writer execution.
4. Re-run qualification; only then consider CDN/release/device work.

### Task 8: Install the execution-regression gates before product changes

**Files:**

- Modify: `app/e2e/r5-phone-story.spec.ts`
- Modify: `app/src/production/phone/scenes/PhoneStarMap.test.tsx`
- Modify: `app/src/production/phone/scenes/PhoneHero.test.tsx`
- Modify: `app/src/production/phone/phone-stage-timeline.test.ts`
- Modify: `app/src/production/phone/PhoneGradeAStory.test.ts`
- Modify: `app/src/production/phone/phone-grade-a-runtime.test.ts`

- [ ] Add one test-only sampling helper in the existing E2E spec. It must
  record wall-clock time, `scrollY`, route-machine cursor/phase/input, Star
  Map revision, Figure2 `currentTime`, and the rendered bounding boxes needed
  for correlation. Dataset values identify the target only; every visual
  acceptance assertion must use screenshots/canvas pixels or computed geometry
  rather than a CSS string or dataset value.

- [ ] Add the Loader→Hero known-red path before the current late Hero checks.
  Starting while Loader is still visible, sample at least twelve frames at
  50ms intervals through `revealing` and Hero entrance completion. Assert the
  opening ROI never becomes a uniform background frame after Loader fade
  begins, and that Hero progress is monotonic with at most one `0 → 1` run.
  A representative assertion shape is:

  ~~~ts
  expect(samples.every((sample) => sample.openingPixelDelta > 0.002)).toBe(true);
  expect(countProgressResets(samples.map((sample) => sample.heroProgress))).toBe(0);
  ~~~

- [ ] Add the Star Map known-red path: settle at `hold:star-map`, sample for
  one second, require the Perlin revision to increase by at least eight and
  the canvas screenshot delta to be non-zero. Navigate away and require the
  revision to stop increasing. The test must fail on `8e2ae7e` because the
  current revision remains `2 → 2`.

  ~~~ts
  expect(samples.at(-1)!.revision - samples[0]!.revision).toBeGreaterThanOrEqual(8);
  expect(pixelDelta(samples[0]!.image, samples.at(-1)!.image)).toBeGreaterThan(0.001);
  ~~~

- [ ] Add the AOD first-forward known-red path. From a stable
  `hold:aod-animation`, issue one small forward phone input and, within two
  animation frames, require `transition:aod-method`, locked input, and a
  started AOD source. Before that transaction takes control, require absolute
  `scrollY` drift of no more than 2px and no visible Method text. Continue to
  require exactly one AOD completion before `hold:method-top` can appear.

  ~~~ts
  expect(firstTransaction.cursor).toContain('transition:aod-method');
  expect(firstTransaction.input).toBe('locked');
  expect(Math.abs(firstTransaction.scrollY - initialScrollY)).toBeLessThanOrEqual(2);
  expect(methodTextVisibleBeforeAodCue(samples)).toBe(false);
  ~~~

- [ ] Add the Method→Figure2→Proof known-red path. From the real Figure2
  hold, a first small forward input must advance its media within 500ms. Sample
  the playhead every 80ms; no adjacent sample may decrease by more than 0.05s,
  and the run may enter Figure2→Proof exactly once without returning to a
  Figure2 transaction after Proof begins. Assert that the rendered Figure2
  origin is inside the intended viewport corridor at the landing, rather than
  merely that an upstream trigger exists.

  ~~~ts
  expect(playheadAfterFirstInput - playheadAtHold).toBeGreaterThan(0.05);
  expect(hasDecreaseGreaterThan(samples.map((sample) => sample.figure2Time), 0.05)).toBe(false);
  expect(countCursorEntries(samples, 'transition:figure2-proof')).toBe(1);
  ~~~

- [ ] Add focused unit tests for the same contracts: Star Map prop activation
  calls the real renderer control after initialization; Hero first-frame
  readiness represents the surface that will remain visible; timeline input at
  stable AOD does not directly autoplay or scroll past the runner; Figure2
  transition code has no media-write capability.

- [ ] Run the new focused tests against `8e2ae7e`, retain the expected red
  trace/screenshot evidence in the normal ignored test-results location, and
  record the exact failure predicates in the implementation commit message.
  Do not commit a permanent red test-only checkpoint.

**Gate before Task 9:** all four tests are demonstrably red for the specified
execution defect, not because of a locator, timing race, or unsupported test
diagnostic. No production file changes are permitted before this review.

### Task 9: Hard-cut Loader → Hero and Hero → Star Map execution

**Files:**

- Modify: `app/src/production/phone/PhoneStoryShell.tsx`
- Modify: `app/src/production/phone/PhoneStageRail.css`
- Modify: `app/src/production/phone/scenes/PhoneHero.tsx`
- Modify: `app/src/production/phone/scenes/PhoneStarMap.tsx`
- Modify: the Task 8 tests only where an observable name is intentionally
  replaced

- [ ] Delete the early `poster-decoded` visibility handoff in
  `PhoneStageRail.css`. A decoded poster is preloading evidence, not
  authorization to reveal a second opening surface.

- [ ] Arm the Hero leaf while Loader still owns visibility, but do not reveal
  the stage until that **same** Hero compositor has delivered a non-black,
  browser-painted first frame. The Loader fade must reveal that already-running
  surface; do not reveal a poster, hide it, then activate a separately mounted
  packed-alpha canvas.

- [ ] Make `PhoneHero` publish its first-frame fact only after its retained
  compositor surface has painted. Keep one immutable opening run and one
  monotonic entrance driver; repeated effects, stale callbacks, and Loader
  changes may not reset progress or start a second entrance.

- [ ] Change `PhoneStarMap`'s declarative `active` reconciliation to call the
  actual Perlin renderer `updateActive()` after renderer initialization and on
  each active transition. `active=false` cancels the frame loop; `active=true`
  starts it. Do not restore a runtime `enter()`/`leave()` command or add a
  second runner writer.

- [ ] Add a static ownership test that the only production call site able to
  start/stop Star Map's renderer is the leaf's active reconciliation; machine,
  runtime, adapter, and transition modules may only provide the declarative
  input.

- [ ] Run the Task 8 Hero/Star Map browser gates, relevant Vitest files,
  typecheck, production build, and the existing focused Chromium story cases.
  Commit the resulting vertical cutover as one checkpoint, for example:
  `fix(r5): make opening and Star Map execution single-owner`.

**Gate before Task 10:** Hero has no post-Loader black frame or progress reset;
Star Map revision advances and pixels change while active, then stops after
leave; all focused checks are green. Do not run broad WebKit qualification yet.

### Task 10: Hard-cut AOD → Method first-intent execution

**Files:**

- Modify: `app/src/production/phone/phone-stage-timeline.ts`
- Modify: `app/src/production/phone/usePhoneStageRuntime.ts`
- Modify only the AOD wiring in `app/src/production/phone/phone-story/runtime.ts`
- Modify `app/src/production/phone/scenes/PhoneAod.tsx` and
  `app/src/production/phone/scenes/PhoneMethodTop.tsx` only if a leaf must
  report an observed frame/cue fact
- Modify: `app/src/production/phone/phone-stage-timeline.test.ts`
- Modify: `app/src/production/phone/phone-story/runtime/engine.test.ts`
- Modify: `app/src/production/phone/scenes/PhoneAod.test.tsx`
- Modify: `app/e2e/r5-phone-story.spec.ts`

- [x] Remove `aodAutoplayStart: 0.985` as a playback authority. Do not merely
  lower the threshold: a rail percentage is not an input transaction.

- [x] On the first valid forward input from stable AOD, the AOD→Method runner
  must synchronously create the one transaction and lock input before native
  scroll advances the rail. Its only legal phase order is:

  ~~~text
  hold:aod-animation / input free
  → aod-method source playback / input locked
  → method candidate after authored AOD cue / input locked
  → exact Method admission proof
  → hold:method-top / input free
  ~~~

- [x] The stage observer may report scroll/sample facts but cannot call AOD
  playback, commit a landing, or unlock input. The runner starts source media
  exactly once, owns blocked/retry/context-loss disposal, and accepts the
  Method leaf fact only after the authored cue. Method must not become a
  visible receiver before that point.

- [x] Preserve the existing exact-token and reduced-motion contracts. AOD
  leaves report their actual frame/cue facts; neither a stage callback nor a
  runner reconstructs a leaf proof.

- [x] Make the Task 8 first-input test green and add deterministic unit tests
  for: one initial lock/start, no direct timeline autoplay, cue-gated Method
  admission, abort/reverse cleanup, and stale callback rejection.

- [x] Run targeted Vitest, typecheck, production build, then the AOD→Method
  Chromium visual case. Commit this ledger separately, for example:
  `fix(r5): route first AOD input through the transaction runner`.

**Gate before Task 11:** first AOD input starts the transaction with at most
2px pre-transaction drift, Method is not visible before its cue, AOD completes
once, and the terminal transaction is disposed before input returns.

### Task 11: Hard-cut Method → Figure2 → Proof to one media writer

**Files:**

- Modify: `app/src/production/phone/PhoneGradeAStory.tsx`
- Modify: `app/src/production/phone/phone-grade-a-runtime.ts`
- Modify: `app/src/production/phone/scenes/PhoneFigure2.tsx`
- Modify: `app/src/production/phone/transitions/figure2-distance-expand.tsx`
- Modify: `app/src/production/phone/PhoneGradeAStory.test.ts`
- Modify: `app/src/production/phone/phone-grade-a-runtime.test.ts`
- Modify: `app/src/production/phone/phone-composite-runner.test.ts`
- Modify: `app/e2e/r5-phone-story.spec.ts`

- [ ] Bind the forward landing to the rendered Figure2 leaf origin/corridor
  measured after the leaf is mounted, not to an upstream trigger or nominal
  track edge. The runner captures this one landing fact for its transaction;
  it does not invent a second geometry model.

- [ ] Make `PhoneFigure2` the sole writer of its video/canvas timeline. It
  receives one declarative progress/phase input from the current transaction
  and applies it once to its own media. It reports observed frame/playhead
  facts back upward; it never commits a hold or starts a proof transaction.

- [ ] Remove all Figure2-media writes from `PhoneGradeAStory` while a
  Figure2→Proof snapshot is active. Remove all calls from
  `figure2-distance-expand.tsx` that render, update, seek, or timeline-drive
  the shared Figure2 media. That transition may draw Ink/effect output only;
  it must consume a read-only rendered input rather than control the Figure2
  leaf.

- [ ] Add a source ownership gate: outside `PhoneFigure2` and its local
  media implementation, production files must have zero write calls to the
  Figure2 playhead/renderer (including `figure2.update(...)`,
  `renderFigure2AnimationProgress(...)`, and bridge `timeline(['render', ...])`
  variants). The test must inspect resolved imports/call bindings, not merely
  a filename regex.

- [ ] Make the Task 8 Figure2 landing/playhead/single-Proof tests green. Add
  unit sequences for first-input advancement, monotonic samples, one Proof
  entry, stale/aborted transaction disposal, and reverse re-entry without a
  second media writer.

- [ ] Run focused Vitest, static ownership gate, typecheck, production build,
  and the Method→Figure2→Proof Chromium visual case. Commit the ledger alone,
  for example: `fix(r5): give Figure2 media one execution owner`.

**Gate before qualification:** first small Figure2 input advances visible media
from its real landing; no sampled playhead reverses; the Figure2→Proof edge is
entered once; all former writers are absent rather than disabled behind a
condition.

### Task 12: Re-establish qualification only after the three cutovers

**Files:**

- Modify or create only after all gates pass:
  `docs/react-refactor/reports/r5-phone-presentation-state-machine-acceptance.md`

- [ ] Run source ownership/static gates, full Vitest, typecheck, and a fresh
  production build before browser work. Record exact commit, bundle size, and
  test totals; do not reuse prior artifacts or pass counts.

- [ ] Run the new continuous-pixel and single-writer cases plus the complete
  Chromium portrait matrix: forward, reverse, two complete cycles,
  direct-entry, and the existing formal Task 10 cases. Every state assertion
  must be paired with its real-pixel/media/input assertion.

- [ ] Only after Chromium is fully green, run the same WebKit portrait matrix.
  Only after both are green, run trusted physical-iPhone Safari forward,
  reverse, two-cycle, direct-entry, and background/foreground recovery checks.

- [ ] Write the acceptance report with links to fresh traces/screenshots,
  browser versions, device identity, exact commit, and every gate above. A
  release candidate, `release:prepare`, memory qualification, CDN publication,
  or release-finalization remains prohibited until this report is green.

## Locked production ownership map

## Locked production ownership map

Create the authority directory below. The existing scenes and transitions
directories remain lazy leaf drivers to preserve their chunk boundaries; they
may import only token/reporting contracts exposed by runtime.ts, never
machine.ts.

| Path | Single responsibility | Must not own |
| --- | --- | --- |
| app/src/production/phone/phone-story/manifest.ts | Exhaustive canonical scene/segment declarations: surface, coverage, edge, effect host/placement, direct-entry proof, and reverse policy. | Timers, DOM queries, mutable session state. |
| app/src/production/phone/phone-story/machine.ts | Private pure reducer, transaction snapshot, injected monotonic time, proof matching, and sole canCommitPresentation(). | DOM, timers, React, media, WebGL, window. |
| app/src/production/phone/phone-story/runtime.ts | One authority instance: input, transaction lifetime, time source, timers, gesture lease, retries, adapter invocation, and reducer dispatch. | Re-deciding proof validity or CSS layer rules. |
| app/src/production/phone/phone-story/presentation.ts | Explicit surface/effect registration and atomic projection of roles, coverage, edge/theme, visibility, and diagnostics. | Cursor transitions, retries, or separate state. |
| app/src/production/phone/phone-story/presentation.css | Translation of fixed semantic plane into CSS variables and z-index values. | Scene-specific visual effects. |

Delete or merge every replaced production module in its designated cohesive
task; no compatibility wrapper survives past Task 6:

- phone-presentation-contract.ts
- phone-presentation-evidence.ts
- phone-story-state.ts
- phone-story-orchestrator.ts
- phone-story-orchestrator.types.ts
- phone-story-projector.ts
- phone-story-presentation.ts
- phone-surface-roles.ts
- phone-presentation-layers.ts
- phone-viewport-coverage.ts
- phone-aod-presentation-gate.ts
- phone-brand-lab-runtime.ts

Delete PhoneLabContactShell and PhoneGroup67DirectEntry only after the module
graph proves no runtime reference remains. A commit that adds a production file
must delete or merge at least one old production file; the final non-test phone
production count may not exceed the pre-recovery baseline of 122.

The core types are defined once in manifest.ts and machine.ts:

~~~ts
export type PresentationToken = Readonly<{
  authorityId: string;
  sessionId: string | null;
  generation: number;
  leg: number | null;
  revision: number;
  subject: PhoneSurfaceId | CanonicalSegmentId;
  kind: PresentationProofKind;
}>;

export type PresentationProof = Readonly<{
  token: PresentationToken;
  frameSequence: number;
  observedAt: number;
  connected: boolean;
  visible: boolean;
  coverageComplete: boolean;
  edge: PhoneEdgeScene;
}>;

export function canCommitPresentation(
  snapshot: PhoneMachineSnapshot,
  now: number
): boolean;
~~~

observedAt is compared to injected now; comparing one proof to another is not
expiry. Dataset attributes are diagnostic output only and cannot produce a
PresentationProof.

### Frozen hard-cutover ledger: AOD ↔ Method reduced-motion admission

The normal-motion AOD cutover remains frozen. This narrow ledger reopened only
the reduced-motion presentation strategy after the production Chromium Task 10
round trip stopped at `transition:aod-method:0`: the capability had not carried
the reduced strategy into the machine, so its leaf entered ordinary
`admission → playback`; its reduced branch then marked a DOM dataset as ready
and forwarded a synthetic `packed-canvas-frame`. That is neither a target
static-poster proof nor a real post-paint endpoint.

The reduced contract is deliberately the same one-transaction lifecycle used
by the other hard cutovers:

```text
hold:source / input free
→ candidate:target / reduced session / input locked
→ exact target leaf post-paint static-poster proof
→ hold:target / session null / input free
```

There is no AOD-specific reduced lifecycle. The single `aod-method` runner
still owns admission and disposal; the machine/session controller owns the
short proof deadline, rollback, token retirement, and input release. Leaves
receive a complete immutable token and may only return one raw physical fact.

| Canonical direction | Input and old side path to remove | Sole owner after cutover | Exact static proof and layout | Failure / disposal gate |
| --- | --- | --- | --- | --- |
| reduced `AOD → Method` | boundary input creates `aod-method`, but the capability omits `reducedMotion`; `PhoneAod.startAutoplay()` starts the old media admission and writes `data-phone-presentation-frame=ready` | the existing `aod-method` runner starts one reduced machine transaction; it must not call `startAutoplay`, arm a playback watchdog, accept progress, or accept `LEG_COMPLETED` | runner mints `static-poster / native:method`, asks the existing route runtime for the declared semantic-edge layout, then binds `PhoneMethodTop`; Method reports the original token only in its second post-paint frame | session controller's reduced-proof deadline rolls back; runner cancels/disposes the Method binding on stable, rollback, unmount, or token replacement |
| reduced `Method → AOD` | reverse must not reuse a forward source token or restart the AOD autoplay/timeline | the same runner and transaction, with reverse direction encoded in its token | runner mints `static-poster / front:aod`, requests the existing reverse semantic-edge layout, then binds `PhoneAod`; AOD renders its static DOM endpoint and reports one post-paint raw frame | stale forward/reverse callback, context loss, hidden-page resume, or missing paint cannot enter playback or satisfy a newer revision |
| proof boundary | generic presentation fallback, root readiness datasets, and runtime proof reconstruction can all make a visual-looking endpoint appear committed | runner only forwards the leaf frame unchanged; presentation validates it; machine alone publishes stable | both leaves preserve authority/session/generation/leg/revision/subject/kind exactly and use `origin: 'leaf-static-poster'`; dataset values are diagnostic evidence only, never a proof producer | no pre-proof progress/complete; timeout rollback returns the source and the next input creates a clean transaction |

Before any browser rerun, required red-then-green gates are:

1. both directions enter `preparing + reducedMotion + candidate`, reject
   source `packed-canvas-frame`, progress, and completion, then accept only
   the exact target `static-poster` proof;
2. the AOD runner advertises the reduced strategy, requests exactly the
   existing semantic layout once, never invokes media autoplay for that path,
   and disposes the target binding when the machine retires it;
3. Method and AOD leaves each prove a real post-paint static endpoint with the
   original raw token; an old binding or mount callback cannot complete a new
   revision;
4. missing proof, unmount/context loss, and a stale token rollback through the
   machine and permit the next input; the normal-motion blocked/retry and
   compositor gates stay unchanged.

Closure evidence:

- deterministic AOD machine/runner/leaf gates cover both directions, exact
  target token identity, rejected source/progress/complete, timeout rollback,
  retired stale proof, and the next input;
- TypeScript and the full unit suite pass (`223` files / `1606` tests), and the
  production build passes with phone JS at `635157` bytes (`28395` bytes of
  hard-cap headroom);
- Chromium production acceptance passes for both reduced AOD directions and
  the normal no-compositor-frame admission gate. The isolated reduced test
  asserts candidate/locked/preparing only, no `animating` or `transition`
  projection, then stable target and released input.

The full reduced Task 10 journey now proceeds through AOD and stops separately
at `Method → Figure2` (`hold:method-top` while waiting for
`hold:figure2-animation`). That downstream ledger is not an AOD regression;
do not reopen AOD while it is investigated. WebKit and physical-device
acceptance remain deferred until Chromium Task 10 is globally 7/7.

### Frozen hard-cutover ledger: Method ↔ Figure2 reduced-motion admission

This is the only active implementation scope. AOD, Figure3, TTG, Pattern ↔
StarMap, Group 6–7, media hashes, and timings remain frozen. The reproduced
production reduced-motion journey now clears AOD, then times out at
`hold:method-top` while waiting for `hold:figure2-animation`. That is a
separate Grade A admission failure, not evidence that the AOD cutover regressed.

The root cause is concrete and has two coupled ownership violations:

1. `createPhoneGradeARunner()` receives `reducedMotion` but registers every
   Grade A capability with `false`. Therefore `method-figure2` enters the
   ordinary dynamic session instead of the machine's short `preparing`
   candidate.
2. Its ordinary start path calls `reportRenderedBoundaryFrame()` which uses
   `session[5]` / `reportRenderedFrame()` to mint a segment proof, then calls
   `complete()` directly when reduced motion is requested. That is a runner
   synthesized proof + endpoint completion path. `PhoneFigure2` has no
   post-paint `static-poster` leaf binding, and its candidate bridge calls
   `update(0)`, which starts the packed-alpha media path even though reduced
   motion must not start playback.

The migration is a vertical hard cutover. It does not make all Grade A
boundaries reduced in one change: only `method-figure2` receives the reduced
capability strategy while `figure2-proof` and `proof-brand` stay frozen for
their later ledgers. The active boundary follows the same one-transaction
sequence already proven for AOD:

```text
hold:source / input free
→ candidate:target / reduced session / input locked
→ exact target leaf post-paint static-poster proof
→ hold:target / session null / input free
```

| Canonical direction / boundary | Input and old writers to delete | Sole owner after cutover | Exact target proof / layout | Failure and disposal owner |
| --- | --- | --- | --- | --- |
| reduced `Method → Figure2`, `method-figure2` leg 0 | `createPhoneGradeARunner()` advertises non-reduced capability; `reportRenderedBoundaryFrame()` reconstructs an `effect-frame`; `startRenderedTransition()` begins ink/media and calls `complete()`; `PhoneGradeAStory` calls `Figure2.update(0)` | the existing Grade A runner owns the one reduced admission. It requests the declared Figure2 landing once, binds the immutable target token, and never begins ink playback, emits progress, calls `complete()`, or commits an endpoint | runner obtains `static-poster / grade-a:figure2` through `presentationFrameToken()`, then invokes `PhoneFigure2.presentPresentation(token, report)`. Figure2 exposes its existing authored poster, marks its visible media stack for that exact token after one paint, and returns one raw `leaf-static-poster` frame in the next paint | session controller owns the six-second proof deadline, rollback, token retirement, stable commit and input release; runner only cancels/disposes the Figure2 binding when the machine retires it |
| reduced `Figure2 → Method`, same leg reversed | reverse may reuse a Figure2 source frame, use a generic presentation adapter, or drive the Method/ink endpoint directly | the same Grade A runner and machine transaction; `PhoneMethodTop` is injected directly from its parent as the existing leaf handle, not through a new registry/facade | runner obtains `static-poster / native:method`, requests Method's declared target landing once, and invokes the Method leaf's existing post-paint binding with that exact token | same machine deadline/rollback; the runner disposes only the Method binding after terminal state. A stale Figure2 or Method callback has no write authority |
| fixed Figure2 proof boundary | `presentation.proofForRenderedFrame()` currently accepts `leaf-static-poster` only for `native` surfaces; changing Grade A Figure2 from `fixed` to `native` would corrupt stage-role semantics | presentation remains a verifier only; it never mints this proof and retains no admission state | `grade-a:figure2` explicitly declares its static-poster marker verifier. The marker must match the immutable token key on the visible Figure2 media stack; only `origin: 'leaf-static-poster'` plus that matching marker maps to the Figure2 edge | wrong/missing marker, wrong token, disconnect, hidden target, or incomplete coverage returns no proof and lets the machine deadline roll back |
| repeat / cancellation | an old Figure2 binding, RAF, packed-alpha callback, or Grade A resource can outlive a new revision | machine terminal transitions are the one release decision; runner owns only the current binding's cancel/dispose callback | the leaf retains the exact object token, not a reconstructed key; an old token/callback cannot satisfy the newer candidate | terminal, rollback, unmount, context loss, and token replacement cancel both leaf RAFs, delete the marker, dispose the binding, and permit the next intent |

Before the first browser rerun, these red-then-green gates are mandatory:

1. A Grade A runner test proves only `method-figure2` advertises
   `reducedMotion: true`; forward and reverse both call exactly one
   `requestReducedTargetLayout()` and bind the respective original target
   token. They make zero calls to `reportRenderedFrame()`,
   `presentationProofToken()`, `reportProgress()`, `animate()`,
   `reportEndpointCommit()`, and `reportAnimationComplete()`.
2. A deterministic order test proves `candidate → layout request → target
   leaf post-paint raw frame → stable`, rejects every stale token field, and
   proves progress/completion before that exact proof are inert.
3. Figure2 leaf tests prove a static binding does not instantiate packed-alpha
   media, reports only after the double paint, deletes its marker on
   dispose/re-arm, and retains the raw token object unchanged.
4. Presentation tests prove the fixed Figure2 marker is necessary and
   sufficient for a `leaf-static-poster` proof, while a generic fixed-surface
   callback or unmarked Figure2 root remains rejected.
5. Static writer checks prove `method-figure2` has one capability owner and
   zero production calls to generic proof reconstruction or reduced direct
   completion. They also prove the snapshot bridge does not call
   `Figure2.update(0)` during this candidate.
6. Machine/session tests prove timeout/rollback, abort/unmount, and a second
   same-authority forward/reverse cycle all clear the binding and accept the
   next input.

Only after those gates, `pnpm typecheck`, full unit tests, and the production
build/budget gate are green may Chromium run the scoped forward and reverse
test, followed by the full reduced Task 10 journey. WebKit remains blocked
until Chromium Task 10 is 7/7.

### Frozen hard-cutover ledger: Figure2 ↔ Proof reduced-motion admission

Method ↔ Figure2 now passes its scoped Chromium proof, but the full Chromium
reduced journey exposed the immediately adjacent frozen edge: `figure2-proof`
starts an ordinary Ink timeline under the global reduced preference. Passing
`reducedMotion={false}` to that leaf makes it complete, but emits intermediate
progress and violates the already-established reduced-motion contract. Keeping
the global flag instead skips the timeline's first frame and leaves the machine
candidate locked until timeout. Neither is an acceptable ownership model.

This is the next and only active vertical edge. It does not reopen Method,
AOD, `proof-brand`, Figure3, TTG, Pattern ↔ StarMap, Group 6–7, direct entry,
media hashes, or timings.

| Canonical direction / boundary | Current writers to delete | Sole owner after cutover | Exact target proof / layout | Failure and disposal owner |
| --- | --- | --- | --- | --- |
| reduced `Figure2 → Proof`, `figure2-proof` leg 0 | `reportRenderedBoundaryFrame()` reconstructs a segment proof through `session[5]`; `PhoneFigure2DistanceExpandTransition` conditionally skips/starts its Ink timeline; runner may emit progress and completion | the existing Grade A runner opens the one reduced candidate and does not invoke the transition adapter | runner requests the declared Proof landing once, issues `static-poster / grade-a:proof`, and `PhoneFigure2Proof` reports the same raw token only after its own static hold is painted and marked | machine owns the proof deadline, rollback, stable commit, input release, and token retirement; runner disposes only the live Proof binding |
| reduced `Proof → Figure2`, same leg reversed | generic Figure2 effect proof or transition endpoint can satisfy the candidate; old Proof callbacks can outlive the reverse revision | the same runner/machine candidate; no media or Ink playback | runner requests the declared Figure2 landing once, issues `static-poster / grade-a:figure2`, and reuses the already-cut Figure2 leaf's exact post-paint binding | same machine deadline/rollback; stale Proof/Figure2 RAFs and markers are retired with the terminal release |
| fixed Proof target verification | a fixed surface cannot accept a generic leaf callback as static evidence | presentation remains a verifier only | `grade-a:proof` declares a Proof-local marker verifier matching the immutable token key on the actual visible proof root | absent/mismatched marker, stale token, disconnect, hidden target, unmount, or context loss produces no proof and rolls back through the machine |

Required red-then-green gates:

1. Capability registration proves only boundaries 0 and 1 advertise the
   reduced strategy; `proof-brand` stays frozen with no behavior change.
2. Deterministic forward and reverse tests prove candidate → target-layout →
   leaf post-paint raw frame → stable; they reject a cloned/stale token and
   record zero generic proof, progress, animation, endpoint, or completion
   writes before the exact proof.
3. `PhoneFigure2Proof` tests prove its static binding performs a double paint,
   preserves the original token object, clears its exact marker/RAF on
   dispose/re-arm, and never starts Figure2's Ink/packed-alpha path.
4. Presentation tests prove the fixed Proof marker is necessary and sufficient
   for a `leaf-static-poster` proof.
5. Static writer checks prove the reduced B1 branch contains no
   `reportRenderedBoundaryFrame`, `reportRenderedFrame`,
   `presentationProofToken`, `reportProgress`, `animate`, or `complete` call.
6. Only after these gates are green may the full Chromium reduced Task 10
   journey be rerun. WebKit remains blocked until Chromium is globally 7/7.

Closure evidence: the exact forward/reverse Figure2 ↔ Proof reduced candidate
test now passes in Chromium; the deterministic B1 target-token, stale-token,
and disposal gates, TypeScript, all `223` unit files / `1618` tests, and the
production build also pass. The full Chromium Task 10 journey now clears B1
and stops separately at `transition:proof-brand:0`. That is the next adjacent
ledger, not a reason to reopen Method, Figure2, AOD, or any frozen group.

### Frozen hard-cutover ledger: Proof ↔ Brand reduced-motion admission

This is the only active implementation scope. The full Chromium reduced
journey now reaches `figure2-proof`, begins `proof-brand`, and remains in
`preparing` until its deadline. `#education` direct-entry is a separate frozen
Group 6–7 failure; Figure3, TTG, Pattern ↔ StarMap, media hashes, timings, and
all prior Grade A ledgers remain out of scope.

The current failure has a single ownership shape:

1. Boundary 2 has no `reducedStaticTarget`, so the Grade A runner advertises
   `proof-brand` as non-reduced and invokes its normal
   `reportRenderedBoundaryFrame()` → Ink → progress/complete lifecycle under a
   global reduced preference. That path cannot satisfy the short candidate
   admission.
2. The canonical `PhoneBrand` leaf already owns the readable Brand endpoint
   and token-bound presentation method, but Grade A receives only its DOM root
   through the tail bundle. It therefore cannot bind the original Brand leaf
   token without either synthesising proof or adding a second surface owner.

The cutover preserves the same one-transaction contract:

```text
hold:source / input free
→ candidate:target / reduced session / input locked
→ exact target leaf post-paint static-poster proof
→ hold:target / session null / input free
```

| Canonical direction / boundary | Current writers to delete | Sole owner after cutover | Exact target proof / layout | Failure and disposal owner |
| --- | --- | --- | --- | --- |
| reduced `Proof → Brand`, `proof-brand` leg 0 | boundary 2 omits reduced admission; `reportRenderedBoundaryFrame()` reconstructs its segment proof; `PhoneFigure2ProofBrandTransition` starts Ink and can advance progress/complete | the existing Grade A runner opens one reduced candidate and does not call the B2 transition adapter | runner requests the existing Brand boundary landing once, issues `static-poster / native:brand`, then calls the canonical `PhoneBrand.presentPresentation()` directly with that original token | machine owns deadline, rollback, stable commit, input release, and token retirement; runner disposes only the live Brand binding |
| reduced `Brand → Proof`, same leg reversed | reverse Ink endpoint, stale Brand callback, or a generic Proof/effect proof can satisfy the candidate | the same runner/machine candidate; no Ink, media, progress, endpoint commit, or completion is allowed before proof acceptance | runner requests the declared reverse boundary landing, issues `static-poster / grade-a:proof`, then binds the already-cut `PhoneFigure2Proof` leaf | same machine deadline/rollback; stale Brand/Proof RAFs and bindings are retired by the one terminal release |
| Brand handle handoff | Grade A currently holds `brandRoot` only; constructing a DOM wrapper would create a second proof writer | `PhoneBrandLabContinuation` keeps ownership of the canonical Brand ref and forwards that exact handle through its existing tail callback; Grade A stores no new Brand lifecycle | `native:brand` remains registered exactly once by the continuation; Grade A must not register or proxy that surface | unmount forwards `null`, cancels the leaf binding, and makes a pending candidate fail closed |
| Brand post-paint leaf | one scheduled callback can survive re-arm/dispose and has no explicit two-paint proof boundary | `PhoneBrand` remains the sole leaf proof producer | Brand retains the original token object, applies its static endpoint, waits one paint to establish it and a second paint to submit `leaf-static-poster`; any marker is diagnostic only | disposal/re-arm/unmount cancels both RAFs, clears the exact binding, and no old callback can report a new token |

Before browser work, required red-then-green gates are:

1. Grade A deterministic tests show all and only boundaries 0–2 advertise
   their explicit reduced strategy; B2 forward/reverse each request one layout
   and forward only the exact leaf frame. Generic proof reconstruction,
   progress, animation, endpoint, and completion calls remain zero.
2. `PhoneBrand` leaf tests prove the raw `native:brand` static frame carries
   the original object token; re-arm/dispose cancels the pending post-paint
   callbacks and cannot complete a newer revision.
3. Grade A/tail static ownership checks prove `native:brand` is registered
   once in `PhoneBrandLabContinuation`, while Grade A receives the direct leaf
   handle through the existing callback and never creates a wrapper or surface
   registration.
4. The reduced snapshot bridge branches before `proofBrandRef.render()` so
   candidate and rollback display only target/source stable endpoints; the Ink
   adapter remains available only to normal motion.
5. Presentation validation stays native-leaf-only: a Brand raw
   `static-poster` proof must use the exact active token, and a stale/cloned
   token, missing paint, timeout, unmount, or context loss rolls back through
   the machine.
6. Only after static gates, TypeScript, all unit tests, and production build
   are green may Chromium rerun the scoped B2 test and then full Task 10.
   WebKit remains blocked until Chromium reaches 7/7.

Closure evidence: the exact forward/reverse B2 Chromium test now passes; the
targeted deterministic gates, TypeScript, all `223` unit files / `1626` tests,
and the production build pass. The production phone shell is `641847` bytes,
leaving `21705` bytes under the hard cap. The full Chromium Task 10 run passes
the cold Hero → Contact journey, Contact → Hero reverse, two full-motion
same-authority round trips, Contact reverse-boundary claim, and Brand–Lab
reduced cycles. It now fails separately at the frozen Group 6–7 edge
`Lab → Education` under reduced motion and at formal `#education` direct
entry. Neither failure reopens Proof ↔ Brand; WebKit remains blocked until
Chromium is globally 7/7.

### Active framework-closure ledger: manifest-owned admission and proof contracts

The reduced Chromium production journey now clears the completed Group 6
`Lab ↔ PH ↔ Education` cutover and fails immediately at the adjacent Group 7
edge:

```text
hold:education
→ transition:education-contact:0
→ preparing
→ proof rejected
→ rollback
→ hold:education
```

That repeat is a framework defect, not a Crane-specific defect. The current
composite runner makes the real raw-frame path an opt-in
(`rawFrameProof`/`rawFrameProofFor`) and silently selects
`settleFrozenCompatibility()` when a scene has not opted in. That branch
reconstructs a proof and writes progress/endpoints. It creates a second
admission/proof authority beside the machine. Extending the Group 6 predicate
from `ph-animation` to `crane-animation` would only move the same hole to the
next undeclared edge.

This ledger supersedes the narrow Group 6 ledger. It activates the framework
contract for all sixteen formal holds, all fifteen canonical segments, every
normal and reduced run leg, and every direct-entry target. It preserves the
existing route-local `PhoneStoryShell → machine/runtime/presentation → leaf`
architecture. Normal AOD autoplay/gesture recovery remains the final
implementation ledger, but its normal-motion strategy is declared here and
must remain one machine transaction; it receives no compatibility escape path.
Timings, media bytes/hashes, scene order, and authored donor behavior remain
frozen.

#### One exhaustive manifest contract

`manifest.ts` is the only source of admission strategy. Its transport-safe
tuple for each canonical segment leg and direct-entry hold declares all of:

| Field | Required value |
| --- | --- |
| `producer` | exact physical source: `leaf-frame`, `leaf-dom-post-paint`, or declared effect leaf; never runtime reconstruction |
| `kind` / `subject` | immutable token proof kind and the one semantic surface that may report it |
| `landing` | canonical landing resolver and target scene; the runner requests geometry but does not infer it from a scene id |
| `effectRole` | declared effect role/placement for normal motion, or `none` for reduced/direct admission |
| `requiresLeafAdapter` | whether the target must expose `present(token, report)` and `dispose(token)` before admission starts |
| `normal`, `reduced`, `directEntry` | separate complete strategy entries, including the canonical reverse target; no omitted mode is interpreted as success |

The declaration must be type-exhaustive: a missing hold, segment, leg,
direction, mode, producer, target surface, or landing is a TypeScript/build
failure. Direct entry must be declared for every hold even when it shares the
same target proof as its stable scene. `manifest.ts` owns the Education,
Pattern, and StarMap distinctions; `presentation.ts`, runners, and
continuations may not branch on those scene ids to decide proof validity.

#### Cutover rules

1. `phone-composite-runner` obtains its normal/reduced/direct strategy only
   from the manifest using `(run, leg, direction, directEntry)`. Remove
   `rawFrameProof`, `rawFrameProofFor`, `reducedStaticSubject`, and
   `reducedAdmissionTargetPosition` from its options and every continuation.
2. Delete `settleFrozenCompatibility()` and the runner's
   `reportRenderedFrame(resource)` proof reconstruction. An absent manifest
   contract, adapter, landing, or exact raw frame fails closed through the
   existing machine rollback; it cannot synthesize progress, endpoint commit,
   or stable state.
3. Every media/Canvas leaf forwards the original immutable
   `PhoneRenderedPresentationFrame`. A pure DOM reading leaf reports its
   manifest-declared post-paint DOM proof with that original token. Runner
   forwarding is byte-for-byte token preserving and does not create a proof.
4. During candidate admission, runner drops source-restoring progress and
   completion. Only after the machine accepts the declared exact proof may
   normal playback regain control. Reduced motion has no playback clock and
   commits directly to stable after that proof.
5. Terminal, rollback, unmount, context loss, and replacement retire the one
   token, abort the one local controller, dispose the declared leaf binding,
   and release runner retention. A stale token/callback cannot satisfy a new
   revision.

#### Required red-then-green gates

Before any browser rerun, add deterministic tests that prove:

1. Manifest traversal covers 16 holds, 15 segments, every leg, forward and
   reverse normal/reduced strategies, and every direct entry; a deliberately
   incomplete declaration fails the validator/type gate.
2. Group 6 and Group 7 use the same runner path. `Lab ↔ PH ↔ Education` and
   `Education ↔ Crane ↔ Contact` each show candidate → declared landing →
   exact target raw frame → stable, with stale/missing/wrong-token frames and
   post-disposal callbacks rejected.
3. Runner source and behavior contain zero calls to
   `reportRenderedFrame()`, `presentationProofToken()`, or
   `proofForRenderedFrame()`; `settleFrozenCompatibility()` and all four
   opt-in switches are absent. Before admission proof, progress, completion,
   synthetic endpoint commit, and generic proof ingress are inert.
4. `presentation.ts` validates a declared token-bound leaf frame or a
   declared DOM post-paint adapter only. It has no receiver-based Education,
   Pattern, or StarMap proof exception.
5. Direct entry resolves the same manifest contract as the target hold;
   delayed mount, old callback, missing adapter, context loss, and retry all
   fail closed and permit the next input.

Only after all static gates, typecheck, full unit suite, and production
build/budget pass may Chromium rerun the full 7/7 journey. WebKit 7/7 and
physical iPhone remain blocked behind that Chromium gate. The closure commit
must be a coherent framework-cutover commit; no new per-scene compatibility
flag or facade is allowed.

### Frozen normal-motion hard-cutover ledger: AOD ↔ Method

This ledger is a release gate, not a design sketch. Its isolated deterministic
and browser checks are complete enough to freeze the AOD scope; that is not
evidence that any other run is safe. Reopen it only for an AOD-specific
regression. The only next implementation scope is the Group 4–5 ledger below;
do not add a facade, wrapper, or unrelated cleanup while it is active.

| State / canonical edge | Input events | Current writers to remove or constrain | Sole post-cutover owner | Exact proof producer | Timer / retry owner | Old entry to delete | Required acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hold:aod-animation` (including direct entry and reverse landing) | `DIRECT_ENTRY_REQUESTED`, reverse `aod-method`, post-paint adapter callback | `PhoneAod.presentPresentation()` and `runtime/session.reportRenderedFrame()` can both manufacture/route proof; `usePhoneStageRuntime` can reset autoplay on snapshot changes | route-local `PhoneStoryRuntime` transaction + projector; AOD leaf has no commit authority | `PhoneAod` reports its exact bound token only from a successful canvas draw; static/reduced proof remains the existing post-paint adapter path | machine transaction owns failure/rollback; runner owns no durable blocked/watchdog state | any AOD use of `reportRenderedFrame()` and duplicate reset side path | direct entry, reverse landing, reduced motion, Chromium + WebKit |
| `aod-method-top` forward admission | sampled scroll boundary → `RUN_STARTED`; leaf `startAutoplay()` result; successful packed-canvas draw | `runtime/aod.ts` currently owns `active/blocked/starting/presented/compositorProgress` and prepare/progress timers; `session.reportRenderedFrame()` rebuilds token/proof; `PhoneAod` emits both bound proof and frame callback | one `aod-method` runner registered by `PhoneStoryRuntime`; machine is the durable transaction/rollback authority | `PhoneAod` carries the immutable segment token received at admission and submits the first physical packed-canvas frame once; runner only receives accepted/rejected fact | machine records blocked/retry/watchdog/rollback state; runner schedules the one deadline against the active machine revision | `PhoneRuntimeAodDriver.reportCompositorFrame()` → `session[5]()` proof reconstruction; parallel bound frame dispatch | forward AOD→Method, autoplay blocked then gesture retry, no compositor frame, context loss, background/foreground |
| `aod-method-top` playback and settle | accepted first-frame proof; real leaf progress; terminal leaf completion | leaf autoplay owns progression while stage also invokes `aodAdapter.update()`; runner independently accepts every callback and can settle from stale progress | same `aod-method` runner, in ordered `admission → playback → settle` stages | leaf reports only exact-token physical frames/progress/completion; no leaf reducer or session write | runner ignores/suppresses progress that would restore the source to its hidden endpoint during admission; after proof acceptance it hands playback control back to leaf | `PhoneAod`/stage progress forwarding before proof acceptance; completion without accepted terminal progress | deterministic ordering: admission render → accepted proof → first allowed playback progress → terminal frame → completion |
| `aod-method-top` reverse | reverse boundary → `RUN_STARTED`; reverse timeline draw; terminal completion | same runtime driver state plus reverse autoplay/timeline callback can advance independently | same single runner with direction encoded in the machine token | `PhoneAod` reports the reverse canvas frame carrying its reverse token; no reused forward token/dataset | same machine revision and runner deadline; background resume must retain/restart only that exact revision | reverse `resetAutoplay()` side effects that bypass runner ownership | Method→AOD, stale forward frame rejection, context loss, background/foreground |
| failure / recovery for both directions | play rejection, prepare timeout, stalled compositor, WebGL context loss, visibility resume, dispose | `PhoneAod` silently marks DOM state; autoplay and driver each reset independently | machine dispatches the sole `FAILED`/rollback decision; runner performs one idempotent leaf reset after that decision | none; a failed/missing frame is a fact, never a proof | machine owns retry eligibility and deadline identity; gesture lease merely forwards an intent | driver-local `blocked`, `presented`, prepare/progress watchdogs and stage-local duplicate reset | blocked/retry, no frame, context loss, foreground resume, unmount cleanup in Chromium + WebKit |

Before browser work, prove this ledger with two gates:

1. A static writer gate must show one `aod-method` capability registration;
   no AOD path may call `reportRenderedFrame()` or
   `presentation.proofForRenderedFrame()`; and `PROGRESS_REPORTED`,
   `LEG_COMPLETED`, and `FAILED` for this run originate only from the
   registered runner's ordered callbacks.
2. Deterministic runner tests must assert forward and reverse callback order,
   rejection of stale/mismatched tokens, blocked gesture retry, no-frame and
   context-loss rollback, and background/foreground resume. The test must
   demonstrate that no playback progress is rendered between admission and an
   accepted first-frame proof.

### Frozen hard-cutover ledger: Services ↔ Figure3 ↔ Brand reverse admission

This ledger is closed and frozen. The first reverse after a completed forward
journey and two same-authority full-motion formal rounds pass in Chromium. The
Figure3 leaf has one `startRun()` production call site, inside reconciliation;
its handle only requests reconciliation. TTG, AOD, Figure2, Group 6–7, media
hashes, and timings remain frozen while the next ledger is active.

The reproduced first reverse after a completed forward run proves the concrete
failure sequence. The prior `Figure3 → Services` transition has retained its
endpoint at Services (`releasedEndpoint=1`), so its reverse render continues
to set Figure3 opacity to zero. In parallel, `PhoneFigure3` starts reverse
from its props effect before the runner has made Figure3 the visible source.
The paper compositor then draws real frames for the correct raw token while
the root remains a transparent `transition-receiver`; the presentation boundary
rightly rejects them and the machine remains in `preparing` until rollback.
This is a writer/order defect, not permission to weaken the visibility proof.

| State / canonical edge | Input events | All current writers or side paths to remove / constrain | Sole post-cutover owner | Exact proof producer | Timer / retry / disposal owner | Legacy entrance to delete | Required deterministic gates |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hold:figure3-animation` direct entry | initial URL, hash, menu, history → `DIRECT_ENTRY_REQUESTED` | runtime direct-entry preparation, `PhoneBrandLabContinuation` surface preparation, and `PhoneFigure3.prepareTargetPresentation()` can each advance readiness; its one-shot `prepareEndpoint()` can return before playback/video/compositor mount | the route-local machine transaction and the one registered Group 4–5 runner; the runner owns `admission → playback → settle`, while only the machine commits / rolls back | `PhoneFigure3` receives the exact direct-entry token, paints its real paper canvas after the matching compositor mounts, and reports that immutable raw frame once | machine owns deadline/retry/rollback and decides disposal; runner owns only an abortable callback subscription bound to that machine revision | unbound endpoint-ready / paper-frame dataset reuse and any poster fallback that marks ready without a current compositor paint | delayed mount cannot resolve early; current token resolves exactly once after paper paint; stale/aborted token cannot resolve a later direct entry; target is visibly Figure3, never fallback Brand |
| `brand-services`, leg 0 `brand-figure3`, forward and reverse | sampled boundary → `RUN_STARTED`; ink renderer first frame | `PhoneInkTransition` callback, composite runner endpoint calls, tuple session methods, and scene callbacks can each influence advancement | same Group 4–5 runner stage; machine remains the only state / projection authority | ink leaf reports a physical `effect-frame` with its complete token; it never asks runtime to mint a token or reports a reducer event directly | machine deadline and retry identity; runner owns one abort controller and releases it exactly once after the machine’s commit or rollback | `PhoneCompositeSession[5]` `reportRenderedFrame()` use for this leg and direct endpoint-driven advancement | forward/reverse callback order; mismatched authority/session/generation/leg/revision/subject/kind rejected; no second writer can move the leg |
| `brand-services`, leg 1 `figure3-services`, first reverse after forward | reverse boundary → `RUN_STARTED`; exact terminal target paint; runner admission; real Figure3 canvas frame | `PhoneFigure3` props reconciliation and handle `enter()` / `reverse()` directly call `startRun()`; reverse runner leaves `Figure3ServicesTransition.releasedEndpoint=1`, leaves Figure3 as an invisible receiver, and `playback.reset(0)` can overwrite a pending terminal target | the one `phone-brand-lab` Group 4–5 runner owns the ordered admission: clear its old media endpoint, promote `Figure3 → Services` roles, then issue the leaf playback intent; the Figure3 leaf may start only from its reconciliation after that intent and an exact prepared target | the Figure3 paper compositor forwards one complete, immutable `PhoneRenderedPresentationFrame` only after it has physically painted a visibly composited Figure3 source; runner forwards it unchanged | machine owns timeout/retry/rollback/input release; the runner owns one abortable resource and role handoff; Figure3 cancels endpoint/frame callbacks and retires its token on abort, terminal, or unmount | direct props/handle `startRun()` calls; un-cleared reverse transition endpoint; receiver-role first-frame path; unconditional zero bootstrap reset | deterministic reverse order is `prepared terminal token → runner clears old endpoint → Figure3 becomes visible source → runner playback intent → exact raw proof accepted → first progress`; old/mismatched token, callback, endpoint, progress, and completion all remain inert; first reverse and two same-authority cycles pass in Chromium |
| same-authority repeat and cancellation | two consecutive full forward/reverse journeys; disposal; retry; unmount | mutable `resources` can retain timer, capability retention, release callback, or stale leaf callback past a machine terminal state; `canStart()` currently observes that local resource rather than a proven disposed transaction | machine terminal event is the single admission-release point; the runner may retain ephemeral resources only while its exact session is live | no proof after terminal/cancel; all callbacks carry the original complete token and are ignored once that token is retired | machine owns input unlock and retry eligibility; runner cancels its one controller/timer and drops all retained handles before the next admission is permitted | runner-local retry/rollback that leaves a live resource or lets an old callback relabel a new leg | deterministic two full cycles under one authority; post-rollback retry; stale frame/progress/complete after disposal; assert the next session/generation starts cleanly and input accepts it |
| reduced motion for this scope | same boundary/direct inputs with reduced motion preference | `settleReduced()` synthesizes a proof and calls progress/endpoint commits synchronously; browser tests currently demand no transaction while the machine deliberately exposes a candidate transaction | one normal, short machine transaction with the same Group 4–5 runner admission stage; no alternate no-transaction path | leaf paints one authored static endpoint after layout and reports its exact token-bound declared proof; runner forwards it unchanged and never manufactures proof | machine owns candidate, deadline, rollback, commit, cleanup, and input release; runner has no autonomous settle, playback timer, or progress branch | `settleReduced()` proof synthesis and the current “every trace state has null session/free input” assertion | candidate → exact post-paint proof → stable; stale rejection, timeout/unmount/context-loss rollback, then next input succeeds |

Before any Chromium/WebKit rerun, all of these static and deterministic gates
must be green:

1. The Group 4–5 writer gate proves exactly one `brand-services` capability
   registration, one runner phase owner, and one machine proof ingress. Group
   4–5 production code may not call generic `reportRenderedFrame()`,
   `presentationProofToken()`, or `presentation.proofForRenderedFrame()`.
   `PhoneFigure3.startRun()` may occur only inside `reconcileMedia()`; its
   handle may request reconciliation but cannot directly start playback.
   `PhoneFigure3` must expose a raw frame callback, not merely an execution
   tuple; no leaf may dispatch a machine event or obtain a new token.
2. A deterministic order suite covers leg 0 and leg 1 in both directions:
   `admission render → accepted exact proof → first permitted progress →
   terminal frame → completion → cleanup`. For the reverse media leg it must
   prove runner `begin()` and the Figure3 source-role handoff precede the leaf
   intent, and that the retired Services endpoint cannot hide the first raw
   frame. It rejects every stale token field, drops progress/complete during
   admission, and proves a second full cycle under one authority succeeds after
   the first is disposed.
3. A mounted Figure3 direct-entry test starts with no media/compositor, mounts
   it after target preparation, and proves the matching paper paint resolves
   the same revision once. It also proves abort/re-entry cannot let the first
   callback satisfy a newer revision.
4. The transaction test’s terminal `verifying-target` assertion is reconciled
   with the written projection contract before changing either side. If a
   locked target is a `candidate`, the test must assert that intentionally;
   it must not be weakened merely to make the suite green.
5. The cutover is net shrinking. Delete the generic Group 4–5 proof bridge and
   reduced-motion duplicate path in the same change, then require
   `phoneJsRawBytes <= 659456` (the 663552 hard cap minus 4096 bytes) before
   adding any further non-essential logic. Do not lower the hard cap or turn
   the existing headroom warning into a waiver.

   Package-budget implementation constraint: the existing
   `phone-gsap-driver.ts` may replace its GSAP-core dependency with an
   equivalent cancelable native `requestAnimationFrame` tween for Hero
   parallax and Method reading reveal only. It remains a stateless decorative
   driver: it may not own a transaction, admission, playback, proof, retry,
   input lock, or lifecycle timer. This is a same-file dependency deletion,
   not a new adapter, facade, or presentation path.

The targeted deterministic suites, full unit/type/build gates, and Chromium
two-round reverse regression are green. This freezes Figure3 only; it neither
authorizes WebKit nor makes the global Task 10 matrix green.

### Frozen hard-cutover ledger: Pattern ↔ StarMap reduced-motion admission

This scope is closed and frozen. It covers both `Pattern → StarMap` and
`StarMap → Pattern` when motion is reduced. TTG, AOD, Figure2, Figure3,
Group 6–7, media hashes, timings, and normal-motion front-rail behavior remain
frozen while a later ledger is active.

The reproduced Chromium failure starts from `hold:pattern`, crosses the
reduced rail into StarMap geometry, then returns to `hold:pattern` without a
stable StarMap. The trace alternates `pattern-complete` and
`star-map-reading`: a reduced rail sample publishes an ordinary scene hold,
`startedHoldCandidate()` creates an unrelated run-null direct-entry-style
transaction (`verifying-target`, `reducedMotion: false`), and the generic
presentation fallback can synthesize a browser-frame proof because neither
front leaf has a token-bound presentation adapter. Those are competing writers
and cannot be made correct by relaxing the browser assertion.

| State / canonical edge | Input events | All current writers or side paths to remove / constrain | Sole post-cutover owner | Exact proof producer | Timer / retry / disposal owner | Legacy entrance to delete | Required deterministic gates |
| --- | --- | --- | --- | --- | --- | --- | --- |
| reduced `hold:pattern → candidate:star-map` | one `front-rail` positional `SCROLL_SAMPLED` fact after the document sampler crosses into the StarMap interval | `phoneFrontRailSampleTuple()` emits a plain scene hold; `nextSampledScroll()` may publish stable directly; `startedHoldCandidate()` marks the transaction non-reduced and direct-entry-like; the stage keeps rendering samples while the candidate has no owner | the existing route-local machine transaction plus its existing session controller/engine admission branch; `usePhoneStageRuntime` only reports geometry and renders the machine projection | `PhoneStarMap.presentPresentation()` receives the complete raw token after the candidate projection, draws in one animation frame, then reports one `PhoneRenderedPresentationFrame` in the following post-paint frame | session controller owns the reduced-proof deadline, rollback, token retirement, and input release; leaf owns only cancellable draw/proof frame callbacks | reduced direct-hold publication and run-null direct-entry preparation for this sampled edge | candidate is `preparing`, `reducedMotion: true`, target projection is `candidate`, input is locked, no progress/complete event can change it; only the exact post-paint StarMap token commits stable |
| reduced `hold:star-map → candidate:pattern` | one reverse `front-rail` sample in Pattern geometry | same direct stable sample path, plus a retained StarMap paint callback may arrive after the Pattern revision begins | same machine/session-controller branch; no reverse-only runner, scroll owner, or recovery object | `PhonePattern.presentPresentation()` draws in one animation frame and returns the complete bound token only in the following post-paint frame | same machine deadline and rollback; abort/unmount disposes the binding before a new revision starts | stale StarMap binding and generic scheduled presentation frame | wrong authority/session/generation/leg/revision/subject/kind and an old mount callback are inert; exact Pattern token alone settles the reverse candidate |
| leaf/static proof boundary | candidate publication, leaf mount/re-arm, unmount, context loss | `PhonePattern`/`PhoneStarMap` expose only `update()/enter()/reverse()`; `presentation.activatePresentationAdapter()` falls back to a generic scheduled proof when no leaf adapter exists | engine asks the registered target surface for a proof; it does not call direct-entry preparation/readiness/landing for this reduced sampled candidate | each leaf owns one bound token and reports after a true canvas draw; the runtime validates/forwards that raw frame but never re-mints a token | machine rollback owns failure; adapter disposal cancels only the current leaf callback | generic front-surface fallback proof; any leaf call that dispatches a machine event | mounted/rebound target must paint after the token is armed; no adapter means no proof and a timeout rollback, never a synthetic success |
| repeat / failure recovery | exact proof, deadline, abort, unmount, next wheel epoch | a prior transaction's scroll sample, token binding, or static paint can race a new candidate; direct-entry settle can alter landing independently | machine terminal transition is the only commit/rollback/input-unlock point; sampler observes but never settles the candidate | no retired token or post-disposal callback can produce a proof | session controller owns the one 6-second deadline and rollback; leaves cancel their one callback | old sample-to-stable writer and any candidate-local timer | two full forward/reverse reduced cycles under one authority; timeout/context-loss rollback returns to source then next input starts cleanly |

The implementation is deliberately a hard cutover, not a new front runner or
facade:

1. Carry the reduced-motion bit only as a positional front-rail sample fact.
   The runtime bridge constructs the named reducer event in its own chunk.
2. For a reduced sample whose scene differs from the committed front hold,
   create the ordinary machine transaction in `preparing` with
   `reducedMotion: true`, immutable revision/token, input locked, and no
   progress clock. Keep ordinary non-reduced scroll-run behavior unchanged.
3. The existing engine/session controller recognizes only this reduced,
   run-null sampled candidate and arms its normal reduced-proof deadline. It
   requests the target leaf binding directly; it does not run
   `prepareDirectEntry()`, read readiness, issue a landing command, emit
   progress, or call a synthetic endpoint commit.
4. Register `front:pattern` and `front:star-map` as token-bound presentation
   adapters. Each leaf draws in one animation frame and reports the original
   complete raw token only in the following post-paint frame; disposal/re-arm
   cancels and invalidates the old binding.
5. Exact proof causes the existing reduced reducer branch to commit stable and
   clear the session. Missing proof, abort, unmount, or context loss follows
   the existing machine rollback; normal direct entry remains untouched.

The red deterministic gates required before browser work were:

1. forward and reverse reduced samples: `hold → preparing candidate → exact
   raw static proof → stable`, with input locked only during the candidate;
2. rejection of every stale token field, progress/complete before proof, and
   old mount callback after a new revision;
3. proof timeout/rollback followed by a successful next input;
4. a static writer gate proving front reduced candidates do not call
   `nextSampledScroll()` stable publication, `prepareDirectEntry()`, generic
   presentation fallback, or any leaf reducer/session method; and
5. two same-authority full reduced front cycles in the existing E2E file.

Closure evidence:

1. Static writer gates require both canvas leaves to use the raw-frame bridge,
   forbid generic proof/session APIs, and require the cancellable post-paint
   callback; the homepage module boundary gate also passes.
2. Deterministic rail, machine, engine, presentation, and leaf tests pass:
   reduced candidates remain `preparing`, reject progress/completion and stale
   tokens, bind only the target leaf, and settle only from the exact raw token.
3. `pnpm typecheck` and the full suite pass (`223` files / `1598` tests).
   Production build passes its cross-chunk contract and budget gate with
   `phoneJsRawBytes=631657` and `31895` bytes of hard-cap headroom.
4. Chromium passed the existing-file same-authority test
   `Pattern → StarMap → Pattern → StarMap → Pattern`, with each candidate
   locked, post-paint proof-gated, and finally stable with a null session.

This freezes Pattern ↔ StarMap only. It does not authorize WebKit or make the
global Task 10 matrix green.

### Frozen hard-cutover ledger: Services ↔ TTG ↔ Lab

This scope is frozen after the hard cutover. It covers both directions of
`services-lab`, direct `#ttg-animation` entry, reduced motion, and repeated
use of the same route-local authority. TTG reuses the registered Group 4–5
runner and machine transaction; it owns no Brand Lab-specific runner, proof
builder, timer, recovery branch, or facade.

Closure evidence is deliberately narrow: the TTG handle exposes no direct
`enter()` / `reverse()` playback writer; reconciliation is the sole
production `startRun()` call site; a pending, non-aborted exact target selects
the decoder bootstrap endpoint; stale/aborted targets fall back to frame zero.
The deterministic suite covers the lineage and endpoint policy, and Chromium
passed the full-motion `Lab → Services → Lab → Services → Lab` journey twice
under one authority, with stable holds, no session, and free input after each
leg. This freezes TTG only. It does not make the global Task 10 matrix green
or authorize WebKit; this ledger stays frozen while Pattern ↔ StarMap is
active.

The current evidence isolates two ownership gaps. TTG target preparation can
be retired by snapshot reconciliation before its matching media owner exists.
Its forward admission proof is intentionally leg 0 while TTG playback is leg
1, so the handoff must validate a declared `services-ttg → ttg-lab` lineage
(same authority/session/generation and direction, advancing revision, and a
physically prepared old endpoint), rather than claim those two complete tokens
are equal. Its
direct-entry branch also waits for an unbound second video callback before the
adapter has received the token it needs to report. In reduced motion Lab does
not expose the native-leaf static-poster adapter required by the existing
runner contract, so `Lab → Services` rolls back before a proof can be
requested. Both are contract holes, not permission to bypass the transaction.

| State / canonical edge | Input events | All current writers or side paths to remove / constrain | Sole post-cutover owner | Exact proof producer | Timer / retry / disposal owner | Legacy entrance to delete | Required deterministic gates |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hold:ttg-animation` direct entry | initial URL, hash, menu, history → `DIRECT_ENTRY_REQUESTED` | `PhoneTtg.prepareTargetPresentation()` mounts media while snapshot reconciliation may independently call `releaseMedia()`; a pre-binding `requestVideoFrameCallback` is treated as readiness | route-local machine transaction plus the registered Group 4–5 runner; the runner owns admission and the machine alone commits / rolls back | `PhoneTtg` retains the immutable target lease until abort, prepares the endpoint with that exact token, and only `presentPresentation(token, report)` emits the later raw native-video frame | machine deadline/retry/rollback; runner owns its abortable subscription; TTG owns only the cancellable decoder callback | direct-frame ready dataset and pre-binding callback as a readiness authority; target release during the mount/re-arm gap | delayed TTG mount retains the current token; exact endpoint token is required; stale/aborted target cannot satisfy the next direct revision; formal `#ttg-animation` is visibly TTG |
| `services-lab`, leg 0 `services-ttg`, forward and reverse | boundary input → `RUN_STARTED`; Services/TTG entry effect first frame | transition endpoint calls, snapshot media bridge, and legacy tuple callbacks can race the candidate | the one Group 4–5 runner stages `admission → playback → settle`; machine owns all state and projection commits | the effect leaf reports its full immutable `effect-frame`; runner forwards it unchanged | machine owns rollback/retry; runner owns one controller and releases its retention exactly once | any generic proof reconstruction or direct reducer/session writer in this edge | forward/reverse order; every stale token field rejected; progress/complete dropped before accepted proof |
| `services-lab`, leg 1 `ttg-lab`, forward and reverse | accepted leg-0 proof; TTG decoder frame; real playback progress; terminal completion | TTG media callbacks, transition endpoint operations, and retained terminal media can outlive a retired generation; a target preparation can finish after its matching leg-1 execution and retain the lease over the pending runner playback | same runner stage and the active machine revision | `PhoneTtg` reports a bound `PhoneRenderedPresentationFrame` only from its real video callback; runner forwards it unchanged | machine owns terminal cleanup/input release; runner cancels timer, retention, and token binding on terminal, rollback, and unmount | endpoint / dataset reuse as a proof, unconditional cross-leg equality, and any runner-local completion after disposal | a physically prepared target yields only to its exact active token (direct/reverse) or the declared forward `services-ttg` leg-0 → `ttg-lab` leg-1 successor with matching authority/session/generation/direction and advancing revision; admission proof precedes first progress; stale frame/progress/complete after disposal are ignored; two full forward/reverse cycles under one authority leave no retained resource |
| reduced `Services ↔ Lab` | same boundary input with reduced-motion preference | absent Lab adapter causes immediate rollback; a no-transaction or synthetic-proof fallback would create a second lifecycle | same one runner and candidate transaction; no reduced-only lifecycle | `PhoneLab` / `PhoneServices` paint the authored static endpoint and report one exact `leaf-static-poster` raw frame | machine owns candidate timeout, rollback, stable commit, and input release; runner owns one post-layout request and no playback timer | `settleReduced()` / synthetic endpoint proof / session-free assertion | short candidate → exact static proof → stable; missing/wrong/stale token rejected; timeout/unmount rollback then next input succeeds; zero animated progress |
| cancellation and same-authority reuse | terminal completion, failed admission, unmount, second journey | retained capability, media target, timeout, callback, or old frame can outlive the terminal transaction | machine terminal event is the one release point; runner only retains per-live-session resources | no retired token can produce a later proof | machine owns input eligibility; runner aborts controller, disposes static binding and retention, TTG clears target binding | resource-based `canStart()` or old callback acceptance | deterministic two cycles and one rollback/retry under one authority; all callbacks after disposal are ignored |

Before another browser run, prove this ledger with these gates:

1. One `services-lab` capability registration and the existing single
   `phone-brand-lab` Group 4–5 runner are the only run owner. Group 4–5 source
   paths have zero generic `reportRenderedFrame()`,
   `presentationProofToken()`, and `proofForRenderedFrame()` calls.
2. TTG deterministic tests prove target-lease retention, exact-token endpoint
   re-arm, the declared leg-0 → leg-1 lineage handoff with advancing revision,
   and stale/aborted token rejection without relying on a ready dataset.
3. Native reduced tests prove Lab and Services emit `leaf-static-poster` only
   after their post-layout paint callback, with the original full token; the
   runner must not report progress, completion, or a synthesized proof.
4. A same-authority runner suite covers both directions twice plus
   timeout/rollback, and proves capability retention, timer, binding, and
   input eligibility are clean before the next start.
5. `pnpm typecheck`, full unit tests, module boundary gate, and production
   build remain green with `phoneJsRawBytes <= 659456`. Only then run Chromium;
   WebKit remains blocked until Chromium Task 10 is 7/7.

#### Reduced-motion non-bypass contract (confirmed)

Reduced motion is a presentation strategy, never a second lifecycle. Every
Group 4–5 boundary or direct target follows this fixed sequence:

~~~text
hold:source / input free
→ candidate:target / reduced session / input locked
→ exact post-paint proof accepted
→ hold:target / session null / input free
~~~

1. Input creates one machine transaction carrying the complete immutable
   token.
2. The machine publishes `candidate` and locks input; it does not publish
   `stable` on a scroll landing, dataset, or endpoint assignment.
3. The runner performs admission only. It starts no animation, emits no
   `PROGRESS_REPORTED`, and owns no playback timer in reduced motion.
4. For a native Group 4–5 target, the runner makes one candidate-only target
   layout request to the route-local runtime; the runtime alone performs the
   physical document scroll while the candidate remains locked. The runner
   then waits one paint before asking the leaf for evidence. This placement is
   neither a commit nor a second lifecycle: it is the runner's one
   admission-layout request and cannot unlock input or publish a hold.
5. The leaf paints the authored static endpoint, then reports one raw proof
   with the unchanged complete token and `origin: 'leaf-static-poster'`.
   That origin names only a physical native-leaf post-paint fact; the
   presentation boundary may validate it as that registered native surface's
   terminal edge only when its exact token kind is `static-poster`. It never
   mints or rebuilds a proof, and an unlabelled/generic callback remains
   rejected as a terminal static endpoint. The runner forwards it unchanged.
6. After accepting that proof the machine commits `stable`, retires the
   transaction, and releases input. No runner-side synchronous settle is
   permitted.
7. A missing proof, deadline, unmount, or context loss is a machine rollback;
   the runner only cancels its bound subscription/controller.
8. Retired authority/session/generation/leg/revision/subject/kind tokens and
   their callbacks can never satisfy a newer transaction.

The browser contract therefore asserts a short candidate (not an always-null
session), zero animated progress and zero synthesized proof, a stable terminal
with cleared session/free input, and a rollback that immediately accepts the
next input.

#### Projection-state meanings (confirmed)

- `transition`: an authored dynamic effect is actively playing.
- `candidate`: the target is projected but not yet committed; input remains
  locked while an exact proof is pending or terminal verification runs.
- `stable`: the exact proof has been accepted and the transaction has
  committed.

Consequently a terminal `verifying-target` projection is intentionally
`candidate`; update its unit assertion as a contract correction only after the
above behavior is covered.

### Task 0: Preserve the reviewed WIP and baseline

**Files:**

- Modify: docs/superpowers/plans/2026-07-29-r5-phone-global-presentation-contract-recovery.md
- Create: docs/react-refactor/reports/r5-phone-presentation-state-machine-convergence-baseline.md
- Create: this plan

- [x] **Step 1: Freeze the exact reviewed WIP**

  Run:

  ~~~bash
  git add -A
  git commit -m "chore(r5): checkpoint presentation recovery wip"
  git status --short
  ~~~

  Result: checkpoint 14af18a contains 91 files and the worktree is clean.

- [x] **Step 2: Record immutable and behavioral baseline evidence**

  Run:

  ~~~bash
  cd app
  pnpm run verify:media:phone-masters
  pnpm typecheck
  pnpm test
  pnpm build
  env PLAYWRIGHT_PORT=4175 pnpm exec playwright test \
    --config playwright.phone.config.ts \
    --project=phone-webkit \
    --grep "Task 0"
  ~~~

  Record source hashes, 1,276 passing unit tests, the 634,120-byte phone
  bundle, and the Pattern edge mismatch. Do not delete the WebKit failure
  artifact until its replacement test passes.

- [ ] **Step 3: Commit the plan and baseline report**

  ~~~bash
  git add docs/react-refactor/reports/r5-phone-presentation-state-machine-convergence-baseline.md \
    docs/superpowers/plans/2026-07-29-r5-phone-global-presentation-contract-recovery.md \
    docs/superpowers/plans/2026-07-29-r5-phone-presentation-state-machine-convergence.md
  git commit -m "docs(r5): plan presentation state-machine convergence"
  ~~~

### Task 1: Lock red behavior gates before migrating ownership

**Files:**

- Create: app/src/production/phone/phone-story/machine.test.ts
- Create: app/src/production/phone/phone-story/manifest.test.ts
- Modify: app/e2e/r5-phone-story.spec.ts
- Modify: current legacy tests only to make desired failure observable

- [ ] **Step 1: Add exhaustive proof-rejection tests**

  Write table-driven tests over all 16 canonical holds. Each starts from a
  candidate revision and supplies one invalid condition at a time: missing
  target content, hidden/disconnected root, incomplete coverage, wrong edge,
  stale observedAt, and a proof from a wrong authority/session/generation/leg/
  revision/subject. Assert the only outcome is retained prior projection or
  rollback, never a new stable snapshot.

  ~~~ts
  for (const scene of canonicalSceneIds) {
    it(scene + " never commits without same-revision proof", () => {
      const candidate = requestHold(scene);
      expect(canCommitPresentation(candidate, clock.now())).toBe(false);
      expect(reduce(candidate, { type: "PRESENTATION_COMMITTED" }))
        .toEqual(retainedProjection(candidate));
    });
  }
  ~~~

- [ ] **Step 2: Add direct-entry, stale-media, AOD, Hero, and layer red tests**

  Cover each direct entry source (initial, hash, menu, history), old
  Figure3/TTG/PH/Crane/AOD generation markers, drawArrays plus gl.getError()
  and context loss, Hero image/poster paint, and each segment's real effect
  placement. Assert behavior and geometry/pixels; do not inspect source text,
  CSS strings, or datasets as authority.

- [ ] **Step 3: Run red tests locally without a standalone red commit**

  ~~~bash
  cd app
  pnpm exec vitest run src/production/phone/phone-story/machine.test.ts \
    src/production/phone/phone-story/manifest.test.ts
  env PLAYWRIGHT_PORT=4175 pnpm exec playwright test \
    --config playwright.phone.config.ts \
    --project=phone-webkit \
    --grep "Task 0|direct entry|effect placement"
  ~~~

  The tests remain uncommitted until their owning implementation turns them
  green in Tasks 2 through 5.

### Task 2: Converge reducer and manifest into one commit authority

**Files:**

- Create: app/src/production/phone/phone-story/manifest.ts
- Create: app/src/production/phone/phone-story/machine.ts
- Create: app/src/production/phone/phone-story/runtime.ts
- Modify: app/src/production/phone/PhoneStoryShell.tsx
- Modify: app/src/production/phone/PhoneBrandLabStory.tsx
- Modify: app/src/production/phone/usePhoneStoryOrchestratorRuntime.ts
- Delete: reducer/orchestrator/contract/presentation legacy modules as their
  imports reach zero; defer AOD gate, presentation plane, and QA shell removal
  to Tasks 3, 4, and 6 respectively

- [ ] **Step 1: Encode all canonical declarations in the manifest**

  Implement one literal record for every canonical scene and segment. No
  default policy is permitted.

  ~~~ts
  export const sceneManifest = {
    hero: { subject: "front:hero", proof: "static-poster", direct: "hero-content" },
    pattern: { subject: "front:pattern", proof: "dom-content", direct: "pattern-content" }
  } as const satisfies Record<CanonicalSceneId, SceneManifest>;
  ~~~

  Each segment declares source/receiver, effect element and host, either
  between or above-both placement, first-frame proof kind, and directional
  donor policy.

- [ ] **Step 2: Implement candidate-to-commit reduction**

  Route SCROLL_SAMPLED, HOLD_RECONCILED, direct entry, forward transition, and
  reverse transition through PRESENTATION_REQUESTED, then publish only from
  PRESENTATION_COMMITTED.

  ~~~ts
  case "PRESENTATION_COMMITTED":
    return canCommitPresentation(snapshot, event.now)
      ? publishCommittedProjection(snapshot)
      : retainCommittedProjection(snapshot);
  ~~~

  Reading-hold input may continue after a failed proof, but the new scene never
  becomes stable without proof. A cinematic failure rolls back and releases its
  active token.

- [ ] **Step 3: Make runtime the only side-effect owner**

  Move timers, gesture lease, retries, monotonic clock injection, transaction
  construction, and adapter callbacks into runtime.ts. PhoneStoryShell and
  PhoneBrandLabStory call the same factory with route-local scope; no
  brand-lab-specific lifecycle remains.

- [ ] **Step 4: Green ownership suite and commit**

  ~~~bash
  cd app
  pnpm exec vitest run src/production/phone/phone-story
  pnpm typecheck
  pnpm test
  git add src/production/phone
  git commit -m "refactor(r5): converge phone story ownership"
  ~~~

### Task 3: Bind every scene and media proof to active transaction

**Files:**

- Modify: app/src/production/phone/scenes/phone-packed-alpha-surface.ts
- Modify: app/src/production/phone/scenes/PhoneAod.tsx
- Modify: app/src/production/phone/scenes/PhoneHero.tsx
- Modify: app/src/scenes/figure3-animation/phone/PhoneFigure3.tsx
- Modify: app/src/scenes/ttg-animation/phone/PhoneTtg.tsx
- Modify: app/src/scenes/ph-animation/phone/PhonePh.tsx
- Modify: app/src/scenes/crane-animation/phone/PhoneCrane.tsx
- Modify: app/src/media/packed-alpha-video.ts
- Delete: app/src/production/phone/phone-aod-presentation-gate.ts
- Modify: corresponding Vitest files

- [ ] **Step 1: Replace marker authority with adapter contract**

  Every leaf adapter implements:

  ~~~ts
  export type PhonePresentationAdapter = Readonly<{
    prepare(token: PresentationToken): void | Promise<void>;
    present(token: PresentationToken, report: (proof: PresentationProof) => void): void;
    dispose(token: PresentationToken): void;
  }>;
  ~~~

  A new generation clears or replaces old media/canvas markers. Same-mode
  packed-alpha, same-endpoint Figure3, and TTG ready datasets cannot resolve a
  newer token.

- [ ] **Step 2: Make WebGL proof reflect a real draw**

  Emit packed-canvas-frame only after texture upload, drawArrays, context
  validity, and gl.getError() equals gl.NO_ERROR all succeed for the active
  token. Context loss, upload failure, stale callback, and retired canvas emit
  failure facts, never proof.

- [ ] **Step 3: Move AOD lifecycle facts into runtime**

  The AOD driver reports decoder readiness, play result, compositor frame,
  progress, completion, and failure. Runtime/machine owns blocked gesture
  retry, prepare deadline, progress watchdog, rollback, and lease cleanup.

- [ ] **Step 4: Green token identity tests and commit**

  ~~~bash
  cd app
  pnpm exec vitest run src/media/packed-alpha-video.test.ts \
    src/production/phone/scenes/phone-packed-alpha-surface.test.ts \
    src/production/phone/scenes/PhoneAod.test.tsx
  pnpm test
  git add src/media src/production/phone src/scenes
  git commit -m "fix(r5): bind phone frames to active presentation identity"
  ~~~

### Task 4: Project one atomic presentation plane

**Files:**

- Create: app/src/production/phone/phone-story/presentation.ts
- Create: app/src/production/phone/phone-story/presentation.css
- Modify: app/src/production/phone/PhoneStageRail.tsx
- Modify: app/src/production/phone/PhoneStageRail.css
- Modify: affected scene and transition registration points
- Delete: phone-story-projector.ts, phone-presentation-layers.ts,
  phone-surface-roles.ts, and phone-viewport-coverage.ts after migration

- [ ] **Step 1: Explicitly register all projection participants**

  Register scene surface, effect host, effect element, and coverage root before
  a transaction can be prepared. Do not use DOM scans or MutationObserver to
  discover a late effect.

- [ ] **Step 2: Commit full plane in one revision**

  A successful machine event supplies one immutable projection containing
  surface roles, effect roles, coverage geometry, edge/theme, body/html
  attributes, and visibility. presentation.ts applies all of them before it
  reports projection acknowledgement.

  ~~~ts
  const PHONE_LAYER_ORDER = [
    "coverage", "retained", "fixed", "stable",
    "transition-source", "transition-effect-between",
    "transition-receiver", "transition-effect-above"
  ] as const;
  ~~~

  Effect host and effect element are separate fields. A host equal to an
  endpoint cannot silently downgrade between or above-both.

- [ ] **Step 3: Split layout geometry from live coverage geometry**

  Keep ScrollTrigger layout geometry frozen except for width, orientation, or
  fullscreen changes. Update coverage geometry on every visualViewport.resize
  and visualViewport.scroll with a coalesced frame:
  left, top, right, bottom, revision. The coverage root covers those four
  edges; no Pattern-only CSS compensation is allowed.

- [ ] **Step 4: Verify all segment planes and commit**

  ~~~bash
  cd app
  pnpm exec vitest run src/production/phone/phone-story/presentation.test.ts
  env PLAYWRIGHT_PORT=4175 pnpm exec playwright test \
    --config playwright.phone.config.ts --project=phone-webkit \
    --grep "coverage|effect placement|Task 0"
  git add src/production/phone
  git commit -m "fix(r5): make phone presentation projection atomic"
  ~~~

### Task 5: Close Hero and direct-entry first-frame gaps

**Files:**

- Modify: app/src/production/phone/scenes/PhoneHero.tsx
- Modify: app/src/production/phone/scenes/PhoneHero.css
- Modify: app/src/production/phone/usePhoneFixedStageRegistration.ts
- Modify: app/src/production/phone/phone-story/runtime.ts
- Modify: app/src/production/phone/phone-entry-plan.ts
- Modify: app/e2e/r5-phone-story.spec.ts
- Modify: corresponding unit tests

- [ ] **Step 1: Gate Hero on painted static proof**

  Synchronously apply Hero progress zero, wait for required image decode and
  poster readiness, verify connected/visible root, then wait one browser
  presentation frame before reporting its token-bound static proof. Loader exit
  follows that proof. A below-Hero direct entry must not create Hero WebGL, ink,
  or media.

- [ ] **Step 2: Make each formal direct entry transactional**

  Initial URL, hash, menu, and history target one request path. The manifest
  declares target content/frame predicate for all 12 formal endpoints; cursor
  location, coverage, registration, and a ready dataset are insufficient.
  Failed cinematic entry remains candidate or rolls back. Reading entry may
  retain prior committed projection while accepting input.

- [ ] **Step 3: Green browser matrix and commit**

  ~~~bash
  cd app
  pnpm exec playwright test --config playwright.phone.config.ts \
    --project=phone-chromium --grep "Hero|direct entry"
  env PLAYWRIGHT_PORT=4175 pnpm exec playwright test \
    --config playwright.phone.config.ts --project=phone-webkit \
    --grep "Task 0|Hero|direct entry"
  git add src/production/phone e2e/r5-phone-story.spec.ts
  git commit -m "fix(r5): close phone first-frame and direct-entry presentation"
  ~~~

### Task 6: Remove residual authorities and prove lifecycle cleanup

**Files:**

- Modify: app/scripts/verify-homepage-module-boundaries.mjs
- Modify: app/scripts/verify-homepage-module-boundaries.test.mjs
- Delete: obsolete QA and legacy shells after graph proof
- Modify: all affected imports/tests

- [ ] **Step 1: Make module graph reject split authority**

  The formal graph may import phone-story/runtime.ts only through
  PhoneStoryShell; the QA route may select the same factory with scope:
  brand-lab. Reject QA shells, separate brand-lab lifecycle modules, test-only
  production modules, and old compatibility wrappers.

- [ ] **Step 2: Assert disposal is total**

  Test formal and brand-lab unmount after each forward/reverse run. Every
  listener, timeout, RAF, media lease, adapter token, and coverage callback
  must be disposed exactly once.

- [ ] **Step 3: Enforce file and bundle budgets, then commit**

  ~~~bash
  cd app
  node scripts/verify-homepage-module-boundaries.mjs
  pnpm build
  git add src/production/phone scripts
  git commit -m "refactor(r5): remove split phone presentation authorities"
  ~~~

  The build gate must report non-test production phone files at or below 122
  and phone JS at or below 663,552 bytes.

### Task 7: Release validation and device acceptance

**Files:**

- Create: docs/react-refactor/reports/r5-phone-presentation-state-machine-acceptance.md
- Modify: app/e2e/r5-phone-story.spec.ts
- Modify: relevant Vitest tests and module-boundary verifier

- [ ] **Step 1: Run exhaustive automated gates**

  ~~~bash
  cd app
  pnpm typecheck
  pnpm test
  pnpm run verify:media:phone-masters
  pnpm build
  pnpm exec playwright test --config playwright.phone.config.ts \
    e2e/r5-phone-story.spec.ts --project=phone-chromium
  env PLAYWRIGHT_PORT=4175 pnpm exec playwright test \
    --config playwright.phone.config.ts \
    e2e/r5-phone-story.spec.ts --project=phone-webkit
  ~~~

  Record all 16 hold and 15 segment proof/plane assertions forward and reverse,
  all direct-entry sources, browser versions, bundle JSON, and retries.

- [ ] **Step 2: Complete physical iPhone Safari matrix**

  Record cold/warm start, toolbar expanded/collapsed/moving, lock/unlock,
  foreground/background, slow decode, autoplay blocked plus gesture retry,
  rapid gestures, Hero to Contact to Hero twice, normal/reduced motion, and
  all formal direct entries. Any failed row is a release blocker.

- [ ] **Step 3: Commit final verification**

  ~~~bash
  git add docs/react-refactor/reports \
    app/e2e/r5-phone-story.spec.ts \
    app/src/production/phone \
    app/scripts
  git commit -m "test(r5): validate unified phone presentation state machine"
  ~~~

## Final acceptance audit

Before calling the work complete, inspect current evidence for every item:

1. Pattern WebKit failure is gone because its new revision cannot commit without
   Pattern content, Pattern edge, and full coverage proof.
2. Stable means valid, unexpired proof for current identity; it is not a scroll
   cursor or coverage-only marker.
3. No reducer, runtime, projector, adapter, or AOD gate has a second
   commit-condition implementation.
4. Old frame/generation evidence never proves a newer transaction.
5. AOD starts visible progress only after successful compositor draw and
   survives blocked autoplay, context loss, and retry.
6. Hero has no loader-exposed full-frame flash, and every direct entry shows
   real target content.
7. Every effect is correctly layered in both directions without late DOM
   discovery.
8. Formal and QA route module/lifecycle boundaries remain correct, and
   disposal is leak-free.
9. Frozen timings, media hashes, copy, sequence, donor behavior, production
   file count, and bundle cap remain within contract.
