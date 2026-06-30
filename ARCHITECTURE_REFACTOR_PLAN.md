# Homepage Transition Architecture Refactor Plan

## 目标
按照用户明确的策略，重构转场和动画架构，解决 20 条 findings 中的架构级根因。

## 核心策略（用户已明确）

### 转场策略
- **触发**：滚动进入 10vh 后触发自动播放
- **锁定**：触发后 snap 锁定滚动
- **播放**：自动播放转场动画（时间驱动，非 scroll 驱动）
- **释放**：转场完成后释放 snap
- **满屏**：所有转场容器都是满屏 100vh

### 动画策略（aod/figure3/crane）
- **触发**：转场完成后，滚动进入动画容器 10vh 触发
- **锁定**：触发后 snap 锁定
- **播放**：自动播放动画（时间驱动）
- **文案入场**：动画剩 20% 时文案入场（参考 hero 文案方式）
- **释放**：动画完成后释放 snap
- **注意**：动画不提前消失，文案入场不影响动画播放

### 转场清单

| 序号 | 从 | 到 | 转场类型 | 备注 |
|---|---|---|---|---|
| 1 | 第一幕 hero | 第二幕上 pattern | 中心扩散墨滴（自动播放） | 现有 pattern-bloom entryInk |
| 2 | 第二幕上 pattern | 第二幕下 belief-star | 左侧旋转中心扩散墨滴（自动播放） | 现有 pattern-bloom exitInk |
| 3 | 第二幕下 belief | aod | 下→上水平不规则墨滴 | split-scene-bridge |
| 4 | aod | method 文案 | 无转场（文案提前入场） | early receiver |
| 5 | method 文案 | figure2 | 下→上水平不规则墨滴 | split-scene-bridge |
| 6 | figure2 | brand 上部文案 | 复杂序列（见下） | - |
| 7 | brand 文案 | figure3 | 下→上水平不规则墨滴 | split-scene-bridge |
| 8 | figure3 | services 文案 | 无转场（文案提前入场） | early receiver |
| 9 | services 文案 | ttg | 下→上水平不规则墨滴 | split-scene-bridge |
| 10 | ttg | lab 文案 | 上→下水平不规则墨滴 | split-scene-bridge |
| 11 | lab 文案 | ph | 左侧太阳放射扩散墨滴 | split-scene-bridge (radial) |
| 12 | ph | education 文案 | 上→下水平不规则墨滴 | split-scene-bridge |
| 13 | education 文案 | crane | 下→上水平不规则墨滴 | split-scene-bridge |
| 14 | crane | contact 文案 | 无转场（文案提前入场） | early receiver |

### figure2 复杂序列（序号 6）
跨 figure2 动画 + brand section，分 5 步：
1. figure2 远景扩散（动画阶段1）
2. 保留前景模糊横拱 + brand 上半文案淡入（参考 hero 文案入场）
3. 保留前景模糊横拱 + brand 下半文案淡入（整屏，参考 hero）
4. 前景横拱 + 所有文案一起做下→上墨滴转场消失
5. 接到 brand 解释文案（method-brand section）

**关键点**：
- 前景横拱在步骤 2-4 保持静态模糊
- brand 上下文案参考 `/Users/aitoshuu/Downloads/tongyeme 2/index.html` 122-128 行
- figure2 动画实现参考根目录 main 分支

---

## 执行阶段

### 阶段 0：准备工作（只读分析）
**目标**：理解现有架构和 main 分支参考实现

**任务**：
1. 切换到根目录 main 分支，查看：
   - pattern-bloom 的中心扩散 + 左侧旋转扩散墨滴实现
   - 墨滴边界的不规则程度（噪声参数）
2. 查看 `/Users/aitoshuu/Downloads/tongyeme 2/index.html` 122-128 行的 brand 文案结构
3. 分析 ph 背景图 `/Users/aitoshuu/.../assets/ph_background.png` 的太阳位置（最亮处坐标）
4. 梳理当前 homepage-transition 的 snap 触发逻辑（在哪个文件？如何触发？）
5. 梳理当前动画的 progressSource（时间驱动 vs scroll 驱动）

