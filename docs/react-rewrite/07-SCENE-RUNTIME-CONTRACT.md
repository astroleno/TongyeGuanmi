# SceneRuntime 契约

本文档是 React 重写的最高优先级契约。其他文档如果与本文冲突，以本文为准。

## 设计来源

### 从 Shopify 学到的部分

我们不照搬 Shopify 的 Rive、Theatre、R3F 或具体资源栈，只吸收它真正解决问题的结构：

- 一个中央 scene state 决定当前画面。
- 所有视觉层、文案层、canvas/mask/video 层只读取同一份 state。
- 每一段转场都有明确的 `from`、`to`、`progress`、`commitAt`。
- 同一帧里，每个 layer 只有一个 owner。
- 目标内容不是转场结束后临时再补上的第二套 presentation，而是转场事务的一部分。

本地研究资料对 Shopify 的安全结论是“中央 section state 驱动多渲染层”。具体库栈不是本项目契约的一部分。即使 Shopify 当前或某个版本使用 Zustand、Theatre.js、Rive、Three.js、Anime.js、Next.js 或 Remix，也不能推出本项目需要采用同样依赖。

可采信为架构原则：

- central section/scene state
- stable scene identity
- current/next scene
- transition progress
- render layers 订阅同一份状态
- target presentation 与 transition commit 不分裂

不作为实施依据：

- “Rive 驱动全部动画”
- “全站只有一个 scrollPercentage”
- “完全无 pin/snap”
- “没有 GSAP”
- “DOM 只承载文本”
- “必须使用 Zustand / Theatre.js / Anime.js / Three.js”

### 本项目自己的硬约束

以下约束主要来自本项目前几轮失败根因，不是因为 Shopify 已经证明了同样实现：

- 禁止 handoff receiver 式 adopt/restore 真实目标 DOM。
- timeline-owned copy 必须跳过 global reveal。
- CSS gate 只能反映 runtime state，不能决定 scene 是否 committed。
- adapter 只报告 progress/ended/error，不决定 target copy 是否呈现。

### 有意不照搬 Shopify 的部分

Shopify 更接近连续滚动 progress 映射；本项目先验证离散触发 + 时间驱动 segment：

```txt
scene 内阅读
-> 10vh intent
-> scroll lock
-> segment progress 0..1
-> target commit
-> release
```

这是有意选择，不是对 Shopify 的误读：

- 当前页面需要动画自动播放和章节转场仪式感。
- 旧系统的问题不是 playback 本身，而是 playback、copy reveal、DOM receiver、CSS gate 没有共同 owner。
- 离散 segment 更容易把 media rejected、reduced motion、hash/back/forward 纳入同一 FSM。

如果 Phase 0 或 Phase 1 证明 scroll lock 在移动端 momentum、快速 wheel 或浏览器恢复路径上不可控，再评估把部分 segment 改成 continuous progress policy。无论 progress policy 如何变化，layer ownership contract 不变。

### 从 baseline 学到的部分

只吸收 baseline 里成功的工程范式：

- 常量集中：滚动距离、阶段长度、阈值放进命名常量。
- 纯函数派生：把 `scrollPx`、viewport、segment progress 转成可测试的 view model。
- 入口清爽：`App.tsx` 只挂 runtime 和 scenes，不让 section 互相调用来推进全局流程。
- section 自包含：视觉组件可以自管渲染细节，但不能自管全局 scene commit。

明确不吸收：

- 不复制 baseline 的容器内视频播放范式。
- 不让视频容器成为转场调度者。
- 不把 React state 的高频滚动更新当作主动画循环。

## 核心模型

SceneRuntime 只认两类东西：

```txt
scene：一个满屏页面或动画舞台
segment：从一个 scene 到下一个 scene 的动作
```

scene 不是 `reading / animation / transition` 三分类。是否有文案、视频、canvas、内部阶段，只是 scene 的 capability。

segment 只能是下面四类：

```ts
type SegmentType =
  | 'ink-transition'
  | 'media-animation'
  | 'text-read'
  | 'compound-sequence';
```

## Runtime State

```ts
type RuntimePhase =
  | 'IDLE'
  | 'ARMED'
  | 'SNAP_LOCKING'
  | 'PLAYING'
  | 'PRESENTING'
  | 'RELEASING';

interface SceneRuntimeState {
  phase: RuntimePhase;
  activeScene: SceneId;
  nextScene: SceneId | null;
  activeSegment: SegmentId | null;
  activeStep: SegmentId | null;
  segmentProgress: number;
  committedScene: SceneId;
  direction: 1 | -1;
  layerOwnership: LayerOwnership;
  scrollLock: ScrollLockState;
  lastEvent: string | null;
  lastIgnoredEvent: string | null;
  ownerConflict: OwnerConflict | null;
  runtimeError: RuntimeError | null;
  recoveryMode: 'none' | 'owner-conflict' | 'adapter-error' | 'scroll-lock-recovery';
}

interface LayerOwnership {
  visualOwner: SceneId | SegmentId;
  copyOwner: SceneId | SegmentId | 'none';
  canvasOwner: SceneId | SegmentId | 'none';
  maskOwner: SceneId | SegmentId | 'none';
  mediaOwner: SceneId | SegmentId | 'none';
}

interface RuntimeError {
  type: 'owner-conflict' | 'adapter-error' | 'scroll-lock-timeout' | 'manifest-error';
  message: string;
  lastSafeScene: SceneId;
}

interface ScrollLockState {
  locked: boolean;
  snapshot: ScrollLockSnapshot | null;
}

interface ScrollLockSnapshot {
  scrollY: number;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyWidth: string;
  touchAction: string;
}
```

