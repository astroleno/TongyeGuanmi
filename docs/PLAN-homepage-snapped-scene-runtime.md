# Homepage Snapped Scene Runtime 落地文档

日期：2026-06-29

## 目标

重做首页时间轴与播放控制，但不重做视觉资产。`main` 只作为视觉验收基准，不作为时间轴基准。

最终页面由一组满屏 `scene` 和 `section` 构成。动画/转场都先进入满屏 snapped 状态，用户继续滚动约 `10vh` 后才触发自动播放。触发后 runtime 锁定 snap，自动播放转场或动画，完成后释放滚动。纯文案阅读段只把入口/出口作为 snapped 边界，不把段内阅读变成自动播放。

## 硬性契约

- 所有动画 scene 满屏 snapped。
- 所有内容 section 是满屏 snapped 的边界单元；短阅读段 `min-height:100dvh`，长阅读段允许自然撑高。
- 每个动画播放前，都必须先进入该动画的满屏 snapped 状态，再滚动 `10vh` 触发。
- 转场播放前，也必须先进入对应满屏 snapped 状态，再滚动 `10vh` 触发。
- 触发后锁定滚动；播放完成、文案完成入场或进入可恢复失败态后释放。
- 纯文案阅读可以自然滚动，不需要 `10vh charge`；长阅读段滚出段底才 arm 下一个动画/转场。
- webm 动画以自动播放为主，不用 scroll scrub，不用 seek 作为主驱动。

### 满屏契约的实测现状与超长段策略（必读，原文档缺）

实测核对：**当前没有任何 section 是 100vh**。
- 转场 host：`css/components/homepage-transitions.css:39-40` 是 `calc(100dvh + --extra-snap-height)`，且 `--extra-snap-height` 由 JS 按 `stageHold/postScroll` 注入、再叠 `--transition-seam-bleed`（行 53-88），**设计上就大于一屏**。
- 内容段：`canvas-section` 在 `css/sections/canvas-stage.css` **没有任何 height/min-height 规则**，纯 `padding-block` 内容驱动（只有 `--method` 有 `min-height:96svh`）。

所以「满屏 snapped」不是「现状已满足、只需锁 snap」，而是要**主动重写高度契约**。超长内容段（method-lower 五卡 / services 服务网格 / 长 brand）塞不进一屏，按下面分类处理，不能一刀切 `height:100vh`：

| 段类型 | 高度策略 | snap 行为 |
|---|---|---|
| animation scene（aod/figure2/figure3/ttg/ph/crane）| 固定 `100dvh` | 顶部对齐 snap，10vh 触发播放 |
| reading section ≤ 1 屏 | `min-height:100dvh` | 顶部对齐 snap，立即释放自然滚动 |
| reading section > 1 屏（method-lower/services 等）| `min-height:100dvh`，内容自然撑高 | 顶部对齐 snap，释放后自然滚到段底，**滚出段底才 arm 下一个转场**（避免长段中途误触发）|

实现倾向：**用 JS-snap（程序滚到顶部对齐）而非原生 `scroll-snap-type: mandatory`**。理由（实测）：现仓库全局无 `scroll-snap-type` 容器，现有 `scroll-snap-align` 是死代码；且 Lenis 平滑滚动 + 原生 mandatory snap 会互相抢位。JS-snap 与现有 `lockScroll/scrollToY` 基础设施一致，可控性更高。

JS-snap ADR/fallback（Phase 1 必须落文档和测试）：

- Lenis 不可用：退回 `window.scrollTo({ top, behavior: 'auto' })`，仍由 runtime 管锁滚和状态机。
- hash/deep link：直接 snap 到目标 scene 的 presented 状态；不自动补播前序转场。
- resize / orientationchange / `visualViewport` 变化：重新计算 scene top、`100dvh/svh`、PH sun center 映射；如果正在 Playing，播放继续，commit 前刷新目标 bounds。
- 移动端地址栏伸缩：以 `dvh` 作为动画 scene 高度，关键内部安全区用 `svh`/`env(safe-area-inset-*)` 兜底。
- `prefers-reduced-motion`：跳过 charge 和动画播放，直接 present target；仍保留 snapped 边界和内容顺序。

- `seek/currentTime` 只允许用于 reset、首帧准备、reduced-motion 或异常恢复，不允许每帧用 progress 驱动。
- AOD、Figure3、Crane 的文案在动画剩余 20% 时入场；动画不提前消失，文案与动画互不抢进度。
- 其他文案按转场入场。

## 视觉验收基准

这些视觉段以 `main` 当前实现为验收基准，迁移时保留 DOM 层级、CSS 变量、资源和多图层布局：

