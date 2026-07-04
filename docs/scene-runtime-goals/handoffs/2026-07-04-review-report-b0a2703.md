# Review Report：Commit b0a2703 Fix scene runtime acceptance regressions

**Commit**: `b0a2703052554b675f19394cb910a23187aa42d3`  
**日期**: 2026-07-04 13:57  
**上一条 review 的 commit**: `6566b28`  
**核实方法**: 代码静态分析 + diff 比对 + 架构推演

---

## 一句话结论

**这次改的是对的——修复了 figure3 和 ttg 的 media clock timing 问题，特别是 early-copy 被 wall-clock timer 强制过早触发的问题。但只修了一层，更深层的架构问题（TransitionSegmentPlayer 空壳、Presentation 单可见、early-copy 层透明背景）没动。**

---

## 这次改动改了什么

### 1. figure3-scene-player.js（核心改动）

| 改动项 | Before（6566b28） | After（b0a2703） | 评价 |
|--------|-------------------|------------------|------|
| early-copy 触发机制 | wall-clock timer（`earlyCopyTimelineTimer`）在固定时间后强制触发 | **完全由 media clock 驱动**（`video.currentTime / duration`） | ✅ 正确修复 |
| progress 计算 | `Math.max(mediaProgress(), timeline)` 混用 | `hasMediaClock ? mediaProgress() : timeline` 二选一 | ✅ 正确修复 |
| complete 条件 | `mediaAtEnd \|\| timeline >= 1` | `mediaAtEnd \|\| (!hasMediaClock && timeline >= 1)` | ✅ 正确修复 |
| `playbackStartedAt` 位置 | 在 `playVideo()` 之前 | 在 `await playVideo()` 之后 | ✅ 正确修复 |
| `mediaClockReady()` | 不存在 | 新增，检查 `readyState >= 1` | ✅ 合理 |

**关键代码对比：**

```js
// Before（6566b28）—— wall-clock timer 强制触发 early-copy
const earlyCopyTimelineMs = Math.max(1, durationOf() * EARLY_COPY_PROGRESS * 1000);
const earlyCopyTimelineTimer = setTimeoutFn(() => {
  if (!settled && state === 'playing-forward') {
    renderPlaybackFrame(Math.max(progress, EARLY_COPY_PROGRESS));
  }
}, earlyCopyTimelineMs);

// tick 混用 media + timeline
const nextProgress = Math.max(mediaProgress(), timeline);
const acceptedFallback = mediaAtEnd || timeline >= 1;
```

```js
// After（b0a2703）—— media clock 全权驱动
// ❌ 移除了 earlyCopyTimelineTimer

// tick 二选一
const hasMediaClock = mediaClockReady();
const nextProgress = hasMediaClock ? mediaProgress() : timeline;
const acceptedFallback = mediaAtEnd || (!hasMediaClock && timeline >= 1);
```

### 2. ttg-scene-player.js

| 改动项 | Before | After | 评价 |
|--------|--------|-------|------|
| complete 条件 | `mediaAtEnd` 仅检查视频结束 | `mediaAtEnd \|\| timelineProgress >= 1` | ✅ 新增 fallback |
| progress 计算 | `Math.max(mediaProgress(), timelineProgress(playbackStartedAt))` | 不变 | ⚠️ 仍是混用 |

### 3. 验收测试脚本

| 改动项 | Before | After | 评价 |
|--------|--------|-------|------|
| 视频采样要求 | `samples >= 3`, `increases >= 2` | `samples >= 2`, `increases >= 1` | ⚠️ 放宽了 |
| early-copy 进度计算 | `Number.isFinite(media) ? media : visual` | `Math.max(media \|\| 0, visual \|\| 0)` | ✅ 取最大值更合理 |
| 测试覆盖 | 无 figure3 media-clock 测试 | 新增 figure3 media-clock timing 测试 | ✅ 好 |
| 测试覆盖 | 无 ttg timeline fallback 测试 | 新增 ttg timeline fallback 测试 | ✅ 好 |

---

## 解决了什么问题

### ✅ 已解决

| 问题 | 说明 |
|------|------|
| **services 文案过早入场** | 之前 figure3 的 wall-clock timer 在视频播放到 80% 前就强制触发 early-copy，导致 services 内容过早覆盖 figure3 画面。现在 early-copy 严格由 `video.currentTime` 驱动，只有视频实际播到 80% 时才触发。 |
| **figure3 progress 超前** | 之前 `Math.max(mediaProgress(), timeline)` 导致即使视频卡顿，timeline 也会把进度推上去，造成视觉与音频不同步。现在 media clock 可用时完全信任视频 currentTime。 |
| **figure3 错误 completion** | 之前 timeline >= 1 就会 complete，不管视频实际是否播完。现在只有 media clock 不可用时才用 timeline fallback。 |
| **ttg 视频卡住时无法完成** | 新增 timeline fallback，当 `video.currentTime` 卡住时，用 wall-clock 时间完成 playback。 |

