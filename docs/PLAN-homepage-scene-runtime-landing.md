# Homepage SceneRuntime Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not start runtime/player implementation until PR1 contract/assets gates and PR2 pure FSM gates are defined and passing.

**Goal:** 把首页从旧的 scroll / adapter / handoff / reveal 多 owner 时间线，落到一个可验证、可分 PR 推进的 SceneRuntime：滚动只表达意图，SceneRuntime 只做编排，Presentation 只做提交，Player 只画视觉。

**Architecture:** 从 `main` 新开分支重做 vanilla JS SceneRuntime + build-time scene contract。旧 `react-rewrite/homepage-snap-timeline` 分支只作为问题样本和文档来源，不作为实现基座。新 runtime 与 `main` 的旧 transition runtime 隔离开发，先用独立 `verify:scene-runtime:*` gate 证明，再在最后 PR 切生产入口；不把 React archive、Master Timeline pivot、旧 handoff receiver 继续混进新合同。

**Tech Stack:** ES modules, Node verification scripts, static `build-index`, `main` 的 `src/sections/*.html`、`css/**`、`js/components/**`、`js/transitions/**` 和 `assets/**` 作为视觉与内容基准；新建 `src/homepage/**` 合同与 `js/scenes/runtime/**` runtime modules。

---

## 0. 裁决

本计划执行 **从 `main` 重做 SceneRuntime landing**，不在当前 `react-rewrite/homepage-snap-timeline` 分支继续接实现，也不执行 `docs/homepage-migration-analysis-FINAL.md` 里的 “4 个文件 Master Timeline pivot” 方案。

原因很简单：当前 root 里没有那份报告依赖的可执行 master surface producer / compositor surface；报告还引用了过期或不存在的文件行号，并把 `10vh` 误写成约 `10px`。它可以作为反方提醒保留，但不能作为当前仓库的落地方案。

同时，本计划也不照搬 React archive。`docs/archived/react-rewrite/*` 只能提供经验：React 不适合每帧驱动画面，视觉进度应在独立 driver/player 内跑，状态层只接里程碑。当前落地面是 `main` 上的 vanilla JS。

最终取舍：

- 采纳 SceneRuntime 单 owner、Presentation 单提交点、Player 只视觉。
- 采纳 Visual Progress Driver 的思想：每帧视觉更新不走应用状态 dispatch。
- 采纳 ARMED 防抖、hysteresis、decay、cooldown，避免复现前 7 次的边界抖动。
- 采纳 Figure2 compound，但只允许一个 top-level compound：`figure2-animation -> brand`。
- 采纳 early-copy，但它只是 `PLAYING` 内 side effect，不是 `PRESENTING`。
- SceneRuntime v1 不包含 `philosophy` 独立 scene。`main` 里的 `src/sections/philosophy.html` 先保留源码，但目标 timeline 直接 `education -> crane-animation -> contact`；若之后要恢复 philosophy，作为 v2 manifest 变更处理。
- 不再使用 scroll-scrub ink/webm。`currentTime` 只允许 reset、首帧、reduced-motion、恢复。

---

## 1. `main` 基准事实

| 主题 | 当前事实 | 落地要求 |
|---|---|---|
| 实现基座 | `main` 存在，当前工作树不在 `main` | 实现从 `main` 新建 `codex/scene-runtime-main-rebuild`；当前分支只沉淀文档 |
| 构建源 | `main:src/index.template.html` 直接 include `hero/belief/method/brand/services/lab/education/philosophy/contact`，并插入旧 `chapter-transition` | DOM/content 可复用，timeline 合同必须新建 |
| Manifest | `main:src/section-manifest.mjs` 只有旧 `contentSections`、`chapterTransitions`、`handoffs`、`sectionEntryPolicies` | 新建 `src/homepage/*.mjs`，不要在旧 manifest 上继续堆新 runtime |
| Build | `main:scripts/build-index.mjs` 会注入旧 `data-transition-*`、`data-handoff-*`、`data-target-entry-*` | 增加 SceneRuntime build mode，最终生产禁旧 attrs |
| Runtime 入口 | `main:js/main.js` 默认加载 `initHomepageTransitions()` | 新入口先 feature flag，最后切默认 |
| 旧视觉 adapter | `main:js/transitions/homepage/*-homepage-adapter.js` 与 `main:js/transitions/pattern-bloom-adapter.js` 是视觉基准 | 可借 DOM/layer/assets，不借 scroll progress / handoff / target copy 控制 |
| 旧控制器 | `main:js/transitions/homepage-transition-runtime.js`、`section-presentation-controller.js`、`handoff-receiver.js` 是旧 owner | 新方案只隔离/废弃，不在里面继续修 |
| Reveal | `main:js/ui/reveal.js` 全局 `.reveal` 会影响 owned copy | SceneRuntime-owned copy 必须被排除 |

当前不应把 `npm run verify:all` 当 SceneRuntime 合并门禁，因为它仍验证旧 timeline/handoff 合同。先添加独立 SceneRuntime 验证，最后切换 `verify:all`。

实现起点：

```bash
git switch main
git pull --ff-only
git switch -c codex/scene-runtime-main-rebuild
```

如果 `main` 有未提交本地改动，先停下来确认，不要把当前 `react-rewrite/homepage-snap-timeline` 分支的代码直接 cherry-pick 进重做分支。

### 1.1 可行性预检结论

本计划落地前已用独立 worktree 验证 4 个前置面：

| 验证面 | 结论 | 计划约束 |
|---|---|---|
| `main` 真实基线 | PASS。`origin/main` at `a78b064`，`npm run build:page` 与 `npm run verify:all` 均通过 | 可以以 `main` 为重做基座；不得从当前问题分支继续接 runtime |
| 资产清单 | FLAG。静态扫描可做到 `0` missing，但必须覆盖 HTML include、JS template/string、`data-alpha-src`、`data-fallback-src`、CSS `url()` / `@import` | `homepage.assets.mjs` 不能只是手写 HTML 清单；`check-scene-runtime-assets.mjs` 必须做扫描交叉校验 |
| Scene 语义合同 | FLAG。16 个 top-level scene 可从 `main` 映射，但现有 build 仍是旧 transition/handoff 合同 | PR1 先冻结 `src/homepage/**` 合同；PR3 再做 `--scene-runtime` DOM shell |
| 纯 FSM 单测 | PASS + FLAG。无依赖 `node:test` 可覆盖核心状态流、reverse cancel、decay、touch inertia、media fail unlock | 先测纯状态机和输入合同；不得为了跑视觉而提前接 scroll / adapter |

