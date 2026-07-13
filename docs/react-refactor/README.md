# React Refactor

状态：candidate-v4 已通过 exact identity-bound RSS/finalization、HTTP smokes 与同端口 rollback，但最终默认 E2E 仅通过 42/44，因此保持不可变且 unqualified。`6cde26d` 已修复 Figure2 reverse dispose 后空 hold，并让 TTG E2E 按 terminal still + video 的统一 surface 契约验收。下一步只允许冻结新的 `react-refactor-r5-parity-repair-candidate-v5`，重复所有 exact gates，并最后运行两套 E2E 后交给 HITL。当前仍不允许合并/部署 `main`、创建 cutover tag 或开始 R6。

## 当前事实

- 旧静态站基线：`react-refactor-legacy-static-baseline` → `a78b064d65f024a301a3b179c62a458a1445bbf6`。
- R4 视觉验收点：`react-refactor-r4-visual-accepted` → `55b8a123a7a5b28647c40acc81783ee37cd58302`。
- R5 起点：`react-refactor-r4-closeout` → `c2a52dbefd99d2ee99ffa13db0abbdf7b760a143`。
- 修复分支：`codex/react-refactor-r5-parity-cutover`；修复基点：`59065730712c6d9718928fd25cba23e33455395e`。
- `react-refactor-r5-candidate`、`-v2`、`-v3` 与 `react-refactor-r5-parity-repair-candidate` 都不包含本轮 HITL regression closure，只保留为不可变审计记录，禁止移动或冒充新候选。
- v2 只保留为不可变 `NEEDS WORK` 审计记录；v3 与 v4 只保留为不可变 unqualified 审计记录。唯一允许创建的新候选 tag 是 `react-refactor-r5-parity-repair-candidate-v5`。
- v4 exact RSS 为 1,423,048,704B，manifest 与 rollback 均通过；最终默认 E2E 暴露的两个缺口已在 `6cde26d` 由 54 个 focused unit/integration tests 与 2/2 focused browser cases 验证。
- 18 holds、17 segments、canonical 顺序、scene id、hash、copy、Director/SegmentPlayer/Stage/LayerWindow、production/harness lazy 边界和 no-JS shell 架构保持不变。
- 本轮在既有 R1–R22 基础上关闭九项 HITL 回归：单一 10svh 物理手势所有权、AOD/Figure2/TTG/PH presented-frame gate、Figure2 原生反向与 depth readiness、TTG/PH same-run reversal/receiver 唯一性、app-owned loader Ink、Star Map 不透明文案，以及 128-sample 对齐的轻量 horizontal Ink core。
- 此 Goal 的验收不新增 screenshot baseline，不要求人工视觉复核；完整自动化通过并完成 exact-tag/rollback 后停止等待 HITL。

## 阅读顺序

1. `contract-diff/R5-production-parity-repair.md`：R1–R22 的复现、根因、最小责任文件和修复合同。
2. `reports/r5-parity-repair-candidate.md`：corrected candidate 身份、最终 gate 与冻结结果。
3. `reports/r5-regression-matrix.md`：设备、输入、媒体、recovery 与 lifecycle 覆盖。
4. `reports/r5-performance-budget.md`：恢复可见 motion 后仍必须满足的 LCP/frame/bundle/GPU/RSS/heap/dispose 预算。
5. `reports/r5-seo-no-js.md`：footer/备案/favicon/font 与无 JS 产物合同。
6. `runbooks/react-cutover-rollback.md`：exact-tag build/smoke、同端口 rollback 和未来 cutover 边界。
7. `reports/r5-candidate.md`：旧 v3 的历史审计记录；不得作为本轮通过证据。

## 分支链与 gate

```txt
react-refactor-legacy-static-baseline
  └─ R0 → R1 → R2 → R3
                    └─ react-refactor-r4-visual-accepted
                         └─ react-refactor-r4-closeout
                              └─ react-refactor-r5-candidate / v2 / v3
                                   (superseded, immutable, unrepaired)
                                   └─ codex/react-refactor-r5-parity-cutover
                                        └─ candidate-v2 (immutable NEEDS WORK)
                                             └─ candidate-v3 (immutable unqualified)
                                                  └─ candidate-v4 (immutable unqualified, E2E 42/44)
                                                       └─ v5 browser closure
                                                            └─ exact RSS/finalize + rollback + E2E last
                                                                 └─ stop for HITL
```

`react-refactor-r5-cutover` 只能在后续 HITL 明确批准并完成 main cutover 后建立；R6 不得从 candidate、未批准的 main 或本轮工作分支开始。
