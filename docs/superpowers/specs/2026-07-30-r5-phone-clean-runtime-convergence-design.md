# R5 Phone Clean Runtime Convergence Design

**Status:** Reviewed and accepted after conditional-review amendments. This
document is architecture-ready; no production implementation has started.
The user explicitly selected a clean convergence from the confirmed Unit 4–7A
scene baseline instead of continuing to repair the current Unit 7B/recovery
runtime.

**Decision date:** 2026-07-30

**Implementation branch:** `codex/r5-phone-clean-runtime-convergence`

**Exact base:** `9652fbec9aa18bfe989d6ed1b62d2c61f3a31f7f`
(`merge(r5): integrate Unit 6 phone donor`)

## 1. Problem statement

The phone route has repeatedly passed reducer, source-contract, Chromium, and
Playwright WebKit gates while still exhibiting physical presentation failures:

- AOD can remain locked without a compositor frame.
- Pattern and Figure2 can expose a bottom/right strip.
- Hero can expose a completed frame, reset, or change stage topology after the
  Loader disappears.
- A stable cursor can be published while edge color, layer ownership, target
  content, or pixels still belong to the previous scene.
- Formal `/` and QA composition have carried separate lifecycle behavior.
- Lazy slice boundaries and later property-name mangling introduced a second
  class of execution-contract failures.
- The attempted repair grew the reachable production phone directory from 76
  non-test files at `9652fbe` to 122 at `be9db27`, without achieving physical
  iPhone release acceptance.

The underlying problem is not a missing AOD condition or CSS patch. It is that
story authority, presentation proof, input ownership, media proof, and route
composition were allowed to commit independently.

## 2. Evidence-backed baseline

The accepted donor commits are:

| Unit | Commit | Frozen value |
| --- | --- | --- |
| Unit 4 | `3deb717` | Front/Grade A scene geometry, Figure2 media and authored handoffs |
| Unit 5 | `35b0aee` | Brand–Lab scenes and persistent Figure3/Services reverse compositor |
| Unit 6 | `ab7353e` | PH–Contact scenes, packed-alpha media, and reverse compositor contracts |
| Unit 7A | `eca6bc2` | Safari endpoint presentation and accepted Figure3 paper endpoints |

`9652fbe` is the only integration point that contains all four donors and whose
next commit is the Unit 7B integration (`c808e06`). The clean branch therefore
starts at `9652fbe`; it does not start at `d4d29bc`, `be9db27`, or the
presentation-recovery branch.

The clean baseline is executable:

- `pnpm -C app test`: 170 files, 950 tests passed.
- `pnpm -C app typecheck`: passed.
- `pnpm -C app build`: passed.
- Phone JavaScript: 628,044 bytes against the immutable 663,552-byte cap.
  `628,044` is the observed clean-base reference and optimization target, not a
  second hard cap for the not-yet-implemented runtime.
- Phone headroom against that cap: 35,508 bytes. The pre-existing budget
  script also asserts a separate 4 KiB phone/total reserve, which makes the
  effective failure line 659,456 bytes. The clean-runtime cutover removes that
  phone/total reserve assertion and keeps it as a reported metric; 663,552
  bytes is the only phone-size failure line. The desktop reserve assertion is
  unchanged.

The following inputs are immutable unless the user approves a separate visual
change:

- `assets/`
- `app/scripts/homepage-media-contract.mjs`
- `app/src/story/timings.ts`
- `app/src/story/copy.ts`
- `app/src/story/canonical-spine.ts`
- `app/src/story/manifest.ts`
- scene order, copy order, authored durations, camera composition, ink
  direction, media bytes, and persistent compositor semantics

## 3. Alternatives considered

### A. Continue the presentation-recovery branch

Rejected. It inherits both generations of phone orchestration, still has a
split presentation commit, and contains non-publishable WIP. Its real-browser
findings are valuable test donors, but its runtime is not a source donor.

### B. Shrink `be9db27` in place

Rejected. This requires proving which of 190 changed files are authoritative
while deleting compatibility paths around a state machine that already failed
physical presentation. Reversal cost and regression ambiguity are too high.

### C. Build one clean phone runtime from `9652fbe`, validate it in a
development-only harness, then perform one production cutover

Accepted. This preserves the last integrated Unit 4–7A scene/media baseline,
keeps the formal route on one runtime at all times, and lets the new authority
be proven before old orchestration is deleted in the cutover commit.

