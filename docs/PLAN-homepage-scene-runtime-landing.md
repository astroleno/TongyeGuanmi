# Homepage SceneRuntime Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首页从旧的 scroll / adapter / handoff / reveal 多 owner 时间线，落到一个可验证、可分 PR 推进的 SceneRuntime：滚动只表达意图，SceneRuntime 只做编排，Presentation 只做提交，Player 只画视觉。

**Architecture:** vanilla JS SceneRuntime + build-time scene contract。新 runtime 与旧 transition runtime 并行隔离开发，先用独立 `verify:scene-runtime:*` gate 证明，再在最后 PR 切生产入口；不把 React archive、Master Timeline pivot、旧 handoff receiver 继续混进新合同。

**Tech Stack:** ES modules, Node verification scripts, static `build-index`, current `src/sections/*.html`, `css/**`, `js/runtime/**` as reference, new `js/scenes/runtime/**` runtime modules, existing visual components/assets as rendering baseline.

---

## 0. 裁决

本计划执行 **SceneRuntime landing**，不执行 `docs/homepage-migration-analysis-FINAL.md` 里的 “4 个文件 Master Timeline pivot” 方案。

原因很简单：当前 root 里没有那份报告依赖的可执行 master surface producer / compositor surface；报告还引用了过期或不存在的文件行号，并把 `10vh` 误写成约 `10px`。它可以作为反方提醒保留，但不能作为当前仓库的落地方案。

同时，本计划也不照搬 React archive。`docs/archived/react-rewrite/*` 只能提供经验：React 不适合每帧驱动画面，视觉进度应在独立 driver/player 内跑，React/状态层只接里程碑。当前落地面是 vanilla JS。

最终取舍：

- 采纳 SceneRuntime 单 owner、Presentation 单提交点、Player 只视觉。
- 采纳 Visual Progress Driver 的思想：每帧视觉更新不走应用状态 dispatch。
- 采纳 ARMED 防抖、hysteresis、decay、cooldown，避免复现前 7 次的边界抖动。
- 采纳 Figure2 compound，但只允许一个 top-level compound：`figure2-animation -> brand`。
- 采纳 early-copy，但它只是 `PLAYING` 内 side effect，不是 `PRESENTING`。
- 保留 `philosophy` 为独立 reading section。若产品要删，必须另开 manifest 决策，不能实现时顺手跳过。
- 不再使用 scroll-scrub ink/webm。`currentTime` 只允许 reset、首帧、reduced-motion、恢复。

---

## 1. 当前仓库事实

| 主题 | 当前事实 | 落地要求 |
|---|---|---|
| 构建源 | `src/index.template.html`、`src/sections/*.html` 可复用，但仍混有旧 `chapter-transition` / `scene-transition` 结构 | DOM 可复用，时间合同必须新建 |
| Manifest | `src/section-manifest.mjs` 同时有旧 `chapterTransitions/handoffs/timeline*` 和新 `homepageTimeline` | 新建 `src/homepage/*.mjs`，不要继续扩这个混合文件 |
| Build | `scripts/build-index.mjs` 会注入旧 `data-transition-*`、`data-handoff-*`、`data-scene-copy` | 增加 SceneRuntime build mode，最终生产禁旧 attrs |
| Runtime 入口 | `js/main.js` 只有 `?snapRuntime=1` 或 dev global 才启用 snap runtime | 新入口先 feature flag，最后切默认 |
| 可复用 runtime | `js/runtime/homepage-snap-runtime.js`、`input-normalizer`、`charge-accumulator` 有价值 | 迁移思想，不直接扩大为最终 runtime |
| 当前 Scene DOM map | 约 11/19 有映射 | 最终 19/19 或显式 compound/internal step 映射 |
| 旧控制器 | `js/transitions/homepage-transition-runtime.js`、`section-presentation-controller.js`、`scene-timeline-controller.js` 仍是旧 owner | 新方案只隔离/废弃，不在里面继续修 |
| Reveal | `js/ui/reveal.js` 全局 `.reveal` 会影响 owned copy | SceneRuntime-owned copy 必须被排除 |

