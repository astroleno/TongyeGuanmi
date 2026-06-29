# 首页主时间线 — 完整视觉迁移实施计划 (Strategy A)

> 格式遵循本仓库既有 `docs/superpowers/plans/2026-06-26-homepage-master-scroll-timeline.md` 的 superpowers 约定（自底向上分阶段、先写失败的校验、显式 `- [ ]` 步骤、每步带验证命令、阶段闸门、回滚边界）。
> 注：`~/.claude/skills/writing-plans` 符号链接已失效（obra/superpowers 插件缓存缺失），故采用仓库内同源约定。若需恢复技能原文，请重装该插件。

## Context（为什么做这件事）

当前分支 `codex/homepage-directed-scene-timeline` 的**数据层与逻辑层已完成且正确**：`homepageMasterTimeline`（11 场景含 belief 上/下拆分、9 段 transition、13 surface、滚动块、墨水窗口、文案 source/target 策略）、纯解析器 `master-scroll-timeline.js`（正反向同一套数学）、滚动映射 `master-scroll-map.js`、presenter、单 WebGL ink 合成器 `master-ink-compositor.js`、surface producer 注册表都已就位，并且每帧按正确顺序运行（`applyLayout → renderSurfaceProducers → renderMasterVisualState → ink → applyVisibility`）。

但它**视觉上是空转的（"salvage 模式"）**，被 5 个具体的"惰性点"卡住：

1. **全部 13 个 surface producer 路由到同一个空操作 stub** — `homepage-transition-registry.js` 把 hero/belief-star/figure2/crane/... 全映射到 `createObserverSurfaceProducer`，只打 dataset 标记、不画任何像素。
2. **两套 runtime 并行** — `homepage-transition-runtime.js:953-961` 同时跑 legacy 与 master；`mountMasterHomepageAdapters()`/`mountSceneRenderer()` 定义了但**从未被调用**，`renderMasterVisualState` 是空循环。
3. **scaffold 是空壳 + DOM 重复** — `build-index.mjs` 的 `buildMasterVisualRoot`/`buildMasterCopyRoot`（~213-231）生成空 `<div>`，真实内容只在自然 `<section>` 流里，导致多数 section 出现两次。
4. **CSS 硬隐藏闸刀** — `css/components/homepage-continuity.css:416-417`：`html[data-master-dom-mode="master-visible"] [data-homepage-master-stage] { display: none }`。runtime 每帧渲染进一个 `display:none` 的元素。
5. **校验/审计脚本反向锁死了 salvage 态** — `check-homepage-master-track-structure.mjs`、`check-homepage-visual-timeline-contract.mjs`、`audit-homepage-directed-timeline-cdp.mjs` 主动断言"适配器不得绘制 / 不得克隆 hero/belief/brand 文案 / 不得退役真实 hero 流 / master stage 不可见"。这些断言编码的是 Strategy A 的**反面**，必须**反转**，不能只求"保持绿"。

**关键架构事实**：`master-ink-compositor.js` 已经在用 `registry.textureSourceForSurface(sourceSurfaceKey/targetSurfaceKey)` 采样。**只要 producer 把真实像素画进 canonical `[data-master-surface]` canvas，墨水桥就会自动采到真实贴图，合成器零改动。** 因此整件事归结为：(a) 让 producer 真画，(b) 让 stage 可见，(c) 把真实内容移进 scene/copy 层，(d) 让 master runtime 成为唯一视觉权威，(e) 把闸门反转过来。

**用户已定决策**：Strategy A 完整视觉迁移；九段一次性迁移；授权 Playwright/CDP 浏览器审计作为视觉闭环判据。

**预期结果**：单一时钟驱动全部场景/文案/墨水；转场能真正"一部分在上一幕、一部分在下一幕"（跨幕墨水即真实场景插值）；legacy 并行路径与适配器私有时钟移除；六对关键转场正反向均有非空桥帧证据。

---

## File Structure（创建/修改清单）

**创建（每个 surface family 一个 producer，<800 行/文件）**
- `js/transitions/homepage/hero-surface-producer.js` — `home.visual`（最高风险，最后做）
- `js/transitions/homepage/belief-star-surface-producer.js` — 共享 `belief.star`（高风险）
- `js/transitions/homepage/figure3-surface-producer.js` — `figure3.bridge`
- `js/transitions/homepage/aod-surface-producer.js` — `aod.bridge`
- `js/transitions/homepage/crane-surface-producer.js` — `crane.bridge`
- `js/transitions/homepage/ttg-surface-producer.js` — `lab.visual`
- `js/transitions/homepage/ph-surface-producer.js` — `education.visual`
- `js/transitions/homepage/figure2-surface-producer.js` — `figure2.bridge`
- （`static-paper-surface-producers.js` 已存在，复用其 method/brand/services/philosophy/contact paper producer）

