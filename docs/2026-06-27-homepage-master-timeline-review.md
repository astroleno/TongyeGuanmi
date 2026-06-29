# 首页主时间线 / 转场 / 动画 —— 独立复盘报告

> 复盘日期：2026-06-27
> 分支：`codex/homepage-directed-scene-timeline`
> 范围：首页"主滚动时间线"重构（`docs/.../2026-06-26-homepage-master-scroll-timeline.md` 计划）的实际落地情况
> 方法：独立通读核心模块 + 三路并行子代理交叉核验（适配器 / CSS·DOM / 校验脚本）

---

## 0. 结论速览（TL;DR）

**一句话：你设计的"一个整体时间线"在代码里是存在的、而且每帧都在算，但它并没有接到用户真正看到的画面上。屏幕上跑的，仍然是旧的"每段转场各自独立"的系统。**

具体地：

1. **现在同时存在两套系统**，而且在 `master-timeline-enabled="true"` 时**两套都会启动**：
   - 新系统：主时间线（`master-scroll-timeline` + 场景/表面/墨水合成器）—— 这是计划设计的"一个全局时钟"。
   - 旧系统：`createHomepageSnapCoordinator` 吸附协调器 + 7 个旧适配器（pull 模型）—— **这才是用户实际看到的画面**。

2. **新系统目前是"诊断模式"在空转**：它只挂载了一批 **空操作的"观察者"表面生产者** 和一个 **调试 HUD**，**从不调用 `mountMasterHomepageAdapters()`**（这段代码是死代码）。主时间线的场景层 / 文案层在 HTML 里是**空壳**，并且被 CSS `display:none` 隐藏。

3. 所以：**时间线没有和转场/动画"配合上"** —— 不是配合得不好，而是根本没接上。两者是两个平行世界。

4. 关于"一部分在上一幕、一部分在下一幕"做不好：**原因恰恰与你的猜测相反**。不是"因为有了整体时间线"导致做不到，而是 **那个能让你做到这件事的整体时间线还没接上**；屏幕上跑的旧"独立片段"系统在结构上就做不到平滑跨幕重叠，而且它还**主动用门控逻辑把目标场景压住、禁止提前露出**。

5. **校验全绿是有误导性的**：`npm run verify:all` 12 步全过，但这些都是静态文本/正则检查，而且其中几条**已经被改写成"要求旧系统必须在跑"**。唯一真正跑运行时的浏览器审计 `audit:homepage-directed-timeline` **没有进 `verify:all`**，且当前一开局就因 hero 文字 `opacity:0` 失败。

6. **附带可见 Bug**：右上角的调试 HUD（`data-master-timeline-hud`）没有任何隐藏规则，**会直接显示给真实用户**。

---

## 1. 系统现状：两套系统并存

```
initHomepageTransitions(options)                 // homepage-transition-runtime.js:1022
  └─ if master-timeline-enabled === "true":
        cleanup.add(await initLegacyHomepageTransitions(options))   // :1027  ← 真正画画的
        cleanup.add(await initMasterHomepageTransitions(options))   // :1028  ← 只跑 HUD/诊断
```

### 1A. 旧系统（用户实际看到的）

- `initLegacyHomepageTransitions()`（`:1395`）创建 `createHomepageSnapCoordinator`（`:248`）。
- 每段转场是一个独立的 `<div data-transition-module="...">` 宿主，**夹在两个 `<section>` 之间**。`index.html` 里仍有 9 个这样的宿主：`pattern-bloom / aod / figure2 / figure3-transition / ttg / ph / crane / soft-divider / soft-breath`。
- 旧的真实 `<section id="home|belief|method|...">` 内容**全部健在**（`index.html:203–417`），这就是真正渲染的页面。
- 每段转场有**自己的 `playhead`（0→1）**、**自己的吸附停顿（scroll-snap stage hold）**、**自己的 RAF 时钟**。它是一个被"钉住"的离散片段：滚到宿主 → 锁滚动 → 跑自己的 0→1 → 交接给目标 section。

### 1B. 新系统（设计目标，但在空转）

- `createHomepageMasterRuntime()`（`:1042`）每帧执行：`applyLayout → renderSurfaceProducers → renderMasterVisualState → ink.render → applyVisibility`（`:1281–1298`）。**这个全局时钟是真的在跑、状态是真的在算。**
- 但它挂载的全部是 **观察者**：`homepageSurfaceProducerRegistry` 里 13 个生产者**全部指向同一个 `createObserverSurfaceProducer`**（`homepage-transition-registry.js:15–29`），而该观察者只做一件事——给元素打个 `data-master-surface-ready="true"` 标记，**不画任何东西**（`master-observer-surface-producer.js`）。
- **`mountMasterHomepageAdapters()`（`:1346–1379`）和 `mountSceneRenderer()`（`:1116`）从未被调用。** 启动前只跑了 `mountMasterSurfaceProducers()`（`:1384`），并有明确注释：

  > `// Master-visible salvage mode observes the real legacy visual flow. Do not mount transition adapters here; legacy runtime owns the real DOM/video stages and the master runtime only drives HUD/state diagnostics.`（`:1381–1383`）