当前不应把 `npm run verify:all` 当 SceneRuntime 合并门禁，因为它仍验证旧 timeline/handoff 合同。先添加独立 SceneRuntime 验证，最后切换 `verify:all`。

---

## 2. 不变量

这些规则一条都不能放松：

- `SceneRuntime` 是唯一调度者。
- `Presentation` 是唯一提交者：`currentSceneId`、copy final state、nav、hash、aria、focus、poster 都只能由它提交。
- `Player` / adapter 只画自己的视觉层，不写 target scene、target copy、nav、hash、aria。
- `.reveal` 不得控制 `data-entry-owner="scene-runtime"` 或等价 owned copy。
- 不移动真实 target DOM 做 adopt/restore；`handoff-receiver` 已 retired，这条保留。
- `SNAP_LOCKING` 必须在 `ARMED` 前。
- `10vh` 是 intent 阈值，不是视觉 progress。
- `early-copy` 只在 `PLAYING` 内展示目标文案；`PLAY_COMPLETE` 后才进入 `PRESENTING`。
- 同一帧同一 layer 只能一个 owner；dev fail-fast，production 进入 `RECOVERING` 并 fail-open。
- 资源失败、`play()` reject、`ended` 丢失、resize 异常都必须释放滚动。
- Reduced motion 直接 present target，不长时间锁滚。

---

## 3. 状态机合同

最终状态机：

```txt
IDLE
  currentScene 已提交；reading scene 允许自然滚动。

SNAP_LOCKING
  锁输入；把 viewport 对齐到 current scene 或下一段安全播放位。

ARMED
  页面已冻结；只累计 wheel/touch/key 的 10vh intent。
  不读取 scrollY 驱动画面。

PLAYING
  只有一个 activeSegmentId。
  visual progress 来自 fixed clock / media time / compound step。
  early-copy 只在这里发生，不跳转 PRESENTING。

PRESENTING
  唯一原子提交点：scene、copy final state、aria、nav、hash、focus、poster。

RELEASING
  清理 overlay/ghost/player；reset intent；释放滚动；cooldown 后回 IDLE。

RECOVERING
  所有失败路径进入；先解锁，再 present target 或 lastSafeScene，最后 RELEASING。
```

全局事件：

- `HASH_JUMP`：直接进入目标 presented 状态，不补播历史动画。
- `REDUCED_MOTION`：跳过 charge 与动画播放，直接 present target。
- `DESTROY`：停止 player、listener、timer、media、debug hooks。
- `RESIZE`：刷新 bounds；正在 `PLAYING` 时不重新决定目标，只刷新 commit 前 bounds。

禁止状态顺序：

```txt
IDLE -> ARMED -> SNAP_LOCKING
PLAYING + MEDIA_PROGRESS(0.8) -> PRESENTING
```

---

## 4. ScrollIntent 合同

基于现有 `js/runtime/input-normalizer.js` 与 `js/runtime/charge-accumulator.js` 扩成正式合同。

默认配置：

```js
export const scrollIntentDefaults = {
  intentThreshold: 0.1,       // 10vh
  singleFrameClamp: 0.25,     // 25vh
  minArmedMs: 150,
  reverseCancelThreshold: 0.06,
  cancelCooldownMs: 120,
  decayHalfLifeMs: 260,
  touchMomentumGraceMs: 180,
  releaseCooldownMs: 220
};
```

规则：

- 输入源：wheel、touchmove、keyboard。
- 输出只包含 `intentProgress`、`direction`、`thresholdReached`、`source`。
- 只在 `ARMED` 或 compound `awaitIntent()` 中消费输入。
- 未满阈值停手要 decay，方向反转先抵消或 reset。
- 触发后 player 进入 fixed-time / media-time 自动播放；不得把 intent progress 继续绑定到视觉。
- reading 段内的自然滚动不进 `ARMED`，只有 ReadMonitor 判定读到底后才 arm 下一段。

