# Shopify Editions Winter '26 滚动动画时序控制机制调研报告

**调研日期**: 2026-06-24
**调研对象**: https://www.shopify.com/editions/winter2026
**调研人**: 前端动画架构研究员
**关联项目**: 同野观幂（TongyeGuanmi）7 路由主页滚动转场系统

---

## 一、核心发现摘要

Shopify Editions Winter '26 网站并未采用 GSAP ScrollTrigger 或纯 CSS scroll-timeline 作为其核心滚动动画时序控制方案。相反，它使用了 **Rive 状态机 + Canvas 自定义渲染 + 滚动事件监听** 的混合架构，通过一个统一的 scroll progress 值来驱动所有视觉层（背景 Canvas、角色动画、内容转场）的时序。这种架构避免了「两套独立时间线」的问题，但也带来了与我们项目截然不同的技术权衡。

| 维度 | Shopify Editions Winter '26 | 同野观幂当前架构 |
|------|------------------------------|------------------|
| **核心动画引擎** | Rive (State Machine) + 自定义 Canvas/WebGL | GSAP + ScrollTrigger + 自定义 Canvas |
| **滚动平滑** | 未知（推测为原生或轻量自定义） | Lenis |
| **时序控制** | 单一 scroll progress → Rive input | Scroll-driven + Playback-driven 双轨 |
| **转场编排** | Rive State Machine 内嵌 blend | 自定义 handoff-receiver + section-presentation-controller |
| **Pin 机制** | 无（推测通过固定视口 Canvas 实现） | FIXED_STAGE_CLASS + stageHoldVh |
| **DOM 介入** | 极低（DOM 仅承载文本，动画在 Canvas） | 高（DOM 元素直接参与 transition） |

---

## 二、Shopify Editions 技术栈拆解

### 2.1 已确认的核心技术

根据多源技术博客的逆向工程分析（typed.sanitypress.dev、webgpu.com 等），该网站使用：

1. **React / Remix** — 前端框架，提供组件化基础与路由管理。
2. **Tailwind CSS** — 样式系统，用于文本排版和布局。
3. **Rive** — 驱动全部运动图形（角色、装饰元素、状态转场）。Rive 通过 WASM 在 Canvas 上渲染，绕过浏览器布局引擎，性能极佳。
4. **自定义 Canvas + Depth Maps** — 主背景为一张全屏 Canvas，使用 depth map 技术对 2D 图像进行伪 3D 位移，产生视差效果。
5. **自定义 WebGL / WebGPU** — 用于云、光晕、粒子等特效层，推测使用模块化 shader。

### 2.2 关键：不是 GSAP，也不是 CSS Scroll-Timeline

该网站没有使用 GSAP ScrollTrigger 的 `pin` 或 `scrub` 机制，也没有大规模使用 CSS `animation-timeline: scroll()`。其滚动动画时序控制的核心逻辑是：

**`scroll 事件 → 计算 scrollPercentage → 写入 Rive State Machine input → Rive 内部 blend 动画 → Canvas 渲染`**

这种模式与我们项目的 GSAP ScrollTrigger `scrub` 完全不同：
- **GSAP scrub**：scroll position 直接映射到 timeline 的 `progress` 属性，GSAP 逐帧更新 DOM 的 CSS 属性。
- **Rive 滚动同步**：scroll position 映射到一个数值型 input（如 `progress`），Rive 的 State Machine 根据 input 值在多个动画状态之间做 1D Blend，最终由 Canvas 渲染输出。

---

## 三、时序架构深度分析

### 3.1 单一时间线还是多时间线？

**结论：单一数据源（scroll progress），但分发到多个渲染层。**

Shopify Editions 的架构可以抽象为：

```
┌─────────────────────────────────────┐
│  单一数据源：scrollY (0 → max)      │
│  映射为全局 progress (0.0 → 1.0)    │
└──────────────┬──────────────────────┘
               │
       ┌───────┼───────┬──────────┐
       ▼       ▼       ▼          ▼
  ┌────────┐ ┌────┐ ┌────────┐ ┌──────────┐
  │Rive BG │ │Rive│ │Content │ │WebGL FX  │
  │Canvas  │ │Char│ │Reveal  │ │(Clouds)  │
  │(Depth  │ │Anim│ │(CSS)   │ │(Shaders) │
  │ Maps)  │ │    │ │        │ │          │
  └────────┘ └────┘ └────────┘ └──────────┘
```

关键特征：
- **不存在两套独立的「scroll timeline」和「playback timeline」**。所有的动画层都订阅同一个 `scrollPercentage`。
- Rive 的 State Machine 内部可能有多个 state（如 `idle`、`section-a`、`section-b`、`transition`），但它们的切换条件是同一个 `progress` input 的阈值，而不是一个独立的 playback timer。
- 这意味着：**transition 和 content reveal 由同一个 progress 值驱动，只是映射到不同的 state 或 animation layer**。

