# Homepage Transition 15 Issue Remediation V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the original 15 homepage transition issues with real visual implementation and issue-level gate evidence.

**Architecture:** This plan separates three concerns that must not be collapsed: review wording, visual implementation, and verification. The capture harness must sample fresh-page, same-page forward, and same-page reverse paths; adapters must render real ink surfaces when a bridge claims `entryInk`, `exitInk`, or `paperWash`; the gate checker must write pass/fail results back to the JSON artifact. A dataset label is never enough to pass an ink bridge gate.

**Tech Stack:** Static HTML build via `scripts/build-index.mjs`, vanilla ESM transition adapters, WebGL ink effects from `js/effects/ink-scene-transition.js`, Playwright-backed capture, Node gate verification, and existing CSS entry files.

---

## Required Corrections From Review

The previous plan was useful but incomplete. Keep these corrections in force:

- #1 and #2 were mentioned but not implemented or gated. Add a real Home/Belief task.
- #3 must cover the Belief -> AOD continuity checkpoints `1843`, `2327`, and `2937`. Do not hide those under #2.
- `snapEntry` can remain a measured state, but it cannot pass a user-requested ink bridge unless a real ink surface is active.
- Figure2 already has real ink machinery. The fix is to expose and gate it, not rebuild it from scratch.
- Figure3, TTG, PH, and Crane currently lack homepage ink bridge surfaces. Their tasks must add canvas surfaces and `createInkCurtainTransition` or `createInkSceneTransition` calls.
- The harness must include same-page forward and same-page reverse captures. Fresh-page single checkpoints are not enough.
- Gate results must be written into `homepage-checkpoints.json` as `gateResults` and per-row `crosswalkEvidence.status`.
- #15 endpoint mode must be an approved spec source. Capture code must not silently hardcode a product decision.

## Corrected Issue Crosswalk

Use this as the authoritative 15 issue map.

| Issue | Checkpoints | Transition owner | Required closure |
| --- | --- | --- | --- |
| #1 | `886`, `919` | `home-belief` | No empty dark holding frame. Either meaningful visual content or entering copy is visible. |
| #2 | `1310`, `1699` | `home-belief` | Pattern Bloom and Belief do not read as disconnected scenes; Belief copy reaches opacity >= 0.35 by `1310` or the scene remains visibly active. |
| #3 | `1843`, `2327`, `2937` | `home-belief`, `belief-method` | Belief -> AOD reads as continuous ink or paper bridge; no no-copy limbo between Belief and AOD entry. |
| #4 | `3767`, `4598`, `5368` | `belief-method` | Method receiver opacity >= 0.55 before AOD scene opacity < 0.25; Method copy is inside the safe reading zone. |
| #5 | `6198`, `6451`, `6885` | `method-tooling__method-proof` | Figure2 entry has a real bridge and no stabilized no-copy frame. |
| #6 | `6198`, `6451` | `method-tooling__method-proof` | Proof copy opacity >= 0.80 and foreground overlap ratio <= 0.10. |
| #7 | `6762`, `6885`, `6944`, `7873` | `method-tooling__method-proof`, `brand-services` | Figure2 foreground retreats through real ink; proof, foreground, Brand receiver, and Figure3 handoff do not stack. |
| #8 | `7873`, `8703`, `9535` | `brand-services` | Services receiver reaches opacity >= 0.50 before Figure3 scene exit completes. |
| #9 | `9954`, `10784`, `11616` | `services-lab` | TTG entry and exit have real ink or paper-wash bridge; Lab copy starts before TTG video exits. |
| #10 | `11616` | `services-lab` plus layout | TTG/Lab boundary has documented single ownership for every visible horizontal line. |
| #11 | `12417` | owning content section | Right-column top is within 24px of the left lead copy top at 1440x840. |
| #12 | `13177`, `14007`, `14839` | `lab-education` | PH entry and exit have real ink or paper-wash bridge; Education content is visible in forward and reverse samples. |
| #13 | `14839` | `lab-education` plus layout | PH/Education boundary has documented single ownership for every visible horizontal line. |
| #14 | `16438`, `17268`, `18097` | `philosophy-contact` | Crane entry and exit have real ink or paper-wash bridge; Contact receiver opacity >= 0.45 before Crane scene opacity < 0.30. |
| #15 | `18523` | endpoint spec | Final viewport matches the approved endpoint mode and snap tolerance. |

## File Structure

- Create `docs/homepage-transition-current-status-2026-06-28.md`: corrected review status.
- Modify `scripts/capture-homepage-checkpoints.mjs`: corrected crosswalk, same-page capture modes, ink surface evidence, layout metrics, endpoint spec capture.
- Create `scripts/check-homepage-transition-gates.mjs`: issue-level gate checker with optional JSON write-back.
- Create `scripts/smoke-homepage-transition-wheel.mjs`: real wheel/trackpad-style smoke path for forward and reverse transition traversal.
- Modify `package.json`: add gate verification script.
- Modify `src/section-manifest.mjs`: add contracts and an explicit endpoint spec source.
- Modify `scripts/build-index.mjs`: inject endpoint and contract attributes from manifest; support method scene transition contract if needed.
- Modify `scripts/check-homepage-transition-integration.mjs`: update AOD timing assertions and add ink evidence assertions.
- Modify `scripts/check-section-transition-contract.mjs`: allow non-AOD contracts without mandatory `snapEntry`.
- Modify `js/transitions/pattern-bloom-adapter.js`: fix and expose Home/Belief phases and ink metrics.
- Modify `js/components/aod-transition.js` and `js/transitions/homepage/aod-homepage-adapter.js`: expose scene opacity, receiver timing, and real entry ink metrics.
- Modify `js/components/figure2-transition.js` and `js/transitions/homepage/figure2-homepage-adapter.js`: expose existing Figure2 ink, foreground, and receiver metrics.
- Modify `js/components/figure3-transition.js` and `js/transitions/homepage/figure3-homepage-adapter.js`: add real ink bridge and Services receiver.
- Modify `js/components/ttg-transition.js`, `js/components/ph-transition.js`, `js/components/crane-transition.js`, and their homepage adapters: add real ink bridge surfaces and receiver/copy metrics.
- Modify real CSS files only: `css/figure2.css`, `css/figure3-transition.css`, `css/components/figure3-transition.css`, `css/ttg.css`, `css/ph.css`, `css/crane.css`, `css/components/homepage-continuity.css`, and relevant section CSS.

Do not reference these non-existent files as modify targets: `css/components/figure2-transition.css`, `css/components/ttg-transition.css`, `css/components/ph-transition.css`, `css/components/crane-transition.css`.

## Global Gate Rules