**产出**：
- `REFERENCE_ANALYSIS.md`（main 分支参考点）
- `CURRENT_ARCHITECTURE.md`（当前 snap/progress 架构）

### 阶段 1：修正 receiver 时序（解决问题 D）
**影响文件**：
- `js/transitions/homepage/figure3-homepage-adapter.js`
- `js/transitions/homepage/crane-homepage-adapter.js`
- `js/transitions/homepage/aod-homepage-adapter.js`（如果有 receiver）

**修改**：
```js
// figure3
const receiverOpacity = servicesReceiver?.update(progress, {
  start: 0.80,  // 从 0.22 改为 0.80（动画剩 20% 时入场）
  end: 0.98,    // 调整 end 确保动画播完时文案完全显示
  // ...
});

// crane
const RECEIVER_TIMING = Object.freeze({
  start: 0.80,  // 从 0.22 改为 0.80
  end: 0.98,
  restoreAt: 1.1,
  liftPx: 10
});
```

**验证**：动画不再提前消失，文案在最后 20% 入场

### 阶段 2：修复文案重复（解决问题 E）
**影响文件**：所有 `*-homepage-adapter.js` 里的 `createHandoffReceiver` 调用

**修改**：
```js
createHandoffReceiver({
  // ...
}).update(progress, {
  // ...
  restoreAt: 1.05  // 确保转场完全结束后才恢复原 DOM
});
```

**关键**：在 receiver active 期间，真实 section 应该被隐藏（opacity: 0 或 visibility: hidden）

**验证**：method/brand/services/lab/education 文案不再出现两次

### 阶段 3：重构自动播放架构（解决问题 C）
**这是最大的改动，需要新建或修改核心模块**

#### 3.1 新建 `js/utils/autoplay-controller.js`
```js
export function createAutoplayController({
  duration = 2000,
  onProgress = (p) => {},
  onComplete = () => {}
}) {
  let startTime = null;
  let raf = null;
  let playing = false;
  let progress = 0;

  const tick = (now) => {
    if (!startTime) startTime = now;
    progress = Math.min((now - startTime) / duration, 1);
    onProgress(progress);
    if (progress < 1) {
      raf = requestAnimationFrame(tick);
    } else {
      playing = false;
      onComplete();
    }
  };

  return {
    start() {
      if (playing) return;
      playing = true;
      startTime = null;
      raf = requestAnimationFrame(tick);
    },
    stop() {
      playing = false;
      if (raf) cancelAnimationFrame(raf);
    },
    get progress() { return progress; },
    get playing() { return playing; }
  };
}
```

#### 3.2 修改所有转场 adapter 的 progressSource
**当前**：`progressSource` 返回 scroll-based progress  
**改为**：
```js
const transitionAutoplay = createAutoplayController({
  duration: 2000, // 转场时长
  onProgress: (p) => {
    // 驱动 bridge/ink 渲染
  },
  onComplete: () => {
    // 释放 snap
  }
});

// 在 scroll 触发逻辑里
if (scrollY > triggerPoint && !transitionAutoplay.playing) {
  snapScroll(); // 锁定滚动
  transitionAutoplay.start();
}
```

#### 3.3 修改动画 adapter（aod/figure3/crane）
同样用 `createAutoplayController`，但在转场完成后触发

**验证**：所有转场和动画变成时间驱动，不再跟随 scroll

### 阶段 4：snap 触发和高度（解决问题 B）
**影响文件**：
- 所有 `*-homepage-adapter.js`
- `css/components/homepage-transitions.css`

#### 4.1 统一转场容器高度为 100vh
```css
.homepage-transition {
  height: 100vh;
  min-height: 100vh;
  /* 移除 calc(var(--homepage-transition-snap-height, 100dvh) + ...) */
}
```

