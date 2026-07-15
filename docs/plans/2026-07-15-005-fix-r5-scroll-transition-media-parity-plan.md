---
title: "fix: Close R5 scroll, transition, and media parity regressions"
type: fix
status: approved
date: 2026-07-15
reviewed_branch: codex/react-refactor-r5-parity-cutover
reviewed_head: 7ba6418b5a8eb86010b8dd8eabd6d49e78ea950f
implementation_gate: resolved
---

# fix: Close R5 scroll, transition, and media parity regressions

## 已确认设计决策（2026-07-15）

- **D1：** AOD、Figure2、Figure3、TTG、PH、Crane animation scene 全部保留为 semantic hold；本轮不得通过删除 canonical hold 或把这些 scene 降为 transient phase 来修复节拍问题。一次性交接通过 semantic hold 之间的 segment/run 合约、连续 multi-phase timeline 与零内部 `stagePaused` 落地。
- **D2：** 新建单一 canonical `figure2-proof` hold；`figure2-proof-opening`、`figure2-proof-cards`、`figure2-proof-closing` 仅保留为内部 panel anchor 与 URL/hash redirect alias。
- **D3：** transition 不是第三个 scene 或第三套 presentation。Disappear 的 source motion/消失属于前一个 scene 的 exit lifecycle，target scene 从第一次可见起就使用最终 hold 布局；Ink 只额外拥有共享 mask/canvas。Segment run 只编排 direction、readiness、progress、abort/reverse 与 settle，不拥有 source/target 文案副本或第二套布局。

## 结论

用户报告的 A、B 和 1–19 并非单一观感问题。静态代码、git 历史和逐帧媒体分析能够确认绝大多数问题成立；其中两项需要修正根因表述：

- **A 成立。** 当前阅读边界明确要求“第一次手势只 armed，下一次独立手势再累计 16px”，且仅用 220ms 事件间隔判断 wheel 是否为新手势。这会稳定制造“要滚两次”，也会让触控板惯性流长期无法触发。
- **B 成立，但独立 animation scene 不是问题。** AOD、Figure2、Figure3、TTG、PH、Crane 本来就是正式 scene，也应各自拥有 semantic hold。真正的问题是转场被实现成一套独立 presentation：source exit、target receiver 与 settle 后 hold 的 ownership/口径不一致，导致文案位置、排版、背景或 scroll position 在转场终帧和 hold 首帧之间变化；TTG/PH 的媒体与 dissolve 之间还存在 staged pause。最终目标是每对相邻 scene 都只呈现一次 `1 -> 2`：Disappear 复用 source scene 的 exit lifecycle，Ink 只拥有共享 mask/canvas，target 从第一次可见起就是最终 canonical hold surface，一个 run、零内部 pause、一次视觉无变化的 settle。
- **C 部分成立，不能笼统归因。** Batch A 确实制造了 Crane RGB/matte 跨源错位；Batch B 确实移除了多个 poster 并增加 frame-ready 显示门，暴露 AOD/Figure3/Crane 首帧空白。但 Hero、Pattern、Proof 和若干 transition ownership 问题早于 Batch A/B。
- **1–6、8、10–13、15–19 均有直接代码或资产证据。**
- **7 的现象成立，但不是 alpha 通道消失。** AOD WebM 有 alpha；真正问题是视频约在总进度 20.8% 已变为全不透明，而代码直到 33.3% 才结束 alpha composite 阶段，必然遮住 cloud/sun。用户要求的“逐渐变成全显示”也没有被资产或合成曲线保证。
- **9 条件成立。** 正常路径实现了倒放，但 presented-frame 准备失败会触发 recovery，直接跳到 AOD 初始 hold；现有 fake-video 测试没有覆盖用户看到的失败路径。
- **14 的视觉判断有代码依据，但不是 R5/Batch 回归。** Proof 沿用 Figure2/Brand 的旧 retained gradient，与 AOD/Figure3/Services 等暖纸色不一致；它在 R4 就已存在。

当前分支不能据已有 green tests 判定这些问题不存在。`pnpm test` 通过了 87 files / 556 tests，但部分测试正把“两次手势”固化为正确契约；`pnpm verify:media:deep` 也只验证 codec、alpha 可解码、PTS、fps、GOP 和重建一致性，不验证首帧是否在 reveal 前呈现、RGB/matte 是否对齐或逐帧 alpha 曲线是否符合设计。

本文件是已确认的实施规划。D1–D3 已在文首冻结；实施不得重新把 animation scene 降为 transient phase，不得把 transition 做成第三套 presentation，也不得把 Proof 重新拆成三个 reading holds。

## 审查范围与限制

### 冻结基线

- Worktree：`/Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-parity-cutover`
- Branch：`codex/react-refactor-r5-parity-cutover`
- HEAD / origin：`7ba6418b5a8eb86010b8dd8eabd6d49e78ea950f`
- R5 pre-Batch repair：`3b3ce381`（`fix(parity): close r5 transition regressions`）
- Batch B media cutover：`f5a4979`（`refactor(media): use canonical directional videos`）
- Batch A/B/C merge：`ff297dd`
- legacy/main 对照：`main` 上的 `index.html`、`js/sections/hero.js` 和 homepage transition adapters
- 视觉阶段对照：R4 accepted 与 R5 pre-Batch 历史资产、现有 asset slimming report

### 使用的证据

- `graphify-out/GRAPH_REPORT.md`：确认 blast radius 集中在 StorySpine、HandleRegistry、SegmentPlayer、Director、transition/media communities。
- production source、tests、R4/R5 设计文档与 inventory。
- git blame/log/show，用于区分 R5、Batch A、Batch B 和历史设计问题。
- ffprobe/ffmpeg/libvpx 的 metadata、逐帧 alpha 统计、RGBA/paper composite 对比。

### 未做事项

