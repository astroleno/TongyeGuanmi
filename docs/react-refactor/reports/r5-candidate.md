# R5 Release Candidate

Status: implementation and automated release gates complete; stopped for HITL approval. No main merge or deployment has occurred.

## Identity

| Item | Value |
|---|---|
| stage branch | `codex/react-refactor-r5-parity-cutover` |
| base | `react-refactor-r4-closeout` / `c2a52dbefd99d2ee99ffa13db0abbdf7b760a143` |
| candidate tag | `react-refactor-r5-candidate` |
| deployable directory | `dist/` |
| release manifest | `dist/r5-release-manifest.json` |
| manifest files / bytes | 91 / 139,459,883 |
| manifest SHA-256 | `49f7eda598b74a460828d4c3480b0075ff67a451c730bde9623d5931e20f960e` |

The manifest contains sorted path, byte count and SHA-256 entries for every release file and has no timestamp. Two consecutive builds produced the same manifest hash.

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

The final candidate tag adds only this rehearsal/review record to the verified implementation commit. Its exact checkout is rebuilt and hash-checked after tagging; any mismatch invalidates the tag.

## HITL Checklist

Approval must explicitly cover:

- full visual rhythm and historical no-blank/no-black/no-duplicate symptoms;
- real desktop Safari, iOS Safari and Android Chrome input feel;
- TTG new forward/reverse alpha playback and edges;
- SEO/no-JS artifact and live crawler behavior;
- performance budgets with no exception request;
- clean rollback rehearsal and archive retention strategy.

After approval only: merge/deploy the exact candidate, smoke production and create `react-refactor-r5-cutover`. Until then this document describes a release candidate, not a completed cutover.
