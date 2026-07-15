---
title: "fix: Restore R5 choreography stops, AOD alpha, Proof scrolling, and Crane flock frame-zero matte"
type: fix
status: implemented-awaiting-final-qualification
date: 2026-07-15
reviewed_branch: codex/react-refactor-r5-parity-cutover
reviewed_head: 7ba6418b5a8eb86010b8dd8eabd6d49e78ea950f
reviewed_worktree_dirty: true
implementation_gate: resolved
follows: 2026-07-15-005-fix-r5-scroll-transition-media-parity-plan.md
---

# fix: Restore R5 choreography stops, AOD alpha, Proof scrolling, and Crane flock frame-zero matte

## 结论

用户报告的 8 项问题都有修复必要，但根因不能全部按表象归类：

- **1、2、4、7 明确成立。** 当前实现或测试直接把错误节拍固化为合同。
- **6 成立，属于 scroll ownership 与浏览器行为缺口。** DOM 高度名义上是 300svh，但实际由 Stage layer 滚动，同时叠加 scroll snap、全局 wheel `preventDefault()` 与逐事件 `scrollTop` 写入；现有浏览器测试只直接赋值 `scrollTop`，不能证明真实手势可滚。
- **8 成立，修复源是首帧静帧，但最终 canonical frame 0 也必须替换。** 历史 `crane-figure2-first-frame.png` 需要从画布外部 flood fill；只绑定 HTML poster 不足以修复运行态，因为视频 frame 0 解码后会覆盖 poster。74 帧数量与 frames 1–73 的作者运动保持不变。
- **5 的现象成立，但不是 `reverseMode` 缺失。** `aod-method-top` 已声明并实现 timeline reverse；缺口是生产路径没有证明连续的 presented reverse frames，而且 AOD hold 没有 `freshInput`，同一手势的 queued intent 可以在落到 AOD 后继续向 Star Map 推进。
- **3 有结构差异，但不能说 shared erosion 完全没接。** Star Map→AOD 使用同一 horizontal contour renderer；它同时独占 `edge-bright` grade、inner reveal surface 与 `includeToSurface:false`，现有测试只查 contour attribute，没有约束实际侵蚀强度和观感一致性。

本文已按用户确认的节拍进入实施。D4 已重新冻结：先生成 corrected lossless WebP，再用它替换 74 帧 canonical WebM 的 frame 0；frames 1–73 继续来自冻结 authority，不新增帧，runtime 仍持有作者末帧。HTML poster 只负责视频解码前 presentation，禁止独立覆盖层、临时 root 或第二套 layout。

## 与 005 计划的关系

继续保留 005 的以下架构约束：

- AOD、Figure2、Figure3、TTG、PH、Crane 仍是 canonical semantic holds，不降级为 transient phase。
- `figure2-proof` 仍是唯一 canonical Proof hold，opening/cards/closing 只是内部 panel 和 hash alias。
- transition 不创建第三套 scene/copy presentation；source exit 与 target hold 仍由各自 scene owner 渲染。

本计划覆盖 005 中已经被真实手感否定的节拍决策：

- “所有 staged legs 都 `continuous:true`”不再成立。
- Pattern 需要手势确认的内部 checkpoint。
- Figure2、TTG、PH 需要媒体结束后的 **1000ms 自动 dwell**。
- semantic hold 必须阻断上一手势的 queued intent，不能只在拓扑中存在、视觉上却被连续跨过。

## 审查范围与限制

### 基线

- Worktree：`/Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-parity-cutover`
- Branch：`codex/react-refactor-r5-parity-cutover`
- HEAD / origin：`7ba6418b5a8eb86010b8dd8eabd6d49e78ea950f`
- 当前工作树：未 stage、未 commit，包含 005 实施与媒体压缩的全部本地修改。
- 当前总 JS raw：`581,600 / 581,632 bytes`，只剩 32 bytes；不得提高预算。

### 本轮证据

- `graphify-out/GRAPH_REPORT.md`：本轮 blast radius 位于 `SegmentPlayer`、Director、StorySpine、transition、reading scroll 与 media communities。
- production source、unit/E2E contracts、005 计划、媒体瘦身报告。
- FFmpeg/libvpx 对 AOD 与 Crane flock 视频的 alpha 解码。
- 历史 Crane flock 首帧静帧的 RGBA、alpha 与黑底 composite 检查。

### 未做事项

