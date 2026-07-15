# 目标架构：Cinematic Story Runtime（完全重新设计）

状态：R5 production architecture 已落地；当前分支在既有 immutable candidate 之后完成 Generic Ink 边界修复与 TTG/PH 内部 dissolve，等待 HITL 视觉验收。production StoryApp、public entry、crawlable shell、lazy module boundary、release CI 与 rollback contract 已实现；旧站基线固定为 `react-refactor-legacy-static-baseline`，不再是默认 runtime。

文档闭环：入口见 `README.md`；阶段落地与分支纪律见 `ROADMAP.md`；旧站复用、退役和切换边界见 `MIGRATION.md`；每阶段执行清单见 `goals/`。

## 0. 决策记录

| 决策 | 结论 |
|---|---|
| 技术栈 | Vite + React + TypeScript + GSAP（core / Flip / @gsap/react）+ XState v5 |
| 包管理器 | pnpm workspace；R0 固定 root `packageManager`、`pnpm-workspace.yaml`、`pnpm-lock.yaml` 与 CI install 策略 |
| 交互模型 | **保留 snap 播放**：蓄力触发 → 播放转场 → 落位。用户不能停在转场中间 |
| 底座 | **虚拟滚动 + 单 Stage**：页面无真实文档流滚动，整站是一个 100svh 舞台，scene 是舞台里的层 |
| 故事顺序 | 以 §3.1 的 canonical story spine 为唯一时序。旧 `main` 的 `contentSections/chapterTransitions` 只作为粗粒度种子 |
| 与旧站关系 | 全新实现；复用 renderer、媒体资产、文案、UX 参数与不变量（见 MIGRATION.md） |
| Lenis | 不再是核心依赖。阅读区内部滚动先用原生 overflow，平滑化是后期可选项 |
| 可爬取内容 | `static-story-shell` 在 Vite build 时把 8 个正文区与 metadata/hash anchors 注入 `dist/index.html`；React 只做渐进增强，127 条 public baseline copy 可在无 JS 时提取 |
| 默认 runtime | 根 `dev/build/test/lint/typecheck/CI/deploy:build` 指向 production React app；旧 runtime 只保留为显式 `legacy:*` 与 immutable rollback baseline |
| 落地基线 | R5 从 `react-refactor-r4-closeout` 开始；候选等待 HITL，批准前不合并/部署 main，不建立 cutover tag |
| R2/R3 判定边界 | R2 只证明合成场景下协议闭环；真实媒体、copyCue、异步 milestone 的真值在 R3 pilot 首次判定。R3 未平价前不得宣称“播放顺序 + 状态机已彻底解决” |

### 为什么换底座

旧系统难改的根源是"真实文档流 sections + fixed 覆盖层转场"：为了让转场层和文档流内容无缝交接，被迫发明了 fixed-copy 逐帧几何同步、reveal gate 所有权、present 同帧滚动瞬移、direct-hash 状态合成。换成单 Stage 后：

- 每个 scene 的文案永远住在自己的层里，**copy ownership 概念整体消失**。
- 转场就是层与层之间的一条 timeline，**from/to 交接退化为 z-order 与 opacity 问题**。
- 直达导航不需要合成中间状态，**卸载旧窗口、挂载新窗口即可**（视觉状态是每层自包含的，不是累积的 DOM 变异）。

### 与贴文方案的两处偏差

1. **不用 ScrollTrigger scrub 全局 master timeline**：交互是离散 snap 模型，播放由 Director 触发（等价于贴文的 `master.tweenTo(label)` 模式），只有个别章节用滚动 scrub（见 §5 输入路由）。
2. **不维护一条字面意义的全局 gsap master timeline**：完整 spine 含视频/canvas/WebGL，无法全部常驻 DOM，而 gsap timeline 构建需要元素存在。改为 **StorySpine（虚拟时间轴）+ 按需构建的 Segment**：语义上仍是"一条故事时间轴、一套 label"，实现上分段惰性构建，内存有上界。

## 1. 分层总览

```txt
wheel / touch / key / hash / menu
        ↓
InputNormalizer（归一化为 viewport-fraction delta）
        ↓
Director（XState v5，React 外部）—— 唯一输入仲裁者
   每帧把输入路由给恰好一个消费者：
   innerScroll（阅读层内部滚动） | scrub（scrub 章节） | charge（蓄力） | none（播放中）
        ↓
StorySpine（虚拟时间轴：holds + segments，label 寻址）
        ↓
SegmentPlayer（按需构建 gsap timeline，play / reverse / progress(1)）
        ↓
Stage（唯一 100svh 舞台）
   ├── SceneLayer × N（挂载窗口：prev / current / next）
   └── HUD / 进度指示 / 调试层
```

**单一时钟原则**：任意时刻页面时间只有一个来源 —— hold 时是"无时间"（仅 idle 循环与内部滚动），playing/scrub 时是当前 segment 的 progress。仲裁者是 Director，且 Director 不碰逐帧数值（GSAP 领域）。

## 2. 目录结构

