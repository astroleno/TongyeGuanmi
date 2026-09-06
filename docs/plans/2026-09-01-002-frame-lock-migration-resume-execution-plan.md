---
title: "fix: Resume and close frame-lock migration from Task 18"
type: fix
status: ready
date: 2026-09-01
origin: docs/superpowers/plans/2026-08-30-frame-locked-seek-timeline-migration.md
supersedes-execution-notes: docs/plans/2026-09-01-001-fix-frame-lock-migration-closure-plan.md
---

# Frame-lock migration 独立续跑执行计划

## 1. 用途

这是给新 Codex 对话直接执行的独立交接文档。执行者应从当前
`codex/frame-lock-seek-migration` worktree 继续，不重新设计架构，不从
Task 1 重跑，也不先跑宽矩阵“看看结果”。

执行顺序固定为：

1. 先关闭 Task 18 当前唯一已知的 WebKit Figure3 生命周期失败。
2. 通过 Task 18 的确定性、定向浏览器、两 spec 验收网格并提交。
3. 再依次完成 Task 19、20、21、22；每个 Task 独立验收、独立提交。
4. 任一阶段触发停止条件时，保留可恢复状态并向用户报告，不跨阶段修复。

## 2. 当前恢复点

| 项目 | 当前状态 |
| --- | --- |
| Worktree | `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/codex-frame-lock-seek-migration` |
| Branch | `codex/frame-lock-seek-migration` |
| HEAD | `9ec3e2b`，分支相对远端 ahead 27 |
| Main | tracked HEAD 仍为 `6145cfe`；不要修改或清理 main |
| 已提交 | Task 1–17；Task 1 文档提交为 `20d2b93` |
| 未提交生产范围 | 19 个 tracked 修改文件，加 1 个 untracked presenter 源文件 |
| 未提交文档 | 本计划、旧收口计划、closure ledger |
| 最新定向 Vitest | 报告为 9 files / 245 tests passed；ledger 旧记录仍是 244，续跑前必须核对 |
| 静态门 | TypeScript typecheck、Vite production build、`git diff --check` 已报告通过 |
| JS 预算 | `665516 / 665600` bytes，仅剩 84 bytes；不得提高预算 |
| 最新浏览器小集合 | 7 passed / 1 failed |
| 唯一已知失败 | phone-portrait WebKit：第二轮 `Brand → Figure3` 后进入 `poster-fallback` |
| 已知通过 | Figure3 初始 frame zero、Figure3 delayed chunk、TTG delayed chunk，Chromium/WebKit 均通过 |
| 尚未开始 | Task 19–22、Task 21 真机认证 |

旧的 `133 passed / 43 failed / 4 skipped` 是历史结果，早于后续修复，不能作为
当前缺陷列表。不要从这 43 项开始修。

## 3. 不可改变的架构和范围

- 保持 `GO_FULL`、整数帧相等、desired/presented 分离、latest-wins、fail-closed。
- 直接视频只接受 RVFC 证据；组合画面只接受 Canvas draw 证据。
- runtime 仍是唯一 transaction/presented-progress authority。
- presenter 只能适配已有 clock/report port，不能变成第二套状态机、seek queue 或完成通道。
- 不接受 `seeked`、`currentTime`、`rAF`、native playback 作为正式帧证据。
- 不接受通过延长 timeout、吞掉 `MEDIA_SEEK_FAILED`、允许 `poster-fallback` 或放松断言来变绿。
- 不新增持久 decoder、video、Canvas、WebGL context、worker、WebCodecs 栈或 fallback clock。
- 不改交互、cue threshold、segment 顺序、视觉设计、资源上限、JS 预算。
- 不新建 branch/worktree，不 merge/push，不修改 main。
- 不启动 subagent，除非用户在新对话中明确批准。
- 同一时间只能有一个本任务 preview server 和一个浏览器测试进程。

## 4. Task 18 当前允许修改的文件

### 首选范围

- `app/src/media/phone-frame-lock-presenter.ts`
- `app/src/media/presented-frame-clock.test.ts`
- `app/src/scenes/figure3-animation/phone/PhoneFigure3.tsx`
- `app/src/scenes/figure3-animation/phone/PhoneFigure3.test.tsx`
- `app/src/scenes/figure3-animation/phone/PhoneFigure3.clean.test.tsx`

### 有条件范围

- `app/src/media/strict-timeline-video-driver.ts`
  - 只有确定性 overlap test 证明 presenter 层无法安全分离逻辑失效与物理 driver 终止时才可修改。
- `app/e2e/r5-phone-clean-presentation.spec.ts`
  - 只允许补充必要诊断或契约断言，不允许写产品绕过。