---

## 5. ReadMonitor 合同

`ReadMonitor` 只管 reading scene 的 DOM 边界，不参与动画播放。

职责：

- 检测 reading scene enter / active / complete。
- 输出 reading progress / event 给 SceneRuntime debug；不直接写 nav、hash、focus、`currentSceneId` 或 copy state。
- 长阅读段读到底后，才交给 ScrollIntent 累计额外 `10vh`。
- `method-upper -> method-lower` 不使用 `distanceVh: 0`，改用 DOM 边界条件。

FSM 集成事件：

```txt
READ_ENTERED(sceneId, boundsVersion)
  reading scene top crosses viewport center.
  SceneRuntime may ask Presentation to mark reading active.

READ_ACTIVE(sceneId, progress, boundsVersion)
  debug/progress only; never transitions to ARMED or PRESENTING.

READ_COMPLETE_LATCHED(sceneId, boundsVersion)
  reading scene bottom crosses viewport bottom.
  Latches complete until explicit reverse hysteresis or hash jump.

ARM_NEXT_READY(sceneId, nextSegmentId)
  emitted only after READ_COMPLETE_LATCHED plus post-complete forward intent.
  FSM still transitions IDLE -> SNAP_LOCKING -> ARMED, never directly to ARMED.
```

边界规则：

- Fast scroll / touch momentum 不能跳过 reading scene。即使一次输入跨过多个边界，也必须先产生 `READ_COMPLETE_LATCHED`，再等待一次 post-complete forward intent 才能 `ARM_NEXT_READY`。
- Resize / `visualViewport` 变化只刷新 `boundsVersion`。已 latch 的 complete 不因轻微 layout shift 自动清空；只有用户反向滚回 complete threshold 之前并超过 hysteresis 才解除。
- Hash jump 由全局 `HASH_JUMP` 直接 present target，不补发 reading 历史事件。
- Presentation 仍是唯一提交者；ReadMonitor 只能 emit events，不能直接更新 nav/hash/focus。

推荐 reading schema：

```js
read: {
  enterWhen: 'top-crosses-viewport-center',
  completeWhen: 'bottom-crosses-viewport-bottom',
  nextArm: 'after-bottom-plus-intent'
}
```

---

## 6. Layer Ownership

逻辑层不依赖 React host，靠 DOM attrs 与 runtime registry 约束。

| Layer | Owner |
|---|---|
| `visual-stage` | SegmentPlayer |
| `ink-mask` | SegmentPlayer |
| `media` | MediaPlayer / SegmentPlayer |
| `copy` | Presentation |
| `scene-state` | Presentation |
| `nav/hash/focus` | Presentation |
| `read-boundary` | ReadMonitor |
| `site-ui` | SiteRuntime |

CSS 只能反映 `data-scene-state`、`data-copy-state`、`data-layer-owner`，不能决定 commit。

80% reveal 的真实解法不是 adapter 改 z-index，而是 Presentation 发起 `presentEarlyCopy()` 并设置 layer owner：

```txt
PLAYING(aod-play, progress >= 0.8)
-> Presentation.presentEarlyCopy({ targetScene: 'method-upper' })
-> copy layer owner = Presentation
-> media layer remains MediaPlayer until PLAY_COMPLETE
```

---

## 7. Segment 类型

### `ink-transition`

- 进入 from scene 的 snapped 状态。
- 用户继续滚动 `10vh` 后播放 ink。
- ink progress 由 clock 驱动，不由 scrollY 驱动。
- 完成后进入 `PRESENTING`，再释放滚动。

### `media-animation`