### 3.2 Transition 与 Content 的衔接方式

**推测的衔接模式：无缝 blend，而非硬切换。**

Rive 的 State Machine 支持 **Blend State（1D/2D Blend）**。当 `progress` input 从 0 变化到 100 时，State Machine 可以在两个 timeline 动画之间平滑插值：

```
State Machine 逻辑（推测）：

输入：scrollProgress (Number, 0-100)

状态树：
- Root
  - Blend 1D (基于 scrollProgress)
    - Timeline: "Section A Idle" (0-30)
    - Timeline: "A→B Transition" (25-45)  ← 重叠区域实现平滑过渡
    - Timeline: "Section B Content" (40-70)
    - Timeline: "B→C Transition" (65-85)
    - Timeline: "Section C Content" (80-100)
```

**关键洞察**：
- Transition 动画和 Content 动画不是「前后衔接」的，而是「重叠 blend」的。
- 在 `scrollProgress = 35` 时，可能 `30%` 是 Section A 的退场，`70%` 是 Section B 的进场，两者同时存在，由 Rive 的 blend 系统混合。
- 这避免了「transition 结束点必须精确等于 content 起始点」的刚性要求，因为两者在 state machine 中本就是连续过渡的。

### 3.3 是否有「空白间隙」「黑屏」「文字被吃掉」？

**根据公开观察：极少或没有。**

原因：
1. **Canvas 渲染的连续性**：Rive 在 Canvas 上连续渲染，不存在 DOM 元素的 `display: none` 或 `visibility: hidden` 切换导致的闪烁。
2. **Blend 重叠**：由于 transition 和 content 有重叠区间，即使 scroll 速度较快，也不会出现「上一节完全消失，下一节还没出现」的空白。
3. **Depth Map 视差的容错性**：背景 Canvas 使用 depth map，即使角色动画尚未完全到位，背景的伪 3D 位移也能提供持续的视觉填充。

### 3.4 Scroll Snap 与 Pin 机制

**推测：没有使用传统的 ScrollTrigger `pin: true`。**

Shopify Editions 的页面结构是一个「超长单页滚动」，但用户感知上像是在「浏览多个全屏 section」。这种效果可能通过以下方式实现：

1. **固定视口 Canvas**：整个页面背景是一个固定定位（`position: fixed`）的 Canvas，覆盖整个视口。scroll 只改变 Canvas 内渲染的内容，不改变 Canvas 的位置。因此不需要「pin」某个 section，因为真正在动的只有 scroll progress 这个数字。
2. **内容文字使用 sticky 或相对布局**：DOM 上的文本内容可能使用 `position: sticky` 或正常的文档流，但随着 scroll 的推进，文字内容通过 CSS `opacity` / `transform` 渐隐渐现。
3. **没有 scroll snap**：未观察到明显的 scroll snap 吸附感。滚动是自由的，Rive 的 blend 系统能够处理任意 intermediate scroll position。

---

## 四、关键的技术实现模式

### 4.1 Rive 滚动同步模式（已验证）

根据 Rive 社区的标准实践（malts.me、stackoverflow 等），Rive 与 scroll 的同步代码结构如下：

```javascript
// Rive 滚动同步标准模式
const r = new Rive({
  src: "/scene.riv",
  canvas: canvasElement,
  autoplay: true,
  stateMachines: "State Machine 1",
  onLoad: () => {
    stateMachineLoadInput = r.stateMachineInputs("State Machine 1")[0];
    stateMachineLoadInput.value = 0;
  },
});

window.addEventListener("scroll", () => {
  if (!stateMachineLoadInput) return;
  const scrollPercentage =
    (window.scrollY /
      (document.documentElement.scrollHeight - window.innerHeight)) * 100;
  stateMachineLoadInput.value = scrollPercentage;
}, { passive: true });
```

**与我们项目的对比**：
- 我们项目使用 GSAP ScrollTrigger 的 `scrub` 来直接控制 CSS 属性，Rive 模式则是通过状态机输入来间接控制动画。
- Rive 模式的优势：动画逻辑完全在 `.riv` 文件内，设计师可以直接在 Rive 编辑器中调整转场 timing，无需修改代码。
- Rive 模式的劣势：需要预先将所有动画状态（包括转场）构建在 Rive 文件中，灵活性不如代码驱动的 GSAP。

### 4.2 Depth Map 视差模式

Shopify Editions 使用 depth map 在 Canvas 中实现伪 3D：
- 一张 RGB 图像作为颜色层。
- 一张对应的灰度图作为 depth map，灰度值代表像素的「深度」。
- 根据 scroll progress 或鼠标位置，对 depth map 进行位移采样，实现不同「深度」的像素以不同速度移动，产生视差。

