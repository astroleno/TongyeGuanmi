# R5 Phone Visual Lease and Reverse Playback P0 Closure Plan

> **For implementation:** REQUIRED SUB-SKILL: use
> `superpowers:executing-plans` task by task. Do not run tasks in parallel and
> do not widen a task into a general refactor. Each task installs its red gate,
> hard-cuts one vertical path, verifies it, and commits before the next task.

**Goal:** Restore a visibly continuous, reversible phone story at commit
`5ac6114`: retire Figure2's foreground Arch at its real lifecycle boundary,
make Figure2 z-depth admission depend on the current physical frame, restore
TTG and PH reverse playback, release the Services return path, remove AOD's
paper treatment during AOD playback, and fill Figure2's real middle camera to
the bottom of the dynamic iPhone viewport.

**Architecture:** Keep the existing one route-local `PhoneStoryShell`
authority, reducer, projector, runner, runtime factory, and immutable execution
tokens. The fix is below the reducer: every visible DOM layer, pooled Canvas,
decoder, and reverse clock must be a token-bounded lease of that authority.
No scene may infer readiness from a retained boolean, a wall clock, a cached
endpoint, or a previous Canvas claim. `/brand-lab` remains a QA route using the
same runtime factory; it must not enter the formal `/` module graph.

**Tech stack:** React 19, TypeScript 5.8, Vite/Rollup, Vitest 3, native video,
WebGL packed-alpha/Ink compositors, Playwright Chromium/WebKit for the final
browser gates, and physical iPhone Safari for release qualification.

Unless a command begins with `cd app`, run it from the repository root.

---

## Review verdict at `5ac6114`

**Status: implementation NO-GO and manual acceptance NO-GO.** The existing
browser `7/7` result is not sufficient evidence for the seven reported visual
contracts.

There is still one route authority; these failures do not prove that two
top-level state machines are mounted. They prove that presentation side
effects have not completed the same hard cutover:

| Reported symptom | Review finding | Confidence |
| --- | --- | --- |
| Arch appears in later chapters | `PhoneFigure2Arch` hard-codes `mounted` and `visible`; `PhoneGradeAStory` leaves the last Arch style untouched for every scene/run after Brand. | Confirmed |
| Figure3 and later transitions flash | The stale high-layer Arch is a confirmed contaminant. It is a strong cause, but a frame-attribution gate must prove whether any second stale endpoint remains before changing more code. | High, not yet exclusive |
| Figure2 z-depth disappears, then the route stalls | Figure2's single media-owner cutover is directionally correct, but the effect adapter accepts the pooled Canvas's unscoped `phonePresentationEffectFrame="ready"`. A recycled/old draw can admit the current leg without a current z-depth frame. | Confirmed contract gap |
| TTG reverse is static/broken | Reverse progress is advanced from `requestAnimationFrame` elapsed time while the decoder is driven by coalesced seeks. The clock can reach zero before Safari presents those frames. | Confirmed |
| PH reverse is static/broken | PH already has a presented-frame reverse driver, but reverse start can be released by the root-level `phonePhAlpha="verified"` status instead of requiring the fresh draw for the current presentation token after retire/restore. | High; close with a deterministic red re-arm test first |
| Reverse path stops at Services | The composite runner ignores progress/completion until the current leg has accepted a token-bound frame. TTG's early wall-clock completion can therefore leave the transaction to timeout/rollback around the Services leg. Do not add a Services-specific unlock patch. | High |
| AOD shows paper | AOD paper is explicitly painted by the AOD scene, viewport coverage, pseudo-elements, and `paper-solid`; it is not a random stale frame. | Confirmed |
| Figure2 floor has a large bottom gap | The phone override lost `width/height/min-height: 100%`; the current coverage test only checks that an image URL exists. The separate `background-size: cover` backing is not geometrically tied to the frozen Figure2 middle camera. | Confirmed |

### Evidence that the single authority itself is not duplicated

- `PhoneStoryShell.tsx` creates `usePhoneStoryRuntime('formal', ...)` once and
  mounts one `PhoneStoryRuntimeProvider`.