```txt
app/
  src/
    main.tsx
    production/
      StoryApp.tsx             # production composition root
      input-controller.ts      # wheel/touch/key + reading edge handoff
      module-loaders.ts        # scene/transition dynamic imports
      navigation.ts            # hash/history/menu mapping
    runtime/
      director.machine.ts      # §5 状态机
      input-normalizer.ts      # wheel/touch/key → fraction（参数沿用旧站）
      charge.ts                # 蓄力/衰减/方向（参数沿用旧站）
      input-router.ts          # 每帧路由：innerScroll | scrub | charge | none
      recovery.ts              # 资产超时表（沿用旧站数值）
      seek.ts                  # 直达导航
    story/
      manifest.ts              # 唯一数据源：scene 顺序、segment 时长/策略、蓄力参数
      spine.ts                 # StorySpine：虚拟时间、label、游标
      segment-player.ts        # 惰性构建 + play/reverse/jumpToEnd
      types.ts                 # SceneModule / TransitionModule / Milestone / …
      registry.ts              # Scene/Transition 注册表 + HandleRegistry
    stage/
      Stage.tsx                # 唯一舞台
      SceneLayer.tsx           # 层：挂载窗口、inert、z-order、内部滚动容器
      LayerWindow.ts           # prev/current/next 窗口管理与 dispose 策略
    scenes/<id>/
      index.ts                 # SceneModule
      Component.tsx            # 层内 DOM（文案自旧站逐字搬运）
      timelines.ts             # intro/outro/idle 微时间轴工厂
      renderer/                # canvas/video/WebGL（从旧 adapter 搬运算法）
      assets.ts
    transitions/<segmentId>/
      index.ts                 # TransitionModule
      timeline.ts              # segment 工厂
    transitions/shared/        # ink-crossfade 等通用工厂
    a11y/                      # URL 同步、焦点管理、键盘导航、SR 策略（§9）
    harness/HarnessRouter.tsx  # dev-only lazy /harness/* boundary
  build/static-shell.ts        # crawlable/no-JS HTML shell
  scripts/verify-*.mjs         # release/bundle/manifest gates
  index.html
  vite.config.ts
```

## 3. StorySpine：故事的唯一骨架

### 3.1 Canonical story spine

这是对 `main` 重构时唯一允许实现的页面顺序；任何旧命名（如 `belief-star`、`method-proof-brand`）都要在 R0.0 映射到这条 spine 上，不能反向污染新 manifest。唯一修正出口是 R-1 用 DOM / hash / adapter / build output 证据提交 `docs/react-refactor/decisions/canonical-spine-correction.md`，同步更新本节与 R0 输入后再实现。

```txt
hero
→ hero-pattern / 墨滴中心扩散
→ pattern
→ pattern-star-map / 左侧旋转扩散
→ star-map
→ star-map-aod / 下到上水平墨滴
→ aod-animation
→ aod-method-top / 动画 80% method 文案提前入场
→ method-top / 单一 Method reading hold；左侧锁定，右侧五步原生滚动
→ method-bottom-figure2 / 右侧滚到底后，下到上水平墨滴（segment id 保留历史命名）
→ figure2-animation
→ figure2-distance-expand / figure2 内部远景扩散（segment，不是 scene）
→ figure2-proof / 单一 reading hold + 300svh scrollport；opening/cards/closing 是三个内部 panel
→ figure2-proof-brand / 横拱和文案一起下到上水平墨滴
→ brand
→ brand-figure3 / 下到上水平墨滴
→ figure3-animation
→ figure3-services / 动画 80% services 文案提前入场
→ services
→ services-ttg / 下到上水平墨滴
→ ttg-animation
→ ttg-lab / 2500ms 媒体播放 + 600ms 纯 opacity dissolve
→ lab
→ lab-ph / 单一上到下墨滴
→ ph-animation
→ ph-education / 1520ms 媒体播放 + 600ms 纯 opacity dissolve
→ education
→ education-crane / 下到上水平墨滴
→ crane-animation
→ crane-contact / 动画 80% contact 文案提前入场
→ contact
```

Canonical scene id：

```txt
hero
pattern
star-map
aod-animation
method-top
figure2-animation
figure2-proof
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

`figure2-distance-expand` 固定为 `SegmentId`，不是 `SceneModule`。它从 `figure2-animation` 的终态推进到 `figure2-proof` 的首屏状态。`figure2-proof-opening`、`figure2-proof-cards`、`figure2-proof-closing` 只作为 URL/hash redirect alias 与内部 panel anchor；它们不是 canonical hold，不经过 Director、SegmentPlayer 或 reading latch。

旧 `main` 的粗粒度 join 到 canonical spine 的展开映射（R0.0 的正名依据，完整字段见 MIGRATION §1.2.1）：

| 旧 join id | 展开为 canonical scene/segment | 保留的 cue |
|---|---|---|
| `home-belief` | `hero → pattern → star-map` | 中心扩散 + 左侧旋转扩散 |
| `belief-method` | `star-map → aod-animation → method-top` | `copyCue.atProgress = 0.8` |
| `method` | `method-top` 单一 reading hold（intro + 五步列表） | 右侧滚到底才交接 |
| `method-proof-brand` | `method-top → figure2-animation → figure2-proof → brand` | `method-bottom-figure2` 仅保留历史 segment id；Proof 内部三屏共用一个 scrollport |
| `brand-services` | `brand → figure3-animation → services` | `copyCue.atProgress = 0.8` |
| `services-lab` / `lab-education` | `services → ttg → lab`、`lab → ph → education` | 章节入口 `services-ttg` / `lab-ph` 保留水平 Ink；章节内部 `ttg-lab` / `ph-education` 使用 staged media dissolve |
| `philosophy-contact` / crane | `education → crane-animation → contact` | `copyCue.atProgress = 0.8` |

规则：**旧 id 只能单向映射进 spine，不得反向污染新 manifest**。任何旧命名（`belief-star`、`method-proof-brand` 等）在 R0.0 一次性正名后即退役。

### 3.2 Spine node contract

```ts
type SpineNode =
  | { kind: 'hold'; scene: SceneId; reading: boolean }        // 停驻点
  | { kind: 'segment'; id: SegmentId; from: SceneId; to: SceneId;
      policy: SegmentPolicy; virtualDuration: number;
      visual?: SegmentVisual;
      copyCue?: CopyCue };

