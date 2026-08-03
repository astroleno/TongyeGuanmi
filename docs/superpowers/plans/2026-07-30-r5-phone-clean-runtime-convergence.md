# R5 Phone Clean Runtime Convergence Implementation Plan

> **Status:** architecture and execution contracts are frozen. Tasks 0–12 and
> their corrective reviews are complete. Task 12 is
> **GO / `Chunk-contract-complete`** on candidate-code input
> `a4ba41feaf76fb2f40afbcf222f1565216fac648`: focused phone-portrait WebKit
> complete-story passed 10/10 and the single final release run passed 227/227,
> with all unit, type, architecture, frozen-input, build, bundle, and evidence
> gates green. A clean detached candidate worktree is prepared at the exact
> code commit; no Task 13 build has run there yet. Task 13 has not started;
> its formal candidate/artifact freeze, Simulator, physical iPhone, and
> deployed-network acceptance remain open. See the
> [Task 12 closure review](../../react-refactor/reports/r5-phone-clean-runtime-task12-blocker-review.md).
> The
> verification cadence below removes redundant full-suite reruns without weakening any
> authority, chunk, presentation, or physical-device release gate. Do not
> reopen broad design review unless Appendix C is triggered.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Starting from the user-confirmed Unit 4–7A integration commit, replace
the accumulated phone orchestration with one route-local transactional state
machine, one presentation projector, one input owner, and one stable-commit
path, while preserving the accepted scenes, media, timings, camera
compositions, and reversible transition behavior.

**Architecture:** Build the new implementation while the `9652fbe` formal
authority and routing remain unchanged in a development-only harness; genuine
shared leaves may be refactored only through the stateless dual-service rule.
`PhoneStoryShell` is the only runtime factory call site. The runtime reduces
entry, input, preparation,
playback, presentation, rollback, fault recovery, media activation, BFCache
recovery, and disposal into one discriminated snapshot. One pure machine owns
the reducer and stable commit; one route-local runtime interprets browser
effects. Presentation reports evidence but cannot advance the story. Scene and
transition leaves report through a closed `PhoneLeafReportPort` and receive
visual commands through a non-authoritative `PhoneLeafCommandHandle`; they
cannot import runtime authority. Cold and warm entry remain distinct reducer
modes. Every entry/direction has one dependency closure and bounded mounting
window. An eager non-story bootstrap boundary protects rejection of the lazy
phone core. After all four donor groups pass, switch formal `/`
atomically, delete the old orchestration in the same commit, and add
`/brand-lab` as a thin QA wrapper around the same shell.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, GSAP, Canvas 2D, WebGL
packed-alpha compositing, Playwright Chromium/WebKit for critical browser
verification, iOS Simulator, physical iPhone Safari, pnpm.

**Accepted design:** [R5 Phone Clean Runtime Convergence Design](../specs/2026-07-30-r5-phone-clean-runtime-convergence-design.md)

---

## 0. Execution identity and isolation

This plan belongs only to the clean convergence worktree:

```text
Repository: /Users/aitoshuu/Documents/GitHub/TongyeGuanmi
Worktree:   /Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime
Branch:     codex/r5-phone-clean-runtime-convergence
Base:       9652fbec9aa18bfe989d6ed1b62d2c61f3a31f7f
```

The base is deliberate:

| Accepted donor | Commit | What is frozen |
| --- | --- | --- |
| Unit 4 | `3deb717` | Front/Grade A geometry, Figure2 media, authored handoffs |
| Unit 5 | `35b0aee` | Brand–Lab scenes and Group 4–5 compositor behavior |
| Unit 6 | `ab7353e` | PH–Contact scenes and reverse packed-alpha contracts |
| Unit 7A | `eca6bc2` | Safari endpoint presentation and Figure3 paper endpoints |
| Clean integration point | `9652fbe` | Contains all of the above; immediately precedes Unit 7B |

The neighboring worktrees are evidence sources only:

```text
/Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b
/Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-presentation-recovery
```

Rules for keeping the work independent:

- Do not merge or cherry-pick either neighboring branch.
- Do not copy an entire post-`9652fbe` production directory.
- Do not edit either neighboring worktree.
- A later commit may donate a reviewed test, a rendering hunk, or a reproduced
  failure only when the exact source commit and destination file are recorded.
- Findings may move between worktrees; lifecycle implementations may not.
- Keep one writer for `protocol.ts`, `manifest.ts`, `machine.ts`, `runtime.ts`,
  `presentation.ts`, and `PhoneStoryShell.tsx`. Group leaf work may proceed
  independently only after these core interfaces are frozen, and it may not
  edit them.

### Evidence-only post-base donor ledger

Later commits are not ancestry for this implementation. Their only allowed
use is listed here:

| Commit | Allowed donation | Explicit exclusion |
| --- | --- | --- |
| `c808e06` | only PH/Education/Crane/Contact visual/media/transition hunks and v36/R4 evidence explicitly classified in the Task 0 disposition ledger | `PhoneLabContactContinuation`, shell/adapters/loaders, cinematic-run/endpoint lifecycle, Vite strategy, and every unclassified hunk |
| `71e5ef9` | Grade A boundary readiness, Figure2 mask, Proof → Brand test cases | its phone lifecycle |
| `7e3e124` | opaque viewport-edge, actual layer, and pixel failure cases | recovery CSS/topology as an implementation |
| `19053c4` | decoded TTG terminal-frame and reverse behavioral hunks | its surrounding orchestration |
| `e883784` | prepare failure, rollback, and retry scenarios | runtime code |
| `82a4e68` | 28-file rendering patch reviewed per path/hunk: semantic booleans, GPU retirement, ink fixes, iOS fonts, Hero font | its parent lifecycle and any unrelated Vite strategy |
| `d4d29bc` | packed-master, boolean/build, performance, and full-story test ideas | its inherited `18b6a7c` runtime |
| `be9db27` | correction to the global iOS font assertion | all production orchestration |
| presentation-recovery WIP | reproduced Hero/AOD/coverage/stacking failures | all production source |

Never port or cherry-pick:

```text
c808e06 as a commit or any of its slice-local lifecycle integrations
f129540 hidden pre-play behavior
e4f7fe0, e2f9345, 17180d9, 18b6a7c runtime implementations
d4d29bc..be9db27 as a production implementation range
the presentation-recovery runtime/core
```

When a hunk is used, the commit body records source commit, source path,
destination path, and why the hunk is independent of authority.

`c808e06` is a mandatory exhaustive audit, not an optional donor. Before Task
1, every changed file and every mixed-purpose hunk must be classified in the
baseline report:

```text
kind = visual | media | lifecycle | test | build
decision = port | rewrite | reject
source path + hunk range
destination task/file
rationale and preserving test
```

The ledger must account for all 56 changed files and may split one file into
multiple rows. Task 10 cannot start while any PH, Education, Crane, Contact,
Lab → PH, PH → Education, Education → Crane, or Crane → Contact visual/media
hunk is unclassified.

## 1. Non-negotiable outcome

### 1.1 The only production core

At final cutover, `app/src/production/phone-story/` contains exactly the
following flat ten-file allowlist:

```text
app/src/production/phone-story/
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

Tests may be adjacent or under `__tests__/`; they are not production runtime
files. Genuine visual leaves remain under:

```text
app/src/scenes/<scene>/phone/
app/src/transitions/<segment>/phone.*
app/src/transitions/shared/
app/src/media/
```

The implementation must stop for an architecture review instead of silently
adding another cross-cutting production file when any of these budgets would
be exceeded:

| File | Maximum non-blank production lines |
| --- | ---: |
| `protocol.ts` | 450 |
| `presentation.ts` | 900 |
| `manifest.ts` | 550 |
| `machine.ts` | 1,100 |
| `runtime.ts` | 1,000 |
| `PhoneStoryShell.tsx` | 500 |
| `scenes.tsx` | 700 |
| `transitions.tsx` | 700 |
| `PhoneBrandLabStory.tsx` | 120 |
| Total TypeScript/TSX in the ten-file core | 5,000 |

`PhoneBrandLabStory.tsx` should be a thin wrapper, not a second shell. CSS does
not count toward the TypeScript limit but must remain one coherent stylesheet;
scene-specific styling belongs with the scene leaf.

No `runtime/`, `contracts/`, `registries/`, `projectors/`, `adapters/`, or
`compat/` subtree may be created under `phone-story/` without a new
user-approved ADR.

The ten names are an allowlist, not permission for ten authorities:

- `protocol.ts` is pure serializable types/events/effects; no DOM or React.
- `manifest.ts` is pure canonical data and dependency-closure declarations.
- `machine.ts` is the one pure reducer/selectors/stable-commit branch.
- `runtime.ts` is the one browser effect interpreter/factory.
- `presentation.ts` is the only DOM-bearing plane/viewport/proof module.

The architecture gate enforces this direction and the total budget. It must
reject both an eleventh file and an attempt to merge pure machine plus browser
effects into an over-budget God file.

The 5,000-line total is the authoritative ceiling. The per-file maxima sum to
6,020 only to provide local allocation headroom; they are not an alternative
total budget. The manifest must normalize repeated closure/deadline profiles
instead of duplicating 46 verbose records. If the authoritative Appendix E
matrix cannot be represented honestly under both the 550-line manifest cap
and 5,000-line total, stop before Task 3 implementation and use Appendix C;
do not compress field names or hide semantics in tuples.

### 1.2 The only authority

- `createPhoneStoryRuntime()` has exactly one production call site:
  `PhoneStoryShell.tsx`.
- Each mounted phone route gets one route-local runtime object.
- Route unmount disposes that object; no cross-route singleton is retained.
- `/brand-lab` renders `PhoneStoryShell scope="brand-lab"` and never calls the
  runtime factory itself.
- Formal `/` cannot statically import `PhoneBrandLabStory`.
- Runtime is the only story-lifecycle owner for reducer state, transaction
  identity, input listeners, lifecycle clocks, intent epochs, stable commit,
  rollback, direct entry, visibility recovery, and disposal.
- The eager bootstrap recovery controller may own only chunk/build lineage and
  one reload allowance. It owns no story lifecycle field and is not counted as
  a second story authority.
- Visual leaves may own only local render resources such as a Canvas context,
  `requestVideoFrameCallback`, or a GSAP renderer driven by runtime progress.
  Those resources cannot change story state directly and must be disposed
  through the leaf port.

### 1.3 State is committed once

There may not be separately writable versions of:

```text
current scene
stage scene
edge scene
checkpoint
navigation scene
active transition
input lock
AOD phase
cinematic phase
direct-entry state
scroll anchor
presentation plane
```

They are either fields of the one reducer snapshot/active transaction or pure
selectors over it. DOM datasets may mirror published state/commit/plane
counters for diagnostics; they are never read back as authority.

### 1.4 What must not change

Unless the user approves a separate visual-change ADR, implementation must
leave these trees byte-identical to `9652fbe`:

```text
assets/
app/scripts/homepage-media-contract.mjs
app/src/story/timings.ts
app/src/story/copy.ts
app/src/story/canonical-spine.ts
app/src/story/manifest.ts
app/src/story/spine.ts
app/src/story/media.ts
```

Frozen SHA-256 anchors:

| Input | SHA-256 |
| --- | --- |
| `app/src/story/timings.ts` | `40a542bdad8f9336ba5586a5450a1ea992794fa724915895d74a516323be88bd` |
| AOD packed master | `a97af562c62e86fa4d3be9afe9537145ddeb05b67f556934985bc2dbf9f154ec` |
| PH packed master | `39ed325feaa4afcd2c59f7479e6ad75edbe6f4f063ab2243a04afe2660c4f8e1` |
| Crane figure master | `80e971968a290ab1b4176cc754acdd4aaf85fecf5137a85295ccd9e7152105f5` |
| Crane flock master | `6c82ceeb31ce814e137c880ae41650e5d24df26a202a4af8a3d8a9d60dbeff00` |
| Figure2 packed pair | `d472ec0767f1d113ae8020ed232c763ba53c5821deb725660601172954bc63ef` |
| Figure3 initial paper | `98724a85700755b30d050746dc48764541704481c16a4c6ae91bc466eb1c1bdd` |
| Figure3 terminal paper | `a546aa40592810cf99aa38674f201dee771e295c81fd6ee1458205f17d16fbb2` |

The `assets/` tree object at the clean base is
`19f053c0acaf6edde9137015a743be3a913444d9`.

### 1.5 Forbidden shortcuts

The following fail review even if tests are green:

- whole cherry-picks after `9652fbe`;
- a second reducer, runtime factory, input listener set, viewport sampler, or
  stable-commit path;
- slice-level machines for Front, Grade A, Group 4–5, or Group 6–7;
- hidden pre-play that advances media behind the Loader;
- publishing target scene or target edge before target evidence is complete;
- timer/RAF completion used as a media-frame proof;
- `video.play()`, `currentTime`, `readyState`, or a dataset used as visible
  compositor proof;
- CSS source-string tests used as presentation acceptance;
- fake `visualViewport` used as release evidence;
- scene-specific edge strips, gradients, negative bottoms, overscan
  pseudo-elements, or `:has()` rules used to conceal coverage failure;
- `Suspense fallback={null}` on any direct-entry path;
- Vite/Terser property-name mangling;
- generated cross-chunk field registries or reserved-property manifests;
- a lazy leaf importing `runtime.ts`/`machine.ts`, receiving reducer
  `dispatch`, choosing an evidence slot, or submitting content proof;
- `it.fails`, `.skip`, conditional skips, swallowed browser assertions, or
  `waitForTimeout()` used as readiness;
- numbered production validation routes such as `?v=46`;
- query aliases that mount a second production composition;
- compatibility wrappers retained only to satisfy obsolete source-contract
  tests.
- cloned/rasterized/screenshot scene substitutes; transitions must use the one
  canonical live source and receiver leaves.

Three release invariants remain hard regardless of bundle pressure or schedule:

1. property-name mangling is never re-enabled;
2. lazy leaves never obtain runtime/dispatch authority;
3. Task 12 alone may establish `Chunk-contract-complete`, but neither chunks
   nor the release may be called closed until Task 13's physical iPhone matrix
   passes against the exact candidate artifact.

## 2. Canonical story inventory

### 2.1 Holds

`manifest.ts` must declare all 16 holds in this order. It must use descriptive
records, not packed numeric arrays.

| # | Scene ID | Checkpoint | Edge surface | Plane | Landing/content contract | Required frame proof |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `hero` | `hero-entered` | `#07110e` | `front` | `front-corridor`; `#portrait-spike-home` | decoded/static post-paint |
| 2 | `pattern` | `pattern-complete` | `#8f7f61` | `front` | `#portrait-spike-pattern-title` | image decode + composite paint |
| 3 | `star-map` | `star-map-reading` | `#06100d` | `front` | `#portrait-spike-star-title` | Canvas/static post-paint |
| 4 | `aod-animation` | `aod-stage` | `#ede4d2` | `front` | `aod-semantic-edge` | successful packed-Canvas draw |
| 5 | `method-top` | `method-intro` | `#ede4d2` | `native` | authored boundary; title and lead selectors | target content + post-paint |
| 6 | `figure2-animation` | `figure2-stage` | `#e2dac9` | `grade-a` | authored boundary | successful packed-Canvas draw |
| 7 | `figure2-proof` | `figure2-proof-opening` | `#ede4d2` | `grade-a` | `#figure2-proof-opening .r4-proof-opening__title` | target content + post-paint |
| 8 | `brand` | `brand-reading` | `#ede4d2` | `native` | `#phone-brand-title`; definition paragraph | target content + post-paint |
| 9 | `figure3-animation` | `figure3-stage` | `#ede4d2` | `group45` | persistent compositor landing | decoded/composited frame |
| 10 | `services` | `services-reading` | `#ede4d2` | `native` | title and hero paragraph | target content + post-paint |
| 11 | `ttg-animation` | `ttg-stage` | `#080d10` | `group45` | persistent compositor landing | decoded/composited frame |
| 12 | `lab` | `lab-stable` | `#ede4d2` | `native` | title and non-eyebrow hero paragraph | target content + post-paint |
| 13 | `ph-animation` | `ph-stage` | `#9889a5` | `group67` | persistent compositor landing | successful packed-Canvas draw |
| 14 | `education` | `education-reading` | `#ede4d2` | `native` | vertical title and lead paragraph | target content + post-paint |
| 15 | `crane-animation` | `crane-stage` | `#ede4d2` | `group67` | persistent compositor landing | successful packed-Canvas draw |
| 16 | `contact` | `contact-stable` | `#ede4d2` | `native` | title and content paragraph | target content + post-paint |

The implementation may replace old diagnostic IDs while moving leaves, but
the manifest and browser tests must be updated in the same commit. It may not
weaken the visible-content predicate to “root exists.”
Appendix E is the authoritative surface/selector/resource/deadline expansion
of this summary table.

### 2.2 Segments

All 15 segments are reversible and fail closed:

| # | Segment ID | Source → target | Effect placement |
| ---: | --- | --- | --- |
| 1 | `hero-pattern` | Hero → Pattern | above both |
| 2 | `pattern-star-map` | Pattern → Star Map | above both |
| 3 | `star-map-aod` | Star Map → AOD | above both |
| 4 | `aod-method-top` | AOD → Method | between |
| 5 | `method-bottom-figure2` | Method → Figure2 | above both |
| 6 | `figure2-distance-expand` | Figure2 → Proof, including the distance expansion | above both |
| 7 | `figure2-proof-brand` | Proof → Brand | above both |
| 8 | `brand-figure3` | Brand → Figure3 | above both |
| 9 | `figure3-services` | Figure3 → Services | between |
| 10 | `services-ttg` | Services → TTG | above both |
| 11 | `ttg-lab` | TTG → Lab | between |
| 12 | `lab-ph` | Lab → PH | above both |
| 13 | `ph-education` | PH → Education | between |
| 14 | `education-crane` | Education → Crane | above both |
| 15 | `crane-contact` | Crane → Contact | between |

Durations, breakpoints, scroll distances, and authored progress thresholds
must reference canonical exports from `app/src/story/timings.ts`; do not copy
new numbers into `phone-story/manifest.ts`.

### 2.3 Dependency closure and active mounting window

Every scene direct entry and every segment direction declares the complete
dependency closure:

```ts
type PhoneDependencyClosure = Readonly<{
  load: readonly PhoneDependencyRef[];       // scene/transition/media/compositor
  mount: readonly PhoneMountRole[];          // source/effect/receiver
  prewarm: readonly PhoneDependencyRef[];    // load only; no hidden playback
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

Normative rules:

- forward, reverse, and direct entry each have a non-empty explicit closure;
- `load` names every required scene, transition, media, and compositor;
- `mount` derives from committed source plus active closure, never a
  slice-specific switch table;
- prewarm can cache a module or metadata but cannot mount, play, consume a
  decoder, allocate WebGL, expose pixels, or consume activation;
- after the closure becomes the active transaction, `prepareMount` may mount
  its already-loaded target root and media surface inert beneath the
  source/Loader; this is active preparation, not prewarm;
- source remains mounted and visibly covers the candidate through prepared
  proof; it remains mounted as the rollback anchor after receiver exposure;
- receiver exposure waits for prepared module/root/decode-or-draw/layout
  facts, then runtime atomically applies one candidate plane;
- post-paint content/frame/coverage/scroll visible proof happens only after
  that candidate plane exists; those visible proofs cannot be prerequisites
  for mounting or exposure;
- Figure3/Services, TTG/Lab, PH/Education, and Crane/Contact terminal
  compositors remain mounted until their declared reverse-safe boundary;
- direct entry loads/mounts only its minimum closure, not earlier story scenes;
- delayed or stale module/media responses retire by attempt key and cannot
  expand the active window; a natively rejected dynamic import follows the
  guarded reload contract in Sections 6 and 12 rather than retrying the same
  module URL in the same Document;
- runtime diagnostics enforce declared simultaneous video, active-decoder,
  Canvas, and WebGL maxima.

All 15 segments × two directions plus all 16 direct entries must pass a
manifest completeness test. “Use adjacent scenes” is not an acceptable
implicit closure.

## 3. Target dependency graph

Allowed production dependency direction:

```text
Legend: A ─→ B means “B may import A”.

story/canonical inputs ─→ manifest
protocol ─┬→ manifest ─┬→ machine ─→ runtime
          │            ├→ presentation ─→ runtime
          │            └→ runtime
          ├→ machine
          ├→ presentation ─┬→ scenes
          │                └→ transitions
          ├→ runtime
          ├→ scenes
          └→ transitions

runtime + presentation + scenes + transitions ─→ PhoneStoryShell
PhoneStoryShell ─→ PhoneBrandLabStory (QA-only import direction)
```

More precisely:

- `protocol.ts`: pure serializable IDs, snapshots, events, effects, attempt
  keys, evidence slots, and report values; no React, DOM, mutable state,
  loader, runtime, or CSS import.
- `manifest.ts`: canonical story imports only; no React, DOM, runtime, scene,
  transition, machine, or CSS import. It may import pure types from
  `protocol.ts`.
- `machine.ts`: imports `protocol.ts` and `manifest.ts`; owns the only reducer,
  selectors, identity guards, and stable-commit branch; no React, DOM,
  presentation, browser global, leaf, or CSS import.
- `presentation.ts`: may import `protocol.ts` and pure manifest values; no
  React and no scene/transition leaf import. DOM-bearing leaf registration
  port types live here, not in `manifest.ts`.
- `runtime.ts`: may import `protocol.ts`, `manifest.ts`, `machine.ts`, and
  presentation types/functions; no React, CSS, scene component, transition
  component, or QA import.
- `scenes.tsx`: may import pure protocol types and type-only presentation leaf
  ports plus lazy scene leaves; no runtime or machine import.
- `transitions.tsx`: may import pure protocol types and type-only presentation
  leaf ports plus lazy transition leaves; no runtime or machine import.
- `PhoneStoryShell.tsx`: wires the runtime, presentation, scene registry,
  transition registry, Loader, Nav, and the persistent visual planes.
- `PhoneBrandLabStory.tsx`: imports only `PhoneStoryShell` and passes QA scope,
  initial entry, and diagnostics.
- eager `main.tsx`/`App.tsx`/`presentation-shell-loaders.ts`: may create the
  non-story `PhoneChunkRecoveryPort` and dynamically load the shell. The
  phone-story core receives that port by injection and may not import the
  bootstrap implementation.
- A leaf can report through the supplied closed port and expose its visual
  command handle only through mount registration, but cannot import
  `runtime.ts`, dispatch an event, retain the story snapshot, add physical
  input listeners, or commit a landing.

The runtime receives scene/transition loading and presentation capabilities as
configuration ports. It does not import lazy leaves, preventing a cyclic
core/chunk graph.

## 4. State, evidence, and commit contract

### 4.1 Snapshot

Define the one discriminated snapshot in `protocol.ts` and reduce it only in
`machine.ts`:

```ts
export type PhoneStorySnapshot =
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

Cold and warm entry are not aliases:

- cold initial/hash/direct entry is `status: 'transaction'`,
  `transaction.mode: 'boot'`, `stableCommit: null`, and
  `presentationProof: null`; Loader is its only safety cover;
- warm menu/hash/popstate entry from an already stable page uses
  `transaction.mode: 'entry'` and retains the exact prior
  `stableCommit/presentationProof` as rollback anchor.

Candidate, phase, attempt key, evidence slots, deadlines, requested URL,
fallback, and retry remain reducer state. The effect interpreter may not own a
hidden entry state. Warm failure re-proves the retained source and restores
its URL when browser history already changed it; it never clears the source
commit. `faulted` retains a proven stable commit/presentation proof when
available; otherwise it renders the opaque safe cover plus an accessible
retry.

`PhoneViewportSnapshot` contains the latest immutable layout/visual samples,
their revisions, and a derived supported/blocked presentation state. It is
written only by reducer viewport events; CSS variables and warning datasets
mirror it and are never read back.

Semantic story commit and mutable presentation proof are distinct values in
the same reducer snapshot:

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

`PhonePresentationProof.commitSequence` must equal the active
`PhoneStableCommit.commitSequence`. A scene settle atomically creates both and
increments the sequence exactly once. `commitStableCandidate()` is the only
branch that may create or replace `PhoneStableCommit`.

Stable toolbar/orientation/BFCache recovery uses the separate reducer branch
`reprojectCommittedPlane()`. It retains the exact `PhoneStableCommit`, enters
a `mode: 'recovery'` transaction with input disabled, applies a new
`planeRevision`, and replaces only `PhonePresentationProof` after the complete
re-proof quorum. It cannot change scene, semantic landing, checkpoint,
navigation, or `commitSequence`.

Evidence inheritance is explicit:

| Recovery trigger | May be reused only as preparation input | Must be invalidated and re-proven |
| --- | --- | --- |
| toolbar-only visual viewport change | decoded asset state and active media/draw token, only while the same registered surface remains connected | plane acknowledgement, content visibility, visible-frame proof, four-edge coverage, landing/scroll alignment |
| width/orientation/fullscreen change | immutable module/decode cache only | layout, plane, content, frame, coverage, landing, scroll |
| `pageshow.persisted=true` | immutable fulfilled module/decode cache only | generation/token, root connection, plane, content, frame, coverage, landing, scroll |

No prior final evidence object is copied into the new proof. A retained
decode/draw token merely avoids reloading bytes; projector still produces a
fresh post-paint visible proof. If BFCache recovery has
`stableCommit: null`, the Loader stays opaque and runtime restarts the original
boot/direct-entry candidate with a new generation; it does not attempt to
re-prove a nonexistent source.

Edge surface, active checkpoint, and navigation selection are not stored a
second time. They are pure selectors over the committed scene, immutable
manifest, and stable scroll sample:

```ts
selectPhoneEdgeSurface(snapshot, manifest)
selectPhoneCheckpoint(snapshot, manifest)
selectPhoneNavigationScene(snapshot, manifest)
```

The checkpoint selector may distinguish Proof opening/cards/closing and other
native reading sub-checkpoints. Updating the stable `scroll` sample therefore
updates derived diagnostics/navigation without creating a second lifecycle or
rewriting the committed scene/plane.

### 4.2 Transaction

```ts
type PhoneTransactionPhase =
  | 'preparing'
  | 'presenting-source'
  | 'playing'
  | 'dwelling'
  | 'awaiting-leg-intent'
  | 'presenting-target'
  | 'aligning'
  | 'verifying'
  | 'awaiting-media-activation'
  | 'rolling-back';

type PhoneAttemptKey = Readonly<{
  authorityId: string;
  transactionId: string;
  transactionGeneration: number;
  mode: 'boot' | 'entry' | 'segment' | 'rollback' | 'recovery';
  segmentId: PhoneSegmentId | null;
  direction: 'forward' | 'reverse' | null;
}>;

type PhoneEvidenceSlot = Readonly<{
  attempt: PhoneAttemptKey;
  stageIndex: number;
  leg: 'source' | 'effect' | 'target' | 'rollback';
  kind: PhoneEvidenceKind;
  surfaceId: PhoneSurfaceId | null;
  planeRevision: number | null;
}>;
```

Every asynchronous report carries one attempt key plus one evidence slot. A
report with a stale authority, transaction, generation, segment, or direction
is ignored and recorded as a diagnostic. A correct attempt can collect
different source/effect/target slots; `stageIndex` and `leg` do not make those
slots different attempts.

Revision semantics are fixed and non-overlapping:

| Field | Increments when | Must not mean |
| --- | --- | --- |
| `stateRevision` | every reducer state change | stable scene commit |
| `commitSequence` | exactly once in the new `PhoneStableCommit` created by `commitStableCandidate()` | viewport repaint |
| `transactionGeneration` | new async attempt/retry/recovery | DOM application |
| `planeRevision` | every complete DOM/viewport plane application | story progression |

`candidateRevision`, generic `snapshot.revision`, and
`presentationRevision` are prohibited aliases. Toolbar coverage changes may
increase `stateRevision` and `planeRevision`, but never `commitSequence`.

Canonical staged stops remain inside this transaction. `stageIndex` and the
manifest policy select the current leg. A declared dwell timer may advance
from `dwelling`, and a declared fresh gesture may advance from
`awaiting-leg-intent`; neither state publishes the target as stable. Dwell
completion is timing evidence only and can never satisfy frame, content,
coverage, or plane proof.

### 4.3 Reducer result

The reducer is pure:

```ts
type PhoneReduceResult = Readonly<{
  snapshot: PhoneStorySnapshot;
  effects: readonly PhoneStoryEffect[];
}>;

export function reducePhoneStory(
  snapshot: PhoneStorySnapshot,
  event: PhoneStoryEvent
): PhoneReduceResult;
```

The route-local factory interprets effects and publishes immutable snapshots:

```ts
export type PhoneStoryRuntime = Readonly<{
  getSnapshot(): PhoneStorySnapshot;
  subscribe(listener: () => void): () => void;
  connect(): () => void;
  requestEntry(entry: PhoneEntryRequest): void;
  retry(): void;
}>;

export function createPhoneStoryRuntime(
  config: PhoneStoryRuntimeConfig
): PhoneStoryRuntime;
```

No leaf receives the runtime. The boundary is bidirectional but narrow:

```ts
export type PhoneLeafReportPort = Readonly<{
  registerMount(registration: PhoneLeafMountRegistration): void;
  reportPrepared(surfaceId: PhoneSurfaceId, result: PhonePreparedReport): void;
  reportFrame(surfaceId: PhoneSurfaceId, result: PhoneFrameReport): void;
  reportProgress(progress: number): void;
  reportComplete(): void;
  reportFailure(failure: PhoneFailure): void;
}>;

export type PhoneLeafCommandHandle = Readonly<{
  rebind(binding: PhoneLeafGenerationBinding): void;
  activate(command: PhoneLeafActivationCommand): PhoneActivationInvocation;
  render(progress: number): void;
  settle(endpoint: 0 | 1): void;
  pause(reason: PhoneLeafPauseReason): void;
  dispose(reason: PhoneLeafDisposeReason): void;
}>;

export type PhoneLeafMountRegistration = Readonly<{
  root: HTMLElement;
  surfaces: readonly Readonly<{
    id: PhoneSurfaceId;
    element: HTMLElement;
    kind: 'dom' | 'image' | 'video' | 'canvas-2d' | 'canvas-webgl';
  }>[];
  commands: PhoneLeafCommandHandle;
}>;
```

Runtime/projector creates the report port from a closed binding:

```ts
createPhoneLeafReportPort({
  attempt,
  stageIndex,
  leg,
  allowedReports,
  allowedSurfaceIds
})
```

The binding supplies attempt, stage, leg, evidence kind, and active
`planeRevision`; a leaf cannot choose or submit any of them. `registerMount()`
registers one root, all named
video/Canvas/DOM surfaces, and one leaf-wide command handle; registration is
not content evidence. `reportPrepared()`/`reportFrame()` accept only a
leaf-local surface ID declared by the manifest. The presentation authority
maps that fact to a surface-bound closed evidence slot; runtime accepts only
the resulting opaque proof records. A leaf report is a prepared decode/draw
fact, not final visible-frame proof.

`PhoneLeafReportPort`, `PhoneLeafCommandHandle`, registrations, and DOM
surface types live in `presentation.ts`. Serializable attempt/slot/report
values live in `protocol.ts`; only runtime/projector may construct
`PhoneEvidenceSlot`. Content proof is generated exclusively by projector from
the registered root and current plane. No leaf API accepts or returns
`PhoneContentReport`.

Command semantics are frozen:

- `activate()` is a synchronous method call made inside the physical gesture
  stack against the exact registered `surfaceIds`; the returned
  `PhoneActivationInvocation` may contain asynchronous `play()` settlements,
  but invocation itself may not be `async`, deferred through React, or wait
  for import/mount;
- `render()` and `settle()` sample visuals only; runtime owns time and phase;
- `pause()` stops local decode/render callbacks without disposing retained
  topology;
- `rebind()` receives a newly closed report port plus opaque frame token,
  never an attempt key, reducer, dispatch, snapshot, or evidence constructor;
- `dispose()` is idempotent.

Generation replacement/disposal order is normative:

```text
invalidate old report port and frame token
pause/cancel old local callbacks
rebind the retained handle to the new closed report port, or dispose it
unregister retired roots/surfaces
release closure resource counts
```

Crane registers its figure and flock video/Canvas surfaces in one mount
registration. No scene-specific runtime adapter may be invented for
multi-surface activation.

### 4.4 Stable-commit quorum

`stable(target)` is a two-stage transaction. Prepared proof happens while the
source or Loader still covers an inert target:

```text
module loaded
target root/media surface mounted inert and connected
required image/video/Canvas/static decode-or-draw ready
target layout measurable
active closure/resource budget valid
```

Runtime then atomically applies the candidate receiver plane and mints a new
`planeRevision`. The source remains mounted as rollback anchor but no longer
occludes the receiver inside the story stack. Projector performs the
post-paint visible quorum:

```text
source/receiver/effect layer roles applied
target content visible in current candidate plane
required frame visibly presented in that plane
live visual viewport covered on four edges
target landing measured and scroll command confirmed
edge/checkpoint/navigation derived from target manifest record
complete presentation plane applied
post-paint plane revision acknowledged
```

For boot/direct entry, the registered opaque Loader is the sole permitted
safety-cover exception to the occlusion check: target must be visible and
unoccluded within the story stack beneath it; Loader is removed only after the
post-paint quorum, so the first exposed frame is already proven. Other opaque
ancestors/effects are not exempt.

The reducer must have one `commitStableCandidate()` branch. No other branch may
construct a `PhoneStableCommit`. The only proof-only mutation is
`reprojectCommittedPlane()`, which must retain the existing stable commit and
sequence.

Production quorum uses causal DOM geometry/computed-style checks and
identity-bound media/compositor callbacks. Playwright screenshot pixels are an
external acceptance gate that falsifies those production proofs; screenshot
sampling is not a production reducer event.

### 4.5 Failure semantics

- Prepare, chunk, media, playback, presentation, scroll, and timeout failures
  enter `rolling-back` only when a prior stable source exists. A cold
  `mode: 'boot'` transaction has no source to roll back to and instead follows
  the Hero fallback/fault path below.
- The last committed source plane remains visible while target preparation is
  in flight.
- Rollback must prove the source plane and source landing before returning to
  `stable(source)`.
- Successful rollback is a proof-only settle, not a semantic commit. It
  preserves the exact prior `PhoneStableCommit` object and
  `commitSequence`, replaces only source `PhonePresentationProof` through
  `reprojectCommittedPlane()`, and must not call `commitStableCandidate()`.
- Input is released after that rollback re-proof, not on the first failure
  event.
- Boot/direct-entry failure falls back to a newly identified/proven Hero boot
  transaction whose state remains in the reducer.
- After that Hero fallback is proven, one history `replaceState` effect
  canonicalizes the URL to Hero. It never leaves a target hash paired with a
  Hero stable snapshot.
- If Hero itself cannot be proven, enter `faulted`, keep the static
  Loader/opaque preboot safe cover, expose an accessible retry message, and do
  not publish a false stable scene.
- If source-plane, source-frame, source-module, Canvas, or scroll proof also
  fails during rollback, enter `faulted` before the rollback deadline. Keep a
  previously proven committed plane when still valid; otherwise use the
  opaque safe cover. Retry starts a new transaction generation.
- Every phase uses one named manifest deadline policy:

  ```text
  moduleLoad
  mediaPrepare
  firstFrame
  planeApply
  scrollConfirm
  rollback
  ```

  Values are declared once in manifest/runtime policy and covered by
  deterministic clock tests; leaves may not introduce untracked watchdogs.
- Active deadlines pause while the document is hidden. Hiding invalidates
  candidate evidence. Foreground/pageshow creates a new generation and fresh
  bounded revalidation deadline; hidden wall-clock time can neither commit nor
  leave a phase permanently pending.
- Backgrounding, route disposal, or a superseding direct entry aborts all
  candidate effects and invalidates their generation.
- A visual-viewport toolbar change updates/coalesces coverage only; it does
  not reset authored layout or playback progress.
- A width/orientation/fullscreen layout invalidation during a transaction
  aborts that candidate, reprojects and proves the committed source under the
  new layout, then returns to stable input. It cannot resume against stale
  geometry.
- An unsupported rotated geometry keeps the committed opaque plane visible,
  derives input-disabled/orientation-warning presentation from the same
  snapshot, and installs no second `MobileLandscapeGate` lifecycle. Returning
  to supported geometry reprojects the same committed scene before input is
  enabled.

Menu/programmatic entry updates URL only after target stable commit.
`popstate`/hash navigation is an external request whose URL has already
changed; rollback restores the committed source URL with `replaceState` after
source presentation is re-proven. History is an effect of the same
transaction, never a second current-scene store.

### 4.6 iOS media activation and leaf clock ownership

Runtime is the only consumer of physical gesture epochs. One claimed epoch can
offer one single-use activation credit to media inside the current dependency
closure. It may not unlock unrelated videos and may never perform a global
`play() → pause()` sweep.

If chunk preparation misses Safari's activation window:

```text
keep committed source visible (or Loader/safe cover during boot)
finish native module loading
mount the target root and media surface inert beneath the source/Loader
retain the active closure and enter awaiting-media-activation
release cinematic input while keeping only the runtime-owned CTA actionable
show the CTA only after the exact media surface is registered and synchronously activatable
wait for the next real physical gesture
mint a new transaction generation/frame token without unmounting the prepared topology
synchronously consume activation against that registered surface in the CTA event stack
```

The retained DOM/media registration is transaction topology, not evidence.
When the second gesture renews generation, runtime retires old frame callbacks,
ports, and tokens, rebinds the already-registered surface, and calls its
activation method synchronously; it does not wait for another React render or
dynamic import. If registration is lost, the CTA is disabled/hidden until a
surface is registered again.

Synthetic events and timers cannot spend activation. Cold direct entries to
media holds attempt manifest-declared `muted` + `playsInline` autoplay.
Rejection keeps the cover and enters the same prepared
`awaiting-media-activation` state. A static fallback is valid only if the
manifest declares it and it passes independent content/frame/coverage proof.

`play()` resolution is permission evidence only. Video decode clocks and
`requestVideoFrameCallback` may remain leaf-local, but they report
closed-binding progress, frame, complete, and failure facts. They cannot
schedule story completion, change phase, or commit stable.

### 4.7 Page lifecycle and BFCache

Runtime handles `visibilitychange`, `pagehide`, and `pageshow` through reducer
events:

- `pagehide.persisted=true`: suspend active deadlines, invalidate evidence,
  pause leaf-local media/render callbacks, release claimed input, and preserve
  BFCache eligibility; do not permanently tear down the cached DOM.
- `pageshow.persisted=true` with a stable commit: mint a new recovery
  generation and run `reprojectCommittedPlane()` to reapply/re-prove plane,
  content, frame, coverage, landing, and scroll before enabling input.
- `pageshow.persisted=true` with no stable commit: retain Loader and restart
  the original boot/direct-entry candidate under a new generation.
- `pagehide.persisted=false` or route unmount: perform normal complete
  disconnect/disposal.
- no restore path may duplicate listeners, authority, media token, Canvas, or
  WebGL context.

### 4.8 Serial event queue and preemption

Runtime has one non-reentrant event queue. Public API calls, browser
callbacks, leaf reports, effect completions, deadlines, and lifecycle events
enqueue; none calls `reducePhoneStory()` recursively. One drain step:

```text
dequeue one event
reduce once
publish immutable snapshot
interpret returned effects
enqueue later effect callbacks
```

Same-lane events are FIFO. Toolbar and native-scroll samples may coalesce only
before reduction. Priority for the next dequeue is:

| Lane | Events |
| ---: | --- |
| 0 | disconnect, non-persisted page termination |
| 1 | persisted pagehide/hidden suspension, rollback failure, width/orientation/fullscreen invalidation |
| 2 | rollback evidence and terminal fault |
| 3 | external warm menu/hash/popstate entry |
| 4 | pageshow/foreground recovery, toolbar-only plane reprojection |
| 5 | current-attempt prepare/playback/presentation evidence and deadlines |
| 6 | physical input and native scroll samples |

Phase behavior is fixed:

| Current phase | Warm entry | Hidden/pagehide | Width/orientation/fullscreen | Toolbar-only sample | Failure/rollback |
| --- | --- | --- | --- | --- | --- |
| cold `boot` | newer URL supersedes boot under Loader with new generation | suspend/invalidate; resume as new boot generation | invalidate layout; restart boot under Loader | coalesce coverage; never reveal | Hero fallback or `faulted` |
| `stable` | start `mode: entry`, retain stable source/proof | suspend; BFCache rules apply | proof-only recovery before input | proof-only reproject, same commit | no rollback exists |
| preparing/playing/dwelling/aligning/verifying | supersede candidate, but keep original stable anchor | preempt candidate and invalidate generation | preempt candidate; reproject stable source | reproject current plane and invalidate affected visible proof only | enter one rollback |
| `awaiting-media-activation` | supersede and dispose/release retained target topology | retain inert topology only when BFCache-safe; token invalid | preempt and dispose/rebuild layout-bound topology | coverage-only reproject | enter one rollback |
| `rolling-back` | retain only newest request as one coalesced pending entry | suspend rollback deadline/evidence | restart source re-proof under new layout | apply to source re-proof | candidate reports ignored; rollback failure → `faulted` |
| `faulted` | accessible retry/entry starts a new bounded generation | no hidden progress | reapply safe cover | safe-cover coverage only | no nested rollback |

Priority never interrupts a reducer call already executing. While rolling back,
ordinary input and candidate evidence are rejected. After successful source
re-proof, the exact stable commit is restored first; then the one pending warm
entry may start.

### 4.9 Pre-runtime phone-core recovery

The phone shell/core is lazy from `App.tsx`. A core import reject happens
before `PhoneStoryRuntime` exists, so runtime cannot own that recovery.
`presentation-shell-loaders.ts`, an App error boundary, and a call from
`main.tsx` form one eager **non-story bootstrap boundary**. It may:

```text
keep #story-loader-static opaque
listen for vite:preloadError before lazy import starts
record build/chunk failure metadata
fetch /r5-release-manifest.json with cache: no-store
perform at most one automatic reload for one recovery lineage
render an accessible fail-closed/retry surface
```

It may not store scene, checkpoint, story phase, stable commit, input state,
presentation plane, or media state. It attaches no story input listener and
cannot release Loader because of time. It therefore is not another authority.
After the core loads, App passes the same controller as a narrow
`PhoneChunkRecoveryPort` in runtime environment; runtime never imports the
bootstrap implementation.

The cross-reload session record is:

```ts
type PhoneChunkRecoveryLineage = Readonly<{
  lineageId: string;
  entryUrl: string;
  firstDocumentBuildId: string;
  currentDocumentBuildId: string | null;
  deployedBuildId: string | null;
  failedModuleUrl: string | null;
  failedModuleClass: 'phone-core' | 'scene-leaf' | 'transition-leaf';
  automaticReloadCount: 0 | 1;
  status: 'classifying' | 'waiting-online' | 'reloaded' | 'fail-closed';
}>;
```

Changing build IDs or hashed URLs after reload does not mint a new lineage.
Only a proven stable cold boot/warm entry clears it. If session storage is
unavailable, automatic reload is forbidden. `manifestFetch` has a 3,000 ms
active-foreground deadline; timeout, HTTP/parse failure, or missing identity
reaches fail-closed UI. Offline pauses classification until `online` without
spending the reload. A manual user reload does not reset an exhausted lineage.

## 5. Evidence levels and release language

Use these labels in commits and reports:

| Label | Meaning | May claim release stability? |
| --- | --- | --- |
| Contract-complete | Pure reducer, manifest, and static architecture gates pass | No |
| Engine-complete | Chromium and Playwright WebKit transaction/pixel gates pass | No |
| Chunk-contract-complete | Task 12 automated chunk/fault/size gates pass; physical closure is still pending | No |
| Simulator-complete | iOS Simulator Safari matrix passes | No |
| Release-complete | Physical iPhone Safari matrix and all automated gates pass | Yes |

No automated browser result may be described as “physical iPhone verified,”
and `Chunk-contract-complete` may not be shortened to “chunk closed.”

## 6. Task ordering and commit discipline

Tasks 0–6 are strictly sequential because they define the core. Tasks 7–10
integrate donor groups in canonical order; each group must reach its visual
checkpoint before the next group edits shared leaf ports. Task 11 is one
atomic formal cutover. Tasks 12–14 are release closure.

The following large tasks are mandatory vertical slices, not batching
suggestions:

| Parent task | Mandatory slice and independent commit/checkpoint |
| --- | --- |
| Task 4 | 4A pure machine + boot/direct entry; 4B segment transaction + rollback/faulted; 4C input/history/viewport/BFCache; 4D effect interpreter + activation + disposal |
| Task 7 | 7A harness/pixel helpers; 7B Hero/Loader; 7C Pattern/viewport; 7D AOD/media activation; 7E Star/front transitions and Front matrix |
| Task 9 | 9A Brand → Figure3 → Services; 9B Services → TTG → Lab |
| Task 10 | 10A Lab → PH → Education; 10B Education → Crane; 10C Crane → Contact + complete story |

The authoritative execution order from the current branch state is:

```text
Tasks 0–3 complete
→ 4A → 4B → 4C → 4D → code/architecture review
→ Task 5 → Task 6 → code/integration review
→ 7A → 7B → 7C → 7D → 7E
→ Task 8
→ 9A → 9B
→ 10A → 10B → 10C → cutover-readiness review
→ Task 11 → Task 12 → automated candidate review
→ Task 13 physical-iPhone human acceptance
→ Task 14 identity audit and handoff
```

Each slice starts with its own red unit/browser failure, ends with its own
narrow green command and frozen-input check, and receives its own commit.
Starting a later slice before the prior required checkpoint is green is
forbidden. A parent task acceptance block is checked only after all its slice
commits pass together.

Verification has three scopes. Do not promote a broader command into every
smaller slice:

| Scope | Required cadence |
| --- | --- |
| Slice gate | RED narrow test, GREEN narrow test, architecture source gate, typecheck, frozen-input check, focused diff review, atomic commit |
| Parent-task closure | Full Vitest, typecheck, one production build, and the parent task's declared Chromium/WebKit matrix |
| Release closure | Task 12 complete automated suite, followed by Task 13 Simulator and physical iPhone evidence |

Tasks 7–10 remain stricter during dual service: every vertical slice runs its
targeted clean WebKit checkpoint plus the old formal mobile-WebKit regression.
The parent-task closure, not each child slice, adds the full Chromium/WebKit
matrix and full Vitest/build gates.

The executor may self-review and continue after ordinary slice gates; a
self-review is not a user-approval pause. Mandatory review nodes are:

| Review node | Reviewer and decision |
| --- | --- |
| Task 3 contract freeze | Code/architecture review of protocol, manifest, Appendix E, and dependency direction; completed for the current branch |
| Task 4D closure | Completed on 2026-08-01: unified review of machine, runtime, activation, queue, rollback, and disposal; no separate stop occurred after 4A |
| Task 6 closure | Completed on 2026-08-01: unified review of projector, real React StrictMode ownership, Loader, and lazy boundaries; blockers closed and execution stopped before Task 7 |
| After Task 10, before Task 11 | Completed on 2026-08-01: clean gates pass, the accepted old-formal oracle baseline is unchanged, registries are complete, and the deletion ledger is ready |
| Task 12 closure | Automated release-candidate review and `candidateCodeSha` freeze readiness |
| Task 13 | The only scheduled human visual acceptance: physical iPhone Safari on the exact candidate artifact |

Code review nodes pause the next phase only until their findings are recorded
and blocking issues are closed; they do not require user attendance. Task 13
is the only planned wait for human/device evidence.

Tasks 7–10 visual checkpoints are automated engine/pixel evidence reviewed by
the executor or code reviewer. They do not wait for user visual sign-off. Stop
early for the user only when evidence conflicts with the frozen donor, a
subjective visual change is proposed, or Appendix C is triggered.

Every implementation slice follows this loop:

1. Add the failing test or gate.
2. Run the narrow command and record the expected failure.
3. Implement only that slice.
4. Run the narrow command to green.
5. Run the architecture source gate, typecheck, and frozen-input check.
6. Review the focused diff for duplicate authority and unrelated changes.
7. Commit with the exact task/slice commit message.
8. Run the full parent-task closure only at the final slice of that parent.

Do not combine two task commits to save time. Do not amend a previously
accepted group after starting the next group without reopening that group's
browser checkpoint.

---

## Task 0: Record and guard the clean Unit 4–7A baseline

**Files:**

- Create:
  `docs/react-refactor/reports/r5-phone-clean-runtime-baseline.md`
- Modify:
  `docs/superpowers/plans/2026-07-30-r5-phone-clean-runtime-convergence.md`
  only to check completed boxes and record the resulting commit

- [x] **Step 0.1: Prove branch identity before any production edit**

Run from the clean worktree:

```bash
git rev-parse --show-toplevel
git branch --show-current
git rev-parse 9652fbe
git merge-base --is-ancestor 9652fbe HEAD
git status --short
```

Expected:

```text
worktree = /Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime
branch = codex/r5-phone-clean-runtime-convergence
9652fbe = 9652fbec9aa18bfe989d6ed1b62d2c61f3a31f7f
merge-base command exits 0
no production changes
```

- [x] **Step 0.2: Record donor ancestry and immutable hashes**

Run:

```bash
git merge-base --is-ancestor 3deb717 9652fbe
git merge-base --is-ancestor 35b0aee 9652fbe
git merge-base --is-ancestor ab7353e 9652fbe
git merge-base --is-ancestor eca6bc2 9652fbe
git rev-parse 9652fbe:assets
shasum -a 256 app/src/story/timings.ts
shasum -a 256 \
  assets/aod-figure-motion-rgb-alpha.mp4 \
  assets/figure2-pair-motion-rgb-alpha.mp4 \
  assets/ph-figure-motion-rgb-alpha.mp4 \
  assets/crane-figure-motion-rgb-alpha.mp4 \
  assets/crane-flock-motion-rgb-alpha.mp4 \
  assets/figure3-initial-paper.webp \
  assets/figure3-terminal-paper.webp
```

These are the canonical paths at `9652fbe`. If a command says a path is
missing, stop and verify that the worktree is on the required base; do not
substitute or rebuild media.

- [x] **Step 0.3: Run the executable baseline**

```bash
pnpm install --frozen-lockfile
pnpm -C app test
pnpm -C app typecheck
pnpm -C app build
```

Expected baseline:

```text
Vitest: 170 files / 950 tests passed
TypeScript: passed
Build: passed
Phone JavaScript: 628,044 bytes
Immutable cap: 663,552 bytes
Headroom: 35,508 bytes
```

Record actual output and tool versions. If the counts differ only because this
plan/spec is present, record why. If production tests, typecheck, or build
fails, stop; do not begin Task 1.

From the clean-base Vite/Rollup manifest, also record:

```text
donorMaxLazyLeafBytes
largest ten phone JS chunks with entry/import ownership
modules duplicated across emitted phone chunks
phone leaves reached eagerly from formal entry
```

This is a structural donor measurement. Do not compress or repartition the
base to improve it.

- [x] **Step 0.4: Build the exhaustive `c808e06` disposition ledger**

First prove that `c808e06` is the direct Unit 7B delta:

```bash
git rev-parse c808e06^
git diff --name-status 9652fbe c808e06
git diff --numstat 9652fbe c808e06
git show --stat --oneline c808e06
```

Expected parent: `9652fbec9aa18bfe989d6ed1b62d2c61f3a31f7f`.
Record all 56 changed files. Review mixed files hunk-by-hunk and assign
`visual | media | lifecycle | test | build` plus
`port | rewrite | reject`, destination task/path, rationale, and preserving
test. In particular, do not treat the substantial changes to PH, Education,
Crane, Contact, their four transitions, or their media/render helpers as
“lifecycle only.”

The ledger total must reconcile to `git diff --numstat`; an unclassified file
or hunk blocks Task 1.

- [x] **Step 0.5: Capture the Unit 4–7A formal-route donor trace**

Use the existing old-route suite only as a visual donor recorder:

```bash
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-story.spec.ts \
  --project=mobile-webkit \
  --trace=on
```

Record the trace path and SHA-256 in the baseline report. Extract reference
frames only for the holds/segments actually exercised by this suite, including
the accepted Unit 4–7A formal path, Figure2 staged endpoint, Figure3/TTG
endpoints, and Proof → Brand. Label known AOD/coverage/Hero failures rather
than normalizing them into the target.

This trace answers “did the clean runtime change an accepted scene?” It is not
release evidence and does not prove physical Safari stability.

The report must explicitly state that `r5-phone-story.spec.ts` is unchanged
between `9652fbe` and `c808e06` and does **not** prove the independent v36
Lab–Contact shell. It may not be labeled a complete 16-hold donor trace.

- [x] **Step 0.6: Capture a separate detached Group 6–7 v36/R4 donor trace**

Create a disposable detached evidence worktree at the exact Unit 7B commit;
do not switch, merge, or cherry-pick it into the clean branch:

```bash
git worktree add --detach /private/tmp/r5-phone-c808-donor c808e06
pnpm -C /private/tmp/r5-phone-c808-donor/app install --frozen-lockfile
pnpm -C /private/tmp/r5-phone-c808-donor/app typecheck
VITE_ENABLE_HARNESS=1 \
  pnpm -C /private/tmp/r5-phone-c808-donor/app exec vite build
```

Do **not** run the package `build` wrapper with `VITE_ENABLE_HARNESS=1`.
That wrapper successfully emits the Vite harness artifact and then
deterministically fails `verify-release-build.mjs`, because the release
verifier correctly rejects the donor-only `Group1Harness` marker. The raw
Vite command above, after typecheck, is the only allowed donor-harness build
path. A historical package-build log must record this verifier rejection as
expected; it must not be retried or treated as a clean-base failure.

Do **not** use `playwright.release.config.ts`: at this base its
`testMatch='**/r5-*.spec.ts'` silently excludes both R4 files, and preview also
requires the preceding build. Create an untracked donor-only
`app/playwright.donor.config.ts` in the detached worktree with:

```ts
import { defineConfig, devices } from '@playwright/test';

const port = 4173;
export default defineConfig({
  testDir: './e2e',
  testMatch: /r4-g[67]\.spec\.ts/,
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on',
    screenshot: 'off',
    video: 'off'
  },
  webServer: {
    command: `pnpm preview --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000
  },
  projects: [{
    name: 'donor-mobile-webkit',
    use: {
      ...devices['iPhone 15 landscape'],
      browserName: 'webkit'
    }
  }]
});
```

Prove discovery before execution:

```bash
pnpm -C /private/tmp/r5-phone-c808-donor/app exec playwright test \
  --config=playwright.donor.config.ts \
  e2e/r4-g6.spec.ts e2e/r4-g7.spec.ts \
  --project=donor-mobile-webkit --list
```

Expected: exactly 7 tests in the two files. `0 tests` blocks donor capture.
Then run the same command without `--list` and with `--trace=on`.

Separately capture `/?v=36#lab`, `#ph-animation`, `#education`,
`#crane-animation`, and `#contact` from that same detached build through the
existing v36 shell. Record the exact command/tool, build SHA, trace/video
paths, and SHA-256. The v36 trace and R4 harness traces are evidence donors,
not release evidence and not runtime donors.

Record Unit 4–7A formal evidence and Unit 7B Group 6–7 evidence in separate
report sections. Remove the disposable worktree only after hashes are
recorded; its absence must not affect the clean worktree.

- [x] **Step 0.6A: Persist donor evidence outside mutable test output**

Before any Task 1 Playwright command, copy all formal `app/test-results`
artifacts and all Group 6–7 `/private/tmp` artifacts into:

```text
artifacts/react-refactor/r5-phone-clean-runtime-task0/
```

Large raw binaries may remain Git-ignored, but this directory must retain a
versioned `manifest.json`, unified `SHA256SUMS`, and an executable verifier.
The manifest must map every report artifact from its original path to its
persistent archive path and record `e70fc984`, `c808e06`, tool versions, file
sizes, and hashes. Preserve the provenance script, R4/v36 specs and configs,
and supplemental recorder/config; a recorder source may be recovered
byte-for-byte from its trace. The verifier must prove all **44** report hashes
and the complete archive inventory without rerunning either donor. A missing
raw archive, source, path mapping, or hash blocks Task 1.

- [x] **Step 0.6B: Disposition the complete existing R5 release suite**

Before new phone specs are added, `playwright.release.config.ts` collects
exactly these eight existing files:

```text
r5-production.spec.ts
r5-performance.spec.ts
r5-homepage-media.spec.ts
r5-crane-media.spec.ts
r5-ttg-alpha.spec.ts
r5-matrix.spec.ts
r5-phone-story.spec.ts
r5-nojs.spec.ts
```

Run `--list` for all four configured projects and record file/test counts:

```bash
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts --list
```

In the baseline report, give every file and every shared helper one final
disposition:

```text
keep-desktop
rewrite-phone-diagnostics
split-by-project
replace-with-clean-spec
retire-at-cutover
```

Explicitly audit `app/e2e/r5-helpers.ts` and every use of `.story-app` or
`window.__storyApp`. Desktop-only assertions may keep the desktop diagnostic
API. A phone assertion must be rewritten against the clean read-only
diagnostic/pixel contract by Task 11; it may not be silently skipped. Record
the expected Task 11 project-to-spec matrix. An undispositioned R5 spec or
helper blocks Task 1.

- [x] **Step 0.7: Record the initial file/authority inventory**

```bash
find app/src/production/phone -type f | sort
find app/src/production/phone -type f \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) | wc -l
rg -n "create.*Runtime|addEventListener|requestAnimationFrame|setTimeout|commit|checkpoint|edgeScene" \
  app/src/production/phone
```

The report must distinguish genuine visual leaves from lifecycle,
compatibility, query-routing, and adapter files. It must state that this
inventory is a deletion ledger, not a target architecture.

- [x] **Step 0.8: Add a frozen-input command to the report**

Use this exact review command after every task:

```bash
git diff --exit-code 9652fbe -- \
  assets \
  app/scripts/homepage-media-contract.mjs \
  app/src/story/timings.ts \
  app/src/story/copy.ts \
  app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts \
  app/src/story/spine.ts \
  app/src/story/media.ts
```

- [x] **Step 0.9: Commit the baseline report**

```bash
git add docs/react-refactor/reports/r5-phone-clean-runtime-baseline.md \
  docs/superpowers/plans/2026-07-30-r5-phone-clean-runtime-convergence.md
git commit -m "docs(r5): lock clean phone convergence baseline"
```

- [x] **Step 0.10: Close Review 1 evidence-durability findings**

Archive the mutable Playwright and `/private/tmp` evidence per Step 0.6A,
replace the contradictory donor package-build command with the successful
typecheck/raw-Vite path, verify all hashes, and commit the review correction:

```bash
node artifacts/react-refactor/r5-phone-clean-runtime-task0/verify-evidence.mjs
git add .gitignore \
  artifacts/react-refactor/r5-phone-clean-runtime-task0 \
  docs/react-refactor/reports/r5-phone-clean-runtime-baseline.md \
  docs/superpowers/plans/2026-07-30-r5-phone-clean-runtime-convergence.md
git commit -m "docs(r5): preserve clean runtime baseline evidence"
```

**Task 0 acceptance:**

- branch and worktree match this plan;
- all four donors are ancestors of `9652fbe`;
- baseline tests/typecheck/build pass;
- immutable hashes, phone bundle bytes, donor lazy-chunk ceiling, eager-leaf
  reachability, and duplication inventory are recorded;
- all 56 `c808e06` files/hunks have a disposition;
- all eight existing R5 release specs plus `r5-helpers.ts` have an explicit
  cutover/project disposition;
- Unit 4–7A formal and detached Unit 7B v36/R4 evidence are separate and
  correctly scoped;
- the persistent archive verifier proves all 44 report hashes and every
  archived raw/source file without rerunning a donor;
- donor-only discovery finds and then executes exactly seven R4 Group 6–7
  WebKit tests after building the detached harness;
- no production source has changed.

---

## Task 1: Port only proven cross-cutting rendering contracts

This task does not import a later runtime. It ports small, reviewed rendering
and verification behavior into the clean base.

Before Step 1.1, rerun:

```bash
node artifacts/react-refactor/r5-phone-clean-runtime-task0/verify-evidence.mjs
```

Any missing raw artifact, source, manifest mapping, or hash blocks Task 1.

- [x] **Step 1.0: Correct the four frozen desktop oracles in an independent test-only commit**

The correctness review approved the baseline-oracle correction documented in
`docs/react-refactor/decisions/r5-task1-desktop-browser-gate-contradiction.md`.
Before applying the correction to the Task 1 worktree, apply the same
`app/e2e/r5-production.spec.ts` patch to a detached `b557c3e` worktree and
verify the untouched frozen production build there.

The correction is limited to these four stale expectations:

1. exercise the consolidated, reading-owned Method Top hold instead of the
   retired Method Bottom hold;
2. exhaust Figure2 Proof's frozen `1.05 × viewportHeight` wheel budget before
   checking that a momentum tail is absorbed;
3. apply the same `1.05 × viewportHeight` budget to the shared reading-scene
   test, including scenes whose total reading range is shorter than the budget;
4. witness the canonical Method Top → Figure2 ink handoff and its opaque
   receiver field instead of the retired Method Top → Method Bottom split.

Do not add a skip or retry, delete coverage, or change production behavior.
Commit this correction before the Task 1 implementation and include only:

- `app/e2e/r5-production.spec.ts`;
- this authoritative plan;
- `docs/react-refactor/decisions/r5-task1-desktop-browser-gate-contradiction.md`.

Frozen `b557c3e` verification completed with no retries:

```text
desktop-chromium: 25 passed, 7 existing project-conditional skips, 0 failed
desktop-webkit:    11 passed, 21 existing project-conditional skips, 0 failed
```

**Create:**

- `app/e2e/r5-phone-rendering-lifecycle.spec.ts`
- `app/src/runtime/semantic-data-attribute.ts`
- `app/src/runtime/semantic-data-attribute.test.ts`
- `app/src/production/phone/transitions/PhoneInkTransition.test.tsx`
- `app/scripts/verify-boolean-data-contract.mjs`
- `app/scripts/verify-boolean-data-contract.test.mjs`
- `app/scripts/verify-phone-packed-alpha-masters.mjs`

**Modify only as required by the reviewed hunks:**

- `app/src/components/TextReveal.tsx`
- `app/src/media/packed-alpha-video.ts`
- `app/src/media/packed-alpha-video.test.ts`
- `app/src/production/StoryNav.tsx`
- `app/src/production/global-assets.test.ts`
- `app/src/production/phone/phone-ink.ts`
- `app/src/production/phone/scenes/phone-packed-alpha-surface.ts`
- `app/src/production/phone/scenes/phone-packed-alpha-surface.test.ts`
- `app/src/production/phone/transitions/PhoneInkTransition.tsx`
- `app/src/scenes/aod-animation/progress.ts`
- `app/src/scenes/method-bottom/index.tsx`
- `app/src/scenes/method-top/index.tsx`
- `app/src/stage/LayerStore.ts`
- `app/src/stage/RetainedFigure2Arch.tsx`
- `app/src/stage/SceneLayer.tsx`
- `app/src/stage/Stage.tsx`
- `app/src/story/synthetic-modules.tsx`
- `app/src/styles.css`
- `app/src/transitions/shared/ink.ts`
- `app/src/transitions/shared/radialInkIntro.ts`
- `app/src/transitions/shared/radialInkIntro.test.ts`
- `app/src/transitions/shared/sceneInk.ts`
- `app/src/transitions/shared/sceneInk.lifecycle.test.ts`
- `app/src/transitions/shared/stagedMediaHandoff.ts`
- `app/src/vendor/ink-scene-transition.d.ts`
- `app/src/vendor/ink-scene-transition.js`
- `app/package.json`

