# R5 Release Candidate v2

Status: candidate v2 implementation and automated release gates complete; stopped for HITL approval. The original candidate remains immutable but is superseded. No main merge or deployment has occurred.

## Identity

| Item | Value |
|---|---|
| stage branch | `codex/react-refactor-r5-parity-cutover` |
| base | `react-refactor-r4-closeout` / `c2a52dbefd99d2ee99ffa13db0abbdf7b760a143` |
| candidate tag | `react-refactor-r5-candidate-v2` |
| superseded tag | `react-refactor-r5-candidate` / `0de4972de64455a14d8c36262e58cc6af5c4875b` |
| deployable directory | `dist/` |
| release manifest | `dist/r5-release-manifest.json` |
| manifest files / bytes | 91 / 139,459,883 |
| manifest SHA-256 | `49f7eda598b74a460828d4c3480b0075ff67a451c730bde9623d5931e20f960e` |

The manifest contains sorted path, byte count and SHA-256 entries for every release file and has no timestamp. Two consecutive builds produced the same manifest hash.

## Candidate v2 Re-freeze Closure

The original immutable tag failed one root Vitest contract: `group1Manifest.test.ts` prohibited every `starMapCanvasMotionActive).toBe(false)` assertion even though the accepted G1 E2E intentionally verifies frozen Star Map idle motion during both transition checkpoints and live motion at hold. Candidate v2 replaces that stale negative source check with three explicit contracts:

- canonical handoff during transition: `false`;
- Pattern→Star Map ink checkpoint during transition: `false`;
- settled Star Map hold: `true`.

Every automated gate below was rerun after the correction; no result was inherited from the superseded tag.

| Gate | Candidate v2 result |
|---|---|
| clean Node 22 root `verify:all` | 65/65 Vitest files, 418/418 contracts; lint, typecheck, build, SEO, budgets and manifest pass |
| historical Playwright harness | 41/41 pass |
| four-project release matrix | 47 pass, 25 intentional project skips, 72 total |
| exact-tag freeze check | fresh `--no-local` checkout passes root `verify:all`, reproduces manifest `49f7eda5…f960e`, and passes 3/3 production smoke checks |

The correction changes only a test contract and release records. Production source, assets and emitted artifact are byte-identical to the previously rehearsed implementation.

## Delivered Scope

- `/` mounts the complete canonical StoryApp; R0 scaffold and old runtime selectors are absent.
- Director/Stage/LayerWindow integrate real wheel, touchpad, touch, keyboard, reading-edge handoff, menu, hash/history, reduced motion and recovery.
- all scenes/transitions and development harnesses are separated dynamic imports; production excludes harness routes and removes the R4 >500 kB single chunk.
- root tooling, release CI and deploy build target React `dist/`.
- static crawlable shell preserves 127 public copy items and meaningful no-JS anchors.
- four-project full-spine/reverse/input/media/SEO matrix (47 pass, 25 intentional project skips), 418 Vitest contracts and 41-test historical harness regression pass.
- TTG forward/reverse alpha is verified across desktop/mobile Chromium/WebKit.
- LCP, frame pacing, bundle, GPU/RSS/heap and dispose budgets pass without exception.
- cutover/rollback/archive procedure and clean-environment rehearsal are the final artifact gate.

## Evidence

- `r5-regression-matrix.md`
- `r5-performance-budget.md`
- `r5-seo-no-js.md`
- `../runbooks/react-cutover-rollback.md`
- `../../../artifacts/react-refactor/r5-candidate/r5-process-memory.json`
- `../../../artifacts/react-refactor/r5-candidate/visual/`

## Baseline Verification

| Baseline | Peeled commit | Clean-build evidence |
|---|---|---|
| legacy static | `a78b064d65f024a301a3b179c62a458a1445bbf6` | index SHA `d9502a…afc7`; runtime manifest `c25907…2e30` |
| R4 visual accepted | `55b8a123a7a5b28647c40acc81783ee37cd58302` | immutable visual gate |
| R4 closeout | `c2a52dbefd99d2ee99ffa13db0abbdf7b760a143` | app/dist manifest `ae1ff9…078b`; initial JS 544,942 B |

## Clean Rollback Rehearsal

Rehearsal passed on 2026-07-12 from a fresh `git clone --no-local` of implementation commit `469a9caf7e2530232d298635bfaf8dbc26498936`:

1. detached candidate checkout was clean; Node 22 + frozen pnpm install and `pnpm run deploy:build` reproduced manifest `49f7eda598b74a460828d4c3480b0075ff67a451c730bde9623d5931e20f960e`;
2. clean candidate browser smoke passed public root, JS-disabled正文 and rendered old/harness 404 checks (3/3);
3. a separate clean worktree at legacy `a78b064d65f024a301a3b179c62a458a1445bbf6` rebuilt `index.html` SHA-256 `d9502a9b5c7c17ce146098e2a3080de7c20e287f91b26fe307dbcabbf161afc7`;
4. the same local release port switched candidate → legacy → candidate; legacy served the expected title/CTA/bootstrap and a 100-byte video range as HTTP 206 while the candidate manifest returned 404;
5. the restored candidate again served the crawlable shell and the exact approved manifest hash.

Candidate v2 adds only the corrected G1 source contract and re-freeze records to the superseded tag. Its production artifact remains byte-identical to the rehearsed implementation. A fresh exact-tag checkout was rebuilt, root-verified and hash-checked after tagging; any mismatch would invalidate the tag.

## HITL Checklist

Approval must explicitly cover:

- full visual rhythm and historical no-blank/no-black/no-duplicate symptoms;
- real desktop Safari, iOS Safari and Android Chrome input feel;
- TTG new forward/reverse alpha playback and edges;
- SEO/no-JS artifact and live crawler behavior;
- performance budgets with no exception request;
- clean rollback rehearsal and archive retention strategy.

After approval only: merge/deploy the exact candidate, smoke production and create `react-refactor-r5-cutover`. Until then this document describes a release candidate, not a completed cutover.
