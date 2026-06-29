# 首页时间线 / 转场 / 动画 协同评审报告

> 分支：`codex/homepage-directed-scene-timeline`
> 日期：2026-06-27
> 范围：整体架构 + 你提的核心问题（时间线能否配合转场/动画？转场和动画是不是组件？为什么转场/动画做不到"一部分在上一幕、一部分在下一幕"？是不是已经有一条整体时间线？）

---

## 0. 一句话结论

**项目里确实"设计"了一条非常完整的整体时间线（master scroll timeline），但它目前没有真正接管画面。** 真正在屏幕上画东西的，还是旧的"每个转场各自为政"的 legacy 系统。新时间线现在是一层**隐藏的、空的诊断浮层**，跑在旧页面之上。所以你感觉到的"转场/动画跨不了幕"的问题，根因没有被这条新时间线解决——因为新时间线还没上线。

---

## 1. 你的四个问题，直接回答

### Q1：时间线能不能和转场、动画配合上？
**设计上能，现状上没有。**

- 设计里有一条单一时钟：`真实 scrollY → MasterScrollMap → MasterTimelineResolver → MasterSceneCompositor`（见 `js/transitions/homepage/master-scroll-timeline.js`、`master-scroll-map.js`）。这是一条纯函数式、正反向同一套数学的时间线，理论上能统一驱动场景、文案、墨水转场。
- 但现状（`js/transitions/homepage-transition-runtime.js:953-961`）是**两套 runtime 同时启动**：
  ```js
  cleanup.add(await initLegacyHomepageTransitions(options)); // 旧系统，真正画画
  cleanup.add(await initMasterHomepageTransitions(options)); // 新时间线，只跑 HUD/状态
  ```
- runtime 里 1311-1314 行自己写了注释承认这点：
  > "Master-visible **salvage mode** observes the real legacy visual flow. Do not mount transition adapters here; legacy runtime owns the real DOM/video stages and the master runtime only drives HUD/state diagnostics."

  翻译：当前是"抢救/兼容模式"，新时间线**只观察**旧画面、只更新调试面板，**不负责出图**。

### Q2：动画、转场是不是组件？
**是组件，而且组件化做得不错——但它们目前是"自治组件"，不是"被时间线驱动的组件"。**

- 转场是按 `data-transition-id` 注册的独立模块：`pattern-bloom-adapter.js`、`figure2-transition.js`、`crane-transition.js`、`aod/figure3/ttg/ph-homepage-adapter.js` 等，通过 `homepage-transition-registry.js` 懒加载。✅ 组件化清晰。
- 但这些组件**各自持有自己的时钟**：`figure2-transition.js`、`crane-transition.js`、`pattern-bloom-adapter.js` 里都还有自己的 `requestAnimationFrame`；`aod-homepage-adapter.js` 还自己持有 WebGL 上下文。
- 计划本来要求这些组件退化成纯 `renderAt(progress, state)` 渲染器（不持有时钟），由 master runtime 统一喂进度。这一步**没有完成**：`mountMasterHomepageAdapters()` 在 runtime 里**定义了但从未被调用**（`homepage-transition-runtime.js:1277` 只有定义，没有调用点）。

### Q3：为什么转场/动画做不到"一部分在上一幕、一部分在下一幕"？
**这是本次评审最关键的发现。根因有三层：**

1. **新时间线没出图，旧系统按"窗口式"思维工作。**
   旧系统的心智模型是"转场窗口 + 落地窗口"两段式（`sourceOut / targetIn / commitAt / presentAt / cleanupAt`）。每个转场组件只在自己那一段 scroll 区间里活着，区间一过就交还控制权。所以一个动画很难"跨过幕的边界"——因为边界就是组件的生死线。

2. **画面 DOM 是"分幕拥有"的，不是"同一棵共享场景树"。**
   `index.html` 里大多数 section 出现了**两次**（实测：`home:2 / brand:2 / services:2 / lab:2 / education:2 / philosophy:2 / contact:2`）。一份是旧的真实 `<section id="home">`（第 203 行起，真正显示），另一份是新时间线的场景层。而新时间线的视觉根全是**空壳**：
   ```html
   <div data-master-scene-root="home" data-master-scene="home">
     <div data-master-scene-visual="home" aria-hidden="true"></div>  <!-- 空的、aria-hidden -->
   </div>
   ```
   既然每一幕的真实像素由各自独立的 section/组件拥有，跨幕共享一个连续动画在旧结构里物理上做不到。