硬闸门：

- Runtime / player agent 不得在 PR1 合同和资产 gate 通过前开始写视觉接入。
- `build-index --scene-runtime` 不得在合同仍允许 `philosophy`、`method-proof`、`pattern-top`、`pattern-bottom` 作为 top-level scene 时合并。
- 任一 runtime core PR 必须先用 fake clock / fake player / fake presentation 证明释放滚动和失败恢复，再接真实 media。

---

## 2. 不变量

这些规则一条都不能放松：

- `SceneRuntime` 是唯一调度者。
- `Presentation` 是唯一提交者：`currentSceneId`、copy final state、nav、hash、aria、focus、poster 都只能由它提交。
- `Player` / adapter 只画自己的视觉层，不写 target scene、target copy、nav、hash、aria。
- `.reveal` 不得控制 `data-entry-owner="scene-runtime"` 或等价 owned copy。
- 不移动真实 target DOM 做 adopt/restore；`handoff-receiver` 已 retired，这条保留。
- `ARMED` 只表示“边界后的 10vh intent 已经被锁存”，不是“画面已开始播放”。进入 `PLAYING` 前必须经过 `SNAP_LOCKING` 重新对齐并复核 from / to scene。
- `10vh` 是 intent 阈值，不是视觉 progress。
- `early-copy` 只在 `PLAYING` 内展示目标文案；`PLAY_COMPLETE` 后才进入 `PRESENTING`。
- 同一帧同一 layer 只能一个 owner；dev 先执行 recovery routine 再 fail-fast，production 执行 recovery routine，并以 `RELEASING({ reason: 'recovery' })` fail-open。
- 资源失败、`play()` reject、`ended` 丢失、resize 异常都必须释放滚动。
- Reduced motion 直接 present target，不长时间锁滚。

---

## 3. 状态机合同

最终状态机：

```txt
IDLE
  currentScene 已提交；reading scene 允许自然滚动。

ARMED
  ReadMonitor 已确认当前 reading / animation boundary 可触发。
  ScrollIntent 已累计到 10vh，并锁存 nextSegmentId。
  不读取 scrollY 驱动画面，不提交 target scene。

SNAP_LOCKING
  锁输入；对齐 viewport 到 from scene / animation scene 的安全播放位。
  复核 fromSceneId、toSceneId、nextSegmentId；复核失败执行 recovery routine 或回 IDLE。

PLAYING
  只有一个 activeSegmentId。
  visual progress 来自 fixed clock / media time / compound step。
  early-copy 只在这里发生，不跳转 PRESENTING。

PRESENTING
  唯一原子提交点：scene、copy final state、aria、nav、hash、focus、poster。

RELEASING
  清理 overlay/ghost/player；reset intent；释放滚动；cooldown 后回 IDLE。
```

公开状态顺序固定为：

```txt
IDLE -> ARMED -> SNAP_LOCKING -> PLAYING -> PRESENTING -> RELEASING -> IDLE
```

`RECOVERING` 不是公开状态。任一失败事件执行 recovery routine：

```txt
PLAYING_ERROR / SNAP_LOCK_FAILED / PLAYER_TIMEOUT / RESOURCE_FAILED
-> stop active player / timers / pending media
-> unlock scroll fail-open
-> Presentation.present(targetScene or lastSafeScene)
-> RELEASING({ reason: 'recovery', recoveryReason })
-> IDLE
```

公开 `RuntimeState.phase` 只允许：

```ts
type RuntimePhase =
  | 'IDLE'
  | 'ARMED'
  | 'SNAP_LOCKING'
  | 'PLAYING'
  | 'PRESENTING'
  | 'RELEASING';

type ReleaseReason =
  | 'normal'
  | 'cancelled'
  | 'recovery'
  | 'reduced-motion'
  | 'destroy';
```

这条顺序里的 `ARMED` 不是旧系统那种“各 adapter 自己判断该我接管画面了”。它只是 runtime 内的 intent latch：

- `ARMED` 可以记录 `source: wheel | touch | key`、`direction`、`distanceVh`、`nextSegmentId`。
- `ARMED` 不能播放、不能改 DOM、不能改 target copy、不能更新 hash。
- `SNAP_LOCKING` 是唯一允许锁滚和对齐 viewport 的状态。
- `PLAYING` 是唯一允许 visual player 开始自动播放的状态。

全局事件：

- `HASH_JUMP`：直接进入目标 presented 状态，不补播历史动画。
- `REDUCED_MOTION`：跳过 charge 与动画播放，直接 present target。
- `DESTROY`：停止 player、listener、timer、media、debug hooks。
- `RESIZE`：刷新 bounds；正在 `PLAYING` 时不重新决定目标，只刷新 commit 前 bounds。

禁止状态语义：

```txt
ARMED reads scrollY to drive visual progress
ARMED writes target copy / hash / nav
PLAYING + MEDIA_PROGRESS(0.8) -> PRESENTING
```

---

## 4. ScrollIntent 合同

从 `main` 重做时新建本模块；当前问题分支里的 `js/runtime/input-normalizer.js` 与 `js/runtime/charge-accumulator.js` 只能作为算法参考，不能作为 `main` 事实引用。

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
- 只在 `IDLE` 的 armed boundary 或 compound `awaitIntent()` 中累计输入；累计满 10vh 后进入 `ARMED`。
- 未满阈值停手要 decay，方向反转先抵消或 reset。
- 触发后 player 进入 fixed-time / media-time 自动播放；不得把 intent progress 继续绑定到视觉。
- reading 段内的自然滚动不进 `ARMED`；只有 ReadMonitor 判定读到底并进入 armed boundary 后，额外 10vh intent 才能锁存下一段。

---

## 5. ReadMonitor 合同

`ReadMonitor` 只管 reading scene 的 DOM 边界，不参与动画播放。