这种模式的优势：
- 不需要 3D 模型或 WebGL 复杂场景，只需要 2D 图像 + 一张灰度图。
- 性能极高，适合全屏背景。

### 4.3 DOM 与 Canvas 的分离

Shopify Editions 的架构中，DOM 只承载：
- 文本内容（标题、描述、CTA）
- 导航和链接
- 静态图片

所有「运动」都在 Canvas 中完成。DOM 文本的动画（如淡入淡出）可能使用最轻量的 CSS `animation-timeline: view()` 或简单的 IntersectionObserver + CSS class toggle。

这种分离避免了 DOM 和 Canvas 动画之间的时序竞争问题。

---

## 五、与我们项目的对比分析

### 5.1 我们项目的时序架构（基于代码分析）

通过分析 `js/transitions/homepage-transition-runtime.js`、`section-presentation-controller.js`、`handoff-receiver.js`，我们项目的架构为：

```
┌──────────────────────────────────────────────────────────┐
│  双数据源：                                               │
│  1. Scroll Position (window.scrollY)                     │
│  2. Playback Time (setTimeout / requestAnimationFrame)     │
└──────────────────┬───────────────────────┬───────────────┘
                   │                       │
         ┌─────────▼──────────┐  ┌───────▼────────┐
         │ Scroll-Driven       │  │ Playback-Driven │
         │ (scrub / progress)  │  │ (playhead / ms) │
         └─────────┬───────────┘  └───────┬─────────┘
                   │                       │
                   └───────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │  Handoff Controller  │
                    │  (transition runtime)  │
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │  Section Presentation│
                    │  (presented/active)  │
                    └──────────────────────┘
```

### 5.2 关键差异与问题根源

#### 差异 1：单一 vs 双数据源

- **Shopify**：所有动画层订阅同一个 `scrollPercentage`。不存在「playback 动画还没播完，但 scroll 已经滚到下一节」的冲突。
- **我们的项目**：`data-transition-drive="scroll"` 和 `data-transition-play-ms` 同时存在，`scroll-driven` 和 `playback-driven` 两套系统并行。当 scroll 速度与 playback 速度不匹配时，就会出现「文字被吃掉」「handoff 提前/滞后」的问题。

#### 差异 2：Transition 与 Content 的关系

- **Shopify**：在 Rive State Machine 中，transition 和 content 是同一个 blend 空间中的不同状态，有自然的重叠区间。不存在「transition 结束点必须精确等于 content 起始点」的刚性约束。
- **我们的项目**：`section-presentation-controller.js` 中，section 状态为 `transitioning-in` → `presented` → `active`。Transition 和 content 的衔接由 `handoff-receiver` 和 `data-entry-after-handoff` 等属性控制，需要精确的时机匹配。

#### 差异 3：Pin / Snap 机制

- **Shopify**：不需要 pin。固定 Canvas + 自由滚动即可。
- **我们的项目**：使用 `FIXED_STAGE_CLASS` 和 `stageHoldVh` 来在 transition 播放时固定 section，需要复杂的 `snapCoordinator` 来管理 scroll 位置的吸附和释放。这增加了时序的复杂度。

#### 差异 4：DOM 与动画的耦合

- **Shopify**：DOM 文本与动画层解耦。文本使用 CSS 或简单的 JS 控制，动画在 Canvas 中独立完成。
- **我们的项目**：DOM 元素（如 `.belief-copy-wrap`）被直接作为 `handoff-target` 或 `transition-ghost-scenes`，DOM 元素在 transition 过程中被移动（`handoff-receiver` 的 `adopt`/`restore` 机制），这导致 DOM 和动画之间的同步问题。

### 5.3 我们项目当前问题的可能成因

从 git log 中看到的最近修复：
- `fix: show belief copy during pattern bloom handoff`
- `fix: release homepage transition copy earlier`
- `fix: preserve homepage handoff text visibility`

这些 commit 指向一个共同问题：**transition 动画和 content reveal 的时序竞争**。

在双轨系统（scroll + playback）中，当：
1. Scroll 快速通过 transition 区域时，playback 可能还没完成。
2. `section-presentation-controller` 的 `markPresented` 和 `suppressEntryOnce` 逻辑与 scroll progress 不同步。
3. `handoff-receiver` 的 `adopt`/`restore` 导致 DOM 元素在错误的时间被移入/移出。

这正对应了调研中 Shopify Editions 通过「单一 progress + blend 重叠」避免的典型问题。

---

## 六、对我们的项目的启示与建议

### 6.1 短期修复（保持当前架构）

如果继续使用当前的双轨架构，建议：

