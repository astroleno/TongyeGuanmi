# Commit 0f0aab6 重新 Review 报告

**Commit**: `0f0aab6 Refine AOD and early-copy handoff behavior`  
**前序 Commit**: `8f34758 Split early copy projection from scene hosts`  
**Review 日期**: 2026-06-24  
**Review 方法**: 代码静态分析 + diff 对比 + 运行时推演

---

## 0f0aab6 核心改动摘要

### 1. AOD 场景播放器新增内部 Handoff 机制

`aod-scene-player.js` 引入了三项新能力：

- **`createInkCurtainTransition` 内嵌 ink canvas**：在 AOD 的 `.aod-transition__field` 内创建 WebGL ink curtain，随 AOD 播放 progress 渲染
- **`createHandoffReceiver` 收养 method-top DOM**：将 method-top host 中的 `.edition-vertical-lead` / `.chapter-intro` 等 DOM 元素从原始位置「收养」到 AOD field 中，随 progress 0.58→0.94 渐显
- **Handoff 配置参数化**：`handoffTargetSelector`、`handoffSourceSelector`、`handoffClassName` 通过 `SceneRuntimeMvpVisualRegistry` 注入

Registry 配置：
```js
'aod-animation': () => createAodScenePlayer({
  handoffTargetSelector: '[data-scene-id="method-top"]',
  handoffSourceSelector: '[data-runtime-readable-copy], .method-edition-layout--after-handoff, .edition-vertical-lead',
  handoffClassName: 'homepage-handoff-receiver--method'
})
```

Handoff 时序：
- `progress < 0.58`：不收养，method-top 内容在原始 host 中
- `progress 0.58→0.94`：收养到 AOD field，opacity 0→1，translateY 18px→0，blur 8px→0
- `progress >= 0.94`：restore 回原始 host

### 2. AOD 触发的 Early Copy 被 Runtime 屏蔽

`SceneRuntimeDomShell` 新增：
```css
[data-reveal-source-scene="aod-animation"][data-early-copy-projection] {
  display: none !important;
}
```

同时 `Presentation.presentEarlyCopy()` 新增 `sourceSceneId` 字段，`SceneRuntimeCore` 传递 `attempt.from` 作为 source。

**原因**：AOD 现在有自己的 handoff receiver，不再需要 runtime 的 early-copy 层投影。

### 3. Early Copy 投影颜色改为深色主题

```css
[data-early-copy-projection] {
  color: #17251f;           /* 从 #f7edd7 改为深色 */
}
[data-early-copy-projection] :is(.section-index, h1, h2, p, span, strong, a) {
  color: #17251f !important; /* 从 #f7edd7 改为深色 */
}
```

以及新增：
```css
[data-early-copy-projection] :is(.contact-endpoint)::before {
  content: none !important;
  display: none !important;
}
```

### 4. applyProjection 调用频率降低

`SceneRuntimeDomShell` 的 `setState` hook 改为只在 `SNAP_LOCKING`、`TRANSITIONING`、`PLAYING` 时调用 `applyProjection`：
```js
if (['SNAP_LOCKING', 'TRANSITIONING', 'PLAYING'].includes(args[0])) {
  this.applyProjection(`state:${args[0]}`);
}
```

减少不必要的 DOM 重排。

### 5. Poster Gate Timeout 容错

`figure3-scene-player.js` 和 `ttg-scene-player.js` 的 `waitForPosterFrame` / `waitForFirstFrame` 的 timeout handler 从 `reject` 改为 `resolve`：
```js
// 之前
const onTimeout = () => finish(new Error('figure3 poster gate timed out'));
// 之后
const onTimeout = () => finish();
```

避免视频加载慢时导致整个转场失败。

---

## 逐条 Finding 重新评估