- `PhoneBrandLabStory.tsx` creates a mutually exclusive route-local
  `usePhoneStoryRuntime('brand-lab', ...)` from the same factory.
- Route switches should destroy the old instance. The goal is one authority
  per mounted route, not one in-memory object shared across mutually exclusive
  routes.

### Why current automation can pass while the manual result is wrong

1. The formal journey treats Services→Lab and Lab→Education as stable-to-stable
   runs; TTG and PH are internal composite visuals, not stable checkpoints.
2. The visual signature includes endpoint transforms/opacities and video
   `currentTime`. Those values can change while Safari still displays a late or
   static decoded frame.
3. The Figure2 coverage unit gate checks for the middle-image URL, not bottom
   pixels or alignment with the real middle camera.
4. No current formal gate requires the retained Arch DOM count to be zero after
   Brand.

---

## Non-negotiable decisions

1. Do not add another reducer, orchestrator, runner, timer owner, media element,
   proof synthesizer, transition wrapper, or route lifecycle.
2. Keep Figure2 leaf as the sole Figure2 media writer. The z-depth adapter owns
   only the depth/Ink effect. Do **not** revert `ownsMedia` to `true`.
3. The runner remains the only component allowed to start a transaction,
   select a leg, lock/unlock input, accept proof, commit, or rollback.
4. A scene/effect may report only a physical frame drawn for its exact current
   authority/session/generation/leg/revision token.
5. A pooled Canvas claim starts clean. Presentation datasets, visibility,
   opacity, clip/mask residue, and prior token identity cannot cross leases.
6. Reverse media progress is presentation-paced, not elapsed-time-paced.
7. Do not alter `app/src/story/timings.ts`, media bytes/hashes, scene order,
   copy, Figure2 authored z-depth mapping, or PH/Crane compositor artwork.
8. This plan explicitly supersedes the older AOD styling freeze: during AOD
   playback, paper wash, mist, solid, and paper texture are forbidden. A single
   fixed opaque AOD backing may remain only to prevent transparent/white edges;
   it must not animate, pop, or masquerade as Method paper.
9. Do not raise the `659,456 B` phone-JS cap. Recover code headroom by deleting
   obsolete paths as each hard cutover lands. Target at least `4,096 B` margin
   before release qualification.
10. Preserve the user's untracked
    `2026-08-05-r5-phone-cross-chunk-media-contract-closure.md` unchanged.

---

## Task 1 — Install seven honest red gates before product changes

**Files:**

- Modify: `app/src/production/phone/PhoneGradeAStory.test.ts`
- Modify: `app/src/production/phone/phone-ink-surface-pool.test.ts`
- Modify: `app/src/production/phone/transitions/grade-a-transitions.test.ts`
- Modify: `app/src/production/phone/phone-viewport-coverage.test.ts`
- Modify: `app/src/production/phone/adapter-groups/group4-5-native-autoplay.test.ts`
- Modify: `app/src/scenes/ttg-animation/phone/PhoneTtg.test.tsx`
- Modify: `app/src/production/phone/scenes/phone-packed-alpha-surface.test.ts`
- Modify: `app/src/scenes/ph-animation/phone/PhonePh.test.tsx`
- Modify: `app/src/production/phone/scenes/PhoneAod.test.tsx`
- Modify: `app/src/scenes/aod-animation/progress.test.ts`
- Modify: `app/e2e/r5-phone-story.spec.ts`

### Step 1: Add deterministic lifecycle red tests

Require all of the following:

- the Arch lifecycle projection returns mounted only for stable Figure2/Proof
  and active Method↔Figure2, Figure2↔Proof, Proof↔Brand legs; stable Brand and
  every later state return unmounted;
- a pooled Ink Canvas carrying an old `phonePresentationEffectFrame="ready"`
  cannot satisfy a new claim or new Figure2 token;
- a new Figure2 effect token must receive a new physical draw before reporting
  its first frame;
- a retained PH Canvas that has been prepared, released/retired, restored, and
  prepared with token B cannot use token A's `verified` status to start reverse;
- TTG reverse cannot advance canonical progress until its requested decoder
  frame resolves as presented;
