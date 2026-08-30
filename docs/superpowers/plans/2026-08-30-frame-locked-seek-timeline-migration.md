# Frame-Locked Seek Timeline Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Stop at the explicit `GO_FULL` / `GO_PARTIAL` / `NO_GO` checkpoint; do not begin production migration until the Spike report and exact migration eligibility set are reviewed and approved. Stop again at the Phase C exit review before changing the phone runtime.

**Goal:** Make every approved desktop and phone cinematic direction frame-addressed and seek-driven, and make the confirmed presented frame—not requested time or native playback—the authoritative progress for scene layers, ink, copy cues, pauses, and transition completion. If a resource cannot pass, keep its complete dependency group on the frozen legacy/static contract instead of weakening frame correctness.

**Architecture:** Introduce an exact rational frame timebase and a receipt-based presented-frame clock over the existing latest-wins seek driver. Desktop `SegmentPlayer` and phone runtime keep desired progress separate from presented progress and commit only current receipts. Phone packed-alpha receipts are emitted only after WebGL Canvas draw; Crane uses a two-surface atomic barrier. The Spike freezes a direction/atomic-group eligibility set consumed by every migration task, allowing either full or explicitly bounded partial cutover. Interaction policies stay unchanged.

**Tech Stack:** TypeScript 5.8, React 19, Vite 7, Vitest 3, Playwright 1.53, XState 5, HTMLVideoElement `requestVideoFrameCallback`, WebGL packed-alpha compositor, Node.js media verification scripts, ffmpeg/ffprobe.

**Spec:** `docs/superpowers/specs/2026-08-30-frame-locked-seek-timeline-design.md`

## Global Constraints

- Implement the Spike first. After Task 5, stop and obtain an explicit `GO_FULL`, `GO_PARTIAL`, or `NO_GO` decision before Task 6.
- Under `GO_PARTIAL`, Tasks 6 and 10–20 may modify only runtime/direction groups in the approved eligibility set. Ineligible directions remain on their tested legacy/static contract; Crane figure/flock and every shared-resource dependency group are indivisible. If no phone group is eligible, skip Tasks 15–19 instead of installing an unused second phone runtime.
- Do not claim or add a 16 MiB single-asset budget. Freeze the verifier's actual aggregate budgets and headroom in Task 1; every candidate must pass those budgets without raising them.
- The Spike report must state the lowest real iOS/Safari version actually certified for strict frame-lock and the policy below that version or when RVFC is unavailable. API presence alone is not certification.
- After Task 14, stop at the mandatory Phase C exit review. Task 15 is blocked until the complete production regression matrix, budgets, rollback evidence, and architecture review are approved.
- Do not change `snap`, `stagedSnap`, `reading`, gesture admission, pause boundaries, copy cue thresholds, segment order, or visual design.
- Do not turn phone input into continuous drag/scrub in this migration. The resulting clock is scrub-ready, but interaction policy is a separate decision.
- Production code must never import `app/src/harness/frame-lock-spike/**`.
- Every strict request maps to an integer frame. `maxFrameError` is zero; the existing 50ms presentation tolerance is not accepted on strict paths.
- `video.play()` may remain only as an activation/decoder nudge behind the existing cover/inert candidate plane; it must pause before exposure and must not advance formal progress for a `frame-lock` direction.
- Packed-alpha readiness is proved by the active generation's successful Canvas draw, not by `seeked`, `readyState`, or `currentTime` alone.
- Preserve current resource budgets. Do not add a persistent decoder, `<video>`, Canvas, or WebGL context to any phone scene.
- Abort, seek, supersede, dispose, BFCache, reduced-motion, static fallback, and rollback contracts remain fail-closed.
- Keep the working tree's unrelated user changes intact. Each commit listed below is an execution boundary, not authorization to revert or reformat unrelated files.
- Run unit commands from `app/` unless the command explicitly starts from the repository root.

---

## Phase A — Disposable Technical Spike

### Task 1: Freeze the media/frame baseline

**Files:**

- Create: `app/scripts/report-frame-seek-assets.mjs`
- Create: `app/scripts/report-frame-seek-assets.test.mjs`
- Modify: `app/package.json`
- Create: `docs/superpowers/evidence/frame-lock-spike-baseline.md`

**Steps:**

- [ ] From `app/`, run `mkdir -p ../docs/superpowers/evidence` once so the committed evidence files have a dedicated directory.
- [ ] Add a Node test that imports a pure `summarizeFrameProbe()` export and feeds synthetic frame records with keyframes at `[0, 8, 16]`. Assert exact `frameCount`, `keyframeCount`, `maxGopFrames`, `fpsNumerator`, `fpsDenominator`, `firstPtsSeconds`, and `lastPtsSeconds`.
- [ ] Add a test that rejects variable-frame-rate input, missing frame PTS, a nonzero first PTS not represented in the report, and a frame count that differs from the frozen contract.
- [ ] Run `node --test scripts/report-frame-seek-assets.test.mjs` and confirm RED because the report module does not exist.
- [ ] Implement `report-frame-seek-assets.mjs` using `spawnSync('ffprobe', ...)`. Read the allowlisted sources from `homepage-media-contract.mjs`; do not scan arbitrary user directories.
- [ ] Include all WebM, HEVC alpha, and packed H.264 animation assets. For packed media, also compare color/alpha planes against its canonical WebM and record SSIM. Emit JSON to stdout; with `--markdown --output=<path>`, write the committed baseline table.
- [ ] Materialize and record the current media-budget report: every enforced ceiling, actual aggregate, remaining headroom, and `largestHomepageMediaBytes`. Explicitly state that the repository has no 16 MiB per-asset assertion. Treat the generated inventory as the source of truth rather than duplicating budget constants in the Spike script.
- [ ] Inspect the checked-in CDN/release policy for documented provider limits and record whether any external per-object cap is known. If a hosting limit is not represented in the repository, mark it `UNVERIFIED_EXTERNAL_CONSTRAINT` for the approval checkpoint instead of assuming it does not exist.
- [ ] Record `declaredProductMinimumIOS` from the repository's support policy. If no such policy exists, write `UNDECLARED`; do not silently equate the oldest available test device with the product requirement.
- [ ] Highlight AOD packed (3344×942, GOP 8, 2,637,788 bytes) and Figure2 packed (156 frames, GOP 30, 8,180,603 bytes) as candidate-size risk rows; these are baselines, not predicted GOP 1 outcomes.
- [ ] Add `"report:frame-seek-assets": "node scripts/report-frame-seek-assets.mjs --markdown"` to `app/package.json`.
- [ ] Run `node --test scripts/report-frame-seek-assets.test.mjs`; expect all tests PASS.
- [ ] Run `pnpm report:frame-seek-assets -- --output=../docs/superpowers/evidence/frame-lock-spike-baseline.md`; verify all assets include frame count, rational fps, first/last PTS, keyframe count, maximum GOP, bytes, and SHA-256, and packed assets include color/alpha SSIM.
- [ ] Run `pnpm verify:media:deep`; expect the existing frozen media contract to PASS unchanged.

**Commit:** `test(media): freeze frame-seek asset baseline`

### Task 2: Build the disposable exact-frame probe core

**Files:**

- Create: `app/src/harness/frame-lock-spike/spike-frame-map.ts`
- Create: `app/src/harness/frame-lock-spike/spike-frame-map.test.ts`
- Create: `app/src/harness/frame-lock-spike/strict-video-probe.ts`
- Create: `app/src/harness/frame-lock-spike/strict-video-probe.test.ts`
- Create: `app/src/harness/frame-lock-spike/spike-metrics.ts`
- Create: `app/src/harness/frame-lock-spike/spike-metrics.test.ts`

**Steps:**

