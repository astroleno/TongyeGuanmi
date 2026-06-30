# React 技术架构设计

本架构以 `SceneRuntime` 为核心。React 负责声明组件和渲染层，不负责让局部组件私自推进全局路线。

## 技术栈

```json
{
  "runtime": "React + TypeScript + Vite",
  "animation": "GSAP core 可选，仅用于时间缓动，不使用 ScrollTrigger",
  "tests": "Vitest + React Testing Library",
  "canvas": "优先包装现有 vanilla canvas/WebGL factory"
}
```

暂不引入 Rive、Theatre、React Three Fiber。Shopify 的启发是中央状态和层归属，不是具体库。

## 项目结构

```txt
src/
├── App.tsx
├── runtime/
│   ├── SceneRuntimeProvider.tsx
│   ├── sceneRuntimeReducer.ts
│   ├── sceneRuntimeTypes.ts
│   ├── segmentRunner.ts
│   ├── layerOwnership.ts
│   ├── scrollIntent.ts
│   ├── scrollLock.ts
│   └── debugOverlay.tsx
├── manifest/
│   ├── scenes.ts
│   ├── segments.ts
│   └── validateManifest.ts
├── render-host/
│   ├── RenderLayerHost.tsx
│   ├── VisualLayer.tsx
│   ├── CopyLayer.tsx
│   ├── CanvasLayer.tsx
│   ├── MaskLayer.tsx
│   └── MediaLayer.tsx
├── scenes/
│   ├── HeroScene.tsx
│   ├── PatternBloomScene.tsx
│   ├── BeliefStarScene.tsx
│   ├── AodScene.tsx
│   ├── MethodTopScene.tsx
│   ├── MethodBottomScene.tsx
│   ├── Figure2Scene.tsx
│   └── ...
├── adapters/
│   ├── ink/
│   ├── pattern/
│   ├── media/
│   └── figure2/
├── constants/
│   ├── sceneBounds.ts
│   ├── timing.ts
│   └── assets.ts
└── content/
    └── homepageContent.ts
```

## 数据流

```txt
window scroll/touch/wheel
  -> scrollIntent.ts
  -> SceneRuntime event
  -> sceneRuntimeReducer
  -> segmentRunner
  -> LayerOwnership resolver
  -> RenderLayerHost
  -> scenes/adapters render from props
```

禁止反向数据流：

```txt
Scene component -> parent setState -> jump to next scene
Video ended -> component directly sets currentScene
Canvas adapter -> writes DOM classes to hide target copy
CSS gate -> decides committed scene
```

## Frozen Scene Graph

Phase 4.0A 后，scene graph 只从 `react-runtime-spike/src/manifest/realManifest.ts` 读取：

```txt
hero
  -> pattern-bloom
  -> belief-star
  -> aod-animation
  -> method-top
  -> method-bottom
  -> figure2-animation
  -> brand
  -> figure3-animation
  -> services
  -> ttg-animation
  -> lab
  -> ph-animation
  -> education
  -> crane-animation
  -> contact
```

`star-map`、method 内部五段 id、Figure2 proof cards/closing 都不能作为组件私有 top-level scene id 注入 runtime。

## Runtime Store 策略

Phase 0 先用最小 store：

```txt
SceneRuntimeProvider + reducer + dispatch
```

但 store 实现不是契约核心。契约核心是：

- 只有一份 canonical runtime state。
- 所有 render layer 订阅同一份 state。
- layer ownership 只能由 reducer/ownership resolver 改。
- target commit 是原子事务。

实现约束：

- `segmentProgress` 是高频值，不能导致整棵 React tree 高频 rerender。
- DebugOverlay 可以订阅完整 state；普通 scene 只能订阅自己需要的 view model。
- 如果 Context reducer 造成明显重渲，可切到 `useSyncExternalStore` 或 Zustand。
- 不因为 Shopify 可能用了 Zustand 就提前引入 Zustand。

## Runtime Types

```ts
export type RuntimePhase =
  | 'IDLE'
  | 'ARMED'
  | 'SNAP_LOCKING'
  | 'PLAYING'
  | 'PRESENTING'
  | 'RELEASING';

export type SegmentType =
  | 'text-read'
  | 'ink-transition'
  | 'media-animation'
  | 'compound-sequence';

export interface SceneRuntimeState {
  phase: RuntimePhase;
  activeScene: SceneId;
  nextScene: SceneId | null;
  committedScene: SceneId;
  activeSegment: SegmentId | null;
  activeStep: CompoundStepId | null;
  segmentProgress: number;
  direction: 1 | -1;
  layerOwnership: LayerOwnership;
  scrollLock: ScrollLockState;
  lastEvent: string | null;
  lastIgnoredEvent: string | null;
  ownerConflict: OwnerConflict | null;
  runtimeError: RuntimeError | null;
  recoveryMode: 'none' | 'owner-conflict' | 'adapter-error' | 'scroll-lock-recovery';
}

export interface LayerOwnership {
  visualOwner: SceneId | SegmentId;
  copyOwner: SceneId | SegmentId | 'none';
  canvasOwner: SceneId | SegmentId | 'none';
  maskOwner: SceneId | SegmentId | 'none';
  mediaOwner: SceneId | SegmentId | 'none';
}
```

