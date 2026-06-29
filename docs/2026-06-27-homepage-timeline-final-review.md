# 首页 Master Timeline / 转场架构最终 Review

日期：2026-06-27
目标 worktree：`/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/homepage-directed-scene-timeline`
核验对象：

- `docs/2026-06-27-homepage-master-timeline-review.md`
- `docs/REVIEW-homepage-timeline-2026-06-27.md`
- `docs/2026-06-27-homepage-timeline-architecture-review.md`

核验方式：

- 只读核验目标 worktree 的源码、生成 HTML、CSS、脚本和迁移计划。
- 未运行 Playwright/CDP 审计，遵守“没指明时不要使用 playwright”。
- 已运行 `npm run verify:all`，结果通过；但该命令不包含 Playwright/CDP 审计，且当前静态检查会固定 salvage/legacy 并行状态。

## 0. 最终结论

当前代码里确实已经有一套 Master Timeline 架构骨架：manifest、scroll map、resolver、scene registry、scene presenter、surface producer registry、single ink compositor 都存在，并且 master runtime 每帧会计算状态。

但是，当前用户真实看到的画面仍然不是 Master Timeline 驱动的画面。`data-master-timeline-enabled="true"` 时，runtime 明确同时启动 legacy runtime 和 master runtime；master runtime 处于 salvage/diagnostic mode，只观察旧视觉流、更新 HUD 和状态数据，不挂载 master adapters，也不渲染真实 canonical surfaces。

所以更准确的一句话是：

> Master Timeline 的设计骨架存在，但当前可见页面仍由 legacy flow 驱动；master 现在主要是 observer surfaces + HUD diagnostics。

这意味着“整体时间线能不能和转场、动画配合上”的答案是：

- 架构设计上可以。
- 当前实现里没有真正配合上。
- 不能跨幕重叠的主要原因不是“有整体时间线”，而是整体时间线还没有接管可见渲染，legacy adapters 仍在使用自己的 progress source、RAF、本地 ink/视频/canvas 和旧 handoff 心智。

## 1. 当前运行态事实

### 1.1 master flag 已开启，但两套 runtime 明确并行启动

生成页面已经开启 master：

- `index.html:2`：`data-master-timeline-enabled="true"`、`data-master-dom-mode="master-visible"`
- `scripts/build-index.mjs:15-16`：构建脚本硬编码 `MASTER_TIMELINE_ENABLED = true`、`MASTER_DOM_MODE = 'master-visible'`

但是 `initHomepageTransitions()` 在 master enabled 时不是二选一，而是两边都启动：

- `js/transitions/homepage-transition-runtime.js:1022-1029`
  - `1027` 启动 `initLegacyHomepageTransitions(options)`
  - `1028` 启动 `initMasterHomepageTransitions(options)`

这不是“可能并行”，而是当前代码明确并行。

### 1.2 master runtime 每帧计算状态，但不接可见 adapters

master runtime 初始化了这些模块：

- `createMasterTimelineModel`
- `createMasterScrollMap`
- `createMasterSceneRegistry`
- `createMasterScenePresenter`
- `createMasterSurfaceProducerRegistry`
- `createMasterInkCompositor`

见 `js/transitions/homepage-transition-runtime.js:1042-1068`。

每帧顺序也存在：

- `applyLayout(state)`
- `renderSurfaceProducers(state)`
- `renderMasterVisualState(state)`
- `masterInkCompositor.render(state)`
- `applyVisibility(state)`

见 `js/transitions/homepage-transition-runtime.js:1281-1297`。

但关键问题是：

- `mountMasterHomepageAdapters()` 只定义于 `js/transitions/homepage-transition-runtime.js:1346-1379`，没有调用。
- `mountSceneRenderer()` 只定义于 `js/transitions/homepage-transition-runtime.js:1116-1118`，没有外部调用点。
- 启动处只调用 `mountMasterSurfaceProducers()`，随后进入 HUD/salvage 模式。

