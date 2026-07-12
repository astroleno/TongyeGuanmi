# Tongye Guanmi

当前状态：`codex/react-refactor-r5-parity-cutover` 已把完整 React `StoryApp` 设为默认开发、构建、测试与部署产物，并在收紧 release identity 后重新冻结为 `react-refactor-r5-candidate-v3`。`react-refactor-r5-candidate` 与 `react-refactor-r5-candidate-v2` 保持不可变，但均已 superseded、不可批准或部署。v3 等待 HITL 批准；批准前禁止合并或部署 `main`，也不得建立 `react-refactor-r5-cutover`。

## 环境与安装

- Node.js 22
- pnpm 8.15.1

```bash
corepack enable
corepack prepare pnpm@8.15.1 --activate
pnpm install --frozen-lockfile
```

## 默认入口

```bash
pnpm dev
pnpm build
pnpm preview
```

- `pnpm dev`：React 开发入口；`/` 是完整 production StoryApp。
- `pnpm build`：输出 production 验证产物，同时验证 crawlable HTML、production/harness 边界、bundle 与 assets 预算，并生成明确标记为 unbound 的 `dist/r5-release-manifest.json`。
- production build 不包含 `/harness/*`；开发环境仍可按需 lazy-load R4 harness。
- 旧静态 runtime 只保留在 immutable baseline/tag 与显式 `legacy:*` 命令中，不再是默认入口。

## 验证与发布候选

```bash
pnpm run verify:all
pnpm run test:browser
pnpm run test:release
R5_CANDIDATE_TAG=react-refactor-r5-candidate-v3 \
R5_SOURCE_COMMIT="$(git rev-parse HEAD)" \
pnpm run deploy:build
```

`deploy:build` 是唯一可部署构建入口：必须显式传入 candidate tag 和 source commit，并验证 annotated tag、peeled commit、`HEAD`、干净工作树与 manifest 身份完全一致。

`test:release` 覆盖 desktop Chromium/WebKit、Android Chrome 与 iOS WebKit：完整正向、关键反向、输入矩阵、history/hash、reduced-motion、reading handoff、media recovery、TTG 正反向 alpha、SEO/no-JS 与性能预算。

旧站只允许显式调用：

```bash
pnpm run legacy:build
pnpm run legacy:dev
pnpm run legacy:verify:all
```

## R5 证据与操作入口

- [R5 candidate 报告](docs/react-refactor/reports/r5-candidate.md)
- [全站回归矩阵](docs/react-refactor/reports/r5-regression-matrix.md)
- [性能预算](docs/react-refactor/reports/r5-performance-budget.md)
- [SEO/no-JS 报告](docs/react-refactor/reports/r5-seo-no-js.md)
- [Cutover / rollback runbook](docs/react-refactor/runbooks/react-cutover-rollback.md)
- [React refactor 文档索引](docs/react-refactor/README.md)