- [ ] Write frame-map tests for exact endpoints, nearest-frame rounding, reverse mapping, nonzero first PTS, and 30000/1001 fps. Assert `progress=0` maps to `startFrame`, `progress=1` maps to `endFrame`, and every frame round-trips without changing its index.
- [ ] Run `pnpm vitest run src/harness/frame-lock-spike/spike-frame-map.test.ts`; expect RED for missing exports.
- [ ] Implement Spike-only rational frame math. Keep it local to the harness so the experiment can be deleted without leaving an accidental production dependency.
- [ ] Write strict probe tests with a fake video element. Assert one in-flight seek, latest queued request wins, old sequence resolves `stale`, only `requestVideoFrameCallback` metadata with the requested integer frame resolves `presented`, and abort/dispose never commits a late callback.
- [ ] Assert that `seeked` and a close `currentTime` do not resolve the strict probe.
- [ ] Implement the strict probe by using the existing media lifecycle helpers but keeping its experimental queue and API under the Spike directory.
- [ ] Write metric tests that calculate P50/P95/P99 using nearest-rank percentiles and count wrong-frame, stale-commit, monotonicity, long-frame, alpha-matte, and timeout failures.
- [ ] Include capability evidence in every result row: RVFC present/absent, callback failure, strict evidence type, browser engine, browser version, OS version, and device model when available.
- [ ] Run `pnpm vitest run src/harness/frame-lock-spike`; expect all Spike unit tests PASS.

**Commit:** `test(media): add disposable exact-frame probe core`

### Task 3: Add the PH Spike harness and browser matrix

**Files:**

- Create: `app/src/harness/frame-lock-spike/FrameLockSpikeHarness.tsx`
- Create: `app/src/harness/frame-lock-spike/FrameLockSpikeHarness.css`
- Create: `app/src/harness/frame-lock-spike/FrameLockSpikeHarness.test.tsx`
- Modify: `app/src/harness/HarnessRouter.tsx`
- Create: `app/e2e/frame-lock-spike.spec.ts`
- Create: `app/playwright.frame-lock.config.ts`

**Steps:**

- [ ] Add a component test that requests the deterministic sequence `[0, 1, 23, 45, 12, 44, 0]` for PH and asserts the table displays desired frame, presented frame, frame lag, evidence, latency, sequence, and stale count.
- [ ] Add a test that deliberately emits the previous sequence after a newer request and assert it is recorded as stale but not displayed as presented.
- [ ] Add a test for the PH media leg boundary: visual progress and the PH→Education copy/dissolve state cannot cross the media boundary until the matching frame receipt arrives.
- [ ] Run `pnpm vitest run src/harness/frame-lock-spike/FrameLockSpikeHarness.test.tsx`; expect RED.
- [ ] Implement `/harness/frame-lock-spike` with query modes `surface=desktop-ph`, `surface=phone-ph`, or `surface=asset&asset=<frozen-media-key>`, plus `sequence=forward|reverse|endpoints|random|pressure`. Resolve asset keys only from `homepage-media-contract.mjs`; use a fixed random seed in automated runs.
- [ ] Keep the route behind the existing harness availability gate. Add a release assertion that the production root does not link to or preload the Spike chunk.
- [ ] In `playwright.frame-lock.config.ts`, define `desktop-chromium`, `desktop-webkit`, `phone-chromium`, and `phone-webkit` projects with one worker and video/trace retained on failure.
- [ ] In E2E, assert every accepted receipt has `desiredFrame === presentedFrame`, endpoint receipts are exact, committed sequences are monotonically increasing, and no test records `seeked` as strict evidence.
- [ ] Add an RVFC-unavailable project/fixture case. It must produce `MEDIA_FRAME_CALLBACK_UNAVAILABLE` and the declared static fail-closed result; `requestAnimationFrame`, `seeked`, and close `currentTime` must not be accepted as strict proof. A legacy result is tested separately only for an entire runtime/direction frozen as a partial exception.
- [ ] Run `pnpm vitest run src/harness/frame-lock-spike/FrameLockSpikeHarness.test.tsx` and expect PASS.
- [ ] Run `pnpm exec playwright test --config playwright.frame-lock.config.ts --grep "PH"`; collect machine-readable metrics for all four projects.

**Commit:** `feat(harness): add PH frame-lock spike`

### Task 4: Add packed-alpha Canvas proof and Crane barrier pressure

**Files:**

- Create: `app/src/harness/frame-lock-spike/strict-packed-probe.ts`
- Create: `app/src/harness/frame-lock-spike/strict-packed-probe.test.ts`
- Create: `app/src/harness/frame-lock-spike/spike-frame-barrier.ts`
- Create: `app/src/harness/frame-lock-spike/spike-frame-barrier.test.ts`
- Modify: `app/src/harness/frame-lock-spike/FrameLockSpikeHarness.tsx`
- Modify: `app/e2e/frame-lock-spike.spec.ts`

**Steps:**

- [ ] Add packed-probe tests asserting that video RVFC alone is insufficient, a Canvas draw for the active generation and exact target frame resolves, an old generation draw is stale, `render() === false` rejects, and context loss fails closed.
- [ ] Add barrier tests for two clocks. Assert the faster Crane surface cannot commit alone, both exact receipts produce one master receipt, either stale makes the group stale, either failure rejects the group, and dispose aborts both children.
- [ ] Run the two new Vitest files and confirm RED.
- [ ] Implement Canvas proof by observing the production packed compositor callback and reading its active generation/media time only after a successful draw.
- [ ] Implement the Spike barrier with one sequence shared by figure and flock. Do not create a third video or Canvas.
- [ ] Add `surface=phone-crane` and run forward, reverse, endpoints, seeded random, and 16ms latest-wins pressure sequences.
- [ ] In E2E, assert zero logical-frame difference between figure and flock at every committed sequence and assert both WebGL contexts are released under the existing retirement rules.
- [ ] Run `pnpm vitest run src/harness/frame-lock-spike/strict-packed-probe.test.ts src/harness/frame-lock-spike/spike-frame-barrier.test.ts`; expect PASS.
- [ ] Run `pnpm exec playwright test --config playwright.frame-lock.config.ts --grep "Crane|packed"`; expect all browser projects to complete and metrics JSON to be generated.

**Commit:** `feat(harness): prove packed-alpha and Crane frame barriers`

### Task 5: Run GOP experiments and issue the migration decision report

**Files:**

- Create: `app/scripts/rebuild-frame-lock-spike-candidates.mjs`
- Create: `app/scripts/rebuild-frame-lock-spike-candidates.test.mjs`
- Modify: `app/src/harness/frame-lock-spike/FrameLockSpikeHarness.tsx`
- Create: `docs/superpowers/evidence/frame-lock-spike-results.md`

**Steps:**