type SegmentPolicy =
  | { kind: 'snap'; chargeThreshold: number; interruptible?: boolean } // 默认 false；true 需要 R2/R3 明确测试
  | { kind: 'scrub'; snapAfterIdleMs: number }
  | { kind: 'stagedSnap'; stops: number[]; playMs: number[];
      advance: StagedBoundaryAdvance[]; postScrollVh?: number }
  | { kind: 'reading'; anchor: SceneId; edgeArm?: 'bottom' | 'top' };

type StagedBoundaryAdvance =
  | { kind: 'immediate' }
  | { kind: 'gesture' }
  | { kind: 'delay'; ms: number };

type SegmentVisual =
  | { type: 'ink'; ink: 'center-expand' | 'left-rotate-expand' | 'horizontal';
      direction?: 'bottom-to-top' | 'top-to-bottom' }
  | { type: 'disappear'; media?: MediaKey[] };

type CopyCue = {
  targetScene: SceneId;
  atProgress: number; // 当前确认：aod / figure3 / crane 均为 0.8
};
```

- **虚拟时间**：每个 segment 的 `virtualDuration` 来自 manifest，spine 由此提供全局进度（HUD、进度指示、菜单定位），无需真实 timeline 常驻。
- **label 寻址**：`spine.labelOf('scene:star-map')` / `spine.cursor`。所有导航（蓄力、菜单、hash、seek）都以 label 为单位，等价贴文的 `master.tweenTo(label)`。
- **游标不变量**：cursor 要么停在 hold，要么在恰好一个 active segment 内。绝无两个 segment 同时活跃。
- **reading hold / 内部滚动**：`method-top`、`figure2-proof`、`services`、`lab`、`education` 各自拥有 scene-owned reading scrollport。Director 在未到边缘时把输入留给原生滚动；自然到边只吸收当前手势尾流，从 transition 挂载到已知边缘则直接进入 steady，下一次清晰同向手势即可提交。
- **stagedSnap segment**：`stops/playMs/advance` 必须在 manifest 明示且 `advance.length === stops.length`。`immediate` 直接进入下一 leg，`gesture` 进入 `staged-paused` 等待新手势，`delay` 在同一 playing run 内执行可取消定时 dwell；三者都不创建新 scene 或中间 settle。
- **transition lifecycle**：所有相邻 canonical holds 只允许 `ink | disappear` 两类视觉转场。AOD、Figure2、Figure3、TTG、PH、Crane 全部保留 semantic hold；一个 run 可含多个自动时间阶段，但只在末端 settle 一次。settle 只提交 runtime 状态，transition endpoint 与 hold 第一帧在 DOM、文字布局、背景、样式和 reading `scrollTop` 上必须完全一致。
- **presentation ownership**：source scene 定义 hold endpoint 与 scene-specific exit（包括视频、人物、alpha 和图层采样）；target scene 定义最终 hold DOM/layout/background 及明确声明的 entrance channels；shared Ink 只拥有 mask/canvas/contour；segment 只编排 direction、readiness、progress、reverse/abort 与 settle。
- **禁止第三套 presentation**：transition 不得 clone source/target、复制文案、创建临时 scene root、维护第二套 layout，或在 settle 时替换 canonical root。Disappear 直接调用 source scene exit + target scene entrance；Ink 只能在两个既有 root 之间增加共享 effect surface。
- **interruptible 默认 false**：R-1 产出 `interruptible-candidates` 清单，默认空。只有从旧站 scrub / 可往返章节事实反推出来、并在 R2/R3 有专项测试的 segment，R0 manifest 才能设 `interruptible: true`。

### 3.3 身份判定

- `pattern`、`star-map`、`aod-animation`、`figure2-animation`、`figure3-animation`、`ttg-animation`、`ph-animation`、`crane-animation` 都是 `SceneModule`，因为它们有可停驻/可回放/可直达的 renderer 状态。
- `TransitionModule` 是相邻 scene 的 runtime edge，不是第三个视觉 scene。它只组合 scene-owned hooks 与 shared effect；copy、background、media surface 和最终 layout 始终归对应 scene。
- Ink 的共享 owner 只负责 mask/canvas、边界和 reveal visibility。Pattern collapse、Star Map/AOD/Crane 首帧等 presentation 仍由各自 scene hook 提供。
- `aod-method-top`、`figure3-services`、`crane-contact` 是 media segment：source scene 驱动自身媒体/exit，target scene 在 `copyCue.atProgress = 0.8` 接收自己的 entrance progress；segment 只同步同一 playhead。

## 4. SegmentPlayer：按需构建，幂等销毁

```ts
type ActorEpoch = string; // Director actor 创建时生成 crypto.randomUUID()
type SegmentRunId = `${ActorEpoch}:${number}`;
type PrepareToken = `${ActorEpoch}:prepare:${number}`;

type SegmentResult =
  | { status: 'completed'; runId: SegmentRunId; direction: 1 | -1 }
  | { status: 'aborted'; runId: SegmentRunId; reason: 'seek' | 'superseded' | 'dispose' | 'recovery' }
  | { status: 'failed'; runId: SegmentRunId; error: Error };

type SegmentRunSnapshot = {
  runId: SegmentRunId;
  segmentId: SegmentId;
  direction: 1 | -1;
  progress: number;
  pausedAt?: string;
};