## Reducer

`sceneRuntimeReducer` 是唯一能改变 phase、activeScene、committedScene、layerOwnership 的地方。

```ts
type RuntimeEvent =
  | { type: 'SCROLL_WITHIN_SCENE'; scrollPx: number }
  | { type: 'TEXT_READ_PROGRESS'; segment: SegmentId; progress: number }
  | { type: 'TEXT_READ_COMPLETE'; segment: SegmentId }
  | { type: 'SCROLL_INTENT_10VH'; scene: SceneId; segment: SegmentId }
  | { type: 'FORWARD_CONFIRM' }
  | { type: 'REVERSE_CANCEL' }
  | { type: 'SNAP_DONE' }
  | { type: 'SNAP_FAILED'; reason: string }
  | { type: 'SEGMENT_PROGRESS'; segment: SegmentId; progress: number }
  | { type: 'SEGMENT_COMPLETE'; segment: SegmentId }
  | { type: 'STEP_COMPLETE'; step: CompoundStepId }
  | { type: 'MEDIA_PROGRESS'; segment: SegmentId; progress: number }
  | { type: 'MEDIA_REJECTED'; segment: SegmentId; reason: string }
  | { type: 'MEDIA_METADATA_TIMEOUT'; segment: SegmentId }
  | { type: 'MEDIA_ENDED_TIMEOUT'; segment: SegmentId }
  | { type: 'MEDIA_MISSING'; segment: SegmentId; src: string }
  | { type: 'SEGMENT_ERROR'; segment: SegmentId; reason: string }
  | { type: 'REDUCED_MOTION_SKIP' }
  | { type: 'COMMIT_PRESENTED' }
  | { type: 'RELEASE_COMPLETE' }
  | { type: 'HASH_NAVIGATE'; scene: SceneId }
  | { type: 'POPSTATE_NAVIGATE'; scene: SceneId }
  | { type: 'UNMOUNT' }
  | { type: 'OWNER_CONFLICT'; conflict: OwnerConflict }
  | { type: 'SCROLL_LOCK_RECOVERY'; reason: string };
```

非法事件只更新 `lastIgnoredEvent`。不能“顺手”改 phase。

Progress 事件规则：

- timer/canvas/compound runner dispatch `SEGMENT_PROGRESS`。
- media adapter dispatch `MEDIA_PROGRESS`。
- reducer 是唯一写入 `state.segmentProgress` 的地方。
- `MEDIA_PROGRESS` 不能绕过 reducer 直接改 scene 或 copy owner。
- 80% copy reveal 不使用单独 adapter event；`applySegmentProgress()` 根据 manifest 的 `reveal.atProgress` 执行一次 `runtime-reveal` ownership action。

## Layer Ownership Resolver

所有 layer owner 都从 manifest/default resolver 生成，scene component 不能直接声明自己“抢到”owner。

```ts
interface LayerOwnershipClaim {
  layer: keyof LayerOwnership;
  owner: SceneId | SegmentId | 'none';
  reason: 'manifest' | 'segment-default' | 'runtime-reveal' | 'recovery';
  segment: SegmentId | null;
}

interface LayerOwnershipResult {
  ownership: LayerOwnership;
  conflict: OwnerConflict | null;
}

function resolveLayerOwnership(input: {
  state: SceneRuntimeState;
  activeScene: SceneDefinition;
  nextScene: SceneDefinition | null;
  activeSegment: SegmentDefinition | null;
  claims: LayerOwnershipClaim[];
}): LayerOwnershipResult;
```

规则：

- manifest-time conflict 阻止启动。
- runtime conflict dispatch `OWNER_CONFLICT`。
- development recovery 后 throw；production recovery 后记录 error。
- recovery owner 回到 `committedScene`，copy/canvas/mask/media transient owner 清空。

## Segment Runner

`segmentRunner` 只负责执行 playback segment 的副作用：

- scroll lock / unlock
- timer progress
- canvas adapter start/stop
- media adapter start/stop
- compound step sequencing

它不能直接 `setState`。它只能 dispatch runtime events。

`text-read` 不进入 segmentRunner。它由 IDLE 内的 reading policy 和 document flow/anchor 处理。

```ts
interface SegmentRunner {
  start(segment: SegmentDefinition, state: SceneRuntimeState): void;
  stop(reason: 'complete' | 'cancel' | 'hash' | 'unmount'): void;
}
```

## RenderLayerHost

```tsx
export function App() {
  return (
    <SceneRuntimeProvider scenes={SCENES} segments={SEGMENTS}>
      <RenderLayerHost />
      <SceneDocumentFlow />
      <RuntimeDebugOverlay />
    </SceneRuntimeProvider>
  );
}
```

`RenderLayerHost` 的职责：

- 根据 layer owner 渲染当前 visual/copy/canvas/mask/media。
- 保持 fixed stage 稳定，避免每个 scene 自己 fixed/pin。
- 在 debug 模式显示 owner 和 segment progress。

