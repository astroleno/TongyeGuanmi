# R4 G6 Lab -> PH -> Education Notes

## Scope

- Group: `lab -> ph-animation -> education`
- Branch: `codex/react-refactor-r4-g6-ph-education`
- Harness routes:
  - `/harness/r4-g6`
  - `/harness/r4-g6-lab-ph`
  - `/harness/r4-g6-ph-education`

## Legacy Sources

- PH visual source:
  - `js/components/ph-transition.js`
  - `css/ph.css`
  - `ph-transition-route.html`
- Education copy/layout source:
  - `src/sections/education.html`
  - `css/sections/source-copy.css`
  - `docs/react-refactor/inventory/copy-reference.json`
- Manifest/source segment seed:
  - legacy transition `lab-education`
  - canonical segments `lab-ph`, `ph-education`

## Ported Behavior

- `ph-animation` is a scrub-only scene. The renderer seeks `ph_figure-alpha-scrub.webm`, keeps video paused, and writes deterministic progress attributes for timeline tests.
- `lab-ph` uses one top-origin curtain: `{ x: 0.5, y: -0.04 }`. The old sun-origin radial receiver clip was removed.
- `ph-education` uses the existing shared top-origin ink helper: `{ x: 0.5, y: -0.04 }`.
- `education` copy is ported verbatim from the R-1 copy baseline.
- Reduced motion uses the shared ink fallback, collapsing to the target hold without video playback.

## Harness Boundary

- `lab` was represented by a G6 harness-only read-only reference scene on the standalone group branch; the integration harness now uses the real G5 `lab` scene.
- No shared contract was changed in the standalone group branch. The post-integration repair fixed shared ink and timeline easing centrally on `codex/react-refactor-r4-integration`.

## Post-Integration Repair

- Shared ink reveal semantics were fixed centrally in integration, so `lab-ph` and `ph-education` keep source and target distinct during mid-transition.
- Directional receivers no longer draw a second CSS contour. The target frame is composited directly through the existing Ink shader `body`, so `edge`, `body`, `feather`, spatter, and particles all share one native boundary; live DOM takes over only on the completed frame.
- The group harness now mounts the real `lab` scene from G5, keeping copy and layout aligned across G5 and G6.
- `ph-animation` now initializes next-layer mounts at progress `0`. The first staged leg advances the paused media clock from `0 -> 1`, then stops; a fresh input runs the separate PH-to-Education ink leg. Reverse performs those two legs in the symmetric order.
- PH media playback is `1520ms` (80% of the former `1900ms`); the following `1200ms` Ink leg remains separate.
- Lab and Education keep their wide and portrait halves inside scene-owned reading scrollports. The stage and paper background stay fixed; the adjacent ink segment starts only from the relevant reading boundary.

## Evidence

- Unit coverage:
  - copy baseline diff for `education`
  - PH and education renderer `0 -> 1 -> 0 -> 1` idempotence
  - `verifySegmentTimeline()` for `lab-ph` and `ph-education`
  - reduced-motion timeline collapse
- Playwright coverage:
  - forward path `lab -> ph-animation -> education`
  - reverse path `education -> ph-animation`
  - reduced motion replay on `/harness/r4-g6-ph-education`
  - build-timeout recovery and hash-style seek to `education`
- Artifacts:
  - `artifacts/react-refactor/r4-g6/group6-forward-reverse-trace.json`
  - `artifacts/react-refactor/r4-g6/group6-reduced-motion-trace.json`
  - `artifacts/react-refactor/r4-g6/group6-old-new-ph-side-by-side.png`

## Visual Notes And Risks

- PH layer widths, bottom offsets, parallax travel, paper wash, sun wash, edge light, and texture values are taken from `css/ph.css`.
- The PH React scene is fixed to the harness viewport instead of using the old route's scroll-height wrapper. Progress remains deterministic through the segment renderer.
- Education uses the old row hierarchy and copy as a continuous two-screen reading scene inside the fixed R4 viewport; its last row remains reachable without moving the document or background.
- Final side-by-side visual parity received HITL confirmation; current release status is recorded in `R4-CLOSEOUT.md`.