| 视觉段 | 基准 |
|---|---|
| hero | `src/sections/hero.html`、`js/sections/hero.js`、`css/sections/hero-stage.css`、`assets/back1.png`、`assets/middle1.png`、`assets/figure1.webm` |
| pattern | `js/transitions/pattern-bloom-adapter.js`、`js/pattern-mirror-stage.js`、`assets/patterns/**` |
| belief-star | `src/sections/belief.html`、`js/sections/belief.js`、`assets/back2.png` |
| aod | `js/transitions/homepage/aod-homepage-adapter.js`、`js/components/aod-transition.js`、`css/components/aod-transition.css` |
| figure2 | `js/transitions/homepage/figure2-homepage-adapter.js`、`js/components/figure2-transition.js`、`css/figure2.css` |
| figure3 | `js/transitions/homepage/figure3-homepage-adapter.js`、`js/components/figure3-transition.js`、`css/components/figure3-transition.css` |
| ttg | `js/transitions/homepage/ttg-homepage-adapter.js`、`js/components/ttg-transition.js`、`css/ttg.css` |
| ph | `js/transitions/homepage/ph-homepage-adapter.js`、`js/components/ph-transition.js`、`css/ph.css`、`assets/ph_background.png` |
| crane | `js/transitions/homepage/crane-homepage-adapter.js`、`js/components/crane-transition.js`、`css/crane.css` |

不能照搬这些文件里的旧 ScrollTrigger、旧 progress window、旧 `sourceOut/targetIn` 时间假设。它们只提供视觉结构和渲染结果。

## 顶栏模糊

顶栏使用 `.worktrees/homepage-master-observer-runtime` 分支里的渐进式模糊效果作为基准，而不是根目录当前较弱版本。

基准文件：

- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/homepage-master-observer-runtime/src/partials/nav.html`
- `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/homepage-master-observer-runtime/css/components/scroll-edge-blur-nav.css`

迁移要求：

- 保留 `.site-nav.has-scroll-edge-blur` 与 `.scroll-edge-blur` 作为相邻 sibling 的结构。
- 保留 7 层 progressive backdrop blur：`2px / 5px / 10px / 18px / 32px / 54px / 84px`。
- 保留 light tone 变量：`--scroll-edge-layer-wash`、`--scroll-edge-tint-soft`、`--scroll-edge-tint-strong`。
- 高度改为 worktree 基准的 `1.1` 倍。worktree 当前为 `calc(var(--nav-h) * 2 + env(safe-area-inset-top, 0px))`，目标为：

```css
--scroll-edge-blur-height: calc(var(--nav-h) * 2.2 + env(safe-area-inset-top, 0px));
height: var(--scroll-edge-blur-height);
```

这里的 `1.1` 指 progressive blur overlay 的覆盖高度，不改变导航按钮本身的视觉尺寸，除非后续单独指定 nav 自身也要放大。

## 内容边界

### Method

按用户最新口径：

- `method-upper`：使用 `/Users/aitoshuu/Downloads/tongyeme 2/index.html` 第 77 行的大段观点文案，迁移后必须入库，不能让 runtime/校验脚本依赖 Downloads 路径。
- `method-lower`：使用当前 `main` 里的 method 视觉和五步内容。

当前源码把第 77 行同类文案放在 `belief`，这是现状，不作为最终边界约束。

### Figure2 Proof 与 Brand

`/Users/aitoshuu/Downloads/tongyeme 2/index.html` 只作为本次人工迁移参考，不作为长期数据源。落地前新增仓库内 copy fixture，例如：

- `src/copy/homepage-reference.mjs`
- 或 `src/copy/homepage-reference.json`

入库后静态脚本只读仓库内 fixture，检查：

- 第 77 行观点文案只归 `method-upper`。
- 122-126 proof cards 只归 `figure2-proof-cards`。
- 128 closing 只归 `figure2-proof-closing`。
- 135-136 品牌宣称只归 `brand`。
- `brand` 与 `philosophy` 是不同 scene，不共享同一个 DOM 节点。

## 逐节点存在性与拆分动作对照（2026-06-29 只读核对 root main 全 DOM + 组件）

核心结论：**视觉组件 100% 都存在，不需要「拆组件」；真正的工作量是「拆时序边界 / 改 DOM 归属 / 删并节点」。** 把"组件缺失"和"时序未拆"分清，避免重复造轮子。

### 组件层：全部存在，原样可复用

`js/components/` 实测齐全：`aod-transition.js` / `figure2-transition.js` / `figure3-transition.js` / `ttg-transition.js` / `ph-transition.js` / `crane-transition.js`。pattern-bloom 在 `pattern-bloom-adapter.js` + `pattern-mirror-stage.js`。

两个关键能力实测确认（决定「不用拆组件」）：
- **pattern-bloom 本就是上/下两段**：adapter 内已有 `REVEAL_END`(entryInk 中心扩散) + `SECOND_REVEAL`/`secondReveal`/`topScene`/`exitInk`/`beliefPin`(第二段左侧旋转扩散收束到 belief)。pattern-top→pattern-bottom 是**拆时序边界**，不是拆组件。
- **figure2 横拱/远景能力本就具备**：`figure2-transition.js` 已有 `nearArch`(前景横拱层)、`cameraProgress`(远景扩散)、`Foreground` 概念。你要的「远景扩散→保留前景模糊横拱」组件渲染力足够，缺的只是「播到远景扩散就停、横拱静止」的阶段接口。

### 逐节点对照

| 你的链路节点 | root main 现状 | 判定与动作 |
|---|---|---|
| hero | `#home` | ✅ 原样 |
| 中心扩散→pattern-top | pattern-bloom `entryInk` | ✅ 已是独立首段 |
| 左侧旋转扩散→pattern-bottom | 同组件 `exitInk`+`secondReveal`+`topScene` | ⚠️ **拆时序**：组件已支持两段，manifest 切成两个 snap 边界 |
| 下→上墨滴→aod-animation | `belief-method` host, module=aod | ✅ 组件在（注意 main 里它 from=belief） |
| 动画80%→method-top | `#method` 整段的 chapter-intro 引子 | ⚠️ **拆边界**：method 现在是一整个 section，需切成 top（引子，动画80%入场）|
| 普通滚动→method-bottom | `#method` 的五步 process-list | ⚠️ **拆边界**：五步归 method-bottom，自然滚动；DOM 可不动，靠 manifest 切分 |
| 下→上墨滴→figure2-animation | `method-tooling__method-proof` host, module=figure2 | ⚠️ **拆阶段**：见下「figure2 四子阶段」|
| figure2 远景扩散 | `cameraProgress` 第一阶段 | ⚠️ 需新增「播到远景停、横拱保留」阶段接口 |
| 保留横拱+三卡 | `.method-proof` 三卡（行137-139）| ⚠️ **改 DOM 归属+重排**：见下 |
| 保留横拱+「第四种」整屏 | closing 句（行134）| ⚠️ **顺序是反的**：main 里 closing 在三卡之上，需重排 |
| 横拱+文案一起墨滴扫走→brand | figure2 transition 末段 | ✅ 墨滴段在，接 brand |
| brand | `#brand`（行146-160）| ⚠️ **改内容源**：保留 main 的视觉气质，但文案改为入库 fixture 中的 Downloads 135-136 品牌宣称 |
| 下→上墨滴→figure3-animation→services | `brand-services` host + `#services` | ✅ 组件+section 在 |
| 下→上墨滴→ttg-animation | `services-lab` host, module=ttg | ✅ |
| 上→下墨滴→lab | `#lab` | ✅ |
| ph 太阳放射→ph-animation | `lab-education` host, module=ph, variant=`learning-sun` | ✅ 组件在，放射靠 shader 接线（Phase 2.5）|
| 上→下墨滴→education | `#education` | ✅ |
| education→philosophy→下→上墨滴→crane-animation→contact | `education-philosophy` + `philosophy-contact` host, module=crane + `#contact` | ✅ **保留 philosophy 独立段**：brand 与 philosophy 分开；crane 仍按动画剩余 20% 让 contact 入场 |