3. **墨水转场（ink）本应是"真正的场景间插值"，现在采样的是空 surface。**
   计划里墨水转场不是盖在跳变上的遮罩，而是 source 场景画面 ↔ target 场景画面的真实插值。`master-ink-compositor.js` 确实是单一 WebGL 画布、确实从 `registry.textureSourceForSurface()` 采样 source/target 贴图——**但这些 surface 的 producer 全部是同一个空操作 stub**：

   `homepage-transition-registry.js` 把全部 13 个 surface producer（hero / belief-star / figure2 / crane / ...）都映射到了同一个 `createObserverSurfaceProducer`，而它（`master-observer-surface-producer.js`）只设了几个 `dataset` 标记，**一笔都不画**：
   ```js
   renderAt() {
     surfaceEntry.element.dataset.masterSurfaceReady = 'true'; // 只打标记
     const texture = surfaceEntry.textureProvider?.();
     if (texture?.dataset) texture.dataset.inkTextureReady = 'true'; // 不画任何内容
   }
   ```
   所以即便墨水编译器跑起来，它采到的也是空白/占位贴图。真正的跨幕墨水插值因此无法成立。

> **小结**：做不到"一部分在上一幕一部分在下一幕"，不是因为缺一条整体时间线（已经设计好了），而是因为**那条时间线还没接管画面、共享场景树还是空的、surface producer 还没真正绘制**。

### Q4：是不是已经有了一条整体时间线？
**有，而且质量不错——但它"在线但空转"。**

- ✅ 数据模型完整：`src/section-manifest.mjs` 的 `homepageMasterTimeline` 声明了 11 个一等场景（含 `belief.upper` / `belief.lower` 拆分）、9 段 transition、13 个 surface、scroll 块长度、墨水窗口、文案 source/target 时序策略。
- ✅ 解析器纯净：`master-scroll-timeline.js` 正反向用同一套 segment 数学（`resolveMasterTimelineState`），不读 `window.scrollY`，方向只反转进度、不分叉所有权规则——完全符合计划的硬要求。
- ✅ 滚动映射来自真实轨道几何：`master-scroll-map.js` 用 `getBoundingClientRect` 测量 `[data-homepage-master-track]`，带 Resize/Mutation/font/visualViewport 刷新。
- ✅ 帧序正确：runtime `renderMasterTimelineFrame()`（1212-1229 行）严格按 `applyLayout → renderSurfaceProducers → renderMasterVisualState → ink → applyVisibility` 执行，墨水不会采上一帧的旧 surface。
- ⚠️ 但 `renderMasterVisualState`（1051 行）遍历的 `mountedAdapterGroups` 和 `mountedSceneRenderers` **永远是空的**（注册函数从未被调用），所以这条时间线每帧只更新了一堆 `data-*` 属性和 HUD，**没有任何视觉输出**。

---

## 2. 整体架构评价

### 做得好的地方
- **关注点分离清晰**：manifest（数据）/ resolver（纯逻辑）/ scroll-map（DOM 测量）/ presenter（DOM 写入）/ surface-producer（绘制）/ ink-compositor（合成）分层干净，符合"多小文件"原则。
- **契约驱动开发**：有一整套静态校验脚本（`check-homepage-master-timeline.mjs` 等），且 `verify:all` 全绿。这些脚本能拦住"旧的两段式时序字段回流"。
- **Belief 拆分到位**：源码 `src/sections/belief.html` 已正确拆成 upper（"你的同行不是更聪明…"）/ lower 两个独立 copy-wrap，符合一等场景的设计。
- **正反向对称**：resolver 的方向处理是这套设计最优雅的部分，避免了旧系统正反向各写一套的常见坑。

### 主要风险 / 债务
| # | 问题 | 证据 | 影响 |
|---|------|------|------|
| P0 | 两套 runtime 并行，违反"master 是唯一视觉权威" | `homepage-transition-runtime.js:958-959` | 双重滚动监听、潜在抖动、维护心智双倍 |
| P0 | master 视觉层是空壳 + section DOM 重复 | `index.html` 多数 section count=2；scene-visual 为空 `<div>` | `master-visible` 名不副实，实为 legacy-visible |
| P0 | 全部 surface producer 是同一个空操作 stub | `homepage-transition-registry.js` + `master-observer-surface-producer.js` | 墨水转场采到空贴图，无法做真实跨幕插值 |
| P0 | 适配器/场景渲染器从未挂载 | `mountMasterHomepageAdapters`/`mountSceneRenderer` 无调用点 | 新时间线零视觉输出 |
| P1 | 转场组件仍各自持有 RAF/WebGL 时钟 | `figure2/crane/pattern-bloom` 仍有 `requestAnimationFrame`；`aod` 仍有 WebGL | 多时钟漂移，跨幕连续性无法保证 |
| P1 | 静态校验"全绿"但只校验形状，不校验像素 | `verify:all` 通过，但 CDP/Playwright 审计（`audit-7-issues.mjs`、`audit-homepage-directed-timeline-cdp.mjs`）才是视觉闭环的判据 | 容易误判"已完成" |
| P2 | 计划已到 Task 11 状态（`enabled=true / master-visible`），但实现停在 salvage | flags 已翻，但视觉迁移未做 | 状态标记与真实能力不一致，最危险的债务 |