**Explicitly do not modify:**

- `app/vite.config.ts` for property mangling;
- any file under the new `phone-story/` directory in this task;
- any old phone lifecycle file except the four narrowly listed
  packed-alpha/ink ownership files and their tests above;
- frozen story/media inputs.

- [x] **Step 1.1: Audit the donor patch instead of applying it**

```bash
git show --stat 82a4e68
git show 82a4e68 -- \
  app/src/runtime/semantic-data-attribute.ts \
  app/src/media/packed-alpha-video.ts \
  app/src/transitions/shared \
  app/src/styles.css
git show --stat d4d29bc
git show d4d29bc -- app/scripts/verify-phone-packed-alpha-masters.mjs
```

Record the source commit beside each manually ported hunk in the Task 1 commit
body. Do not run `git cherry-pick`.

- [x] **Step 1.2: Write the semantic-boolean RED tests**

The helper contract is:

```ts
export type SemanticBoolean = 'true' | 'false';

export function semanticBoolean(value: boolean): SemanticBoolean {
  return value ? 'true' : 'false';
}
```

The script gate must fail on:

```tsx
data-ready={ready}
data-ready={ready || semanticBoolean(false)}
element.dataset.ready = String(maybeUndefined)
[data-ready=true]
```

and pass on:

```tsx
data-ready={semanticBoolean(ready)}
element.dataset.ready = semanticBoolean(ready)
[data-ready="true"]
```

Parse TypeScript/TSX writers with the TypeScript compiler API. A semantic
boolean writer passes only when the complete JSX initializer or dataset
assignment right-hand side is one direct `semanticBoolean(...)` call. A
matching comment, nested call, logical expression, conditional expression, or
other wrapper does not satisfy the gate. Scan CSS selectors for both quoted
and unquoted literal boolean values.

Add RED fixtures for a mixed expression, a comment-only disguise, and an
unquoted CSS selector before implementing the gate.

Run:

```bash
pnpm -C app exec vitest run src/runtime/semantic-data-attribute.test.ts
node --test app/scripts/verify-boolean-data-contract.test.mjs
```

Expected: RED before helper/gate implementation.

- [x] **Step 1.3: Port semantic booleans to actual consumers**

Use `semanticBoolean()` only for semantic boolean attributes. Do not convert
identifiers, phases, counts, or optional descriptive attributes. The gate must
scan built production source, not merely a hand-maintained file list.

- [x] **Step 1.4: Port packed-alpha resource retirement**

From `82a4e68`, port the behavior equivalent to:

```ts
releasePackedAlphaWebGlContext(gl: WebGLRenderingContext): void
renewPackedAlphaCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement
```

Acceptance behavior:

- compositor disposal cancels `requestVideoFrameCallback` and RAF;
- GL texture, buffer, program, and shaders are deleted;
- terminal retirement requests `WEBGL_lose_context` when available;
- a retired Canvas backing store is not silently reused as a valid frame;
- reactivation never reuses a context that was hard-lost;
- no failure path reports `onFrame`.

Define two explicit ownership paths:

- **reactivatable release:** `PhonePackedAlphaSurface.release()` may keep a
  React-owned Canvas node. It must cancel scheduling and delete compositor
  resources without calling `WEBGL_lose_context`; the same node/context must
  remain able to initialize and render on the next `activate()`;
- **terminal hard retirement:** `PhonePackedAlphaSurface.dispose('terminal')`,
  or the safe default for a compositor-owned Canvas that is removed and
  replaced on the next activation, must release the context exactly once. An
  injected React Canvas defaults to reactivatable cleanup unless its owner
  explicitly confirms terminal retirement. A compositor that was softly
  released but never reactivated must still be hard-retirable by that explicit
  terminal call.

Make the compositor retirement API encode that distinction rather than
inferring it from a call order. The surface must not hard-retire an old handle
after a replacement compositor has begun sharing the retained context.

Add:

- focused resource-deletion/context-loss tests in
  `packed-alpha-video.test.ts`;
- a real `createPhonePackedAlphaSurface()` release → activate regression using
  the persistent injected Canvas path, not two manually renewed fake Canvases;
- a Chromium browser regression through the production phone PH/Crane surface
  proving the same Canvas can release and reactivate without `setup-failed` or
  a context-loss event. Prove explicit terminal hard loss separately at the
  compositor/surface unit boundary.

- [x] **Step 1.5: Port shared rendering fixes by path/hunk**

Port the applicable semantic data-attribute, ink lifecycle, radial intro,
staged handoff, vendor typing, global typography, and rendering corrections
from `82a4e68`. Do not port its parent runtime behavior. Do not port a Hero CSS
hunk into the old phone tree; apply that reviewed declaration when Hero moves
to its canonical leaf in Task 7.

Keep hard context loss as the terminal default for a Canvas that its renderer
owns and removes. Every persistent Canvas owner must opt into reactivatable
cleanup. In particular, `createPhoneInkTransition()` must pass
`loseContextOnDestroy: false` when it receives the React-owned Canvas used by
`PhoneInkTransition`; an internally created, terminally removed Canvas may
still hard-retire.

Add a `PhoneInkTransition` StrictMode-style integration regression that runs
cleanup and recreates the renderer on the exact same Canvas. Assert the cleanup
uses `destroy(false)` and the replacement renderer is active. The Chromium
lifecycle spec must also exercise a production phone ink Canvas across
cleanup/recreation or endpoint rebinding and prove it is not context-lost.

- [x] **Step 1.6: Add packed-master verification**

Port the logic of
`d4d29bc:app/scripts/verify-phone-packed-alpha-masters.mjs`, then make it read
the canonical media inventory rather than introducing another filename table
when possible.

Add package scripts:

```json
{
  "verify:boolean-data": "node scripts/verify-boolean-data-contract.mjs",
  "verify:phone-packed-alpha": "node scripts/verify-phone-packed-alpha-masters.mjs"
}
```

Wire both into the existing build verification sequence before Vite build.

- [x] **Step 1.7: Run focused and global verification**

```bash
pnpm -C app exec vitest run \
  src/runtime/semantic-data-attribute.test.ts \
  src/media/packed-alpha-video.test.ts \
  src/production/phone/scenes/phone-packed-alpha-surface.test.ts \
  src/production/phone/transitions/PhoneInkTransition.test.tsx \
  src/transitions/shared/radialInkIntro.test.ts \
  src/transitions/shared/sceneInk.lifecycle.test.ts
node --test app/scripts/verify-boolean-data-contract.test.mjs
pnpm -C app run verify:boolean-data
pnpm -C app run verify:phone-packed-alpha
pnpm -C app test
pnpm -C app typecheck
pnpm -C app build
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-production.spec.ts e2e/r5-matrix.spec.ts \
  --project=desktop-chromium
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-production.spec.ts e2e/r5-matrix.spec.ts \
  --project=desktop-webkit
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-rendering-lifecycle.spec.ts \
  --project=mobile-chromium
git diff --exit-code 9652fbe -- \
  assets app/scripts/homepage-media-contract.mjs app/src/story/timings.ts \
  app/src/story/copy.ts app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts app/src/story/spine.ts app/src/story/media.ts
```

- [x] **Step 1.8: Review provenance and commit**

`git diff` must show no lifecycle code copied from `18b6a7c`, no Vite property
mangling, and no generated field registry.

```bash
git add \
  app/e2e/r5-phone-rendering-lifecycle.spec.ts \
  app/package.json app/scripts app/src
git commit -m "fix(r5): port clean rendering contracts"
```

- [x] **Step 1.9: Close Review 2 scope and boolean-debt findings**

Remove the post-Task-1 retry/ownership patches that entered
`src/scenes/hero/index.tsx` and the legacy `PhoneLabContactShell.tsx`. Those
files were never added to the Task 1 allowlist, so a green browser probe does
not authorize extending either lifecycle. Preserve the two regression
requirements in their clean owners instead:

- Slice 7B reproduces a stalled paused Hero frame callback and resolves it as
  a generation-bound clean runtime/leaf attempt, without a timer in the old
  shared Hero scene;
- Slice 10A/10B proves a late PH packed-surface mount cannot reclaim the media
  slot after PH retirement and before Crane activation, without a compensating
  effect in the legacy shell.

Keep the Task 1 mobile Chromium lifecycle regression on the ordinary
production PH path: enter PH first, complete its forward run, retire the
surface as Crane approaches, then reverse into the same persistent Canvas.
The separate direct-scroll/late-mount variant is the Slice 10A/10B regression
above; it must not be made green by extending the legacy shell.

Restore the frozen branch implementation of `semanticBoolean()`. Scan the
legacy phone tree under an exact file/attribute/occurrence debt ledger: a new
writer fails, and removing old debt requires shrinking the ledger in the same
commit. An entire-directory exemption is forbidden.

A call is semantic only when its identifier is bound by one named value import
from the canonical `src/runtime/semantic-data-attribute.ts` helper. A missing
import, a same-named local implementation, or any declaration/parameter that
shadows the imported binding fails closed. Freeze each legacy occurrence by
file, attribute, lexical owner, writer kind, and normalized AST writer
signature rather than by aggregate count. Keep RED fixtures for a missing
import, a local/shadowed binding, and replacing one frozen occurrence with a
different writer under the same file and attribute.

The restored fail-closed helper makes the existing forced `story-runtime`
chunk 55,275 bytes, 16 bytes above the frozen donor maximum. Keep its complete
branch implementation and split the existing media preparation/decoded-frame
driver responsibility into the stable `media-timeline-runtime` chunk, leaving
Ink/presentation ownership in `story-runtime`. Shortening diagnostics,
type-assertion code golf, tiny one-function sharding, or weakening the
55,259-byte gate remains forbidden.

**Task 1 acceptance:**

- semantic boolean and packed-alpha lifecycle gates pass;
- persistent packed-alpha and ink Canvases survive release/cleanup and
  reactivate through their real production call paths;
- hard WebGL context loss is reserved for terminally retired Canvas ownership;
- later rendering fixes are traceable by exact source hunk;
- the desktop Chromium/WebKit production and matrix browser regressions pass
  after shared Stage/LayerStore/transition/style edits;
- no post-`9652fbe` orchestration entered the branch;
- frozen inputs remain byte-identical.

---

## Task 2: Add architecture, complexity, and chunk-contract gates first

**Create:**

- `app/scripts/verify-phone-clean-architecture.mjs`
- `app/scripts/verify-phone-clean-architecture.test.mjs`
- `app/scripts/verify-performance-budgets.test.mjs`
- `app/scripts/verify-release-build.test.mjs`

**Modify:**

- `app/package.json`
- `app/scripts/verify-homepage-module-boundaries.mjs`
- `app/scripts/verify-homepage-module-boundaries.test.mjs`
- `app/scripts/verify-performance-budgets.mjs`
- `app/scripts/verify-release-build.mjs`
- `app/scripts/create-cdn-publish-manifest.mjs`
- `app/vite.config.ts`

- [x] **Step 2.1: Write fixture-driven RED tests**

Use Node's test runner and temporary fixture directories. The tests must prove
the gate rejects:

1. two `createPhoneStoryRuntime()` call sites;
2. `PhoneBrandLabStory` calling the factory;
3. a leaf importing `runtime.ts`;
4. `runtime.ts` importing a scene or transition leaf;
5. `manifest.ts` importing React or DOM-bearing modules;
6. a dependency cycle in the ten-file core;
7. an eleventh production file or a filename outside the flat allowlist under
   `phone-story/`;
8. a forbidden `runtime/` or `contracts/` subtree;
9. property-name mangling in Vite/Terser config;
10. a formal loader importing the QA shell;
11. a numbered phone validation query or production query composition;
12. core LOC over budget;
13. old orchestration reachable in cutover mode;
14. a dynamic phone chunk that imports its own lifecycle owner;
15. the clean phone core importing `useMobileLandscapeEntry` or mounting a
    second orientation lifecycle owner;
16. `protocol.ts` or `machine.ts` importing DOM/React/browser globals;
17. `manifest.ts` containing `HTMLElement` or importing a DOM-bearing port;
18. more than one reducer/stable-commit branch or runtime factory;
19. a pure-machine/browser-effect God file or total core LOC over budget;
20. a lazy leaf receiving runtime/dispatch rather than the two narrow leaf
    interfaces;
21. cutover without an eager phone-core bootstrap recovery boundary;
22. a recovery record keyed only by mutable build IDs/module URL instead of
    one cross-reload lineage.

It must accept:

- one factory call in `PhoneStoryShell`;
- QA wrapper importing the same shell;
- one `machine.ts` reducer imported by the one `runtime.ts` interpreter;
- lazy leaf imports expressed through `scenes.tsx`/`transitions.tsx`;
- ordinary ESM minification without property mangling.

Run and confirm RED:

```bash
node --test app/scripts/verify-phone-clean-architecture.test.mjs
```

- [x] **Step 2.2: Implement the gate with the TypeScript compiler API**

Use the installed `typescript` package to parse imports, calls, and production
source. Do not rely on regex alone for module graph or factory-call counting.
The gate may use regex only for Vite configuration and prohibited query
markers after stripping comments.

Supported phases:

```bash
node scripts/verify-phone-clean-architecture.mjs --phase=harness
node scripts/verify-phone-clean-architecture.mjs --phase=cutover
```

Harness phase enforces:

- allowed core filenames and dependency direction;
- one factory implementation and at most one call site;
- no factory call outside `PhoneStoryShell`;
- no cycles;
- no runtime import from leaves;
- no property mangling;
- LOC budgets;
- no second clean-core subtree.

Cutover phase additionally enforces:

- exact flat ten-file production allowlist;
- exactly one production factory call;
- formal graph excludes QA;
- `app/src/production/phone/` no longer exists;
- `app/src/production/portrait-spike/` no longer exists;
- no legacy `validationMode`, `?v=`, `portrait-spike-motion`,
  `loadPhoneLabContactShell`, or `PhoneBrandLabScope`;
- no old phone orchestration import from a canonical leaf;
- phone bundle cap remains unchanged.

- [x] **Step 2.3: Wire gates into scripts**

Add:

```json
{
  "verify:phone-architecture": "node scripts/verify-phone-clean-architecture.mjs --phase=harness",
  "verify:phone-architecture:cutover": "node scripts/verify-phone-clean-architecture.mjs --phase=cutover"
}
```

Wire harness mode into ordinary build immediately. Task 11 changes the build
hook to cutover mode.

Update the general module-boundary gate so the phone rules have one
implementation: it should invoke or share the clean verifier, not duplicate
another import graph.

- [x] **Step 2.4: Emit authoritative module-to-chunk provenance**

Vite's ordinary manifest records entry/import edges but does not include
Rollup `OutputChunk.modules`. Add one small local plugin in `vite.config.ts`
whose `generateBundle` hook emits:

```text
dist/audit/r5-module-provenance.json
```

Schema:

```ts
type R5ModuleProvenance = Readonly<{
  schemaVersion: 1;
  chunks: readonly Readonly<{
    fileName: string;
    isEntry: boolean;
    isDynamicEntry: boolean;
    facadeModuleId: string | null;
    imports: readonly string[];
    dynamicImports: readonly string[];
    modules: readonly string[];
  }>[];
}>;
```

Sort every array and normalize repository module IDs so output is
deterministic. Post-Vite `verify-release-build.mjs` reads this report to prove
actual module placement, duplicate execution core, authority inside lazy
chunks, accidental eager leaves, and maximum lazy payload. The pre-Vite phone
architecture gate validates the source graph and the presence/shape of the
audit plugin contract; it must not read a stale `dist/` report from a prior
build. Add post-build fixture tests for missing, malformed, duplicated, eager,
and valid reports, and source-gate fixtures proving the plugin cannot be
removed or imported by runtime code.

This JSON is build-audit evidence only:

- no application module imports it;
- it is not a reserved-property registry or runtime field policy;
- it is absent from HTML/preload/runtime graphs and phone JS byte totals;
- `create-cdn-publish-manifest.mjs` excludes `dist/audit/**` from the deploy
  package, while the local release/evidence report may hash it.

Ordinary Vite manifest traversal alone cannot satisfy the post-build
duplicate/eager module gate.

- [x] **Step 2.5: Lock the immutable bundle cap**

`verify-performance-budgets.mjs` must retain:

```text
phone JavaScript hard cap = 663,552 bytes
clean-base target/warning = 628,044 bytes
```

Only `663,552` is an immediate size build failure. `628,044` remains visible
as the clean-base optimization target/warning; it is not enforced as a second
hard cap and may not motivate code golf, a God file, removed diagnostics, or
property mangling.

At `9652fbe`, `verify-performance-budgets.mjs` also calls
`assertHeadroom()` for `phoneJsHeadroomBytes` and
`totalJsHeadroomBytes` with 4 KiB, making the effective failure line
659,456 bytes. Task 2 must remove those two assertions. Keep phone/total
headroom in the JSON/report as an informational metric, and leave the
pre-existing desktop headroom assertion unchanged. Add executable boundary
tests proving:

```text
phone/total = 663,552 bytes     → pass
phone/total = 663,553 bytes     → fail
phone/total headroom < 4 KiB    → report only, pass
desktop headroom < 4 KiB        → retain existing desktop failure
```

The build gate must independently fail on:

- execution core duplicated across chunks;
- a lazy leaf containing `machine`, runtime factory, stable commit, or input
  ownership;
- an undeclared scene/transition leaf becoming eager;
- the same production module emitted into multiple phone chunks;
- any lazy leaf chunk exceeding `donorMaxLazyLeafBytes` measured and recorded
  in Task 0, unless a user-approved ADR names the intentional visual payload.

Task 11 records the first fully functional clean-cutover size as
`cleanCutoverBaselineBytes`. That value becomes the future regression baseline
only after Task 12/13 acceptance; it does not alter the immutable 663,552 cap.

- [x] **Step 2.6: Verify and commit**

```bash
node --test app/scripts/verify-phone-clean-architecture.test.mjs
node --test app/scripts/verify-homepage-module-boundaries.test.mjs
node --test app/scripts/verify-performance-budgets.test.mjs
node --test app/scripts/verify-release-build.test.mjs
pnpm -C app run verify:phone-architecture
pnpm -C app test
pnpm -C app typecheck
pnpm -C app build
git diff --exit-code 9652fbe -- \
  assets app/scripts/homepage-media-contract.mjs app/src/story/timings.ts \
  app/src/story/copy.ts app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts app/src/story/spine.ts app/src/story/media.ts
git add app/package.json app/scripts app/vite.config.ts
git commit -m "test(r5): enforce clean phone architecture"
```

- [x] **Step 2.7: Close the bootstrap-recovery false-positive gap**

Replace marker-string recovery acceptance with a fail-closed TypeScript AST
contract. Cutover requires exactly one executable named
`vite:preloadError` handler and one canonical `PhoneStoryShell` import. That
import's rejection callback must call the same handler. The handler must, in
direct executable control flow, prevent the preload default, read a stable
session lineage, derive `automaticReloadCount` from the stored record, guard
`>= 1`, persist count `1`, and then perform exactly one
`window.location.reload()`. `markStable()` must clear the same storage key.
No same-Document import retry is allowed.

The import rejection uses one inline, non-generator catch callback whose first
statement is the direct handler call and whose second statement rethrows the
same callback error. A conditional/dead call or a call after `return`/`throw`
does not establish recovery reachability.

Lock this bootstrap skeleton to one canonical micro-shape and verify bindings
with a TypeScript `Program`/`TypeChecker`, not identifier text. There is one
top-level single-binding `const` initialized by the stable lineage-key literal.
`loadPhoneStoryShell()` is an exported zero-parameter top-level function whose
only body statement directly returns the canonical import/catch chain. The
registered handler, the catch delegate, and every
`getItem`/`setItem`/`removeItem` key argument must resolve to their respective
canonical symbols. The handler starts with the direct `preventDefault()`
statement and contains only the ordered read/parse/guard/persist/reload
micro-shape. `markStable()` is an exported zero-parameter top-level function
whose only statement directly removes that same immutable key. The handler and
key remain private, non-exported boundary bindings. Close the handler symbol's
references to its declaration, listener, and catch delegate; close the key
symbol's references to declaration/read/persist/stable cleanup. No other eager
formal-graph `sessionStorage` reference is allowed. Shadowing, reassignment,
eager extra calls or storage mutation, short-circuit/dead statements, and
imports after a terminator fail closed.

Validate that sequence with statement-level control-flow paths, not source
offsets. Every reachable reload path must be dominated, in order, by preload
prevention, the stored-lineage read/parse, the bounded guard, and persistence.
Lock the stored-count data flow to three adjacent statements in one block: one
single-binding `const` reads `sessionStorage.getItem`, one single-binding
`const` selects `stored ? JSON.parse(stored) : fallback`, and the next statement
guards that exact unique lineage binding. The fallback object ends with
`automaticReloadCount: 0`; `JSON`, `sessionStorage`, and `window` remain
unshadowed. Parse-then-overwrite wrappers, discarded comma results, nested fake
parse branches, and same-named stored/lineage shadows fail closed.
The persisted object must end with `automaticReloadCount: 1`; its `setItem()`
and `window.location.reload()` form one adjacent, direct-expression tail so no
intervening call can clear or rewrite the lineage. Reject any additional
`setItem`, `removeItem`, `clear`, storage alias/escape, or unreachable tail.

Keep RED fixtures for comment-only markers, listener registration hidden in an
uncalled function, a no-op handler, recovery hidden inside an uncalled nested
function, an ignored stored lineage, an unbounded reload, an unrelated
`.reload()` method, recovery outside the import rejection callback, and a
second import of the same URL. Also keep early-return, throw-before-persist,
clear-after-persist, overwrite-after-persist, and indirect-reset-before-reload
fixtures. Catch fixtures cover `if (false)`, return-before-handler, and
throw-before-handler, outer-parameter/local handler shadowing, handler-binding
reassignment, exported-handler escape, an extra eager handler call, an import
after a prior return, and a missing loader export. Stored-lineage fixtures
cover parse-then-overwrite, discarded comma results, conditional fake parsing,
same-named lineage shadow, a forged local `JSON` binding, key
reassignment/export, and handler/`markStable` key shadowing. They also cover
extra key deletion plus direct and computed eager formal-graph
`sessionStorage.clear()`.
Direct-statement fixtures cover short-circuited `preventDefault()`, unreachable
`markStable()` removal, and a missing `markStable` export.
These fixtures must exercise the AST/control-flow and checker-symbol
relationships rather than merely repeat required strings.

**Task 2 acceptance:**

- architecture failures are tested with fixtures;
- the gate parses a real import/call graph;
- Rollup `chunk.modules` provenance, not only Vite manifest edges, drives
  duplicate/eager/authority chunk checks;
- harness and cutover modes have distinct, explicit rules;
- the cap, warning target, duplicate/eager/max-lazy-chunk checks, and
  no-property-mangle decision are executable;
- `663,552` is the sole phone/total size failure line; phone/total 4 KiB
  headroom remains reported but is no longer asserted.

---

## Task 3: Declare the complete phone manifest before rendering

**Create:**

- `app/src/production/phone-story/protocol.ts`
- `app/src/production/phone-story/protocol.test.ts`
- `app/src/production/phone-story/manifest.ts`
- `app/src/production/phone-story/manifest.test.ts`
- `app/src/production/phone-story/presentation.ts`
- `app/src/production/phone-story/presentation.contract.test.ts`

- [x] **Step 3.1: Write completeness and invariants tests**

Tests must assert:

- exactly 16 unique scene IDs in canonical order;
- exactly 15 unique segment IDs connecting every adjacent pair;
- protocol exports only serializable IDs/events/effects/attempt/evidence/report
  values and has no DOM/React/browser import;
- `presentation.ts` exports the frozen DOM-bearing
  `PhoneLeafReportPort`/`PhoneLeafCommandHandle` contract without projector
  state or global listeners;
- every segment has forward and reverse descriptors;
- every hold has checkpoint, edge surface, plane, landing, content proof,
  frame proof, navigation target, reduced-motion policy, and direct-entry
  policy;
- every segment has source, target, timing reference, effect placement,
  prepare policy, terminal evidence, rollback policy, input boundary, deadline
  policy, media-activation policy, and dependency closure;
- all 30 segment directions and all 16 direct entries explicitly declare
  `load`, `mount`, `prewarm`, `retainUntil`, `exposeReceiverAfter`,
  `retireAfter`, and numeric resource maxima;
- `exposeReceiverAfter` accepts prepared module/root/decode-or-draw/layout
  kinds only; final content/frame/coverage/scroll proof is rejected there as a
  circular contract;
- every dependency reference is owned by its closure and every retained
  terminal compositor has a declared retirement proof;
- no prewarm record may mount/play/activate/allocate a decoder or WebGL;
- direct-entry closure is a minimal subset and cannot implicitly load earlier
  story scenes;
- all timing values come from named canonical timing exports;
- all `between`/`above-both` placements match Section 2.2;
- all opaque edge colors match Section 2.1;
- direct-entry aliases resolve to one canonical scene;
- no React, CSS, DOM, dynamic import, mutable module state, or runtime import is
  present in `protocol.ts` or `manifest.ts`.

Run and confirm RED:

```bash
pnpm -C app exec vitest run \
  src/production/phone-story/manifest.test.ts \
  src/production/phone-story/presentation.contract.test.ts
```

- [x] **Step 3.2: Implement descriptive manifest records**

Use records equivalent to:

```ts
export type PhoneSceneManifest = Readonly<{
  id: PhoneSceneId;
  checkpoint: PhoneCheckpointPolicy;
  edgeSurface: `#${string}`;
  plane: 'front' | 'grade-a' | 'group45' | 'group67' | 'native';
  landing: PhoneLanding;
  content: PhoneContentProof;
  frame: PhoneFrameProof;
  navigationId: PhoneSceneId;
  reducedMotion: PhoneReducedMotionPolicy;
  directEntry: PhoneDirectEntryPolicy;
}>;

export type PhoneSegmentManifest = Readonly<{
  id: PhoneSegmentId;
  source: PhoneSceneId;
  target: PhoneSceneId;
  timing: PhoneTimingReference;
  effectPlacement: 'between' | 'above-both';
  forward: PhoneSegmentLeg;
  reverse: PhoneSegmentLeg;
  rollback: PhoneRollbackPolicy;
}>;
```

Do not encode semantic fields as tuple positions or numbers. It is acceptable
for pure IDs, events, attempt keys, evidence slots, report values, and closure
types to live in `protocol.ts`. DOM-bearing leaf report/command interfaces and
`HTMLElement` must not live in `protocol.ts` or `manifest.ts`; those belong to
`presentation.ts`. Lifecycle functions and mutable registries are forbidden
in both pure files.

Create `presentation.ts` now, before runtime, with only the interfaces,
surface registration types, closed-report-port builder contract, and explicit
throwing/no-op test fixtures from Section 4.3. It must not yet sample viewport,
mutate DOM planes, attach global listeners, or own state. Task 4 imports this
contract; Task 5 fills in the one projector implementation. No interim adapter
may be invented in `runtime.ts`.

Use `canonicalSceneIds` and `canonicalSegments` from
`app/src/story/canonical-spine.ts` as the authoritative order/adjacency seeds
and enrich them with phone presentation fields. Do not maintain a second
manually ordered spine. Resolve each segment's canonical policy/duration from
the immutable `app/src/story/manifest.ts`; reference the named
`timings.ts` exports already used there instead of copying values.

Derive ID types from those canonical constants rather than writing another
union:

```ts
type PhoneSceneId = (typeof canonicalSceneIds)[number];
type PhoneSegmentId = (typeof canonicalSegments)[number]['id'];
```

- [x] **Step 3.3: Add pure manifest lookup and closure selectors**

Pure exports should include:

```ts
phoneSceneById(id)
phoneSegmentBetween(source, target)
phoneEntryForLocation(pathname, hash)
phoneAdjacentTarget(scene, direction)
phoneDirectEntryClosure(scene)
phoneSegmentClosure(segment, direction)
phoneDeadlinePolicy(operation)
phoneMediaActivationPolicy(sceneOrSegment)
phoneManifestIntegrity()
```

Hash parsing must normalize known historical aliases once. Runtime must never
contain another scene switch table.

Snapshot-derived edge/checkpoint/navigation selectors belong in `machine.ts`
because `manifest.ts` may not import runtime snapshot state.

Encode Appendix E exactly through named normalized scene, closure, resource,
and deadline profiles. A test expands those profiles into all 30 direction
records and 16 cold direct-entry records and deep-compares the authoritative
fields. Warm entry uses Appendix E's source-anchor plus target-direct-entry
union algorithm. The executor may not infer selectors, surface IDs, resource
maxima, or deadlines from whatever a new leaf happens to render.

Before implementation, estimate the normalized `manifest.ts` and ten-file
total LOC. The 5,000 total wins over summed per-file headroom. If the honest
matrix is projected to exceed 550 manifest lines or the total ceiling, trigger
Appendix C before writing compressed tuples or spilling policy into another
file.

- [x] **Step 3.4: Verify no timing/media drift**

```bash
pnpm -C app exec vitest run \
  src/production/phone-story/manifest.test.ts \
  src/production/phone-story/presentation.contract.test.ts
pnpm -C app run verify:phone-architecture
pnpm -C app test
pnpm -C app typecheck
git diff --exit-code 9652fbe -- \
  assets app/scripts/homepage-media-contract.mjs app/src/story/timings.ts \
  app/src/story/copy.ts app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts app/src/story/spine.ts app/src/story/media.ts
```

- [x] **Step 3.5: Commit**

```bash
git add app/src/production/phone-story
git commit -m "feat(r5): declare canonical phone story manifest"
```

**Task 3 acceptance:**

- one exhaustive manifest describes all holds, segments, directions, landings,
  edge surfaces, proof rules, entries, dependency closures, deadlines,
  activation rules, and resource maxima;
- the bidirectional leaf interfaces exist before runtime and support named
  multi-surface registration without runtime/dispatch leakage;
- expanded manifest records match Appendix E exactly;
- runtime and leaves will not need their own story-order switch tables;
- architecture gate remains green.

---

## Task 4: Implement one pure machine and one route-local effect runtime

**Create:**

- `app/src/production/phone-story/machine.ts`
- `app/src/production/phone-story/machine.test.ts`
- `app/src/production/phone-story/runtime.ts`
- `app/src/production/phone-story/runtime.test.ts`

No React, CSS, scene, transition, or QA file may be imported. `machine.ts` may
not touch DOM/browser globals; `runtime.ts` may not construct stable state
outside the machine.

### Slice 4A — pure machine, cold boot, and warm entry

- [x] **Step 4A.1: Build deterministic pure-machine fixtures**

Create explicit attempt/slot builders, the serial priority event queue, and
evidence queues. Tests dispatch events directly; they do not wait on
wall-clock time. The fixture must make
`stateRevision`, `commitSequence`, `transactionGeneration`, and
`planeRevision` separately observable.

- [x] **Step 4A.2: Write RED cold and warm entry matrices**

For all 16 cold initial/hash targets:

- initial state is a `mode: 'boot'` transaction with
  `stableCommit/presentationProof: null`;
- candidate/phase/attempt/evidence/deadline are in the snapshot, never an
  effect-local side store;
- withholding any manifest-required slot prevents stable/Loader release;
- source/effect/target slots can differ while sharing one attempt key;
- stale attempt/generation or wrong slot reports are ignored;
- complete quorum invokes the sole `commitStableCandidate()` branch once;
- `commitSequence` increments once; toolbar/plane changes cannot increment it.

For every ordered pair of different stable source and target scenes
(16 × 15), test menu, programmatic hash, and popstate origins through
`mode: 'entry'`:

- exact source `PhoneStableCommit` and proof remain the rollback anchor;
- target uses the Appendix E warm-entry closure union;
- menu/programmatic URL changes only after target stable;
- popstate/hash whose URL already changed restores source URL with one
  `replaceState` after source re-proof on failure;
- failure preserves source object identity and `commitSequence`;
- success commits target exactly once;
- a newer warm entry supersedes the candidate without losing the original
  stable anchor;
- same-scene entry is a bounded landing/proof no-op, not a new semantic
  commit.

Also test unknown cold hash normalization, cold target failure → new Hero boot
attempt, Hero failure → `faulted` safe cover, accessible retry,
new-generation retry, history canonicalization, and rejection of old reports.

- [x] **Step 4A.3: Implement pure snapshot, selectors, and boot reduction**

`machine.ts` owns:

```text
identity/slot guards
reducePhoneStory()
commitStableCandidate() — exactly one branch
reprojectCommittedPlane() — proof-only recovery; never a semantic commit
edge/checkpoint/navigation selectors
boot/direct-entry transitions
warm entry transitions retaining the stable rollback anchor
revision increment helpers with the four fixed meanings
```

It emits effect descriptions only. It cannot import `presentation.ts`,
`runtime.ts`, React, DOM, timers, or lazy leaves.

- [x] **Step 4A.4: Verify and commit Slice 4A**

```bash
pnpm -C app exec vitest run src/production/phone-story/machine.test.ts \
  --testNamePattern="boot|entry|direct|queue|revision"