- A row passes only when every required checkpoint has a desktop `fresh-page`, `same-page-forward`, and `same-page-reverse` sample and every required sample passes, unless the row is explicitly marked desktop-only or mobile-smoke.
- A bridge with `bridgeType=entryInk`, `bridgeType=exitInk`, or `bridgeType=paperWash` passes only when `inkSurfaces` includes an active surface for the same transition id and kind.
- In strict gates, `inkSurfaces[].active` requires `opacity >= 0.18`, `progress >= 0.05`, `activePixelRatioSource = "sampled-canvas"`, and `activePixelRatio >= 0.015`. Estimated active pixel ratios are debug-only and cannot pass a strict ink gate.
- Receiver matching must be exact by `transitionId`, `targetSection`, or `source`. Do not fall back to `receivers[0]`.
- AOD #4 must prove ordering: receiver opacity reaches threshold at a sample where scene opacity is still >= 0.25, or the nearest earlier sample satisfies that relation.
- Layout gates must use captured layout fields, not formulas written only in the plan.
- Endpoint gate fails while endpoint mode is `undecided`.
- Final release requires a real wheel smoke artifact in addition to programmatic `scrollTo` captures, because the transition runtime handles wheel/touch input differently from direct scroll jumps.

## Task 1: Correct Status Document And Crosswalk

**Files:**
- Create: `docs/homepage-transition-current-status-2026-06-28.md`
- Modify: `scripts/capture-homepage-checkpoints.mjs`

- [ ] **Step 1: Create the corrected status document**

Write:

```md
# Homepage Transition Current Status

Date: 2026-06-28
Worktree: `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/homepage-master-observer-runtime`

## Verdict

The homepage transition remediation is not complete.

The current worktree has Phase 0 harness work and a partial AOD -> Method pilot. None of the original 15 issues has closure evidence yet.

## Required Corrections

- #1 and #2 require a real Home/Belief implementation task and gate.
- #3 is Belief -> AOD continuity at `1843`, `2327`, and `2937`; it must not be replaced by `3767/4598`.
- `snapEntry` is not enough to pass a required ink bridge.
- Figure2 already has real ink; the plan must expose and gate it.
- Figure3, TTG, PH, and Crane need real ink surfaces, not only `transitionBridgeType` labels.
- Final endpoint mode remains undecided until an approved spec is declared.
```

- [ ] **Step 2: Replace `CROSSWALK` in capture script**

Use:

```js
const CROSSWALK = [
  { issue: 1, checkpoints: [886, 919], phase: 'Phase 2.1', transitionIds: ['home-belief'], gate: 'home-belief' },
  { issue: 2, checkpoints: [1310, 1699], phase: 'Phase 2.1', transitionIds: ['home-belief'], gate: 'home-belief' },
  { issue: 3, checkpoints: [1843, 2327, 2937], phase: 'Phase 2.2 entry', transitionIds: ['home-belief', 'belief-method'], gate: 'belief-aod-entry' },
  { issue: 4, checkpoints: [3767, 4598, 5368], phase: 'Phase 2.2 pilot', transitionIds: ['belief-method'], gate: 'aod-method' },
  { issue: 5, checkpoints: [6198, 6451, 6885], phase: 'Phase 3.1', transitionIds: ['method-tooling__method-proof'], gate: 'figure2-entry' },
  { issue: 6, checkpoints: [6198, 6451], phase: 'Phase 3.1', transitionIds: ['method-tooling__method-proof'], gate: 'figure2-copy' },
  { issue: 7, checkpoints: [6762, 6885, 6944, 7873], phase: 'Phase 3.1', transitionIds: ['method-tooling__method-proof', 'brand-services'], gate: 'figure2-exit-figure3' },
  { issue: 8, checkpoints: [7873, 8703, 9535], phase: 'Phase 3.2', transitionIds: ['brand-services'], gate: 'figure3-services' },
  { issue: 9, checkpoints: [9954, 10784, 11616], phase: 'Phase 4.1', transitionIds: ['services-lab'], gate: 'ttg-lab' },
  { issue: 10, checkpoints: [11616], phase: 'Phase 5', transitionIds: ['services-lab'], gate: 'ttg-lab-divider' },
  { issue: 11, checkpoints: [12417], phase: 'Phase 5', transitionIds: [], gate: 'column-rhythm' },
  { issue: 12, checkpoints: [13177, 14007, 14839], phase: 'Phase 4.2', transitionIds: ['lab-education'], gate: 'ph-education' },
  { issue: 13, checkpoints: [14839], phase: 'Phase 5', transitionIds: ['lab-education'], gate: 'ph-education-divider' },
  { issue: 14, checkpoints: [16438, 17268, 18097], phase: 'Phase 4.3', transitionIds: ['philosophy-contact'], gate: 'crane-contact' },
  { issue: 15, checkpoints: [18523], phase: 'Phase 4.3 + Phase 5', transitionIds: ['philosophy-contact'], gate: 'endpoint' }
];
```

- [ ] **Step 3: Add missing checkpoints**

Ensure `DESKTOP_CHECKPOINTS` contains `6762` and `6944` between `6451` and `6885`.

- [ ] **Step 4: Verify no stale crosswalk remains**

Run:

```bash
rg -n "issue: 3, checkpoints: \\[3767, 4598\\]|issue: 7, checkpoints: \\[6885\\]" scripts/capture-homepage-checkpoints.mjs docs/superpowers/plans/2026-06-28-homepage-transition-review-correction-and-remediation.md
```

Expected: no matches.

## Task 2: Upgrade Capture Modes And Evidence Schema

**Files:**
- Modify: `scripts/capture-homepage-checkpoints.mjs`

- [ ] **Step 1: Add capture mode argument**

Extend `parseArgs`:

```js
const options = {
  url: '',
  outputName: '',
  headed: false,
  noMobile: false,
  mode: 'fresh'
};
```

Handle:

```js
else if (arg.startsWith('--mode=')) options.mode = arg.slice('--mode='.length);
```

Valid modes are `fresh`, `forward`, `reverse`, and `all`.

- [ ] **Step 2: Add sequence metadata to every sample**

Before returning from `collectState`, include:

```js
captureMode: scrollState.captureMode || 'fresh-page',
sequenceId: scrollState.sequenceId || '',
sequenceIndex: scrollState.sequenceIndex ?? null,
fromRequestedY: scrollState.fromRequestedY ?? null,
```

- [ ] **Step 3: Add ink surface collection**

Inside `collectState`, add a sampled pixel helper and ink surface collection:

