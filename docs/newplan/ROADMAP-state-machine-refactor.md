# Roadmap: 状态机与时序管理重构

本文档把 `docs/newplan/state-machine-refactor-plan.md` 和 `docs/newplan/IMPLEMENT-state-machine-refactor.md` 落成可执行 roadmap。历史上先按 Phase 0 / 0A / 1 推进；截至 Phase 5 收口，Phase 2-5 已落到默认 snap runtime 路径，legacy runtime 仅保留反向 debug fallback。

## 总计划步骤

1. **Phase 0 / W0：验证基建先行**  
   建立 frame、owner、adapter、harness 的自动化护栏，不改视觉行为。

2. **Phase 0A / W1：Pattern Harness 收口**  
   用最小复现先验证单一 controller、run identity、progress 语义和 provider 瘦身。

3. **Phase 1 / W2：SceneTimeline 收口**  
   让 `scene-timeline-controller` 成为唯一 `commit/present/cleanup` 入口，legacy runtime 只调用它。

4. **Phase 2：Director 接管播放生命周期**  
   `homepage-snap-runtime` / runtime integration 接入 SceneTimeline frame，adapter 只返回完成信号。

5. **Phase 3：Legacy Runtime 降级**  
   拆掉旧 runtime 的状态机职责，只保留临时兼容层。

6. **Phase 4：逐 join 迁移 adapter**  
   按 join 迁视觉 adapter；这是唯一允许调整视觉数值的阶段。

7. **Phase 5：清理和默认切换**  
   删除 legacy 状态机，`snapRuntime` 转默认，更新 ADR。

执行规则：

- 一个任务对应一个 commit。
- 每个 commit 前跑该任务验收命令和 `npm run verify:all`。
- 每个 workstream 结束跑 `npm run build:page`、`npm run verify:all`，并手工检查三个历史症状：无重复入场、无交接空白、无黑闪。
- W1 可在 T0.1 后开；W2 必须等 T0.2 / T0.4 / T0.6 / T0.7 完成后再动关键 runtime 路径。
- Phase 5 后默认入口为 `homepage-runtime-integration.js` / snap runtime；`homepage-transition-runtime.js` 不再拥有 handoff completion 或 target presentation 决策。

## Goal 0: Phase 0 / W0 验证基建

### 总目标

冻结状态机重构的安全边界：先让关键契约可测试、可自动阻断增量违规，并把 pattern-bloom 的本地阈值显性登记到 manifest 源头。本阶段不改变视觉行为。

### 技术栈

- JavaScript ESM
- Node `.mjs` verification scripts
- `package.json` npm scripts
- `src/section-manifest.mjs` + `scripts/build-index.mjs`
- JSDoc typedef / frozen object factory
- static source scanning with `rg`-style regex logic

### 参考文档

- `docs/newplan/IMPLEMENT-state-machine-refactor.md:6-21`：关键事实 F1-F10。
- `docs/newplan/IMPLEMENT-state-machine-refactor.md:23-49`：workstream 依赖和执行规则。
- `docs/newplan/state-machine-refactor-plan.md:431-455`：Phase 0 checklist 与新增验证脚本。
- `docs/newplan/state-machine-refactor-plan.md:581-610`：验证脚本应检查的契约。

### 实施方案

按 `docs/newplan/IMPLEMENT-state-machine-refactor.md:53-156` 执行：

- `T0.1` 接线 `verify:pattern-scene-harness`：`docs/newplan/IMPLEMENT-state-machine-refactor.md:55-64`。
- `T0.2` 冻结 `SceneTimelineFrame` 类型和 `verify:frame-contract`：`docs/newplan/IMPLEMENT-state-machine-refactor.md:66-74`。
- `T0.3` 新增 `verify:adapter-contract` 并建立 `KNOWN_VIOLATIONS` baseline：`docs/newplan/IMPLEMENT-state-machine-refactor.md:76-89`。
- `T0.4` 新增 `verify:homepage-owner-contract`：`docs/newplan/IMPLEMENT-state-machine-refactor.md:91-100`。
- `T0.5` 把 pattern-bloom 阈值落入 `src/section-manifest.mjs`：`docs/newplan/IMPLEMENT-state-machine-refactor.md:102-117`。
- `T0.6` 增加 manifest 区间和 `handoffOverlaps` 检查：`docs/newplan/IMPLEMENT-state-machine-refactor.md:119-123`。
- `T0.7` 给 `initHomepageTransitions` 加 root-bound 幂等守卫：`docs/newplan/IMPLEMENT-state-machine-refactor.md:125-154`。

### 验收标准