### figure2 四子阶段（从现状「两段 stage-stops」拆开）

现状 `data-transition-stage-stops="0.72"` + `stage-play-ms="2600,1500"` 是一刀切两段。需包一层阶段控制器（**不重写组件**），拆成四个 armed 子阶段：

```text
1 远景扩散      cameraProgress 推到远景展开，nearArch 横拱定型
2 横拱保留+三卡  nearArch 静止模糊，proof 三卡入场（参考 hero 文案入场）
3 横拱保留+整屏  nearArch 静止模糊，「同野观幂做第四种」整屏（参考 hero）
4 横拱+文案墨滴  nearArch + 文案一起被下→上水平墨滴扫走 -> brand
```

### 已收敛的内容决策

1. **brand 文案同源**：brand 使用入库 fixture 中的 Downloads 135-136「同人于野，观复杂之幂」品牌宣称；root main 现有「同野/观幂双卡」不再作为 brand 正文来源，只可作为视觉参考。
2. **philosophy 去留**：保留为独立 reading section，位置在 `education` 之后、`crane-animation` 之前。这样与当前 `src/section-manifest.mjs` 的 `education-philosophy` / `philosophy-contact` 关系一致，也避免 brand 与 philosophy 混成同一段。

---



```text
figure2 stage2 完成
-> 保留前景模糊横拱
-> 出现 122-126 proof cards
-> 出现 128 closing，全屏
-> 前景横拱 + 文案一起被下到上水平不规则墨滴扫走
-> 出现 135-136 brand
```

### Brand 与 Philosophy

本计划选择 **Brand 与 Philosophy 分开**：

- `brand`：承接 Figure2，使用 135-136 品牌宣称。
- `philosophy`：保留为后段独立 reading section，位于 `education` 与 `crane-animation` 之间。
- `crane-animation`：从 `philosophy` 后的 bottom-up 水平不规则墨滴进入；动画剩余 20% 时 `contact` 文案入场。

如果后续产品决策要移除 Philosophy，必须作为一次显式 manifest 变更处理，不能在实现时顺手跳过。

## 目标 Scene 链路

下面是目标时间轴。每一行都是一个满屏边界；动画/转场需进入该边界后滚动 `10vh` 才触发，reading 段只 snap 入口/出口并释放自然阅读。