| # | Finding | 本轮评估 | 说明 |
|---|---------|----------|------|
| 1 | hero→pattern 闪烁，pattern 应为 open | ⚠️ **未改善** | 无改动。`center-ink-expand` 仍为 `scene` 类型静态图过渡 |
| 2 | pattern→star-map 闪烁/非 fullscreen/拉长 | ⚠️ **未改善** | 无改动。shell 高度已在 8f34758 修复 |
| 3 | star-map→aod 未 1:1 还原 main | ⚠️ **部分改善** | AOD 新增内部 handoff 机制（ink + method receiver），但 **handoff 只在 AOD→method-top 的退场阶段触发**。`star-map→aod` 仍为 `transition` 类型，AOD 以 poster 状态入场，`playForward` 不触发。AOD 的入场方式与 main 分支仍不同 |
| 4 | belief（star-map 内部）80% 提前入场，文字不应盖住 aod | ⚠️ **未改善** | `starmap-scene-player.js` 无改动。`showPoster` 仍设置 `copyWrap.style.opacity = ''`（默认 1），belief 文字在 poster 状态完全可见。star-map→aod 的 curtain 过渡期间，belief 文字在 source 层稳定，可能透过半透 canvas 与 AOD 内容混合 |
| 5 | figure2 phase 1 无滚动视频 | ⚠️ **未改善** | 无改动。视频仍为 `seekVideos` 时间驱动 |
| 6 | figure2→brand ink sweep 缺失，proof 屏没出来 | ⚠️ **未改善** | 无改动。`handoffFade` 在 inkProgress 0.58 时强制淡出 proof 屏 |
| 7 | brand→figure3 双占 | ✅ **已改善** | 无改动。overlay 问题已在 8f34758 修复 |
| 8 | services 80% 提前入场，背景应为亮色 | ✅ **已改善** | 无改动。已在 8f34758 修复 |
| 9 | crane→contact 80% 提前入场，应先文字后背景 | ✅ **已改善** | 无改动。已在 8f34758 修复 |
| 10 | education title 4 条分割线 | ⚠️ **未改善** | 无改动。CSS 未调整 |
| 11 | contact 背景变深色 | ✅ **已改善** | 无改动。已在 8f34758 修复 |

---

## 新增发现与风险

### 风险 1：AOD Handoff 在退场阶段工作，入场仍是 poster 帧

AOD 的 `renderHandoffProgress` 只在 `renderPlaybackFrame` 和 `completePlayback` 中调用，这两个方法只在 `playForward` 阶段执行。

`star-map→aod` 是 `transition` 类型：
1. `prepareTransitionTarget` → `ensureAdapter('aod-animation')` → `showPoster()` → AOD 视频 currentTime=0
2. runtime `bottom-to-top-ink` curtain 过渡覆盖 viewport
3. 过渡完成后 `presentation.present('aod-animation')` → AOD 进入 stable 状态，progress=0

此时 AOD 的 handoff 效果（ink canvas + method receiver）**完全不存在**。

用户继续滚动触发 `aod-animation→method-top`（`scene-play` 类型）：
1. `runScenePlayAttempt` → `adapter.playForward()` → AOD 播放
2. AOD 播放 progress 0.58→0.94：handoff receiver 渐显 method-top 内容
3. AOD 播放完成 → `presentation.present('method-top')`

**结论**：AOD 的 handoff 是在 AOD 的「退场」阶段实现的，而不是「入场」阶段。`star-map→aod` 的过渡仍然是 runtime curtain，AOD 的 poster 帧（视频第一帧）直接入场，无 dissolve 动画。

### 风险 2：Handoff Receiver 的 DOM 收养/还原时序

`createHandoffReceiver` 的 `update` 在 `progress >= 0.94` 时调用 `restore()`，将 method-top 的 DOM 内容还原到原始 host。

时序推演：
1. AOD progress = 0.94：`restore()` 将 DOM 移回 `method-top` host
2. AOD progress = 1：`completePlayback()` → `renderHandoffProgress(1)`（无操作，已 restore）
3. `runScenePlayAttempt` 后续：`presentation.present('method-top')` → `method-top` host 可见
4. `clearEarlyCopy('scene-play-committed')` → 清除 early-copy 层

**正常情况**：DOM 在 `present` 前已还原到 `method-top` host，内容正确显示。

**风险场景**：如果 AOD 播放被 cancel（用户反向滚动）：
- `cleanupToPoster()` → `cleanupHandoffEffects()` → `restore()`
- DOM 被还原到原始 host
- 但 AOD 回到 poster 状态，`method-top` host 被 `hidden = true`

此场景下 DOM 内容不会丢失，只是 method-top 不可见。

**风险场景**：如果 AOD 的 `playForward` 从未被调用（用户从 AOD 直接跳转到其他场景）：
- `jumpToScene` → `presentation.clearEarlyCopy()` → `host.hidden = true`
- AOD 的 `destroy()` → `cleanupHandoffEffects()` → `restore()`
- DOM 被还原

看起来 DOM 收养/还原的时序是正确的。

### 风险 3：Handoff Source Selector 可能匹配到非预期元素

`handoffSourceSelector` 是复合选择器：
```js
'[data-runtime-readable-copy], .method-edition-layout--after-handoff, .edition-vertical-lead'
```

`createHandoffReceiver.resolveSource` 使用 `querySelector`：
```js
return target.querySelector(sourceSelector);
```

`querySelector` 按文档顺序返回**第一个匹配**的元素。如果 `method-top` host 的 DOM 中 `.chapter-intro` 在 `.edition-vertical-lead` 之前，handoff 收养的内容就是 `.chapter-intro`。

