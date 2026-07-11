# React Refactor

状态：R4 已完成人工视觉验收并进入收口；R5 尚未 cutover。本文档集现在记录实际 React runtime、迁移证据、阶段 goal 和 release gate，不再是 docs-only 计划。

## 当前事实

- 旧静态站事实基线固定为 `react-refactor-legacy-static-baseline`。
- R4 人工视觉验收点固定为 `react-refactor-r4-visual-accepted`。
- R5 从 `react-refactor-r4-closeout` 创建，不从 dirty worktree 或浮动 `main` 创建。
- 当前 `app/` 已包含 canonical scene / transition 与 R4 harness，但 `/` 仍是 R0 scaffold；完整 production StoryApp、SEO prerender、默认命令和部署切换属于 R5。
- R5 先产出 release candidate 并等待 HITL；R6 只能从 HITL 批准后的 cutover tag 开始，二者不得合并。

## 阅读顺序

1. `R4-CLOSEOUT.md`：R4 验收点、验证结果、TGG 媒体收口与 R5 起点。
2. `goals/R5-parity-cutover.md`：生产组装、回归、SEO、性能、cutover/rollback 和 HITL gate。
3. `goals/R6-cleanup.md`：cutover 后的破坏性清理与长期流程固化。
4. `ROADMAP.md`：完整阶段链和依赖边界。
5. `ARCHITECTURE.md`：Director / Stage / Segment / Scene / Transition 契约。
6. `MIGRATION.md`：旧站素材、archive、旧 runtime 退役与 validation map。
7. `decisions/seo-no-js.md`：已确认的静态预渲染 / crawlable HTML 契约。

## 文档职责

| 文档 | 负责回答 |
|---|---|
| `R4-CLOSEOUT.md` | R4 到底在哪个不可变点完成，哪些验证已经通过 |
| `ROADMAP.md` | 阶段顺序、依赖和 release gate |
| `ARCHITECTURE.md` | 新 runtime 的目标结构与不可破坏契约 |
| `MIGRATION.md` | 旧站什么保留、什么归档、什么删除 |
| `goals/*.md` | 每阶段输入、必须输出、禁止事项与验收 |
| `inventory/validation-map.md` | 每条旧检查由什么长期验证取代 |

## 分支链

```txt
react-refactor-legacy-static-baseline
  └─ R0 → R1 → R2 → R3
                    └─ react-refactor-r4-visual-accepted
                         └─ react-refactor-r4-closeout
                              └─ codex/react-refactor-r5-parity-cutover
                                   └─ HITL cutover approval
                                        └─ react-refactor-r5-cutover
                                             └─ codex/react-refactor-r6-cleanup
```

R5/R6 goal 中写明的 tag 是 release contract；变更 tag 含义必须同时更新 runbook、ROADMAP 和本索引。
