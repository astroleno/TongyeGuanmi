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