```text
hero
-> center-radial ink transition
pattern-bloom                       (莲花，pattern-mirror-stage 图层)
-> left-rotating-radial ink transition
belief-star                         (星空图 back2.png，非第二个 pattern 态)
-> bottom-up horizontal irregular ink transition
aod-animation
-> animation last-20% method copy enters
method-upper
method-lower
-> bottom-up horizontal irregular ink transition
figure2-animation
figure2-proof-cards
figure2-proof-closing
-> bottom-up horizontal irregular ink transition
brand
-> bottom-up horizontal irregular ink transition
figure3-animation
-> animation last-20% services copy enters
services
-> bottom-up horizontal irregular ink transition
ttg-animation
-> top-down horizontal irregular ink transition
lab
-> ph sunburst radial ink transition
ph-animation
-> top-down horizontal irregular ink transition
education
philosophy                         (reading snap handoff; no ink autoplay by default)
-> bottom-up horizontal irregular ink transition
crane-animation
-> animation last-20% contact copy enters
contact
```

## Runtime 设计

当前 runtime 有锁滚动和自动推进雏形，但缺少显式 `SnappedArmed` 状态。新的 runtime 应改成显式状态机：

```text
FreeScroll
-> SnapAligning
-> SnappedArmed        (累计 ±10vh delta；正向→Playing 正放，反向→上一幕 playReverse)
-> TriggeredPlayback
-> Playing
-> Completing
-> ReleaseCooldown
-> FreeScroll
```

`ReadingScroll` 是旁路状态：纯文案 section 入口 snap 后释放自然滚动，不进入播放锁定。超长阅读段须**滚出段底后**才 arm 下一个转场（防止长段中途误触发）。

核心规则：

- `SnapAligning`：程序滚到 scene/block 顶部，让它满屏。
- `SnappedArmed`：锁住页面位置，只累计 wheel/touch/keyboard 输入 delta。
- `TriggeredPlayback`：累计 delta 达到 `10vh`。
- `Playing`：转场用时间驱动，动画用 `video.play()` / `ended` / `requestVideoFrameCallback` / `timeupdate` 驱动。
- `Completing`：等待动画完成、文案完成入场、target scene committed。
- `ReleaseCooldown`：短暂冷却，避免一次滚动连续触发多个 scene。

### 失败恢复与解锁

任何播放块都不能只有“成功 ended 才释放”一条路。每个 block 必须声明并实现最大等待时间：

- `mediaReadyTimeoutMs`：等待 `loadedmetadata/canplay` 的最大时间。
- `mediaPlayTimeoutMs`：`video.play()` resolve、首帧可见或 `requestVideoFrameCallback` 首次回调的最大时间。
- `mediaEndTimeoutMs`：按资源时长 + 安全余量计算；超过后 present 终态。
- `textureReadyTimeoutMs`：下一幕纹理/DOM projection 准备最大时间。

失败路径统一：

```text
Playing/Completing
-> RecoverPresentTarget      (显示目标 scene 终态；隐藏半成品 overlay)
-> ReleaseCooldown
-> FreeScroll
```

`play()` reject、404、metadata 缺失、`ended` 不触发、纹理非空检测失败，都进入这条路径。失败态需要打日志和可观测事件，但不能阻塞用户继续滚动。

### SnappedArmed 输入手感规格（必做，原文档缺 —— 这正是「播放效果不理想」的高发区）

实测：runtime 当前**没有任何 delta 累计/charge 机制**（grep `deltaY/accumulat/charge/armed` 零命中），必须新建。10vh 这个数字本身不难，难在「锁住页面后用户继续滚」的手感，要规格化否则会做成「卡死感」：

- **输入归一化**：不同来源 delta 量纲不同，必须归一到统一「charge 进度 0→1」：
  - wheel（鼠标滚轮）：`deltaMode` 区分 pixel/line/page，line×16px、page×viewportH 折算。
  - 触控板惯性滚动：会瞬间灌入大量 delta，需**单帧 delta 上限钳制**（如每帧 ≤ 0.25 屏当量），防止惯性一甩直接冲满 10vh 过冲。
  - touchmove：累计手指位移 px。
  - 键盘：PageDown/Space = 一次性 +charge 的离散步进（如 0.5 屏当量），ArrowDown 更小步进。
- **charge 可视反馈固定 contract**：armed 期间使用全局 `.snap-charge-indicator`，不出现解释性文字。默认形态是底部居中的 2px 细线 + 当前墨滴 origin 的极轻微 ink halo；由 runtime 写入 CSS 变量 `--snap-charge-progress: 0..1`、`--snap-charge-direction: 1|-1`、`--snap-charge-origin-x/y`。未达阈值停手时进度随 decay 回落；达 1.0 后 indicator 淡出并交给正式转场。screen reader 使用 visually-hidden live region 暴露 “transition armed / playing / complete” 状态；`prefers-reduced-motion` 下不显示 halo，只保留状态跳转。
- **回滞与释放**：charge 达 1.0 才 `TriggeredPlayback`；未达阈值用户停手，charge 应缓慢回落（decay）而非永久停留，避免「滚一半卡住」。
- **reduced-motion**：跳过 charge，进入即直接 present 终态（沿用 `jump-to-presented`）。

### 反向播放（原文档状态机缺，但用户明确要「正向反向都可以」）

状态机不是单向环，`SnappedArmed` 要同时监听正/负 delta：

