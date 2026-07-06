# Validation Map

Required columns are present on every row:

`oldScript | oldAssertionSummary | oldAssertionCategory | newCoverageType | targetPhase | owner | automated | baselineGuard | r5Disposition | gapStatus`

## Root Scripts

| oldScript | oldAssertionSummary | oldAssertionCategory | newCoverageType | targetPhase | owner | automated | baselineGuard | r5Disposition | gapStatus |
|---|---|---|---|---|---|---|---|---|---|
| `verify:copy` | Runs `scripts/check-copy-alignment.mjs`; ensures required source copy exists in generated `index.html` and stale rewritten copy is gone. | copy alignment | Vitest | R0 copy baseline, R5 parity | R0 copy owner | yes | continue through R5 via old-site baseline guard | delete after new prerender copy diff and R5 SEO/no-JS extraction pass | mapped; R0 implementation required |
| `verify:ink-modules` | Runs `scripts/check-ink-modules.mjs`; checks ES module bootstrap, ink exports, keyword budget, reduced motion CSS, bottom-up exit ink surface. | adapter contract | ESLint | R0 lint/type scaffold, R2 transition contract | R0/R2 runtime owner | yes | continue until app ink/transition module contracts are green | delete when app ESLint and transition contract tests cover the invariants | mapped; R0/R2 implementation required |
| `verify:scroll-modules` | Runs `scripts/check-scroll-modules.mjs`; checks Lenis wiring, anchor alignment, long-canvas, nav/reveal compatibility, removal of stale snap stage. | scroll/runtime integration | Vitest | R1 input/charge/router, R5 no-JS/hash UAT | R1 runtime owner | yes | continue while old site remains deployable | delete at R5 because Lenis is retired from core runtime | mapped; R1/R5 implementation required |
| `verify:section-transitions` | Runs `scripts/check-section-transition-contract.mjs`; checks generated section/transition order, attrs, manifest consistency, handoff attrs, stale ids. | build/index/manifest injection | Vitest | R0 inventory schema and manifest tests | R0 manifest owner | yes | continue through R0-R4 as old baseline | delete when `story/manifest.ts` schema tests and prerender extraction cover equivalent facts | mapped; R0 implementation required |
| `verify:transition-runtime` | Runs `scripts/check-transition-runtime.mjs`; checks shared route-entry helpers, component exports, route HTML markers, media/scrub contracts for AOD/Figure2/TTG/PH. | adapter contract | TS 类型 | R0 types, R2 synthetic contracts, R3 pilot | R0/R2/R3 owners | yes | continue until corresponding app SceneModule/TransitionModule contracts exist | delete after R5 if all old route-entry pages are replaced by harness routes | mapped; R0-R3 implementation required |
| `verify:homepage-transitions` | Runs `scripts/check-homepage-transition-integration.mjs`; checks all homepage modules, staged snap, direct hash skip, target gates, copy ownership, Figure2 proof overlay, TTG native playback. | handoff/runtime integration | Playwright | R2 stage handoff, R3 pilot, R4 full migration | R2/R3/R4 owners | yes | continue as strongest old homepage guard until R5 | delete only after R5 visual parity matrix and app Playwright suite pass | mapped; R2-R5 implementation required |
| `verify:handoff-ownership` | Runs `scripts/check-handoff-ownership.mjs`; checks handoff schema, target entry policies, no cloneNode copy, receiver restore, ghost markings. | handoff ownership | Playwright | R2 stage handoff contract | R2 Stage owner | yes | continue through R4 | delete after app handoff contract and visual ownership Playwright tests pass at R5 | mapped; R2 implementation required |
| `verify:all` | Runs `build:page` plus all root `verify:*` scripts in sequence. | CI baseline aggregate | CI baseline guard | R0 CI through R5 cutover | release owner | yes | continue as default old-site guard unless this map is superseded by a confirmed subset | retire at R5 cutover when old static site is archived | mapped; R0 CI required |

## Check Scripts