pnpm -C app run verify:phone-architecture
pnpm -C app typecheck
git diff --exit-code 9652fbe -- \
  assets app/scripts/homepage-media-contract.mjs app/src/story/timings.ts \
  app/src/story/copy.ts app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts app/src/story/spine.ts app/src/story/media.ts
git add app/src/production/phone-story/protocol.ts \
  app/src/production/phone-story/protocol.test.ts \
  app/src/production/phone-story/machine.ts \
  app/src/production/phone-story/machine.test.ts
git commit -m "feat(r5): establish phone entry transaction machine"
```

### Slice 4B — segment transactions, rollback, and terminal fault

- [x] **Step 4B.1: Write the RED 15 × 2 transaction/closure matrix**

For every segment direction, visit every canonical staged stop:

```text
stable(source)
→ preparing
→ presenting-source
→ playing / dwelling / awaiting-leg-intent
→ presenting-target
→ aligning
→ verifying
→ stable(target)
```

Assert source retention, receiver exposure, terminal-compositor retention,
retirement proof, resource maxima, no candidate selector leakage, monotonic
directional progress, prepared-proof → atomic candidate-plane → projector
visible-proof ordering, and no commit without all slots. Figure2 distance,
TTG → Lab, and PH → Education must use canonical timing/gesture policies.
Reduced motion skips sampling only, not proof or closure.

- [x] **Step 4B.2: Write RED failure/deadline/fault tests**

Inject failure at scene/transition load, mount, content, media preparation,
first frame, playback, plane, coverage, landing, scroll, post-paint, and every
named deadline. Each ordinary failure rolls back, re-proves source
plane/frame/landing, releases input once, and permits a new generation.
Successful rollback preserves the exact source `PhoneStableCommit` object and
`commitSequence`, replaces only source proof through
`reprojectCommittedPlane()`, and proves `commitStableCandidate()` was not
called.

Then independently fail source module, source frame/Canvas, source plane, and
source scroll during rollback. Each must enter `faulted` by the rollback
deadline with either a still-proven source or opaque safe cover plus retry.
There may be no unbounded `rolling-back`. Rewrite `e883784` behavioral cases
against this machine; do not copy its runtime.

- [x] **Step 4B.3: Implement segment/rollback/faulted reduction**

All transaction modes remain in the same reducer. Named deadline effects come
from manifest policy. A dwell deadline proves only dwell; it cannot synthesize
frame, content, plane, or stable evidence.

- [x] **Step 4B.4: Verify and commit Slice 4B**

```bash
pnpm -C app exec vitest run src/production/phone-story/machine.test.ts \
  --testNamePattern="segment|rollback|fault|deadline"
pnpm -C app run verify:phone-architecture
pnpm -C app typecheck
git diff --exit-code 9652fbe -- \
  assets app/scripts/homepage-media-contract.mjs app/src/story/timings.ts \
  app/src/story/copy.ts app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts app/src/story/spine.ts app/src/story/media.ts
git add app/src/production/phone-story
git commit -m "feat(r5): close phone segment rollback machine"
```

### Slice 4C — input, history, viewport, and BFCache

- [x] **Step 4C.1: Build a deterministic runtime environment**

Provide controllable monotonic IDs, active-foreground clock, timeout/RAF
queues, listener registration, visual viewport, history/hash, page lifecycle,
scroll commands, and snapshot publication. Expose listener/resource counts.

- [x] **Step 4C.2: Write RED physical-input/history/viewport tests**

Cover wheel, touch, pointer, keyboard, momentum tails, native corridors,
Contact controls, runtime-originated scroll samples, menu/hash/popstate
history, visual-toolbar reprojection, width/orientation invalidation, and
unsupported geometry. One physical epoch may claim one adjacent segment only.
Toolbar changes increase state/plane revisions, not commit sequence.
Tests must prove `reprojectCommittedPlane()` retains scene, semantic landing,
checkpoint, navigation, and stable-commit object identity while replacing all
final presentation evidence under a new `planeRevision`.

Drive the Section 4.8 phase table mechanically. Assert:

- `reducePhoneStory()` is never synchronously re-entered;
- snapshot publication precedes effect interpretation/callback enqueue;
- lane priority applies only between reducer calls and same-lane events remain
  FIFO;
- toolbar/scroll coalescing retains the final sample;
- hidden/layout invalidation preempts candidates;
- rollback rejects candidate evidence/input and retains only the newest
  external entry;
- that queued warm entry starts only after source re-proof.

- [x] **Step 4C.3: Write RED BFCache and hidden-deadline tests**

Cover `pagehide/pageshow` with `persisted=true` and `false`:

- hidden time pauses active deadlines and cannot commit;
- persisted hide invalidates evidence without making the page BFCache-hostile;
- persisted show with a stable commit creates a recovery generation and
  re-proves plane/content/frame/coverage/landing/scroll before input;
- persisted show without a stable commit keeps Loader opaque and restarts the
  original boot/direct-entry candidate;
- ordinary unload/disconnect fully disposes;
- repeated back/forward restores one listener set, one authority, and no stale
  media/Canvas token.

- [x] **Step 4C.4: Implement the sole input/history/page-lifecycle adapter and commit**

```bash
pnpm -C app exec vitest run src/production/phone-story/runtime.test.ts \
  --testNamePattern="input|history|viewport|pagehide|pageshow|BFCache"
pnpm -C app run verify:phone-architecture
pnpm -C app typecheck
git diff --exit-code 9652fbe -- \
  assets app/scripts/homepage-media-contract.mjs app/src/story/timings.ts \
  app/src/story/copy.ts app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts app/src/story/spine.ts app/src/story/media.ts
git add app/src/production/phone-story/runtime.ts \
  app/src/production/phone-story/runtime.test.ts \
  app/src/production/phone-story/machine.ts \
  app/src/production/phone-story/machine.test.ts
git commit -m "feat(r5): unify phone input history and page lifecycle"
```

### Slice 4D — effect interpreter, media activation, and disposal

- [x] **Step 4D.1: Write RED effect and activation tests**

The deterministic ports cover module loading, presentation application,
scroll confirmation, history, media/playback, and closure resource counts.
Assert:

- only a claimed physical epoch offers one activation credit;
- only current-closure media may spend it;
- no global video unlock sweep exists;
- chunk-not-ready loses the first activation but completes module load and
  inert media-surface registration, retains the active closure in
  `awaiting-media-activation`, and releases cinematic input;
- CTA remains hidden/disabled until the registered media surface can be
  activated synchronously;
- the next real CTA gesture renews generation/frame token and calls `play()`
  synchronously without another import, mount, or React commit;
- old callbacks/ports/tokens retire while the prepared DOM/media topology
  remains mounted;
- one mount registration exposes all manifest-declared surface IDs and one
  `PhoneLeafCommandHandle`; Crane registers two videos/two canvases through
  the same generic contract;
- runtime invokes `render`, `settle`, `pause`, `rebind`, and idempotent
  `dispose` only through that handle;
- `rebind` swaps to a newly closed `PhoneLeafReportPort` without remounting,
  and the leaf never receives attempt/slot/dispatch;
- disposal follows invalidate → pause/cancel → dispose/unregister → release
  resource-count order;
- direct media entry tries declared muted/playsInline autoplay, then remains
  covered with accessible tap-to-continue on rejection;
- `play()` success never fills a frame slot;
- leaf progress/frame/complete callbacks cannot directly change phase/commit.

- [x] **Step 4D.2: Implement the one factory/effect interpreter**

`runtime.ts` owns subscriptions, active-foreground deadlines, RAFs,
AbortControllers, generation invalidation, closure load/mount/retire,
activation credits, presentation/scroll/history commands, publication, and
disconnect. It calls only `reducePhoneStory()` for state transitions.

Its environment freezes the transport-only bootstrap port:

```ts
type PhoneChunkRecoveryPort = Readonly<{
  reportRejectedChunk(
    failure: PhoneRejectedChunkFailure
  ): Promise<'reloading' | 'fail-closed'>;
  markStable(proof: PhoneStableRecoveryProof): void;
}>;
```

The runtime can request recovery and keep Loader/source covered; it cannot read
or reset lineage, call `location.reload()` directly, or classify builds
itself. Harness tests inject a deterministic fake. Task 11 supplies the eager
implementation.

- [x] **Step 4D.3: Prove deterministic disposal**

Every listener, timer, RAF, AbortController, leaf resource, media token,
subscriber, Canvas, and WebGL context is removed/retired. StrictMode
connect A → disconnect A → connect B has distinct authority IDs and no
overlap. A disconnected authority ignores all callbacks.

Successful immutable module promises and a Document-keyed render-resource pool
without story state are the only allowed shared caches. Application references
to rejected promises are cleared for disposal/diagnostics, but runtime must
never retry a natively rejected module URL in the same Document; guarded
reload recovery is specified in Tasks 6/12.
Module-level current-document/authority state and lifecycle WeakMaps/Sets are
forbidden.

- [x] **Step 4D.4: Run mutation/global checks and commit**

Deliberately invert one attempt guard, one evidence-slot quorum bit, and one
activation-scope guard; confirm tests fail, then restore and record results.

```bash
pnpm -C app exec vitest run \
  src/production/phone-story/machine.test.ts \
  src/production/phone-story/runtime.test.ts
pnpm -C app run verify:phone-architecture
pnpm -C app test
pnpm -C app typecheck
pnpm -C app build
git diff --exit-code 9652fbe -- \
  assets app/scripts/homepage-media-contract.mjs app/src/story/timings.ts \
  app/src/story/copy.ts app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts app/src/story/spine.ts app/src/story/media.ts
git add app/src/production/phone-story
git commit -m "feat(r5): centralize phone effects and media activation"
```

**Initial Task 4D closure record (2026-08-01):**

- Focused machine/runtime verification passed 54/54 tests; the complete suite
  passed 181 files / 1139 tests, followed by TypeScript and the complete
  production build.
- Mutation proof was executed and restored: inverting the attempt-generation
  guard failed stale/latest-attempt tests; changing complete quorum from
  `every` to `some` failed the withheld-slot matrix; inverting activation
  surface scope failed CTA/current-closure tests.
- Unified review additionally closed active-toolbar proof restart without
  losing attempt/stage/progress, inert `faulted` viewport/BFCache behavior,
  rollback pending-entry retention across unsupported/layout recovery,
  immutable report bindings/registration inventories, false readiness/frame
  rejection, and non-media activation-rejection forgery.
- Architecture and build gates passed at protocol 436/450, manifest 539/550,
  presentation 100/900, machine 1099/1100, and runtime 1000/1000 non-blank
  LOC. Phone JS is 628,833 B and the largest lazy chunk is 41,116 B. Frozen
  donor inputs are unchanged; archived evidence verifies 44/44 report hashes
  and 227/227 files (217,091,751 bytes).
- This initial closure was subsequently reopened by correctness review; the
  corrective record below supersedes its no-finding statement. Task 5 was not
  started.

**Task 4D corrective closure record (2026-08-01):**

- Surface-bound prepared slots now require both Crane Canvas draws; all
  D-static prepared orderings reject a `0ms` media deadline; every ordered
  warm-entry rollback preserves its normalized union deadline; and the full
  hash/popstate rollback matrix re-canonicalizes any newer external target.
- Reduced motion is sampled from the runtime environment and still completes
  source proof on all 30 legs. Leaf progress/completion cannot advance the
  reducer; only the runtime clock can do so.
- Registration, DOM/resource validation, and prepared-proof construction are
  injected through `PhonePresentation`; runtime retains only opaque leases.
  Multi-surface activation carries per-surface asynchronous settlements, and
  any partial rejection pauses the closure, reclaims decoder counts, and
  enters the covered CTA path.
- Dependency loading now returns a structured failed dependency and native
  module URL. A second consecutive segment can reject its own transition URL
  while the stable source rollback reloads successfully. Publication and
  command boundaries re-check the exact connection, so synchronous disconnect
  cannot recreate an old-authority RAF.
- Corrective TDD first produced 12 focused failures. Final focused verification
  passed 82/82; Node gate fixtures passed 114/114; the complete Vitest suite
  passed 181 files / 1151 tests, followed by focused ESLint, TypeScript, and the
  complete production build.
- Architecture gates pass at protocol 450/450, manifest 547/550,
  presentation 255/900, machine 1098/1100, and runtime 998/1000 non-blank LOC.
  The still-frozen formal production closure remains 628,833 B of phone JS
  with a 41,116 B largest lazy chunk; these figures do not claim Task 5
  cutover. Frozen donor inputs are unchanged, and archived evidence verifies
  44/44 report hashes plus 227/227 files (217,091,751 bytes).
- The complete machine/runtime, rollback, activation, queue, and disposal
  review is closed. Task 5 remains unstarted.

**Task 4D second corrective closure record (2026-08-01):**

- Activation is now derived from the actual entry target or exact segment
  mount roles, never from a warm union capacity. A runtime/mount seam covers
  all 240 ordered warm source/target pairs without injecting
  `activation-settled`; only targets with real video registrations invoke the
  activation command.
- D-static preparation retains its original positive module deadline while
  structural/static evidence is incomplete. Every prepared arrival ordering
  now asserts a non-null, positive deadline rather than accepting `null` as
  “not zero.”
- Runtime issues a fresh frame token at initial registration and every retained,
  activation, or stage rebind, stores the expected token on the opaque lease,
  and rejects stale-token frames before presentation verification. The same
  centralized rebind path regenerates structural proof without direct reducer
  event injection.
- Native dependency settlement is split from attempt evidence: a superseded
  import's late fulfillment/rejection updates the same-Document cache and
  recovery lineage, while its emptied waiter set cannot write stale reducer
  evidence. A later request for the rejected dependency fails closed without
  calling the loader again.
- Rollback deferral marks URL replacement only for queued `hash`/`popstate`
  requests; queued `menu`/`programmatic` requests retain their required push.
  Lease pause/dispose/release and every dependency release now run to completion
  before one `AggregateError` is reported, with listener/timer/RAF/registry and
  resource ownership cleared even when a cleanup callback throws.
- Task 5's modify set now includes `runtime.ts` and `runtime.test.ts`. The plan
  fixes the local projector wiring, exact proof-to-slot mapping, prohibition on
  forwarding `apply-presentation-plane` through the generic environment hook,
  and a structural 960-before/1000-after runtime LOC strategy. Task 5 remains
  unstarted.
- Corrective TDD first produced 19 focused failures. Final focused verification
  passed 80/80; Node gate fixtures passed 114/114; the complete Vitest suite
  passed 181 files / 1160 tests, followed by focused ESLint, TypeScript, and the
  complete production build. No Playwright run was required for this
  gate/runtime/document-only corrective.
- Architecture gates pass at protocol 450/450, manifest 547/550,
  presentation 274/900, machine 1097/1100, and runtime 999/1000 non-blank LOC.
  Formal phone JS remains 628,833 B with a 41,116 B largest lazy chunk. Frozen
  donor inputs are unchanged; archived evidence verifies 44/44 report hashes
  and 227/227 files (217,091,751 bytes).

`connect()` installs one active authority and returns its complete disconnect.
Each connection starts a fresh boot transaction for the explicit entry.

**Task 4 acceptance:**

- all 16 cold entries, all warm source/target pairs, and all 30 segment
  directions use one reducer;
- cold boot and warm entry candidate/evidence/URL intent are reducer state,
  not effect-interpreter state;
- warm menu/hash/popstate failure retains the original stable source and URL;
  a newer external request queued during rollback is re-canonicalized after
  source proof, while queued menu/programmatic intent still pushes history;
- one stable-commit branch requires one attempt's complete evidence slots;
- one proof-only reproject branch retains the stable commit and refreshes all
  final presentation evidence;
- report ports close over attempt/slot identity, command handles expose only
  visual operations, and neither path gives a leaf dispatch/content proof;
- four revision meanings are separately tested;
- all rollback failures reach stable or `faulted` within a deadline;
- physical input, media activation, page lifecycle, and disposal have one
  owner;
- no browser global entered `machine.ts`; no visual leaf entered runtime.

---

## Task 5: Implement one atomic presentation and viewport projector

**Create:**

- `app/src/production/phone-story/presentation.test.ts`
- `app/src/production/phone-story/styles.css`

**Modify:**

- `app/src/production/phone-story/presentation.ts` created as a contract in
  Task 3
- `app/src/production/phone-story/runtime.ts`
- `app/src/production/phone-story/runtime.test.ts`

- [x] **Step 5.1: Write RED tests for the semantic layer plan**

Use an in-memory registration/geometry fixture and test both directions of all
15 segments. The expected stack is:

```text
coverage plane: 0
source plane: 10
between effect: 20
receiver plane: 30
above-both effect: 40
interaction/nav plane: 50
Loader: separate top-level cover until proven release
```

The exact values may change together, but ordering may not. Tests must reject:

- an opaque sibling or pseudo-element above the active scene;
- a descendant z-index attempting to escape an occluding ancestor stacking
  context;
- source/receiver/effect in different undocumented stacking contexts;
- `between` rendered above the receiver;
- `above-both` rendered below either endpoint;
- a plane revision assembled from two attempt keys.

Visual transition planes must not duplicate the interactive/accessibility
tree: non-committed visual endpoints are inert and `aria-hidden`, while the
one stable native reading subtree owns focus and interaction.

Tests must also prove the two-stage exposure order: source/Loader occludes the
inert target during prepared proof; one atomic candidate-plane apply makes the
receiver non-occluded inside the story stack while retaining source mounted as
rollback anchor; interaction remains disabled until stable commit.

- [x] **Step 5.2: Write RED viewport and coverage tests**

Define two distinct value objects:

```ts
type PhoneLayoutViewport = {
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
};

type PhoneVisualViewport = {
  offsetLeft: number;
  offsetTop: number;
  width: number;
  height: number;
  scale: number;
};
```

Tests must prove:

- toolbar `resize`/`scroll` changes only coverage geometry;
- width/orientation/fullscreen invalidation may recompute authored layout;
- `offsetLeft` and `offsetTop` are never dropped;
- multiple viewport events coalesce into one runtime-scheduled apply;
- four edge sample points fall inside the coverage and active scene plane;
- a one-pixel bottom/right deficit fails;
- `0`, fractional, zoomed, and landscape offsets are handled explicitly;
- no scene ID changes the coverage calculation.

- [x] **Step 5.3: Write RED content/frame proof tests**

Content proof must require:

- target root is connected;
- every required selector resolves within that registered target;
- each required element has a non-empty rect intersecting the live visual
  viewport;
- computed visibility, display, opacity, clip, and occluding layer checks pass;
- the proof belongs to the current plane revision.

Only projector may generate this proof from its registered root. A leaf
`registerMount()` call is registration, not evidence, and no leaf-created
`PhoneContentReport` is accepted. During direct-entry boot, the one registered
Loader safety cover is excluded from story-stack occlusion calculation; every
other source/effect/ancestor remains part of it.

Mount-registration tests must also prove:

- every surface ID is declared by the Appendix E profile for that leaf;
- duplicate IDs, surfaces outside the registered root, and a second live mount
  for one binding are rejected;
- the runtime-side lease retains exactly the registered command handle while
  the leaf receives no lease, identity, or dispatch capability;
- generation rebind reuses the lease without remounting;
- lease release unregisters all surfaces and resource counts exactly once.

Prepared leaf frame facts and final visible-frame proof are different:

| Policy | Prepared fact beneath source/Loader | Final projector proof after candidate plane |
| --- | --- | --- |
| `static-post-paint` | registered content/layout ready | current-plane content/frame post-paint |
| `image-decode-paint` | every required `decode()` resolved | decoded element visibly painted |
| `canvas-draw` | successful draw callback for bound token | same registered Canvas visibly presented |
| `packed-canvas-draw` | compositor delivered a real active-token draw | drawn surface visibly presented in current plane |
| `decoded-composite-frame` | decoded source + successful bound compositor draw | composited surface visibly presented in current plane |

Explicit invalid evidence:

```text
generic RAF
elapsed timeout
video.play() resolution
currentTime change
readyState alone
dataset "ready"
root rect alone
Canvas existence
```

- [x] **Step 5.4: Implement the route-local projector**

The API should remain narrow:

```ts
export type PhonePresentation = Readonly<{
  attachRoot(root: HTMLElement): () => void;
  registerLeafMount(
    request: PhoneLeafMountRequest
  ): PhoneLeafMountLease;
  sampleLayoutViewport(): PhoneLayoutViewport;
  sampleVisualViewport(): PhoneVisualViewport;
  verifyPrepared(request: PhonePreparedProofRequest): PhonePreparedProof;
  applyPlane(request: PhonePlaneRequest): PhonePlaneApplyResult;
  verifyVisibleCandidate(
    request: PhoneVisibleCandidateProofRequest
  ): PhonePresentationProof;
  verifyReproject(
    request: PhoneReprojectProofRequest
  ): PhonePresentationProof;
  verifyRollback(request: PhoneRollbackProofRequest): PhoneRollbackProof;
}>;

export function createPhonePresentation(
  dependencies: PhonePresentationDependencies
): PhonePresentation;
```

Task 5 is a projector/runtime integration task, not a presentation-only file
task. The serializable `apply-presentation-plane` effect remains narrow: its
exact leg and phase are derived fail-closed from the active transaction's
`requiredFinal` slots. Every slot must share the effect attempt and
`planeRevision`, and must name exactly one of `source`, `target`, or `rollback`.
This avoids adding duplicate phase authority to `protocol.ts` while still
giving `PhonePlaneRequest` a closed leg, scene, revision, viewport, and
required-proof identity.

`runtime.ts` must wire the projector directly:

1. sample layout/visual viewport values through the injected
   `PhonePresentation` at the existing runtime-owned host/RAF boundaries;
2. intercept `apply-presentation-plane`, validate it against the current
   attempt and `requiredFinal`, and call exactly one of `applyPlane`,
   `verifyVisibleCandidate`, `verifyReproject`, or `verifyRollback` as selected
   by the reducer-owned transaction/slots;
3. map returned proof records only onto the exact current `requiredFinal`
   slots, rejecting missing, extra, mixed-attempt, mixed-leg, or stale-revision
   records before enqueueing `evidence-reported`;
4. convert projector failure into the existing bounded `failure-reported`
   path for that exact slot; and
5. do not forward `apply-presentation-plane` to
   `environment.performEffect`. That generic hook may observe/serve the other
   browser effects, but it is not a second plane adapter or proof authority.

`runtime.test.ts` must prove this wiring with source, target, reproject, and
rollback cases, including stale revision, mixed leg, partial proof, and a
generic `performEffect` callback attempting to forge plane evidence. Tests
must also prove that one projector result creates at most one record for each
exact reducer slot.

The LOC work is structural and precedes projector behavior. Before adding the
bridge, extract the browser-independent activation-batch settlement and
generation-token/ordered-cleanup mechanics into named pure helpers in
`presentation.ts`; runtime retains every connection check, queue, reducer
enqueue, resource counter, and lease map. The RED refactor checkpoint requires
`runtime.ts <= 960` non-blank LOC before projector wiring and `<= 1000` after
it, while `presentation.ts` remains `<= 900`. No compressed statements,
shortened diagnostics, type assertions, new core helper file, or second
coordinator may be used to meet the budget.

`createPhoneLeafReportPort(...).registerMount()` must close over
`registerLeafMount()`; the leaf never receives the returned lease.
`PhoneLeafMountLease` is route-local infrastructure containing the opaque
registration key, the registered `PhoneLeafCommandHandle`, and one idempotent
release function. The effect interpreter keeps the lease in its
non-serializable closure registry and addresses it only through the
runtime-created attempt/stage/leg binding. It is not reducer state and may not
be rediscovered from DOM attributes.

Scene and transition/effect leaves both enter through this one mount method;
the closed binding declares their source/effect/receiver role. There is no
parallel public `registerSurface()` or `registerEffect()` path from which an
executor can build a second registry.

`registerLeafMount()` must reject undeclared or duplicate surface IDs against
the Appendix E scene/transition contract, reject a surface outside the
registered root, and atomically remove the root, surfaces, command handle,
and resource accounting when its lease releases. A generation rebind updates
the existing lease; it does not create a second mount or a scene-specific
adapter.

`presentation.ts` owns calculation, registration, DOM application, and
verification policy. Runtime owns when sampling/application occurs and owns
global subscriptions/RAF scheduling.

`verifyReproject()` always creates fresh final content/frame/coverage/
landing/scroll proof bound to the retained stable commit and new
`planeRevision`; it may consume retained decode readiness as preparation but
cannot copy a prior final proof object.

The cleanup returned by `attachRoot()` clears the root and all registrations
for that connection. A later StrictMode attach starts empty; no module-global
registry or detached DOM reference may survive.

- [x] **Step 5.5: Establish one fixed topology before Loader exit**

`styles.css` must implement one documented stacking context. The required
shape is:

```html
<main class="phone-story">
  <div class="phone-story__viewport">
    <div class="phone-story__coverage"></div>
    <div class="phone-story__planes">
      <div data-phone-plane="source"></div>
      <div data-phone-plane="effect"></div>
      <div data-phone-plane="receiver"></div>
    </div>
  </div>
  <div class="phone-story__reading-flow"></div>
</main>
```

CSS requirements:

- the viewport/stage topology is `position: fixed` from its first rendered
  frame and never changes to/from `absolute`;
- coverage and scene planes share the same isolated stack;
- coverage is opaque and below all visible scene/effect planes;
- no `::before`/`::after` coverage sibling sits above the planes;
- live visual-viewport geometry comes from projector variables containing all
  five visual-viewport fields;
- authored layout geometry uses separate variables;
- scene leaves cannot set global stage z-index;
- one transition layer plan controls between/above placement;
- Loader remains opaque above this complete topology until runtime proof.

- [x] **Step 5.6: Make Hero zero synchronous**

The projector must apply Hero's initial presentation variables before the
Loader may receive `ready=true`:

```text
Hero motion/progress = 0
Hero geometry = initial authored geometry
fixed stage topology already mounted
required images decoded
post-paint proof accepted
```

There is no CSS default of `1`, no completed Hero shown before reset, and no
two-RAF fixed-stage registration that changes topology after reveal.

- [x] **Step 5.7: Verify and commit**

```bash
pnpm -C app exec vitest run \
  src/production/phone-story/presentation.test.ts \
  src/production/phone-story/runtime.test.ts
pnpm -C app run verify:phone-architecture
pnpm -C app test
pnpm -C app typecheck
pnpm -C app build
git diff --exit-code 9652fbe -- \
  assets app/scripts/homepage-media-contract.mjs app/src/story/timings.ts \
  app/src/story/copy.ts app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts app/src/story/spine.ts app/src/story/media.ts
git add app/src/production/phone-story
git commit -m "feat(r5): make phone presentation atomic"
```

**Task 5 acceptance:**

- one projector applies a whole plane revision;
- no scene-specific coverage calculation exists;
- layering tests model real ancestor stacking contexts;
- Hero initial zero and fixed topology precede Loader release;
- runtime remains the scheduling/commit authority.

---

## Task 6: Wire the clean shell, bidirectional leaf boundary, and fail-closed Loader

**Create:**

- `app/src/production/phone-story/PhoneStoryShell.tsx`
- `app/src/production/phone-story/PhoneStoryShell.test.tsx`
- `app/src/production/phone-story/scenes.tsx`
- `app/src/production/phone-story/transitions.tsx`

**Modify:**

- `app/src/production/StoryLoader.tsx`
- `app/src/production/StoryLoader.test.tsx`
- `app/package.json`
- `pnpm-lock.yaml`

Formal `/` still imports the old `production/phone/PhoneStoryShell` after this
task. The clean shell is unit-tested but not yet a production route.

- [x] **Step 6.1: Write RED shell-ownership tests**

Mock `scenes.tsx` and `transitions.tsx` with deterministic leaves. Tests must
prove:

- the shell is the only source call site of `createPhoneStoryRuntime`;
- one mounted shell has one current runtime and one presentation object;
- StrictMode's discarded mount is disposed before the live mount owns input;
- rerendering a snapshot does not recreate runtime;
- constructing a route-local runtime/projector object is side-effect free;
- a keyed formal ↔ QA route remount disconnects the old connection before the
  new connection may attach listeners, claim input, start clocks, or activate
  media; React may construct the inert new object before old cleanup;
- hash/menu/history entry inside one mounted route uses `requestEntry()` and
  does not recreate runtime;
- unmount removes all listeners/resources;
- shell uses `useSyncExternalStore` or equivalent immutable subscription and
  does not mirror machine fields into independent React state;
- scenes/effects receive runtime-created closed report ports plus visual-only
  command handles, not attempt/slot constructors or runtime dispatch;
- missing/rejected lazy leaves report prepare failure and roll back;
- nested lazy boundaries always render an opaque Loader or the last committed
  plane, never `fallback={null}`.

The StrictMode ownership test must use a real React DOM effect environment,
not a source assertion or hand-called connect/disconnect sequence. Add
`jsdom` as an app dev dependency, mark
`PhoneStoryShell.test.tsx` with `// @vitest-environment jsdom`, mount with
`createRoot(<StrictMode>...)`, and assert actual layout-effect
connect → cleanup → reconnect ordering plus listener/input counts. The global
Vitest default remains `node`; only DOM lifecycle tests opt into jsdom.

- [x] **Step 6.2: Make StoryLoader phone-safe without forking it**

Add an optional prop with a desktop-preserving default:

```ts
allowSafetyExit?: boolean; // default true
```

`PhoneStoryShell` passes `false`. On phone:

- safety time alone cannot reveal unproven content;
- `ready` is true only for a proven boot commit;
- boot target failure starts the runtime's proven Hero fallback;
- terminal Hero failure keeps the static/React Loader opaque and exposes an
  accessible retry action;
- `onHidden` is diagnostic only and cannot commit state.

Tests must prove an elapsed 8-second Loader timer cannot reveal an unproven
phone target.

- [x] **Step 6.3: Implement typed lazy registries**

`scenes.tsx` and `transitions.tsx` contain:

- typed `import()` functions for genuine leaves;
- rendering components that bind an active identity to the narrow port;
- successful module-promise caching only;
- no reducer, listener, current scene, checkpoint, timer, or stable state.

During Tasks 6–10 the registries may be typed
`Partial<Record<PhoneSceneId, PhoneSceneLoader>>` and
`Partial<Record<PhoneSegmentId, PhoneTransitionLoader>>` because the clean
shell is not on formal `/`. Missing entries must fail closed. The Task 11
cutover gate rejects partial/incomplete registries.

Chunk rule:

```text
PhoneStoryShell + protocol + manifest + machine + runtime + presentation
  = one execution core
scene and transition implementations = lazy leaves
```

Do not dynamically import `protocol.ts`, `manifest.ts`, `machine.ts`,
`runtime.ts`, `presentation.ts`, a port type, or an authority helper.

Chunk cache/recovery contract:

- cache fulfilled module promises;
- if runtime detects offline **before** invoking native `import()`, retain
  Loader/source, wait for `online`, and perform the first import without a
  reload;
