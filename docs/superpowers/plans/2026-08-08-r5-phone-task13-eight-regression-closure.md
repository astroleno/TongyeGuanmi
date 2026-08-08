# R5 Phone Task 13 Eight-Regression Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不引入第二套状态机、场景协调器或“继续播放”按钮的前提下，关闭 Hero、Pattern、Star Map、AOD 与 Method 的八项真机回归，使一个固定候选可以完成可信 iPhone 连续人工验收。

**Architecture:** 保留现有唯一 reducer/runtime/projector/input authority。Reducer 继续只拥有结构进度、leg、媒体 owner 和稳定提交；scene leaf 只拥有自己的绘制实现。结构动画由 reducer progress 驱动，ambient 动画由 leaf 内单一 `performance.now()` 时钟驱动，但其启停只能响应 runtime 的 `render/settle/pause/dispose` 命令。媒体激活区分“已挂载 source 的同步物理手势信用”和“尚未挂载 receiver 的 muted inline autoplay”，不再伪造可跨异步挂载保存的 Safari 手势信用。透明媒体的所有祖先层必须在 alpha 阶段保持透明，由既有 coverage/retained plane 提供底色。原生阅读继续由 document 滚动，只有从边缘开始的新手势才能交回故事 runtime。

**Tech Stack:** React 19、TypeScript、Vitest、Canvas 2D、WebGL packed-alpha compositor、现有 phone reducer/runtime/projector、Playwright WebKit（仅关键视觉门禁）、iOS Simulator、真实 iPhone Safari、pnpm。

---

## 0. Baseline、范围与完成定义

执行 worktree：

```text
/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime
```

计划编写时基线：

```text
branch: codex/r5-phone-clean-runtime-convergence
HEAD:   eb757480ab6ab32a94dd7be4e1d606594715dcd4
state:  clean
```

本轮保留的提交方向：

| Commit | 处置 |
| --- | --- |
| `4337e09` stable toolbar 即时刷新 | 保留；补 scope 与组合回归 |
| `740aa64` Star Map 使用烘焙 alpha | 保留；补真实像素 oracle |
| `2614e9b` ambient 跨转场连续 | 保留目标；删除 DOM 状态观察，改由既有 leaf command 生命周期控制 |
| `c4caa12` reverse AOD incoming owner | 保留目标；修正 activation credit 语义和 progress latch |
| `310c5b1` Pattern 错峰纹理切换 | 移除 hard switch；改为单套连续结构纹理 |
| `eb75748` coverage 外扩 | 保留外扩；修正 Hero 边缘实际颜色 |

八项用户问题及本计划的唯一归属：

| # | 症状 | 根因归属 | 完成任务 |
| --- | --- | --- | --- |
| 1 | Hero 底部露出未被黑色 filter 覆盖的缝 | coverage 只扩了面积，颜色仍不等于 Hero 底部最终像素 | Task 4 |
| 2 | Pattern 收缩后不继续旋转 | ambient 生命周期没有被完整验收 | Task 2 |
| 3 | Hero→Pattern 时 Pattern 不旋转 | incoming retained leaf 的 ambient 生命周期没有被完整验收 | Task 2 |
| 4 | Pattern 收缩闪一下 | 六个 `switchPoint` 仍是六次离散纹理硬切 | Task 2 |
| 5 | Star Map Perlin 变成整片亮场 | 旧逻辑把烘焙 near-white RGB 当亮度；修复缺真实像素证明 | Task 3 |
| 6 | Star Map→AOD 时 Perlin 停止 | ambient ownership 通过 DOM 属性推断，未直接绑定 runtime command 生命周期 | Task 3 |
| 7 | AOD reverse 失效 | target 预渲染被 generation guard 丢弃；异步挂载还错误声称持有物理手势信用 | Task 1 |
| 8 | Method 卡在“03 共创” | toolbar、document scroll 与离场快照分别有测试，但缺同一真实路径的组合证明 | Task 5 |

同时关闭此前仍可复现的 AOD 中段白底：packed-alpha 阶段存在不透明 paper ancestor，且 phone leaf 没有进入桌面共用的 `data-aod-exit-active` 透明合成契约。该问题并入 Task 1，不另建状态或补丁层。

本轮明确不做：

