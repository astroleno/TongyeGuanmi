# R4 Goal：全量 Scene/Segment 迁移

## 目标

迁完 canonical story spine 的剩余 scene 和 segment。R4 是唯一允许做新审美调参、节奏重设与视觉数值偏好调整的阶段；R3 已允许的旧站平价搬运修正不算 R4 调参。

阶段位置见 `../ROADMAP.md` 的 R4；架构依据见 `../ARCHITECTURE.md`；旧站复用和退役边界见 `../MIGRATION.md`；总入口见 `../README.md`。

## 输入

- R3 pilot 收口 runtime
- R-1 inventory
- copy baseline
- 旧独立 scene/transition 页面与 assets

## 输出

- 全量 `scenes/<id>/`
- 全量 `transitions/<segmentId>/`
- 每个 scene/segment harness
- 全量 copy diff
- 全量 timeline contract 测试

## 执行步骤

1. 从 R3 收口提交创建 R4 集成分支，作为唯一 merge train。
2. 按 story group 开并行 worktree，分支名使用 `codex/react-refactor-r4-<group>`。
3. 每个 group 先登记来源：旧 HTML、adapter、assets、copy、policySeed。
4. 搬 renderer 为 progress 幂等模块。
5. 搬 Component 文案，接 copy baseline。
6. 写 TransitionModule，声明 requiredMilestones、copyCue、mediaPlayback、reducedMotion。
7. 建 harness 路由。
8. 跑 group 测试与并排人工回归。
9. 按 canonical spine 顺序合并回 R4 集成分支；`figure2/proof` group 必须在 groups 4-7 前合入 train，不允许留到后段才暴露 shared contract 问题。
10. 每个 group 合入集成分支后，重跑 R2 全套逐帧断言 + R3 pilot 回归，确认共享协议没有被 group 改坏。
11. 共享 contract 变更只能先合入 R4 集成分支，再让未合入 group rebase；禁止在 group 分支内 fork 私版 DirectorEvent、LayerWindow、visibility predicate 或 `transitions/shared/`。

## Group 顺序

1. `hero → pattern → star-map`
2. `method-top → method-bottom → figure2-animation`
3. `figure2-animation → figure2-proof-opening → figure2-proof-cards → figure2-proof-closing → brand`
4. `brand → figure3-animation → services`
5. `services → ttg-animation → lab`
6. `lab → ph-animation → education`
7. `education → crane-animation → contact`

## 禁止事项

- 不改变 canonical spine 顺序。
- 不让 scene 监听全局输入。
- 不把视觉数值调整扩散到非当前 group。
- 不跳过 harness。
- 不 fork 私版 `transitions/shared/`、LayerWindow、verifySegmentTimeline；共享 contract 变更必须先合入 R4 集成分支并重跑 R2/R3。

## 验收

- `pnpm -C app test` 通过。
- 每个 scene `0→1→0→1` 幂等快照通过。
- 每个 segment `verifySegmentTimeline()` 通过。
- 全部 public copy diff 通过。
- 每个 group 合入集成分支后，R2 全套逐帧断言 + R3 pilot 回归通过。
- `figure2/proof` group 已在 groups 4-7 前进入 merge train，并证明 stagedSnap / copyCue / media milestone 没有逼出私版协议。
- 全站正向全程、关键反向、全部 hash 直达通过。

## 人工确认点

每个 group 合并前确认视觉平价；R4 总收口前确认整体节奏。

## 并行拆分

R4 可以并行，但合并顺序固定。每个 group 需要在分支说明里标明“拥有/只引用”的 scene、segment、manifest 区间；`figure2/proof` group 风险最高，建议单独 worktree、尽早进入 merge train，而不是后段合并。
