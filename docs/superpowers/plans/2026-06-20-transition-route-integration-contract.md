# Transition Route Integration Contract

## Goal

Add the last non-visual step before migrating more transition pages: every route should enter the shared transition runtime through one lifecycle wrapper, while keeping route-specific art direction, progress math, CSS variables, and asset timing local to that route.

## Contract

Transition routes should use `createTransitionRoute()` from `js/transitions/route-entry.js` and provide only route-specific hooks:

- `stage` or `stageSelector`: the route's scroll stage gate.
- `prepare(context)`: prepare route assets before reduced-motion branching.
- `onReducedMotion(context)`: set the static accessible final state without loading GSAP or blocking on video metadata.
- `beforeMount(context)`: wait for route-only prerequisites such as video metadata.
- `mount(context)`: create route ScrollTriggers, tweens, and progress bindings.
- `onError(error, context)`: restore a safe visual state if initialization fails.

The wrapper owns the common lifecycle:

- reduced-motion detection
- shared library loading
- smooth scroll runtime initialization
- pagehide cleanup
- optional `ScrollTrigger.refresh()`

## Boundaries

Implemented now:

- Add `js/transitions/route-entry.js`.
- Migrate `js/ph-scroll.js` as the only pilot.
- Extend `scripts/check-transition-runtime.mjs` to verify the route entry contract.

Deferred:

- Do not migrate `figure2`, `ttg`, `aod`, `crane`, or `figure3` in this slice.
- Do not add homepage chapter-transition registry code.
- Do not change visual copy, CSS art direction, asset paths, route timing constants, or portrait behavior.
- Do not use Playwright.

## Next Migration Shape

After this slice lands, each next route migration should be a small PR that only:

1. keeps the route's existing selectors and constants,
2. moves common lifecycle code into `createTransitionRoute()`,
3. registers route-created triggers/tweens through `addCleanup()`,
4. runs `npm run verify:transition-runtime` plus the existing structural checks.