## 4. Architecture decisions

### ADR-1: One route-local authority, not one cross-route singleton

- Formal `/` may create exactly one authority, and only
  `PhoneStoryShell` may call `createPhoneStoryRuntime()`.
- `/brand-lab` is a QA-only route. `PhoneBrandLabStory` is a thin outer shell
  that renders the same `PhoneStoryShell` with `scope: 'brand-lab'`, an
  explicit initial entry, and QA diagnostics. The mounted `PhoneStoryShell`
  creates that route-local authority; `PhoneBrandLabStory` owns no runtime.
- Route changes dispose the previous object. The two routes do not share an
  in-memory store.
- The QA shell may choose an initial scene and expose diagnostics. It uses the
  same active-window mounting policy as formal `/`; it may not define a
  reduced lifecycle, reducer, projector, input policy, timing, media policy,
  or lifecycle callback.
- The formal module graph must not import `PhoneBrandLabStory`.

### ADR-2: One durable snapshot and one reducer

The phone runtime owns one discriminated snapshot:

```ts
type PhoneStorySnapshot =
  | Readonly<{
      status: 'transaction';
      authorityId: string;
      stateRevision: number;
      stableCommit: PhoneStableCommit | null;
      presentationProof: PhonePresentationProof | null;
      transaction: PhoneTransaction;
      scroll: PhoneScrollSample | null;
      viewport: PhoneViewportSnapshot;
    }>
  | Readonly<{
      status: 'stable';
      authorityId: string;
      stateRevision: number;
      stableCommit: PhoneStableCommit;
      presentationProof: PhonePresentationProof;
      transaction: null;
      scroll: PhoneScrollSample;
      viewport: PhoneViewportSnapshot;
    }>
  | Readonly<{
      status: 'faulted';
      authorityId: string;
      stateRevision: number;
      stableCommit: PhoneStableCommit | null;
      presentationProof: PhonePresentationProof | null;
      transaction: null;
      fault: PhoneTerminalFault;
      safeCover: PhoneSafeCover;
      scroll: PhoneScrollSample | null;
      viewport: PhoneViewportSnapshot;
    }>;
```

Semantic commit and mutable proof are separate values:

```ts
type PhoneStableCommit = Readonly<{
  sceneId: PhoneSceneId;
  landing: PhoneLanding;
  commitSequence: number;
}>;

type PhonePresentationProof = Readonly<{
  commitSequence: number;
  plane: PhonePresentationPlane;
  planeRevision: number;
  frameEvidence: PhoneFrameEvidence;
  contentEvidence: PhoneContentEvidence;
  coverageEvidence: PhoneCoverageEvidence;
  scrollEvidence: PhoneScrollEvidence;
}>;
```

The proof must bind the active stable commit's exact `commitSequence`.
`commitStableCandidate()` is the only reducer branch that creates or replaces
`PhoneStableCommit`; a stable scene settle atomically creates the matching
proof and increments the sequence exactly once.

Boot and direct entry are ordinary transactions with `stableCommit: null`,
`presentationProof: null`, and `transaction.mode: 'boot'`. Their phase,
identity, evidence, deadline, and retry state therefore remain in the reducer
snapshot; the effect interpreter may not keep a hidden boot candidate. A
failed rollback or failed Hero fallback enters the explicit `faulted` state
with a proven stable commit/proof when one exists, otherwise an opaque safe
cover and an accessible retry.

There is no separately writable cursor, checkpoint, current scene, stage scene,
edge scene, navigation scene, AOD phase, cinematic phase, lock, anchor, or
direct-entry state. Those values are either fields in the active transaction
or selectors over the snapshot.

The flat execution core separates pure state from browser effects without
creating another authority:

- `protocol.ts` contains pure serializable IDs, snapshots, events, effects,
  attempt keys, evidence slots, and report values;
- `machine.ts` contains the one reducer, pure selectors, identity guards, and
  the one stable-commit branch;
- `runtime.ts` contains the one route-local factory and effect interpreter,
  mints authority/transaction/generation identity, and owns browser adapters;
- `presentation.ts` contains DOM-bearing registration and proof contracts.

Together they provide one authority. `runtime.ts` is the only module that:

- owns story-lifecycle timers and progress RAFs, global input/history/viewport
  and page-lifecycle subscriptions, gesture epochs, media-activation credits,
  and AbortControllers;