`SceneDocumentFlow` 的职责：

- 放原生文档流、anchors、可访问内容。
- 对 timeline-owned copy 加 `data-runtime-owned-copy`，让全局 reveal 跳过。
- 不参与转场 layer ownership。

## Scene Component Contract

scene 组件只接受 view model：

```ts
interface SceneViewProps {
  sceneId: SceneId;
  phase: RuntimePhase;
  isCommitted: boolean;
  isActiveVisual: boolean;
  isCopyOwner: boolean;
  segmentProgress: number;
  reducedMotion: boolean;
}
```

scene 组件允许：

- 根据 props 渲染视觉。
- 使用 ref 初始化 canvas/media adapter。
- 把 adapter 事件交给 runtime dispatch。

scene 组件禁止：

- 直接修改 `currentScene`。
- 直接 reveal 下一个 scene copy。
- 移动真实目标 DOM。
- 写入全局 body class 作为逻辑状态。

## Scroll Intent

`scrollIntent.ts` 借鉴 baseline 的纯函数范式：

```ts
export const INTENT_THRESHOLD_VH = 10;

export function deriveScrollIntent(input: {
  sceneTop: number;
  sceneBottom: number;
  scrollY: number;
  viewportHeight: number;
  normalizedDeltaVh: number;
  source: 'wheel' | 'touch' | 'keyboard' | 'programmatic';
  phase: RuntimePhase;
}): 'none' | 'arm-next' | 'confirm-next' | 'cancel-armed' {
  // 纯函数，可单测
}
```

`viewportHeight` 必须来自与 `100dvh` / `visualViewport` 对齐的 helper，不能裸用不稳定的 `innerHeight`。快速滚动只能消费一个 next segment；多余 delta 在 PLAYING/PRESENTING 中忽略。

只有 `text-read` 和 intent indicator 能使用 scene 内滚动 progress。转场 progress 不从这里来。

## Scroll Lock

`scrollLock.ts` 必须保存并恢复完整状态：

```ts
interface ScrollLockSnapshot {
  scrollY: number;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyWidth: string;
  touchAction: string;
}
```

要求：

- SNAP_LOCKING 进入时保存 snapshot。
- RELEASING/异常/hash/popstate/unmount 时必须恢复。
- iOS touchmove 锁定和 visualViewport resize 要纳入测试。

## Adapters

### Ink Adapter

优先包装现有 `js/effects/ink-scene-transition.js` 的 WebGL/factory 能力，不把它误写成不存在的 2D `renderInkFrame`。

```ts
interface InkAdapter {
  mount(canvas: HTMLCanvasElement, config: InkSegmentConfig): void;
  setProgress(progress: number): void;
  destroy(): void;
}
```

### Pattern Adapter

优先从现有 `js/pattern-mirror-stage.js` / pattern bloom factory 抽包装层。`pattern-bloom` / `belief-star` 的 scene identity 由 manifest 决定，不由 adapter 内部命名。

### Media Adapter

不复制 baseline 的“容器里视频播放”范式。

```ts
interface MediaAdapter {
  prepare(): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  resetToPoster(): void;
  onProgress(callback: (progress: number) => void): void;
  onEnded(callback: () => void): void;
  onRejected(callback: (error: unknown) => void): void;
  onMetadataTimeout(callback: () => void): void;
  onEndedTimeout(callback: () => void): void;
  onMissingMedia(callback: (src: string) => void): void;
}
```

视频只是被 runtime 启动和监听的 adapter。80% 文案 reveal 是 runtime event。

### Compound Adapter

compound sequence 不需要独立 global state。它只维护当前 step，并向 runtime dispatch `STEP_COMPLETE`。

## Manifest Validation

启动前必须验证：

- 每个 segment 的 `from/to` 都存在于 `scenes[]`。
- 每个 scene 除最后一个外都有下一条 segment。
- 没有孤儿 scene。
- 没有组件私有 scene id。
- 每条非 `text-read` segment 都显式声明五层 layerOwnership。
- `compound-sequence.steps` 是内部 step，不进入 top-level `scenes[]`。
- timeline-owned copy 已标记跳过 global reveal。

## Debug Overlay

开发模式默认开启：

```txt
phase
activeScene
nextScene
committedScene
activeSegment
activeStep
segmentProgress
visualOwner
copyOwner
canvasOwner
maskOwner
mediaOwner
scrollLock
lastEvent
lastIgnoredEvent
ownerConflict
runtimeError
recoveryMode
```

这是本轮从 Shopify 和项目根因文档里学到的关键工具：不要再靠肉眼猜“到底谁拥有这帧”。

## Phase 1 架构验收

Phase 1 不以“能播完视频”为验收核心，而以 runtime 契约为核心：

1. `hero -> contact` 全链路全部由 manifest 驱动。
2. `pattern-bloom` 和 `belief-star` 是 canonical scene，`star-map` 不是 top-level scene id。
3. AOD 80% 文案提前入场由 runtime ownership 改变实现。
4. debug overlay 能在每个边界显示正确 owner。
5. 快速滚动、hash 直达、media rejected、reduced motion 不会留下滚动锁或空白 copy。