- 没有运行 Playwright；本轮是代码与资产审查，不把既有 Playwright green 当作这 8 项的反证。
- 没有修改生产代码、测试或资产。
- `/tmp` 中生成的 poster 诊断 PNG 仅用于本地审查；正式 evidence 与 lossless WebP 分开保存。

## Findings Matrix

| # | 判断 | 直接证据 / 根因 | 修复目标 |
|---|---|---|---|
| 1 | **成立** | `hero-pattern/index.ts` 把同一个 0→1 progress 同时交给 Ink field 与 `renderHeroPatternProgress()`；Hero 视频、middle/figure 位移和墨滴在同一 2200ms 内并行，没有 pre-Ink 区间。`manifest.test.ts` 还断言它是“一次 live reveal”。 | 一个 run 内拆成明确的 `hero-motion` 与 `ink-reveal` 两相；第一相 Ink progress 必须为 0，第二相 Hero 媒体和山体必须停在已完成端点。 |
| 2 | **成立，且被测试主动固化** | `stagedPolicy()` 无条件写 `continuous:true`；`finishStagedLeg()` 因此立即播放下一 leg。Pattern 只有一个 0.5 stop，collapse 与 copy 共用同一 mapped progress，随后立即进入 Star Map Ink。Unit 明确断言“continuous with no internal pause”。 | Pattern 保留 expanded、compact、compact+copy 三个可停留状态，再由下一次手势进入 Star Map；reverse 严格镜像并逐站停留。 |
| 3 | **存在配置/ownership 差异；需最终视觉确认** | Star Map→AOD 虽使用 shared horizontal contour，但单独使用 `edge-bright`（`particleGain:1.25`）、`includeToSurface:false`，只 clip AOD inner reveal surface。其他主要水平 Ink 默认 `edge-only` 并直接管理 target layer。现有测试没有侵蚀粗糙度或 screenshot parity。 | 统一为同一个 horizontal-eroded profile、同一 contour frame 和同一亮度等级；AOD 只保留必要的 inner surface background ownership，不保留独有的平滑/高亮边。 |
| 4 | **成立，可精确量化** | AOD 首个全不透明帧是 16/77，即 progress `0.207792...`；`alphaComposite` 也在该点结束，明显早于 1/3。frame 15 alpha avg 36.1518，frame 16 直接为 255。 | timeline 前至少 1/3 映射到 authored partial-alpha frames；首个 fully opaque presented frame 不得早于 `p=1/3`，建议初始调校点为 `p=0.36`。 |
| 5 | **现象成立，根因不是没写 reverse** | `aod-method-top` 已有 `reverseMode:'timeline'`、terminal frame prepare 与 `reverse()`；但测试主要验证 fake `currentTime` 写入或只捕获一个 alpha 时刻。`freshInputSceneIds` 只有 Figure2，AOD 不阻断 queued intent，settle 后可被同一手势继续推走。 | 证明 Method→AOD 期间真实视频 playhead 连续下降、AOD 可见；AOD 落地后必须等待新手势，禁止自动进入 Star Map。 |
| 6 | **成立，结构与测试均不足** | compound article 是 `min-height:300svh/overflow:visible`，真正 scroll owner 是外层 Stage layer；该 layer 同时使用 `scroll-snap-type:y proximity`。input controller 阻止默认 wheel 后逐事件写 `scrollTop`，WebKit/触控板可被每次 snap 拉回。E2E 仅用 `element.scrollTop = ...` 证明理论高度。 | `figure2-proof` 自己拥有唯一显式 scrollport；Stage layer 不再是第二 scroll owner；三屏连续滚动且不使用 panel snap。 |
| 7 | **成立** | Figure2、TTG、PH 都通过 `stagedPolicy()` 得到 `continuous:true`；媒体 leg 完成后 `SegmentPlayer` 立即启动 Ink/dissolve leg，没有 1000ms dwell。TTG/PH manifest tests 明确要求 continuous。 | 三者在媒体 terminal presented frame 上自动停留 1000ms，再进入下一 leg；forward/reverse 对称，dwell 可取消且不泄漏 timer。 |
| 8 | **成立，错误源在首帧静帧，运行时修复必须进入 WebM frame 0** | 历史 `crane-figure2-first-frame.png` 的黑底 composite 能看到鹤体中空；示例像素 `(300,115)` RGB 为 `(254,239,217)`，alpha 仅 157。仅设置 video poster 时，解码后的缺陷 frame 0 会覆盖它；把 overlay 放在 Figure stacking context 下方同样无效。 | 从静帧画布外边界 flood fill，生成 corrected lossless WebP；用该图替换 canonical frame 0，保留 frames 1–73、74 总帧数和末帧 hold；移除 runtime overlay，仅保留 pre-decode poster。 |

