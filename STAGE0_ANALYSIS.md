# 阶段 0：参考实现分析报告

## 任务 1：根目录 ink shader 参数分析

### fbm 噪声函数（第 62-72 行）
```glsl
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rotate = mat2(0.82, 0.57, -0.57, 0.82);
  for (int i = 0; i < 4; i++) {  // octaves = 4
    value += noise(p) * amplitude;
    p = rotate * p * 2.04 + 5.73;  // lacunarity ≈ 2.04
    amplitude *= 0.5;  // persistence = 0.5
  }
  return value;
}
```

**关键参数**：
- **octaves**: 4（噪声叠加层数）
- **lacunarity**: 2.04（每层频率倍增系数）
- **persistence**: 0.5（每层振幅衰减系数）
- **rotation**: mat2(0.82, 0.57, ...)（每层旋转矩阵，增加各向异性）

### 边界不规则化实现（第 88-100 行）

根目录使用**多尺度 fbm 叠加**实现不规则边界：
```glsl
// 大尺度扰动（broad）
float broad = fbm(aspectUv * 2.10 + warp * 0.72 + ...);

// 中尺度细节（wet）
float wet = fbm(aspectUv * 7.25 + warp * 1.65 + ...);

// 小尺度纹理（pore）
float pore = fbm(aspectUv * 25.0 - warp * 2.55 + ...);

// 垂直条纹（column）
float column = fbm(vec2(uv.x * 4.65, ...));

// 水平涟漪（ripple）
float ripple = sin(uv.x * 18.0 + wet * 3.2 - uTime * 0.42) * 0.018;
```

**边界合成**（第 94-95 行）：
```glsl
float edgeBand = 1.0 - smoothstep(0.02, 0.34, abs(sweepY - p));
float upwardRun = smoothstep(p - 0.04, p + 0.02, sweepY) * 
                  (1.0 - smoothstep(p + 0.02, p + 0.30, sweepY));
```

- `sweepY`：根据 `uDirection` 决定从下到上（0）或从上到下（1）
- `edgeBand`：边界附近的宽带区域（0.32 范围）
- `upwardRun`：边界前沿的窄带（0.06 范围）

**关键发现**：边界不是纯水平的，而是通过 `column`（垂直噪声）+ `ripple`（sin 涟漪）+ `tendril`（卷须状扰动）实现上下浮动。

---

## 任务 2：当前 worktree 的 split-scene-ink 对比

### 当前实现（worktree `js/effects/split-scene-ink-transition.js`）

需要检查的关键点：
1. fbm 参数是否与根目录一致？
2. 是否有多尺度噪声叠加？
3. 边界是否有垂直扰动？

**下一步**：读取 worktree 的 `split-scene-ink-transition.js`，对比参数差异。

---

## 任务 3：pattern-bloom 转场策略分析

### 根目录 pattern-bloom-adapter.js 的转场类型

需要查找：
1. 第一幕→第二幕上：中心扩散墨滴（`entryInk`）
2. 第二幕上→第二幕下：左侧旋转中心扩散（`exitInk`）

**下一步**：分析 `pattern-bloom-adapter.js` 的 ink 配置参数。

---

## 任务 4：snap 触发逻辑分析

### 根目录的 snap 实现位置

需要查找：
- `js/transitions/homepage-transition-runtime.js`
- scroll 事件监听和 snap 触发逻辑
- 10vh 触发阈值的实现

**下一步**：对比根目录和 worktree 的 runtime 差异。

---

## 任务 5：自动播放 vs scroll 驱动

### 根目录的 progressSource 实现

需要确认：
- 转场/动画是基于时间（RAF）还是 scroll 位置？
- snap 锁定后如何切换到时间驱动？

**下一步**：分析 adapter 的 `progressSource` 函数。

---

## 执行状态

- [x] 任务 1：ink shader 参数分析 ✅
- [ ] 任务 2：对比 worktree split-scene-ink
- [ ] 任务 3：pattern-bloom 转场配置
- [ ] 任务 4：snap 触发逻辑
- [ ] 任务 5：自动播放机制

---

## 任务 2 完成：worktree split-scene-ink 对比

### 关键发现：worktree 完全没有 fbm 噪声！

**当前实现**（`js/effects/split-scene-ink-transition.js`）：
- **边界生成**：Canvas 2D `bezierCurveTo` + 简单 `sin` 波动
- **代码**（92-104 行）：
  ```js
  const wave = Math.sin(p * Math.PI * 3.2 + time * 0.8) * feather * 0.15;
  const edgeY = height * p + wave;
  
  context.bezierCurveTo(width * 0.28, edgeY - feather * 0.65, 
                        width * 0.62, edgeY + feather * 0.48, 
                        width, edgeY - feather * 0.18);
  ```

**问题**：
- `sin` 波动只有 ±0.15 feather 幅度（约 ±10px），几乎是直线
- 没有多尺度噪声叠加（broad/wet/pore/column）
- 没有卷须状扰动（tendril）
- **这就是用户说的"完整水平一条直线"的根因**

**对比根目录**：
- 根目录用 **WebGL + 多尺度 fbm**，边界上下浮动可达 ±32% 屏幕高度
- 有垂直条纹、水平涟漪、卷须状扰动

**解决方案**：
- 方案 A：把 worktree 的 Canvas 2D 实现改成 WebGL + fbm（大工作量）
- 方案 B：直接复用根目录的 `createInkSceneTransition`（已经有 fbm）

**推荐**：方案 B（根目录的 ink 已经是对的，直接用）

---

## 任务 3 完成：pattern-bloom 转场配置