- 本轮没有运行 Playwright，也没有改业务代码或资产。
- 未做浏览器截图式视觉验收，因此“冷暖程度”和真实 macOS 触控板手感最终仍需 HITL。
- 没有把用户指出的参考资产直接复制进 R5；计划要求先建立可追溯的 canonical 生成链。

## Findings Matrix

| 编号 | 判断 | 直接证据 / 根因 | 目标修复 |
|---|---|---|---|
| A | **成立，高优先级** | `reading-edge-latch.ts:18-20,51-69` 明确要求第二个独立手势；wheel 新手势依赖 220ms idle。`input-controller.ts:132-160` 在 armed 后丢弃余量并 return。 | 建立 entry-aware 的 `free -> armed -> steady -> fired` 状态机：吸收本次惯性尾流，但下一次清晰手势只需一次。 |
| B | **成立，transition ownership / endpoint contract 错误** | animation scene 作为独立 hold 是正确设计；问题在于 `manifest.ts:185-200` 与 `stagedMediaHandoff.ts:190-283` 给 TTG/PH 加了内部 pause/transition attrs，并让 segment helper 承担了独立 receiver presentation，target 文案在 reading entry 与 settle 后 hold 之间没有共同终态。 | 保留全部 animation holds；Disappear 由 source scene exit + target scene final surface 组成，Ink 只增加共享 mask/canvas。Segment 只编排同一 canonical source/target DOM；`transition(p=1)` 必须与 settle 后 hold 第一帧完全一致。 |
| C | **部分成立** | Batch A 的 Crane 使用独立 MP4 RGB 与旧 WebM matte 做 `alphamerge`；Batch B 移除 poster 并以 frame-ready 控制可见性。其他多项问题早于批处理。 | 分开修 runtime readiness、transition ownership 和媒体 provenance；禁止用一次“回滚 Batch”代替逐项修复。 |
| 1 | **成立** | Hero 用 `figure1.webm`，但静态 surface 是无 alpha 的 `figure-poster.jpg`；`preload="none"` 使 poster 成为冷启动真实画面。 | 从 authored 0.34s 显示帧生成 lossless RGBA WebP poster，纳入 inventory/hash/budget；视频 presented 后再接管。 |
| 2 | **成立** | 当前 middle/figure 共用同一 eased progress，并分别同向下移 `58svh/70svh`；main 是 back 轻微上移、middle 缓慢下移、figure 上移更多并播放动画。 | 精确移植 main 的三层独立采样公式与视频区间，增加数值 parity tests。 |
| 3 | **成立** | Pattern hold 强制 `copyProgress: 1`；Hero→Pattern 直接准备该 hold；Pattern 收缩也一直传 `copyProgress: 1`。 | 展开 endpoint 为 `expanded-no-copy`；copy 只由 collapse progress 逐步出现，reverse 严格镜像。 |
| 4 | **成立** | Pattern 复用 `STAR_MAP_COPY`，只渲染单个 `<p>`；`.r4-pattern-scene__statement::before` 绘制填充框。 | 使用用户确认的 label/h3/p，透明右侧排版，无背景填充；同步静态 shell 与 copy checks。 |
| 5 | **成立** | shared Ink 把 transition attr 写到 Stage 的 `data-r4-transition`，CSS 却仍匹配 AOD layer 的旧 `data-r3-transition="star-map-aod"`；AOD 外壳纸色因此完全盖住 Star Map。 | 建立 run-owned endpoint marker；交接期间 AOD root/sticky/field 透明，仅 reveal surface 持有纸色和 clip。 |
| 6 | **成立** | AOD 无 figure poster，Star Map→AOD `prepareEndpoints` 为空；Batch B 后 video 只有 frame-ready 才显示。 | Ink 开始 reveal 前 await AOD frame 0；必要时用同帧 RGBA WebP 做本地 recovery。 |
| 7 | **现象成立，根因修正** | 当前 AOD alpha 0..255 完整，但约 progress 0.208 即全白；代码到 1/3 才关闭 composite，video z-index 又在 cloud/sun 之上。 | 冻结批准的 output 曲线，统一 alpha milestone 与 layer ownership；若要求渐变 matte，则从权威 RGBA 源重建并新增逐帧曲线验证。 |
| 8 | **成立** | Method 顶部也经过同一 latch：entry/reset 后第一次反向手势只 armed；连续惯性可能一直不被认作新手势。 | reverse 落到已知边界时初始化为 mounted/steady，第一次向外滚动即提交。 |
| 9 | **条件成立** | 正常 timeline 会 reverse；但 frame prepare stale/error 会清除 ready、触发 recovery，再 `jumpToEnd` 到 AOD hold。`terminalFallbackScene` 与通用 recovery 目标还互相冲突。 | 保证 presented-frame 倒放；失败时留在 Method/最后有效帧并重试或显式报错，禁止假装成功跳 AOD。 |
| 10 | **成立** | Director 已把 reverse 目标定位到 reading bottom，但 `story-reading-entry` 无 detail 且只 reset latch，下一次向下仍只是 armed。 | 将 `ReadingEntryIntent(scene, edge, source, token)` 传给 controller，按 entry edge 初始化 steady。 |
| 11 | **成立** | foreground arch `brightness(1)`，中景约 `.96`；R4 accepted/R5 candidate 曾是 `.76`。 | 先恢复 `.76` 基线，再以“前景代表区域亮度显著低于中景”为 HITL 验收，不凭主观随意调值。 |
| 12 | **成立，结构级** | Proof 是三个顶层 reading holds、三个 100svh layer 和两个 900ms section handoff；每层通常没有自身可滚高度。 | 合并为一个 compound proof scrollport，内部三块 `min-height:100svh` panel；内部不经过 Director/latch。 |
| 13 | **成立** | Brand reverse 落到 proof closing 底部后 latch 被 reset；当前 Proof 三 hold 结构进一步放大重复输入。 | compound proof 定位 closing bottom，并以 steady 挂载；第一次向下即可回 Brand。 |
| 14 | **视觉判断成立；非回归** | Proof/retained ground 沿用 `#f6f2e8 -> #ece8dc -> #e4ddcf`，与后续场景常用 `#ede4d2` 暖纸色体系不同；R4 已如此。 | 在修完 arch grade 后，统一到单一 warm-paper token/owner，并由 HITL 确认，不把它伪装成 Batch rollback。 |
| 15 | **成立，Batch B 回归** | Brand→Figure3 只 `renderFigure3Hold`，没有 prepare frame；视频无 poster，只有 ready 才显示。 | target opacity/reveal 大于 0 前 await `prepareFigure3AnimationFrame(...,0)`；preload 不得空报 `mediaReady`。 |
| 16 | **成立，3b3ce381 回归** | 80% 后 source layer fade out、target layer fade in、copy 与 paper 共用同一 receiver progress；Figure3 还自己生成实心 fill。 | 拆成 source、copy、paper 三条通道；source 到终点前保持可见，copy 80% 入场，paper 从 80% 渐增且是唯一最终背景 owner。 |
| 17 | **成立** | Lab 没有专属阈值问题；其底部同样被全局 reading latch 卡住。 | 与 A/8/10 共用同一 boundary state machine；Lab 不做局部阈值补丁。 |
| 18 | **成立，Batch B race** | Crane video 默认隐藏到 frame-ready；Education→Crane 只同步 `renderCraneHold`，没有 await 两个媒体首帧。 | shared Ink 增加 async target-frame prepare hook，Crane figure/flock 均 ready 后才允许 reveal。 |
| 19 | **成立，Batch A 资产错误** | 当前 canonical 的 matte 与用户确认 WebM 几乎一致，但 alpha 区域内 RGB 与该 RGBA 源有显著逐帧误差；asset report 证实 RGB/alpha 来自两个不同源后独立重采样。 | 以用户确认 RGBA WebM 为单一权威源，整帧共同转成 30fps canonical；禁止跨源 `alphamerge`，增加全轨迹 premultiplied/composite 对比。 |