`activeScene` 是当前用户所处 scene。`nextScene` 从 ARMED 起存在，到 RELEASING 完成时清空。`committedScene` 是已经完成 presentation 事务、允许原生阅读/滚动的 scene。

## 不变量

任何一帧都必须满足：

1. 只有一个 runtime phase。
2. 只有一个 `activeSegment` 可以推进。
3. `segmentProgress` 只能由 active segment 的 policy 推进。
4. 每个 layer 只有一个 owner。
5. timeline-owned copy 不再交给全局 reveal。
6. segment 完成和目标 scene commit 是同一个 runtime 事务。
7. transition layer 不移动真实目标 DOM；可以画视觉桥，但 native copy 留在 native scene。
8. CSS 只反映 runtime state，不决定 scene 是否已经 consumed/committed。

## Ownership Conflict Policy

layer ownership 冲突必须被 runtime 检测，不能靠人工约定。

```ts
interface OwnerConflict {
  layer: keyof LayerOwnership;
  currentOwner: SceneId | SegmentId | 'none';
  requestedOwner: SceneId | SegmentId | 'none';
  segment: SegmentId | null;
}

interface LayerOwnershipClaim {
  layer: keyof LayerOwnership;
  owner: SceneId | SegmentId | 'none';
  reason: 'manifest' | 'segment-default' | 'runtime-reveal' | 'recovery';
  segment: SegmentId | null;
}
```

处理规则：

- owner 只能来自 manifest/default resolver/runtime reveal/recovery claim。
- Manifest 启动校验阶段：冲突直接 fail fast，阻止启动。
- 开发环境运行时：先执行 recovery，再抛出显式错误，并在 debug overlay 标记 `ownerConflict`。
- 用户/生产运行时：不裸 throw；进入 recovery path。
- Recovery 必须先释放 scroll lock，再回到 `committedScene`，清空 `nextScene`、`activeSegment` 和 transient owner。
- Recovery 后 debug overlay 显示 `runtimeError` 和 `lastSafeScene`。

任何错误路径都不能留下：

- 锁住的 body/touch 状态。
- 同时可见的 preview copy 与 native copy。
- `phase=PLAYING` 但没有 active segment。
- `committedScene` 与 native anchor 不一致。

## Scene Definition

```ts
interface SceneDefinition {
  id: SceneId;
  label: string;
  minHeightVh: number;
  capabilities: {
    copy?: 'native' | 'runtime-preview' | 'none';
    media?: MediaAsset[];
    canvas?: CanvasAdapterId[];
    stickyStage?: boolean;
  };
  anchors?: {
    hash?: string;
    nav?: string;
  };
}
```

Canonical scenes：

