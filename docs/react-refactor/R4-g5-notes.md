# R4 G5 Notes

## Scope

- Branch: `codex/react-refactor-r4-g5-ttg-lab`
- Scenes: `ttg-animation`, `lab`
- Segments: `services-ttg`, `ttg-lab`
- Read-only endpoint: `services` was represented by a harness-only reference scene on the standalone group branch; the integration harness now uses the real G4 `services` scene.

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

## Post-Integration Repair

- Shared ink reveal semantics were fixed centrally in integration, so both `services-ttg` and `ttg-lab` keep source and target distinct during the handoff.
- The group harness now mounts the real `services` scene from G4, removing the simplified reference copy from the integration path.
- `ttg-animation` now starts next-layer mounts at progress `0` and uses native forward/reverse video playback during transition renderers, while preserving deterministic seek behavior outside playback.
- Lab layout was flattened away from the bordered screen/bento treatment and kept as a continuous two-screen scene without an extra inter-screen transition.

## Evidence

- Copy baseline covered by `app/src/scenes/group5-scenes.test.ts`.
- Timeline and reduced-motion coverage lives in `app/src/transitions/group5-transitions.test.ts`.
- Harness routes: `/harness/r4-g5`, `/harness/r4-g5-services-ttg`, `/harness/r4-g5-ttg-lab`.
- Playwright artifacts:
  - `artifacts/react-refactor/r4-g5/group5-forward-reverse-trace.json`
  - `artifacts/react-refactor/r4-g5/group5-reduced-motion-trace.json`
  - `artifacts/react-refactor/r4-g5/group5-old-new-ttg-side-by-side.png`
- Repair screenshot: `artifacts/react-refactor/r4-g5/group5-repair-ttg-hold.png`

## Open Risks

- HITL visual parity approval is complete. The later canonical TTG media refresh is recorded in `R4-CLOSEOUT.md` and remains an explicit R5 regression item.