- AOD progress never raises paper wash, bottom mist, or paper-solid opacity;
- Figure2 root geometry is at least the frozen stage height.

### Step 2: Add browser pixel/media red gates

In the existing phone E2E file, add targeted tests rather than another broad
journey helper:

1. `Proof → Brand → Figure3 → Services → TTG → Lab → PH → Education` samples
   every animation frame and asserts exactly zero connected/visible
   `[data-stage-retained-figure2-arch="true"]` nodes after Brand commit.
2. Attribute a flash by recording the top painted source/effect/receiver and
   screenshot pixels on both sides of every downstream handoff. If the Arch is
   gone but a flash remains, fail with the offending element; do not guess.
3. `Figure2 → Proof` must show at least three distinct **Canvas pixel hashes**
   from the current depth effect token before Proof commits. `currentTime`,
   dataset strings, transforms, and machine progress do not count.
4. Stable Figure2 and mid-z-depth frames must have no exposed bottom band and
   no seam between the real middle camera and live viewport coverage.
5. `Lab → TTG → Services` must show multiple strictly descending visible media
   times/pixel hashes, then settle at Services with `session=null` and input
   released. Run it twice in the same authority.
6. `Education → PH → Lab` has the same current-token, descending-frame, two-run
   requirement.
7. AOD samples at progress `0/.25/.5/.75/1` must contain no paper wash/mist/
   solid pixels or opacity. Method paper may first appear only during the real
   AOD→Method receiver handoff.

### Step 3: Run only the red gates

```bash
cd app
pnpm exec vitest run \
  src/production/phone/PhoneGradeAStory.test.ts \
  src/production/phone/phone-ink-surface-pool.test.ts \
  src/production/phone/transitions/grade-a-transitions.test.ts \
  src/production/phone/phone-viewport-coverage.test.ts \
  src/production/phone/adapter-groups/group4-5-native-autoplay.test.ts \
  src/scenes/ttg-animation/phone/PhoneTtg.test.tsx \
  src/production/phone/scenes/phone-packed-alpha-surface.test.ts \
  src/scenes/ph-animation/phone/PhonePh.test.tsx \
  src/production/phone/scenes/PhoneAod.test.tsx \
  src/scenes/aod-animation/progress.test.ts
```

Expected: failures name the stale Arch lifecycle, stale pooled-Canvas proof,
elapsed-time TTG reverse, PH token re-arm, AOD paper, and Figure2 height. Keep
the browser tests known-red until the corresponding vertical task lands.

### Step 4: Commit only the red gates

```bash
git add \
  app/src/production/phone/PhoneGradeAStory.test.ts \
  app/src/production/phone/phone-ink-surface-pool.test.ts \
  app/src/production/phone/transitions/grade-a-transitions.test.ts \
  app/src/production/phone/phone-viewport-coverage.test.ts \
  app/src/production/phone/adapter-groups/group4-5-native-autoplay.test.ts \
  app/src/scenes/ttg-animation/phone/PhoneTtg.test.tsx \
  app/src/production/phone/scenes/phone-packed-alpha-surface.test.ts \
  app/src/scenes/ph-animation/phone/PhonePh.test.tsx \
  app/src/production/phone/scenes/PhoneAod.test.tsx \
  app/src/scenes/aod-animation/progress.test.ts \
  app/e2e/r5-phone-story.spec.ts
git commit -m "test(r5): expose stale phone visual leases"
```

---

## Task 2 — Hard-retire the Figure2 Arch and close downstream flashes

**Files:**

- Modify: `app/src/production/phone/scenes/PhoneFigure2Arch.tsx`
- Modify: `app/src/production/phone/PhoneGradeAStory.tsx`
- Modify: `app/src/production/phone/PhoneGradeAStory.css`
- Modify: `app/src/production/phone/PhoneGradeAStory.test.ts`
- Modify: `app/src/stage/RetainedFigure2Arch.test.tsx`
- Modify: `app/e2e/r5-phone-story.spec.ts`

### Step 1: Project Arch lifecycle from the existing machine snapshot