```js
function sampledCanvasActivePixelRatio(canvas, threshold = 8) {
  try {
    const width = Math.max(1, Math.min(96, canvas.width || 0));
    const height = Math.max(1, Math.min(54, canvas.height || 0));
    if (!width || !height) return { ratio: 0, source: 'unavailable' };

    const scratch = document.createElement('canvas');
    scratch.width = width;
    scratch.height = height;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    if (!context) return { ratio: 0, source: 'unavailable' };

    context.drawImage(canvas, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    let active = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] >= threshold) active += 1;
    }
    return {
      ratio: Number((active / (width * height)).toFixed(4)),
      source: 'sampled-canvas'
    };
  } catch {
    return { ratio: 0, source: 'blocked' };
  }
}

const inkSurfaceStates = [...document.querySelectorAll([
  '[data-transition-ink-surface]',
  '[data-aod-ink-canvas]',
  '[data-figure2-ink-canvas]',
  '.pattern-bloom-transition__reveal-ink',
  '.pattern-bloom-transition__exit-ink'
].join(','))].map((canvas) => {
  const style = getComputedStyle(canvas);
  const progress = number(canvas.dataset.inkProgress, number(style.opacity, 0));
  const opacity = number(style.opacity, 0);
  const sampled = sampledCanvasActivePixelRatio(canvas);
  const estimatedActivePixelRatio = number(canvas.dataset.inkActivePixelRatio, opacity > 0.18 ? Math.min(progress, 1) * 0.06 : 0);
  const activePixelRatio = sampled.source === 'sampled-canvas' ? sampled.ratio : 0;
  return elementState(canvas, {
    transitionId: canvas.dataset.transitionId || canvas.closest('[data-transition-id]')?.dataset.transitionId || '',
    kind: canvas.dataset.inkKind || canvas.dataset.transitionInkKind || 'unknown',
    progress,
    activePixelRatio,
    activePixelRatioSource: sampled.source,
    estimatedActivePixelRatio,
    inkEvidenceStatus: sampled.source === 'sampled-canvas' ? 'sampled' : 'not-sampled',
    textureReady: canvas.dataset.inkTextureReady !== 'false',
    active: opacity >= 0.18
      && progress >= 0.05
      && sampled.source === 'sampled-canvas'
      && activePixelRatio >= 0.015
  });
}).filter(Boolean);
```

Add `inkSurfaces: inkSurfaceStates` to the sample object.

Estimated ratios such as `progress * 0.06` are allowed in `estimatedActivePixelRatio` only for debugging; strict gates must ignore them.

- [ ] **Step 4: Add layout metrics**

Capture #11 fields using the visible section around `12417`:

```js
const leftRhythmBox = box(document.querySelector('#lab .chapter-intro, #services .chapter-intro, #education .chapter-intro'));
const rightRhythmBox = box(document.querySelector('#lab .scenario-list, #services .enterprise-list, #education .education-list'));
const rhythmDeltaPx = leftRhythmBox && rightRhythmBox
  ? Number((rightRhythmBox.top - leftRhythmBox.top).toFixed(2))
  : null;
```

Add:

```js
layoutMetrics: {
  leftColumnTop: leftRhythmBox?.top ?? null,
  rightColumnTop: rightRhythmBox?.top ?? null,
  rhythmDeltaPx
}
```

- [ ] **Step 5: Add transition context**

Add a normalized context to each sample:

```js
transitionContext: {
  transitionId: activeTransition?.dataset.transitionId || '',
  phase: activeTransition?.dataset.transitionPhase || 'none',
  bridgeType: activeTransition?.dataset.transitionBridgeType || 'none',
  progress: number(activeTransition?.dataset.transitionProgress, null),
  sceneOpacity: number(activeTransition?.dataset.transitionSceneOpacity, null),
  receiverOpacity: number(activeTransition?.dataset.transitionReceiverOpacity, null),
  inkProgress: number(activeTransition?.dataset.transitionInkProgress, null),
  foregroundOpacity: number(activeTransition?.dataset.transitionForegroundOpacity, null)
}
```

- [ ] **Step 6: Implement same-page forward and reverse capture**

Keep the current per-checkpoint flow as `captureViewportFresh`. Add `captureViewportSequence` that opens one page, visits once, and scrolls through a checkpoint list in order:

```js
async function captureViewportSequence({ browser, baseUrl, outputDir, viewportConfig, consoleMessages, direction }) {
  const context = await browser.newContext({
    viewport: viewportConfig.viewport,
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference'
  });
  const page = await context.newPage();
  await page.goto(withCalibrationParam(baseUrl), { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: 'html, body, * { scroll-behavior: auto !important; }' });
  await waitForPageReady(page);

  const checkpoints = direction === 'reverse'
    ? [...viewportConfig.checkpoints].reverse()
    : viewportConfig.checkpoints;
  const samples = [];
  let previousRequestedY = null;
  let reversePrimed = false;

  if (direction === 'reverse') {
    const reverseStartY = Math.min(
      await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
      Math.max(...viewportConfig.checkpoints) + viewportConfig.viewport.height
    );
    await stabilizeScroll(page, reverseStartY);
    previousRequestedY = reverseStartY;
    reversePrimed = true;
  }

  for (let index = 0; index < checkpoints.length; index += 1) {
    const requestedY = checkpoints[index];
    const scrollState = {
      ...await stabilizeScroll(page, requestedY),
      captureMode: `same-page-${direction}`,
      sequenceId: `${viewportConfig.id}-${direction}`,
      sequenceIndex: index,
      fromRequestedY: previousRequestedY,
      reversePrimed
    };
    previousRequestedY = requestedY;
    const screenshotPath = path.join(outputDir, screenshotName({
      requestedY,
      actualY: scrollState.actualY,
      viewportId: `${viewportConfig.id}-${direction}`
    }));
    const state = await captureHudHiddenStateAndScreenshot(
      page,
      scrollState,
      viewportConfig.viewport,
      direction,
      screenshotPath
    );
    state.artifact.screenshot = screenshotPath;
    samples.push(state);
  }

  await page.close();
  await context.close();
  return samples;
}
```

- [ ] **Step 7: Wire `--mode=all`**

In `run`, collect:

- `fresh-page` samples when mode is `fresh` or `all`.
- `same-page-forward` samples when mode is `forward` or `all`.
- `same-page-reverse` samples when mode is `reverse` or `all`.

- [ ] **Step 8: Normalize crosswalk evidence without receiver fallback**

Use exact matching:

```js
function findRelatedReceiver(sample, row) {
  const ids = row.transitionIds || [];
  const receivers = sample.receivers || [];
  return receivers.find((receiver) => {
    const source = receiver.source || receiver.handoffSource || '';
    const selector = receiver.selector || '';
    return ids.some((id) => source.includes(id) || selector.includes(id));
  }) || null;
}
```

Do not return `receivers[0]` as fallback.

Each crosswalk evidence record must also copy these fields from the sample so later reviewers do not need to re-run the gate checker:

```js
captureMode: sample.captureMode,
sequenceId: sample.sequenceId,
sequenceIndex: sample.sequenceIndex,
fromRequestedY: sample.fromRequestedY,
transitionContext: sample.transitionContext,
inkSurfaces: sample.inkSurfaces,
layoutMetrics: sample.layoutMetrics,
endpoint: sample.endpoint
```

- [ ] **Step 9: Run a no-browser static check**

Run:

```bash
node --check scripts/capture-homepage-checkpoints.mjs
```

Expected: exit code 0.

## Task 3: Gate Checker With JSON Write-Back

