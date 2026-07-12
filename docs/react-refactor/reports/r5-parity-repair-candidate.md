# R5 Production Parity Repair Candidate

Status: implementation, documentation, and final pre-freeze automated acceptance passed. Immutable tag freeze, exact-tag rebuild/smoke, and rollback rehearsal are pending.

## Identity

| Item | Value |
|---|---|
| branch | `codex/react-refactor-r5-parity-cutover` |
| repair base | `59065730712c6d9718928fd25cba23e33455395e` |
| corrected annotated tag | `react-refactor-r5-parity-repair-candidate` (create only after every automated gate passes) |
| deployable directory | exact-tag `dist/` from identity-bound `pnpm run deploy:build` |
| release manifest | exact-tag `dist/r5-release-manifest.json` |
| source commit / tag object / manifest SHA-256 | recorded by the freeze rehearsal; pending |

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
- No canonical-spine, scene-id, hash, copy, default-entry, or architecture split.

Detailed reproduction/root-cause/file ownership for R1–R20 is in `../contract-diff/R5-production-parity-repair.md`.

## Final Gate Record

| Gate | Required result | Recorded result |
|---|---|---|
| root `pnpm run verify:all` | tests, lint, typecheck, build, release verifier, SEO and budgets pass | pass: 76 files / 493 tests; lint, typecheck, build, copy/assets, and bundle budgets pass |
| production functional suite | all state/input/media/lifecycle cases pass | pass in release matrix on every applicable project |
| historical harness | all historical cases pass | pass: 43 / 43 |
| four-project release matrix | desktop/mobile Chromium/WebKit pass with only declared applicability skips | pass: 52 applicable / 40 declared skips |
| repeated ink/media stress | Star Map ↔ AOD ≥10 alternating runs; PH/TTG ≥20 direction/interruption runs | pass in deterministic unit and browser cases |
| performance/process memory | frozen LCP/frame/bundle/GPU/RSS/heap/disposal budgets pass | pass: 3 frame/LCP samples; RSS 1,461,190,656B, GPU 344,408,064B, renderer 785,072,128B, heap 41,857,578B → 17,873,726B |
| exact-tag build and smokes | identity-bound clean build; root/no-JS/direct hash/key forward/reverse smokes pass | pending |
| same-port rollback | corrected candidate → legacy → corrected candidate passes | pending |

No screenshots or manual visual acceptance are required by this gate.

## Stop Boundary

After the final table is populated and the corrected tag is frozen, stop for HITL. Without explicit later approval: do not merge or deploy `main`, do not create `react-refactor-r5-cutover`, and do not start R6 cleanup.
