# R5 Transition Frame Pacing and Visual Closure

状态：P1 生产问题、Figure2 媒体集成阻断和已知 P2 自动化缺口均已处理；candidate 仍未冻结。
日期：2026-07-16。
基线：`1d62d2e3dc6f2c684fa21a1cdc12d51333e4d496`（`fix(r5): stabilize transition pacing and media handoffs`）。
实现：`24eb89c`（核心闭环）、`3a6ff95`（PH edge spill）、`7b34eb8`（Figure2 combined bidirectional media）。

本文档只记录隔离工作树的自动化与 build 证据；不声明 immutable candidate、发布、memory qualification、rollback manifest 或人工视觉资格已完成。

## P1 复核闭环

| 阻断项 | 处理 | 可验证证据 |
|---|---|---|
| Hero 纹理倒置与末端 handoff 不等价 | target texture 保持 `UNPACK_FLIP_Y_WEBGL=true`。DOM Hero background 在 `.94–.995` 达到全不透明；target-bearing radial canvas 保持不透明到 `.995`，仅在 `.995–1` 退出。 | `0.94 / 0.9675 / 0.995 / 1` composited-luminance witness 保持 target luminance；vendor lifecycle 断言 canvas opacity 为 `1 / 1 / 1 / 0`。 |
| 生产 Ink lifecycle marker 被移除 | `SceneLayer` 的显式 `loseContext()` 与 `StoryApp.webglCanvases` 改用生产恒定的 `data-r4-ink-renderer-status`，不再依赖 DEV-only diagnostics。 | release Chromium cold Hero 路径验证 active status 与 GPU surface 计数，并在离场 Contact 时记录 `WEBGL_lose_context`。 |
| Figure2 combined media 令 reverse probe 超时 | `r5-performance` 改为等待唯一的 `[data-figure2-combined-video]`、`timelineVideoDirection === '-1'`、ready frame 与 `2.6–5.2s` reverse leg。 | 迁入后的单媒体反向段已在 release desktop performance probe 实际通过。 |
| direct-entry 的 loader status 与 interactive 状态不同步 | `StoryLoader` hidden timer 与 parent 的 `onHidden` 会在同一 turn 触发；`StoryApp` 现在先同步镜像 `loaderStatus: 'hidden'`，再发布 `presentationReady`。 | full release 的 direct `method-top` / `contact` 与 reduced Hero 路径要求 visible story 时 snapshot 已是 `loaderStatus: 'hidden'`。 |

## P2 自动化证据

| 合同 | 当前证据 |
|---|---|
| AOD 首个 alpha frame | production Chromium 在 `p=0` 采到 active alpha source 和已呈现视频帧：source/receiver opacity 都为 `1`、Method paper 为 `rgb(237, 228, 210)`、12 个 presented frames、398 个可见像素、2,087 个透明像素；合成平均亮度 `212.72`。该 witness 同时写为 Playwright attachment。 |
| 固定进度读回 | performance gate 使用实际 `pixelWitness.progress`，而非读回前的 transition sample。 |
| Hero spatter 形态与上限 | `readPixels` 同时断言可见方形/紧凑 spatter 的连通域、像素数与亮像素密度上限。最后一次 desktop witness：128 个 compact-square components、2,659 pixels、34,056 bright pixels；亮像素占比约 `2.63%`，低于 `4%` ceiling。 |
| 长阅读交互 | Proof、Lab、Services、Education 共用 release 合同：7×80px burst 位移为 `0.35–0.65` viewport；同一 gesture 的第二个 500px tail 被吸收；暂停 260ms 的 fresh input 恢复内容位移；reverse input 与从相邻场景反向进入仍由 reading owner 持有。 |

## Figure2 / PH 媒体集成

- 两笔媒体提交按依赖顺序整体迁入，不是仅复制资产；包括 SHA、PTS/GOP、manifest、runtime ownership、测试和 archive。
- `assets/figure2-pair-motion.webm` 为唯一的 Figure2 双向媒体：792×660、156 frames、5.2s、alpha，forward `0–2.567s`、reverse `2.6–5.167s`，source SHA `a87db407fd39…`。
- `verify:media:deep` 通过；runtime media 为 `44,601,932 B`、38 个 runtime assets、8 个 WebM。相对旧四视频 Figure2 方案，迁入后总量净减少。
- 最后一次 desktop release probe 记录 Figure2 reverse first decode `83ms`、steady p95 `17.4ms`。

## 当前 build / budget

| 测量 | 当前值 | 门禁 | 结果 |
|---|---:|---:|---|
| total JS raw | 575,430 B | ≤581,632 B | pass |
| hard-cap headroom | 6,202 B | ≥4,096 B | pass |
| final target margin | 2,106 B | total ≤577,536 B | pass |
| initial JS raw | 367,607 B | ≤368,640 B | pass |
| initial CSS raw | 76,699 B | ≤76,800 B | pass |
| largest lazy JS raw | 53,277 B | ≤65,536 B | pass |
| total runtime media | 44,601,932 B | 不高于迁入前总量 | pass |

`pnpm --dir app build` 同时通过 TypeScript、Vite、media inventory、release static shell、性能预算和 prepare-phase release manifest。manifest 仍为 `qualification: pending-memory`、`candidate: null`。

## 实际像素与性能证据

desktop Chromium 使用 `ANGLE Metal Renderer: Apple M4`，不是 software renderer。

| 路径 | witness | 稳态 p95 |
|---|---|---:|
| Hero → Pattern | `p=0.5265`；34,056 bright pixels、149 sparse pixels、128 compact-square spatter components | 17.4 ms |
| Pattern → Star Map | active Ink visual witness | 18.6 ms |
| Figure3 tail | terminal 500ms path | 18.0 ms |
| Figure2 combined reverse | reverse leg decoded into `2.6–5.2s` window，first decode 83ms | 17.4 ms |
| AOD reverse | active alpha reverse media，first decode 341ms | 17.2 ms |
| Services → TTG | horizontal dual-edge witness | 18.4 ms |

聚合长帧比例为 `0.001224`，低于 `1%` 门禁；AOD 有一帧 `66.7ms`，未连续出现且不改变该结论。

## 已运行验证

- `pnpm --dir app lint` — pass。
- `pnpm --dir app typecheck` — pass。
- `pnpm --dir app test` — 93 files / 603 tests pass。
- `pnpm --dir app build` — pass；同时通过 release static shell、媒体 inventory、performance budgets 和 prepare-phase manifest。
- `pnpm --dir app run verify:media:deep` — pass。
- Figure2 `progress.test.ts` 与 `manifest.test.ts` — 31 tests pass。
- `r3-pilot.spec.ts` AOD alpha-composite forward/reverse（含 `p≤0.02` 路径）— pass。
- `r5-performance.spec.ts` release desktop Chromium — 2 passed。
- `r5-production.spec.ts` release desktop Chromium — 22 passed，包含 direct/reduced loader、AOD first-presented-frame、四场景 reading contract、正反向 canonical spine、media recovery 和 release URL isolation。
- `git diff --check` — pass。

## 尚未关闭的资格项

1. 需从同一 clean source commit 生成 immutable candidate，并重新绑定 default/release matrix、process memory/disposal qualification 与 rollback manifest。
2. macOS 触控板 HITL 与关键视觉 HITL（Hero 径向边界、水平双层墨体、粒子密度、AOD 首帧、Figure2 reverse）尚未执行。
3. 必要时补物理移动端验证；当前 Chromium emulation 不能替代设备资格。

在以上项目完成前，不创建 release tag、candidate 或 cutover。
