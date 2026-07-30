# R5 Phone Clean Runtime Convergence Implementation Plan

> **Status:** ready for execution; no production implementation in this plan is
> marked complete.
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

**Architecture:** Build the new implementation beside the unchanged
`9652fbe` phone route in a development-only harness. `PhoneStoryShell` is the
only runtime factory call site. The runtime reduces entry, input, preparation,
playback, presentation, rollback, and disposal into one discriminated
snapshot. Presentation reports evidence but cannot advance the story. Scene
and transition leaves render through narrow ports and cannot import runtime
authority. After all four donor groups pass, switch formal `/` atomically,
delete the old orchestration in the same commit, and add `/brand-lab` as a thin
QA wrapper around the same shell.

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
- Keep one writer for `manifest.ts`, `runtime.ts`, `presentation.ts`, and
  `PhoneStoryShell.tsx`. Group leaf work may proceed independently only after
  the four core interfaces are frozen, and it may not edit those four files.

### Evidence-only post-base donor ledger

Later commits are not ancestry for this implementation. Their only allowed
use is listed here:

| Commit | Allowed donation | Explicit exclusion |
| --- | --- | --- |
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
c808e06 and later slice-local lifecycle integrations
f129540 hidden pre-play behavior
e4f7fe0, e2f9345, 17180d9, 18b6a7c runtime implementations
d4d29bc..be9db27 as a production implementation range
the presentation-recovery runtime/core
```

When a hunk is used, the commit body records source commit, source path,
destination path, and why the hunk is independent of authority.

## 1. Non-negotiable outcome

### 1.1 The only production core

At final cutover, `app/src/production/phone-story/` contains exactly eight
production files:

```text
app/src/production/phone-story/
  PhoneStoryShell.tsx
  PhoneBrandLabStory.tsx
  manifest.ts
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
| `runtime.ts` | 1,400 |
| `presentation.ts` | 900 |
| `manifest.ts` | 500 |
| `PhoneStoryShell.tsx` | 500 |
| `scenes.tsx` | 700 |
| `transitions.tsx` | 700 |
| Total TypeScript/TSX in the eight-file core | 4,500 |

`PhoneBrandLabStory.tsx` should be a thin wrapper, not a second shell. CSS does
not count toward the TypeScript limit but must remain one coherent stylesheet;
scene-specific styling belongs with the scene leaf.

No `runtime/`, `contracts/`, `registries/`, `projectors/`, `adapters/`, or
`compat/` subtree may be created under `phone-story/` without a new
user-approved ADR.

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
selectors over it. DOM datasets mirror a published revision for diagnostics;
they are never read back as authority.

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
- `it.fails`, `.skip`, conditional skips, swallowed browser assertions, or
  `waitForTimeout()` used as readiness;
- numbered production validation routes such as `?v=46`;
- query aliases that mount a second production composition;
- compatibility wrappers retained only to satisfy obsolete source-contract
  tests.
- cloned/rasterized/screenshot scene substitutes; transitions must use the one
  canonical live source and receiver leaves.

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

## 3. Target dependency graph

Allowed production dependency direction:

```text
story/canonical inputs
          ↓
phone-story/manifest.ts
   ├────────→ presentation.ts ───────┐
   ├────────→ runtime.ts ────────────┤
   ├────────→ scenes.tsx ────────────┼→ PhoneStoryShell.tsx
   └────────→ transitions.tsx ───────┘           ↑
                                      PhoneBrandLabStory.tsx
                                            (QA only)
```

More precisely:

- `manifest.ts`: canonical story imports only; no React, DOM, runtime, scene,
  transition, or CSS import.
- `presentation.ts`: may import `manifest.ts`; no React and no scene/transition
  leaf import.
- `runtime.ts`: may import `manifest.ts` and presentation types/functions; no
  React, CSS, scene component, transition component, or QA import.
- `scenes.tsx`: may import manifest port types and lazy scene leaves; no
  runtime import.
- `transitions.tsx`: may import manifest port types and lazy transition leaves;
  no runtime import.
- `PhoneStoryShell.tsx`: wires the runtime, presentation, scene registry,
  transition registry, Loader, Nav, and the persistent visual planes.
- `PhoneBrandLabStory.tsx`: imports only `PhoneStoryShell` and passes QA scope,
  initial entry, and diagnostics.
- A leaf can report through the supplied port but cannot import
  `runtime.ts`, dispatch an event, retain the story snapshot, add physical
  input listeners, or commit a landing.

The runtime receives scene/transition loading and presentation capabilities as
configuration ports. It does not import lazy leaves, preventing a cyclic
core/chunk graph.

## 4. State, evidence, and commit contract

### 4.1 Snapshot

Implement one discriminated snapshot in `runtime.ts`:

```ts
export type PhoneStorySnapshot =
  | Readonly<{
      status: 'booting';
      authorityId: string;
      revision: number;
      entry: PhoneEntryRequest;
      committed: null;
      bootFailure: PhoneFailure | null;
      viewport: PhoneViewportSnapshot;
    }>
  | Readonly<{
      status: 'stable';
      authorityId: string;
      revision: number;
      committed: PhoneCommittedPresentation;
      transaction: null;
      scroll: PhoneScrollSample;
      viewport: PhoneViewportSnapshot;
    }>
  | Readonly<{
      status: 'transaction';
      authorityId: string;
      revision: number;
      committed: PhoneCommittedPresentation;
      transaction: PhoneTransaction;
      scroll: PhoneScrollSample;
      viewport: PhoneViewportSnapshot;
    }>;
```

`PhoneViewportSnapshot` contains the latest immutable layout/visual samples,
their revisions, and a derived supported/blocked presentation state. It is
written only by reducer viewport events; CSS variables and warning datasets
mirror it and are never read back.

`PhoneCommittedPresentation` contains the values that must move together:

```ts
type PhoneCommittedPresentation = Readonly<{
  sceneId: PhoneSceneId;
  landing: PhoneLanding;
  plane: PhonePresentationPlane;
  presentationRevision: number;
  frameEvidence: PhoneFrameEvidence;
  contentEvidence: PhoneContentEvidence;
  coverageEvidence: PhoneCoverageEvidence;
  scrollEvidence: PhoneScrollEvidence;
}>;
```

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
  | 'rolling-back';

