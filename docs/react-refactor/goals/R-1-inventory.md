# R-1 Goal：仓库实况盘点与正名

## 目标

从 `main` 生成新 React runtime 的输入事实源。只读盘点，不写 `app/`，不迁真实 scene。

阶段位置见 `../ROADMAP.md` 的 R-1；架构依据见 `../ARCHITECTURE.md`；旧站复用和退役边界见 `../MIGRATION.md`；总入口见 `../README.md`。

## 输入

- `src/index.template.html`
- `src/sections/*.html`
- `src/section-manifest.mjs`
- `js/transitions/**`
- 根目录独立 scene/transition HTML
- `assets/**`
- `scripts/check-*.mjs`

`codex/state-machine-refactor-roadmap` 和其他实验分支只作为参考；引用时必须登记来源。

## 输出

- `docs/react-refactor/inventory/migration-inventory.json`
- `docs/react-refactor/inventory/migration-inventory.md`
- `docs/react-refactor/inventory/canonical-naming.md`
- `docs/react-refactor/inventory/figure2-proof-sequence.md`
- `docs/react-refactor/inventory/interruptible-candidates.json`
- `docs/react-refactor/inventory/copy-reference.json`
- `docs/react-refactor/inventory/validation-map.md`
- `docs/react-refactor/decisions/canonical-spine-correction.md`（仅当事实推翻 ARCHITECTURE §3.1 时产出）
- `docs/react-refactor/decisions/seo-no-js.md`

## 执行步骤

0. Preflight：确认当前工作不是从 `codex/state-machine-refactor-roadmap` 或 scene-runtime 实验分支继续实现。先切到 `main`，创建 `codex/react-refactor-plan`，只提交 `docs/react-refactor/` 作为契约基线。
1. 从 `codex/react-refactor-plan` 创建 `codex/react-refactor-r-1-inventory`。
2. 确认 R-1 分支父级是 plan 分支，且 plan 分支父级来自 `main`。
3. 扫描 sections、hash、transition registry、adapter、assets、旧 manifest，生成 `migration-inventory.json`。
4. 把旧 `home-belief / belief-method / method / method-proof-brand / brand-services / services-lab / lab-education / philosophy-contact` 正名到 canonical spine。
5. 专项反推 figure2/proof：从 `src/sections/method.html`、`homepageSceneDomMap`、figure2 adapter 记录 `figure2-distance-expand / figure2-proof-opening / figure2-proof-cards / figure2-proof-closing / brand` 的 scene/segment/stage 归属，以及 `stageStops/stagePlayMs/stageHoldVh/postScrollVh` 的真实来源。
6. 生成 `interruptible-candidates.json`：形如 `{ "interruptibleCandidates": [] }`。默认空；只有旧站存在 scrub / 可往返事实证据时才加入 SegmentId，并记录证据路径。
7. 从 `src/sections/*.html` 与当前构建产物提取正文，生成可重复的 `copy-reference.json`。
8. 如 DOM / hash / adapter / build output 证据推翻 ARCHITECTURE §3.1，写 `decisions/canonical-spine-correction.md`，列明证据、影响范围、spine diff 和人工确认结果；确认前不得进入 R0。
9. 盘点所有 root `package.json` 的 `verify:*` 与 `scripts/check-*.mjs`，映射到 TS 类型、ESLint、Vitest、Playwright 或人工 UAT。`validation-map.md` 必须逐行包含：旧脚本名、旧断言摘要、旧断言类别、新覆盖方式、落地阶段、owner、是否自动化、baseline guard 是否继续跑、R5 删除/保留门槛、缺口状态。
10. 决定 SEO / 无 JS 策略：静态预渲染或可爬 HTML shell，写入 ADR。
11. 对 inventory 做人工抽样核对：每个旧 transition、adapter、copy 来源都能追溯。

## 禁止事项

- 不创建 `app/`。
- 不修改旧站业务代码。
- 不把 state-machine 分支文件直接合入。
- 不把旧 8 个 join 当成新 manifest 真相。
- 不把“stagedSnap 4 段”当既有事实；必须以 DOM attribute、adapter 区间和 DOM anchor 为依据。
- 不在 R-1 猜测 interruptible；无证据则保持空清单。
- 不把 `validation-map.md` 写成大类附录；每个旧 verify 脚本必须逐条有去向。

## 验收

- `migration-inventory.json` 可解释每个旧 transition / adapter / copy 来源。
- canonical spine 与 `ARCHITECTURE.md` §3.1 一致；若不一致，必须已有 `canonical-spine-correction.md` 并完成文档更新与人工确认。
- `figure2-proof-sequence.md` 明确 proof-opening/cards/closing 与 distance-expand 的归属，能解释旧 DOM map 和 adapter 区间。
- `interruptible-candidates.json` 存在，默认空或每个候选都有旧站证据路径。
- copy baseline 可重复生成，来源字段完整。
- `validation-map.md` 没有“以后再说”的空项；每个 root `verify:*` / `scripts/check-*.mjs` 都有新覆盖项、退役理由或人工 UAT 入口，未映射项阻断 R0。
- `seo-no-js.md` 给出明确选择与 R5 验收方式。

## 人工确认点

R-1 结束后确认 canonical 正名表和 SEO 方案，再进入 R0。

## 并行拆分

可并行：

- inventory 扫描
- copy baseline
- validation map

不可并行：

- canonical 正名确认必须在 manifest 设计前完成。
