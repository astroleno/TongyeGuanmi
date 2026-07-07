# R4 G5 Notes

## Scope

- Branch: `codex/react-refactor-r4-g5-ttg-lab`
- Scenes: `ttg-animation`, `lab`
- Segments: `services-ttg`, `ttg-lab`
- Read-only endpoint: `services` is represented by a harness-only reference scene until G4 is merged.

## Legacy Sources

- TTG route component: `ttg-transition-route.html`
- TTG renderer parameters: `js/components/ttg-transition.js`
- TTG CSS and assets: `css/ttg.css`, `assets/ttg_*`
- Lab copy and layout: `src/sections/lab.html`
- Canonical contract: `docs/react-refactor/r4-worktree-groups.md`

## Parity Notes

- `ttg-animation` ports the layer stack, forward/reverse figure videos, accelerated progress, and tuned travel values from the old TTG route.
- `services-ttg` uses existing shared ink with a bottom origin.
- `ttg-lab` uses existing shared ink with a top origin to preserve the manifest top-to-bottom direction.
- No `transitions/shared`, `LayerWindow`, Director event, or visibility predicate changes.

## Evidence

- Copy baseline covered by `app/src/scenes/group5-scenes.test.ts`.
- Timeline and reduced-motion coverage lives in `app/src/transitions/group5-transitions.test.ts`.
- Harness routes: `/harness/r4-g5`, `/harness/r4-g5-services-ttg`, `/harness/r4-g5-ttg-lab`.
- Playwright artifacts:
  - `artifacts/react-refactor/r4-g5/group5-forward-reverse-trace.json`
  - `artifacts/react-refactor/r4-g5/group5-reduced-motion-trace.json`
  - `artifacts/react-refactor/r4-g5/group5-old-new-ttg-side-by-side.png`

## Open Risks

- HITL still needs final visual parity approval against `ttg-transition-route.html` and the old lab section.