源码注释已经直接说明当前意图：

- `js/transitions/homepage-transition-runtime.js:1381-1383`
  - master-visible salvage mode observes the real legacy visual flow
  - do not mount transition adapters
  - legacy runtime owns the real DOM/video stages
  - master runtime only drives HUD/state diagnostics

因此，Master Timeline 目前在算状态，但不是可见视觉权威。

### 1.3 master stage 被隐藏，HUD 反而可见

master stage 在 `master-visible` 下被 CSS 隐藏：

- `css/components/homepage-continuity.css:416-422`
  - `display: none`
  - `height: 0 !important`
  - `opacity: 0 !important`
  - `visibility: hidden !important`

这会让 master scene layer、surface layer、copy layer、ink canvas 都不成为真实可见画面。

但 HUD 是 stage 的兄弟节点，不在这个隐藏规则里：

- `index.html:165`：`<aside data-master-timeline-hud>`
- `index.html:170`：HUD track 暴露 `role="slider"`、`tabindex="0"`
- `css/components/homepage-continuity.css:142-158`：HUD fixed 定位、`z-index: 140`、`pointer-events: auto`

所以 HUD 不只是诊断状态，它是真实用户可见、可交互、可聚焦的调试面板泄漏。

### 1.4 canonical surfaces 目前全是 observer stub，不绘制真实内容

`homepageSurfaceProducerRegistry` 里 13 个 producer 都指向同一个 observer：

- `js/transitions/homepage-transition-registry.js:15-29`

observer producer 只做 dataset 标记：

- `js/transitions/homepage/master-observer-surface-producer.js:1-15`
  - `masterSurfaceReady = 'true'`
  - `masterSurfaceSource = 'real-flow-observer'`
  - `inkTextureReady = 'true'`
  - 没有绘制 canvas、video、image 或真实 scene texture

因此第三份架构 review 里“canonical surface registry 是解决跨幕连续性的答案”这个设计判断是合理的，但不能误读为当前已经在真实画面中生效。当前 canonical surface 机制还没有承载真实视觉。

### 1.5 真实页面仍是 legacy section + transition hosts

`index.html` 里真实 section 仍存在：

- `#home` 从 `index.html:203` 开始
- `#belief` 从 `index.html:227` 开始
- `#method` 从 `index.html:251` 开始
- `#brand` 从 `index.html:299` 开始
- `#services` 从 `index.html:317` 开始
- `#lab` 从 `index.html:336` 开始
- `#education` 从 `index.html:376` 开始
- `#philosophy` 从 `index.html:408` 开始
- `#contact` 从 `index.html:417` 开始

旧 transition hosts 也仍存在，例如：

- `home-belief`：`index.html:226`
- `belief-method`：`index.html:248`
- `figure2` bridge：`index.html:280`
- `brand-services`：`index.html:316`
- `services-lab`：`index.html:335`
- `lab-education`：`index.html:375`
- `philosophy-contact`：`index.html:416`

换句话说，当前可见页面不是“master scene DOM 取代旧 sections”，而是旧 section 流仍完整存在。

## 2. 适配器迁移状态

### 2.1 适配器仍是 pull/RAF/本地资源模型

当前 adapters 仍然通过 `progressSource()` 拉进度，内部跑 RAF，并且部分创建自己的 ink/canvas/video：

- Pattern Bloom：
  - `progressSource`：`js/transitions/pattern-bloom-adapter.js:36`
  - 本地 ink：`js/transitions/pattern-bloom-adapter.js:83-108`
  - `timeline?.updateJoin()`：`js/transitions/pattern-bloom-adapter.js:213-221`
  - `timeline?.getOwnership()`：`js/transitions/pattern-bloom-adapter.js:230-232`
  - RAF：`js/transitions/pattern-bloom-adapter.js:288`

