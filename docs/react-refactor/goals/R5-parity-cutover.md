# R5 Goal：生产组装、平价验收与可回滚切换

> 状态：ready。只能从 `react-refactor-r4-closeout` 创建 `codex/react-refactor-r5-parity-cutover`。

## 目标

把 R4 已验收的 scene / transition 组装成完整生产站，使 React app 成为可上线的默认入口；完成设备、交互、恢复、SEO 和性能验收；形成可执行的 cutover / rollback 边界。R5 结束时先产出 release candidate，停止并等待 HITL 批准，不自行合并或部署到 `main`。

阶段位置见 `../ROADMAP.md`；架构依据见 `../ARCHITECTURE.md`；旧站复用和退役边界见 `../MIGRATION.md`；SEO 契约见 `../decisions/seo-no-js.md`。

## 阶段边界

- R5 负责生产组装、验证、可回滚切换方案和 release candidate。
- R5 不做大范围视觉重设；发现视觉问题时只做有基线证据的 parity 修复。
- R5 不执行迁移残留的破坏性清理。删除旧 runtime、一次性脚本和最终 dead-code 收口属于 R6。
- R5 与 R6 不合并为同一分支、同一 PR 或同一 HITL 决策。非破坏性的 R6 盘点可以提前进行，但不得提前删除。

## 不可变输入

- 旧静态站基线：`react-refactor-legacy-static-baseline`（`a78b064d65f024a301a3b179c62a458a1445bbf6`）。
- R4 人工视觉验收点：`react-refactor-r4-visual-accepted`（`55b8a123a7a5b28647c40acc81783ee37cd58302`）。
- R4 收口起点：`react-refactor-r4-closeout`。
- canonical spine、copy baseline、manifest、R4 harness 与测试套件。
- 已确认的静态预渲染 SEO / no-JS 决策。

R5 必须从干净 commit / tag 创建，不得把 R4 worktree 中未提交的个人依赖、浏览器产物或临时 review 文件带入。

## 必须输出

- `/` 上的完整生产 `StoryApp`，覆盖 canonical spine 全链路。
- `docs/react-refactor/reports/r5-regression-matrix.md`。
- `docs/react-refactor/reports/r5-performance-budget.md`。
- `docs/react-refactor/reports/r5-seo-no-js.md`。
- `docs/react-refactor/runbooks/react-cutover-rollback.md`。
- React 默认 runtime ADR。
- 根目录 README、开发命令、CI 与部署入口更新。
- 旧站 archive / assets 保留策略和不可变 rollback 引用。

## 必须完成

### T5.0：锁定基线与分支

1. 验证三个基线 tag 指向正确 commit，并记录旧站与 R4 构建产物校验值。
2. 从 `react-refactor-r4-closeout` 创建 `codex/react-refactor-r5-parity-cutover`。
3. 在任何优化前采集旧静态站与 R4 app 的基准数据；预算文档一旦进入 review，不得为了让结果变绿而静默放宽。

### T5.1：生产 StoryApp 组装

1. 新建生产组合层，按 canonical spine 接入全部 SceneModule、TransitionModule、Director、Stage、media gates 和 LayerWindow。
2. `/` 必须进入完整故事，不再显示 R0 scaffold，也不能落到任一 harness。
3. 接通真实 wheel、touchpad、touchscreen、keyboard、reading scrollport 边缘交接、菜单导航、hash/history 同步、direct-hash seek、reduced-motion 和 recovery。
4. 生产入口只加载生产所需模块；harness 路由与生产组合分离并 lazy-load，访问 `/` 时不得 eager import 全部 harness。
5. 保持 scene identity、from/to 唯一所有权和 effect canvas dispose 契约，不重新引入转场专用 fake scene。

### T5.2：默认工具链与入口切换

1. 根目录 `dev`、`build`、`preview`、`test`、`lint`、`typecheck` 默认指向新 app。
2. CI 从 R0/dual-run 命名切换为 production app 验证；旧站只作为不可变基线或显式 rollback job，不再作为默认发布路径。
3. 部署配置输出 React/prerender 构建产物；旧 `scripts/serve-static-site.mjs`、旧 `index.html` 和 query fallback 不得从默认路径可达。
4. `/harness/*` 的生产策略必须显式：要么构建时排除，要么受非 public gate 保护；不能污染 public 初始 bundle。

### T5.3：SEO 与 no-JS 正文