Add one pure projection function in `PhoneGradeAStory.tsx` (or the existing
`phone-grade-a-runtime.ts`; do not create a new module) that returns only:

```ts
readonly [mounted: boolean, visible: boolean]
```

Its complete table is:

- stable Method: unmounted;
- stable Figure2/Proof: mounted;
- stable Brand and all downstream scenes: unmounted;
- active Method↔Figure2, Figure2↔Proof, Proof↔Brand: mounted;
- every other transaction: unmounted.

Pass those booleans into `PhoneFigure2Arch`. Remove the hard-coded `mounted`
and `visible`. Stable Brand must not call a style setter on a retained Arch;
after Proof→Brand endpoint release the DOM node must be absent.

### Step 2: Make reverse Brand→Proof readiness causal

When the `proof-brand` reverse transaction mounts the Arch, fold its image
`load/decode()` into the existing Grade A boundary preparation/capability. Do
not keep a hidden downstream DOM node and do not add a timer or a second state.
The transition can start only after the currently mounted image is decoded.
Abort/stale transaction callbacks are inert.

### Step 3: Delete obsolete post-Brand style persistence

Remove any branch whose only purpose is keeping the Arch at progress `1` in a
stable Brand/downstream state. Preserve the authored Figure2/Proof and
Proof↔Brand progress curves.

### Step 4: Verify before touching any other flash source

Run the Arch unit tests and targeted Chromium gate. If the downstream flash is
gone, stop. If it remains, use the frame-attribution failure to fix the named
stale endpoint in its existing owner. Do not introduce a global hide/reset
loop.

```bash
cd app
pnpm exec vitest run \
  src/production/phone/PhoneGradeAStory.test.ts \
  src/stage/RetainedFigure2Arch.test.tsx
pnpm exec playwright test e2e/r5-phone-story.spec.ts \
  --config playwright.phone.config.ts \
  --project phone-chromium \
  -g "Arch retirement|downstream handoff flash"
```

### Step 5: Commit the one lifecycle cutover

```bash
git add app/src/production/phone/PhoneGradeAStory.tsx \
  app/src/production/phone/PhoneGradeAStory.css \
  app/src/production/phone/scenes/PhoneFigure2Arch.tsx \
  app/src/production/phone/PhoneGradeAStory.test.ts \
  app/src/stage/RetainedFigure2Arch.test.tsx \
  app/e2e/r5-phone-story.spec.ts
git commit -m "fix(r5): retire Figure2 arch at its authority boundary"
```

---

## Task 3 — Close Figure2 as one vertical P0 chain

**Files:**

- Modify: `app/src/production/phone/phone-ink-surface-pool.ts`
- Modify: `app/src/production/phone/phone-ink-surface-pool.test.ts`
- Modify: `app/src/production/phone/transitions/figure2-distance-expand.tsx`
- Modify: `app/src/production/phone/transitions/grade-a-transitions.test.ts`
- Modify: `app/src/transitions/shared/phone-ink-runtime.ts`
- Modify: `app/src/production/phone/scenes/PhoneFigure2.css`
- Modify: `app/src/production/phone/scenes/PhoneFigure2.test.tsx`
- Modify: `app/src/production/phone/PhoneStageRail.css`
- Modify: `app/src/production/phone/phone-viewport-coverage.test.ts`
- Modify: `app/e2e/r5-phone-story.spec.ts`
- Reference only unless a red test proves otherwise:
  `app/src/production/phone/scenes/PhoneFigure2.tsx`
- Reference only: `app/src/transitions/figure2-distance-expand/index.ts`

### Step 1: Make every pooled Ink claim clean

Before rehosting the Canvas in `claimPhoneInkSurface`, clear the prior lease's:

- `phonePresentationEffectFrame` and other presentation/admission datasets;
- visibility and opacity;
- stale inline clip/mask/transform values owned by the prior renderer;
- prior token/generation marker.

Revocation and release remain idempotent. Keep one document-scoped Canvas/
context owner; do not recreate a Canvas on each leg.

### Step 2: Bind Figure2 effect readiness to the exact execution

At `begin(owner, report)`:

1. clear old effect readiness;
2. bind the exact current presentation token key plus a monotonically local
   claim generation;
3. arm the existing depth renderer;
4. report only after the current generation performs an actual in-between draw.

Replace the unscoped check of
`canvas.dataset.phonePresentationEffectFrame === 'ready'` with a current-token
result. Prefer a local primitive/tuple return from the existing bridge; do not
export another named cross-chunk object. Abort/release invalidates all queued
retries and callbacks.

`prepareFirstFrame()` must establish one causal bundle:

- exact current execution token;
- Figure2 terminal media already physically ready under the Figure2 leaf;
- current depth mask committed;
- current Ink/depth Canvas actually drawn;
- Proof remains hidden until the bundle is accepted.

Keep `ownsMedia: false`. The Figure2 leaf remains the only media writer.

### Step 3: Restore the real Figure2 floor geometry

Restore the phone Figure2 root to the frozen stage dimensions:

```css
width: 100%;
height: 100%;
min-height: 100%;
```

Do not restore the old local `display:none` lifecycle; projector surface roles
still own visibility.

Tie the viewport coverage image to the same frozen middle-camera width, height,
origin, and scale. The current generic `background-size: cover` centered in an
expanding coverage element is insufficient because its camera moves when the
visual viewport grows. Anchor coverage at the frozen layout origin and prove
the seam with pixels. If the real Figure2 root now covers the full live band,
remove the redundant image-backed coverage rather than keeping two mismatched
copies.

### Step 4: Verify the complete chain, including recovery

Required targeted cases:

- Method→Figure2→Proof full motion;
- Proof→Figure2→Method reverse;
- Figure2 direct entry then forward/reverse;
- refresh after a failed/aborted Figure2→Proof attempt;
- two same-authority cycles;
- no bottom gap at stable Figure2 or during z-depth;
- a missing physical depth frame rolls back and unlocks input within the
  existing timeout; retry then succeeds.

```bash
cd app
pnpm exec vitest run \
  src/production/phone/phone-ink-surface-pool.test.ts \
  src/production/phone/transitions/grade-a-transitions.test.ts \
  src/production/phone/scenes/PhoneFigure2.test.tsx \
  src/production/phone/phone-viewport-coverage.test.ts
pnpm exec playwright test e2e/r5-phone-story.spec.ts \
  --config playwright.phone.config.ts \
  --project phone-chromium \
  -g "Figure2 physical z-depth|Figure2 bottom coverage|Figure2 recovery"
```

### Step 5: Commit the full Figure2 vertical slice

```bash
git add app/src/production/phone/phone-ink-surface-pool.ts \
  app/src/production/phone/phone-ink-surface-pool.test.ts \
  app/src/production/phone/transitions/figure2-distance-expand.tsx \
  app/src/production/phone/transitions/grade-a-transitions.test.ts \
  app/src/transitions/shared/phone-ink-runtime.ts \
  app/src/production/phone/scenes/PhoneFigure2.css \
  app/src/production/phone/scenes/PhoneFigure2.test.tsx \
  app/src/production/phone/PhoneStageRail.css \
  app/src/production/phone/phone-viewport-coverage.test.ts \
  app/e2e/r5-phone-story.spec.ts
git commit -m "fix(r5): bind Figure2 depth to one physical lease"
```

---

## Task 4 — Replace TTG's elapsed reverse clock with presented-frame playback

**Files:**

- Modify: `app/src/production/phone/adapter-groups/group4-5-native-autoplay.ts`
- Modify: `app/src/production/phone/adapter-groups/group4-5-native-autoplay.test.ts`
- Modify: `app/src/scenes/ttg-animation/phone/PhoneTtg.tsx`
- Modify: `app/src/scenes/ttg-animation/phone/PhoneTtg.test.tsx`
- Reuse: `app/src/production/phone/phone-presented-reverse-playback.ts`
- Modify only if a generic regression is proven:
  `app/src/production/phone/phone-presented-reverse-playback.test.ts`
- Modify: `app/e2e/r5-phone-story.spec.ts`

### Step 1: Remove reverse from the free-running controller

