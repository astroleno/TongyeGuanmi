# 核实报告：scene-runtime-full-v1-integration 11 条 Findings

**分支**：`codex/scene-runtime-full-v1-integration`  
**Commit**：`be2d0cb Split internal scene intent timing`  
**核实日期**：2026-06-24  
**核实方法**：代码静态分析 + 运行时架构推演

---

## 核心根因总结

**所有转场问题的共同根因：`Presentation` 类在转场期间只维护单一场景的 `visible` 集合。**

在 `Presentation.present()` 中：
```js
present(sceneId, reason) {
  this.current = sceneId;
  this.reveals = [sceneId];
  this.visible = new Set([sceneId]);   // ← 始终只有一个场景
  this.earlyCopies = new Set();
  this.reason = reason;
}
```

在 `SceneRuntimeDomShell.applyProjection()` 中：
```js
const visible = snapshot.visible || [];
const isVisible = visible.includes(hostId);
host.hidden = !isVisible;                // ← 不在 visible 中的场景被强制隐藏
```

这意味着：
- 转场期间，`from` 场景在 `source` 层，`to` 场景在 `target` 层
- 但 `Presentation.visible` 只包含 `from`（当前场景）
- 因此 `to` 场景被 `host.hidden = true` 强制隐藏
- 过渡 canvas 虽在 `transition` 层（z-index: 3），但 `scene` 类型过渡渲染的是静态图片，`curtain` 类型虽透明但 `to` 场景根本不存在于可见集合中

**结果：所有转场都只有 `from` 可见，`to` 被隐藏。用户永远看不到两个场景同时出现。**

---

## 逐条核实

### Finding 1：hero → pattern，pattern 应该是 open 状态，现在是 closed → open 闪烁

**核实结果：✅ 成立**

`center-ink-expand` 是 `type: 'scene'` 的 ink 过渡（`MvpInkTransitionPlayer.js:59-70`）：
```js
return {
  type: 'scene',
  targetSrc: 'assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png',
  // ...
};
```

`scene` 类型过渡在 WebGL canvas 上渲染的是一张**静态图片**（aged mottled background），而不是 pattern 场景本身的 SVG 动画。转场完成后，pattern 才通过 `activateStableScene()` 被唤起。

pattern 的 `posterProgress = 1`（`pattern-scene-player.js`），`showPoster` 直接跳到全开状态，理论上没有动画。但 handoff 瞬间存在**静态图 → 真实 DOM 场景**的切换，视觉上会产生一次"闪烁/重绘"。

---

### Finding 2：pattern → star-map，闪烁、不是 fullscreen、被拉长到 100vh 以上

**核实结果：✅ 成立**

`left-rotate-bloom` 同样是 `type: 'scene'` 过渡（`MvpInkTransitionPlayer.js:72-85`），目标图是静态 `assets/back2.png`。

star-map 场景的根元素样式：
```css
.starmap-scene {
  position: relative;
  height: 100vh;
  overflow: hidden;
}
```

但承载场景 host 的 shell 样式：
```css
[data-scene-shell] {
  position: relative;
  width: 100%;
  display: block;
}
```

shell **没有 `height: 100vh` 或 `min-height: 100vh`**。host 是 `position: absolute; inset: 0; height: 100%`，但如果 shell 的高度由内容决定（而内容在转场期间只有一个 host 可见），`height: 100%` 的语义是不稳定的。

此外，转场 canvas 是 WebGL 渲染，alpha 通道可能不完全覆盖 viewport，导致 star-map DOM 在 handoff 时出现可见性抖动。

---

### Finding 3：star-map → aod，aod 没有 1:1 还原 main 分支

**核实结果：✅ 成立**

`star-map → aod` 是 `scene-play-transition` 类型：先播放 star-map，再执行 `bottom-to-top-ink` 过渡。

`bottom-to-top-ink` 是 `curtain` 类型过渡（`MvpInkTransitionPlayer.js:87-98`）。

