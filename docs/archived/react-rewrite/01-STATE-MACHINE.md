# 状态机规范

本文件描述 `SceneRuntime` 的状态机。核心数据模型见 `07-SCENE-RUNTIME-CONTRACT.md`。

## 核心约定

1. Runtime 只认 `scene` 和 `segment`。
2. scene 是满屏页面或动画舞台，不再分成 `reading / animation / transition` 三类。
3. segment 是从一个 scene 到下一个 scene 的动作，只允许四类：
   - `text-read`
   - `ink-transition`
   - `media-animation`
   - `compound-sequence`
4. 滚动只做两件事：
   - 普通文案段落阅读。
   - scene 尾部继续滚动 10vh 后触发下一个 segment。
5. 墨滴转场、媒体播放、compound sequence 不由 scroll scrub。
6. 目标 scene 的 visual/copy/canvas/mask/media ownership 由 runtime 原子提交。

## 固定状态机

```txt
IDLE
  -> ARMED
  -> SNAP_LOCKING
  -> PLAYING
  -> PRESENTING
  -> RELEASING
  -> IDLE
```

### IDLE

用户处在已经 committed 的 scene 内。

- 允许原生滚动。
- `text-read` 可以根据 scene 内 scroll 派生阅读/装饰进度。
- 接近 scene 尾部并继续滚动 10vh 后，runtime 选择下一条 segment。

### ARMED

用户已经表达进入下一段的 intent，但还没有锁滚动。

- 仍允许用户回退。
- 只记录 `activeScene`、`nextScene`、候选 `activeSegment`。
- 回退超过阈值时清空候选 segment，回到 IDLE。

### SNAP_LOCKING

runtime 接管滚动，对齐到 segment 起点。

- 锁滚动。
- 保存锁定前的 scrollY、body style、touch policy。
- 分配临时 layer owner，但不推进 segment progress。
- 对齐完成后进入 PLAYING。

### PLAYING

active segment 正在推进。

- `ink-transition`：时间驱动 progress。
- `media-animation`：由 media adapter 报告 progress/ended/rejected。
- `compound-sequence`：只推进当前 step，外层 FSM 仍唯一。
- 用户滚动输入只记录为 ignored intent，不改变 progress。

### PRESENTING

segment 已完成，目标 scene 已经被 runtime 原子提交。

- `committedScene = nextScene`。
- target copy 的 owner 已经确定。
- timeline-owned copy 不再被全局 reveal 隐藏。
- 不在这里启动媒体或 compound next step。
- 下一段动作必须等 RELEASING 完成、回到 IDLE 后，再由新的 10vh intent 触发。

### RELEASING

runtime 释放滚动和 transient owner。

- 解锁滚动必须恢复 SNAP_LOCKING 前保存的所有 body/scroll/touch 状态。
- release 完成后进入 IDLE。
- 进入 IDLE 前必须清空 transient owner。

## Event Table

| 当前状态 | 事件 | 条件 | 动作 | 下一状态 |
| --- | --- | --- | --- | --- |
| IDLE | `SCROLL_WITHIN_SCENE` | 未到尾部 | 更新 scene view model | IDLE |
| IDLE | `TEXT_READ_PROGRESS` | active text-read edge | 更新 reading progress，不设 activeSegment | IDLE |
| IDLE | `TEXT_READ_COMPLETE` | active text-read edge complete | `activeScene=committedScene=to` | IDLE |
| IDLE | `SCROLL_INTENT_10VH` | 存在 next segment | 记录 nextScene/segment | ARMED |
| ARMED | `FORWARD_CONFIRM` | 用户继续前进 | 锁滚动并对齐 | SNAP_LOCKING |
| ARMED | `REVERSE_CANCEL` | 用户回退 | 清空 nextScene/segment | IDLE |
| SNAP_LOCKING | `SNAP_DONE` | 对齐完成 | 分配 layer owner，progress=0 | PLAYING |
| SNAP_LOCKING | `SNAP_FAILED` | 对齐失败 | 恢复锁前状态，记录 error | IDLE |
| PLAYING | `SEGMENT_PROGRESS` | activeSegment 匹配 | 更新 segmentProgress | PLAYING |
| PLAYING | `MEDIA_PROGRESS` | active media segment 匹配 | 折算并更新 segmentProgress | PLAYING |
| PLAYING | `STEP_COMPLETE` | active compound step 匹配 | 推进 compound activeStep | PLAYING |
| PLAYING | `SEGMENT_COMPLETE` | progress=1 或 adapter complete | 原子提交 target scene | PRESENTING |
| PLAYING | `MEDIA_REJECTED` | play() rejected | 执行 fallback | PRESENTING |
| PLAYING | `MEDIA_METADATA_TIMEOUT` | metadata timeout | 执行 fallback | PRESENTING 或 RELEASING |
| PLAYING | `MEDIA_ENDED_TIMEOUT` | ended timeout | 执行 fallback | PRESENTING 或 RELEASING |
| PLAYING | `MEDIA_MISSING` | media src missing | 执行 fallback | PRESENTING 或 RELEASING |
| PLAYING | `REDUCED_MOTION_SKIP` | reduced motion 开启 | 跳过播放但执行同一 commit | PRESENTING |
| PLAYING | `SEGMENT_ERROR` | adapter/owner/lock 错误 | recovery 到 last committed scene | RELEASING |
| PRESENTING | `COMMIT_PRESENTED` | target 已提交 | 准备恢复滚动 | RELEASING |
| RELEASING | `RELEASE_COMPLETE` | owner 已归还 | 清空 transient state | IDLE |