- executes prepare/play/render/measure/scroll/release effects;
- handles initial/hash/menu/history entry;
- publishes snapshots.

Constructing runtime/projector objects is side-effect free. React may
construct an inert replacement before the previous route's cleanup runs, but
the prior connection must fully release listeners, input, clocks, activation,
and lifecycle ownership before the new connection can claim any of them.

Visual leaves may own strictly local render resources such as a Canvas
context, a video-frame callback, or a paused GSAP renderer. Those resources
may draw and report evidence for the active identity; they cannot advance the
story, choose a stable scene, or outlive leaf disposal.

### ADR-3: Stable is a presentation transaction, not a cursor value

A target may become stable only after all applicable evidence belongs to the
same attempt. Stage and leg identify evidence slots inside that attempt; they
are not part of the attempt identity:

```ts
type PhoneAttemptKey = Readonly<{
  authorityId: string;
  transactionId: string;
  transactionGeneration: number;
  mode: 'boot' | 'segment' | 'rollback' | 'recovery';
  segmentId: PhoneSegmentId | null;
  direction: 'forward' | 'reverse' | null;
}>;

type PhoneEvidenceSlot = Readonly<{
  attempt: PhoneAttemptKey;
  stageIndex: number;
  leg: 'source' | 'effect' | 'target' | 'rollback';
  kind: PhoneEvidenceKind;
  planeRevision: number | null;
}>;
```

Commit requires the manifest-declared slots under one `PhoneAttemptKey`; it
does not incorrectly require source, effect, target, and rollback reports to
share one `leg`.

Stable proof is deliberately two-stage:

```text
prepared:
  module loaded
  target root/media surface mounted inert and connected
  decode/draw ready
  layout measurable
  active closure/resource budget valid

expose:
  runtime atomically applies the candidate receiver plane
  projector acknowledges a new planeRevision

post-paint visible:
  source/receiver/effect roles applied
  target content visible in the current plane
  required frame visibly presented in the current plane
  live visual viewport covered on all four edges
  target landing measured and scroll alignment confirmed
  edge/checkpoint/navigation derived from the same manifest record
```

The prior stable source visibly covers preparation and stays mounted as the
rollback anchor after candidate exposure. It must not occlude the receiver
inside the story stack during post-paint proof. During boot/direct entry, the
registered opaque Loader is the only permitted safety-cover exception: the
target must already be visible and unoccluded within the story stack beneath
it, and Loader release occurs only after the visible quorum.

Only after both stages succeed may `commitStableCandidate()` atomically create
the new stable commit and matching proof. Failure rolls back to the prior
stable source and releases input. A candidate scene is never published as a
stable scene.

Evidence identity is runtime-owned. Runtime/projector creates a closed leaf
port bound to attempt, stage, leg, allowed reports, and plane revision. Leaves
report mounted roots and local decode/draw/progress/completion facts without
supplying an evidence slot. Only projector may derive content visibility from
the registered root; a leaf cannot submit a content report or choose
`stageIndex`, `leg`, evidence kind, or revision.

### ADR-4: One presentation implementation

`presentation.ts` owns:

- explicit surface/effect registration;
- the single persistent stage and coverage plane;
- live visual-viewport sampling and measurement policy; runtime owns the
  corresponding global subscriptions and schedules coalesced applications;
- semantic layer-plan calculation;
- DOM application of one complete plane revision;
- target-content and first-frame validation;
- post-paint acknowledgement.

It does not own story progression. It reports facts to `runtime.ts`.

The CSS topology is fixed before Loader release. No later
`absolute → fixed` stage switch is allowed. The coverage plane and scene plane
must share one documented stacking context; a sibling opaque pseudo-element
may not sit above the stage.

### ADR-5: Presentation gates are global

The following are required for every applicable hold and segment, not only for
Hero, AOD, Pattern, or direct-entry fixtures:

- effect layer placement;
- dynamic visual-viewport coverage;
- media/compositor first frame;
- direct target content visibility;
- source/receiver endpoint continuity;
- forward and reverse terminal frame;
- reduced-motion static frame;
- rollback frame.

Datasets and CSS strings are diagnostics, not proof. Real browser geometry,
computed stacking contexts, frame callbacks, and pixel samples are the
acceptance evidence.

### ADR-6: Lazy chunks contain leaves, never authority

- `PhoneStoryShell`, `protocol.ts`, `manifest.ts`, `machine.ts`, `runtime.ts`,
  and `presentation.ts` load as one phone execution core.
