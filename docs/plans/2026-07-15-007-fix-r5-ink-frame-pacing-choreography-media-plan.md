---
title: "fix: Restore R5 ink frame pacing, reverse phase separation, and media presentation"
type: fix
status: active
date: 2026-07-15
deepened: 2026-07-15
reviewed_branch: codex/react-refactor-r5-parity-cutover
reviewed_commit: 7ba6418b5a8eb86010b8dd8eabd6d49e78ea950f
reviewed_worktree: dirty
follows: 2026-07-15-006-fix-r5-choreography-proof-aod-flock-plan.md
implementation_gate: resolved
plan_depth: deep
---

# fix: Restore R5 ink frame pacing, reverse phase separation, and media presentation

## 结论

本轮 7 项反馈都有代码层面的修复依据，但第 3、6 项的表面判断需要修正：

| # | 判断 | 当前代码证据 | 计划中的修复 |
|---|---|---|---|
| 1 | **成立，热路径根因明确；本轮未跑浏览器基准。** | Hero→Pattern、Pattern→Star Map 与 Figure2 depth 都经过全屏 WebGL Ink。当前 fragment shader 每像素无条件计算 horizontal、radial、depth 三种 rank，并执行 30+ 次 procedural noise/hash 热点；runtime 每帧还读取 layout、重建 Set、重复写 data attributes。Figure2 depth 同时每帧生成 512 项 threshold arrays、重写 SVG transform/mask styles。现有性能测试把路径或整段聚合，不能排除局部连续掉帧。 | 保留粒子、墨边、时长和分辨率，改为 field-kind 静态 specialization + prewarmed deterministic noise atlas；缓存 viewport/DOM ownership；把 depth mask 变成稳定 lease；新增逐路径、逐尾段 frame pacing gate。 |
| 2 | **成立。** | app/src/scenes/hero/motion.ts 当前 Figure1 从 12svh 移到 -3svh，900ms 内总位移 15svh。 | 改为 12svh → 0svh，总位移 12svh；Hero 其他层、900ms 时长不变。 |
| 3 | **现象成立，但不是 progress 区间重叠。** | heroPatternMotionProgress 与 heroPatternInkProgress 的区间本身互斥；问题是 app/src/transitions/shared/ink.ts 对整个 2700ms 使用一条全局 easeInOutCubic，reverse 在 Ink 结束后直接以全局曲线中段速度进入 Hero motion，没有独立 phase easing 与 presented-frame boundary。按当前全局曲线，1/3 stop 实际约在 1179ms 到达，因此也不是约定的 900/1800ms 墙钟分段。卡顿时两相更容易被看成同时发生。 | Hero segment 使用 1800ms reverse Ink → 1 个已呈现边界帧 → 900ms reverse motion；forward 保持 900ms motion → 边界帧 → 1800ms Ink。两相各自 easing，不增加手势停顿。 |
| 4 | **成立，而且被测试固化。** | Pattern 目前是 1800ms collapse、700ms copy、1800ms Ink，两个 gesture stops；copyProgress 只在 collapse 完成后才开始。 | collapse 与 copy 在同一个 1800ms leg 内同步开始、同步结束；只保留 compact+copy 一个 checkpoint，下一手势才进入 1800ms radial Ink；reverse 镜像。 |
| 5 | **成立，末端存在集中提交。** | Figure3 video、source layer 都保持完全可见到 progress=1；最后一帧同时执行 video opacity 1→0、source visible→hidden、native endpoint seek/pause、Services ownership settle。Services 最后 20% 还通过动态 gradient alpha 触发全屏 repaint。 | 把 paper/wash/copy 变为 compositor-friendly opacity/transform；在 endpoint 前完成 target opaque 与 source fade；native endpoint 使用 hold，不在最后一帧补 seek；settle 视觉零变化。 |
| 6 | **现象成立；“把 figure 当成 flock”不成立。** | DOM 和 asset routing 仍是两个独立 video：figure 使用 crane-figure-motion.webm，flock 使用 crane-flock-motion.webm。问题是 corrected flock frame 0 已经写进 canonical WebM 后，flock video 仍绑定外部 poster；该 z-index 8 surface 可在 decode/stall 窗口继续表现为静帧，同时下方 figure video 已播放。当前测试只检查 markup，不证明 poster 已退出 presentation。 | production 移除 flock poster binding，不再保留任何静帧 presentation surface；frame 0 只由 canonical WebM 提供。继续保留两个视频及既有 authored stacking，并补 track identity、presented frame 与视觉 witness。 |
| 7 | **成立。** | Figure2 reverse 对两个人物的同一 forward WebM 每 RAF 发 timeline seek；depth leg 同时跑 WebGL、SVG filter/mask 和大量 DOM 写入。Proof→Figure2 reverse 从 endpoint 的无 mask 样式切到 live SVG mask，再在 dispose 时拆 mask，存在 unresolved/空 presentation frame；测试没有逐帧白闪 gate。 | 生成两条 direction-specific reverse alpha WebM，用 native forward playback 呈现逆向；depth mask 整段保持挂载，先准备 reverse terminal pair 与 mask，再开放 ownership；endpoint 后再清理。 |

这些判断来自当前未提交工作树，不把历史 Playwright green 或 006 的实施记录当成本轮反证。本轮只做静态审查与计划，没有运行 Playwright、build 或测试。

## 与 006 计划的关系

继续保留 006 的以下合同：

