# Phase 0 Review 结果：需要修复的问题

## ✅ 总体评分：85/100

**契约实现完美（100%），但有 4 个集成问题需要修复才能进入 Phase 1。**

---

## ❌ 必须修复的 4 个问题

### 1. Import 路径错误 (main.tsx line 6)

**问题：**
```typescript
// 错误
import { fakeManifest } from './runtime/fakeManifest';

// fakeManifest 实际在 src/manifest/fakeManifest.ts
```

**修复：**
```typescript
import { fakeManifest } from './manifest/fakeManifest';
```

**文件：** `src/main.tsx` line 6

---

### 2. RenderLayerHost 缺少 props (App.tsx line 17)

**问题：**
```tsx
// 错误：RenderLayerHost 需要 layerOwnership prop 但没传
<RenderLayerHost />
```

**修复：**
```tsx
// 方案 1：从 context 读取
const { state } = useSceneRuntime();
<RenderLayerHost layerOwnership={state.layerOwnership} />

// 方案 2：或者让 RenderLayerHost 内部自己 useSceneRuntime()
// 如果选方案 2，在 RenderLayerHost.tsx 内部加：
// const { state } = useSceneRuntime();
// const layerOwnership = state.layerOwnership;
```

**文件：** `src/App.tsx` line 17

---

### 3. DebugOverlay 缺少 state prop (App.tsx line 16)

**问题：**
```tsx
// 错误：DebugOverlay 需要 state: RuntimeState prop 但没传
<DebugOverlay />
```

**修复：**
```tsx
// 方案 1：从 context 读取
const { state } = useSceneRuntime();
<DebugOverlay state={state} />

// 方案 2：或者让 DebugOverlay 内部自己 useSceneRuntime()
// 如果选方案 2，在 DebugOverlay.tsx 内部改成：
export function DebugOverlay() {
  const { state } = useSceneRuntime();
  // ... rest of component
}
```

**文件：** `src/App.tsx` line 16

---

### 4. SceneRuntimeProvider 缺少 initialScene prop (main.tsx line 10)

**问题：**
```tsx
// 错误：Provider 需要 initialScene, manifest, children 但只传了 manifest
<SceneRuntimeProvider manifest={fakeManifest}>
```

**修复：**
```tsx
<SceneRuntimeProvider 
  manifest={fakeManifest}
  initialScene="fake-a"
>
  <App />
</SceneRuntimeProvider>
```

**文件：** `src/main.tsx` line 10

---

## 推荐修复方案（最简单）

### 选项 A：让组件内部自己读 context（推荐）

这样 App.tsx 不需要改，只改组件本身：

**DebugOverlay.tsx:**
```typescript
import { useSceneRuntime } from './SceneRuntimeProvider';

export function DebugOverlay() {
  const { state } = useSceneRuntime();
  // ... 其余代码不变，直接用 state
}
```

**RenderLayerHost.tsx:**
```typescript
import { useSceneRuntime } from '../runtime/SceneRuntimeProvider';

export function RenderLayerHost() {
  const { state } = useSceneRuntime();
  const { layerOwnership } = state;
  // ... 其余代码不变
}
```

这样 App.tsx 就可以保持：
```tsx
<DebugOverlay />
<RenderLayerHost />
```

---

## 修复指令

```bash
cd /Users/aitoshuu/Documents/GitHub/react-runtime-spike

# 修复 1: Import 路径
# 编辑 src/main.tsx line 6
# 改成: import { fakeManifest } from './manifest/fakeManifest';

# 修复 2 & 3: 让组件内部读 context（推荐方案）
# 编辑 src/runtime/DebugOverlay.tsx
# 在顶部加: import { useSceneRuntime } from './SceneRuntimeProvider';
# 在 function 内第一行加: const { state } = useSceneRuntime();
# 删除函数参数里的 state: RuntimeState

# 编辑 src/render-host/RenderLayerHost.tsx
# 在顶部加: import { useSceneRuntime } from '../runtime/SceneRuntimeProvider';
# 在 function 内第一行加: const { state } = useSceneRuntime();
# 从 state 读取: const { layerOwnership } = state;

# 修复 4: 传 initialScene
# 编辑 src/main.tsx line 10
# 改成:
# <SceneRuntimeProvider 
#   manifest={fakeManifest}
#   initialScene="fake-a"
# >

# 验证
npm run type-check  # 应该无错误
npm run dev         # 应该能启动
npm run test        # 48 tests 应该全通过
```

---

## 修复后验收

修复完成后，运行以下验证：

```bash
# 1. TypeScript 编译通过
npm run type-check
# 预期: ✅ No errors

# 2. 开发服务器启动
npm run dev
# 预期: ✅ http://localhost:5173 打开，看到 DebugOverlay

# 3. 测试全部通过
npm run test
# 预期: ✅ 48/48 tests passed

# 4. 手动验证
# 打开浏览器 http://localhost:5173
# 预期:
# - ✅ DebugOverlay 在右上角显示
# - ✅ phase=IDLE, activeScene=fake-a
# - ✅ 滚动到 fake-a 底部，phase 变成 ARMED → SNAP_LOCKING → PLAYING
# - ✅ fake-b → fake-c 转场时，segmentProgress 到 80% 时 copyOwner 从 none 变成 fake-c
```

---

## 修复完成后提交

```bash
git add .
git commit -m "fix: Phase 0 integration issues

- Fix import path: fakeManifest from ./manifest not ./runtime
- Fix DebugOverlay: read state from useSceneRuntime()
- Fix RenderLayerHost: read layerOwnership from context
- Fix SceneRuntimeProvider: add initialScene='fake-a' prop

All 48 tests still passing. Ready for Phase 1."

git log --oneline -1  # 验证提交成功
```

---

## 完成后通知

修复完成且验证通过后，告诉我：

**"Phase 0 集成问题已修复，type-check/dev/test 全部通过，请确认可以进入 Phase 1。"**

然后我会最终确认，批准进入 Phase 1（用 Sonnet 4 实现真实 hero → method 视觉）。
