# Phone P0 Atomic Handoff and Media Clock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通 Method → Figure2 → Proof → Brand → Figure3 → Services，消除提交闪错场景，并让 Figure2/Figure3 只在各自正式播放阶段推进媒体。

**Architecture:** 保留现有 A/B 平面、fail-closed 回滚和场景懒加载；修复三个公共边界：原生阅读手势跨越页面边缘时必须无缝交给故事事务，稳定提交必须在 React 布局提交中原子切换平面，媒体激活/首帧准备必须与正式播放时钟分离。Figure2 和 Figure3 共用这套媒体生命周期，不再由各场景在 `rebind()` 或准备阶段自行猜测何时播放。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、Playwright WebKit、HTMLVideoElement、Canvas 2D/WebGL packed-alpha compositor。

---

## 0. 当前基线与已确认根因

本计划以 worktree 当前未提交修改为基线，不回退用户现有改动。实施前先保存 `git diff`，后续只修改本计划列出的文件。

### 0.1 P0：Figure2 与 Figure3 共用错误的媒体时序

当前 `activationOwner` 已从 `mediaClockOwner` 中拆出，但拆分只完成了一半：

- `runtime.ts` 仍在 `invokeActivation()` 中根据 `mediaClockOwner` 生成 `command.playback`。
- `PhoneFigure2.rebind()` 在视频没有 source 时就可能调用 `play()`；随后 `activate()` 又通过 `surface.activate()` 删除/重建 source 并再次 `play()`。
- `PhoneFigure2.activate()` 在事务仍处于 `preparing` 时直接开始正式播放。
- `PhoneFigure3.activate()` 为获得激活信用先 `play()`，随后暂停和准备帧；运行时进入 `playing` 时没有独立的播放开始命令。
- Figure3 的 `settle(0)` 把下一次方向设为 `-1`，但第 0 帧对应的下一次合法运行方向是 `+1`。正式播放第一帧会因此创建新 run/generation，丢掉手势期间准备好的第 0 帧。

结果是：准备、激活、播放、Canvas 证明之间没有一条共同的 causal run。Figure2 可以等待一个永不结算的 `play()` promise；Figure3 可以在第一帧正式进度时废弃刚准备好的媒体代，然后停在静帧。

### 0.2 P0：稳定提交不是视觉原子操作

`runtime.ts::closeFinishedAttempt()` 在 React 把 target buffer 提升为 stable source 之前同步执行：

1. 退休 source/effect leaf；
2. 调用 `presentation.applyTransitionFrame(null)`；
3. `clearTransitionFrame()` 立即暴露当前旧 source buffer、隐藏 receiver；
4. React 下一次布局提交才把 target buffer 重新标为 source。

这会稳定地产生一个“旧场景重新出现”的窗口，解释 Proof → Brand 和 Brand → Figure3 结束后的闪帧。

### 0.3 Method 需要第二次长滑动，因为手势仲裁只看 touchstart

`createPhoneTouchArbiter()` 把 `startedEdges` 固定在 `touchstart`。如果手指在离底部几像素的位置开始，即使同一手势已经把页面推到底部，后续 `touchmove` 仍使用旧的 `bottom: false`，所以不会把余下手势交给故事事务。现有 WebKit 测试通过脚本直接设置 `scrollTop = bottom` 后再发故事手势，绕过了真实问题。

### 0.4 Proof 卡顿来自稳定滚动热路径上的全局重渲染和大图层提升

- 每个 `window.scroll` 都被包装成 `scroll-sampled`，更新 machine snapshot，并触发整个 `PhoneStoryShell` React 树重新渲染。
- 当前通用 `[data-phone-native-mirror]` 永久设置 `will-change: transform`。
- Proof 固定副本高达三个 viewport；稳定阅读时又同时渲染一份 document-flow Proof。

原生滚动不需要 machine 每帧参与。固定副本只应在交接的一瞬间提升为合成层。

### 0.5 Figure3 首帧仍模糊是当前 fallback 策略的必然结果

- Brand → Figure3 的普通路径启动 `prepareInitialComposite()`。
- 只给视频第 0 帧 `240ms`，超时就把 `640×360` poster 作为成功的 `figure3-initial-composite` 证明。
- 一旦 `initialSurfaceRef` 进入 `poster-fallback`，后到的视频第 0 帧被 `commitPresentedFrame()` 主动拒绝，无法升级。