- 不新增 runtime、reducer、projector、input controller 或场景级 coordinator。
- 不恢复旧 phone runtime，不引入全局 media unlock，不新增连续体验 CTA。
- 不修改 frozen 视觉资产，不重新调 Star Map/Pattern 的设计参数来掩盖逻辑错误。
- 不先跑 227-case release suite；focused 失败时只修对应 root。
- 不靠 `setTimeout`、额外手势、reload、容错跳转或延长 deadline 掩盖失败。
- 不在 `manifest.ts` 继续单行压缩；若 LOC 到线，先删除本轮替代掉的旧分支。

完整 GO 必须同时满足：

1. 下述 RED→GREEN deterministic tests 全部通过；
2. targeted WebKit 的连续像素/时钟/原生阅读路径通过；
3. 同一固定构建在真实 iPhone trusted touch 下连续通过两轮正向与一轮反向；
4. 然后且仅然后运行一次完整 `test:release`；
5. 构建、证据、候选 SHA 绑定完成，工作树干净。

执行前置条件：本计划先经用户批准，并作为独立 docs-only checkpoint 提交；Task 1 必须从 clean worktree 开始，不能把计划文件的未提交状态带入 release manifest。

---

## 1. Task 1 — 统一 AOD progress、activation 与 alpha 合成

### 1.1 先写 RED：reverse 必须先锁存 endpoint，再激活 receiver

**Files:**

- Modify: `app/src/scenes/aod-animation/phone/PhoneAod.test.tsx`
- Modify: `app/src/production/phone-story/machine.test.ts`
- Modify: `app/src/production/phone-story/runtime.test.ts`

- [ ] 在 `PhoneAod.test.tsx` 增加 `latches reverse endpoint before the packed surface activates`：
  1. mount leaf；
  2. `commands.rebind(...)`；
  3. 在 surface generation 仍为 `0` 时调用 `commands.render(1)`；
  4. 调用 `commands.activate(...)` 并等待 settlement；
  5. 断言 `prepareTimelineVideoFrame` 第一次收到的 `progress` 是 `1`，不是 `0`；
  6. 断言 compositor `surface.render()` 成功后 settlement 才 resolve。

- [ ] 增加 rejection test：`prepareTimelineVideoFrame` reject 时，pending activation settlement 必须 reject，并通过现有 report port 上报 `aod-frame-preparation-failed`；不得 resolve 后继续提交。

- [ ] 在 `machine.test.ts` 增加 activation credit matrix：

```text
AOD→Method forward / AOD is mounted source  => physical-epoch
Method→AOD reverse / AOD is incoming target => direct-muted-autoplay
Star→AOD / static poster, media owner none   => no activation effect
```

- [ ] 在 `runtime.test.ts` 增加两条行为证明：
  - incomplete `physical-epoch` coverage 立即发布 `activation-settled(false)`，不得写入 deferred slot；
  - incomplete `direct-muted-autoplay` 可以等 receiver mount，mount 后只调用一次，且 continuous segment rejection 走 rollback、不显示 CTA。

- [ ] 运行 RED：

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime/app
pnpm exec vitest run \
  src/scenes/aod-animation/phone/PhoneAod.test.tsx \
  src/production/phone-story/machine.test.ts \
  src/production/phone-story/runtime.test.ts
```

预期：reverse 首次 prepare 为 `0`、preparation rejection 被吞掉、receiver credit 仍被标为 `physical-epoch`，新增断言失败。

### 1.2 修复 AOD desired-progress latch 与 settlement

**Files:**

- Modify: `app/src/scenes/aod-animation/phone/PhoneAod.tsx`

- [ ] `render(progress)` 始终调用 `scheduleDecodedFrame(mappedProgress)`。`scheduleDecodedFrame` 先更新 `desiredProgressRef`/sequence，再判断 generation；generation 为 `0` 时只锁存，不解码。这保证 receiver mount 前的 `render(1)` 不会丢失。

- [ ] `scheduleDecodedFrame` 的 catch 先调用 `reportPreparationFailure`，随后必须 rethrow。两类调用共享该 promise：
  - reducer 的普通 `render` 是 fire-and-forget，只在调用端 `.catch(() => undefined)` 防止 unhandled rejection（错误已经上报）；
  - `activate` 直接等待同一个 promise，rejection 继续进入 activation batch 和既有 rollback。

- [ ] 保留 `rebind` 对新 generation 的初始化；runtime 随后下发的 target `render` 必须成为 activation 使用的最终 desired progress。`activate` 本身不得再清零或强制写 forward progress。

- [ ] 保留 coalescing：同时只允许一个 media preparation pump；完成当前 frame 后若 sequence 变化，继续准备最新 desired progress。

实现结果应满足这个顺序，而不是增加第二个时钟：

```text
runtime target render(1)
  → leaf latches desired media progress = 1
  → receiver mount lands
  → muted inline activation
  → prepare endpoint 1
  → compositor draw
  → activation settlement resolves
  → final proof/commit
