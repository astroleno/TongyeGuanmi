# 转场 Manifest

本 manifest 是首页叙事路线的唯一来源。实现时应先把本文件转换为 TypeScript `scenes[]` 和 `segments[]`，再让 `SceneRuntime` 消费。

## Canonical Scenes

| 顺序 | Scene ID | 角色 | 最低高度 |
| --- | --- | --- | --- |
| 1 | `hero` | 首屏品牌 scene | 100vh |
| 2 | `pattern-top` | pattern 上半舞台 | 100vh |
| 3 | `pattern-bottom` | pattern 下半舞台 | 100vh |
| 4 | `aod-animation` | AOD 动画舞台 | 100vh |
| 5 | `method-top` | method 上半文案 | 120-150vh |
| 6 | `method-bottom` | method 下半文案 | 100vh |
| 7 | `figure2-animation` | figure2 复合动画舞台 | 100vh |
| 8 | `brand` | brand 文案 scene | 100-120vh |
| 9 | `figure3-animation` | figure3 动画舞台 | 100vh |
| 10 | `services` | services 文案 scene | 100vh |
| 11 | `ttg-animation` | TTG 动画舞台 | 100vh |
| 12 | `lab` | lab 文案 scene | 100vh |
| 13 | `ph-animation` | PH 动画舞台 | 100vh |
| 14 | `education` | education 文案 scene | 100vh |
| 15 | `crane-animation` | crane 动画舞台 | 100vh |
| 16 | `contact` | contact 结束 scene | 100vh |

不得在组件内临时新增 scene。如果 `belief-star` 要恢复为独立 scene，必须先加入本表并重排 segments。

## Canonical Segments

| 顺序 | Segment ID | 类型 | From | To | 说明 |
| --- | --- | --- | --- | --- | --- |
| 1 | `hero-to-pattern-top` | `ink-transition` | `hero` | `pattern-top` | 中心扩散墨滴 |
| 2 | `pattern-top-to-pattern-bottom` | `ink-transition` | `pattern-top` | `pattern-bottom` | 左侧旋转扩散 |
| 3 | `pattern-bottom-to-aod` | `ink-transition` | `pattern-bottom` | `aod-animation` | 下到上水平墨滴 |
| 4 | `aod-play-to-method-top` | `media-animation` | `aod-animation` | `method-top` | AOD 播放到 80% 时提前 reveal method copy |
| 5 | `method-top-read` | `text-read` | `method-top` | `method-bottom` | 普通阅读/滚动 |
| 6 | `method-bottom-to-figure2` | `ink-transition` | `method-bottom` | `figure2-animation` | 下到上水平墨滴 |
| 7 | `figure2-compound-to-brand` | `compound-sequence` | `figure2-animation` | `brand` | figure2 内部远景扩散、三卡、整屏文案、出场墨滴 |
| 8 | `brand-to-figure3` | `ink-transition` | `brand` | `figure3-animation` | 下到上水平墨滴 |
| 9 | `figure3-play-to-services` | `media-animation` | `figure3-animation` | `services` | figure3 播放到 80% 时提前 reveal services copy |
| 10 | `services-to-ttg` | `ink-transition` | `services` | `ttg-animation` | 下到上水平墨滴 |
| 11 | `ttg-compound-to-lab` | `compound-sequence` | `ttg-animation` | `lab` | TTG 播放后，上到下水平墨滴出场 |
| 12 | `lab-to-ph` | `ink-transition` | `lab` | `ph-animation` | PH 太阳点放射墨滴 |
| 13 | `ph-compound-to-education` | `compound-sequence` | `ph-animation` | `education` | PH 播放后，上到下水平墨滴出场 |
| 14 | `education-to-crane` | `ink-transition` | `education` | `crane-animation` | 下到上水平墨滴 |
| 15 | `crane-play-to-contact` | `media-animation` | `crane-animation` | `contact` | crane 播放到 80% 时提前 reveal contact copy |

## Segment Specs

### 1. `hero-to-pattern-top`

```ts
{
  type: 'ink-transition',
  from: 'hero',
  to: 'pattern-top',
  durationMs: 1000,
  ink: { kind: 'radial', origin: 'center' },
  commitAt: 'end'
}
```

Layer ownership：

- `visualOwner`: segment
- `canvasOwner`: segment
- `copyOwner`: `hero` until commit, then `pattern-top`

### 2. `pattern-top-to-pattern-bottom`

```ts
{
  type: 'ink-transition',
  from: 'pattern-top',
  to: 'pattern-bottom',
  durationMs: 1200,
  ink: { kind: 'pattern-rotate', origin: 'left' },
  commitAt: 'end'
}
```

`pattern-top` 和 `pattern-bottom` 是 scene，不是 transition scene。旋转扩散是 segment。

### 3. `pattern-bottom-to-aod`

```ts
{
  type: 'ink-transition',
  from: 'pattern-bottom',
  to: 'aod-animation',
  durationMs: 800,
  ink: { kind: 'horizontal', direction: 'bottom-up' },
  commitAt: 'end'
}
```

commit 后只显示 AOD poster/首帧，不自动播放。用户再滚动 10vh 才触发 `aod-play-to-method-top`。

### 4. `aod-play-to-method-top`

```ts
{
  type: 'media-animation',
  from: 'aod-animation',
  to: 'method-top',
  durationPolicy: 'media-ended',
  reveal: {
    atProgress: 0.8,
    targetScene: 'method-top',
    targetLayer: 'copy'
  },
  fallback: {
    onPlayRejected: 'show-poster-and-complete',
    onMetadataTimeout: 'show-poster-and-complete',
    onEndedTimeout: 'force-complete-and-commit',
    onMissingMedia: 'recover-to-committed-scene',
    reducedMotion: 'poster-and-skip'
  }
}
```