- 进入 animation scene 后只显示 poster / first frame。
- 用户继续滚动 `10vh` 后 `video.play()` 或 component clock 自动播放。
- `seek/currentTime` 只用于 reset、first frame、reduced-motion、恢复。
- AOD、Figure3、Crane 支持 `earlyCopyAt: 0.8`。

TTG / PH 的 exit ink 显式建模为 phase，不升级成 compound：

```js
mediaAnimation: {
  phases: ['media', 'exitInk'],
  commitAfter: 'exitInk'
}
```

### `compound-sequence`

全站只允许一个 top-level compound：

```txt
figure2-animation -> brand
```

内部 step：

```txt
camera-expand
arch-with-cards
arch-with-closing
ink-sweep-to-brand
```

内部合同：

```js
type CompoundContext = {
  awaitIntent(options: { distanceVh: 10, direction: 'forward' }): Promise<void>;
  presentStep(stepId: string): void;
  claimLayer(claim: object): void;
  updateDebug(details: object): void;
};
```

硬规则：

- compound 内部不得自己监听 wheel / touch / key。
- 外层只有一个 `activeSegmentId`。
- 内部只有一个 `activeStepId`。
- proof cards / closing 是 internal steps，不作为普通 top-level scenes 抢状态。
- final ink 完成后，只提交一次 `brand`。

---

## 8. 目标 Scene 链路

目标 top-level scene 顺序：

```txt
hero
pattern-bloom
belief-star
aod-animation
method-upper
method-lower
figure2-animation        (compound: cards / closing / ink-sweep 内部推进)
brand
figure3-animation
services
ttg-animation
lab
ph-animation
education
philosophy
crane-animation
contact
```

目标 top-level block 顺序：

```txt
hero-to-pattern
pattern-to-belief
belief-to-aod
aod-play
method-lower-to-figure2
figure2-compound-to-brand
brand-to-figure3
figure3-play
services-to-ttg
ttg-play
ttg-to-lab
lab-to-ph
ph-play
ph-to-education
education-to-philosophy
philosophy-to-crane
crane-play
```

注意：现有 `figure2-proof-cards`、`figure2-proof-closing` 可保留为内容 refs / internal step ids，但不能再作为普通 top-level scenes 参与全局 FSM。

---

## 9. 文件落点

### 新增合同文件

- [ ] `src/homepage/homepage.scenes.mjs`
- [ ] `src/homepage/homepage.timeline.mjs`
- [ ] `src/homepage/homepage.assets.mjs`
- [ ] `src/homepage/homepage.aliases.mjs`
- [ ] `src/homepage/homepage.schema.mjs`
- [ ] `src/copy/homepage-reference.mjs`

### 新增 runtime 文件

- [ ] `js/scenes/runtime/SceneRuntime.js`
- [ ] `js/scenes/runtime/state-machine.js`
- [ ] `js/scenes/runtime/scroll-intent.js`
- [ ] `js/scenes/runtime/read-monitor.js`
- [ ] `js/scenes/runtime/presentation.js`
- [ ] `js/scenes/runtime/layer-ownership.js`
- [ ] `js/scenes/runtime/player-registry.js`
- [ ] `js/scenes/runtime/recovery.js`
- [ ] `js/scenes/runtime/debug-panel.js`

### 新增 players

- [ ] `js/scenes/players/ink-transition-player.js`
- [ ] `js/scenes/players/media-animation-player.js`
- [ ] `js/scenes/players/aod-player.js`
- [ ] `js/scenes/players/figure2-compound-player.js`
- [ ] `js/scenes/players/figure3-player.js`
- [ ] `js/scenes/players/ttg-player.js`
- [ ] `js/scenes/players/ph-player.js`
- [ ] `js/scenes/players/crane-player.js`

### 修改文件

