# R0 Goal：脚手架、类型契约、Manifest 种子

## 目标

建立 `app/` React 工程、冻结核心类型契约、落地 canonical spine 与 manifest 种子。仍不写真实业务视觉。

阶段位置见 `../ROADMAP.md` 的 R0；架构依据见 `../ARCHITECTURE.md`；旧站复用和退役边界见 `../MIGRATION.md`；总入口见 `../README.md`。

## 输入

- R-1 inventory 全部产物
- `ARCHITECTURE.md`
- `MIGRATION.md`
- `ROADMAP.md`

## 输出

- `app/` Vite + React + TypeScript strict 工程
- root `packageManager` + `pnpm-workspace.yaml` + 更新后的 `pnpm-lock.yaml`
- `app/src/story/types.ts`
- `app/src/story/canonical-spine.ts`
- `app/src/story/manifest.ts`
- `app/src/story/inventory-schema.ts`
- `app/src/story/visibility-predicate.ts`
- manifest 合法性 Vitest
- Playwright config + CI smoke
- CI baseline guard（旧站 `build:page` + `verify:all` 或 R-1 指定子集）+ 新 app smoke
- ESLint 契约规则骨架
- copy baseline 最小接入检查

## 执行步骤

1. 从 R-1 收口提交创建 `codex/react-refactor-r0-scaffold`。
2. 冻结包管理器：在根 `package.json` 写入精确 `packageManager: "pnpm@<version>"`，新增 `pnpm-workspace.yaml` 包含 `app`，沿用并更新 `pnpm-lock.yaml`，CI 使用 `corepack enable && pnpm install --frozen-lockfile`。
3. 初始化 `app/`，安装 `react`、`typescript`、`vite`、`gsap`、`@gsap/react`、`xstate`、`vitest`、`@playwright/test`。
4. 开启 TS strict、React StrictMode、基础测试命令、Playwright 最小 smoke 命令。
5. 把 R-1 canonical 正名表固化为 `story/canonical-spine.ts`；若 R-1 产出 `canonical-spine-correction.md`，先确认 ARCHITECTURE / ROADMAP / MIGRATION 已同步。
6. 编写 `story/types.ts`，覆盖 SceneModule、TransitionModule、SpineNode、SegmentPolicy、MediaPlaybackContract、CopyCue、LayerHandle、StageHandle、DirectorEvent、SegmentRunId/SegmentResult、PrepareToken、VisibilityPredicate。冻结联合 tag、字段名与事件名；R3 前允许 non-breaking 字段扩展，禁止改 tag 语义。DirectorEvent 改名/删除必须走 ADR。
7. 编写 `story/inventory-schema.ts` 与测试，验证 R-1 JSON 产物可转换成 typed manifest seed，禁止自由 JSON 直接手抄进 manifest。
8. 编写 `story/visibility-predicate.ts`，定义 R1/R2 共享的可见性谓词和合成 DOM 实现。
9. 以 canonical spine 为唯一时序源生成 `story/manifest.ts` 初版，包含 `staticFallback`、interruptible 候选字段、buildTimeoutMs；`hero` 默认必须是可静态渲染 fallback hold。
10. 添加 manifest 测试：hold/segment 交替、segment from/to 连续、stagedSnap stops 合法、copyCue 目标存在、interruptible 必须来自 R-1 清单、至少一个 `staticFallback: true` hold、buildTimeoutMs 有默认。
11. 添加 ESLint 契约规则：R0 只把 scene 禁全局输入监听、machine context 禁 progress/opacity/transform 两条设为 error；`禁 mount 自淡入` 先提供 fixture + review checklist + 暂不覆盖边界说明，R2 Stage 可见性契约稳定后再升 error。
12. 接入 copy baseline 最小测试，先用占位 scene 验证机制。
13. 加 SSR/SSG browser guard 约束：`window.matchMedia` / `gsap.matchMedia` / media API 只能在浏览器运行，SEO shell / 预渲染路径不得执行 runtime。
14. CI smoke 同时跑旧站 baseline guard（默认 `pnpm run build:page && pnpm run verify:all`，或 R-1 validation-map 中标记的 baseline 子集）和新 app smoke。

## 禁止事项

- 不迁真实 renderer。
- 不实现复杂 Stage 交接。
- 不引入 Lenis 作为核心依赖。
- 不根据旧 runtime 代码结构反推新目录。
- 不把类型冻结理解为字段永不增加；R3 truth pass 前允许向后兼容扩展。
- 不把未列入 R-1 `interruptible-candidates.json` 的 segment 标成 interruptible。
- 不在没有 schema 验证的情况下消费 R-1 JSON。
- 不跳过旧站 baseline guard；R0 起旧站冻结但仍要防止 baseline 漂移。

## 验收

- `pnpm -C app test` 通过。
- Playwright 最小 smoke 可在 CI 跑通；旧站 baseline guard 在 CI 跑通或有 validation-map 证明的子集替代。
- `canonical-spine.ts` 与 R-1 正名表一致。
- manifest 测试能对非法顺序、非法 staged stops 报红。
- manifest 测试能对非法 interruptible、缺失 staticFallback 报红。
- inventory schema、visibility predicate、SSR guard 测试存在并通过。
- 类型契约能被后续 R1/R2 直接消费，且包含 DirectorEvent / SegmentRun 基础协议。
- R0 两条 error lint 规则能报红；`禁 mount 自淡入` 有 fixture/checklist，暂不作为 R0 阻断 error。

## 人工确认点

确认 `story/types.ts` 和 `manifest.ts` 字段没有遗漏 R3/R4 必需信息。

## 并行拆分

R0 建议串行。类型、manifest、lint 规则高度互相影响，过早并行容易产生契约漂移。