- AOD：
  - 本地 `createInkCurtainTransition`：`js/transitions/homepage/aod-homepage-adapter.js:56-63`
  - `progressSource()`：`js/transitions/homepage/aod-homepage-adapter.js:91`
  - `timeline?.updateJoin()`：`js/transitions/homepage/aod-homepage-adapter.js:99`
  - RAF：`js/transitions/homepage/aod-homepage-adapter.js:128`

- Figure2：
  - `progressSource()`：`js/transitions/homepage/figure2-homepage-adapter.js:220`
  - `timeline?.updateJoin()`：`js/transitions/homepage/figure2-homepage-adapter.js:231`
  - RAF：`js/transitions/homepage/figure2-homepage-adapter.js:276`

- Figure3：
  - `progressSource()`：`js/transitions/homepage/figure3-homepage-adapter.js:35`
  - `timeline?.updateJoin()`：`js/transitions/homepage/figure3-homepage-adapter.js:38`
  - RAF：`js/transitions/homepage/figure3-homepage-adapter.js:58`

- Crane：
  - `progressSource()`：`js/transitions/homepage/crane-homepage-adapter.js:59`
  - `timeline?.updateJoin()`：`js/transitions/homepage/crane-homepage-adapter.js:62`
  - RAF：`js/transitions/homepage/crane-homepage-adapter.js:84`

- TTG：
  - `progressSource()`：`js/transitions/homepage/ttg-homepage-adapter.js:53`
  - `timeline?.update()`：`js/transitions/homepage/ttg-homepage-adapter.js:57`
  - RAF：`js/transitions/homepage/ttg-homepage-adapter.js:91`

- PH：
  - `progressSource()`：`js/transitions/homepage/ph-homepage-adapter.js:35`
  - `timeline?.update()`：`js/transitions/homepage/ph-homepage-adapter.js:37`
  - RAF：`js/transitions/homepage/ph-homepage-adapter.js:44`

这说明“文件级模块化”已经存在，但还不是 master 架构要求的纯 push renderer/component。

目标契约应该是：adapter 接收 master state，或者 surface producer 接收 state/progress 后写 canonical surface，不再自持滚动进度、RAF、ownership、私有 ink。

### 2.2 `timeline?.updateJoin()` 残留是真问题，但不是旧 controller 仍在工作的证据

第三份 review 说旧 timeline controller 没被移除，这个不准确。

当前 worktree 中：

- `js/transitions/homepage/scene-timeline-controller.js` 是删除状态。
- runtime 不再 import `scene-timeline-controller`。
- `scripts/check-homepage-master-timeline.mjs:375` 还断言 runtime 不得出现 `scene-timeline-controller`。

同时，legacy 初始化里明确：

- `js/transitions/homepage-transition-runtime.js:1405`：`const sceneTimeline = null`

snap controller 的 timeline 来自 `sceneTimeline?.createAdapterContext(host)`：

- `js/transitions/homepage-transition-runtime.js:914-915`

所以 adapters 里的 `timeline?.updateJoin()` / `timeline?.getOwnership()` 是旧 API 残留和迁移债务，但多数运行时影响会是 no-op，不应说成旧 scene timeline controller 仍在真实工作。

## 3. 为什么“上一幕一部分、下一幕一部分”当前做不好

原因不是“整体时间线导致做不到”。相反，整体时间线的 resolver 设计正是为跨幕共存准备的：

- `resolveMasterTimelineState()` 同帧计算 from/to scene：`js/transitions/homepage/master-scroll-timeline.js:204-239`
- `visualHandoffAt` 决定 from/to z 序交接：`master-scroll-timeline.js:216`、`master-scroll-timeline.js:226`
- target copy 的 `policy: 'overlap'` 已在 manifest 中声明，例如 `src/section-manifest.mjs:499`、`537`、`564`、`591`

当前做不好的真实原因是：