- Hero→Pattern 仍是同一 canonical segment，900ms motion 与 1800ms Ink 自动连续，不新增 SceneId。
- Figure2、TTG、PH 的 terminal dwell 仍为 1000ms，forward/reverse 对称。
- figure2-proof 仍是唯一 canonical Proof hold，opening/cards/closing 只是内部 panels。
- scene 持有 media/presentation；shared Ink 只持有 mask、contour、effect canvas，不创建第三套 scene。
- AOD、Proof scroll、horizontal Ink 与阅读区手势修复不在本计划中回滚。

本计划明确覆盖 006 中两个已被新 HITL 否定的决策：

- Pattern 从 “collapse checkpoint → copy checkpoint → Ink” 改为 “collapse+copy checkpoint → Ink”。
- Crane corrected frame 0 已进入 canonical WebM 后，移除 HTML poster；corrected WebP 转为可复现构建输入，不再是 runtime presentation asset。

## Requirements Trace

- **R1 — Ink frame pacing：** Hero→Pattern、Pattern→Star Map、Figure2 depth 三条路径分别满足 steady-frame gate；禁止用聚合均值掩盖单路径卡顿，也禁止降低视觉复杂度制造 green。
- **R2 — Hero choreography：** Figure1 总位移缩短为 12svh；forward/reverse 均严格按 900ms motion 与 1800ms Ink 两相运行，并在 phase boundary 呈现稳定端点帧。
- **R3 — Pattern choreography：** collapse 与 copy 同一 1800ms leg 同步推进，只保留 compact+copy checkpoint。
- **R4 — Figure3 endpoint：** 0.98 前完成可见交接，0.98→1 只提交 ownership，settle 不得产生视觉或 seek 变化。
- **R5 — Crane media identity：** runtime 只有 figure/flock 两个 canonical video surface；runtime corrected frame 0 只来自 flock WebM，不再绑定 poster，独立 WebP 仅留作 archive/rebuild provenance。
- **R6 — Figure2 reverse：** reverse 使用 direction-specific native media；depth mask ownership 连续，Proof→Figure2 不出现白帧。
- **R7 — Release integrity：** 不提高 JS、媒体、initial transfer、LCP、heap、GPU surface 或 memory budget；最终统一通过自动门禁与 HITL。

## 不可妥协的边界

- 不通过删除粒子、改成普通圆形 clip、缩短 Ink 时长、降低到模糊静态图或提高 reduced-motion 覆盖率来制造性能 green。
- 不增加 production scene、临时 root、canvas bridge、poster overlay 或 copy duplicate。
- 不提高 JS、媒体、Hero pre-scroll、LCP、heap 或 GPU surface budget。
- 动工前 fresh build 的 total JS raw 基线为 577,089 / 581,632 bytes，已有 4,543 bytes headroom；runtime media 为 47,180,901 bytes，最大单文件 4,416,794 bytes。先从 hot path 的重复 diagnostics、动态 shader 分支和旧 sequential policy 中继续回收体积；在累计建立至少 8 KiB raw headroom 前，不合入 U2/U4/U6 的新增 production runtime。
- Figure2 reverse media可以增加 runtime media，但总量仍必须小于既有 80 MiB 上限，且 initial transfer 仍小于 40 MiB、Hero pre-scroll 仍小于 4 MiB。
- 不在每个 phase 后重复跑 Playwright，也不为本次迭代另跑实施前浏览器 baseline；复用当前工作树已有性能证据与 U0 deterministic counters。全部修改结束后只统一执行一次 focused + default/release 浏览器验证。

## 关键技术决策与弃选方案

| 范围 | 采用 | 弃选及原因 | 失败判据 |
|---|---|---|---|
| Shared Ink | 同一 GLSL template + field-kind compile define + prewarmed deterministic noise atlas | 仅做 field specialization 只能省掉少量 rank/sampler 工作，无法消除当前每像素 30+ 次 procedural noise/hash 热点；降 DPR、删粒子或改普通 clip 会损失视觉合同；复制三份 shader 会增加 JS 体积与漂移风险 | 三条 isolated path 任一仍超 frame budget；active RAF 发生 shader compile/texture allocation；或视觉 fixture 的粒子密度、侵蚀带、seed 稳定性失真 |
| Hero phase | phase-local clock + bounded presented-frame barrier | 继续对 2700ms 做全局 easing 无法恢复 900/1800ms 墙钟合同；新增 gesture hold 会改变交互 | unit fake clock 不满足精确分段，或浏览器边界帧前后仍同帧推进两相 |
| Figure3 tail | transition 单独持有 source layer opacity，scene video 保持不透明 terminal frame | scene 与 transition 同时淡出会产生双重 alpha；endpoint 补 seek 会把工作集中到最后一帧 | 0.98→1.00 仍有视觉差异、seek 或连续 long frame |
| Crane | canonical flock WebM 自带 corrected frame 0，不绑定 poster | poster 已不再提供独立信息，只会引入第二 presentation surface | 任一 role 出现静帧 overlay，或 figure rVFC 在 authored 区间不推进 |
| Figure2 reverse | 从当前 forward authority 确定性生成 reverse pair，以 native forward playback 播放 | 复用 forward 文件逐 RAF seek 已是热路径；恢复旧 poster/bridge 会重建多 surface；WebCodecs/canvas 会扩大 runtime、GPU 与 JS 风险 | 离线 78/78 帧映射不成立，或浏览器 presented cadence/媒体预算不达标 |

## Repo patterns 与实施期未知量

采用的现有模式：