- 因此 `mountedAdapterGroups` / `mountedSceneRenderers` 永远是空的，`renderMasterVisualState`（`:1120`）在空集合上循环，**什么都不渲染**。

### 1C. DOM / CSS 证据：新系统看不见

- 主时间线的场景层是**纯空壳**：`<div data-master-scene-visual="home" aria-hidden="true"></div>`、`<div data-master-copy-root="true" ...></div>` 全是空的（`index.html:82–162`，由 `build-index.mjs:213–231` 生成）。
- 整个舞台被隐藏：

  ```css
  /* css/components/homepage-continuity.css:416 */
  html[data-master-dom-mode="master-visible"] [data-homepage-master-stage] {
    display: none;
    height: 0 !important; opacity: 0 !important; visibility: hidden !important;
  }
  ```

  舞台 `display:none` ⇒ 墨水画布、表面层、场景层、文案层**全部不渲染**。
- **唯一漏出来的**是调试 HUD（`data-master-timeline-hud`，`index.html:165`），它是舞台的**兄弟节点**，用自己的 `position:fixed; z-index:140` 固定在右上角，CSS 里没有任何隐藏规则（`homepage-continuity.css:142–158`）。**真实用户会看到这个调试面板。**

---

## 2. 直接回答你的问题

### Q1. 时间线能不能和转场、动画配合上？

**架构上能，当前构建里没有。**

- 能的依据：主解析器 `resolveMasterTimelineState()`（`master-scroll-timeline.js:204–239`）每帧**同时**算出 from 场景和 to 场景的完整状态（视觉 opacity/y/scale/blur + 文案 opacity/readable/foreground + 墨水进度），全部来自**同一个 `localProgress`**。这就是"一个时钟驱动一切"的正确形态。推模型契约（`render(state)` / `renderAt(progress, state)` / `renderIdle(state)`）也已经在运行时里接好了调用点（`:1120–1138`）。
- 没接上的事实：但没有任何适配器实现这个契约，调用点也永远到不了（见 Q2）。可见画面由旧的 pull 模型（`progressSource()`）独立驱动。**时间线在算 A，屏幕在放 B，两者不通信。**

> 结论：时间线**有能力**配合，但**目前没有被接到渲染上**，所以表现为"配合不上"。

### Q2. 动画、转场是不是组件？

**是"模块"，但还不是计划想要的那种"组件"。**

7 个适配器（`pattern-bloom / aod / figure2 / figure3 / crane / ttg / ph`）的共同现状：

| 维度 | 现状 | 计划目标 |
|---|---|---|
| 导出接口 | 只返回 `{ destroy }`，导出 `mountHomepageTransition(...)` | 暴露 `renderAt(progress, sceneState)` / `render(state)` / `renderIdle(state)` |
| 时钟 | **每个都自带 `requestAnimationFrame` 循环** | 无自有时钟，由主时钟推送 |
| 进度 | **pull**：自己调 `progressSource()` | **push**：接收 `state` 参数 |
| 画布/墨水 | pattern-bloom 自建 3 个 canvas + 2 个墨水；aod 自建墨水；figure2 自建 proof canvas | 渲染进传入的规范表面，不自建 |

也就是说：它们被**拆成了文件级模块**，但**仍各自持有时钟、各自拉进度、部分各自持有画布**——这正是计划里要消灭的"每个适配器自带私有时钟/私有墨水"。主时间线侧的组件契约（renderAt/renderIdle）**已经定义好**，但**没有一个适配器去实现它**。

> 结论：转场是模块，但还不是"由单一时钟驱动的纯渲染组件"。组件化做了一半——主时间线这边的"插槽"挖好了，适配器那边的"插头"还没换。

### Q3. 为什么转场/动画不能很好地"一部分在上一幕、一部分在下一幕"？是不是因为有了一个整体时间线？

**不是。恰恰相反——是因为那个能让你做到这件事的整体时间线还没接上。**

拆开讲：