- Only genuine scene and transition leaves are lazy.
- Lazy leaves may receive a narrow render/report port. They may not import the
  runtime, dispatch reducer events directly, retain the snapshot, or own input.
- Vite property-name mangling is forbidden. The clean implementation must not
  create a reserved-property registry or a generated cross-chunk policy file.
- Existing ESM module exports and ordinary Terser compression remain the
  chunk contract.
- If the bundle approaches the cap, duplicate orchestration is deleted; API
  property names are not mangled.

### ADR-7: Complexity is budgeted by authority, not by legitimate visuals

Distinct authored scenes and transitions may remain separate files. The file
problem is the number of lifecycle, compatibility, and cross-cutting owners.

At final cutover, `app/src/production/phone-story/` is constrained by this
flat ten-file allowlist:

```text
phone-story/
  PhoneStoryShell.tsx
  PhoneBrandLabStory.tsx
  protocol.ts
  manifest.ts
  machine.ts
  runtime.ts
  presentation.ts
  styles.css
  scenes.tsx
  transitions.tsx
```

Tests live beside these files or under `__tests__/` and do not count toward the
production budget. Genuine leaf components remain under canonical
`app/src/scenes/<scene>/phone*` and
`app/src/transitions/<segment>/phone*` paths.

Final structural limits:

- one runtime factory and one production call site;
- one reducer;
- one stable-commit path;
- one proof-only stable-plane reproject path;
- one input/listener owner;
- one viewport sampler;
- one presentation registry;
- zero compatibility wrappers;
- zero slice-level runtimes;
- zero production query aliases that replace the formal route;
- pure-machine and browser-effect dependency direction plus a total core LOC
  budget are hard gates; a lower file count may not be achieved by rebuilding
  a God module;
- no `runtime/`, `contracts/`, `registries/`, or `projectors/` subtrees under
  `phone-story/` without a new user-approved ADR.

### ADR-8: Desktop stability is matched through invariants, not object sharing

The phone route keeps native document scrolling and its phone presentation
geometry. It does not share a live Director object with desktop and does not
modify the stable desktop runtime during this project.

It must match the desktop route's important invariants:

- one active run;
- one input owner;
- one time owner;
- stale event rejection;
- target readiness before playback;
- atomic terminal settle;
- rollback to a visible committed endpoint;
- deterministic disposal;
- no route-local duplicate lifecycle.

Shared canonical story types, scene order, timings, and media remain common.

### ADR-9: Every entry and segment declares its dependency closure

One reducer is not enough if loading and mounting topology can still diverge.
Every forward leg, reverse leg, and direct entry therefore declares a bounded
closure in the pure manifest:

```ts
type PhoneDependencyClosure = Readonly<{
  load: readonly PhoneDependencyRef[];
  mount: readonly PhoneMountRole[];
  prewarm: readonly PhoneDependencyRef[];
  retainUntil: PhoneProofBoundary;
  exposeReceiverAfter: readonly PhonePreparedEvidenceKind[];
  retireAfter: PhoneProofBoundary;
  resourceBudget: Readonly<{
    videos: number;
    activeDecoders: number;
    canvases: number;
    webglContexts: number;
  }>;
}>;
```

The closure names required scene, transition, media, and compositor resources.
It defines how long the source and any terminal compositor survive, which
prepared proof permits receiver exposure, when retirement may happen, and the
minimum direct-entry set. Prewarming may load a module or metadata; it may not
mount a hidden story authority, start playback, consume a decoder, or expose
pixels.

The active mounting window is derived only from the stable commit plus the
active closure. Once that closure becomes an active transaction, its
already-loaded target root and media surface may be mounted inert under the
source/Loader. This `prepareMount` state is not prewarm. The source remains
mounted and visible through prepared module/root/decode-or-draw/layout proof.
Receiver exposure then applies one candidate plane; content, visible frame,
coverage, and scroll proof are post-paint consequences of that plane and can
never be prerequisites for exposure. Persistent Figure3/Services, TTG/Lab,
PH/Education, and Crane/Contact compositors retire only at their manifest
boundary. Delayed, failed, or stale loads are retired by attempt identity.
Runtime diagnostics and tests enforce the per-closure
video/decoder/Canvas/WebGL maxima.

### ADR-10: Runtime owns iOS media activation; leaves own only decode clocks