- `app/src/transitions/shared/sceneInk.ts` 的 fail-closed renderer lifecycle 与 generation ownership；不得为性能回退到普通 clip。
- `app/src/media/timeline-video-driver.ts` 的 prepare → frame-ready → commit/drive → generation-safe dispose；Hero barrier、Crane track witness 与 Figure2 directional media都沿用这条链。
- `app/src/transitions/shared/stagedMediaHandoff.ts` 的 terminal-frame hold 与 cancelable lifecycle；Figure3 和 Figure2 endpoint 不另造 settle surface。
- `app/scripts/rebuild-crane-flock-media.mjs` 的冻结输入 identity、deterministic container 与 deep verifier 模式；Figure2 reverse rebuild 沿用，不读取 legacy reverse。
- `app/src/stage/RetainedFigure2Arch.tsx` 的 retained presentation ownership；Proof/Figure2 交接必须始终有一个 warm-paper owner 覆盖 viewport。

已冻结的规划决策：noise atlas 初始为单个 256×256 deterministic RGBA texture，不作为网络资产；只有 visual fixture 证明出现可见平铺且 GPU/JS budget 允许时，才可在实现期提升到 512×512。其余 exact helper 名称、counter 存储形式和 shader define 拼接方式属于实现细节，但不得改变 R1/R7 的视觉与预算合同。

## 冻结的体验合同

### 1. Shared Ink：视觉不降级，执行路径按 field kind 专用

三种 Ink 保持同一 jade/gold 粒子语言、同一 erosion 强度和已有 seed：

| Field | 需要执行的 rank/texture | 明确禁止 |
|---|---|---|
| radial | radial rank + procedural erosion/particles | contour sample、depth texture sample |
| horizontal | contour rank + horizontal erosion/particles | radial distance、depth texture sample |
| depth | depth texture rank + procedural erosion/particles | contour sample、radial distance |

renderer 在创建时就拿到 field kind，通过同一份 GLSL source 的静态 define 编译对应 program；不复制三份完整 shader string。删除 uFieldMode 的动态混合路径，让 GLSL compiler 可以消除无关 sampler 与计算。

当前 full-screen fragment 的主要成本不是 rank 选择，而是每像素反复执行多组 FBM/hash。保留现有 seed、频率、粒子密度与侵蚀 envelope，但把稳定的 procedural noise 基底改为 256×256 deterministic RGBA noise atlas：在 prewarm 阶段一次生成/上传，active RAF 只做 texture sampling、少量 warp 和最终合成。atlas 不进入 DOM，不成为场景 surface 或网络资源；resize 不重建，field seed 继续通过采样偏移控制 authored variation。WebGL allocation、shader compile、atlas upload、contour upload 与 depth upload 都必须发生在 active progress 前或明确的 invalidation 点，禁止落入 steady RAF。

每个 transition run：

- viewport/Canvas backing size 只在 mount、ResizeObserver 或 visualViewport resize 时读取和更新；
- progress RAF 不调用 getBoundingClientRect；
- endpoint roots、ownership surfaces、motion lease 只在 DOM identity 或 visibility state 改变时同步；
- production 每帧只保留必要的 clip/mask progress、shader uniforms 与 draw；
- data-r4-* diagnostics 只保留 E2E 真正消费的最小集合，且不能在 sceneInk 与 vendor renderer 重复写；
- one run / one effect canvas / one renderer generation 不变。
- active playback 使用真实 monotonic phase elapsed，不再通过逐帧 `min(delta, 64ms)` 延长墙钟时长；long frame 由性能 gate 暴露，不能靠拉长动画掩盖。

### 2. Hero → Pattern：两相独立时间轴

Forward：

~~~text
Hero motion 900ms
  Figure1: 12svh -> 0svh
  Hero video/middle/back 到 terminal
  Ink progress 固定 0
        |
        +-- 至少 1 个有界 requestVideoFrameCallback/RAF 已呈现边界帧
        v
Radial Ink 1800ms
  Hero motion/video 固定 terminal
  Pattern reveal 0 -> 1
~~~

Reverse：

~~~text
Radial Ink retract 1800ms
  Hero 保持 terminal，不发生 scene displacement
        |
        +-- Ink=0 与 Hero terminal 同时已呈现至少 1 帧
        v
Hero motion reverse 900ms
  Figure1: 0svh -> 12svh
  Hero video/middle/back reverse
~~~

边界帧是自动 phase barrier，不是 dwell、Scene hold 或新手势。每相从自己的 0→1 使用 easing，禁止继续使用一条跨两相的全局 cubic easing。barrier 复用现有 media prepare 的 abort/timeout 语义：至少等待一帧 RAF；视频仍在 active playback 时等待对应 rVFC，视频已 pause 且 `timelineVideoFrameReady=true` 时使用有界双 RAF 确认提交；不得无限阻塞，abort/timeout 必须进入既有 recovery，不得偷偷合并两相继续播放。reduced-motion 继续直接提交 endpoint，不引入 barrier。

### 3. Pattern → Star Map：collapse 与文案同相

新 checkpoint：

| State | Pattern geometry | Copy | Star Map | 下一输入 |
|---|---|---|---|---|
| P0 | expanded | hidden | hidden | gesture 启动 collapse+copy |
| P1 | compact | visible | hidden | fresh gesture 启动 Ink |
| P2 | hidden | hidden | hold | reverse gesture retract Ink |

时间合同：

- leg 1：1800ms，collapseProgress 与 copyProgress 都从 0→1；
- stop：P1，等待 fresh gesture；
- leg 2：1800ms，Pattern 固定 compact+copy，radial Ink 从 0→1；
- reverse：先回到 P1 并停留，再用下一手势让 geometry 与 copy 一起退回 P0；
- 删除独立 700ms copy leg、PATTERN_COPY_STOP 与第二个 internal gesture boundary。

### 4. Figure3 → Services：endpoint 前完成视觉交接