- [ ] `scripts/build-index.mjs`：增加 SceneRuntime build mode，最终禁旧 attrs。
- [ ] `js/main.js`：增加 `?sceneRuntime=1` / dev global 入口，最后切默认。
- [ ] `js/ui/reveal.js`：排除 SceneRuntime-owned copy。
- [ ] `src/index.template.html`：支持 new scene shell attrs。
- [ ] `src/sections/*.html`：补 19/19 scene host 或 internal step anchors。
- [ ] `css/sections/homepage-snap-heights.css`：升级为 SceneRuntime height/snap contract。
- [ ] `css/components/homepage-continuity.css`：隔离旧 timeline copy gate，最终移除生产依赖。

### 不继续扩展

- [ ] `js/transitions/homepage-transition-runtime.js`
- [ ] `js/transitions/homepage/section-presentation-controller.js`
- [ ] `js/transitions/homepage/scene-timeline-controller.js`
- [ ] `js/transitions/homepage/handoff-receiver.js`

---

## 10. PR / Worktree 拆分

### PR1: Contract Freeze

目标：冻结合同，不改生产入口。

- [ ] 新建 `src/homepage/homepage.scenes.mjs`，只包含目标 top-level scenes 与 Figure2 internal steps。
- [ ] 新建 `src/homepage/homepage.timeline.mjs`，只包含目标 top-level blocks。
- [ ] 新建 `src/homepage/homepage.assets.mjs`，集中声明 visual assets 与 media ids。
- [ ] 新建 `src/homepage/homepage.aliases.mjs`，声明 hash / public section alias。
- [ ] 新建 `src/homepage/homepage.schema.mjs`，校验 scene、block、layer、content refs。
- [ ] 新建 `scripts/check-scene-runtime-contract.mjs`。
- [ ] 禁止合同中出现旧字段：`handoff`、`sourceOut`、`targetIn`、`commitAt`、`presentAt`、`cleanupAt`、`data-entry-owner="timeline"`。
- [ ] 验证 Figure2 只有一个 top-level compound block。

通过命令：

```bash
node scripts/check-scene-runtime-contract.mjs
npm run verify:homepage-timeline
```

### PR2: Runtime Core

目标：实现纯状态机与输入合同，不接视觉。

- [ ] 新建 `js/scenes/runtime/state-machine.js`。
- [ ] 新建 `js/scenes/runtime/scroll-intent.js`，实现 threshold、hysteresis、decay、cooldown。
- [ ] 新建 `js/scenes/runtime/read-monitor.js`，实现 reading boundary。
- [ ] 新建 `js/scenes/runtime/presentation.js`，实现单提交点。
- [ ] 新建 `js/scenes/runtime/layer-ownership.js`，实现 dev conflict fail-fast。
- [ ] 新建 `js/scenes/runtime/recovery.js`，实现 fail-open unlock。
- [ ] 新建 `scripts/check-scene-state-machine.mjs`。
- [ ] 新建 `scripts/check-scroll-intent.mjs`。
- [ ] 新建 `scripts/check-read-monitor-fsm.mjs`。
- [ ] 新建 `scripts/check-presentation-invariants.mjs`。
- [ ] 新建 `scripts/check-reduced-motion-runtime.mjs`。

通过命令：

```bash
node scripts/check-scene-state-machine.mjs
node scripts/check-scroll-intent.mjs
node scripts/check-read-monitor-fsm.mjs
node scripts/check-presentation-invariants.mjs
node scripts/check-reduced-motion-runtime.mjs
```

### PR3: DOM Shell / Build Isolation

目标：让构建产物能承载 SceneRuntime，但不启用生产默认。