```

### 1.3 修正 credit：Safari 物理信用绝不跨异步 mount

**Files:**

- Modify: `app/src/production/phone-story/machine.ts`
- Modify: `app/src/production/phone-story/runtime.ts`

- [ ] 在 `machine.ts` 增加纯 helper `phoneTransactionActivationCredit(transaction)`：
  - segment `mediaClockOwner === 'source'` → `physical-epoch`；
  - segment `mediaClockOwner === 'target'` → `direct-muted-autoplay`；
  - `none` → `null`；
  - direct-entry 继续沿用现有 policy，不扩大 autoplay 范围。

- [ ] `loadEffects` 用该 helper 生成 `activate-surfaces`，不再无条件写 `physical-epoch`。

- [ ] `runtime.ts` 只允许 `direct-muted-autoplay` 进入 `deferredActivation`。`physical-epoch` 如果当栈没有完整 source surface coverage，立即 enqueue `activation-settled(false)`；continuous segment 会由既有 machine rollback。

- [ ] receiver mount 后调用 deferred muted activation 一次并清空；attempt 被 invalidate、rollback、disconnect 或 generation 替换时继续清空。

### 1.4 恢复桌面一致的 transparent-alpha ancestor contract

**Files:**

- Modify: `app/src/scenes/aod-animation/phone/PhoneAod.tsx`
- Modify: `app/src/scenes/aod-animation/phone/PhoneAod.css`
- Modify: `app/src/scenes/aod-animation/phone/PhoneAod.test.tsx`
- Modify: `app/src/scenes/aod-animation/progress.test.ts`

- [ ] AOD media activation 开始时，在共用的 `[data-aod-transition]` 上设置 `data-aod-exit-active="true"`；`settle/pause/dispose` 清除。不要复制一份 phone-only alpha 曲线。

- [ ] `.portrait-scroll-spike__scene--aod` 自身改为 transparent；稳定纸色继续由现有 AOD inner surface 和 projector coverage `#ede4d2` 提供。这样 global desktop selector 在 alpha phase 能真正透过所有 ancestor，而不是被 phone scene root 的纸色截断。

- [ ] 保留 `AOD_TIMELINE_ALPHA_END === 0.48`、`AOD_FIRST_FULL_ALPHA_FRAME === 16` 与同一 `renderAodTransitionProgress`。不得以改 handoff 数值来掩盖 ancestor 不透明问题。

- [ ] 增加 4 个 progress 采样点 `0`, `1/3`, `0.48 - ε`, `0.48`：
  - alpha 段 root/sticky/field/reveal/phone scene 不得提供纸白实底；
  - 0.48 时 media progress 对齐 `16 / 77`；
  - 0.48 后 paper wash/solid 才接管；
  - reverse 经过相同点时属性完全对称。

### 1.5 GREEN 与提交

- [ ] 运行：

```bash
pnpm exec vitest run \
  src/scenes/aod-animation/progress.test.ts \
  src/scenes/aod-animation/phone/PhoneAod.test.tsx \
  src/production/phone-story/machine.test.ts \
  src/production/phone-story/runtime.test.ts
pnpm run typecheck
pnpm run verify:phone-architecture:cutover
```

- [ ] Commit：

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime
git add app/src/scenes/aod-animation app/src/production/phone-story/machine.ts \
  app/src/production/phone-story/machine.test.ts \
  app/src/production/phone-story/runtime.ts \
  app/src/production/phone-story/runtime.test.ts