- [ ] Test the candidate script's CLI parser. Accept only exact animation source keys exported by `homepage-media-contract.mjs`; allow only GOP `8` or `1`; require output under repository `tmp/frame-lock-spike/`; reject an output under `assets/`.
- [ ] Run `node --test scripts/rebuild-frame-lock-spike-candidates.test.mjs`; expect RED.
- [ ] Implement candidate generation by reusing the same canonical masters, dimensions, fps, pixel layout, color metadata, and encoder family as the canonical rebuild scripts. Candidate generation must never overwrite a frozen asset and must reject a source with no qualified canonical master.
- [ ] Run integrated PH and Crane plus the raw-surface sweep over every cinematic WebM, HEVC alpha, and packed H.264 asset. For each failing asset, generate a GOP 8 candidate and rerun; only if GOP 8 fails, generate GOP 1 and rerun.
- [ ] Record for each browser/device and candidate: bytes, delta from the frozen asset, projected homepage runtime-media total/headroom after replacement, max GOP, P50/P95/P99 seek-to-present, maximum frame lag, wrong receipts, stale commits, monotonicity errors, long frames, alpha failures, decoder/Canvas/WebGL peaks, and pass/fail.
- [ ] Run the same harness sequences on real iPhone Safari for the declared product minimum candidate, when one exists, and the current supported version. If the product minimum is `UNDECLARED`, test the oldest accessible candidate plus current and leave product-minimum approval open. Record iOS/Safari version, device model, RVFC presence, and exact evidence; if enough versions are unavailable, report only the certified version set and do not infer a lower minimum from Playwright WebKit.
- [ ] Write `frame-lock-spike-results.md` with exactly one of `Decision: GO_FULL`, `Decision: GO_PARTIAL`, or `Decision: NO_GO`; include `minimumSupportedIOSForFrameLock`, the below-minimum static/unsupported policy and any whole-direction exceptions, selected asset variant per semantic surface, and runtime/direction/atomic-group eligibility tables.
- [ ] For `GO_PARTIAL`, record every excluded resource and all dependent desktop/phone directions, why it failed, the preserved legacy/static behavior, user-visible impact, and the condition required to retry. Crane figure/flock must have one shared eligibility result.
- [ ] Apply the hard gates from the design spec: zero wrong/stale commits, zero-frame logical mismatch, P95 ≤100ms, P99 ≤180ms, no two consecutive UI frames >50ms, no alpha failure, and no resource-budget increase.
- [ ] A candidate that breaks any existing aggregate budget is ineligible even if its seek latency passes; do not raise a budget or invent an undocumented single-asset allowance.
- [ ] If all surfaces pass, record `GO_FULL`. If failures or an unacceptable phone support floor can be completely isolated while the shared clock and remaining approved groups pass, propose `GO_PARTIAL`. If strict proof fails generally, no safe eligibility set exists, or the product rejects the partial/static support policy, record `NO_GO` and end execution here.
- [ ] Request explicit approval for the decision, iOS policy, selected encodes, and exact eligibility/exclusion tables before Task 6. A report alone does not authorize production migration.

**Commit:** `docs(media): record frame-lock spike decision`

---

## Phase B — Asset Promotion and Shared Production Clock (`GO_FULL` or approved `GO_PARTIAL` only)

### Task 6: Promote only the GOP candidates required by the Spike

**Files:**

- Modify only for selected failing assets: `app/scripts/rebuild-figure2-packed-alpha-media.mjs`
- Modify only for selected failing assets: `app/scripts/rebuild-unit6-packed-alpha-media.mjs`
- Modify only for selected failing assets: `app/scripts/rebuild-aod-packed-alpha-media.mjs`
- Modify only for selected failing assets: `app/scripts/rebuild-hevc-alpha-media.mjs`
- Modify only for selected failing assets: `app/scripts/rebuild-crane-figure-media.mjs`
- Modify only for selected failing assets: `app/scripts/rebuild-crane-flock-media.mjs`
- Create: `app/scripts/rebuild-hero-packed-alpha-media.mjs`
- Create: `app/scripts/rebuild-hero-packed-alpha-media.test.mjs`
- Modify: `app/package.json`
- Modify: `app/scripts/homepage-media-contract.mjs`
- Modify: `app/scripts/verify-homepage-media-deep.mjs`
- Modify: `app/scripts/verify-homepage-media-inventory.mjs`
- Create: `app/scripts/frame-lock-eligibility-contract.json`
- Create: `app/scripts/frame-lock-eligibility-contract.test.mjs`
- Replace only selected binaries under: `assets/`

**Steps:**

- [ ] Add a reproducible Hero packed-alpha rebuild script and test because `figure1-rgb-alpha.mp4` currently has no dedicated canonical rebuild command. Read expected fps, frame count, dimensions, and alpha layout from the frozen contract; require candidate color and alpha SSIM to be no more than 0.001 below the current frozen Hero baseline; stage output before any replacement. Add `rebuild:media:hero-packed` to `app/package.json`.
- [ ] Read the approved decision report and list the exact eligible assets whose current GOP failed. Do not replace an asset that passed or an ineligible asset retained for legacy/static use. If every approved canonical asset passed, keep the new Hero reproducibility script, run the three verification commands below, and make no binary changes.
- [ ] Freeze the approved decision into `frame-lock-eligibility-contract.json`: schema version, approval ID, decision, certified iOS set/minimum, exact desktop and phone direction IDs, atomic groups, and excluded directions with reason/retry key. Add a Node test rejecting overlap, unknown IDs, a split Crane group, or an unrecorded exception. Append the frozen contract's SHA-256 and approval ID to the evidence report; later metric rows must not rewrite the approved eligibility snapshot.
- [ ] Change each affected canonical rebuild script to the smallest passing GOP from the report, preserving dimensions, fps, pixel layout, alpha semantics, color metadata, and encoder family.
- [ ] Rebuild into temporary output, run deep verification, then replace the exact allowlisted canonical file.
- [ ] Update bytes, SHA-256, keyframe count/max GOP, and frame metadata in the frozen contract.
- [ ] Recompute the same budget projection recorded by the Spike and prove the promoted asset set stays within every existing media budget with no ceiling changes.
- [ ] Assert frame count, first/last PTS, visual dimensions, alpha layout, and duration did not drift.
- [ ] Run `node --test scripts/frame-lock-eligibility-contract.test.mjs`; expect the approved runtime/direction sets, atomic groups, and exceptions to PASS.
- [ ] Run `pnpm verify:media`, `pnpm verify:media:deep`, and `pnpm verify:phone-packed-alpha`; expect PASS.
- [ ] Run `pnpm build`; expect CDN and release manifest generation PASS with the selected hashes.

**Commit when assets or contracts change:** `build(media): promote validated frame-seek encodes`

### Task 7: Implement the rational production frame timebase

**Files:**

- Create: `app/src/media/frame-timebase.ts`
- Create: `app/src/media/frame-timebase.test.ts`
- Create: `app/src/media/video-frame-maps.ts`
- Create: `app/src/media/video-frame-maps.test.ts`
- Modify: `app/scripts/homepage-media-contract.mjs`
- Modify: `app/scripts/verify-homepage-media-deep.mjs`
- Create: `app/scripts/verify-homepage-media-deep.test.mjs`

**Steps:**

- [ ] Port the accepted math as a clean implementation; do not copy Spike queue or harness UI code.
- [ ] Test the exact signatures in the design spec and add validation for positive rational fps, finite first PTS, nonempty frame range, and `0 <= startFrame <= endFrame < frameCount`.
- [ ] Add `VIDEO_FRAME_MAPS`, keyed by `'hero-figure-motion'`, `'aod-figure-motion'`, `'figure2-pair-motion'`, `'figure3-motion'`, `'ttg-figure-motion'`, `'ph-figure-motion'`, `'crane-figure-motion'`, and `'crane-flock-motion'`. Add exhaustive round-trip tests over every frame.
- [ ] Run `pnpm vitest run src/media/frame-timebase.test.ts src/media/video-frame-maps.test.ts`; expect RED before implementation and PASS after it.
- [ ] Add matching `frameMap` metadata to the script-side canonical video contracts. Use `fpsNumerator`, `fpsDenominator`, `firstPtsSeconds`, `frameCount`, `startFrame`, and `endFrame`; do not derive them from DOM duration.
- [ ] Extend deep media verification to compare ffprobe fps/frame count/PTS/keyframes to each map and to assert WebM, HEVC alpha, and packed variants of one semantic animation match the same production map.
- [ ] Run `pnpm verify:media:deep`; expect PASS for all current/selected assets.

**Commit:** `feat(media): add exact rational frame timebase`

### Task 8: Make `TimelineVideoDriver` emit strict physical receipts

**Files:**

- Modify: `app/src/media/timeline-video-driver.ts`
- Modify: `app/src/media/timeline-video-driver.test.ts`
- Create: `app/src/media/presented-frame-clock.ts`
- Create: `app/src/media/presented-frame-clock.test.ts`

**Steps:**

