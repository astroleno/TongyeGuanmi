# Transition Route Integration Contract

## Status

This contract is valid for Phase 2B standalone route lifecycle work. It is not the final standard for mounting the seven visual transitions into the homepage.

The current wrapper answers one question:

> How should an independent transition route initialize, load libraries, handle reduced motion, and clean itself up?

It intentionally does not yet answer:

> How should the homepage map `data-transition` placeholders to `/ph`, `/aod`, `/figure2`, `/ttg`, `/crane`, `/figure3`, or canvas-based transition adapters?

That homepage-facing layer needs a separate adapter contract before the seven transitions are promoted into the main page.

## Goal

Add the last non-visual step before migrating more standalone transition pages: every compatible route should enter the shared transition runtime through one lifecycle wrapper, while keeping route-specific art direction, progress math, CSS variables, and asset timing local to that route.

## Standalone Route Contract

Compatible standalone transition routes should use `createTransitionRoute()` from `js/transitions/route-entry.js` and provide route-specific hooks:

- `stage` or `stageSelector`: the route's scroll stage gate.
- `prepare(context)`: prepare route assets before reduced-motion branching.
- `onReducedMotion(context)`: set an immediate accessible final state.
- `beforeMount(context)`: wait for route-only prerequisites such as video metadata.
- `mount(context)`: create route ScrollTriggers, tweens, progress bindings, and route-only listeners.
- `onError(error, context)`: restore a safe visual state if initialization fails.

The wrapper owns the common standalone lifecycle:

- reduced-motion detection
- shared library loading
- smooth scroll runtime initialization
- pagehide cleanup
- optional `ScrollTrigger.refresh()`

Routes using GSAP + ScrollTrigger + optional scrub video are good candidates for this contract. PH is the pilot. `figure2`, `ttg`, `aod`, `crane`, and `figure3` can be evaluated one at a time, but each migration must preserve its existing native fallback and final-state behavior.

## Explicit Non-Fit: Pattern Bloom

`pattern-bloom` is not currently a `createTransitionRoute()` candidate. It is a canvas/rAF/scroll-listener scene, not a GSAP + ScrollTrigger + scrub-video route.

Do not force it through this wrapper just to make the interface uniform. If it becomes part of homepage transitions, it should use a dedicated `canvas-transition-adapter` shape that owns:

- canvas scene setup
- rAF lifecycle
- scroll/resize/media-query listeners
- explicit `render(progress)` or equivalent progress input
- full cleanup of all external side effects

## Reduced Motion Rule

Reduced motion must make a static usable state visible immediately. Video metadata and media seeking may improve the final frame asynchronously, but they must not block the first reduced-motion state.

For routes like `crane` and `figure2` that currently rely on video readiness for the polished final frame, the migration rule is:

1. show a CSS/static final state immediately,
2. attempt video metadata/seek as best effort,
3. leave the static final state intact if media is unavailable.

## Fallback Rule

The current `createTransitionRoute()` implementation routes library failures through `onError`. That is enough for the PH pilot, but it is not sufficient as the seven-route standard.

Before migrating routes that already have native fallback behavior, the contract or implementation must add an explicit fallback path such as:

- `onLibraryError(error, context)`: classify GSAP/Lenis/ScrollTrigger loading failures,
- `mountNativeFallback(context)`: mount the existing native scroll or static route behavior,
- fallback cleanup registration through `addCleanup()`.

No route migration should reduce resilience compared with the current standalone page.

## Cleanup Rule

All external side effects created by a route or adapter must be registered through `addCleanup()`.

This includes:

- ScrollTrigger instances
- GSAP tweens, timelines, and ticker callbacks
- `requestAnimationFrame` loops
- scroll, resize, pointer, keyboard, and media event listeners
- media-query listeners
- observers
- timers
- singleton scene instances
- temporary inline styles or attributes that need restoration

Returning a single cleanup function from `mount()` is acceptable only if that function disposes every side effect created by the route.

## Homepage Adapter Contract

Homepage integration needs a separate adapter layer between generated `data-transition` placeholders and standalone route logic.

That future layer must define:

- **Transition id mapping:** map each homepage `data-transition` or `data-transition-id` value to one adapter module and one route/visual identity.
- **Mount host:** mount into the existing `.chapter-transition` placeholder or a clearly declared child host, never by querying arbitrary global route DOM.
- **Progress source:** receive homepage chapter progress from the homepage runtime; adapters should not create their own competing page scroll lifecycle unless explicitly assigned.
- **Render interface:** expose a small interface such as `mount({ host, fromSection, toSection, progressSource, addCleanup })` and update visuals from `progress`.
- **Asset ownership:** declare required assets and lazy-load behavior per adapter. Route page assets are not automatically available on the homepage.
- **CSS ownership:** use namespaced transition CSS and avoid leaking standalone page layout styles into the homepage.
- **Failure isolation:** failed dynamic imports, missing assets, or runtime errors must degrade that placeholder to `soft-divider` without breaking the rest of the homepage.
- **Reduced motion:** render an immediate static state and avoid long-running scroll/animation lifecycles.
- **Cleanup:** dispose every listener, rAF loop, media element, ScrollTrigger, observer, and inline mutation when the adapter unmounts.

This adapter layer is the real contract for connecting `/ph`, `/aod`, `/figure2`, `/ttg`, `/crane`, `/figure3`, or `pattern-bloom`-style visuals to the homepage. It should be designed after the standalone route lifecycle wrapper is stable.

## Boundaries

Implemented now:

- Add `js/transitions/route-entry.js`.
- Migrate `js/ph-scroll.js` as the only pilot.
- Extend `scripts/check-transition-runtime.mjs` to verify the standalone route entry contract.
- Document the homepage adapter gap so this contract is not mistaken for the final seven-transition standard.

Deferred:

- Do not migrate `figure2`, `ttg`, `aod`, `crane`, `figure3`, or `pattern-bloom` in this slice.
- Do not add homepage chapter-transition registry code in this slice.
- Do not define the final adapter module API in code yet.
- Do not change visible copy, CSS art direction, asset paths, route timing constants, or portrait behavior.
- Do not use Playwright.

## Next Migration Shape

After this slice lands, each standalone route migration should be a small PR that only:

1. classifies the route as `route-entry` compatible or adapter-only,
2. keeps the route's existing selectors and constants,
3. moves common lifecycle code into `createTransitionRoute()` only when compatible,
4. preserves existing native fallback behavior,
5. registers every external side effect through `addCleanup()`,
6. runs `npm run verify:transition-runtime` plus the existing structural checks.

The homepage adapter contract should be a separate plan before any of the seven visuals are mounted into `src/index.template.html`.
