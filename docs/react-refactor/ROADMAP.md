# Roadmap：Cinematic Story Runtime 重写

入口文档：`README.md`。配套文档：`ARCHITECTURE.md`（目标架构与契约）、`MIGRATION.md`（复用与退役清单），阶段执行清单见 `goals/`。
本 roadmap 最初作为替代性总体规划创建；R0-R4 已落地。旧站基线现固定为 `react-refactor-legacy-static-baseline`，R5 从 `react-refactor-r4-closeout` 开始；state-machine / scene-runtime 系列分支继续只作历史参考。

## 当前执行纪律

- R0-R4 的历史分支链不再是新工作起点；R5 只能从 `react-refactor-r4-closeout` 创建。
- 不得从浮动 `main`、`codex/state-machine-refactor-roadmap` 或 scene-runtime 实验分支重新组装 R5。
- 包管理器先定 pnpm workspace：R0 在根 `package.json` 增加精确 `packageManager: "pnpm@<version>"`，提交 `pnpm-workspace.yaml`，沿用并更新 `pnpm-lock.yaml`，CI 使用 `corepack enable && pnpm install --frozen-lockfile`；阶段验收命令统一为 `pnpm -C app test`。除非先补 ADR，否则不得临时改 npm/yarn workspace。
- 一个任务一个 commit；commit 前跑该任务验收命令 + `pnpm -C app test`（Vitest 全量）。
- 每个阶段收口跑 Playwright 回归 + 手工检查三大历史症状：**无重复入场、无交接空白、无黑闪**。
- 旧静态站从 R0 起冻结（只允许 hotfix），作为 R5 平价验收的对照 baseline。
- R3 只允许为还原旧站而修正搬运误差；新的审美调参、节奏改写、视觉数值偏好调整只允许发生在 R4。
- **R2 未收口前禁止迁移任何真实 scene**（合成场景先把交接协议打通）。
- **R2 收口不等于播放顺序/状态机已彻底解决**。R2 只证明合成场景协议；R3 pilot 负责真实媒体、copyCue、React effect、浏览器媒体事件的 truth pass。

## 分支策略与历史链

```txt
main
  └── codex/react-refactor-plan
        └── codex/react-refactor-r-1-inventory
              └── codex/react-refactor-r0-scaffold
                    └── codex/react-refactor-r1-runtime-skeleton
                          └── codex/react-refactor-r2-stage-handoff
                                └── codex/react-refactor-r3-pilot
                                      └── codex/react-refactor-r4-*
                                            └── react-refactor-r4-closeout
                                                 └── codex/react-refactor-r5-parity-cutover
                                                      └── HITL-approved cutover
                                                           └── codex/react-refactor-r6-cleanup
```

- `codex/react-refactor-plan`：只提交 `docs/react-refactor/`，确认架构、迁移边界、阶段 goal；PR 标题建议 `docs: add cinematic story runtime rewrite plan`。
- R-1 到 R3 串行推进，避免在契约未稳定前并行写散。
- R4 可按 story group 并行 worktree，但每个分支必须从 R3 收口点开，合并顺序按 canonical spine。
- R4 使用 merge train：每个 group 合入集成分支后，必须在集成分支重跑 R2 全套逐帧断言 + R3 pilot 回归；共享协议变化先回集成分支，不允许各 group fork 私版。figure2/proof 高风险 group 必须在 groups 4-7 之前进入 merge train，避免后段才暴露共享协议缺口。
- R5 与 R6 各保留一个阶段分支；不再为设备矩阵、SEO、性能或 cleanup 子项创建长期分支。R6 只在 R5 cutover 获批后创建。
- `codex/state-machine-refactor-roadmap`、`codex/scene-runtime-*`、`react-rewrite/*` 只作对照资料，不作为新分支父级。
- 仍在旧 route/runtime helper 方向上的 PR 不再合入主线；统一标注 superseded / reference only，只能作为 R-1 inventory 的历史证据来源。

## 历史规划基线

最初的 `codex/react-refactor-plan` 是 docs-only 契约基线；该阶段已经完成。当前事实以 app 代码、阶段 tag、`R4-CLOSEOUT.md` 和 R5/R6 goal 为准。旧 route/runtime helper 方向仍为 **superseded / reference only**。

## 阶段 Goal

每个阶段的执行步骤写在 `docs/react-refactor/goals/`，阶段开始前先读对应 goal，完成后用验收项收口：