interface SegmentPlayer {
  ensureBuilt(id: SegmentId, opts?: { runId?: SegmentRunId; timeoutMs?: number }): Promise<gsap.core.Timeline>; // 依赖两端层已挂载（§7 保证）
  play(id, direction: 1 | -1, opts?: { runId?: SegmentRunId }): Promise<SegmentResult>;
  scrub(id, progress: number): void;                        // scrub 章节专用
  jumpToEnd(id, direction): void;                           // recovery / seek 用
  abort(reason: 'seek' | 'superseded' | 'dispose' | 'recovery'): void;
  snapshot(): SegmentRunSnapshot | null;                    // 调试 / 测试只读，不进 machine context
  dispose(id): void;                                        // 层滑出窗口时随之销毁
}
```

- timeline 在 from/to 两层都挂载完成后构建（pre-mount 协议保证时机），完成或滑出窗口即 `kill()`。
- `jumpToEnd` 之所以安全，前提是 §6 的**progress 幂等渲染**契约（旧站 Phase 4 最重要的遗产）。
- 每次 `play()` 都有 `runId`。`runId` 由 actor epoch + 单调序号组成，Director actor 重启 / HMR 会生成新 epoch，避免 counter 重置导致 ABA。Director 只接受当前 `activeRunId` 对应的 completion/failure；旧 run 的 promise 回调必须被忽略。`abort()` 负责 kill timeline、移除 pause/resume 回调、停止媒体监听，并让后续 stale completion 无效。
- `ensureBuilt()` 也有 timeout。默认使用 manifest `buildTimeoutMs`（未配置则 1200ms）；build timeout / build failure 进入 recovery，不能卡在 preparing，也不能进入半空 DOM 的 playing。
- `play()` 不允许 reject；成功、失败、abort 都 resolve 为 `SegmentResult`。任何底层 GSAP/media 异常都必须捕获并转换为 `{ status: 'failed', runId, error }`，同时通过 actor mailbox 派发 `PLAYBACK_FAILED`。Director 仍需集中 `.catch()` 作为防御，测试必须断言没有 unhandled rejection。
- SegmentPlayer 对 Director 的所有回调必须通过 actor mailbox / event queue 异步投递（例如 `actor.send(...)` 或 microtask enqueue），禁止 GSAP `onComplete/onReverseComplete/onPause` 同步修改 machine context、Stage 或 React state。
- `seeking`、`recovery`、反向 supersede、窗口 dispose 前必须先调用 `abort()`，再卸载或重挂层，避免 orphaned tween 改写已卸载 DOM。

### 4.1 Media segment contract

视频 / WebGL / canvas-heavy segment 不能只依赖 GSAP `reverse()` 解决反向和 recovery。媒体类 transition 需要显式声明：

```ts
interface MediaPlaybackContract {
  id: string;
  media: MediaKey[];
  forward: { mode: 'play' | 'scrub' | 'timeline' | 'static-fallback' | 'none';
             required: boolean; media?: MediaKey[] };
  reverse: { mode: 'play' | 'scrub' | 'timeline' | 'static-fallback' | 'none';
             required: boolean; media?: MediaKey[] };
  readyMilestones: MilestoneKey[];       // loadedmetadata / canplay / textureReady 等
  preparingTimeoutMs: number;
  terminalFallbackScene: SceneId;
}
```

规则：

- `play(-1)` 只有在同一 canonical media surface 能通过 timeline seek 或批准的 reverse asset 可靠呈现时才声明 required；失败回到最后已提交 scene，不制造另一个 scene completion。
- `jumpToEnd()` 必须能落到静态终态，不要求媒体播放完整结束。视频类实现必须显式同步 renderer terminal state；能 seek 的媒体要把 `currentTime` 拉到目标终态，不能只改 CSS。
- `copyCue` 由 SegmentPlayer 按 progress 触发，但视觉通道由 target scene 的 entrance renderer 实现；scene 不得从独立视频回调启动第二条时间线。反向跨过阈值时调用同一 scene hook 的逆向采样。

`ttg-lab` 与 `ph-education` 是保留 animation semantic hold 后的相邻 `disappear` media segment：TTG/PH scene lifecycle 驱动自己的媒体与 exit，`stagedMediaHandoff` 只协调 source exit、Lab/Education final hold surface 与 600ms 互补 opacity dissolve。媒体 terminal 与 dissolve 之间使用 `{ kind:'delay', ms:1000 }`，正反向对称；这段 dwell 不进入 `staged-paused`、不等待用户输入。Lab/Education 在第一次可见前已经位于最终 entry edge；p=.99、p=1 与 dispose/settle 后的文案位置、换行、样式、背景及 `scrollTop` 必须连续。

### 4.2 staged boundary / compound Proof 执行语义

`figure2-proof` 是一个 canonical reading hold：一个 article、一个 scrollport、三个 `min-height: 100svh` panel。内部 opening/cards/closing 只改变同一个 `scrollTop`，不启动 transition run，也不派发 `CHARGE_FIRED`。`figure2-distance-expand` 只负责进入 Proof opening endpoint；`figure2-proof-brand` 从 closing/bottom 离开。

SegmentPlayer 按 `{ stops, playMs, advance }` 切分 authored time ranges，并在每个 boundary 执行对应 advance contract：

- `playMs[i]` 只决定对应区间时长，TransitionModule 不私设第二个时钟；
- `gesture` boundary 暴露对应 `stage:i` pause，派发 `STAGE_PAUSED`；只有新的合格手势可以 `RESUME`；
- `delay` boundary 保持 Director 为 `playing`，timer 到期自动推进；abort/dispose/recovery 必须清理 timer；
- `immediate` boundary 同一 tick 进入下一 leg；
- forward/reverse 采样同一条 timeline，任一中间 stop 都不是 hold 或 settle；
- `verifySegmentTimeline()` 只要求 gesture boundary 对应 pause label；delay/immediate 不冒充用户 pause，所有终点都不得出现 blank frame。

当前 canonical 配置：Pattern 两个 boundary 均为 `gesture`；Figure2、TTG、PH 的媒体 terminal boundary 均为 `delay(1000ms)`。`jumpToEnd(id, +1/-1)` 仍直接落到 p=1/p=0，仅供 recovery / seek。

## 5. Director 状态机与输入路由

全新设计，去掉旧文档流底座才需要的 SnapAligning / 滚动瞬移 / ReadingScroll bypass；新增 `preparing` 只承担 ready gate 等待，不拥有视觉进度：

```txt
booting → hold ⇄ scrubbing
             ↓ CHARGE_FIRED
          preparing → playing ⇄ staged-paused → settling(420ms) → hold
             ↓ 资产失败/超时
          recovering → hold
          seeking（任意状态可入）→ hold