这不是资源缺失，而是低清 poster 被当成了正常提交凭据。

### 0.6 Brand 的图层顺序与验收要求相反

`brand-figure3` 当前是 `effectPlacement: 'above-both'`，且 choreography 默认 `foregroundOwner: canonical-target`。因此 Brand 不可能处于转场效果上方。正确组合应为：Brand source 在上、Ink effect 居中、Figure3 receiver 在下，source 随遮罩退场。

---

## 1. 设计约束

- 不新增、放大或重编码 Figure2/Figure3 媒体。
- Figure3 的 `640×360` poster 只能做加载覆盖，不能成为 Brand → Figure3 正常提交证明。
- 不删除 A/B 平面、presentation proof、失败回滚或媒体预算。
- 不为 Figure2 和 Figure3分别增加第二套状态机；二者必须使用同一个 runtime media phase contract。
- 不在稳定原生滚动的每一帧更新 machine/React。
- 不以“最终 sceneId 正确”作为转场通过标准；必须验证逐帧平面和媒体时间。

---

### Task 1: 先建立会失败的端到端契约

**Files:**
- Modify: `app/src/production/phone-story/PhoneStoryShell.test.tsx`
- Modify: `app/src/production/phone-story/runtime.test.ts`
- Modify: `app/src/production/phone-story/presentation.test.ts`
- Modify: `app/src/scenes/figure2-animation/phone/PhoneFigure2.test.tsx`
- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.clean.test.tsx`
- Modify: `app/e2e/r5-phone-clean-assertions.ts`
- Modify: `app/e2e/r5-phone-clean-presentation.spec.ts`

- [ ] **Step 1: 写 Method 同一根手指跨过底边的失败测试**

测试必须从 `bottom - 24px` 开始 touch，第一次 move 由 document 消费；把真实 scroll owner 更新到底部后，在同一次 touch claim 内继续 move，断言只派发一次 forward segment intent，不允许先 `touchend` 再开始第二个手势。

```ts
touchStart({ y: 620, scrollTop: maximum - 24 });
touchMove({ y: 580, scrollTop: maximum - 8 });
expect(segmentRequests()).toHaveLength(0);
touchMove({ y: 520, scrollTop: maximum });
expect(segmentRequests()).toEqual([{ direction: 'forward' }]);
```

- [ ] **Step 2: 写稳定 Proof 滚动不发布 machine snapshot 的失败测试**

派发 60 个原生 `scroll` 事件，断言它们可以更新环境的最后滚动采样，但 engine snapshot subscriber 不被这 60 次事件逐次唤醒。

```ts
for (let index = 0; index < 60; index += 1) {
  setScrollTop(index * 12);
  window.dispatchEvent(new Event('scroll'));
}
await flushAnimationFrame();
expect(snapshotPublishesDuringStableScroll).toBe(0);
```

- [ ] **Step 3: 写稳定提交期间旧 source 不得重新暴露的失败测试**

在 runtime target final quorum 完成后、Shell layout commit 之前，断言：

```ts
expect(presentation.applyTransitionFrame).not.toHaveBeenCalledWith(null);
expect(oldSource.dataset.phoneExposed).not.toBe('true');
expect(receiver.dataset.phoneExposed).toBe('true');
```

随后调用 `commitStablePlane(targetBuffer)`，断言只在这一个操作里清除 transition variables 并把 target buffer 变成唯一 exposed plane。

- [ ] **Step 4: 写 Figure2 prime → play 的失败测试**

测试不得 mock 掉生命周期顺序。要求：

```ts
commands.rebind(figure2SourceBinding);
expect(video.play).not.toHaveBeenCalled();

const activation = commands.activate(primeCommand);
await settleActivation(activation);
expect(video.paused).toBe(true);
expect(video.currentTime).toBeCloseTo(0, 2);