| oldScript | oldAssertionSummary | oldAssertionCategory | newCoverageType | targetPhase | owner | automated | baselineGuard | r5Disposition | gapStatus |
|---|---|---|---|---|---|---|---|---|---|
| `scripts/check-copy-alignment.mjs` | Extracts visible text from current `index.html`, searches generated output plus Figure3 adapter, requires standard copy, forbids stale copy strings. | copy alignment | Vitest | R0 copy baseline and prerender text diff | R0 copy owner | yes | continue through R5 | replace with app copy baseline diff against `copy-reference.json` | mapped; baseline file generated in R-1 |
| `scripts/check-ink-modules.mjs` | Confirms `index.html` loads `js/main.js`, final bootstrap imports expected modules, ink text/scene exports exist, CSS handles reduced motion, WebGL keyword budget <= 2, homepage has exit ink canvas. | adapter/module structure | ESLint | R0 module boundary rules and R2 transition reduced-motion contract | R0 lint owner | yes | continue until app lint/tests enforce module boundaries | delete after app module contracts and reduced-motion transition tests pass | mapped; R0/R2 implementation required |
| `scripts/check-scroll-modules.mjs` | Confirms Lenis CDN pin/loading, `initSmoothScroll`, anchor numeric target alignment, initial hash correction, long-canvas/template/nav/reveal compatibility, removal of old post-hero snap stage. | scroll/runtime integration | Vitest | R1 InputNormalizer/InputRouter, R5 hash/no-JS UAT | R1 runtime owner | yes | continue while old static site is baseline | delete at R5 because core React runtime uses virtual scroll and native inner overflow, not Lenis | mapped; R1/R5 implementation required |
| `scripts/check-section-transition-contract.mjs` | Imports `src/section-manifest.mjs`; validates generated section count/order/attrs, transition count/order/attrs, DOM order, executable modules, entry policies, handoff attrs, method proof internal transition, stale transition ids. | build/index/manifest injection | Vitest | R0 `inventory-schema` and `story/manifest.ts` tests | R0 manifest owner | yes | continue through R4 as old-baseline build guard | delete once new manifest schema, canonical spine, and prerender output tests cover all facts | mapped; R0 implementation required |
| `scripts/check-transition-runtime.mjs` | Checks route-entry and component contracts for shared loaders, ScrollTrigger wrappers, video scrub helpers, reduced motion, metadata waits, single-video PH/AOD, Figure2 controller exports, TTG scene factory, HTML route markers. | adapter contract | TS 类型 | R0 `SceneModule`/`TransitionModule` types, R2 synthetic contracts, R3 pilot media contract | R0/R2/R3 owners | yes | continue until every referenced renderer has app harness coverage | delete after R5 when route-entry previews are replaced by app harness routes | mapped; R0-R3 implementation required |
| `scripts/check-homepage-transition-integration.mjs` | Validates one homepage instance per named module, pattern direct-hash behavior, AOD/Crane/Brand handoff targets, Figure2 staged values/proof overlay/single DOM copy, target gates, CSS fixed-stage behavior, TTG playback decoupling, no route-entry calls in homepage runtime. | homepage transition integration | Playwright | R2 Stage handoff, R3 pilot, R4 full migration, R5 parity | R2/R3/R4 owners | yes | continue as old homepage parity baseline through R5 | delete after app Playwright visual/DOM ownership suite and R5 parity pass | mapped; R2-R5 implementation required |
| `scripts/check-handoff-ownership.mjs` | Validates handoff ids/policies/reduced motion, no cloned target content, receiver restore re-presents source, visual adapters mark transition ghosts, Figure3/Pattern do not own deprecated copy. | handoff ownership | Playwright | R2 Stage/LayerWindow ownership tests | R2 Stage owner | yes | continue through R4 migration | delete after app handoff ownership and no-duplicate-copy Playwright tests pass | mapped; R2 implementation required |

## Build And Serve Scripts

| oldScript | oldAssertionSummary | oldAssertionCategory | newCoverageType | targetPhase | owner | automated | baselineGuard | r5Disposition | gapStatus |
|---|---|---|---|---|---|---|---|---|---|
| `build:page` / `scripts/build-index.mjs` | Expands `src/index.template.html` partials and injects section/transition/handoff attrs from `src/section-manifest.mjs` into `index.html`. | build/index/manifest injection | CI baseline guard | R0 CI, R5 cutover | release owner | yes | continue as part of `verify:all` | retire when Vite/prerender build is default and old site is archived | mapped; R0 CI required |
| `dev` / `dev:web` / `scripts/serve-static-site.mjs` | Serves old static site with no-store headers and range support for media. | local preview | 退役理由 | R5 cleanup | release owner | no | not required for new app baseline | retire when app dev server/harness replaces old static preview | mapped; no R0 blocker |

## Baseline Guard Subset For R0

Default R0 guard remains:

```txt
npm run build:page && npm run verify:all
```

R0 may only shrink this after HITL confirmation. Current R-1 recommendation is to keep the full old baseline guard because each script maps to at least one R0-R5 replacement contract and the old static site remains the parity baseline.