git commit -m "fix(r5): unify aod activation and alpha handoff"
```

---

## 2. Task 2 — 用单套连续结构纹理消除 Pattern 闪烁，并固定 ambient 生命周期

### 2.1 先写 RED：禁止 endpoint texture hard switch

**Files:**

- Modify: `app/src/scenes/pattern/patternBloomRenderer.test.ts`
- Modify: `app/src/scenes/pattern/phone/PhonePattern.test.tsx`

- [ ] 删除“预建 start/end 共 12 张 ring cache 且 collapse 不重绘”的旧 oracle；它正是 hard switch 的来源，不再是性能成功标准。

- [ ] 新增连续结构测试：按 `0.45 → 0.49 → 0.50 → 0.51 → 0.55` 推进时，每个已绘制 ring 的 texture structural phase 单调递增，源码和 canvas metadata 均不得出现 `terminalRingCanvases`、`switchPoint` 或 start/end texture 选择。

- [ ] 保留“同一帧不重新分配 canvas”的测试，但期望 ring cache 数量从 12 改为 6；结构更新允许重绘已有 canvas，禁止重新创建 canvas。

- [ ] 新增 ambient 生命周期矩阵：

```text
render(0) while incoming Hero→Pattern => RAF running
settle(0) at stable Pattern           => RAF running
render(0…1) during Pattern→Star       => RAF running
pause/outside-closure                 => RAF stopped
prefers-reduced-motion                => one structural frame, RAF stopped
```

- [ ] 运行 RED：

```bash
pnpm exec vitest run \
  src/scenes/pattern/patternBloomRenderer.test.ts \
  src/scenes/pattern/phone/PhonePattern.test.tsx
```

### 2.2 将双 endpoint cache 改为六张 live structural cache

**Files:**

- Modify: `app/src/scenes/pattern/patternBloomRenderer.ts`

- [ ] 仅保留 `ringCanvases` 六张；删除 `terminalRingCanvases`、`switchPoint`、endpoint count/index 与对应 destroy/prewarm 分支。

- [ ] `refreshRingTextures(structuralPhase, metrics)` 的 key 同时包含尺寸和当前 structural phase。key 变化时复用六张 canvas，逐 ring 调用现有 `drawRingTexture(canvas, index, structuralPhase, metrics)`。

- [ ] `buildRingCache`/`drawPetalField` 始终绘制当前 ring canvas。collapse scale、field rotation 与 ambient phase 仍分别来自既有三个值，不做 crossfade，也不做 start/end hard cut。

- [ ] 继续由现有 `STRUCTURAL_FRAME_INTERVAL_MS = 1000 / 24` 限流；stable ambient progress 不变时只旋转复用 cache，不重复生成纹理。resize 只清空 structural key，并在下一绘制帧同步重建当前 phase。

- [ ] hidden prewarm 只构建 progress 0 的六张 cache；不再花 12 帧构建永远会硬切的两个端点。

数据流固定为：

```text
reducer collapse progress ─┐
                           ├─ current structural texture (24 fps, six reused canvases)
ambient performance clock ─┘
```

不使用 crossfade，是为了避免半透明花瓣；不使用 shader，是为了避免为这次修复引入第二套渲染实现。

### 2.3 Pattern leaf 只接受 runtime command 启停 ambient

**Files:**

- Modify: `app/src/scenes/pattern/phone/PhonePattern.tsx`
- Modify: `app/src/scenes/pattern/phone/PhonePattern.test.tsx`

- [ ] `render` 与 stable `settle(0)` 保持 ambient active；`pause/dispose` 停止。

- [ ] `prefers-reduced-motion: reduce` 时仍绘制 reducer-owned structural endpoint，但 `animateMotion=false`。不要通过停止 structural render 来实现 reduced motion。

- [ ] 不新增 MutationObserver、Shell data 查询或 scene-local transition ownership。

### 2.4 GREEN、性能边界与提交

- [ ] 运行：

```bash
pnpm exec vitest run \
  src/scenes/pattern/patternBloomRenderer.test.ts \
  src/scenes/pattern/phone/PhonePattern.test.tsx
pnpm run typecheck
```

- [ ] 在后续 targeted WebKit 中记录 2 秒 Pattern transition 的 RAF 间隔与 `data-ink-texture-revision`：至少 20 个、至多 25 个 structural draws/秒；不得出现单次超过 150ms 的 texture-switch stall。若真实 iPhone 达不到该边界，先降低 cache 上限或 ring drawSize，禁止恢复 hard switch。

- [ ] Commit：

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime
git add app/src/scenes/pattern
git commit -m "fix(r5): render pattern structure continuously"
```

---

## 3. Task 3 — 固定 Star Map alpha 数据源与跨转场 ambient 时钟

### 3.1 写真实像素 RED/GREEN，不再靠源码字符串证明

**Files:**