| 阶段 | Goal 文件 |
|---|---|
| R-1 | `goals/R-1-inventory.md` |
| R0 | `goals/R0-scaffold.md` |
| R1 | `goals/R1-runtime-skeleton.md` |
| R2 | `goals/R2-stage-handoff.md` |
| R3 | `goals/R3-pilot.md` |
| R4 | `goals/R4-full-migration.md` |
| R5 | `goals/R5-parity-cutover.md` |
| R6 | `goals/R6-cleanup.md` |

## R-1：仓库实况盘点与正名

**目标**：把旧主干的 sections、transition host、adapter、handoff、hash、copy、media 参数盘清楚，形成新 runtime 的输入事实。只读盘点，不写业务实现。

任务：

- T-1.1 生成 `migration-inventory.json`：扫描 `src/index.template.html`、`src/sections/*.html`、`src/section-manifest.mjs`、transition registry、构建后的 transition host，列出 `sectionId / hashId / oldTransitionId / oldHandoffId / adapterModule / copySource / mediaAssets / policySeed`。
- T-1.2 产出 canonical 正名表：把旧 `home-belief / belief-method / method-brand / method-tooling__method-proof / method-proof-brand` 等 id 映射到 ARCHITECTURE §3.1 的 scene/segment。
- T-1.2a 单独核实 figure2/proof：从 `src/sections/method.html`、`homepageSceneDomMap`、figure2 adapter 反推 `figure2-distance-expand / figure2-proof-opening / figure2-proof-cards / figure2-proof-closing / brand` 的 scene/segment/stage 归属，禁止把“stagedSnap 4 段”当现成事实。
- T-1.2c 如果 DOM / adapter / hash / build output 证据与 ARCHITECTURE §3.1 不一致，先写 `docs/react-refactor/decisions/canonical-spine-correction.md`，更新 canonical 表和引用文档后再进入 R0；不得在实现期默默改 spine。
- T-1.2b 产出 `interruptibleCandidates: SegmentId[]`：默认空，只能从旧站 scrub / 可往返事实反推；R0 manifest 不得临时猜测 interruptible。
- T-1.3 生成 copy baseline：从 `src/sections/*.html` 与当前构建产物提取正文，输出 `copy-reference.json` 或生成型 `src/copy/homepage-reference.mjs`，并记录来源。不得依赖手写 copy 文件作为唯一事实源。
- T-1.4 生成旧验证映射：列出旧 `scripts/check-*.mjs` 家族每类断言将由哪一个 TS 类型、ESLint、Vitest、Playwright 或人工 UAT 覆盖。至少覆盖 root `package.json` 现有 `verify:*`：copy、ink modules、scroll modules、section transitions、transition runtime、homepage transitions/timeline/schema/snap/media/boundaries、scene timeline/frame、handoff/owner ownership、pilot readiness/height、runtime/snap/progress-driver、adapter contract、pattern/aod/figure2/starmap provider。
- T-1.5 SEO / 无 JS 决策：确认采用静态预渲染还是可爬 HTML shell，并把正文可提取性纳入 R5 验收。

**验收**：`migration-inventory.json` 与人工表能解释每个旧 transition/adapter/copy 来源；canonical spine 与用户确认顺序一致，或已有 canonical-spine-correction ADR；copy baseline 可重复生成；旧检查映射无“以后再说”的空项，且每个 root `verify:*` 脚本都有新覆盖项、退役理由或人工 UAT 入口。

## R0：脚手架、类型契约、manifest 种子

**目标**：`app/` 可跑、契约类型冻结、CI 就绪。不写业务视觉。

任务：