## 根因分组

### F1 — 边界状态把“刚到边”和“已落边”混为一谈

`consumeReadingPixels()` 只返回统一的 `atEdge`，没有把 `startedAtEdge` 与 `reachedEdgeDuringInput` 传到 latch。Director 实际已经知道目标 reading scene 的 `edge/source/token`，StoryApp 也会把 scrollport 定位到 top/bottom，但随后只派发一个无 detail 的 `story-reading-entry`，controller 因而只能重置。

这同时解释 A、8、10、13、17。正确修复不是把 16px 或 220ms 随便调小，而是让状态知道：

1. 用户是否还在内容内滚动；
2. 是本次物理手势刚到边，还是 segment 已把目标挂载在边；
3. 当前惯性尾流是否应该被吸收；
4. 下一次重新发力是否应立即提交。

### F2 — Proof 的三屏被错误建成三个长文场景

`figure2-proof-opening/cards/closing` 各自是 reading hold，内部使用 section handoff，而不是一个连续 scrollTop。既有 R4/architecture 文档反而要求共享 proof overlay/page-scroll state，禁止 cinematic handoff。

Proof 应有一个阅读 owner、三个视觉 panel、两个外部边界。三个 panel 可以保留语义 anchor、进度名和 hash alias，但不能各自触发 reading latch 或 SegmentPlayer。

### F3 — Transition receiver 与 settle 后 hold 的呈现口径不一致

正确的 scene 拓扑本来就是：

```text
services hold
  -> services-ttg Ink run
  -> settle TTG
ttg-animation hold
  -> ttg-lab disappear run（TTG media + 600ms dissolve）
  -> settle Lab
lab hold
```

TTG 是正式 scene；它位于两个相邻 segment 之间，不是 Services→Lab 的 transient phase。PH、AOD、Figure2、Figure3、Crane 同理。

当前 TTG→Lab、PH→Education 的问题有两层：

1. media leg 与 dissolve leg 之间存在 `stage:0` pause，需要额外输入才能完成同一个相邻 scene 交接；
2. target 文案在 transition 中已经可见，但 settle 后会因 transition attrs 清理、layer role 从 `to` 变成 `current`、hold renderer 归一化，以及 reading `scrollTop` 定位时机而改变位置或样式。

第二层才是用户描述“接带文案的转场特别明显”的准确含义：视觉上的 `2a` 是 transition receiver，`2b` 是 settle 后 hold。即使 DOM 没有物理复制，只要 computed style、布局或 scroll position 改变，用户仍会看见两个版本。

目标约束是：**每对相邻 scene 一个 run、零内部 pause、一次 settle；settle 只能提交 runtime 状态，不能造成任何可见变化。**

### F4 — shared Ink 的 attr、background 和 reveal owner 不一致

Star Map→AOD 的 DOM ownership 已迁到 shared Ink，CSS 仍依赖旧 layer attribute；内部 reveal surface 接受 clip，但外层实心背景没有透明化。类似问题也出现在 target first-frame gate：Ink 只准备同步 DOM endpoint，不能 await incoming media 的 presented frame。

shared Ink 需要两个正式契约：

- `prepareTargetPresentation(context): Promise<void>`：在 target 可见前完成精确帧准备；
- run-owned endpoint marker：只由当前 run 设置/清理 background、clip 和 elevation 状态。

### F5 — frame-ready gate 没有配套所有入口

Batch B 让视频在 `data-timeline-video-frame-ready=true` 前 opacity 为 0，这是合理的防 stale-frame 方向，但 Brand→Figure3、Star Map→AOD、Education→Crane 没有同步增加首帧 prepare。结果不是显示错误帧，而是直接没有该图层。

修复必须统一入口 contract，不能给三个 scene 分别加互不一致的 timeout/DOM hack。

### F6 — 媒体检查验证“文件可用”，没有验证“画面正确”

当前 deep verifier 可以证明 VP9 alpha 可解码、时间戳单调、GOP 合格、重建 deterministic；它无法证明：