- Modify: `app/src/scenes/star-map/starFieldReveal.ts`
- Modify: `app/src/scenes/star-map/starFieldReveal.test.ts`

- [ ] 提取纯函数 `starHighlightAlphaAt(source, offset, mode, config)`，生产循环与测试共用。`precomputed-alpha` 必须只返回 `source[offset + 3] / 255`；RGB 值不参与阈值、gamma 或 softness。

- [ ] 用两组相反样本证明：

```text
RGB=255/255/255, alpha=0   => output alpha=0
RGB=0/0/0,       alpha=192 => output alpha=192
```

- [ ] 正式 baked mask 的分布 contract 放到 Task 6 WebKit（浏览器真实解码 WebP 后读取 Canvas）：透明/近透明像素必须占多数、非零高光必须存在、全不透明像素不得成为整幅画面。不要为 Node/Vitest 新增图片解码依赖，也不修改 frozen asset。

- [ ] 保留 `destination-in` 只读取 mask alpha，以及已有 Gaussian glow passes；不得调暗整个 source plate 来伪造修复。

### 3.2 删除 DOM ownership observer，改用 command 生命周期

**Files:**

- Modify: `app/src/scenes/star-map/phone/PhoneStarMap.tsx`
- Modify: `app/src/scenes/star-map/phone/PhoneStarMap.test.tsx`

- [ ] 删除 `MutationObserver` 和对 `.phone-story` 的 `data-phone-status/source/candidate` 推断。

- [ ] `commands.render(...)`、`settle(...)` 与 migration `enter/reverse` 设置 active 并调用 `startAmbient()`；`pause/dispose` 唯一负责停止。

- [ ] reduced motion 仍渲染一张静态 Perlin composite，但不持续 RAF。

- [ ] 测试生命周期矩阵：stable Star、Star→AOD source、Pattern→Star incoming 都连续增加 revision；pause 后不再增加；rebind 不创建第二条 RAF。

### 3.3 GREEN 与提交

- [ ] 运行：

```bash
pnpm exec vitest run \
  src/scenes/star-map/starFieldReveal.test.ts \
  src/scenes/star-map/phone/PhoneStarMap.test.tsx
pnpm run typecheck
```

- [ ] Commit：

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime
git add app/src/scenes/star-map
git commit -m "fix(r5): bind star perlin to alpha and leaf lifetime"
```

---

## 4. Task 4 — 让 Hero coverage 与实际底部 vignette 同色

### 4.1 RED：面积覆盖不等于视觉连续

**Files:**

- Modify: `app/src/production/phone-story/manifest.test.ts`
- Modify: `app/src/production/phone-story/presentation.test.ts`
- Modify: `app/e2e/r5-phone-clean-presentation.spec.ts`

- [ ] 保留四边 coverage geometry oracle；新增 Hero bottom-edge 色彩 contract：Hero coverage 色必须等于 Hero vignette 在底边的最终实色，而不是通用 `#07110e`。

- [ ] 在 targeted browser test 中于冷 Hero 首帧、Safari toolbar 第一次变化前后分别采样底部左/中/右三点。三点必须保持 opaque，且变化不得形成一条比相邻 Hero 底边明显更亮的水平缝。

### 4.2 最小修复：改 canonical edge surface，不扩大 plane

**Files:**

- Modify: `app/src/production/phone-story/manifest.ts`
- Modify: `app/src/production/phone-story/manifest.test.ts`
- Verify: `app/src/production/phone-story/styles.css`
- Verify: `app/src/scenes/hero/phone/PhoneHero.css`

- [ ] 保留 `.phone-story__coverage { inset: -96px; }` 和 `.phone-story__planes { overflow: hidden; }`；不得扩大 transition plane 或 Ink mask。

- [ ] 将 Hero `edgeSurface` 设为与底部 vignette 实际终色一致的深色（以 browser pixel oracle 确认，预期接近 `#040807`），并同步 manifest test。其他 scene edge surface 不变。

- [ ] 不新增 Hero 专用 fixed overlay；coverage 继续是唯一 viewport seam owner。

### 4.3 GREEN 与提交

- [ ] 运行：

```bash
pnpm exec vitest run \
  src/production/phone-story/manifest.test.ts \
  src/production/phone-story/presentation.test.ts
pnpm run typecheck
pnpm run verify:phone-architecture:cutover
```