- T0.0 Canonical spine 落地：按 ARCHITECTURE §3.1 与 R-1 正名表生成 `story/canonical-spine.ts`（或等价 JSON）与人工可读 diff。这是后续 manifest、harness、迁移分支的唯一时序源。
- T0.1 Vite + React + TS strict 脚手架；根 `package.json` 增加 `packageManager`，新增 `pnpm-workspace.yaml`，`app/package.json` 只用 pnpm scripts；依赖 `gsap @gsap/react xstate`（lenis 暂不引入）；Vitest + Playwright config / CI smoke 接入；开发/测试默认开启 React StrictMode。
- T0.2 冻结 `story/types.ts` 的联合 tag、字段名与核心事件名：`SceneModule / TransitionModule / TransitionContext / SpineNode / SegmentPolicy / MediaPlaybackContract / CopyCue / MilestoneKey / LayerHandle / StageHandle / DirectorEvent / SegmentRunId / PrepareToken / VisibilityPredicate`（ARCHITECTURE §3-§8）。R3 前允许 non-breaking 字段扩展，禁止改 tag 语义；DirectorEvent 改名/删除视为 breaking change，只能通过 contract ADR + roll-forward/rollback runbook。
- T0.2a `inventory-schema.ts` / `inventory-schema.test.ts`：定义 R-1 JSON → R0 manifest 的 schema bridge，验证 `migration-inventory.json`、`figure2-proof-sequence.md/json`、`interruptible-candidates.json`，禁止自由 JSON 直接手写进 manifest。
- T0.3 `story/manifest.ts`：以 T0.0 canonical spine 为**时序源**，以 R-1 inventory 为**参数种子**，重设计为 spine 节点序列（holds + segments、virtualDuration、`snap/scrub/stagedSnap/reading` policy、copyCue、mediaPlayback、蓄力参数、`staticFallback`、interruptible 候选、buildTimeoutMs）。附 manifest 合法性 Vitest（游标不变量、segment 顺序/无重叠、staged stops 合法、interruptible 必须来自 R-1 清单、至少一个 staticFallback hold、buildTimeoutMs 有默认值）+ 一次性 diff 脚本（新数值 ↔ 旧 `.mjs` 可复用字段）。
- T0.4 ESLint 定制规则落地：R0 只强制最便宜且关键的两条 error 规则：scene 禁全局输入监听、machine context 禁 progress/opacity/transform。`禁 mount 自淡入` 先做 fixtures + review checklist + Stage 契约测试，R2 稳定后再升 error。
- T0.6 预渲染 / SSR guard：所有使用 `window.matchMedia`、`gsap.matchMedia`、media API 的代码必须在 browser guard 后运行；SEO shell / 预渲染路径不能执行 GSAP runtime。
- T0.5 Copy baseline 接入：scene render 文本 vs R-1/R0 生成 baseline 逐字 diff；构建产物正文可提取性最小检查。

**验收**：`pnpm -C app test` 绿；R0 CI 同时跑旧站 baseline guard（默认 `pnpm run build:page && pnpm run verify:all`，或 R-1 validation-map 标记的 baseline 子集）和新 app smoke；canonical spine 与用户确认顺序一致；manifest diff 只解释可复用字段，不把旧 8 join 当新架构真相；R0 两条 error lint 规则违例能红，mount 自淡入有 fixture/checklist 记录；StrictMode 下无重复注册假绿。

## R1：Runtime 骨架（合成场景，全循环可测）

**目标**：Stage + StorySpine + SegmentPlayer + Director 在**合成 scene** 上把主循环、反向、seek、recovery 全打通。无真实视觉。

任务：

- T1.1 `input-normalizer.ts` + `charge.ts`：纯函数直译旧站 + 用例翻译（数值不变）。
- T1.2 `story/spine.ts`：StorySpine（虚拟时间、label 寻址、cursor 游标不变量，`cursor.status: hold|segment|settling`）。Vitest 覆盖 labelOf / 游标推进 / hold↔segment / settling 边界。
- T1.2a `story/visibility-predicate.ts`：提前实现 R1/R2 共享的 visibility predicate 类型与合成 DOM 实现，R2 `verifySegmentTimeline()` 只复用不重写。
- T1.3 `story/segment-player.ts`：采用 actor/mailbox 模式封装 GSAP callbacks；`ensureBuilt / play(id,dir,runId) / scrub / jumpToEnd / abort / dispose`，GSAP timeline 惰性构建。合成 segment 单测：`ensureBuilt` timeout/reject、`play` 完成、`play` failure/abort resolve SegmentResult 且不 reject、stale completion ignored、`abort('seek')`、unhandled rejection guard、`play(-1)`（progress(1)→reverse）、`stagedSnap` STAGE_PAUSED/RESUMED、`jumpToEnd` 幂等；progress=0/1 使用共享 visibility predicate。
- T1.4 `runtime/director.machine.ts`：XState v5 全新 9 态机（booting/hold/preparing/scrubbing/playing/staged-paused/settling/recovering/seeking）。Vitest 模拟时钟覆盖全部转移：CHARGE_FIRED、playing + CHARGE_FIRED queued intent、preparing timeout、build timeout、settling 420ms、playing/settling queued intent、queued intent expiry（ttlMs=420、decayRatePerMs=0.001）、preparing 反向取消、forward ready 与 supersede 竞态、runId guard、prepareToken guard、STAGE_PAUSED/RESUMED、staged-paused 必须有 `cursor.status='segment'` + pausePoint、seek abort、BOOT_FAILED fallback、recovering jumpToEnd failure → fallback hold、边缘蓄力、快速连触反向、recovery 超时。
- T1.5 `runtime/input-router.ts` + `runtime/recovery.ts`：每帧路由（innerScroll|scrub|charge|intentBuffer|none）、超时表（沿用旧数值）。
- T1.6 Director actor 在 React 外创建 + `useSelector` 订阅；HUD 最小版（state、charge、cursor、虚拟进度、actorEpoch、activeRunId、prepareToken）；调试接口 `window.__story.getState()`。合成 Stage 挂 2 个占位层跑通全循环。
- T1.7 `/harness/devtools`：事件日志面板，显示 DirectorEvent、runId/prepareToken、queuedIntent、pausePoint、LayerWindow 成员，避免靠 console.log 排查播放顺序。