总时长与 copy cue 保持 2600ms / 0.80：

- Services copy：0.80→0.94；
- Services paper/wash：0.80→0.96，0.96 后保持 fully opaque；
- Figure3 source layer：由 transition 单独持有 opacity，0.90→0.98 平滑退到 0；scene 内 video 保持 opacity=1 并持有已呈现 terminal frame，禁止与 layer 做双重淡出；
- 0.98→1.00 为视觉稳定区，只有 ownership bookkeeping，不允许发生新 seek、gradient repaint 或可见 opacity jump；
- progress=1 的 source hidden、target hold 必须与 0.98 的 presented frame 视觉一致；
- reverse 先准备 Figure3 terminal frame，再按同一 channel table 镜像，不允许先露出空 video surface。

Services 的 paper/wash 改为始终存在的静态背景 pseudo layers，root 在 transition 中保持透明，通过 pseudo element opacity 合成；禁止继续把每帧变量插进四层 full-screen gradient。0.98 时 source layer 虽已为 opacity 0，仍保持 mounted/owned 到 progress=1，再做视觉零变化的 hide；reverse 必须在 source terminal frame ready 后才让该 layer 从 0 淡入。

### 5. Crane：两个 video，零静帧 surface

媒体角色保持：

| Role | Canonical media | Timeline | Stacking |
|---|---|---|---|
| figure | assets/crane-figure-motion.webm | 0.5s 后开始 figure grow/unmask | 现有 figure context，位于 arch/cloud stack 内 |
| flock | assets/crane-flock-motion.webm | 0s 开始，末段 fade | 现有 front context，z-index 8 |

- assets/crane-flock-motion.webm 的 frame 0 已是 corrected alpha frame，runtime 只展示该 video frame。
- 移除 video.poster 与任何 poster image/overlay；video 在 data-timeline-video-frame-ready 前保持 opacity 0。
- assets/crane-flock-first-frame.webp 移入 archive authoring source；rebuild script 的默认输入、默认产物与 SHA 记录都改到 archive，只有完整 flock rebuild 才显式更新 canonical WebM，禁止单独运行 poster script 后重新生成 runtime asset。
- 两条 video 在 authored 区间内允许同时播放；“同时播放”不等于允许额外静帧。每个 role 任一时刻只能有一个 presentation surface。
- Crane figure 必须在 t=0.5s 后持续产生 presented frames，不能被 flock readiness 或 fallback 状态停掉。

### 6. Figure2：direction-specific reverse 与稳定 depth ownership

新增 canonical reverse media：

- assets/figure2-left-motion-reverse.webm
- assets/figure2-right-motion-reverse.webm

对应 media keys 冻结为 `figure2-left-motion-reverse` / `figure2-right-motion-reverse`。segment forward media 只声明原 pair，reverse media 只声明 reverse pair；不得让 readiness gate 因四个 video 同时 mount 而准备错误方向。

构建合同：

- 输入只允许使用当前 canonical forward WebM 的 78 个解码 RGBA 帧；
- 输出 600×1066、30fps、78 帧、2.600s、VP9 alpha、GOP ≤ 8；
- reverse frame 0 对应 forward frame 77，reverse frame 77 对应 forward frame 0；
- 对 reversed decoded authority：color SSIM ≥ 0.990、alpha SSIM ≥ 0.994；
- reverse pair 合计 bytes ≤ 10 MiB；加入后 runtime media 目标仍低于 60 MiB，并保留 80 MiB 硬上限；
- 黑底与暖纸 composite 都要有 first/middle/last witness；
- 不使用 legacy reverse 文件作为 authority，不加入 poster 或 canvas bridge。

运行时合同：

- forward leg 只激活 forward pair，reverse leg 只激活 reverse pair；
- 每侧正反两个 video 可以同时 mount，但 inactive direction 只允许 metadata preload；只 prepare/decode 当前方向，且只能有一个可见、可播放；
- reverse pair 以 native forward playback 播放，不允许在 2600ms motion leg 内逐 RAF seek；
- Proof→Figure2 reverse 在 depth mask commit 前先准备 reverse frame 0；depth retract 与 1000ms dwell 都持有该 terminal frame；
- reverse motion 完成后可持有 reverse frame 77；下一次 forward 前先隐藏准备 forward frame 0，再通过 presented-frame gate 原子切换；
- media manifest 的 reverseMedia 指向 reverse pair，reverse mode 改为 play。

Depth ownership 合同：

- SVG mask 从 commit 到 endpoint presentation 完成始终挂载；fully-visible endpoint 也通过 threshold 表达，不在首个 reverse frame反复 remove/apply mask-image；
- transform 在 depth leg 固定时不重复写 SVG filter/mask/image attributes；
- production render 不再创建 256×2 threshold arrays 或每 target 的 Set diagnostics；
- timelineReady 只有在 depth image decode、mask commit、Ink renderer active、directional media frame ready 后才上报；
- dispose 先确认 endpoint owner 已可见并呈现至少一帧，再清 mask 和 elevation；
- Proof retained ground 与 Figure2 depth field 任一时刻至少一个覆盖 viewport，禁止露出 Stage 默认深色或浏览器白底。

## 系统级影响

~~~mermaid
flowchart TB
  Input["SegmentPlayer / staged policy"]
  Timing["Phase-local timing"]
  Ink["Shared Ink runtime"]
  Shader["Mode-specialized WebGL"]
  Mask["Stable depth mask lease"]
  Media["Directional media ownership"]
  Scenes["Hero / Pattern / Figure3 / Crane / Figure2"]
  Proof["Proof retained presentation"]
  Gates["Performance + endpoint gates"]

  Input --> Timing
  Timing --> Scenes
  Ink --> Shader
  Ink --> Mask
  Shader --> Scenes
  Mask --> Proof
  Media --> Scenes
  Media --> Proof
  Scenes --> Gates
  Proof --> Gates