- once native `import()` or Vite preload has rejected, clear the application
  promise reference for disposal/diagnostics but never retry the same module
  URL in the same Document; browser module-fetch state is not an
  application-controlled cache;
- handle `vite:preloadError`, call `preventDefault()`, and route the payload
  through the same runtime fault/reload policy rather than allowing an
  unhandled blank-screen error;
- stamp HTML/execution core with the document build ID and fetch the deployed
  build identity from the existing `/r5-release-manifest.json` with
  `cache: 'no-store'`; its `sourceCommit`/artifact identity is the canonical
  comparison, so no second release manifest is created;
- either same-build network rejection or build/version mismatch permits at
  most one automatic page reload in the unresolved Section 4.9 recovery
  lineage; changed build IDs or hashed URLs after reload cannot create a new
  allowance;
- clear the lineage only after the requested cold boot/warm entry reaches a
  proven stable commit; manifest fetch has the 3,000 ms bounded terminal
  contract;
- if the native rejection occurs while offline, keep the Loader/source and
  wait for `online` before spending that one guarded reload; do not burn the
  guard against a known-offline fetch;
- after the guarded reload, a second rejection remains fail-closed under
  Loader/source with an accessible retry/reload action; it never loops;
- delayed module resolution from a superseded, non-rejected attempt remains
  generation-bound and cannot populate the active closure.

This runtime contract covers leaf imports after core load. Initial
`PhoneStoryShell`/core rejection is handled by the eager bootstrap boundary
implemented at Task 11 and tested at Task 12; it cannot be delegated back to a
runtime that does not yet exist.

- [x] **Step 6.4: Implement the shell topology**

The shell is responsible only for wiring:

```text
route props → entry request
createPhonePresentation → route-local disconnected projector
registries + environment + presentation → createPhoneStoryRuntime
snapshot subscription → render plane roles/reading flow
StoryLoader readiness → proven boot snapshot
StoryNav view → selectors from committed snapshot
root ref → presentation.attachRoot
layout effect → runtime.connect
cleanup → disconnect runtime, detach presentation root, then dispose leaf resources
```

The runtime value is created once per shell instance with a lazy React
initializer and starts with no listeners. `useLayoutEffect` attaches the root
and calls `connect()`. Its returned disconnect function makes StrictMode's
effect replay safe; a discarded connection is fully retired before the live
connection is created.

Allowed props:

```ts
type PhoneStoryShellProps = Readonly<{
  scope?: 'formal' | 'brand-lab' | 'harness';
  initialEntry?: PhoneEntryRequest;
  diagnostics?: boolean;
  chunkRecovery: PhoneChunkRecoveryPort;
}>;
```

`scope` may label diagnostics and select the explicit initial entry. It uses
the same active-window mounting algorithm and may not select a reducer, timing
table, projector, input policy, media policy, subtree policy, or lifecycle
callback.
`chunkRecovery` is an injected Section 4.9 transport capability containing
only `reportRejectedChunk()` and `markStable()`. It exposes no lineage record,
scene state, or reload decision to the shell/QA wrapper. Harness tests inject a
deterministic fake; formal/QA App routing supplies the eager controller.

The clean shell may render an orientation warning selected from the runtime
snapshot, but it must not import `useMobileLandscapeEntry` or create a second
gate/store. The stable desktop shell may keep its existing mobile-landscape
behavior unchanged.

- [x] **Step 6.5: Prove no new authority entered lazy chunks**

```bash
rg -n "runtime|dispatch|addEventListener|currentScene|checkpoint|setTimeout|requestAnimationFrame" \
  app/src/production/phone-story/scenes.tsx \
  app/src/production/phone-story/transitions.tsx
```

Every match must be a type/comment/import-loader false positive that the
architecture gate permits. There must be no import of `./runtime`.

- [x] **Step 6.6: Verify and commit**

```bash
pnpm -C app add -D jsdom
pnpm -C app exec vitest run \
  src/production/StoryLoader.test.tsx \
  src/production/phone-story/PhoneStoryShell.test.tsx \
  src/production/phone-story/runtime.test.ts \
  src/production/phone-story/presentation.test.ts
pnpm -C app run verify:phone-architecture
pnpm -C app test
pnpm -C app typecheck
pnpm -C app build
git diff --exit-code 9652fbe -- \
  assets app/scripts/homepage-media-contract.mjs app/src/story/timings.ts \
  app/src/story/copy.ts app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts app/src/story/spine.ts app/src/story/media.ts
git add app/src/production/StoryLoader.tsx \
  app/src/production/StoryLoader.test.tsx \
  app/src/production/phone-story \
  app/package.json pnpm-lock.yaml
git commit -m "feat(r5): wire one clean phone story shell"
```

**Task 6 acceptance:**

- exactly one production runtime factory call site exists;
- Loader cannot time out into unproven pixels;
- core modules are eager together and only visual leaves are lazy;
- pre-import offline recovery stays in-document; any native import rejection
  joins one cross-reload lineage with at most one automatic reload and can
  never loop;
- clean shell remains unreachable from formal `/`;
- absent leaves fail closed without creating a compatibility lifecycle.
- real jsdom StrictMode effect replay proves old connection cleanup before the
  live connection claims browser ownership.

**Task 5–6 closure record (2026-08-01):**

- Task 5 landed as `962683d` and Task 6 as `bbd6a7e`. The final integration
  closeout additionally corrected rollback/recovery plane identity,
  disconnected initial render ownership, exact and early lazy-rejection
  attribution, and exception-safe shell cleanup.
- Focused StoryLoader/shell/runtime/presentation verification passed 111/111;
  the complete Vitest suite passed 183 files / 1220 tests. The architecture
  gate, focused ESLint, TypeScript, complete production build, frozen-input
  check, and diff check all passed.
- Architecture budgets pass at protocol 450/450, manifest 547/550, machine
  1100/1100, runtime 1000/1000, presentation 898/900, shell 496/500, scenes
  155/180, and transitions 140/160 non-blank LOC. Formal phone JS is 628,892 B
  and the largest lazy chunk is 41,116 B.
- The real jsdom StrictMode replay proves disconnect/detach before reconnect;
  cleanup still detaches the projector if runtime disposal throws. Loader
  safety time cannot reveal an unproven phone target, terminal failure retains
  an accessible retry, and a rejected dependency is reported immediately even
  while a sibling import remains pending.
- Lazy registries contain no lifecycle authority, cache fulfilled promises,
  poison rejected module identities for the current Document, and keep missing
  leaves under non-null covers. The clean shell remains unreachable from the
  formal `/` route until Task 11, as required. Frozen donor inputs are
  unchanged. No Playwright rerun was required by this unit/integration review.
- The Task 6 mandatory code/integration review is closed with no remaining
  blocker. Task 7 remains unstarted.

---

## Shared migration rule for Tasks 7–10

The old formal shell remains the formal route authority until Task 11, but the
genuine leaves must be refactored to the clean visual port before cutover.
During that overlap:

- Move/refactor one genuine leaf implementation; do not maintain a clean copy
  and a legacy copy.
- If the old shell needs prop translation, put a stateless temporary bridge
  only in an already-existing file under
  `app/src/production/phone/adapter-groups/` or
  `app/src/production/phone/module-loaders.ts`.
- A temporary bridge may translate commands/reports. It may not add state,
  timers, RAF, input listeners, current-scene state, or stable-commit logic.
- Mark the bridge in the Task 11 deletion ledger and test that it is absent in
  cutover mode.
- Do not add a new compatibility file.
- After each leaf refactor, both the old formal-route regression and the clean
  harness checkpoint must pass.

Before **every** Slice 7B–7E, 8, 9A–9B, and 10A–10C commit, run the
slice-specific clean harness command plus this exact old-formal gate:

```bash
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-story.spec.ts \
  --project=mobile-webkit
```

Record both commands in the commit evidence. A slice may not defer old-formal
verification to the parent task's final checkpoint. This is intentionally the
strictest part of the dual-service window: one genuine leaf serves both paths,
while the temporary bridge remains stateless.

These are automated browser/pixel checkpoints, not scheduled user visual
reviews. Once the targeted clean WebKit and old-formal mobile-WebKit gates are
green, the executor may continue to the next slice. Escalate only an
unexplained donor mismatch, a proposed visual/timing change, or an Appendix C
stop condition. Full Chromium plus WebKit coverage remains at the final slice
of each parent task.

This allows one visual implementation to serve both migration paths without
duplicating accepted scenes or allowing the new core to import the old
lifecycle.

Harness checkpoints use the corrected Task 0.6 build rule: after TypeScript
and source gates, run `VITE_ENABLE_HARNESS=1 pnpm -C app exec vite build`.
Never run the package `build` wrapper with that flag, because the production
release verifier correctly rejects the other emitted R4 harness chunks. Run
the ordinary unflagged package build separately when a production build gate
is listed.

---

## Task 7: Integrate Front through AOD and reproduce the three known failures

**Create/move genuine leaves to canonical scene paths:**

- `app/src/scenes/hero/phone/PhoneHero.tsx`
- `app/src/scenes/hero/phone/PhoneHero.css`
- `app/src/scenes/hero/phone/PhoneHero.motion.ts`
- `app/src/scenes/hero/phone/PhoneHero.test.tsx`
- `app/src/scenes/pattern/phone/PhonePattern.tsx`
- `app/src/scenes/pattern/phone/PhonePattern.css`
- `app/src/scenes/pattern/phone/PhonePattern.test.tsx`
- `app/src/scenes/star-map/phone/PhoneStarMap.tsx`
- `app/src/scenes/star-map/phone/PhoneStarMap.css`
- `app/src/scenes/star-map/phone/PhoneStarMap.test.tsx`
- `app/src/scenes/aod-animation/phone/PhoneAod.tsx`
- `app/src/scenes/aod-animation/phone/PhoneAod.css`
- `app/src/scenes/aod-animation/phone/PhoneAod.test.tsx`
- `app/src/media/phone-media.ts`
- `app/src/media/phone-media.test.ts`
- `app/src/media/phone-packed-alpha-surface.ts`
- `app/src/media/phone-packed-alpha-surface.test.ts`

**Create/move genuine transition leaves:**

- `app/src/transitions/hero-pattern/phone.tsx`
- `app/src/transitions/hero-pattern/phone.test.tsx`
- `app/src/transitions/pattern-star-map/phone.tsx`
- `app/src/transitions/pattern-star-map/phone.test.tsx`
- `app/src/transitions/star-map-aod/phone.tsx`
- `app/src/transitions/star-map-aod/phone.test.tsx`
- `app/src/transitions/aod-method-top/phone.ts`
- `app/src/transitions/aod-method-top/phone.test.ts`

**Create critical browser harness/tests:**

- `app/src/harness/r5-phone-clean/PhoneCleanHarness.tsx`
- `app/e2e/r5-phone-clean-assertions.ts`
- `app/e2e/r5-phone-clean-runtime.spec.ts`
- `app/e2e/r5-phone-clean-presentation.spec.ts`

**Modify:**

- `app/src/harness/HarnessRouter.tsx`
- `app/playwright.release.config.ts`
- `app/src/production/phone-story/scenes.tsx`
- `app/src/production/phone-story/transitions.tsx`
- existing Front adapter-group/module-loader files only for the stateless
  migration bridge
- `app/package.json` and lockfile to add `pngjs` plus `@types/pngjs` as
  test-only dependencies

- [x] **Step 7.1: Prepare the per-slice visual disposition map**

Use the `9652fbe` Front files as the visual donor and map each source to Slice
7B–7E before moving it. Preserve:

```text
Hero composition and text
Pattern renderer and accepted geometry
Star Map camera/mask
AOD assets and authored progress
Hero → Pattern, Pattern → Star, Star → AOD ink direction/seeds
AOD → Method effect placement
```

As each slice moves its own genuine leaves, remove:

- imports of old phone runtime/types/adapters;
- global document lifecycle dispatch;
- physical input ownership;
- current scene/checkpoint/edge writes;
- scene-controlled stable or Loader state;
- transition-controlled transaction timing.

Move the existing pure `phoneMediaUrlFor()` ownership/URL resolver during
Slice 7D to
`app/src/media/phone-media.ts`, retaining `app/src/story/media.ts` as the
immutable identity/owner source. Update both migration and clean imports
directly; do not leave a final re-export at the old path.

Convert each transition in Slice 7E to a prepared, paused renderer:

```ts
type PhoneTransitionLeaf = Readonly<{
  prepare(report: PhoneLeafReportPort): Promise<PhoneLeafMountRegistration>;
}>;
```

The registration contains the one `PhoneLeafCommandHandle`; runtime owns
progress/time and calls that handle, while the leaf owns only visual sampling.

### Slice 7A — harness and real pixel helpers

- [x] **Step 7A.1: Create the DEV-only clean harness**

Add:

```text
/harness/r5-phone-clean
/harness/r5-phone-clean#hero
/harness/r5-phone-clean#pattern
/harness/r5-phone-clean#star-map
/harness/r5-phone-clean#aod-animation
```

The harness renders the same `PhoneStoryShell scope="harness"`. It cannot call
the runtime factory, substitute a reducer, or import `runtime.ts`.

The route remains behind the existing `HarnessRouter` DEV/release-harness
guard. It is not a query alias for formal `/`.

- [x] **Step 7A.2: Add real stacking-context and pixel helpers**

`r5-phone-clean-assertions.ts` must provide:

```ts
assertSinglePhoneAuthority(page)
readPlaneRevision(page)
readCommitSequence(page)
assertLayerOrderAtPoints(page, points, expectedRoles)
assertOpaqueViewportEdges(page, expectedColor, tolerance)
assertTargetContentVisible(page, selectors)
assertNoIntermediateWhiteOrBlackFrame(frameSeries, policy)
waitForCommitSequence(page, sceneId, afterSequence)
```

Pixel assertions must decode actual Playwright screenshots. Sample at least:

```text
four corners inset 1–2 CSS pixels
center of all four edges
two points around the dynamic toolbar-exposed bottom/right region
one scene-content control point
```

Do not infer pixels from CSS variables or datasets.

Install the decoder as development-only:

```bash
pnpm -C app add -D pngjs @types/pngjs
```

The release-build dependency graph test must prove neither package enters a
production chunk.

Add two release-config projects without changing the existing desktop/mobile
projects:

```text
phone-portrait-chromium = Pixel 7 portrait, Chromium
phone-portrait-webkit = iPhone 15 portrait, WebKit
```

The default `playwright.config.ts` ignores `r5-*.spec.ts`, so every R5 command
in this plan must explicitly use `playwright.release.config.ts`.

- [x] **Step 7A.3: Prove the empty harness fails closed and commit**

Use deterministic placeholder leaves to prove one authority, opaque Loader,
pixel helper failure on a one-pixel gap, and no production dependency on the
harness:

```bash
pnpm -C app exec vitest run src/production/phone-story
pnpm -C app typecheck
VITE_ENABLE_HARNESS=1 pnpm -C app exec vite build
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-clean-runtime.spec.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-webkit --grep "harness contract"
git add app pnpm-lock.yaml
git commit -m "test(r5): establish clean phone browser harness"
```

**Slice 7A closure record (2026-08-01):**

- The visual disposition ledger is frozen in
  `docs/react-refactor/reports/r5-phone-clean-runtime-task7-disposition.md`
  against donor `9652fbe`; every Front source is assigned to 7B–7E and legacy
  lifecycle/authority donation is explicitly excluded.
- RED verification observed the missing clean route (`Harness not found`, zero
  `.phone-story` owners), absent exact shell diagnostics, a one-pixel bottom
  gap incorrectly accepted by the first decoder, a center control pixel
  incorrectly treated as an edge, and `pngjs` accepted in a synthetic
  production chunk. Each counterexample is now covered.
- GREEN verification passed 150/150 focused phone-story tests, TypeScript, the
  harness architecture gate, the ordinary production build, and 5/5 real
  iPhone-15 portrait WebKit harness tests. The browser tests decode actual PNG
  screenshots, reject a one-CSS-pixel gap, inspect browser stacking order,
  distinguish edge coverage from scene content, and reject black/white only
  when it is intermediate rather than an allowed endpoint.
- The DEV/release-harness route renders the same clean `PhoneStoryShell` with
  one diagnostic authority and the existing fail-closed lazy covers. It does
  not import or call the runtime factory. `pngjs` and `@types/pngjs` are
  development-only and the release provenance gate rejects either from any
  emitted production chunk.
- The raw harness build follows the corrected Task 0.6 rule. The package
  wrapper's deterministic rejection of emitted R4 harness markers was
  re-observed and was not treated as a product failure or bypassed.

### Slice 7B — Hero and Loader

- [x] **Step 7B.1: Reproduce Hero flash before declaring the fix**

Instrument screenshots from navigation start through Loader exit at every
animation frame available to the test. The RED assertion must catch either:

```text
completed Hero visible before progress zero
whole stage visible for one frame, then reset
opaque Loader disappears before fixed stage/geometry proof
absolute → fixed topology change after reveal
black/geometry-only gap between static and React Loader
```

Then enforce:

- Hero progress zero is applied in the first layout commit;
- fixed topology and decoded images are ready under the Loader;
- Loader release follows target plane post-paint acknowledgement;
- no later effect rewrites Hero to zero.
- a paused `requestVideoFrameCallback` that never fires is reproduced as RED;
  recovery starts a new bounded, generation-bound runtime/leaf attempt and a
  stale first request cannot prove the boundary. Do not add a scene-owned
  timeout or same-generation retry to the legacy/shared Hero scene.

Port the reviewed Hero font declaration from `82a4e68` into the new canonical
Hero CSS, not the old path.

- [x] **Step 7B.2: Run the Hero/Loader checkpoint and commit**

```bash
pnpm -C app exec vitest run \
  src/production/StoryLoader.test.tsx \
  src/scenes/hero/phone \
  src/production/phone-story
pnpm -C app typecheck
VITE_ENABLE_HARNESS=1 pnpm -C app exec vite build
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-webkit --grep "Hero|Loader"
git add app
git commit -m "fix(r5): close phone Hero Loader handoff"
```

**Slice 7B closure record (2026-08-01):**

- The genuine donor Hero moved to `scenes/hero/phone/`; the old formal route
  reaches that same component through one ref/report translation in the
  existing `module-loaders.ts`. The bridge owns no React state, timer, RAF,
  input listener, checkpoint, or stable state and is covered by an exact
  temporary module-boundary allowlist for Task 11 deletion.
- RED/GREEN coverage holds the packed video request before decode to inspect
  the first committed DOM: Hero is at exact zero, the Loader is still opaque,
  and the viewport topology is already fixed. Twelve consecutive exit RAF
  screenshots plus post-proof frames contain no black/white reappearance or
  topology swap. Images must be decoded and the generation-bound compositor
  frame acknowledged before the clean commit and Loader release.
- A withheld first compositor callback cannot report through a newer frame
  token. Rebinding disposes the old resources reactivatably, creates a fresh
  generation, and accepts only that generation's draw; no scene timeout or
  same-generation retry was added. Persistent React cleanup remains
  reactivatable, while runtime terminal disposal owns hard context retirement.
- Focused Hero/Loader/core tests passed 174/174, the architecture and homepage
  boundary gates, TypeScript, raw harness build, ordinary production build,
  frozen-input check, and the real WebKit `Hero|Loader` checkpoint passed.
  Phone JS is 631,823 B and the largest lazy chunk remains 41,116 B.
- The exact old-formal mobile-WebKit command was also run on both this slice
  and a disposable archive of its parent `5d58264`. Both produced the same
  2 passes / 3 skips / 4 pre-existing failures at the same assertions (AOD
  reverse checkpoint and three downstream v47 oracles); the Hero/Loader
  portion passed after the bridge. This establishes no migration regression
  without changing, skipping, or weakening those frozen old-formal tests.

### Slice 7C — Pattern and dynamic viewport

- [x] **Step 7C.1: Reproduce Pattern bottom/right exposure**

The RED test must fail on a one-pixel white/transparent strip while title/root
datasets remain “ready.” Then make Pattern report:

```text
required image decode
renderer/composite draw
connected visible content
global four-edge coverage
post-paint plane acknowledgement
```

Fix the global coverage/projector contract if it fails. Do not add a
Pattern-only gradient, strip, negative bottom, overscan surface, or pseudo
element.

- [x] **Step 7C.2: Run the Pattern/viewport checkpoint and commit**

```bash
pnpm -C app exec vitest run \
  src/scenes/pattern/phone \
  src/production/phone-story/presentation.test.ts
pnpm -C app typecheck
VITE_ENABLE_HARNESS=1 pnpm -C app exec vite build
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-webkit --grep "Pattern|viewport|coverage"
git add app
git commit -m "fix(r5): close global phone viewport coverage"
```

**Slice 7C closure record (2026-08-01):**

- The genuine Pattern leaf moved to `scenes/pattern/phone/`; the clean registry
  and old formal route now share it through the same exact temporary
  stateless bridge rule used by Hero. The bridge translates only refs,
  progress, active state, and the accepted ready report and is covered by a
  precise module-boundary allowlist and rogue-import RED fixture.
- Pattern preparation now requires both the background image decode and the
  accepted `PatternBloomRenderer` static composite draw before reporting the
  manifest's `pattern-image` evidence. Rebinding reports only through the
  current port; the public leaf exposes only the six frozen command methods.
- The old Pattern-only bottom gradient/pseudo-element and negative bottom
  placement were deleted. The projector owns the scene edge color through
  `--phone-story-coverage`, while one fixed viewport, coverage, active plane,
  and Pattern root are proved against the same live visual-viewport rectangle.
- The real WebKit checkpoint booted directly to Pattern, then changed the live
  viewport from 393×852 to 390×720. Both frames retained exact four-edge
  geometry and opaque non-white boundary pixels with the title and composite
  readiness still visible. The one-CSS-pixel decoder remains RED against a
  deliberate uncovered bottom edge.
- Focused Pattern/projector tests passed 32/32, the homepage boundary gate,
  TypeScript, raw harness build, and WebKit `Pattern|viewport|coverage`
  checkpoint passed. The exact old-formal mobile-WebKit command retained the
  same parent-baseline result: 2 passes / 3 skips / 4 failures at the same AOD
  reverse and downstream v47 assertions, while its Pattern plate test passed.
  No frozen oracle was changed or weakened.

### Slice 7D — AOD and iOS media activation

- [x] **Step 7D.1: Make AOD frame proof causal and fail fast**

Update the packed-alpha surface API so:

- `onFrame` fires only after a successful compositor draw for the active
  identity/token;
- `render() === false` is a failure, not silence;
- WebGL unavailable/setup failure reports immediately;
- context loss reports failure and retires the active token;
- a 6-second background/foreground gap cannot leave the transaction
  preparing;
- failure triggers runtime rollback and input release;
- retry uses a renewed Canvas/context and new generation;
- a late frame from the retired Canvas is rejected.

Additionally prove AOD receives activation only through the runtime's current
closure. When a delayed chunk misses the first activation window, the loaded
AOD media surface mounts inert beneath source/Loader and remains in
`awaiting-media-activation`; CTA appears only after registration, and the
second real gesture renews token/generation and synchronously activates that
same topology. Direct entry follows muted/playsInline → prepared accessible
real-gesture retry, and `play()` success does not prove a Canvas frame. Remove
any assertion where
“still preparing after 500 ms” counts as success. Add tests that cross the old
six-second watchdog boundary.

- [x] **Step 7D.2: Run the AOD/activation checkpoint and commit**

```bash
pnpm -C app exec vitest run \
  src/scenes/aod-animation/phone \
  src/media/phone-media.test.ts \
  src/media/phone-packed-alpha-surface.test.ts \
  src/production/phone-story/runtime.test.ts
pnpm -C app typecheck
VITE_ENABLE_HARNESS=1 pnpm -C app exec vite build
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-clean-runtime.spec.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-webkit --grep "AOD|activation"
git add app
git commit -m "fix(r5): make AOD activation and frame proof causal"
```

**Slice 7D closure record (2026-08-01):**

- The genuine AOD leaf, packed-alpha surface, and phone media resolver moved to
  their canonical scene/media paths. The old formal route reaches the same AOD
  implementation through one exact stateless bridge; PH, Crane, Figure2, and
  Star Map now import the canonical media resolver/surface directly.
- RED browser coverage reproduced both the missing semantic landing proof and
  an autoplay rejection that occurred before prepared quorum and therefore
  left the retained topology inert with a hidden CTA. The shared scene now
  exposes the manifest landing anchor, and reducer-owned activation rejection
  enters the covered `awaiting-media-activation` state immediately.
- Packed-alpha failures are generation-bound and fail fast for unavailable or
  incomplete WebGL setup, frame upload, explicit render failure, and context
  loss. React-owned Canvas cleanup remains reactivatable; a failed generation
  renews its Canvas, while terminal disposal alone hard-retires the context.
  A six-second background gap invalidates the old attempt and restarts one
  bounded foreground deadline.
- Focused AOD/media/runtime tests passed 77/77, compositor tests passed 11/11,
  machine tests passed 28/28, and TypeScript, architecture, homepage boundary,
  raw harness build, frozen-input, and diff checks passed. Real iPhone-15
  portrait WebKit passed both causal-draw and rejected-autoplay/real-gesture
  checkpoints.
- The exact old-formal mobile-WebKit regression retained the accepted parent
  baseline: 2 passes / 3 skips / 4 failures at the same AOD reverse and three
  downstream v47 assertions. No frozen old-formal oracle was changed.

### Slice 7E — Star Map, front transitions, and Front matrix

- [x] **Step 7E.1: Enforce all four global gates on every Front hold/segment**

For Hero, Pattern, Star Map, AOD and both directions of the first three
complete segments, require:

```text
correct semantic effect layer
live viewport four-edge coverage
required first frame
target content visibility
source/receiver endpoint continuity
reduced-motion target proof
rollback source proof
```

`aod-method-top` may prepare in this task, but its target cannot pass until
Method is integrated in Task 8.

- [x] **Step 7E.2: Run Front unit and browser checkpoints**

```bash
pnpm -C app exec vitest run \
  src/production/phone-story \
  src/scenes/hero/phone \
  src/scenes/pattern/phone \
  src/scenes/star-map/phone \
  src/scenes/aod-animation/phone \
  src/media/phone-media.test.ts \
  src/media/phone-packed-alpha-surface.test.ts \
  src/transitions/hero-pattern/phone.test.tsx \
  src/transitions/pattern-star-map/phone.test.tsx \
  src/transitions/star-map-aod/phone.test.tsx
pnpm -C app typecheck
VITE_ENABLE_HARNESS=1 pnpm -C app exec vite build
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-clean-runtime.spec.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-chromium
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-clean-runtime.spec.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-webkit
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-story.spec.ts \
  --project=mobile-webkit
pnpm -C app run verify:phone-architecture
pnpm -C app test
pnpm -C app typecheck
pnpm -C app build
```

Also run the existing formal phone story regression against the old route.
Any old-route failure introduced by the temporary stateless bridge blocks the
commit.

- [x] **Step 7E.3: Freeze visual evidence and commit**

Store only intentional Playwright baselines/evidence in the repository's
existing snapshot convention. Do not commit transient videos/traces unless
the report links them as required acceptance evidence.

```bash
git add app
git commit -m "feat(r5): converge Front transitions on clean runtime"
```

**Task 7 acceptance:**

- the known Hero flash, Pattern edge exposure, and AOD silent lock each has a
  failing-before/green-after browser regression;
- the clean harness uses the real shell and one authority;
- no scene-specific coverage concealment exists;
- AOD readiness is causally tied to a real compositor draw;
- formal old authority remains operational through stateless migration bridges.

**Slice 7E / Task 7 closure record (2026-08-01):**

- The genuine Star Map leaf moved to `scenes/star-map/phone/`; one real 2D
  Canvas draw with the accepted -90° camera proves the current generation.
  The first three Front Ink leaves now expose the six-command clean visual
  port with their frozen fields, origins, directions, seeds, and grades.
- Hero, Pattern, Star Map, and AOD now settle to their authored readable hold
  independently of transaction endpoint. A synchronous causal draw emitted
  during command rebind is accepted only after its lease token is installed;
  paused packed-alpha surfaces retain the last causal rollback frame while
  terminal disposal still clears and hard-retires resources.
- Delayed AOD media registration re-exposes the activation CTA only for the
  matching active attempt and never auto-activates. The clean Front browser
  matrix proves both directions of Hero ↔ Pattern ↔ Star Map ↔ AOD, real Ink
  effect ownership, reduced-motion target proof, and Ink-failure rollback.
- The focused clean suite passed 16 files / 181 tests; the complete Vitest
  suite passed 191 files / 1249 tests. TypeScript, focused ESLint, architecture,
  homepage boundary, packed-alpha, raw harness build, complete production
  build, frozen-input, and diff checks passed.
- Phone-portrait Chromium and WebKit each passed all 13 clean harness tests.
  The exact old-formal mobile-WebKit command retained the accepted baseline of
  2 passes / 3 skips / 4 failures at the same AOD reverse and three downstream
  v47 assertions; no frozen oracle was changed or weakened.
- The production build reports 641,414 B of phone JS and a 41,116 B largest
  lazy chunk. No transient Playwright trace, video, screenshot, or ignored
  evidence was added to the commit.

---

## Task 8: Integrate the accepted Unit 4 Grade A chain

**Create/move genuine leaves:**

- `app/src/scenes/method-top/phone/PhoneMethodTop.tsx`
- `app/src/scenes/method-top/phone/PhoneMethodTop.css`
- `app/src/scenes/method-top/phone/PhoneMethodTop.test.tsx`
- `app/src/scenes/figure2-animation/phone/PhoneFigure2.tsx`
- `app/src/scenes/figure2-animation/phone/PhoneFigure2Arch.tsx`
- `app/src/scenes/figure2-animation/phone/PhoneFigure2.css`
- `app/src/scenes/figure2-animation/phone/PhoneFigure2.test.tsx`
- `app/src/scenes/figure2-proof/phone/PhoneFigure2Proof.tsx`
- `app/src/scenes/figure2-proof/phone/PhoneFigure2Proof.css`
- `app/src/scenes/figure2-proof/phone/PhoneFigure2Proof.test.tsx`

**Create/move transition leaves:**

- `app/src/transitions/method-bottom-figure2/phone.tsx`
- `app/src/transitions/method-bottom-figure2/phone.test.tsx`
- `app/src/transitions/figure2-distance-expand/phone.tsx`
- `app/src/transitions/figure2-distance-expand/phone.test.tsx`
- `app/src/transitions/figure2-proof-brand/phone.tsx`
- `app/src/transitions/figure2-proof-brand/phone.test.tsx`

**Modify:**

- `app/src/scenes/brand/phone/PhoneBrand.tsx`
- `app/src/scenes/brand/phone/PhoneBrand.test.tsx`
- `app/src/scenes/brand/phone/PhoneBrand.css` only where the clean port
  requires it
- `app/src/production/phone-story/scenes.tsx`
- `app/src/production/phone-story/transitions.tsx`
- `app/e2e/r5-phone-clean-runtime.spec.ts`
- `app/e2e/r5-phone-clean-presentation.spec.ts`
- existing Grade A adapter/module-loader files only for the stateless
  migration bridge

- [x] **Step 8.1: Freeze Unit 4 visual contracts before refactor**

Add assertions for:

```text
Method title/lead geometry and authored reading boundary
Figure2 packed media source and hash
Figure2 retained foreground arch ownership
Figure2 near/distance endpoint composition
Figure2 Proof opening visible content
Proof → Brand source/receiver/effect order
forward and reverse terminal frames
```

Use `3deb717` and the clean base as donors. The later commits `71e5ef9` and
`82a4e68` may donate reviewed presentation/tests only. Do not inherit their
phone lifecycle.

- [x] **Step 8.2: Refactor Method/Figure2/Proof and the minimum Brand receiver to narrow ports**

Scene leaves:

- render the accepted component;
- register their root and media surfaces;
- accept runtime-bound progress/media commands without constructing identity;
- register mount/command handle and report only prepared
  frame/progress/complete/failure through the closed report port; projector
  alone proves visible content;
- dispose local rendering resources.