- [ ] Add RED tests extending `TimelineVideoFrameResult` with `targetFrameIndex`, `presentedFrameIndex`, `mediaTimeSeconds`, and original physical evidence.
- [ ] Add strict-mode tests: RVFC metadata quantizes to the target frame; adjacent-frame metadata stays pending/retries; generic `seeked` fallback never resolves; a cached proof may be reused only for the exact same integer frame; latest-wins and abort semantics remain intact.
- [ ] Keep the existing RVFC-unavailable failure explicit. Strict video clocks must return `MEDIA_FRAME_CALLBACK_UNAVAILABLE`; a migrated direction may enter only its approved static fail-closed policy and must never silently use the compositor's rAF fallback as frame evidence. Legacy animation is allowed only when that entire runtime/direction is a frozen partial exception.
- [ ] Keep all legacy tests green. The tolerant driver mode must retain current behavior until its manifest direction is migrated.
- [ ] Modify the driver to store actual callback `metadata.mediaTime`, not the requested target time, as its ready observation.
- [ ] Add an exact presentation policy requiring a `VideoFrameMap`. Keep `TIMELINE_VIDEO_PRESENTATION_TOLERANCE_SECONDS` scoped only to legacy compatibility.
- [ ] Implement `createVideoPresentedFrameClock(video)` as an adapter over the shared driver; do not create a second seek queue for the same video.
- [ ] Add diagnostics for desired/presented frame, lag, sequence, evidence, seek ms, and stale count. Clear them on dispose.
- [ ] Run `pnpm vitest run src/media/timeline-video-driver.test.ts src/media/presented-frame-clock.test.ts`; expect PASS.
- [ ] Run `pnpm typecheck`; expect PASS.

**Commit:** `feat(media): return exact presented-frame receipts`

### Task 9: Add packed/scene Canvas clocks and the production barrier

**Files:**

- Modify: `app/src/media/packed-alpha-video.ts`
- Modify: `app/src/media/packed-alpha-video.test.ts`
- Modify: `app/src/media/phone-packed-alpha-surface.ts`
- Modify: `app/src/media/phone-packed-alpha-surface.test.ts`
- Create: `app/src/media/presented-frame-barrier.ts`
- Create: `app/src/media/presented-frame-barrier.test.ts`

**Steps:**

- [ ] Extend the compositor's physical frame callback to report actual media time after a successful draw.
- [ ] Extend `PhonePackedAlphaSurfaceFrame` with `mediaTimeSeconds`, `frameIndex`, and `generation`. Add a `presentFrame(request)` method to `PhonePackedAlphaSurface` that uses its existing compositor and decoder.
- [ ] Test exact target equality, generation/sequence rejection, latest-wins, render failure, context loss, soft release, terminal dispose, and retained Canvas reactivation.
- [ ] Implement a scene-Canvas receipt helper for composites such as Phone Figure3; it resolves only after that scene's Canvas draw returns success for the target media frame.
- [ ] Implement `PresentedFrameBarrier` over two or more clocks with a shared sequence and abort signal. The returned `presentedProgress` must come from the request's master mapping only after all child exact-frame receipts pass.
- [ ] Add tests proving no partial commit and no leaked waiter/callback on failure or dispose.
- [ ] Run `pnpm vitest run src/media/packed-alpha-video.test.ts src/media/phone-packed-alpha-surface.test.ts src/media/presented-frame-barrier.test.ts`; expect PASS.
- [ ] Run `pnpm verify:phone-packed-alpha`; expect PASS.

**Commit:** `feat(media): add Canvas receipts and atomic frame barrier`

---

## Phase C — Desktop Runtime and Scene Migration

### Task 10: Introduce the desktop desired/presented commit path

**Files:**

- Modify: `app/src/story/types.ts`
- Modify: `app/src/story/presentation.ts`
- Create: `app/src/story/presented-progress-coordinator.ts`
- Create: `app/src/story/presented-progress-coordinator.test.ts`
- Create: `app/src/media/frame-lock-rollout.ts`
- Create: `app/src/media/frame-lock-rollout.test.ts`
- Modify: `app/src/story/segment-player.ts`
- Modify: `app/src/story/segment-player.test.ts`
- Modify: `app/src/story/synthetic-modules.tsx`
- Modify: `app/src/story/manifest.ts`
- Modify: `app/src/story/manifest.test.ts`

**Steps:**

- [ ] Add `'frame-lock'` to `MediaPlaybackDirectionContract.mode` and add the `SegmentProgressRequest`, `SegmentProgressReceipt`, and optional `presentProgress()` contracts from the design spec.
- [ ] Test a generic coordinator with one in-flight presentation, one latest queued desired progress, strictly increasing sequence, stale discard, abort, timeout propagation, and synchronous `runtime` receipts for non-media ranges.
- [ ] Add SegmentPlayer tests for each policy:
  - `snap`: desired progress does not update `run.progress` or complete the run before the receipt;
  - `scrub`: repeated requests coalesce and snap-after-idle begins from the last presented progress;
  - `stagedSnap`: pause/resume and stage milestones occur only after the boundary receipt;
  - reduced motion: only the exact endpoint receipt commits;
  - abort/supersede: late receipt cannot call `timeline.progress()` or mailbox completion.
- [ ] Run the targeted tests and confirm RED.
- [ ] Implement the coordinator. For a `frame-lock` direction, `SegmentPlayer` owns timing for snap/staged/scrub and never invokes the timeline's internal native clock as formal playback.
- [ ] Keep `timeline.progress()` as the single synchronous visual commit. For migrated timelines it must not issue a media seek.
- [ ] Add a temporary `VITE_DISABLE_FRAME_LOCKED_MEDIA=1` migration helper. When set, a scene's `presentProgress()` must issue the existing tolerant timeline seek and immediately return desired progress tagged as migration-only legacy evidence; it must not route back to `timeline.play()`/`reverse()` or native playback. Cover both branches with a test and delete the helper/evidence in Task 20.
- [ ] Update synthetic timelines so contract tests can deterministically delay/resolve receipts.
- [ ] Run `pnpm vitest run src/story/presented-progress-coordinator.test.ts src/story/segment-player.test.ts src/story/manifest.test.ts`; expect PASS.
- [ ] Run the full `pnpm test`; expect no legacy policy regressions.

**Commit:** `feat(story): gate desktop progress on presented frames`

### Task 11: Migrate desktop PH as the vertical slice

**Files:**

- Modify: `app/src/scenes/ph-animation/index.tsx`
- Modify: `app/src/scenes/ph-animation/progress.test.ts`
- Modify: `app/src/transitions/shared/ink.ts`
- Modify: `app/src/transitions/shared/ink.test.ts`
- Modify: `app/src/transitions/shared/stagedMediaHandoff.ts`
- Modify: `app/src/transitions/shared/stagedMediaHandoff.test.ts`
- Modify: `app/src/transitions/lab-ph/index.ts`
- Modify: `app/src/transitions/ph-education/index.ts`
- Modify: `app/src/transitions/group6-transitions.test.ts`
- Modify: `app/src/story/manifest.ts`
- Modify: `app/e2e/r4-g6.spec.ts`

**Steps:**

- [ ] Add optional source/target media presenter callbacks to `createInkSegmentTransition`. A proven static endpoint returns runtime receipts for the rest of an incoming ink segment; an unproven endpoint must be prepared exactly before progress commits.
- [ ] Split PH into `requestPhAnimationFrame()` and render-only `renderPhAnimationProgress()`. The request owns the media clock; render consumes presented progress without calling `driveTimelineVideo()`.
- [ ] Add tests that forward and reverse both request exact frames and never start formal native playback.
- [ ] Extend `StagedMediaHandoffTimeline` with `presentProgress()`: map only the media leg through PH's frame clock and return immediate runtime receipts for the dissolve leg.
- [ ] Assert the staged stop, Education visibility, and any cue cannot advance on a delayed PH receipt.
- [ ] If PH is in the approved eligibility set, change both directions of the `lab-ph` incoming endpoint contract and the `ph-education` motion contract to `frame-lock`; otherwise leave the whole dependency group unchanged and record this task as skipped by the approved exception table.
- [ ] Run `pnpm vitest run src/scenes/ph-animation/progress.test.ts src/transitions/shared/ink.test.ts src/transitions/shared/stagedMediaHandoff.test.ts src/transitions/group6-transitions.test.ts src/story/segment-player.test.ts`; expect PASS.
- [ ] Run `pnpm exec playwright test e2e/r4-g6.spec.ts`; expect forward, reverse, pause/resume, endpoint, and recovery cases PASS.