type PhoneTransactionIdentity = Readonly<{
  authorityId: string;
  transactionId: string;
  generation: number;
  candidateRevision: number;
  segmentId: PhoneSegmentId;
  direction: 'forward' | 'reverse';
  stageIndex: number;
  leg: 'source' | 'effect' | 'target' | 'rollback';
}>;
```

Every asynchronous report carries the full active identity. A report with a
stale authority, transaction, generation, candidate revision, direction, or
leg is ignored and recorded as a diagnostic; it cannot mutate evidence.

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

No leaf receives the runtime. A leaf receives an identity-bound port:

```ts
export type PhoneLeafPort = Readonly<{
  identity: PhoneTransactionIdentity;
  reportMounted(root: HTMLElement): void;
  reportContent(result: PhoneContentReport): void;
  reportFrame(result: PhoneFrameReport): void;
  reportProgress(progress: number): void;
  reportComplete(): void;
  reportFailure(failure: PhoneFailure): void;
}>;
```

The actual shared type may live in `manifest.ts` to preserve the allowed DAG.

### 4.4 Stable-commit quorum

`stable(target)` is legal only when the same candidate identity has all
applicable evidence:

```text
module loaded
target mounted and connected
content predicate visible
required image/video/Canvas/static frame proven
source/receiver/effect layer roles applied
live visual viewport covered on four edges
target landing measured
scroll command confirmed
edge/checkpoint/navigation derived from target manifest record
complete presentation plane applied
post-paint presentation revision acknowledged
```

The reducer must have one `commitStableCandidate()` branch. No other branch may
construct a new `PhoneCommittedPresentation`.

Production quorum uses causal DOM geometry/computed-style checks and
identity-bound media/compositor callbacks. Playwright screenshot pixels are an
external acceptance gate that falsifies those production proofs; screenshot
sampling is not a production reducer event.

### 4.5 Failure semantics

- Prepare, chunk, media, playback, presentation, scroll, and timeout failures
  enter `rolling-back`.
- The last committed source plane remains visible while target preparation is
  in flight.
- Rollback must prove the source plane and source landing before returning to
  `stable(source)`.
- Input is released after the rollback commit, not on the first failure event.
- Boot/direct-entry failure falls back to a newly proven Hero candidate.
- After that Hero fallback is proven, one history `replaceState` effect
  canonicalizes the URL to Hero. It never leaves a target hash paired with a
  Hero stable snapshot.
- If Hero itself cannot be proven, keep the static Loader/opaque preboot cover,
  expose an accessible retry message, and do not publish a false stable scene.
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

## 5. Evidence levels and release language

Use these labels in commits and reports:

| Label | Meaning | May claim release stability? |
| --- | --- | --- |
| Contract-complete | Pure reducer, manifest, and static architecture gates pass | No |
| Engine-complete | Chromium and Playwright WebKit transaction/pixel gates pass | No |
| Simulator-complete | iOS Simulator Safari matrix passes | No |
| Release-complete | Physical iPhone Safari matrix and all automated gates pass | Yes |

No automated browser result may be described as “physical iPhone verified.”

## 6. Task ordering and commit discipline

Tasks 0–6 are strictly sequential because they define the core. Tasks 7–10
integrate donor groups in canonical order; each group must reach its visual
checkpoint before the next group edits shared leaf ports. Task 11 is one
atomic formal cutover. Tasks 12–14 are release closure.

Every implementation task follows this loop:

1. Add the failing test or gate.
2. Run the narrow command and record the expected failure.
3. Implement only that task.
4. Run the narrow command to green.
5. Run `pnpm -C app test` and `pnpm -C app typecheck`.
6. Run the frozen-input check.
7. Review the diff for duplicate authority and unrelated changes.
8. Commit with the exact task commit message.

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

- [ ] **Step 0.1: Prove branch identity before any production edit**

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

- [ ] **Step 0.2: Record donor ancestry and immutable hashes**

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

- [ ] **Step 0.3: Run the executable baseline**

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

- [ ] **Step 0.4: Capture a read-only Unit 4–7A visual donor trace**

Use the existing old-route suite only as a visual donor recorder:

```bash
pnpm -C app exec playwright test \
  --config=playwright.release.config.ts \
  e2e/r5-phone-story.spec.ts \
  --project=mobile-webkit \
  --trace=on
```

Record the trace path and SHA-256 in the baseline report. Extract reference
frames for the 16 holds, Figure2 staged endpoint, Figure3/TTG/PH/Crane initial
and terminal endpoints, and Proof → Brand. Label known AOD/coverage/Hero
failures rather than normalizing them into the target.

This trace answers “did the clean runtime change an accepted scene?” It is not
release evidence and does not prove physical Safari stability.

- [ ] **Step 0.5: Record the initial file/authority inventory**

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

- [ ] **Step 0.6: Add a frozen-input command to the report**

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

- [ ] **Step 0.7: Commit the baseline report**

```bash
git add docs/react-refactor/reports/r5-phone-clean-runtime-baseline.md \
  docs/superpowers/plans/2026-07-30-r5-phone-clean-runtime-convergence.md
git commit -m "docs(r5): lock clean phone convergence baseline"
```

**Task 0 acceptance:**

- branch and worktree match this plan;
- all four donors are ancestors of `9652fbe`;
- baseline tests/typecheck/build pass;
- immutable hashes and phone bundle bytes are recorded;
- no production source has changed.

---

## Task 1: Port only proven cross-cutting rendering contracts

This task does not import a later runtime. It ports small, reviewed rendering
and verification behavior into the clean base.

**Create:**

- `app/src/runtime/semantic-data-attribute.ts`
- `app/src/runtime/semantic-data-attribute.test.ts`
- `app/scripts/verify-boolean-data-contract.mjs`
- `app/scripts/verify-boolean-data-contract.test.mjs`
- `app/scripts/verify-phone-packed-alpha-masters.mjs`

**Modify only as required by the reviewed hunks:**

- `app/src/components/TextReveal.tsx`
- `app/src/media/packed-alpha-video.ts`
- `app/src/media/packed-alpha-video.test.ts`
- `app/src/production/StoryNav.tsx`
- `app/src/production/global-assets.test.ts`
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
- any old phone lifecycle file;
- frozen story/media inputs.

- [ ] **Step 1.1: Audit the donor patch instead of applying it**

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

- [ ] **Step 1.2: Write the semantic-boolean RED tests**

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
element.dataset.ready = String(maybeUndefined)
```

and pass on:

```tsx
data-ready={semanticBoolean(ready)}
element.dataset.ready = semanticBoolean(ready)
```

Run:

```bash
pnpm -C app exec vitest run src/runtime/semantic-data-attribute.test.ts
node --test app/scripts/verify-boolean-data-contract.test.mjs
```

Expected: RED before helper/gate implementation.

- [ ] **Step 1.3: Port semantic booleans to actual consumers**

Use `semanticBoolean()` only for semantic boolean attributes. Do not convert
identifiers, phases, counts, or optional descriptive attributes. The gate must
scan built production source, not merely a hand-maintained file list.

- [ ] **Step 1.4: Port packed-alpha resource retirement**

From `82a4e68`, port the behavior equivalent to:

```ts
releasePackedAlphaWebGlContext(gl: WebGLRenderingContext): void
renewPackedAlphaCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement
```

Acceptance behavior:

- compositor disposal cancels `requestVideoFrameCallback` and RAF;
- GL texture, buffer, program, and shaders are deleted;
- `WEBGL_lose_context` is requested when available;
- a retired Canvas backing store is not silently reused as a valid frame;
- reactivation uses a renewed Canvas/backing context;
- no failure path reports `onFrame`.

Add a test for repeated activate → dispose → activate and context-loss
cleanup.

- [ ] **Step 1.5: Port shared rendering fixes by path/hunk**

Port the applicable semantic data-attribute, ink lifecycle, radial intro,
staged handoff, vendor typing, global typography, and rendering corrections
from `82a4e68`. Do not port its parent runtime behavior. Do not port a Hero CSS
hunk into the old phone tree; apply that reviewed declaration when Hero moves
to its canonical leaf in Task 7.

- [ ] **Step 1.6: Add packed-master verification**

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

- [ ] **Step 1.7: Run focused and global verification**

```bash
pnpm -C app exec vitest run \
  src/runtime/semantic-data-attribute.test.ts \
  src/media/packed-alpha-video.test.ts \
  src/transitions/shared/radialInkIntro.test.ts \
  src/transitions/shared/sceneInk.lifecycle.test.ts
node --test app/scripts/verify-boolean-data-contract.test.mjs
pnpm -C app run verify:boolean-data
pnpm -C app run verify:phone-packed-alpha
pnpm -C app test
pnpm -C app typecheck
pnpm -C app build
git diff --exit-code 9652fbe -- \
  assets app/scripts/homepage-media-contract.mjs app/src/story/timings.ts \
  app/src/story/copy.ts app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts app/src/story/spine.ts app/src/story/media.ts
```