职责：

- 检测 reading scene enter / active / complete。
- 输出 reading progress / event 给 SceneRuntime debug；不直接写 nav、hash、focus、`currentSceneId` 或 copy state。
- 长阅读段读到底后，才交给 ScrollIntent 累计额外 `10vh`。
- `method-top -> method-bottom` 不使用 `distanceVh: 0`，改用 DOM 边界条件。

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
  FSM transitions IDLE -> ARMED with a latched nextSegmentId, then immediately SNAP_LOCKING.
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
-> Presentation.presentEarlyCopy({ targetScene: 'method-top' })
-> copy layer owner = Presentation
-> media layer remains MediaPlayer until PLAY_COMPLETE
```

---

## 7. Segment 类型

### `ink-transition`

- 当前 reading / animation scene 到达 armed boundary。
- 用户继续滚动 `10vh` 后进入 `ARMED -> SNAP_LOCKING -> PLAYING`，播放 ink。
- ink progress 由 clock 驱动，不由 scrollY 驱动。
- 完成后进入 `PRESENTING`，再释放滚动。
- 如果目标是 animation scene，转场期间该 animation 的 webm 不播放，只显示 poster / 首帧 / 静态合成层。转场完成 commit 到 animation scene 后，用户再次滚动 `10vh` 才播放 animation。

### `media-animation`

- 进入 animation scene 后只显示 poster / first frame。
- 用户继续滚动 `10vh` 后进入 `ARMED -> SNAP_LOCKING -> PLAYING`，再 `video.play()` 或 component clock 自动播放。
- `seek/currentTime` 只用于 reset、first frame、reduced-motion、恢复。
- AOD、Figure3、Crane 支持 `earlyCopyAt: 0.8`。

TTG / PH 不再把 exit ink 藏进 media player。它们都是普通 `media-animation`，后面的 `ttg-to-lab`、`ph-to-education` 是独立 `ink-transition`，各自需要一次新的 `10vh` intent。

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

### 8.1 统一语义命名

命名原则：

- scene id 描述用户看到的语义画面，不描述旧 DOM id。
- animation id 只给需要二次 `10vh` 才播放的动画 scene。
- copy/section alias 可以保留原业务名，但不抢 scene owner。
- `pattern-top / pattern-bottom` 不再作为最终名；第二幕拆成 `pattern` 与 `star-map` 更清楚。

| 最终 scene id | 语义 | main 来源 / alias |
|---|---|---|
| `hero` | 首页开场人物与山水层 | `#home` |
| `pattern` | 莲花 / 纹样展开场 | old `home-belief` pattern bloom |
| `star-map` | 星空 belief 场 | old `#belief` / `belief-star` |
| `aod-animation` | AOD 度量秩序动画场 | old `belief-method` AOD |
| `method-top` | 方法首屏观点 | old `.chapter-intro--method` |
| `method-bottom` | 方法五步阅读 | old `.method-flow` |
| `figure2-animation` | Figure2 远景 / 横拱 / proof compound | old `method-tooling__method-proof` |
| `brand` | 品牌宣称 | old `#brand` visual，copy 改入库 fixture |
| `figure3-animation` | Figure3 fabric/menu 动画场 | old `brand-services` |
| `services` | 服务 / 场景阅读 | old `#services` |
| `ttg-animation` | TTG structure field 动画场 | old `services-lab` |
| `lab` | lab reading | old `#lab` |
| `ph-animation` | PH learning sun 动画场 | old `lab-education` |
| `education` | 留学 / education reading | old `#education` |
| `crane-animation` | Crane forward motion 动画场 | old `philosophy-contact` visual |
| `contact` | 联系终点 | old `#contact` |

`main` 的 `philosophy` 不进 v1 top-level timeline。实现时保留源码文件，生产链路先不 include；后续若要恢复，新增 `education-to-philosophy` 与 `philosophy-to-crane` 两个 segment 即可。

`#philosophy` 是 `main` 的真实 legacy hash anchor。SceneRuntime v1 必须在 `homepage.aliases.mjs` 中显式映射：

```js
export const homepageAliases = {
  philosophy: {
    legacyHash: '#philosophy',
    mapsToScene: 'education',
    reason: 'philosophy removed from SceneRuntime v1 timeline'
  }
};
```

选择 `education` 而不是 `crane-animation`，是为了让旧链接进入稳定 reading scene；hash jump 不补播历史动画，也不落到 animation poster 造成语义突兀。

### 8.2 目标链路

目标 top-level scene 顺序：

```txt
hero
pattern
star-map
aod-animation
method-top
method-bottom
figure2-animation        (compound: cards / closing / ink-sweep 内部推进)
brand
figure3-animation
services
ttg-animation
lab
ph-animation
education
crane-animation
contact
```

目标 top-level segment 顺序：

| # | segment id | type | from -> to | completion |
|---:|---|---|---|---|
| 1 | `hero-to-pattern` | `ink-transition` | `hero -> pattern` | `present-next` |
| 2 | `pattern-to-star-map` | `ink-transition` | `pattern -> star-map` | `present-next` |
| 3 | `star-map-to-aod` | `ink-transition` | `star-map -> aod-animation` | `present-next` |
| 4 | `aod-play` | `media-animation` | `aod-animation -> method-top` | `present-next`, `earlyCopyAt: 0.8` |
| 5 | `method-read` | `text-read` | `method-top -> method-bottom` | `read-complete` |
| 6 | `method-bottom-to-figure2` | `ink-transition` | `method-bottom -> figure2-animation` | `present-next` |
| 7 | `figure2-compound-to-brand` | `compound-sequence` | `figure2-animation -> brand` | `present-next` |
| 8 | `brand-to-figure3` | `ink-transition` | `brand -> figure3-animation` | `present-next` |
| 9 | `figure3-play` | `media-animation` | `figure3-animation -> services` | `present-next`, `earlyCopyAt: 0.8` |
| 10 | `services-to-ttg` | `ink-transition` | `services -> ttg-animation` | `present-next` |
| 11 | `ttg-play` | `media-animation` | `ttg-animation -> ttg-animation` | `hold-current` |
| 12 | `ttg-to-lab` | `ink-transition` | `ttg-animation -> lab` | `present-next` |
| 13 | `lab-to-ph` | `ink-transition` | `lab -> ph-animation` | `present-next` |
| 14 | `ph-play` | `media-animation` | `ph-animation -> ph-animation` | `hold-current` |
| 15 | `ph-to-education` | `ink-transition` | `ph-animation -> education` | `present-next` |
| 16 | `education-to-crane` | `ink-transition` | `education -> crane-animation` | `present-next` |
| 17 | `crane-play` | `media-animation` | `crane-animation -> contact` | `present-next`, `earlyCopyAt: 0.8` |