1. 可见画面仍由 legacy runtime 和 legacy adapters 驱动。
2. adapters 自己拉 progress、跑 RAF、创建本地 ink/video/canvas，跨幕时不是同一套 canonical surface。
3. master surfaces 目前只是 observer，不绘制可采样的真实 settled frame。
4. master adapters 和 scene renderers 没挂载，resolver 算出的 from/to state 没有成为可见渲染。
5. 旧 visual initializers 在 master enabled 时仍启动：
   - `js/main.js:91-92`：`initBeliefStarField(...)`
   - `js/main.js:109-115`：非 reduced motion 下仍 `initLayeredHero(...)`

### 关于 target reveal gate 的修正

第一份 review 把 `DEFAULT_TARGET_GATE_RELEASE_PROGRESS = 0.86` 描述成普遍禁止目标提前露出，这个结论需要收窄。

默认阈值确实存在：

- `js/transitions/homepage-transition-runtime.js:33`

但 `shouldGateTargetReveal()` 只有在以下条件都满足时才 gate：

- 有 handoff target
- 没有 timeline joins
- 没有 handoffId
- 没有 handoffPhase

见 `js/transitions/homepage-transition-runtime.js:103-109`。

而当前许多关键 transition host 都带 `handoffId` 或 `handoffPhase`，例如 `home-belief`、`belief-method`、`figure2`、`figure3`、`crane`。所以 gate 是 legacy 问题的一部分，但不能说所有跨幕失败都由 0.86 gate 普遍造成。

## 4. 测试和校验状态

### 4.1 `verify:all` 通过，但不能证明 master 可见闭环

`npm run verify:all` 已通过。

但 `package.json:21-22` 显示：

- `audit:homepage-directed-timeline` 单独存在。
- `verify:all` 没有包含该 audit。

更重要的是，静态脚本目前会固定 salvage 状态：

- `scripts/check-homepage-master-timeline.mjs:377` 要求存在 `real legacy visual flow`。
- `scripts/check-homepage-master-timeline.mjs:380` 要求 master enabled mode 也启动 `initLegacyHomepageTransitions(options)`。
- `scripts/check-handoff-ownership.mjs:29-30` 同样要求 legacy runtime 和 salvage 注释存在。

所以当前绿色检查的含义不是“Master Timeline 已接管画面”，而是“当前 salvage/observer 架构符合脚本预期”。

### 4.2 当前 CDP audit 也不是 master 接管审计

未运行 Playwright/CDP 审计。

从源码看，`scripts/audit-homepage-directed-timeline-cdp.mjs` 会使用 Playwright：

- `scripts/audit-homepage-directed-timeline-cdp.mjs:7`

并会写输出目录：

- `scripts/audit-homepage-directed-timeline-cdp.mjs:11`

它当前断言的是 salvage 现状，而不是 master 接管完成：

- `scripts/audit-homepage-directed-timeline-cdp.mjs:359-368`
  - HUD 必须可见
  - master stage 必须不可见
  - real hero flow 必须存在
  - real long-canvas flow 必须存在
  - real belief star field 必须留在 Belief section

因此，把这个 audit 直接加入 `verify:all` 也不足以证明 master 视觉闭环，反而会进一步固定 salvage 状态。需要重写 audit 目标后再纳入最终闸门。

## 5. 对三份原 review 的准确性判断

### 5.1 `2026-06-27-homepage-master-timeline-review.md`

总体准确，约 8.5/10。

属实：

- 两套 runtime 并行。
- master adapters 没挂载。
- surface producers 是 observer stub。
- master stage 隐藏，HUD 可见。
- `verify:all` 通过但不证明视觉闭环。
- “整体时间线是解法，但还没接上”这个核心判断正确。

需要修正：