**Commit:** `feat(ph): lock desktop handoff to presented video frames`

### Task 12: Migrate desktop Hero, AOD, and Figure2

**Files:**

- Modify: `app/src/scenes/hero/index.tsx`
- Modify: `app/src/scenes/hero/progress.test.ts`
- Modify: `app/src/scenes/aod-animation/index.tsx`
- Modify: `app/src/scenes/aod-animation/progress.test.ts`
- Modify: `app/src/scenes/figure2-animation/index.tsx`
- Modify: `app/src/scenes/figure2-animation/progress.test.ts`
- Modify: `app/src/transitions/hero-pattern/index.ts`
- Modify: `app/src/transitions/hero-pattern/index.test.ts`
- Modify: `app/src/transitions/star-map-aod/index.ts`
- Modify: `app/src/transitions/star-map-aod/inkCurtain.test.ts`
- Modify: `app/src/transitions/figure2-distance-expand/index.ts`
- Modify: `app/src/transitions/method-bottom-figure2/index.ts`
- Modify: `app/src/transitions/method-bottom-figure2/index.test.ts`
- Modify: `app/src/transitions/figure2-proof-chain.test.ts`
- Modify: `app/src/transitions/aod-method-top/index.ts`
- Modify: `app/src/transitions/aod-method-top/index.test.ts`
- Modify: `app/src/story/manifest.ts`
- Modify: `app/e2e/r4-g1.spec.ts`
- Modify: `app/e2e/r4-g2.spec.ts`
- Modify: `app/e2e/r4-g3.spec.ts`

**Steps:**

- [ ] Export `HERO_MEDIA_KEY = 'hero-figure-motion'`. For each scene, import its exact map from `VIDEO_FRAME_MAPS` and split request from visual render.
- [ ] Add a `hero-pattern` media playback contract using `HERO_MEDIA_KEY`, with both directions `frame-lock` and `terminalFallbackScene: 'pattern'`.
- [ ] Migrate only approved Hero/AOD/Figure2 direction groups to `frame-lock`; retain non-media subranges as runtime receipts and leave every ineligible dependency group on its frozen legacy/static contract.
- [ ] Assert visual props, masks, depth layers, copy cues, and retained Figure2 arch use `presentedProgress`, not desired progress.
- [ ] Add a Figure2 staged test where a delayed frame cannot cross its stop and a reverse request begins from the last presented frame.
- [ ] Assert no `video.play()` call is a formal clock in these directions and existing activation nudge behavior remains covered.
- [ ] Run `pnpm vitest run src/scenes/hero/progress.test.ts src/scenes/aod-animation/progress.test.ts src/scenes/figure2-animation/progress.test.ts src/transitions/hero-pattern/index.test.ts src/transitions/star-map-aod/inkCurtain.test.ts src/transitions/aod-method-top/index.test.ts src/transitions/method-bottom-figure2/index.test.ts src/transitions/figure2-proof-chain.test.ts src/story/manifest.test.ts`; expect PASS.
- [ ] Run `pnpm exec playwright test e2e/r4-g1.spec.ts e2e/r4-g2.spec.ts e2e/r4-g3.spec.ts`; expect desktop forward/reverse and endpoint parity PASS.

**Commit:** `feat(media): frame-lock desktop Hero AOD and Figure2`

### Task 13: Migrate desktop Figure3 and TTG

**Files:**

- Modify: `app/src/scenes/figure3-animation/index.tsx`
- Modify: `app/src/scenes/figure3-animation/progress.test.ts`
- Modify: `app/src/scenes/ttg-animation/index.tsx`
- Modify: `app/src/transitions/brand-figure3/index.ts`
- Modify: `app/src/transitions/figure3-services/index.ts`
- Modify: `app/src/transitions/services-ttg/index.ts`
- Modify: `app/src/transitions/ttg-lab/index.ts`
- Modify: `app/src/transitions/group4-transitions.test.ts`
- Modify: `app/src/transitions/group5-transitions.test.ts`
- Modify: `app/src/story/manifest.ts`
- Modify: `app/e2e/r4-g4.spec.ts`
- Modify: `app/e2e/r4-g5.spec.ts`
- Modify: `app/e2e/r5-ttg-alpha.spec.ts`

**Steps:**

- [ ] Add exact request/render separation for Figure3 and TTG, including forward paths that currently prefer native playback.
- [ ] Drive Figure3 paper/composite state and Services copy cue from the receipt's presented progress.
- [ ] Drive TTG alpha, Lab dissolve, and reverse handoff from presented progress.
- [ ] Set only approved Figure3/TTG direction groups to `frame-lock` and update exact manifest expectations; an excluded shared resource keeps all dependent directions legacy/static.
- [ ] Test delayed, stale, reverse, endpoint, and static-fallback receipts.
- [ ] Run `pnpm vitest run src/scenes/figure3-animation/progress.test.ts src/transitions/group4-transitions.test.ts src/transitions/group5-transitions.test.ts src/story/manifest.test.ts`, then `pnpm exec playwright test e2e/r4-g4.spec.ts e2e/r4-g5.spec.ts`; expect PASS.
- [ ] Run `pnpm exec playwright test --config playwright.release.config.ts --project=phone-portrait-chromium --project=phone-portrait-webkit e2e/r5-ttg-alpha.spec.ts`; expect PASS.

**Commit:** `feat(media): frame-lock desktop Figure3 and TTG`

### Task 14: Migrate desktop Crane with atomic dual-surface commits

**Files:**

- Modify: `app/src/scenes/crane-animation/index.tsx`
- Modify: `app/src/scenes/crane-animation/progress.test.tsx`
- Modify: `app/src/transitions/education-crane/index.ts`
- Modify: `app/src/transitions/crane-contact/index.ts`
- Modify: `app/src/transitions/group7-transitions.test.ts`
- Modify: `app/src/story/manifest.ts`
- Modify: `app/e2e/r4-g7.spec.ts`
- Modify: `app/e2e/r5-crane-media.spec.ts`

**Steps:**

- [ ] Give figure and flock separate exact frame maps and child clocks.
- [ ] Use `PresentedFrameBarrier` for every media-owned Crane progress request. Never commit one surface alone.
- [ ] Render Crane layers, Contact entrance, and the 0.8 copy cue from the barrier receipt's master `presentedProgress`.
- [ ] Add tests for figure-first, flock-first, stale-one-side, fail-one-side, reverse, endpoints, abort, and resource retirement.
- [ ] If the Crane atomic group is approved, set both directions of the `education-crane` endpoint and `crane-contact` motion contracts to `frame-lock`; otherwise skip the entire pair—never migrate only figure or flock.
- [ ] Run `pnpm vitest run src/scenes/crane-animation/progress.test.tsx src/transitions/group7-transitions.test.ts src/media/presented-frame-barrier.test.ts src/story/manifest.test.ts`, then `pnpm exec playwright test e2e/r4-g7.spec.ts`; expect PASS.
- [ ] Run `pnpm exec playwright test --config playwright.release.config.ts --project=phone-portrait-chromium --project=phone-portrait-webkit e2e/r5-crane-media.spec.ts` and `pnpm run evidence:memory`; expect exact pair alignment and unchanged resource ceilings.

**Commit:** `feat(crane): atomically frame-lock desktop media pair`

---

## Mandatory Checkpoint C1 — Desktop Production Exit Review