Segment 类型只允许：

```txt
ink-transition
media-animation
text-read
compound-sequence
```

`method-read` 是显式 `text-read` segment，由 `ReadMonitor` 驱动，不锁滚、不调用 visual player、不使用 `distanceVh: 0` 动画。只有 `media-animation` 允许 `from === to`，且必须显式 `completion: 'hold-current'`；v1 只有 `ttg-play` 与 `ph-play` 允许 `hold-current`。

注意：现有 `figure2-proof-cards`、`figure2-proof-closing` 可保留为内容 refs / internal step ids，但不能再作为普通 top-level scenes / segments 参与全局 FSM。

### 8.3 用户体验顺序

```txt
hero
-> 墨滴中心扩散 -> pattern
-> 左侧旋转扩散 -> star-map
-> 下到上水平墨滴 -> aod-animation
-> 再滚 10vh -> AOD 动画播放，80% 时 method-top 文案提前入场
-> method-top
-> 普通阅读/滚动 -> method-bottom
-> 下到上水平墨滴 -> figure2-animation
-> Figure2 内部远景扩散
-> 保留前景模糊横拱 + proof cards
-> 保留横拱 + proof closing 整屏
-> 横拱和文案一起下到上水平墨滴 -> brand
-> 下到上水平墨滴 -> figure3-animation
-> 再滚 10vh -> Figure3 动画播放，80% 时 services 文案提前入场
-> services
-> 下到上水平墨滴 -> ttg-animation
-> 再滚 10vh -> TTG 动画播放
-> 上到下水平墨滴 -> lab
-> PH 太阳点放射墨滴 -> ph-animation
-> 再滚 10vh -> PH 动画播放
-> 上到下水平墨滴 -> education
-> 下到上水平墨滴 -> crane-animation
-> 再滚 10vh -> Crane 动画播放，80% 时 contact 文案提前入场
-> contact
```

---

### 8.4 `main` 视觉资源与合成基准

以下清单只基于 `main` tree。实现时 `src/homepage/homepage.assets.mjs` 必须覆盖 markup、JS、CSS 三类资源引用；不能只扫 HTML。