```

| 状态 | 输入路由 | 说明 |
|---|---|---|
| booting | none | 关键资产预载、首屏 intro |
| hold | reading 层可滚方向 → **innerScroll**；到达边缘后的继续输入 → **charge** | 唯一常态。idle 循环运行 |
| preparing | none | target/media 短暂等待窗口。超过 manifest 阈值才 recovery，避免慢网下蓄力后立刻跳过动画 |
| scrubbing | **scrub**（delta 累积映射 segment progress） | 仅 scrub 章节；停手后 snap 到最近 hold（tweenTo 补完/回退） |
| playing | **intentBuffer**（不打断 snap segment；记录方向与阈值） | SegmentPlayer.play() 中。scrub 段可 reverse，snap 段不允许中途停在转场内 |
| staged-paused | **chargeResume** | Pattern 的 compact/no-copy 与 compact/copy checkpoint；只接受新物理手势，同一惯性尾流不得跨站。 |
| settling | **intentBuffer** | 落位冷却，更新 cursor、URL、层窗口；完成成员资格校验后再 flush queued intent |
| recovering | none → 尽快回 hold | `jumpToEnd` + 静态终态。**永不因资产失败吞输入** |
| seeking | none | §8 |

保留的旧站 UX 参数（作为 manifest 默认值，可调）：蓄力阈值 0.1（10vh）、衰减 0.001/ms、settling 420ms、recovery 超时表（MEDIA_READY 1800ms 等）。

**machine context 禁止出现 progress/opacity/transform 等逐帧字段**（XState 管离散，GSAP 管连续）。允许保存离散字段：`cursor.status`、`activeRunId`、`prepareToken`、`pendingDirection`、`queuedIntent`、`pausePoint`。actor 在 React 外创建，React 用 `useSelector` 订阅渲染语义属性与 HUD。调试接口 `window.__story.getState()`。

```ts
type StoryCursor =
  | { status: 'hold'; scene: SceneId }
  | { status: 'segment'; segment: SegmentId; from: SceneId; to: SceneId }
  | { status: 'settling'; segment: SegmentId; from: SceneId; to: SceneId; target: SceneId };
```

stagedSnap 暂停期间 `cursor.status` 仍是 `'segment'`，且 `pausePoint` 必须存在；二者共同表达“当前位于某 segment 的合法离散 stop”。如果 `staged-paused` 状态没有 `pausePoint`，这是 machine invariant violation。

### 5.1 Director event contract

R0/R1 必须冻结事件名与离散语义，R2/R3 只能做 non-breaking 扩展，不能临时改状态机口径：

```ts
type DirectorEvent =
  | { type: 'BOOT_READY' }
  | { type: 'BOOT_FAILED'; error: Error }
  | { type: 'INPUT_DELTA'; delta: number; source: 'wheel' | 'touch' | 'key' }
  | { type: 'CHARGE_FIRED'; direction: 1 | -1 }
  | { type: 'TARGET_READY'; scene: SceneId; prepareToken: PrepareToken }
  | { type: 'MEDIA_READY'; key: MilestoneKey; prepareToken?: PrepareToken; runId?: SegmentRunId }
  | { type: 'PREPARE_TIMEOUT'; segment: SegmentId; prepareToken: PrepareToken }
  | { type: 'BUILD_TIMEOUT'; segment: SegmentId; runId?: SegmentRunId; prepareToken?: PrepareToken }
  | { type: 'PLAYBACK_DONE'; runId: SegmentRunId }
  | { type: 'PLAYBACK_FAILED'; runId: SegmentRunId; error: Error }
  | { type: 'STAGE_PAUSED'; runId: SegmentRunId; segment: SegmentId; stageIndex: number }
  | { type: 'STAGE_RESUMED'; runId: SegmentRunId; segment: SegmentId; stageIndex: number }
  | { type: 'SETTLING_DONE' }
  | { type: 'SEEK'; label: string; source: 'hash' | 'menu' | 'history' }
  | { type: 'SEGMENT_ABORTED'; runId: SegmentRunId; reason: string };