- `npm run verify:pattern-scene-harness` 绿。
- `npm run verify:frame-contract` 绿。
- `npm run verify:adapter-contract` 绿，新增违规能红，存量违规都在 `KNOWN_VIOLATIONS` 且带移除任务 ID。
- `npm run verify:homepage-owner-contract` 绿。
- `npm run build:page` 后生成 manifest 只新增计划内数据。
- `npm run verify:all` 绿。
- 无视觉行为变更。

## Goal 0A: Phase 0A / W1 Pattern Harness 收口

### 总目标

把 `scene-harness-pattern` 从 HTML / player / provider 三层状态，收敛为单一 `PatternSceneController`。controller 拥有 public phase 和 run identity；provider 只拥有渲染资源；HTML 只 dispatch command 和 render snapshot。

### 技术栈

- JavaScript ESM
- `js/runtime/timed-progress-driver.js`
- Canvas pattern renderer: `createPatternMirrorScene`
- `scene-harness-pattern.html`
- fake window / fake RAF Node tests
- compatibility facade module

### 参考文档

- `docs/newplan/state-machine-refactor-plan.md:73-95`：`scene-harness-pattern` 局部根因。
- `docs/newplan/state-machine-refactor-plan.md:208-341`：Pattern Scene Harness Controller 合约。
- `docs/newplan/state-machine-refactor-plan.md:457-474`：Phase 0A 迁移 checklist 和验收。
- `docs/newplan/state-machine-refactor-plan.md:612-619`：`verify:pattern-scene-harness` 应检查内容。
- `docs/newplan/IMPLEMENT-state-machine-refactor.md:160-226`：W1 详细任务。

### 实施方案

按 `docs/newplan/IMPLEMENT-state-machine-refactor.md:160-226` 执行：

- `T1.1` 让 `createTimedProgressDriver.play()` 支持 `from/to` partial ramp：`docs/newplan/IMPLEMENT-state-machine-refactor.md:164-168`。
- `T1.2` 修正 progress 语义，导出 `PATTERN_SOURCE_PROGRESS = 0` / `PATTERN_FINAL_PROGRESS = 1`：`docs/newplan/IMPLEMENT-state-machine-refactor.md:170-177`。
- `T1.3` 新建 `pattern-scene-provider.js` 并瘦身 provider：`docs/newplan/IMPLEMENT-state-machine-refactor.md:179-187`。
- `T1.4` 新建 `pattern-scene-controller.js`：`docs/newplan/IMPLEMENT-state-machine-refactor.md:189-201`。
- `T1.5` 把 `pattern-scene-player.js` 改为 facade，并改造 HTML：`docs/newplan/IMPLEMENT-state-machine-refactor.md:203-209`。
- `T1.6` 改写 run-identity 验收用例：`docs/newplan/IMPLEMENT-state-machine-refactor.md:211-224`。

### 验收标准

- `npm run verify:progress-driver` 绿，partial ramp 用例覆盖 `from:0.6 -> to:0`。
- `npm run verify:pattern-scene-harness` 绿。
- `npm run verify:all` 绿。
- `scene-harness-pattern.html` grep 不到 `currentRun`。
- `pattern-scene-player.js` grep 不到 `PLAYER_STATUS` / `activeToken`。
- `pattern-scene-provider.js` grep 不到 `activeRun` / `animateProgress`。
- Destroy 后再次 Mount 通过创建新 controller/player 实例完成，不复活 destroyed controller。

## Goal 1: Phase 1 / W2 SceneTimeline 收口

### 总目标

让 `scene-timeline-controller` 成为唯一 `commitTarget / presentTarget / cleanupJoin` 入口。target section、copy、timeline fixed copy、reveal 呈现必须在同一个同步 transaction 内完成，旧 runtime 不再直接操作 handoff completion。

### 技术栈

- JavaScript ESM
- `scene-timeline-controller`
- `SceneTimelineFrame`
- DOM dataset output attributes
- `reveal.js` helpers
- `CustomEvent('scene-timeline:presented')`
- static owner-contract checks

### 参考文档

- `docs/newplan/state-machine-refactor-plan.md:127-206`：目标架构、`SceneTimelineFrame`、Adapter 合约。
- `docs/newplan/state-machine-refactor-plan.md:476-495`：Phase 1 checklist 和验收。
- `docs/newplan/state-machine-refactor-plan.md:672-691`：状态碎片清单与目标归属。
- `docs/newplan/IMPLEMENT-state-machine-refactor.md:230-279`：W2 详细任务。

### 实施方案

按 `docs/newplan/IMPLEMENT-state-machine-refactor.md:230-279` 执行：