## 冻结的体验合同

### 1. Hero → Pattern：同一 run，两段自动连续，但不可混播

建议初始节拍：

```text
Hero hold
  -- gesture -->
Hero motion phase（建议 900ms）
  - 播放 trimmed Hero 视频的前 0.9s authored 区间
  - middle 山体下降到交接端点
  - Ink field progress 固定为 0
  -->
Pattern Ink phase（1800ms）
  - Hero 视频与山体冻结在 motion endpoint
  - 完整 radial Ink 0→1
  - Pattern 从完全隐藏到 expanded/no-copy hold
  --> Pattern hold
```

reverse 顺序完全相反：先完整收回 Ink，Hero endpoint 不动；Ink 结束后才倒放 Hero 小段并恢复山体。900ms 是待 HITL 确认的初始值，阶段边界本身不是可选项。

实现上继续使用一个 `snap` segment，不增加 canonical scene 或中间 settle。为 shared Ink 提供彼此独立的映射：

```text
heroMotionProgress = range01(p, 0, HERO_MOTION_STOP)
heroInkProgress    = range01(p, HERO_MOTION_STOP, 1)
```

### 2. Pattern → Star Map：三个 Pattern checkpoint，逐手势推进

目标状态机：

```text
P0 expanded / no copy
  -- gesture + collapse animation --> P1 compact / no copy [pause]
  -- gesture + copy reveal -------> P2 compact / copy visible [pause]
  -- gesture + radial Ink --------> Star Map hold
```

reverse：

```text
Star Map
  -- gesture + reverse Ink -------> P2 compact / copy visible [pause]
  -- gesture + hide copy ---------> P1 compact / no copy [pause]
  -- gesture + expand ------------> P0 expanded / no copy
```

不得把 P1/P2 变成新的 SceneId；它们是 `pattern-star-map` timeline 内可恢复、可反向的 staged checkpoints。初始动画时长建议为 collapse 1800ms、copy reveal 700ms、Ink 1800ms；每个 checkpoint 的停留时长由用户下一次明确手势决定。

### 3. Star Map → AOD：共享侵蚀水平边

- 使用与 Brand→Figure3、Services→TTG 等水平 Ink 相同的 `edge-only` / horizontal-eroded profile。
- reveal clip、conceal clip 与 canvas shader 必须消费同一个 `HorizontalInkContour` 实例和 revision。
- AOD root/sticky/field 在 run 内保持透明；只有被同一 contour clip 的 reveal surface 持有纸色。
- 不允许用矩形 wipe、linear-gradient 边或独立 AOD shader 代替 shared contour。
- 在 25%/50%/75% 三个进度做并排视觉证据；50% 边缘必须同时看到 macro 起伏、micro 侵蚀和非均匀粒子带。

### 4. AOD alpha：时间重映射，不伪造第二套场景

保留 authored asset 的 source milestone `16/77`，新增 timeline milestone：

```text
AOD_SOURCE_ALPHA_END   = 16 / 77
AOD_TIMELINE_ALPHA_END >= 1 / 3
proposed value         = 0.36
```

媒体 progress 使用分段单调映射：

```text
p <= alphaEnd:
  media = (p / alphaEnd) * sourceAlphaEnd

p > alphaEnd:
  media = sourceAlphaEnd
        + ((p - alphaEnd) / (1 - alphaEnd)) * (1 - sourceAlphaEnd)
```

同一个映射同时用于 forward、reverse、prepare frame 和 diagnostic dataset。cloud/sun/backdrop 的透明 ownership 以 timeline milestone 为准；不能再直接拿 source frame ratio 当页面节拍。

### 5. Method → AOD reverse：真实倒放 + 新手势边界

- reverse build 必须先 presented AOD terminal frame，再允许 AOD layer 从 opacity 0 上升。
- 在 2600ms reverse 内采到至少 8 个严格下降的 presented media times；只写 `currentTime` 不算通过。
- AOD hold 加入 `freshInput`，并清除上一物理手势的 queued intent；落到 AOD 后必须保持，直到新的反向手势开始 Star Map Ink。
- prepare/presentation 失败仍留在 Method 或最后已提交端点；不得通过跳 AOD/Star Map 假装完成。

### 6. Figure2 Proof：一个 scene-owned scrollport，三个连续 panels

将 `.r4-proof-compound` 本身设为显式 `[data-reading-scrollport="true"]`：

