# Figure2 Proof Sequence

R-1 finding: `figure2-distance-expand` is a segment, and the proof copy is one legacy DOM source that must be split into `figure2-proof-opening`, `figure2-proof-cards`, and `figure2-proof-closing` in the React runtime. The split is inferred from DOM content roles plus adapter progress/post-scroll behavior; it is not encoded as three old DOM nodes.

## Primary Evidence

| Evidence | Fact |
|---|---|
| `src/sections/method.html` | Internal transition host is `data-transition-id="method-tooling__method-proof"`, `from="method-tooling"`, `to="method-proof"`, `module="figure2"`. |
| `src/sections/method.html` | Host declares `data-transition-stage-stops="0.72"`, `data-transition-stage-play-ms="2600,1500"`, `data-transition-stage-hold-vh="30"`, `data-transition-post-scroll-vh="56"`. |
| `src/sections/method.html` | Proof DOM is `.homepage-scene--method-proof[data-scene-id="method-proof"][data-transition-source-only="true"]`. |
| `index.html` | Build output preserves the same transition attrs and hidden source-only proof DOM. |
| `js/transitions/homepage/figure2-homepage-adapter.js` | Adapter moves `.method-proof` into `.figure2-proof-scroll` overlay marked `data-transition-ghost="method-proof-bridge"`. |
| `js/transitions/homepage/figure2-homepage-adapter.js` | Adapter computes `introProgress = range01(progress, 0, 0.72)` and `transitionProgress = range01(progress, 0.72, 1)`. |
| `js/transitions/homepage/figure2-homepage-adapter.js` | `postProgress` is read only after `transitionProgress >= 0.998`; overlay scroll uses `--figure2-proof-scroll-y = -maxScroll() * postProgress`. |
| `js/transitions/homepage/figure2-homepage-adapter.js` | Brand handoff adopts `.brand-definition-grid` through `createHandoffReceiver`, range `{ start: 0.58, end: 0.96, liftPx: 22 }`. |
| `js/components/figure2-transition.js` | `renderStaticState({ introProgress, transitionProgress })` writes camera/ink state from the two progress streams. |

## Legacy DOM Copy Roles

| DOM source | Canonical scene | Text role | Evidence |
|---|---|---|---|
| `.method-proof__lead .section-index` | `figure2-proof-opening` support copy | "用不上，不算落地" | Same lead block as opening heading |
| `.method-proof__lead h2.method-proof__closing` | `figure2-proof-opening` main copy | "我们见过太多" / "“用不上”。" | Canonical opening full-screen copy |
| `.method-proof__list .method-proof__row` | `figure2-proof-cards` | "只培训" / "只上软件" / "只交方案" with explanations | Three list items in a single ordered list |
| `.method-proof__lead p` | `figure2-proof-closing` | "同野观幂做第四种：先进现场，再定章法，陪你跑到账上有数。" | Closing statement is in the lead DOM but should become its own canonical proof closing scene |
| `.brand-definition-grid` | `brand` during `figure2-proof-brand` | Brand definition copy | Adopted by handoff receiver from native `#brand` section |

## Segment And Stage Ownership

| Canonical id | Kind | Owner | Legacy evidence | R0/R4 implementation note |
|---|---|---|---|---|
| `method-bottom-figure2` | SegmentId | TransitionModule | Legacy host starts at `from="method-tooling"` and uses figure2 module | Carries method-bottom hold into figure2 renderer. |
| `figure2-animation` | SceneId | SceneModule | Figure2 adapter media/camera assets and `introProgress` range `0..0.72` | Renderer state must be directly seekable and idempotent. |
| `figure2-distance-expand` | SegmentId | TransitionModule | Adapter `transitionProgress = range01(progress, 0.72, 1)` and Figure2 ink/camera transition | Not a scene; owns distance/ink expansion from `figure2-animation` terminal state into proof-paper state. |
| `figure2-proof-opening` | SceneId | SceneModule | `.method-proof__lead h2` and section index | First proof hold; no separate old DOM anchor. |
| `figure2-proof-cards` | SceneId | SceneModule | `.method-proof__list` with three rows | Cards hold; split from same source overlay. |
| `figure2-proof-closing` | SceneId | SceneModule | `.method-proof__lead p` plus overlay post-scroll | Closing hold; split from same source overlay. |
| `figure2-proof-brand` | SegmentId | TransitionModule | `handoffTarget="#brand"`, `handoffPhase="post-scroll"`, receiver `.brand-definition-grid` | Owns transition to `brand` and restores native brand DOM. |
| `brand` | SceneId | SceneModule | `src/sections/brand.html`, build `#brand` | Native copy source, not painted into Figure2 texture. |

## Progress Reconstruction

Legacy host progress is a single playhead in `homepage-transition-runtime.js`.

```txt
0.00 -> 0.72  introProgress        figure2 video/camera intro
0.72 -> 1.00  transitionProgress   ink/distance expansion into paper/proof overlay
1.00 + postScrollVh=56             proof overlay post-scroll and brand handoff progress
```

Runtime parameters:

| Parameter | Legacy value | Source | Canonical use |
|---|---:|---|---|
| `stageStops` | `[0.72]` | `data-transition-stage-stops` | staged snap stop after figure2 intro |
| `stagePlayMs` | `[2600, 1500]` | `data-transition-stage-play-ms` | first and second autoplay durations |
| `stageHoldVh` | `30` | `data-transition-stage-hold-vh` | viewport hold before continuing second stage |
| `postScrollVh` | `56` | `data-transition-post-scroll-vh` | proof copy post-scroll before brand handoff completes |
| `transitionRevealProgress` | `smoothStep(range01(transitionProgress, 0.10, 0.94))` | figure2 homepage adapter | reveals the proof overlay during second stage |
| `handoffFade` | `1 - smoothStep(range01(handoffProgress, 0.58, 0.90))` | figure2 homepage adapter | fades proof overlay during brand handoff |
| `brandReceiver` | `{ start: 0.58, end: 0.96, liftPx: 22 }` | figure2 homepage adapter | adopts/restores `.brand-definition-grid` |

## Inference Boundaries

Confirmed facts:

- `figure2-distance-expand` is backed by adapter `transitionProgress`, not by a legacy section or hash.
- The proof copy has one old DOM owner: `.method-proof`.
- The brand copy has one old DOM owner: `.brand-definition-grid`; Figure2 does not paint brand text into canvas.
- Legacy stage facts are `[0.72]`, `[2600,1500]`, `30vh`, and `56vh`.

Inferences requiring HITL confirmation before R0:

- `figure2-proof-opening` should use the section index plus h2 opening copy.
- `figure2-proof-cards` should use the three list rows.
- `figure2-proof-closing` should split the lead paragraph into its own full-screen hold even though it is in the same old `.method-proof__lead` block.
- No fourth old proof stage exists; any R0 staged policy must be newly modeled from the above facts.