- Only runtime consumes a physical gesture epoch and may spend its
  single-use media activation credit.
- Activation is limited to media in the active dependency closure. A global
  `play() → pause()` unlock sweep is forbidden.
- If a lazy dependency is not ready before the Safari activation window
  closes, runtime finishes loading it, mounts its media surface inert under
  the source/Loader, retains that active closure in
  `awaiting-media-activation`, and releases cinematic input. The accessible
  CTA appears only after the exact surface is registered and a following
  physical gesture can synchronously call `play()` from the same event stack.
- That following gesture mints a new generation/token and retires stale frame
  callbacks, ports, and activation credits, but it does not unmount, re-import,
  or discard the just-prepared media topology. A synthetic retry may not
  recreate user activation.
- Cold direct entry to AOD, Figure2, Figure3, TTG, PH, or Crane first attempts
  the manifest-declared `muted` + `playsInline` autoplay path. Rejection keeps
  the Loader/safe cover, retains the prepared surface in
  `awaiting-media-activation`, and exposes the same readiness-gated “tap to
  continue” action. A declared static fallback is legal only when it
  independently satisfies the scene frame contract.
- `play()` resolution proves permission, never pixels. Media/compositor proof
  still requires the active frame/draw callback.
- A leaf may own a video decode clock, frame callback, Canvas, or WebGL
  context. It reports identity-bound progress/frame/complete/failure slots and
  may not advance a transaction or commit a scene.

### ADR-11: Revisions have four non-overlapping meanings

- `stateRevision` increments for every reducer state change.
- `commitSequence` lives on `PhoneStableCommit` and increments exactly once
  for a stable scene commit.
- `transactionGeneration` identifies one asynchronous attempt and changes on
  retry, supersession, layout invalidation, or lifecycle recovery.
- `planeRevision` increments for every complete DOM/visual-viewport plane
  application.

There is no separate `candidateRevision`, generic `revision`, or
`presentationRevision`. A toolbar coverage reproject may increase
`stateRevision` and `planeRevision`; it must not increase `commitSequence` or
make old frame evidence satisfy a new attempt.

Stable viewport and lifecycle recovery uses the one proof-only reducer branch,
`reprojectCommittedPlane()`. It retains the exact `PhoneStableCommit`, enters
a bounded `mode: 'recovery'` transaction, disables input, and replaces only
`PhonePresentationProof` after fresh proof:

- toolbar-only changes may reuse decoded bytes and an active draw token while
  the same registered surface remains connected, but must re-prove plane,
  visible content/frame, four-edge coverage, landing, and scroll;
- width/orientation/fullscreen changes may reuse only immutable module/decode
  cache and must re-prove layout plus every presentation fact;
- BFCache restore may reuse only immutable fulfilled module/decode cache and
  must mint a new generation/token and re-prove root, plane, content, frame,
  coverage, landing, and scroll.

No prior final evidence object is copied into the replacement proof. BFCache
restore with `stableCommit: null` keeps Loader opaque and restarts the original
boot/direct-entry candidate with a new generation; it cannot “re-prove” a
nonexistent committed source.

### ADR-12: Page lifecycle and chunk recovery are explicit transactions

`pagehide`, `pageshow`, and `visibilitychange` are reducer events. A persisted
`pagehide` suspends active deadlines, invalidates transaction evidence, pauses
local render resources, and leaves the document eligible for BFCache. A
persisted `pageshow` creates a new transaction generation, resamples the live
viewport, and uses `reprojectCommittedPlane()` before input resumes. It may
not attach duplicate listeners or reuse a media token.

Successful module promises may be cached. Offline detected before an import is
started waits for `online`, then performs that URL's first load in the current
Document. Once a native dynamic import or Vite preload has rejected, clearing
the application Promise reference is required for disposal/diagnostics but
does not make the browser retry the same module URL in that Document.
`vite:preloadError` is intercepted and its default error path suppressed while
recovery owns the surface.

Both a same-build native network rejection and an old-HTML/new-assets build
mismatch recover through at most one session-guarded page reload per
Document/build/chunk key. Runtime fetches the existing
`/r5-release-manifest.json` with `cache: 'no-store'` and uses its build/source
identity to classify the failure. If the rejection is observed while offline,
the committed source or Loader stays visible and runtime waits for `online`
before spending the one reload; it does not consume the guard against a
known-offline fetch. A second rejection after the guarded reload enters
fail-closed with an accessible retry/recovery action; it cannot loop. Delayed
successful responses remain attempt/generation-bound and cannot satisfy a
newer transaction.

