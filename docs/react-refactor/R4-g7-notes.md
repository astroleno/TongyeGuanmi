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

- `crane-animation` is scrub-only. It seeks both crane transition videos, keeps them paused, and writes deterministic progress attributes.
- `education-crane` uses the existing shared bottom-origin ink helper: `{ x: 0.5, y: 1.04 }`.
- `crane-contact` uses a local `PilotProgressTimeline` media/copyCue handoff with copy cue at `0.8`.
- `contact` copy is ported verbatim from the R-1 copy baseline.
- Reduced motion collapses to the target hold and keeps video playback scrubbed/paused.

## Harness Boundary

- `education` is represented by a G7 harness-only read-only reference scene, because the canonical `education` scene belongs to G6 and is merged earlier in the integration train.
- No shared contract was changed in this group. `DirectorEvent`, `LayerWindow`, visibility predicates, and `transitions/shared/*` remain untouched.

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

## Visual Notes And Risks

- Crane layer widths, offsets, video scale, clipping, flock opacity, and down-exit movement are taken from `crane.css` and `crane-transition.js`.
- The old homepage adapter also ghosts the contact receiver from the DOM. In R4 this is modeled by `crane-contact` copyCue at `0.8`, matching the manifest contract.
- Contact endpoint typography and copy are carried from `contact.html` and `source-copy.css`.
- Final side-by-side visual parity still needs HITL confirmation after G4-G7 land in integration.
