# R3 Goal：Pilot 竖切

> 状态：completed historical phase。R3 收口 commit 为 `98dbdbc2c829407362f8f37210f05a2bfbab6c1c`。

## 目标

迁第一条真实链路 `star-map → aod-animation → method-top`，覆盖真实 renderer、video milestone、copyCue、reading scene、反向与 recovery。

阶段位置见 `../ROADMAP.md` 的 R3；架构依据见 `../ARCHITECTURE.md`；旧站复用和退役边界见 `../MIGRATION.md`；总入口见 `../README.md`。

## 输入

- R2 收口 runtime
- R-1 inventory 中 star-map / aod / method-top 来源
- `src/sections/*.html` 对应文案
- AOD 媒体资产

## 输出

- `scenes/star-map/`
- `scenes/aod-animation/`
- `scenes/method-top/`
- `transitions/star-map-aod/`
- `transitions/aod-method-top/`
- `/harness/aod-animation`
- `/harness/star-map-aod`
- `/harness/aod-method-top`
- `docs/react-refactor/contract-diff/R3-pilot.md`（如发现 R2 contract 缺口，必须标明 breaking/non-breaking、回填测试、roll-forward/rollback）
- pilot devtools trace 样本（失败样本必须含 DirectorEvent ring buffer 与 media milestone）

## 执行步骤

1. 从 R2 收口提交创建 `codex/react-refactor-r3-pilot`。
2. 搬运 `star-map` renderer，改造成 progress 幂等渲染。
3. 搬运 `aod-animation` video renderer，声明 loadedmetadata、canplay、ended、timeout。
4. 创建 `method-top` reading scene，文案逐字来自 copy baseline。
5. 实现 `star-map-aod` transition：水平墨滴、targetReady/mediaReady、reducedMotion crossfade。
6. 实现 `aod-method-top` transition：媒体播放、`copyCue.atProgress = 0.8`。
7. 为三个 scene/segment 建 harness。
8. 写 copy diff、media contract、progress 幂等、reverse/recovery 测试。
9. 补 R2 truth pass：真实 video metadata/canplay/ended、copyCue 80% 进入/反向退出、slow-ready-then-success、seek abort stale completion、StrictMode duplicate mediaReady/stale media event 幂等。
10. 归档 pilot devtools trace：失败样本必须含 DirectorEvent、actorEpoch、activeRunId、prepareToken、queuedIntent、pausePoint、LayerWindow 成员和 media milestone，禁止只靠 console 复盘。
11. 与 `main` 旧站做并排人工回归：正向、反向、direct hash、慢网、reduced motion。
12. 如 pilot 与旧站不平价，R3 只允许修正搬运误差；每个数值修正必须指向旧站来源、R-1 manifest seed 或并排截图/trace 证据。新的审美调参、节奏重设留到 R4。
13. 如果真实媒体暴露 R2 未覆盖的 milestone / abort 语义，先写 `contract-diff/R3-pilot.md`，再回补共享 contract。若需要改 DirectorEvent tag/语义，必须先补 contract ADR、roll-forward/rollback runbook 与 R2/R3 回填测试。
14. 若 R-1 SEO 决策采用预渲染，pilot routes 增加 browser guard smoke，证明 SSR/SSG 路径不执行 `window.matchMedia`、GSAP 或 media runtime。

## 禁止事项

- 不顺手迁其他 scene。
- 不把 video callback 写成直接 present 文案。
- 不跳过 reducedMotion 分支。
- 不修改或 fork `transitions/shared/` 公共工厂；R3 只能验证共享 contract，不能开私版 ink/crossfade。
- 不把 R3 前的 R2 合成通过表述为“状态机已彻底解决”。
- 不做新的审美调参或节奏重设；R3 数值变化只能服务旧站平价，并记录证据。

## 验收

- `pnpm -C app test` 通过。
- R2 contract 测试在真实 pilot segment 上通过。
- 慢 ready 后成功进入 playing；断网/慢网进入 recovery 且不锁交互。
- copyCue 在 80% 触发，反向跨阈值退出，目标文案不二次入场。
- StrictMode duplicate mediaReady/stale media event 不产生二次播放、二次 ready 或 stale completion。
- `contract-diff/R3-pilot.md` 中的每个缺口都有分类、回填测试和 roll-forward/rollback 处理；devtools trace 可复盘失败顺序。
- 任何 R3 视觉数值修正都有旧站来源或并排回归证据；无证据的审美调参不得进入 R3。

## 人工确认点

确认 pilot 视觉节奏与旧站平价，再允许 R4 并行。

## 并行拆分

R3 不建议大并行。可拆 renderer 与 copy scene，但 transition 合并必须串行收口。