- `T2.1` 在 controller 上增加 `beginJoin / updateFrame / commitTarget / presentTarget / cleanupJoin / getFrame`：`docs/newplan/IMPLEMENT-state-machine-refactor.md:234-244`。
- `T2.2` 事务化 `presentTarget`：`docs/newplan/IMPLEMENT-state-machine-refactor.md:246-257`。
- `T2.3` 将 `section-presentation-controller` 降级为 helper：`docs/newplan/IMPLEMENT-state-machine-refactor.md:259-264`。
- `T2.4` 旧 runtime 的 `completePlayback / completePostScrollHandoff / completeDirectHashHandoff` 改道到 `sceneTimeline.presentTarget`：`docs/newplan/IMPLEMENT-state-machine-refactor.md:266-271`。
- `T2.5` 收口静态检查：`docs/newplan/IMPLEMENT-state-machine-refactor.md:273-279`。

### 验收标准

- `npm run verify:scene-timeline` 绿。
- `npm run verify:handoff-ownership` 绿。
- `npm run verify:homepage-transitions` 绿。
- `npm run verify:homepage-owner-contract` 绿。
- `npm run verify:all` 绿。
- `presentTarget` 全站唯一 target-present 入口。
- `presentedSections` grep 无结果。
- 无 prior frame 的 `presentTarget(joinId)` 能合成 terminal frame 并呈现 target。
- 手工回归 `home-belief` 和 `belief-method`：无黑闪、无文案二次入场。

## Goal 2: Phase 2 Director 接管播放生命周期

### 总目标

用 `homepage-snap-runtime` 作为唯一顶层状态机，`homepage-runtime-integration` 的 `scenePresenter` 接入 SceneTimeline frame。adapter `play()` 只返回完成/失败信号，不直接 present target。

### 技术栈

- `js/runtime/homepage-snap-runtime.js`
- `js/runtime/homepage-runtime-integration.js`
- `SceneTimelineFrame`
- per-scene adapter registry
- runtime recovery handler

### 参考文档

- `docs/newplan/state-machine-refactor-plan.md:497-511`：Phase 2 checklist 和验收。
- `docs/newplan/IMPLEMENT-state-machine-refactor.md:283-290`：Phase 2-5 入口条件概要。
- `docs/newplan/state-machine-refactor-plan.md:621-647`：运行时 phase 和 recovery 验收。

### 实施方案

- 入口条件：W1 + W2 完成，`npm run verify:snap-runtime` 绿。
- 在 runtime integration 中把 scenePresenter 的播放状态接入 SceneTimeline frame。
- Director 进入 `Playing` 时调用 adapter `play()`。
- Director 进入 `Completing` 时由 SceneTimeline 执行 commit / present / cleanup。
- recovery 统一走 `RecoverPresentTarget`，最终由 SceneTimeline 呈现 target 或 lastSafeScene。
- Phase 2 期间保留 `?snapRuntime=1` pilot；Phase 5 完成后 snap runtime 默认启用。

### 验收标准

- snap runtime 默认路径下只有 `homepage-snap-runtime` 消费 wheel / touch / key。
- 播放失败释放滚动，并呈现安全 target 或 lastSafeScene。
- `window.__homepageRuntime.getState()` 能解释当前页面状态。
- runtime phase 可观察到 `FreeScroll -> SnapAligning -> SnappedArmed -> TriggeredPlayback -> Playing -> Completing -> ReleaseCooldown`。
- `npm run verify:snap-runtime` 和 `npm run verify:all` 绿。

## Goal 3: Phase 3 Legacy Runtime 降级

### 总目标

旧 `homepage-transition-runtime` 不再拥有状态机职责。它只保留 legacy adapter mount / 兼容层能力，lock、gate、direct-hash alignment、handoff complete 等职责迁出或删除。

### 技术栈

- `js/transitions/homepage-transition-runtime.js`
- adapter mount registry
- SceneTimeline transaction APIs
- Director initial state / recovery branch

### 参考文档

- `docs/newplan/state-machine-refactor-plan.md:513-529`：Phase 3 checklist 和验收。
- `docs/newplan/state-machine-refactor-plan.md:657-670`：风险和边界。
- `docs/newplan/state-machine-refactor-plan.md:672-691`：旧 runtime 状态碎片归属。
- `docs/newplan/IMPLEMENT-state-machine-refactor.md:283-290`：Phase 3 入口条件概要。

### 实施方案

- 入口条件：Phase 2 在至少 2 个 join 上稳定。
- 从 `homepage-transition-runtime.js` 抽出 adapter mount registry。
- 删除或旁路 `lockScroll / unlockScroll`。
- 删除或旁路 `beginTargetRevealGate / releaseTargetRevealGate`。
- 删除旧 `completePlayback / completePostScrollHandoff` 的状态机职责。
- 删除 direct-hash alignment retry timers，改由 Director 初始状态分支处理。
- 保留旧 path 作为视觉兼容层，直到所有 join 迁完。

### 验收标准