全局事件：

| 任意状态 | 事件 | 动作 | 下一状态 |
| --- | --- | --- | --- |
| any | `HASH_NAVIGATE` | 停止 active segment，恢复锁，跳到 hash scene | IDLE |
| any | `POPSTATE_NAVIGATE` | 停止 active segment，恢复锁，跳到 history scene | IDLE |
| any | `UNMOUNT` | 停止 adapter，恢复锁，清理 listener | IDLE |
| any | `OWNER_CONFLICT` | recovery 到 last committed scene，记录 runtimeError | RELEASING |
| any | `SCROLL_LOCK_RECOVERY` | 强制恢复 body/touch/scroll snapshot | IDLE |

非法事件必须被忽略并写入 debug overlay 的 `lastIgnoredEvent`，不能产生隐式状态跳转。

## Segment Policy

### text-read

普通文案阅读是 IDLE 内的 reading policy，不进入 SNAP_LOCKING/PLAYING/PRESENTING。

它仍然写在 `segments[]` 里，目的是让 scene graph 有完整边界；但 runtime 不把它当成 playback segment，不锁滚动，也不设置 `activeSegment`。

完成时 dispatch `TEXT_READ_COMPLETE`，同步设置 `activeScene=committedScene=to`，然后继续保持 IDLE。

它可以使用 `scrollPx -> pure derived progress`，但只能影响当前 scene 内部的非关键视觉：

- 文案阅读位置
- 轻量透明度/位移
- intent indicator

不能影响：

- 下一个 scene 是否 committed
- 墨滴 progress
- 视频 currentTime
- copy owner

### ink-transition

墨滴转场总是在 PLAYING 内执行。

- progress 来源：runtime timer 或 animation adapter。
- commit：只能在 progress=1 时发生。
- source/target layer：由 segment 的 `layerOwnership` 声明。
- canvas owner：segment 自己，完成后归还给 target scene 或 none。

### media-animation

媒体播放是 `from -> to` 的普通 segment，不是组件私有流程。

- Runtime 在 PLAYING 中触发 play。
- Media adapter 只回报 `progress`、`ended`、`rejected`。
- Media adapter 发 `MEDIA_PROGRESS`，reducer 统一写入 `segmentProgress`；普通 adapter/timer segment 发 `SEGMENT_PROGRESS`。
- 80% 文案提前入场由 reducer 的 `applySegmentProgress()` 根据 manifest `reveal.atProgress` 执行一次 `runtime-reveal` ownership action，不是 adapter event，也不是子组件 set parent state。
- play rejected 必须有 fallback：poster+complete 或 scrub fallback，不能卡死在 PLAYING/RELEASING。
- media segment 完成后在 PRESENTING 中 commit 到 `to`，然后 RELEASING，最后回到 IDLE。

### compound-sequence

用于 pattern、figure2、TTG/PH 出场等复合动作。

- 外层只有一个 active segment。
- 内部 step 必须在 manifest 中声明。
- step 之间不能直接改全局 phase，只能发 `STEP_COMPLETE` 给 runtime。
- hash/back/forward 只落到 committed scene，不落到半个 step。

## 当前完整路线

```txt
hero
-> 墨滴中心扩散 -> pattern-top
-> 左侧旋转扩散 -> pattern-bottom
-> 下到上水平墨滴 -> aod-animation
-> 动画 80% method 文案提前入场 -> method-top
-> 普通阅读/滚动 -> method-bottom
-> 下到上水平墨滴 -> figure2-animation
-> figure2 内部远景扩散
-> 保留前景模糊横拱 + “我们见过太多用不上”三卡
-> 保留横拱 + “同野观幂做第四种...”整屏
-> 横拱和文案一起下到上水平墨滴 -> brand
-> 下到上水平墨滴 -> figure3-animation
-> 动画 80% services 文案提前入场 -> services
-> 下到上水平墨滴 -> ttg-animation
-> 上到下水平墨滴 -> lab
-> PH 太阳点放射墨滴 -> ph-animation
-> 上到下水平墨滴 -> education
-> 下到上水平墨滴 -> crane-animation
-> 动画 80% contact 文案提前入场 -> contact
```

这条路线应由 `segments[]` 表达，不能写成组件之间的回调链。

## P0 边界

这些不是 Phase 2 优化，而是 Phase 1 就要定义的主路径：

- 快速滚动：一次只消费一个 next segment，不能跳过多个 scene commit。
- 滚动回退：ARMED 可取消，PLAYING 不可被 scroll scrub 打断。
- Back/Forward：只恢复到 committed scene。
- Hash 直达：跳到 scene 的 stable anchor，runtime phase 重置为 IDLE。
- Reduced motion：跳过时间转场，但仍执行同一套 owner commit。
- Media play rejected：不能留下滚动锁。
- Mobile touch：touchmove 锁定与恢复必须和 body scroll lock 一起保存/恢复。

## 性能目标

- IDLE/RELEASING 原生滚动保持 60fps。
- PLAYING 的 canvas/media 更新不触发 React 高频 rerender。
- Debug overlay 可见但不参与动画循环。
- 锁滚动进入和恢复都应在 50ms 内完成。

## 下一步

阅读 `02-TRANSITION-MANIFEST.md` 查看 canonical scenes 和 segments。