- 正向 charge 满 → `playForward()`。
- 在一个 scene 顶部**反向** charge 满 → 回退到上一个 scene 的终态并 `playReverse()`（有反向 webm 资源用资源；无则视觉降级，**禁止逐帧 seek 反向模拟**，见 Adapter 约束）。
- `ReleaseCooldown` 对正/反向都生效，防止一次惯性来回抖触发。

Phase 1 必须生成 `reversePlaybackMatrix`，逐 scene 声明反向策略。初始盘点如下：

| scene/block | 反向资源现状 | 允许策略 |
|---|---|---|
| ink transition blocks | shader 可按时间反播 | `playReverse()` 反播同一转场 |
| pattern-bloom | 图层动画需拆阶段接口 | 反播阶段动画或降级到上一 scene 终态 |
| aod-animation | 未见 reverse webm | 降级：显示上一 scene 终态 + 反向 ink，不用 seek |
| figure2-animation | 有 `figure2*-reverse*` 资源 | 优先用反向资源；缺段才降级 |
| figure3-animation | 未见 reverse webm | 降级：显示上一 scene 终态 + 反向 ink，不用 seek |
| ttg-animation | 有 `ttg_figure-alpha-scrub-reverse.webm` | 优先用反向资源 |
| ph-animation | 未见 reverse webm | 降级：显示上一 scene 终态 + 反向 ink，不用 seek |
| crane-animation | 未见完整 reverse 资源 | 降级：显示上一 scene 终态 + 反向 ink，不用 seek |

静态校验要拒绝“未声明反向策略”的 scene；视觉降级也必须有终态和回退目标，不能留空。


## Manifest Schema 草案

不要继续把时序散落在 DOM `data-*` 和 adapter 常量里。新增 `homepageTimeline`，由 `src/section-manifest.mjs` 生成。

```js
export const homepageTimeline = {
  version: 1,
  defaults: {
    snap: {
      mode: 'full-screen',
      triggerAfterSnapVh: 10,
      releaseCooldownMs: 420
    },
    media: {
      playback: 'autoplay',
      seekPolicy: 'reset-only',
      muted: true,
      playsInline: true
    },
    timeouts: {
      mediaReadyMs: 1800,
      mediaPlayMs: 1600,
      mediaEndGraceMs: 1200,
      textureReadyMs: 1200
    }
  },
  scenes: [
    {
      id: 'figure2-animation',
      kind: 'animation',
      visual: 'figure2',
      fullScreen: true,
      snap: { enter: true }
    },
    {
      id: 'method-lower',
      kind: 'reading',
      publicSectionId: 'method',
      fullScreen: true,
      reading: { allowNativeScroll: true, overflow: 'extend', armNextAt: 'scrolled-past-bottom' }
    }
  ],
  blocks: [
    {
      id: 'figure2-proof-to-brand',
      type: 'ink-transition',
      fromScene: 'figure2-proof-closing',
      toScene: 'brand',
      snap: { triggerAfterSnapVh: 10 },
      lock: { during: ['playback'], release: 'complete' },
      ink: { type: 'horizontal-irregular', direction: 'bottom-up' },
      textureSource: { type: 'canvasProjection', targetScene: 'brand' },
      reverse: { strategy: 'reverse-ink-to-previous-terminal' }
    },
    {
      id: 'crane-play',
      type: 'media-animation',
      scene: 'crane-animation',
      snap: { triggerAfterSnapVh: 10 },
      media: ['crane-figure1', 'crane-figure2'],
      copy: {
        targetScene: 'contact',
        enterAtRemaining: 0.2
      },
      reverse: { strategy: 'terminal-state-fallback', targetScene: 'philosophy' }
    }
  ]
};
```

## Adapter 改造原则

每个视觉 adapter 只做渲染，不决定全局时间轴。

统一接口：

```js
mountScene(ctx) {
  return {
    prepare(),
    showFirstFrame(),
    playForward(),
    playReverse(),
    renderTransition(progress),
    presentCopy(progress),
    reset(),
    destroy()
  };
}
```

约束：

- `renderTransition(progress)` 不得 seek webm。
- `playForward()` / `playReverse()` 负责自动播放。
- 有反向视频资源时使用反向资源；没有时先用视觉降级，不用逐帧 seek 反向模拟主流程。
- AOD/Figure3/PH/Crane 现在组件里存在 scrub/seek 逻辑，迁移时必须拆成 `showFirstFrame` 与 `playForward` 两套路径。
- TTG 和 Figure2 已有较好的 `syncVideo: false` / `startFigureVideoPlayback` 思路，可作为迁移参考。

## 墨滴转场类型

统一为四类。**重要前提（已实测核对源码）**：所需的 shader 数学能力在 `js/effects/ink-scene-transition.js` 里**已全部存在**，本计划不新写 shader，而是「统一参数化 + 把 homepage 编排接回 WebGL」。当前 homepage 主力转场跑在 `split-scene-ink-transition.js`（Canvas2D，一条贝塞尔曲线，fbm 计数=0）甚至 CSS `clip-path` 直线上——**这是「墨滴像直线」抱怨的真正根因，shader 质量本身不缺**。