**Files:**

- Create: `docs/superpowers/evidence/frame-lock-phase-c-review.md`
- Modify: `docs/superpowers/evidence/frame-lock-spike-results.md`

**Steps:**

- [ ] Freeze the exact Phase C commit and approved eligibility/exclusion tables. Confirm every desktop manifest direction matches the Spike decision and no ineligible group changed clocks or assets.
- [ ] Run the complete unit, typecheck, lint, build, media/deep-media, phone-architecture, release Playwright, and process-memory gates—not only the Task 11–14 focused suites. The phone rows remain a regression baseline at this checkpoint.
- [ ] On desktop Chrome and Safari, review forward, reverse, endpoints, rapid direction changes, staged PH pause/resume, direct entry, static fallback, and Crane pair pressure. Record browser/OS/hardware identities and exact frame diagnostics.
- [ ] Exercise `VITE_DISABLE_FRAME_LOCKED_MEDIA=1` against every migrated desktop direction and prove rollback restores the migration-only tolerant path without reintroducing native playback as the formal clock.
- [ ] Review the shared API surface (`PresentedFrameClock`, coordinator, barrier, manifest modes), asset/budget deltas, error propagation, lifecycle cleanup, and the planned phone reuse. Record unresolved risks and owners.
- [ ] Write `frame-lock-phase-c-review.md` with exactly `Decision: PROCEED_TO_PHONE` or `Decision: HOLD`. A failing release row, budget regression, manifest mismatch, unresolved stale commit, or unapproved API change requires `HOLD`.
- [ ] Obtain explicit approval for `PROCEED_TO_PHONE`. Do not start Task 15 on an assumed approval.

---

## Phase D — Phone Runtime and Scene Migration

### Task 15: Make the phone media owner authoritative

**Files:**

- Modify: `app/src/production/phone-story/protocol.ts`
- Modify: `app/src/production/phone-story/protocol.test.ts`
- Modify: `app/src/production/phone-story/presentation.ts`
- Modify: `app/src/production/phone-story/presentation.test.ts`
- Modify: `app/src/production/phone-story/runtime.ts`
- Modify: `app/src/production/phone-story/runtime.test.ts`
- Modify: `app/src/production/phone-story/machine.ts`
- Modify: `app/src/production/phone-story/machine.test.ts`
- Modify: `app/src/production/phone-story/manifest.ts`
- Modify: `app/src/production/phone-story/choreography.test.ts`
- Modify: `app/src/media/frame-lock-rollout.ts`
- Modify: `app/src/media/frame-lock-rollout.test.ts`

**Steps:**

- [ ] Add `PhoneMediaFrameRequest`, `PhoneMediaFrameReceipt`, and optional `presentFrame()` to the leaf command port.
- [ ] Add `mediaClockMode: 'none' | 'legacy' | 'frame-lock'` to `PhoneSegmentChoreography` and its projected frame. Initially mark the seven current media-owner segments `legacy` and ownerless segments `none`; reject `mode: 'none'` with a non-`none` owner. Tasks 16–19 replace only values in the approved eligibility set.
- [ ] Add `presentedSequence` to `transition-progressed`; make the machine ignore a sequence that is not newer for the active transaction.
- [ ] Write runtime tests proving the scheduler may calculate desired progress while the machine and all leaf renders remain at the last presented progress.
- [ ] Assert only the choreography's current `mediaClockOwner` receives `presentFrame()`; source, target, effect, ink, opacity, foreground ownership, and plane projection all render together after its receipt.
- [ ] Assert a `mediaClockOwner: 'none'` frame receives an immediate runtime receipt without async delay.
- [ ] Cover latest-wins, transaction/frameToken/generation mismatch, direction reversal, staged boundary, pause/resume, timeout, rollback, pagehide/pageshow, dispose, and reduced motion.
- [ ] Cover RVFC-unavailable/callback-failure capability handling. A migrated strict direction must fail closed into its approved static policy without advancing desired progress; no runtime branch may treat rAF or `seeked` as strict evidence. A legacy animation path is reachable only when the whole phone direction is listed as a partial exception.
- [ ] Apply the shared migration kill switch to approved phone directions. With `VITE_DISABLE_FRAME_LOCKED_MEDIA=1`, return only the migration-only tolerant receipt path; do not re-enable native `video.play()` as the phone transaction clock. Cover eligible and partial-exception directions separately.
- [ ] Move `transition-progressed` enqueueing to the receipt commit path. Do not enqueue desired progress first.
- [ ] Preserve the existing activation-owner phase commands and resource leases.
- [ ] Run `pnpm vitest run src/production/phone-story/protocol.test.ts src/production/phone-story/presentation.test.ts src/production/phone-story/runtime.test.ts src/production/phone-story/machine.test.ts src/production/phone-story/manifest.test.ts src/production/phone-story/choreography.test.ts`; expect PASS.
- [ ] Run `pnpm run verify:phone-architecture:cutover`; expect PASS.

**Commit:** `feat(phone): make presented media frame the transition clock`

### Task 16: Migrate phone PH as the packed-alpha vertical slice

**Files:**

- Modify: `app/src/scenes/ph-animation/phone/PhonePh.tsx`
- Modify: `app/src/scenes/ph-animation/phone/PhonePh.reverse.ts`
- Modify: `app/src/scenes/ph-animation/phone/PhonePh.test.tsx`
- Modify: `app/src/scenes/ph-animation/phone/PhonePh.clean.test.tsx`
- Modify: `app/e2e/r5-phone-clean-runtime.spec.ts`
- Modify: `app/e2e/r5-phone-clean-presentation.spec.ts`

**Steps:**

- [ ] Implement `presentFrame()` using the existing PH packed surface and exact PH frame map for both directions.
- [ ] If PH is approved, set `ph-education` phone choreography to `mediaClockMode: 'frame-lock'` and update exact manifest/choreography assertions; otherwise skip the full PH dependency group.
- [ ] Remove the forward formal `video.play()` clock. If activation needs a nudge, pause it after activation and never derive transaction progress from it.
- [ ] Retire the separate reverse approximation once both directions use the shared exact clock; retain only mapping helpers still required by the scene.
- [ ] Assert the Canvas generation, frame index, and receipt sequence all match before returning presented.
- [ ] Test forward/reverse, rapid overwrite, endpoint, stale generation, Canvas renewal, context loss, static fallback, rollback, and disposal.
- [ ] Assert PH and Education opacity/dissolve state remains at the last presented progress during delayed seek.
- [ ] Run `pnpm vitest run src/scenes/ph-animation/phone/PhonePh.test.tsx src/scenes/ph-animation/phone/PhonePh.clean.test.tsx src/production/phone-story/runtime.test.ts src/production/phone-story/choreography.test.ts`, then run `pnpm exec playwright test --config playwright.release.config.ts --project=phone-portrait-chromium --project=phone-portrait-webkit e2e/r5-phone-clean-runtime.spec.ts e2e/r5-phone-clean-presentation.spec.ts`; expect PASS.
- [ ] Repeat the PH sequence on real iPhone Safari and append the production vertical-slice row to the Spike evidence report.

**Commit:** `feat(phone-ph): lock packed-alpha handoff to Canvas frames`

### Task 17: Migrate phone Hero, AOD, and Figure2

**Files:**

- Modify: `app/src/scenes/hero/phone/PhoneHero.motion.ts`
- Modify: `app/src/scenes/hero/phone/PhoneHero.tsx`
- Modify: `app/src/scenes/hero/phone/PhoneHero.test.tsx`
- Modify: `app/src/scenes/aod-animation/phone/PhoneAod.tsx`
- Modify: `app/src/scenes/aod-animation/phone/PhoneAod.test.tsx`
- Modify: `app/src/scenes/figure2-animation/phone/PhoneFigure2.tsx`
- Modify: `app/src/scenes/figure2-animation/phone/PhoneFigure2.test.tsx`
- Modify: `app/e2e/r5-phone-story.spec.ts`
- Modify: `app/e2e/r5-phone-rendering-lifecycle.spec.ts`