`createGroup45NativeAutoplay` remains the forward native-playback controller.
Delete its reverse RAF elapsed-time state (`reverseElapsedMs`,
`reverseFrameTime`, and terminal completion derived from wall time). Do not
replace it with another interval or timeout.

### Step 2: Reuse the existing presented reverse primitive

Create TTG's reverse driver in `PhoneTtg.tsx` using
`createPhonePresentedReversePlayback`, following the accepted PH/Figure3
pattern:

1. request the next canonical TTG progress through
   `preparePhoneTimelineVideoFrame`;
2. verify the returned run id/direction and current abort generation;
3. only then render/publish that progress;
4. report the first current token-bound physical frame before any machine
   progress/completion;
5. complete only after the initial endpoint is physically presented.

Preserve the authored order: Lab dissolve → TTG reverse frames → Services Ink
exit. Stale callbacks after dispose, abort, remount, or a newer execution are
no-ops. The composite runner remains the only timeout/rollback owner.

### Step 3: Prove Services is released by the same fix

Do not patch Services input directly. The test must show that after TTG's final
accepted frame the existing runner commits Services, clears session/binding,
and releases input. Then one additional reverse gesture must start
Services→Brand normally.

### Step 4: Verify twice per authority and on remount

```bash
cd app
pnpm exec vitest run \
  src/production/phone/adapter-groups/group4-5-native-autoplay.test.ts \
  src/scenes/ttg-animation/phone/PhoneTtg.test.tsx \
  src/production/phone/phone-composite-runner.test.ts
pnpm exec playwright test e2e/r5-phone-story.spec.ts \
  --config playwright.phone.config.ts \
  --project phone-chromium \
  -g "TTG presented reverse|Services reverse release"
```

### Step 5: Commit TTG/Services as one vertical chain

```bash
git add app/src/production/phone/adapter-groups/group4-5-native-autoplay.ts \
  app/src/production/phone/adapter-groups/group4-5-native-autoplay.test.ts \
  app/src/scenes/ttg-animation/phone/PhoneTtg.tsx \
  app/src/scenes/ttg-animation/phone/PhoneTtg.test.tsx \
  app/e2e/r5-phone-story.spec.ts
git commit -m "fix(r5): pace TTG reverse by presented frames"
```

---

## Task 5 — Make PH reverse re-arm exact after retire/restore

**Files:**

- Modify: `app/src/production/phone/scenes/phone-packed-alpha-surface.ts`
- Modify: `app/src/production/phone/scenes/phone-packed-alpha-surface.test.ts`
- Modify: `app/src/scenes/ph-animation/phone/PhonePh.tsx`
- Modify: `app/src/scenes/ph-animation/phone/PhonePh.test.tsx`
- Modify only if the red test requires it:
  `app/src/production/phone/scenes/usePhoneCinematicRun.ts`
- Reference only: `app/src/scenes/ph-animation/phone/PhonePh.reverse.ts`
- Modify: `app/e2e/r5-phone-story.spec.ts`

### Step 1: Separate “a surface was verified” from “this token was drawn”

The packed-alpha surface must expose current preparation identity as a primitive
token key/generation. A root status of `verified` is diagnostic only; it cannot
authorize reverse start by itself.

On `activate/prepare/present` for token B after token A:

- clear A's verified frame identity;
- restore/rebind the retained Canvas/context;
- draw token B after the compositor is active;
- invoke PH's callback with token B only from that fresh draw;
- settle preparation and allow reverse only for B.

### Step 2: Remove the status-only reverse predicate

`PhonePh.reverseReady()` must require the exact current execution token/generation
that was reported by the compositor. Do not add the removed fallback timer and
do not synthesize a frame if WebKit withholds the draw. The existing bounded
runner rollback remains the failure path.

### Step 3: Preserve one Canvas owner

Retain the existing Canvas owner across ordinary release/retire and restore its
context as today. This task changes proof identity, not topology. Terminal
route disposal remains the only hard node removal.

### Step 4: Verify forward, reverse, two cycles, and background restore