1. **统一 progress 来源**：将 `scroll-driven` 和 `playback-driven` 统一到一个 `progress` 值。 Playback 不应独立计时，而应作为 scroll progress 的「插值平滑」或「延迟跟随」。
2. **引入重叠区间**：transition 的结束和 content 的开始不应是同一个时间点，而应有一个重叠区间（如 transition 退场到 80% 时，content 开始进场）。这可以通过调整 `data-entry-after-handoff` 和 `data-target-entry-policy` 的参数实现。
3. **简化 handoff-receiver**：避免在 transition 过程中将 DOM 元素从原位置「adopt」到「receiver」中再「restore」回去。这会导致 layout thrashing 和时序不可控。建议改用 `position: fixed` 或 `transform` 来做视觉位移，而不是真正的 DOM 移动。
4. **弱化 Pin 机制**：评估是否所有 transition 都需要 `FIXED_STAGE_CLASS`。如果某些 transition 的视觉效果允许在滚动中自然播放，可以取消 pin，减少 scroll snap 的复杂度。

### 6.2 中长期重构（参考 Shopify 模式）

如果项目需要更复杂的滚动叙事，可以考虑：

1. **引入 Rive 或类似的状态机动画系统**：将核心转场动画从 GSAP timeline 迁移到 Rive State Machine，由统一的 scroll progress 驱动。这允许设计师独立调整转场 timing，而不需要修改代码。
2. **分离动画层与内容层**：将所有视觉动画（包括 transition）迁移到固定 Canvas 或 WebGL 层，DOM 仅承载文本和静态内容。DOM 文本的动画使用最简化的 CSS `animation-timeline: view()` 或 IntersectionObserver。
3. **使用 Lenis 的 `scroll` 事件作为唯一数据源**：利用 Lenis 的 `onScroll` 回调获取经过平滑处理的 `scroll` 值，将其映射到全局 `progress`，再分发给所有动画层（Canvas、GSAP、CSS）。

### 6.3 具体代码模式参考

如果要在当前项目中实现「单一 progress + blend」的效果，可以参考以下模式：

```javascript
// 在 homepage-transition-runtime.js 中，替代双轨系统
// 使用一个统一的 easedProgress 来驱动所有动画

const globalProgress = {
  value: 0,
  target: 0,
};

// 在 scroll 事件中更新 target
lenis.on('scroll', ({ scroll, limit }) => {
  globalProgress.target = scroll / limit;
});

// 在 raf 中平滑跟随（避免两套时序）
function tick() {
  globalProgress.value += (globalProgress.target - globalProgress.value) * 0.1;

  // 将统一的 progress 分发给所有动画层
  riveStateMachineInput.value = globalProgress.value * 100;
  gsapTimeline.progress(globalProgress.value);
  updateCanvasParallax(globalProgress.value);

  requestAnimationFrame(tick);
}
```

---

## 七、结论

Shopify Editions Winter '26 的滚动动画时序控制采用了一种「轻量、统一、Canvas 优先」的架构：

- **单一数据源**：scroll position → 全局 progress。
- **状态机驱动**：Rive State Machine 接收 progress input，在多个动画状态之间 blend。
- **视觉连续**：transition 和 content 不是前后硬切，而是重叠 blend，不存在空白间隙。
- **无 pin 无 snap**：通过固定 Canvas 实现视觉上的「section 切换」，而非真正的 DOM pin。

我们的项目当前面临的核心问题——「两套时序系统并行导致的 handoff 时序竞争」——在 Shopify 的架构中通过「单一 progress + state machine blend」从根本上避免了。短期可以通过统一 progress 来源和引入重叠区间来缓解；中长期可以考虑将核心动画层从 DOM 中解耦，采用 Canvas/State Machine 的架构模式。

---

## 参考来源

1. typed.sanitypress.dev/blog/breaking-down-shopify-editions-winter-26 — 技术栈逆向分析
2. webgpu.com/showcase/winter-26-renaissance-by-shopify — WebGL/WebGPU 技术观察
3. malts.me/blog/rive-scroll-animations — Rive 滚动同步模式
4. stackoverflow.com/questions/79406582 — Rive scroll sync 代码示例
5. tympanus.net/codrops/2025/05/12/integrating-rive-into-a-react-project — Rive React 集成
6. pkgpulse.com/guides/lottie-vs-rive-vs-css-animations-web-animation-formats-2026 — Rive 技术特性分析
7. aidxn.com/blog/scroll-triggered-animations — GSAP ScrollTrigger vs CSS Scroll-Timeline 对比
8. cssauthor.com/scroll-animation-tools-2026 — 滚动动画技术选型指南

---

*本报告基于公开可获取的技术文档、逆向工程分析和行业最佳实践撰写。Shopify Editions 网站的具体实现细节未完全公开，部分结论为基于技术特征的合理推测。*