- viewport 高度 100svh，内部 scrollHeight 约 300svh；
- `overflow-y:auto`、`overscroll-behavior-y:contain`、WebKit momentum 支持；
- Stage layer 对 Figure2 Proof 使用 `overflow:hidden`，避免双 scroll owner；
- 移除 Proof 的 `scroll-snap-type` 和 panel snap，保证小步触控板输入能连续累积；
- opening/cards/closing 的 hash alias 只设置同一 scrollport 的位置；
- reading latch 只管理 scrollport 的 top/bottom 两个外部边界，不参与 panel 内切换。

### 7. Figure2 / TTG / PH：媒体 terminal dwell 1000ms

`continuous?: boolean` 无法表达“立即、按手势、定时”三种边界行为，替换为逐 stop 的显式策略：

```ts
type StagedBoundaryAdvance =
  | { kind: 'immediate' }
  | { kind: 'gesture' }
  | { kind: 'delay'; ms: number };
```

`SegmentPolicy.stagedSnap` 为每个 stop 提供一个 advance contract，并验证长度与 stop 数一致：

| Segment | stop 行为 |
|---|---|
| `pattern-star-map` | 两个 stop 均为 `gesture` |
| `figure2-distance-expand` | media→depth Ink 为 `{kind:'delay', ms:1000}` |
| `ttg-lab` | TTG media→dissolve 为 `{kind:'delay', ms:1000}` |
| `ph-education` | PH media→dissolve 为 `{kind:'delay', ms:1000}` |

delay dwell 期间 Director 仍处于同一 `playing` run，不创建新的 hold/settle；SegmentPlayer 持有可取消 timer，abort/dispose/recovery 必须清理。reverse 到同一 boundary 时也执行相同 1000ms dwell。

### 8. Crane flock：静帧修正进入 canonical frame 0，禁止 runtime overlay

冻结媒体链：

```text
archived flawed first-frame PNG（只读 provenance）
  -> 从画布四边对 neutral/background-like pixels 做 4-connected exterior flood fill
  -> 外部透明、内部补实、边界 alpha 保留
  -> assets/crane-flock-first-frame.webp（lossless corrected frame 0）

74-frame authority
  -> frame 0 替换为 corrected WebP
  -> frames 1–73 保持 authority motion
  -> CRF 18 / GOP ≤ 8 / alpha_mode=1 deterministic rebuild
  -> assets/crane-flock-motion.webm（4,416,794 bytes / 74 帧）
  -> runtime 在 2.433s 持有作者末帧

HTML video poster
  -> 复用同一 corrected WebP，仅覆盖 decode 前窗口
  -> video frame ready 后由已经修正的 canonical frame 0 接管
  -> 不存在独立 overlay、临时 root、Figure transform 或第二套 stacking ownership
```

frame-zero correction 要求：

- 可见像素保留原 RGB，不改变鹤群位置或颜色；
- flood-fill 算法只处理单张 1280×720 RGBA 静帧；canonical rebuild 再明确消费这张输出，不把背景判断扩散到其他视频帧；
- 从画布四边 flood fill `alpha≤7 && min(RGB)≥225 && chroma≤8` 的背景连通区域，避免低 alpha 米白鹤体被误判为外部；外部归零，非外部内部补到 255；
- 用户静帧 HITL 标出的两个腿部封闭缝隙保持透明；用冻结 seed 只恢复对应低 alpha 连通域，不扩大到其他鹤体或视频帧；
- 保留细腿、喙、羽毛缝隙和外轮廓抗锯齿，不做全局 alpha clamp；
- canonical WebM 保持 74 帧，不 prepend、不复制 terminal frame；frames 1–73 与 authority 做解码质量和 alpha extrema parity；
- 生成 canonical frame 0 的透明底、暖纸底、黑底与前三帧 contact evidence；
- flawed PNG 与 74-frame authority 留在 `archive/.../sources`；被替换的 4,437,203-byte canonical 留在 `archive/.../replaced`，可独立回滚。

deep verifier 增加：

- flawed poster source 与 corrected WebP identity；
- 1280×720 lossless alpha decode；
- exterior-cleared / interior-filled pixel count、`(300,115)` 与 `(926,343)` body witnesses，以及两处腿间透明 gap witnesses；
- 所有输出可见像素 RGB 与 source 完全一致；
- canonical frame 0 对 corrected WebP 的 color/alpha SSIM 与四个 alpha witnesses；
- frames 1–73 对 authority 的 color/alpha SSIM 与 73/73 alpha extrema parity；
- 新 WebM identity、74 帧、PTS/GOP、无追加帧和 deterministic rebuild 合同。