commands.setMediaPhase({ phase: 'playing', runToken: 'figure2:forward:stage0' });
expect(video.play).toHaveBeenCalledTimes(2); // one gesture prime, one authored start
```

第二阶段必须调用 `setMediaPhase({ phase: 'held' })`，并断言 `currentTime` 停在 `2.6s`。

- [ ] **Step 5: 写 Figure3 同一 run 从第 0 帧开始播放的失败测试**

Brand → Figure3 的 frame-zero 准备延迟到 `600ms`，断言 `240ms` 时仍未把 poster 报告为 prepared；视频第 0 帧到达后才报告 `figure3-initial-composite`。

然后运行：

```ts
commands.settle(0);
commands.rebind(figure3ServicesSourceBinding);
await settleActivation(commands.activate(primeCommand));
commands.setMediaPhase({ phase: 'playing', runToken: 'figure3:forward:1' });
commands.render(0.1);
commands.render(0.5);
```

断言 prepare 和 playback 使用同一个 `runToken`、方向始终是 `1`，且没有在第一个 render 创建新 generation。

- [ ] **Step 6: 扩展逐帧采样字段**

`PhoneStoryFrameSample` 增加：

```ts
type PhoneStoryFrameSample = Readonly<{
  // existing fields
  exposedBuffers: readonly string[];
  transitionLive: boolean;
  sourceSceneText: string | null;
  receiverSceneText: string | null;
}>;
```

采样器每个 rAF 记录 exposed plane、transition-live、Figure2/Figure3 video currentTime 和 Canvas media time。

- [ ] **Step 7: 运行聚焦测试并确认失败原因正确**

Run:

```bash
pnpm -C app exec vitest run \
  src/production/phone-story/PhoneStoryShell.test.tsx \
  src/production/phone-story/runtime.test.ts \
  src/production/phone-story/presentation.test.ts \
  src/scenes/figure2-animation/phone/PhoneFigure2.test.tsx \
  src/scenes/figure3-animation/phone/PhoneFigure3.clean.test.tsx
```

Expected: 新增测试分别因 started-edge、提前 `applyTransitionFrame(null)`、`rebind()` 调用 `play()`、240ms poster proof 和 Figure3 run 方向变化而失败。

---

### Task 2: 修复原生阅读边缘交接并移除 Proof 滚动热路径

**Files:**
- Create: `app/src/production/phone-story/native-handoff.ts`
- Create: `app/src/production/phone-story/native-handoff.test.ts`
- Modify: `app/src/production/phone-story/PhoneStoryShell.tsx`
- Modify: `app/src/production/phone-story/runtime.ts`
- Modify: `app/src/production/phone-story/styles.css`
- Modify: `app/src/scenes/figure2-proof/phone/PhoneFigure2Proof.tsx`

- [ ] **Step 1: 提取唯一 scroll owner 读取规则**

```ts
export function readPhoneNativeScroll(
  documentOwner: Element | null,
  windowY: number
): number {
  const elementY = documentOwner && 'scrollTop' in documentOwner
    ? Number((documentOwner as Element & { scrollTop: number }).scrollTop)
    : Number.NaN;
  return Math.max(0, elementY || windowY || 0);
}
```

测试覆盖 `documentElement.scrollTop === 0` 但 `window.scrollY > 0` 的 iOS/body-scroll 情况。

- [ ] **Step 2: 让 touch arbiter 每次 move 读取当前边缘**

将 `startedEdges` 改为仅用于诊断；`move()` 接收当前 edges：

```ts
move(points: readonly PhoneTouchPoint[], currentEdges: PhoneReadingEdges): number | null
```

当 native document 在同一手势中首次达到目标边缘时 claim 剩余手势；claim 后只发布一次，保持 existing physical epoch contract。

- [ ] **Step 3: 只在 claim 前同步冻结固定副本**

`freezeNativeReadingBeforePublish()` 必须完成以下同步顺序：

```ts
const scrollY = readPhoneNativeScroll(document.scrollingElement, window.scrollY);
mirror.style.setProperty('--phone-native-scroll-y', `${scrollY.toFixed(2)}px`);
mirror.dataset.phoneNativeScrollY = scrollY.toFixed(2);
mirror.dataset.phoneNativeHandoff = 'active';
publish(segmentIntent);
```

不得在普通 wheel/keyboard/native scroll 上无条件提升 mirror。

- [ ] **Step 4: 停止稳定原生滚动更新全局 machine snapshot**

window scroll listener只更新 `latestNativeScroll` 局部变量。`scroll-sampled` 仅在恢复/诊断明确需要时发布，不参与稳定阅读的每一帧。

- [ ] **Step 5: 限定 mirror 的合成层生命周期**

替换永久 `will-change`：

```css
.phone-story [data-phone-native-mirror] {
  --phone-native-scroll-y: 0px;
}

.phone-story [data-phone-native-mirror][data-phone-native-handoff="active"] {
  transform: translate3d(0, calc(-1 * var(--phone-native-scroll-y)), 0);
  will-change: transform;
}

