# R4 G7 Education -> Crane -> Contact Notes

## Scope

- Group: `education -> crane-animation -> contact`
- Branch: `codex/react-refactor-r4-g7-crane-contact`
- Harness routes:
  - `/harness/r4-g7`
  - `/harness/r4-g7-education-crane`
  - `/harness/r4-g7-crane-contact`

## Legacy Sources

- Crane visual source:
  - `js/components/crane-transition.js`
  - `css/crane.css`
  - `js/transitions/homepage/crane-homepage-adapter.js`
  - `crane-transition-route.html`
- Contact copy/layout source:
  - `src/sections/contact.html`
  - `css/sections/source-copy.css`
  - `docs/react-refactor/inventory/copy-reference.json`
- Manifest/source segment seed:
  - legacy transition `philosophy-contact`
  - canonical expansion `education -> education-crane -> crane-animation -> crane-contact -> contact`

## Ported Behavior

- `crane-animation` uses one deterministic timeline clock for the main crane and flock/ornithopter video layers. Forward and reverse both seek paused media frames from the same progress mapping, so direction changes cannot jump between unrelated native playback clocks.
- `education-crane` uses the existing shared bottom-origin ink helper: `{ x: 0.5, y: 1.04 }`.
- `crane-contact` uses a 4.2s `PilotProgressTimeline`: crane motion and both media clocks run across `0 -> 1`; at progress `0.8` the complete Contact copy appears once, while paper/wash opacity rises linearly across the remaining `0.8 -> 1` interval.
- `contact` copy is ported verbatim from the R-1 copy baseline.
- Reduced motion collapses to the target hold and keeps video playback scrubbed/paused.

## Harness Boundary

- `education` was represented by a G7 harness-only read-only reference scene on the standalone group branch; the integration harness now uses the real G6 `education` scene.
- No shared contract was changed in the standalone group branch. The post-integration repair fixed shared ink and timeline easing centrally on `codex/react-refactor-r4-integration`.

## Post-Integration Repair

- Shared ink reveal semantics were fixed centrally in integration, so `education-crane` keeps the education source and crane target distinct during mid-transition.
- The group harness now mounts the real `education` scene from G6, including the restored light paper background.
- `crane-animation` now initializes next-layer mounts at progress `0` and uses the same timeline-aligned seek renderer in both directions. The forward clock reaches the terminal frames at `1`; the reverse clock decreases continuously back to `0` without an end-to-start jump.
- `contact` was restored to the light paper background. Its complete copy enters at the `0.8` cue without a secondary rise/blur entrance; paper and wash alpha then track receiver progress linearly to `1`.

## Evidence

- Unit coverage:
  - copy baseline diff for `contact`
  - crane and contact renderer `0 -> 1 -> 0 -> 1` idempotence
  - `verifySegmentTimeline()` for `education-crane` and `crane-contact`
  - reduced-motion timeline collapse
- Playwright coverage:
  - forward path `education -> crane-animation -> contact`
  - reverse path `contact -> crane-animation`
  - reduced motion replay on `/harness/r4-g7-crane-contact`
  - build-timeout recovery and hash-style seek to `contact`
- Artifacts:
  - `artifacts/react-refactor/r4-g7/group7-forward-reverse-trace.json`
  - `artifacts/react-refactor/r4-g7/group7-reduced-motion-trace.json`
  - `artifacts/react-refactor/r4-g7/group7-old-new-crane-side-by-side.png`
- Repair screenshot: `artifacts/react-refactor/r4-g7/group7-repair-contact-hold.png`

## Visual Notes And Risks

- Crane layer widths, offsets, video scale, clipping, flock opacity, and down-exit movement are taken from `crane.css` and `crane-transition.js`.
- The old homepage adapter ghosts the contact receiver from the DOM. The corrected R4 timing keeps it transparent before `0.8`, makes the complete copy visible at `0.8`, and maps paper/wash opacity exactly to `range01(progress, 0.8, 1)`.
- Contact endpoint typography and copy are carried from `contact.html` and `source-copy.css`.
- Final side-by-side visual parity received HITL confirmation; current release status is recorded in `R4-CLOSEOUT.md`.