## Runtime 目标架构

### Staged boundary ownership

```text
SegmentPlayer
  ├─ leg clock / media readiness
  ├─ immediate boundary -> next leg
  ├─ gesture boundary   -> STAGE_PAUSED -> Director staged-paused
  └─ delay boundary     -> cancelable dwell timer -> next leg

Director
  ├─ playing input      -> queued intent
  ├─ staged-paused      -> explicit gesture resumes
  └─ semantic hold      -> freshInput blocks prior gesture flush
```

delay boundary 不向 Director 冒充 `STAGE_PAUSED`，否则 1000ms 会变成等待用户输入。gesture boundary 不使用 timer，避免 Pattern 自行跨站。

### Semantic hold 输入隔离

把所有用户需要看见的 animation holds 纳入明确的 fresh-input contract，至少包括：

- `aod-animation`
- `figure2-animation`
- `figure3-animation`
- `ttg-animation`
- `ph-animation`
- `crane-animation`

这项变更只阻止上一手势在 settle 后自动穿透，不改变用户从 hold 发起下一 segment 的响应阈值。

## Work Breakdown

### Phase 0 — 预算与基线门禁（3–5h）

| Task | Files | Done criteria |
|---|---|---|
| 0.1 建立八项失败测试/静态 witness | 相关 unit、E2E、media verifier | 每项至少有一个在当前代码上失败或能证明错误合同的测试；不先改断言为绿。 |
| 0.2 回收 JS raw headroom | `module-loaders.ts`、旧 Proof compatibility runtime、bundle report | 在不提高预算、不删 URL alias 的前提下，先获得至少 8KiB total JS raw headroom。 |
| 0.3 冻结媒体与视觉基线 | media report、contact metadata | 记录 AOD source milestone、flawed poster/corrected WebP SHA、旧/新视频 canonical SHA 与当前黑底 witness。 |

Phase 0 是硬前置；当前只剩 32 bytes，未回收 headroom 前不得开始生产功能实现。

### Phase 1 — staged boundary policy（6–8h）

| Task | Depends on | Files | Done criteria |
|---|---|---|---|
| 1.1 用 per-stop advance contract 替换 `continuous` | 0.2 | `story/types.ts`, `manifest.ts`, inventory schema | manifest validation 拒绝 stop/advance 长度不一致、负 delay 和未知 kind。 |
| 1.2 实现 cancelable dwell | 1.1 | `segment-player.ts` | 1000ms 前不启动下一 leg；到时自动启动；abort/dispose/replay 无 timer 泄漏。 |
| 1.3 保留 gesture pause | 1.1 | SegmentPlayer/Director tests | Pattern checkpoint 只由新的合格手势恢复；同一惯性尾流不恢复。 |
| 1.4 扩充 animation freshInput | 1.1 | `canonical-spine.ts`, Director tests | settle 到动画 hold 后 queued intent 被清除，下一 segment 需新手势。 |

### Phase 2 — Hero 与 Pattern 节拍（8–12h）

| Task | Depends on | Files | Done criteria |
|---|---|---|---|
| 2.1 Hero progress 分轨 | 0.2 | Hero scene、Hero→Pattern transition、timings | motion phase 内 Ink=0；Ink phase 内 media time/mountain transform 不再变化；reverse 镜像。 |
| 2.2 Pattern 三 checkpoint | 1.3 | Pattern scene、Pattern→Star Map transition、timings/manifest | P0/P1/P2 均能稳定停留；copy 不与 collapse 同时出现；三次明确手势到 Star Map。 |
| 2.3 替换错误测试合同 | 2.1–2.2 | group1/manifest/segment-player tests | 删除“one reveal”“continuous no pause”断言，加入 phase boundary 与 reverse checkpoint 断言。 |

### Phase 3 — Star Map/AOD Ink、alpha 与 reverse（10–14h）

| Task | Depends on | Files | Done criteria |
|---|---|---|---|
| 3.1 统一 horizontal erosion profile | 0.2 | `star-map-aod`, shared Ink tests | AOD 入口与 shared baseline 使用同一 grade/profile/contour revision。 |
| 3.2 AOD media time remap | 0.2 | AOD scene/progress/media tests | first-full presented frame ≥1/3；forward/reverse 单调且端点不变。 |
| 3.3 AOD reverse presented-frame gate | 1.4, 3.2 | AOD transition、timeline driver、production E2E | Method→AOD 至少 8 个下降 presented samples，落地后不自动进 Star Map。 |
| 3.4 AOD composition parity | 3.1–3.3 | CSS、pilot/release tests | 前 1/3 Method 可从 authored alpha 后看见；paper/cloud/sun ownership 无提前遮挡。 |