- [ ] Commit：

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime
git add app/src/production/phone-story/manifest.ts \
  app/src/production/phone-story/manifest.test.ts \
  app/src/production/phone-story/presentation.test.ts \
  app/e2e/r5-phone-clean-presentation.spec.ts
git commit -m "fix(r5): match hero coverage to its vignette"
```

---

## 5. Task 5 — 关闭 Method “03 共创”卡死的完整交接路径

### 5.1 只补组合证明，不重写 native reading

**Files:**

- Modify: `app/src/production/phone-story/PhoneStoryShell.tsx`
- Modify: `app/src/production/phone-story/PhoneStoryShell.test.tsx`
- Modify: `app/src/production/phone-story/runtime.test.ts`

- [ ] 将 `freezeNativeReadingBeforePublish` 的 DOM 查找限制在当前 `scope` 的 `.phone-story[data-phone-scope=...]`，并分别从该 shell 查 reading leaf 与 `.phone-story__viewport .phone-method-top__visual`。禁止 `document.querySelector` 误取相邻 QA shell。

- [ ] 保持现有 fresh-edge 语义：在本次手势中刚到达底边不离场；必须从底边开始下一次 outward gesture 才 publish story input。

- [ ] 新增一个组合测试，不再把以下事实分散证明：
  1. Method stable，document 有真实 `scrollHeight/clientHeight/scrollTop`；
  2. 滚到“03 共创”附近时发生 visualViewport toolbar resize/scroll；
  3. reducer 仍为相同 stable commit，reading 仍 enabled，document scroll 继续到 04/05；
  4. 第一次到达 bottom 的 gesture 不离场；
  5. 下一次从 bottom 开始的 trusted outward gesture 冻结实际 scroll snapshot；
  6. runtime 开始唯一 `method-bottom-figure2` transaction；
  7. 不出现 CTA、recovery transaction、重复 physical epoch 或 Method opening-frame reset。

- [ ] runtime test 同时断言 toolbar coalescing 只调用 `refreshStableViewport`，不会替换 attempt/commit/proof，也不会清空 native input owner。

### 5.2 若组合测试仍失败，只允许修实际失败层

允许的修复范围：

- scope-local DOM selection；
- `phoneReadingEdges` 对 Safari 浮点 scroll 值的现有 1px tolerance；
- toolbar `refreshStableViewport` 的同步几何刷新；
- 离场前的视觉 scroll snapshot。

禁止的替代方案：

- 跨手势 edge latch；
- 在“03”或任何段落自动跳到 Figure2；
- `scrollTo(bottom)`；
- 新的“继续”按钮；
- Method 专用状态机；
- 延时后强制 commit。

### 5.3 GREEN 与提交

- [ ] 运行：

```bash
pnpm exec vitest run \
  src/production/phone-story/PhoneStoryShell.test.tsx \
  src/production/phone-story/runtime.test.ts \
  src/production/phone-story/machine.test.ts
pnpm run typecheck
pnpm run verify:phone-architecture:cutover
```

- [ ] Commit：

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime
git add app/src/production/phone-story/PhoneStoryShell.tsx \
  app/src/production/phone-story/PhoneStoryShell.test.tsx \
  app/src/production/phone-story/runtime.test.ts \
  app/src/production/phone-story/machine.test.ts
git commit -m "fix(r5): close method native edge handoff"
```

---

## 6. Task 6 — 一次 focused 统一复核，不先跑全量 release

### 6.1 合并后的 deterministic batch

- [ ] 运行本轮所有相关测试：

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime/app
pnpm exec vitest run \
  src/scenes/aod-animation/progress.test.ts \
  src/scenes/aod-animation/phone/PhoneAod.test.tsx \
  src/scenes/pattern/phone/PhonePattern.test.tsx \
  src/scenes/pattern/patternBloomRenderer.test.ts \
  src/scenes/star-map/phone/PhoneStarMap.test.tsx \
  src/scenes/star-map/starFieldReveal.test.ts \
  src/production/phone-story/manifest.test.ts \
  src/production/phone-story/PhoneStoryShell.test.tsx \
  src/production/phone-story/machine.test.ts \
  src/production/phone-story/runtime.test.ts \
  src/production/phone-story/presentation.test.ts
