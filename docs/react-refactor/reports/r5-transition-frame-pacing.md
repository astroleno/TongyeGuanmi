# R5 Transition Frame Pacing and Visual Closure

状态：Hero handoff 与生产 WebGL lifecycle 的 P1 已修复并回归；Figure2 媒体集成仍待迁移，尚不能冻结 candidate。
日期：2026-07-16。
基线：`1d62d2e3dc6f2c684fa21a1cdc12d51333e4d496`（`fix(r5): stabilize transition pacing and media handoffs`）。

本文档只记录本地工作树证据；不声明 immutable candidate、发布、memory qualification 或 rollback manifest 已完成。

## P1 复核闭环

| 阻断项 | 处理 | 可验证证据 |
|---|---|---|
| Hero 纹理倒置与末端 handoff 不等价 | target texture 以 `UNPACK_FLIP_Y_WEBGL=true` 上传；intro canvas 使用与 DOM Hero background 相同的 112% 尺寸、中心定位、scroll/parallax transform、scale 与滤镜。target-bearing radial canvas 保持不透明直至 `p=.995`，DOM background 同时在 `.94–.995` 达到全不透明，随后 canvas 在 `.995–1` 退出。 | `0.94 / 0.9675 / 0.995 / 1` 的 composited-luminance witness 保持 target luminance；vendor lifecycle test 同时断言该 canvas opacity 为 `1 / 1 / 1 / 0`。 |
| 生产 Ink lifecycle marker 被移除 | `SceneLayer` 的显式 `loseContext()` 与 `StoryApp.webglCanvases` 改用生产恒定的 `data-r4-ink-renderer-status`，而不是仅 DEV 的 renderer diagnostics。 | release Chromium cold Hero test 验证 active status 与 GPU surface 计数，并在离场到 Contact 后记录 `WEBGL_lose_context` 调用。 |
| Method 两屏露出 Stage | receiver `method-bottom` 的纸张 root 从 `p=0` 起保持 `opacity: 1`；仅两个内部 layout 交叉淡入淡出，正反向对称。 | production 浏览器在 handoff 中段采到 source opacity 位于 `(0.05, 0.95)`，同时 receiver 每帧保持 visible、opacity `1` 和非透明纸张背景。 |
| 冻结的 Figure2 ownership 被重开 | `depthThresholdMask` 恢复为基线 endpoint 行为；不保留新的 permanent lease。008 计划已逐字同步用户确认的最新版。 | 最新计划明确把 `1d62d2e` 的 Proof ownership/reverse media 视为冻结合同；Figure2 只保留 shared-Ink 防回退 witness。 |
| Proof governor E2E 与数学矛盾 | 7×80px burst 改为以 viewport height 为基准的 `0.35–0.65` 区间；验证同一手势尾流被吸收，260ms 后的 fresh gesture 才恢复阅读位移。 | release desktop Chromium 的 Figure2 Proof 测试通过。 |
| 视觉有效性未纳入性能门禁 | frame sampling 前在固定 `0.46–0.56` 进度进行实际 WebGL `readPixels`；验证 Hero 粒子、水平次级波、Hero target 朝向。 | Hero particle witness、horizontal secondary-edge witness 与 orientation witness 都写入性能附件并参与断言。 |

## 当前 build / budget

| 测量 | 当前值 | 门禁 | 结果 |
|---|---:|---:|---|
| total JS raw | 577,535 B | ≤581,632 B | pass |
| hard-cap headroom | 4,097 B | ≥4,096 B | pass（余量 1 B） |
| final target margin | 1 B | ≤577,536 B | pass |
| initial JS raw | 367,764 B | 368,640 B | pass |
| largest lazy JS raw | 53,277 B | 65,536 B | pass |
| production media | 未增加/未重新压缩 | 固定范围 | pass |

`pnpm --dir app build` 已同时通过 TypeScript、Vite、media inventory、release static shell、性能预算和 prepare-phase release manifest。manifest 仍为 `qualification: pending-memory`、`candidate: null`。

## 实际像素与性能证据

desktop Chromium 使用 `ANGLE Metal Renderer: Apple M4`，不是 software renderer。

| 路径 | 固定进度 WebGL witness | 稳态 p95 |
|---|---|---:|
| Hero target texture | 12 点：correct `8.94`，vertical-inverse `41.28`，minimum alpha `255` | — |
| Hero → Pattern | `p=0.5268`，148 个 sparse-bright particle pixels，readback error `0` | 17.4 ms |
| Pattern → Star Map | active Ink，`p=0.4617` | 16.8 ms |
| Figure3 tail | — | 17.1 ms |
| Services → TTG | `p=0.5092`，47 个双边缘列、最大 gap 31px、secondary alpha 208、readback error `0` | 17.7 ms |

Focused desktop Chromium test also kept all five measured paths below the 20ms p95 gate; aggregate long-frame ratio was below 1%。mobile Chromium emulation 的同一 focused probe 也通过（horizontal witness：44 columns / 29px / alpha 222），但它不是物理移动设备资格证据。

Figure2 冷 reverse 首次解码本次记录为 2,742ms；它被独立记录，不混入 warm steady pacing。

## 长页防回退

- release production test 对 Lab、Services、Education 的 wide/list/row 节点读取 computed border；每个被测节点的 `borderTopWidth` 与 `borderBottomWidth` 均为 `0px`。
- Lab production DOM 不含 `FIELD CHECK`、`06 SCENES`。
- no-JS static shell 同样断言这两段 retired copy 不存在。

## 已运行验证

- `pnpm --dir app lint` — pass。
- `pnpm --dir app typecheck` — pass。
- `pnpm --dir app test` — 93 files / 601 tests pass。
- `pnpm --dir app build` — pass，budget headroom 4,097 B。
- `r5-performance.spec.ts` focused path — desktop Chromium pass；mobile Chromium emulation pass。
- `r5-performance.spec.ts` full runtime path — desktop Chromium pass。
- `r5-production.spec.ts` — desktop Chromium 20 项通过，包含 Hero production status/GPU count/explicit context release、Proof governor、Method paper backing、Lab/Services/Education computed-style guards。
- `r5-nojs.spec.ts` — pass。
- `r3-pilot.spec.ts` AOD existing alpha-composite forward/reverse harness test — pass。

## 尚未关闭的资格项

1. AOD 当前 harness 只在 alpha-composite 已超过 `p=0.02` 后读取 computed style；首个 presented frame 的 production luminance/Stage-color probe 尚未建立，不能把“启动闪帧”宣称为最终视觉资格已关闭。
2. Figure2 冷 reverse 的 2.742s 首次解码虽低于现有 10s preparation ceiling，但首次操作的可感知卡顿尚未有用户确认的体验目标或物理设备证据。
3. 需要从同一 clean source commit 生成 immutable candidate，重新绑定默认/release matrix、process memory/disposal qualification、rollback manifest、macOS trackpad 与关键视觉 HITL；必要时再补物理移动端验证。

在以上项目完成前，不创建 release tag 或 cutover。