**修改**
- `js/transitions/homepage-transition-registry.js` — 把 producer 工厂逐个从 observer 改指到真实 producer
- `js/transitions/homepage-transition-runtime.js` — 单 runtime 派发；调用 `mountMasterHomepageAdapters()`；定义 master 适配器契约（无私有时钟）
- `scripts/build-index.mjs` — `buildMasterVisualRoot`/`buildMasterCopyRoot` 注入真实内容；自然 section 降为零高语义锚点（保 id/hash）
- `css/components/homepage-continuity.css` — 删除 416-417 `display:none` 闸刀；由 `--master-visual-opacity`/`--master-copy-opacity`/`[data-master-scene-active]` 驱动可见性；零高 legacy 流但保留锚点
- `js/main.js` — master 模式下停止把 `initLayeredHero`/`initFallbackParallax`/`initBeliefStarField` 当独立视觉驱动；保留 reduceMotion/fallback 分支
- `js/sections/hero.js`、`js/sections/belief.js` — 私有 RAF/ticker 仅在非 master 模式下生效
- 各 legacy adapter（aod/figure2/figure3/crane/ttg/ph/pattern-bloom）— 移除/门控 master 模式下的私有 `requestAnimationFrame`/`gsap.ticker`/`performance.now`
- **闸门反转**：`scripts/check-homepage-master-track-structure.mjs`、`scripts/check-homepage-visual-timeline-contract.mjs`、`scripts/audit-homepage-directed-timeline-cdp.mjs`

**不要手编辑 `index.html`** — 改源后跑 `npm run build:page`。

---

## Migration Phase Gates（阶段闸门）

| 阶段 | 风险 | 触及 surface | 主闸门命令 |
|---|---|---|---|
| 0 基线 | 无 | — | `verify:all` + 归档 salvage 审计基线 |
| 1 纸面 | 低 | 5 个 paper（已存在 producer） | `verify:ink-modules` `verify:scroll-modules` `verify:transition-runtime` |
| 2 单 runtime 接线 | 中 | 仅 runtime | `verify:transition-runtime` `verify:homepage-transitions` `verify:homepage-timeline` |
| 3 视频系 | 低→中 | figure3, aod, crane, ttg, ph | `verify:homepage-transitions` `verify:homepage-timeline` |
| 4 共享星场 | 高 | belief.star | `verify:homepage-visual-timeline` `verify:homepage-master-timeline` |
| 5 DOM 归位 + 闸门反转 | 高 | build-index + 校验脚本 | `verify:copy` `verify:section-transitions` `verify:homepage-master-track-structure` `verify:homepage-visual-timeline` |
| 6 Hero | 最高 | home.visual | `verify:all` |
| 7 清退 legacy | 中 | legacy 中和 | `verify:handoff-ownership` `verify:all` |
| 8 CDP 审计闭环 | 闸门 | 审计反转 | `npm run audit:homepage-directed-timeline` |

**重要**：阶段 1、5、8 必须**编辑校验/审计脚本本身**，因为它们当前断言 salvage 反面。把每次闸门反转与产出改动放在**同一个 commit**，避免阶段边界意外变红。

---

### Phase 0：基线捕获（无代码改动）

- [ ] 跑 `npm run verify:all`，记录当前全绿状态。
- [ ] 跑 `npm run audit:homepage-directed-timeline`（已授权），归档 `output/playwright/homepage-directed-timeline-cdp/` 截图与 `samples.json` 作为 **salvage 基线**，供后续逐阶段比对归因。

**闸门**：`verify:all` 绿；审计完成并归档。

---

### Phase 1：在纸面 surface 上让管线自证（最低风险）

**目标**：用已存在的纸面 producer 让真实像素画进 canonical canvas，并打开 stage，使一条纸面墨水桥点亮——在不碰 hero/视频的前提下证明 producer→surface→compositor 链路。

