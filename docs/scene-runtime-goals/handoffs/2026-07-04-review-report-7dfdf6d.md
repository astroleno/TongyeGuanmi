# Commit 7dfdf6d 重新 Review 报告

**Commit**: `7dfdf6d Close scene runtime review gaps`  
**前序 Commit**: `0f0aab6 Refine AOD and early-copy handoff behavior`  
**Review 日期**: 2026-06-24  
**Review 方法**: 代码静态分析 + diff 对比 + 运行时推演

---

## 7dfdf6d 核心改动摘要

### 1. AOD Handoff 时序修复（`aod-scene-player.js`）

**前序问题**：AOD 的 handoff receiver 在 progress=0.94 时自动 `restore()`，将 method-top 的 DOM 内容还原到原始 host。此时 AOD 播放尚未完成，DOM 被移回 `method-top` host 后可能立即被 `hidden = true`，导致 handoff 内容闪现后消失。

**修复**：
- `renderHandoffProgress` 中 `methodReceiver.update` 的 `end` 从 0.94 改为 **1**
- 新增 `restoreAtEnd: false` 参数，禁止在 progress=1 时自动还原
- 新增 `restoreHandoffContent()` 函数，在 `completePlayback` 中**显式**调用

修复后时序：
1. AOD progress 0.58→1.0：handoff receiver 渐显 method-top 内容，DOM 持续收养在 AOD field 中
2. AOD progress = 1.0：`completePlayback` 调用 `restoreHandoffContent()`，DOM 还原到 `method-top` host
3. `presentation.present('method-top')` 随后调用，`method-top` host 可见，DOM 内容正确显示

**改善**：AOD→method-top 的 handoff 不再提前消失，内容在 AOD 完成播放后平滑过渡到 method-top。

### 2. Handoff Source Selector 精确化（`SceneRuntimeMvpVisualRegistry.js`）

```diff
- handoffSourceSelector: '[data-runtime-readable-copy], .method-edition-layout--after-handoff, .edition-vertical-lead',
+ handoffSourceSelector: '.edition-vertical-lead, .chapter-intro--method',
```

**修复**：之前的选择器 `[data-runtime-readable-copy]` 和 `.method-edition-layout--after-handoff` 可能匹配到非预期的 DOM 元素，导致 handoff 收养的内容不正确。改为精确匹配 `edition-vertical-lead` 和 `chapter-intro--method`。

### 3. Handoff Receiver 新增 `restoreAtEnd` 参数（`handoff-receiver.js`）

```js
update(progress, {
  start = 0.72,
  end = 1,
  liftPx = 24,
  restoreAtEnd = true   // 新增，默认 true
} = {}) {
  // ...
  if (restoreAtEnd && progress >= end) restore();
  return p;
}
```

AOD 中 `restoreAtEnd: false`，因此 handoff 的 DOM 收养持续到 `completePlayback` 后显式调用 `restore()`。

### 4. Crane 播放器超时保护（`crane-scene-player.js`）

**新增 `timeline-complete` 超时保护**：
```js
const playbackStartedAt = now();
// ...
const timelineElapsed = now() - playbackStartedAt;
if (timelineElapsed >= timelineDurationMs + 250 && progress >= 0.8) {
  scheduleFinish('timeline-complete');
  return;
}
```

**修复**：如果 crane 视频卡住或加载超时，播放器不会无限悬挂。当 timeline 时间超过 `timelineDurationMs + 250ms` 且 progress ≥ 0.8 时，自动调用 `scheduleFinish('timeline-complete')` 完成场景播放。

### 5. Poster Frame Timeout 记录（`crane/figure3/ttg`）

`waitForFirstFrame` / `waitForPosterFrame` 的 `onTimeout` 从 `resolve()` 改为 `resolve({ timedOut: true, readyState, ... })`：

```js
const onTimeout = () => finish({
  timedOut: true,
  readyState: video.readyState,
  src: video.currentSrc || video.getAttribute?.('src') || ''
});
```

在 `showPoster` 中记录：
```js
if (timedOutGates.length) {
  recordTrace('poster-frame-timeout', {
    count: timedOutGates.length,
    readyStates: timedOutGates.map((gate) => gate.readyState ?? null)
  });
}
```

