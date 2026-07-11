# Validation Map

Status: R5 replacement coverage is closed. Default root commands and CI now validate production React; old scripts remain only behind explicit `legacy:*` aliases for rollback. R6 owns physical deletion/final archive cleanup after approved cutover.

Required columns:

`oldScript | oldAssertionSummary | oldAssertionCategory | newCoverageType | targetPhase | owner | automated | baselineGuard | r5Disposition | gapStatus`

## Root Scripts

| oldScript | oldAssertionSummary | oldAssertionCategory | newCoverageType | targetPhase | owner | automated | baselineGuard | r5Disposition | gapStatus |
|---|---|---|---|---|---|---|---|---|---|
| `verify:copy` | Generated HTML copy alignment | Vitest/build extraction | Vitest | R0/R5 | copy/SEO | yes | immutable legacy tag | replaced by `copy-baseline` tests plus `verify-release-build.mjs`; legacy alias retained | closed for R5; deletion deferred to R6 |
| `verify:ink-modules` | Ink exports, reduced motion and module shape | adapter contract | ESLint + Vitest | R2/R5 | transition | yes | R4 harness | replaced by lint, ink lifecycle/contract tests and production browser matrix | closed for R5 |
| `verify:scroll-modules` | Lenis, anchors and scroll integration | input/runtime | Vitest + Playwright | R1/R5 | runtime | yes | legacy tag | Lenis retired; input controller, reading handoff and hash tests replace it | closed for R5 |
| `verify:section-transitions` | Section order, attrs and manifest consistency | manifest/build | TS + Vitest | R0/R5 | manifest | yes | canonical spine | replaced by typed manifest/canonical spine tests and static shell anchors | closed for R5 |
| `verify:transition-runtime` | Adapter/media/scrub route contracts | runtime contract | TS + Vitest | R2-R5 | runtime | yes | R4 harness | replaced by Scene/TransitionModule contracts, media gates and lazy loaders | closed for R5 |
| `verify:homepage-transitions` | Homepage integration, staged snap, hash and media | full integration | Playwright | R2-R5 | release | yes | legacy/R4 tags | replaced by 41-test harness suite plus R5 production matrix | closed for R5 |
| `verify:handoff-ownership` | Handoff ownership/no clone/ghost cleanup | Stage ownership | Vitest + Playwright | R2-R5 | Stage | yes | R4 harness | replaced by LayerWindow/Stage/ink ownership tests and layer invariants | closed for R5 |
| old `verify:all` | Legacy build plus all static checks | CI aggregate | CI | R5 | release | yes | `legacy:verify:all` | root `verify:all` now lint + typecheck + 418 Vitest + release build; old aggregate is explicit legacy only | closed for R5 |

## Check Scripts

| oldScript | oldAssertionSummary | oldAssertionCategory | newCoverageType | targetPhase | owner | automated | baselineGuard | r5Disposition | gapStatus |
|---|---|---|---|---|---|---|---|---|---|
| `scripts/check-copy-alignment.mjs` | Required/stale visible copy | copy alignment | Vitest + build extractor | R5 | copy/SEO | yes | `copy-reference.json` | replaced; `dist/index.html` checks 127 public items | closed for R5 |
| `scripts/check-ink-modules.mjs` | Ink bootstrap/exports/reduced motion | module contract | ESLint + Vitest | R5 | transition | yes | R4 ink harness | replaced by module/lifecycle/reduced-motion contracts | closed for R5 |
| `scripts/check-scroll-modules.mjs` | Smooth scroll/hash/anchor integration | input/runtime | Vitest + Playwright | R5 | runtime | yes | legacy tag | replaced by normalized wheel/touch/key, reading edge and history/hash coverage | closed for R5 |
| `scripts/check-section-transition-contract.mjs` | Section/transition order and policies | manifest | TS + Vitest | R5 | manifest | yes | canonical spine | replaced by manifest/schema/spine/static-shell tests | closed for R5 |
| `scripts/check-transition-runtime.mjs` | Route-entry and renderer/media contracts | adapter contract | TS + Vitest | R5 | runtime | yes | R4 harness | replaced; production module loader imports every scene/transition lazily | closed for R5 |
| `scripts/check-homepage-transition-integration.mjs` | One-instance ownership, target gates, proof and TTG | integration | Playwright | R5 | release | yes | legacy/R4 evidence | replaced by production full-spine/reverse/recovery/TTG tests | closed for R5 |
| `scripts/check-handoff-ownership.mjs` | No cloned copy, receiver restore and ghost cleanup | ownership | Vitest + Playwright | R5 | Stage | yes | R4 harness | replaced by Stage/LayerWindow/endpoint continuity and visual-layer assertions | closed for R5 |

## Build And Serve Scripts

| oldScript | oldAssertionSummary | oldAssertionCategory | newCoverageType | targetPhase | owner | automated | baselineGuard | r5Disposition | gapStatus |
|---|---|---|---|---|---|---|---|---|---|
| `build:page` / `scripts/build-index.mjs` | Assemble legacy static homepage | build | CI release build | R5 | release | yes | legacy tag + checksum | replaced by Vite/static shell and `deploy:build`; available only as `legacy:build` | closed for R5; delete after retention in R6 |
| old `dev` / `serve-static-site.mjs` | Serve legacy root/media ranges | local preview | retirement reason | R5 | release | no | `legacy:dev` | root `dev` is React; legacy server explicit only and not production reachable | closed for R5; delete after retention in R6 |

## R5 Default Guard

```txt
pnpm run verify:all
pnpm run test:browser
pnpm run test:release
pnpm run deploy:build
```

CI uses Node 22, frozen pnpm install, the four-project release matrix, all historical harness contracts, a final production rebuild and uploads only `dist/`. `legacy:verify:all` is not a default or release dependency.