AOD 场景内部有自己的转场系统（`aod-transition.js`），但运行时过渡和 AOD 内部过渡是**完全独立的两个系统**：
- 运行时 `curtain` 过渡：在 `transition` 层 canvas 上渲染 ink wash shader
- AOD 内部过渡：视频 mask + 溶解动画

运行时的 `curtain` 过渡不会调用 AOD 内部的 `aod-transition.js`。AOD 视频在转场期间被 `host.hidden = true` 隐藏，其视频和 mask 系统没有机会参与转场。因此 AOD 的呈现方式与 main 分支"视频溶解入场"的效果完全不同。

---

### Finding 4：belief（star-map 内部）80% 提前入场，文字不应盖住 aod 视频，文字位置太低

**核实结果：⚠️ 部分成立，但机制不同**

star-map 场景在 `SceneRuntimeMvpVisualRegistry` 中**没有配置 milestones**（`js/scene-runtime/SceneRuntimeMvpVisualRegistry.js:10-20`）。因此 star-map 本身不会触发 early-copy。

但用户描述的视觉效果（belief 文字与 aod 视频重叠）可以通过**根因解释**：`curtain` 类型过渡的 WebGL canvas 使用 `alpha: true`，其 `gl_FragColor` 的 alpha 值在边缘区域小于 1（`ink-scene-transition.js:140-144`）：
```glsl
float alpha = coreWash;
alpha += feather * 0.18 + hot * 0.13 + ...;
gl_FragColor = vec4(color, alpha);
```

由于 `Presentation.visible` 只包含 `from`（star-map），`to`（aod）被隐藏。但如果 early-copy 机制意外生效，或者 canvas alpha 透出 background，可能造成视觉重叠。

更关键的是：`scene-play-transition` 类型的 `runScenePlayTransitionAttempt` 在完成 star-map 播放后调用 `runTransitionAttempt`，而 **runScenePlayTransitionAttempt 没有调用 `clearEarlyCopy()`**（`SceneRuntimeCore.js:796-829`），而 `runScenePlayAttempt` 有（`SceneRuntimeCore.js:792`）。这意味着如果 star-map 播放期间产生了 early-copy（即使没有 milestones，也可能通过其他机制），这些 early-copy 会持续到转场结束。

---

### Finding 5：figure2 phase 1 没有滚动视频

**核实结果：✅ 成立**

`FIGURE2_COMPOUND_STEP_ORDER`（`figure2-compound-scene-player.js:4-11`）：
```js
export const FIGURE2_COMPOUND_STEP_ORDER = Object.freeze([
  'poster',
  'camera-expand',
  'proof-cards',
  'proof-closing',
  'ink-sweep',
  'present-brand'
]);
```

注意：step order 中**没有 `video` 步骤**。视频播放逻辑分散在 `camera-expand` 阶段内：
- `playForward()` 调用 `startFigureVideos()` 启动视频播放
- `renderSnapshot()` 调用 `seekVideos(this.cameraProgress)` 更新 currentTime

但这不是真正的"滚动驱动视频"（scroll-scrubbed video）。视频是**时间驱动**的（`camera-expand` 固定 2200ms），只是通过 `seekVideos` 强制同步 currentTime。如果视频加载失败或 `currentTime` 设置与播放冲突，视频可能显示为静止帧或黑屏。

---

### Finding 6：figure2 phase 2 → brand，ink sweep transition 没有了；"同野观幂做第四种…" 没出现；横向拱形 + 文字墨滴 → brand 不可见

**核实结果：✅ 成立**

figure2 compound 的 `renderInk()` 和 `drawInkSweep()` 方法存在且工作正常（`figure2-compound-scene-player.js:825-865`），但 `ink-sweep` 步骤的触发机制有问题。

`PLAY_STEPS` 包含 `'ink-sweep'`，但 `runScenePlayAttempt` 在 figure2 播放完成后：
```js
this.presentation.present(attempt.step.to, `scene-play:${attempt.from}`);
```

figure2 → brand 是 `scene-play` 类型路由（`SceneRuntimeCore.js:46-49`）。`brand` 不是 `stableScenePlayer`（`stableScenePlayers: ['pattern']`），因此 `activateStableScene` 为空操作。