- [ ] `scripts/build-index.mjs` 增加 `--scene-runtime` build mode。
- [ ] build mode 输出 `data-scene-id`、`data-scene-kind`、`data-scene-owner="scene-runtime"`。
- [ ] build mode 不输出旧 `data-transition-*`、`data-handoff-*`、`data-target-entry-*`、`data-scene-copy`、`data-scene-target`。
- [ ] 补齐 scene DOM map：top-level scene 17/17，Figure2 internal steps 单独标为 `data-compound-step-id`。
- [ ] `js/ui/reveal.js` 跳过 SceneRuntime-owned copy。
- [ ] `css/sections/homepage-snap-heights.css` 明确 animation scene `100dvh`，reading scene `min-height:100dvh`。
- [ ] 新建 `scripts/check-scene-dom-shell.mjs`。
- [ ] 新建 `scripts/check-reveal-ownership.mjs`。
- [ ] 新建 `scripts/check-hash-entry.mjs`。
- [ ] 新建 `scripts/check-no-legacy-homepage-runtime.mjs`。

通过命令：

```bash
node scripts/check-scene-dom-shell.mjs
node scripts/check-reveal-ownership.mjs
node scripts/check-hash-entry.mjs
node scripts/check-no-legacy-homepage-runtime.mjs
```

### PR4: MVP Vertical Slice

目标：打通 `hero -> pattern-bloom -> belief-star -> aod-animation -> method-upper -> method-lower`。

- [ ] `js/main.js` 增加 `?sceneRuntime=1` 入口。
- [ ] `js/scenes/runtime/SceneRuntime.js` 接合同、DOM shell、core modules。
- [ ] `js/scenes/players/ink-transition-player.js` 支持 radial center、rotating left、horizontal irregular。
- [ ] `js/scenes/players/aod-player.js` 支持 autoplay、poster、ready timeout、ended grace。
- [ ] `Presentation.presentEarlyCopy()` 支持 `aod-animation -> method-upper` 的 80% copy。
- [ ] `ReadMonitor` 支持 `method-upper` 与 `method-lower`。
- [ ] 新建 `scripts/check-scene-runtime-mvp-route.mjs`。
- [ ] 新建 `scripts/check-media-poster-gate.mjs`。
- [ ] 新建 `scripts/check-text-read-segment.mjs`。
- [ ] 完成 MVP route 手感验收：trackpad inertia、mouse wheel、keyboard、touch / mobile viewport、未达阈值 decay、reverse cancel、media fail unlock。
- [ ] 保留现有 `scripts/check-aod-scene-adapter.mjs` 作为视觉参考检查，不作为最终状态合同。

通过命令：

```bash
node scripts/check-scene-runtime-mvp-route.mjs
node scripts/check-media-poster-gate.mjs
node scripts/check-text-read-segment.mjs
node scripts/check-aod-scene-adapter.mjs
```

### PR5: Figure2 Compound

目标：把 Figure2 从多 scene 抢状态改成单 compound。

- [ ] `js/scenes/players/figure2-compound-player.js` 实现 `camera-expand`。
- [ ] 实现 `arch-with-cards`，cards 内容来自 `src/copy/homepage-reference.mjs` 的 `proof-cards-122-126`。
- [ ] 实现 `arch-with-closing`，closing 内容来自 `proof-closing-128`。
- [ ] 实现 `ink-sweep-to-brand`，完成后只提交一次 `brand`。
- [ ] compound 内部只通过 `context.awaitIntent({ distanceVh: 10, direction: 'forward' })` 推进。
- [ ] 新建 `scripts/check-figure2-compound-contract.mjs`。
- [ ] 新建 `scripts/check-figure2-step-order.mjs`。
- [ ] 新建 `scripts/check-no-compound-self-listeners.mjs`。

通过命令：

```bash
node scripts/check-figure2-compound-contract.mjs
node scripts/check-figure2-step-order.mjs
node scripts/check-no-compound-self-listeners.mjs
```

### PR6: Middle / Tail Media

目标：打通 `brand -> figure3 -> services -> ttg -> lab -> ph -> education -> philosophy -> crane -> contact`。