| scene / segment | `main` 文件路径 | `main` 资源 | 合成方式 | 迁移要求 |
|---|---|---|---|---|
| global loader / filters | `main:src/partials/loader.html`, `main:src/partials/svg-filters.html`, `main:js/effects/ink-text-reveal.js`, `main:js/main.js` | `assets/fonts/qiji-title-subset.ttf`, `assets/favicon.svg` | loader 是 canvas/WebGL ink text + DOM 文字；SVG filter 被 hero figure 使用 | 不把 loader 当静态文案；保留字体预载和 `figure-alpha-clean` filter |
| `hero` | `main:src/sections/hero.html`, `main:js/sections/hero.js`, `main:css/sections/hero-stage.css`, `main:js/effects/ink-scene-transition.js` | `assets/back1.png`, `assets/middle1.png`, `assets/figure1.webm`, `assets/figure-poster.jpg`, `assets/back2.png`, `assets/back1_depth.png`, `assets/middle1_depth.png` | 多层 DOM image/video；`middle1.png` 复用为近景 blur；depth map mask；DOM copy overlay；hero ink canvas | 保留层级、depth mask、figure video 首帧/segment reset；不要把 `#hero-webgl` 误当完整 WebGL hero |
| `hero-to-pattern` / `pattern` | `main:js/transitions/pattern-bloom-adapter.js`, `main:js/pattern-mirror-stage.js`, `main:js/effects/ink-scene-transition.js`, `main:css/sections/canvas-stage.css` | `assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png`, `assets/patterns/alpha-layers/pattern-layer-alpha-02.png`, `03.png`, `04.png`, `05.png`, `06.png`, `assets/back2.png` | 2D canvas 生成莲花/万花筒；两个 ink canvas 做 reveal / exit；belief copy 被 pinned overlay 接入 | 拆成 `pattern` scene 与 `pattern-to-star-map` segment；保留 `inkTextureReady`、canvas stage、中心扩散与左侧旋转扩散 |
| `star-map` | `main:src/sections/belief.html`, `main:js/sections/belief.js`, `main:js/effects/star-field-reveal.js`, `main:css/sections/canvas-stage.css` | `assets/back2.png` | 2D canvas 从 `back2.png` 生成星场/噪声高光；DOM 大段文案覆盖 | 它是 pattern exit 的目标纹理来源，不是普通背景图 |
| `aod-animation` | `main:js/transitions/homepage/aod-homepage-adapter.js`, `main:js/components/aod-transition.js`, `main:css/components/aod-transition.css`, `main:css/components/homepage-transitions.css` | `assets/aod_cloud-alpha.png`, `assets/aod_sun-alpha.png`, `assets/aod_figure-alpha-front-scrub.webm`, `assets/aod-paper-bg.png` | 云 PNG + 日 PNG + alpha webm + paper wash + bottom-up ink curtain + method DOM overlay | 转场进入时只显示 poster/首帧；二次 10vh 后播放；80% 只 `presentEarlyCopy(method-top)` |
| `method-top` / `method-bottom` | `main:src/sections/method.html`, `main:css/sections/canvas-stage.css`, `main:css/sections/source-copy.css` | 主要无 media；继承 `assets/aod-paper-bg.png` | DOM editorial copy；`method-field-law`、`method-cocreation`、`method-tooling` 是定位 anchors | 空 `homepage-scene` anchor 是定位契约，不能当无用 div 删除 |
| `figure2-animation` compound | `main:js/transitions/homepage/figure2-homepage-adapter.js`, `main:js/components/figure2-transition.js`, `main:css/figure2.css`, `main:js/effects/ink-scene-transition.js`, `main:src/sections/method.html` | `assets/figure2-cloud-source.png`, `figure2-front-white-source.png`, `figure2-front-color-source.png`, `figure2-middle-fresco-opaque-alpha.png`, `figure2-middle-window-mask.png`, `figure2-middle-depth.png`, `figure2-next-white.png`, `arch2b-alpha.png`, `arch2d-alpha.png`, `figure2a-alpha-auto.webm`, `figure2b-alpha-auto.webm`, `figure2a-reverse.mp4`, `figure2b-reverse.mp4`, related posters | 多层 fresco/arch PNG + mask + 两个 alpha webm + hidden figure mask canvas + WebGL ink scene + proof DOM overlay | 最复杂段；保留 VP9/Safari alpha fallback；proof cards / closing 改成 compound internal steps；不要让它们成为 top-level scenes |
| `brand` | `main:src/sections/brand.html`, `main:css/sections/canvas-stage.css` | 无 media | DOM copy grid | 视觉可复用，正文改入库 fixture `brand-135-136` |
| `figure3-animation` | `main:js/transitions/homepage/figure3-homepage-adapter.js`, `main:js/components/figure3-transition.js`, `main:css/components/figure3-transition.css` | `assets/figure3-alpha-scrub.webm?v=1280-q40`, `assets/figure3-alpha-poster.png` | 单 alpha webm + CSS backdrop/fill/visual bridge；无 shader | 二次 10vh 后播放；80% 只 `presentEarlyCopy(services)` |
| `services` | `main:src/sections/services.html`, `main:css/sections/canvas-stage.css` | 无 media | DOM list/copy | 长 reading scene，读到底后再 arm TTG |
| `ttg-animation` | `main:js/transitions/homepage/ttg-homepage-adapter.js`, `main:js/components/ttg-transition.js`, `main:css/ttg.css` | `assets/ttg_bg.png`, `ttg_middle-alpha.png`, `ttg_middle-original-overlay-alpha.png`, `ttg_front-original-overlay-alpha.png`, `ttg_front-alpha.png`, `ttg_figure-alpha-scrub.webm`, `ttg_figure-alpha-scrub-reverse.webm`, `ttg_figure-alpha-scrub-poster.png` | 多层图片 + forward/reverse alpha webm + CSS wash/parallax；无 shader | 新 runtime 只用 forward autoplay；reverse 资源保留作 reduced/recovery 或未来反向策略 |
| `lab` | `main:src/sections/lab.html`, `main:js/components/ink-keyword.js`, `main:css/components/ink-keyword.css` | 无 media | DOM copy；`data-ink-reveal` 默认 light CSS keyword | 只有 `data-ink-reveal="webgl"` 才创建 keyword canvas，不能默认加 WebGL |
| `ph-animation` | `main:js/transitions/homepage/ph-homepage-adapter.js`, `main:js/components/ph-transition.js`, `main:css/ph.css` | `assets/ph_background.png`, `assets/ph_front-alpha.png`, `assets/ph_figure-alpha-scrub.webm?v=allkey-1672-simple-key-20260621` | 背景图 + front PNG + alpha webm + CSS paper/sun/edge/texture | `lab-to-ph` 是太阳点放射墨滴；`ph-play` 是二次 10vh 后的 PH media |
| `education` | `main:src/sections/education.html`, `main:css/sections/canvas-stage.css` | 无 media | DOM copy | v1 读完后直接 `education-to-crane`，不进入 philosophy |
| `crane-animation` | `main:js/transitions/homepage/crane-homepage-adapter.js`, `main:js/components/crane-transition.js`, `main:css/crane.css` | `assets/crane1_cloud2-alpha.png`, `crane1_arch-alpha.png`, `crane1_cloud1-alpha.png`, `crane1_cloud-front2-alpha.png`, `crane-figure1-transition.webm`, `crane-figure2-transition.webm`, `assets/aod-paper-bg.png` | 多层 PNG + 两个 webm timeline + clip-path reveal + CSS paper/warmth/texture + contact DOM overlay | 从 `main` 的 `philosophy-contact` 视觉借壳，v1 改接 `education -> crane-animation`；80% 只 `presentEarlyCopy(contact)` |
| `contact` | `main:src/sections/contact.html`, `main:css/sections/canvas-stage.css` | `assets/middle1.png` 由 `.contact-endpoint::before` CSS 引用 | DOM copy + CSS decorative background image | 资产扫描必须覆盖 CSS 引用 |

`homepage.assets.mjs` 必须保留资源 query string 的语义，例如 `?v=1280-q40`、`?v=allkey-1672-simple-key-20260621`、`?v=ttg-figure-blue-v2`、`?v=ttg-front-image15-blend80-v1`、`?v=auto2`、`?v=middlemaskhard1`，除非对应文件名改成内容 hash。

资产 gate 必须按下面规则实现：

- 每个声明项保留 `rawUrl`；存在性校验使用 `rawUrl.split(/[?#]/)[0]`。
- 自动扫描 `src/index.template.html` 递归 include、`css/styles.css` 的 `@import` 图与 CSS `url()`、`js/main.js` 的 import/dynamic import 图、homepage adapters/components/effects 里的静态资源字符串。
- `src`、`poster`、`href`、`source src`、`data-alpha-src`、`data-fallback-src`、`setAttribute('src', ...)`、`new Image().src` 对应的静态候选必须被覆盖。
- `#fragment`、`mailto:`、`data:` 不作为本地资产；GSAP / ScrollTrigger / Lenis CDN 依赖单列 external allowlist，不放入 homepage visual assets。
- PR1 阶段 dynamic sink 必须被报告，不能静默跳过；允许 unresolved dynamic sink 以 warning 存在，但必须带文件位置、表达式、候选/allowlist 状态和理由。
- PR4 前，MVP route 会触达的 dynamic sink 必须全部追到静态候选或显式 allowlist，否则 fail。
- PR7 前，所有 v1 scene 使用路径里的 dynamic sink 都必须闭环，否则 fail。