- 其余现有 Task 18 dirty files
  - 保留已有改动；当前单点 blocker 期间不得继续扩散修改。

### 当前禁止扩散到

- `runtime.ts`、`PhoneStoryShell.tsx`、manifest、choreography、TTG、Vite config。
- Hero、AOD/Figure2、PH、Crane。
- 如果确定性证据表明必须修改上述文件，立即停止并向用户说明新因果链、文件范围和风险；获得批准后再继续。

## 5. Task 18 执行步骤

### T18-0：进程、树和证据预检

**时间上限：15 分钟；不改生产代码。**

- 确认旧对话已 idle，没有仍在运行的 build、Vitest 或 Playwright。
- 只终止能够确认属于本 worktree 的 preview、Chromium、WebKit 进程。
- 记录 HEAD、完整 dirty inventory、dirty diff identity、依赖锁状态、现有 dist 身份和时间。
- 更新 `docs/superpowers/evidence/frame-lock-migration-closure-ledger.md`：
  - 核对 245 tests、665516 bytes、7/1 浏览器结果。
  - 没有原始输出的结果标记为 `REPORTED_NOT_REPRODUCED`，不能伪装成当前证据。
  - 保留旧 133/43/4 为 historical only。

**通过条件：** 当前树身份清楚，零个 stale task-owned 进程，ledger 能诚实重建状态。

**停止条件：** dirty 文件超出本计划清单，或无法判断进程是否属于本任务。

### T18-1：先构造确定性 overlap 失败

**时间上限：45 分钟。**

在 clock/presenter 测试中固定以下时间线：

1. Request A 在 retained physical video/driver 上等待 RVFC。
2. Figure3 activation generation 或 binding 被替换。
3. A 尚未完全 settle 时，同一 physical video 上启动 Request B。
4. A 的 abort/reset 只能令 A stale，不能终止 B 正在使用的 physical RVFC path。
5. B 收到精确 RVFC、绘制当前 Canvas 并返回 `scene-canvas-draw`。
6. A 永远不能向当前 generation 报告成功或失败。

在 Figure3 clean/integration test 中覆盖：第一次 forward、reverse、第二次 forward，
并让旧 causal promise 与新请求重叠。断言：

- 当前 binding 只有一个 reporter。
- 无 `MEDIA_SEEK_FAILED`。
- 无 `poster-fallback`。
- 无 stale receipt/report。
- decoder、Canvas、资源数不增长。

如果 mock 无法复现，只允许增加临时 test-only diagnostics，记录 request order、
generation、binding、logical clock、physical driver、abort/reset cause、seek issue、
RVFC delivery。只跑一次失败 WebKit case，保存事件时间线，随后删除诊断。

**通过条件：** 获得一个红色确定性测试，或一个能区分所有权问题的 WebKit 事件时间线。

**停止条件：** 一次 WebKit 采样后仍无法确定事件顺序；不要猜代码。

### T18-2：根因决策，只选一个假设

| 证据 | 修改边界 | 必须新增的证明 |
| --- | --- | --- |
| presenter reset 同时让 A stale 并终止 B 仍使用的 driver | 优先只改 `phone-frame-lock-presenter.ts` | A stale；B 精确完成；最终 dispose 只执行一次 |
| strict clock dispose 会销毁同 video 上其他 live clock 的共享 driver | 才允许改 strict driver | two-clock/same-video dispose 顺序、所有权、latest-wins、最终 teardown 全覆盖 |
| Figure3 在旧 binding 因果失效前启动了 B | 只改 Figure3 lifecycle ordering | 旧 callback 不可 report；retained decoder 复用；新 binding 是唯一 owner |
| 新请求正确但 WebKit 在 RVFC 前需要 activation nudge | 只能用既有 nudge 边界，且正式曝光前 pause | RVFC 仍是唯一证据；native playback 不得推进 transaction |

每次只实施一个假设。不得同时修改 presenter、driver、Figure3 三层“全面保险”。

### T18-3：两次尝试上限的修复循环

每次尝试严格按以下顺序：

1. 只做一个假设对应的生产修改。
2. 先跑新增红测和最近的 clock/Figure3 sibling tests。
3. 确定性变绿后只 build 一次。
4. 只跑当前失败的 WebKit case。
5. WebKit 通过后，再跑同 case 的 Chromium sibling。
6. 写 ledger：假设、diff、测试范围、耗时、结果、下一步。

硬限制：

- 最多 2 次实现尝试。
- 每次最多 1 次 WebKit browser run。
- 根因阶段总 wall time 最多 2 小时。
- 第二次尝试必须有新证据，并明确推翻第一次假设。
- 达到任一上限就停止，保留可恢复状态，向用户报告；不得开始第三次重构。

### T18-4：当前小集合验收