- “target gate 0.86 普遍禁止提前露出”过强，应按 `shouldGateTargetReveal()` 条件收窄。
- “audit 当前失败于 hero opacity:0”没有在本次核验中运行确认；只能说 audit 会检查该类状态，不能当成已复现失败。
- “所有检查都是静态文本/正则”略粗；其中有 resolver/model 断言，但没有浏览器/像素闭环。

### 5.2 `REVIEW-homepage-timeline-2026-06-27.md`

总体准确，约 7.5/10。

属实：

- Master Timeline 设计存在，但没有接管画面。
- legacy 系统仍是真实视觉路径。
- adapters 仍是自治组件，不是 master push renderer。
- canonical surface / single compositor 是目标架构答案。

需要修正：

- 多处行号已过期。
- “大多数 section 出现两次”表达不精确；真实 `<section id="...">` 只有一份，master 层是空的 `div data-master-scene-root` / `data-master-copy-root` scaffold。
- 漏掉 HUD 可见且可交互这个 P0 风险。
- 对当前 CDP audit 的“视觉闭环”作用偏乐观。

### 5.3 `2026-06-27-homepage-timeline-architecture-review.md`

总体大方向对，但偏乐观，约 6.5-7/10。

属实：

- Master Timeline 基建存在。
- adapters 迁移未完成。
- Pattern Bloom / AOD 等旧 API 和本地 ink 证据抓得更具体。
- canonical surface registry 是跨幕连续性的目标答案。

需要修正：

- “70% complete”“B/B+”“2-3 days”缺少足够证据，偏乐观。
- dual runtime 不只是可能，而是明确并行。
- “single ink canvas for entire homepage”只能说 master 基建存在，当前可见路径仍有 legacy 本地 ink。
- “旧 timeline controller 没移除”不准确；controller 文件已删除，当前是 adapter 残留 API 和 null timeline/no-op 债务。
- `verify:homepage-master-timeline` 不会暴露 adapter 旧 API，当前反而要求 salvage/legacy 并行。
- 漏掉 master stage 隐藏、HUD 可见、producer 全 observer、`main.js` 旧视觉 initializer 仍运行等核心运行态风险。

## 6. 风险清单

| 优先级 | 风险 | 证据 | 影响 |
| --- | --- | --- | --- |
| P0 | `master-visible` 名不副实 | runtime 同时启动 legacy/master；master stage display:none | 维护者会误判当前已经迁移完成 |
| P0 | HUD 泄漏给用户 | `index.html:165`，`homepage-continuity.css:142-158` | 生产 UI 出现调试面板，且可聚焦可交互 |
| P0 | master surfaces 不绘制真实内容 | registry 全 observer | single compositor 无真实 canonical texture 可采样 |
| P0 | 静态检查固定 salvage 状态 | check scripts 要求 legacy runtime | 绿色 CI 给错误安全感 |
| P1 | adapters 仍自持 RAF/progress/ink | Pattern Bloom、AOD、Figure2、Figure3、Crane、TTG、PH | 仍是多时钟、多 owner、多纹理路径 |
| P1 | 旧视觉 initializer 在 master enabled 下运行 | `main.js:91-115` | 即使 master 接入，也可能双重绘制或资源冲突 |
| P1 | CDP audit 目标错误 | audit 要求 HUD 可见、master stage 不可见 | 直接纳入 verify 会固化当前错误目标 |
| P2 | 旧 API 残留但运行时 no-op | `sceneTimeline = null`，adapter `timeline?.*` | 代码认知负担高，后续迁移易误判 |

## 7. 修复建议

### 7.1 先做决策：诚实回退，还是真正接管

当前有两个合理方向。

方向 A：诚实回退 flag

- 把生成页面改回 `data-master-timeline-enabled="false"`、`data-master-dom-mode="legacy-visible"`。
- 保留 master scaffold 和静态模型。
- 停止向用户暴露 HUD。
- 适合短期不准备完成 master 可见迁移的情况。

方向 B：真正完成 master 可见迁移