```bash
cd app
pnpm exec vitest run \
  src/production/phone/scenes/phone-packed-alpha-surface.test.ts \
  src/scenes/ph-animation/phone/PhonePh.test.tsx \
  src/production/phone/phone-composite-runner.test.ts
pnpm exec playwright test e2e/r5-phone-story.spec.ts \
  --config playwright.phone.config.ts \
  --project phone-chromium \
  -g "PH token-bound reverse|PH retire restore"
```

The browser gate must use visible Canvas pixel hashes/media times, not only
`phonePhAlpha`, transform values, or machine progress.

### Step 5: Commit PH only

```bash
git add app/src/production/phone/scenes/phone-packed-alpha-surface.ts \
  app/src/production/phone/scenes/phone-packed-alpha-surface.test.ts \
  app/src/scenes/ph-animation/phone/PhonePh.tsx \
  app/src/scenes/ph-animation/phone/PhonePh.test.tsx \
  app/e2e/r5-phone-story.spec.ts
git commit -m "fix(r5): rearm PH reverse for the current token"
```

---

## Task 6 — Remove paper treatment from AOD playback

**Files:**

- Modify: `app/src/production/phone/scenes/PhoneAod.css`
- Modify: `app/src/production/phone/PhoneStageRail.css`
- Modify: `app/src/scenes/aod-animation/progress.ts`
- Modify: `app/src/scenes/aod-animation/progress.test.ts`
- Modify: `app/src/production/phone/scenes/PhoneAod.test.tsx`
- Modify: `app/src/production/phone/phone-viewport-coverage.test.ts`
- Modify only if removal is safe for desktop:
  `app/src/scenes/aod-animation/index.tsx`
- Modify: `app/e2e/r5-phone-story.spec.ts`

### Step 1: Split AOD coverage from Method coverage

Stop grouping `[data-portrait-edge-scene="aod"]` with Method's paper backing.
AOD receives one static, opaque, non-textured backing matching its approved
composition. Method retains the paper surface.

### Step 2: Eliminate AOD paper writers

During AOD playback keep all of these at zero/absent:

- reveal-surface paper wash;
- bottom mist;
- paper solid;
- paper texture/treatment on AOD scene, stage rail, `html/body/#root`, and
  viewport coverage.

Do not alter AOD media timing, alpha decoding, play confirmation, first-frame
proof, or AOD→Method transaction ownership. Method paper becomes visible only
as the real receiver during that handoff.

### Step 3: Verify pixels across the whole AOD timeline

```bash
cd app
pnpm exec vitest run \
  src/scenes/aod-animation/progress.test.ts \
  src/production/phone/scenes/PhoneAod.test.tsx \
  src/production/phone/phone-viewport-coverage.test.ts
pnpm exec playwright test e2e/r5-phone-story.spec.ts \
  --config playwright.phone.config.ts \
  --project phone-chromium \
  -g "AOD has no paper treatment"
```

### Step 4: Commit the visual contract separately

```bash
git add app/src/production/phone/scenes/PhoneAod.css \
  app/src/production/phone/PhoneStageRail.css \
  app/src/scenes/aod-animation/progress.ts \
  app/src/scenes/aod-animation/progress.test.ts \
  app/src/production/phone/scenes/PhoneAod.test.tsx \
  app/src/production/phone/phone-viewport-coverage.test.ts \
  app/e2e/r5-phone-story.spec.ts
git commit -m "fix(r5): remove paper treatment from AOD playback"
```

---

## Task 7 — Global architecture and browser qualification

**Files:**

- Modify if absent: `app/src/production/phone/PhoneUnit7BIntegration.test.ts`
- Modify if absent: `app/scripts/verify-homepage-module-boundaries.mjs`
- Modify: `app/e2e/r5-phone-story.spec.ts`
- Create after evidence exists:
  `docs/react-refactor/reports/r5-phone-visual-lease-p0-checkpoint-2026-08-09.md`

### Step 1: Enforce route/module authority

The architecture gate must prove:

- formal `/` imports `PhoneStoryShell`, never `PhoneBrandLabStory` or the QA
  route shell;