- [ ] **Step 1.8: Review provenance and commit**

`git diff` must show no lifecycle code copied from `18b6a7c`, no Vite property
mangling, and no generated field registry.

```bash
git add app/package.json app/scripts app/src
git commit -m "fix(r5): port clean rendering contracts"
```

**Task 1 acceptance:**

- semantic boolean and packed-alpha lifecycle gates pass;
- later rendering fixes are traceable by exact source hunk;
- no post-`9652fbe` orchestration entered the branch;
- frozen inputs remain byte-identical.

---

## Task 2: Add architecture, complexity, and chunk-contract gates first

**Create:**

- `app/scripts/verify-phone-clean-architecture.mjs`
- `app/scripts/verify-phone-clean-architecture.test.mjs`

**Modify:**

- `app/package.json`
- `app/scripts/verify-homepage-module-boundaries.mjs`
- `app/scripts/verify-homepage-module-boundaries.test.mjs`
- `app/scripts/verify-performance-budgets.mjs`

- [ ] **Step 2.1: Write fixture-driven RED tests**

Use Node's test runner and temporary fixture directories. The tests must prove
the gate rejects:

1. two `createPhoneStoryRuntime()` call sites;
2. `PhoneBrandLabStory` calling the factory;
3. a leaf importing `runtime.ts`;
4. `runtime.ts` importing a scene or transition leaf;
5. `manifest.ts` importing React or DOM-bearing modules;
6. a dependency cycle in the eight-file core;
7. a ninth production file under `phone-story/`;
8. a forbidden `runtime/` or `contracts/` subtree;
9. property-name mangling in Vite/Terser config;
10. a formal loader importing the QA shell;
11. a numbered phone validation query or production query composition;
12. core LOC over budget;
13. old orchestration reachable in cutover mode;
14. a dynamic phone chunk that imports its own lifecycle owner.
15. the clean phone core importing `useMobileLandscapeEntry` or mounting a
    second orientation lifecycle owner.

It must accept:

- one factory call in `PhoneStoryShell`;
- QA wrapper importing the same shell;
- lazy leaf imports expressed through `scenes.tsx`/`transitions.tsx`;
- ordinary ESM minification without property mangling.

Run and confirm RED:

```bash
node --test app/scripts/verify-phone-clean-architecture.test.mjs
```

- [ ] **Step 2.2: Implement the gate with the TypeScript compiler API**

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

- exact eight production core files;
- exactly one production factory call;
- formal graph excludes QA;
- `app/src/production/phone/` no longer exists;
- `app/src/production/portrait-spike/` no longer exists;
- no legacy `validationMode`, `?v=`, `portrait-spike-motion`,
  `loadPhoneLabContactShell`, or `PhoneBrandLabScope`;
- no old phone orchestration import from a canonical leaf;
- phone bundle cap remains unchanged.

- [ ] **Step 2.3: Wire gates into scripts**

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

- [ ] **Step 2.4: Lock the immutable bundle cap**

`verify-performance-budgets.mjs` must retain:

```text
phone JavaScript hard cap = 663,552 bytes
clean target = no more than 628,044 bytes
```

The hard cap is a build failure. Until old orchestration is deleted, the clean
target may be reported but not enforced against the temporary harness bundle.
Cutover mode enforces both.

- [ ] **Step 2.5: Verify and commit**

```bash
node --test app/scripts/verify-phone-clean-architecture.test.mjs
node --test app/scripts/verify-homepage-module-boundaries.test.mjs
pnpm -C app run verify:phone-architecture
pnpm -C app test
pnpm -C app typecheck
pnpm -C app build
git diff --exit-code 9652fbe -- \
  assets app/scripts/homepage-media-contract.mjs app/src/story/timings.ts \
  app/src/story/copy.ts app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts app/src/story/spine.ts app/src/story/media.ts
git add app/package.json app/scripts
git commit -m "test(r5): enforce clean phone architecture"
```

**Task 2 acceptance:**

- architecture failures are tested with fixtures;
- the gate parses a real import/call graph;
- harness and cutover modes have distinct, explicit rules;
- the cap and no-property-mangle decision are executable.

---

## Task 3: Declare the complete phone manifest before rendering

**Create:**

- `app/src/production/phone-story/manifest.ts`
- `app/src/production/phone-story/manifest.test.ts`

- [ ] **Step 3.1: Write completeness and invariants tests**

Tests must assert:

- exactly 16 unique scene IDs in canonical order;
- exactly 15 unique segment IDs connecting every adjacent pair;
- every segment has forward and reverse descriptors;
- every hold has checkpoint, edge surface, plane, landing, content proof,
  frame proof, navigation target, reduced-motion policy, and direct-entry
  policy;
- every segment has source, target, timing reference, effect placement,
  prepare policy, terminal evidence, rollback policy, and input boundary;
- all timing values come from named canonical timing exports;
- all `between`/`above-both` placements match Section 2.2;
- all opaque edge colors match Section 2.1;
- direct-entry aliases resolve to one canonical scene;
- no React, CSS, DOM, dynamic import, mutable module state, or runtime import is
  present.

Run and confirm RED:

```bash
pnpm -C app exec vitest run src/production/phone-story/manifest.test.ts
```

- [ ] **Step 3.2: Implement descriptive manifest records**

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
for IDs and common port/report types to live here because this is the
dependency root; it is not acceptable for lifecycle functions or mutable
registries to live here.

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

- [ ] **Step 3.3: Add direct-entry and adjacency selectors**

Pure exports should include:

```ts
phoneSceneById(id)
phoneSegmentBetween(source, target)
phoneEntryForLocation(pathname, hash)
phoneAdjacentTarget(scene, direction)
selectPhoneEdgeSurface(snapshot, manifest)
selectPhoneCheckpoint(snapshot, manifest)
selectPhoneNavigationScene(snapshot, manifest)
phoneManifestIntegrity()
```

Hash parsing must normalize known historical aliases once. Runtime must never
contain another scene switch table.

- [ ] **Step 3.4: Verify no timing/media drift**

```bash
pnpm -C app exec vitest run src/production/phone-story/manifest.test.ts
pnpm -C app run verify:phone-architecture
pnpm -C app test
pnpm -C app typecheck
git diff --exit-code 9652fbe -- \
  assets app/scripts/homepage-media-contract.mjs app/src/story/timings.ts \
  app/src/story/copy.ts app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts app/src/story/spine.ts app/src/story/media.ts
```

- [ ] **Step 3.5: Commit**

```bash
git add app/src/production/phone-story
git commit -m "feat(r5): declare canonical phone story manifest"
```

**Task 3 acceptance:**

- one exhaustive manifest describes all holds, segments, directions, landings,
  edge surfaces, proof rules, and entries;
- runtime and leaves will not need their own story-order switch tables;
- architecture gate remains green.

---

## Task 4: Implement the pure reducer and one route-local runtime

**Create:**

- `app/src/production/phone-story/runtime.ts`
- `app/src/production/phone-story/runtime.test.ts`

No React, CSS, scene, transition, or QA file may be imported.

- [ ] **Step 4.1: Build a deterministic test environment**

In `runtime.test.ts`, create in-memory ports for:

```text
clock and monotonic IDs
timeout and RAF queues
window/visualViewport event subscriptions
scene and transition module loading
presentation plane apply/verify
scroll command and confirmation
history/hash observation
snapshot publication
media/playback reports
```

The fixture must expose explicit methods such as:

```ts
clock.advance(ms)
clock.flushAnimationFrames(count)
ports.resolveScene(id)
ports.rejectScene(id, error)
ports.reportFrame(identity, frame)
ports.reportPlaneApplied(identity, revision)
ports.reportCoverage(identity, coverage)
ports.reportScroll(identity, scroll)
ports.dispatchPhysicalIntent(intent)
```