**改善**：poster frame timeout 不再是静默失败，而是被记录为可观察的 trace。这有助于排查视频加载慢导致 poster gate 卡住的问题。

### 6. 新增浏览器验收测试（`run-browser-acceptance.mjs`）

新增 1373 行的 `run-browser-acceptance.mjs`，用于自动化验证场景转场效果。这是一个重要的基础设施改进，但不在本 review 的范围内。

---

## 逐条 Finding 重新评估

| # | Finding | 本轮评估 | 说明 |
|---|---------|----------|------|
| 1 | hero→pattern 闪烁，pattern 应为 open | ⚠️ **未改善** | 无相关文件改动。`center-ink-expand` 仍为 `scene` 类型静态图过渡 |
| 2 | pattern→star-map 闪烁/非 fullscreen/拉长 | ⚠️ **未改善** | 无相关文件改动。shell 高度已在 8f34758 修复 |
| 3 | star-map→aod 未 1:1 还原 main | ⚠️ **未改善** | 无相关文件改动。`star-map→aod` 仍为 `transition` 类型，AOD 以 poster 帧入场，`playForward` 不触发，无 dissolve 动画 |
| 4 | belief（star-map 内部）80% 提前入场，文字不应盖住 aod | ⚠️ **未改善** | 无相关文件改动。`starmap-scene-player.js` 未修改。`showPoster` 仍设置 `copyWrap.style.opacity = ''`（默认 1），belief 文字全程可见 |
| 5 | figure2 phase 1 无滚动视频 | ⚠️ **未改善** | 无相关文件改动。`figure2-compound-scene-player.js` 未修改 |
| 6 | figure2→brand ink sweep 缺失，proof 屏没出来 | ⚠️ **未改善** | 无相关文件改动。`figure2-compound-scene-player.js` 未修改。`handoffFade` 在 inkProgress 0.58 时仍强制淡出 proof 屏 |
| 7 | brand→figure3 双占 | ✅ **已改善** | 无改动。overlay 问题已在 8f34758 修复 |
| 8 | services 80% 提前入场，背景应为亮色 | ✅ **已改善** | 无改动。已在 8f34758 修复 |
| 9 | crane→contact 80% 提前入场，应先文字后背景 | ✅ **已改善** | 无改动。已在 8f34758 修复。本次新增 `timeline-complete` 超时保护，改善 crane 视频卡住时的 robustness |
| 10 | education title 4 条分割线 | ⚠️ **未改善** | 无相关文件改动。`.enterprise-wide-stage` CSS 未调整 |
| 11 | contact 背景变深色 | ✅ **已改善** | 无改动。已在 8f34758 修复 |

---

## 新增发现与风险

### 发现 1：AOD Handoff 时序修复（已解决）

`completePlayback` 中显式调用 `restoreHandoffContent()`：

```js
function completePlayback(reason) {
  // ...
  renderHandoffProgress(1);
  restoreHandoffContent();   // ← 显式还原
  transitionTo('complete', { reason });
  // ...
}
```

修复前：
- progress=0.94：handoff receiver 自动 restore，DOM 被移回 `method-top` host
- `method-top` host 可能此时不可见（AOD 仍在播放），导致内容闪现后消失

修复后：
- progress=1.0：`completePlayback` 调用 `restoreHandoffContent()`，DOM 还原
- 随即 `presentation.present('method-top')` 使 `method-top` host 可见
- handoff 内容在 AOD 完成播放后平滑过渡到 method-top

### 发现 2：Crane Timeline-Complete 超时保护

Crane 播放器的 `tick` 函数新增：

```js
const timelineElapsed = now() - playbackStartedAt;
if (timelineElapsed >= timelineDurationMs + 250 && progress >= 0.8) {
  scheduleFinish('timeline-complete');
  return;
}
```

**正常时序**：视频播放结束后，`handleEnded` 调用 `scheduleFinish('ended')`，progress 达到 1。

**异常时序**：视频卡住或网络慢，`handleEnded` 不被触发。但 `setProgress(Math.max(progress, 0.8))` 和 `emitEarlyCopyReady(progress)` 在 `scheduleFinish` 中仍然被调用，early copy 在 80% 时正确触发。场景播放随后完成，不会因为视频卡住而无限悬挂。