.phone-story[data-phone-reading="enabled"]
  .phone-story__viewport [data-phone-native-mirror]:not([data-phone-native-handoff="active"]) {
  visibility: hidden;
}
```

stable/rollback layout commit 后删除 `data-phone-native-handoff` 和 `will-change`。

- [ ] **Step 6: 运行 native handoff 与 Proof 测试**

Run:

```bash
pnpm -C app exec vitest run \
  src/production/phone-story/native-handoff.test.ts \
  src/production/phone-story/PhoneStoryShell.test.tsx \
  src/scenes/figure2-proof/phone/PhoneFigure2Proof.test.tsx
```

Expected: PASS；同一手势跨底边只产生一个事务，稳定 Proof scroll 不发布 snapshot，mirror 只在 transaction handoff active。

---

### Task 3: 把 A/B 目标提交改成真正的布局原子提交

**Files:**
- Modify: `app/src/production/phone-story/runtime.ts`
- Modify: `app/src/production/phone-story/presentation.ts`
- Modify: `app/src/production/phone-story/PhoneStoryShell.tsx`
- Modify: `app/src/production/phone-story/runtime.test.ts`
- Modify: `app/src/production/phone-story/presentation.test.ts`
- Modify: `app/src/production/phone-story/PhoneStoryShell.test.tsx`

- [ ] **Step 1: 禁止 runtime 在 React commit 前清理 transition frame**

从 `closeFinishedAttempt()` 删除：

```ts
presentation.applyTransitionFrame(null);
```

target final frame 的 clip/mask/exposure 必须一直保留到 Shell 完成稳定 buffer 布局提交。

- [ ] **Step 2: 让 `commitStablePlane()` 成为唯一清理入口**

```ts
commitStablePlane(sourceBuffer) {
  const source = buffer(sourceBuffer);
  const receiver = otherBuffer(sourceBuffer);
  source.dataset.phoneExposed = 'true';
  receiver.dataset.phoneExposed = 'false';
  clearTransitionVariables(root);
  root.dataset.phoneStableBuffer = sourceBuffer;
}
```

顺序必须先确认新 stable buffer，再清理 transition 属性，不能先恢复旧 source 默认值。

- [ ] **Step 3: Shell 使用 `useLayoutEffect` 以 commit sequence/revision 调用一次**

保留现有 layout effect，但用 `{commitSequence, planeRevision, stableBuffer}` 作为幂等键。rollback 也走同一入口，只是 stableBuffer 指向旧稳定画面。

- [ ] **Step 4: 增加 Proof → Brand 与 Brand → Figure3 原子序列测试**

测试在 target final quorum、React stable render、layout effect 三个时点分别采样 exposed buffers，任何时点都不得出现旧 source 重新成为唯一 exposed plane。

- [ ] **Step 5: 运行聚焦测试**

Run:

```bash
pnpm -C app exec vitest run \
  src/production/phone-story/runtime.test.ts \
  src/production/phone-story/presentation.test.ts \
  src/production/phone-story/PhoneStoryShell.test.tsx
```

Expected: PASS；`applyTransitionFrame(null)` 不再由 runtime semantic completion 调用。

---

### Task 4: 完成 activation 与 media clock 的真正分离

**Files:**
- Modify: `app/src/production/phone-story/protocol.ts`
- Modify: `app/src/production/phone-story/presentation.ts`
- Modify: `app/src/production/phone-story/runtime.ts`
- Modify: `app/src/production/phone-story/manifest.ts`
- Modify: `app/src/production/phone-story/choreography.test.ts`
- Modify: `app/src/production/phone-story/runtime.test.ts`

- [ ] **Step 1: activation command 只表达 decoder prime**

删除 `PhoneLeafActivationCommand.playback`，避免 leaf 在准备阶段解释为正式播放。

```ts
export type PhoneLeafActivationCommand = Readonly<{
  invocationId: string;
  surfaceIds: readonly PhoneSurfaceId[];
  credit: PhoneActivationCredit;
  runToken: string;
  direction: 'forward' | 'reverse';
  stageIndex: number;
}>;
```

`runToken` 由 runtime 从 attempt/direction/stage 生成；activation 用它准备 causal frame，后续 `primed`/`playing` 必须复用同一 token。

- [ ] **Step 2: 给 leaf 增加唯一的 media phase command**

```ts
export type PhoneMediaPhaseCommand = Readonly<{
  phase: 'primed' | 'playing' | 'held';
  runToken: string;
  direction: 'forward' | 'reverse';
  stageIndex: number;
}>;

