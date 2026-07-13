# R5 Candidate v3 Lifecycle And Release Gates Implementation Plan

Status: Tasks 0–6 are complete. Immutable v3 failed dirty-tree finalization. Immutable v4 passed exact identity-bound RSS/finalization, smokes, and rollback, then failed 2/44 final default E2E cases. Immutable v5 passed exact identity/RSS/finalization, smokes, rollback, and 44/44 default E2E, then failed 5/54 applicable release cases because stale TTG/AOD oracles contradicted the implemented terminal-still and retryable-static-hold contracts. Commit `5785ce5` closes those assertions. Candidate-v6 now repeats the immutable identity, RSS, rollback, and E2E-last sequence.

| Phase | Status | Commit(s) |
|---|---|---|
| Task 0 scope/rejection | complete | `a2467a2` |
| Task 1 timed abortable legs | complete | `02e367f` |
| Task 2 presented-frame contract | complete | `4aad428`, `eda0a2b`, `a125204`, `2d5296b`, `a71f491`, `35b26e0` |
| Tasks 3/5 two-phase commit and preparing reversal | complete | `72fb84a` |
| Task 4 Figure2 hold/depth Ink | complete | `6d4f0fc` |
| Task 6 schema-3 RSS upload gate | complete | `5fbed13` |
| Task 7 pre-freeze RSS headroom | complete | `00ceba1` |
| Task 7 v3 exact attempt | failed closed | RSS pass; tracked archive made finalizer reject dirty source |
| Task 7 release-runner closure | complete | `e71b970` |
| Task 7 immutable v4 identity/RSS/rollback | complete | source `905a4ef`; tag object `e3b3863`; RSS `1,423,048,704B`; rollback pass |
| Task 7 v4 final default E2E | failed closed | 42/44; release matrix not run |
| Task 7 v5 browser closure | complete | `6cde26d`; focused unit/integration 54/54 and browser 2/2 |
| Task 7 v5 repeated nonbrowser gate | complete | `e491e01`; 83 Vitest files / 568 tests plus lint, typecheck, build, release/static, budgets |
| Task 7 immutable v5 identity/RSS/rollback | complete | source `a97369d`; tag object `e3761e3`; RSS `1,475,641,344B`; manifest `40180fac`; rollback pass |
| Task 7 v5 final default E2E | complete | 44/44 |
| Task 7 v5 final release E2E | failed closed | 49/54 applicable pass; 42 declared skips; 5 stale-oracle failures |
| Task 7 v6 release-oracle closure | complete | `5785ce5`; TTG 4/4 projects and AOD desktop recovery/retry case pass |
| Task 7 v6 repeated nonbrowser gate | pending | rerun after workflow/docs closure |
| Task 7 immutable v6/exact gates/E2E | pending | external post-freeze evidence |

Candidate-v4 exposed a final endpoint ownership defect that the unit-only hold test did not cover: `Figure2DistanceExpandTimeline.dispose()` parked all media after reverse completion, undoing the canonical forward-poster hold. Its TTG failure was an obsolete assertion that required an active video during the staged pause even though the memory-qualified design intentionally shows one decoded terminal still until reverse media commits. The v5 runtime closure restored Figure2 hold ownership and passed the default matrix. Its final release matrix then exposed two remaining oracle errors: `r5-ttg-alpha` still asserted parked-video metadata/activation instead of sampling each active playback surface plus the terminal still, and `r5-production` required Method even when both AOD preparation and endpoint reconstruction failed, contrary to the documented rule that this case stays on the current interactive static hold. The v6 closure strengthens those release assertions and keeps both full browser matrices as the final commands.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the candidate-v2 review blockers with one cancellable media-preparation lifecycle, reversible Figure2 hold ownership, and identity-bound RSS evidence before creating an immutable candidate-v3.