- RGB 与 alpha 来自同一时刻；
- 第一个 presented frame 在 target reveal 前完成；
- AOD 的 alpha 从局部透明到全显示符合批准曲线；
- forward/reverse 中间帧真实呈现，而不是只写了 `currentTime`；
- composited pixel 与权威 RGBA 源一致。

Crane 19 正是该测试盲区的直接例子。

## 目标架构

### 1. Semantic Scene Hold + 两类 Transition

AOD、Figure2、Figure3、TTG、PH、Crane 都是正式、可停留、可导航的 canonical scene，并全部保留 semantic hold。它们不是前后文案 scene 之间的 transient phase。唯一的结构例外是 Proof：opening/cards/closing 是同一个 `figure2-proof` hold 内的三个连续 panel。

相邻 semantic holds 之间只有两类视觉转场：

```text
TransitionKind = ink | disappear
```

Scene 自身的视频、人物和图层运动属于 scene lifecycle；segment run 只把 source exit、可选共享 effect 与 target entrance 编排到同一条时间线上，不会引入第三种 transition、额外 hold、内部 pause 或中间 settle。标准生命周期是：

```text
hold(1)
  -> transition run(kind, canonical scene 1, canonical scene 2)
  -> settle（视觉无变化的状态提交）
  -> hold(2)
```

视觉 ownership：

| Owner | 负责 | 禁止负责 |
|---|---|---|
| Source scene | hold endpoint、scene-specific exit motion、视频/人物/图层运动；Disappear 的主要消失效果 | target 文案副本、target 最终布局 |
| Target scene | 最终 hold DOM、copy/background/layout、entry edge，以及确有设计要求的 entrance channels | transition 专用第二套 layout、settle 后重新排版 |
| Shared Ink effect | mask/canvas、Ink contour 与 reveal ownership | source/target 内容 DOM、scene hold 状态 |
| Segment run | direction、readiness、progress、timing、abort/reverse、layer coordination、settle | 第三个 scene、source/target clone、scene-specific presentation policy |

因此 TTG→Lab、PH→Education 的 visual timeline 应分别由 TTG/PH scene 的 exit renderer 主导；Lab/Education 以最终布局预挂载在其下方。Figure3→Services 中 Figure3 scene 拥有 source motion，Services scene 拥有 copy 与 paper entrance，segment 只同步它们的 progress。Pattern→Star Map 中 Pattern scene 拥有 collapse/copy，shared Ink 只拥有 mask/canvas，Star Map scene 始终拥有自己的最终 surface。

硬性约束：

- transition 复用两个 canonical scene roots，通过 scene-owned hooks 与共享 effect 完成交接，不创建 source/target 的临时文案副本；
- scene 1 在 hold 与 transition 起点复用同一 DOM/media surface；
- scene 2 在 transition receiver 与 settle 后 hold 复用同一 DOM/media surface；
- Disappear 的 source motion 必须由 source scene owner 定义；segment adapter 不复制 scene sampler、视频控制或 exit layout；
- target 第一次可见前就使用最终 hold layout/scroll entry；target entrance 只能改变明确声明的通道；
- Ink renderer 只拥有 mask/canvas，不拥有 scene copy、background 或 hold normalization；
- forward/reverse 使用同一段镜像 timeline；
- run 内允许多个自动时间阶段，但不允许 `stagePaused` 或等待第二次输入；
- URL/history/HUD 保留所有 animation scene IDs；只对 Proof 三个旧 IDs 做 alias migration。

### 2. Compound Proof

推荐将三个 proof SceneId 合并为一个 canonical `figure2-proof` hold：

```text
figure2-proof scrollport
├── #opening  min-height: 100svh
├── #cards    min-height: 100svh
└── #closing  min-height: 100svh
```

- 旧 `figure2-proof-opening/cards/closing` 保留为 URL/hash alias 和内部 panel identifiers。
- `figure2-distance-expand` 进入 `opening/top`。
- `proof-brand` 从 `closing/bottom` 离开。
- Brand reverse 回来时定位 `closing/bottom` 并初始化 steady。
- 内部可以使用轻量 CSS scroll snap，但禁止调用 Director、SegmentPlayer 或 reading latch。

### 3. Entry-aware Reading Boundary

建议拆成两个 owner：

- `PhysicalGestureTracker`：识别 wheel/touch/key 的物理手势生命周期、方向反转、惯性尾流和重新发力；220ms 只能是 fallback，不是唯一判断。
- `ReadingBoundaryLatch`：只负责 reading edge 状态，不自己猜 entry 来源。

状态语义：

```text
free/content
  -- 本次手势到边 --> armed（吞掉当前惯性尾流）
  -- 手势明确结束 --> steady
steady
  -- 下一次同向清晰手势超过噪声门 --> fired（仅一次）
mounted-at-edge
  -- segment settle / presentation ready --> steady
```

关键点：

- 16px 可以保留为一次新手势内的噪声门，但不能再要求两次额外手势。
- 从 segment reverse/forward 已经落在边界时，使用 `ReadingEntryIntent` 初始化 mounted/steady。
- 朝内容方向滚动必须优先交还原生 scrollport。
- Director 现有“清除上一场景 queued momentum，避免惯性跨章”的保护必须保留。
- 任一物理手势最多产生一次 `CHARGE_FIRED`。

### 4. Presented-frame Before Reveal

所有进入 alpha-video surface 的 transition 采用同一协议：

1. 注册 run/generation；
2. mount target DOM；
3. prepare 精确方向 endpoint；
4. 等待 `requestVideoFrameCallback` 或等价 presented-frame 证据；
5. 设置 run-owned ready；
6. 才允许 target opacity/Ink ownership 大于 0；
7. abort/dispose 只能清理自己的 generation；
8. 失败留在已提交 endpoint 或使用同帧本地 RGBA fallback，不能跳到另一个 scene 假装成功。

首批应用：AOD frame 0、Figure3 frame 0、Crane figure/flock frame 0；同时审计 TTG/PH re-entry。