注意：AOD 组件不能 `setMethodTextVisible`。它只能向 runtime 报告 progress，runtime 决定 method copy owner。

### 5. `method-top-read`

```ts
{
  type: 'text-read',
  from: 'method-top',
  to: 'method-bottom',
  readHeightVh: 120,
  armAfterVh: 10
}
```

这是普通阅读，不需要墨滴、锁滚动或媒体播放。

### 6. `method-bottom-to-figure2`

```ts
{
  type: 'ink-transition',
  from: 'method-bottom',
  to: 'figure2-animation',
  durationMs: 800,
  ink: { kind: 'horizontal', direction: 'bottom-up' },
  commitAt: 'end'
}
```

### 7. `figure2-compound-to-brand`

```ts
{
  type: 'compound-sequence',
  from: 'figure2-animation',
  to: 'brand',
  steps: [
    'figure2-camera-expand',
    'figure2-proof-cards',
    'figure2-fourth-kind-copy',
    'figure2-arch-copy-to-brand'
  ],
  commitAt: 'last-step-end'
}
```

Step 说明：

| Step | 类型 | 视觉 | 完成条件 |
| --- | --- | --- | --- |
| `figure2-camera-expand` | `media-animation` | 内部远景扩散，figure2 视频/画面推进 | adapter complete |
| `figure2-proof-cards` | `text-read` | 保留前景模糊横拱 + “我们见过太多用不上”三卡 | fixed duration 或用户 intent |
| `figure2-fourth-kind-copy` | `text-read` | 保留横拱 + “同野观幂做第四种...”整屏 | fixed duration 或用户 intent |
| `figure2-arch-copy-to-brand` | `ink-transition` | 横拱和文案一起下到上水平墨滴 | progress=1 |

figure2 内部可以有 reducer，但只能管理 compound step；不能直接修改全局 phase 或 committed scene。

### 8. `brand-to-figure3`

```ts
{
  type: 'ink-transition',
  from: 'brand',
  to: 'figure3-animation',
  durationMs: 800,
  ink: { kind: 'horizontal', direction: 'bottom-up' },
  commitAt: 'end'
}
```

### 9. `figure3-play-to-services`

```ts
{
  type: 'media-animation',
  from: 'figure3-animation',
  to: 'services',
  durationPolicy: 'media-ended',
  reveal: { atProgress: 0.8, targetScene: 'services', targetLayer: 'copy' },
  fallback: {
    onPlayRejected: 'show-poster-and-complete',
    onMetadataTimeout: 'show-poster-and-complete',
    onEndedTimeout: 'force-complete-and-commit',
    onMissingMedia: 'recover-to-committed-scene',
    reducedMotion: 'poster-and-skip'
  }
}
```

### 10. `services-to-ttg`

```ts
{
  type: 'ink-transition',
  from: 'services',
  to: 'ttg-animation',
  durationMs: 800,
  ink: { kind: 'horizontal', direction: 'bottom-up' },
  commitAt: 'end'
}
```

### 11. `ttg-compound-to-lab`

```ts
{
  type: 'compound-sequence',
  from: 'ttg-animation',
  to: 'lab',
  steps: ['ttg-play', 'ttg-to-lab-top-down-ink'],
  commitAt: 'last-step-end'
}
```

`ttg-play` 完成后不要直接 `video.ended -> SNAP_LOCKING -> PLAYING -> IDLE`。它必须作为 compound step 进入上到下墨滴，再 commit 到 `lab`。

### 12. `lab-to-ph`

```ts
{
  type: 'ink-transition',
  from: 'lab',
  to: 'ph-animation',
  durationMs: 1000,
  ink: { kind: 'radial', origin: 'ph-sun' },
  commitAt: 'end'
}
```

### 13. `ph-compound-to-education`

```ts
{
  type: 'compound-sequence',
  from: 'ph-animation',
  to: 'education',
  steps: ['ph-play', 'ph-to-education-top-down-ink'],
  commitAt: 'last-step-end'
}
```

### 14. `education-to-crane`

```ts
{
  type: 'ink-transition',
  from: 'education',
  to: 'crane-animation',
  durationMs: 800,
  ink: { kind: 'horizontal', direction: 'bottom-up' },
  commitAt: 'end'
}
```

### 15. `crane-play-to-contact`

```ts
{
  type: 'media-animation',
  from: 'crane-animation',
  to: 'contact',
  durationPolicy: 'media-ended',
  reveal: { atProgress: 0.8, targetScene: 'contact', targetLayer: 'copy' },
  fallback: {
    onPlayRejected: 'show-poster-and-complete',
    onMetadataTimeout: 'show-poster-and-complete',
    onEndedTimeout: 'force-complete-and-commit',
    onMissingMedia: 'recover-to-committed-scene',
    reducedMotion: 'poster-and-skip'
  }
}
```

## Layer Ownership Rules

| 规则 | 说明 |
| --- | --- |
| target copy 不搬 DOM | 不再 adopt/restore native copy |
| preview copy 必须 runtime-owned | 如果转场中需要预览目标文案，用 runtime preview layer |
| `.reveal` 跳过 timeline-owned copy | 防止转场 commit 后被全局 reveal 再隐藏 |
| segment complete 原子提交 | `committedScene`、copy owner、visual owner 同帧更新 |
| media 只报告，不调度 | video/webgl adapter 不能直接跳 scene |

## Debug Naming

每条 segment 都必须出现在 debug overlay：

```txt
activeSegment: figure2-compound-to-brand
step: figure2-proof-cards
from: figure2-animation
to: brand
progress: 0.42
copyOwner: figure2-compound-to-brand
visualOwner: figure2-animation
```

这能直接暴露“画面以为到 brand，copy 还被 figure2 持有”的问题。