~~~

主要 blast radius：

- Story policy：Pattern stops、Figure2 reverse media contract。
- Shared runtime：Ink shader、viewport/ownership cache、depth mask lease。
- Scene renderers：Hero displacement、Figure3 endpoint channels、Crane poster removal、Figure2 directional surfaces。
- Media pipeline：Figure2 reverse deterministic rebuild、Crane corrected still archive provenance。
- Browser gates：逐 segment frame pacing、presented frame cadence、endpoint continuity、JS/media budgets。

## 实施单元

依赖关系：

~~~mermaid
flowchart TB
  U0["U0 Characterization"]
  U1["U1 Shared Ink hot path + budget headroom"]
  U3["U3 Pattern checkpoint"]
  U5["U5 Crane surfaces"]
  B0["B0 8 KiB JS headroom gate"]
  U2["U2 Hero phase clock"]
  U4["U4 Figure3 tail"]
  U6["U6 Figure2 reverse + depth"]
  U7["U7 Unified qualification"]

  U0 --> U1
  U1 --> U3
  U1 --> U5
  U0 --> U6
  U1 --> B0
  U3 --> B0
  U5 --> B0
  B0 --> U2
  B0 --> U4
  B0 --> U6
  U2 --> U7
  U3 --> U7
  U4 --> U7
  U5 --> U7
  U6 --> U7
~~~

实施进度：

编号沿用审查领域；实际执行顺序严格按 `U0 → U1 → U3/U5 → B0 → U2/U4/U6 → U7`，不得因文档章节顺序提前越过 B0。

- [ ] U0 — Characterization、预算与失败 witness
- [ ] U1 — Shared Ink 与 depth mask hot path
- [ ] U3 — Pattern collapse/copy 同相与单 checkpoint
- [ ] U5 — Crane media surface 纠正
- [ ] B0 — total JS raw ≤ 573,440 bytes（至少 8 KiB headroom）
- [ ] U2 — Hero displacement 与双相 phase clock
- [ ] U4 — Figure3→Services compositor handoff
- [ ] U6 — Figure2 directional reverse、depth performance 与白闪闭环
- [ ] U7 — 统一 qualification 与 HITL

### U0 — Characterization、预算与失败 witness

**Dependencies:** none

**Execution note:** Characterization-first；只补 deterministic counter、失败合同与最终浏览器采样入口，本单元不运行 Playwright。

**Files:**

- app/e2e/r5-performance.spec.ts
- app/e2e/r5-helpers.ts
- app/scripts/verify-performance-budgets.mjs
- docs/react-refactor/reports/r5-transition-frame-pacing.md

**Work:**

1. 复用当前工作树已有 performance artifacts，并把最终 focused run 拆成独立采样窗口：
   - Hero motion、Hero radial Ink；
   - Pattern collapse+copy、Pattern radial Ink；
   - Figure2 depth forward/reverse、Figure2 reverse media；
   - Figure3 最后 500ms。
2. 先用 unit/static instrumentation 冻结 hot-path counters：geometry reads、shader compile/link、texture create/upload、SVG attribute writes、video seek/play、visible owners 与 mask attach/remove。
3. 为最终 Proof→Figure2 reverse 采样定义每 RAF 的 visible owners、mask attached state、固定角点 RGB 与近白 viewport ratio；此时只写采样器和失败断言，不执行浏览器矩阵。
4. 新建本轮 frame-pacing 报告，保留历史 `docs/react-refactor/reports/r5-performance-budget.md` 原样；记录 577,089-byte JS、47,180,901-byte runtime media 与当前静态失败 witness，不在 characterization 阶段改变 production 行为。

**Tests / done criteria:**

- 报告标明 baseline branch/commit、dirty diff hash，以及最终 browser/project/GPU renderer 的待填字段；
- 三条 Ink 路径不再被合并成一个 aggregate 结果；
- 报告包含当前 JS raw、媒体、initial transfer 与性能基线；本单元不要求先制造 green。

### U1 — Shared Ink 与 depth mask hot path

**Dependencies:** U0

**Files:**

- app/src/vendor/ink-scene-transition.js
- app/src/vendor/ink-scene-transition.d.ts
- app/src/vendor/ink-scene-transition.test.ts
- app/src/vendor/ink-scene-transition.lifecycle.test.ts
- app/src/transitions/shared/sceneInk.ts
- app/src/transitions/shared/sceneInk.lifecycle.test.ts
- app/src/transitions/shared/radialInkIntro.ts
- app/src/transitions/shared/radialInkIntro.test.ts
- app/src/transitions/shared/ink.ts
- app/src/transitions/shared/ink.test.ts
- app/src/transitions/shared/depthThresholdMask.ts
- app/src/transitions/shared/depthThresholdMask.test.ts
- app/src/transitions/figure2-distance-expand/index.ts
- app/src/transitions/figure2-proof-chain.test.ts

**Work:**