- 保持或重新开启 `true/master-visible` 前，必须先让 master runtime 成为唯一视觉权威。
- 不能只改 dispatcher 停掉 legacy。因为当前 master stage 被隐藏、producer 不绘制、adapters 没挂载；直接停 legacy 会让可见内容断掉。

### 7.2 P0 止血

1. 隐藏或移除 HUD。至少只在显式 debug flag/query 下显示。
2. 去掉“master-visible 但 stage display:none”的矛盾状态，或回退 DOM mode。
3. 修改静态检查，不再要求 `real legacy visual flow` 和 `initLegacyHomepageTransitions(options)` 在 master enabled 模式存在。
4. 重写 CDP audit 的目标：最终版应该断言 master stage 可见、legacy visual flow 不再是主要画面、HUD 默认不可见、canonical surfaces 有真实可采样内容。

### 7.3 P1 迁移顺序

建议按最小可验证切片推进：

1. `home-to-belief-upper`
   - 做真实 `hero` / `belief-star` surface producer。
   - 让 Pattern Bloom 去掉本地 reveal/exit ink 和内部 ownership。
   - 让 master compositor 采样 canonical surfaces。

2. `belief-upper-to-belief-lower`
   - 重点验证同一个 `belief.star` surface 在两幕之间连续存在。
   - 验证 copy overlap，而不是用旧 section pinning 伪装。

3. `belief-lower-to-method`
   - 迁移 AOD。
   - 去掉 adapter-local `createInkCurtainTransition`。

4. `method-proof-to-brand`、`brand-to-services`、`philosophy-to-contact`
   - 分别迁移 Figure2、Figure3、Crane bridge surface。

5. 最后处理 TTG、PH 和 soft segments。

每迁移一段，必须同时满足：

- adapter 不再自持 RAF/progressSource 作为主时钟。
- surface producer 绘制真实 canonical surface。
- master compositor 采样 source/target canonical surface。
- legacy runtime 不再并行拥有该段视觉。
- 浏览器审计目标对应 master 接管，而不是 salvage。

## 8. 对用户问题的最终回答

### 时间线能不能和转场、动画配合上？

设计上能。当前没有真正配合上。

Master Timeline resolver 已经能同帧计算 from/to scene、copy、visual、ink 状态；但这些状态没有接到可见 adapters / scene renderers / real surface producers 上。屏幕上主要还是 legacy flow。

### 动画、转场是不是组件？

当前是文件级模块，不是 master 架构意义上的纯组件。

现在的 adapters 仍混合了：

- lifecycle
- progress 拉取
- RAF
- 本地 ink/video/canvas
- copy timing
- legacy ownership/updateJoin

目标应该拆成：

- adapter：生命周期和少量 bridge glue
- surface producer：确定性渲染 canonical surface
- timeline resolver/presenter：统一决定 timing、presence、copy readable/foreground、z 序

### 为什么不能很好做到“一部分在上一幕、一部分在下一幕”？

因为当前可见系统仍是 legacy 转场窗口模型，不是 master canonical surface 模型。

旧系统里 transition texture、settled DOM、copy reveal、target section handoff 分散在不同 owner 里；一些 adapter 还用本地 ink/canvas/video。Master Timeline 设计本来能解决这个问题，但当前只是在计算和观察，没有接管真实画面。

### 是不是有了一个整体时间线？

有，但还没成为可见视觉权威。

准确说：整体时间线已实现为数据和运行时状态机；尚未实现为完整可见渲染系统。

## 9. 本次核验没有覆盖的内容

- 未运行 Playwright/CDP，所以没有对真实浏览器像素、视频帧、截图做本轮确认。
- 未评估动画美术效果是否符合设计预期。
- 未测移动端 viewport。
- 未测滚动手感、输入锁、hash navigation 在真实浏览器中的交互质量。

这些都应在修正 audit 目标后作为最终验收，而不是用当前 salvage audit 代替。