export type PhoneLeafCommandHandle = Readonly<{
  // existing methods
  setMediaPhase?(command: PhoneMediaPhaseCommand): void;
}>;
```

这不是第二套状态机；machine 仍是唯一状态源，leaf 只执行显式命令。

- [ ] **Step 3: runtime 只在 machine phase 边界派发命令**

- runtime 调用 activation 时传入 runToken/direction/stage；activation fulfilled 后同一 media owner 收到同 token 的 `primed`。
- `preparing/presenting-source → playing`：当前 `mediaClockOwner` 收到 `playing`。
- `playing → dwelling/presenting-target/stable/rollback`：原 owner 收到 `held`。
- staged segment 进入下一 stage 时重新计算 owner；Figure2 stage 1 不得再次播放。

`runToken` 使用 attempt + direction + stage，不允许 leaf 自行用当前 progress 推导新 token。

- [ ] **Step 4: 使 Figure2 staged media owner 显式化**

`figure2-distance-expand` 的 stage 0 为 source clock，stage 1 为 none。扩展 choreography frame 接受 `stageIndex`，反向时映射到对应 canonical stage。

```ts
phoneSegmentChoreographyFrame(id, progress, direction, stageIndex)
```

- [ ] **Step 5: 添加 phase ordering 测试**

断言 activation 永远先于 `primed`，`playing` 只在 source plane final proof 完成后出现，`held` 在 stage boundary 和 semantic completion 各恰好一次。

- [ ] **Step 6: 运行 runtime/choreography 测试**

Run:

```bash
pnpm -C app exec vitest run \
  src/production/phone-story/choreography.test.ts \
  src/production/phone-story/machine.test.ts \
  src/production/phone-story/runtime.test.ts \
  src/production/phone-story/presentation.test.ts
```

Expected: PASS；不存在 `command.playback`，且 media phase 顺序由 runtime 唯一派发。

---

### Task 5: 用公共 media phase contract 修复 Figure2 P0

**Files:**
- Modify: `app/src/media/phone-packed-alpha-surface.ts`
- Modify: `app/src/media/phone-packed-alpha-surface.test.ts`
- Modify: `app/src/scenes/figure2-animation/phone/PhoneFigure2.tsx`
- Modify: `app/src/scenes/figure2-animation/phone/PhoneFigure2.test.tsx`

- [ ] **Step 1: `rebind()` 不得播放或重建 source**

删除 `resumeFigure2Media(binding)` 调用。`rebind()` 只更新 generation、stage 和报告端口；任何 `play()` 都必须来自 activate prime 或 `setMediaPhase(playing)`。

- [ ] **Step 2: activation 只完成一次 causal prime**

activation 顺序：

1. `surface.activate('initial')`，绑定唯一 generation；
2. 在物理手势栈调用一次 `video.play()` 获取 Safari 信用；
3. promise fulfilled 后立即 pause；
4. seek 到 `0`，等待 non-seeking decoded frame；
5. Canvas 同一 generation 绘制成功后 settlement fulfilled。

prime 期间不允许媒体时间超过一个帧容差。

- [ ] **Step 3: 正式 playing 才启动 Figure2 视频**

```ts
setMediaPhase(command) {
  if (command.phase === 'playing' && isFigure2MediaLeg(bindingRef.current)) {
    startAuthorizedPlayback(command.runToken);
  } else if (command.phase === 'held') {
    holdFigure2Media(videoRef.current);
  }
}
```

stage 0 结束精确停在 `2.6s`；stage 1 只做 z-depth，不调用 `play()`。

- [ ] **Step 4: 给 pending play/prime 增加 generation-bound 结算**

旧 promise 必须在 rebind/pause/rollback 后以 stale 结束，不能污染新 attempt。activation rejection 进入现有 bounded rollback，不留下永久 pending promise。

- [ ] **Step 5: 运行 Figure2 测试**

Run:

```bash
pnpm -C app exec vitest run \
  src/media/phone-packed-alpha-surface.test.ts \
  src/scenes/figure2-animation/phone/PhoneFigure2.test.tsx \
  src/production/phone-story/runtime.test.ts