```

规则：

- `playing + INPUT_DELTA`：snap segment 不 reverse、不 seek、不改当前 timeline；只累计 `queuedIntent`（方向、强度、deadline）。scrub segment 仍按 §8.5 直接反向/补完。
- `playing + CHARGE_FIRED`：普通 snap segment 保持 `playing`，只更新 `queuedIntent`；不得开始新 segment。若当前为 `staged-paused`，则把 `CHARGE_FIRED` 解释为 resume / reverse 当前 stagedSnap。
- `queuedIntent` 的 deadline 量纲是 ms。默认 `ttlMs = 420`（沿用 settling 冷却量级），强度衰减复用 charge 的 `decayRatePerMs = 0.001`。进入 hold 时若 `now > deadline` 或衰减后未达阈值则清空；若仍达阈值才转换为下一次 `CHARGE_FIRED`。
- `queuedIntent` 合并策略：同方向输入累加强度并刷新 deadline；反方向输入先抵消强度，穿过 0 后切换方向并刷新 deadline；每次 `INPUT_DELTA` 都按当前时间重新计算 decay 后再合并。
- `settling + INPUT_DELTA`：继续累计 `queuedIntent`。`SETTLING_DONE` 后先推进 cursor 和 LayerWindow，确认窗口成员资格合法，再按 deadline / decay 规则 flush；否则清空并进入 hold。
- `seeking` 可从任意状态进入。进入 seeking 的第一步必须 `segmentPlayer.abort('seek')` 并递增 `activeRunId`，随后忽略旧 run 的 `PLAYBACK_DONE/FAILED`。
- `preparing` 没有 `activeRunId`；只使用 `prepareToken`、`pendingDirection` 和目标 segment。进入 `playing` 后才生成 `activeRunId`。
- `preparing + 反向 INPUT_DELTA`：不直接播放旧目标。Director 记录最新方向；如果准备中的目标未开始播放，取消当前准备并按反方向重新计算目标 hold；如果 forward ready 恰好到来但已被反向 supersede，旧 ready 事件必须被 prepareToken guard 忽略。
- `PLAYBACK_DONE/FAILED/STAGE_PAUSED/STAGE_RESUMED/SEGMENT_ABORTED` 必须 guard `event.runId === context.activeRunId`，否则丢弃；`TARGET_READY/PREPARE_TIMEOUT` 必须 guard `event.prepareToken === context.prepareToken`。
- `BOOT_FAILED`：进入 recovering，落到 manifest 中首个 `staticFallback: true` 的 hold（默认必须是 `hero`），并暴露错误到 HUD；不得停在 booting，不得渲染空层。
- `settling` 内部操作顺序固定为：LayerWindow 成员推进 / retiring 标记 → cursor 更新为目标 hold → URL replaceState → flush queuedIntent。任何一步失败进入 recovery，不提前暴露错误 cursor。

### 5.2 调试与 contract 演进

- runtime 必须维护一个只读 event ring buffer，供 `/harness/devtools` 与失败 trace 导出。每条记录至少包含：DirectorEvent、actorEpoch、activeRunId、prepareToken、queuedIntent、pausePoint、cursor、LayerWindow 成员、media milestone。调试可以读 snapshot，但不能把逐帧 progress/opacity/transform 写回 machine context。
- R3 之前 DirectorEvent / SegmentResult / LayerWindow / visibility predicate 只允许 non-breaking 字段扩展。改名、删字段、改变 tag 语义或改变事件消费顺序都是 breaking contract，必须先写 contract ADR、roll-forward/rollback runbook，并在 R2 合成场景与 R3 truth pass 补回归测试。
- 所有播放顺序事故必须能从 event ring buffer 复盘到 runId 或 prepareToken guard 的判定结果；禁止把“看 console 顺序”作为 DoD。

## 6. SceneModule 契约

```ts
interface SceneModule {
  id: SceneId;
  kind: 'cinematic' | 'reading';
  Component: React.FC<{ layer: LayerHandle }>;
  preload?(ctx: SceneContext): Promise<void>;
  /** 供 Transition 组装 segment 的微时间轴。scene 不自己播它们。 */
  buildIntro?(h: SceneHandle): gsap.core.Timeline;
  buildOutro?(h: SceneHandle): gsap.core.Timeline;
  buildIdle?(h: SceneHandle): gsap.core.Timeline;   // hold 期间由 runtime 播放/暂停
  getSharedElements?(h: SceneHandle): Record<string, HTMLElement>;
  dispose?(h: SceneHandle): void;                    // GPU/媒体释放
}
```

硬规则（ESLint + 类型收口）：

1. Scene 不监听全局输入、不触碰 spine/cursor、不操作其他 scene 的 DOM。
2. **禁止 mount 自淡入**：层的可见性只由 transition timeline 或 LayerWindow 决定（旧站"文案二次入场"教训）。
3. 一切视觉可从任意 progress 幂等重建：`render(0→1→0→1)` 快照一致（reverse / jumpToEnd / recovery 的前提）。
4. join 级 timeline 一律由 runtime 构建与 kill，不进组件 effect；`useGSAP({ scope })` 只用于层内自治小动画。
5. React 时序：Component 用 callback ref 向 HandleRegistry 注册根元素与关键子元素；`registry.ready(sceneId)` = 根 ref + required handles 全量就绪 + preload resolve。`ensureBuilt` 前必须断言 `registry.ready(from) && registry.ready(to)`，否则只能进入 `preparing` 或 recovery，禁止用半空 DOM 构建 timeline。开发、测试、CI 默认开启 StrictMode，双挂载下注册/媒体事件/GSAP context/dispose 必须幂等。

## 7. 提前进场（Pre-mount）协议

### 7.1 层挂载窗口

稳定态 Stage 只挂载 **prev / current / next** 三个 active scene 层（playing 期间即 from、to、再上一个）。settling / abort / seek 交接中允许一个 `retiring` layer 短暂存在，但它不属于 active window，必须 inert + hidden，并在窗口成员资格校验后的下一帧释放。测试口径：active layer ≤3；transient mounted layer ≤4；`retiring` 不得存活过下一次进入 `hold`。

| 时机 | 动作 |
|---|---|
| settling 更新 cursor | next 层 `mount(hidden)` + `preload()` 启动；滑出窗口的层 `dispose()` |
| hold 中蓄力开始（charge > 0） | 校验 `registry.ready(next)` 并启动缺失的 preload；不因未 ready 直接 recovery |
| CHARGE_FIRED | target ready 则 `ensureBuilt(segment)` → playing；未 ready 则进入 `preparing`，超时才 recovery |

**挂载 ≠ 可见**。新挂载层一律 `autoAlpha:0 + inert + visibility:hidden`，可见性只能被 transition timeline 改写。这两条轴（挂载=资源，可见=叙事）分离是本协议的核心。

### 7.2 就绪门（milestones）

- `targetReady`：ref 注册 + preload resolve。进入 playing 的硬前提；未 ready 时先进入 `preparing`，不直接跳过动画。
- `mediaReady`（视频类 scene）：两种消费方式 —— 播放前置门（Director 在 `preparing` 等待，带超时），或 segment 内 `addPause('gate:media')` + 到达后 resume。由 TransitionModule 声明。
- `buildReady`：`ensureBuilt` resolve。进入 playing 的硬前提；`ensureBuilt` reject / timeout 派发 `BUILD_TIMEOUT` 或 `PLAYBACK_FAILED`，进入 recovering。
- 预载失败 / 超时：recovering → `jumpToEnd` 静态终态落位 → hold。若 `jumpToEnd` 自身失败，进入 fallback-hold 子路径：卸载非 fallback layer，挂载 manifest 首个 `staticFallback` hold（默认 `hero`）的静态终态。**永不锁死交互**。
- 每个 media/staged segment 必须声明 `preparingTimeoutMs` 或使用 manifest 默认值；R3 前不得靠 adapter 内部 timeout 自行决定跳转。
- 慢后成功路径是硬契约：`preparing` 期间 target/media 在超时前 ready，必须进入 `playing`，不能跳 `jumpToEnd`，也不能吞掉 queued intent。

### 7.3 连续快速触发

上一次 settling 未结束又蓄力反方向/正方向：prev 层的 dispose 延迟到新 segment 的 playing 建立之后（回滚缓冲不被过早清理）。窗口管理器对 dispose 一律延迟一帧并校验窗口成员资格；如果新 segment 进入 preparing 后 recovery，retiring layer 仍必须按 recovery 落点释放，不能等待一个永远不会发生的 playing。

## 8. from/to 交接与层交替协议（核心）

### 8.1 生命周期与所有权矩阵

单个 scene 层的生命周期：

```txt
unmounted → mounted-hidden(next) → entering(segment 中被 to 引用)
→ current(hold) → exiting(segment 中被 from 引用) → prev(反向缓冲) → unmounted
```

| 阶段 | from 层 | to 层 | 交互(inert) | 输入 |
|---|---|---|---|---|
| hold | = current，可见 | next，hidden | 仅 current 可交互 | innerScroll/charge |
| playing | segment 驱动（outro/位移/遮罩） | segment 驱动（intro/揭示） | **两层皆 inert** | none |
| settling | 降级为 prev，终态由 segment 末帧钉住 | 成为 current | to 解除 inert | none |
| hold(新) | prev，通常 `autoAlpha:0` 但保留挂载 | = current | 仅 current | innerScroll/charge |

不变量（Playwright 逐帧断言）：

- 任意帧**至多两层可见**（from/to），且二者可见性之和受 segment 控制 —— 不存在"双份同一文案"（各层文案互不相干，天然免疫旧 copyOwner 症状）。
- 任意帧恰好 ≤1 层可交互；playing 期间为 0。
- settling 前后各 3 帧无空白帧（segment 末尾必须把 to 层钉在完全可见）。

### 8.2 z-order 与层交替

Stage 维持按 scene id 为 key 的常驻层（窗口内），**角色切换只改 z 与 data-role，不重挂**（canvas/video 实例存活）。z 规则：

- 默认 `to 在 from 之上`（揭示型转场）；transition 可通过 `ctx.stage.setOrder([...])` 声明反转（遮罩擦除型需要 from 在上）。
- z 变更只允许发生在 segment 的 `start` 之前与 `end` 之后（settling），播放中禁止换序（避免中途闪层）。

### 8.3 TransitionModule 契约

```ts
interface TransitionModule {
  segmentId: SegmentId;
  policy: SegmentPolicy;
  requiredMilestones: MilestoneKey[];          // 如 ['targetReady','mediaReady']
  copyCue?: CopyCue;                           // 如 aod/figure3/crane 的 80% 目标文案入场
  mediaPlayback?: MediaPlaybackContract;       // 视频/重媒体 segment 的反向与 recovery 契约
  createTimeline(ctx: TransitionContext): gsap.core.Timeline;
}
interface TransitionContext {
  from: SceneHandle; to: SceneHandle;
  stage: StageHandle;                          // setOrder / overlay 特效画布
  direction: 1 | -1;
  reducedMotion: boolean;
  reportMilestone(key: MilestoneKey): void;
}
```

- Transition 是唯一允许同时引用两个 scene 的地方；组合方式自由：直接编排两层属性、嵌入 `from.buildOutro()` / `to.buildIntro()`、共享元素用 Flip（`getSharedElements` 两端配对，跨层克隆飞行后落点归 to 层）。
- 强制 label：`start / end`，可选 `gate:media`。dev/测试用 `verifySegmentTimeline()` 断言：0 处与 end 处两层状态合法（from 全见/to 全隐 ↔ from 全隐或钉住 / to 全见）。
- `reducedMotion` 分支：所有 segment 必须提供 crossfade 降级（`gsap.matchMedia` 或 ctx 分支），协议不变。

#### 8.3.1 定向 Ink 的唯一边界

- Generic Ink 始终只有两个 canonical live scene roots：`from` 与 `to`。第三层仅是 effect-only WebGL canvas；禁止 SVG mask、DOM snapshot、目标场景纹理或 scene compositor。
- 横向 Ink 的一次 timeline invocation 持有一条由 authored seed 与 `runId` 生成的 32-sample 轮廓。新 invocation（包括反向新运行）生成新轮廓；同一运行只移动 threshold，不逐帧重随机。正向与逆向各自正确，不要求复用同一形状。
- 同一个 ownership threshold 同时驱动目标/保留 DOM 的 `clip-path: polygon(...)` 宏观边界，以及 WebGL 中一次上传的 1×32 单通道轮廓纹理。shader 只叠加有界微侵蚀，不再用独立 procedural seam 把 Ink 前沿甩在目标边界后面。
- 对齐目标是快速播放与慢速观察都没有明显直边漏缝，不承诺逐像素身份。径向和 depth Ink 保留原 contract；`from/to` 不增加位移、模糊或二次文字入场。

### 8.4 反向（direction: -1）

单 Stage 底座让反向变得对称：

- **播放中反向**：只允许 scrub 章节或 manifest 显式标记 `interruptible` 的 segment 使用同一条 timeline `reverse()`；普通 snap segment 播放中不打断，只缓存 intent，落位后再处理。
- **落位后反向**（在 current 顶部边缘反向蓄力）：上一 segment 仍在窗口内（prev 缓冲）→ `ensureBuilt` 命中缓存或重建 → `play(id, -1)`（内部 `progress(1)` 后 `reverse()`）→ 完成后 cursor 回退，层窗口反向滑动。
- 不存在旧站的 "un-present 同帧交接"：没有 native/fixed 两份 DOM，反向只是把同一层的可见性倒回去。前提仍是 §6.3 幂等渲染，harness 对每个 cinematic scene 跑 `0→1→0→1` 往返快照。

### 8.5 scrub 章节（仅在 manifest 显式声明时启用）

- hold 在章节起点时，输入路由切到 scrub：累积 delta → `segmentPlayer.scrub(id, p)`。
- 输入停止 idle N ms → snap：`tweenTo` 最近端点（过半向前补完，未过半回退），随后按普通落位走 settling。
- 反向拖回 0 即回到 from 的 hold。scrub 章节天然可打断、可往返，对 renderer 的幂等要求与 snap 相同。

## 9. 阅读区、URL 与可访问性（虚拟滚动的代价，显式偿还）

- **阅读层内部滚动**：reading scene 的层内容器 `overflow-y: auto`，原生滚动（触控、惯性、无障碍免费）。Director 只在"层已到边缘且输入继续同向"时才把输入转为 charge；未到边缘的 wheel 不 preventDefault，交给容器。
- **URL 同步**：settling 时 `history.replaceState('#'+sceneId)`；直达 hash / 前进后退 → seeking：卸载当前窗口 → 挂载目标窗口 → cursor 置位 → hold。无需合成中间状态。
- **SEO / 无 JS**：Vite 的 `static-story-shell` build plugin 已把 public copy、metadata、导航和 canonical ids 注入 `dist/index.html`。JS 禁用时 static shell 保持可见和可滚动；hydration 成功后才由 StoryApp 隐藏 shell。
- **键盘**：PageDown/Space/↓ = 触发下一 segment（等价蓄力满），↑ 反向；Tab 焦点被 inert 天然约束在 current 层。
- **屏幕阅读器**：层是真实 DOM；非 current 层 inert + aria-hidden；scene 切换时移焦到新层标题。提供 `prefers-reduced-motion` 全局降级。
- **无滚动条**：HUD 提供章节进度指示（基于 spine 虚拟时间）+ 章节菜单（label 导航）。

## 10. 验证策略

| 类别 | 手段 |
|---|---|
| 契约 | TS 类型 + ESLint 定制规则。R0 error：scene 禁全局输入监听、machine 禁 progress/opacity/transform；禁 mount 自淡入先由 fixture/checklist + Stage 可见性测试约束，R2 后再升 error |
| Director / charge / router | Vitest 模拟时钟：全部状态转移、边缘蓄力、快速连触、recovery 超时 |
| segment 合法性 | `verifySegmentTimeline()`：label、两端层状态、reducedMotion 分支存在 |
| 幂等渲染 | harness 快照：每个 cinematic scene `0→1→0→1` |
| 三大历史症状 | Playwright：settling 前后逐帧截图（无空白帧/无双层残影）、正反向全程、hash 直达、reduced-motion |
| 文案 | R-1/R0 从 `src/sections/*.html` 与构建产物生成 copy baseline；Vitest 渲染各 scene 提取文本逐字 diff |
| 参数 | manifest 数据与旧 `section-manifest.mjs` 的顺序/时长/文案映射一次性 diff |
| Production | release Playwright matrix：完整正向/反向、全部 hash、真实输入、recovery、TTG 媒体与旧路径不可达 |
| SEO / no-JS | build extractor + JavaScript-disabled Chromium/WebKit projects |
| 性能 | build budgets + hardware Chrome LCP/frame/heap + OS process-tree RSS/GPU process + dispose counters |

R2 验收只能证明合成场景协议；R3 pilot 是第一次真实媒体、真实 copyCue、真实 React effect / 媒体事件的 truth pass。R3 如果暴露 R2 未覆盖的 milestone 或 abort 语义，必须写入 `docs/react-refactor/contract-diff/R3-pilot.md`，再决定是否回补 R2 contract；不得在 R3 私下 fork 协议。

执行纪律：一任务一 commit；commit 前跑对应测试 + 全量 Vitest；阶段收口跑 Playwright + 手工检查三大症状（**无重复入场、无交接空白、无黑闪**）。