| 类型 | 用途 | 现有能力来源（已核对） |
|---|---|---|
| `radial-center` | hero -> pattern-bloom，中心扩散 | `createInkSceneTransition`：`uInkCenter` 默认 0.5/0.5 + `uNextScene` 纹理合成（行 295/564/857） |
| `radial-rotating-left` | pattern-bloom -> belief-star，左侧旋转中心扩散 | 同上，配 `inkCenterX≈0.24`；旋转由 pattern-bloom 自身图层 spin 提供 |
| `horizontal-irregular` | bottom-up / top-down 水平不规则墨滴（主力，约 7 处） | `createInkCurtainTransition` **已实现**：`sweepY = mix(uv.y, 1-uv.y, uDirection)`（行 81）+ 多频 fbm 扰动 `edge = p-(sweepY+field)`（行 101-103）。边界天然碎裂 |
| `sunburst-radial` | lab -> ph，从 `ph_background.png` 海面左侧太阳亮点放射扩散 | 源图最亮点 UV `(0.0977,0.6476)`（实测像素 (200,746)/2048×1152），运行时经 PH 背景 `coverUv` 映射成屏幕 UV 后传给 `createInkSceneTransition` |

### shader 层真实缺口（实测修正）

不是「水平墨滴不存在、要新写」，而是两套 shader 能力互补、但**都没被 homepage 主力链路使用**：

- `createInkCurtainTransition`：有水平 + fbm 不规则边界，但是**透明 ink overlay**，不采样 `uNextScene`，只在旧 DOM 上盖墨，不合成下一幕纹理。
- `createInkSceneTransition`：有任意中心点径向 + `uNextScene` 纹理合成（能挖洞露出下一幕），但**没有水平 sweep 模式**。

因此唯一的真实工作量（中等，非重写）：把 curtain 的 `sweepY + fbm field` 几何，作为一个 `uSweepMode`（0=径向 / 1=水平）轴**移植进 `createInkSceneTransition` 的 threshold 路径**（该路径已有完整 fbm/warp/tendril 机制，行 412-429）。移植后一个 factory 覆盖全部四类，且都带纹理合成。

### DOM / 纹理投影管线（补 P1 缺口）

`createInkSceneTransition` 的可靠输入是图片或 `inkTextureReady` canvas。普通 DOM section 不能被假定为可采样纹理，必须显式声明 `textureSource`：

| `textureSource` | 用途 | ready 条件 |
|---|---|---|
| `asset` | PH 背景、已导出的静态画面 | 图片 decode 完成 + 非 0 尺寸 |
| `canvasProjection` | 文案/卡片/简单层级的确定性投影 | runtime 自己绘制 canvas，设置 `dataset.inkTextureReady="true"`，并做非空像素采样 |
| `liveElement` | 少数必须采 DOM 的复杂段 | 只允许通过明确 adapter 实现，不默认引入通用 html2canvas |
| `none` | 不需要合成纹理的纯遮罩转场 | 只播放 ink overlay，commit 时切换真实 DOM |

Homepage 主链路默认优先 `asset` / `canvasProjection`，避免通用 DOM 截图的不稳定性。每个转场 block 必须声明下一幕纹理策略；如果 `textureReadyTimeoutMs` 内未 ready，进入失败恢复路径：完成墨滴遮罩、commit 真实 DOM 终态、释放滚动，不能显示纯色兜底块或半空白下一幕。

`sunburst-radial` 的源中心点来自静态背景最亮处，源图 UV 为 `(0.0977, 0.6476)`（≈ 左侧 9.8% / 上方 64.8%）。实际传给 shader 的 `inkCenterX/Y` 不能直接写死这个源 UV，必须复用 PH 背景的 `object-fit: cover` / `coverUv` 映射，在每次 resize 后换算成当前视口屏幕 UV。

### 可删死文件（实测：byte 相同、无引用）

- `js/effects/ink-scene-transition-root.js`（与 `ink-scene-transition.js` md5 相同，无 import）
- `js/effects/split-scene-ink-transition.js.backup`

## 实施阶段

### Phase 1：冻结目标合同

- 新增 `homepageTimeline` schema。
- 明确每个 scene/block 的 `kind`、`fullScreen`、`triggerAfterSnapVh`、`media.seekPolicy`。
- 新增 Build-vs-Salvage ADR：`main` 是视觉基准；当前 worktree 的 `scene-timeline-controller.js` 可作为代码素材评估，但不能继承旧时序假设。结论要逐模块写明“复用 / 改写 / 丢弃”。
- 把 `/Downloads` 文案迁入仓库内 `src/copy/homepage-reference.*` fixture；静态脚本禁止读取外部 Downloads 路径。
- 新增 JS-snap ADR/fallback 与 `reversePlaybackMatrix`。
- 新增静态校验脚本，先让脚本失败，证明当前旧时间轴不满足新合同。

完成标准：

- 所有 animation block 都声明 `triggerAfterSnapVh: 10`。
- 所有 scene/block 都有唯一 id。
- Brand、Philosophy、Figure2 proof 的文案归属通过静态脚本校验。
- Philosophy 在目标链路中有明确位置：`education -> philosophy -> crane-animation -> contact`。