```txt
hero
pattern-top
pattern-bottom
aod-animation
method-top
method-bottom
figure2-animation
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

如果之后需要 `belief-star` 或其他中间文案，必须先进入这张 canonical scene list，不能在组件里临时出现。

## Segment Definition

### text-read

用于普通文案段落阅读。滚动只负责阅读和在尾部累计 10vh intent。

```ts
interface TextReadSegment {
  id: SegmentId;
  type: 'text-read';
  from: SceneId;
  to: SceneId;
  readHeightVh: number;
  armAfterVh: 10;
}
```

### ink-transition

用于 scene 到 scene 的墨滴转场。进度由时间驱动，不由 scroll scrub。

```ts
interface InkTransitionSegment {
  id: SegmentId;
  type: 'ink-transition';
  from: SceneId;
  to: SceneId;
  durationMs: number;
  ink: {
    kind: 'horizontal' | 'radial' | 'pattern-rotate';
    direction?: 'bottom-up' | 'top-down';
    origin?: 'center' | 'left' | 'ph-sun' | { x: number; y: number };
  };
  commitAt: 'end';
  layerOwnership: LayerOwnership;
}
```

### media-animation

用于动画 scene 内部播放。视频只是 media adapter，不能成为 runtime owner。

```ts
interface MediaAnimationSegment {
  id: SegmentId;
  type: 'media-animation';
  from: SceneId;
  to: SceneId;
  durationPolicy: 'media-ended' | 'fixed-duration' | 'adapter-complete';
  reveal?: {
    atProgress: number;
    targetScene: SceneId;
    targetLayer: 'copy';
  };
  fallback: {
    onPlayRejected: 'show-poster-and-complete' | 'use-scrub-fallback';
    onMetadataTimeout: 'show-poster-and-complete' | 'use-fixed-duration';
    onEndedTimeout: 'force-complete-and-commit' | 'show-error-and-recover';
    onMissingMedia: 'show-poster-and-complete' | 'recover-to-committed-scene';
    reducedMotion: 'poster-and-skip' | 'short-fade';
  };
}
```

### compound-sequence

用于 pattern、figure2、TTG/PH 出场这类包含多个动作的片段。compound 只是 segment 的组合，不能绕过外层 FSM。

```ts
interface CompoundSequenceSegment {
  id: SegmentId;
  type: 'compound-sequence';
  from: SceneId;
  to: SceneId;
  steps: SegmentId[];
  commitAt: 'last-step-end';
  cancelPolicy: 'finish-current-step-then-release';
  hashPolicy: 'jump-to-committed-scene';
}
```

## Scroll Contract

滚动只做两件事：

1. 普通文案段落阅读。
2. 用户在 scene 尾部继续滚动 10vh 后，触发下一个 segment。

滚动不得驱动：

- 墨滴转场进度。
- 视频 currentTime。
- compound-sequence 内部播放进度。
- 目标 copy 是否 commit。

允许使用 `scrollPx -> pure derived progress` 的地方只有：

- scene 内部非关键装饰，如 hero fade。
- text-read 内部阅读视差。
- ARMED 之前的 intent indicator。

## FSM Event Table

| Phase | 允许事件 | 动作 | 下一状态 |
| --- | --- | --- | --- |
| IDLE | scene 内自然滚动 | 更新 text-read view model | IDLE |
| IDLE | scene 尾部累计 10vh | 选择 next segment | ARMED |
| ARMED | 继续前进 | 锁定滚动，记录 from/to/segment | SNAP_LOCKING |
| ARMED | 回退超过阈值 | 清空 next segment | IDLE |
| SNAP_LOCKING | 对齐完成 | segment progress = 0，分配 layer owner | PLAYING |
| PLAYING | segment complete | 原子提交 `committedScene = to` | PRESENTING |
| PLAYING | media play rejected | 执行 segment fallback | PRESENTING |
| PRESENTING | target 已提交 | 准备释放锁和 transient owner | RELEASING |
| RELEASING | release 完成 | 清空 transient owner | IDLE |

全局事件：

| Any Phase | 事件 | 动作 | 下一状态 |
| --- | --- | --- | --- |
| any | `HASH_NAVIGATE` | 停止 active segment，恢复锁，跳到 hash scene | IDLE |
| any | `POPSTATE_NAVIGATE` | 停止 active segment，恢复锁，跳到 history scene | IDLE |
| any | `UNMOUNT` | 停止 adapter，恢复锁，清理 listener | IDLE |
| any | `OWNER_CONFLICT` | recovery 到 last committed scene，记录 runtimeError | RELEASING |
| any | `SCROLL_LOCK_RECOVERY` | 强制恢复 body/touch/scroll snapshot | IDLE |

`PLAYING -> PRESENTING` 这一跳必须同时完成目标 scene commit 和 layer owner 归还，不能把 copy reveal 留给下一帧的组件副作用。

所有 segment 都必须有 `from` 和 `to`。`media-animation` 也是普通 segment：例如 `aod-animation -> method-top`，在 PLAYING 中播放媒体，完成后 commit 到 `to`。PRESENTING 不启动新动作，只负责呈现已提交的目标 scene 并进入释放。

## RenderLayerHost

React 入口应有一个固定的 render host：

```txt
SceneRuntimeProvider
  RenderLayerHost
    VisualLayer
    CopyLayer
    CanvasLayer
    MaskLayer
    MediaLayer
  SceneDocumentFlow
```

`RenderLayerHost` 根据 `SceneRuntimeState.layerOwnership` 决定每层显示谁。scene 组件只能声明自己需要的 layer，不直接改全局 owner。

## Debug Contract

开发模式必须提供 runtime overlay，至少显示：

```txt
phase
activeScene
nextScene
committedScene
activeSegment
activeStep
segmentProgress
visualOwner / copyOwner / canvasOwner / maskOwner / mediaOwner
scrollLock
lastEvent
lastIgnoredEvent
ownerConflict
runtimeError
recoveryMode
```

这比单纯 console log 更重要，因为前 7 次失败主要发生在“看起来已经完成，但某个 owner 还没交接”的帧。

## Phase 1 必须证明的事

Phase 1 不再只是 hero 到 method 的视觉 spike，而是验证这份契约：

1. `scenes[] + segments[]` 能完整表达 hero → method-bottom。
2. pattern-top / pattern-bottom 是 scene，连接它们的是 segment，不再叫 transition scene。
3. AOD 80% method 文案提前入场由 runtime reveal event 触发，不由 AOD 组件直接 set parent state。
4. 锁滚动、解锁、play rejected、hash 直达、快速滚动至少有可验证路径。
5. timeline-owned copy 不被全局 reveal 再隐藏。