Do not make tests wait on wall-clock time.

- [ ] **Step 4.2: Write the RED boot/direct-entry matrix**

For every one of the 16 scene IDs:

- request initial/hash/menu/history entry;
- assert only that target module is prepared;
- withhold each evidence item in turn and assert Loader release/stable commit
  does not occur;
- provide the complete same-identity quorum;
- assert one stable commit whose scene/landing/plane/content/frame/coverage/
  scroll evidence and derived edge/checkpoint/navigation all agree;
- send a stale event from the prior generation and assert it is ignored.

Also cover:

- unknown hash normalizes through the manifest;
- target boot failure starts a newly identified Hero fallback;
- Hero fallback failure remains booting and exposes retry;
- retry creates a new generation and cannot accept old reports;
- successful entry changes history once at stable commit;
- boot fallback canonicalizes to Hero;
- failed `popstate`/hash entry restores the committed source URL only after
  rollback proof.

Run and confirm RED:

```bash
pnpm -C app exec vitest run src/production/phone-story/runtime.test.ts
```

- [ ] **Step 4.3: Write the RED 15 × 2 transaction matrix**

For every segment in both directions, assert:

```text
stable(source)
→ preparing
→ presenting-source
→ playing
→ every declared staged stop/dwell or leg-intent boundary
→ presenting-target
→ aligning
→ verifying
→ stable(target)
```

At every phase:

- the source committed plane remains the rollback anchor;
- the target is not published as stable;
- candidate edge/checkpoint/navigation never leak to the committed snapshot;
- a report from wrong authority/transaction/generation/revision/direction/leg
  is rejected;
- progress is monotonic within the active direction;
- completion without target frame/content/coverage/scroll cannot commit.

For Figure2 distance expansion, TTG → Lab, and PH → Education, visit every
canonical stage stop in forward and reverse order, honor the exact delay/leg
durations from `timings.ts`, and prove that a dwell timer never marks a frame
or stable target. If a canonical policy declares gesture advancement, require
a new physical epoch for that leg without creating a second transaction.

Reduced motion must use the same transaction:

```text
stable(source)
→ preparing
→ presenting-target
→ target static frame proven
→ aligning
→ verifying
→ stable(target)
```

It skips animated sampling only; it does not skip proof.

- [ ] **Step 4.4: Write failure and rollback RED tests**

Inject failure separately at:

```text
scene chunk load
transition chunk load
target mount
content proof
media preparation
first frame
playback
plane application
coverage verification
landing measurement
scroll confirmation
post-paint acknowledgement
watchdog expiration
```

For each failure:

- enter `rolling-back`;
- abort target effects;
- reject late target reports;
- reapply and prove the last committed source plane;
- restore and confirm source landing;
- return to `stable(source)`;
- release claimed input exactly once;
- allow a clean retry with a new generation.

Add the `e883784` prepare-failure scenarios as behavioral donors only; rewrite
them against the clean reducer rather than copying its runtime.

- [ ] **Step 4.5: Write physical-input epoch RED tests**

Cover wheel, touch, pointer, and keyboard:

- one physical epoch can claim at most one adjacent cinematic segment;
- threshold crossing starts one transaction;
- momentum/tail input from that epoch cannot chain into the next segment;
- opposite-direction input during a transaction cannot start a second run;
- native reading corridors pass through without `preventDefault`;
- a cinematic boundary claims input only when manifest adjacency matches;
- Contact controls, links, focus, form interaction, and text selection remain
  native;
- visibility change, direct entry, stable commit, rollback, and disposal clear
  pending intent;
- a scroll event caused by the runtime's own scroll command cannot be
  reinterpreted as user intent.

Also cover viewport lifecycle:

- visual-viewport toolbar samples update coverage without resetting progress;
- orientation/width invalidation during playback rolls back against fresh
  geometry;
- unsupported geometry derives an input-disabled warning from the same
  snapshot;
- returning to supported geometry re-proves the committed plane before input;
- no orientation hook or gate owns another current scene/lock.

- [ ] **Step 4.6: Implement one reducer and one effect interpreter**

Keep pure and impure responsibilities visibly separated inside `runtime.ts`:

```text
types and identity guards
pure selectors
reducePhoneStory()
commitStableCandidate() — exactly one branch
effect descriptions
route-local effect interpreter/factory
browser environment adapter
```

The active runtime connection owns:

- physical input and history/hash/visibility/viewport subscriptions;
- story transaction RAF/timeout scheduling;
- AbortControllers and generation invalidation;
- source/target module preparation;
- progress sampling and terminal settle;
- scroll commands and one bounded correction;
- snapshot publication and disposal.

Renderers may use local media callbacks only to draw and report. They may not
schedule story completion or stable commit.

- [ ] **Step 4.7: Prove deterministic disposal**

Tests must assert:

- every listener is removed;
- every timer and RAF is canceled;
- every AbortController is aborted;
- prepared leaf resources receive `dispose`;
- snapshot subscribers are released;
- a disconnected authority ignores all subsequent callbacks;
- React StrictMode connect → disconnect → reconnect leaves one active
  authority, not a retained global object.

The only allowed process-global caches are immutable ESM loader promises and a
Document-keyed render-resource pool that has no story state. Module-level
authority counters, refresher `Set`s, current-document state, and lifecycle
`WeakMap`s are forbidden.

- [ ] **Step 4.8: Run focused, mutation, and global checks**

```bash
pnpm -C app exec vitest run src/production/phone-story/runtime.test.ts
pnpm -C app run verify:phone-architecture
pnpm -C app test
pnpm -C app typecheck
pnpm -C app build
git diff --exit-code 9652fbe -- \
  assets app/scripts/homepage-media-contract.mjs app/src/story/timings.ts \
  app/src/story/copy.ts app/src/story/canonical-spine.ts \
  app/src/story/manifest.ts app/src/story/spine.ts app/src/story/media.ts
```

Before committing, deliberately invert one identity check and one quorum bit
in a local diff, confirm tests fail, then restore them. Record those two
mutation checks in the commit body.

- [ ] **Step 4.9: Commit**

```bash
git add app/src/production/phone-story/runtime.ts \
  app/src/production/phone-story/runtime.test.ts
git commit -m "feat(r5): centralize phone transaction authority"
```

`connect()` installs one active authority and returns its complete disconnect
function. It must support React StrictMode effect replay as a strict sequence:
connect A → disconnect A → connect B, with different authority IDs and no
overlap. The route-local runtime value itself retains no listeners or render
resources while disconnected. Each connection resets to a fresh `booting`
snapshot for the same explicit entry before accepting reports.

**Task 4 acceptance:**

- all 16 boot/direct entries and all 30 segment directions use one reducer;
- one stable-commit branch requires the complete same-identity quorum;
- all failure phases visibly roll back and unlock;
- physical input and disposal have one owner;
- no browser or visual leaf import entered `runtime.ts`.

---

## Task 5: Implement one atomic presentation and viewport projector

**Create:**

- `app/src/production/phone-story/presentation.ts`
- `app/src/production/phone-story/presentation.test.ts`
- `app/src/production/phone-story/styles.css`

- [ ] **Step 5.1: Write RED tests for the semantic layer plan**

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
- a plane revision assembled from two transaction identities.

Visual transition planes must not duplicate the interactive/accessibility
tree: non-committed visual endpoints are inert and `aria-hidden`, while the
one stable native reading subtree owns focus and interaction.