### Phase 4 — Proof scroll ownership（5–7h）

| Task | Depends on | Files | Done criteria |
|---|---|---|---|
| 4.1 scene-owned explicit scrollport | 0.2 | Figure2 Proof component、Stage/CSS | 正好一个 scroll owner；clientHeight≈1 viewport，scrollHeight≈3 viewports。 |
| 4.2 移除 panel snap 冲突 | 4.1 | CSS、reading tests | 小 wheel delta 连续累积，不能被吸回 opening。 |
| 4.3 真实输入覆盖 | 4.1–4.2 | production/group3 browser tests | wheel、移动端 touch、WebKit 都能 opening→cards→closing；内部不产生 transition run。 |

### Phase 5 — Figure2/TTG/PH terminal dwell（4–6h）

| Task | Depends on | Files | Done criteria |
|---|---|---|---|
| 5.1 配置三段 1000ms delay boundary | 1.2 | timings/manifest | 三段 forward/reverse 均有 1000±80ms terminal dwell。 |
| 5.2 terminal frame ownership | 5.1 | Figure2/staged handoff media lifecycle | dwell 全程视频 paused、frame ready、source transform 不变。 |
| 5.3 endpoint parity | 5.1–5.2 | transition/E2E tests | dwell 后进入下一 leg，无闪帧；settle 仍视觉零变化。 |

### Phase 6 — Crane flock canonical frame 0（2–4h + HITL）

| Task | Depends on | Files | Done criteria |
|---|---|---|---|
| 6.1 实现可复现 exterior flood fill | 0.3 | poster rebuild script、package scripts | 同一 flawed PNG 生成同一 lossless WebP；背景判断只处理静帧。 |
| 6.2 重建 74-frame canonical | 6.1 | flock media rebuild script、media contract | corrected WebP 替换 frame 0；frames 1–73 来自 authority；不追加帧；重复重建 bytes/SHA 一致。 |
| 6.3 收敛 presentation ownership | 6.2 | Crane scene、CSS、scene tests | 同一 WebP 仅作 pre-decode poster；删除独立 overlay；ready frame 与 poster 不再存在堆叠/裁切竞争。 |
| 6.4 contact HITL | 6.2–6.3 | evidence/report | canonical frame 0 在透明、暖纸、黑底下白色鹤体完整，边缘/羽毛/腿未被吞；前三帧无新增 matte flash。 |
| 6.5 升级 deep verifier | 6.1–6.4 | media deep script/report | poster identity、flood-fill witnesses、frame 0 parity、frames 1–73 authority parity 与 74-frame 视频合同全绿。 |

### Phase 7 — 统一验证与候选门禁（6–10h + HITL）

- 开发期间运行 targeted unit/media checks；不分段反复跑 Playwright。
- 全部代码与资产完成后统一运行：lint、typecheck、89+ unit files、production build、media inventory/deep、legacy ownership、`git diff --check`。
- 最后只运行一次默认与 release Playwright matrix，覆盖 desktop/mobile Chromium 与 WebKit。
- 真实 macOS 触控板 HITL 覆盖 Hero、Pattern checkpoints、Proof 连续滚动、Method→AOD reverse。
- 视觉 HITL 覆盖 Star Map/AOD 边缘、AOD 前 1/3 alpha、Figure2/TTG/PH 1s dwell、Crane flock 黑底/暖纸 composite。
- 所有门禁通过后再生成 immutable candidate、memory qualification 与 rollback manifest。

## 依赖关系

```text
Phase 0 budget/witness
  ├─> Phase 1 staged policy ──> Phase 2 Pattern ──> Phase 5 dwell
  │                         └─> Phase 3 AOD fresh-input/reverse
  ├─> Phase 2 Hero
  ├─> Phase 4 Proof
  └─> Phase 6 flock frame 0 ──> canonical-frame HITL

Phases 2–6 complete ──> Phase 7 unified qualification
```

## 验证矩阵

