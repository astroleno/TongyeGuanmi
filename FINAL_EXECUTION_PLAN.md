# Homepage Transition Refactor - 最终执行计划

## 前情：之前的错误方向已废弃

- ❌ `EXECUTION_PLAN_UPDATED.md` - 路线错误，已废弃
- ❌ `STAGE1_PROGRESS.md` - "直接替换 ink import"，不可行
- ❌ `ARCHITECTURE_REFACTOR_PLAN.md` - "新建 autoplay-controller"，重复造轮子
- ✅ `PLAN_CORRECTION.md` - 抓到了核心根因，但执行细节需调整

## 核心根因（已确认）

1. **progress-window 绕开 snap/autoplay**：runtime 有 snap coordinator，但被配置跳过
2. **根目录 ink 不支持任意 DOM**：只能接 canvas/video/img，不能吃 div/section
3. **采样源不是完整一屏**：当前是局部 selector（.belief-copy-wrap/.layer-stack）
4. **文案重复是双 owner 竞争**：receiver clone + native section 同时可见

## 修正后的架构方向

**不做通用 html2canvas scene capture**（项目没有 html2canvas，DOM screenshot 不可靠）

**改为分层策略**：
- **media 场景**（canvas/video）→ WebGL ink texture
- **文案/普通 DOM**（div/section）→ DOM projection（但必须是完整 100vh）
- **墨滴边界**：同一个不规则 mask/edge 同步驱动 WebGL 层和 DOM projection 层

---

## 阶段 1：定义每一幕的完整场景（只写文档，不写代码）

**目标**：生成 `SCENE_DEFINITIONS.md`，列清楚每个转场的：
- 上一幕的完整 100vh owner（DOM 元素）
- 下一幕的完整 100vh owner
- 动画 owner（如果有）
- 文案 owner（native section 还是独立层）
- 入场/出场方式

**模板**：
```markdown
### 转场 1：hero → pattern-lotus（第一幕 → 第二幕上）

**上一幕（hero）**：
- 完整场景：`section#home`（100vh，包含 hero 文案 + 背景）
- 场景类型：DOM（普通 section）
- 采样方式：DOM projection（全屏 clone）

**下一幕（pattern-lotus）**：
- 完整场景：`.pattern-bloom-transition__stage`（100vh canvas）
- 场景类型：canvas
- 采样方式：WebGL texture

**转场类型**：中心扩散墨滴（自动播放）
**触发时机**：滚动到转场容器 10vh
**转场时长**：2s
**文案入场**：无（hero 文案在上一幕，pattern 无文案）
```

**任务**：
1. 为 14 个转场逐个填写（参考用户明确的转场清单）
2. 特别标注 aod/figure3/crane 的"文案提前入场"
3. 标注 figure2 的 5 步复杂序列

**产出**：`SCENE_DEFINITIONS.md`（提交给用户审核）

---

## 阶段 2：启用 snap/autoplay（修改配置，不造新轮子）

**目标**：让 runtime 现有的 snap coordinator 生效

### 2.1 修改 section-manifest.mjs

**文件**：`src/section-manifest.mjs`

**改动**：
```js
// 之前（line 91+）
{ 
  id: 'aod', 
  mode: 'progress-window',  // ❌ 这会绕开 snap
  scrollHeight: '140vh',
  ...
}

// 改为
{
  id: 'aod',
  mode: 'snap-autoplay',  // ✅ 启用 snap + RAF autoplay
  snapTrigger: 0.1,        // 10vh 触发
  playDuration: 2000,      // 2s 自动播放
  scrollHeight: '100vh',   // 满屏
  ...
}
```

**对象**：所有转场和动画 section（AOD/Figure2/Figure3/TTG/PH/Crane）

### 2.2 修改 runtime 分支逻辑

**文件**：`js/transitions/homepage-transition-runtime.js`

**改动**（line 930 附近）：
```js
// 之前
const isScrollDriven = runtimeMode === 'progress-window' || reducedMotion || ...;