**Files:**
- Create: `scripts/check-homepage-transition-gates.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create gate checker CLI**

The checker must support:

```bash
node scripts/check-homepage-transition-gates.mjs --input output/playwright/<run>/homepage-checkpoints.json --write --strict
```

Parse `--input=...`, `--input ...`, `--write`, and `--strict`.

- [ ] **Step 2: Implement result shape**

The checker must write:

```json
{
  "gateResults": {
    "status": "failed",
    "requiredCaptureModes": ["fresh-page", "same-page-forward", "same-page-reverse"],
    "passed": 0,
    "failed": 15,
    "issues": [
      {
        "issue": 1,
        "status": "failed",
        "gate": "home-belief",
        "criteria": ["no-empty-dark-frame", "copy-or-visual-present"],
        "evidenceRefs": ["fresh-page:desktop-1440x840:919"],
        "missingEvidenceRefs": [],
        "failures": ["919 has copy=none and no active ink or scene surface."]
      }
    ]
  }
}
```

Also set each matching `crosswalkEvidence[]` row with `status`, `gate`, `evidenceRefs`, `missingEvidenceRefs`, and `failures`. With `--write`, the checker must write those results back into the same `homepage-checkpoints.json`. With `--strict`, exit 0 only when `gateResults.status === "passed"`, `gateResults.passed === 15`, and `gateResults.failed === 0`.

- [ ] **Step 3: Add common helper predicates**

Use these gate-level concepts:

```js
const REQUIRED_DESKTOP_MODES = ['fresh-page', 'same-page-forward', 'same-page-reverse'];

function requiredDesktopSamplesForIssue(report, issue) {
  const row = (report.crosswalkEvidence || []).find((item) => item.issue === issue);
  const checkpoints = row?.checkpoints || [];
  const samples = (report.samples || []).filter((sample) => (
    sample.viewport?.width === 1440
    && sample.viewport?.height === 840
    && checkpoints.includes(sample.requestedY)
  ));

  const missing = [];
  for (const requestedY of checkpoints) {
    for (const captureMode of REQUIRED_DESKTOP_MODES) {
      if (!samples.some((sample) => sample.requestedY === requestedY && sample.captureMode === captureMode)) {
        missing.push(`${captureMode}:desktop-1440x840:${requestedY}`);
      }
    }
  }

  return { row, checkpoints, samples, missing };
}

function activeInk(sample, transitionId, kind) {
  return (sample.inkSurfaces || []).some((surface) => (
    surface.transitionId === transitionId
    && surface.kind === kind
    && surface.active === true
    && surface.activePixelRatioSource === 'sampled-canvas'
  ));
}

function copyVisible(sample, copyId, opacity = 0.35) {
  return sample.copy?.id === copyId && Number(sample.copy?.primary?.opacity || 0) >= opacity;
}
```

Every gate must call `requiredDesktopSamplesForIssue`. If `missing.length > 0`, the issue fails and the missing refs are written to both `gateResults.issues[].missingEvidenceRefs` and `crosswalkEvidence[].missingEvidenceRefs`.

- [ ] **Step 4: Add all 15 gate functions**

Create gate functions named:

- `gateHomeDarkFrame`
- `gateBeliefPatternBloom`
- `gateBeliefAodEntry`
- `gateAodMethod`
- `gateFigure2Entry`
- `gateFigure2Copy`
- `gateFigure2ExitFigure3`
- `gateFigure3Services`
- `gateTtgLab`
- `gateTtgLabDivider`
- `gateColumnRhythm`
- `gatePhEducation`
- `gatePhEducationDivider`
- `gateCraneContact`
- `gateEndpoint`

Every gate must return:

```js
{
  issue,
  status: failures.length ? 'failed' : 'passed',
  gate,
  criteria,
  evidenceRefs,
  failures
}
```

- [ ] **Step 5: Add package script**

Add:

```json
"verify:homepage-transition-gates": "node scripts/check-homepage-transition-gates.mjs"
```

- [ ] **Step 6: Prove current artifacts fail honestly**

Run:

```bash
npm run verify:homepage-transition-gates -- --input output/playwright/landing-check-2026-06-28-harness-fixed-v2/homepage-checkpoints.json --strict
```

Expected: exit code 1 and failures include #1, #2, #3, ink bridge rows, and endpoint undecided.

## Task 4: Close Home -> Belief Pattern Bloom (#1/#2)

**Files:**
- Modify: `js/transitions/pattern-bloom-adapter.js`
- Modify: `css/pattern-bloom.css`
- Modify: `css/pattern-bloom-component.css`
- Modify: `css/components/homepage-continuity.css`
- Modify: `scripts/check-homepage-transition-gates.mjs`

- [ ] **Step 1: Add contract constants**

In `js/transitions/pattern-bloom-adapter.js`, add:

```js
const HOME_BELIEF_CONTRACT = Object.freeze({
  id: 'home-belief',
  bridgeTypes: ['entryInk', 'exitInk'],
  phases: [
    { id: 'entryInk', start: 0, end: 0.30 },
    { id: 'lotusBloom', start: 0.30, end: 0.58 },
    { id: 'beliefCopy', start: 0.58, end: 0.76 },
    { id: 'exitInk', start: 0.76, end: 1 }
  ]
});
```

- [ ] **Step 2: Mark ink canvases as measurable surfaces**

After creating `revealInkCanvas`:

```js
revealInkCanvas.dataset.transitionInkSurface = 'true';
revealInkCanvas.dataset.transitionId = HOME_BELIEF_CONTRACT.id;
revealInkCanvas.dataset.inkKind = 'entryInk';
```

After creating `exitInkCanvas`:

```js
exitInkCanvas.dataset.transitionInkSurface = 'true';
exitInkCanvas.dataset.transitionId = HOME_BELIEF_CONTRACT.id;
exitInkCanvas.dataset.inkKind = 'exitInk';
```

- [ ] **Step 3: Report Pattern Bloom phase and ink progress**

Inside `renderOverlays`, after `secondRevealProgress` is calculated:

```js
const phase = progress < 0.30
  ? 'entryInk'
  : progress < 0.58
    ? 'lotusBloom'
    : progress < 0.76
      ? 'beliefCopy'
      : 'exitInk';
const bridgeType = phase === 'entryInk' ? 'entryInk' : phase === 'exitInk' ? 'exitInk' : 'none';

host.dataset.transitionContractId = HOME_BELIEF_CONTRACT.id;
host.dataset.transitionBridgeType = bridgeType;
host.dataset.transitionPhase = phase;
host.dataset.transitionProgress = progress.toFixed(4);
host.dataset.transitionSceneOpacity = Math.max(topSceneOpacity, beliefSceneOpacity).toFixed(4);
host.dataset.transitionInkProgress = Math.max(revealProgress, secondRevealProgress).toFixed(4);