### 5. 单一视觉 owner

每个交接时刻只允许一个 owner 控制最终纸色/遮挡：

- Star Map→AOD：AOD inner reveal surface 是纸色 owner；outer root/sticky/field 透明。
- AOD→Method reverse：AOD 视频与 Method copy/background 的可见性互补，失败不走错误 endpoint recovery。
- Figure3→Services：Services paper 是最终背景 owner；Figure3 fill 不再抢先制造实心遮挡。
- Pattern→Star Map：Pattern copy 和 Star Map copy 分属各自 surface，不复用同一个 DOM/copy constant。
- TTG→Lab / PH→Education：TTG/PH scene 拥有 source media/exit，Lab/Education scene 拥有最终 copy/background/scroll entry；staged helper 不再拥有独立 receiver presentation。

### 6. Transition Endpoint Parity 与视觉无变化的 Settle

每个 segment 必须满足以下 endpoint invariant：

```text
forward transition target at p=1
=== target hold first frame after settle

reverse transition target at p=0
=== source hold first frame after reverse settle
```

这里的 `===` 包括：

- 同一个 canonical DOM 和媒体 surface；
- 相同的文字容器 `getBoundingClientRect()`；
- 相同的字体、行高、字距和换行；
- 相同的 opacity、transform、clip、z-index 和背景；
- reading scene 相同的 `scrollTop` 与 entry edge；
- transition attributes 清理、layer role 切换和 timeline dispose 前后 computed style 不变。

对于 TTG→Lab、PH→Education，目标 Lab/Education 必须在第一次可见前就定位到最终 entry edge，并使用最终 hold 布局。transition 只驱动明确允许变化的通道；p=1 时这些通道已经归一到 hold 值。settle 不得再调用会产生可见重排、跳动或背景切换的第二套 presentation。

## 已确认设计决策详解

### D1 — 所有顶层 animation scene 保留 semantic hold

**已确认：** AOD、Figure2、Figure3、TTG、PH、Crane 均保留 canonical SceneId、navigation/history/HUD 身份和 semantic hold。不得通过删除这些 holds 解决 B。

修复发生在相邻 scene 的 segment/run lifecycle：删除内部 `stagePaused`，复用 canonical source/target presentation，并保证 transition endpoint 与 settle 后 hold 连续。TTG/PH media 与 dissolve 是各自到后续文案 scene 的同一个 disappear run 内的自动阶段，不是额外 scene 或 hold。

### D2 — Proof ID 兼容策略

**已确认：** 使用一个新 canonical `figure2-proof` hold，三个旧 ID 仅作为内部 anchor + redirect alias。不得再把它们实现为三个可独立 latch、run 或 settle 的 reading holds。

### D3 — Transition 是编排边，不是第三个视觉场景

**已确认：** Segment/transition module 保留为 runtime edge，但不得成为独立视觉 owner。

- Disappear：source scene 定义并执行 exit motion；target scene 提供已经处于最终 hold 布局的 canonical surface。segment 只协调二者的 progress 与最终 settle。
- Ink：source/target scene 继续拥有各自 canonical surface；shared Ink 只拥有 mask/canvas/reveal effect。Ink canvas 不是第三个 scene。
- Reverse：复用同一 scene-owned hooks 与共享 effect 反向运行，不创建 reverse 专用 DOM 或 presentation。
- Settle：只提交 cursor/layer role/history/runtime 状态；不得再次调用另一套视觉初始化造成跳动。

## 实施单元

### Unit 0 — 冻结失败证据与迁移基线

**目标：** 在改共享 hub 前，把用户报告的失败路径变成会失败的 deterministic contracts。

**工作：**

- 记录当前 canonical spine、navigation/history/HUD/hash 输出，供 ID migration 对照。
- 将现有“两手势才触发”测试改写为新目标测试，先在本地红灯运行确认它能捕获缺陷，再与对应修复一起提交；仓库中不长期保留 skipped/expected-fail。
- 为 AOD、Figure3、Crane 生成 0/20/40/60/80/100% decoded contact sheets 和 alpha/composite 数据；只把脚本与指标纳入仓库，不提交临时大图。
- 冻结用户确认的 `crane-figure1-transition.webm` SHA、帧数、fps、duration 和 decoded RGBA fingerprint。
- 从 R4 accepted、R5 pre-Batch 与 current 分别提取 Hero/AOD/Figure3/Crane reference frames，标注哪个是设计 authority，哪个仅是历史证据。
- 对 TTG→Lab、PH→Education 冻结 `p=.99`、`p=1.00`、settle 后第一帧的 target copy rect、computed style、line boxes、background 和 reading `scrollTop`；修复前必须能复现 endpoint jump。
- 将当前 candidate report 标记为 visual gate 未通过，禁止已有自动化结论覆盖本轮 HITL findings。

**验收：** 每个 finding 都有一个 source/contract/asset witness；新测试在修复前按预期失败，旧错误契约不再被当作 acceptance。

### Unit 1 — Reading gesture 与 entry state

**涉及：** A、8、10、13、17

**主要文件：**

- `app/src/production/reading-edge-latch.ts`
- `app/src/production/reading-handoff.ts`
- `app/src/production/input-controller.ts`
- `app/src/production/StoryApp.tsx`
- `app/src/runtime/director.machine.ts`
- `app/src/story/types.ts`
- 对应 unit/integration tests

**工作：**

- 保留 `startedAtEdge` / `reachedEdgeDuringInput` 区别。
- 用 `ReadingEntryIntent` 的 scene/edge/source/token 初始化 latch，不再派发无语义 reset。
- 引入 `free/armed/steady/fired` 和 `mounted-at-edge`。
- 为 wheel 建独立 gesture envelope；touch 以 pointer lifecycle 为准，key 每次按键是独立 intent。
- 保留 anti-skip queued-momentum 清理与方向反转 reset。

**验收：**

