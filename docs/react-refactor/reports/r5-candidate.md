# R5 Release Candidate v3

Status: candidate v3 implementation, automated release gates and release identity binding complete; stopped for HITL approval. Both earlier candidate tags remain immutable but are superseded. No main merge or deployment has occurred.

## Identity

| Item | Value |
|---|---|
| stage branch | `codex/react-refactor-r5-parity-cutover` |
| base | `react-refactor-r4-closeout` / `c2a52dbefd99d2ee99ffa13db0abbdf7b760a143` |
| candidate tag | `react-refactor-r5-candidate-v3` |
| superseded tag | `react-refactor-r5-candidate-v2` / `a5bef3785b766dac0e5ecfc95e96d03cd5c51c90` |
| superseded tag | `react-refactor-r5-candidate` / `0de4972de64455a14d8c36262e58cc6af5c4875b` |
| deployable directory | `dist/` |
| release manifest | `dist/r5-release-manifest.json` |
| manifest files / bytes | 91 / 139,459,883 |
| manifest identity | schema 2: candidate tag, annotated tag object, source commit, `sourceDirty: false` |
| manifest SHA-256 | emitted by the exact-tag build and stored with the immutable release artifact |

The manifest contains sorted path, byte count and SHA-256 entries for every release file and has no timestamp. Candidate/deploy builds require explicit `R5_CANDIDATE_TAG` and `R5_SOURCE_COMMIT`, then verify the annotated tag object peels to that commit, the commit equals `HEAD`, and the source tree is clean. The final manifest digest is intentionally recorded outside this source commit because the manifest itself contains that commit SHA; embedding the digest here would create a self-reference. Two consecutive exact-tag builds produced the same digest.

## Candidate v3 Identity Closure

The original immutable tag failed one root Vitest contract. Candidate v2 corrected that contract, but its generated manifest still hard-coded `react-refactor-r5-candidate`, a superseded ref forbidden by the runbook. Candidate v3 closes both findings:

- the G1 contract explicitly checks transition motion `false` at both checkpoints and hold motion `true`;
- ordinary builds emit an unbound validation manifest and cannot be mistaken for a deployable candidate;
- `deploy:build` requires explicit candidate tag and source commit;
- manifest schema 2 records the candidate name, annotated tag-object SHA, peeled source commit and clean-tree state;
- generation fails on a lightweight/missing/wrong tag, commit mismatch, dirty tree or invalid candidate namespace;
- CI uploads `dist/` only for an identity-bound candidate tag workflow.

Every automated gate below was rerun after the identity correction; browser evidence exercises the same production payload, while the release manifest itself is intentionally different.

| Gate | Candidate v3 result |
|---|---|
| clean Node 22 root `verify:all` | 66/66 Vitest files, 428/428 contracts; lint, typecheck, build, SEO and budgets pass |
| historical Playwright harness | 41/41 pass |
| four-project release matrix | 47 pass, 25 intentional project skips, 72 total |
| exact-tag freeze check | fresh `--no-local` checkout passes identity-bound root/deploy builds, reproduces one manifest digest twice, and passes 3/3 production smoke checks |

The correction changes release tooling, tests, CI and records. Runtime source and content-hashed production payload files remain byte-identical; only `r5-release-manifest.json` changes to carry the correct immutable identity.

## Delivered Scope

- `/` mounts the complete canonical StoryApp; R0 scaffold and old runtime selectors are absent.
- Director/Stage/LayerWindow integrate real wheel, touchpad, touch, keyboard, reading-edge handoff, menu, hash/history, reduced motion and recovery.
- all scenes/transitions and development harnesses are separated dynamic imports; production excludes harness routes and removes the R4 >500 kB single chunk.
- root tooling, release CI and deploy build target React `dist/`.
- static crawlable shell preserves 127 public copy items and meaningful no-JS anchors.
- four-project full-spine/reverse/input/media/SEO matrix (47 pass, 25 intentional project skips), 428 Vitest contracts and 41-test historical harness regression pass.
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

The runtime rollback rehearsal passed on 2026-07-12 from a fresh `git clone --no-local` of implementation commit `469a9caf7e2530232d298635bfaf8dbc26498936`:

1. detached candidate checkout was clean; Node 22 + frozen pnpm install reproduced all 91 production payload entries;
2. clean candidate browser smoke passed public root, JS-disabled正文 and rendered old/harness 404 checks (3/3);
3. a separate clean worktree at legacy `a78b064d65f024a301a3b179c62a458a1445bbf6` rebuilt `index.html` SHA-256 `d9502a9b5c7c17ce146098e2a3080de7c20e287f91b26fe307dbcabbf161afc7`;
4. the same local release port switched candidate → legacy → candidate; legacy served the expected title/CTA/bootstrap and a 100-byte video range as HTTP 206 while the candidate manifest returned 404;
5. the restored candidate again served the crawlable shell and candidate manifest.

Candidate v3 retains those same runtime payload hashes and replaces only the manifest identity metadata. A fresh exact-tag checkout repeated candidate → legacy → candidate, root/deploy verification and manifest digest checks after tagging; any tag-object, commit, tree-state or digest mismatch invalidates the candidate.

## HITL Checklist

Approval must explicitly cover:

- full visual rhythm and historical no-blank/no-black/no-duplicate symptoms;
- real desktop Safari, iOS Safari and Android Chrome input feel;
- TTG new forward/reverse alpha playback and edges;
- SEO/no-JS artifact and live crawler behavior;
- performance budgets with no exception request;
- clean rollback rehearsal and archive retention strategy.

After approval only: merge/deploy the exact candidate, smoke production and create `react-refactor-r5-cutover`. Until then this document describes a release candidate, not a completed cutover.
