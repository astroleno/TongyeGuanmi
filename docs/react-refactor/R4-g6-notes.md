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
- `lab-ph` uses the existing shared radial ink helper with the old sun-origin handoff approximation: `{ x: 0.11, y: 0.36 }`.
- `ph-education` uses the existing shared top-origin ink helper: `{ x: 0.5, y: -0.04 }`.
- `education` copy is ported verbatim from the R-1 copy baseline.
- Reduced motion uses the shared ink fallback, collapsing to the target hold without video playback.

## Harness Boundary

- `lab` is represented by a G6 harness-only read-only reference scene, because the canonical `lab` scene belongs to G5 and is merged earlier in the integration train.
- No shared contract was changed in this group. `DirectorEvent`, `LayerWindow`, visibility predicates, and `transitions/shared/*` remain untouched.

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
- Education uses the old edition row hierarchy and copy, but the long-page layout is constrained into the R4 scene shell for harness stability.
- Final side-by-side visual parity still needs HITL confirmation after G4-G7 land in integration.
