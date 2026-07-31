# R5 Phone Real Root and Presentation Host-Plane Recovery

**Status:** design checkpoint — implementation is blocked until these red
gates and topology rules are accepted.

## Frozen scope

Do not modify AOD, Figure2, Figure3, TTG, Group 6–7, media masters, or timing
ledgers. This recovery owns only:

1. physical-phone renderer selection at `/`;
2. root presentation-host ordering and effect placement; and
3. observable pixel acceptance for Loader, Hero, and Figure1.

## Root-selection contract

- The production build must select the same phone family in `index.html`
  preboot and `App.tsx`. A physical phone at `/` mounts exactly one
  `data-phone-authority-id` root and no `.story-app` desktop shell.
- `VITE_ENABLE_PHONE_STORY=true` is a release-input contract, not an optional
  validation switch. `release:prepare` must set it explicitly and the release
  manifest/build verifier must record and assert it.
- `?v=...` may remain only as a local diagnostic mode; it cannot be used as
  release acceptance evidence or change the production-phone result at `/`.
- The actual release candidate must be built and tested at `/` without a query
  override. A normal local build can remain useful for desktop work, but cannot
  be called a phone release build while the flag is false.

## Presentation-host contract

Numeric child z-index values are **local to their host**. They are never a
global ordering claim. The root must render and register these explicit hosts:

| Top-level host plane | Responsibility | Local content allowed |
| --- | --- | --- |
| `coverage` | Opaque visual-viewport background, always behind visible content and non-interactive. | No scene/effect content. |
| `content` | Fixed stage and the mutually controlled reading/stable surfaces. | Retained, fixed, stable, source, receiver, and between-endpoint effect roles. |
| `route-overlay` | Effects declared `above-both`. It is a direct route-level sibling, not a child of either endpoint. | Only explicitly registered overlay effects. |
| `navigation` | Interactive menu and global controls. | Navigation only; it must remain hit-testable above every presentation host. |

`PhoneStageRail` owns the coverage and stage host elements. `PhoneStoryShell`
owns the route-overlay and navigation siblings. `presentation.ts` receives a
host identity during registration; the manifest declares `content` versus
`route-overlay` for every effect. A missing declared host fails closed during
admission. No runtime DOM scan, local z-index escalation, or scene-specific
coverage patch may select a host.

The existing stage-local role ladder may order items **inside** `content`.
`transition-effect-above` must instead mount in `route-overlay`; it may not be
rendered inside `stage-canvas` and then be described as globally above a
native/document receiver.

## Red gates to add before product changes

These tests must build with `VITE_ENABLE_PHONE_STORY=true`, visit `/` without
`?v`, and read the final composited viewport pixels. DOM datasets, CSS source,
and computed z-index numbers are diagnostic only.

1. **Real root authority:** cold mobile `/` has exactly one visible phone
   authority; `.story-app` is absent; no desktop hero lifecycle is running.
2. **Loader timeline:** cold Loader has non-empty composited pixels at entry,
   changes over its required timeline, and hands off to a non-loader Hero.
   Reload/recovery is a separate test and cannot satisfy the cold gate.
3. **Hero visibility:** after Loader exit, viewport screenshots are not an
   edge-surface-only frame. The title and subtitle regions both contain
   non-background pixels and change over their authored entrance time series.
4. **Figure1 compositing:** the leaf reports a real canvas frame and alpha
   verification, and the captured viewport contains non-background pixels in
   the Figure1 region. A canvas/dataset-only witness is insufficient.
5. **Host occlusion:** the coverage plane cannot produce a monochrome frame
   while the active content host is declared visible. An `above-both` effect
   must be observable above both source and receiver in its route overlay.

Use screenshot-buffer or browser pixel analysis with deterministic viewport,
font readiness, and reduced-motion state. Pixel thresholds belong beside the
test fixtures and must reject the known all-coverage screenshot.

## Implementation sequence after red gates fail

1. Add the five gates and demonstrate they fail on the current artifact.
2. Replace the implicit pseudo-element/stacking-context relationship with the
   explicit registered hosts above; move only effects whose manifest placement
   is `above-both` into `route-overlay`.
3. Make production root selection and preboot share the explicit release
   contract. Record it in the candidate manifest and verify it after build.
4. Turn the red gates green on `/`, then run the existing state-machine suites
   without re-opening frozen scene ledgers.
5. Only after Chromium and WebKit pixel matrices pass should a new annotated
   candidate be created. CDN upload, memory qualification, and physical iPhone
   occur after that new candidate, never before.

## Required evidence for the next decision

- Red and green outputs for the five gates, including saved failure frames.
- A topology witness listing each registered host, host plane, local role, and
  effect placement for every active transition.
- A production build artifact proving phone preboot is enabled and `/` chooses
  the phone authority on a coarse, non-hover phone viewport.
- Chromium and WebKit screenshots from `/` for Loader, Hero, Figure1, and one
  `above-both` transition.