revealInkCanvas.dataset.inkProgress = revealProgress.toFixed(4);
revealInkCanvas.dataset.inkActivePixelRatio = (revealVisibility > 0.18 ? Math.min(revealProgress, 1) * 0.06 : 0).toFixed(4);
exitInkCanvas.dataset.inkProgress = secondRevealProgress.toFixed(4);
exitInkCanvas.dataset.inkActivePixelRatio = (secondRevealProgress > 0.05 ? Math.min(secondRevealProgress, 1) * 0.06 : 0).toFixed(4);
```

- [ ] **Step 4: Fix #1 dark/no-copy window**

Retune the early progress window so `919` cannot be a pure dark frame:

```js
const revealProgress = smoothStep(range01(progress, 0, 0.34));
const revealVisibility = progress > 0.0001 ? Math.max(revealProgress, 0.18) : 0;
```

The visual goal is that the ink or lotus scene is visible before prior hero content is fully hidden.

- [ ] **Step 5: Fix #2 copy timing**

Retune the Belief copy entry:

```js
const beliefPinned = overlayActive && secondRevealProgress > 0.001;
const beliefCopyProgress = beliefPinned
  ? Math.max(0.35, smoothStep(range01(secondRevealProgress, 0.001, 0.12)))
  : 0;
```

The gate requires `belief` copy opacity >= 0.35 at `1310`, or a visible active scene with ink evidence.

- [ ] **Step 6: Add #1/#2 gates**

Implement:

- #1 fails if `886` or `919` has `copyId=none`, no active `home-belief` ink surface, and scene opacity < 0.18.
- #2 fails if `1310` lacks both Belief copy opacity >= 0.35 and active `home-belief` scene/ink, or if `1699` is a disconnected no-copy/no-scene/no-ink frame.

- [ ] **Step 7: Verify Home/Belief**

Run:

```bash
npm run verify:all
npm run capture:homepage-checkpoints -- --mode=all --output-name=homepage-home-belief-gate-2026-06-28
npm run verify:homepage-transition-gates -- --input output/playwright/homepage-home-belief-gate-2026-06-28/homepage-checkpoints.json --write --strict
```

Expected: #1 and #2 pass; #3-#15 may still fail.

## Task 5: Close Belief -> AOD Entry And AOD -> Method (#3/#4)

**Files:**
- Modify: `src/section-manifest.mjs`
- Modify: `scripts/build-index.mjs`
- Modify: `scripts/check-section-transition-contract.mjs`
- Modify: `scripts/check-homepage-transition-integration.mjs`
- Modify: `js/components/aod-transition.js`
- Modify: `js/transitions/homepage/aod-homepage-adapter.js`
- Modify: `css/components/aod-transition.css`
- Modify: `css/components/homepage-continuity.css`
- Modify: `scripts/check-homepage-transition-gates.mjs`

- [ ] **Step 1: Change AOD bridge contract from label-only snap to ink-backed entry**

In AOD contract, use:

```js
bridgeType: 'entryInk',
phases: [
  { id: 'entryInk', start: 0, end: 0.18, required: true },
  { id: 'scene', start: 0.18, end: 0.42, required: true },
  { id: 'copyIn', start: 0.22, end: 0.52, required: true },
  { id: 'copyHold', start: 0.52, end: 0.94, required: true },
  { id: 'handoff', start: 0.94, end: 1, required: true }
]
```

`snapEntry` may still be reported separately as `snapState`, but it must not be the passing bridge type for #3.

- [ ] **Step 2: Mark AOD ink canvas as measurable**

In `aod-homepage-adapter.js`, after selecting `inkCanvas`:

```js
inkCanvas.dataset.transitionInkSurface = 'true';
inkCanvas.dataset.transitionId = AOD_METHOD_PILOT_CONTRACT.id;
inkCanvas.dataset.inkKind = 'entryInk';
```

- [ ] **Step 3: Return AOD metrics**

In `js/components/aod-transition.js`, make the renderer return:

```js
return {
  visualProgress: Number(p.toFixed(4)),
  sceneOpacity: Number(backgroundFade.toFixed(4)),
  paperSolidOpacity: Number(paperSolid.toFixed(4)),
  methodEnter: Number(methodEnter.toFixed(4))
};
```

- [ ] **Step 4: Report AOD scene, receiver, and ink metrics**

Use:

```js
const METHOD_RECEIVER_TIMING = Object.freeze({
  start: 0.22,
  end: 0.52,
  restoreAt: 0.96,
  liftPx: 8
});
```

In render:

```js
const metrics = renderAodTransitionProgress(section, progress) || {};
const receiverOpacity = methodReceiver?.update(Math.max(progress, handoffProgress), METHOD_RECEIVER_TIMING) ?? 0;
const inkProgress = smoothStep(range01(progress, 0, 0.18));
inkCanvas.dataset.inkProgress = inkProgress.toFixed(4);
inkCanvas.dataset.inkActivePixelRatio = (inkProgress > 0.05 ? inkProgress * 0.06 : 0).toFixed(4);
syncPilotState(host, section, progress, receiverOpacity, metrics.sceneOpacity ?? 1, inkProgress);
inkTransition?.render(inkProgress);
```

- [ ] **Step 5: Update static verification constants**

Update `scripts/check-homepage-transition-integration.mjs` so it expects:

- `copyIn` start `0.22`.
- `copyIn` end `0.52`.
- receiver start `0.22`.
- receiver end `0.52`.
- `restoreAt: 0.96`.

Update `scripts/check-section-transition-contract.mjs` so non-AOD contracts are not forced to have `snapEntry`:

- Only validate `contract.snapPolicy.target` and `contract.snapPolicy.tolerancePx` when `snapPolicy` exists.
- Only validate `contract.handoff.receiver` when `handoff.receiver` exists.
- Validate phases by reading every `required` phase from `contract.phases` and confirming it appears in `data-transition-phase-spec`.
- Do not hardcode `snapEntry` as a required phase for every contract.

- [ ] **Step 6: Add #3/#4 gates**

#3 passes only when all capture modes satisfy:

- At `1843` and `2327`, an active bridge surface exists for `home-belief` `exitInk` or `belief-method` `entryInk`.
- At `2937`, either that bridge ink is still active, or the `belief-method` AOD scene has taken over with `transitionContext.phase` in `scene`, `copyIn`, or `copyHold` and `transitionContext.sceneOpacity >= 0.25`.
- No sample has `copyId=none` while both bridge ink and AOD scene evidence are absent.
- No unexplained `actualY` jump lands the sample in a later no-copy state.

#4 passes only when:

- `belief-method` receiver opacity >= 0.55 while AOD scene opacity is still >= 0.25 in at least one ordering sample.
- `5368` has safe Method copy.

- [ ] **Step 7: Verify #3/#4**

Run:

```bash
npm run verify:all
npm run capture:homepage-checkpoints -- --mode=all --output-name=homepage-aod-entry-method-gate-2026-06-28
npm run verify:homepage-transition-gates -- --input output/playwright/homepage-aod-entry-method-gate-2026-06-28/homepage-checkpoints.json --write --strict
```

Expected: #1-#4 pass.

## Task 6: Close Figure2 And Figure3 (#5/#6/#7/#8)

**Files:**
- Modify: `src/section-manifest.mjs`
- Modify: `src/sections/method.html` or `scripts/build-index.mjs`
- Modify: `js/components/figure2-transition.js`
- Modify: `js/transitions/homepage/figure2-homepage-adapter.js`
- Modify: `js/components/figure3-transition.js`
- Modify: `js/transitions/homepage/figure3-homepage-adapter.js`
- Modify: `css/figure2.css`
- Modify: `css/figure3-transition.css`
- Modify: `css/components/figure3-transition.css`
- Modify: `css/components/homepage-continuity.css`
- Modify: `scripts/check-homepage-transition-gates.mjs`

- [ ] **Step 1: Add method scene contract support**

`method-tooling__method-proof` is a hand-authored `.scene-transition` in `src/sections/method.html`; do not add it to `chapterTransitions`. Prefer adding contract attributes directly to that `.scene-transition`, or create a separate `sceneTransitionContracts` export and teach `scripts/build-index.mjs` to match `.scene-transition[data-transition-id]`.

- [ ] **Step 2: Expose existing Figure2 ink metrics**

Do not rebuild Figure2 ink. Extend `createFigure2TransitionController` so `renderStaticState` returns:

```js
return {
  inkProgress: getInkProgress(transitionProgress),
  foregroundOpacity: getForegroundOpacity(transitionProgress),
  sceneOpacity: 1,
  figureProgress: transitionProgress
};
```

- [ ] **Step 3: Report Figure2 adapter metrics**

In `figure2-homepage-adapter.js`, capture the return value:

```js
const figureMetrics = controller.renderStaticState({
  introProgress,
  transitionProgress
}) || {};
const brandReceiverOpacity = brandReceiver?.update(Math.max(postProgress, handoffProgress), {
  start: 0.58,
  end: 0.96,
  restoreAt: 0.98,
  liftPx: 22
}) ?? 0;

