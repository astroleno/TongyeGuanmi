# React Refactor

状态：**R5 pre-visual、untagged、unqualified**。唯一阶段分支 `codex/react-refactor-r5-parity-cutover` 已收敛 Batch B 与 Batch C；独立的 Batch A generation provenance 继续由远端分支保存，不为制造线性历史合入 R5。当前 `assets/` 与除 `app/src/production/release-manifest.test.ts` 外的 `app/` 内容均与 `b62ba647cbf5402299cd0a5eef46fff152c48524` 一致；该测试只锁定 release workflow 合同，不进入 production/runtime payload。最终人工视觉检查尚未执行，因此不得创建新 candidate、运行 RSS/rollback/exact-tag qualification、合并或部署 `main`、创建 cutover tag，或开始 R6。

## 当前事实

- 旧静态站基线：`react-refactor-legacy-static-baseline` → `a78b064d65f024a301a3b179c62a458a1445bbf6`；`main` 与 `origin/main` 仍停在同一提交。
- R4 视觉验收点：`react-refactor-r4-visual-accepted` → `55b8a123a7a5b28647c40acc81783ee37cd58302`；R5 起点为 `react-refactor-r4-closeout` → `c2a52dbefd99d2ee99ffa13db0abbdf7b760a143`。
- R5 阶段分支从 `3b3ce381560be1cd92f043925cc4ec4120b5fcbb` 接入 Batch B：`c273726` → `f5a4979` → `be119da` → `b23dd80`，再以非 squash merge 接入 Batch C：`767d392` → `b62ba64`。
- Batch A provenance 固定为远端 `codex/homepage-asset-slimming-generation` → `3f16dd0b3f136e699cb3cbd88c1241b4875d9393`。它是独立来源链，不是 Batch B/C 的 Git 祖先。
- 最终首页媒体合同为 38 项：28 WebP、9 WebM、1 JPG、0 PNG；runtime media `60,830,949 bytes`，Hero pre-scroll `1,131,048 bytes`。
- `react-refactor-r5-parity-repair-candidate-v2` 至 `-v8` 均为 immutable historical/unqualified 记录。旧结果只说明各自 source 的历史事实，不得移动、复用或当作当前 pre-visual HEAD 的资格证据。
- 当前 HEAD 没有 candidate tag。新 candidate 只能在最终人工视觉通过且 pre-freeze gate 完成后创建一次；本阶段不预先冻结或复用任何 candidate 名称。
- 当前 HEAD 尚未执行或通过 identity-bound RSS、same-port rollback、exact-tag browser matrix、production cutover 或部署；历史 candidate 的相关结果不得外推。
- `react-refactor-r5-cutover` 未创建，R6 继续 blocked。

## 阅读顺序

1. `contract-diff/R5-production-parity-repair.md`：R1–R22 历史修复合同，以及当前 pre-visual release identity 边界。
2. `reports/r5-parity-repair-candidate.md`：v2–v8 immutable 历史与下一 candidate 的冻结前置条件。
3. `reports/r5-regression-matrix.md`：最终视觉之后才可执行的 exact-tag browser matrix。
4. `reports/r5-performance-budget.md`：RSS、GPU、heap、frame 与 dispose 预算；当前 HEAD 尚未 qualification。
5. `reports/r5-seo-no-js.md`：footer、备案、favicon、font 与 no-JS 合同。
6. `runbooks/react-cutover-rollback.md`：未来 candidate freeze、exact-tag build、rollback 与 cutover 边界。
7. `../assets/homepage-asset-slimming-report.md`：Batch A/B/C 资产来源、恢复和最终 inventory。

## 分支链与停止边界

```text
react-refactor-legacy-static-baseline
  └─ R0 → R1 → R2 → R3 → R4 visual accepted / closeout
                              └─ codex/react-refactor-r5-parity-cutover
                                   ├─ candidate-v2 … candidate-v8
                                   │    (immutable historical, unqualified)
                                   └─ Batch B + Batch C + release-control updates
                                        └─ pre-visual, untagged, unqualified
                                             └─ final manual visual check (pending)
                                                  └─ pre-freeze gate (pending)
                                                       └─ one new candidate (not created)
```

本阶段在最终人工视觉检查入口前停止。HITL 视觉通过也只授权进入 pre-freeze/candidate 流程，不自动授权 RSS、rollback、`main` cutover、部署、`react-refactor-r5-cutover` 或 R6。