- [ ] `brand` 文案切到 `brand-135-136`，旧双卡仅作为视觉参考。
- [ ] `figure3-player` 支持 `figure3-animation -> services` early-copy。
- [ ] `ttg-player` 支持 `media + exitInk` phases。
- [ ] `ph-player` 支持 `media + exitInk` phases 与 sunburst ink entry。
- [ ] `crane-player` 支持 `crane-animation -> contact` early-copy。
- [ ] `philosophy` 保留为独立 reading scene。
- [ ] 新建 `scripts/check-middle-tail-route.mjs`。
- [ ] 新建 `scripts/check-media-phases.mjs`。
- [ ] 新建 `scripts/check-early-copy-invariants.mjs`。

通过命令：

```bash
node scripts/check-middle-tail-route.mjs
node scripts/check-media-phases.mjs
node scripts/check-early-copy-invariants.mjs
```

### PR7: Production Switch

目标：默认启用 SceneRuntime，旧 timeline/handoff 从生产路径退出。

- [ ] `js/main.js` 默认启用 SceneRuntime。
- [ ] `js/main.js` 支持 `?legacyTimeline=1` 回滚入口；如果当前 `index.html` 已移除旧 attrs，则跳转或加载 legacy fallback artifact。
- [ ] `scripts/build-index.mjs` 默认使用 SceneRuntime build mode。
- [ ] `scripts/build-index.mjs` 在 rollout 期保留可访问的 legacy fallback artifact，例如 `index-legacy.html` 或等价 legacy route。
- [ ] `package.json` 新增 `verify:scene-runtime`，再把它纳入 `verify:all`。
- [ ] 生产 `index.html` 不含旧 runtime attrs。
- [ ] 旧 runtime 文件和 legacy fallback artifact 默认保留 3 个月；删除必须另开 PR，且不能破坏 `?legacyTimeline=1` 的发布期回滚要求。
- [ ] 新建 `scripts/check-production-scene-runtime.mjs`。
- [ ] 新建 `scripts/check-legacy-runtime-fallback.mjs`。
- [ ] 新建 `scripts/check-no-scroll-scrub-homepage.mjs`。
- [ ] 新建 `scripts/check-no-dom-handoff-homepage.mjs`。

通过命令：

```bash
npm run build:page
npm run verify:scene-runtime
npm run verify:all
node scripts/check-production-scene-runtime.mjs
node scripts/check-legacy-runtime-fallback.mjs
node scripts/check-no-scroll-scrub-homepage.mjs
node scripts/check-no-dom-handoff-homepage.mjs
```

---

## 11. 并行 worktree 方案

PR1 必须先合并。PR1 后可以并行。

| Worktree / Branch | Owner 范围 | 禁止修改 |
|---|---|---|
| `codex/scene-runtime-integration` | `package.json`、`scripts/build-index.mjs`、`js/main.js`、最终 verify aggregation | 不直接写 visual players |
| `codex/scene-runtime-core` | `js/scenes/runtime/**`、runtime checks | 不改 `src/sections/**` |
| `codex/scene-runtime-dom` | `src/index.template.html`、`src/sections/**`、`css/sections/**`、reveal ownership checks | 不改 runtime core |
| `codex/scene-runtime-media` | ink/media/aod/figure3/ttg/ph/crane players | 不改 Figure2 compound |
| `codex/scene-runtime-figure2` | `js/scenes/players/figure2-compound-player.js`、Figure2 checks、copy refs | 不改 global state machine |

合并顺序：

```txt
PR1 Contract
  -> PR2 Runtime Core
  -> PR3 DOM Shell
  -> PR4 MVP
  -> PR5 Figure2
  -> PR6 Middle/Tail
  -> PR7 Production Switch
```

PR2 与 PR3 可并行；PR4 依赖 PR2+PR3；PR5 与 PR6 在 PR4 后可并行，但最终由 integration worktree 统一接入。

---

## 12. 验证矩阵

当前基线命令：