```

Expected: PASS；rebind 不播放，prime 后 pause/0s，playing 后媒体时间增长，第二阶段保持 2.6s。

---

### Task 6: 用视频第 0 帧和同一 run 修复 Figure3 P0

**Files:**
- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.tsx`
- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.css`
- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.test.tsx`
- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.clean.test.tsx`
- Modify: `app/src/scenes/figure3-animation/phone/paper-compositor.test.ts`
- Modify: `app/src/production/phone-story/manifest.ts`

- [ ] **Step 1: poster 不再满足 normal target prepared proof**

删除正常 Brand → Figure3 路径中的 `PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS` winner。poster 可以保持可见覆盖，但 `reportPrepared('figure3-initial-composite')` 只能由已解码、已绘制的 video frame zero 触发。

- [ ] **Step 2: 视频首帧等待使用 manifest 的 mediaPrepare deadline**

不要在 leaf 内另设 240ms 成功门槛。只要事务仍有效，等待现有 `D-single-media.mediaPrepare`；失败则走现有 rollback，不能以低清 poster 假提交。

- [ ] **Step 3: 修正 endpoint 与下一次方向的映射**

```ts
directionRef.current = endpoint === 0 ? 1 : -1;
```

更稳妥的实现是删除可变猜测，直接从 runtime `PhoneMediaPhaseCommand.direction` 获取 run 方向。

- [ ] **Step 4: prime 与 playing 共用 runtime runToken**

activation/prepare 不再使用 `binding.frameToken + directionRef` 自行生成 runId。`setMediaPhase(primed)` 保存 runtime token；`setMediaPhase(playing)` 只能恢复相同 token，第一帧 render 不得触发 driver generation 变化。

- [ ] **Step 5: Canvas 按真实媒体帧持续重绘**

Figure3 playing 期间 `requestVideoFrameCallback` 或 timeline seek 每次成功后绘制 paper Canvas；逐帧证据必须显示 Canvas media time 与 video currentTime 同方向增长。视频元素仍保持不可见，避免 Safari 硬件白帧。

- [ ] **Step 6: 保留完整视口高度修复**

继续要求 mount/scene/stage/poster/canvas 覆盖 `--phone-visual-height`，不要恢复 `80svh`。poster 只作覆盖，不作为 frame proof。

- [ ] **Step 7: 运行 Figure3 测试**

Run:

```bash
pnpm -C app exec vitest run \
  src/scenes/figure3-animation/phone/PhoneFigure3.test.tsx \
  src/scenes/figure3-animation/phone/PhoneFigure3.clean.test.tsx \
  src/scenes/figure3-animation/phone/paper-compositor.test.ts \
  src/production/phone-story/runtime.test.ts
```

Expected: PASS；600ms 首帧仍使用视频、poster 不报告 prepared、prime/play generation 相同、Figure3 → Services 媒体与 Canvas 时间持续增长。

---

### Task 7: 修复 Brand → Figure3 的声明式图层契约

**Files:**
- Modify: `app/src/production/phone-story/manifest.ts`
- Modify: `app/src/production/phone-story/choreography.test.ts`
- Modify: `app/src/production/phone-story/presentation.test.ts`
- Modify: `app/src/transitions/brand-figure3/phone.test.ts`

- [ ] **Step 1: 将 Brand/source 声明为 foreground**

`brand-figure3` 使用：

```ts
effectPlacement: 'between'
foregroundOwner: 'canonical-source'
```

最终层级应是 source Brand `z=30`、Ink `z=20`、receiver Figure3 `z=10`。source 仍由 conceal clip 退场，不允许通过 opacity 直接消失。

- [ ] **Step 2: 增加正反向层级测试**

正向前半段 Brand 必须位于 Ink 之上；反向按 canonical mapping 交换 source/target 后仍保持当前 source 在上。

- [ ] **Step 3: 运行 choreography/presentation/transition 测试**

Run:

```bash
pnpm -C app exec vitest run \
  src/production/phone-story/choreography.test.ts \
  src/production/phone-story/presentation.test.ts \
  src/transitions/brand-figure3/phone.test.ts
