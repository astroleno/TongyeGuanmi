# Figure2 Proof Sequence

R-1 established that `figure2-distance-expand` is a segment and that all Proof copy comes from one legacy `.method-proof` DOM owner. R5 freezes the resulting canonical model: one `figure2-proof` semantic hold owns a single article, a single reading scrollport, and three internal viewport panels. The former `figure2-proof-opening`, `figure2-proof-cards`, and `figure2-proof-closing` IDs survive only as URL/hash aliases and panel anchors.

## Frozen R5 structure

```txt
figure2-animation hold
  -> figure2-distance-expand run
  -> figure2-proof hold / one 300svh scrollport
       ├── #opening / min-height: 100svh
       ├── #cards   / min-height: 100svh
       └── #closing / min-height: 100svh
  -> figure2-proof-brand run
  -> brand hold
```

Internal panel scrolling never starts SegmentPlayer, never emits `CHARGE_FIRED`, and never settles an intermediate SceneId. Only the Proof top and bottom are scene boundaries. Entering from Figure2 positions opening/top; reverse entry from Brand positions closing/bottom.

## Primary evidence

| Evidence | Fact |
|---|---|
| `src/sections/method.html` | The old transition host is `method-tooling__method-proof`; Proof copy has one `.method-proof` DOM owner. |
| `src/sections/method.html` | The host records `stageStops="0.72"`, `stagePlayMs="2600,1500"`, `stageHoldVh="30"`, and `postScrollVh="56"`. |
| `js/transitions/homepage/figure2-homepage-adapter.js` | Legacy code moved the same Proof DOM into an overlay and derived intro/transition/post-scroll progress. |
| `js/components/figure2-transition.js` | Figure2 camera/media presentation is progress-driven and can remain owned by `figure2-animation`. |
| R5 D2 | Three old Proof IDs are redirect aliases/internal anchors, not canonical holds. |
| R5 D3 | The segment may coordinate the existing Figure2 and Proof roots plus shared mask/canvas, but may not create a Proof clone or temporary scene root. |

## Copy and anchor mapping

| Legacy copy source | Canonical owner | Internal anchor | Role |
|---|---|---|---|
| `.method-proof__lead .section-index` + heading | `figure2-proof` | `opening` | Opening viewport |
| `.method-proof__list .method-proof__row` | `figure2-proof` | `cards` | Three proof cards |
| `.method-proof__lead p` | `figure2-proof` | `closing` | Closing viewport |
| `.brand-definition-grid` | `brand` | n/a | Target scene of `figure2-proof-brand` |

Alias resolution is one-way:

```txt
#figure2-proof-opening -> scene=figure2-proof, panel=opening
#figure2-proof-cards   -> scene=figure2-proof, panel=cards
#figure2-proof-closing -> scene=figure2-proof, panel=closing
```

Navigation, history, HUD, analytics, Director cursor, and SegmentPlayer use only `figure2-proof`. The aliases must not reappear in the canonical spine or manifest nodes.

## Ownership

| ID | Kind | Visual owner |
|---|---|---|
| `method-bottom-figure2` | SegmentId | Coordinates Method exit and the canonical Figure2 root; no copied Method layout. |
| `figure2-animation` | SceneId | Owns Figure2 media, camera, depth transform, and hold/exit sampling. |
| `figure2-distance-expand` | SegmentId | Coordinates Figure2 exit, shared depth mask/canvas, and the existing Proof opening surface. It owns no Proof copy or layout. |
| `figure2-proof` | SceneId | Owns the warm paper, all Proof copy, one scrollport, and all three panels. |
| `figure2-proof-brand` | SegmentId | Coordinates the existing Proof closing and Brand roots through shared Ink. |
| `brand` | SceneId | Owns Brand copy, layout, and hold surface. |

## Progress interpretation

Legacy timing remains evidence for the authored Figure2 run, not for extra Proof scenes:

```txt
0.00 -> 0.72  Figure2 scene-owned intro/media exit
boundary         hold terminal presented frame for 1000ms (same playing run)
0.72 -> 1.00  shared depth/Ink reveal into Proof opening
settle          state commit only; Proof opening does not change visually
hold            native scrollTop moves through opening/cards/closing
```

`stageStops=[0.72]`、`stagePlayMs=[2600,1500]` 与 `advance=[{kind:'delay',ms:1000}]` 定义同一 run 的两段 authored time 和一个自动 terminal dwell。它不创建 `stagePaused`、第三个 scene 或用户输入 checkpoint。`stageHoldVh` 与 `postScrollVh` 只保留为 legacy evidence；R5 Proof panels 使用 canonical reading scrollport。

## Acceptance invariants

- The canonical spine contains exactly one `figure2-proof` hold.
- The Proof article contains exactly one reading scrollport and three `min-height: 100svh` panels.
- Panel-to-panel movement changes only that scrollport's `scrollTop`.
- `figure2-distance-expand` and `figure2-proof-brand` preserve the same canonical roots forward and reverse.
- Shared Ink/depth code may allocate only its effect canvas/mask; it may not clone copy, append a temporary Proof root, or replace the root at settle.
- `p=1`, timeline disposal, and the settled Proof hold have the same opening layout and paper presentation.
