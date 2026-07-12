# R5 Production Parity Repair Candidate

Status: the corrected candidate remains immutable and fully verified for its tagged source. The later Generic Ink/media review build is branch-only; no tag was moved or created, and visual HITL remains pending.

## Identity

| Item | Value |
|---|---|
| branch | `codex/react-refactor-r5-parity-cutover` |
| repair base | `59065730712c6d9718928fd25cba23e33455395e` |
| immutable corrected tag | `react-refactor-r5-parity-repair-candidate` (does not contain R21/R22) |
| post-candidate review implementation | `0a8fe99bf392965aa1b8f99c8886df7ff2dfbe75` |
| deployable directory | exact-tag `dist/` from identity-bound `pnpm run deploy:build` |
| release manifest | exact-tag `dist/r5-release-manifest.json` |
| immutable candidate source commit | `18490690992bffef6c9705cd47438b9cd17e756a` |
| annotated tag object | `7f96b243d42efd3e7409ca8628109b0901900a9b` |
| external manifest SHA-256 | `215b9beacb1932ad1194de1f8daa3d769165f33e98a11487cc185d186b1e1988` |
| exact-tag artifact | 97 files / 139,518,637B; schema 2; `sourceDirty: false` |

The manifest digest is recorded outside the tagged source commit because the manifest contains the source commit identity. Embedding that digest into the same commit would be self-referential.

## Superseded Immutable Candidates

| Tag | Peeled commit | Repair status |
|---|---|---|
| `react-refactor-r5-candidate` | `0de4972de64455a14d8c36262e58cc6af5c4875b` | Does not contain this parity repair. |
| `react-refactor-r5-candidate-v2` | `a5bef3785b766dac0e5ecfc95e96d03cd5c51c90` | Does not contain this parity repair. |
| `react-refactor-r5-candidate-v3` | `59065730712c6d9718928fd25cba23e33455395e` | Repair base only; does not contain the repaired runtime/shell contracts. |

None of these tags may be moved, repointed, or published as the corrected artifact.

## Delivered Repair

- Run-scoped Pattern/Star Map motion ownership with existing 24fps/12fps caps.
- Fresh generation-bound ink contexts; AOD alpha compositing; production edge-only grade with harness-only dark comparison.
- One explicit-direction video driver for Figure2, Crane, PH, and TTG, including coalesced seeks, decoded-frame surface swaps, stale-play rejection guards, unmount disposal, and a poster-backed TTG hold that keeps both directions metadata-only until playback preparation.
- Content-first reading, one 10svh commitment band, residual carry-through, and one-token top/bottom entry positioning.
- Segment-local recovery that cannot route Contact reverse through Hero.
- Cold/direct/reduced loader behavior, 2.7s Hero intro, scoped pointer parallax, and committed-hold progressive navigation.
- Shared interactive/static footer metadata, filing link, canonical favicon, canonical title font, and shared font tokens.
- Per-invocation random 32-sample horizontal contours shared by live DOM ownership and a one-row WebGL texture; forward/reverse runs are independently correct without shape replay, SVG, snapshots, or scene compositing.
- TTG → Lab and PH → Education now use separately revertible 600ms staged-media dissolves with no chapter-internal Ink.
- No canonical-spine, scene-id, hash, copy, default-entry, or architecture split.

Detailed reproduction/root-cause/file ownership for R1–R22 is in `../contract-diff/R5-production-parity-repair.md`.

## Post-Candidate Review-Build Gate Record

| Gate | Recorded result |
|---|---|
| root `pnpm run verify:all` | pass on `0a8fe99`: lint, typecheck, 78 files / 504 tests, static-shell/release verification, build, and bundle budgets |
| affected browser contracts | pass: staged TTG/PH handoffs 9/9; Ink ownership 3/3 |
| full historical/release/memory/rollback rerun | not claimed for this branch-only review build; no further E2E repetition authorized |
| visual acceptance | pending user HITL |

## Immutable Candidate Historical Gate Record

| Gate | Required result | Recorded result |
|---|---|---|
| root `pnpm run verify:all` | tests, lint, typecheck, build, release verifier, SEO and budgets pass | pass: 76 files / 493 tests; lint, typecheck, build, copy/assets, and bundle budgets pass |
| production functional suite | all state/input/media/lifecycle cases pass | pass in release matrix on every applicable project |
| historical harness | all historical cases pass | pass: 43 / 43 |
| four-project release matrix | desktop/mobile Chromium/WebKit pass with only declared applicability skips | pass: 52 applicable / 40 declared skips |
| repeated ink/media stress | Star Map ↔ AOD ≥10 alternating runs; PH/TTG ≥20 direction/interruption runs | pass in deterministic unit and browser cases |
| performance/process memory | frozen LCP/frame/bundle/GPU/RSS/heap/disposal budgets pass | pass: 3 frame/LCP samples; RSS 1,461,190,656B, GPU 344,408,064B, renderer 785,072,128B, heap 41,857,578B → 17,873,726B |
| exact-tag build and smokes | identity-bound clean build; root/no-JS/direct hash/key forward/reverse smokes pass | pass: identity-bound deploy build; 9/9 exact-tag smokes; restored TTG bidirectional smoke 1/1 |
| same-port rollback | corrected candidate → legacy → corrected candidate passes | pass on port 4173; candidate manifest/range → legacy hash/range/no-manifest → identical candidate manifest/range |

These exact-tag results certify commit `1849069`, not the later R21/R22 branch delta.

## Stop Boundary

The corrected tag stays frozen at `1849069`; the branch review implementation is `0a8fe99`. Work stops for HITL after documentation closure. Without explicit later approval: do not move/create a candidate tag, merge or deploy `main`, create `react-refactor-r5-cutover`, or start R6 cleanup.
