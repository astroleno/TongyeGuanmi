# Phase 0 开工指南

## 目标

用 2-3 天证明 SceneRuntime 契约可执行，交付物：
- 可运行的 fake-a → fake-b → fake-c
- DebugOverlay 实时显示 runtime state
- P0 tests 全部通过

## 前置条件

- 阅读完 `07-SCENE-RUNTIME-CONTRACT.md`（最高优先级）
- 阅读完 `08-PHASE0-CONTRACT-SPIKE.md`
- 阅读完 `01-STATE-MACHINE.md`

## 创建新项目

```bash
# 在 TongyeGuanmi 同级目录创建新项目
cd /Users/aitoshuu/Documents/GitHub
npm create vite@latest react-runtime-spike -- --template react-ts
cd react-runtime-spike
npm install
npm install gsap  # 可选，仅用于时间缓动
```

## 项目结构

```
react-runtime-spike/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── runtime/
│   │   ├── types.ts              # RuntimeState, RuntimeEvent union
│   │   ├── reducer.ts            # sceneRuntimeReducer (FSM 核心)
│   │   ├── ownershipResolver.ts  # resolveOwnership, detectConflict
│   │   ├── scrollLock.ts         # lockScroll, unlockScroll
│   │   ├── SceneRuntimeProvider.tsx
│   │   └── DebugOverlay.tsx
│   ├── manifest/
│   │   └── fakeManifest.ts       # fake-a/fake-b/fake-c
│   ├── scenes/
│   │   ├── FakeSceneA.tsx
│   │   ├── FakeSceneB.tsx
│   │   └── FakeSceneC.tsx
│   └── adapters/
│       ├── FakeInkAdapter.tsx
│       └── FakeMediaAdapter.tsx
└── tests/
    ├── reducer.test.ts
    ├── ownership.test.ts
    └── scrollLock.test.ts
```

## 实现顺序

### Day 1: Runtime 核心（6-8 小时）

**优先级顺序：**
1. `runtime/types.ts` - 复制 07-CONTRACT.md 的 RuntimeState + RuntimeEvent union
2. `runtime/reducer.ts` - 实现 FSM event table（11 事件 × 6 状态）
3. `runtime/ownershipResolver.ts` - resolveOwnership() 根据 segment 类型分配 owner
4. `runtime/scrollLock.ts` - lockScroll() / unlockScroll() + snapshot

**关键点：**
- Reducer 必须是纯函数，所有副作用在 Provider 的 useEffect 里
- Ownership resolver 只分配初始 owner，80% reveal 在 reducer 的 applySegmentProgress 里
- Scroll lock 用 `document.body.style.overflow = 'hidden'` + `position: fixed`

**验收 Day 1:**
```bash
npm run type-check  # TypeScript 无错误
# Reducer 包含 IDLE/ARMED/SNAP_LOCKING/PLAYING/PRESENTING/RELEASING 全部逻辑
# OwnershipResolver 覆盖 ink-transition/media-animation 两种类型
```

---

### Day 2: Fake Scenes + Provider（6-8 小时）

**优先级顺序：**
1. `manifest/fakeManifest.ts` - 3 个 scene + 2 个 segment（1 ink + 1 media with 80% reveal）
2. `runtime/SceneRuntimeProvider.tsx` - useReducer + scroll intent 监听 + phase 副作用
3. `runtime/DebugOverlay.tsx` - 显示 12+ runtime state 字段
4. `scenes/FakeSceneA.tsx` - 读取 layerOwnership，只在 owner 时渲染
5. `adapters/FakeInkAdapter.tsx` - setTimeout 模拟 800ms 转场，dispatch SEGMENT_PROGRESS/COMPLETE

**关键点：**
- Provider 监听 scroll，检测 10vh 触发 SCROLL_INTENT_10VH
- Provider 监听 phase 变化，SNAP_LOCKING 时调用 lockScroll()，RELEASING 时 unlockScroll()
- FakeInkAdapter 用 requestAnimationFrame 驱动 progress 0→1
- FakeMediaAdapter 用 setTimeout(2000) 模拟视频播放，80% 时 reducer 自动 reveal copy

