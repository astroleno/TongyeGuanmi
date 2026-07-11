# R4 G4 Notes

## Scope

- Branch: `codex/react-refactor-r4-g4-figure3-services`
- Scenes: `figure3-animation`, `services`
- Segments: `brand-figure3`, `figure3-services`
- Read-only endpoint: `brand`

## Legacy Sources

- Services copy and structure: `src/sections/services.html`
- Figure3 route component: `figure3-transition-route.html`
- Figure3 renderer parameters: `js/components/figure3-transition.js`
- Figure3 CSS and assets: `css/components/figure3-transition.css`, `assets/figure3-alpha-scrub.webm`, `assets/figure3-alpha-poster.png`
- Canonical contract: `docs/react-refactor/r4-worktree-groups.md`

## Parity Notes

- `figure3-animation` ports the scrub video, poster, fill fade, backdrop settle, and accelerated progress from the standalone route.
- `figure3-services` keeps the R-1 `copyCue.atProgress = 0.8`; services text enters only after the cue.
- `brand-figure3` uses the existing shared ink factory with a bottom origin, matching the manifest horizontal bottom-to-top direction without forking shared code.

## Post-Integration Repair

- Shared ink was fixed on `codex/react-refactor-r4-integration` to reveal the target layer with a clipped from/to handoff instead of letting the target cover the source at mid-progress.
- `figure3-animation` now initializes next-layer mounts at progress `0` and only settles to progress `1` while held as the current scene, matching the old route's delayed playback semantics.
- `figure3-services` now records a handoff receiver progress window alongside the `0.8` copy cue so Playwright can assert the services copy does not appear as a nominal-only cue.

## Evidence

- Copy baseline covered by `app/src/scenes/group4-scenes.test.ts`.
- Timeline and reduced-motion coverage lives in `app/src/transitions/group4-transitions.test.ts`.
- Harness routes: `/harness/r4-g4`, `/harness/r4-g4-brand-figure3`, `/harness/r4-g4-figure3-services`.
- Playwright artifacts:
  - `artifacts/react-refactor/r4-g4/group4-forward-reverse-trace.json`
  - `artifacts/react-refactor/r4-g4/group4-reduced-motion-trace.json`
  - `artifacts/react-refactor/r4-g4/group4-old-new-figure3-side-by-side.png`
- Repair screenshot: `artifacts/react-refactor/r4-g4/group4-repair-figure3-reveal.png`

## Open Risks

- HITL visual parity approval is complete; current release status is recorded in `R4-CLOSEOUT.md`.