## 5. Event and transaction model

The reducer accepts seven event families:

| Family | Examples | Rule |
| --- | --- | --- |
| entry | `ENTRY_REQUESTED`, `HISTORY_REQUESTED` | Initial/hash/menu/history use one path |
| input | `GESTURE_STARTED`, `INTENT_CLAIMED`, `SCROLL_SAMPLED` | Only runtime attaches physical listeners |
| preparation | `TARGET_MOUNTED`, `MEDIA_PREPARED`, `PREPARE_FAILED` | Closed ports report prepared facts; readiness never commits presentation |
| playback | `FIRST_FRAME`, `PROGRESS`, `STAGE_REACHED`, `DWELL_ELAPSED`, `PLAYBACK_COMPLETE`, `PLAYBACK_FAILED` | Every report carries current identity |
| presentation | `PLANE_APPLIED`, `TARGET_PROVEN`, `SCROLL_CONFIRMED` | Stable commit requires the complete set |
| media activation | `ACTIVATION_OFFERED`, `ACTIVATION_SPENT`, `ACTIVATION_REQUIRED` | Only an active physical epoch can activate closure media |
| page lifecycle | `VISIBILITY_CHANGED`, `PAGEHIDE`, `PAGESHOW` | BFCache and foreground recovery create explicit generations |

An animated transaction follows:

```text
stable(source)
→ preparing
→ presenting-source
→ playing
→ dwelling/awaiting-leg-intent when the canonical staged policy requires it
→ playing the next leg
→ presenting-target
→ aligning
→ verifying
→ stable(target)
```

A staged stop remains part of the same transaction and generation. Its
manifest-declared delay or fresh gesture advances the next leg; neither creates
a slice runtime or a stable target. A delay proves only dwell completion and
can never substitute for frame or presentation evidence.

Failure follows:

```text
any transaction phase
→ rolling-back
→ source plane proven
→ source scroll confirmed
→ stable(source), input free

rolling-back deadline/proof failure
→ faulted(proven source + retry, or opaque safe cover + retry)

boot target failure
→ new Hero boot transaction
→ stable(Hero) or faulted(opaque safe cover + retry)
```

Every phase has a manifest-named active-foreground deadline. Hidden time does
not silently expire a phase; backgrounding invalidates its evidence and
foreground recovery starts a new generation with a fresh bounded deadline.
There is no state in which `rolling-back` or `preparing` can persist without a
deadline, safe terminal state, and accessible retry.

Reduced motion uses the same transaction and skips only animated progress:

```text
stable(source)
→ preparing
→ presenting-target
→ target static frame proven
→ aligning
→ verifying
→ stable(target)
```

Scene-internal native reading/scrub progress is a scroll sample on the stable
snapshot, not another lifecycle. It may render progress, but it cannot write
the stable commit, layer plan, checkpoint, or input lock. A pure selector may
derive a native-reading sub-checkpoint from the stable scene plus the current
scroll sample; that derived value is not separately writable state.

## 6. Input and scroll rules

- Runtime owns one wheel/touch/pointer/key/scroll listener set.
- Native reading corridors pass through and are not `preventDefault()`ed.
- A cinematic boundary may claim an intent only when the current manifest edge
  and direction match.
- A claimed physical epoch may start at most one transaction.
- Momentum/tail events from a completed epoch cannot start the next segment.
- No free-floating pending intent survives a stable commit, rollback, direct
  entry, visibility/page-lifecycle change, BFCache restore, or route disposal.
- `scrollTo()` is an effect with command identity and one bounded correction.
  It is never a polling loop and never a stable-commit substitute.
- Contact controls, focus, pointer interaction, links, and native scrolling
  remain outside cinematic interception.

## 7. First-frame and coverage rules

### Hero

Hero progress zero is synchronously applied before the Loader can reveal the
stage. Required images decode, the stage topology is already fixed, a
post-paint proof is accepted, and only then may the Loader exit. There is no
completed-frame default and no later zero reset.

### AOD and packed-alpha scenes

`video.play()`, advancing `currentTime`, a ready dataset, or a generic RAF does
not prove a visible frame. The proof must be causally emitted by a successful
compositor draw for the active token. A dummy/no-WebGL compositor reports
failure immediately; it cannot remain silent until a long watchdog expires.