- [ ] **Step 1**（先写失败的校验）：在 `check-homepage-visual-timeline-contract.mjs` 把第 68 行"adapters/producers must not draw"断言**反转**为"paper 场景 surface 必须有 producer 且会绘制"。运行应失败。
- [ ] **Step 2**：`homepage-transition-registry.js` 把 `method-paper`/`brand-paper`/`services-paper`/`philosophy`/`contact-paper` 从 `createObservedSurface` 改指到 `static-paper-surface-producers.js` 已有工厂；其余 8 个暂留 observer。
- [ ] **Step 3**：`homepage-continuity.css` 删除/中和第 416-417 行 `display:none`，确认第 329/341 行的 `--master-visual-opacity`/`--master-copy-opacity` 驱动可见性。
- [ ] **Step 4**：`npm run build:page && npm run verify:ink-modules && npm run verify:scroll-modules && npm run verify:transition-runtime`
- [ ] **Step 5**（CDP 抽检）：滚到某个 paper hold，确认 `[data-master-surface="brand.paper"]` canvas 像素非零、跨纸面目标段时 `[data-master-ink-canvas][data-master-ink-active="true"]` 翻真。

**闸门**：纸面 surface 渲染；进入纸面目标的墨水桥非空。（注：`verify:homepage-master-track-structure` 此刻会红，属预期，于 Phase 5 反转修复；本 commit 不跑 `verify:all`。）

---

### Phase 2：单 runtime 派发 + 适配器挂载接线（逻辑主干）

**目标**：master runtime 成为唯一视觉权威，真正调用两个休眠的挂载路径，适配器由 master 时钟驱动。

- [ ] **Step 1**：`homepage-transition-runtime.js` `initHomepageTransitions`（~953）：`MASTER_TIMELINE_ENABLED` 时只跑 `initMasterHomepageTransitions(options)`，不再并行 legacy。`initLegacyHomepageTransitions` 保留可导入（回滚用）但不调用。
- [ ] **Step 2**：在 `createHomepageMasterRuntime` 把 1311-1314 的 salvage 注释块替换为真实调用：保留 `mountMasterSurfaceProducers()`，**新增 `await mountMasterHomepageAdapters()`**，并在需要的 hold 场景上用 `mountSceneRenderer`。
- [ ] **Step 3**：定义 master 适配器契约——`render(state)`/`renderIdle(state)`/`destroy()`，由 `renderMasterTimelineFrame` 每帧驱动；适配器读 `state.localProgress`/`state.blockProgress`/`state.direction`，**不得自起 RAF/ticker/performance.now**。尚未提供 master 工厂的适配器经 `mountMasterHomepageAdapters` 的 `if not function continue` 安全跳过（不抛错）。
- [ ] **Step 4**：`npm run build:page && npm run verify:transition-runtime && npm run verify:homepage-transitions && npm run verify:homepage-timeline`
- [ ] **Step 5**：确认 DOM 根上 `data-master-timeline-segment`/`-direction`/`-progress` 在更新，且只有一棵 RAF 在跑。

**闸门**：master 为唯一初始化；无 legacy snap coordinator；挂载路径被调用；结构类校验绿。

---

### Phase 3：简单+中等 surface producer（figure3 → aod/crane/ttg/ph）

逐个 family 迁移；每个 producer 用 `state.localProgress` 画进自己的 canonical canvas，复用 `master-asset-surface-utils.js`（`getImage/getVideo/seekVideo/drawCover/markAssetSurfaceReady`）。**每完成一个 family，移除/门控该 family 的私有 RAF。**

- [ ] **3a figure3（最简：原生视频 scrub，无 WebGL）**：建 `figure3-surface-producer.js`，复用 `figure3-transition.js` 的 seek/draw，把 `figure3-alpha-scrub.webm` 帧 `drawCover` 进 `figure3.bridge`；注册表改指。
- [ ] **3b aod**（`aod.bridge`，`sameRectAs: belief.star`）：墨水已归合成器，producer 只画 figure/cloud/sun 复合到 `aod.bridge`，复用 `aod-transition.js` 数学，画到 canvas 而非 DOM。
- [ ] **3c crane**（`crane.bridge`，`sameRectAs: philosophy.visual`）：把 `crane-transition.js` `renderRawProgress` 的视频/视差层复合进 canvas。
- [ ] **3d ttg / ph**（`lab.visual`/`education.visual`）：视频 scrub + 层栈复合进 canvas。
- [ ] 每步：`npm run build:page && npm run verify:homepage-transitions && npm run verify:homepage-timeline`，并 CDP 抽检该段 source surface 非空、墨水窗内 `[data-master-ink-active="true"]`。

**闸门（每 family）**：hold 与桥中 surface 非空；进出墨水桥非空；该 family 无重复 RAF。

---

### Phase 4：共享 belief.star producer（高风险：两场景一 surface）

**目标**：单个 producer 服务 `belief.upper`+`belief.lower`，相位由 `timelineProgress`（注册表已传 `state.scrollVh/totalVh`）派生，**绝不**用 per-segment `localProgress`。