| Contract | Unit/static | Browser/media | HITL |
|---|---|---|---|
| Hero 两相不混播 | progress mapping、media time freeze、reverse symmetry | p=boundary±ε snapshots | 运动段与墨滴段明显分开 |
| Pattern checkpoints | stage pause/resume、copy/collapse channels | forward/reverse 每站 current state | 一次手势只推进一站 |
| Star Map/AOD erosion | shared contour/profile/revision | 25/50/75% screenshots | 边缘与其他水平墨滴同质 |
| AOD alpha ≥1/3 | source↔timeline mapping | presented frame/currentTime + composite pixels | 前 1/3 无硬遮挡 |
| Method→AOD reverse | descending media samples、freshInput queue | 真实 VP9 reverse + AOD hold persistence | 看见完整逆向并停在 AOD |
| Proof scroll | single scrollport metrics | wheel/touch/WebKit incremental scroll | 三屏顺滑连续滚动 |
| 1000ms dwell | fake timer、abort cleanup | wall-clock 1000±80ms + terminal frame | Figure2/TTG/PH 节拍可感知 |
| Flock frame-zero matte | source/output identity、flood-fill pixel witnesses、无 overlay markup | corrected WebP + canonical frame 0 SSIM/witnesses + frames 1–73 authority parity | 白色鹤体完整、无黑洞/光边/首帧覆盖回退 |

## 需要替换的错误测试

- `app/src/story/manifest.test.ts`：删除 Hero “one live reveal”、Pattern/TTG/PH `continuous:true` 合同。
- `app/src/story/segment-player.test.ts`：删除 real Pattern “no internal pause”合同，增加 gesture/delay/immediate 三类 boundary。
- `app/src/harness/r4/group1Manifest.test.ts`：不再要求 Pattern lifecycle 无 `STAGE_PAUSED`。
- `app/src/transitions/pattern-star-map/index.test.ts`：`timeline.pauses` 应包含两个 checkpoint，并分别验证 compact/no-copy 与 compact+copy。
- `app/e2e/r4-g3.spec.ts`：不得只直接赋值 Proof `scrollTop`；必须派发真实 incremental wheel/touch。
- AOD browser tests：不能只找到一次 `alphaComposite=true`；必须验证 duration、多个 presented frame 和 reverse descending cadence。
- media deep verifier：新增静帧 flood-fill、canonical frame 0 与 frames 1–73 authority parity 合同，同时保留 74 帧/PTS/GOP 门禁。

## 风险与缓解

| 风险 | 影响 | 概率 | 缓解 |
|---|---|---|---|
| staged policy 改动波及 SegmentPlayer/Director | 高 | 中 | 先引入 per-stop contract 与完整 fake-timer tests，再迁移各 segment；不并行改状态机和视觉。 |
| Pattern pause重新引入惯性连跳 | 高 | 中 | gesture checkpoint 复用 physical gesture identity；同一手势尾流不得 resume。 |
| 1000ms dwell 被误实现为用户 pause | 中 | 中 | delay boundary 不派发 `STAGE_PAUSED`，Director 保持 playing，timer 自动恢复。 |
| AOD 时间重映射导致 forward/native 与 reverse/timeline 不一致 | 高 | 中 | 唯一纯函数同时供 prepare、drive、render 和 tests 使用。 |
| Proof 出现双滚动或 hash 定位偏移 | 高 | 中 | 显式 scrollport + Stage overflow hidden；alias 全通过 `readingScrollport()` 定位。 |
| frame 0 自动填洞吞掉羽毛间真实透明缝隙，或与 frame 1 形成 matte flash | 高 | 中 | 只从画布外部 flood fill，冻结 body/gap witnesses；对 canonical frame 0 做三背景 HITL，并检查前三帧 contact evidence。 |
| JS 超预算 | 高 | 高 | Phase 0 先回收 ≥8KiB；任何功能改动不得提高 `581,632` 上限。 |
| 一次性 release test 发现跨模块回归较晚 | 中 | 中 | 每 phase 跑 targeted unit/static；Playwright 只在最终统一跑，但关键状态都先有 deterministic tests。 |

## 回滚边界

- Runtime policy、Hero/Pattern、AOD、Proof、dwell、flock frame-zero media 分开提交，禁止一个提交混合状态机与媒体二进制。
- flock authority、flawed source、corrected WebP、新 74-frame canonical 与被替换 canonical 各自冻结 SHA；媒体回滚恢复 archived prior canonical，presentation 回滚不得重新引入 runtime overlay。
- AOD time remap 可独立回滚，不回滚首帧 readiness、scene ownership 或 recovery 修复。
- Proof 仍保持一个 canonical scene；回滚 scroll CSS 时也禁止重新拆成三个 holds。
- 不允许通过恢复 `continuous:true`、提高 JS/asset budget 或跳过 HITL 来制造 green candidate。