// 改为
const isScrollDriven = runtimeMode === 'scroll-scrub' || reducedMotion;  // 只有明确 scroll-scrub 才是 scroll-driven
```

**关键**：让 `runtimeMode === 'snap-autoplay'` 时，创建 snapController

### 2.3 验证

**方式**：
1. 启动 dev server，打开控制台
2. 滚动到 aod 转场容器 10vh 处
3. 检查：
   - `document.documentElement.classList` 是否包含 `homepage-transition-snap-active`
   - 滚动是否被锁定（无法继续滚动）
   - 转场是否自动播放（2s）
   - 播放完成后是否释放锁定

**Commit**：`fix(runtime): enable snap/autoplay by changing progress-window to snap-autoplay`

---

## 阶段 3：分层 ink 架构（media texture + DOM projection + shared mask）

### 3.1 理解当前 split-scene-bridge 的架构

**当前逻辑**（`split-scene-bridge.js`）：
- 创建两个 projection layer（previous + next）
- 用 Canvas 2D ink 画简单 sin 边界
- clip-path 控制两个 layer 的可见区域

**问题**：
- projection 是局部 selector（不是完整 100vh）
- ink 边界是直线（没有 fbm 噪声）

### 3.2 新架构设计

**三层结构**：
1. **bottom layer**：previous scene projection（完整 100vh DOM clone）
2. **middle layer**：WebGL ink canvas（media texture + fbm 边界）
3. **top layer**：next scene projection（完整 100vh DOM clone）

**ink 边界同步**：
- WebGL canvas 渲染 media texture（如果有）+ fbm mask
- 同时输出 mask 数据到 dataset：`canvas.dataset.inkMaskPath`
- 两个 DOM projection 用同一个 mask 的 clip-path

### 3.3 实现步骤

#### 步骤 1：修改 split-scene-bridge 的 projection 采样源

**之前**（局部 selector）：
```js
previous: { 
  kind: 'domProjection', 
  element: beliefSource  // .belief-copy-wrap（局部）
}
```

**改为**（完整场景）：
```js
previous: {
  kind: 'domProjection',
  element: document.querySelector('section#belief')  // 完整 section（100vh）
}
```

**依据**：阶段 1 的 `SCENE_DEFINITIONS.md` 定义的 full-scene owner

#### 步骤 2：引入根目录 ink 的 fbm shader

**不做**：直接替换 `split-scene-ink-transition.js`

**做**：提取根目录 ink 的 fbm 边界生成逻辑，创建 `fbm-mask-generator.js`：
```js
export function createFbmMaskGenerator(canvas, { direction = 'down' }) {
  // WebGL context + fbm shader（从根目录 ink 提取）
  return {
    render(progress) {
      // 渲染 fbm 边界到 canvas
      // 输出 mask path 到 dataset
      canvas.dataset.inkMaskPath = generateSVGPath(edgePoints);
    }
  };
}
```

#### 步骤 3：同步 DOM projection 的 clip-path

**在 split-scene-bridge 的 update 里**：
```js
const maskPath = inkCanvas.dataset.inkMaskPath;
if (maskPath) {
  previousProjection.layer.style.clipPath = `path('${maskPath}')`;
  nextProjection.layer.style.clipPath = invertPath(maskPath);
}
```

#### 步骤 4：media texture 场景的特殊处理

**如果 previous/next 是 canvas/video**（如 pattern/figure2/ttg）：
```js
if (previous.kind === 'canvasTexture') {
  // 用 WebGL 渲染 previous canvas 到 ink canvas 的下半部分
  // fbm 边界直接在 shader 里 blend
}
```

**Commit**：`refactor(ink): split-layer architecture with fbm mask + DOM projection`

---

## 阶段 4：删除 receiver/native 双文案竞争

### 4.1 分析当前 receiver 的用途

**文件**：搜索所有 `createHandoffReceiver` 调用

**用途**：
1. **文案 clone**：把 native section 文案 clone 到转场容器（❌ 导致重复）
2. **早接收器**：aod/figure3/crane 的文案提前入场（✅ 有用，但实现方式要改）

### 4.2 新的文案入场策略

**转场期间**（所有转场）：
- native section 文案隐藏：`section.classList.add('homepage-transition-copy-hidden')`
- CSS：`.homepage-transition-copy-hidden .chapter-intro { opacity: 0; pointer-events: none; }`

**文案提前入场**（aod/figure3/crane）：
- 不用 receiver clone
- 动画播放到 80% 时，直接控制 native section 文案的 opacity/transform：
  ```js
  if (animationProgress >= 0.80) {
    targetSection.classList.remove('homepage-transition-copy-hidden');
    const copyOpacity = smoothStep(range01(animationProgress, 0.80, 0.95));
    targetSection.querySelector('.chapter-intro').style.opacity = copyOpacity;
  }
  ```

### 4.3 修改 adapter

**文件**：
- `aod-homepage-adapter.js`
- `figure3-homepage-adapter.js`
- `crane-homepage-adapter.js`

**改动**：
- 删除 `createHandoffReceiver` 调用
- 在动画 render loop 里，根据 progress 控制 native section 文案

**Commit**：`fix(copy): remove receiver clone, use native section with timing control`

---

## 执行顺序

1. **阶段 1**（定义场景）→ 生成 `SCENE_DEFINITIONS.md` → **你审核确认**
2. **阶段 2**（启用 snap）→ 修改 manifest + runtime → 验证 snap 锁定生效
3. **阶段 3**（分层 ink）→ fbm mask + DOM projection → 验证墨滴边界 + 完整场景
4. **阶段 4**（单一文案）→ 删除 receiver → 验证不重复

每个阶段独立 commit + 验证。

---

## 风险控制

- **阶段 1 必须先做**：场景定义不清楚，后面改不动
- **阶段 2 是最小改动**：只改配置和分支，风险低
- **阶段 3 是核心重构**：分层架构，需要充分验证
- **阶段 4 是清理**：删除 receiver，可能影响其他功能（需要确认 receiver 是否还有其他用途）

---

## 与旧计划的对比

| 旧计划（废弃） | 新计划（正确） |
|---|---|
| "复制根目录 ink" | 提取 fbm mask 生成逻辑，不直接复制 |
| "html2canvas scene capture" | 不做 DOM screenshot，用 DOM projection + clip-path |
| "新建 autoplay-controller" | 启用现有 snap coordinator |
| "receiver start 0.80" | 删除 receiver，直接控制 native section |

---

## 当前状态

- ✅ 核心根因已明确
- ✅ 架构方向已确定（分层 + shared mask）
- ⏳ 等待用户确认后执行阶段 1

---

## 下一步

@用户 确认：
1. 这个最终执行计划是否可以开始？
2. 我现在开始阶段 1（生成 SCENE_DEFINITIONS.md），列出所有转场的场景定义？
3. 还有其他需要调整的吗？