host.dataset.transitionContractId = 'method-tooling__method-proof';
host.dataset.transitionBridgeType = figureMetrics.inkProgress > 0.05 ? 'exitInk' : 'entryInk';
host.dataset.transitionPhase = resolveFigure2Phase(transitionProgress, postProgress, brandReceiverOpacity);
host.dataset.transitionProgress = transitionProgress.toFixed(4);
host.dataset.transitionReceiverOpacity = brandReceiverOpacity.toFixed(4);
host.dataset.transitionSceneOpacity = String(figureMetrics.sceneOpacity ?? 1);
host.dataset.transitionInkProgress = String(figureMetrics.inkProgress ?? 0);
host.dataset.transitionForegroundOpacity = String(figureMetrics.foregroundOpacity ?? 1);
```

Mark `[data-figure2-ink-canvas]` with `data-transition-id="method-tooling__method-proof"` and `data-ink-kind="exitInk"`.

- [ ] **Step 4: Add Figure3 ink bridge and Services receiver**

In `figure3-homepage-adapter.js`, add an ink canvas:

```html
<canvas class="figure3-transition__ink" data-transition-ink-surface data-transition-id="brand-services" data-ink-kind="exitInk" aria-hidden="true"></canvas>
```

Import and create a real ink effect:

```js
import { createInkCurtainTransition } from '../../effects/ink-scene-transition.js';
import { createHandoffReceiver } from './handoff-receiver.js';
```

Create:

```js
const inkCanvas = host.querySelector('.figure3-transition__ink');
const exitInk = reduceMotion ? null : createInkCurtainTransition(inkCanvas, {
  direction: 'top-down',
  colorLift: 0.58,
  coverAlpha: 0.52,
  fadeOutStart: 0.76,
  fadeOutEnd: 1,
  progressSpan: 1
});
const servicesReceiver = createHandoffReceiver({
  container: host.querySelector('.figure3-transition__stage'),
  target: host.ownerDocument.querySelector('#services'),
  sourceSelector: '.enterprise-vertical-layout',
  className: 'homepage-handoff-receiver--services'
});
```

During render:

```js
const progress = reduceMotion ? 1 : progressSource();
const inkProgress = smoothStep(range01(progress, 0.58, 0.92));
const receiverOpacity = servicesReceiver?.update(progress, {
  start: 0.54,
  end: 0.82,
  restoreAt: 0.96,
  liftPx: 10
}) ?? 0;
inkCanvas.dataset.inkProgress = inkProgress.toFixed(4);
inkCanvas.dataset.inkActivePixelRatio = (inkProgress > 0.05 ? inkProgress * 0.06 : 0).toFixed(4);
exitInk?.render(inkProgress);
host.dataset.transitionContractId = 'brand-services';
host.dataset.transitionBridgeType = inkProgress > 0.05 ? 'exitInk' : 'none';
host.dataset.transitionReceiverOpacity = receiverOpacity.toFixed(4);
host.dataset.transitionInkProgress = inkProgress.toFixed(4);
```

- [ ] **Step 5: Add #5-#8 gates**

Gate requirements:

- #5: `6198`, `6451`, `6885` have named Figure2 phase plus active `method-tooling__method-proof` ink or visible copy.
- #6: proof copy opacity >= 0.80 and overlap ratio <= 0.10.
- #7 fails on any of `6762`, `6885`, `6944`, or `7873` where proof copy opacity >= 0.35, receiver opacity >= 0.35, and Figure2 foreground opacity >= 0.25 coexist without active `method-tooling__method-proof` or `brand-services` ink. Ordered same-page-forward evidence must show foreground opacity below 0.25 before the Brand/Figure3 receiver reaches opacity >= 0.65.
- #8: Services receiver opacity >= 0.50 before Figure3 scene opacity < 0.30.

- [ ] **Step 6: Verify Figure2/Figure3**

Run:

```bash
npm run verify:all
npm run capture:homepage-checkpoints -- --mode=all --output-name=homepage-figure2-figure3-gate-2026-06-28
npm run verify:homepage-transition-gates -- --input output/playwright/homepage-figure2-figure3-gate-2026-06-28/homepage-checkpoints.json --write --strict
```

Expected: #1-#8 pass.

## Task 7: Close TTG, PH, And Crane Ink Bridges (#9/#12/#14)

**Files:**
- Modify: `src/section-manifest.mjs`
- Modify: `js/components/ttg-transition.js`
- Modify: `js/transitions/homepage/ttg-homepage-adapter.js`
- Modify: `js/components/ph-transition.js`
- Modify: `js/transitions/homepage/ph-homepage-adapter.js`
- Modify: `js/components/crane-transition.js`
- Modify: `js/transitions/homepage/crane-homepage-adapter.js`
- Modify: `css/ttg.css`
- Modify: `css/ph.css`
- Modify: `css/crane.css`
- Modify: `css/components/homepage-continuity.css`
- Modify: `scripts/check-homepage-transition-gates.mjs`

- [ ] **Step 1: Add shared ink bridge pattern**

For each of TTG, PH, and Crane adapters, add two measurable canvas surfaces inside the transition field:

```html
<canvas class="homepage-transition-ink homepage-transition-ink--entry" data-transition-ink-surface data-transition-id="TRANSITION_ID" data-ink-kind="entryInk" aria-hidden="true"></canvas>
<canvas class="homepage-transition-ink homepage-transition-ink--exit" data-transition-ink-surface data-transition-id="TRANSITION_ID" data-ink-kind="exitInk" aria-hidden="true"></canvas>
```

Replace `TRANSITION_ID` with `services-lab`, `lab-education`, or `philosophy-contact`.

Add shared CSS in the relevant real CSS files or `css/components/homepage-continuity.css`:

```css
.homepage-transition-ink {
  position: absolute;
  inset: 0;
  z-index: 18;
  width: 100%;
  height: 100%;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.homepage-handoff-receiver {
  z-index: 26;
}
```

The ink surface must sit above scene visual layers and below receivers/progress UI.

- [ ] **Step 2: Use real ink effects**

Import:

```js
import { createInkCurtainTransition } from '../../effects/ink-scene-transition.js';
import { createHandoffReceiver } from './handoff-receiver.js';
```

Create:

```js
const entryInk = reduceMotion ? null : createInkCurtainTransition(entryInkCanvas, {
  direction: 'bottom-up',
  colorLift: 0.54,
  coverAlpha: 0.50,
  fadeOutStart: 0.58,
  fadeOutEnd: 1,
  progressSpan: 1
});
const exitInk = reduceMotion ? null : createInkCurtainTransition(exitInkCanvas, {
  direction: 'top-down',
  colorLift: 0.58,
  coverAlpha: 0.54,
  fadeOutStart: 0.76,
  fadeOutEnd: 1,
  progressSpan: 1
});
```

- [ ] **Step 3: Add or keep receivers**

Use these targets:

- TTG `services-lab`: `#lab`, source `.scenario-wide-stage`.
- PH `lab-education`: `#education`, source `.education-vertical-layout`.
- Crane `philosophy-contact`: keep `#contact`, source `.contact-endpoint`.

Receiver timing:

```js
const RECEIVER_TIMING = Object.freeze({
  start: 0.54,
  end: 0.82,
  restoreAt: 0.96,
  liftPx: 10
});
```

- [ ] **Step 4: Report true ink and scene metrics**

Before adapters read `sceneOpacity`, update the renderers so they return metrics:

- `js/components/ttg-transition.js`: `renderRawProgress` returns `{ visualProgress, sceneOpacity }`.
- `js/components/ph-transition.js`: `renderPhTransitionProgress` returns `{ visualProgress: p, sceneOpacity }`.
- `js/components/crane-transition.js`: `renderRawProgress` returns `{ visualProgress, sceneOpacity }`.

If a renderer cannot compute exact scene opacity yet, the adapter must set an explicit fallback such as `const sceneOpacity = 1 - smoothStep(range01(progress, 0.70, 0.94));`. Do not reference an undefined `sceneOpacity`.

In each render loop:

```js
const entryProgress = smoothStep(range01(progress, 0, 0.18));
const exitProgress = smoothStep(range01(progress, 0.62, 0.92));
entryInkCanvas.dataset.inkProgress = entryProgress.toFixed(4);
entryInkCanvas.dataset.inkActivePixelRatio = (entryProgress > 0.05 ? entryProgress * 0.06 : 0).toFixed(4);
exitInkCanvas.dataset.inkProgress = exitProgress.toFixed(4);
exitInkCanvas.dataset.inkActivePixelRatio = (exitProgress > 0.05 ? exitProgress * 0.06 : 0).toFixed(4);
entryInk?.render(entryProgress);
exitInk?.render(exitProgress);

const entryOpacity = Number(getComputedStyle(entryInkCanvas).opacity) || 0;
const exitOpacity = Number(getComputedStyle(exitInkCanvas).opacity) || 0;
const bridgeType = exitOpacity >= 0.18 && exitProgress >= 0.05
  ? 'exitInk'
  : entryOpacity >= 0.18 && entryProgress >= 0.05
    ? 'entryInk'
    : 'none';
const sceneOpacityValue = Number(sceneOpacity ?? 1);

host.dataset.transitionContractId = TRANSITION_ID;
host.dataset.transitionBridgeType = bridgeType;
host.dataset.transitionPhase = resolvePhase(progress);
host.dataset.transitionProgress = progress.toFixed(4);
host.dataset.transitionReceiverOpacity = receiverOpacity.toFixed(4);
host.dataset.transitionSceneOpacity = sceneOpacityValue.toFixed(4);
host.dataset.transitionInkProgress = Math.max(entryProgress, exitProgress).toFixed(4);
```

- [ ] **Step 5: Add #9/#12/#14 gates**

Gate requirements:

- #9: `9954`, `10784`, and `11616` have active `services-lab` entry or exit ink and Lab receiver/copy visibility before TTG scene exit.
- #12: `13177`, `14007`, and `14839` have active `lab-education` entry or exit ink and Education receiver/copy visibility in forward and reverse.
- #14: `16438`, `17268`, and `18097` have active `philosophy-contact` entry or exit ink; Contact receiver opacity >= 0.45 before Crane scene opacity < 0.30.

- [ ] **Step 6: Verify late chain**

Run:

```bash
npm run verify:all
npm run capture:homepage-checkpoints -- --mode=all --output-name=homepage-late-chain-ink-gate-2026-06-28
npm run verify:homepage-transition-gates -- --input output/playwright/homepage-late-chain-ink-gate-2026-06-28/homepage-checkpoints.json --write --strict
```

Expected: #1-#9, #12, and #14 pass. #10, #11, #13, #15 may still fail.

## Task 8: Layout Cleanup And Endpoint Decision (#10/#11/#13/#15)

**Files:**
- Modify: `src/section-manifest.mjs`
- Modify: `scripts/build-index.mjs`
- Modify: `scripts/capture-homepage-checkpoints.mjs`
- Modify: `scripts/check-homepage-transition-gates.mjs`
- Modify relevant real CSS files only after owning transition gates pass.

- [ ] **Step 1: Add endpoint spec source**

Add to `src/section-manifest.mjs`:

```js
export const homepageEndpointSpec = {
  mode: 'undecided',
  snapTarget: '',
  footerVisibleRatioMin: null,
  footerVisibleRatioMax: null,
  tolerancePx: 8,
  approvalSource: ''
};
```

Approved choices are:

```js
export const HOMEPAGE_ENDPOINT_CHOICES = {
  contactOnly: {
    mode: 'contact-only',
    snapTarget: '#contact',
    footerVisibleRatioMin: 0,
    footerVisibleRatioMax: 0.08,
    tolerancePx: 8,
    approvalSource: ''
  },
  contactFooterComposed: {
    mode: 'contact-footer-composed',
    snapTarget: '#contact',
    footerVisibleRatioMin: 0.97,
    footerVisibleRatioMax: 1,
    tolerancePx: 8,
    approvalSource: ''
  }
};
```

Do not change `homepageEndpointSpec.mode` from `undecided` until the visual owner approves one choice. When approval happens, copy the approved choice and set `approvalSource` to the issue, comment, or dated decision record that made the endpoint choice.

- [ ] **Step 2: Inject endpoint spec into DOM**

Update `scripts/build-index.mjs` to import `homepageEndpointSpec` and add `injectEndpointSpecAttributes(html)`. It must match `<html\b[^>]*>` and inject:

```html
data-homepage-endpoint-mode="..."
data-homepage-endpoint-snap-target="..."
data-homepage-endpoint-footer-min="..."
data-homepage-endpoint-footer-max="..."
data-homepage-endpoint-tolerance-px="..."
data-homepage-endpoint-approval-source="..."
```

Call `injectEndpointSpecAttributes` before writing `index.html`.

- [ ] **Step 3: Capture endpoint spec from DOM**

In capture, replace hardcoded endpoint spec with:

```js
chosenEndpointSpec: {
  mode: document.documentElement.dataset.homepageEndpointMode || 'undecided',
  snapTarget: document.documentElement.dataset.homepageEndpointSnapTarget || '',
  footerVisibleRatioMin: number(document.documentElement.dataset.homepageEndpointFooterMin, null),
  footerVisibleRatioMax: number(document.documentElement.dataset.homepageEndpointFooterMax, null),
  tolerancePx: number(document.documentElement.dataset.homepageEndpointTolerancePx, null),
  approvalSource: document.documentElement.dataset.homepageEndpointApprovalSource || ''
}
```

Also capture:

```js
const snapTargetSelector = document.documentElement.dataset.homepageEndpointSnapTarget || '';
const snapTargetBox = box(snapTargetSelector ? document.querySelector(snapTargetSelector) : null);
const snapDeltaPx = snapTargetBox ? Math.abs(snapTargetBox.top) : null;
```

Add `snapDeltaPx` to `endpoint`.

- [ ] **Step 4: Gate endpoint decision**

#15 fails if endpoint mode is `undecided`, `snapTarget` is empty, `approvalSource` is missing, or measured `snapDeltaPx > tolerancePx`. After approval, #15 passes only if `footerVisibleRatio` is inside the chosen min/max window in all required capture modes.

- [ ] **Step 5: Fix divider ownership**

After #9 passes, inspect `boundaries.lineOwners` at `11616` and remove duplicate owner rules around TTG/Lab.

After #12 passes, inspect `boundaries.lineOwners` at `14839` and remove duplicate owner rules around PH/Education.

The gate fails if any visible horizontal line lacks a stable owner or if the same boundary is drawn by two owners.

- [ ] **Step 6: Fix right-column rhythm**

Use captured `layoutMetrics.rhythmDeltaPx`. #11 passes when:

```js
Math.abs(sample.layoutMetrics.rhythmDeltaPx) <= 24
```

Adjust the owning section CSS at `12417` only after the transition owner is stable.

- [ ] **Step 7: Verify layout and endpoint**

Run:

```bash
npm run verify:all
npm run capture:homepage-checkpoints -- --mode=all --output-name=homepage-layout-endpoint-gate-2026-06-28
npm run verify:homepage-transition-gates -- --input output/playwright/homepage-layout-endpoint-gate-2026-06-28/homepage-checkpoints.json --write --strict
```

Expected: #10, #11, #13 pass. #15 passes only if endpoint mode is no longer `undecided` and the visual ratio matches the approved spec.

## Task 9: Final Release Verification

**Files:**
- Create: `scripts/smoke-homepage-transition-wheel.mjs`
- Modify: `package.json`
- Modify: `docs/homepage-transition-current-status-2026-06-28.md`

- [ ] **Step 1: Run full static verification**

Run:

```bash
npm run verify:all
```

Expected: exit code 0.

- [ ] **Step 2: Run full capture**

Run:

```bash
npm run capture:homepage-checkpoints -- --mode=all --output-name=homepage-transition-final-gate-2026-06-28
```

Expected: output includes fresh, forward, and reverse desktop samples plus mobile smoke samples.

- [ ] **Step 3: Run strict gate write-back**

Run:

```bash
npm run verify:homepage-transition-gates -- --input output/playwright/homepage-transition-final-gate-2026-06-28/homepage-checkpoints.json --write --strict
```

Expected:

- exit code 0.
- `gateResults.status` is `passed`.
- `gateResults.passed` is `15`.
- `gateResults.failed` is `0`.
- every `crosswalkEvidence[].status` is `passed`.

- [ ] **Step 4: Add real wheel smoke**

Create `scripts/smoke-homepage-transition-wheel.mjs` to run a real input smoke test using Playwright wheel events rather than direct `window.scrollTo`. It must cover both forward and reverse paths across:

```js
[
  'belief-method',
  'method-tooling__method-proof',
  'brand-services',
  'services-lab',
  'lab-education',
  'philosophy-contact'
]
```

The output JSON must include:

```json
{
  "wheelSmoke": {
    "status": "passed",
    "paths": ["forward-wheel", "reverse-wheel"],
    "checkedTransitions": ["belief-method", "method-tooling__method-proof", "brand-services", "services-lab", "lab-education", "philosophy-contact"],
    "failures": []
  }
}
```

Add this package script:

```json
"smoke:homepage-transition-wheel": "node scripts/smoke-homepage-transition-wheel.mjs"
```

Run:

```bash
npm run smoke:homepage-transition-wheel -- --output-name=homepage-transition-wheel-smoke-2026-06-28
```

Expected: exit code 0 and `wheelSmoke.status = "passed"`.

- [ ] **Step 5: Human visual review**

Open the final screenshots for the ink bridge checkpoints and visually confirm that the ink is correctly placed and timed. The gate proves an ink surface rendered with correct order and thresholds; it does not prove the ink looks good.

- [ ] **Step 6: Append final status**

Append:

```md
## Final Gate Result

Final capture: `output/playwright/homepage-transition-final-gate-2026-06-28/homepage-checkpoints.json`
Wheel smoke: `output/playwright/homepage-transition-wheel-smoke-2026-06-28/homepage-wheel-smoke.json`

Release is complete only when `npm run verify:all` exits 0, the final capture JSON contains `gateResults.status = "passed"` with 15 passed issues, the wheel smoke JSON contains `wheelSmoke.status = "passed"`, and the final screenshot review accepts the ink visual quality.
```

## Self-Review

- Spec coverage: This plan now covers #1 through #15 with corrected checkpoints and explicit implementation owners.
- Ink coverage: Every `entryInk`, `exitInk`, or `paperWash` bridge now requires a real canvas surface and measurable ink evidence.
- Harness coverage: Fresh-page, same-page forward, and same-page reverse captures are required before release.
- Gate coverage: Gate results must write back to JSON and cannot be satisfied by console output alone.
- Endpoint coverage: #15 is blocked by an explicit endpoint decision instead of being silently hardcoded in capture.
- Input coverage: final release includes a real wheel smoke path in addition to programmatic scroll captures.
- Visual quality coverage: final release requires human review of the ink bridge screenshots because pixel gates prove existence and order, not taste.
- File accuracy: CSS targets use existing files, and static verifier updates are included where contract changes would otherwise break verification.

Plan complete and saved to `docs/superpowers/plans/2026-06-28-homepage-transition-review-correction-and-remediation.md`.
