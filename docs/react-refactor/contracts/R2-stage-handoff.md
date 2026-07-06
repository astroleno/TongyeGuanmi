# R2 Stage Handoff Contract

Status: frozen R2 synthetic contract. HITL must decide before any real scene enters R3.

## Scope

R2 proves the Stage handoff protocol with synthetic fixtures only:

- `Stage.tsx`, `SceneLayer.tsx`, `LayerWindow.ts`
- `HandleRegistry`
- `verifySegmentTimeline()`
- `/harness/stage`
- two primary `SyntheticSceneModule` fixtures, one harness-only retiring sentinel, and two `SyntheticTransitionModule` fixtures

R2 explicitly does not migrate real scene DOM, real media, old fixed-copy, copyOwner, reveal gate, or old transition runtime code.

## Stage Contract

- Stable active window is `prev / current / next`.
- `SceneLayer` hidden mount default is `opacity:0`, `visibility:hidden`, `inert`, `pointer-events:none`.
- Hold has exactly one interactable current layer.
- Playing has zero interactable layers.
- Any sampled frame has at least one visible layer and at most two visible layers.
- Active layer count must be `<= 3`.
- Transient mounted layer count including `retiring` must be `<= 4`.
- Role changes update `data-role` / z-order only; existing window members are not remounted.
- Playing-time z-order changes remain forbidden.

## LayerWindow And Retiring

`LayerWindow` owns membership only; scene visibility stays with transition timelines.

- `advanceLayerWindow(previous, targetHold)` computes the next `prev/current/next`.
- Scenes leaving the active window become `retiring`.
- `retiring` is hidden and inert.
- `retiring` may survive for one frame to let disposal happen after membership validation.
- `retiring` must be released before the next hold is committed. If it survives into a following hold, `LayerWindow` throws.

## Ready Gates

`HandleRegistry` is the R2 gate for:

- `targetReady`: root ref + required handles + preload resolved.
- `mediaReady`: guarded by `prepareToken` and/or `runId`; duplicate events are ignored.
- `buildReady`: guarded by `prepareToken` plus the prepare-run id used by `SegmentPlayer.ensureBuilt()`. The later playback completion still uses the active `runId` created when Director enters `playing`.

StrictMode double preload starts are deduped. Stale media/build events fail closed and do not unlock playback.

The runtime actor loop must consume these gates before `TARGET_READY` unlocks `playing`: `targetReady` first, `mediaReady` when declared by the runtime gate, then `buildReady` after `SegmentPlayer.ensureBuilt()`. A slow `mediaReady` that resolves before prepare timeout must continue into `playing`; a missing or stale gate must not unlock the segment. Because the active playback `runId` is created by Director when entering `playing`, build-phase guards use a prepare-run id scoped to the same `prepareToken`.

## Segment And Timeline

`verifySegmentTimeline()` freezes the R2 timeline shape:

- Required labels: `start`, `end`.
- Staged segments require `stage:i` pause labels.
- Start state: from visible, to hidden.
- End state: to visible.
- No sampled blank frames.
- At most two visible layers.
- CopyCue must activate at the declared progress.
- `stagedSnap.playMs.length === stops.length + 1`.

The synthetic transition exposes deterministic `sample(progress)` state so Vitest can verify the same visibility predicate used by Playwright.

## Director Events

R2 keeps the R1 event contract and exercises these guards:

- `TARGET_READY` must match the current `prepareToken`.
- `MEDIA_READY` is idempotent and stale-guarded in `HandleRegistry`.
- `BUILD_TIMEOUT` sends the run to recovery.
- `PLAYBACK_DONE / FAILED / STAGE_PAUSED / STAGE_RESUMED / SEGMENT_ABORTED` must match `activeRunId`.
- `SEEK` aborts the active run before the target hold is mounted.

Slow-ready must enter `playing` when readiness arrives before timeout. Build timeout must recover to the static fallback hold and leave input usable.

## CopyCue

Synthetic copyCue is attached to `hero-pattern` and targets `pattern` at progress `0.5`.

- Forward crossing enters target copy.
- Reverse crossing exits target copy state.
- `0 -> 1 -> 0 -> 1` does not double-count entrance.
- Scene components do not self-fade or own global visibility.

## Playwright Strategy

R2 Playwright uses `/harness/stage` with fixed viewport, `deviceScaleFactor: 1`, and `reducedMotion: reduce`.

`/harness/stage` drives the real `director.machine` actor loop and `SegmentPlayer`, with the synthetic transition injected as the `hero-pattern` transition module. DOM visibility is still synthetic, but runId, prepareToken, build timeout, seek abort, and retiring release flow through the runtime path.

The retiring Playwright check uses an actual actor settling path (`hero -> pattern -> star-map`), observes the retiring `hero` DOM layer while it is mounted hidden/inert, and waits for the runtime `RETIRING_RELEASED` event. It does not patch the LayerWindow snapshot by hand.

Primary assertions are DOM predicates:

- no blank frame
- no more than two visible layers
- no more than one interactable layer
- playing has zero interactable layers
- mounted layer count `<= 4`
- stale completion ignored after seek abort
- slow-ready, build-timeout, duplicate mediaReady, copyCue, and retiring fixtures pass

Canvas pixel smoke checks that the stage is not visually blank. Screenshots and video are retained on failure; trace is collected on first retry. CI retries are capped at one. No permanent quarantine is allowed. Flaky owner: R2 runtime maintainer. Flaky review expiry: 2026-08-06.

## Validation

Current automated coverage:

- `pnpm -C app test`
- `pnpm -C app typecheck`
- `pnpm -C app test:smoke`

Passing R2 only authorizes the synthetic Stage protocol. It does not authorize real scene migration; HITL must explicitly approve moving into R3.