**验收 Day 2:**
```bash
npm run dev
# 浏览器打开 http://localhost:5173
# 看到 DebugOverlay，显示 phase=IDLE, activeScene=fake-a
# 滚动 fake-a 底部，DebugOverlay 显示 IDLE → ARMED → SNAP_LOCKING
# 看到 fake ink overlay 淡入，DebugOverlay 显示 PLAYING，segmentProgress 0→100%
# Ink 完成后，DebugOverlay 显示 PRESENTING → RELEASING → IDLE，activeScene=fake-b
```

---

### Day 3: 测试 + 边缘 Case（6-8 小时）

**优先级顺序：**
1. `tests/reducer.test.ts` - 测试 FSM event table（至少 8 个 case）
2. `tests/ownership.test.ts` - 测试 resolveOwnership 和 5 层 owner 不冲突
3. `tests/scrollLock.test.ts` - 测试 snapshot/recovery
4. 人为制造 owner 冲突 - 在 FakeSceneB 里错误地 set copyOwner，验证报错
5. 测试 MEDIA_REJECTED - FakeMediaAdapter 立即 dispatch MEDIA_REJECTED，验证进入 PRESENTING

**关键点：**
- Reducer tests 用 `createInitialState()` + `sceneRuntimeReducer(state, event)`
- Ownership tests 用 `resolveOwnership(segmentId, fakeManifest)`
- Owner 冲突测试：在 reducer 的 commitTarget 前加 detectConflict()，如果有冲突先 unlockScroll() 再 throw

**验收 Day 3:**
```bash
npm run test
# 所有 P0 tests 通过（至少 15 个 test case）
# 浏览器手动测试：fake-a → fake-b（ink）→ fake-c（media with 80% reveal）
# DebugOverlay 在 fake-c media 播放到 80% 时显示 copyOwner 从 none 变成 fake-c
# Console 无 error（除非人为制造 owner 冲突）
```

---

## 核心 API 参考

### RuntimeState (从 07-CONTRACT.md)

```typescript
interface RuntimeState {
  phase: Phase;
  activeScene: SceneId;
  committedScene: SceneId;
  nextScene: SceneId | null;
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
  manifest: Manifest;
}
```

### RuntimeEvent Union (从 07-CONTRACT.md)

```typescript
type RuntimeEvent =
  | { type: 'SCROLL_INTENT_10VH'; nextScene: SceneId; nextSegment: SegmentId }
  | { type: 'FORWARD_CONFIRM' }
  | { type: 'REVERSE_CANCEL' }
  | { type: 'SNAP_DONE' }
  | { type: 'SNAP_FAILED'; error: string }
  | { type: 'SEGMENT_PROGRESS'; segmentId: SegmentId; progress: number }
  | { type: 'SEGMENT_COMPLETE'; segmentId: SegmentId }
  | { type: 'MEDIA_REJECTED'; segmentId: SegmentId; reason: string }
  | { type: 'COMMIT_PRESENTED'; sceneId: SceneId }
  | { type: 'RELEASE_COMPLETE' };
```

### FSM Event Table (从 01-STATE-MACHINE.md)

| Phase | Event | 条件 | 副作用 | Next Phase |
|-------|-------|-----|--------|-----------|
| IDLE | SCROLL_INTENT_10VH | 存在 next segment | 记录 nextScene/segment | ARMED |
| ARMED | FORWARD_CONFIRM | 用户继续前进 | 锁滚动并对齐 | SNAP_LOCKING |
| SNAP_LOCKING | SNAP_DONE | 对齐完成 | 分配 layer owner | PLAYING |
| PLAYING | SEGMENT_PROGRESS | activeSegment 匹配 | 更新 segmentProgress，检查 reveal | PLAYING |
| PLAYING | SEGMENT_COMPLETE | progress=1 | 原子提交 target scene | PRESENTING |
| PRESENTING | COMMIT_PRESENTED | target 已提交 | 准备恢复滚动 | RELEASING |
| RELEASING | RELEASE_COMPLETE | owner 已归还 | 清空 transient state | IDLE |