**Architecture:** SegmentPlayer owns one `AbortController` and timeout per staged leg. Transition preparation is side-effect-bounded and cannot make a surface visible; after readiness resolves, SegmentPlayer invokes a separate synchronous commit before starting the authored clock. Release identity uses a stable `artifactTreeSha256` over deployable files, so memory evidence can bind to that tree and the final manifest can bind to the evidence without a digest cycle.

**Tech Stack:** React 19, TypeScript strict, XState 5, Vitest, Playwright, Vite, Node.js release scripts, GitHub Actions.

---

## Frozen Boundaries

- `react-refactor-r5-parity-repair-candidate-v2` remains immutable at `0dc2a87b69af39a9a3960488fda56f6af664b54d` and is recorded as `NEEDS WORK`.
- The only new release identity allowed by this plan is `react-refactor-r5-parity-repair-candidate-v3`, created after every automated gate passes.
- The canonical 18 holds / 17 segments, ids, hashes, copy, Director, SegmentPlayer, Stage, LayerWindow, lazy production/harness boundary, and no-JS shell remain unchanged.
- No Playwright run occurs before the final qualification phase.
- No `main` merge, deploy, cutover tag, or R6 cleanup is authorized.

### Task 0: Record v2 rejection and v3 scope

**Files:**
- Create: `docs/plans/2026-07-13-003-fix-r5-candidate-v3-lifecycle-gates-plan.md`
- Modify: `docs/react-refactor/reports/r5-parity-repair-candidate.md`
- Modify: `docs/react-refactor/README.md`
- Modify: `docs/react-refactor/ROADMAP.md`
- Modify: `docs/react-refactor/runbooks/react-cutover-rollback.md`

- [ ] **Step 1: Mark v2 as immutable but not HITL-qualified**

Record the two exact-tag aggregate RSS failures (`1,527,169,024B` and `1,575,190,528B`) and the five P1 lifecycle/release blockers. Preserve the earlier `1,451,737,088B` sample as historical evidence, not as permission to ignore the exact-tag failures.

- [ ] **Step 2: Reserve v3 without creating it**

State that v3 is created only after the code, identity-bound memory evidence, browser matrices, and rollback pass.

- [ ] **Step 3: Verify and commit**

Run:

```bash
git diff --check
```

Expected: exit 0.

Commit:

```bash
git add docs/plans/2026-07-13-003-fix-r5-candidate-v3-lifecycle-gates-plan.md \
  docs/react-refactor/reports/r5-parity-repair-candidate.md \
  docs/react-refactor/README.md \
  docs/react-refactor/ROADMAP.md \
  docs/react-refactor/runbooks/react-cutover-rollback.md
git commit -m "docs(r5): plan candidate v3 lifecycle closure"
git push origin codex/react-refactor-r5-parity-cutover
```

### Task 1: Bound every staged-leg preparation

**Files:**
- Create: `app/src/media/media-preparation.ts`
- Create: `app/src/media/media-preparation.test.ts`
- Modify: `app/src/story/types.ts`
- Modify: `app/src/story/segment-player.ts`
- Modify: `app/src/story/segment-player.test.ts`

- [ ] **Step 1: Write failing error/abort helper tests**

The shared contract is:

```ts
export type MediaPreparationFailureCode =
  | 'MEDIA_PREPARATION_ABORTED'
  | 'MEDIA_PREPARATION_TIMEOUT'
  | 'MEDIA_ELEMENT_ERROR'
  | 'MEDIA_SEEK_FAILED'
  | 'MEDIA_FRAME_CALLBACK_UNAVAILABLE';

export class MediaPreparationError extends Error {
  constructor(
    readonly code: MediaPreparationFailureCode,
    message: string,
    options: { cause?: unknown } = {}
  ) {
    super(message, options);
    this.name = 'MediaPreparationError';
  }
}

export function createLinkedAbortController(parent?: AbortSignal): {
  controller: AbortController;
  dispose(): void;
};
```

Tests must prove parent abort propagation, idempotent disposal, and preservation of the abort reason.

- [ ] **Step 2: Run the helper test and observe RED**

Run:

```bash
pnpm -C app test src/media/media-preparation.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the shared typed failure helpers**

Implement only the exported error and linked-controller contract above. Linking removes the parent listener on `dispose()`.

- [ ] **Step 4: Add failing SegmentPlayer timeout and abort tests**

Extend `StagedLegPreparation` and `SegmentTimelineHandle`:

```ts
export type StagedLegPreparation = Readonly<{
  runId: SegmentRunId;
  segment: SegmentId;
  direction: Direction;
  legIndex: number;
  from: number;
  to: number;
  durationMs: number;
  resumedStageIndex?: number;
  signal: AbortSignal;
}>;

export type SegmentTimelineHandle = {
  // existing members
  prepareLeg?(leg: StagedLegPreparation): Promise<void> | void;
  commitLeg?(leg: StagedLegPreparation): void;
};
```

Add tests that:

```ts
it('fails a staged leg that never resolves at the manifest media timeout', async () => {
  // prepareLeg returns a never-resolving promise
  // advance 4,000ms
  // expect result.status === 'failed'
  // expect error.code === 'MEDIA_PREPARATION_TIMEOUT'
});

it('aborts the staged preparation signal before disposing its timeline', async () => {
  // capture leg.signal
  // player.abort('seek')
  // expect signal.aborted === true
  // expect result.status === 'aborted'
  // resolving stale readiness must not call commitLeg or progress the clock
});
```

- [ ] **Step 5: Run the SegmentPlayer tests and observe RED**

Run:

```bash
pnpm -C app test src/story/segment-player.test.ts
```

Expected: FAIL because staged preparation has no signal, timeout, or commit phase.

- [ ] **Step 6: Implement SegmentPlayer ownership**

For each staged leg:

```ts
const controller = new AbortController();
const leg = { ...legFields, signal: controller.signal };
const readiness = timeline.prepareLeg?.(leg);
await raceReadinessAgainstTimeoutAndAbort(readiness, timeoutMs, controller);
assertCurrentRunAndGeneration();
timeline.commitLeg?.(leg);
startClock();
```

Use the maximum `preparingTimeoutMs` from the segment's media playback contracts, falling back to the segment/build default. Abort the controller before timeline disposal on seek, supersede, recovery, completion, or explicit dispose.

- [ ] **Step 7: Verify Task 1 and commit**

Run:

```bash
pnpm -C app test src/media/media-preparation.test.ts src/story/segment-player.test.ts
pnpm -C app test
```

Expected: all tests pass.

Commit:

```bash
git add app/src/media/media-preparation.ts app/src/media/media-preparation.test.ts \
  app/src/story/types.ts app/src/story/segment-player.ts app/src/story/segment-player.test.ts
git commit -m "fix(media): bound staged leg preparation"
git push origin codex/react-refactor-r5-parity-cutover
```

### Task 2: Make decoded-frame readiness strict and cancellable

**Files:**
- Modify: `app/src/media/timeline-video-driver.ts`
- Modify: `app/src/media/timeline-video-driver.test.ts`
- Modify: `app/src/media/directional-media-controller.ts`
- Modify: `app/src/media/directional-media-controller.test.ts`

- [ ] **Step 1: Add failing timeline-driver tests**

Change the preparation API to:

```ts
export type TimelineVideoPreparationOptions = Readonly<{
  signal?: AbortSignal;
}>;