Brand is included only to close the Proof → Brand receiver and `#brand` direct
entry in this task. Refactor its root/surface registration, content report
boundary, visual command handle, and disposal now. Do not begin
Brand → Figure3 transition or Group 4–5 lifecycle/visual changes until Task 9.

They may not:

- infer story phase from scroll position;
- set global checkpoint/edge/navigation;
- own Loader release;
- dispatch to the old coordinator;
- install physical input listeners.

- [x] **Step 8.3: Preserve the Figure2 compositor and depth contracts**

Require:

- exact packed master hash;
- one decoded source and one visible compositor surface;
- Figure2 architecture/figures retain the accepted binary depth ownership;
- the retained foreground arch remains outside the depth mask;
- no horizontal figure wipe or secondary dark ownership band is reintroduced;
- `onFrame` is emitted by the successful active Canvas draw;
- reverse endpoint proof uses the actual terminal/initial frame, not a seek
  command or dataset.

- [x] **Step 8.4: Make Figure2 coverage global, not local**

Reproduce bottom/right white exposure with real screenshot pixels while DOM
readiness is otherwise green. Correct only shared presentation geometry and
the leaf's truthful content/frame registration.

Reject changes containing:

```text
Figure2-only bottom strip
negative bottom
right overscan
edge pseudo-element
scene-specific viewport height
extra opaque overlay above the scene
```

- [x] **Step 8.5: Complete AOD → Method and Proof → Brand transactions**

For forward and reverse:

- AOD visibly covers Method through prepared proof, then remains mounted as
  rollback anchor while projector proves the exposed Method candidate plane;
- `aod-method-top` effect is between source and receiver;
- Method native reading passes through;
- Method boundary claims exactly one intent into Figure2;
- Figure2 near/distance is one transaction family, not a sub-machine;
- Proof is not stable until its opening title is visible;
- Proof → Brand uses the declared above-both effect and cannot reveal empty
  Brand paper.

- [x] **Step 8.6: Add direct-entry first-exposed-frame tests**

Test cold entries to:

```text
#method-top
#figure2-animation
#figure2-proof
#brand
```

Capture from before JS resolves through Loader exit. The first exposed frame
must already contain target content, correct edge surface, correct plane, and
required media/static proof. It must not show Hero, empty paper, prior scene,
or geometry-only stage.

- [x] **Step 8.7: Run Unit 4 checkpoints**

```bash
pnpm -C app exec vitest run \
  src/production/phone-story \
  src/scenes/method-top/phone \
  src/scenes/figure2-animation/phone \
  src/scenes/figure2-proof/phone \
  src/scenes/brand/phone/PhoneBrand.test.tsx \
  src/transitions/method-bottom-figure2/phone.test.tsx \
  src/transitions/figure2-distance-expand/phone.test.tsx \
  src/transitions/figure2-proof-brand/phone.test.tsx
VITE_ENABLE_HARNESS=1 pnpm -C app build
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-clean-runtime.spec.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-chromium --grep "Front|Grade A|direct entry"
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-clean-runtime.spec.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-webkit --grep "Front|Grade A|direct entry"
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-story.spec.ts \
  --project=mobile-webkit
pnpm -C app run verify:phone-architecture
pnpm -C app run verify:phone-packed-alpha
pnpm -C app test
pnpm -C app typecheck
pnpm -C app build
```

Run the old formal route regression as well.

- [x] **Step 8.8: Commit**

```bash
git add app
git commit -m "feat(r5): converge Unit 4 Grade A chain"
```

**Task 8 acceptance:**

- Front through Brand is one reducer path;
- Brand already uses the clean leaf boundary before Proof → Brand and
  `#brand` are accepted; Task 9 does not retroactively make Task 8 green;
- Unit 4 visual/media/timing contracts remain frozen;
- Figure2 has real-frame and four-edge proof in both directions;
- all Grade A direct entries expose target content first;
- no Figure2/Method/Proof sub-machine remains in genuine leaves.

**Task 8 closure record (2026-08-01):**

- Method Top, Figure2, Figure2 Proof, the three Unit 4 transitions, and the
  minimum Brand receiver now mount only through closed report ports and narrow
  visual command handles. The former Grade A adapter files are inert re-export
  facades; the temporary formal-route bridge translates ports without state,
  input listeners, timers, RAF ownership, or another coordinator.
- Figure2 retains one packed source, one causal compositor Canvas, and one
  foreground arch outside the binary depth field. Dormant packed-alpha Canvas
  state is explicitly textual false; terminal retirement remains hard while
  release/reactivation stays reusable.
- Late unmounted leaf registration can rebind only to a structurally matching,
  newer transaction under the same authority. The binding proof lives in the
  presentation boundary, runtime remains at its 1,000 non-blank LOC ceiling,
  and presentation remains within budget at 893 LOC.
- The complete Vitest suite passed 197 files / 1,261 tests. Boolean-data,
  architecture, homepage-boundary, packed-alpha, Node fixture, TypeScript,
  raw harness build, complete production build, frozen-input, and diff checks
  passed. The exact boolean debt ledger shrank by two retired adapter writers.
- The focused phone-portrait Chromium and WebKit checkpoints each passed all
  six Front/Grade A/direct-entry tests. The exact old-formal mobile-WebKit run
  retained its accepted 2 passes / 3 skips / 4 frozen failures at the same AOD
  reverse and three downstream v47 assertions; no oracle was changed.
- The production build reports 627,923 B of budgeted phone JS, 641,521 B for
  the complete phone presentation family, and a 41,116 B largest lazy chunk.
  No transient trace, video, screenshot, or ignored evidence is committed.

---

## Task 9: Integrate Group 4–5 without losing Unit 7A endpoints

**Modify genuine scene leaves:**

- `app/src/scenes/figure3-animation/phone/PhoneFigure3.tsx`
- `app/src/scenes/figure3-animation/phone/paper-compositor.ts`
- `app/src/scenes/figure3-animation/phone/reverse-playback.ts`
- `app/src/scenes/services/phone/PhoneServices.tsx`
- `app/src/scenes/ttg-animation/phone/PhoneTtg.tsx`
- `app/src/scenes/lab/phone/PhoneLab.tsx`
- their existing tests/CSS only where the clean port requires it

**Modify genuine transitions:**

- `app/src/transitions/brand-figure3/phone.ts`
- `app/src/transitions/figure3-services/phone.ts`
- `app/src/transitions/services-ttg/phone.ts`
- `app/src/transitions/ttg-lab/phone.ts`
- their existing tests

**Modify integration/tests:**

- `app/src/production/phone-story/scenes.tsx`
- `app/src/production/phone-story/transitions.tsx`
- `app/e2e/r5-phone-clean-runtime.spec.ts`
- `app/e2e/r5-phone-clean-presentation.spec.ts`
- existing Group 4–5 adapter/module-loader files only for the stateless
  migration bridge

- [x] **Step 9.1: Freeze the accepted Group 4–5 endpoints**

Before refactoring, assert:

- Brand visible reading endpoint;
- Figure3 initial paper hash/presentation;
- Figure3 terminal paper hash/presentation from Unit 7A;
- Figure3 persistent compositor has one decoder/one visible surface;
- Services visible title/lead;
- TTG initial/terminal real frame;
- Lab visible title/lead;
- correct effect placement for all four segments;
- forward and reverse continuity across each endpoint.

Use `35b0aee`, `eca6bc2`, and the current base as visual donors. The
`19053c4` decoded TTG terminal-frame behavior may be ported by reviewed hunk
only.

### Slice 9A — Brand → Figure3 → Services

- [x] **Step 9A.1: Keep clean Brand fixed; refactor Figure3/Services and their two edges**

Brand's Task 8 command/report port is the already-accepted source contract:
this slice may add only the manifest-declared Brand → Figure3 edge wiring and
tests, not redesign Brand or postpone a missing Brand port. Remove Group 4–5
lifecycle imports from Figure3/Services and their two edges only. Replace
their callbacks with manifest command/report ports. Preserve Figure3
initial/terminal paper, one persistent visible compositor, reverse from a
proven terminal frame, and retirement only after the `figure3-services`
closure boundary. No poster, screenshot, hidden pre-play, seek-only proof, or
untracked decoder is allowed.

- [x] **Step 9A.2: Add vertical-slice direct/failure/browser tests**

Test Brand → Figure3 → Services and reverse twice; direct entries for those
three holds; delayed/rejected Figure3 chunk; withheld initial/terminal frame;
hidden Services content; background/foreground; and immediate reverse.
`commitSequence` increments once per stable hold, and resource counts do not
grow.

- [x] **Step 9A.3: Verify and commit Slice 9A**

```bash
pnpm -C app exec vitest run \
  src/production/phone-story \
  src/scenes/brand/phone \
  src/scenes/figure3-animation/phone \
  src/scenes/services/phone \
  src/transitions/brand-figure3/phone.test.ts \
  src/transitions/figure3-services/phone.test.ts
VITE_ENABLE_HARNESS=1 pnpm -C app build
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-clean-runtime.spec.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-webkit --grep "Figure3 slice"
git add app
git commit -m "feat(r5): converge Figure3 vertical slice"
```

**Slice 9A closure record (2026-08-01):**

- Figure3 and Services now mount through the clean command/report boundary;
  Brand → Figure3 uses the clean Ink leaf and Figure3 → Services uses the
  reducer-owned between-plane command leaf. The old formal route is retained
  only through stateless migration facades.
- Figure3 retains exactly one decoder and one visible 2D compositor. Endpoint
  proof is accepted only after the physical initial or terminal frame is
  drawn; intermediate/stale draws cannot satisfy settlement, reusable release
  preserves the surface, and terminal disposal hard-retires it.
- The persistent Figure3/Services R-pair keeps the same React leaf, effect,
  and report identities through stable Services, activation renewal, and an
  immediate reverse. Delayed/rejected loading, withheld frame/content,
  visibility restore, direct entry, and two-cycle resource bounds are covered.
- The focused suite passed 16 files / 186 tests and the complete Vitest suite
  passed 199 files / 1,266 tests. TypeScript, focused ESLint, boolean-data,
  architecture, homepage-boundary, packed-alpha, Node fixture, raw-harness,
  complete production-build, frozen-input, and diff checks passed.
- Phone-portrait WebKit passed all eight Figure3-slice browser tests. The exact
  old-formal mobile-WebKit command retained its accepted 2 passes / 3 skips /
  4 frozen failures at the same AOD reverse and three downstream v47
  assertions; no oracle was changed.
- The production build reports 619,412 B of budgeted phone JS and a 41,116 B
  largest lazy chunk. No transient Playwright trace, video, screenshot, or
  ignored evidence is committed.

### Slice 9B — Services → TTG → Lab

- [x] **Step 9B.1: Refactor TTG/Lab and their two edges**

After Slice 9A is green, remove these legacy imports from all Group 4–5
genuine leaves:

```text
production/phone/adapter-groups/group4-5
production/phone/adapter-groups/group4-5-native-autoplay
production/phone/phone-lab-contact-timeline
production/phone/phone-native-autoplay
production/phone/phone-presented-reverse-playback
```

Preserve TTG's decoded/composited initial/terminal frame, persistent closure,
reverse endpoint, and identity-bound resource retirement.

- [x] **Step 9B.2: Prove two full Group 4–5 cycles and recovery**

Browser tests execute:

```text
Brand → Figure3 → Services → TTG → Lab
Lab → TTG → Services → Figure3 → Brand
repeat both directions once more without reload
```

Test direct TTG/Lab entries, delayed/rejected TTG leaf, withheld decoded
frame, visibility/BFCache restore, and reverse immediately after settle.
Every failure rolls back or remains under Loader/safe cover. At every hold
assert one authority, one `commitSequence` increment, matching
frame/content/coverage/landing/edge, free input, and bounded decoder/Canvas
counts.

- [x] **Step 9B.3: Run Group 4–5 checkpoints**

```bash
pnpm -C app exec vitest run \
  src/production/phone-story \
  src/scenes/brand/phone \
  src/scenes/figure3-animation/phone \
  src/scenes/services/phone \
  src/scenes/ttg-animation/phone \
  src/scenes/lab/phone \
  src/transitions/brand-figure3/phone.test.ts \
  src/transitions/figure3-services/phone.test.ts \
  src/transitions/services-ttg/phone.test.ts \
  src/transitions/ttg-lab/phone.test.ts
VITE_ENABLE_HARNESS=1 pnpm -C app build
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-clean-runtime.spec.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-chromium --grep "Group 4-5"
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-clean-runtime.spec.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-webkit --grep "Group 4-5"
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-story.spec.ts \
  --project=mobile-webkit
pnpm -C app run verify:phone-architecture
pnpm -C app test
pnpm -C app typecheck
pnpm -C app build
```

Run the old formal route regression as well.

- [x] **Step 9B.4: Commit Slice 9B**

```bash
git add app
git commit -m "feat(r5): converge TTG and Lab vertical slice"
```

**Slice 9B closure record (2026-08-01):**

- TTG and Lab now mount through the clean command/report boundary; Services →
  TTG uses the clean Ink leaf and TTG → Lab uses the reducer-owned
  between-plane command leaf. Old formal consumers resolve only through
  stateless migration facades.
- TTG reports only a decoded physical initial or terminal frame bound to the
  current frame token. Its persistent decoder supports pause/rebind recovery,
  while terminal disposal removes sources and driver ownership. The shared
  timeline driver now covers both WebKit endpoint orders: `seeked` before the
  `seeking` flag clears, and a matching frame callback as the final event.
- Two complete Brand ↔ Lab cycles passed without decoder/Canvas growth.
  Direct TTG/Lab entry, delayed/rejected TTG loading, withheld decoded media,
  visibility/BFCache recovery, rollback, and reverse endpoint reuse are
  covered without changing an old-formal oracle.
- The focused suite passed 22 files / 210 tests and the complete Vitest suite
  passed 201 files / 1,274 tests. TypeScript, focused ESLint, boolean-data,
  architecture, homepage-boundary, packed-alpha, Node fixtures, raw-harness,
  complete production-build, frozen-input, and diff checks passed.
- Phone-portrait Chromium and WebKit each passed all six Group 4–5 browser
  tests. The exact old-formal mobile-WebKit command retained its accepted
  2 passes / 3 skips / 4 frozen failures at the same AOD reverse and three
  downstream v47 assertions.
- The production build reports 610,313 B of budgeted phone JS, 623,911 B for
  the complete phone presentation family, and a 41,116 B largest lazy chunk.
  No transient Playwright trace, video, screenshot, or ignored evidence is
  committed.

**Task 9 acceptance:**

- Brand through Lab uses the clean authority in the harness;
- Figure3/TTG real endpoint frames survive two forward/reverse cycles;
- Unit 7A paper endpoints remain unchanged;
- genuine leaves no longer import Group 4–5 lifecycle modules;
- no decoder/Canvas/listener growth occurs.

---

## Task 10: Integrate Group 6–7 and terminal Contact

**Modify genuine scene leaves:**

- `app/src/scenes/ph-animation/phone/PhonePh.tsx`
- `app/src/scenes/ph-animation/phone/PhonePh.motion.ts`
- `app/src/scenes/ph-animation/phone/PhonePh.reverse.ts`
- `app/src/scenes/education/phone/PhoneEducation.tsx`
- `app/src/scenes/crane-animation/phone/PhoneCrane.tsx`
- `app/src/scenes/crane-animation/phone/PhoneCrane.motion.ts`
- `app/src/scenes/crane-animation/phone/PhoneCrane.autoplay.ts`
- `app/src/scenes/contact/phone/PhoneContact.tsx`
- their existing tests/CSS where required

**Modify genuine transitions:**

- `app/src/transitions/lab-ph/phone.ts`
- `app/src/transitions/ph-education/phone.ts`
- `app/src/transitions/education-crane/phone.ts`
- `app/src/transitions/crane-contact/phone.ts`
- their existing tests/CSS

**Modify integration/tests:**

- `app/src/production/phone-story/scenes.tsx`
- `app/src/production/phone-story/transitions.tsx`
- `app/e2e/r5-phone-clean-runtime.spec.ts`
- `app/e2e/r5-phone-clean-presentation.spec.ts`
- existing Group 6–7 adapter/module-loader files only for the stateless
  migration bridge

- [x] **Step 10.1: Freeze Unit 6 contracts and close the `c808e06` preflight**

Before refactor, assert:

```text
PH packed hash, crop, initial frame, terminal frame
Education title/lead and native landing
Crane figure/flock hashes, crop, initial frame, terminal frame
Contact title/content and interactive controls
Lab → PH, PH → Education, Education → Crane, Crane → Contact placement
forward/reverse compositor behavior
```

Use `ab7353e` and `9652fbe` as production donors. Then reconcile the Task 0
ledger: every `c808e06` visual/media hunk affecting PH, Education, Crane,
Contact, or their four edges must already be marked and evidenced as:

```text
port to the named 10A/10B/10C destination
rewrite because the clean closure/port replaces the implementation
reject because the 9652fbe/accepted donor is intentionally authoritative
```

For each row, cite the preserving screenshot/unit/browser assertion. Any
unclassified row, especially the substantial `PhonePh.tsx`,
`PhoneEducation.tsx`, `PhoneCrane.tsx`, `PhoneContact.tsx`, autoplay/motion,
or transition hunks, blocks Slice 10A. Later lifecycle files themselves remain
rejected.

### Slice 10A — Lab → PH → Education

- [x] **Step 10A.1: Refactor PH/Education and both edges**

Move only the clean-port behavior for Lab → PH and PH → Education. PH reverse
starts from a proven terminal frame; the packed Canvas draw reports an
attempt-bound frame; Education stays native; terminal PH compositor retention
and retirement follow the closure. Runtime owns activation and story clock.

- [x] **Step 10A.2: Add direct/reverse/fault/resource checkpoints**

Test Lab → PH → Education and reverse twice, direct PH/Education entries,
activation rejection/retry, background/foreground, BFCache restore, withheld
draw, context loss, delayed chunks, rollback failure, and stale callbacks.
No timeout/seek/play promise can prove PH.

Also mount PH late after its terminal retirement while Crane is prewarming.
The stale PH surface must remain released, must not reclaim the sole media
slot, and must not require a legacy-shell effect to retire it again. Prove the
result through runtime generation/command ownership and the registered clean
PH surface handle.

- [x] **Step 10A.3: Verify and commit Slice 10A**

```bash
pnpm -C app exec vitest run \
  src/production/phone-story \
  src/scenes/ph-animation/phone \
  src/scenes/education/phone \
  src/transitions/lab-ph/phone.test.ts \
  src/transitions/ph-education/phone.test.ts
VITE_ENABLE_HARNESS=1 pnpm -C app build
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-clean-runtime.spec.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-webkit --grep "PH slice"
git add app
git commit -m "feat(r5): converge PH and Education vertical slice"
```

**Slice 10A closure record (2026-08-01):**

- The frozen `c808e06` Group 6/7 ledger is fully classified, and its PH,
  Education, Lab → PH, and PH → Education observations are preserved by the
  canonical donor hashes plus clean unit/browser assertions; no legacy
  lifecycle hunk was ported.
- PH now owns one registered packed-video/Canvas pair behind the clean
  command/report boundary. Only an attempt-bound physical compositor draw can
  prove a frame; retained pause/rebind re-proves the same surface, while
  terminal disposal hard-retires it. Education remains a native document leaf
  with a separate one-viewport visual endpoint.
- The runtime projects reducer-owned progress into a newly registered leaf
  before activation. Both edges use clean effect leaves, and the old formal
  route reaches the same genuine leaves only through stateless migration
  bridges in the existing Group 6–7 loader files.
- The focused suite passed 16 files / 199 tests and the complete Vitest suite
  passed 205 files / 1,284 tests. TypeScript, focused ESLint, boolean-data,
  architecture, homepage-boundary, packed-alpha, raw-harness,
  production-build, frozen-input, and diff checks passed.
- Phone-portrait WebKit passed all six PH-slice browser tests, including two
  complete Lab ↔ Education cycles, delayed loading, withheld draw, context
  loss, visibility, and BFCache reproof. The exact old-formal mobile-WebKit
  command retained its accepted 2 passes / 3 skips / 4 frozen failures at the
  same AOD reverse and three downstream v47 assertions; no oracle changed.
- The production build reports 610,313 B of budgeted phone JS and a 41,116 B
  largest lazy chunk. No transient Playwright artifact is committed.

### Slice 10B — Education → Crane

- [x] **Step 10B.1: Refactor Crane and its entry edge**

Preserve distinct Crane figure/flock authored media layers, crop, initial and
terminal frames, and reverse compositor. Both media resources belong to the
declared closure/resource budget; unifying authority must not flatten them.
No setTimeout fallback can mark an endpoint ready.

- [x] **Step 10B.2: Prove Crane activation/reverse/resource recovery**

Test forward/reverse twice, direct Crane entry, figure/flock activation,
withheld frame, context loss, lock/unlock, background/foreground, BFCache,
orientation, chunk delay/rejection, and deterministic Canvas/decoder
retirement.

- [x] **Step 10B.3: Verify and commit Slice 10B**

```bash
pnpm -C app exec vitest run \
  src/production/phone-story \
  src/scenes/education/phone \
  src/scenes/crane-animation/phone \
  src/transitions/education-crane/phone.test.ts
VITE_ENABLE_HARNESS=1 pnpm -C app build
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-clean-runtime.spec.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-webkit --grep "Crane slice"
git add app
git commit -m "feat(r5): converge Crane vertical slice"
```

**Slice 10B closure record (2026-08-01):**

- Crane now registers the donor-authored figure and flock video/Canvas pairs
  behind one clean command/report boundary. Both current-generation physical
  Canvas draws are mandatory; the projector permits either authored layer to
  fade at an endpoint only while the other layer remains visibly participating.
- Education → Crane is an effect-only clean Ink leaf. Runtime-owned progress,
  activation, reverse sampling, pause/rebind, and terminal disposal replace the
  old native-clock and legacy-shell lifecycle owners without flattening the two
  media lanes.
- A retained committed media leaf now survives a BFCache recovery generation
  that is immediately superseded by a layout recovery. The latest generation
  rebinds and re-proves the same surfaces instead of hard-disposing the safe
  committed plane and timing out in media preparation.
- The focused suite passed 13 files / 180 tests and the complete Vitest suite
  passed 207 files / 1,291 tests. TypeScript, focused ESLint, boolean-data,
  architecture, homepage-boundary, packed-alpha, production-build,
  frozen-input, and diff checks passed.
- Phone-portrait WebKit passed all eight Crane-slice tests: direct entry, two
  Education ↔ Crane cycles, two-decoder activation retry, delayed/rejected
  chunks, withheld flock draw, context loss, visibility, BFCache, orientation,
  and forward/reverse reproof. The exact old-formal mobile-WebKit command kept
  its accepted 2 passes / 3 skips / 4 frozen failures at the same AOD reverse
  and three downstream v47 assertions; no oracle changed.
- The production build reports 609,875 B of budgeted phone JS and a 41,116 B
  largest lazy chunk. No transient Playwright artifact is committed.

### Slice 10C — Crane → Contact and complete story

- [x] **Step 10C.1: Refactor Contact/terminal edge and remove legacy imports**

Education remains native until its boundary. Contact never receives cinematic
`preventDefault`; links, focus, selection, and controls stay interactive.
Reverse claims only the Crane edge. Direct `#contact` uses the minimal closure
and exposes visible content on its first uncovered frame.

After the refactor, these imports are absent from all Group 6–7 genuine leaves:

```text
production/phone/types
production/phone/phone-native-autoplay
production/phone/phone-lab-contact-timeline
production/phone/phone-presented-reverse-playback
production/phone/phone-media
production/phone/scenes/phone-packed-alpha-surface
```

Use canonical media resolution and
`app/src/media/phone-packed-alpha-surface.ts`; leaves report only active
attempt/slot draw, progress, complete, and failure.

- [x] **Step 10C.2: Prove the complete 16-hold story twice**

In the clean harness:

```text
Hero → Pattern → Star Map → AOD → Method → Figure2 → Proof → Brand →
Figure3 → Services → TTG → Lab → PH → Education → Crane → Contact
Contact → Crane → Education → PH → Lab → TTG → Services → Figure3 →
Brand → Proof → Figure2 → Method → AOD → Star Map → Pattern → Hero
Repeat the same complete forward and reverse traversal once more
```

For all 60 segment traversals (15 segments × two directions × two cycles),
assert:

- one authority and one active transaction maximum;
- same-attempt required-slot stable quorum;
- correct effect placement;
- real frame policy;
- four-edge coverage;
- target content;
- endpoint continuity;
- input release;
- no listener/timer/decoder/Canvas growth.

- [x] **Step 10C.3: Run Group 6–7 and complete-story checkpoints**

```bash
pnpm -C app exec vitest run \
  src/production/phone-story \
  src/scenes/ph-animation/phone \
  src/scenes/education/phone \
  src/scenes/crane-animation/phone \
  src/scenes/contact/phone \
  src/transitions/lab-ph/phone.test.ts \
  src/transitions/ph-education/phone.test.ts \
  src/transitions/education-crane/phone.test.ts \
  src/transitions/crane-contact/phone.test.ts
VITE_ENABLE_HARNESS=1 pnpm -C app build
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-clean-runtime.spec.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-chromium --grep "Group 6-7|complete story"
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-clean-runtime.spec.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-webkit --grep "Group 6-7|complete story"
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-story.spec.ts \
  --project=mobile-webkit
pnpm -C app run verify:phone-architecture
pnpm -C app run verify:phone-packed-alpha
pnpm -C app test
pnpm -C app typecheck
pnpm -C app build
```

Run the old formal route regression one final time before cutover.

- [x] **Step 10C.4: Commit Slice 10C**

```bash
git add app
git commit -m "feat(r5): converge Contact and full phone story"
```

**Slice 10C closure record (2026-08-01):**

- Contact is a native, direct-entry-safe clean leaf with a post-paint visible
  proof and no cinematic input interception. Crane → Contact is an effect-only
  clean leaf; the old formal route reaches both genuine leaves only through the
  existing stateless migration bridges.
- The clean registries load all 16 holds and all 15 transitions. Genuine Group
  6–7 leaves no longer import old phone lifecycle modules, and the complete
  harness traversal committed all 60 ordered segment crossings through the one
  reducer/runtime authority.
- Packed-alpha retained surfaces now use a non-terminal reproof probe while
  explicit render failure remains fail-closed. A superseded activation wait no
  longer restarts the media-preparation deadline, and the Hero boot projection
  no longer consumes its entrance endpoint before forward playback.
- The focused suite passed 20 files / 212 tests and the complete Vitest suite
  passed 210 files / 1,298 tests. TypeScript, focused ESLint, boolean-data,
  architecture, homepage-boundary, packed-alpha, raw-harness,
  production-build, frozen-input, and diff checks passed.
- Phone-portrait Chromium and WebKit each passed the two Group 6–7 checkpoints
  plus the complete 60-segment story checkpoint (3/3 per engine). The exact
  old-formal mobile-WebKit command retained its accepted 2 passes / 3 skips /
  4 frozen failures at the same AOD reverse and three downstream v47
  assertions; no oracle changed.
- The production build reports 609,917 B of budgeted phone JS and a 41,116 B
  largest lazy chunk. No transient Playwright artifact is committed.

**Task 10 acceptance:**

- all 16 holds and 15 segments run through one clean runtime in the harness;
- PH/Crane real-frame reverse behavior remains accepted;
- Contact stays native and direct-entry safe;
- two complete forward/reverse cycles show no resource growth;
- all genuine leaves are free of old phone lifecycle imports.

**Task 10 cutover-readiness review record (2026-08-01):**

- Unified review of the complete machine/runtime found no remaining blocker in
  authority identity, rollback anchoring, activation renewal, serial queue
  priority/preemption, native rejection poisoning, or exception-safe disposal.
  The focused machine/runtime suite remains 97/97.
- Review first reproduced one Task 10 input blocker: Contact and Education
  declared a native-document owner, but wheel/touch/keyboard events on ordinary
  descendants were still classified as cinematic story input. The browser RED
  returned `dispatchEvent=false`; the shell now recognizes the declared native
  document corridor, and a real Shell test covers wheel, keyboard, and touch
  prevention below that owner.
- The final clean registries load all 16 scenes and all 15 transitions; the
  architecture gate confirms one canonical factory/call path and no genuine
  leaf imports an old phone lifecycle module. Appendix A contains the final
  disposition for both legacy directories and every deletion category.
- The cutover-mode gate is intentionally still red only for Task 11 work: the
  missing canonical wrapper/bootstrap recovery shape, legacy `production/phone`
  and `production/portrait-spike` directories, and the old App query
  composition. No unexpected pre-cutover violation was found.
- The complete suite passed 210 files / 1,299 tests; focused ESLint, TypeScript,
  boolean-data, architecture, homepage-boundary, packed-alpha, production
  build, frozen-input, and diff checks passed. Phone JS remains 609,917 B and
  the largest lazy chunk 41,116 B.
- Chromium and WebKit each passed the final Group 6–7 plus 60-segment matrix
  (3/3 per engine). The old-formal mobile-WebKit gate remains exactly the
  accepted 2 passes / 3 skips / 4 frozen failures. Review is approved and
  execution stops before Task 11.

---

## Task 11: Atomically cut formal `/` over and delete the old phone runtime

This is one commit. Do not route formal `/` to the clean shell in one commit
and delete old authority in another.

**Create:**

- `app/src/production/phone-story/PhoneBrandLabStory.tsx`
- `app/src/production/phone-story/PhoneBrandLabStory.test.tsx`

**Modify:**

- `app/src/App.tsx`
- `app/src/main.tsx`
- `app/src/production/presentation-shell-loaders.ts`
- `app/src/production/presentation-shell-loaders.test.ts`
- `app/src/production/presentation-profile.ts` and test only if the existing
  phone classification needs no behavioral change
- `app/src/production/phone-preboot.test.ts`
- `app/src/production/StoryLoader.test.tsx`
- `app/index.html`
- `app/vite.config.ts`
- `app/playwright.release.config.ts`
- `app/package.json`
- `app/e2e/r5-helpers.ts`
- all eight existing `app/e2e/r5-*.spec.ts` files according to the Task 0
  disposition ledger
- `app/e2e/r5-phone-story.spec.ts`
- `app/e2e/r5-phone-clean-runtime.spec.ts`
- `app/e2e/r5-phone-clean-presentation.spec.ts`
- canonical leaves only to remove the final temporary legacy prop/report
  branch

**Delete completely:**

```text
app/src/production/phone/
app/src/production/portrait-spike/
```

- [x] **Step 11.1: Make the registries exhaustive before routing**

Change `scenes.tsx` and `transitions.tsx` from partial to exhaustive records:

```ts
const sceneLoaders: Record<PhoneSceneId, PhoneSceneLoader> =
  defineExhaustivePhoneSceneLoaders();
const transitionLoaders: Record<PhoneSegmentId, PhoneTransitionLoader> =
  defineExhaustivePhoneTransitionLoaders();
```

Tests must fail compilation or manifest integrity when any of the 16/15 keys
is omitted, duplicated, or mapped to a module declaring the wrong ID.

- [x] **Step 11.2: Implement the QA wrapper with no authority**

The entire behavior should be equivalent to:

```tsx
export function PhoneBrandLabStory({
  chunkRecovery
}: Pick<PhoneStoryShellProps, 'chunkRecovery'>) {
  return (
    <PhoneStoryShell
      scope="brand-lab"
      initialEntry={{
        kind: 'scene',
        sceneId: 'brand',
        source: 'qa-route'
      }}
      diagnostics
      chunkRecovery={chunkRecovery}
    />
  );
}
```

It may read a canonical hash through the shell's normal entry path. It may not
import `runtime.ts`, `presentation.ts`, `scenes.tsx`, or `transitions.tsx`
directly; call a factory; install listeners; define timings; or project state.

Tests must prove:

- formal and QA mounts receive different authority IDs;
- route change disposes the old authority before the new route claims input;
- both routes report the same reducer/projector/runtime implementation
  signature;