- 长文内部连续滚到底不会被同一惯性尾流直接带进下一章。
- 自然到边后，下一次清晰同向滚动一次即进入相邻场景。
- Method top 第一次向上回 AOD；Lab bottom 第一次向下进 PH。
- reverse 落在任意 reading bottom 后，第一次向下可返回下一场景。
- 连续小于 220ms 的触控板事件不会永久卡住。
- 一次 gesture 最多一个 `CHARGE_FIRED`。

### Unit 2 — Compound Proof migration

**涉及：** 12、13、14 的 background owner

**主要文件：**

- `app/src/story/canonical-spine.ts`
- `app/src/story/types.ts`
- `app/src/story/manifest.ts`
- `app/src/production/module-loaders.ts`
- `app/src/stage/Stage.tsx` 与 reading/retained-ground ownership
- `app/src/scenes/figure2-proof-*`
- `app/src/transitions/figure2-proof-chain*`
- inventory、static shell、navigation/history/HUD/copy checks

**工作：**

- 落地 D2，建立一个 scrollport + 三个 100svh panels。
- 删除两个内部 section handoff/readingPolicy segment。
- 旧 IDs 变为内部 anchors/aliases，并补 direct navigation migration tests。
- 让 retained ground/near arch 只存在一个 owner，跨三 panel 不重挂载、不闪烁。

**验收：**

- proof `scrollHeight` 约为三个 viewport；跨 panel 只改变同一个 `scrollTop`。
- opening→cards→closing 不派发 `CHARGE_FIRED`、不启动 SegmentPlayer。
- 只有 proof top/bottom 可离开 compound hold。
- Brand reverse 后定位 closing bottom，第一次向下回 Brand。

### Unit 3 — 相邻 Scene Transition Lifecycle 与 Endpoint Parity

**涉及：** B、Pattern→Star Map 以及 TTG/PH 的额外 pause

**依赖：** D1/D3 已确认；不得改变 animation scene 拓扑或重新引入 transition-owned presentation。

**主要文件：**

- `app/src/story/canonical-spine.ts`（characterization：锁定全部 animation holds）
- `app/src/story/manifest.ts`
- `app/src/story/segment-player.ts`
- `app/src/runtime/director.machine.ts`
- `app/src/transitions/shared/stagedMediaHandoff.ts`
- Pattern、TTG、PH scene-owned progress/media/exit renderers
- 对应的 thin transition adapters 与 shared Ink/disappear coordinators
- Lab、Education hold renderers 与 reading entry lifecycle
- transition endpoint、navigation/history/HUD/hash compatibility tests

**工作：**

- 保留 AOD、Figure2、Figure3、TTG、PH、Crane 的 SceneId、hold 和相邻 segment；增加 topology characterization，禁止后续实现误删。
- 将 TTG/PH 的 media、alpha、scene-specific exit sampling 归还各自 scene owner；`stagedMediaHandoff` 只协调 source exit、target entrance 和 settle，不再生成独立 receiver presentation。
- 对所有 Disappear segment 固化 source/target ownership：source scene 定义 exit，target scene 定义最终 layout 与可动画 entrance channels，segment 不复制任一 scene 的 DOM、CSS contract 或 hold renderer。
- 对所有 Ink segment 固化 shared effect 边界：Ink 只控制 mask/canvas/reveal；source/target copy、background 和媒体继续由 scene owner 控制。
- TTG/PH 保留 media + 600ms dissolve 的视觉阶段，但删除 `stage:0` pause；一次 run 连续完成。
- Pattern collapse + Star Map Ink 也使用单一连续 timeline；保留两个时间阶段，删除人为中停。
- target 文案第一次可见前先应用最终 reading entry edge；禁止 settle 后再修改 scrollTop。
- transition receiver 复用 target canonical DOM；只动画显式的 opacity/transform/paper channels，p=1 全部归一为 hold 值。
- 清理 transition attrs、切换 layer role 和 dispose timeline 必须在视觉上无变化。
- 建立 invariant test：一个相邻 scene boundary 只有一个 runId、零内部 `stagePaused`、一次 settle。

**验收：**

- 正反向各一次有效输入完成完整 `1 -> 2`。
- TTG/PH 媒体结束后不再等待第二次滚动才 dissolve。
- TTG/PH 在各自进入和离开 segment 之间仍是正式 semantic hold；event log 不出现内部 pause 或中间 settle。
- transition 中不创建 target copy 副本，也不在结算后再播放第二次同类 handoff。
- ownership test 证明 segment DOM 只引用现有 canonical source/target roots；不存在 transition-owned source/target copy、临时 scene root 或 settle-time replacement。
- 对 TTG→Lab、PH→Education，`p=1.00` 与 settle 后第一帧的 copy rect、line boxes、font metrics、opacity、transform、background 和 `scrollTop` 完全一致。
- reverse endpoint 满足同样的连续性要求。

### Unit 4 — Hero 与 Pattern parity

**涉及：** 1–4

**工作：**

- 生成 Hero 0.34s canonical RGBA WebP poster，更新 inventory、preload policy、byte budget 和 recovery contract。
- 把 main Hero parallax 公式提取为 pure sampler：back `0 -> -5vh`，middle desktop `1 -> 19vh` / mobile `1 -> 15vh`，figure `12 -> -3vh`，middle scale `.98 -> 1.30`，figure `1 -> 1.065`。
- Pattern hold 改为 expanded/no-copy；collapse 独立驱动 manifesto copy。
- 使用用户确认的精确 DOM/copy：

```html
<span class="card-label">一句话讲清我们干什么</span>
<h3>让 AI 从一场培训，变成账上的数字。</h3>
<p>我们不卖课、不卖软件，而是进到你的业务现场，把 AI 做成团队天天在用、月底对得上账的东西。</p>
```

- 去掉 statement 填充背景，保持透明排版；同步 no-JS/static fallback、copy alignment 和 handoff ownership checks。