使用一个 fresh、immutable build：

- 原失败 WebKit case 在 fresh browser context 连续通过 2 次。
- 对应 Chromium case 通过 1 次。
- 当前 8-case Figure3/TTG 小集合在两引擎各通过 1 次。
- 必含 Figure3 initial frame zero、Figure3 delayed chunk、TTG delayed chunk。
- 所有当前请求必须返回契约允许的精确证据。
- 第二轮不能出现 `poster-fallback`、`MEDIA_SEEK_FAILED` 或资源增长。

小集合未绿，不得进入 spec-complete gate。

### T18-5：Task 18 四格 spec 验收

固定同一个 tree/build，串行运行：

1. `r5-phone-clean-presentation.spec.ts` × phone portrait Chromium。
2. `r5-phone-clean-presentation.spec.ts` × phone portrait WebKit。
3. `r5-ttg-alpha.spec.ts` × phone portrait Chromium。
4. `r5-ttg-alpha.spec.ts` × phone portrait WebKit。

这四格合计可能约 180 rows，但它是 Task 18 的两 spec 验收，不是 Task 21 的
六项目完整 release matrix。

防卡死规则：

- 一格一格跑，禁止并行。
- 每格单独保存结果并更新 ledger。
- 连续 10 分钟没有 test progress，终止并记为 `INFRA_TIMEOUT`。
- 每格 wall time 上限 60 分钟。
- 任一格失败/超时，立即停止后续格子。
- 只复现一个代表失败，回到 T18-1～T18-4；不在宽 spec 中直接修。
- 最多 2 次完整四格尝试。

presentation spec 中如果出现非 Figure3/TTG 场景失败，先分类：

- 若由当前 Task 18 shared change 引入，补 focused regression test 后修复。
- 若是 baseline/historical debt 或后续 Task 所有，停止并请求 scope 决策。
- 不得把 Hero、AOD、Figure2、PH、Crane 自动吸入 Task 18。

### T18-6：最终静态门和提交

- 运行最终 named 9-file / 245-test suite，加所有新 overlap tests。
- 运行 typecheck、production build、whitespace validation。
- phone JS 必须 `<= 665600` bytes；不得提高 cap。
- 因只剩 84 bytes，修复必须 size-neutral，或删除等量重复/死代码。
- 清理所有临时诊断，检查最终 diff 与文件 allowlist。
- ledger 记录最终 tree/build 和每个 browser artifact。
- Task 18 作为一个 atomic feature commit 提交。
- 提交后先确认 worktree 只剩有意保留的规划/evidence 文档，再开始 Task 19。

**Task 18 完成定义：**

- 第二轮 WebKit Figure3 精确通过。
- 确定性 suite、小集合、四格 spec 网格都绑定同一最终 tree/build 且全绿。
- 无 fallback、红框、stale commit、资源增长、预算增加、放松 oracle 或未分类失败。

## 6. Task 19–22 后续计划

### Task 19：Crane phone atomic barrier

- Figure/flock 继续使用现有 `PresentedFrameBarrier`，两侧同 sequence 才提交。
- 保持 2 videos、2 Canvases、2 WebGL contexts，不新增 queue/coordinator。
- native playback 只能作为命名 activation nudge，正式曝光前 pause。
- 先覆盖 figure-first、flock-first、endpoint mapping、one-side stale/timeout、
  reverse、hidden、BFCache、dispose、reactivation 和资源回收。
- 然后运行 Crane unit/barrier/runtime focused gates，再运行 Crane 与 rendering
  lifecycle 的两引擎 focused specs。
- 全绿后单独提交 Task 19；若需要再改 shared runtime/barrier contract，停止请求架构确认。

### Task 20：GO_FULL manifest cutover

- 将 desktop/phone direction 与冻结 eligibility contract 做穷举比对。
- 先保存完整 rollback matrix，再删除 migration kill switch 和不可达 legacy clocks。
- 保留 static fail-closed 和允许的 activation nudges。
- strict path 不得回落到 50ms tolerant clock。
- 运行 cutover verifier、manifest tests、完整 deterministic/static/build/media/budget gates。
- 不在此阶段跑六项目 release matrix。
- 全绿后单独提交 Task 20。

### Task 21A：自动化 release qualification

- 先完成 unit、typecheck、lint、build、deep-media、packed-alpha、cutover、memory gates。
- 六项目 release matrix 按 project 串行分格执行，全部绑定一个 immutable artifact；
  不启动一条沉默数小时的总命令。
