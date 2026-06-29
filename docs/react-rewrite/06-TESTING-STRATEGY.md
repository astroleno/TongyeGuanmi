# 测试策略

测试目标不是证明组件能渲染，而是证明 `SceneRuntime` 不会回到多 owner 竞争。

## Phase 0 Gate

进入 hero -> method 视觉迁移前，必须先通过 Phase 0 fake scene 测试：

- fake scene 链路完整走完固定 FSM。
- DebugOverlay 实时显示 runtime state。
- 人为制造 owner 冲突时，先恢复 scroll lock，再在开发环境 throw error。
- `MEDIA_REJECTED`、hash、unmount 都能恢复 scroll lock。
- P0 tests 全部通过。

本文中的 P0 分两类：

- Phase 0 P0 gate tests：只使用 fake scenes，验证 runtime contract。
- Full-route P0 regression tests：真实 scene 接入后逐步补齐 figure2/crane 等完整路线边界。

## 测试分层

| 层级 | 内容 | 必须性 |
| --- | --- | --- |
| Manifest tests | scene/segment 完整性、孤儿节点、step 引用 | P0 |
| Reducer tests | FSM event table、非法事件、原子 commit | P0 |
| Ownership tests | visual/copy/canvas/mask/media owner 不变量 | P0 |
| Scroll tests | 10vh intent、ARMED cancel、快速滚动 | P0 |
| Lock tests | body/scroll/touch snapshot 保存恢复 | P0 |
| Adapter contract tests | media rejected、ended、progress 上报 | P0 |
| Component tests | scene props 渲染、copy owner 标记 | P1 |
| Visual/browser verification | 真实滚动、移动端、FPS、截图比对 | P1/P2，需单独授权工具 |

## P0: Manifest Tests

必须覆盖：

- 每个 segment 的 `from` / `to` 都存在。
- 最后一个 scene 之外，每个 scene 都有出口或明确 terminal。
- 没有未引用 scene。
- 没有组件私有 scene id。
- compound steps 全部存在。
- segment type 只能是四类：
  - `ink-transition`
  - `media-animation`
  - `text-read`
  - `compound-sequence`

示例：

```ts
expect(validateManifest(SCENES, SEGMENTS)).toEqual({
  ok: true,
  errors: []
});
```

## P0: Reducer Tests

覆盖完整路径：

```txt
IDLE
-> ARMED
-> SNAP_LOCKING
-> PLAYING
-> PRESENTING
-> RELEASING
-> IDLE
```

必须断言：

- `SEGMENT_COMPLETE` 同时更新 `committedScene` 和 layer owner。
- `MEDIA_REJECTED` 不会停在 PLAYING。
- 非法事件不改变 phase，只写入 `lastIgnoredEvent`。
- `HASH_NAVIGATE` 只落到 committed scene + IDLE。
- `REDUCED_MOTION_SKIP` 仍执行同一套 commit。

## P0: Ownership Tests

每个测试帧都检查：

```ts
expectSingleOwner(state.layerOwnership.visualOwner);
expectSingleOwner(state.layerOwnership.copyOwner);
expectSingleOwner(state.layerOwnership.canvasOwner);
expectSingleOwner(state.layerOwnership.maskOwner);
expectSingleOwner(state.layerOwnership.mediaOwner);
```

Phase 0 P0 gate 边界：

- hero -> pattern-top commit。
- pattern-top -> pattern-bottom commit。
- pattern-bottom -> aod poster commit。
- AOD 80% method copy reveal。
- AOD ended/rejected -> method-top commit。

Full-route P0 regression 边界：

- figure2 compound step 切换。
- crane 80% contact copy reveal。

冲突检测：

- 开发环境：同一 layer 出现两个 owner 时必须先执行 recovery，再 throw。
- 生产环境：记录 error，恢复 scroll lock，回退到 last committed scene。
- 不允许静默覆盖 owner。

## P0: Scroll Intent Tests

`deriveScrollIntent()` 是纯函数，必须覆盖：

- scene 内普通滚动返回 `none`。
- 尾部累计 10vh 返回 `arm-next`。
- `INTENT_THRESHOLD_VH = 10` 使用 visualViewport/dvh 对齐的 viewport height。
- wheel/touch/keyboard 输入统一归一化为 viewport-normalized delta。
- ARMED 后继续前进返回 `confirm-next`。
- ARMED 回退返回 `cancel-armed`。
- 快速滚动跨多个 scene 仍只返回一个 next segment。
- PLAYING/PRESENTING 中滚动不会改变 segment progress。

## P0: Scroll Lock Tests

`scrollLock.ts` 必须覆盖：

- lock 时保存 `scrollY`、body overflow、position、top、width、touchAction。
- release 时完整恢复。
- media rejected 时恢复。
- hash navigate 时恢复。
- popstate/back/forward 时恢复。
- unmount 时恢复。
- mobile touch/momentum cancel 时恢复。
- repeated lock/release 不泄漏 body style。

## P0: Media Adapter Tests

视频不是 runtime owner。adapter 只能上报事件。

必须覆盖：

- `play()` resolve 后进入 progress tracking。
- `play()` reject 后 dispatch `MEDIA_REJECTED`。
- missing media dispatch `MEDIA_MISSING`。
- metadata timeout dispatch `MEDIA_METADATA_TIMEOUT`。
- ended never fires dispatch `MEDIA_ENDED_TIMEOUT`。
- `timeupdate` progress >= 0.8 只 dispatch runtime reveal event。
- `ended` 只 dispatch adapter ended，不直接改 scene。
- reduced motion 走 poster/skip fallback。

## P0: Timeline-Owned Copy Tests

必须证明：

- timeline-owned copy 有统一标记。
- global reveal 跳过这些 copy。
- runtime commit 后 copy 不会被 CSS gate 再隐藏。
- preview copy 和 native copy 不同时可见，除非 manifest 明确声明 overlap。

## P1: Component Tests

组件测试只验证 props 到 DOM 的映射：

- `isCopyOwner=false` 时不显示 copy layer。
- `isActiveVisual=false` 时不显示 visual layer。
- scene 不 dispatch 全局 scene commit。
- adapter cleanup 在 unmount 时执行。

## P1/P2: Browser Verification

真实浏览器仍然需要验证：

- 真实滚动锁和移动端 touch。
- video autoplay/rejected。
- canvas/WebGL 非空帧。
- FPS 和掉帧。
- hash/back/forward。

默认不把 Playwright 写成必需项；如果之后明确授权自动化视觉验证，再补 Playwright 或其他浏览器驱动方案。

## Phase 1 必测矩阵

| 场景 | 期望 |
| --- | --- |
| hero 快速滚到 pattern-bottom | 只消费 `hero-to-pattern-top`，不会跳两个 commit |
| ARMED 后回滚 | 回到 IDLE，无 lock |
| pattern-bottom -> aod | commit 后 AOD poster 可见，copy owner 不漂移 |
| AOD play rejected | 解锁，fallback 到 method，不空白 |
| AOD 80% | method copy owner 改变，不由 AOD 组件 set parent state |
| hash 到 method-top | runtime IDLE，committedScene=method-top |
| reduced motion | 跳过动画但 owner commit 完整 |
| unmount during PLAYING | lock 恢复，adapter destroy |

## 验收门槛

Phase 1 开始接全量视觉前，P0 测试必须通过。否则暂停视觉迁移。