- [ ] **Step 5.2: Write RED viewport and coverage tests**

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

- [ ] **Step 5.3: Write RED content/frame proof tests**

Content proof must require:

- target root is connected;
- every required selector resolves within that registered target;
- each required element has a non-empty rect intersecting the live visual
  viewport;
- computed visibility, display, opacity, clip, and occluding layer checks pass;
- the proof belongs to the current presentation revision.

Frame proof policies:

| Policy | Valid evidence |
| --- | --- |
| `static-post-paint` | required content/media ready, plane applied, runtime-scheduled post-paint verification |
| `image-decode-paint` | every required image `decode()` resolved, then post-paint verification |
| `canvas-draw` | successful draw callback for the active token, then plane verification |
| `packed-canvas-draw` | compositor returned/delivered a real draw for active video frame and active token |
| `decoded-composite-frame` | decoded source frame and successful compositor presentation for active token |

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

- [ ] **Step 5.4: Implement the route-local projector**

The API should remain narrow:

```ts
export type PhonePresentation = Readonly<{
  attachRoot(root: HTMLElement): () => void;
  registerSurface(registration: PhoneSurfaceRegistration): () => void;
  registerEffect(registration: PhoneEffectRegistration): () => void;
  sampleLayoutViewport(): PhoneLayoutViewport;
  sampleVisualViewport(): PhoneVisualViewport;
  applyPlane(request: PhonePlaneRequest): PhonePlaneApplyResult;
  verifyCandidate(request: PhoneCandidateProofRequest): PhoneCandidateProof;
  verifyRollback(request: PhoneRollbackProofRequest): PhoneRollbackProof;
}>;

export function createPhonePresentation(
  dependencies: PhonePresentationDependencies
): PhonePresentation;
```

`presentation.ts` owns calculation, registration, DOM application, and
verification policy. Runtime owns when sampling/application occurs and owns
global subscriptions/RAF scheduling.

The cleanup returned by `attachRoot()` clears the root and all registrations
for that connection. A later StrictMode attach starts empty; no module-global
registry or detached DOM reference may survive.

- [ ] **Step 5.5: Establish one fixed topology before Loader exit**

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

- [ ] **Step 5.6: Make Hero zero synchronous**

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

- [ ] **Step 5.7: Verify and commit**

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

## Task 6: Wire the clean shell, lazy leaf ports, and fail-closed Loader

**Create:**

- `app/src/production/phone-story/PhoneStoryShell.tsx`
- `app/src/production/phone-story/PhoneStoryShell.test.tsx`
- `app/src/production/phone-story/scenes.tsx`
- `app/src/production/phone-story/transitions.tsx`

**Modify:**

- `app/src/production/StoryLoader.tsx`
- `app/src/production/StoryLoader.test.tsx`

Formal `/` still imports the old `production/phone/PhoneStoryShell` after this
task. The clean shell is unit-tested but not yet a production route.

- [ ] **Step 6.1: Write RED shell-ownership tests**

Mock `scenes.tsx` and `transitions.tsx` with deterministic leaves. Tests must
prove:

- the shell is the only source call site of `createPhoneStoryRuntime`;
- one mounted shell has one current runtime and one presentation object;
- StrictMode's discarded mount is disposed before the live mount owns input;
- rerendering a snapshot does not recreate runtime;
- a keyed formal ↔ QA route remount disconnects the old authority before
  constructing the next route-local object;
- hash/menu/history entry inside one mounted route uses `requestEntry()` and
  does not recreate runtime;
- unmount removes all listeners/resources;
- shell uses `useSyncExternalStore` or equivalent immutable subscription and
  does not mirror machine fields into independent React state;
- scenes/effects receive identity-bound leaf ports, not runtime dispatch;
- missing/rejected lazy leaves report prepare failure and roll back;
- nested lazy boundaries always render an opaque Loader or the last committed
  plane, never `fallback={null}`.

- [ ] **Step 6.2: Make StoryLoader phone-safe without forking it**

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

- [ ] **Step 6.3: Implement typed lazy registries**

`scenes.tsx` and `transitions.tsx` contain:

- typed `import()` functions for genuine leaves;
- rendering components that bind an active identity to the narrow port;
- module-promise caching only;
- no reducer, listener, current scene, checkpoint, timer, or stable state.

During Tasks 6–10 the registries may be typed
`Partial<Record<PhoneSceneId, PhoneSceneLoader>>` and
`Partial<Record<PhoneSegmentId, PhoneTransitionLoader>>` because the clean
shell is not on formal `/`. Missing entries must fail closed. The Task 11
cutover gate rejects partial/incomplete registries.

Chunk rule:

```text
PhoneStoryShell + manifest + runtime + presentation = one execution core
scene and transition implementations = lazy leaves
```

Do not dynamically import `manifest.ts`, `runtime.ts`, `presentation.ts`, a
port type, or an authority helper.

- [ ] **Step 6.4: Implement the shell topology**

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
}>;
```

`scope` may label diagnostics and select the explicit initial entry. It uses
the same active-window mounting algorithm and may not select a reducer, timing
table, projector, input policy, media policy, subtree policy, or lifecycle
callback.

The clean shell may render an orientation warning selected from the runtime
snapshot, but it must not import `useMobileLandscapeEntry` or create a second
gate/store. The stable desktop shell may keep its existing mobile-landscape
behavior unchanged.

- [ ] **Step 6.5: Prove no new authority entered lazy chunks**

```bash
rg -n "runtime|dispatch|addEventListener|currentScene|checkpoint|setTimeout|requestAnimationFrame" \
  app/src/production/phone-story/scenes.tsx \
  app/src/production/phone-story/transitions.tsx
```

Every match must be a type/comment/import-loader false positive that the
architecture gate permits. There must be no import of `./runtime`.

- [ ] **Step 6.6: Verify and commit**

```bash
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
  app/src/production/phone-story
git commit -m "feat(r5): wire one clean phone story shell"
```

**Task 6 acceptance:**

- exactly one production runtime factory call site exists;
- Loader cannot time out into unproven pixels;
- core modules are eager together and only visual leaves are lazy;
- clean shell remains unreachable from formal `/`;
- absent leaves fail closed without creating a compatibility lifecycle.

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

This allows one visual implementation to serve both migration paths without
duplicating accepted scenes or allowing the new core to import the old
lifecycle.

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

- [ ] **Step 7.1: Move the accepted visuals, not their authority**

Use the `9652fbe` Front files as the visual donor. Preserve:

```text
Hero composition and text
Pattern renderer and accepted geometry
Star Map camera/mask
AOD assets and authored progress
Hero → Pattern, Pattern → Star, Star → AOD ink direction/seeds
AOD → Method effect placement
```

Remove from genuine leaves:

- imports of old phone runtime/types/adapters;
- global document lifecycle dispatch;
- physical input ownership;
- current scene/checkpoint/edge writes;
- scene-controlled stable or Loader state;
- transition-controlled transaction timing.

Move the existing pure `phoneMediaUrlFor()` ownership/URL resolver to
`app/src/media/phone-media.ts`, retaining `app/src/story/media.ts` as the
immutable identity/owner source. Update both migration and clean imports
directly; do not leave a final re-export at the old path.

Convert transitions to prepared, paused renderers:

```ts
type PhoneTransitionLeaf = Readonly<{
  prepare(port: PhoneLeafPort): Promise<void>;
  render(progress: number): void;
  settle(endpoint: 0 | 1): void;
  dispose(): void;
}>;
```

The runtime owns progress/time; the leaf owns only visual sampling.

- [ ] **Step 7.2: Create the DEV-only clean harness**

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

- [ ] **Step 7.3: Add real stacking-context and pixel helpers**

`r5-phone-clean-assertions.ts` must provide:

```ts
assertSinglePhoneAuthority(page)
readPresentationRevision(page)
assertLayerOrderAtPoints(page, points, expectedRoles)
assertOpaqueViewportEdges(page, expectedColor, tolerance)
assertTargetContentVisible(page, selectors)
assertNoIntermediateWhiteOrBlackFrame(frameSeries, policy)
waitForStableRevision(page, sceneId, afterRevision)
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