- `/brand-lab` uses the same reducer/projector/runtime factory;
- one mounted route has exactly one `data-phone-authority-id`;
- no new runtime/reducer/runner/proof factory was introduced by Tasks 2–6.

### Step 2: Run deterministic checks

```bash
cd app
pnpm typecheck
pnpm test -- --run
pnpm build
```

Expected:

- TypeScript and all Vitest files pass;
- production build, media inventory, module boundary, Boolean contract, and
  release/performance budget gates pass;
- phone JS is `<= 659,456 B`; release qualification requires at least `4,096 B`
  margin without raising the cap;
- no media hash or authored timing changed.

### Step 3: Run Chromium before WebKit

First run only the targeted P0 cases. Then run the complete phone matrix.

```bash
cd app
pnpm exec playwright test e2e/r5-phone-story.spec.ts \
  --config playwright.phone.config.ts \
  --project phone-chromium
```

Do not run WebKit while Chromium has any failing P0 case.

### Step 4: Run WebKit only after Chromium is fully green

```bash
cd app
pnpm exec playwright test e2e/r5-phone-story.spec.ts \
  --config playwright.phone.config.ts \
  --project phone-webkit
```

Require two consecutive complete same-authority forward/reverse cycles. A
timeout increase is not a fix. Record per-leg physical frame evidence, active
session, input lock, Canvas owners, WebGL context count, and rollback reason.

### Step 5: Physical iPhone Safari qualification

Run on a real iPhone with Safari browser chrome visible and collapsing:

1. cold Loader → Contact forward;
2. Contact → Hero reverse;
3. two uninterrupted forward/reverse cycles in one route authority;
4. direct entries for Figure2, Proof, Figure3, TTG, PH, Education, and Contact;
5. background/foreground during AOD, Figure2 z-depth, TTG reverse, and PH
   reverse;
6. toolbar expand/collapse while Figure2 is stable and while z-depth runs;
7. refresh after aborting Figure2 z-depth and after reaching Services.

Record video, model/iOS/Safari version, orientation, memory result, candidate
commit, and manifest hash. Entity-device evidence cannot be replaced by WebKit
emulation.

### Step 6: Create the checkpoint report and final commit

The report must list each of the seven reported issues as PASS/FAIL with a
direct test/video reference. Do not label the release GO while
`candidate=null`, memory qualification is pending, source is dirty, or entity
iPhone evidence is absent.

```bash
git add \
  app/src/production/phone/PhoneUnit7BIntegration.test.ts \
  app/scripts/verify-homepage-module-boundaries.mjs \
  app/e2e/r5-phone-story.spec.ts \
  docs/react-refactor/reports/r5-phone-visual-lease-p0-checkpoint-2026-08-09.md
git commit -m "test(r5): qualify phone visual lease closure"
```

---

## Final acceptance matrix

| Contract | Required proof |
| --- | --- |
| Arch lifecycle | DOM count `0` after Brand commit and throughout every later stable/transaction frame; reverse Brand→Proof remounts only after current decode readiness. |
| Downstream flashes | No one-frame out-of-contract layer/pixel at Figure3 and every later handoff; failure names the exact painted offender. |
| Figure2 z-depth | Current token produces multiple real depth Canvas frames, Proof commits, input unlocks; reverse, retry, refresh, direct entry, and two cycles pass. |
| TTG reverse | Visible media frames descend in order; no elapsed clock outruns decoder; stable Services has no session/input lock and can continue to Brand. |
| PH reverse | Current token is freshly drawn after retire/restore; visible frames descend; two cycles and background restore pass. |
| AOD visual | No wash, mist, solid, or paper texture during AOD playback; Method paper appears only in the AOD→Method receiver handoff. |
| Figure2 coverage | Real middle camera fills all four edges/corners and bottom live band with no gap or misaligned duplicate under Safari toolbar movement. |
| Unified authority | One authority per mounted route; formal graph excludes QA shell; all facts flow through the existing runner/machine. |

**Release rule:** browser automation can become GO only when all rows above are
green. Formal release remains pending until candidate binding, clean source,
memory qualification, and physical iPhone Safari sign-off are complete.