#### 4.2 10vh 触发逻辑
```js
// 伪代码
const triggerThreshold = window.innerHeight * 0.1; // 10vh
if (transitionTop < triggerThreshold && !triggered) {
  triggered = true;
  snapAndPlayTransition();
}
```

**验证**：所有转场都是满屏，滚动 10vh 后触发

### 阶段 5：墨滴边界不规则化（解决问题 A）
**影响文件**：
- `js/effects/split-scene-ink-transition.js`（shader 参数）
- 参考 main 分支的 pattern-bloom ink 实现

#### 5.1 调整 fbm 参数
```glsl
// 增加 octaves，降低 lacunarity，让边界更破碎
float noise = fbm(uv * scale, 5, 2.4, 0.42); // 当前可能 (uv, 2, 2.0, 0.5)
```

#### 5.2 添加垂直扰动
```glsl
float horizontalBoundary = progress; // 当前是纯水平
float disturbedBoundary = progress + noise * 0.08; // 上下浮动 ±8%
```

**验证**：转场边界从直线变成不规则近似水平

### 阶段 6：lab→ph 放射转场
**影响文件**：
- `js/transitions/homepage/ph-homepage-adapter.js`
- 可能需要修改 `split-scene-bridge` 或新建 radial 变体

#### 6.1 定位 ph 背景太阳中心
从 `ph_background.png` 提取最亮处坐标（静态值）

#### 6.2 修改 split-scene-ink shader 支持 radial
```glsl
uniform vec2 uRadialCenter; // (x, y) 归一化坐标
float radialDist = distance(uv, uRadialCenter);
float radialProgress = smoothstep(0.0, 1.0, progress - radialDist);
```

**验证**：lab→ph 转场从左侧太阳中心放射扩散

### 阶段 7：figure2 复杂序列
**这是最复杂的一块，可能需要单独的控制器**

**影响文件**：
- `js/components/figure2-transition.js`
- 新建 `js/transitions/homepage/figure2-brand-sequence.js`

#### 7.1 figure2 组件支持阶段控制
```js
figure2Controller.playTo('farExpanded'); // 播到远景扩散完成
// 此时保持前景横拱静态
```

#### 7.2 brand 文案分两次入场
参考 hero 文案的 `setBeliefTransitionState` 实现

#### 7.3 前景横拱 + 文案墨滴转场
把横拱图层和文案 DOM 都接入 split-scene-ink 的 `previousProjection`

**验证**：figure2→brand 序列完整，前景横拱保留到步骤4

---

## 预期成果

执行完所有阶段后：
- **问题 A**（墨滴直线）✅ 阶段 5
- **问题 B**（snap 不到位）✅ 阶段 4
- **问题 C**（scroll 驱动）✅ 阶段 3
- **问题 D**（动画提前退场）✅ 阶段 1
- **问题 E**（文案重复）✅ 阶段 2

20 条 findings 预期解决：
- 1-4, 7-8, 10-11, 13-14, 16, 19：阶段 3+4+5（转场架构）
- 5, 11（aod/figure3 scroll 驱动）：阶段 3
- 6, 9, 12, 20（文案重复）：阶段 2
- 6-10（figure2 序列）：阶段 7
- 15, 17（CSS 双线）：低优先级
- 18（空白）：CSS 微调

---

## 风险和依赖

1. **阶段 0 必须先做**：需要理解 main 分支的参考实现
2. **阶段 3 是核心**：影响所有后续阶段，必须先验证可行性
3. **figure2 序列（阶段 7）复杂度高**：可能需要迭代调整
4. **snap 逻辑可能与现有 runtime 冲突**：需要确认是否与 scroll-rewriting 机制兼容

---

## 执行前确认

@用户 请确认：
1. 这个计划的阶段顺序是否合理？
2. 是否需要我先执行阶段 0（只读分析 main 分支）？
3. figure2 复杂序列是否可以简化，或者你有更具体的实现思路？
4. ph 背景太阳坐标我会静态写死，是否接受？（如果 ph 背景图更新，坐标需要手动调整）