- [ ] **Step 7.4: Reproduce Hero flash before declaring the fix**

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

Port the reviewed Hero font declaration from `82a4e68` into the new canonical
Hero CSS, not the old path.

- [ ] **Step 7.5: Reproduce Pattern bottom/right exposure**

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

- [ ] **Step 7.6: Make AOD frame proof causal and fail fast**

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

Remove any assertion where “still preparing after 500 ms” counts as success.
Add tests that cross the old six-second watchdog boundary.

- [ ] **Step 7.7: Enforce all four global gates on every Front hold/segment**

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

- [ ] **Step 7.8: Run Front unit and browser checkpoints**

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
VITE_ENABLE_HARNESS=1 pnpm -C app build
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

- [ ] **Step 7.9: Freeze visual evidence and commit**

Store only intentional Playwright baselines/evidence in the repository's
existing snapshot convention. Do not commit transient videos/traces unless
the report links them as required acceptance evidence.

```bash
git add app
git commit -m "feat(r5): converge Front and AOD on clean runtime"
```

**Task 7 acceptance:**

- the known Hero flash, Pattern edge exposure, and AOD silent lock each has a
  failing-before/green-after browser regression;
- the clean harness uses the real shell and one authority;
- no scene-specific coverage concealment exists;
- AOD readiness is causally tied to a real compositor draw;
- formal old authority remains operational through stateless migration bridges.

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

- `app/src/production/phone-story/scenes.tsx`
- `app/src/production/phone-story/transitions.tsx`
- `app/e2e/r5-phone-clean-runtime.spec.ts`
- `app/e2e/r5-phone-clean-presentation.spec.ts`
- existing Grade A adapter/module-loader files only for the stateless
  migration bridge

- [ ] **Step 8.1: Freeze Unit 4 visual contracts before refactor**

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

- [ ] **Step 8.2: Refactor Method/Figure2/Proof to narrow ports**

Scene leaves:

- render the accepted component;
- register their root and media surfaces;
- accept active identity/progress/media commands;
- report mount/content/frame/failure;
- dispose local rendering resources.

They may not:

- infer story phase from scroll position;
- set global checkpoint/edge/navigation;
- own Loader release;
- dispatch to the old coordinator;
- install physical input listeners.

- [ ] **Step 8.3: Preserve the Figure2 compositor and depth contracts**

Require:

- exact packed master hash;
- one decoded source and one visible compositor surface;
- Figure2 architecture/figures retain the accepted binary depth ownership;
- the retained foreground arch remains outside the depth mask;
- no horizontal figure wipe or secondary dark ownership band is reintroduced;
- `onFrame` is emitted by the successful active Canvas draw;
- reverse endpoint proof uses the actual terminal/initial frame, not a seek
  command or dataset.

- [ ] **Step 8.4: Make Figure2 coverage global, not local**

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

- [ ] **Step 8.5: Complete AOD → Method and Proof → Brand transactions**

For forward and reverse:

- AOD remains visible until Method content/landing is proven;
- `aod-method-top` effect is between source and receiver;
- Method native reading passes through;
- Method boundary claims exactly one intent into Figure2;
- Figure2 near/distance is one transaction family, not a sub-machine;
- Proof is not stable until its opening title is visible;
- Proof → Brand uses the declared above-both effect and cannot reveal empty
  Brand paper.

- [ ] **Step 8.6: Add direct-entry first-exposed-frame tests**

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

- [ ] **Step 8.7: Run Unit 4 checkpoints**

```bash
pnpm -C app exec vitest run \
  src/production/phone-story \
  src/scenes/method-top/phone \
  src/scenes/figure2-animation/phone \
  src/scenes/figure2-proof/phone \
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

- [ ] **Step 8.8: Commit**

```bash
git add app
git commit -m "feat(r5): converge Unit 4 Grade A chain"
```

**Task 8 acceptance:**

- Front through Brand is one reducer path;
- Unit 4 visual/media/timing contracts remain frozen;
- Figure2 has real-frame and four-edge proof in both directions;
- all Grade A direct entries expose target content first;
- no Figure2/Method/Proof sub-machine remains in genuine leaves.

---

## Task 9: Integrate Group 4–5 without losing Unit 7A endpoints

**Modify genuine scene leaves:**

- `app/src/scenes/brand/phone/PhoneBrand.tsx`
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

- [ ] **Step 9.1: Freeze the accepted Group 4–5 endpoints**

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

- [ ] **Step 9.2: Remove Group 4–5 lifecycle imports from genuine leaves**

The following imports must be absent after refactor:

```text
production/phone/adapter-groups/group4-5
production/phone/adapter-groups/group4-5-native-autoplay
production/phone/phone-lab-contact-timeline
production/phone/phone-native-autoplay
production/phone/phone-presented-reverse-playback
```

Replace lifecycle callbacks with the manifest-defined command/report port.
Media/compositor helpers may remain scene-local when they only draw and report
the active token.

- [ ] **Step 9.3: Preserve persistent compositor semantics**

For Figure3 and TTG:

- prepare the target endpoint without exposing it;
- runtime commands forward/reverse progress;
- one visible compositor surface persists through its declared segment;
- terminal settle is confirmed by decoded/composited frame evidence;
- reverse starts from a proven terminal endpoint;
- decoder/context retirement occurs only after committed plane retirement;
- stale draw callbacks cannot prove a new generation.

Do not replace the accepted compositor with a poster, screenshot, hidden
pre-play, or seek-only proof.

- [ ] **Step 9.4: Prove two full Group 4–5 cycles**

Browser tests must execute:

```text
Brand → Figure3 → Services → TTG → Lab
Lab → TTG → Services → Figure3 → Brand
repeat both directions once more without reload
```

At every hold assert:

- one authority;
- stable revision increments exactly once;
- target frame/content/coverage/landing/edge agree;
- input is free;
- decoder/Canvas counts do not grow on the second cycle.

- [ ] **Step 9.5: Test direct entries and failure recovery**

Cold entries:

```text
#brand
#figure3-animation
#services
#ttg-animation
#lab
```

Faults:

```text
Figure3 chunk delayed/rejected
Figure3 initial or terminal frame withheld
Services content hidden
TTG decoded frame withheld
visibility background/foreground during Figure3 and TTG
reverse requested immediately after terminal settle
```

Every failure rolls back or remains under Loader; none may publish paper-only
or content-empty stable state.

- [ ] **Step 9.6: Run Group 4–5 checkpoints**

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

- [ ] **Step 9.7: Commit**

```bash
git add app
git commit -m "feat(r5): converge Group 4-5 presentation lifecycle"
```

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

- [ ] **Step 10.1: Freeze Unit 6 visual/media contracts**

Before refactor, assert:

```text
PH packed hash, crop, initial frame, terminal frame
Education title/lead and native landing
Crane figure/flock hashes, crop, initial frame, terminal frame
Contact title/content and interactive controls
Lab → PH, PH → Education, Education → Crane, Crane → Contact placement
forward/reverse compositor behavior
```

Use `ab7353e` and `9652fbe` as production donors. Later branches may donate
tests/failure cases only.

- [ ] **Step 10.2: Remove Group 6–7 lifecycle imports from genuine leaves**

The following imports must be absent:

```text
production/phone/types
production/phone/phone-native-autoplay
production/phone/phone-lab-contact-timeline
production/phone/phone-presented-reverse-playback
production/phone/phone-media
production/phone/scenes/phone-packed-alpha-surface
```

Use canonical media resolution and
`app/src/media/phone-packed-alpha-surface.ts`. The leaf reports real draw,
progress, complete, and failure through its active port.

- [ ] **Step 10.3: Preserve PH/Crane reverse compositors**

For both PH and Crane:

- reverse may start only from a proven terminal frame;
- runtime commands reverse progression;
- packed compositor draw proves each active endpoint;
- no setTimeout fallback can mark the endpoint ready;
- background/foreground and lock/unlock invalidate stale tokens;
- Canvas/context retirement is deterministic;
- a second full round trip has the same decoder/Canvas/resource count.

Crane figure and flock remain separate authored media layers; unifying state
authority does not flatten their visual composition.

- [ ] **Step 10.4: Keep native corridors and Contact outside cinematic input**

Education is native reading until its declared boundary. Contact:

- never receives cinematic `preventDefault` for wheel/touch/key/pointer;
- keeps links, focus, selection, and controls interactive;
- is a real terminal stable commit with visible content and four-edge
  coverage;
- reverse from Contact claims only the declared Crane edge;
- direct `#contact` mounts no unnecessary earlier media and reveals Contact
  content on its first exposed frame.