pnpm run typecheck
pnpm exec eslint \
  src/scenes/aod-animation/phone/PhoneAod.tsx \
  src/scenes/pattern/patternBloomRenderer.ts \
  src/scenes/pattern/phone/PhonePattern.tsx \
  src/scenes/star-map/starFieldReveal.ts \
  src/scenes/star-map/phone/PhoneStarMap.tsx \
  src/production/phone-story/manifest.ts \
  src/production/phone-story/machine.ts \
  src/production/phone-story/runtime.ts \
  src/production/phone-story/PhoneStoryShell.tsx
pnpm run verify:phone-architecture:cutover
pnpm run build
git diff --check
```

- [ ] build 后记录并比较：Phone JS 必须小于 `663,552 B`；最大 lazy chunk 不得超过权威计划上限；frozen input、module provenance、media inventory 均不得漂移。

### 6.2 关键 WebKit 视觉门禁（这是本计划唯一的开发期 Playwright）

**File:**

- Modify: `app/e2e/r5-phone-clean-presentation.spec.ts`

- [ ] 将本轮测试放在 `test.describe('Task 13 eight-regression closure', ...)` 下，只覆盖：
  - cold Hero 底边三点在 toolbar 变化前后无亮缝；
  - Hero→Pattern incoming canvas revision 连续增加；
  - Pattern collapse 穿过旧六个 switchPoint 时无空白帧/长停顿，stable 后仍转；
  - Star Map canvas 非整片亮场，两个相隔 500ms 的 frame hash/亮度分布不同；
  - 正式 `star-map-highlight-mask.webp` 经浏览器解码后以 alpha 统计：近透明像素占多数，同时存在非零高光，RGB 不参与 mask 判定；
  - Star→AOD source revision 在 Ink transaction 内继续增加；
  - AOD forward/reverse 均经过 transparent alpha phase，reverse 第一张 prepared media frame 是 endpoint；
  - Method 发生 toolbar geometry change 后仍能原生滚到 05，下一次边缘手势进入 Figure2。

- [ ] 先单次运行，再连续 5 次：

```bash
pnpm exec playwright test --config playwright.release.config.ts \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=phone-portrait-webkit \
  --grep "Task 13 eight-regression closure" \
  --workers=1 --max-failures=1

for run in 1 2 3 4 5; do
  pnpm exec playwright test --config playwright.release.config.ts \
    e2e/r5-phone-clean-presentation.spec.ts \
    --project=phone-portrait-webkit \
    --grep "Task 13 eight-regression closure" \
    --workers=1 --max-failures=1 || exit 1
done
```

- [ ] 任一失败时停在 focused 修复；不运行 227-case，不用 retry 把 flaky 结果变绿。

### 6.3 更新审计文档并提交 focused closure

**Files:**

- Modify: `docs/react-refactor/reports/r5-phone-clean-runtime-task13-defect-ledger.md`
- Modify: `docs/superpowers/plans/2026-07-30-r5-phone-clean-runtime-convergence.md`

- [ ] 对 D13-003/D13-004 追加本轮八项 disposition、精确 commit、focused test 数量、build/预算结果；状态写为 `ready for bounded physical acceptance`，不能写 `Task 13 complete`。

- [ ] Commit：

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime
git add app/e2e/r5-phone-clean-presentation.spec.ts \
  docs/react-refactor/reports/r5-phone-clean-runtime-task13-defect-ledger.md \
  docs/superpowers/plans/2026-07-30-r5-phone-clean-runtime-convergence.md
git commit -m "test(r5): close task13 focused regression gates"
```

---

## 7. Task 7 — 固定构建上的真实 iPhone 人工验收

这一步才允许回答“可以开始人工验收”。Simulator 自动手势不能替代 trusted iPhone touch；SafariDriver 未发送 native touch 的旧记录既不是通过，也不是产品失败。

### 7.1 冻结人工验收构建