prepareFrame(
  input: TimelineVideoDriveInput,
  options?: TimelineVideoPreparationOptions
): Promise<TimelineVideoFrameResult>;
```

Tests must prove:

```ts
it('does not declare readiness when the frame callback is still pending after 80ms');
it('rejects preparation when assigning currentTime throws');
it('rejects preparation on media error and media abort');
it('rejects preparation when its AbortSignal is aborted');
it('rejects required preparation when requestVideoFrameCallback is unavailable');
```

- [ ] **Step 2: Run the timeline-driver test and observe RED**

Run:

```bash
pnpm -C app test src/media/timeline-video-driver.test.ts
```

Expected: FAIL because the current 80ms timer marks the frame ready and waiters cannot reject.

- [ ] **Step 3: Implement strict readiness**

- Remove `PRESENTED_FRAME_FALLBACK_MS` success behavior.
- Only `requestVideoFrameCallback` may mark a required prepared frame ready.
- Reject matching waiters with `MediaPreparationError` for seek assignment failure, element `error`, element `abort`, unavailable frame callback, signal abort, or driver disposal.
- A superseded run still resolves `status: 'stale'`; it is not reported as a failure for the new run.
- Every waiter removes signal and media listeners exactly once.

- [ ] **Step 4: Add failing directional-controller cancellation tests**

Change the API to:

```ts
prepare(
  input: DirectionalMediaInput,
  options?: TimelineVideoPreparationOptions
): Promise<TimelineVideoFrameResult>;
```

Test that abort parks only the pending surface while preserving the currently active surface, and that activating one surface preserves a same-run sibling that is already `ready` for a later endpoint commit.

- [ ] **Step 5: Implement directional cancellation and ready-sibling preservation**

Pass the signal to `prepareTimelineVideoFrame`. On rejection, invalidate only the matching surface generation. During activation, preserve a different `ready` surface only when it belongs to the same run and direction; park every stale/active/terminal sibling.

- [ ] **Step 6: Verify Task 2 and commit**

Run:

```bash
pnpm -C app test src/media/timeline-video-driver.test.ts src/media/directional-media-controller.test.ts
pnpm -C app test
```

Expected: all tests pass.

Commit:

```bash
git add app/src/media/timeline-video-driver.ts app/src/media/timeline-video-driver.test.ts \
  app/src/media/directional-media-controller.ts app/src/media/directional-media-controller.test.ts
git commit -m "fix(media): require cancellable presented frames"
git push origin codex/react-refactor-r5-parity-cutover
```

### Task 3: Separate staged preparation from visible media commit

**Files:**
- Modify: `app/src/transitions/shared/stagedMediaHandoff.ts`
- Modify: `app/src/transitions/shared/stagedMediaHandoff.test.ts`
- Modify: `app/src/transitions/ttg-lab/index.ts`
- Modify: `app/src/transitions/ph-education/index.ts`
- Modify: `app/src/scenes/ttg-animation/index.tsx`
- Modify: `app/src/scenes/ph-animation/index.tsx`
- Modify: `app/src/transitions/group5-transitions.test.ts`
- Modify: `app/src/transitions/group6-transitions.test.ts`

- [ ] **Step 1: Add failing dispose-during-prepare and commit-order tests**

Extend handoff options:

```ts
prepareLeg(root, leg, context): Promise<void> | void;
commitPreparedLeg?(root, leg, context): void;
commitLegEndpoint?(root, leg, context): void;
```

Tests must prove `prepareLeg()` alone never activates a new surface, `commitLeg()` activates it once, and disposing while preparation is pending aborts the local linked signal and prevents every later commit.

- [ ] **Step 2: Run shared/group tests and observe RED**

Run:

```bash
pnpm -C app test src/transitions/shared/stagedMediaHandoff.test.ts \
  src/transitions/group5-transitions.test.ts src/transitions/group6-transitions.test.ts
```

Expected: FAIL because TTG preparation currently activates surfaces and the handoff has no commit phase.

- [ ] **Step 3: Implement handoff-local cancellation**

Each `prepareLeg()` creates a linked controller from `leg.signal`, passes the linked signal to the source preparation, and records readiness only for the current generation. `dispose()` aborts that controller. `commitLeg()` synchronously calls `commitPreparedLeg` and arms the endpoint callback only for the committed leg.

- [ ] **Step 4: Split TTG and PH source APIs**

TTG stores prepared inputs without changing `activeSurface`:

```ts
prepareTtgPlaybackLeg(root, mediaRun, signal): Promise<void>;
commitTtgPlaybackLeg(root, mediaRun): void;
prepareTtgSourceTerminal(root, mediaRun, signal): Promise<void>;
commitTtgSourceTerminal(root, mediaRun): void;
```

Reverse TTG may retain a same-run prepared forward-start surface while reverse is active; stale or aborted generations cannot commit it. PH preparation stores its decoded frame and commit applies the corresponding render/drive state.

- [ ] **Step 5: Verify Task 3 and commit**

Run:

```bash
pnpm -C app test src/transitions/shared/stagedMediaHandoff.test.ts \
  src/transitions/group5-transitions.test.ts src/transitions/group6-transitions.test.ts