**Steps:**

- [ ] Add `presentFrame()` for each packed scene using its active `PhonePackedAlphaSurface` and exact frame map.
- [ ] Set only approved `hero-pattern`, `aod-method-top`, and `figure2-distance-expand` media-owned choreography frames to `frame-lock`; keep ownerless subranges as `none` and excluded groups as their frozen legacy/static modes.
- [ ] Ensure Hero's media subrange, AOD exit, and Figure2 staged media leg map local media progress back to one master transaction progress.
- [ ] Make `render()` visual-only for media ownership; it may composite the already-presented frame but cannot issue a second seek.
- [ ] Assert all packed callbacks require active frameToken, generation, and sequence.
- [ ] Cover direct entry, activation rejection, reverse, staged stop, retained Figure2 arch, resource budget, static fallback, and rapid navigation.
- [ ] Run `pnpm vitest run src/scenes/hero/phone/PhoneHero.test.tsx src/scenes/aod-animation/phone/PhoneAod.test.tsx src/scenes/figure2-animation/phone/PhoneFigure2.test.tsx src/production/phone-story/runtime.test.ts src/production/phone-story/choreography.test.ts`, then run `pnpm exec playwright test --config playwright.release.config.ts --project=phone-portrait-chromium --project=phone-portrait-webkit e2e/r5-phone-story.spec.ts e2e/r5-phone-rendering-lifecycle.spec.ts`; expect PASS.

**Commit:** `feat(phone-media): frame-lock Hero AOD and Figure2`

### Task 18: Migrate phone Figure3 and TTG

**Files:**

- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.tsx`
- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.test.tsx`
- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.clean.test.tsx`
- Modify: `app/src/scenes/ttg-animation/phone/PhoneTtg.tsx`
- Modify: `app/src/scenes/ttg-animation/phone/PhoneTtg.test.tsx`
- Modify: `app/src/scenes/ttg-animation/phone/PhoneTtg.clean.test.tsx`
- Modify: `app/e2e/r5-ttg-alpha.spec.ts`
- Modify: `app/e2e/r5-phone-clean-presentation.spec.ts`

**Steps:**

- [ ] For Figure3, return `scene-canvas-draw` only after the exact decoded video frame is drawn into the active paper/composite Canvas.
- [ ] For TTG's direct video surface, return `video-frame-callback` from exact RVFC metadata.
- [ ] Set only approved Figure3/TTG choreography groups to `mediaClockMode: 'frame-lock'`; direct-video RVFC absence on a migrated direction must follow the approved static policy, while legacy animation remains direction-wide exception behavior only.
- [ ] Split media request from visual-only render for both scenes and remove formal native playback clocks.
- [ ] Assert Figure3/Services and TTG/Lab thresholds use presented master progress.
- [ ] Test context/draw failure, direct video callback absence, stale generation, reverse, endpoint, fallback, and release.
- [ ] Run `pnpm vitest run src/scenes/figure3-animation/phone/PhoneFigure3.test.tsx src/scenes/figure3-animation/phone/PhoneFigure3.clean.test.tsx src/scenes/ttg-animation/phone/PhoneTtg.test.tsx src/scenes/ttg-animation/phone/PhoneTtg.clean.test.tsx src/production/phone-story/runtime.test.ts`, then run `pnpm exec playwright test --config playwright.release.config.ts --project=phone-portrait-chromium --project=phone-portrait-webkit e2e/r5-ttg-alpha.spec.ts e2e/r5-phone-clean-presentation.spec.ts`; expect PASS.

**Commit:** `feat(phone-media): frame-lock Figure3 and TTG`

### Task 19: Migrate phone Crane and prove pair retirement

**Files:**

- Modify: `app/src/scenes/crane-animation/phone/PhoneCrane.tsx`
- Modify: `app/src/scenes/crane-animation/phone/PhoneCrane.test.tsx`
- Modify: `app/src/scenes/crane-animation/phone/PhoneCrane.clean.test.tsx`
- Modify: `app/src/scenes/crane-animation/phone/PhoneCrane.motion.ts`
- Rename: `app/src/scenes/crane-animation/phone/PhoneCrane.autoplay.ts` → `app/src/scenes/crane-animation/phone/PhoneCrane.activation-nudge.ts`
- Modify: `app/e2e/r5-crane-media.spec.ts`
- Modify: `app/e2e/r5-phone-rendering-lifecycle.spec.ts`

**Steps:**

- [ ] Connect figure and flock packed clocks through `PresentedFrameBarrier`; keep the existing two-video/two-Canvas/two-WebGL budget.
- [ ] If the Crane atomic group is approved, set `crane-contact` phone choreography to `mediaClockMode: 'frame-lock'`; otherwise skip both packed surfaces and keep their shared legacy/static contract.
- [ ] Remove autoplay as a formal clock. Keep only an activation nudge helper if a tested Safari path needs it; rename the helper so its non-authoritative role is explicit.
- [ ] Map the flock's shorter terminal frame and figure's terminal frame to the same master progress without accepting a one-frame logical mismatch.
- [ ] Drive Contact visibility/copy and all Crane motion helpers from the barrier's presented progress.
- [ ] Test both completion orders, one-side timeout/failure, context loss, stale generation, reverse, endpoint, hidden retirement, BFCache, and rollback.
- [ ] Run `pnpm vitest run src/scenes/crane-animation/phone/PhoneCrane.test.tsx src/scenes/crane-animation/phone/PhoneCrane.clean.test.tsx src/media/presented-frame-barrier.test.ts src/production/phone-story/runtime.test.ts`, then run `pnpm exec playwright test --config playwright.release.config.ts --project=phone-portrait-chromium --project=phone-portrait-webkit e2e/r5-crane-media.spec.ts e2e/r5-phone-rendering-lifecycle.spec.ts` and `pnpm run evidence:memory`; expect exact pair commits and unchanged resource ceilings.
- [ ] Repeat the Crane pressure sequence on real iPhone Safari.

**Commit:** `feat(phone-crane): atomically frame-lock packed media pair`

---

## Phase E — Cutover and Cleanup

### Task 20: Complete the approved manifest cutover and retire migrated legacy clocks

**Files:**

- Modify: `app/src/story/types.ts`
- Modify: `app/src/story/manifest.ts`
- Modify: `app/src/story/manifest.test.ts`
- Modify: `app/src/media/timeline-video-driver.ts`
- Modify: `app/src/media/timeline-video-driver.test.ts`
- Delete: `app/src/media/frame-lock-rollout.ts`
- Delete: `app/src/media/frame-lock-rollout.test.ts`
- Modify: `app/src/scenes/hero/index.tsx`
- Modify: `app/src/scenes/aod-animation/index.tsx`
- Modify: `app/src/scenes/figure2-animation/index.tsx`
- Modify: `app/src/scenes/figure3-animation/index.tsx`
- Modify: `app/src/scenes/ttg-animation/index.tsx`
- Modify: `app/src/scenes/ph-animation/index.tsx`
- Modify: `app/src/scenes/crane-animation/index.tsx`
- Modify: `app/src/scenes/hero/phone/PhoneHero.motion.ts`
- Modify: `app/src/scenes/aod-animation/phone/PhoneAod.tsx`
- Modify: `app/src/scenes/figure2-animation/phone/PhoneFigure2.tsx`
- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.tsx`
- Modify: `app/src/scenes/ttg-animation/phone/PhoneTtg.tsx`
- Modify: `app/src/scenes/ph-animation/phone/PhonePh.tsx`
- Modify: `app/src/scenes/crane-animation/phone/PhoneCrane.tsx`
- Modify: `app/src/scenes/crane-animation/phone/PhoneCrane.activation-nudge.ts`
- Create: `app/scripts/verify-frame-lock-cutover.mjs`
- Create: `app/scripts/verify-frame-lock-cutover.test.mjs`
- Modify: `app/package.json`
- Modify: `app/src/production/release-manifest.test.ts`
- Modify: `docs/superpowers/evidence/frame-lock-spike-results.md`