### Phase 2：Runtime 状态机

- 新建显式 reducer：`FreeScroll -> SnapAligning -> SnappedArmed -> TriggeredPlayback -> Playing -> Completing -> ReleaseCooldown -> FreeScroll`。
- 实现 `10vh` 输入累计。
- reading scene 入口 snap 后释放自然滚动。
- 实现 `RecoverPresentTarget` 失败恢复路径，覆盖 media/texture timeout 与 `play()` reject。
- 禁止旧 runtime 直接在 host 接近 viewport 时播放。

完成标准：

- 单元/静态测试覆盖 `SnappedArmed`、10vh 触发、完成释放。
- 测试覆盖 `TriggeredPlayback`、`Completing`、失败恢复释放。
- 非 reading block 未达到 10vh 不播放。

### Phase 2.5：Pilot 墨滴与纹理最小闭环

Pilot 前置只做第一条链路需要的最小能力，不要求先完成全站 shader 收敛和死文件清理。

- 覆盖 pilot 所需 `radial-center`、`radial-rotating-left`、`horizontal-irregular bottom-up`。
- 为 pilot 转场声明 `textureSource`，优先 `asset` / `canvasProjection`。
- 收紧纹理 ready 判定：验证 `nextSceneElement` 内容非空，不能只看 `kind==='domProjection'` 就算 ready。
- Canvas2D `split-scene-ink-transition` 可暂留为 fallback，但 pilot 主链路不能依赖它。
- 全站四类 shader 收敛和死文件删除移到 Phase 6。

完成标准：

- Pilot 三类转场边界肉眼可见 fbm 碎裂（非直线、非单条贝塞尔）。
- 转场过程不出现纯色兜底块/半空白下一幕。

### Phase 2.6：Pilot 满屏高度契约

- 先按「满屏契约的超长段策略」表改 pilot 路径：animation scene 写 `height:100dvh`、reading section 写 `min-height:100dvh`。
- pilot 路径移除转场 host 的 `--extra-snap-height` 和 seam-bleed 撑高（除非验证确需）。
- 超长 reading section：实现「滚出段底才 arm 下一转场」的边界判定。
- 用 JS-snap 对齐，不引入原生 `scroll-snap-type: mandatory`（避免与 Lenis 抢位）。

完成标准：

- 每个 animation scene 实测高度 = 1 屏。
- 长 reading section 能自然滚到底，且中途不误触发下一转场。
- 锁定期 Lenis 完全 stop，无程序滚动与用户滚动抢位。

### Phase 3：Pilot 跑通

先跑两个 pilot，不碰全站：

1. `hero -> pattern-bloom -> belief-star`
2. `belief-star -> aod-animation -> method-upper/method-lower`

完成标准：

- 每段先满屏 snapped，再 10vh 触发（含 charge 可视反馈）。
- AOD 转场完成后，AOD 动画不会提前播放。
- Method 文案在 AOD 动画剩余 20% 时入场。
- 反向滚动能从 belief-star 回退到 pattern-bloom 终态。

### Phase 4：Figure2 专项

- 以 main 的 Figure2 多图层布局为视觉基准。
- Stage2 完成后保留 `.figure2-arch-layer--near-arch`，保持模糊且不动。
- 插入 `122-126` proof cards。
- 插入 `128` closing。
- 横拱和文案一起 bottom-up 墨滴扫走。
- 接 `135-136` brand。

完成标准：

- Figure2 stage2、proof cards、closing、brand 四个边界不混。
- 不出现空白过渡。
- 不把 proof 当 brand。

### Phase 5：迁移后续动画

顺序迁移：

1. Figure3 -> Services
2. Services -> TTG -> Lab
3. Lab -> PH -> Education
4. Education -> Philosophy -> Crane -> Contact

完成标准：

- Figure3/Crane 目标文案都在动画剩余 20% 时入场。
- TTG 到 Lab 是 top-down 水平不规则墨滴。
- Lab 到 PH 是太阳亮点放射墨滴。
- PH 到 Education 是 top-down 水平不规则墨滴。
- Philosophy 保持独立 reading section，不与 Brand 合并。

### Phase 6：验收与清理

- 删除或降级旧 `progress-window`、旧全局 `sourceOut/targetIn` 时间假设。
- 完成全站四类墨滴 factory 收敛；删除确认无引用的死文件。
- `sunburst-radial` 使用 PH 背景 cover 映射后的屏幕 UV，而不是直接写死源图 UV。
- 保留 main 视觉资产和布局。
- 补齐静态验证脚本并加入 `verify:all`。

## 静态验证建议

新增脚本：

- `scripts/check-homepage-timeline-schema.mjs`
- `scripts/check-homepage-snap-contract.mjs`
- `scripts/check-homepage-media-policy.mjs`
- `scripts/check-homepage-runtime-state-machine.mjs`
- `scripts/check-homepage-content-boundaries.mjs`
- `scripts/check-homepage-texture-sources.mjs`
- `scripts/check-homepage-reverse-matrix.mjs`
- `scripts/check-homepage-js-snap-fallbacks.mjs`

脚本需要检查：

