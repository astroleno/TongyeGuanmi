# R2 Goal：Stage 交接协议

## 目标

用合成 cinematic scene 验证单 Stage、prev/current/next 窗口、pre-mount、from/to 交接、反向、seek、recovery。真实 scene 迁移必须等 R2 收口。

阶段位置见 `../ROADMAP.md` 的 R2；架构依据见 `../ARCHITECTURE.md`；旧站复用和退役边界见 `../MIGRATION.md`；总入口见 `../README.md`。

## 输入

- R1 runtime skeleton
- `ARCHITECTURE.md` §7-§8
- 合成 scene 与合成 transition

## 输出

- `stage/Stage.tsx`
- `stage/SceneLayer.tsx`
- `stage/LayerWindow.ts`
- `story/registry.ts`
- `verifySegmentTimeline()`
- `/harness/stage`
- Stage/Transition contract 测试
- `docs/react-refactor/contracts/R2-stage-handoff.md`
- `docs/react-refactor/contracts/synthetic-scene-spec.md`

## 执行步骤

1. 从 R1 收口提交创建 `codex/react-refactor-r2-stage-handoff`。
2. 编写 synthetic scene spec：2 个 SyntheticSceneModule + 1 个 SyntheticTransitionModule，覆盖 required handles、ready 延迟、copyCue、stagedSnap、slow-ready、build-timeout、StrictMode 双挂载 fixture。
3. 实现 HandleRegistry：ref、preload、ready milestone 幂等注册，StrictMode 双挂载安全；重复 mediaReady / stale media event 只生效一次。
4. 实现 LayerWindow：prev/current/next，角色切换只改 role/z-order，不重挂窗口内 scene。
5. 实现 SceneLayer：hidden mount 默认 `autoAlpha:0 + inert + visibility:hidden`。
6. 接入 settling 后窗口推进：next preload、滑出层转为 `retiring` 并延迟一帧 dispose；断言 active layer ≤3、transient mounted layer ≤4，dispose 时窗口成员资格合法，retiring 不得存活过下一次 hold 进入。
7. 实现 TransitionModule 合成 timeline，强制 `start/end` label。
8. 实现 `verifySegmentTimeline()`：复用 R0/R1 visibility predicate；两端层初末状态、reducedMotion 分支、stagedSnap pause。
9. 打通 targetReady、buildReady 和 mediaReady milestone；慢 ready 进入 preparing，超时 recovery；慢后成功必须进入 playing；build timeout 进入 recovery。
10. 验证合成 copyCue segment：正向跨阈值目标文案进入、反向跨阈值退出、`0→1→0→1` 不二次入场。
11. 验证反向：snap 播放中缓存 intent、不打断当前 segment；scrub / interruptible segment 才允许播放中 reverse；落位后从 prev 缓冲反向。
12. 验证 seek：先 `segmentPlayer.abort('seek')`，再卸载当前窗口、挂载目标窗口、cursor 置位到 hold；旧 run completion 必须被忽略。
13. Playwright 稳定性策略：固定 viewport/deviceScaleFactor/reduced-motion，优先 DOM predicate + canvas pixel smoke；截图 diff 有容差、trace/screenshot 归档和 flaky 失效日期/owner，禁止永久 quarantine。
14. 输出 R2 contract spec，记录 DirectorEvent、SegmentRun、LayerWindow、milestone、copyCue、visibility predicate 的冻结口径。

## 禁止事项

- 不迁真实 scene。
- 不在播放中改 z-order。
- 不让 scene 自己控制全局可见性。
- 不用旧 fixed-copy / copyOwner / reveal gate 机制。
- 不把 R2 合成场景通过解释为真实媒体已解决。

## 验收

- `pnpm -C app test` 通过。
- 合成场景满足任意帧至多两层可见、playing 期 0 可交互、hold 期 1 层可交互、active layer ≤3、transient mounted layer ≤4，retiring 不得存活过下一次 hold 进入。
- settling 前后无空白帧。
- 窗口成员资格、seek abort、stale completion ignored、慢后成功路径均有自动测试。
- build timeout、StrictMode duplicate mediaReady/stale media event、flaky 策略 smoke 均有自动测试或记录。
- 合成 copyCue 双向幂等测试通过。
- recovery 后输入不锁死。

## 人工确认点

确认 R2 contract 足够迁 `star-map → aod-animation → method-top`，并明确 R3 可以通过 contract diff 暴露真实媒体缺口。

## 并行拆分

可并行：

- LayerWindow
- HandleRegistry
- verifySegmentTimeline
- 合成 harness

不可并行：

- from/to 可见性协议定稿前不得接真实 renderer。