**Steps:**

- [ ] Add a manifest test enumerating every cinematic direction and comparing it with the approved eligibility/exclusion tables. `GO_FULL` requires every media direction to be `frame-lock`; `GO_PARTIAL` requires exactly the approved set to be `frame-lock` and exactly the frozen exception set to remain `legacy`/`static-fallback`.
- [ ] Add the equivalent phone choreography assertion. Reject both an eligible owner left on `legacy` and an excluded owner silently switched to `frame-lock` without new Spike approval.
- [ ] Add `verify-frame-lock-cutover.mjs` and its Node test. It must read `frame-lock-eligibility-contract.json`, reject `native-preferred` and unapproved `video.play()` in migrated directions, and allow only the approved activation-prime helpers and the exact `GO_PARTIAL` legacy exception set. Add it as `verify:frame-lock-cutover` and invoke it from `build`.
- [ ] Remove `play`/legacy `timeline` formal modes only from migrated contracts and delete their unreachable branch state. Under `GO_PARTIAL`, keep the minimum implementation required by the explicit exception directions, without making it reachable from migrated directions.
- [ ] Before deleting the migration helper, run its rollback matrix across every migrated desktop and phone direction and archive the result in the evidence report. The flag must not change any frozen partial exception or resource budget.
- [ ] Remove the temporary `VITE_DISABLE_FRAME_LOCKED_MEDIA` helper and its migration-only legacy evidence variant after the approved set passes. Rollback for a migrated direction is through a reviewed manifest/code revert plus existing static fallback; the frozen partial exceptions are not migration rollback branches.
- [ ] Scope or remove the 50ms tolerance so it cannot be reached by any production cinematic frame-lock path.
- [ ] Ensure diagnostics clear on retirement and are absent from static holds.
- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`; expect PASS.

**Commit:** `refactor(media): complete frame-clock cutover`

### Task 21: Run the full release and real-device acceptance matrix

**Files:**

- Modify: `app/e2e/r5-homepage-media.spec.ts`
- Modify: `app/e2e/r5-performance.spec.ts`
- Modify: `app/e2e/r5-matrix.spec.ts`
- Modify: `app/e2e/r5-phone-story.spec.ts`
- Modify: `app/e2e/r5-phone-clean-runtime.spec.ts`
- Modify: `app/e2e/r5-phone-clean-presentation.spec.ts`
- Modify: `app/e2e/r5-phone-rendering-lifecycle.spec.ts`
- Modify: `app/e2e/r5-crane-media.spec.ts`
- Modify: `docs/superpowers/evidence/frame-lock-spike-results.md`

**Steps:**

- [ ] Add release assertions for exact desired/presented frame equality, no stale commit, monotonic committed sequence, endpoint proof, and allowed evidence per surface.
- [ ] Add exact eligibility assertions: every approved direction reports strict evidence, every partial exception reports its declared legacy/static mode, and no direction changes category at runtime without an approved capability fallback.
- [ ] Run `pnpm test`; expect all Vitest tests PASS.
- [ ] Run `pnpm typecheck && pnpm lint`; expect zero errors.
- [ ] Run `pnpm build`; expect all architecture, media, release, performance, CDN, and manifest checks PASS.
- [ ] Run `pnpm exec playwright test --config playwright.release.config.ts`; expect all six configured desktop/mobile/phone projects PASS.
- [ ] Run `pnpm run evidence:memory:release`; expect all scene/transition resource budgets PASS.
- [ ] On every real iPhone Safari version claimed by the support matrix—especially `minimumSupportedIOSForFrameLock` and the current version—execute forward, reverse, endpoints, rapid direction changes, direct entry, background/foreground, BFCache, orientation change, activation rejection/retry, reduced motion, PH pause/resume, and every approved Crane dual-surface pressure path.
- [ ] On an RVFC-unavailable fixture/device when available, confirm the declared below-minimum static/unsupported policy and prove it cannot emit strict receipts. If continued legacy animation is required, confirm that the whole phone direction is an eligibility exception rather than a per-OS dual-clock branch.
- [ ] Confirm the final real-device metrics still meet the Spike hard gates and append release rows plus the final certified iOS range/set to the evidence report.
- [ ] If any hard gate regresses, stop release. Reclassifying an affected direction from frame-lock to legacy requires an updated `GO_PARTIAL` review and exact exception-table approval; do not silently revert a manifest direction or relax exact-frame correctness.

**Commit:** `test(release): certify frame-locked media matrix`

### Task 22: Delete the disposable Spike and close documentation

**Files:**

- Delete: `app/src/harness/frame-lock-spike/`
- Delete: `app/e2e/frame-lock-spike.spec.ts`
- Delete: `app/playwright.frame-lock.config.ts`
- Delete: `app/scripts/rebuild-frame-lock-spike-candidates.mjs`
- Delete: `app/scripts/rebuild-frame-lock-spike-candidates.test.mjs`
- Modify: `app/src/harness/HarnessRouter.tsx`
- Modify: `docs/superpowers/specs/2026-08-30-frame-locked-seek-timeline-design.md`
- Modify: `docs/superpowers/evidence/frame-lock-spike-results.md`

**Steps:**

- [ ] Prove no production import references the Spike with `rg -n "frame-lock-spike|FrameLockSpike" app/src app/e2e app/scripts`.
- [ ] Delete the disposable route, UI, probe queue, candidate generator, and Spike-only Playwright config. Keep the baseline report script, production frame-clock tests, and evidence report.
- [ ] Remove the route from `HarnessRouter` and assert unknown harness behavior remains unchanged.
- [ ] Mark the design status `Implemented — GO_FULL` or `Implemented — GO_PARTIAL` and add the final release commit/hash, selected GOP outcomes, iOS support conclusion, and any frozen exception/retry rows to the evidence report.
- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm exec playwright test --config playwright.release.config.ts`; expect PASS after deletion.
- [ ] From the repository root run `git diff --check` and `git status --short`; expect no whitespace errors and only intended files before the final commit.

**Commit:** `chore(media): remove frame-lock spike and finalize migration`

---

## Final Acceptance Checklist

- [ ] The final manifest exactly matches the approved decision: all directions are `frame-lock` for `GO_FULL`, or only the frozen exception table remains legacy/static for `GO_PARTIAL`.
- [ ] Integer target frame equals integer presented frame for every committed strict receipt.
- [ ] Visual layers, ink, Canvas composites, copy cues, staged pauses, machine progress, and completion use one `presentedProgress` per commit.
- [ ] Phone packed alpha proves Canvas draw for the active generation.
- [ ] Crane commits figure/flock atomically with zero logical-frame difference.
- [ ] No stale run/generation/frameToken/sequence can commit after abort, reverse, seek, dispose, or BFCache.
- [ ] Interaction policy and visual design are unchanged.
- [ ] P95/P99 latency, long-frame, alpha, memory, decoder, Canvas, and WebGL gates pass on the full browser matrix and every certified real iPhone Safari version.
- [ ] `minimumSupportedIOSForFrameLock` and the below-minimum/RVFC-missing behavior are documented, tested, and reflected in release evidence.
- [ ] Every promoted GOP candidate passes the existing aggregate media budgets; no 16 MiB single-asset gate is claimed unless separately implemented and tested.
- [ ] Frozen assets, SHA-256, frame maps, CDN manifest, and release manifest agree.
- [ ] The frozen eligibility contract, approval ID/hash, desktop manifest, phone choreography, cutover verifier, and evidence report agree exactly.
- [ ] Spike route, migration candidate generator, and migration kill switch are removed; `GO_PARTIAL` retains only the explicitly approved production exception paths.