pnpm -C app test
```

Expected: all tests pass.

Commit:

```bash
git add app/src/transitions/shared/stagedMediaHandoff.ts \
  app/src/transitions/shared/stagedMediaHandoff.test.ts \
  app/src/transitions/ttg-lab/index.ts app/src/transitions/ph-education/index.ts \
  app/src/scenes/ttg-animation/index.tsx app/src/scenes/ph-animation/index.tsx \
  app/src/transitions/group5-transitions.test.ts app/src/transitions/group6-transitions.test.ts
git commit -m "fix(staged): commit only current prepared media"
git push origin codex/react-refactor-r5-parity-cutover
```

### Task 4: Close Figure2 media, hold, and depth-Ink ownership

**Files:**
- Modify: `app/src/scenes/figure2-animation/index.tsx`
- Modify: `app/src/transitions/figure2-distance-expand/index.ts`
- Modify: `app/src/transitions/figure2-proof-chain.test.ts`

- [ ] **Step 1: Add failing Figure2 tests**

Tests must prove:

```ts
it('does not activate a prepared Figure2 direction before commitLeg');
it('cannot activate a Figure2 pair after timeline disposal during preparation');
it('restores both canonical forward poster surfaces when a parked Figure2 hold re-enters');
it('throws InkRendererRunError after depth Ink context loss');
```

- [ ] **Step 2: Run the Figure2 tests and observe RED**

Run:

```bash
pnpm -C app test src/transitions/figure2-proof-chain.test.ts
```

Expected: FAIL because preparation activates immediately, hold rendering does not restore surfaces, and depth Ink invalidation is ignored.

- [ ] **Step 3: Implement Figure2 prepare/commit**

Use:

```ts
prepareFigure2MediaLeg(root, preparation, signal): Promise<void>;
commitFigure2MediaLeg(root, preparation): void;
```

Preparation stores an atomically ready left/right pair for one generation. Commit verifies root, run, direction, and generation before activation. Timeline disposal aborts its linked controller before parking or releasing resources.

- [ ] **Step 4: Restore canonical hold ownership**

`renderFigure2Hold()` pauses all four videos, keeps them metadata-only, activates the two forward poster elements in DOM class ownership, deactivates both reverse elements, and marks `data-figure2-hold-poster="true"`. It works whether or not a media manager was previously created.

- [ ] **Step 5: Enforce depth Ink invalidation**

Pass `onInvalidated` to `createInkFieldRenderer`, retain the typed failure, and call an `assertRendererReady()` guard before/after rendering. When production Ink is required but unavailable, clean up depth mask/elevation/canvas and throw `InkRendererRunError` instead of continuing without Ink.

- [ ] **Step 6: Verify Task 4 and commit**

Run:

```bash
pnpm -C app test src/transitions/figure2-proof-chain.test.ts
pnpm -C app test
```

Expected: all tests pass.

Commit:

```bash
git add app/src/scenes/figure2-animation/index.tsx \
  app/src/transitions/figure2-distance-expand/index.ts \
  app/src/transitions/figure2-proof-chain.test.ts
git commit -m "fix(figure2): restore cancellable hold ownership"
git push origin codex/react-refactor-r5-parity-cutover
```

### Task 5: Forward opposing input during preparing

**Files:**
- Modify: `app/src/production/input-controller.ts`
- Modify: `app/src/production/input-controller.test.ts`

- [ ] **Step 1: Add failing production input tests**

```ts
it('forwards the first opposing wheel delta while Director is preparing', () => {
  // state='preparing', pendingDirection=1, wheel deltaY=-20
  // expect INPUT_DELTA with a negative delta
});