**验收：** Hero 数值采样与 main 对齐；静帧与视频首帧无 alpha 跳变；Pattern 展开无文案，收缩才出现，reverse 镜像；文案逐字一致且无文本框填充。

### Unit 5 — Shared Ink endpoint ownership 与 target readiness

**涉及：** 5、6、15、18

**工作：**

- 为 shared Ink 增加 async `prepareTargetPresentation`，其完成前 target reveal 恒为 0。
- 增加 generation-owned endpoint marker/elevation/background cleanup。
- Star Map→AOD：透明化 outer wrappers，只 clip inner reveal surface，并准备 AOD frame 0。
- Brand→Figure3：准备 Figure3 frame 0 后才 reveal。
- Education→Crane：同时准备 figure/flock frame 0 后才 reveal。
- abort/re-entry/reverse 不得让旧 run 清除新 run 的 marker 或 ready 状态。

**验收：**

- Star Map→AOD 中点同时看得到两场，outer computed backgrounds 为 transparent。
- 所有 alpha-video target 在 opacity > 0 前均有精确 presented frame。
- 首次进入、重复进入、reverse 后重入一致。
- 失败只走本地 recovery，不出现空层或错误 endpoint。

### Unit 6 — AOD alpha 与 reverse

**涉及：** 7、9

**工作：**

- 先用 decoded output 对比决定“批准曲线”由 matte 还是 runtime composite 实现；禁止只根据 `alpha_mode=1` 宣称正确。
- 将 first-full-white milestone、cloud/sun ownership 和 `data-aod-alpha-composite` 阶段统一。
- 若批准结果要求 alpha 从局部逐渐扩展到全白，使用同一 RGBA authority 重建 canonical matte，不通过视频整体 opacity 假装 alpha 变化。
- 修复 Method→AOD recovery：presented-frame prepare/seek 失败时保留 Method 或最后有效帧，遵循 transition media contract，不跳 AOD 初始 hold。
- visibility/elevation 必须让 reverse 视频在 settle 前实际可见。

**验收：**

- AOD 动画全过程 cloud/sun 在设计保留期内不被全白视频提前遮住。
- alpha progression 的关键帧、first-full-white 和 composite pixel 均满足 frozen contract。
- Method→AOD `currentTime` 从约 2.567s 单调递减到 0，采到多个不同 presented frames。
- 注入 prepare/seek 失败时仍停留 Method/最后有效帧，无 recovery jump。

### Unit 7 — Figure2 grade 与 paper palette

**涉及：** 11、14

**工作：**

- foreground arch 先恢复 R4 `.76` grade 基线；不要同时改其他 Figure2 media 色阶。
- 为 near/middle representative crops 增加相对亮度证据，确保 foreground 明显更暗。
- arch grade 确认后，再把 compound proof/retained ground 接到统一 warm-paper token；整个三屏只有一个 background owner。

**验收：** foreground arch 比中景暗；Proof 与相邻暖纸色场景无冷色跳变；背景跨三个 panels 和正反向不闪。

### Unit 8 — Figure3→Services 单 owner handoff

**涉及：** 16

**工作：**

- 移除 target layer 整体 opacity 作为 paper 渐变手段。
- 拆分 `sourceVisibility`、`copyProgress`、`paperAlpha` 三个 sampler。
- Figure3 source 到 p<1 保持可见；Services copy 从 p=.8 入场；paper/wash 从 p=.8 到 1 逐渐增加。
- 删除或禁用 Figure3 late solid fill，让 Services paper 成为唯一最终背景 owner。
- 去掉 timeline 与 scene 的重复 easing，只保留一层 authored curve。

**采样验收：**

| progress | Figure3 | Services copy | Services paper |
|---:|---|---|---|
| .79 | 完整可见 | hidden | 0 |
| .80 | 完整可见 | 开始入场 | 接近 0 |
| .90 | 仍可从透明纸色下看到 | 已在场 | 中间 alpha |
| .99 | 仍未被提前硬切 | 已在场 | 接近 1 |
| 1.00 | 才隐藏 | hold | 1 |

Reverse 必须严格镜像同一采样表。

### Unit 9 — Crane 单源 canonical rebuild

**涉及：** 19

**工作：**

- 将 `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/assets/crane-figure1-transition.webm` 登记为只读 authority，冻结 SHA/fingerprint。
- 新生成 `assets/crane-figure-motion.webm` 时，以完整 RGBA frame 为单位统一重采样到项目要求的 30fps/75 frames/GOP；禁止独立处理 RGB 和 alpha 再 `alphamerge`。
- 将生成命令、输入 SHA、输出 SHA/bytes、codec/fps/GOP/alpha contract 写入 inventory 与 slimming report。
- 若必须使用高帧率 RGB 源，需先建立逐帧 landmark/correlation mapping 并通过 composite parity；没有 mapping 不得合成。

**验收：**

- 全轨迹 premultiplied RGBA 或 paper-composited error 在批准阈值内，不只比 endpoints。
- 0/20/40/60/80/100% contact sheet 由用户确认人物/翅膀与 matte 对齐。
- build 可从冻结输入 deterministic 重建 canonical output。

### Unit 10 — 全量资格验证与 HITL

**自动化顺序：**

1. lint、typecheck、unit/integration tests；
2. canonical spine、URL/history/HUD/static shell/copy checks；
3. media metadata + decoded RGBA/alpha progression/composite parity；
4. release build、asset inventory、byte/performance budgets；
5. browser lifecycle tests：首次/重复/反向/abort/recovery；
6. 仅在上述 deterministic gates 通过后，进行关键 Playwright visual capture；
7. 最后由真实 macOS 触控板 HITL 验证 A/8/10/12/13/17 的手感，以及 11/14/16 的视觉。

**HITL 路径至少覆盖：**

