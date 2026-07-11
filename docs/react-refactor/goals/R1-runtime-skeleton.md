# R1 Goal：Runtime 骨架

> 状态：completed historical phase。

## 目标

用合成 scene 打通 Director、StorySpine、SegmentPlayer、输入路由、recovery 与 HUD 的主循环。

阶段位置见 `../ROADMAP.md` 的 R1；架构依据见 `../ARCHITECTURE.md`；旧站复用和退役边界见 `../MIGRATION.md`；总入口见 `../README.md`。

## 输入

- R0 `app/`
- `story/types.ts`
- `story/manifest.ts`
- 旧 `input-normalizer`、charge 参数与测试样本

## 输出

- `runtime/input-normalizer.ts`
- `runtime/charge.ts`
- `runtime/input-router.ts`
- `runtime/recovery.ts`
- `runtime/director.machine.ts`
- `story/spine.ts`
- `story/segment-player.ts`
- `story/visibility-predicate.ts`（R0 定义，R1 使用并补测试）
- React 外部 Director actor
- `/harness/machine`
- `/harness/devtools`

## 执行步骤

1. 从 R0 收口提交创建 `codex/react-refactor-r1-runtime-skeleton`。
2. 迁入输入归一化和 charge 纯函数，保留旧数值：阈值 0.1、衰减 0.001/ms。
3. 实现 StorySpine：label 寻址、cursor、虚拟时间、hold/segment/settling 边界。
4. 实现 SegmentPlayer 最小版：actor/mailbox 封装 GSAP callbacks，惰性构建、play(runId)、reverse、jumpToEnd、abort、dispose；`play()` failure/abort resolve SegmentResult 且不 reject；旧 run 的 completion/failure 必须可忽略；SegmentPlayer 单测使用共享可见性谓词，不只检查 timeline label。
5. 实现 Director XState 9 态：booting、hold、preparing、scrubbing、playing、staged-paused、settling、recovering、seeking，并实现 `DirectorEvent` union。
6. 实现 input-router：innerScroll、scrub、charge、intentBuffer、none 五种消费路径。
7. 在 React 外创建 actor，HUD 用 selector 订阅 state、charge、cursor、virtualProgress。
8. 建 `/harness/machine`，用两个合成层跑完整正向、反向、seek、recovery。
9. 建 `/harness/devtools`，显示事件 ring buffer、actorEpoch、activeRunId、prepareToken、queuedIntent、pausePoint、LayerWindow 成员、milestone。
10. 写 Vitest：状态转移、settling 420ms、preparing timeout、build timeout、playing/settling queued intent、queued intent expiry（ttlMs=420、decayRatePerMs=0.001）、preparing 反向取消、forward ready 与 supersede 竞态、runId guard、prepareToken guard、STAGE_PAUSED/RESUMED、staged-paused cursor invariant、seek abort、BOOT_FAILED fallback、jumpToEnd failure → fallback hold、stale completion ignored、recovery 不锁死、快速连触、无 unhandled rejection。

## 禁止事项

- Director context 不得出现 progress、opacity、transform 等逐帧字段。
- Segment timeline 不进入 React component effect。
- 不迁真实 scene。
- snap segment 播放中不做中途 reverse；只能缓存 intent，落位后再处理。scrub 段例外。

## 验收

- `pnpm -C app test` 通过。
- `/harness/machine` 能观察 `hold → preparing → playing → settling → hold`。
- `/harness/devtools` 能显示事件日志、runId/prepareToken 和 LayerWindow 成员。
- 反向蓄力、queued intent、seek abort、recovery 都能回到合法 hold。
- 过期 queued intent 在 settle 后正确清空；未过期且仍达阈值的 queued intent 才能 flush 成下一次 `CHARGE_FIRED`。
- preparing 中反向输入取消当前准备并落到反方向合法 hold；forward ready 恰好到来时被 supersede token / activeRunId 正确忽略。
- `BOOT_FAILED` 后 Stage 显示 `hero` 静态终态，无空层。
- SegmentPlayer 的 progress=0/1、jumpToEnd、abort 后终态用共享 visibility predicate 断言。

## 人工确认点

确认状态机事件名、SegmentRun 语义和 manifest policy 能覆盖 R2/R3；后续只能 non-breaking 扩展。

## 并行拆分

可并行：

- input-normalizer / charge
- StorySpine
- Director tests

合并顺序：

1. 类型与 manifest
2. StorySpine
3. SegmentPlayer
4. Director
5. Harness