### Viewport coverage

Layout geometry and coverage geometry are separate:

- authored/ScrollTrigger layout geometry changes only on width, orientation,
  or fullscreen invalidation;
- the coverage rectangle tracks every coalesced
  `visualViewport.resize`/`scroll` sample, including `offsetLeft`,
  `offsetTop`, width, height, and scale.

No scene-specific strip, negative bottom, overscan pseudo-element, or
Pattern-only gradient may hide a failed coverage contract.

### Layering

Every segment declares whether its effect is between endpoints or above both.
The browser gate inspects actual stacking contexts and pixels. Numeric
z-index token comparison alone is insufficient.

## 8. Migration strategy

1. Keep the old `9652fbe` production phone route unchanged while the clean
   runtime is built in a DEV-only harness.
2. Before leaf work, create a per-file/per-hunk `c808e06` disposition ledger.
   Mark every visual, media, lifecycle, and test hunk `port`, `rewrite`, or
   `reject`; record the Unit 4–7A formal trace separately from the detached
   Unit 7B v36/R4 Group 6–7 donor trace.
3. Add protocol, pure machine, dependency-closure, media-activation, and
   real-browser contracts before connecting donor leaves.
4. Integrate Front/AOD, Grade A, Group 4–5, and Group 6–7 in canonical order
   using mandatory vertical slices with independent red tests, browser
   checkpoints, and commits.
5. Require a visual checkpoint after each slice; do not modify the frozen
   scene/media/timing contract to make the runtime pass.
6. Switch formal `/` to the clean shell in one cutover commit.
7. In that same commit, remove the old reachable orchestration and query-based
   validation compositions. Formal `/` never mounts two authorities.
8. Add `/brand-lab` only after the shared factory is green; the QA route is
   separately lazy and absent from the formal module graph.
9. Complete physical iPhone Safari and BFCache acceptance before making a
   release claim.

Later branches are evidence sources only. No whole commit after `9652fbe` may
be cherry-picked. Rendering fixes and tests are ported by reviewed path/hunk
against the clean APIs.

## 9. Completion definition

The design is complete only when:

- all 16 canonical holds and 15 segments pass forward and reverse transaction
  tests;
- Front/AOD, Grade A, Group 4–5, and Group 6–7 share one runtime authority;
- every stable commit has matching presentation, coverage, content, frame,
  edge, checkpoint, navigation, scroll, and input evidence;
- Hero has no Loader-to-stage flash;
- AOD fails fast or displays a proven compositor frame and always releases
  input;
- Pattern/Figure2 and every other surface pass four-edge pixel checks;
- all direct entries show target content on their first exposed frame;
- formal and QA routes share implementation but not object identity;
- old orchestration files and compatibility paths are removed;
- the flat ten-file allowlist, dependency direction, authority counts, and
  total/per-file LOC gates pass without a God module;
- every direction and direct entry has an executable dependency closure and
  resource budget;
- iOS media activation is runtime-scoped, while leaves report only
  identity-bound decode/render facts;
- pagehide/pageshow persisted recovery cannot duplicate authority, reuse stale
  evidence, or expose unproven pixels;
- phone JavaScript remains below the immutable 663,552-byte cap; `628,044`
  remains the clean-base target/warning, and the accepted cutover records the
  new stable baseline plus duplicate-core/eager-leaf/max-lazy-chunk checks;
  phone/total 4 KiB reserve remains a report metric rather than a second
  failure line;
- no property-name mangling or generated reserved-field registry exists;
- lazy leaves never import runtime/machine, receive dispatch, choose evidence
  identity, or submit content proof;
- Chromium and WebKit engine gates pass;
- iOS Simulator evidence is recorded;
- a physical iPhone Safari matrix passes with toolbar movement, orientation,
  background/foreground, lock/unlock, slow media, reduced motion, rapid
  gesture, direct-entry, and two full round trips.

Automated chunk/fault gates may earn `Chunk-contract-complete`; they cannot be
called “chunk closed” and the branch cannot be called `Release-complete` until
the physical iPhone matrix also passes. Physical evidence binds
`candidateCodeSha`, `productionTreeHash`, the existing release-manifest build
identity, and the exact tested artifact. A later `finalHandoffSha` may differ
only by documentation; a scoped tree/diff gate must prove that `app/`,
`assets/`, package manifests, build configuration, and lockfiles are identical
to the tested candidate.