---

## 3. 根因诊断（为什么会变成现在这样）

计划本身是分阶段、TDD、带回滚边界的，质量很高。问题出在**执行把"翻 flag"和"迁移视觉"解耦了**：

- 计划明确要求 Task 11"只有在旧首页视觉 import 边界清理干净后"才翻 `master-visible`。
- 实际：flag 翻到了 `true`，DOM 模式翻到了 `master-visible`，**但真正的视觉迁移（让 producer 绘制、让 adapter 退化为 renderAt、让 section 变零高锚点）没做**，于是用 salvage 模式兜底——让旧系统继续出图，新系统只观察。
- 静态校验只能保证 manifest/契约形状正确，保证不了"新时间线真的在画画"，所以一路全绿，掩盖了视觉空转。

---

## 4. 建议（按优先级）

### 选项 A：补完迁移（推荐，与计划一致）
真正落地计划的 Task 7-11：
1. 为每个 surface 写**真实 producer**（hero/figure2/crane/...）替换 `createObserverSurfaceProducer`，让它们把内容画进各自 canonical canvas。
2. 调用 `mountMasterHomepageAdapters()` + `mountSceneRenderer()`，让适配器退化成纯 `renderAt(progress,state)`，**移除组件内部 RAF/WebGL 私有时钟**。
3. 把真实场景内容搬进 `[data-master-scene-visual-layer]`，旧 section 降级为零高语义锚点（保 id/hash 导航），消除 DOM 重复。
4. 让 `initHomepageTransitions` 在 `master` 模式下**只**起 master runtime，不再并行 legacy。
5. **必须**跑授权下的 CDP/Playwright 审计（正反向采样 home→belief-upper、belief-upper→belief-lower、belief-lower→method、method-proof→brand、brand→services、philosophy→contact）才能宣称视觉闭环。

→ 收益：真正拿到"单一时钟、跨幕连续、墨水即插值"的能力，你 Q3 的问题被根治。

### 选项 B：诚实回退 flag（如果短期不打算补完）
把 `data-master-timeline-enabled` 翻回 `false`、`data-master-dom-mode` 回 `legacy-visible`，停掉并行的 master runtime，让状态标记与真实能力一致，避免后续误判。保留 scaffold 文件（resolver/manifest）等有空再推进。计划里本就写了这个回滚边界。

### 不建议
维持现状（flag=true 但空转）。这是最危险的状态：看起来"已完成、全绿、master-visible"，实际旧系统在干活、新系统在空转，任何后续接手者都会被误导。

---

## 5. 给你的决策点

1. **要不要现在补完视觉迁移（选项 A）**，还是先回退 flag 保持诚实（选项 B）？
2. 补完的话，**是否授权我跑 Playwright/CDP 审计**？没有这一步，任何"跨幕转场已修复"的结论都不算数（计划明文规定）。
3. 转场组件去掉私有 RAF/WebGL 时钟是 P1 大改，**是否一次性做**，还是先做 ink 转场那几段（pattern-bloom / figure2 / crane）验证跨幕连续性？

---

### 附：关键文件索引
- 时间线数据：`src/section-manifest.mjs`（`homepageMasterTimeline`）
- 纯解析器：`js/transitions/homepage/master-scroll-timeline.js`
- 滚动映射：`js/transitions/homepage/master-scroll-map.js`
- 编排/双 runtime：`js/transitions/homepage-transition-runtime.js:953-1324`
- 空操作 producer（问题点）：`js/transitions/homepage/master-observer-surface-producer.js`
- producer 路由（问题点）：`js/transitions/homepage-transition-registry.js`
- 墨水合成：`js/transitions/homepage/master-ink-compositor.js`
- 场景写入：`js/transitions/homepage/master-scene-presenter.js`
- Belief 拆分：`src/sections/belief.html`