**验收**：machine 单测覆盖全部路径；`/harness/machine` 上键盘/滚轮观察 `hold → charge → preparing → playing → settling → hold` 全循环与反向蓄力、seek、recovery。

## R2：Stage 交接协议（合成场景验证，最高风险阶段）

**目标**：用 2 个合成 cinematic scene + 1 个合成 transition，把 ARCHITECTURE §7 提前进场与 §8 from/to 交接协议全部打通。**真实场景迁移前必须收口。**

任务：

- T2.0 合成 scene 规格：定义 2 个 SyntheticSceneModule + 1 个 SyntheticTransitionModule，包含 required handles、copyCue fixture、stagedSnap fixture、slow-ready fixture、build-timeout fixture、StrictMode 双挂载 fixture。
- T2.1 `Stage.tsx` + `SceneLayer.tsx` + `LayerWindow.ts`：scene-id 为 key 的 prev/current/next 常驻窗口，角色切换只改 z 与 data-role 不重挂（canvas 实例存活断言）。
- T2.2 挂载窗口驱动：settling 推进 cursor → next `mount(hidden)` + `preload()`；滑出层延迟一帧 dispose + 窗口成员校验（快速连触缓冲不被过早清理）。dispose 时刻必须证明窗口成员资格合法；异常路径不能泄漏旧 prev。
- T2.3 挂载≠可见：新层 `autoAlpha:0 + inert + visibility:hidden`；可见性只由 transition timeline 改写。逐帧断言"至多两层可见、≤1 层可交互、playing 期 0 可交互、active layer ≤3、transient mounted layer ≤4，retiring 不得存活过下一次 hold 进入"。
- T2.4 就绪门 milestones：`targetReady`（ref + preload + required handles）作为进 playing 硬前提；未 ready 时进入 `preparing`，超过 manifest timeout 才 recovering；`mediaReady` 支持播放前等待或 `addPause('gate:media')` + resume；StrictMode 下重复 loadedmetadata/mediaReady 只生效一次。
- T2.5 TransitionModule 契约 + `verifySegmentTimeline()`：强制 `start/end` label、0 处与 end 处两层状态合法、reducedMotion 分支存在。
- T2.6 反向对称：snap 播放中不打断当前 segment，只缓存 intent；scrub / interruptible segment 才允许同一 timeline reverse；落位后反向 → prev 缓冲 `ensureBuilt` 命中/重建 → `play(id,-1)`。
- T2.7 seek 分支：`segmentPlayer.abort('seek')` → 卸载当前窗口 → 挂载目标窗口 → cursor 置位 → hold（`jumpToEnd` 静态终态）；旧 run completion 必须被忽略。
- T2.8 Playwright 逐帧断言套件：settling 前后各 3 帧无空白帧/无双层残影；正→反→正往返；`0→1→0→1` 幂等快照；连续快速触发两 segment 不崩；慢 ready 先 preparing、后 ready 成功进入 playing，而不是立刻跳终态；retiring 不得存活过下一次 hold 进入。
- T2.8a 合成 copyCue segment：在 R2 合成场景验证 copyCue 正向跨阈值进入、反向跨阈值退出、`0→1→0→1` 不二次入场。
- T2.8b Playwright 稳定性策略：截图断言优先使用 DOM 可见性谓词 + canvas pixel smoke；截图 diff 设置固定 viewport/deviceScaleFactor/reduced motion，并记录 flaky test 失效日期和 owner，禁止永久 quarantine。
- T2.9 输出 `docs/react-refactor/contracts/R2-stage-handoff.md`：记录 DirectorEvent、SegmentRun、LayerWindow、milestone、visibility predicate 的冻结口径，供 R3 diff。

