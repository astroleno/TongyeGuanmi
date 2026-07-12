# React Refactor

状态：R5 release candidate v3 已完成自动验收与 release identity 绑定，等待 HITL cutover approval。`/`、根工具链、CI 与部署构建均已切到 production React StoryApp；旧 runtime 默认路径不可达。候选尚未合并或部署 `main`。

## 当前事实

- 旧静态站基线：`react-refactor-legacy-static-baseline` → `a78b064d65f024a301a3b179c62a458a1445bbf6`。
- R4 视觉验收点：`react-refactor-r4-visual-accepted` → `55b8a123a7a5b28647c40acc81783ee37cd58302`。
- R5 起点：`react-refactor-r4-closeout` → `c2a52dbefd99d2ee99ffa13db0abbdf7b760a143`。
- R5 阶段分支：`codex/react-refactor-r5-parity-cutover`。
- 当前候选：`react-refactor-r5-candidate-v3`。`react-refactor-r5-candidate` 因 G1 合同漏同步而 superseded；`react-refactor-r5-candidate-v2` 因 manifest 仍自称旧 candidate 而 superseded。两个旧 tag 均保持不可变，不得用于批准或部署。
- `/` 已覆盖完整 canonical spine；Director、Stage、真实输入、reading handoff、history/hash、菜单、reduced-motion 与 recovery 已接通。
- public build 只装配 production module；scene/transition 按需加载，harness 只在开发 gate 下 lazy-load。
- `dist/index.html` 在无 JS 时包含 8 个正文区、127 条非 legacy copy、metadata 与 hash anchors。
- R5 candidate 通过自动化回归与预算，最终视觉、实体移动设备、SEO、性能与 rollback 仍需 HITL 同时批准。

## 阅读顺序

1. `reports/r5-candidate.md`：候选边界、验证汇总与 HITL gate。
2. `reports/r5-regression-matrix.md`：设备、浏览器、输入、网络与 TTG 证据。
3. `reports/r5-performance-budget.md`：legacy 对照、bundle、帧率、GPU/RSS/heap/dispose。
4. `reports/r5-seo-no-js.md`：构建产物正文与无 JS 验证。
5. `runbooks/react-cutover-rollback.md`：批准后的 cutover、触发回滚、恢复和 archive 策略。
6. `decisions/react-default-runtime.md`：React 默认 runtime ADR。
7. `goals/R5-parity-cutover.md` 与 `goals/R6-cleanup.md`：阶段边界。

## 分支链与 gate

```txt
react-refactor-legacy-static-baseline
  └─ R0 → R1 → R2 → R3
                    └─ react-refactor-r4-visual-accepted
                         └─ react-refactor-r4-closeout
                              └─ codex/react-refactor-r5-parity-cutover
                                   └─ react-refactor-r5-candidate (superseded; immutable)
                                        └─ react-refactor-r5-candidate-v2 (superseded; immutable)
                                             └─ react-refactor-r5-candidate-v3
                                                  └─ HITL approval
                                                       └─ main deploy + react-refactor-r5-cutover
                                                            └─ codex/react-refactor-r6-cleanup
```

`react-refactor-r5-cutover` 只能在 HITL 明确批准并完成 main cutover 后建立；R6 不得从 candidate 或未批准的 main 开始。