it('does not supersede preparation with a same-direction delta', () => {
  // state='preparing', pendingDirection=1, wheel deltaY=20
  // expect no Director event
});
```

Cover PageUp and touch direction through the existing shared dispatch path.

- [ ] **Step 2: Run the input tests and observe RED**

Run:

```bash
pnpm -C app test src/production/input-controller.test.ts
```

Expected: FAIL because neither dispatch predicate accepts `preparing`.

- [ ] **Step 3: Implement the narrow preparing route**

Before physical commitment handling, forward normalized `INPUT_DELTA` only when:

```ts
snapshot.state === 'preparing'
  && snapshot.context.pendingDirection === -direction(normalized.pixels)
```

Same-direction input remains ignored. The Director machine continues to own supersession and prepare-token generation.

- [ ] **Step 4: Verify Task 5 and commit**

Run:

```bash
pnpm -C app test src/production/input-controller.test.ts \
  src/runtime/director.machine.test.ts src/runtime/director.actor.test.ts
pnpm -C app test
```

Expected: all tests pass.

Commit:

```bash
git add app/src/production/input-controller.ts app/src/production/input-controller.test.ts
git commit -m "fix(input): allow preparing reversal"
git push origin codex/react-refactor-r5-parity-cutover
```

### Task 6: Bind RSS evidence to candidate identity and upload gate

**Files:**
- Modify: `app/scripts/profile-r5-process-memory.mjs`
- Modify: `app/scripts/create-release-manifest.mjs`
- Create: `app/scripts/run-r5-process-memory.mjs`
- Modify: `app/src/production/release-manifest.test.ts`
- Modify: `app/package.json`
- Modify: `package.json`
- Modify: `.github/workflows/r5-candidate.yml`

- [ ] **Step 1: Add failing manifest/workflow tests**

Schema 3 adds a stable artifact tree and memory qualification:

```ts
type ReleaseManifestV3 = {
  schemaVersion: 3;
  candidate: string | null;
  candidateTagObject: string | null;
  sourceCommit: string;
  sourceDirty: boolean;
  artifactTreeSha256: string;
  files: readonly FileEntry[];
  qualification: {
    status: 'unbound' | 'pending-memory' | 'qualified';
    memory: null | {
      path: 'r5-process-memory.json';
      sha256: string;
      pass: true;
    };
  };
};
```

Tests must reject missing, failed, source-mismatched, tag-object-mismatched, and artifact-tree-mismatched evidence when `R5_REQUIRE_MEMORY_EVIDENCE=1`. They must also assert the v3 workflow runs memory before finalization/upload.

- [ ] **Step 2: Run release-manifest tests and observe RED**

Run:

```bash
pnpm -C app test src/production/release-manifest.test.ts
```

Expected: FAIL because schema 2 has no artifact tree or qualification.

- [ ] **Step 3: Implement stable artifact identity**

Compute `artifactTreeSha256` from canonical JSON of sorted deployable file entries while excluding `r5-release-manifest.json` and `r5-process-memory.json`. A draft exact-tag build writes `pending-memory`; an ordinary noncandidate build writes `unbound`.

- [ ] **Step 4: Bind the memory report**

When release identity is required, the profiler reads the draft manifest and writes `dist/r5-process-memory.json` with:

```ts
identity: {
  candidate: string;
  candidateTagObject: string;
  sourceCommit: string;
  artifactTreeSha256: string;
  draftManifestSha256: string;
}
```

The finalizer hashes the evidence file, verifies `pass: true` and exact identity equality, then writes `qualification.status: 'qualified'`.

- [ ] **Step 5: Force memory before upload**

Add a runner that starts exact `dist/` on port 4173, waits for readiness, runs the profiler, and always terminates the preview process. Expose scripts:

```json
{
  "deploy:prepare": "pnpm -C app build:release-draft",
  "deploy:finalize": "pnpm -C app finalize:release",
  "deploy:build": "pnpm run deploy:prepare && pnpm -C app evidence:memory:release && pnpm run deploy:finalize"
}
```

The candidate workflow uses explicit prepare, memory, finalize, then upload steps for `react-refactor-r5-parity-repair-candidate-v3`. Upload cannot execute after a failed RSS process.

- [ ] **Step 6: Verify Task 6 and commit**

Run:

```bash
pnpm -C app test src/production/release-manifest.test.ts
pnpm -C app test
pnpm -C app lint
pnpm -C app typecheck
```

Expected: all commands pass.

Commit:

```bash
git add app/scripts/profile-r5-process-memory.mjs \
  app/scripts/create-release-manifest.mjs app/scripts/run-r5-process-memory.mjs \
  app/src/production/release-manifest.test.ts app/package.json package.json \
  .github/workflows/r5-candidate.yml