- [ ] **Step 1**：建 `belief-star-surface-producer.js`，自持一个 `initStarFieldReveal`（`star-field-reveal.js`）WebGL 上下文 + pattern-bloom 莲花（`pattern-mirror-stage.js` 的 `createPatternBloomScene`）。
- [ ] **Step 2**：`renderAt({ timelineProgress, state, surfaceEntry })` 把跨 `home→belief.upper`、`belief.upper-hold`、`belief.upper→belief.lower`、`belief.lower-hold` 的全局位置映射成莲花 reveal/contract + 星场 strength，镜像 `pattern-bloom-adapter.js` 的 `renderOverlays`（~197-289）曲线窗与 `renderBackground({timeSeconds,strength,noiseFloor})`，复合进 canonical `belief.star` canvas。
- [ ] **Step 3**：注册表 `belief-star` 改指；`belief.js` `initBeliefStarField` 私有 RAF 在 master 模式下门控关闭（`main.js:92` 当前无条件调用）。
- [ ] **Step 4**：`npm run build:page && npm run verify:homepage-timeline && npm run verify:homepage-visual-timeline && npm run verify:homepage-master-timeline`
- [ ] **Step 5**（CDP）：`belief.upper` hold 非空；`belief-upper-to-belief-lower` 在 0.75 非空；反向同数学一致；belief.upper stagger 项存在。

**闸门**：共享 surface 在两个 hold 与 belief 间桥中正确，正反向一致。

---

### Phase 5：内容归位 scene/copy 层 + 零高 legacy 锚点 + 闸门反转

DOM 所有权反转。**5a（build 生成器）与 5b（闸门反转）放同一 commit。**

- [ ] **5a-1**：`build-index.mjs` `buildMasterVisualRoot`（213）/`buildMasterCopyRoot`（221）注入**真实**逐场景视觉/文案标记（源自 `src/sections/*.html`，按场景切分），保留契约要求的钩子：`data-master-copy-id="method.intro"`、`data-belief-upper-stagger` 项、paper 场景 `data-master-copy-theme="paper"`。
- [ ] **5a-2**：自然 `<section>` 流降为**零高语义锚点**，保留 `id`/`data-section-id` 供 hash 导航；hash 公共 id 留在真实锚点上（不归 `data-master-anchor`）。
- [ ] **5a-3**：`homepage-continuity.css` 反转 legacy-flow 规则：零高 legacy section 体（保锚点供 `scrollIntoView`），`[data-homepage-master-stage]` 成为可见 canonical 层，彻底移除 salvage `display:none` 姿态。
- [ ] **5b-1**：`check-homepage-master-track-structure.mjs` 反转断言——由"track 必须隐藏/不得克隆 hero/belief/brand 文案/不得退役真实 hero 流"改为"scene/copy 层必须含真实文案、legacy 为零高锚点但 id 可解析、stage 可见"；保留"单 track/stage/HUD/ink canvas、单 belief.star、每块一 HUD 切片、锚点不占 hash id"。
- [ ] **5b-2**：`check-homepage-visual-timeline-contract.mjs` 移除第 68 行禁 producer 绘制的断言（Strategy A 下绘制是目的），保留 manifest 形状与文案文本断言。
- [ ] **Step 6**：`npm run build:page && npm run verify:copy && npm run verify:section-transitions && npm run verify:homepage-master-track-structure && npm run verify:homepage-visual-timeline`
- [ ] **Step 7**：确认 `index.html` 不再双份渲染 section（今 `data-master-scene-visual` = 11 空壳；归位后每场景恰一份 canonical，legacy 零高）。

**闸门**：无重复场景；hash 导航解析到真实锚点；反转后的结构+视觉闸门绿；此后 `verify:all` 恢复全绿。

---

### Phase 6：Hero surface producer（最高风险，最后做）

**目标**：把 `home.visual` 渲染进 canonical surface，用 master 时钟取代 `initLayeredHero` 的 GSAP/ScrollTrigger/quickSetter 机制。

- [ ] **Step 1**：建 `hero-surface-producer.js`，把 hero 复合（back/middle/figure 层变换 + 深度滤镜，`updateHeroLayers` 524-728）、`introInkTransition`（`createInkSceneTransition`）、`exitInkTransition`（`createInkCurtainTransition`）画进 `home.visual` canvas，由 `state.blockProgress`/`timelineProgress` 驱动而非 `window.scrollY`/GSAP ticker。
- [ ] **Step 2**：视频用确定性 `seekVideo(figure, progress)`（审计稳定，同 aod/figure2 scrub）取代 `videoEnergy`/`gsap.ticker` 播放模型（465-504）。
- [ ] **Step 3**：注册表 `hero` 改指；`main.js` master 模式下停止把 `initLayeredHero`（114）/`initFallbackParallax`/`initBeliefStarField`（92）当独立视觉驱动；保留 reduceMotion/fallback 分支可导入。
- [ ] **Step 4**：`npm run build:page && npm run verify:all`
- [ ] **Step 5**（CDP）：`home` hold 含真实 figure 视频非空；`home-to-belief-upper` 桥正反向非空。