1. 实现静态预渲染或等价 crawlable HTML shell；`dist/index.html` 在不运行 JS 时已包含核心正文。
2. 对照 `copy-reference.json` 自动提取并逐字验证 public copy。
3. 验证 title、description、canonical、语言、导航和 `#method`、`#services`、`#education`、`#contact` 等 hash 语义。
4. 禁用 JS、启用 reduced-motion、媒体失败时，正文不能被永久 `opacity: 0`、`visibility: hidden`、`inert` 或 loader 遮挡。

### T5.4：全站回归矩阵

必须记录设备、浏览器、输入方式、网络档位、commit、结果和证据：

- desktop：Chromium、WebKit/Safari；mouse wheel、touchpad、keyboard。
- mobile：iOS Safari 与 Android Chrome；touchscreen、旋转、地址栏高度变化。
- 正向完整故事；关键反向；每个 canonical hash 直达和刷新恢复。
- reduced-motion 全链路。
- reading scrollport 内部滚动、上下边缘蓄力交接。
- 慢网、断网后恢复、media timeout、decode/play rejection、seek abort 与 stale completion。
- TTG 新正向/反向 alpha 视频、poster 首帧和 `ttg-lab` reverse 必须单列验证。
- 任何空白帧、黑闪、重复文案/场景、终态 dispose 漂移均阻断 cutover。

### T5.5：性能预算

先在同设备、同浏览器、同网络条件下采集 legacy 与 candidate，再冻结数字门槛。至少包含：

- LCP：candidate 不得比 legacy 慢超过 10%；desktop 目标不高于 2.5s，受控 mobile 目标不高于 4.0s。
- 播放期：desktop p95 frame interval 不高于 20ms；mobile 不高于 34ms；大于 50ms 的 long frame 比例低于 1%，首次媒体解码需单独标注。
- 初始 production JS：不得包含 harness chunks；记录 raw/gzip 大小并消除当前单 chunk 大于 500kB 的结构性告警。
- 三层驻留：记录 active video/canvas/WebGL context、JS heap 与 GPU/进程内存峰值；scene 离开窗口后 5 秒内必须释放不再需要的媒体和 effect canvas。
- 连续完整正向 + 关键反向后，内存不能单调增长；恢复不到稳定区间即失败。

若目标设备客观无法达到硬门槛，只能提交带 legacy 对照、profile 和影响说明的预算例外，由 HITL 单独批准；不得在实现提交中直接改低标准。

### T5.6：cutover、rollback 与 archive

Runbook 必须在干净环境实走一次，至少写明：

- candidate 构建、验签、切默认入口和 smoke 命令。
- legacy baseline tag、构建产物校验值和恢复命令。
- 数据/文案/assets 的保留边界；哪些进入 archive，哪些由新 app 共用。
- 触发 rollback 的条件：入口不可用、SEO 正文缺失、关键设备锁死、性能超预算、空白/重复场景回归。
- rollback 后的验证、负责人、记录位置和再次 cutover 条件。

### T5.7：文档与 release gate

1. 更新根 README、`docs/react-refactor/README.md`、ROADMAP、MIGRATION、validation map 和默认 runtime ADR，使其与候选代码一致。
2. 输出 `react-refactor-r5-candidate` tag 或等价不可变 commit。
3. 停止，等待 HITL 确认视觉、移动端、SEO、性能和 rollback 演练。
4. 只有 HITL 明确批准后才允许合并/部署 `main`，并建立 `react-refactor-r5-cutover` tag；R6 只能从该批准点开始。

## 禁止事项

- 不把 R4 harness 拼接冒充生产 StoryApp。
- 不保留可达的 legacy runtime、query fallback 或双默认入口。
- 不把 SEO 正文、移动端或性能问题推迟到上线后。
- 不在未记录 legacy 证据时大改视觉节奏。
- 不在 R5 删除 rollback 所需唯一副本。
- 不在 HITL 前合并或部署到 `main`。

## 自动验收

- `pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm build` 全绿。
- production browser suite 与 regression matrix 全绿。
- 构建产物 SEO/no-JS 提取测试全绿。
- 默认路径和构建产物中无旧 runtime 可达入口。
- 性能预算有数值、采样条件和 pass/fail 结论。
- rollback runbook 在干净环境演练成功。

## 人工确认点

HITL 必须同时批准：完整视觉节奏、desktop/mobile 输入体验、TTG 新媒体正反向、SEO/no-JS、性能预算例外（如有）和 rollback 演练。批准前，R5 只能称为 release candidate，不能称为已 cutover。