- 每格保存 artifact、进度和 ledger 结果；10 分钟无进度终止，按 infrastructure 分类。
- 首轮失败按 root cause 分组，每组只复现一个代表 case，通过 focused gate 修复。
- 所有组 individually green 后，在最终 tree 上再完成一次六格 qualification。
- 最多一轮初始六格和一轮最终六格；第三轮需要新 failure group 与用户批准。
- 自动化全绿只能标记 `AUTOMATION_GREEN_DEVICE_PENDING`。

### Task 21B：真机 iPhone Safari 认证

- 必须记录 iPhone 型号、iOS 版本、Safari 版本、RVFC capability、build/tree identity。
- 覆盖 forward/reverse、endpoints、rapid overwrite、direct entry、background、BFCache、
  orientation、activation retry、reduced motion、PH pause/resume、Figure3/TTG、Crane pressure。
- 记录 frame equality、stale commit、P95/P99、连续长帧、alpha/matte、decoder、Canvas、
  WebGL 和释放后的资源/内存。
- 真机发现代码缺陷会使自动化认证失效：回所属 focused gate 修复，再重做 Task 21A。
- 如果最低支持版本设备不可用，只能报告实际 certified set；不得进入 Task 22。
- 最终真机接受需要用户确认。

### Task 22：清理和最终回归

- 删除 disposable frame-lock spike route/UI/probe、spike E2E、spike Playwright config、
  candidate rebuild scripts。
- 保留 production strict clock/barrier tests、eligibility、baseline 与 release evidence。
- 清理前先确认 production 无 spike imports/references。
- 删除后运行最终 deterministic/static/build/memory gates，以及一轮六项目 release 网格。
- 更新 design/evidence 为最终 commit/tree 和 certified device set。
- Task 22 单独提交；确认 worktree clean。不要清理 main 或其他临时 worktree。

## 7. 全局防卡死协议

| 类型 | 上限/动作 |
| --- | --- |
| Preview readiness | 5 分钟；超时停止并查基础设施 |
| 单个 focused browser case | 15 分钟 wall time；10 分钟无输出即终止 |
| Task 18 单个 spec/project cell | 60 分钟；10 分钟无 test progress 即终止 |
| 同一根因实现 | 最多 2 次尝试、总计 2 小时 |
| 宽网格 | 一个 cell 红就停止，不继续消耗后续 cell |
| 状态更新 | 每完成一个 gate/cell 更新 ledger；浏览器阶段至少每 30 分钟向用户汇报 |
| 隔夜执行 | 禁止；达到上限必须停在可恢复状态 |
| 重跑 | 无新证据禁止原样重跑失败命令 |
| 进程 | 只终止确认属于本 worktree 的进程；一次只保留一个 server/run |
| 范围 | 新根因需要跨 allowlist 时先停止并请求用户批准 |

## 8. 每次停止/交接必须输出

- 当前 HEAD、dirty 文件、是否有未提交生产改动。
- 正在执行的 Task/gate 与最后完成的 gate。
- 最后一个命令的 scope、耗时、pass/fail/skip、artifact 路径。
- 首个失败断言和事件时间线，不只写“Playwright failed”。
- 当前根因假设、支持/反对证据、已使用的尝试次数。
- 活跃 preview/browser 进程及是否已停止。
- 下一步唯一动作，以及是否需要用户 scope/device 决策。
- 明确说明 main 是否保持未修改、是否发生 commit/merge/push。

## 9. 最终完成条件

- Task 18、19、20 各自原子提交并通过对应 focused gates。
- Task 21 六项目自动化在同一最终 artifact 全绿。
- 支持范围内的真实 iPhone Safari hard gates 全绿，并获得用户最终接受。
- Task 22 删除 disposable spike，最终回归全绿并单独提交。
- ledger 无未分类 failure、无伪造历史证据、无 unresolved hard gate。
- 无新 branch/worktree、无 main 修改、无 budget/resource increase、无 oracle 放松、
  无 merge/push。

## 10. 新对话启动指令

新对话只需给出下面一句：

> 请在现有 `codex/frame-lock-seek-migration` worktree 中，严格按
> `docs/plans/2026-09-01-002-frame-lock-migration-resume-execution-plan.md`
> 从 T18-0 开始执行。不要新建分支或 agent；不要跑宽矩阵；每个 gate 更新
> closure ledger；触发时间、尝试或范围停止条件时立即停下向我报告。

## 参考

- 原始迁移计划：`docs/superpowers/plans/2026-08-30-frame-locked-seek-timeline-migration.md`
- 架构规格：`docs/superpowers/specs/2026-08-30-frame-locked-seek-timeline-design.md`
- 冻结 eligibility：`app/scripts/frame-lock-eligibility-contract.json`
- 持久执行账本：`docs/superpowers/evidence/frame-lock-migration-closure-ledger.md`
- 完整收口背景：`docs/plans/2026-09-01-001-fix-frame-lock-migration-closure-plan.md`
