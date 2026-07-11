# R6 Goal：迁移清理与长期流程巩固

> 状态：blocked by design。只有 `react-refactor-r5-cutover` 已获 HITL 批准且稳定性观察完成后才能创建 `codex/react-refactor-r6-cleanup`。

## 目标

删除迁移期残留和已失去回滚价值的旧路径，把 React runtime 的验证、harness 和新增 scene 流程固化为长期维护规则，并输出最终迁移总结。

阶段位置见 `../ROADMAP.md`；架构依据见 `../ARCHITECTURE.md`；旧站复用和退役边界见 `../MIGRATION.md`；R5 release gate 见 `R5-parity-cutover.md`。

## 阶段边界

- R6 是 R5 cutover 后的独立、破坏性 cleanup 阶段，不能与 R5 合并。
- R6 不负责修复尚未通过的 cutover 问题；如果 R5 仍有 parity、SEO、性能或 rollback 阻塞，返回 R5。
- R6 可以删除 repo 内旧实现，但不得删除不可变 legacy tag、已归档 release artifact 或 runbook 所需校验记录。

## 输入

- HITL 已批准并已部署/合并的 `react-refactor-r5-cutover`。
- R5 regression、SEO、性能与 rollback 演练记录。
- 明确的稳定性观察结论和 archive 保留期限。
- 完整 validation map 与引用图。

## 必须输出

- 迁移 dead-code / one-off script 清理提交。
- 每条旧检查的最终 disposition。
- ESLint 契约规则全部为 error。
- harness 路由文档和新增 scene checklist。
- README / ROADMAP / MIGRATION / ADR 与代码事实一致。
- 最终迁移总结与保留资产清单。

## 必须完成

### T6.0：破坏性操作前置审计

1. 从 `react-refactor-r5-cutover` 创建 `codex/react-refactor-r6-cleanup`。
2. 生成旧 runtime、一次性 diff 脚本、预览 HTML、query flags、archive 和 assets 的引用图。
3. 对每个拟删除项记录 owner、最后引用、替代验证、rollback 影响和删除/保留结论。
4. `docs/newplan/` 当前不存在，不能保留无效任务；改为对真实 tracked 文档做 stale/superseded 审计。

### T6.1：删除迁移残留

1. 删除已被 TS/ESLint/Vitest/browser tests 取代的一次性 diff 和 legacy check 脚本。
2. 删除不可达旧 runtime、旧构建/serve 入口、独立预览 HTML、legacy query fallback 和死 adapter。
3. 删除只为迁移对照存在且已超过保留期的临时 artifacts；长期素材必须保留 canonical 来源与许可/生成说明。
4. 对共享 assets 做引用验证，不能因为旧 runtime 删除而误删新 app 仍使用的媒体。

### T6.2：关闭 validation map

`docs/react-refactor/inventory/validation-map.md` 中每个旧 root script 和 `scripts/check-*.mjs` 必须落到以下唯一结论之一：

- replaced：给出具体 TS/ESLint/Vitest/browser/CI 覆盖路径。
- retained：说明长期价值、owner 和默认命令入口。
- retired：说明为什么该旧断言不再成立。

不得保留 “implementation required”、泛化大类或未映射 gap。

### T6.3：契约 lint 提级

1. 把 scene 全局输入、machine context 逐帧字段、mount self-fade、非法 browser API、私有 shared transition fork 等规则提升到 error。
2. 清零现有违例，不以 blanket disable、目录排除或降级 warning 绕过。
3. 为每条自定义规则保留正反 fixture 和文档说明。

### T6.4：harness 与新增 scene 流程

1. 文档化 machine、scene、segment、group harness 的用途、启动命令、route 命名和 production 可达策略。
2. R4 人工主 review 路由固定为 `/harness/r4-g1` 至 `/harness/r4-g7`；不把带后缀的内部诊断路由写成默认验收入口。
3. 固化新 scene checklist：canonical id → SceneModule → copy baseline → assets/media contract → progress 幂等 renderer → TransitionModule/reducedMotion → harness → timeline/browser contracts → manifest → SEO fallback → performance/dispose。
4. 给 checklist 提供一个可运行模板或 fixture，证明流程可复用。

### T6.5：最终文档与总结

1. 更新根 README、react-refactor 文档索引、ROADMAP、MIGRATION、ADR 和 runbook。
2. 对历史 R0-R4 iteration 文档标记 historical/superseded；保留证据，不让旧文档继续指导当前实现。
3. 输出最终迁移总结：阶段 tag、架构结果、删除项、保留 assets、测试矩阵、已知限制、后续新增 scene 流程。

## 禁止事项

- 不在 R5 HITL 批准前开始删除。
- 不删除 rollback tag、release artifact 或唯一的素材来源。
- 不删除有长期价值的 harness。
- 不把旧 runtime 以隐藏 route、query flag、未文档脚本或 archive server 形式继续可达。
- 不通过 lint ignore、测试跳过或缩小扫描范围制造“清零”。

## 验收

- `pnpm test` 通过。
- `pnpm lint` 通过，契约规则为 error 且无 blanket suppression。
- `pnpm typecheck` 通过。
- `pnpm build` 通过。
- production browser suite 通过。
- 默认路径、构建产物和已发布 route 中无旧 runtime 可达入口。
- validation map 无 open gap。
- harness 文档和新 scene fixture 能按 checklist 完成一次端到端接入。
- README / docs 与实际命令、路由、CI 和部署事实一致。

## 完成条件

输出最终迁移总结后停止。R6 完成不触发新的视觉重构；任何新产品或视觉需求进入独立后续阶段。