- 同一运行模式下不存在两个 scroll lock owner。
- handoff complete 只能由 SceneTimeline 发出。
- `DIRECT_HASH_ALIGNMENT_DELAYS` 相关 retry 组移除或不再参与状态机职责。
- 旧 runtime 不再直接写 target presented 状态。
- `npm run verify:all` 绿。

## Goal 4: Phase 4 按 Join 迁移 Adapter

### 总目标

按 join 顺序把 adapter 改为被动消费 frame：不直接滚动、不直接 present target、不移动真实 DOM、不反推 timeline。pattern-bloom 在本阶段处理黑闪、阈值重叠和本地布尔状态。

### 技术栈

- homepage adapter modules
- `js/transitions/pattern-bloom-adapter.js`
- `SceneTimelineFrame`
- manifest phases / handoffOverlaps
- Canvas / video / WebGL renderers
- static adapter-contract checks

### 参考文档

- `docs/newplan/state-machine-refactor-plan.md:181-206`：Adapter 合约和禁令。
- `docs/newplan/state-machine-refactor-plan.md:531-555`：Phase 4 join 顺序和 pattern-bloom 专项。
- `docs/newplan/state-machine-refactor-plan.md:598-610`：`verify:adapter-contract` 检查项。
- `docs/newplan/IMPLEMENT-state-machine-refactor.md:283-290`：Phase 4 入口条件概要。

### 实施方案

按顺序迁移：

1. `home-belief` / `pattern-bloom`
2. `belief-method` / `aod`
3. `method-proof-brand` / `figure2`
4. `brand-services` / `figure3`
5. `philosophy-contact` / `crane`

每个 adapter：

- 从 `render(frame)` 派生视觉状态。
- 移除 `timeline.update()` / `timeline?.update()`。
- 不再读取 DOM data attribute 做逻辑判断。
- 不移动真实 target copy DOM，过渡素材只用 clone / snapshot / canvas / texture。
- 只通过 `reportFrame()` 上报播放进度，通过 `reportMilestone()` 上报 `targetReady / playbackComplete / mediaReady`；视觉写入只发生在 Director 回传的 `render(frame)`。

pattern-bloom 专项：

- 去掉本地一次性布尔 / 跨帧派生状态。
- 将 Phase 0 登记的阈值变为有序区间表。
- 修复 `topSceneOpacity` 边界硬切。
- 前景 canvas、背景 scene、belief 文案在同一个 `render(frame)` 中从同一 progress 推导。

### 验收标准

- 每个 adapter 迁移后 `npm run verify:adapter-contract` 绿，且 `KNOWN_VIOLATIONS` 清单减少。
- `render(frame)` 对同一 frame 幂等。
- SceneTimeline 输出的 `copyOwner` 在截图/日志中无重复。
- pattern-bloom 相邻帧 opacity 差值受控，无第二幕到第三幕黑闪。
- `npm run verify:all` 绿。
- 手工回归五个 join 的正向和反向路径。

## Goal 5: Phase 5 清理和默认切换

### 总目标

删除废弃 legacy 路径，把 snap runtime 从 opt-in 改为默认，并更新 ADR / owner contract 文档，让新架构成为项目默认事实。

### 技术栈

- `homepage-snap-runtime`
- SceneTimeline
- adapter registry
- docs / ADR
- `package.json` verification scripts

### 参考文档

- `docs/newplan/state-machine-refactor-plan.md:557-565`：Phase 5 checklist。
- `docs/newplan/state-machine-refactor-plan.md:693-721`：文件清单和参考文档。
- `docs/newplan/IMPLEMENT-state-machine-refactor.md:283-290`：Phase 5 入口条件概要。

### 实施方案

- 入口条件：全部 join 已完成 Phase 4 迁移。
- 删除废弃 handoff receiver / preview 路径。
- 删除 legacy runtime 的 gate / receiver / deprecated `timeline.update` 状态机入口。
- snap runtime 改为默认，仅保留 `?legacyRuntime=1` / `?snapRuntime=0` 临时 fallback flag。
- 更新 owner / frame / adapter contract 验证，确保 adapter 只消费 frame 并上报 milestone。
- 清理 `KNOWN_VIOLATIONS` baseline，保留空清单防新增违规。
- 更新 `docs/ADR-homepage-js-snap.md` / `docs/ADR-homepage-reverse-playback.md`，记录 Phase 5 后默认 runtime 与 fallback 边界。

### 验收标准

- 所有 join 默认走新 runtime。
- legacy 状态机代码不可达或已删除。
- `npm run verify:all` 绿。
- 文档和 ADR 与代码事实一致。
- `verify:homepage-owner-contract` 不再输出 known reveal owner violations。
- 全站手工回归通过：正向滚全程、反向滚 `home-belief`、直达 `#method` hash、reduced-motion。