**验收**：合成场景下三大症状自动化断言全绿；任意帧至多两层可见、≤1 可交互；active layer ≤3、transient mounted layer ≤4 且及时释放；窗口成员资格断言全绿；慢后成功路径通过；recovery 不锁死交互。R2 只声明“合成协议闭环”，不声明真实媒体已解决。

## R3：Pilot 竖切 —— star-map → aod-animation → method-top

**目标**：第一条真实 media + copy cue 链路端到端跑通并达旧站平价。选 `star-map → aod-animation → method-top`，因为它覆盖水平墨滴、video 媒体门、80% 文案提前入场、落到 reading scene、反向/recovery。

任务：

- T3.1 `scenes/star-map` / `scenes/aod-animation` / `scenes/method-top`：Component（文案自 `src/sections/*.html` 逐字搬运）+ preload + HandleRegistry 注册；copy 对齐 Vitest 进 CI。
- T3.2 aod renderer 搬运（video milestone 链：loadedmetadata/canplay/ended + 超时兜底）+ `MediaPlaybackContract`（forward、reverse/fallback、jumpToEnd、preparingTimeoutMs）。
- T3.3 `transitions/star-map-aod/timeline.ts` 与 `transitions/aod-method-top/timeline.ts`：区间数值来自 manifest；`gate:media`；`copyCue.atProgress = 0.8`；reducedMotion crossfade 降级。
- T3.4 `/harness/aod-animation`、`/harness/star-map-aod`、`/harness/aod-method-top` 路由。
- T3.5 与旧站并排回归：正向、反向重入、direct-hash `#method`、reduced-motion、真机 iOS Safari。若为旧站平价修正 pilot 数值，必须记录旧站来源或并排截图/trace 证据；无证据的审美调参留到 R4。
- T3.6 R2 contract truth pass：验证真实 video metadata/canplay/ended、copyCue 80% 进入/反向退出、slow-ready-then-success、seek abort stale completion、StrictMode duplicate mediaReady/stale media event 幂等。若发现 R2 未覆盖协议，写入 `docs/react-refactor/contract-diff/R3-pilot.md` 后再回补共享 contract；breaking 事件/tag 变更必须补 contract ADR、roll-forward/rollback runbook 和回填测试。
- T3.7 归档 pilot devtools trace：失败样本必须包含 DirectorEvent ring buffer、actorEpoch、activeRunId、prepareToken、queuedIntent、pausePoint、LayerWindow 成员和 media milestone。若 R-1 SEO 决策采用预渲染，pilot route 必须跑 browser guard smoke，证明 SSR/SSG 路径不执行 GSAP/media runtime。

**验收**：R2 的 Playwright 套件在真实 segment 上全绿；与旧站视觉节奏并排无回退；慢 ready 后成功与断网 recovery 都通过且交互不锁死。R3 平价前不得宣称“播放顺序 + 状态机彻底解决”。

## R4：全量 Scene/Segment 迁移

**目标**：迁完剩余 canonical story groups。R4 是唯一允许做新审美调参、节奏改写与视觉数值偏好调整的阶段。

**状态**：已完成。人工视觉验收点为 `react-refactor-r4-visual-accepted`，R5 起点为 `react-refactor-r4-closeout`；详见 `R4-CLOSEOUT.md`。

迁移顺序（R2/R3 契约稳定后可按组并行分支，合并顺序仍按 story spine）：