- the QA wrapper has no lifecycle behavior;
- formal loader closure does not import QA.

The QA wrapper may accept and pass through the eager
`PhoneChunkRecoveryPort` supplied by App. That infrastructure prop does not
permit it to inspect lineage or make recovery decisions.

- [x] **Step 11.3: Replace numbered/query compositions with two real routes**

Final routing contract:

```text
/             formal site; presentation profile selects desktop or phone
/index.html   same as /
/brand-lab    QA-only phone shell with scope=brand-lab
/harness/*    DEV/release-harness only
everything else → 404
```

Remove:

```text
requestedPhoneValidationMode()
PhoneValidationMode
all numbered validation queries from ?v=16 through ?v=47
?scope=brand-lab
?portrait-spike=a|b
all ?portrait-spike-motion query values
loadPhoneLabContactShell()
PhoneBrandLabScope
VITE_ENABLE_PHONE_STORY as the production selection mechanism
```

Formal phone selection should use the existing supported-device presentation
profile directly. Keep the desktop route and desktop runtime behavior
unchanged.

Reduced motion comes from the platform media query and the same runtime entry,
not a URL-controlled second behavior.

- [x] **Step 11.3A: Install the eager phone-core bootstrap boundary**

Implement Section 4.9 without adding a new story authority:

- `main.tsx` connects the bootstrap controller and installs
  `vite:preloadError` handling before React starts the lazy phone import;
- `presentation-shell-loaders.ts` owns only build/chunk recovery lineage and
  wraps `loadPhoneStoryShell()` rejection;
- `App.tsx` has an error boundary around the phone lazy shell and keeps
  `#story-loader-static` opaque until either automatic reload begins or an
  accessible fail-closed root is committed;
- App passes the controller's narrow recovery port to the clean shell/QA
  wrapper; runtime calls `markStable()` only after the requested cold/warm
  entry has a proven stable commit.

Tests cover:

```text
initial phone core 404/native import reject
vite:preloadError before runtime exists
static Loader continuity
manifest fetch success, timeout, HTTP/parse failure, and offline wait
one automatic reload across changed build IDs/hashed URLs
second rejection in the same unresolved lineage → accessible fail-closed UI
sessionStorage unavailable → no automatic reload
stable phone commit clears lineage
bootstrap controller contains no scene/transaction/input/presentation fields
```

Leaf failures after core load call the same controller through
`PhoneChunkRecoveryPort`; bootstrap and runtime must not maintain independent
reload guards.

`main.tsx` must not remove `#story-loader-static` merely because the pathname
is `/brand-lab` or non-root. `StoryLoader` removes the static cover in its
layout effect only after the React Loader exists in the same commit. A 404 may
remove it only after the visible 404 root is committed. This prevents the
static-cover → lazy-shell black gap on formal and direct QA entries.

- [x] **Step 11.4: Rewrite preboot as presentation cover, not scene state**

The synchronous `index.html` preboot may:

- classify supported phone geometry/capabilities consistently with
  `presentation-profile.ts`;
- treat the explicit `/brand-lab` QA pathname as a phone-shell entry even on a
  desktop QA workstation;
- set `data-phone-preboot="pending"`;
- set an opaque generic Hero-colored preboot surface;
- hide the static desktop document while the phone Loader owns the viewport.

It may not:

- parse numbered validation modes;
- set current scene/checkpoint/navigation/authority;
- restore a “completed” Loader from the old versioned session key;
- skip Loader based on time since a prior page;
- expose target content before runtime proof.

Replace legacy attributes/keys:

```text
data-portrait-spike
data-portrait-spike-preboot
data-portrait-edge-scene
--portrait-document-surface
tongye:portrait-spike:v16:*
```

with presentation-only names under `data-phone-preboot` and
`--phone-preboot-surface`. Test cold `/`, direct hash, `/brand-lab`, reload,
desktop, tablet, portrait phone, and phone landscape classification.

When the React shell commits, it replaces the preboot marker with a
presentation-only mounted marker that keeps `.static-content` hidden. The
projector removes that marker on route detach. Neither marker is read by the
reducer.

- [x] **Step 11.5: Delete the old authority and migration bridges**

The directory deletion removes these categories:

| Category | Removed examples |
| --- | --- |
| Competing shells | `PhoneGradeAStory`, `PhoneBrandLabContinuation`, old `PhoneBrandLabStory`, `PhoneLabContactShell`, old `PhoneStoryShell` |
| Stage/coordinator owners | `PhoneStageRail`, `PhoneTransitionCoordinator`, `usePhoneStageRuntime`, `usePhoneFixedStageRegistration`, `usePhoneViewportGeometry` |
| Slice adapters | `usePhoneFrontHalfAdapters`, `usePhoneGradeAAdapters`, `usePhoneGroup45Adapters`, all `adapter-groups/*` |
| Input/time owners | `phone-gsap-driver`, `phone-scroll-snap-lock`, `phone-horizontal-pan-guard`, Lab/Contact timeline/reverse/snap modules |
| Media lifecycle owners | `aod-autoplay`, `phone-native-autoplay`, `phone-presented-reverse-playback`, old `phone-media` |
| Compatibility/loading | old `types.ts`, `module-loaders.ts`, Phone Loader wrapper, query scope, lab-contact loaders |
| Old visual locations | old Front/Grade A `scenes/*` and `transitions/*`, now canonical genuine leaves |
| Validation compositions | all `production/portrait-spike/*` |

Before deletion, use:

```bash
find app/src/production/phone -type f | sort
find app/src/production/portrait-spike -type f | sort
```

Put the complete before/after disposition in the acceptance report. Every
genuine leaf must point to its canonical destination; every lifecycle,
compatibility, and obsolete source-contract test is deleted, not copied.

After deletion:

```bash
test ! -e app/src/production/phone
test ! -e app/src/production/portrait-spike
find app/src/production/phone-story -maxdepth 1 -type f \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) | sort
```

The final command must list exactly the ten allowlisted production files plus
adjacent test files when the test-name filter is not applied.

- [x] **Step 11.6: Remove all final legacy imports from genuine leaves**

```bash
rg -n "production/phone/|production/portrait-spike/|PhoneSceneAdapter|PhoneTransitionAdapter|validationMode" \
  app/src/scenes app/src/transitions app/src/production/phone-story app/src/App.tsx app/src/main.tsx
```

Expected: no matches. Do not keep re-export shims.

- [x] **Step 11.7: Switch build gate to cutover mode**

Change ordinary build to run:

```bash
pnpm run verify:phone-architecture:cutover
```

Then run it before broad tests:

```bash
pnpm -C app run verify:phone-architecture:cutover
```

This is expected to fail until every old path, partial registry, query route,
extra core file, and legacy import is gone.

- [x] **Step 11.8: Prove route/module isolation**

Test built output, not source strings only:

- loading desktop `/` does not fetch phone leaves;
- loading formal phone `/` fetches the clean execution core and adjacent
  leaves only;
- formal phone `/` never evaluates `PhoneBrandLabStory`;
- `/brand-lab` loads QA wrapper and the shared clean core;
- switching `/` → `/brand-lab` via a real navigation disposes the first route;
- the two routes never coexist in one mounted React root;
- no query string can select an obsolete shell.

Also record the first fully functional cutover bundle as
`cleanCutoverBaselineBytes`, the largest clean lazy leaf as
`cleanCutoverMaxLazyLeafBytes`, and the module-to-chunk duplication report.
`628,044` remains the clean-base warning target; only `663,552` is the
immutable total hard cap.

- [x] **Step 11.8A: Apply the complete R5 release-suite disposition**

Update `playwright.release.config.ts`, `r5-helpers.ts`, and all Task 0
dispositioned specs:

- each live R5 spec is assigned explicitly to at least one appropriate
  desktop/phone project;
- desktop-only assertions may keep `.story-app`/`window.__storyApp`;
- phone assertions use the clean read-only diagnostics, commit/plane datasets,
  and pixel helpers, never the old desktop API;
- replaced/retired specs are deleted or renamed in this atomic cutover, not
  left as collected failures;
- no runtime conditional skip or `it.fails` hides a project mismatch.

Run:

```bash
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts --list
```

Reconcile discovered files/tests by project with the Task 0 ledger. Every live
current/new R5 spec must be discovered somewhere; zero-discovery or an
undispositioned legacy helper blocks cutover.

- [x] **Step 11.9: Run the atomic cutover suite**

```bash
pnpm -C app run verify:boolean-data
pnpm -C app run verify:phone-packed-alpha
pnpm -C app run verify:phone-architecture:cutover
pnpm -C app test
pnpm -C app typecheck
pnpm -C app build
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-story.spec.ts \
  e2e/r5-phone-clean-runtime.spec.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-chromium
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-story.spec.ts \
  e2e/r5-phone-clean-runtime.spec.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-webkit
git diff --exit-code 9652fbe -- \
  assets app/scripts/homepage-media-contract.mjs app/src/story/timings.ts \
  app/src/story/copy.ts app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts app/src/story/spine.ts app/src/story/media.ts
git diff --check
```

- [x] **Step 11.10: Review the deletion diff and commit atomically**

Before commit:

```bash
git diff --stat
git status --short
rg -n "createPhoneStoryRuntime\\(" app/src
rg -n "addEventListener\\(" app/src/production/phone-story app/src/scenes app/src/transitions
```

Expected:

- one factory call in `PhoneStoryShell`;
- global story/input listeners only in `runtime.ts`;
- local media listeners are scoped/disposed leaf render resources;
- old directories are deleted;
- no unrelated desktop runtime change.

```bash
git add app
git commit -m "refactor(r5): cut phone story to one clean authority"
```

If this commit must be rolled back before merge, revert the whole commit so
route selection and old-directory restoration move together. Do not restore
only one old shell.

**Task 11 acceptance:**

- formal `/` has exactly one phone authority;
- `/brand-lab` is a thin QA wrapper over the same implementation;
- route instances are separate and disposed normally;
- old phone/portrait-spike orchestration is absent;
- exact flat ten-file production allowlist and no compatibility wrapper remain;
- eager phone-core failure is guarded by the non-story bootstrap boundary;
- every live R5 release spec/helper matches the explicit project disposition;
- desktop runtime behavior is unchanged.

---

## Task 12: Validate automated chunk, fault, presentation, and size gates

**Modify:**

- `app/scripts/verify-phone-clean-architecture.mjs`
- `app/scripts/verify-phone-clean-architecture.test.mjs`
- `app/scripts/verify-homepage-module-boundaries.mjs`
- `app/scripts/verify-performance-budgets.mjs`
- `app/scripts/verify-performance-budgets.test.mjs`
- `app/scripts/verify-release-build.mjs`
- `app/e2e/r5-phone-clean-runtime.spec.ts`
- `app/e2e/r5-phone-clean-presentation.spec.ts`
- `app/e2e/r5-phone-story.spec.ts`
- `app/package.json`

- [x] **Step 12.1: Gate the built synchronous core/chunk closure**

Inspect both the Vite manifest and
`dist/audit/r5-module-provenance.json` emitted from
`OutputChunk.modules`. Assert:

- `PhoneStoryShell`, `protocol`, `manifest`, `machine`, `runtime`, and
  `presentation` are in one synchronously reachable phone execution closure;
- none of those six is behind a runtime dynamic import;
- each scene/transition lazy edge resolves through an ordinary ESM export;
- no lazy leaf includes a second runtime/reducer/input owner;
- formal entry has no static or eager QA dependency;
- desktop entry has no eager phone leaf;
- no property names are mangled;
- no generated cross-chunk policy artifact exists.

The browser may emit more than one physical JS file for vendor sharing. The
contract is one synchronous execution closure with normal ESM bindings, not a
requirement to defeat safe Rollup vendor chunking.
Manifest entry/import edges alone are insufficient evidence for module
placement or duplication.

- [x] **Step 12.2: Test slow/rejected chunks without production query hooks**

Use Playwright network routing to:

- delay initial phone core;
- reject/404 the initial phone core before runtime exists;
- delay a target scene leaf;
- reject a target scene leaf;
- delay/reject a transition leaf;
- complete an old delayed-but-not-rejected response after a superseding entry
  created a new generation;
- simulate offline then online recovery;
- serve old HTML/build ID against removed new-deployment chunk URLs;
- reject a same-build module request under poor network;
- repeat both same-build and build-mismatch rejection after their one allowed
  controlled reload;
- time out/fail/malformed-response the release-manifest fetch;
- change document/deployed build IDs and hashed module URL across reload.

Assertions:

- static/React Loader or committed source stays opaque/visible;
- initial core rejection is handled by the eager App/bootstrap boundary while
  runtime is absent;
- no black gap or target leak;
- offline detected before import waits for `online`, then performs its first
  native import in the same Document successfully;
- a native import rejection clears only the application reference and never
  retries that URL in the same Document;
- `vite:preloadError` is prevented and handled by the same policy;
- same-build network rejection and version mismatch join one recovery lineage
  with at most one automatic page reload;
- a native rejection observed offline waits for `online` before consuming the
  guarded reload;
- the reloaded page reconstructs the direct-entry/committed route from URL and
  proves it normally;
- input unlocks after rollback;
- a second post-reload rejection cannot loop and stays under Loader/source
  with an accessible retry/reload action;
- changed build IDs/hashed URLs cannot mint a second reload allowance;
- manifest timeout/fetch/parse/identity failure reaches fail-closed UI within
  the 3,000 ms active-foreground deadline;
- sessionStorage failure disables automatic reload;
- only a proven stable cold/warm entry clears the lineage;
- a stale late resolution from a superseded, non-rejected import cannot satisfy
  the new transaction;
- deployed build identity is fetched from `/r5-release-manifest.json` with
  `cache: 'no-store'`.

Do not add a production fault query parameter.