- [ ] **Step 10.5: Prove the complete 16-hold story twice**

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
- same-identity stable quorum;
- correct effect placement;
- real frame policy;
- four-edge coverage;
- target content;
- endpoint continuity;
- input release;
- no listener/timer/decoder/Canvas growth.

- [ ] **Step 10.6: Run Group 6–7 and complete-story checkpoints**

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

- [ ] **Step 10.7: Commit**

```bash
git add app
git commit -m "feat(r5): converge Group 6-7 and Contact lifecycle"
```

**Task 10 acceptance:**

- all 16 holds and 15 segments run through one clean runtime in the harness;
- PH/Crane real-frame reverse behavior remains accepted;
- Contact stays native and direct-entry safe;
- two complete forward/reverse cycles show no resource growth;
- all genuine leaves are free of old phone lifecycle imports.

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
- `app/package.json`
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

- [ ] **Step 11.1: Make the registries exhaustive before routing**

Change `scenes.tsx` and `transitions.tsx` from partial to exhaustive records:

```ts
const sceneLoaders: Record<PhoneSceneId, PhoneSceneLoader> =
  defineExhaustivePhoneSceneLoaders();
const transitionLoaders: Record<PhoneSegmentId, PhoneTransitionLoader> =
  defineExhaustivePhoneTransitionLoaders();
```

Tests must fail compilation or manifest integrity when any of the 16/15 keys
is omitted, duplicated, or mapped to a module declaring the wrong ID.

- [ ] **Step 11.2: Implement the QA wrapper with no authority**

The entire behavior should be equivalent to:

```tsx
export function PhoneBrandLabStory() {
  return (
    <PhoneStoryShell
      scope="brand-lab"
      initialEntry={{
        kind: 'scene',
        sceneId: 'brand',
        source: 'qa-route'
      }}
      diagnostics
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

- [ ] **Step 11.3: Replace numbered/query compositions with two real routes**

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

`main.tsx` must not remove `#story-loader-static` merely because the pathname
is `/brand-lab` or non-root. `StoryLoader` removes the static cover in its
layout effect only after the React Loader exists in the same commit. A 404 may
remove it only after the visible 404 root is committed. This prevents the
static-cover → lazy-shell black gap on formal and direct QA entries.

- [ ] **Step 11.4: Rewrite preboot as presentation cover, not scene state**

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

- [ ] **Step 11.5: Delete the old authority and migration bridges**

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

The final command must list exactly the eight production files plus adjacent
test files when the test-name filter is not applied.

- [ ] **Step 11.6: Remove all final legacy imports from genuine leaves**

```bash
rg -n "production/phone/|production/portrait-spike/|PhoneSceneAdapter|PhoneTransitionAdapter|validationMode" \
  app/src/scenes app/src/transitions app/src/production/phone-story app/src/App.tsx app/src/main.tsx
```

Expected: no matches. Do not keep re-export shims.

- [ ] **Step 11.7: Switch build gate to cutover mode**

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

- [ ] **Step 11.8: Prove route/module isolation**

Test built output, not source strings only:

- loading desktop `/` does not fetch phone leaves;
- loading formal phone `/` fetches the clean execution core and adjacent
  leaves only;
- formal phone `/` never evaluates `PhoneBrandLabStory`;
- `/brand-lab` loads QA wrapper and the shared clean core;
- switching `/` → `/brand-lab` via a real navigation disposes the first route;
- the two routes never coexist in one mounted React root;
- no query string can select an obsolete shell.

- [ ] **Step 11.9: Run the atomic cutover suite**

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

- [ ] **Step 11.10: Review the deletion diff and commit atomically**

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
- exact eight-file production core and no compatibility wrapper remain;
- desktop runtime behavior is unchanged.

---

## Task 12: Close chunk, fault-injection, global presentation, and size gates

**Modify:**

- `app/scripts/verify-phone-clean-architecture.mjs`
- `app/scripts/verify-phone-clean-architecture.test.mjs`
- `app/scripts/verify-homepage-module-boundaries.mjs`
- `app/scripts/verify-performance-budgets.mjs`
- `app/scripts/verify-release-build.mjs`
- `app/e2e/r5-phone-clean-runtime.spec.ts`
- `app/e2e/r5-phone-clean-presentation.spec.ts`
- `app/e2e/r5-phone-story.spec.ts`
- `app/package.json`

- [ ] **Step 12.1: Gate the built synchronous core/chunk closure**

Inspect the Vite/Rollup output manifest. Assert:

- `PhoneStoryShell`, `manifest`, `runtime`, and `presentation` are in one
  synchronously reachable phone execution closure;
- none of those four is behind a runtime dynamic import;
- each scene/transition lazy edge resolves through an ordinary ESM export;
- no lazy leaf includes a second runtime/reducer/input owner;
- formal entry has no static or eager QA dependency;
- desktop entry has no eager phone leaf;
- no property names are mangled;
- no generated cross-chunk policy artifact exists.

The browser may emit more than one physical JS file for vendor sharing. The
contract is one synchronous execution closure with normal ESM bindings, not a
requirement to defeat safe Rollup vendor chunking.

- [ ] **Step 12.2: Test slow/rejected chunks without production query hooks**

Use Playwright network routing to:

- delay initial phone core;
- delay a target scene leaf;
- reject a target scene leaf;
- delay/reject a transition leaf;
- complete an old delayed response after retry created a new generation.

Assertions:

- static/React Loader or committed source stays opaque/visible;
- no black gap or target leak;
- rejected preparation rolls back;
- input unlocks after rollback;
- retry succeeds;
- stale late chunk cannot satisfy the new transaction.

Do not add a production fault query parameter.

- [ ] **Step 12.3: Test media/compositor faults globally**

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