- Hero→Pattern→Star Map→AOD→Method，随后逐段 reverse；
- Method→Figure2→compound Proof 三屏→Brand，随后 Brand reverse→Proof→Brand；
- Brand→Figure3→Services→TTG→Lab→PH→Education→Crane→Contact，随后完整 reverse；
- 每个 reading scene：自然滚到 top/bottom、从 transition 落到边界、方向反转、连续惯性、一次轻拨与一次快速滚动。

## 测试缺口与需要替换的错误契约

- `app/src/production/reading-edge-latch.test.ts` 当前主动断言“第一次只 armed，第二次 16px 才触发”；应替换为自然到边吸收尾流 + 下一次单手势触发。
- `app/src/production/input-controller.test.ts` 同样固化两手势，并缺少 reverse-entry steady。
- `app/e2e/r5-helpers.ts` 会预先 reset/armed 并最多重试 12 次，正好掩盖“要滚很多次”；helper 必须只发用户等价输入并把重试视为失败。
- Figure3/AOD/Crane transition tests 只看 DOM state 或 fake `currentTime`，没有验证 target reveal 前的真实 presented frame。
- `verify-homepage-media-deep.mjs` 缺少 per-frame alpha curve、RGB/matte edge alignment、premultiplied/composite parity。
- Figure3→Services 缺少 `.79/.80/.90/.99/1` 的独立 source/copy/paper snapshots。
- shared Ink 缺少 computed-background/marker lifecycle 测试，因而没有发现 Star Map 被 AOD outer background 覆盖。
- TTG→Lab、PH→Education 缺少 `p=.99 / p=1 / post-settle` endpoint parity 测试；现有测试没有比较 copy rect、line boxes、computed style、reading `scrollTop` 与 transition attr 清理前后状态。
- 缺少 transition ownership test：应断言 Disappear 使用 source scene exit renderer + target canonical hold root，Ink 只新增共享 canvas/mask，任何 segment 都不能创建 transition-owned scene/copy root。

## 验收总表

| 目标 | Release-blocking acceptance |
|---|---|
| 长文边界 | 不被同一惯性直接跳章；到边后的下一次清晰手势一次离开；已落边则第一次向外手势离开。 |
| Proof | 一个 scroll owner、三个 viewport panels、两个外部 boundary、零内部 segment。 |
| 转场节拍 | 每对相邻 semantic holds = 一个 run = 一次 settle；animation scenes 全部保留，run 内无用户 pause。 |
| 转场 ownership | Disappear 由 source scene exit + target scene final surface 构成；Ink 只额外拥有共享 mask/canvas；segment 仅编排，不存在第三个 scene 或第三套 presentation。 |
| 文案 endpoint parity | TTG→Lab、PH→Education 的 `p=1` 与 post-settle 第一帧布局、换行、样式、背景和 `scrollTop` 完全一致；settle 不产生可见变化。 |
| Hero | 静帧 alpha 正确；back/middle/figure 数值与 main 对齐；视频正反向 presented。 |
| Pattern | 展开无 copy；收缩出现用户指定透明排版；Star Map copy 独立。 |
| Star Map/AOD | 中段两场都存在；outer AOD 透明、inner reveal clip；无属性泄漏。 |
| AOD | 首帧存在；alpha/层级不遮 cloud/sun；Method reverse 真实倒放且失败不跳场。 |
| Figure2 | foreground arch 明显更暗；Proof paper 暖色一致。 |
| Figure3/Services | Figure3 首帧存在；80% copy 入场与 paper 渐增独立；终点前不硬遮。 |
| TTG/PH | 均保留独立 scene/hold；各自到后续文案 scene 的 media 与 disappear/dissolve 连续完成，不需要中间再次滚动，文案不在 settle 时跳动。 |
| Crane | flock 首帧存在；figure RGB/alpha 来自同一 RGBA 时序并通过全轨迹 composite parity。 |

## 风险与回滚边界

- StorySpine、Director、SegmentPlayer 都是高连接度 hub。D1–D3 是已确认约束；按 Unit 独立提交，禁止把 Proof canonical migration、transition ownership 迁移、媒体重建和视觉调色混成一个 commit。
- animation scene IDs 不迁移。ID migration 仅限三个旧 Proof IDs，并会影响 URL/hash、history、HUD、seek、static shell 和 analytics；alias contract 必须先于移除旧 Proof holds 落地。
- 将视觉逻辑归还 scene owner 时必须保留 SegmentPlayer 的 direction/readiness/abort/recovery 职责；禁止反向走另一套 DOM，或把跨 scene runtime policy塞入 scene component。
- gesture 修复不能删除 queued-momentum anti-skip，否则会从“滚两次”退化成“一次惯性连跳两章”。
- poster/新 canonical 资产会影响 transfer budget；不得通过提高预算上限掩盖回归。
- 任何 media prepare failure 必须局部回滚到已提交 endpoint；禁止 Director 通过跳到另一 scene 把失败伪装成完成。
- Unit 9 的旧 Batch A canonical 保留到新资产通过 decoded parity/HITL 后，便于逐文件回滚。

## 计划完成定义

本计划只有在以下条件同时满足时才能标记 complete：

- 实现严格符合已确认的 D1–D3：保留全部顶层 animation holds，仅合并 Proof 三个内部 panels，并且 transition 不拥有第三个 scene/presentation；
- Disappear、Ink 的 ownership tests 证明 scene-specific presentation 归 scene owner，segment 只编排 canonical roots 与共享 effect；
- 所有相邻 scene settle 均通过 endpoint parity，尤其 TTG→Lab、PH→Education 不再出现 transition copy 与 hold copy 对不齐；
- A/B/C 与 1–19 均有对应实现 commit 和可复现验收证据；
- unit、release、media decoded、browser lifecycle gates 全绿；
- 真实触控板 HITL 确认长文边界与 compound Proof 手感；
- 用户确认 AOD、Figure2、Figure3/Services、Crane 关键视觉；
- 新 immutable R5 candidate、rollback manifest 和报告均指向同一 source commit；
- 在此之前，不把当前 `7ba6418` 或任何仅自动化 green 的后继提交标为 visual parity complete。