This distinction follows Vite's native-import constraint: after poor-network
dynamic import failure, the same module import cannot be retried in the same
Document. See
[Vite troubleshooting](https://vite.dev/guide/troubleshooting#failed-to-fetch-dynamically-imported-module-error)
and
[Vite load error handling](https://vite.dev/guide/build#load-error-handling).

- [x] **Step 12.3: Test media/compositor faults globally**

Intercept or instrument:

```text
image decode rejection
video metadata/data delay
video play rejection
Canvas draw failure
WebGL unavailable
WebGL context loss
requestVideoFrameCallback withheld
background/foreground > old watchdog
visibility change during reverse
```

Apply image-decode faults to image policies, video/frame-callback faults to
decoded-video policies, and Canvas/WebGL faults to Canvas/compositor policies;
do not limit failure coverage to AOD.
Assertions are rollback/fail-closed/retry, never “remained preparing.”

- [x] **Step 12.4: Automate BFCache and page-lifecycle recovery**

Use real `pagehide/pageshow` event paths and a browser back/forward traversal.
Cover `persisted=true` where the engine supports BFCache and deterministic
runtime fixtures everywhere else. Assert:

- no duplicate authority/listener/input owner after restore;
- active transaction evidence/generation is invalidated on hide;
- a stable commit uses `reprojectCommittedPlane()` and replaces every final
  presentation proof before input;
- a boot/direct entry with no stable commit keeps Loader and restarts its
  candidate rather than re-proving a nonexistent source;
- no stale media token, Canvas, decoder, or WebGL context completes restore;
- active deadlines pause while hidden and resume as a fresh bounded
  revalidation;
- Loader continuity and direct-entry target visibility survive back/forward.

An engine that does not grant BFCache must record the browser reason and still
pass reducer/runtime persisted-event tests; physical Safari remains mandatory
in Task 13.

- [x] **Step 12.5: Run the global 16-hold/15-segment presentation matrix**

For every hold:

```text
target content visible
frame policy satisfied
edge pixels opaque/correct
coverage includes visualViewport offsets
landing confirmed
checkpoint/nav/edge agree with stable scene
first exposed direct-entry frame is target
reduced-motion static proof
```

For every segment in both directions:

```text
source endpoint visibly covers target through prepared proof
source remains mounted as rollback anchor during candidate-plane visible proof
effect in declared semantic layer
receiver terminal endpoint visible at settle
no uncovered edge during progress
no target stable publish before quorum
rollback restores source pixels and input
```

Browser engine tests may programmatically vary viewport geometry to exercise
logic, but those tests are labeled engine evidence, not real mobile Safari
evidence.

- [x] **Step 12.6: Enforce final production complexity**

The cutover architecture gate must report:

```text
production phone-story files = 10 allowlisted names
runtime factory definitions = 1
runtime factory call sites = 1
reducers = 1
stable-commit branches = 1
proof-only reproject branches = 1
global input owner = 1
viewport sampler = 1
presentation registry = 1
compatibility wrappers = 0
slice runtimes = 0
formal QA imports = 0
```

Enforce the per-file and 5,000-line core limits from Section 1.1. If a file
exceeds budget, stop and review the abstraction; do not bypass the gate or
create an unapproved eleventh file. The gate must separately prove
`machine.ts` has no browser effects and `runtime.ts` has no second reducer or
stable-state constructor.

- [x] **Step 12.7: Enforce bundle size and chunk structure**

Run:

```bash
pnpm -C app build
```

Required:

```text
hard cap remains exactly 663,552 bytes
phone/total 4 KiB headroom is reported but not asserted
628,044-byte clean-base target is reported as pass/warning, not hard failure
cleanCutoverBaselineBytes is recorded
no duplicated execution core or module
no undeclared eager leaf
every lazy leaf ≤ donorMaxLazyLeafBytes (or approved ADR)
```

If the clean output is larger than the 628,044-byte reference:

1. inspect duplicate leaf/core placement in the Rollup module-provenance
   report plus build manifest;
2. remove legacy/dead orchestration and duplicate helpers;
3. verify imports do not eagerly pull all leaves;
4. preserve normal ESM names;
5. record the justified clean-cutover baseline when functionality and all
   structural gates are complete.

Do not fail solely for exceeding 628,044 while remaining under 663,552 with
clean structure. Do not raise the hard cap, add property mangling, create a
reserved-name registry, code-golf diagnostics, collapse into a God file, or
weaken measurement.

- [x] **Step 12.8: Run all automated closure gates**

```bash
node --test app/scripts/verify-phone-clean-architecture.test.mjs
node --test app/scripts/verify-homepage-module-boundaries.test.mjs
node --test app/scripts/verify-boolean-data-contract.test.mjs
node --test app/scripts/verify-performance-budgets.test.mjs
pnpm -C app run verify:boolean-data
pnpm -C app run verify:phone-packed-alpha
pnpm -C app run verify:phone-architecture:cutover
pnpm -C app test
pnpm -C app typecheck
pnpm -C app build
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-story.spec.ts \
  e2e/r5-phone-clean-runtime.spec.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-chromium
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-story.spec.ts \
  e2e/r5-phone-clean-runtime.spec.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-webkit
pnpm -C app run test:release
git diff --exit-code 9652fbe -- \
  assets app/scripts/homepage-media-contract.mjs app/src/story/timings.ts \
  app/src/story/copy.ts app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts app/src/story/spine.ts app/src/story/media.ts
git diff --check
```

- [x] **Step 12.9: Commit**

```bash
git add app
git commit -m "test(r5): validate phone runtime and presentation gates"
```

**Task 12 acceptance:**

- chunk failures cannot create black gaps or stale commits;
- pre-import offline recovery and post-rejection guarded reload behave as two
  distinct paths; initial core and leaf failures share one bounded lineage
  without a reload loop;
- BFCache/page lifecycle restores one re-proven authority;
- all holds/segments share global content/frame/coverage/layer gates;
- exact structural and LOC budgets pass;
- phone JavaScript stays below 663,552 bytes; the warning target and accepted
  clean-cutover baseline are recorded;
- Chromium/WebKit engine evidence is complete;
- the complete dispositioned R5 release suite passes in every assigned project
  before Task 13 freezes `candidateCodeSha`.

This is `Chunk-contract-complete` automated evidence only. Do not describe
chunks as “closed” and do not claim `Release-complete` until the physical
chunk/network/media rows in Task 13 also pass on the exact candidate artifact.

**Task 12 closure review record (updated 2026-08-03):**

- Decision: **GO / Review approved / `Chunk-contract-complete`**. Task 13 has
  not started.
- The generic timeline driver once again requires physical playhead agreement
  for proof reuse. The former Crane reverse regressions pass 16/16, and Hero's
  prewarm/first consumer share one named generation without a global semantic
  exception.
- Figure3 and TTG retained rebind recovery is microtask-deferred so a
  same-stack activation is the sole causal preparation owner. Causal results
  remain binding/generation scoped; retained-frame reuse remains physically
  strict.
- Full Vitest passed 173 files / 1,195 tests; Node gate fixtures passed 97/97;
  TypeScript, boolean-data, packed-alpha, cutover architecture, frozen-input,
  `git diff --check`, and complete build passed.
- Build output: desktop JavaScript `577,525 B` with `4,107 B` headroom, phone
  JavaScript `607,339 B`, and maximum lazy JavaScript `50,892 B`. The desktop
  reserve is only 11 bytes above its required 4,096-byte gate and remains an
  explicit future-change risk.
- Phone-portrait WebKit's cumulative complete-story test passed 10/10 in 28.4
  minutes. The single final complete release suite then passed 227/227 in 28.1
  minutes; Hero → Pattern was `52.8ms` against the unchanged `80ms` limit.
- Candidate code is committed as
  `a4ba41feaf76fb2f40afbcf222f1565216fac648`; its canonical production-tree
  hash is
  `5a4d8cee502155f71c226931b176ee1bc7f75f1fe2bfe43a23e1f93e3f9f60a3`.
  Task 13 Step 13.1 still owns the clean rebuild and formal candidate/artifact
  identity freeze.
- All 33 persistent Task 12 evidence hashes verify. Formal findings,
  verification details, historical blocker records, and hashes are in the
  [Task 12 closure review](../../react-refactor/reports/r5-phone-clean-runtime-task12-blocker-review.md).

---

## Task 13: Run Simulator and physical iPhone release acceptance

This is the critical visual verification for which browser/device automation
is required. Unit tests and desktop Playwright are not substitutes.

This is the only scheduled human visual-acceptance task. Tasks 7–10 provide
automated engine/pixel baselines and do not require the user to inspect every
slice. At Task 13 the executor must stop, hand over the frozen candidate,
device checklist, and evidence locations to the person operating the physical
iPhone, and wait for the recorded device result. Simulator evidence cannot
stand in for this handoff.

**Create:**

- `docs/react-refactor/reports/r5-phone-clean-runtime-acceptance.md`

Do not change production code while recording a passing matrix. If a defect is
found, return to the responsible task, add a failing automated regression,
fix it, rerun all later gates, and start this matrix again on the new commit.

Task 13 uses two deliberately separate worktrees:

| Role | Path | Allowed work |
| --- | --- | --- |
| Candidate artifact | `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime-candidate-a4ba41f` | Detached at exact `candidateCodeSha`; build, serve, Simulator, and physical-device testing only. Never edit or commit here. |
| Report branch | `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime` | Acceptance report and plan bookkeeping only. Never build a candidate artifact from its docs-only HEAD. |

All Task 13 test servers must serve the detached candidate worktree's `dist/`.
The report worktree's `dist/` is non-candidate scratch output and must not be
used as device evidence.

- [ ] **Step 13.1: Freeze the candidate identity**

Record:

```text
branch
candidateCodeSha
productionTreeHash
build/release ID
r5-release-manifest sourceCommit + artifactTreeSha256
Node/pnpm versions
Chromium/WebKit versions
iOS Simulator model/runtime
physical iPhone model
physical iOS build
Safari version
network mode
reduced-motion setting
```

The immutable Task 12 inputs are:

```text
candidateCodeSha   = a4ba41feaf76fb2f40afbcf222f1565216fac648
productionTreeHash = 5a4d8cee502155f71c226931b176ee1bc7f75f1fe2bfe43a23e1f93e3f9f60a3
candidateWorktree  = /Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime-candidate-a4ba41f
```

Create or verify the detached worktree, then build once there and test that
exact artifact:

```bash
repositoryRoot=/Users/aitoshuu/Documents/GitHub/TongyeGuanmi
candidateCodeSha=a4ba41feaf76fb2f40afbcf222f1565216fac648
candidateWorktree=/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime-candidate-a4ba41f
expectedProductionTreeHash=5a4d8cee502155f71c226931b176ee1bc7f75f1fe2bfe43a23e1f93e3f9f60a3

test -e "$candidateWorktree/.git" || \
  git -C "$repositoryRoot" worktree add --detach \
    "$candidateWorktree" "$candidateCodeSha"
test "$(git -C "$candidateWorktree" rev-parse 'HEAD^{commit}')" = \
  "$candidateCodeSha"
test -z "$(git -C "$candidateWorktree" symbolic-ref -q HEAD 2>/dev/null || true)"
test -z "$(git -C "$candidateWorktree" status --porcelain --untracked-files=all)"
test "$(git -C "$candidateWorktree" ls-tree -r HEAD -- \
  app assets package.json pnpm-lock.yaml pnpm-workspace.yaml | \
  shasum -a 256 | awk '{print $1}')" = "$expectedProductionTreeHash"

pnpm -C "$candidateWorktree" install --frozen-lockfile

# Dependency bootstrap may create only ignored node_modules state. Re-prove
# immutable source identity before minting any candidate artifact.
test "$(git -C "$candidateWorktree" rev-parse 'HEAD^{commit}')" = \
  "$candidateCodeSha"
test -z "$(git -C "$candidateWorktree" symbolic-ref -q HEAD 2>/dev/null || true)"
test -z "$(git -C "$candidateWorktree" status --porcelain --untracked-files=all)"
test "$(git -C "$candidateWorktree" ls-tree -r HEAD -- \
  app assets package.json pnpm-lock.yaml pnpm-workspace.yaml | \
  shasum -a 256 | awk '{print $1}')" = "$expectedProductionTreeHash"

pnpm -C "$candidateWorktree/app" build
node -e '
  const fs = require("node:fs");
  const [file, expected] = process.argv.slice(1);
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  if (manifest.sourceCommit !== expected || manifest.sourceDirty !== false) {
    throw new Error(`candidate manifest identity mismatch: ${JSON.stringify({
      sourceCommit: manifest.sourceCommit,
      sourceDirty: manifest.sourceDirty
    })}`);
  }
' "$candidateWorktree/dist/r5-release-manifest.json" "$candidateCodeSha"
shasum -a 256 "$candidateWorktree/dist/r5-release-manifest.json"
```

Definitions:

- `candidateCodeSha` is the exact Task 12 code commit above, not the current
  docs-only branch `HEAD`. It contains all production code/configuration tested
  by Tasks 12–13.
- `productionTreeHash` is the SHA-256 of the canonical `git ls-tree` output
  above, covering `app/`, `assets/`, root package/workspace files, and lockfile.
- release-manifest `sourceCommit` must equal `candidateCodeSha`, and
  `sourceDirty` must be `false`; either mismatch blocks every device run.
- `buildId` and `artifactTreeSha256` identify the exact built artifact tested
  on Simulator and physical iPhone.
- `finalHandoffSha` is created later and may differ only by plan/report
  bookkeeping. It is never substituted for `candidateCodeSha` in physical
  evidence.

- [ ] **Step 13.2: Run iOS Simulator as simulator evidence**

At minimum:

- cold formal `/`;
- all 16 direct entries;
- full forward then reverse;
- reduced motion;
- portrait → landscape → portrait;
- background/foreground during AOD, Figure3, TTG, PH, and Crane;
- dynamic viewport resize/scroll where Simulator exposes it;
- rapid repeated swipe at three boundaries;
- `/brand-lab` independent mount/dispose.

Record as `Simulator-complete`, never `Release-complete`.

- [ ] **Step 13.3: Run physical iPhone dynamic-toolbar coverage**

On the actual supported iPhone Safari:

- begin with toolbar expanded;
- collapse toolbar while each scene class is visible;
- expand toolbar again;
- scroll visual viewport horizontally/vertically where zoom/accessibility
  settings permit;
- sample top/right/bottom/left and both bottom/right corners;
- repeat after orientation round-trip.

Required:

- no white/transparent strip;
- no stale prior-scene edge;
- no opaque coverage plane above content;
- no one-frame flash during toolbar movement;
- content remains aligned to authored layout while coverage follows live
  viewport.

- [ ] **Step 13.4: Run physical iPhone Hero/Loader first-frame matrix**

Test:

```text
cold /
reload /
back-forward cache return
slow core
slow Hero images
reduced motion
background before Loader exit
direct entries for all 16 holds
```

Record a screen capture from navigation start through first interaction.
For the back/forward row, record Safari's `pageshow.persisted` value and
remote-inspector authority/listener/resource counters before hide and after
restore.
Required:

- static Loader → React Loader → target is visually continuous;
- Hero never appears completed before zero;
- no whole-stage flash/reset;
- no black/geometry-only gap;
- direct entry never exposes Hero/prior scene before target;
- Loader never exits on safety time without proof.
- a persisted restore has one authority/listener set, a new transaction
  generation, and re-proven plane/frame/scroll before input.

- [ ] **Step 13.5: Run physical iPhone media/lock recovery**

For AOD, Figure2, Figure3, TTG, PH, and Crane:

- enter forward and reverse;
- test a cold direct entry before any prior site gesture;
- reject the first autoplay attempt, then use the visible tap-to-continue
  action with one real physical gesture;
- delay the leaf chunk until the original gesture activation window is gone,
  verify the media surface mounts inert beneath source/Loader, then use the CTA
  with a second real gesture without another import/mount;
- background for more than six seconds;
- foreground and continue;
- lock and unlock the phone;
- interrupt network/media once;
- retry;
- rotate and return;
- repeat on the second full traversal.

Required:

- real frame appears or transaction fails closed immediately/boundedly;
- only current-closure media activates; unrelated videos never play/pause as
  an unlock sweep;
- play permission alone never releases Loader or commits stable;
- CTA is absent until the registered media surface can synchronously activate;
- second gesture renews generation/token, retains topology, and starts media
  within that physical event stack;
- no permanent `preparing`;
- source rollback is visible;
- input always unlocks;
- retry uses a new generation/resource;
- no stale frame completes the retry;
- no Canvas/decoder accumulation.

- [ ] **Step 13.6: Run physical iPhone gesture/input matrix**

Test:

- short wheel-equivalent trackpad events if available;
- slow swipe, fast swipe, reverse swipe;
- momentum tail at every cinematic boundary;
- repeated swipe while target is preparing;
- native reading in Method, Brand, Services, Lab, Education, Contact;
- focus, links, selection, and controls in Contact;
- browser back/forward and hash/menu entry.

Required:

- one physical gesture starts at most one transaction;
- no momentum chain across two segments;
- no double authority/lock;
- native corridors remain native;
- Contact remains interactive;
- history/direct entry uses the same transaction path.

- [ ] **Step 13.7: Run two physical full round trips**

Without reload:

```text
Hero → Contact
Contact → Hero
Hero → Contact
Contact → Hero
```

At each of 16 holds, record:

```text
stable scene/commitSequence/planeRevision
edge/checkpoint/navigation agreement
visible content
media/frame status
input owner/free state
resource counts
```

Required:

- all 60 traversals settle once;
- no visual drift from the first cycle;
- no listener/timer/Canvas/video/WebGL growth;
- no AOD lock, Pattern/Figure2 strip, or Hero flash;
- Group 4–7A accepted composition and reverse timing remain intact.

- [ ] **Step 13.8: Hash/link evidence**

The acceptance report must link or record checksums for:

- screen recordings;
- key hold/transition screenshots;
- Safari console/remote-inspector logs;
- resource-count snapshots;
- build manifest and bundle-size output.

Large transient evidence need not be committed to Git, but its durable storage
location and SHA-256 must be recorded. A missing physical-device row is a
failed release gate, not “not applicable.”

- [ ] **Step 13.8A: Verify deployed HTTP compression before a release claim**

Local Terser output and `gzipSync` metrics do not prove server/CDN
`Content-Encoding`. Against the exact deployed candidate used by physical
Safari, fetch the HTML, resolve its primary JavaScript URL, then record:

```bash
curl -sS -I -H 'Accept-Encoding: br' <primary-js-url>
curl -sS -I -H 'Accept-Encoding: gzip' <primary-js-url>
curl -sS --compressed -H 'Accept-Encoding: br' \
  -o /private/tmp/r5-primary-js.decoded <primary-js-url>
shasum -a 256 /private/tmp/r5-primary-js.decoded <local-primary-js-file>
```

Required:

```text
Content-Encoding: br or gzip
Vary includes Accept-Encoding
Content-Type is JavaScript
ETag/cache identity belongs to the tested build
compressed response decodes to the candidate artifact bytes
```

Do not require compression for already-compressed video/image media. If there
is no deployed candidate endpoint, the branch may be handed off but cannot be
called `Release-complete`.

- [ ] **Step 13.9: Commit evidence report only after all rows pass**

```bash
git add docs/react-refactor/reports/r5-phone-clean-runtime-acceptance.md
git commit -m "docs(r5): record physical phone runtime acceptance"
```

**Task 13 acceptance:**

- iOS Simulator matrix is recorded separately;
- physical iPhone matrix passes on the exact candidate artifact;
- real toolbar, orientation, background, lock/unlock, slow media, reduced
  motion, direct entry, gesture, and two-round-trip evidence exists;
- deployed primary JS proves actual Brotli/gzip response headers when making a
  `Release-complete` claim;
- the exact `candidateCodeSha`/`productionTreeHash`/build artifact may now be
  called `Chunk-closed` and `Release-complete`; neither label is legal before
  both Tasks 12 and 13 pass.

---

## Task 14: Final audit and handoff without merging

**Modify:**

- `docs/react-refactor/reports/r5-phone-clean-runtime-acceptance.md`
- this plan only to check completed boxes and record candidate identity

- [ ] **Step 14.1: Run final architecture and source audit**

```bash
pnpm -C app run verify:phone-architecture:cutover
rg -n "createPhoneStoryRuntime\\(" app/src
rg -n "production/phone/|production/portrait-spike/|validationMode|portrait-spike-motion|loadPhoneLabContactShell" \
  app/src app/e2e app/index.html
find app/src/production/phone-story -maxdepth 1 -type f | sort
git diff --exit-code 9652fbe -- \
  assets app/scripts/homepage-media-contract.mjs app/src/story/timings.ts \
  app/src/story/copy.ts app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts app/src/story/spine.ts app/src/story/media.ts
```

Any legacy match must be either an explicitly historical document or a test
fixture proving rejection. There may be no reachable production match.

- [ ] **Step 14.2: Reconcile immutable candidate evidence without a redundant full rerun**

```bash
git diff --exit-code <candidateCodeSha>..HEAD -- \
  app assets package.json pnpm-lock.yaml pnpm-workspace.yaml
git ls-tree -r HEAD -- \
  app assets package.json pnpm-lock.yaml pnpm-workspace.yaml | shasum -a 256
node --test app/scripts/verify-phone-clean-architecture.test.mjs
node --test app/scripts/verify-homepage-module-boundaries.test.mjs
node --test app/scripts/verify-boolean-data-contract.test.mjs
pnpm -C app run verify:phone-architecture:cutover
git diff --check
git status --short
```

The tree hash must equal the `productionTreeHash` recorded by Task 13. When
current HEAD is a docs-only descendant and this scoped diff is empty, cite the
exact Task 12 automated counts/build bytes and the artifact built in the
detached candidate worktree. Do not repeat full Vitest, build, E2E, or
`test:release` from the report worktree, and do not create a new release
manifest whose `sourceCommit` is the documentation SHA. The only admissible
Task 13 manifest is the one whose `sourceCommit` equals the recorded
`candidateCodeSha`.

Any production/config/lockfile difference invalidates the candidate. Return
to Task 12, freeze a new candidate, and rerun Task 13 rather than trying to
repair identity in Task 14. A full suite is run here only when Task 12 evidence
is missing or invalid, which itself blocks handoff until a new candidate is
established.

- [ ] **Step 14.3: Review final diff by authority and visuals**

```bash
git diff --stat 9652fbe..HEAD
git log --oneline --decorate 9652fbe..HEAD
git diff --name-status 9652fbe..HEAD
```

The report must answer:

1. Which one file creates runtime authority?
2. Which one reducer commits stable state?
3. Which one projector owns viewport/layer/content/frame proof?
4. Where are all 16 scenes and 15 transitions declared?
5. Which genuine leaves changed and why?
6. Which old files were deleted or relocated?
7. How are formal and QA route graphs separated?
8. What proves chunks cannot create a second lifecycle?
9. What proves Hero/AOD/Pattern/Figure2 regressions are closed?
10. What physical iPhone artifact was tested?

- [ ] **Step 14.4: Prove production identity is unchanged**

Using the `candidateCodeSha` recorded by Task 13:

```bash
git diff --exit-code <candidateCodeSha>..HEAD -- \
  app assets package.json pnpm-lock.yaml pnpm-workspace.yaml
git ls-tree -r HEAD -- \
  app assets package.json pnpm-lock.yaml pnpm-workspace.yaml | shasum -a 256
```

The hash must equal recorded `productionTreeHash`. Any production/config/lock
difference invalidates physical evidence and requires a new Task 12/13
candidate. Documentation-only changes are allowed.

- [ ] **Step 14.5: Ensure branch is handoff-ready**

```bash
git status --short
git branch --show-current
git merge-base --is-ancestor 9652fbe HEAD
```

Required:

- clean worktree;
- branch remains `codex/r5-phone-clean-runtime-convergence`;
- no merge from neighboring recovery branches;
- no untracked generated policy/runtime files;
- every task commit is present and individually reviewable.

- [ ] **Step 14.6: Commit final report bookkeeping if needed**

```bash
git add docs/react-refactor/reports/r5-phone-clean-runtime-acceptance.md \
  docs/superpowers/plans/2026-07-30-r5-phone-clean-runtime-convergence.md
git commit -m "docs(r5): close clean phone runtime convergence"
```

After this commit:

```bash
git rev-parse HEAD
git diff --exit-code <candidateCodeSha>..HEAD -- \
  app assets package.json pnpm-lock.yaml pnpm-workspace.yaml
```

The first value is `finalHandoffSha`; record it in the handoff message without
editing/committing the report again. The second command must remain clean.
Do not merge, push, delete another worktree, or change the neighboring branch
without separate user authorization.

**Task 14 acceptance:**

- all automated/physical evidence is tied to `candidateCodeSha`,
  `productionTreeHash`, and the exact build artifact;
- `finalHandoffSha` differs only by documentation and passes the scoped
  production diff gate;
- final worktree is clean;
- plan/report show exact completion state;
- the branch is ready for human review and an explicitly authorized merge.

---

## Appendix A: Final deletion and disposition ledger

The executor must populate the “Final disposition” column before Task 11.

| Base area | Final disposition |
| --- | --- |
| `app/src/production/phone/PhoneStoryShell*` | Delete; replaced by `production/phone-story/PhoneStoryShell.tsx` + `styles.css` |
| `PhoneStageRail*`, `PhoneTransitionCoordinator*` | Delete; one projector/topology replaces them |
| `PhoneGradeAStory*`, `PhoneBrandLabContinuation*`, `PhoneLabContactShell*` | Delete; no slice shell |
| old `PhoneBrandLabStory*`, `PhoneBrandLabScope` | Delete; QA wrapper in clean core |
| `usePhone*` hooks | Delete; reducer/runtime/projector own behavior |
| `adapter-groups/*` | Delete after stateless migration bridges retire |
| old `module-loaders*`, `types.ts`, `lab-contact-types.ts` | Delete; manifest and two typed lazy registries replace them |
| phone input/snap/timeline/coordinator helpers | Delete; runtime owns input/time/transaction |
| `phone-media.ts` | Move its pure URL resolver to `app/src/media/phone-media.ts` |
| `scenes/phone-packed-alpha-surface.ts` | Move its pure compositor surface to `app/src/media/phone-packed-alpha-surface.ts` |
| AOD/native autoplay and Lab/Contact timeline helpers | Delete; runtime commands playback and receives reports |
| PH/Crane/Figure3/TTG reverse rendering | Keep only scene-local render helpers under their canonical scene directories |
| old `production/phone/scenes/*` | Relocate genuine leaves to canonical scene paths; delete wrappers |
| old `production/phone/transitions/*` | Relocate genuine leaves to canonical transition paths; delete loaders/wrappers |
| `production/portrait-spike/*` | Delete; no numbered/query validation composition |
| `App.tsx` validation mode union/branches | Delete |
| `main.tsx` query QA scope | Replace with route-only `/brand-lab` |
| `index.html` spike/session preboot | Replace with presentation-only phone preboot |
| desktop runtime | Preserve; no phone convergence behavior added |

The directory-level cutover assertions are authoritative:

```bash
test ! -e app/src/production/phone
test ! -e app/src/production/portrait-spike
```

No item may be marked “kept for compatibility.”

## Appendix B: Requirement-to-gate traceability

| User concern / prior failure | Architectural prevention | Executable gate |
| --- | --- | --- |
| “状态机各种都是收归统一” | one snapshot, reducer, factory call, stable commit | Tasks 2, 4, 11, 12 |
| Front/Unit 4–7A must stay accepted | frozen inputs + group checkpoints | Tasks 0, 7–10, 13 |
| Unit 7B leaf improvements get lost or lifecycle leaks in | exhaustive `c808e06` per-hunk disposition + separate donor trace | Tasks 0, 10, 14 |
| `/brand-lab` cannot become another product runtime | thin wrapper, separate object, same shell | Tasks 2, 11 |
| chunk/property-name failures | synchronous core closure, normal ESM, no property mangle | Tasks 1, 2, 6, 12 |
| chunk retry loops/old deployment mismatch | offline-before-import first load; native reject uses existing release manifest + one cross-reload lineage allowance, never same-Document re-import | Tasks 6, 11, 12 |
| source/receiver disappears during preparation | per-direction/direct-entry closure + retain/expose/retire proof | Tasks 3, 4, 7–12 |
| Safari activation expires or unlocks unrelated media | one runtime-scoped gesture credit + retained inert media topology + readiness-gated CTA | Tasks 3, 4, 7, 10, 12, 13 |
| receiver proof depends on being exposed | prepared proof → candidate plane → projector-owned visible proof | Tasks 3–5, 7–12 |
| viewport repaint is mistaken for stable commit | stable commit/proof split + four distinct revisions + proof-only reproject branch | Tasks 2, 4, 5, 12 |
| warm menu/hash/popstate clears the stable source | separate `mode: entry` + retained stable anchor + URL rollback matrix | Tasks 3, 4, 12 |
| failed rollback inflates semantic history | exact stable object/sequence retained; proof-only source settle | Tasks 4, 12 |
| runtime cannot command/rebind multi-surface leaves | frozen report-port + command-handle interface | Tasks 3–10 |
| initial phone core rejects before runtime exists | eager non-story bootstrap boundary + shared recovery lineage | Tasks 2, 11, 12 |
| reload guard resets when build/hash changes | lineage persists across reload until proven stable | Tasks 2, 6, 11, 12 |
| Vite manifest hides actual module placement | Rollup `OutputChunk.modules` provenance report | Tasks 2, 11, 12 |
| old R5 release specs fail only after device testing | Task 0 disposition + Task 11 project migration + full Task 12 release suite | Tasks 0, 11, 12 |
| reducer callbacks synchronously re-enter or race | one serial priority queue + phase preemption table | Task 4 |
| shared leaf migration breaks old formal route | per-slice dual-service browser gate | Tasks 7–10 |
| local gzip metric is mistaken for deployed compression | deployed primary-JS Content-Encoding gate | Task 13 |
| back/forward revives stale authority/media | reducer-owned pagehide/pageshow persisted recovery | Tasks 4, 12, 13 |
| rollback itself fails and remains stuck | named deadlines + explicit faulted/safe-cover terminal | Tasks 3, 4, 12 |
| AOD locks | real compositor-draw proof, fail-fast rollback/retry | Tasks 4, 7, 12, 13 |
| Pattern/Figure2 white strip | one live-viewport coverage projector + screenshot pixels | Tasks 5, 7, 8, 12, 13 |
| Hero flashes/reset | synchronous zero + fixed topology + proven Loader handoff | Tasks 5, 7, 13 |
| effect is behind/above wrong layer | semantic layer manifest + actual stack/pixel checks | Tasks 3, 5, 7–12 |
| direct route shows blank/prior scene | Loader holds until target content/frame/plane quorum | Tasks 4–12 |
| momentum starts multiple transitions | one physical epoch/one intent owner | Tasks 4, 10, 13 |
| reverse compositor regresses | real endpoint proof and two full cycles | Tasks 9, 10, 13 |
| files keep multiplying or become God modules | flat ten-file allowlist + dependency/LOC/authority gates | Tasks 2, 11, 12 |
| unit tests pass but real iPhone fails | separate engine/simulator/physical claim levels | Tasks 5, 12, 13 |

## Appendix C: Stop conditions

Stop execution and return for architecture review when any is true:

- an eleventh or non-allowlisted core production file appears necessary;
- any per-file or total core LOC budget would be exceeded;
- `machine.ts` appears to need browser effects or `runtime.ts` appears to need
  another reducer/stable-state constructor;
- a scene needs to read runtime state instead of receiving a port;
- a scene needs a command outside the frozen
  `PhoneLeafCommandHandle` or a scene-specific runtime adapter;
- a lazy leaf appears to need `runtime.ts`, `machine.ts`, reducer `dispatch`,
  caller-selected evidence identity, or content-proof authority;
- a transition needs its own clock/transaction state;
- formal and QA appear to need different reducers/projectors;
- a visual fix proposes changing frozen media/timings/camera composition;
- a coverage fix is scene-specific;
- a frame proof cannot be causally tied to a real render;
- the 663,552-byte hard cap appears to require property mangling, code golf,
  removed diagnostics, or a God module;
- a phone/total 4 KiB reserve is reintroduced as a second bundle failure line;
- an implementation proposes retrying a natively rejected module URL in the
  same Document or permits a reload loop;
- bootstrap recovery appears to need scene/transaction/input/presentation
  state;
- an event source appears to require synchronous reducer re-entry;
- any live R5 release spec/helper lacks a Task 0/11 disposition;
- physical iPhone evidence contradicts automated gates;
- a neighboring branch must be merged to continue.

At a stop condition, write a short ADR with evidence and alternatives. Do not
silently relax this plan.

## Appendix D: Definition of done

This work is done only when all statements are true:

- [ ] branch started from exact `9652fbe` and never merged a later phone
  runtime;
- [ ] immutable story/media inputs match the recorded hashes;
- [ ] exactly 16 holds and 15 reversible segments are in one manifest;
- [ ] exactly one route-local runtime is mounted per phone route;
- [ ] only `PhoneStoryShell` calls the runtime factory;
- [ ] one reducer and one `commitStableCandidate()` branch create semantic
  stable commits;
- [ ] `PhoneStableCommit` is separate from its bound
  `PhonePresentationProof`; `reprojectCommittedPlane()` is the only
  proof-only recovery path and never changes scene, landing, checkpoint,
  navigation, or `commitSequence`;
- [ ] cold boot and warm entry candidate, URL intent, evidence, fallback, and
  retry are reducer state; warm entry retains the prior stable rollback anchor;
- [ ] successful rollback preserves the exact `PhoneStableCommit` object and
  sequence and replaces only source proof;
- [ ] `stateRevision`, `commitSequence`, `transactionGeneration`, and
  `planeRevision` retain their four distinct meanings;
- [ ] one projector owns viewport, layers, content, frame, and plane proof;
- [ ] every candidate follows prepared proof → atomic candidate plane →
  post-paint visible proof; content proof comes only from projector;
- [ ] one runtime owns physical input, lifecycle time, rollback, and disposal;
- [ ] one non-reentrant serial event queue passes every Section 4.8 priority
  and phase-preemption row;
- [ ] all 30 segment directions and 16 direct entries declare and enforce
  complete dependency closures and resource maxima;
- [ ] runtime exclusively scopes iOS media activation to the current closure;
  a missed activation retains the prepared inert media topology until a
  readiness-gated physical CTA synchronously consumes a new token;
- [ ] leaf decode clocks report facts but cannot commit; every leaf uses the
  frozen report-port/command-handle contract, and lazy leaves cannot receive
  runtime/dispatch, construct evidence slots, or submit content proof;
- [ ] formal and QA reuse implementation without sharing a live object;
- [ ] old phone/portrait-spike orchestration is deleted;
- [ ] clean production core contains exactly the ten allowlisted files and
  passes dependency/per-file/total LOC limits;
- [ ] no property mangling, generated cross-chunk policy, compatibility
  wrapper, or numbered validation route remains;
- [ ] offline-before-import waits and performs a first load; once native
  import/preload rejects, the same URL is never retried in the same Document,
  the existing release manifest classifies recovery, initial core and leaf
  failures share one cross-reload lineage, one automatic reload cannot loop,
  and stale responses cannot satisfy a newer generation;
- [ ] eager bootstrap recovery owns no story state and manifest
  fetch/storage-failure paths reach a bounded fail-closed UI;
- [ ] Rollup `OutputChunk.modules` provenance proves actual core/leaf
  placement, duplication, and eager reachability;
- [ ] pagehide/pageshow persisted recovery re-proves one authority without
  duplicate listeners or stale media resources;
- [ ] every hold/segment passes global layer, coverage, frame, content,
  endpoint, reduced-motion, direct-entry, and rollback gates;
- [ ] toolbar-only viewport changes preserve progress, while orientation
  invalidation re-proves/rolls back through the same runtime;
- [ ] Hero has no Loader-to-stage flash or completed-to-zero reset;
- [ ] AOD proves a real draw or fails/rolls back/unlocks;
- [ ] Pattern/Figure2 and every other hold pass real four-edge pixel checks;
- [ ] Figure3/TTG/PH/Crane preserve accepted forward/reverse compositors;
- [ ] Contact remains native and interactive;
- [ ] two complete forward/reverse round trips show no resource growth;
- [ ] phone JS remains below the 663,552-byte hard cap; 628,044 is reported as
  the clean-base warning target, and the accepted clean-cutover/chunk baseline
  is recorded; phone/total 4 KiB headroom is reported but not asserted;
- [ ] full Vitest, typecheck, build, Chromium, WebKit, and complete
  dispositioned `test:release` suites pass before candidate freeze;
- [ ] iOS Simulator evidence is complete;
- [ ] Task 12 earns only `Chunk-contract-complete`; neither “chunk closed” nor
  `Release-complete` is claimed before the Task 13 physical iPhone matrix
  passes;
- [ ] physical iPhone Safari matrix passes on the exact
  `candidateCodeSha`/`productionTreeHash`/build artifact;
- [ ] a deployed `Release-complete` claim includes real primary-JS
  Brotli/gzip response-header evidence;
- [ ] acceptance report records exact tested build, candidate code SHA,
  production tree hash, device, evidence, and optional docs-only
  `finalHandoffSha`;
- [ ] a scoped diff/tree gate proves any final handoff commit changed no
  `app/`, `assets/`, package manifest, build configuration, or lockfile after
  the tested candidate;
- [ ] worktree is clean and branch is handed off without an unauthorized
  merge.

## Appendix E: Authoritative closure, surface, selector, resource, and deadline matrix

This appendix is normative Task 3 input, not illustrative prose. If a migrated
leaf changes a selector or surface ID, the leaf, manifest, matrix, and tests
change in the same slice. The executor may normalize repeated profiles in
`manifest.ts`; it may not invent values outside this ledger.

### E.1 Notation and proof boundaries

```text
S(scene) = the scene dependency/surface row in E.3
X(segment) = the genuine transition leaf for that segment
src/*, recv/* = every registered surface in the referenced scene row
fx = the transition's registered effect root/Canvas, when present
P = module loaded + root/surfaces connected + required decode/draw ready + layout measurable
V = candidate plane acknowledged + content/frame visible + coverage + landing/scroll proven
R-standard = source visible through P; mounted as rollback anchor through V;
             retire after target stable and rollback window closes
R-pair = both pair endpoints/compositor surfaces remain mounted while stable
         inside the pair; inactive decoders pause; retire only after a commit
         outside the pair or route disposal
```

All segment closures use:

```text
load = S(source).dependencies + X(segment) + S(target).dependencies
mount = src/* + fx when declared + recv/*
prewarm = target leaf module + immutable image/video metadata only
retainUntil = P
exposeReceiverAfter = module + root + required decode/draw + layout
retireAfter = R-standard or R-pair from E.4
```

Prewarm never mounts, plays, allocates an active decoder/WebGL context, or
consumes activation. Budgets are written `(videos, activeDecoders, canvases,
webglContexts)` and are hard inclusive maxima for the mounted closure.

### E.2 Numeric active-foreground deadlines

Canonical animation/dwell duration still comes from
`app/src/story/timings.ts`. These numbers bound readiness/proof/failure only:

| Profile | `moduleLoad` | `mediaPrepare` | `firstFrame` | `planeApply` | `scrollConfirm` | `rollback` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `D-static` | 8,000 ms | 0 (not scheduled) | 1,500 ms | 1,500 ms | 1,500 ms | 4,000 ms |
| `D-single-media` | 8,000 ms | 8,000 ms | 3,000 ms | 1,500 ms | 1,500 ms | 5,000 ms |
| `D-multi-media` | 10,000 ms | 10,000 ms | 4,000 ms | 1,500 ms | 1,500 ms | 6,000 ms |

Global bootstrap `manifestFetch` is 3,000 ms. Hidden time pauses these
active-foreground deadlines; foreground recovery creates a fresh generation,
not extra time on stale evidence. Any change to a value requires a focused ADR
and slow-network/physical-iPhone evidence.

### E.3 Scene/direct-entry matrix

Every row implicitly includes `root:<scene>` and the leaf module
`scene:<scene>`. Selectors are conjunctive: every listed selector must resolve
inside the registered root and pass visible-content proof.

| Scene | Additional dependencies | Named surfaces | Required content selector(s) | Budget `(v,d,c,w)` | Deadline |
| --- | --- | --- | --- | --- | --- |
| `hero` | `media:hero-back`, `media:hero-middle`, `media:hero-figure-poster`, `media:hero-figure-packed`, `compositor:hero-packed` | `hero-back-image`, `hero-middle-image`, `hero-figure-poster`, `hero-figure-video`, `hero-figure-canvas`, `hero-intro-ink` | `#portrait-spike-home` | `(1,1,2,1)` | `D-single-media` |
| `pattern` | `media:pattern-background` | `pattern-image` | `#portrait-spike-pattern-title` | `(0,0,0,0)` | `D-static` |
| `star-map` | `media:star-map-source` | `star-map-canvas` | `#portrait-spike-star-title` | `(0,0,1,0)` | `D-static` |
| `aod-animation` | `media:aod-figure-packed`, `compositor:aod-packed` | `aod-figure-video`, `aod-figure-canvas` | `[data-aod-figure-canvas]` | `(1,1,1,1)` | `D-single-media` |
| `method-top` | none | `method-root` | `#method #portrait-spike-method-title`, `#method .portrait-scroll-spike__method-bridge-content p` | `(0,0,0,0)` | `D-static` |
| `figure2-animation` | `media:figure2-pair-poster`, `media:figure2-foreground-arch`, `media:figure2-pair-packed`, `compositor:figure2-packed` | `figure2-pair-video`, `figure2-pair-canvas`, `figure2-foreground-arch` | `[data-r4-scene="figure2-animation"] [data-figure2-packed-alpha-canvas]` | `(1,1,1,1)` | `D-single-media` |
| `figure2-proof` | none | `figure2-proof-root` | `#figure2-proof-opening .r4-proof-opening__title` | `(0,0,0,0)` | `D-static` |
| `brand` | none | `brand-root` | `#phone-brand-title`, `.phone-brand__definition p` | `(0,0,0,0)` | `D-static` |
| `figure3-animation` | `media:figure3-motion`, `compositor:figure3-paper` | `figure3-video`, `figure3-paper-canvas` | `[data-phone-scene="figure3-animation"] [data-phone-figure3-paper-canvas]` | `(1,1,1,0)` | `D-single-media` |
| `services` | none | `services-root` | `#phone-services-title`, `.phone-services__hero > p:last-child` | `(0,0,0,0)` | `D-static` |
| `ttg-animation` | `media:ttg-figure-motion` | `ttg-figure-video` | `[data-r4-scene="ttg-animation"] [data-ttg-figure-video]` | `(1,1,0,0)` | `D-single-media` |
| `lab` | none | `lab-root` | `#phone-lab-title`, `.phone-lab__hero > p:not(.phone-lab__eyebrow)` | `(0,0,0,0)` | `D-static` |
| `ph-animation` | `media:ph-figure-packed`, `compositor:ph-packed` | `ph-figure-video`, `ph-figure-canvas` | `[data-r4-scene="ph-animation"] [data-phone-packed-alpha-canvas="ph-figure"]` | `(1,1,1,1)` | `D-single-media` |
| `education` | none | `education-root` | `#education [data-r4-scene="education"] .r4-education__vertical h2`, `#education .r4-education__lead p` | `(0,0,0,0)` | `D-static` |
| `crane-animation` | `media:crane-figure-packed`, `media:crane-flock-packed`, `compositor:crane-figure-packed`, `compositor:crane-flock-packed` | `crane-figure-video`, `crane-figure-canvas`, `crane-flock-video`, `crane-flock-canvas` | `[data-r4-scene="crane-animation"] [data-phone-packed-alpha-canvas="crane-figure"]`, `[data-phone-packed-alpha-canvas="crane-flock"]` | `(2,2,2,2)` | `D-multi-media` |
| `contact` | none | `contact-root` | `#contact [data-r4-scene="contact"] h2`, `#contact [data-r4-scene="contact"] p` | `(0,0,0,0)` | `D-static` |

Each of the 16 cold direct entries is the corresponding E.3 row with:

```text
load = that row's full dependencies
mount = recv/* inert beneath Loader
prewarm = none
retainUntil = Loader through P
exposeReceiverAfter = P
retireAfter = Loader only after V + stable commit
resourceBudget = row budget
deadline = row deadline
```

No cold direct entry loads an earlier story scene.

### E.4 All 30 segment-direction closures

`F` means canonical source → target; `R` reverses those endpoints. Each row
expands `load/mount/prewarm/retain/expose` through E.1 and the two E.3 scene
rows. Budget includes the transition effect surface.

| Direction | Source → receiver | Effect surface | Retirement | Budget `(v,d,c,w)` | Deadline |
| --- | --- | --- | --- | --- | --- |
| `hero-pattern:F` | `hero` → `pattern` | `fx:hero-pattern` | `R-standard` | `(1,1,3,2)` | `D-single-media` |
| `hero-pattern:R` | `pattern` → `hero` | `fx:hero-pattern` | `R-standard` | `(1,1,3,2)` | `D-single-media` |
| `pattern-star-map:F` | `pattern` → `star-map` | `fx:pattern-star-map` | `R-standard` | `(0,0,2,1)` | `D-static` |
| `pattern-star-map:R` | `star-map` → `pattern` | `fx:pattern-star-map` | `R-standard` | `(0,0,2,1)` | `D-static` |
| `star-map-aod:F` | `star-map` → `aod-animation` | `fx:star-map-aod` | `R-standard` | `(1,1,3,2)` | `D-single-media` |
| `star-map-aod:R` | `aod-animation` → `star-map` | `fx:star-map-aod` | `R-standard` | `(1,1,3,2)` | `D-single-media` |
| `aod-method-top:F` | `aod-animation` → `method-top` | registered between-effect root | `R-standard` | `(1,1,1,1)` | `D-single-media` |
| `aod-method-top:R` | `method-top` → `aod-animation` | registered between-effect root | `R-standard` | `(1,1,1,1)` | `D-single-media` |
| `method-bottom-figure2:F` | `method-top` → `figure2-animation` | `fx:method-bottom-figure2` | `R-standard` | `(1,1,2,2)` | `D-single-media` |
| `method-bottom-figure2:R` | `figure2-animation` → `method-top` | `fx:method-bottom-figure2` | `R-standard` | `(1,1,2,2)` | `D-single-media` |
| `figure2-distance-expand:F` | `figure2-animation` → `figure2-proof` | `fx:figure2-distance-expand` | `R-standard` | `(1,1,4,2)` | `D-single-media` |
| `figure2-distance-expand:R` | `figure2-proof` → `figure2-animation` | `fx:figure2-distance-expand` | `R-standard` | `(1,1,4,2)` | `D-single-media` |
| `figure2-proof-brand:F` | `figure2-proof` → `brand` | `fx:figure2-proof-brand` | `R-standard` | `(0,0,1,1)` | `D-static` |
| `figure2-proof-brand:R` | `brand` → `figure2-proof` | `fx:figure2-proof-brand` | `R-standard` | `(0,0,1,1)` | `D-static` |
| `brand-figure3:F` | `brand` → `figure3-animation` | `fx:brand-figure3` | `R-standard` | `(1,1,2,1)` | `D-single-media` |
| `brand-figure3:R` | `figure3-animation` → `brand` | `fx:brand-figure3` | `R-standard` | `(1,1,2,1)` | `D-single-media` |
| `figure3-services:F` | `figure3-animation` → `services` | registered between-effect root | `R-pair` | `(1,1,1,0)` | `D-single-media` |
| `figure3-services:R` | `services` → `figure3-animation` | registered between-effect root | `R-pair` | `(1,1,1,0)` | `D-single-media` |
| `services-ttg:F` | `services` → `ttg-animation` | `fx:services-ttg` | `R-standard` | `(1,1,1,1)` | `D-single-media` |
| `services-ttg:R` | `ttg-animation` → `services` | `fx:services-ttg` | `R-standard` | `(1,1,1,1)` | `D-single-media` |
| `ttg-lab:F` | `ttg-animation` → `lab` | registered between-effect root | `R-pair` | `(1,1,0,0)` | `D-single-media` |
| `ttg-lab:R` | `lab` → `ttg-animation` | registered between-effect root | `R-pair` | `(1,1,0,0)` | `D-single-media` |
| `lab-ph:F` | `lab` → `ph-animation` | `fx:lab-ph` | `R-standard` | `(1,1,2,2)` | `D-single-media` |
| `lab-ph:R` | `ph-animation` → `lab` | `fx:lab-ph` | `R-standard` | `(1,1,2,2)` | `D-single-media` |
| `ph-education:F` | `ph-animation` → `education` | registered between-effect root | `R-pair` | `(1,1,1,1)` | `D-single-media` |
| `ph-education:R` | `education` → `ph-animation` | registered between-effect root | `R-pair` | `(1,1,1,1)` | `D-single-media` |
| `education-crane:F` | `education` → `crane-animation` | `fx:education-crane` | `R-standard` | `(2,2,3,3)` | `D-multi-media` |
| `education-crane:R` | `crane-animation` → `education` | `fx:education-crane` | `R-standard` | `(2,2,3,3)` | `D-multi-media` |
| `crane-contact:F` | `crane-animation` → `contact` | registered between-effect root | `R-pair` | `(2,2,2,2)` | `D-multi-media` |
| `crane-contact:R` | `contact` → `crane-animation` | registered between-effect root | `R-pair` | `(2,2,2,2)` | `D-multi-media` |

### E.5 Warm entry closure

For every different stable source/target pair:

```text
mode = entry
load = target E.3 dependencies
mount = retained source root/surfaces + target recv/* inert beneath source
prewarm = target immutable module/metadata only
retainUntil = source visibly covers target through P
exposeReceiverAfter = P
retireAfter success = target V + stable; then retire source by R-standard
retireAfter failure = never retire source before source re-proof
semantic rollback = retain exact source PhoneStableCommit/commitSequence
deadline = componentwise stricter/larger source/target E.2 profile
universal hard budget = (3 videos, 2 active decoders, 4 canvases, 3 WebGL)
```

Before target decoder activation, runtime pauses source decode clocks while
retaining the already proven source pixels/Canvas as rollback cover. A
same-scene warm entry does not mount a second leaf and does not increment
`commitSequence`; it performs only bounded landing/proof correction when
needed.