- [ ] **Step 12.4: Run the global 16-hold/15-segment presentation matrix**

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
source endpoint visible until candidate ready
effect in declared semantic layer
receiver terminal endpoint visible at settle
no uncovered edge during progress
no target stable publish before quorum
rollback restores source pixels and input
```

Browser engine tests may programmatically vary viewport geometry to exercise
logic, but those tests are labeled engine evidence, not real mobile Safari
evidence.

- [ ] **Step 12.5: Enforce final production complexity**

The cutover architecture gate must report:

```text
production phone-story files = 8
runtime factory definitions = 1
runtime factory call sites = 1
reducers = 1
stable-commit branches = 1
global input owner = 1
viewport sampler = 1
presentation registry = 1
compatibility wrappers = 0
slice runtimes = 0
formal QA imports = 0
```

Enforce the per-file and 4,500-line core limits from Section 1.1. If a file
exceeds budget, stop and review the abstraction; do not bypass the gate or
create an unapproved ninth file.

- [ ] **Step 12.6: Enforce bundle size**

Run:

```bash
pnpm -C app build
```

Required:

```text
phone JavaScript ≤ 628,044 bytes
hard cap remains exactly 663,552 bytes
```

If the clean output is larger than the clean baseline:

1. inspect duplicate leaf/core code in the build manifest;
2. remove legacy/dead orchestration and duplicate helpers;
3. verify imports do not eagerly pull all leaves;
4. preserve normal ESM names.

Do not raise the cap, add property mangling, create a reserved-name registry,
or weaken the measurement.

- [ ] **Step 12.7: Run all automated closure gates**

```bash
node --test app/scripts/verify-phone-clean-architecture.test.mjs
node --test app/scripts/verify-homepage-module-boundaries.test.mjs
node --test app/scripts/verify-boolean-data-contract.test.mjs
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

- [ ] **Step 12.8: Commit**

```bash
git add app
git commit -m "test(r5): close phone runtime and presentation gates"
```

**Task 12 acceptance:**

- chunk failures cannot create black gaps or stale commits;
- all holds/segments share global content/frame/coverage/layer gates;
- exact structural and LOC budgets pass;
- phone JavaScript is no larger than clean baseline;
- Chromium/WebKit engine evidence is complete.

---

## Task 13: Run Simulator and physical iPhone release acceptance

This is the critical visual verification for which browser/device automation
is required. Unit tests and desktop Playwright are not substitutes.

**Create:**

- `docs/react-refactor/reports/r5-phone-clean-runtime-acceptance.md`

Do not change production code while recording a passing matrix. If a defect is
found, return to the responsible task, add a failing automated regression,
fix it, rerun all later gates, and start this matrix again on the new commit.

- [ ] **Step 13.1: Freeze the candidate identity**

Record:

```text
branch
candidate commit SHA
build/release ID
Node/pnpm versions
Chromium/WebKit versions
iOS Simulator model/runtime
physical iPhone model
physical iOS build
Safari version
network mode
reduced-motion setting
```

Build once from a clean worktree and test that exact artifact:

```bash
git status --short
pnpm -C app build
```

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
Required:

- static Loader → React Loader → target is visually continuous;
- Hero never appears completed before zero;
- no whole-stage flash/reset;
- no black/geometry-only gap;
- direct entry never exposes Hero/prior scene before target;
- Loader never exits on safety time without proof.

- [ ] **Step 13.5: Run physical iPhone media/lock recovery**

For AOD, Figure2, Figure3, TTG, PH, and Crane:

- enter forward and reverse;
- background for more than six seconds;
- foreground and continue;
- lock and unlock the phone;
- interrupt network/media once;
- retry;
- rotate and return;
- repeat on the second full traversal.

Required:

- real frame appears or transaction fails closed immediately/boundedly;
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
stable scene/revision
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
- the candidate may now be called Release-complete.

---

## Task 14: Final audit and handoff without merging

**Modify:**

- `docs/react-refactor/reports/r5-phone-clean-runtime-acceptance.md`
- this plan only to check completed boxes and record final SHAs

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

- [ ] **Step 14.2: Run the complete clean verification once more**

```bash
node --test app/scripts/verify-phone-clean-architecture.test.mjs
node --test app/scripts/verify-homepage-module-boundaries.test.mjs
node --test app/scripts/verify-boolean-data-contract.test.mjs
pnpm -C app run verify:boolean-data
pnpm -C app run verify:phone-packed-alpha
pnpm -C app run verify:phone-architecture:cutover
pnpm -C app test
pnpm -C app typecheck
pnpm -C app build
pnpm -C app run test:e2e
pnpm -C app run test:release
git diff --check
git status --short
```

Record exact test counts and build bytes. Do not reuse counts from Task 0.

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

- [ ] **Step 14.4: Ensure branch is handoff-ready**

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

- [ ] **Step 14.5: Commit final report bookkeeping if needed**

```bash
git add docs/react-refactor/reports/r5-phone-clean-runtime-acceptance.md \
  docs/superpowers/plans/2026-07-30-r5-phone-clean-runtime-convergence.md
git commit -m "docs(r5): close clean phone runtime convergence"
```

Do not merge, push, delete another worktree, or change the neighboring branch
without separate user authorization.

**Task 14 acceptance:**

- all automated and physical evidence is tied to final HEAD;
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
| `/brand-lab` cannot become another product runtime | thin wrapper, separate object, same shell | Tasks 2, 11 |
| chunk/property-name failures | synchronous core closure, normal ESM, no property mangle | Tasks 1, 2, 6, 12 |
| AOD locks | real compositor-draw proof, fail-fast rollback/retry | Tasks 4, 7, 12, 13 |
| Pattern/Figure2 white strip | one live-viewport coverage projector + screenshot pixels | Tasks 5, 7, 8, 12, 13 |
| Hero flashes/reset | synchronous zero + fixed topology + proven Loader handoff | Tasks 5, 7, 13 |
| effect is behind/above wrong layer | semantic layer manifest + actual stack/pixel checks | Tasks 3, 5, 7–12 |
| direct route shows blank/prior scene | Loader holds until target content/frame/plane quorum | Tasks 4–12 |
| momentum starts multiple transitions | one physical epoch/one intent owner | Tasks 4, 10, 13 |
| reverse compositor regresses | real endpoint proof and two full cycles | Tasks 9, 10, 13 |
| files keep multiplying | exact eight core files + LOC/dir gate | Tasks 2, 11, 12 |
| unit tests pass but real iPhone fails | separate engine/simulator/physical claim levels | Tasks 5, 12, 13 |

## Appendix C: Stop conditions

Stop execution and return for architecture review when any is true:

- a ninth core production file appears necessary;
- runtime/presentation/core LOC budget would be exceeded;
- a scene needs to read runtime state instead of receiving a port;
- a transition needs its own clock/transaction state;
- formal and QA appear to need different reducers/projectors;
- a visual fix proposes changing frozen media/timings/camera composition;
- a coverage fix is scene-specific;
- a frame proof cannot be causally tied to a real render;
- bundle target appears to require property mangling;
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
- [ ] one reducer and one branch commit stable presentation;
- [ ] one projector owns viewport, layers, content, frame, and plane proof;
- [ ] one runtime owns physical input, lifecycle time, rollback, and disposal;
- [ ] lazy leaves contain visual behavior only;
- [ ] formal and QA reuse implementation without sharing a live object;
- [ ] old phone/portrait-spike orchestration is deleted;
- [ ] clean production core contains exactly eight files and passes LOC limits;
- [ ] no property mangling, generated cross-chunk policy, compatibility
  wrapper, or numbered validation route remains;
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
- [ ] phone JS is at most 628,044 bytes and hard cap remains 663,552;
- [ ] full Vitest, typecheck, build, Chromium, and WebKit suites pass;
- [ ] iOS Simulator evidence is complete;
- [ ] physical iPhone Safari matrix passes on final HEAD;
- [ ] acceptance report records exact build, device, evidence, hashes, and
  final commit;
- [ ] worktree is clean and branch is handed off without an unauthorized
  merge.