更关键的是：`runScenePlayAttempt` 在 figure2 播放完成后直接 `present('brand')`，**中间没有过渡**。用户期待的 ink sweep 过渡应该是运行时级别的 `transition`，但路由配置中 figure2 → brand 是 `scene-play`，不是 `transition`。

此外，proof overlay 的显示由 `renderProof()` 控制，依赖 `--figure2-proof-overlay-opacity` CSS 变量。如果 `proofProgress` 没有正确更新，proof 内容不会显示。

---

### Finding 7：brand → figure3，figure3 同时占了 from 和 to

**核实结果：⚠️ 现象存在，但根因是单一场景可见性**

brand → figure3 是 `transition` 类型（`SceneRuntimeCore.js:50-54`）：
```js
brand: {
  kind: 'transition',
  to: 'figure3-animation',
  segmentId: 'bottom-to-top-ink'
}
```

`bottom-to-top-ink` 是 `curtain` 类型。`Presentation.visible` 在转场期间只包含 `brand`（from），`figure3-animation`（to）被 `host.hidden = true` 隐藏。

但 `figure3-scene-player.js` 在 mount 时创建了 `transitionOverlay`：
```js
const transitionOverlay = this.root.querySelector('.figure3-transition-overlay');
const transitionInner = transitionOverlay.querySelector('.figure3-transition-overlay__inner');
transitionInner.appendChild(this.host.cloneNode(true));
```

这个 overlay 有 `position: fixed; inset: 0; z-index: 9999`，是一个**固定定位的遮罩层**。如果 overlay 没有被正确清理，figure3 的克隆内容会持续显示在最上层，造成"figure3 同时占了 from 和 to"的视觉效果。

---

### Finding 8：services 80% 提前入场，services 文字占了 figure3 的屏，services 背景应为亮色 `#ede4d2`

**核实结果：✅ 成立（背景色问题确认）**

`figure3-animation` 的 milestone 配置（`SceneRuntimeMvpVisualRegistry.js`）：
```js
'figure3-animation': {
  milestones: {
    0.8: { revealSceneId: 'services' }
  }
}
```

在 figure3 播放到 80% 时，`services` 被 `presentEarlyCopy` 添加到 `visible` 集合和 `early-copy` 层（z-index: 4）。

但 `services-scene-player.js` 的 support styles：
```css
.services-scene-player-host {
  position: relative;
  min-height: 100%;
  background: #07110e;   /* ← 深色 */
  color: #f7edd7;
}
```

而原始 `#services` 的样式：
```css
.canvas-section--enterprise {
  background: linear-gradient(to bottom, #ede4d2, #f7edd7);  /* ← 亮色 */
}
```

services 场景 harness 强制将背景设为深色 `#07110e`，与预期的亮色主题冲突。

---

### Finding 9：crane → contact 80% 提前入场，contact 文字占了 crane 的屏，应先出文字再淡入背景

**核实结果：✅ 成立（架构限制）**

`crane-animation` 的 milestone 配置：
```js
'crane-animation': {
  milestones: {
    0.8: { revealSceneId: 'contact' }
  }
}
```

`presentEarlyCopy` 将**整个 scene host** 标记为可见：
```js
presentEarlyCopy(sceneId, reason) {
  this.earlyCopies.add(sceneId);
  this.visible.add(sceneId);   // ← 整个场景 DOM 变为可见
}
```

`SceneRuntimeDomShell.applyProjection` 中没有区分"文字层"和"背景层"的机制。early-copy 只能控制整个 host 的 `hidden` 属性，无法实现"先文字后背景"的分层淡入。

---

### Finding 10：education 的 title 现在还是 4 条分割线

**核实结果：✅ 成立**

`.enterprise-wide-stage`（education 继承相同布局结构）的 CSS（`source-copy.css:237-259`）：
```css
.enterprise-wide-stage {
  border-top: 1px solid var(--paper-rule, rgba(247, 237, 215, .18));
  border-bottom: 1px solid var(--paper-rule, rgba(247, 237, 215, .12));
}

.enterprise-wide-stage::before {
  content: "";
  position: absolute;
  inset: clamp(18px, 3vw, 44px) 0;
  border-top: 1px solid var(--paper-rule, rgba(247, 237, 215, .08));
  border-bottom: 1px solid var(--paper-rule, rgba(247, 237, 215, .08));
}
```