- 所有非 reading block 都有 `triggerAfterSnapVh: 10`。
- reading scene 不要求 `10vh charge`，长 reading scene 必须声明 `armNextAt: 'scrolled-past-bottom'`。
- 所有 animation scene 都是 full-screen snap。
- `seekPolicy` 只能是 `reset-only`，不能是 `scrub`.
- runtime 中不能存在 “进入 viewport 立即播放” 的路径。
- runtime 存在 `TriggeredPlayback`、`Completing`、`RecoverPresentTarget` 或等价失败释放路径。
- 122-126 只能归 `figure2-proof-cards`。
- 128 只能归 `figure2-proof-closing`。
- 135-136 只能归 `brand`。
- Downloads 路径不得出现在 runtime 和 verify 脚本里；文案只能来自仓库内 copy fixture。
- `philosophy` 与 `brand` 是不同 scene。
- `philosophy` 位于 `education` 与 `crane-animation` 之间。
- 每个 animation scene 的 CSS 高度解析为 `100dvh`（不含 `--extra-snap-height` 撑高）。
- runtime 存在 wheel/touch/keyboard 的 delta 归一化与单帧钳制（防止惯性过冲）。
- 每个转场 block 声明 `textureSource`，且 `canvasProjection/liveElement` 有 ready timeout 与非空检测。
- 每个 animation scene 声明反向策略；无 reverse 资源时必须声明降级终态，禁止 seek 反向模拟。
- JS-snap fallback 覆盖 Lenis 缺失、hash 跳转、resize/visualViewport、移动端地址栏、reduced-motion。
- 全量验收时 homepage 转场全部走 WebGL `createInkSceneTransition`，主力链路不得引用 Canvas2D `split-scene-ink-transition`（reduced-motion fallback 除外）。

## 已做静态检查

本轮未使用 Playwright。验证执行了 `npm run verify:all`（包含 `build:page`）并单独补跑 `npm run verify:homepage-timeline`。

现有脚本均通过：

- `npm run build:page`
- `npm run verify:copy`
- `npm run verify:ink-modules`
- `npm run verify:scroll-modules`
- `npm run verify:section-transitions`
- `npm run verify:transition-runtime`
- `npm run verify:homepage-transitions`
- `npm run verify:homepage-timeline`
- `npm run verify:handoff-ownership`

这说明当前 `main` 旧合同内部自洽，但不说明它满足新时间轴。只读 DOM 顺序检查显示，当前生成页仍是旧结构：动画段大多是 `transition-host`，不是独立满屏 scene。因此第一步必须先改 manifest/schema，再迁移 runtime。

## 风险

- 最大风险是画面 ownership 不唯一：真实 section、过渡层、文案 overlay、视频层同时抢可见性。（实测：`timing-architecture-diagnosis.md` 点名的「五控制者抢同一帧」在 worktree/main 均仍成立；worktree 的 `homepage-master-observer` 只是只读 HUD，未接管所有权——本计划放弃 observer 路线，HUD 可留作调试。）
- 第二风险是旧 adapter 继续用 progress seek webm，导致“滚动驱动动画”回潮。（实测：当前 6 个主力转场标 `data-transition-runtime-mode="progress-window"`、`snapController=null`、进度由 `getScrollY()` 决定，就是「转场跟着滚动走」的字面来源，必须全部切回时间驱动。）
- 第三风险是把 main 的旧时间轴当视觉基准一起照搬。
- 第四风险（新增，手感）：`SnappedArmed` 的输入归一化没做好，触控板惯性一甩冲满 10vh 过冲、或 armed 期无反馈像卡死。这是「播放效果不理想」的高发区，须按手感规格验收。
- 第五风险（新增，shader 接线）：误以为「水平墨滴要新写 shader」而重复造轮子。实测能力已存在，工作量是移植 `sweepMode` 轴 + 接线，不是重写。
- 第六风险（新增，解锁）：资源 404、`play()` reject、`ended` 不触发或 DOM texture 半空白会把页面锁死。每个 block 必须有 timeout、失败 present 终态、`ReleaseCooldown`。

### 代码基座现状（git 实测，影响落地起点）

- `main` **不含** timeline 契约（`scene-timeline-manifest.js`/`controller.js` 不在 main），它就是「无导演、各 adapter 自治」基线 + WebGL shader + figure2 controller。
- timeline 契约只存在于多个 `codex/*` 分支和当前工作分支尝试中，且已有多条并行路线未真正落地。结论不是“全部推倒”，而是必须先写 Build-vs-Salvage ADR：逐模块判定复用、改写、丢弃。
- 当前工作分支的 `js/transitions/homepage/scene-timeline-controller.js` 可作为 controller 素材评估；`main` 的视觉资产、DOM 层级、CSS 变量仍是视觉验收基准。任何可复用代码都必须去掉旧 `progress-window` / viewport-enter 即播 / scrub seek 假设，按本计划的 SnappedArmed/10vh 合同重写时序。

对应约束：

- Runtime 是唯一时间轴 owner。
- Adapter 是视觉 renderer。
- Main 是视觉验收基准。
- Manifest 是 section/scene 边界的唯一来源。