**风险**：`scheduleFinish` 被 `handleEnded` 和 `timeline-complete` 两种路径调用。如果 `handleEnded` 在 `timeline-complete` 之后触发（视频最终播放完成），`settled` 保护防止重复 finish。

### 发现 3：Handoff Source Selector 精确匹配

`handoffSourceSelector` 从模糊的多选择器改为 `'.edition-vertical-lead, .chapter-intro--method'`。

**风险**：如果 `method-top` host 的 DOM 中 `.edition-vertical-lead` 和 `.chapter-intro--method` 的顺序不同，`querySelector` 返回第一个匹配的元素。需要确认这两个选择器的元素在 DOM 中只有一个，否则 handoff 可能收养到错误的内容。

### 发现 4：Poster Frame Timeout 降级策略

`crane` / `figure3` / `ttg` 的 `waitForFirstFrame` / `waitForPosterFrame` 超时后不再静默 resolve，而是返回 `{ timedOut: true, readyState, ... }`。

**正常路径**：video readyState ≥ 2（HAVE_CURRENT_DATA），resolve `{ ready: true, readyState }`。

**降级路径**：video readyState < 2，timeout 后 resolve `{ timedOut: true, readyState }`，并记录 `poster-frame-timeout` trace。

`showPoster` 中 timeout 不会阻止 poster frame 显示，因为 `renderPosterFrame()` 在 `waitForPosterFrame` 之后仍然被调用。即使视频没有加载到第一帧，海报帧（poster 属性或 CSS 背景）仍然显示。

**风险**：如果 video 的 `poster` 属性为空且 video 没有加载任何数据，`renderPosterFrame()` 可能渲染黑屏。但此时 `poster-frame-timeout` trace 被记录，可用于调试。

---

## 修复优先级建议（更新）

| 优先级 | 问题 | 影响 Finding | 修复方向 |
|--------|------|-------------|----------|
| 🔴 P0 | Belief 文字在 poster 状态完全可见 | 4 | `StarmapScenePlayer.showPoster()` 显式隐藏 `copyWrap`（opacity=0） |
| 🔴 P0 | AOD 入场仍是 poster 帧，无 dissolve | 3 | 将 `star-map→aod` 改为 `scene-play-transition` 类型，或在 `showPoster` 中预启动 AOD 的 dissolve 动画 |
| 🔴 P0 | Figure2 proof 屏被 ink 强制淡出 | 6 | 延后 `handoffFade` 区间（0.75→0.95）或调整 figure2 路由 |
| 🟡 P1 | Scene 类型过渡 handoff 闪烁 | 1, 2 | `center-ink-expand` / `left-rotate-bloom` 改为 `curtain` 类型或增加过渡帧缓冲 |
| 🟡 P1 | Figure2 视频非 scroll-scrub | 5 | 重构为 scroll-driven 或保留现状 |
| 🟢 P2 | Education 4 条分割线 | 10 | 按设计需求调整 CSS |

---

## 与 0f0aab6 版本对比

| 改善项 | 说明 |
|--------|------|
| AOD→method-top handoff 时序 | `restoreAtEnd: false` + `completePlayback` 显式 `restoreHandoffContent()`，避免 handoff 内容提前消失 |
| Handoff source selector 精确匹配 | 避免意外收养非预期 DOM 元素 |
| Crane 超时保护 | `timeline-complete` 在视频卡住时自动完成场景，避免无限悬挂 |
| Poster frame timeout 记录 | 降级策略可观察，便于调试视频加载问题 |
| 浏览器验收测试 | 新增 `run-browser-acceptance.mjs` 用于自动化验证 |

| 未改善项 | 说明 |
|----------|------|
| AOD 入场方式 | 仍为 `transition` 类型 + poster 帧，无 dissolve 动画 |
| Belief 文字可见 | `showPoster` 未隐藏 `copyWrap`，belief 文字全程可见 |
| Figure2 proof 屏 | 被 ink handoffFade 强制淡出，仍未显示 |
| Education 分割线 | CSS 未调整 |
| Scene 类型过渡 | `center-ink-expand` / `left-rotate-bloom` 仍为静态图过渡 |
| Figure2 视频 | 仍为 `seekVideos` 时间驱动，非 scroll-scrub |