### 8.5 逐节点 DOM / adapter 对照

| 目标节点 | `main` 来源 | 动作 |
|---|---|---|
| `hero` | `main:src/sections/hero.html`, `main:js/sections/hero.js` | 复用视觉层；移除 scroll scrub 作为 runtime 进度源 |
| `hero-to-pattern` | `main` 的 `home-belief` + `pattern-bloom-adapter` reveal 段 | 独立成中心扩散 ink segment |
| `pattern` | `main:js/pattern-mirror-stage.js` canvas stage | 成为可 present 的 visual scene |
| `pattern-to-star-map` | `pattern-bloom-adapter` second reveal / exit 段 | 独立成左侧旋转扩散 ink segment |
| `star-map` | `main:#belief` + `belief.js` star field | 改名，不再叫 `belief-star` |
| `star-map-to-aod` | `main` 的 `belief-method` host | 改为 bottom-up horizontal irregular ink；目标只到 `aod-animation` poster/首帧 |
| `aod-play` | `aod-homepage-adapter` + `aod-transition` | 移除 scroll scrub；二次 10vh 后 autoplay |
| `method-top` | `.chapter-intro--method` | early-copy target，由 Presentation 控制 |
| `method-bottom` | `.method-flow` | 长 reading；读到底后 arm Figure2 |
| `method-bottom-to-figure2` | `method-tooling__method-proof` 前置进入 | 改成 bottom-up ink 到 `figure2-animation` poster/static scene |
| `figure2-compound-to-brand` | `figure2-homepage-adapter`, `figure2-transition`, `.method-proof` | 四个 internal steps；cards/closing 不再 top-level |
| `brand-to-figure3` | `main:brand-services` | bottom-up ink 到 `figure3-animation` poster |
| `figure3-play` | `figure3-homepage-adapter` | 二次 10vh 后 autoplay；80% services early-copy |
| `services-to-ttg` | `main:services-lab` | bottom-up ink 到 `ttg-animation` poster |
| `ttg-play` | `ttg-homepage-adapter` | 二次 10vh 后 autoplay；完成后 `hold-current`，停留在 `ttg-animation` 等下一次 10vh |
| `ttg-to-lab` | 新 SceneRuntime ink segment，视觉方向取旧计划 | top-down horizontal irregular ink |
| `lab-to-ph` | `main:lab-education` PH entry | 太阳点放射墨滴到 `ph-animation` poster |
| `ph-play` | `ph-homepage-adapter` | 二次 10vh 后 autoplay；完成后 `hold-current`，停留在 `ph-animation` 等下一次 10vh |
| `ph-to-education` | 新 SceneRuntime ink segment，视觉方向取旧计划 | top-down horizontal irregular ink |
| `education-to-crane` | 复用 `main:philosophy-contact` crane visual，改 from scene | bottom-up horizontal irregular ink 到 `crane-animation` poster |
| `crane-play` | `crane-homepage-adapter` | 二次 10vh 后 autoplay；80% contact early-copy |

---

## 9. 文件落点

### 新增合同文件

- [ ] `src/homepage/homepage.scenes.mjs`
- [ ] `src/homepage/homepage.segments.mjs`
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
- [ ] `src/sections/*.html`：补齐 v1 的 16/16 top-level scene hosts 与 Figure2 internal step anchors。
- [ ] `css/sections/homepage-snap-heights.css`：升级为 SceneRuntime height/snap contract。
- [ ] `css/components/homepage-continuity.css`：隔离旧 timeline copy gate，最终移除生产依赖。

### 不继续扩展

- [ ] `js/transitions/homepage-transition-runtime.js`
- [ ] `js/transitions/homepage/section-presentation-controller.js`
- [ ] `js/transitions/homepage/handoff-receiver.js`

---

## 10. PR / Worktree 拆分

### PR1: Contract Freeze

目标：冻结合同，不改生产入口。

- [ ] 新建 `src/homepage/homepage.scenes.mjs`，只包含目标 top-level scenes 与 Figure2 internal steps。
- [ ] 新建 `src/homepage/homepage.segments.mjs`，只包含目标 top-level segments。
- [ ] 新建 `src/homepage/homepage.assets.mjs`，集中声明 visual assets 与 media ids。
- [ ] 新建 `src/homepage/homepage.aliases.mjs`，声明 hash / public section alias；`#philosophy` 必须 legacy-map 到 `education`。
- [ ] 新建 `src/homepage/homepage.schema.mjs`，校验 scene、segment、layer、content refs。
- [ ] 新建 `scripts/check-scene-runtime-contract.mjs`。
- [ ] 新建 `scripts/check-scene-runtime-assets.mjs`，校验 `homepage.assets.mjs` 中所有 image/video/font/CSS-referenced assets 在 `main` 基座存在。
- [ ] `check-scene-runtime-assets.mjs` 自动扫描 HTML/JS/CSS 引用并与 `homepage.assets.mjs` 交叉校验；本地文件 missing 必须 fail。
- [ ] `check-scene-runtime-assets.mjs` 对含 query/hash 的资源保留 `rawUrl`，剥离 query/hash 后验证真实文件存在。
- [ ] `check-scene-runtime-assets.mjs` 显式报告 external URL、dynamic sink、allowlist，不允许静默跳过；PR1 未闭环 dynamic sink 允许 warning。
- [ ] `homepage.scenes.mjs` 正好声明 16 个 top-level scene，顺序与本文 8.2 一致。
- [ ] `homepage.segments.mjs` 正好声明 17 个 top-level segment，顺序与本文 8.2 一致；from/to 串联有效。
- [ ] Segment 类型只允许 `ink-transition`、`media-animation`、`text-read`、`compound-sequence`。
- [ ] `method-read` 必须是显式 `text-read` segment，由 `ReadMonitor` 驱动，不锁滚、不调用 visual player、不使用 `distanceVh: 0` 动画。
- [ ] 所有 animation scene 必须有独立 `*-play` segment。
- [ ] 只有 `media-animation` segment 允许 `from === to`，且必须显式 `completion: 'hold-current'`；v1 只有 `ttg-play` 与 `ph-play` 允许 `hold-current`。
- [ ] AOD、Figure3、Crane 必须 `completion: 'present-next'`，且 `earlyCopyAt` 只能是 `0.8`。
- [ ] `pattern` / `star-map` 命名固定；禁止 `pattern-top`、`pattern-bottom`、`belief-star` 进入最终合同。
- [ ] v1 合同禁止 `philosophy` 作为 top-level scene；`education-to-crane` 直接接入 `crane-animation`。
- [ ] `method-proof`、`figure2-proof-cards`、`figure2-proof-closing` 只能作为 content ref / compound internal step，不得作为 top-level scene。
- [ ] `earlyCopyAt: 0.8` 只允许出现在 `aod-play`、`figure3-play`、`crane-play`。
- [ ] 禁止合同中出现旧字段：`handoff`、`sourceOut`、`targetIn`、`commitAt`、`presentAt`、`cleanupAt`、`data-entry-owner="timeline"`。
- [ ] 验证 Figure2 只有一个 top-level compound segment。