1. renderer construction 接收 field kind，用静态 GLSL define 排除无关 rank/texture path。
2. 把多组 per-fragment FBM/hash 替换为 prewarmed deterministic RGBA noise atlas；每个 renderer generation 最多一次 atlas upload，active RAF 不创建 texture/program/buffer。
3. viewport 和 canvas size 建立 run-local cache，只在 resize invalidation 更新。
4. roots/surfaces/motion leases 只在 identity/state 变化时更新；复用集合，删除每帧 Set。
5. 合并 sceneInk/vendor 重复 diagnostics，只保留测试真实需要的 attributes。
6. depth mask 样式只 attach 一次；缓存 transform；用 scalar threshold 更新 filter；diagnostic table 懒生成且不进入 production RAF。
7. fully-visible endpoint 保持 mask topology 稳定，cleanup 延后到 presented endpoint。
8. generic Ink playback 改用 monotonic elapsed；移除 frame-delta cap 对墙钟的拉长，但保留 abort/dispose cancellation。
9. U1 本身不得高于 577,089-byte baseline；累计 U1+U3+U5 必须通过 B0 的 573,440-byte gate，不得预删其他体验合同来暂时满足预算。

**Tests / done criteria:**

- unit 证明 120 个 progress frames 只触发一次 geometry read；一次 resize 后只增加一次；
- radial render 不绑定/采样 depth 与 contour，depth render 不绑定 contour；
- prewarm 后 120 个 active frames 的 shader compile、buffer/texture allocation 与 noise/depth upload 增量均为 0；horizontal contour revision 不变时 upload 增量为 0；
- depth transform 不变时 SVG geometry writes 不增长；
- mask-image 在 reverse start 的 1→0.999 之间不发生 remove/reapply；
- visual shader fixtures 保留原 seed、origin、particle grade、侵蚀带宽与 edge alpha；允许 noise 实现变化，不允许粒子密度或覆盖轮廓明显降级。
- Hero intro radial controller、scene handoff radial/horizontal 与 Figure2 depth 三类 call site 都显式传入 field kind；不存在继续走动态 `uFieldMode` 的遗漏入口；
- atlas 生成、上传或 context restore 失败时抛出 renderer failure 并进入 recovery；dispose 必须释放 atlas texture，旧 generation 不得删除新 context 资源；
- B0 达到 total JS raw ≤ 573,440 bytes 后才允许 U2/U4/U6 合入新增 runtime；最终上限仍为 581,632。

### U2 — Hero displacement 与双相 phase clock

**Dependencies:** U1, U3, U5, B0

**Files:**

- app/src/scenes/hero/motion.ts
- app/src/scenes/hero/motion.test.ts
- app/src/scenes/hero/index.tsx
- app/src/scenes/hero/progress.test.ts
- app/src/transitions/hero-pattern/index.ts
- app/src/transitions/hero-pattern/index.test.ts
- app/src/transitions/shared/ink.ts
- app/src/story/timings.ts
- app/src/story/manifest.test.ts

**Work:**

1. Figure1 travel 改为 12svh→0svh；保留 scale curve、middle/back 和 900ms。
2. 给 Ink timeline 增加可选 phase-local playback map，Hero 使用 motion/Ink 两相而其他单相 Ink 不受影响。
3. forward/reverse 每相独立 easing；phase boundary 至少等待一个 RAF；active video 使用 rVFC，paused-ready video 使用 bounded double RAF，并复用现有 abort、prepare timeout 与 recovery。
4. reverse Ink 阶段冻结 Hero CSS variables 与 media target；边界之后才允许 reverse motion。
5. 缓存 Hero mobile breakpoint，progress RAF 不读取 clientWidth。

**Tests / done criteria:**

- motion unit 精确断言 12、6、0svh endpoints；
- reverse boundary 前后的 Ink progress、Hero Y、video targetTime 表明没有同帧推进；
- fake-clock unit 精确断言 forward 900/1800 与 reverse 1800/900；浏览器 witness 容许调度误差 ≤2 帧且不得改变 phase 顺序；
- 150ms 人工 long-frame 不得把总墙钟额外拉长 150ms，也不得在同一 rendered sample 同时推进两相；
- settle 前后视觉变量一致。

### U3 — Pattern collapse/copy 同相与单 checkpoint

**Dependencies:** U1

**Files:**

- app/src/story/timings.ts
- app/src/story/manifest.ts
- app/src/story/manifest.test.ts
- app/src/story/segment-player.test.ts
- app/src/transitions/pattern-star-map/index.ts
- app/src/transitions/pattern-star-map/index.test.ts
- app/src/scenes/pattern/index.tsx
- app/src/scenes/pattern/progress.test.ts
- app/e2e/r5-helpers.ts
- app/e2e/r5-production.spec.ts

**Work:**

1. 移除 700ms 独立 copy leg；总时长改为 3600ms。
2. staged policy 改为 stops=[0.5]、playMs=[1800,1800]、advance=[gesture]。
3. collapseProgress 与 copyProgress 映射同一 0→0.5 区间；Ink 只映射 0.5→1。
4. 更新 forward/reverse helper，禁止一个 gesture 穿过 P1。
5. 全仓删除或迁移 PATTERN_COPY_REVEAL_MS、PATTERN_COPY_STOP 及旧 second-stop consumers，避免残留测试或 diagnostics 继续表达三段政策。

**Tests / done criteria:**

- leg 中点同时满足 0<geometry<1 与 0<copy<1；
- P1 geometry=1、copy=1、Ink=0、Star Map hidden；
- reverse 到 P1 后等待 fresh gesture；下一 leg 中 geometry/copy 同时递减；
- 不再存在 PATTERN_COPY_STOP 或第二个 internal pause。

### U4 — Figure3→Services compositor handoff

**Dependencies:** U1, U3, U5, B0

**Files:**

