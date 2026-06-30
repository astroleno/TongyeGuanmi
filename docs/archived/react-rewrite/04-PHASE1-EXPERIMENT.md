# Phase 1 实验迁移计划

## 目标

完成第一条可验证链路：

```txt
hero
-> pattern-top
-> pattern-bottom
-> aod-animation
-> method-top
-> method-bottom
```

这不是单纯视觉 spike，而是 `SceneRuntime` 契约 spike。

## 成功标准

- `scenes[] + segments[]` 能完整驱动链路。
- FSM 只按 `IDLE -> ARMED -> SNAP_LOCKING -> PLAYING -> PRESENTING -> RELEASING -> IDLE` 前进。
- 滚动只负责阅读和 10vh intent。
- pattern-top / pattern-bottom 是 scene，墨滴/旋转扩散是 segment。
- AOD 80% method 文案提前入场由 runtime layer ownership 触发。
- timeline-owned copy 不再被全局 reveal 隐藏。
- debug overlay 能显示 phase、activeScene、activeSegment、progress 和所有 owner。
- media play rejected、hash 直达、快速滚动、reduced motion 不会卡死或空白。

## 不做什么

- 不复制 baseline 的容器内视频播放模式。
- 不把视频播放成功当作架构成功的主要证据。
- 不把现有 ink WebGL 误改成不存在的 2D renderer。
- 不让 AOD/Pattern 组件通过 parent callback 推进全局 scene。
- 不先追求全量视觉 100% 还原。

## Phase 1 Scene Graph

```ts
export const PHASE1_SCENES = [
  'hero',
  'pattern-top',
  'pattern-bottom',
  'aod-animation',
  'method-top',
  'method-bottom'
] as const;
```

```ts
export const PHASE1_SEGMENTS = [
  'hero-to-pattern-top',
  'pattern-top-to-pattern-bottom',
  'pattern-bottom-to-aod',
  'aod-play-to-method-top',
  'method-top-read'
] as const;
```

## 前置条件

Phase 1 只能在 `08-PHASE0-CONTRACT-SPIKE.md` 通过后开始。

必须已有：

- `SceneRuntime` reducer skeleton。
- fake scenes 能完整走完固定 FSM。
- RenderLayerHost 和 DebugOverlay 可用。
- layer ownership 冲突检测和 recovery path 可用。
- scroll lock save/restore 已通过 P0 tests。

Phase 1 复用并产品化 Phase 0 runtime，不重新定义 contract，不重写 reducer/FSM/ownership 规则。

## 工作分解

### Step 1: Phase 1 Manifest

产出：

- `manifest/homepagePhase1Scenes.ts`
- `manifest/homepagePhase1Segments.ts`
- Phase 1 manifest validation tests

验收：

- 所有 scene id、segment id 都来自 manifest。
- 没有 `reading/animation/transition scene` 类型。
- Phase 1 manifest 能被 Phase 0 的 `validateManifest()` 接受。

### Step 2: Hero + Pattern

产出：

- `HeroScene.tsx`
- `PatternTopScene.tsx`
- `PatternBottomScene.tsx`
- ink/pattern adapter wrapper

验收：

- `hero-to-pattern-top` 由 runtime 触发中心扩散。
- `pattern-top-to-pattern-bottom` 由 runtime 触发左侧旋转扩散。
- pattern 组件不直接改全局 phase。
- debug overlay 中 canvas owner 在 segment 结束后归还。

### Step 3: Pattern Bottom -> AOD

产出：

- `AodScene.tsx`
- media adapter wrapper
- AOD poster/首帧 presentation

验收：

- `pattern-bottom-to-aod` 下到上水平墨滴完成后 commit 到 `aod-animation`。
- commit 后只展示 AOD poster/首帧，不自动播放。
- 用户再次滚动 10vh 才触发 `aod-play-to-method-top`。

### Step 4: AOD 80% -> Method Copy

产出：

- `MethodTopScene.tsx`
- `MethodBottomScene.tsx`
- runtime-reveal ownership action

验收：

- AOD adapter 只报告 media progress。
- progress >= 0.8 时 runtime 把 method copy owner 交给 `method-top` 或 runtime preview layer。
- video ended 后不会通过 AOD 组件直接跳 scene。
- media rejected fallback 仍然能进入 method。

## 借鉴 Baseline 的实现细节

可以借鉴：

- `*-constants.ts` 集中阶段长度和阈值。
- `deriveXxxProgress()` 纯函数。
- `getViewportHeightPx()` 处理 dvh/visualViewport 差异。
- `App.tsx` 只做顶层 composition。

不要借鉴：

- 容器内视频播放作为流程核心。
- 在 section 组件中高频 `setScrollPx` 驱动主动画。
- section 组件通过 callback 让父组件切下一幕。

## 预计节奏

这轮不要再承诺 7-11 天全视觉还原。更合理的判断：

- Phase 0：2-3 天，runtime/types/manifest/reducer/debug overlay/scroll lock/P0 tests。
- Phase 1：3-5 天，hero/pattern/AOD/method 的视觉接入。
- 额外时间：真实浏览器和移动端边界验证。

如果 Phase 0 做不干净，暂停 Phase 1；否则会重复旧系统的 owner 竞争。

## 失败判定

任一情况出现，Phase 1 不通过：

- 需要组件私有状态才能决定下一幕。
- debug overlay 显示 copy owner 和 visual owner 长期不一致且无 manifest 声明。
- media rejected 后页面仍锁滚动。
- hash 直达后 runtime phase 不是 IDLE。
- timeline-owned copy 被 global reveal 再次隐藏。