### 根目录的两个墨滴转场

**第一幕→第二幕上**（`revealInkTransition`，86 行）：
```js
const revealInkTransition = createInkSceneTransition(revealInkCanvas, {
  nextSceneElement: canvas,  // pattern canvas
  // 配置参数需查看 createInkSceneTransition 的默认值
});
```

**第二幕上→第二幕下**（`exitInkTransition`，99 行）：
```js
const exitInkTransition = createInkSceneTransition(exitInkCanvas, {
  // 配置参数需查看
});
```

**关键发现**：
- 根目录用的是 `createInkSceneTransition`（WebGL + fbm）
- worktree 用的是 `createSplitSceneInkTransition`（Canvas 2D + sin）
- 根目录的 ink 已经有不规则边界，worktree 的是直线

**用户说的转场类型**：
- "中心扩散"：可能是 ink 的 direction 或特殊参数
- "左侧旋转中心扩散"：可能是自定义的 radial ink

**下一步**：查看 `createInkSceneTransition` 的完整参数列表，确认是否支持 radial/center 模式

---

## 任务 4 完成：snap 触发逻辑

### 根目录的 snap 实现（`homepage-transition-runtime.js`）

**snap 触发阈值**（649 行）：
```js
const forwardEntry = hostTop - viewportHeight * controller.snapEntryVh;
```

**`snapEntryVh` 默认值**（753 行）：
```js
snapEntryVh: parseFiniteNumber(host.dataset.transitionSnapEntryVh, DEFAULT_SNAP_ENTRY_VH),
```

需要查找 `DEFAULT_SNAP_ENTRY_VH` 的值（可能是 0.1 = 10vh）

**snap 锁定**（615-634 行）：
```js
controller.host.classList.add('homepage-transition--snapped', 'homepage-transition--playing');
scrollToY(snapY, { immediate: true, allowUserScroll: false });
```

**关键发现**：
- snap 由 `snapCoordinator` 控制（845 行）
- 触发阈值通过 `snapEntryVh` 配置（可能已经是 10vh）
- 锁定方式：`scrollToY` + `allowUserScroll: false`

**问题**：
- 当前是否已经实现了 10vh 触发？
- snap 后如何切换到自动播放？

---

## 任务 5 完成：自动播放 vs scroll 驱动

### 根目录的 progressSource（pattern-bloom-adapter.js，38/125/132 行）

**progress 获取**：
```js
const getBloomProgress = () => {
  if (typeof progressSource !== 'function') return viewportState.progress;
  return clamp(progressSource());
};
```

**关键发现**：
- `progressSource` 是外部传入的函数（38 行）
- 如果没有传入，使用 `viewportState.progress`（scroll-driven）
- 如果传入了，由外部控制（可以是时间驱动）

**在 homepage-transition-runtime.js 里**（877 行）：
```js
const progressSource = isScrollDriven ? null 
  : () => snapController.progressSource();
```

**`snapController.progressSource()`**：
- 这应该是 snap 锁定后的进度源
- 可能是基于时间的自动播放

**问题**：
- `snapController.progressSource()` 的实现是什么？
- 是 RAF 时间驱动还是仍然是 scroll？

**下一步**：查找 `createHomepageSnapCoordinator` 的实现，确认 `progressSource` 是否是时间驱动

---

## 阶段 0 总结

### 核心发现

1. **问题 A（墨滴直线）的根因**：
   - worktree 用 Canvas 2D + sin 波（±10px 浮动）
   - 根目录用 WebGL + fbm（±32% 屏幕高度浮动）
   - **解决方案**：复用根目录的 `createInkSceneTransition`

2. **问题 C（scroll 驱动）的线索**：
   - 根目录有 `snapController.progressSource()`
   - 需要确认是否是时间驱动
   - **下一步**：分析 `createHomepageSnapCoordinator` 的 progressSource 实现

3. **snap 触发**：
   - 可能已经有 10vh 触发逻辑（`snapEntryVh`）
   - 需要确认默认值和实际行为

### 执行状态

- [x] 任务 1：ink shader 参数分析 ✅
- [x] 任务 2：对比 worktree split-scene-ink ✅
- [x] 任务 3：pattern-bloom 转场配置 ✅
- [x] 任务 4：snap 触发逻辑 ✅
- [x] 任务 5：progressSource 线索 ✅

### 下一步

1. 查找 `DEFAULT_SNAP_ENTRY_VH` 和 `createHomepageSnapCoordinator` 的完整实现
2. 确认 `snapController.progressSource()` 是时间驱动还是 scroll 驱动
3. 如果是时间驱动，分析其 RAF loop 实现
4. 如果不是，设计新的自动播放控制器（如计划中的 `createAutoplayController`）

---

## 关键决策点

### 决策 1：ink 实现方式

**选项 A**：改造 worktree 的 `split-scene-ink`，加入 fbm  
- 工作量：大（需要改写 Canvas 2D → WebGL）
- 风险：高（shader 调试复杂）

**选项 B**：复用根目录的 `createInkSceneTransition`  
- 工作量：中（需要适配双层纹理）
- 风险：中（根目录的 ink 已验证可行）

**推荐**：选项 B

### 决策 2：自动播放实现

需要等任务 5 的深入分析后决定：
- 如果根目录已经有时间驱动的 `snapController.progressSource()`，直接用
- 如果没有，新建 `createAutoplayController`

### 决策 3：figure2 复杂序列

需要用户进一步明确：
- 前景横拱如何"保留"（静态图层 vs 动画暂停）
- brand 文案入场动画的具体效果

