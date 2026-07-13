# Tongye Guanmi

当前状态：`codex/react-refactor-r5-parity-cutover` 已把完整 React `StoryApp` 设为默认开发、构建、测试与部署产物。Parity candidate-v2 为 immutable `NEEDS WORK`，candidate-v3/v4/v5/v6 为 immutable unqualified。V6 本地 exact RSS/finalization/rollback、44/44 默认 E2E 与 54/54 applicable release E2E 均通过，但 tag workflow 中 `actions/checkout` 把已取回的 annotated tag ref 覆盖为 peeled commit，identity gate 因而正确 fail-closed。`6b4b238` 已显式恢复并校验远端 annotated tag；下一步只允许冻结并完整验证 `react-refactor-r5-parity-repair-candidate-v7`。HITL 批准前禁止合并或部署 `main`，也不得建立 `react-refactor-r5-cutover`。

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
R5_CANDIDATE_TAG=react-refactor-r5-parity-repair-candidate-v7 \
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

- [R5 parity-repair candidate 报告](docs/react-refactor/reports/r5-parity-repair-candidate.md)
- [全站回归矩阵](docs/react-refactor/reports/r5-regression-matrix.md)
- [性能预算](docs/react-refactor/reports/r5-performance-budget.md)
- [SEO/no-JS 报告](docs/react-refactor/reports/r5-seo-no-js.md)
- [Cutover / rollback runbook](docs/react-refactor/runbooks/react-cutover-rollback.md)
- [React refactor 文档索引](docs/react-refactor/README.md)
