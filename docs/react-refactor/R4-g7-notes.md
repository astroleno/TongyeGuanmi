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

- `crane-animation` supports deterministic seek rendering and transition-time native playback for the main crane and flock/ornithopter video layers.
- `education-crane` uses the existing shared bottom-origin ink helper: `{ x: 0.5, y: 1.04 }`.
- `crane-contact` uses a local `PilotProgressTimeline` media/copyCue handoff with contact receiver progress from `0.58 -> 0.94` and copy cue at `0.8`.
- `contact` copy is ported verbatim from the R-1 copy baseline.
- Reduced motion collapses to the target hold and keeps video playback scrubbed/paused.

## Harness Boundary

- `education` was represented by a G7 harness-only read-only reference scene on the standalone group branch; the integration harness now uses the real G6 `education` scene.
- No shared contract was changed in the standalone group branch. The post-integration repair fixed shared ink and timeline easing centrally on `codex/react-refactor-r4-integration`.

## Post-Integration Repair

- Shared ink reveal semantics were fixed centrally in integration, so `education-crane` keeps the education source and crane target distinct during mid-transition.
- The group harness now mounts the real `education` scene from G6, including the restored light paper background.
- `crane-animation` now initializes next-layer mounts at progress `0`, uses native video playback during transition-time renderers, and keeps deterministic seek mode for tests and reduced motion.
- `contact` was restored to the light paper background, and `crane-contact` now models the old homepage handoff receiver window before the `0.8` copy cue.

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
- The old homepage adapter ghosts the contact receiver from the DOM. In R4 this is modeled by `crane-contact` receiver progress `0.58 -> 0.94` plus copyCue at `0.8`, matching both the visual handoff and manifest contract.
- Contact endpoint typography and copy are carried from `contact.html` and `source-copy.css`.
- Final side-by-side visual parity still needs HITL confirmation after G4-G7 land in integration.
