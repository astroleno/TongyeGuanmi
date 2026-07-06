# R4 Worktree Group Declarations

R4 starts from `98dbdbc2c829407362f8f37210f05a2bfbab6c1c` on `codex/react-refactor-r4-integration`.
The integration branch is the only merge train and the only place where shared contract changes may land.

## Merge Train Rules

- Merge in canonical spine order.
- `codex/react-refactor-r4-g3-figure2-proof-brand` must merge before groups 4-7.
- Group branches must not fork `DirectorEvent`, `LayerWindow`, visibility predicates, `verifySegmentTimeline`, or `transitions/shared`.
- Shared contract changes land on `codex/react-refactor-r4-integration` first; open groups rebase after that.
- Each group stops after its local DoD and waits for HITL visual parity before merge.

## Canonical Manifest Indices

| Index | Node |
| --- | --- |
| 0 | hold `hero` |
| 1 | segment `hero-pattern` |
| 2 | hold `pattern` |
| 3 | segment `pattern-star-map` |
| 4 | hold `star-map` |
| 5 | segment `star-map-aod` |
| 6 | hold `aod-animation` |
| 7 | segment `aod-method-top` |
| 8 | hold `method-top` |
| 9 | segment `method-top-method-bottom` |
| 10 | hold `method-bottom` |
| 11 | segment `method-bottom-figure2` |
| 12 | hold `figure2-animation` |
| 13 | segment `figure2-distance-expand` |
| 14 | hold `figure2-proof-opening` |
| 15 | segment `figure2-proof-opening-cards` |
| 16 | hold `figure2-proof-cards` |
| 17 | segment `figure2-proof-cards-closing` |
| 18 | hold `figure2-proof-closing` |
| 19 | segment `figure2-proof-brand` |
| 20 | hold `brand` |
| 21 | segment `brand-figure3` |
| 22 | hold `figure3-animation` |
| 23 | segment `figure3-services` |
| 24 | hold `services` |
| 25 | segment `services-ttg` |
| 26 | hold `ttg-animation` |
| 27 | segment `ttg-lab` |
| 28 | hold `lab` |
| 29 | segment `lab-ph` |
| 30 | hold `ph-animation` |
| 31 | segment `ph-education` |
| 32 | hold `education` |
| 33 | segment `education-crane` |
| 34 | hold `crane-animation` |
| 35 | segment `crane-contact` |
| 36 | hold `contact` |

## Group Ownership

| Group branch | Worktree | Owns scenes | Owns segments | Owns manifest interval | Read-only references |
| --- | --- | --- | --- | --- | --- |
| `codex/react-refactor-r4-g1-hero-pattern-star-map` | `../TongyeGuanmi-r4-g1` | `hero`, `pattern`, `star-map` | `hero-pattern`, `pattern-star-map` | 0-4 | `star-map-aod`, `aod-animation`, `method-top` |
| `codex/react-refactor-r4-g2-method-figure2-animation` | `../TongyeGuanmi-r4-g2` | `method-top`, `method-bottom`, `figure2-animation` | `method-top-method-bottom`, `method-bottom-figure2` | 8-12 | `aod-method-top`, `figure2-distance-expand` |
| `codex/react-refactor-r4-g3-figure2-proof-brand` | `../TongyeGuanmi-r4-g3` | `figure2-proof-opening`, `figure2-proof-cards`, `figure2-proof-closing`, `brand` | `figure2-distance-expand`, `figure2-proof-opening-cards`, `figure2-proof-cards-closing`, `figure2-proof-brand` | 13-20 | `figure2-animation`, `brand-figure3` |
| `codex/react-refactor-r4-g4-brand-figure3-services` | `../TongyeGuanmi-r4-g4` | `figure3-animation`, `services` | `brand-figure3`, `figure3-services` | 21-24 | `brand`, `services-ttg` |
| `codex/react-refactor-r4-g5-services-ttg-lab` | `../TongyeGuanmi-r4-g5` | `ttg-animation`, `lab` | `services-ttg`, `ttg-lab` | 25-28 | `services`, `lab-ph` |
| `codex/react-refactor-r4-g6-lab-ph-education` | `../TongyeGuanmi-r4-g6` | `ph-animation`, `education` | `lab-ph`, `ph-education` | 29-32 | `lab`, `education-crane` |
| `codex/react-refactor-r4-g7-education-crane-contact` | `../TongyeGuanmi-r4-g7` | `crane-animation`, `contact` | `education-crane`, `crane-contact` | 33-36 | `education` |

R3 pilot owns the already-landed bridge `star-map-aod`, `aod-animation`, `aod-method-top`, and the R3 regression harness.