**(a) 屏幕上跑的旧系统，结构上就做不到平滑跨幕重叠。**
旧系统里每段转场是一个**夹在两节之间的独立片段**，有自己的 `playhead`、自己的吸附停顿、自己的墨水画布。它本质是两个盒子之间的**遮盖桥**，而不是"同一个真相源里 A 的尾帧和 B 的首帧连续插值"。源 section 和目标 section 是它**并不拥有**的独立 DOM，所以它无法自然地让"上一幕还在、下一幕已进来"共存。

**(b) 更关键：旧系统还主动用门控逻辑禁止重叠。**
吸附协调器里有目标露出门控：`beginTargetRevealGate()`（`:537`）会把目标标成 `data-section-transition-state="gated-in"` 并**压住不让露出**，直到 `playhead` 越过释放阈值（`DEFAULT_TARGET_GATE_RELEASE_PROGRESS = 0.86`，`:33`）才 `releaseTargetRevealGate()`（`:544`）。**也就是说，目标场景在转场进行到 86% 之前是被强制隐藏的——重叠是被代码明确抑制掉的。** 这就是计划开篇痛斥的"转场窗口 + 落地窗口"两段式心智模型。

**(c) 你设计的整体时间线，正是这个问题的解药——而且解法已经写好了。**
在主时间线模型里：
- `scenePresence.from` 与 `scenePresence.to` 是**同一段 `localProgress` 上两条独立曲线**，天然允许两幕同时存在；
- `visualHandoffAt` 让 z 序在段中途交叉（`master-scroll-timeline.js:216、226`）；
- `copy.source` 与 `copy.target` 完全独立解析（`resolveSourceCopy` / `resolveTargetCopy`，`:74–113`）；
- `copy.target.policy: 'overlap'` 明确允许目标文案在墨水结束前就进入（校验脚本甚至断言 `overlap` 的 enter 必须早于墨水结束）。

这些"一部分上一幕、一部分下一幕"的能力**全部已经实现**——只是实现在那个**正在空转、没接到画面上的系统里**。

> 结论：整体时间线不是"做不到重叠"的原因，而是"能做到重叠"的答案。问题之所以还在，是因为整体时间线还没驱动可见渲染，而仍在台前的旧"离散片段 + 门控"系统在结构上和逻辑上都反对重叠。

---

## 3. 计划 vs 实际：迁移状态自相矛盾

计划的相位闸门（Migration Phase Gates）写得很清楚：

- Task 3–10 期间，生成的 `index.html` **必须**保持 `data-master-timeline-enabled="false"` 且 `data-master-dom-mode="legacy-visible"`；
- **只有 Task 11**，在"适配器全部迁移完、旧首页 import 边界清理干净"之后，才允许翻成 `"true"` / `"master-visible"`。

实际构建（`build-index.mjs:16, 346–347`）已经**硬编码翻成了 `"true"` / `"master-visible"`**，但：

- 适配器**一个都没迁移**（仍是 RAF + pull 模型）；
- 旧运行时**仍在并行跑**；
- 真正的迁移（让主时间线驱动渲染）用一句"salvage mode"注释**跳过了**。

也就是说，当前处于一个计划明确禁止的中间态：**flag 已经宣告"主时间线启用"，但主时间线并不渲染，旧系统才在渲染。**

更需要警惕的是：**部分校验脚本被改写成"祝福"了这个状态**——
- `check-homepage-master-timeline.mjs:377` 断言运行时源码里**必须**包含 `real legacy visual flow` 这句注释；
- `:380` 断言**必须**调用 `initLegacyHomepageTransitions(options)`；
- `check-handoff-ownership.mjs:29–30` 同样。

没有任何脚本断言 `mountMasterHomepageAdapters()` 被调用、断言主场景层非空、或断言"只有一条运行时路径"（计划要求的 "exactly one runtime path"）。所以 12 步全绿，**绿的恰恰是"旧系统在跑、主系统是观察者"这件事本身**。

---

## 4. 风险与影响

| 级别 | 问题 | 影响 |
|---|---|---|
| 高 | 调试 HUD 对真实用户可见（`homepage-continuity.css:142–158` 无隐藏规则） | 线上会看到右上角半透明调试面板 |
| 高 | 两套运行时并行启动（`:1027–1028`） | 双重滚动监听 / 双重 RAF / 资源浪费，且行为以旧系统为准，新系统纯耗费 |
| 高 | `master-timeline-enabled="true"` 名不副实 | 任何人读 flag/校验都会以为主时间线在驱动画面，实际没有；维护者极易误判 |
| 中 | `mountMasterHomepageAdapters()` / `mountSceneRenderer()` 是死代码 | 看似已接好，实际从不执行；是最大的认知陷阱 |
| 中 | 校验全绿但被改写成保护旧路径 | 绿色 CI 给出虚假安全感，真正的运行时审计被排除在 `verify:all` 之外 |
| 中 | 唯一的运行时审计当前就挂（hero 文字 `opacity:0`） | 没有任何自动化在守护真实视觉效果 |
| 低 | 7 个适配器仍持有私有 RAF/墨水 | 迁移到推模型前，重叠/跨幕能力无法启用 |

