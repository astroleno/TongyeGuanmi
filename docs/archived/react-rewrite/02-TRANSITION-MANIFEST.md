# 转场 Manifest

Phase 4.0A 之后，`/Users/aitoshuu/Documents/GitHub/react-runtime-spike/src/manifest/realManifest.ts` 是 React 迁移 scene graph 的唯一 source of truth。本文只同步冻结后的 scene list、segment graph 和 contract，不记录视觉实现细节。

## Frozen Scene List

| 顺序 | Scene ID | 角色 |
| --- | --- | --- |
| 1 | `hero` | 首屏品牌 scene |
| 2 | `pattern-bloom` | pattern bloom 过渡舞台 |
| 3 | `belief-star` | belief 观点 scene |
| 4 | `aod-animation` | AOD 动画舞台 |
| 5 | `method-top` | method 上半阅读 scene |
| 6 | `method-bottom` | method 下半阅读 scene |
| 7 | `figure2-animation` | Figure2 复合动画舞台 |
| 8 | `brand` | brand 文案 scene |
| 9 | `figure3-animation` | Figure3 动画舞台 |
| 10 | `services` | services 文案 scene |
| 11 | `ttg-animation` | TTG 动画舞台 |
| 12 | `lab` | lab 文案 scene |
| 13 | `ph-animation` | PH 动画舞台 |
| 14 | `education` | education 文案 scene |
| 15 | `crane-animation` | crane 动画舞台 |
| 16 | `contact` | contact 结束 scene |

Rules:

- Canonical scene ids must come from `realManifest.ts`.
- `star-map` is not a canonical scene id after Phase 4.0A; the canonical belief scene is `belief-star`.
- `method-upper`, `method-lower`, `method-cocreation`, `method-tooling`, `method-proof`, and `method-field-law` are method-local states or anchors, not top-level runtime scenes.
- `figure2-proof-cards` and `figure2-proof-closing` are Figure2 compound step ids or local states, not top-level runtime scenes.

## Frozen Segment Graph

| 顺序 | Segment ID | 类型 | From | To |
| --- | --- | --- | --- | --- |
| 1 | `hero-to-pattern-bloom` | `ink-transition` | `hero` | `pattern-bloom` |
| 2 | `pattern-bloom-to-belief-star` | `compound-sequence` | `pattern-bloom` | `belief-star` |
| 3 | `belief-star-to-aod` | `ink-transition` | `belief-star` | `aod-animation` |
| 4 | `aod-to-method-top` | `media-animation` | `aod-animation` | `method-top` |
| 5 | `method-top-to-bottom` | `text-read` | `method-top` | `method-bottom` |
| 6 | `method-bottom-to-figure2` | `ink-transition` | `method-bottom` | `figure2-animation` |
| 7 | `figure2-compound-to-brand` | `compound-sequence` | `figure2-animation` | `brand` |
| 8 | `brand-to-figure3` | `ink-transition` | `brand` | `figure3-animation` |
| 9 | `figure3-play-to-services` | `media-animation` | `figure3-animation` | `services` |
| 10 | `services-to-ttg` | `ink-transition` | `services` | `ttg-animation` |
| 11 | `ttg-compound-to-lab` | `compound-sequence` | `ttg-animation` | `lab` |
| 12 | `lab-to-ph` | `ink-transition` | `lab` | `ph-animation` |
| 13 | `ph-compound-to-education` | `compound-sequence` | `ph-animation` | `education` |
| 14 | `education-to-crane` | `ink-transition` | `education` | `crane-animation` |
| 15 | `crane-play-to-contact` | `media-animation` | `crane-animation` | `contact` |

```txt
hero
  -> pattern-bloom
  -> belief-star
  -> aod-animation
  -> method-top
  -> method-bottom
  -> figure2-animation
  -> brand
  -> figure3-animation
  -> services
  -> ttg-animation
  -> lab
  -> ph-animation
  -> education
  -> crane-animation
  -> contact
```

## Segment Contract

Every segment must declare:

- `id`
- `type`
- `from`
- `to`

Allowed segment types:

- `ink-transition`
- `media-animation`
- `text-read`
- `compound-sequence`

Every non `text-read` segment must declare complete `layerOwnership`:

- `visualOwner`
- `copyOwner`
- `canvasOwner`
- `maskOwner`
- `mediaOwner`

Every `media-animation` segment must declare fallback policy:

- `onPlayRejected`
- `onMetadataTimeout`
- `onEndedTimeout`
- `onMissingMedia`
- `reducedMotion`

`text-read` exists in `segments[]` to keep the scene graph complete, but it does not enter playback, does not lock scroll, and does not claim layer ownership.

## Figure2 Modeling

`figure2-animation -> brand` is one top-level `compound-sequence`. `figure2-proof-cards` and `figure2-proof-closing` are internal Figure2 steps or local states. They must not appear in top-level `scenes[]`.

## Validation Gates

Phase 4.0A requires:

- every `segment.from` and `segment.to` exists in `scenes[]`;
- every scene is reachable from `hero`;
- segment ids have no duplicates;
- non `text-read` ownership contains all five layers;
- segment type is one of the four allowed values;
- every `media-animation` has fallback policy.