## 实施前待确认

用户确认本文后冻结以下初始参数：

1. Hero pre-Ink motion：建议 900ms，Hero 媒体自然播放前 0.9s；Ink 1800ms。
2. Pattern：collapse 1800ms、copy reveal 700ms、Ink 1800ms；P1/P2 均等待下一手势。
3. AOD first-full timeline point：建议 0.36，硬下限为 1/3。
4. Figure2/TTG/PH terminal dwell：1000ms，forward/reverse 对称。
5. Proof：连续滚动，不做 panel scroll snap。
6. Flock：以 corrected WebP 替换 canonical frame 0；以“鹤体浅色区域实心、羽毛/腿/外轮廓仍保留细节”为验收口径，保持 74 帧、frames 1–73 authority motion 与 2.433s terminal hold，不使用 runtime overlay。

若以上参数确认，只修改 plan frontmatter 为 `status: approved / implementation_gate: resolved`；不再在编码时临时更改节拍架构。

## 当前实施记录（2026-07-15）

- 8 项生产实现、对应 unit/static contracts、最终浏览器用例和 frame-zero 重建链均已写入工作树。
- 首帧 poster 使用 canvas-edge background flood fill；两个 body witnesses 已由 alpha 157/19 补到 255，用户红框指定的右上与下方两处腿间 gap 通过冻结 seed 保持 alpha 0，可见 RGB 0 差异。
- corrected WebP 已嵌入 `crane-flock-motion.webm` frame 0；新 canonical 为 4,416,794 bytes、74 帧、SHA-256 `a3ac363cf7dd37940f3467a1c4e5b1b2df067d4fdc4966e99e17679a32498164`。frame 0 对 WebP 的 color/alpha SSIM 为 0.999755/0.999982；frames 1–73 对 authority 为 0.998872/0.994012，73/73 alpha extrema 一致。
- 旧 4,437,203-byte canonical 已归档；Crane scene 已删除独立 poster overlay，只在 front flock video 上保留 pre-decode `poster`，因此不存在 Figure stacking context、42% clip 或 z-index 8 覆盖问题。
- 已通过 lint、TypeScript、91 个 Vitest 文件 / 588 tests、production build、media inventory/deep、legacy ownership/runtime 与 `git diff --check`；total JS raw 为 577,089 / 581,632 bytes，仍有 4,543 bytes headroom。
- 默认 Chromium harness 在独立端口完成全量执行；43 个首轮通过，3 个与新 choreography 合同不一致的用例修正后逐项通过，当前 46 个 runnable cases 均已有本工作树证据。
- release matrix 全量执行为 58 passed / 66 expected skipped / 4 failed；4 个失败均是旧“一次输入连续穿过 Pattern”测试路径，改为两个 fresh-gesture checkpoint 后，desktop Chromium/WebKit matrix 与 desktop/mobile Chromium performance 四个 runnable cases 全部复测通过。按用户要求没有为此重复整套 15 分钟矩阵。
- 仍 pending：真实 macOS 触控板、Star Map/AOD 与节拍类最终视觉 HITL、canonical flock frame 0 的浏览器/HITL 确认，以及 immutable candidate、process RSS memory qualification 与 rollback manifest；在这些证据补齐前不得把本计划标记 complete。

## 计划完成定义

本计划只有在以下条件全部满足时才能标记 complete：

- 8 个 finding 均有对应实现提交和可复现证据；
- Hero motion 与 Ink 有可见、可测的非重叠区间；
- Pattern forward/reverse 均逐站停留在 P1/P2，同一手势不连跳；
- Star Map→AOD 与 shared horizontal-eroded profile 通过截图/HITL；
- AOD 首个 fully opaque presented frame 不早于 1/3，Method→AOD reverse 有真实下降帧并停在 AOD；
- Proof 只有一个显式 scroll owner，三屏在 Chromium/WebKit、wheel/touch 下可连续滚动；
- Figure2、TTG、PH 媒体终帧各稳定 dwell 1000±80ms；
- Crane flock corrected WebP、canonical frame 0、frames 1–73 authority parity、无 runtime overlay、deep verifier 与黑底/暖纸 HITL 全部通过；
- total JS raw 不超过 581,632 bytes，且没有提高任何 budget；
- lint、typecheck、unit、build、media、legacy、default/release Playwright、`git diff --check` 全绿；
- macOS 触控板与关键视觉 HITL 通过；
- immutable candidate、memory qualification、rollback manifest 指向同一 clean source commit。