```bash
npm run verify:snap-runtime
npm run verify:homepage-timeline
npm run verify:runtime-integration
npm run verify:aod-adapter
npm run verify:figure2-adapter
npm run verify:pattern-bloom-adapter
node scripts/check-homepage-content-boundaries.mjs
node scripts/check-pilot-readiness.mjs
```

SceneRuntime 新门禁：

```bash
node scripts/check-scene-runtime-contract.mjs
node scripts/check-scene-state-machine.mjs
node scripts/check-scroll-intent.mjs
node scripts/check-read-monitor-fsm.mjs
node scripts/check-presentation-invariants.mjs
node scripts/check-reduced-motion-runtime.mjs
node scripts/check-scene-dom-shell.mjs
node scripts/check-reveal-ownership.mjs
node scripts/check-scene-runtime-mvp-route.mjs
node scripts/check-figure2-compound-contract.mjs
node scripts/check-middle-tail-route.mjs
```

最终生产门禁：

```bash
npm run build:page
npm run verify:scene-runtime
npm run verify:all
node scripts/check-legacy-runtime-fallback.mjs
```

注意：`npm run build:page` 会写 `index.html` 和生成 manifest。只在对应 PR 允许生成文件差异时运行，运行后必须检查：

```bash
git diff -- index.html js/transitions/homepage/scene-timeline-manifest.js
```

---

## 13. Definition of Done

完成条件：

- [ ] `?sceneRuntime=1` 能跑完整目标链路。
- [ ] 生产默认入口启用 SceneRuntime。
- [ ] `index.html` 不含旧 `data-transition-*`、`data-handoff-*`、`data-target-entry-*`、`data-scene-copy`、`data-scene-target`。
- [ ] 生产路径不加载 `homepage-transition-runtime.js`、`section-presentation-controller.js`、`scene-timeline-controller.js`。
- [ ] Player 没有直接写 target copy / nav / hash / aria。
- [ ] `.reveal` 不控制 SceneRuntime-owned copy。
- [ ] AOD / Figure3 / Crane 的 80% 文案入场不会提前 commit scene。
- [ ] ReadMonitor 只 emit reading events，不直接写 nav/hash/focus；fast scroll 不能跳过 reading scene。
- [ ] Figure2 只有一个 top-level compound，internal steps 不监听原始输入。
- [ ] `10vh` 手感验收通过并记录：5 人轻量 UAT 中，若 >=3 人反馈“页面劫持滚动 / 无法控制节奏”，不得切生产默认。
- [ ] Reduced motion 不长时间锁滚。
- [ ] 任一 media fail / play reject / ended lost 都能释放滚动。
- [ ] `?legacyTimeline=1` 或等价 legacy fallback 在 rollout 期可用，且不会与 SceneRuntime 双启动。
- [ ] `npm run verify:scene-runtime` 与 `npm run verify:all` 通过。

---

## 14. Rollout / 回滚合同

- PR4 前只允许 `?sceneRuntime=1` opt-in，不改生产默认。
- PR7 后生产默认启用 SceneRuntime，但 `?legacyTimeline=1` 必须能进入旧 runtime fallback。
- 如果生产 `index.html` 已移除旧 `data-transition-*` / `data-handoff-*` attrs，legacy fallback 必须是独立 artifact，而不是在同一 DOM 上强行启动旧 runtime。
- Rollout 期不得同时启动 SceneRuntime 和 legacy timeline。`?legacyTimeline=1` 是互斥 override。
- Legacy fallback 默认保留 3 个月；提前删除需要单独决策 PR，并证明线上不再需要回滚入口。

---

## 15. 旧文档关系

- `docs/PLAN-homepage-snapped-scene-runtime.md`：保留为视觉、内容、目标链路来源。
- `docs/REVIEW-homepage-scene-runtime-migration.md`：保留为审查依据。
- `docs/homepage-migration-analysis-FINAL.md`：保留为反方风险提示；不作为执行方案。
- 本文档是当前落地执行合同。后续实现 PR 以本文为准。