`EARLY_COPY_SELECTORS` 中 `method-top` 的优先级是 `['.edition-vertical-lead', '.chapter-intro']`，但 `handoffSourceSelector` 的选择器顺序是 `[data-runtime-readable-copy], .method-edition-layout--after-handoff, .edition-vertical-lead`。

如果 `method-top` 的 DOM 中没有 `[data-runtime-readable-copy]` 和 `.method-edition-layout--after-handoff`，那么 `.edition-vertical-lead` 应该被匹配。但如果 `.chapter-intro` 也在 DOM 中且顺序在前，它不会被 `handoffSourceSelector` 匹配（因为 `.chapter-intro` 不在 selector 中）。

实际上，`.chapter-intro` 不在 `handoffSourceSelector` 中，所以不会被匹配。如果 `method-top` 的 DOM 中同时存在 `.edition-vertical-lead` 和 `.chapter-intro`，且 `.edition-vertical-lead` 在 `.chapter-intro` 之后，`querySelector` 会返回第一个匹配的元素，即 `.edition-vertical-lead`（如果它在前）或... 等等，如果两个元素都匹配同一个选择器，那第一个匹配的会被返回。但这里 `.chapter-intro` 不匹配 `.edition-vertical-lead`，所以只有 `.edition-vertical-lead` 会被匹配。

但如果 `.edition-vertical-lead` 不存在，而 `[data-runtime-readable-copy]` 存在，那么 `[data-runtime-readable-copy]` 会被收养。这可能不是预期的内容。

**建议**：确保 `handoffSourceSelector` 的顺序和 `EARLY_COPY_SELECTORS` 保持一致，或明确指定唯一的选择器。

### 风险 4：applyProjection 频率降低可能引入延迟

`setState` hook 只在 `SNAP_LOCKING`、`TRANSITIONING`、`PLAYING` 时调用 `applyProjection`。如果 `PRESENTING` 或 `RELEASING` 状态需要更新 DOM（如 `projectTargetLayer` 或 `projectRevealLayer` 需要更新），可能会延迟一帧。

但 `handleSceneTrace` 和 `handleAsyncTrace` 的 hook 仍然在每个 trace 时调用 `applyProjection`，所以 `scene-progress` 和 `milestone` 事件仍然能触发投影更新。对于 `PRESENTING` 状态（通常只发生在一次性的 `present` 调用后），DOM 状态由 `Presentation.present` 或 `clearEarlyCopy` 直接驱动，不需要频繁更新。

此优化应该安全。

---

## 修复优先级建议（更新）

| 优先级 | 问题 | 影响 Finding | 修复方向 |
|--------|------|-------------|----------|
| 🔴 P0 | Belief 文字在 poster 状态完全可见 | 4 | `StarmapScenePlayer.showPoster()` 显式隐藏 `copyWrap`（opacity=0） |
| 🔴 P0 | AOD 入场仍是 poster 帧，无 dissolve | 3 | 将 `star-map→aod` 改为 `scene-play-transition` 类型，让 AOD 的 `playForward` 在入场时触发；或在 `showPoster` 中预启动 AOD 的 dissolve 动画 |
| 🔴 P0 | Figure2 proof 屏被 ink 强制淡出 | 6 | 延后 `handoffFade` 区间（0.75→0.95）或调整 figure2 路由 |
| 🟡 P1 | Scene 类型过渡 handoff 闪烁 | 1, 2 | 静态图替换为 live DOM 渲染或增加过渡帧缓冲 |
| 🟡 P1 | Figure2 视频非 scroll-scrub | 5 | 重构为 scroll-driven 或保留现状 |
| 🟢 P2 | Education 4 条分割线 | 10 | 按设计需求调整 CSS |

---

## 与 8f34758 版本对比

| 改善项 | 说明 |
|--------|------|
| AOD→method-top handoff | 新增 ink + handoff receiver，AOD 退场时 method-top 内容可正确渐显 |
| AOD early copy 冲突 | AOD 触发的 early copy 被 runtime 屏蔽，避免双重投影 |
| early copy 投影颜色 | 从 `#f7edd7`（浅色）改为 `#17251f`（深色），与亮色背景一致 |
| poster gate timeout 容错 | figure3 / ttg 视频超时不再导致转场失败 |

| 未改善项 | 说明 |
|----------|------|
| AOD 入场方式 | 仍为 `transition` 类型 + poster 帧，无 dissolve 动画 |
| Belief 文字可见 | `showPoster` 未隐藏 `copyWrap`，belief 文字全程可见 |
| Figure2 proof 屏 | 被 ink handoffFade 强制淡出，仍未显示 |
| Education 分割线 | CSS 未调整 |