通过命令：

```bash
node scripts/check-scene-runtime-contract.mjs
node scripts/check-scene-runtime-assets.mjs
npm run verify:section-transitions
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
- [ ] 纯 FSM 检查允许使用 `node:test`，但不得引入新测试框架或浏览器依赖。
- [ ] 状态机测试必须注入 fake clock、fake player、fake presentation、fake scroll lock；不接 DOM、canvas、video 元素。
- [ ] 覆盖 `IDLE -> ARMED -> SNAP_LOCKING -> PLAYING -> PRESENTING -> RELEASING -> IDLE`。
- [ ] `check-scene-state-machine.mjs` 必须断言 public `RuntimeState.phase` 只允许 `IDLE` / `ARMED` / `SNAP_LOCKING` / `PLAYING` / `PRESENTING` / `RELEASING`；recovery 只能作为 routine、`recoveryReason` 或 release reason 暴露。
- [ ] 覆盖反向滚动取消、未满 `10vh` decay、touch inertia grace 内不误触发。
- [ ] 覆盖 `play()` reject、media `ended` 丢失 / timeout、resource fail 均释放滚动，执行 recovery routine，并进入 `RELEASING({ reason: 'recovery' })`。
- [ ] `ReadMonitor` 的 DOM bounds 先用 fake bounds 测几何合同；真实 viewport 手感放到 PR4 验收。

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
- [ ] 补齐 scene DOM map：top-level scene 16/16，Figure2 internal steps 单独标为 `data-compound-step-id`。
- [ ] SceneRuntime build artifact 不 include `src/sections/philosophy.html`，但源码文件保留。
- [ ] `method-field-law`、`method-cocreation`、`method-tooling` 只能作为 refs / anchors，不能在 artifact 中抢 top-level scene。
- [ ] `pattern` scene host 与 `star-map` scene host 都必须能被 build-time checker 静态定位。
- [ ] `js/ui/reveal.js` 用统一 `isSceneRuntimeOwned()` / `getRevealItems()` filter 跳过 SceneRuntime-owned copy。
- [ ] `initVanillaReveal()`、`initGsapTextAndUI()`、`setRevealPresentedWithin()`、`suppressRevealOnceWithin()`、`holdRevealWithin()`、`releaseRevealWithin()` 都必须走统一 reveal filter；禁止直接 `querySelectorAll('.reveal')`、`gsap.set('.reveal')`、`gsap.utils.toArray('.reveal')` 操作 owned copy。
- [ ] `css/sections/homepage-snap-heights.css` 明确 animation scene `100dvh`，reading scene `min-height:100dvh`。
- [ ] 新建 `scripts/check-scene-dom-shell.mjs`。
- [ ] 新建 `scripts/check-reveal-ownership.mjs`。
- [ ] 新建 `scripts/check-hash-entry.mjs`，覆盖 `#method -> method-top/method-bottom`、`#services -> services`、`#education -> education`、`#contact -> contact`、`#philosophy -> education`；hash jump 不空白、不补播历史动画、不重新引入 `philosophy` top-level scene。
- [ ] 新建 `scripts/check-no-legacy-homepage-artifact.mjs`，只检查 SceneRuntime build artifact 没有旧 attrs / 旧 transition host；不要在 PR3 宣称“旧 runtime 没被加载”。

通过命令：

```bash
node scripts/check-scene-dom-shell.mjs
node scripts/check-reveal-ownership.mjs
node scripts/check-hash-entry.mjs
node scripts/check-no-legacy-homepage-artifact.mjs
```

### PR4: MVP Vertical Slice

目标：打通 `hero -> pattern -> star-map -> aod-animation -> method-top -> method-bottom`。

- [ ] `js/main.js` 增加 `?sceneRuntime=1` 入口。
- [ ] `js/main.js` 改为动态互斥 import：`?sceneRuntime=1` 只动态 import `./scenes/runtime/SceneRuntime.js`，legacy/default 只动态 import `./transitions/homepage-transition-runtime.js`。
- [ ] `?sceneRuntime=1` 与 `?legacyTimeline=1` 不得同时启动；双启动必须 fail-fast。
- [ ] 新建或扩展入口检查：`?sceneRuntime=1` 路径不能通过静态 import graph 拉到 `homepage-transition-runtime.js` / `section-presentation-controller.js`。
- [ ] `js/scenes/runtime/SceneRuntime.js` 接合同、DOM shell、core modules。
- [ ] `js/scenes/players/ink-transition-player.js` 支持 radial center、rotating left、horizontal irregular。
- [ ] `js/scenes/players/aod-player.js` 支持 autoplay、poster、ready timeout、ended grace。
- [ ] `Presentation.presentEarlyCopy()` 支持 `aod-animation -> method-top` 的 80% copy。
- [ ] `ReadMonitor` 支持 `method-top` 与 `method-bottom`。
- [ ] 新建 `scripts/check-scene-runtime-mvp-route.mjs`。
- [ ] 新建 `scripts/check-media-poster-gate.mjs`。
- [ ] 新建 `scripts/check-text-read-segment.mjs`。
- [ ] 新建 `scripts/check-aod-player-assets.mjs`，校验 AOD 必需资源与 poster/first-frame gate。
- [ ] MVP route 会触达的 dynamic sink 必须全部解析到静态候选或显式 allowlist；未闭环 fail。
- [ ] 完成 MVP route 手感验收：trackpad inertia、mouse wheel、keyboard、touch / mobile viewport、未达阈值 decay、reverse cancel、media fail unlock。

