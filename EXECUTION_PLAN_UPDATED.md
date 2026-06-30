# Homepage Transition Refactor - 执行计划（基于阶段 0 分析）

## 阶段 0 分析结论

### 决策 1：墨滴边界 → 复用根目录的 ink（选项 B）
- worktree 的 `split-scene-ink` 只有 Canvas 2D + sin（±10px 浮动）
- 根目录的 `createInkSceneTransition` 有 WebGL + fbm（±32% 浮动）
- **执行**：删除 worktree 的 `split-scene-ink`，改用根目录的 ink，做成可复用组件

### 决策 2：自动播放 → 根目录已有 RAF 时间驱动
- 根目录的 `animateProgress` 是完整的 RAF loop（417-447 行）
- snap 后通过 `controller.playhead` 驱动进度（时间驱动，非 scroll）
- **执行**：迁移根目录的 snap coordinator + animateProgress 逻辑

### 决策 3：figure2 前景横拱 → nearArchLayer 独立图层
- figure2 有 `nearArchLayer`（CSS transform + blur）
- stage1 完成后（`cameraProgress` 达到目标），横拱已定型
- **执行**：figure2 stage1 完成后，保持 nearArchLayer 可见，叠加 brand 文案，再一起做墨滴转场

---

## 执行阶段（更新后）

### 阶段 1：迁移根目录的 ink（问题 A）

**文件操作**：
1. 复制 `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/effects/ink-scene-transition.js` → worktree
2. 删除 worktree 的 `js/effects/split-scene-ink-transition.js`
3. 修改所有 adapter 的 import

**关键改动**：
- 所有 `createSplitSceneInkTransition` → `createInkSceneTransition`
- 调整参数适配双层纹理（previousSceneElement + nextSceneElement）

**验证**：墨滴边界变成不规则近似水平

**Commit**：`refactor(ink): replace split-scene-ink with root ink-scene-transition (fbm)`

---

### 阶段 2：迁移 snap coordinator 自动播放（问题 C）

**文件操作**：
1. 分析根目录 `homepage-transition-runtime.js` 的核心函数：
   - `createHomepageSnapCoordinator`（208 行）
   - `animateProgress`（417 行）
   - `updateControllerState`（649 行）
2. 提取到 worktree，适配当前架构

**关键改动**：
- 10vh 触发：`snapEntryVh: 0.1`（根目录默认是 1.02，需要改）
- snap 后调用 `animateProgress(controller, direction, target, durationMs, onComplete)`
- `controller.playhead` 驱动转场进度（时间驱动）

**验证**：
- 滚动 10vh 触发 snap
- 转场自动播放（不再跟随 scroll）
- 播放完成后释放 snap

**Commit**：`feat(transition): migrate snap coordinator with RAF-driven autoplay`

---

### 阶段 3：修正 receiver 时序（问题 D）

**文件**：
- `js/transitions/homepage/figure3-homepage-adapter.js`
- `js/transitions/homepage/crane-homepage-adapter.js`
- `js/transitions/homepage/aod-homepage-adapter.js`

**改动**：
```js
// figure3
start: 0.80,  // 动画剩 20% 时文案入场

// crane
start: 0.80,

// aod（如果有 receiver）
start: 0.80,
```

**Commit**：`fix(receiver): adjust timing to 0.80 for late-entry copy`

---

### 阶段 4：修复文案重复（问题 E）

**根因**：receiver 的 `restoreAt` 时机不对，真实 section 和 receiver clone 同时可见

**改动**：所有 `createHandoffReceiver` 的 `restoreAt` 参数：
```js
restoreAt: 1.05  // 确保转场完全结束后才恢复原 DOM
```

**验证**：method/brand/services/lab/education 文案只出现一次

**Commit**：`fix(receiver): delay restoreAt to 1.05 to prevent copy duplication`

---

### 阶段 5：snap 高度和触发阈值（问题 B）

**CSS 改动**（`css/components/homepage-transitions.css`）：
```css
.homepage-transition {
  height: 100vh;
  min-height: 100vh;
}
```

**JS 改动**（各 adapter）：
```js
host.dataset.transitionSnapEntryVh = '0.1';  // 10vh 触发
```

**验证**：所有转场满屏，滚动 10vh 后触发

**Commit**：`fix(transition): enforce 100vh snap height and 10vh trigger`

---

### 阶段 6：figure2 复杂序列

**5 步实现**：
1. **stage1**：figure2 动画自动播放到 `cameraProgress = 1`（远景扩散完成，前景横拱定型）
2. **brand 上半文案入场**：叠加在 figure2 上方，参考 hero 文案淡入
3. **brand 下半文案入场**：整屏出现
4. **墨滴转场**：nearArchLayer + brand 文案一起做下→上墨滴消失
5. **接到 brand section**：显示 brand 解释文案

**关键**：
- figure2 stage1 完成后，**不销毁 nearArchLayer**，保持可见
- brand 文案用绝对定位叠加在 figure2 转场容器内
- 步骤 4 的墨滴转场，`previousSceneElement` 包含 nearArchLayer + 文案的合成 canvas

**Commit**：`feat(figure2): implement 5-stage sequence with nearArchLayer preservation`

---

### 阶段 7：lab→ph 放射转场

**ph 背景太阳坐标**：
- 分析 `assets/ph_background.png`，提取最亮处坐标（静态值）
- 预估：`{ x: 0.15, y: 0.40 }`（左侧偏上）

**ink shader 改动**（或新建 radial 变体）：
```glsl
uniform vec2 uRadialCenter; // (0.15, 0.40)
float radialDist = distance(uv, uRadialCenter);
float radialProgress = smoothstep(0.0, 1.5, progress * 1.5 - radialDist);
```

**Commit**：`feat(ph): add radial ink transition from sun center`

---

## 执行顺序

1. 阶段 1（ink 迁移）→ 阶段 3（receiver）→ 阶段 4（文案重复）→ **Commit + 验证**
2. 阶段 2（snap autoplay）→ 阶段 5（snap 高度）→ **Commit + 验证**
3. 阶段 6（figure2 序列）→ 阶段 7（ph 放射）→ **Commit + 验证**

每个阶段独立 commit，逐步验证。

---

## 风险控制

- 阶段 1-2 是核心，影响所有转场，优先做并充分验证
- 阶段 6 复杂度高，可能需要迭代调整
- 所有改动在当前分支 `fix/homepage-transition-ink-conflict`，不影响远程

---

## 开始执行

现在开始阶段 1：迁移根目录的 ink。