git commit -m "feat(release): bind RSS evidence to candidate identity"
git push origin codex/react-refactor-r5-parity-cutover
```

### Task 7: Final verification, immutable v3, rollback, and review handoff

**Files:**
- Modify: `docs/react-refactor/contract-diff/R5-production-parity-repair.md`
- Modify: `docs/react-refactor/reports/r5-parity-repair-candidate.md`
- Modify: `docs/react-refactor/reports/r5-regression-matrix.md`
- Modify: `docs/react-refactor/reports/r5-performance-budget.md`
- Modify: `docs/react-refactor/reports/r5-seo-no-js.md`
- Modify: `docs/react-refactor/runbooks/react-cutover-rollback.md`
- Modify: `docs/react-refactor/README.md`
- Modify: `docs/react-refactor/ROADMAP.md`

- [ ] **Step 1: Run all nonbrowser verification**

Run:

```bash
pnpm run verify:all
git diff --check
```

Expected: tests, lint, typecheck, build, release/static checks, and budgets pass.

- [ ] **Step 2: Commit and push the pre-freeze evidence docs**

Record the unit/build result while leaving tag object, final manifest hash, memory result, browser result, and rollback as external post-freeze fields.

Commit:

```bash
git add docs/react-refactor
git commit -m "docs(r5): prepare candidate v3 qualification"
git push origin codex/react-refactor-r5-parity-cutover
```

- [ ] **Step 3: Create v3 only from a clean pushed HEAD**

Run:

```bash
git status --short
git tag -a react-refactor-r5-parity-repair-candidate-v3 \
  -m "R5 production parity repair candidate v3"
git push origin refs/tags/react-refactor-r5-parity-repair-candidate-v3
```

Expected: the tag is new, annotated, and peels to the pushed branch HEAD. Never move v2.

- [ ] **Step 4: Run identity-bound memory qualification**

Run:

```bash
R5_CANDIDATE_TAG=react-refactor-r5-parity-repair-candidate-v3 \
R5_SOURCE_COMMIT="$(git rev-parse HEAD)" \
pnpm run deploy:build
```

Expected: RSS evidence passes, final manifest schema is 3, identity fields match the tag, and `qualification.status` is `qualified`. Any RSS failure stops the release and forbids upload/handoff as passed.

- [ ] **Step 5: Rehearse same-port rollback**

Serve exact v3 → immutable `react-refactor-legacy-static-baseline` → byte-identical exact v3 on port 4173. Verify root/static footer/no-JS/direct hash/media range/key directions, legacy frozen index hash, manifest absence on legacy, and final v3 manifest identity.

- [ ] **Step 6: Run E2E last**

Run:

```bash
pnpm -C app exec playwright test
pnpm -C app exec playwright test --config playwright.release.config.ts
```

Expected: all applicable cases pass and all skips are project-declared. Do not edit source or docs after this point.

- [ ] **Step 7: Stop for HITL review**

Report branch, source commit, v3 tag object, final manifest SHA-256, artifact tree digest, file count/bytes, memory values, browser counts, rollback result, and any remaining risk. Do not merge or deploy.
