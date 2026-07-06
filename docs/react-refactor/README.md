# React Refactor Plan

状态：docs-only 契约基线。本文档集只定义 React rewrite 的目标架构、迁移边界、阶段 goal 与验收口径；当前 PR 不创建 `app/`，不改旧站业务代码，不从 state-machine / scene-runtime 实验分支合入代码。

## 当前 PR 边界

- 分支：`codex/react-refactor-plan`，父级必须来自 `main`。
- Diff 范围：只允许 `docs/react-refactor/`。
- 旧 `codex/state-machine-refactor-roadmap`、`codex/scene-runtime-*`、`react-rewrite/*` 只作为历史实验参考，不作为实现基线。
- 旧 route/runtime helper 方向的 PR 统一标注为 **superseded / reference only**；如需引用，只能在 R-1 inventory 中登记证据来源。
- 本 PR 合并后，后续实现从 R-1 inventory 分支开始，不能直接进入 R0/R1 写代码。

## 阅读顺序

1. `ROADMAP.md`：阶段顺序、分支策略、每阶段验收。
2. `ARCHITECTURE.md`：目标 runtime 架构、canonical spine、Director / Stage / Segment contract。
3. `MIGRATION.md`：旧站素材复用、旧 runtime 退役、并行期与切换规则。
4. `goals/*.md`：每个阶段的输入、输出、禁止事项、验收和人工确认点。

## 文档闭环

| 文档 | 负责回答 | 必须回链 |
|---|---|---|
| `ROADMAP.md` | 何时做、按什么分支和阶段验收做 | 引到 `ARCHITECTURE.md` 的架构契约、`MIGRATION.md` 的迁移边界、`goals/*.md` 的执行清单 |
| `ARCHITECTURE.md` | 新 runtime 长什么样、哪些 contract 不能破 | 引到 `ROADMAP.md` 的阶段落地、`MIGRATION.md` 的旧站边界与复用口径 |
| `MIGRATION.md` | 旧站什么搬、什么弃、如何切换 | 引到 `ARCHITECTURE.md` 的新契约、`ROADMAP.md` 的阶段安排 |
| `goals/*.md` | 阶段如何执行与验收 | 引到 `ROADMAP.md` 的阶段位置、`ARCHITECTURE.md` 的契约依据、`MIGRATION.md` 的复用/退役边界 |

## 后续阶段入口

- R-1 inventory 必须先从 `codex/react-refactor-plan` 创建 `codex/react-refactor-r-1-inventory`。
- R0 前必须完成人工确认：canonical 正名表、SEO / 无 JS 方案、旧检查到新验证映射。
- R2 收口前禁止迁真实 scene；R3 pilot 平价前不得宣称真实媒体和状态机已彻底解决。
- R4 才允许新审美调参、节奏重设或视觉数值偏好调整。