```

Expected: PASS；Brand 不再被 effect plane 提前覆盖或直接隐藏。

---

### Task 8: 关键 WebKit 逐帧验收，然后再跑全量

**Files:**
- Modify: `app/e2e/r5-phone-clean-assertions.ts`
- Modify: `app/e2e/r5-phone-clean-presentation.spec.ts`
- Modify: `docs/react-refactor/reports/r5-phone-clean-runtime-baseline.md`

- [ ] **Step 1: 增加真实连续 touch 的 Method → Figure2 用例**

不得脚本预先设置到 bottom；使用一根 touch 从 `bottom - 24px` 连续滑到边缘并继续，断言只提交一次 Method → Figure2，且 effect 至少有 4 个中间 progress 样本。

- [ ] **Step 2: 增加 Figure2 P0 媒体/事务用例**

连续运行三轮正反向：

- activation/prime 阶段 paused 且接近 0；
- stage 0 playing 的 video/Canvas time 单调增长；
- stage 1 始终 paused 且接近 2.6s；
- 每轮最终进入 Proof，不允许 transaction 超时、rollback 或 fault。

- [ ] **Step 3: 增加 Proof 滚动帧预算用例**

真实滚动三屏，记录 rAF 间隔、machine revision 增量和固定 mirror 合成状态。稳定滚动期间 revision 不随每帧增加，mirror 不带 `will-change`；交接时才 active。

- [ ] **Step 4: 增加两个提交闪帧用例**

对 Proof → Brand、Brand → Figure3 从 progress `0.9` 采样到 stable 后两个 rAF：

- exposedBuffers 每帧只能是合法 transition pair 或新 stable target；
- 不允许 old source 在 target 已全显后重新成为唯一 exposed plane；
- 不允许第三场景文本/画面出现。

- [ ] **Step 5: 增加 Figure3 首帧和播放 P0 用例**

- Brand → Figure3 的 prepared winner 必须是 `video-frame-zero`；
- poster 在 stable Figure3 必须 hidden；
- Figure3 → Services 的 video currentTime 和 Canvas mediaTime 至少增长 `0.4s`；
- 事务最终提交 Services，不能回到 Brand/Figure3 或卡在 transaction。

- [ ] **Step 6: 运行关键 WebKit 文件**

Run:

```bash
pnpm -C app exec playwright test \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=webkit \
  --grep "Method continuous edge|Figure2 P0|Proof scroll budget|atomic commit|Figure3 P0"
```

Expected: 全部通过；失败时保留逐帧 JSON，不先跑 10 分钟全量。

- [ ] **Step 7: 运行全量静态和单元验证**

Run:

```bash
pnpm -C app test
pnpm -C app typecheck
pnpm -C app run build
git diff --check
```

Expected: Vitest、typecheck、build、预算和 diff check 全部通过。

- [ ] **Step 8: 运行完整 Phone WebKit**

Run:

```bash
pnpm -C app exec playwright test \
  e2e/r5-phone-clean-presentation.spec.ts \
  --project=webkit
```

Expected: 全部通过，且新增逐帧 P0 oracle 不被跳过。

- [ ] **Step 9: 真实 iPhone Safari 最终门槛**

同一构建、同一局域网地址完成：

1. Method 内容末尾一根手指连续滑入 Figure2，三次。
2. Figure2 正向/反向各三次，确认不冻结且第二阶段为 2.6s 尾帧。
3. Proof 全三屏正常速度滚动，确认无明显掉帧。
4. Proof → Brand 与 Brand → Figure3 各三次，录屏逐帧检查无旧/第三场景闪现。
5. Figure3 首帧确认来自视频第 0 帧；Figure3 → Services 三次均持续播放并成功提交。
6. 展开/收起 Safari 工具栏、后台恢复和低电量各重复一次。

任何 Figure2/Figure3 卡死、回到 Brand、旧场景闪现都视为 P0 未关闭，不得用全量自动测试结果覆盖人工失败。

---

## 2. 完成定义

- Method 的同一真实 touch 可以从阅读尾部连续进入 Figure2，不需要第二次长滑。
- Figure2 正反向不会停在 transaction；第二阶段只显示 2.6s 尾帧。
- Proof 稳定滚动不驱动全局 machine/React 每帧更新，固定三屏副本不被永久提升。
- Proof → Brand、Brand → Figure3 提交窗口中没有旧 source 或第三场景闪帧。
- Brand 位于 Brand → Figure3 Ink 的上方，并由遮罩连续退出。
- Figure3 stable 首帧来自现有视频第 0 帧 Canvas，不以 640×360 poster 作为正常 proof。
- Figure3 prime 与正式 playback 使用同一 run/generation；Figure3 → Services 媒体与 Canvas 时间持续增长并提交 Services。
- 聚焦 WebKit、全量 Vitest、typecheck、build 和真实 iPhone 矩阵全部通过后，才可标记 P0 完成。
