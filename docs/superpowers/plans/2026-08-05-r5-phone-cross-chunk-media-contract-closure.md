# R5 Phone Cross-Chunk Media Contract Closure Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not widen scope or alter authored visuals/timings/media.

**Goal:** Remove the production-only cross-chunk media-evidence ABI break that rolls `Figure2 → Proof` back to Figure2, then close the same latent failure for Hero, AOD, Figure3, TTG, PH, and Crane before reopening manual iPhone acceptance.

**Architecture:** `PhoneStoryShell` remains the sole route authority. This plan does not add a second reducer, runner, timer, media owner, proof producer, or route lifecycle. The timeline driver may keep named objects internally, but every value returned across a lazy chunk boundary must be positional or primitive. Grade A continues to use the existing machine session; it only gains explicit failure classification and the same endpoint-release ordering already adopted by the front-stage runner.

**Tech Stack:** React 19, TypeScript, Vite/Rollup, Terser property mangling, Vitest, Playwright Chromium/WebKit, mobile Safari release qualification.

Unless a code block begins with `cd app`, run it from the repository root. Treat each code block as an independent shell invocation.

---

## Review verdict and frozen evidence

Status at `75a3032`: **NO-GO**. The front-half Hero/Pattern changes are directionally correct, but the full formal path is not ready for manual acceptance.

The current Figure2 block is not a visual-timing bug and is not proof that two route authorities still exist. It is a production ABI failure:

- Source producer: `app/src/media/timeline-video-driver.ts` returns a named object whose public discriminator is `status`.
- Source consumer: `app/src/scenes/figure2-animation/index.tsx` accepts only `frame?.status === 'ready'`.
- Production producer chunk `story-runtime-DQ3e1br.js` emits the discriminator as property `i`.
- Production Figure2 chunk `index-CTgwmrL.js` reads that discriminator as property `e`.
- Therefore a genuinely ready decoded frame is rejected as `Figure2 media stale`; the Grade A runner catches it, rolls the candidate back, exposes `data-phone-retryable-run="figure2-proof"`, and returns to `hold:figure2-animation`.

The same emitted-build mismatch exists in every generic media consumer that reads `.status`: Hero, AOD, Figure2, Figure3, TTG, PH, and Crane. Their consumer chunks currently read different mangled keys (`r`, `a`, `e`, `t`, and others) while the producer emits `i`. Some phone paths happen to use the safe `phone-timeline-runtime` tuple bridge, but the generic scene helpers still bypass it.

The architecture gate missed this because `phoneTimelineAdapterSuffixes` is a finite six-file list. It excludes the generic scene modules where the broken reads live. Passing Vitest cannot detect this because Vitest does not reproduce independent per-chunk Terser property maps.

Two additional review constraints remain:

1. `75a3032` fixes endpoint release before `LEG_COMPLETED` only in the front-stage capability. `phone-grade-a-runtime.ts` still emits `session[9]('receiver')` before its release callback runs.
2. The new front-stage test checks call counts, not invocation order. It can pass even if a later refactor moves `reportEndpointRelease()` after completion.

No implementation task below may change scene assets, media hashes, `timings.ts`, Figure2 z-depth progress mapping, Hero/Pattern radial geometry, AOD paper styling, or any scene layout.

## Hard cutover rules

1. Do not “fix” this by adding `status` to the global Terser reserve list. That hides this one field, spends bundle headroom, and leaves future returned fields vulnerable.
2. There must be one public prepared-frame transport. After Task 2, no production consumer may read a named `TimelineVideoFrameResult.status` field.
3. A ready media frame may only be accepted from the exact current run/generation/signal. Tuple conversion must not weaken these existing checks.
4. A preparation failure must rollback through the existing machine session with a typed reason. It must not fall through to static proof, synthesize a proof, or unlock input locally.
5. Endpoint geometry is retired before terminal leg completion; resource disposal remains idempotent and controller-owned.
6. Chromium full Task 10 must be green before WebKit is run. Entity iPhone Safari is last, not a substitute for failed automation.

---

### Task 1: Capture a deterministic red contract for the emitted ABI

**Files:**

- Modify: `app/scripts/verify-homepage-module-boundaries.mjs`
- Modify: `app/scripts/verify-homepage-module-boundaries.test.mjs`
- Modify: `app/src/production/phone/phone-cross-chunk-execution-contract.test.ts`
- Reference only: `app/src/media/timeline-video-driver.ts`
- Reference only: `app/src/scenes/figure2-animation/index.tsx`

**Step 1: Add a failing structural fixture for a future, previously unlisted phone scene**

Add a fixture such as:

```ts
const unsafeTimelineConsumer = `
  import { prepareTimelineVideoFrame } from '../../media/timeline-video-driver';
  export async function prepare(video, input) {
    const frame = await prepareTimelineVideoFrame(video, input);
    return frame?.status === 'ready';
  }
`;
```

Assert that the verifier reports a positional-evidence violation without adding that filename to an allow/deny suffix list.

**Step 2: Add a failing contract assertion for the current driver result**

The contract test must require:

```ts
export type TimelineVideoFrameResult = readonly [
```

and reject a public object form containing `status:`. The test must fail on `75a3032`.

**Step 3: Run only the contract tests and record the known-red output**

Run:

```bash
cd app
pnpm exec vitest run \
  scripts/verify-homepage-module-boundaries.test.mjs \
  src/production/phone/phone-cross-chunk-execution-contract.test.ts
```

Expected: failure names the named prepared-frame result and the unlisted unsafe consumer.

**Step 4: Commit the red gate separately**

```bash
git add app/scripts/verify-homepage-module-boundaries.mjs \
  app/scripts/verify-homepage-module-boundaries.test.mjs \
  app/src/production/phone/phone-cross-chunk-execution-contract.test.ts
git commit -m "test(r5): expose timeline frame chunk ABI"
```

---

### Task 2: Replace the named prepared-frame result with one positional transport

**Files:**

- Modify: `app/src/media/timeline-video-driver.ts`
- Modify: `app/src/media/timeline-video-driver.test.ts`
- Modify: `app/src/production/phone/phone-timeline-runtime.ts`
- Modify: `app/src/production/phone/phone-timeline-runtime.test.ts`
- Modify: `app/src/scenes/hero/index.tsx`
- Modify: `app/src/scenes/aod-animation/index.tsx`
- Modify: `app/src/scenes/figure2-animation/index.tsx`
- Modify: `app/src/scenes/figure3-animation/index.tsx`
- Modify: `app/src/scenes/ttg-animation/index.tsx`
- Modify: `app/src/scenes/ph-animation/index.tsx`
- Modify: `app/src/scenes/crane-animation/index.tsx`

**Step 1: Change the public result to a tuple; do not add a new wrapper file**

Use this single contract in the existing driver:

```ts
export type TimelineVideoFrameResult = readonly [
  status: 'ready' | 'stale',
  runId: string,
  direction: Direction,
  generation: number,
  targetTime: number
];

function frameResult(
  frame: DesiredFrame,
  status: TimelineVideoFrameResult[0]
): TimelineVideoFrameResult {
  return [
    status,
    frame.runId,
    frame.direction,
    frame.generation,
    frame.targetTime
  ];
}
```

Tuple labels are type-only; emitted code carries numeric slots, so independently mangled chunks cannot disagree about field names.

**Step 2: Migrate every production consumer in the same change**

Replace named reads with positional reads. For example:

```ts
const frame = await prepareTimelineVideoFrame(manager.video, input);
if (
  preparation.signal?.aborted
  || manager.generation !== generation
  || frame?.[0] !== 'ready'
) {
  throw new Error('Figure2 media stale');
}
```

For `phone-timeline-runtime.ts`, preserve its smaller public evidence tuple:

```ts
const frame = await prepareTimelineVideoFrame(video, driverInput(input));
return frame ? [frame[0], frame[1]] : [null, null];
```

Do not remove run/generation/AbortSignal checks from Figure2 or TTG. Do not change target times or playback modes.

**Step 3: Update driver tests to assert the complete tuple**

At minimum cover ready, stale, reverse direction, and generation advancement:

```ts
await expect(readiness).resolves.toEqual([
  'ready',
  'test-run',
  1,
  1,
  expectedTargetTime
]);
```

Use exact values already available in each fixture; do not replace meaningful assertions with `[status]` only.

**Step 4: Make the Task 1 gate green**

The verifier must be structural: all phone-specific modules are covered by path class, not a manually enumerated suffix list. `timeline-video-driver.ts` and its test are the only places allowed to construct the full tuple.

**Step 5: Run the focused suite**

```bash
cd app
pnpm exec vitest run \
  src/media/timeline-video-driver.test.ts \
  src/production/phone/phone-timeline-runtime.test.ts \
  src/production/phone/phone-cross-chunk-execution-contract.test.ts \
  scripts/verify-homepage-module-boundaries.test.mjs
```

Expected: all green, with no production `.status` read tied to `prepareTimelineVideoFrame`.

**Step 6: Commit the hard cutover**