### ❌ 未解决（上次 review 的 findings 仍在）

| # | Finding | 状态 |
|---|---------|------|
| **根因** | TransitionSegmentPlayer 仍是 12ms 空壳，所有转场无视觉动画 | ❌ 未涉及 |
| **根因** | Presentation.visible 始终单一场景，to 被 hidden | ❌ 未涉及 |
| **根因** | stableScenePlayers 空数组，activateStableScene 不执行 | ❌ 未涉及 |
| 1 | hero→pattern 闭合闪烁 | ❌ 未涉及 |
| 2 | pattern→star-map 先出后消失/拉伸 | ❌ 未涉及 |
| 3 | star-map→aod 没有 1:1 复刻 | ❌ 未涉及 |
| 4 | belief 全程可见 | ❌ 未涉及 |
| 5 | figure2 视频非 scroll-scrub | ❌ 未涉及 |
| 6 | figure2→brand bridge 文案/墨滴不明显 | ❌ 未涉及 |
| 7 | brand→figure3 双占（overlay 未清理） | ❌ 未涉及 |
| 8 | services 80% 提前入场——**画面覆盖问题** | ⚠️ timing 修复了，但 early-copy 仍显示整个 host |
| 9 | crane→contact 文案占画面 | ❌ 未涉及 |
| 10 | education 4 条分割线 | ❌ 未涉及 |
| 11 | contact 背景变深色（early-copy 透明） | ❌ 未涉及 |

---

## 关键发现：ttg 的 progress 仍是混用

**ttg-scene-player.js 第 509 行：**

```js
const nextProgress = Math.max(mediaProgress(), timelineProgress(playbackStartedAt));
```

ttg 的 progress 计算**没有改成 figure3 的二选一模式**，仍是 `Math.max(media, timeline)`。

这意味着：
- 如果 ttg 的视频加载慢或卡顿，timeline 会超前推进
- 可能导致 ttg 的 visual 与音频不同步
- 但因为 ttg 视频较短（~2.5s），影响可能较小

**建议**：统一为 figure3 的模式：`hasMediaClock ? mediaProgress() : timeline`

---

## 验收测试放宽的隐患

```js
// Before
if (values.length < 3) return false;
// ...
return max - min >= 0.08 && increases >= 2;

// After
if (values.length < 2) return false;
// ...
return max - min >= 0.08 && increases >= 1;
```

放宽验收标准通常意味着实际运行中视频采样点不足。可能的原因：
- 浏览器 throttle 了 requestAnimationFrame
- 视频太短，采样窗口不够
- 转场太快（12ms），没有足够时间采样

这不是这次改动的错，但反映了底层架构的问题：TransitionSegmentPlayer 太快了。

---

## 修复优先级建议（更新）

| 优先级 | 问题 | 上次状态 | 本次更新 |
|--------|------|---------|---------|
| 🔴 P0 | TransitionSegmentPlayer 空壳过渡 | 未动 | 仍未动 |
| 🔴 P0 | Presentation 支持转场双可见 | 未动 | 仍未动 |
| 🔴 P0 | stableScenePlayers 配置 | 未动 | 仍未动 |
| 🟡 P1 | ttg progress 混用 media+timeline | 未涉及 | **新增**：应统一为二选一模式 |
| 🟡 P1 | figure3 overlay 清理 | 未动 | 仍未动 |
| 🟡 P1 | early-copy 背景色（services/contact） | 未动 | timing 已修复，但视觉层仍有问题 |
| 🟢 P2 | education 4 条分割线 | 未动 | 仍未动 |
| 🟢 P2 | 验收测试放宽 | 未涉及 | 建议关注底层原因 |

---

## 结论

**b0a2703 是一个正确的、有针对性的修复**，解决了 figure3 和 ttg 的 media clock timing 问题，特别是：

1. ✅ early-copy 不再被 wall-clock timer 强制过早触发
2. ✅ progress 不再混用 media clock 和 timeline
3. ✅ completion 条件更严谨（只有 media clock 不可用时才 fallback）
4. ✅ ttg 新增 timeline fallback

**但所有架构层面的问题仍然没有动**：
- TransitionSegmentPlayer 仍是 12ms 空壳
- Presentation 仍只显示单一场景
- stableScenePlayers 仍为空数组
- early-copy 层仍是透明背景
- figure3 overlay 仍可能残留

**下一步建议**：
1. **统一 ttg 的 progress 计算**（与 figure3 一致，二选一而非 max）
2. **接入真正的 WebGL ink transition**（优先级最高，影响所有转场）
3. **Presentation 支持转场双可见**（让 from 和 to 同时在场）
4. **stableScenePlayers 配置**（让场景能自动进入 stable 状态）