---

## 验收标准（Phase 0 通过）

Phase 0 通过需要同时满足：

- [ ] Fake scene 链路完整走完 IDLE → ARMED → SNAP_LOCKING → PLAYING → PRESENTING → RELEASING → IDLE
- [ ] DebugOverlay 实时显示 12+ runtime state
- [ ] Scroll lock 在 SNAP_LOCKING/PLAYING 生效，RELEASING 恢复
- [ ] 80% reveal：fake-b-to-c-media 播放到 80% 时，copyOwner 从 none 变成 fake-c
- [ ] P0 tests 全部通过（reducer/ownership/scrollLock）
- [ ] 人为制造 owner 冲突时，先恢复 scroll lock，再在 console 报错

---

## 失败判定（触发即暂停 Phase 1）

出现任一情况，Phase 0 失败：

- [ ] 需要 scene component 私自 setState 推进全局路线
- [ ] 需要 moving real DOM 才能完成 copy preview
- [ ] React rerender 导致 segment progress 明显卡顿
- [ ] Scroll lock 无法可靠恢复（特别是 mobile touch）
- [ ] Ownership conflict 只能靠人工约定，runtime 不能检测

---

## 完成后交付

```bash
# 提交所有代码到 react-runtime-spike 项目
git init
git add .
git commit -m "Phase 0: SceneRuntime fake scenes spike"

# 录屏演示（3-5 分钟）
# 1. npm run dev，展示 fake-a → fake-b → fake-c
# 2. 指出 DebugOverlay 的关键字段变化
# 3. 展示 80% reveal（copyOwner 变化）
# 4. 展示 scroll lock 生效/恢复
# 5. npm run test，展示所有测试通过

# 通知 Claude 进行 review
```

---

## Review Checklist（Claude 会检查）

- [ ] RuntimeState 包含 07-CONTRACT.md 定义的所有字段
- [ ] Reducer 覆盖 FSM event table 的所有路径
- [ ] OwnershipResolver 正确分配 5 层 owner
- [ ] 80% reveal 在 reducer 的 applySegmentProgress 里实现（不是单独事件）
- [ ] Scroll lock 用 snapshot 正确恢复
- [ ] DebugOverlay 显示所有关键 state
- [ ] P0 tests 覆盖核心逻辑
- [ ] 没有反向数据流（scene component → runtime state）

---

## 常见问题

**Q: FakeInkAdapter 需要真的渲染墨滴吗？**  
A: 不需要。只需要一个半透明 overlay + CSS transition。重点是验证 SEGMENT_PROGRESS 驱动 progress 0→1。

**Q: FakeMediaAdapter 需要真的视频吗？**  
A: 不需要。用 setTimeout(2000) 模拟 2 秒播放，每 100ms dispatch SEGMENT_PROGRESS。

**Q: DebugOverlay 需要漂亮的 UI 吗？**  
A: 不需要。用最简单的 `<div>` 列表即可，重点是显示所有关键字段。

**Q: 如果 Day 1 reducer 写不完怎么办？**  
A: 优先实现 IDLE → ARMED → SNAP_LOCKING → PLAYING → PRESENTING → RELEASING 的主路径。MEDIA_REJECTED/HASH_NAVIGATE 等边缘 case 可以 Day 3 补。

**Q: 如果测试覆盖率不够怎么办？**  
A: Phase 0 的 P0 tests 只需要覆盖主路径 + ownership 不冲突 + scroll lock 恢复。完整的 media error matrix 留给 Phase 1。

---

## 参考文档优先级

1. **必读**：`07-SCENE-RUNTIME-CONTRACT.md`（最高优先级，定义契约）
2. **必读**：`08-PHASE0-CONTRACT-SPIKE.md`（Phase 0 范围和验收）
3. **必读**：`01-STATE-MACHINE.md`（FSM event table）
4. 可选：`03-ARCHITECTURE.md`（架构参考）
5. 可选：`06-TESTING-STRATEGY.md`（测试分层）

实现时有疑问，回到这些文档找答案。文档之间冲突时，以 07 为准。