通过命令：

```bash
node scripts/check-scene-runtime-mvp-route.mjs
node scripts/check-media-poster-gate.mjs
node scripts/check-text-read-segment.mjs
node scripts/check-aod-player-assets.mjs
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

目标：打通 `brand -> figure3 -> services -> ttg -> lab -> ph -> education -> crane -> contact`。

- [ ] `brand` 文案切到 `brand-135-136`，旧双卡仅作为视觉参考。
- [ ] `figure3-player` 支持 `figure3-animation -> services` early-copy。
- [ ] `ttg-player` 支持 media autoplay；`ttg-to-lab` 由独立 ink segment 执行。
- [ ] `ph-player` 支持 media autoplay；`lab-to-ph` 与 `ph-to-education` 由独立 ink segment 执行。
- [ ] `crane-player` 支持 `crane-animation -> contact` early-copy。
- [ ] 新建 `scripts/check-middle-tail-route.mjs`。
- [ ] 新建 `scripts/check-media-play-gates.mjs`。
- [ ] 新建 `scripts/check-early-copy-invariants.mjs`。

通过命令：

```bash
node scripts/check-middle-tail-route.mjs
node scripts/check-media-play-gates.mjs
node scripts/check-early-copy-invariants.mjs
```

### PR7: Production Switch

目标：默认启用 SceneRuntime，旧 timeline/handoff 从生产路径退出。

- [ ] `js/main.js` 默认启用 SceneRuntime。
- [ ] `js/main.js` 支持 `?legacyTimeline=1` 回滚入口；如果当前 `index.html` 已移除旧 attrs，则跳转或加载 legacy fallback artifact。
- [ ] 生产默认路径不得静态 import 或动态 import 旧 `homepage-transition-runtime.js` / `section-presentation-controller.js`；只有 `?legacyTimeline=1` fallback 可以加载旧 runtime。
- [ ] `scripts/build-index.mjs` 默认使用 SceneRuntime build mode。
- [ ] `scripts/build-index.mjs` 在 rollout 期保留可访问的 legacy fallback artifact，例如 `index-legacy.html` 或等价 legacy route。
- [ ] `package.json` 新增 `verify:scene-runtime`，再把它纳入 `verify:all`。
- [ ] 生产 `index.html` 不含旧 runtime attrs。
- [ ] 所有 v1 scene 使用路径里的 dynamic sink 必须全部解析到静态候选或显式 allowlist；未闭环 fail。
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
| `codex/scene-runtime-main-integration` | `package.json`、`scripts/build-index.mjs`、`js/main.js`、最终 verify aggregation | 不直接写 visual players |
| `codex/scene-runtime-main-core` | `js/scenes/runtime/**`、runtime checks | 不改 `src/sections/**` |
| `codex/scene-runtime-main-dom` | `src/index.template.html`、`src/sections/**`、`css/sections/**`、reveal ownership checks | 不改 runtime core |
| `codex/scene-runtime-main-media` | ink/media/aod/figure3/ttg/ph/crane players | 不改 Figure2 compound |
| `codex/scene-runtime-main-figure2` | `js/scenes/players/figure2-compound-player.js`、Figure2 checks、copy refs | 不改 global state machine |

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

PR2 与 PR3 可并行；PR4 依赖 PR2+PR3；PR5 与 PR6 在 PR4 后可并行，但最终由 `codex/scene-runtime-main-integration` 统一接入。

---

## 12. 验证矩阵

`main` 当前基线命令：

```bash
git switch main
git pull --ff-only
npm run build:page
npm run verify:all
npm run verify:copy
npm run verify:ink-modules
npm run verify:scroll-modules
npm run verify:section-transitions
npm run verify:transition-runtime
npm run verify:homepage-transitions
npm run verify:handoff-ownership
```

`verify:all` 在 PR7 前仍代表旧首页合同，只证明基座健康，不证明 SceneRuntime 正确。

SceneRuntime 新门禁：

```bash
node scripts/check-scene-runtime-contract.mjs
node scripts/check-scene-runtime-assets.mjs
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
node scripts/check-media-play-gates.mjs
node scripts/check-early-copy-invariants.mjs
```

最终生产门禁：

```bash
npm run build:page
npm run verify:scene-runtime
npm run verify:all
node scripts/check-legacy-runtime-fallback.mjs
```

注意：`main` 的 `npm run build:page` 会写 `index.html`。只在对应 PR 允许生成文件差异时运行，运行后必须检查：

```bash
git diff -- index.html
```

---

## 13. Definition of Done

完成条件：

- [ ] `?sceneRuntime=1` 能跑完整目标链路。
- [ ] 生产默认入口启用 SceneRuntime。
- [ ] 实现分支从 `main` 创建；没有把 `react-rewrite/homepage-snap-timeline` 的运行时代码直接搬入。
- [ ] `homepage.assets.mjs` 覆盖 `main` 中所有被 v1 scene 使用的 image/video/font/CSS assets，且资源缺失会在 verify 阶段失败。
- [ ] `homepage.assets.mjs` 对 query-bearing assets 保留 `rawUrl`，同时验证 query 前真实文件存在。
- [ ] SceneRuntime v1 生产 artifact 不 include `philosophy` top-level scene；`src/sections/philosophy.html` 作为源码保留。
- [ ] `index.html` 不含旧 `data-transition-*`、`data-handoff-*`、`data-target-entry-*`、`data-scene-copy`、`data-scene-target`。
- [ ] 生产默认路径不加载 `homepage-transition-runtime.js`、`section-presentation-controller.js`；只有 `?legacyTimeline=1` fallback 可以加载旧 runtime。
- [ ] Player 没有直接写 target copy / nav / hash / aria。
- [ ] `.reveal` 不控制 SceneRuntime-owned copy。
- [ ] 只有 AOD / Figure3 / Crane 允许 `earlyCopyAt: 0.8`；80% 文案入场不会提前 commit scene。
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