1. `hero → pattern → star-map`：中心扩散 + 左侧旋转扩散，包含 pattern/star-map renderer 幂等验证。
2. `method-top → method-bottom → figure2-animation`：普通阅读/滚动推进 + 下到上水平墨滴。
3. `figure2-animation → figure2-proof-opening → figure2-proof-cards → figure2-proof-closing → brand`：远景扩散、前景模糊横拱、opening、三卡、第四种整屏、横拱+文案一起墨滴到 brand。最复杂，必须在 groups 4-7 前进入 merge train，提前暴露共享协议缺口。
4. `brand → figure3-animation → services`：下到上水平墨滴 + `copyCue.atProgress = 0.8`。
5. `services → ttg-animation → lab`：下到上水平墨滴进入 TTG，上到下水平墨滴落到 lab。
6. `lab → ph-animation → education`：PH 太阳点放射墨滴 + 上到下水平墨滴。
7. `education → crane-animation → contact`：下到上水平墨滴 + `copyCue.atProgress = 0.8`。

每个 segment 的完成定义（DoD）：

- renderer 搬运且 `0→1→0→1` 幂等快照绿。
- `verifySegmentTimeline` 绿；copy 对齐绿；reducedMotion 分支存在。
- Playwright 正反向 + 逐帧断言绿；harness 路由可独立预览。
- 与旧站该 segment 并排对照通过。
- 合入 R4 集成分支后重跑 R2 全套逐帧断言 + R3 pilot 回归；`transitions/shared/`、LayerWindow、verifySegmentTimeline 变更必须在集成分支统一处理，不允许 group 私有 fork。

**验收**：canonical story spine 全部完成；全站正向全程 + 反向关键 segment + 全部 hash 直达锚点回归通过。

## R5：生产组装、平价验收与可回滚切换

**目标**：把 R4 scene/transition 组装成真正的 production StoryApp，整站替换旧静态站，并在任何破坏性清理前保留可执行 rollback。

任务：

- T5.0 锁定 `legacy-static-baseline`、`r4-visual-accepted`、`r4-closeout` 三个不可变点，从干净 closeout 创建 R5。
- T5.1 production assembly：`/` 接入完整 canonical spine、Director、Stage、真实输入、reading handoff、hash/history、reduced-motion 和 media recovery；不得继续显示 R0 scaffold。
- T5.2 production boundary：harness 与 public 入口分离/lazy-load；根 dev/build/test/CI/deploy 切到新 app；旧 runtime 默认路径不可达。
- T5.3 全站回归矩阵：desktop/mobile、mouse/touchpad/touchscreen/keyboard、正向全程、关键反向、全部 hash、慢网和恢复；TTG 新正反向 alpha 媒体单列。
- T5.4 SEO / no-JS：静态预渲染或 crawlable shell，构建产物可逐字提取核心正文，title/description/hash 正确。
- T5.5 性能预算：同设备对照 legacy，冻结 LCP、frame interval/long frame、bundle、三层驻留 GPU/内存与 dispose 回收门槛。
- T5.6 cutover/rollback runbook：切换、恢复、archive/assets、触发条件和干净环境演练。
- T5.7 输出 release candidate 和默认 runtime ADR，停止等待 HITL；批准后才合并/部署并建立 R5 cutover tag。

**验收**：候选新入口可上线；完整回归、SEO/no-JS、性能预算通过；rollback 演练成功；旧 runtime 默认路径不可达；HITL 明确批准后才算 cutover。

完整执行契约见 `goals/R5-parity-cutover.md`。

## R6：迁移清理与长期流程巩固

R6 只能从 HITL 批准后的 R5 cutover tag 开始，不能与 R5 合并：

- 先完成引用图和 rollback 影响审计，再删除一次性 diff 脚本、旧 runtime、预览入口和死代码。
- 把 validation map 每条旧脚本关闭为 replaced / retained / retired，不留 open gap。
- ESLint 契约规则违例清零并提升到 error，不使用 blanket ignore。
- harness 路由、无后缀的 g1-g7 主 review 入口和新 scene checklist 固化。
- 审计真实 tracked 历史文档并标记 historical/superseded；仓库不存在的 `docs/newplan/` 不再列为任务。
- 跑 test、lint、typecheck、build、production browser suite 和旧路径不可达验证，输出最终迁移总结。

完整执行契约见 `goals/R6-cleanup.md`。

## 关键依赖关系

```txt
R-1 → R0 → R1 → R2 → R3 → R4 closeout → R5 candidate → HITL cutover → R6
                  ↑
         R2 未收口前禁止开始任何真实 scene 迁移（R3/R4）
         R4 各 story group 可并行分支，合并顺序按 canonical spine
         R5/R6 不得合并；R6 的破坏性删除必须在 cutover 批准之后
```