```bash
git add app/src/media/timeline-video-driver.ts \
  app/src/media/timeline-video-driver.test.ts \
  app/src/production/phone/phone-timeline-runtime.ts \
  app/src/production/phone/phone-timeline-runtime.test.ts \
  app/src/scenes/hero/index.tsx \
  app/src/scenes/aod-animation/index.tsx \
  app/src/scenes/figure2-animation/index.tsx \
  app/src/scenes/figure3-animation/index.tsx \
  app/src/scenes/ttg-animation/index.tsx \
  app/src/scenes/ph-animation/index.tsx \
  app/src/scenes/crane-animation/index.tsx \
  app/scripts/verify-homepage-module-boundaries.mjs \
  app/scripts/verify-homepage-module-boundaries.test.mjs \
  app/src/production/phone/phone-cross-chunk-execution-contract.test.ts
git commit -m "fix(r5): make timeline frame evidence chunk stable"
```

---

### Task 3: Make Grade A rollback diagnostic and terminal ordering explicit

**Files:**

- Modify: `app/src/production/phone/phone-story/runtime.ts`
- Modify: `app/src/production/phone/phone-grade-a-runtime.ts`
- Modify: `app/src/production/phone/phone-grade-a-runtime.test.ts`
- Modify: `app/src/production/phone/phone-story-runtime.test.ts`

**Step 1: Write failing order tests before implementation**

Record invocation order, not only counts:

```ts
expect(session.reportEndpointRelease.mock.invocationCallOrder[0])
  .toBeLessThan(session.reportAnimationComplete.mock.invocationCallOrder[0]);
```

For Grade A, require this terminal sequence:

```text
commit visual endpoint
→ release transition endpoint geometry
→ report endpoint release to authority
→ LEG_COMPLETED
→ target presented/alignment
```

Also require that `releaseResources` remains deferred and idempotent.

**Step 2: Let the positional session carry the existing failure reason**

Change only slot 13's type and forwarding:

```ts
reportFailure: (reason?: PhoneFailureReason) => void,
```

Do not introduce another event channel.

**Step 3: Classify prepare failures in the existing runner**

Use the existing machine reasons:

```ts
const rollback = (
  reason: PhoneFailureReason = 'capability-failed'
) => {
  // existing terminal cleanup
  if (session[4]()) session[13](reason);
};

// In prepare():
} catch (error) {
  rollback(
    error instanceof MediaPreparationError
      ? 'media-failed'
      : 'capability-failed'
  );
}
```

Abort/disposal of an already-retired session must remain inert. Do not log or publish a second state.

**Step 4: Release the Grade A endpoint before completion**

Install the release lease, call the idempotent endpoint release, and only then report the receiver completion. Do not synthesize target proof and do not call `reportTargetPresented()` until the existing machine preconditions are satisfied.

**Step 5: Run deterministic runtime tests**

```bash
cd app
pnpm exec vitest run \
  src/production/phone/phone-grade-a-runtime.test.ts \
  src/production/phone/phone-story-runtime.test.ts \
  src/production/phone/phone-story/runtime/engine.test.ts
```

Expected: failure reason is `media-failed` for media preparation failure; endpoint release precedes completion in both front-stage and Grade A; stale callbacks remain ignored.

**Step 6: Commit the ordering closure**

```bash
git add app/src/production/phone/phone-story/runtime.ts \
  app/src/production/phone/phone-grade-a-runtime.ts \
  app/src/production/phone/phone-grade-a-runtime.test.ts \
  app/src/production/phone/phone-story-runtime.test.ts
git commit -m "fix(r5): close grade a media rollback ordering"
```

---

### Task 4: Prove the Figure2 vertical chain in the minified production build

**Files:**

- Modify only if the assertion is missing: `app/e2e/r5-phone-story.spec.ts`
- Evidence only: `app/test-results/`
- Evidence only: `dist/`

**Step 1: Run static checks and build before opening a browser**

```bash
cd app
pnpm typecheck
pnpm exec vitest run
pnpm build
```

Expected:

- all tests pass;
- `git diff --check` passes;
- `phoneJsRawBytes <= 659456`, restoring at least 4,096 bytes of hard-cap headroom;
- build verifier finds no named prepared-frame evidence across lazy chunks.

If the phone bundle remains `661564` or merely stays below the hard cap `663552`, stop. That is still below the agreed working headroom and is not a release checkpoint.

**Step 2: Run the known-red Figure2 production path twice in Chromium**

```bash
pnpm exec playwright test \
  --config playwright.phone.config.ts \
  --project=phone-chromium \
  --grep "\[execution regression\] Method landing starts Figure2 playback before the Proof boundary" \
  --workers=1 \
  --repeat-each=2
```

Acceptance for both repetitions:

- the first Figure2 input advances the real video from the landed frame;
- `figure2-proof` starts once;
- no `rollback-measuring-landing` or `data-phone-retryable-run="figure2-proof"` appears;
- the z-depth/effect middle frame is physically non-terminal before Proof;
- the cursor reaches stable `hold:figure2-proof` and input is released.

**Step 3: Run the full Chromium Task 10 matrix**

```bash
pnpm exec playwright test \
  --config playwright.phone.config.ts \
  --project=phone-chromium \
  --grep "Task 10" \
  --workers=1
```

Required: 7/7. A failure after Figure2 is a new ledger item; do not reopen Hero/Pattern or patch around it.

**Step 4: Only after Chromium 7/7, repeat Figure2 and Task 10 in WebKit**

```bash
pnpm exec playwright test \
  --config playwright.phone.config.ts \
  --project=phone-webkit \
  --grep "\[execution regression\] Method landing starts Figure2 playback before the Proof boundary" \
  --workers=1 \
  --repeat-each=2

pnpm exec playwright test \
  --config playwright.phone.config.ts \
  --project=phone-webkit \
  --grep "Task 10" \
  --workers=1
```

Required: Figure2 2/2 and Task 10 7/7.

**Step 5: Commit only a real missing E2E assertion**

If the existing test already proves all acceptance points, do not edit it. If an assertion was genuinely missing:

```bash
git add app/e2e/r5-phone-story.spec.ts
git commit -m "test(r5): gate minified figure2 proof handoff"
```

---

### Task 5: Reopen full manual acceptance only after automated closure

**Files:**

- Modify: `docs/react-refactor/reports/r5-phone-state-machine-acceptance.md`
- Modify: `docs/react-refactor/reports/r5-regression-matrix.md`
- Generated by existing release flow: `dist/r5-release-manifest.json`
- Generated by existing release flow: `dist/r5-performance-budget.json`

**Step 1: Record the exact commit and automated evidence**

The report must include:

- source commit and clean-tree status;
- full Vitest count;
- Chromium/WebKit Figure2 repetition results;
- Chromium/WebKit Task 10 results;
- `phoneJsRawBytes` and headroom;
- the tuple ABI gate result;
- `qualification: pending-memory` until memory evidence is actually complete.

**Step 2: Run release memory qualification without changing source**

Use the existing release identity/CDN workflow. A memory run against a dirty tree or a different commit does not qualify the candidate.

**Step 3: Perform entity iPhone Safari acceptance on the same candidate**

Required passes, twice forward and once reverse unless stated otherwise:

1. Loader is visible and hands off once to Hero.
2. Hero/Pattern/Star Map use the authored radial spread; Pattern expands once and collapses once; Star Map Perlin visibly advances.
3. No bottom/side white exposure under dynamic Safari toolbar changes.
4. AOD starts on the first intended gesture, paper does not flash, completion reaches Method, and background/resume does not duplicate playback.
5. Figure2 starts on first intent, z-depth middle stage is visible, Proof is reached once, and reverse returns to the correct Figure2 endpoint.
6. Proof ↔ Brand ↔ Figure3, Services ↔ TTG, Lab ↔ PH, and Education ↔ Crane each have one handoff with no old foreground arch resurrection.
7. Crane media advances and reaches Contact.
8. Direct entries for AOD, Method, Figure2, Proof, Figure3, TTG, PH, Crane, and Contact show readable content after their real first frame.
9. Menu, history/back, rapid reversal, background/resume, and two complete same-authority loops release input and leave no live session.

Capture screen recordings and machine diagnostics for any failure. Do not patch during the acceptance run; open one new vertical ledger from the first failing edge.

**Step 4: GO criteria**

Release GO requires all of the following on the same immutable commit:

- typecheck, complete Vitest, and build green;
- phone JS `<= 659456` bytes;
- Chromium Task 10 7/7;
- WebKit Task 10 7/7;
- entity iPhone checklist green;
- memory evidence finalized;
- release manifest contains a real candidate and no longer says `pending-memory`;
- clean worktree and reviewable commits.

Anything less remains **NO-GO**, even if Hero/Pattern or a scoped Figure2 test is green.

---

## Expected commit sequence

1. `test(r5): expose timeline frame chunk ABI`
2. `fix(r5): make timeline frame evidence chunk stable`
3. `fix(r5): close grade a media rollback ordering`
4. Optional only if needed: `test(r5): gate minified figure2 proof handoff`
5. Release evidence/report commit after all qualification gates pass

Do not combine unrelated visual changes, media regeneration, route refactors, bundle-budget cleanup, or file-convergence work into these commits.
