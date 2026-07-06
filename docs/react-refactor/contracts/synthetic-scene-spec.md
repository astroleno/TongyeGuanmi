# R2 Synthetic Scene Spec

Status: R2 contract fixture. This spec is synthetic-only and does not migrate real scenes, real media, or real copy.

## Modules

R2 uses two primary synthetic `SceneModule` fixtures plus one harness-only retiring sentinel. The sentinel exists only so Playwright can observe a real mounted DOM layer on the actor retiring path; it is not a migrated real scene.

| Fixture | SceneId | Required handles | Preload milestones | Purpose |
|---|---|---|---|---|
| source | `hero` | `copy`, `media` | `targetReady` | from layer, current hold, reverse target |
| target | `pattern` | `copy`, `media` | `targetReady`, `mediaReady` | to layer, copyCue target |
| retiring-sentinel | `star-map` | `copy`, `media` | `targetReady` | current hold for the real retiring Playwright path |

Both modules render inert test DOM only. The `copy` handle is the assertion target for copyCue. The `media` handle is a fake milestone anchor; no real media element is migrated.

R2 uses two synthetic `TransitionModule` fixtures:

| SegmentId | From | To | Required milestones | Labels | CopyCue |
|---|---|---|---|---|---|
| `hero-pattern` | `hero` | `pattern` | `targetReady`, `mediaReady`, `buildReady` | `start`, `end`, optional `stage:i` | `pattern` at `0.5` |
| `pattern-star-map` | `pattern` | `star-map` | `targetReady`, `buildReady` | `start`, `end` | `star-map` at `0.5` |

Both transitions are deterministic crossfades. At progress `0`, `from` is visible and `to` is hidden. At progress `1`, `to` is visible. During playback both layers are inert and at most two layers are visible.

## Fixtures

- `slow-ready`: delays synthetic `mediaReady` but resolves before timeout; the run must enter `playing`.
- `build-timeout`: delays `buildReady` past the build timeout; recovery lands on `hero` and input remains usable.
- `StrictMode duplicate mediaReady`: duplicate `mediaReady` is accepted once; stale prepare/run guards are rejected.
- `seek abort / stale completion`: seek aborts the active run; old run completion is ignored.
- `copyCue cycle`: `0 -> 1 -> 0 -> 1` activates the target copy cue once, while reverse still exits the cue state.
- `retiring`: `hero -> pattern -> star-map` uses real synthetic transitions for both legs; the retiring `hero` layer is mounted hidden/inert for one frame and released before the next hold is carried forward.

## Harness

Browser route: `/harness/stage`.

The harness exposes `window.__r2Stage` for Playwright:

- `playForward({ slowReady, buildTimeout })`
- `playReverse({ slowReady, buildTimeout })`
- `seek(scene)`
- `duplicateMediaReady()`
- `copyCueCycle()`
- `actualRetiringPath()`
- `snapshot()`

`snapshot()` reports phase, window, visible/interactable/mounted counts, event log, recovery count, stale completion count, duplicate mediaReady count, and copyCue activation count.

## Non-Goals

- No real scene renderer.
- No real video/canvas/WebGL media readiness.
- No old fixed-copy, copyOwner, or reveal-gate mechanism.
- Passing this spec does not imply real scene parity; R3 must run the first truth pass.