- [ ] 确认 source clean，记录 exact code SHA：

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime
git status --short
git rev-parse HEAD
git diff --check
```

- [ ] 按权威计划 Task 13.1R 创建 detached candidate worktree；只从该 worktree 的 `dist/` 提供预览。report worktree 不得冒充 candidate。

### 7.2 同一 iPhone、同一构建的 bounded matrix

- [ ] 环境固定并记录：iPhone 型号、iOS/Safari build、方向、动态效果开关、reduced-motion、toolbar 初始状态、URL、candidate SHA。

- [ ] 连续录屏，不刷新页面，正向跑两轮。每轮必须人工确认：

```text
Hero:     首帧无底缝，title/subtitle entrance 存在
Pattern:  incoming 即旋转；收缩无闪；收缩后继续旋转
Star:     Perlin 只落在高光区域；持续呼吸；离场 Ink 内不停
AOD:      无白底段；forward 正常；无 CTA
Method:   01→02→03→04→05 均可原生滚动；到边后新手势进入 Figure2
```

- [ ] 从 Method/Figure2 回退一轮：Method→AOD reverse 第一帧从 AOD endpoint 开始，动画完整反放，无白底、无 CTA、无 fault/rollback 闪屏。

- [ ] 每个场景切换同时检查 `.phone-story` diagnostics：不得出现 `faulted`、`awaiting-media-activation`、missing proof、重复 commit sequence 或 candidate/source 异常回跳。

- [ ] 任一项失败：保留同一录屏与时间戳，只重开对应 Task；该 candidate 作废。不得在手机上刷新到“偶尔通过”后继续。

通过门槛：两轮 forward + 一轮 reverse 全部首试通过，才记录 `Simulator/physical focused complete` 并进入 Task 8。

---

## 8. Task 8 — 最终一次完整 release suite、证据绑定与候选冻结

### 8.1 仅在人工矩阵通过后运行完整套件

- [ ] 在 exact candidate source 上运行一次：

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime/app
pnpm run test:release
```

- [ ] 失败即候选 NO-GO；修代码后必须产生新 SHA，并从 Task 6 focused batch 与 Task 7 人工矩阵重新开始。不得只重跑失败 case 后沿用旧候选身份。

### 8.2 绑定证据与最终状态

- [ ] 按权威计划 Task 12/13 的已有脚本验证：
  - 227/227 release cases；
  - evidence hashes/files/bytes；
  - release manifest `sourceCommit === candidateCodeSha`；
  - production tree hash；
  - module provenance；
  - Phone JS 与 lazy chunk budget；
  - frozen inputs；
  - clean detached candidate worktree。

- [ ] 更新：
  - `docs/react-refactor/reports/r5-phone-clean-runtime-task13-defect-ledger.md`
  - `docs/react-refactor/reports/r5-phone-clean-runtime-acceptance.md`
  - `docs/superpowers/plans/2026-07-30-r5-phone-clean-runtime-convergence.md`

- [ ] 只在所有身份与证据一致时标记 replacement candidate 和 Task 13 对应行完成。不要把 focused WebKit、Simulator 或手工截图单独称为 `Release-complete`。

- [ ] Final docs commit：

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime
git add docs/react-refactor/reports/r5-phone-clean-runtime-task13-defect-ledger.md \
  docs/react-refactor/reports/r5-phone-clean-runtime-acceptance.md \
  docs/superpowers/plans/2026-07-30-r5-phone-clean-runtime-convergence.md
git commit -m "docs(r5): bind task13 replacement candidate evidence"
```

---

## 9. Executor stop rules

任何一项发生时立即停止，不得继续到人工验收或完整 suite：

- AOD reverse 首个 prepared frame 不是 endpoint；
- continuous segment 出现 CTA；
- Pattern 源码仍含 endpoint hard switch；
- Star alpha test 仍依赖 RGB 或整幅画面高亮；
- ambient scene 在 transition source/receiver 生命周期内 revision 停止；
- Method toolbar 事件改变 stable commit/proof，或未从边缘开始的手势触发 segment；
- focused WebKit 需要 retry 才通过；
- source dirty、candidate SHA 与 manifest 不一致、frozen input 漂移；
- 为过 LOC/bundle gate 而 code golf、放宽预算或删除诊断。

## 10. 为什么这次能结束返工

本计划不是八个视觉补丁，而是关闭三条可复用契约：

1. **结构进度与 ambient 时钟分离，但启停仍由唯一 runtime command 生命周期控制。** 这同时关闭 Pattern 2/3/4 与 Star 5/6。
2. **媒体 desired progress 可在 mount 前锁存；物理信用不跨异步 mount；alpha ancestor 真透明。** 这同时关闭 AOD reverse、白底和错误 CTA 风险。
3. **coverage 是唯一 viewport seam owner；document 是唯一 reading scroll owner。** 这关闭 Hero 缝与 Method 卡死，不新增第二套协调逻辑。

只有这三条契约同时被 deterministic、WebKit 和 trusted iPhone 三层证明后，才进入一次完整 release suite。这样避免继续出现“全量自动测试很绿，但真机一滑就坏”的循环。