计算：
1. `.enterprise-wide-stage` 上边框
2. `.enterprise-wide-stage` 下边框
3. `.enterprise-wide-stage::before` 上边框
4. `.enterprise-wide-stage::before` 下边框

**共 4 条分割线**，与用户描述一致。

---

### Finding 11：contact 背景变成深色了

**核实结果：✅ 成立**

`contact-scene-player.js` 没有设置背景色。contact 场景的 host 被挂载到 shell 中，shell 的背景色来自 `SceneRuntimeDomShell.ensureShellStyles()`：
```css
[data-scene-shell] {
  background: #07110e;
}
```

原始 `#contact` 在 `index.html` 中的主题：`data-section-theme="light"`，背景应该是亮色（`#ede4d2` 系）。但运行时 shell 强制使用深色背景 `#07110e`，contact 场景没有覆盖此样式。

---

## 问题严重度汇总

| # | Finding | 严重度 | 根因 | 修复方向 |
|---|---------|--------|------|----------|
| 1 | hero→pattern 闪烁 | 🔶 中 | scene 过渡用静态图替代 live scene | 转场目标改为动态 scene 或优化 handoff |
| 2 | pattern→star-map 闪烁/拉伸 | 🔶 中 | shell 高度不确定 + scene 类型过渡 | 给 shell 加 `min-height: 100vh` |
| 3 | star-map→aod 不还原 | 🔴 高 | 运行时过渡与 AOD 内部过渡分离 | 需要 scene-play-transition 与内部过渡协同 |
| 4 | belief 80% 提前入场 | 🔶 中 | scene-play-transition 缺 clearEarlyCopy | 补全 clearEarlyCopy |
| 5 | figure2 phase1 无滚动视频 | 🔴 高 | 视频逻辑在 camera-expand 内耦合，无独立 video step | 重构视频驱动为真正的 scroll-scrub |
| 6 | figure2→brand ink 缺失 | 🔴 高 | 路由是 scene-play 不是 transition | 改为 transition 类型或内部触发过渡 |
| 7 | brand→figure3 双占 | 🔶 中 | figure3 overlay 未清理 + 单 visible 限制 | 清理 overlay + 修复 visible 集合 |
| 8 | services 背景深色 | 🔶 中 | services harness 强制 #07110e | 恢复为 #ede4d2 |
| 9 | crane→contact 80% 入场 | 🔶 中 | early-copy 只能控制整个 host | 需要分层可见性机制 |
| 10 | education 4 条分割线 | 🟢 低 | CSS 设计如此 | 按设计需求调整 |
| 11 | contact 背景深色 | 🔶 中 | contact harness 未设背景色 | 显式设置亮色背景 |

---

## 最优先修复项（按依赖排序）

1. **`Presentation.visible` 集合需要支持转场双可见**（影响 Findings 1, 2, 3, 7）
   - 在 `runTransitionAttempt` 期间，将 `to` 场景加入 `visible`
   - 或新增 `Presentation.presentTransition(from, to)` 方法

2. **`runScenePlayTransitionAttempt` 补 `clearEarlyCopy()`**（影响 Finding 4）
   - `SceneRuntimeCore.js:828` 前加 `this.presentation.clearEarlyCopy('scene-play-transition-committed')`

3. **figure2 路由改为 transition 类型**（影响 Finding 6）
   - `'figure2-animation'` 的 `kind: 'scene-play'` → 需要能在内部完成 ink sweep 后触发运行时 transition

4. **services / contact harness 背景色修复**（影响 Findings 8, 11）
   - `services-scene-player.js`：`#07110e` → `#ede4d2`
   - `contact-scene-player.js`：显式添加 `background: #ede4d2`

5. **shell 高度修复**（影响 Finding 2）
   - `SceneRuntimeDomShell.ensureShellStyles()` 中加 `min-height: 100vh`