---

## 5. 建议的修复路径（按优先级）

**P0 —— 先止血，消除"假启用"与可见 Bug**
1. 要么把 HUD 用 CSS 彻底隐藏（仅 `?debug` 时显示），要么从生产构建里移除 `buildMasterTimelineHud()` 输出。
2. 决定一个**单一真相**：当前既然是旧系统在渲染，就应当老实把 flag 设回 `legacy-visible`，**或者**真正把主时间线接上（见 P1）。现在的 `"true"` 是误导性的。
3. 既然主运行时是观察者模式，至少不要再并行启动它（`:1028`）——目前它纯耗资源、不产出画面。

**P1 —— 真正接通主时间线（即你想要的"配合"）**
4. 给 7 个适配器**实现推模型组件契约**：`renderAt(progress, sceneState)` / `render(state)` / `renderIdle(state)`，去掉各自的 `requestAnimationFrame`，把 `progressSource()` 改成接收传入 `state`。优先级：`pattern-bloom`（最重）→ `figure2` → `aod` → 其余。
5. 在 `createHomepageMasterRuntime()` 里**真正调用 `mountMasterHomepageAdapters()` 和场景渲染器注册**，删掉 "salvage mode" 短路。
6. 把表面生产者从 `createObserverSurfaceProducer` 换成真正绘制规范表面的生产者（hero/belief-star/paper 等），让墨水合成器有真实纹理可采样。
7. 一次接通一段（计划建议的顺序）：`home→belief.upper` 先行，浏览器审计正/反向各采一帧确认无重影、无空白桥帧，再推进下一段。

**P2 —— 让"绿色"重新可信**
8. 新增静态断言：`mountMasterHomepageAdapters()` 必须被调用；主场景/文案层在 `master-visible` 下必须非空；同一时刻只有一条运行时路径。
9. 把 `audit:homepage-directed-timeline` 纳入 `verify:all`（先修掉 hero 文字 `opacity:0` 的开局失败），让运行时审计真正成为闸门。
10. 移除已被旧路径"反向绑架"的断言（不应强制要求 `real legacy visual flow` 注释存在）。

---

## 6. 附录：关键文件与行号

**运行时**
- `js/transitions/homepage-transition-runtime.js:1022–1030` —— 双路径并行启动
- `:1346–1379` —— `mountMasterHomepageAdapters()`（死代码，从不调用）
- `:1381–1386` —— "salvage mode" 注释 + 只挂观察者
- `:1120–1138` —— `renderMasterVisualState`（在空集合上循环）
- `:537–550` —— 目标露出门控（抑制重叠）；`:33` 释放阈值 0.86

**主时间线核心（设计正确、但空转）**
- `js/transitions/homepage/master-scroll-timeline.js:204–239` —— from/to 同帧解析
- `:74–113` —— 源/目标文案独立解析
- `js/transitions/homepage/master-scene-registry.js` —— 表面/场景注册
- `js/transitions/homepage/master-observer-surface-producer.js` —— 空操作观察者
- `js/transitions/homepage-transition-registry.js:15–29` —— 13 个生产者全是观察者

**适配器（仍是 pull 模型）**
- `js/transitions/pattern-bloom-adapter.js`（自建 3 canvas + 2 ink + 自有 RAF）
- `js/transitions/homepage/{aod,figure2,figure3,crane,ttg,ph}-homepage-adapter.js`

**构建 / DOM / CSS**
- `scripts/build-index.mjs:16, 346–347` —— flag 硬编码为 `true` / `master-visible`
- `:213–231` —— 生成空场景/文案壳
- `index.html:82–162` —— 空壳；`:165–201` —— 可见 HUD；`:203–417` —— 旧真实内容
- `css/components/homepage-continuity.css:416–422` —— 舞台 `display:none`；`:142–158` —— HUD 可见

**校验**
- `scripts/check-homepage-master-timeline.mjs:377、380` —— 断言旧系统必须在跑
- `scripts/check-handoff-ownership.mjs:29–30` —— 同上
- `scripts/audit-homepage-directed-timeline-cdp.mjs` —— 唯一运行时审计，未进 `verify:all`，当前失败于 hero 文字 `opacity:0`

---

*报告完。如需，我可以下一步从 `home→belief.upper` 这一段开始，把第一个适配器（建议 pattern-bloom）改成推模型组件并真正接到主时间线上，做成一个可验证的样板。*