- app/src/transitions/figure3-services/index.ts
- app/src/scenes/figure3-animation/index.tsx
- app/src/scenes/figure3-animation/progress.test.ts
- app/src/scenes/services/index.tsx
- app/src/scenes/contact/index.tsx
- app/src/scenes/shared/paperEntrance.ts
- app/src/styles.css
- app/src/transitions/group4-transitions.test.ts
- app/src/transitions/group7-transitions.test.ts
- app/src/media/timeline-video-driver.test.ts
- app/e2e/r5-performance.spec.ts

**Work:**

1. 按冻结 channel table 调整 copy/paper/source 曲线；transition 独占 source layer opacity，scene video 保持 opacity 1，删除 endpoint binary video opacity 与双重 fade。
2. Figure3 native input 对 end 使用 hold policy；已呈现 terminal frame 时不再补 seek。
3. Services paper/wash 迁移到静态 pseudo layers，只动画 opacity；copy 只动画 opacity/translate3d。
4. target 在 0.96 已 fully opaque，source 在 0.98 已 alpha 0，1.0 只做 ownership settle。
5. reverse 在 unhide source 前等待 terminal frame ready。

**Tests / done criteria:**

- progress 0.98 与 1 的 computed visual channels 相同；
- terminal drive 不增加 seek count；
- final 500ms 没有 background paint mutation 或 binary opacity jump；
- shared paper entrance 改动不改变 Contact hold/Crane→Contact 的 paper、wash 与 copy endpoint；
- isolated tail p95 满足 desktop ≤20ms、mobile Chromium ≤34ms，>50ms ratio <1%，无连续两个 >50ms frame。

### U5 — Crane media surface 纠正

**Dependencies:** U1

**Files:**

- app/src/scenes/crane-animation/index.tsx
- app/src/scenes/crane-animation/progress.test.tsx
- app/src/production/global-assets.test.ts
- app/src/transitions/group7-transitions.test.ts
- app/e2e/r4-g7.spec.ts
- app/e2e/r5-crane-media.spec.ts
- app/e2e/r5-homepage-media.spec.ts
- app/scripts/rebuild-crane-flock-poster.mjs
- app/scripts/rebuild-crane-flock-media.mjs
- app/scripts/homepage-media-contract.mjs
- app/scripts/verify-homepage-media-inventory.mjs
- app/scripts/verify-homepage-media-deep.mjs
- docs/assets/homepage-asset-slimming-report.md
- archive/assets/homepage-media/2026-07-15/README.md

**Work:**

1. 移除 CRANE_FLOCK_POSTER_SRC 与 video.poster。
2. corrected WebP 移入 archive authoring sources，更新两个 rebuild script 的冻结输入、默认输出路径与 SHA，防止重建时把静帧写回 production assets。
3. markup/static test 改为恰好两个 motion video、零 flock poster/still/bridge presentation surface；Crane 既有背景、云与 arch 图片不计入此断言。
4. browser witness 同时采 figure 与 flock rVFC；证明 figure 在 0.5s 后继续推进。
5. 保持既有 z-order 与 transform，不把 figure asset、opacity 或 schedule 复用给 flock。

**Tests / done criteria:**

- runtime DOM 中 poster property 为空、独立静帧 surface count=0；
- U5 完成时 source/runtime inventory 为 29 WebP + 9 WebM（38 files）、runtime media 为 47,100,785 bytes；corrected WebP 只存在于 archive/rebuild provenance；
- figure/flock src、media-key、resolution、SHA 分别匹配各自 canonical；
- 任何时刻每个 role visible surface count ≤1；
- warm paper/black HITL 在 t=0、0.5、1.2、2.3s 分别确认 track identity、figure 启动与双 motion composition；flock frame 0 鹤体完整。

### U6 — Figure2 directional reverse、depth performance 与白闪闭环

**Dependencies:** U0, U1, U3, U5, B0

**Files:**

- app/scripts/rebuild-figure2-reverse-media.mjs
- app/package.json
- assets/figure2-left-motion-reverse.webm
- assets/figure2-right-motion-reverse.webm
- app/scripts/homepage-media-contract.mjs
- app/scripts/verify-homepage-media-inventory.mjs
- app/scripts/verify-homepage-media-deep.mjs
- app/src/story/manifest.ts
- app/src/story/manifest.test.ts
- app/src/story/inventory-schema.ts
- app/src/story/inventory-schema.test.ts
- app/src/runtime/media-ready.test.ts
- app/src/harness/r4/mediaGate.test.ts
- app/src/scenes/figure2-animation/index.tsx
- app/src/scenes/figure2-animation/progress.test.ts
- app/src/transitions/figure2-distance-expand/index.ts
- app/src/transitions/figure2-proof-chain.test.ts
- app/src/transitions/shared/depthThresholdMask.ts
- app/src/stage/Stage.retained-proof.test.tsx
- app/e2e/r4-g2.spec.ts
- app/e2e/r5-homepage-media.spec.ts
- app/e2e/r5-performance.spec.ts
- docs/assets/homepage-asset-slimming-report.md
- archive/assets/homepage-media/2026-07-15/README.md

**Work:**

1. 建 deterministic reverse rebuild，冻结 authority SHA、frame order、PTS、GOP、alpha/composite quality。
2. Figure2 media manager 恢复 direction-specific pairs，但不恢复旧 poster/bridge 体系；inactive direction 仅 preload metadata，避免初始传输与并发解码上涨。
3. reverse prepare/commit 只激活 `figure2-*-motion-reverse` pair native playback；manifest reverse mode/media 与 inventory schema 同步，forward readiness 不得错误等待 reverse pair，反之亦然。
4. depth leg 先等待 reverse frame 0 + mask + renderer，再开放 Figure2 pixels。
5. stable mask lease 贯穿 reverse start、depth retract、1000ms dwell 与 endpoint commit。
6. dispose/recovery 只清当前 generation；旧 run 不能清新 run 的 masks 或 active media。
7. 增加 white-flash witness 与 reverse presented cadence gate。