**闸门**：hero surface 确定性渲染；首条墨水桥点亮；`verify:all` 绿。

---

### Phase 7：清退 legacy 并行路径 + 私有时钟（清理）

- [ ] **Step 1**：`homepage-transition-runtime.js`：`initLegacyHomepageTransitions` 仅作 reduceMotion/非 master fallback；master 路径绝不实例化 `createHomepageSnapCoordinator`。
- [ ] **Step 2**：逐个 legacy adapter 确认 master 模式下无残留 `requestAnimationFrame`/`gsap.ticker.add`/`performance.now` 活动循环；`verify:handoff-ownership` 为守卫。
- [ ] **Step 3**：`hero.js`/`belief.js` 私有 RAF/ticker 门控在非 master 模式后。
- [ ] **Step 4**：`npm run build:page && npm run verify:transition-runtime && npm run verify:handoff-ownership && npm run verify:all`

**闸门**：单一 RAF 树（master 帧循环）；`verify:all` 绿；`verify:handoff-ownership` 绿。

---

### Phase 8：授权 CDP 视觉闭环闸门（最终）

**目标**：把审计改写为目标态，机械证明非空桥帧 + 无重复场景，六对必测段正反向。

- [ ] **Step 1**：`audit-homepage-directed-timeline-cdp.mjs` 反转 salvage 断言——`assertMasterStructure`（~359）去掉"stage 不可见 / 真实 hero/long-canvas 高 >100"，改断言 stage 为可见 canonical 层、legacy 为零高锚点且 id 可解析。
- [ ] **Step 2**：`copySelectors`（~238-250）与视频匹配从 legacy 选择器改到 canonical `[data-master-copy-id=...]`/`[data-master-surface=...]`。
- [ ] **Step 3**：六对必测段（正+反向）：`home→belief.upper`、`belief.upper→belief.lower`、`belief.lower→method`、`method.proof→brand`、`brand→services`、`philosophy→contact`。每段断言 source surface canvas 非空、墨水窗内 `[data-master-ink-active="true"]`、目标文案按策略可见、settle 后 direction 正确。
- [ ] **Step 4**（机械非空证明）：在桥中点采样 canvas 像素（亮度/方差探针），不仅看 dataset 标记；加"无重复场景"探针（每场景恰一可见 copy root）。
- [ ] **Step 5**：`npm run build:page && npm run verify:all && npm run audit:homepage-directed-timeline`
- [ ] **Step 6**：与 Phase 0 salvage 基线 diff 截图/`samples.json`，归档为闭环证据。

**闸门（视觉闭环）**：审计通过、零 `pageErrors`；六桥正反向非空；无重复场景；`verify:all` 绿。

---

## Rollback Boundary（回滚边界）

- 分支 `codex/homepage-directed-scene-timeline` 为 feature 分支，按阶段提交安全。
- **原子回退**：`build-index.mjs` 的 `MASTER_DOM_MODE`/`MASTER_TIMELINE_ENABLED` 常量控制 flag。保留一种姿态：把 `MASTER_DOM_MODE` 翻回 salvage 值并 `build:page` 即恢复 salvage 构建。
- **Phase 1-6 期间不删 legacy 代码**——`initLegacyHomepageTransitions` 保持可导入但不调用，任一阶段可单 commit 回退。
- 每阶段边界以命名的 `verify:*` 子集收绿；除"闸门反转"阶段（与产出改动同 commit）外，不留意外红。
- 若 Phase 3-6 暴露 master runtime 回归：回退该阶段的 producer/wiring commit，保留已迁移的更简单 family，**不要**部分恢复 adapter 私有 copy 所有权。

---

## Verification（端到端验收）

- 静态：`npm run verify:all`（含 12 个 verify 子项，build:page 在首）。
- 浏览器（已授权）：`npm run audit:homepage-directed-timeline` —— 六对段正反向非空桥帧 + 无重复场景 + 零 pageError，作为唯一视觉闭环判据。
- 人工抽检：DOM 中 `data-master-timeline-segment/-direction/-progress` 随滚动更新；`[data-master-surface=*]` canvas 像素非零；`[data-master-ink-canvas][data-master-ink-active]` 在墨水窗内翻真；section 不再双份。
