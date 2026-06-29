# Phase 0 契约验证计划

Phase 0 的目标不是还原首页视觉，而是证明 `SceneRuntime` 契约可以执行。

如果 Phase 0 失败，不进入 hero -> method 的视觉迁移。

## 为什么需要 Phase 0

`07-SCENE-RUNTIME-CONTRACT.md` 引入了新的 load-bearing decision：

- scene/segment 二元模型
- 固定 FSM
- layer ownership
- timeline-owned copy 跳过 global reveal
- debug overlay
- scroll lock snapshot/recovery

这些是前 7 次路线失败的根因修复。如果直接进入 Phase 1，可能会在接入 Pattern/AOD 视觉时才发现 runtime 契约无法执行，返工成本更高。

## 范围

Phase 0 只做 fake scenes，不接真实 Pattern/AOD/WebGL/video。

```txt
fake-a
-> fake ink-transition
fake-b
-> fake media-animation at 80% reveal
fake-c
```

必须覆盖：

- `IDLE -> ARMED -> SNAP_LOCKING -> PLAYING -> PRESENTING -> RELEASING -> IDLE`
- `activeScene / nextScene / committedScene`
- `activeSegment / segmentProgress`
- `visualOwner / copyOwner / canvasOwner / maskOwner / mediaOwner`
- `scrollLock`
- `lastEvent / lastIgnoredEvent`

## 交付物

```txt
src/runtime/sceneRuntimeTypes.ts
src/runtime/sceneRuntimeReducer.ts
src/runtime/layerOwnership.ts
src/runtime/segmentResolver.ts
src/runtime/scrollIntent.ts
src/runtime/scrollLock.ts
src/runtime/debugOverlay.tsx
src/manifest/fakeScenes.ts
src/manifest/fakeSegments.ts
src/manifest/validateManifest.ts
src/render-host/RenderLayerHost.tsx
src/scenes/FakeScene.tsx
```

## 不做什么

- 不接真实视频。
- 不接真实墨滴 WebGL。
- 不接 Pattern/AOD/figure2。
- 不做视觉还原度验收。
- 不引入 Theatre.js、Rive、Three.js、Anime.js。
- 不因为 Shopify 可能使用某个库就引入该库。

## Runtime Store

Phase 0 先用最小实现：

```txt
SceneRuntimeProvider + reducer + dispatch
```

但要保持可替换：

- high-frequency `segmentProgress` 不应导致整棵 React tree 高频 rerender。
- 如果 reducer/context 造成明显 rerender，可在实现阶段切到 `useSyncExternalStore` 或 Zustand。
- store 选择不是契约核心；契约核心是唯一 state、唯一 owner、唯一 commit transaction。

## Shopify 经验如何落地

本地资料能确认的安全结论是：

```txt
Shopify 有中央 section/background state；
多渲染层读取同一个 section/transition state；
scene identity 稳定；
current/next/progress/ownership 不靠局部 adapter 猜。
```

Phase 0 不验证 Shopify 的具体库栈。Next.js、Zustand、Theatre.js、Anime.js、Three.js、Rive 都不是本项目 Phase 0 的必要前提。

## 有意偏离 Shopify 的地方

Shopify 更接近连续滚动 progress 映射；本项目 Phase 0 验证离散触发：

```txt
普通阅读滚动
-> scene 尾部 10vh intent
-> 锁滚动
-> segment 时间驱动 0..1
-> commit
-> release
```

这是有意选择，不是误解 Shopify。

原因：

- 当前首页目标是动画自动播放和章节仪式感，不是所有 transition 都随滚动 scrub。
- 旧系统失败的关键不是 playback 本身，而是 playback、copy reveal、DOM receiver、CSS gate 没有共同 owner。
- 离散触发更容易让 video/canvas/media fallback 统一进 FSM。

Phase 0 必须同时验证这个选择的风险：

- 快速 wheel 不会连续吞多个 segment。
- 移动端 touch/momentum 不会留下锁。
- hash/back/forward 只落到 committed scene。
- media rejected 不会卡在 PLAYING/RELEASING。

Phase 0 需要把这些变成明确事件：

- `HASH_NAVIGATE`
- `POPSTATE_NAVIGATE`
- `UNMOUNT`
- `SCROLL_LOCK_RECOVERY`
- `MEDIA_REJECTED`
- `MEDIA_METADATA_TIMEOUT`
- `MEDIA_ENDED_TIMEOUT`
- `MEDIA_MISSING`

## Ownership 冲突处理

layer ownership 冲突必须 fail fast 地暴露，但不能跳过 scroll lock recovery。

```ts
assertSingleOwner({
  layer: 'copyOwner',
  requestedBy: 'fake-media-segment',
  currentOwner: 'fake-b',
});
```

规则：

- Manifest 启动校验发现冲突时，阻止启动。
- reducer 或 ownership resolver 在运行时发现冲突时，先执行 recovery：恢复 scroll lock，回到 last committed scene，清空 transient owner。
- 开发环境 recovery 后 throw error，并在 DebugOverlay 标记 `ownerConflict`。
- 生产环境 recovery 后记录 error，不裸 throw。
- 不能静默让两个组件同时拥有同一个 copy layer。

## Debug Overlay 验收

DebugOverlay 必须默认显示：

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
```

手动触发状态转换时，这些字段必须逐帧更新。

## Phase 0 测试

P0 tests：

- manifest validation
- reducer legal transitions
- reducer illegal event ignored
- layer ownership single-owner invariant
- deliberate owner conflict recovers, then throws in development
- scroll intent 10vh
- viewport-normalized wheel/touch/keyboard intent
- ARMED cancel
- scroll lock save/restore
- media rejected / metadata timeout / ended timeout / missing media fallback
- hash navigate resets to IDLE
- popstate/back/forward resets to IDLE
- unmount restores scroll lock
- mobile touch/momentum recovery
- reduced motion skip still commits owner

## 验收标准

Phase 0 通过需要同时满足：

- fake scene 链路能完整走完固定 FSM。
- DebugOverlay 实时显示 runtime state。
- 人为制造 owner 冲突时先恢复 scroll lock，再在开发环境报错。
- `MEDIA_REJECTED`、hash、unmount 都能恢复 scroll lock。
- P0 tests 全部通过。

## 失败判定

出现任一情况，暂停 Phase 1：

- 需要 scene component 私自 set global scene。
- 需要 moving real DOM 才能完成 copy preview。
- React rerender 导致 segment progress 明显卡顿，且 store 策略未调整。
- scroll lock 无法在 mobile touch/momentum 下可靠恢复。
- ownership conflict 只能靠人工约定，runtime 不能检测。