**Tests / done criteria:**

- reverse motion 中两条 active video playCalls=1、逐帧 seek writes=0；
- offline deep verifier 证明 78/78 reverse index 映射；mobile Chromium 中 reverse-file mediaTime 单调递增、presented fps ≥24，完整 2.6s leg 至少观察到 55 个 distinct presented frames；
- direction swap 每侧始终一个 visible surface；
- Proof→Figure2 reverse 没有 near-white viewport frame，warm-paper corner witness 连续；
- browser witness 中 `min(R,G,B)>248` 的近白像素比例始终 <0.5%，四角 RGB 与 `#ede4d2` 每通道偏差 ≤8，且每帧至少一个 retained/depth owner 覆盖 viewport；
- depth Ink isolated p95 满足 desktop ≤20ms、mobile Chromium ≤34ms，>50ms ratio <1%，无连续 long frames；
- runtime media <80 MiB，initial resource <40 MiB，JS raw <581,632 bytes。
- reverse pair 合计 ≤10 MiB，最终 runtime media <60 MiB；inactive pair 不产生 body preload 或 presented frame。
- 最终 source/runtime inventory 为 29 WebP + 11 WebM（40 files）。

### U7 — 统一 qualification 与 HITL

**Dependencies:** U2, U3, U4, U5, U6

**Validation order:**

1. Targeted unit/static/media：
   - Ink shader/lifecycle/depth mask；
   - Hero/Pattern/Figure3/Crane/Figure2；
   - manifest、SegmentPlayer、endpoint ownership；
   - media deep、inventory、alpha/SSIM/PTS/GOP。
2. 全部修改结束后统一执行：
   - lint、TypeScript；
   - full unit；
   - production build；
   - performance/JS/media budgets；
   - legacy ownership；
   - git diff --check。
3. 最后一次浏览器验证：
   - focused transition performance；
   - default Playwright；
   - release Playwright desktop/mobile Chromium 与 WebKit。
4. HITL：
   - macOS 触控板 Hero reverse phase separation；
   - Pattern collapse+copy 同相及 reverse checkpoint；
   - Figure3 tail；
   - Crane figure/flock presentation；
   - Figure2 depth、reverse cadence、Proof white flash。

**Release done criteria:**

- 所有 7 项都有 deterministic contract、browser witness 与 HITL 结论；
- 三条 Ink 与 Figure3 tail 均逐路径通过 frame budget，不使用 aggregate 掩盖；
- JS raw ≤581,632、runtime media <60 MiB（硬上限仍为 80 MiB），所有既有 budget 未提高；
- immutable candidate、memory qualification、rollback manifest 指向同一 clean source commit；
- release manifest 才能从 prepare / pending-memory 进入 qualified。

## 失败与恢复路径

- Ink field-specific shader 编译失败：当前 run fail-closed，进入既有 recovery；禁止静默切成普通 clip。
- Ink noise atlas 生成/上传或 WebGL context restore 失败：与 shader failure 使用同一 fail-closed recovery；销毁当前 generation 的 atlas/program/texture，禁止带缺失粒子的半成品继续播放。
- Figure2 reverse media未 ready：停在 Proof/terminal presented frame，不开始 depth ownership；禁止回退到逐 RAF seek 后继续。
- Crane figure/flock 任一 track 未呈现：保持上一个 semantic hold，不显示 poster。
- Figure3 target未 fully opaque：source 保持 terminal frame，不执行 endpoint hide。
- resize during transition：先用缓存 viewport 完成本帧，下一帧应用一次 invalidated geometry；禁止一帧内 read/write/read。
- 所有 timeout、rVFC、ResizeObserver、mask、WebGL 与 media generation 在 abort/dispose/recovery 清理。

## 回滚边界

- U1 Shared Ink、U2 Hero、U3 Pattern、U4 Figure3、U5 Crane、U6 Figure2 分开提交。
- Figure2 reverse 二进制与 runtime wiring 同一 feature commit；authority/rebuild/report 可独立审计。
- Crane poster removal 与 corrected WebP archive move 同一提交，避免 runtime 引用悬空。
- 回滚任一单元不得恢复已经被 HITL 否定的 sequential Pattern、Crane runtime poster 或 Figure2 per-RAF reverse seek。
- 不通过修改 budget 常量、跳过 WebKit/mobile、删除粒子或标记 expected skipped 完成回滚。

## 计划完成定义

只有以下全部满足，007 才可标记 complete：

- Hero/Pattern radial 与 Figure2 depth 三条路径的 isolated frame pacing gate 全绿；
- Hero Figure1 总 travel 为 12svh，reverse Ink 与 motion 有可观测 phase boundary；
- Pattern collapse 与 copy 同相，且只剩一个 internal checkpoint；
- Figure3 final 500ms 无集中 endpoint hitch；
- Crane runtime 只有两个 canonical video surface，figure motion 可见，零 poster/static presentation；
- Figure2 reverse 使用 direction-specific native media，Proof→Figure2 无白闪；
- JS raw、media、LCP、memory、GPU、surface budgets 均未提高；
- frame-pacing qualification 只接受记录了 hardware GPU renderer 的 Chromium 结果；SwiftShader/软件 renderer 仅作诊断，不得用放宽阈值替代 release 性能证据；
- default/release Playwright、真实触控板和五项视觉 HITL 全部通过；
- immutable candidate、memory qualification、rollback manifest 完成。
