# 状态机与时序管理重构方案

## 结论

这轮重构的目标不是再新增一套状态机，也不是强行把所有视觉模块塞进一个全局 RAF。

目标是：**收敛到现有 `homepage-snap-runtime` 作为唯一顶层状态机，并把 `scene-timeline-controller` 升级为唯一的场景交接/文案所有权控制器。**

同时，`origin/codex/scene-harness-pattern` 暴露出的局部问题要单独收口：`scene-harness-pattern.html` 不能再自己调度 run，`pattern-scene-player.js` 不能再让 provider/player 两层都拥有 public status。它应该作为第一个小范围落地对象，先验证“命令序列 + run identity + 单一 phase”的写法。

之前方案里保留的判断是对的：

- 当前问题不是单个 adapter 调参失败，而是多套系统同时决定同一帧。
- 需要一个单一 frame state 来回答：当前场景是谁、下一场景是谁、进度是多少、文案归谁、视觉归谁、交互归谁。
- adapter 应该只负责视觉，不应该决定滚动、目标 section 呈现、handoff 完成。

之前方案需要修正的点：

- 不从 worktree 直接合并 `js/scenes/runtime/state-machine.js` 作为第三套 FSM。
- 不把 “每帧只有 1 个 RAF” 当成硬目标。视频/WebGL/adapters 可以有内部 RAF，但不能拥有页面时序和交接。
- 不新增独立 `atomic-handoff.js` 旁路现有 timeline/presentation 层。原子性交接应进入 `scene-timeline-controller`。
- 不把 `scene-timeline-controller` 合并到 renderer。timeline 决定状态，renderer 只画画。
- 不把 `scene-harness-pattern` 当成普通 demo 页跳过。它现在正是状态分裂的最小复现，应先按 controller 合约收口。
- 不允许 HTML / player / provider 三层同时拥有 public status。状态只能有一个对外真相源。

## 现状问题诊断

### 当前架构的 5 重竞争问题

```
┌─────────────────────────────────────────────────────────────┐
│ Frame N: 谁拥有 belief 段的可见性？                           │
├─────────────────────────────────────────────────────────────┤
│ 1. homepage-transition-runtime     -> playhead/gate/scroll   │
│ 2. scene-timeline-controller       -> commit/present/cleanup │
│ 3. section-presentation-controller -> section handoff state  │
│ 4. transition adapter              -> RAF + timeline.update  │
│ 5. reveal.js / ScrollTrigger       -> copy entry visibility  │
└─────────────────────────────────────────────────────────────┘

结果：黑闪、重复出现、交接空白、反向/直达 hash 状态错位。
```

### 根因

1. **顶层状态分裂**：旧 `homepage-transition-runtime` 和新 `homepage-snap-runtime` 都能控制滚动/锁定/播放，只是当前通过 flag 避免同时启动。
2. **交接所有权分裂**：`homepage-transition-runtime` 仍有 gate、handoff、direct-hash、post-scroll 完成逻辑；`scene-timeline-controller` 又有 `commit/present/cleanup`。
3. **文案所有权分裂**：目标 copy 可能同时受 transition layer、native section、global reveal 控制。
4. **adapter 权限过大**：adapter 自己读取 progress、自己 RAF、自己 `timeline.update()` / `timeline?.update()`，有些还参与 handoff progress 判断。
5. **manifest 分裂**：`timelineJoins` 和 `homepageTimeline.scenes` 都描述页面时序，但没有统一导出一个 frame contract。

### 已核实的代码证据（2026-07-04）

以下均已在当前分支逐行核实，作为各 Phase 的验收基线：

| # | 问题 | 位置 | 证据 |
|---|------|------|------|
| 1 | direct-hash 用散落 timer 反复对齐 | `js/transitions/homepage-transition-runtime.js:23,528` | `DIRECT_HASH_ALIGNMENT_DELAYS = [0, 120, 420, 1100, 2400, 5200, 9200]`，7 次重试逐一 `setTimeout` |
| 2 | 旧 runtime 仍拥有 playhead + lock + gate | `js/transitions/homepage-transition-runtime.js:596-643` | `playController()` 内联完成 lock、gate、progress 动画、handoff；虽有 `activeController` 防重入守卫（:597），但"完成"语义仍由它单方面定义 |
| 3 | adapter 自驱 RAF 并直接推 timeline | `js/transitions/homepage/aod-homepage-adapter.js:89-102` | `progressSource()` 自取进度 + `timeline?.update(progress, { reason: 'aod-render' })` + 自建 `requestAnimationFrame` 循环；其余 homepage adapter 同构，reason 多为 `*-render` 而不是统一的 `self-driven` |
| 4 | pattern-bloom 阈值重叠 + 多可见性决策打架 | `js/transitions/pattern-bloom-adapter.js:8-12,205,229` | `REVEAL_END=0.46` 与 `BLOOM_START=0.42` 重叠、`SECOND_REVEAL_START=0.50` 与 bloom 段重叠；`topSceneOpacity` 在 `secondRevealProgress < 0.998` 边界硬切 0（黑闪来源） |
| 5 | presented 状态存三处 | `scene-timeline-controller.js:123`、`section-presentation-controller.js`、reveal.js WeakSet | `presentedJoinIds` Set、`presentedSections` Set、`suppressedOnce` WeakSet 各自记账，互不同步 |
| 6 | commit 与 present 之间存在无主真空期 | `js/transitions/homepage/scene-timeline-controller.js:82-152` | `commitAt !== presentAt` 时，视觉已提交但 copy 尚未接管，reveal.js 可在此间隙重新隐藏副本 |

已核实**做对了**的部分（迁移时保留，不要推倒）：

- `playController()` 的 `activeController` 防重入守卫（:597）和 `completePlayback` 的归属校验（:477）。
- `presentTarget()` 的 `presentedJoinIds` 幂等守卫（:139）——同一 join 只 present 一次。
- `createCleanupStack()` 的 LIFO + 异常安全清理。
- `homepage-snap-runtime` 的显式 phase 枚举与 `recovery-handler` 的超时保护。
- `input-normalizer` 的多输入源归一化（deltaMode、touch、keyboard 统一单位 + 单帧限幅）。

### `scene-harness-pattern` 的局部根因

这个分支里的 pattern harness 不是单纯“状态命名不清楚”，而是命令调度、动画时钟、public status 分在三处：

```
scene-harness-pattern.html
  currentRun / button async flow / setTimeout / screenshot state

createPatternSceneProvider()
  provider.status / provider.mode / provider.progress / activeRun / requestFrame

createPatternScenePlayer()
  player.status / activeToken / providerStatus wrapper
```

因此它需要一个小型 controller，而不是继续给现有 provider/player 补 if：

1. HTML harness 只 dispatch command 和渲染 snapshot，不保存 `currentRun` 作为状态源。
2. controller 是唯一 public phase/run owner。
3. provider 只负责 mount、set progress、request render、destroy，不对外发业务状态。
4. progress driver 是唯一 timeline progress 时钟；renderer 可以保留自己的连续渲染 RAF，但不能拥有 command lifecycle。
5. 所有异步结果都必须带 `runId` 或等价 generation，旧 run 返回时不能 commit 新状态。
6. `SOURCE_PROGRESS`、`POSTER_PROGRESS`、`FINAL_PROGRESS` 必须按真实视觉语义命名，禁止 `cancelToSource()` 实际落到 `posterProgress = 1` 这种反向语义。

## Shopify Editions 可参考的真实模式

Shopify 的重点不是 “用了 Theatre.js/Rive”，而是：

1. **中央 section state**  
   一个 store 维护 `sectionMap / activeSection / interactiveSection / transitionProgress / isProgrammaticScroll`。滚动只更新这个状态源。

2. **纯函数解析 current + next**  
   scrollY 进入 resolver，输出当前 section、下一 section、二者 progress。每帧最多是 current + next。

3. **双场景合成**  
   WebGL compositor 渲染当前场景和下一场景，再用同一个 `transitionProgress` crossfade。目标内容不是临时搬 DOM。

4. **场景内部 timeline 只是 renderer 细节**
   Theatre.js/Rive 负责场景内部动画参数，不是页面总状态机。

5. **progress 就是状态，场景是 progress 的纯函数**
   场景渲染路径上没有 `hasPlayed` / `isAnimating` 这类一次性布尔（证据：`Effects-E8kgmdWM.js` 中 `sheet.sequence.position = f(globalProgress)` 直接赋值，无 flag 分支）。同一个 progress 进来永远渲染出同一画面——所以**天然幂等（不可能重复触发）、天然可逆（倒放免费）**。离散状态只存在于 store 顶层（`activeSection`），场景层不持有。

6. **交接靠区间，不靠事件握手**
   场景 A/B 的进入退出由中央定义的 progress 区间决定，交接就是两个区间的重叠段。不存在"A 通知 B 你可以进了"的回调链，也就不存在握手丢失、时序错位。对应到我们：join 的所有阈值必须固化在 manifest，禁止 adapter 内部私藏阈值常量。

7. **细粒度订阅，每帧最多 current + next 在算**
   非活跃场景不消费 progress（Zustand selector 订阅 `sectionMap.get(idx)?.progress`）。对应到我们：frame 分发时只喂当前 join 涉及的 adapter，其余保持冻结帧。

8. **ready 是门，不是回调**
   资源加载完成体现为 store 里的 ready 状态，场景激活被 ready gate 挡住；而不是 loaded 回调里手动触发进入动画。对应到我们：`milestones.targetReady` 由 adapter 上报，激活决策留在 Director/SceneTimeline。

我们要学的是：**单一 frame state + renderer 被动消费 + progress 纯函数化**。不需要照搬 Theatre.js、Rive 或 React 架构。

## 目标架构

```
┌──────────────────────────────────────────────────────────────┐
│ HomepageDirector                                             │
│ = 现有 js/runtime/homepage-snap-runtime.js                    │
│ 负责输入、snap、scroll lock、playback、recovery、release       │
└───────────────────────────────┬──────────────────────────────┘
                                │ emits lifecycle + progress
                                ↓
┌──────────────────────────────────────────────────────────────┐
│ SceneTimeline                                                 │
│ = 升级 js/transitions/homepage/scene-timeline-controller.js    │
│ 负责 join、phase、copyOwner、visualOwner、commit/present/cleanup │
└───────────────────────────────┬──────────────────────────────┘
                                │ emits SceneTimelineFrame
                                ↓
┌──────────────────────────────────────────────────────────────┐
│ PresentationController                                        │
│ 负责 native/fixed/hidden copy 状态、reveal 抑制、DOM 标记       │
└───────────────────────────────┬──────────────────────────────┘
                                │ frame
                                ↓
┌──────────────────────────────────────────────────────────────┐
│ Adapters                                                      │
│ pattern-bloom / aod / figure2 / figure3 / crane / ...         │
│ 只负责视觉渲染和 milestone 上报                               │
└──────────────────────────────────────────────────────────────┘
```

### `SceneTimelineFrame`

每一帧只有一个权威状态对象：

```js
{
  joinId: 'belief-method',
  fromScene: 'belief',
  toScene: 'method',
  direction: 1,
  phase: 'playing', // idle | preparing | playing | committed | presented | cleanup | released
  progress: 0.74,
  sourceOpacity: 0.42,
  targetOpacity: 0.88,
  copyOwner: 'timeline-fixed', // hidden | timeline-fixed | native
  visualOwner: 'adapter',      // adapter | native | compositor
  interactionOwner: 'director',// director | native | none
  milestones: {
    targetReady: true,
    playbackComplete: false
  }
}
```

### Adapter 合约

adapter 可以：

- `prepare(frame)`：准备素材或首帧。
- `render(frame)`：按 frame 渲染视觉。
- `play({ direction, frame, reportMilestone })`：执行媒体/时间驱动播放。
- `destroy()`：清理自身资源。
- `reportMilestone(name, value)`：报告资源/播放完成度。

adapter 不可以：

- 调用 `window.scrollTo` / `scrollIntoView` / `lenis.scrollTo`。
- 直接 `lockScroll` / `unlockScroll` / 修改 `body.style.overflow`。
- 直接调用 `presentRevealWithin`、`completeHandoff`、`markPresented`。
- 直接改目标 section 的 `data-section-handoff-state`。
- 移动真实目标 DOM 做转场素材。
- 自己决定 `commit/present/cleanup`。
- 调用 `timeline.update()` 或 `timeline?.update()`（例如 `aod-homepage-adapter.js` 里的 `reason: 'aod-render'` 路径整体废除）。progress 只能从 frame 读入，不能反向推回 timeline。
- 自建 RAF 循环驱动业务 progress。内部 RAF 只允许用于连续重绘（读 frame 画画），不允许作为 progress 时钟或 command lifecycle。
- 读取 `data-section-handoff-state` / `data-timeline-phase` 等 DOM 属性做逻辑判断（原则 9）。
- 把 manifest 中声明的真实 copy selector 对应节点 append/insert 到 overlay 或临时容器；过渡素材只能 clone/snapshot/canvas/texture。
- 拥有对外的 scene phase / handoff phase / command lifecycle。
- 把 `status`、`mode`、`progress` 作为互相独立的 public 状态源。

adapter 的 `play()` 可以内部等待 video、WebGL、timed driver 或资源 ready，但结果只能是可取消的 completion signal。它不能在 promise resolve 之后绕过 Director/SceneTimeline 去提交目标状态。

### Pattern Scene Harness Controller 合约

这个合约先用于 `scene-harness-pattern.html` 和 `js/scene-harness/pattern-scene-player.js`，后续再把可复用部分沉淀到 pattern-bloom adapter。

落地时必须拆文件，避免 facade / controller / provider 形成 ESM 循环依赖：

```
pattern-scene-provider.js
  exports createPatternSceneProvider

pattern-scene-controller.js
  imports provider + timed driver
  exports createPatternSceneController

pattern-scene-player.js
  imports controller
  exports compatibility facade only
```

#### 职责拆分

```
Harness UI
  dispatch(command)
  render(snapshot)
  set screenshot state for verification only

PatternSceneController
  only public phase owner
  only runId / cancellation owner
  validates command transitions
  drives progress driver

PatternSceneProvider
  mount(host)
  setProgress(progress)
  requestRender()
  destroy()

createTimedProgressDriver()
  only timeline progress clock

createPatternMirrorScene()
  renderer only
  may keep internal continuous render RAF
  reads progressSource()
```

#### Public state

对外只暴露一个 phase，不再同时暴露 provider status 和 player status：

```js
type PatternPhase =
  | 'unmounted'
  | 'mounting'
  | 'source'
  | 'playing'
  | 'final'
  | 'reversing'
  | 'destroyed';

type PatternSceneState = {
  phase: PatternPhase,
  progress: number,
  runId: number,
  mounted: boolean,
  ready: boolean,
  reason?: 'cancelled' | 'superseded' | 'aborted' | 'invalid_phase' | 'destroyed'
};
```

`mode` 可以作为 renderer 参数存在，但必须从 `phase` 和 `progress` 推导，不能作为第二套 public 状态。`providerStatus` 只能在迁移期作为 debug 字段保留，不能参与 UI 决策。

#### Progress 命名

必须先固定语义：

```js
const SOURCE_PROGRESS = 0;
const FINAL_PROGRESS = 1;
```

`POSTER_PROGRESS` 只有在 facade 兼容层临时保留。如果 poster 是终态，就命名为 `FINAL_PROGRESS`；如果 source 是起点，`cancelToSource()` 必须落到 `SOURCE_PROGRESS`，不能调用 `cancelToPoster()` 再落到 1。controller 内部禁止再使用 `poster` phase，避免把旧歧义带进新状态机。

#### Command rules

命令必须走显式状态表：

```text
unmounted --MOUNT--> mounting
mounting  --READY--> source
source    --PLAY--> playing
playing   --DONE--> final
playing   --REVERSE--> reversing
playing   --CANCEL_TO_SOURCE--> source
playing   --CANCEL_TO_FINAL--> final
final     --REVERSE--> reversing
reversing --PLAY--> playing
reversing --DONE--> source
reversing --CANCEL_TO_SOURCE--> source
reversing --CANCEL_TO_FINAL--> final
any       --DESTROY--> destroyed
```

`destroyed` 是 controller 实例的终态。harness 的 Mount 按钮如果要在 Destroy 后重新挂载，必须创建新的 controller/player 实例；不要在同一个 controller 上实现 `destroyed -> mounting`，否则会把资源生命周期和 run lifecycle 再次混在一起。

非法命令返回：

```js
{ accepted: false, completed: false, reason: 'invalid_phase' }
```

异步 run 必须绑定身份：

```js
async function startRun(kind) {
  const runId = ++state.runId;
  cancelDriverOnly();
  state.phase = kind === 'play' ? 'playing' : 'reversing';

  const result = await driver.play({
    from: state.progress,
    to: kind === 'play' ? FINAL_PROGRESS : SOURCE_PROGRESS,
    direction: kind === 'play' ? 1 : -1
  });
  if (state.runId !== runId) {
    return { accepted: true, completed: false, reason: 'superseded' };
  }

  state.phase = result.completed
    ? (kind === 'play' ? 'final' : 'source')
    : state.phase;
  return result;
}
```

取消必须递增 `runId`，这样旧 promise 回来时永远不能改新 phase：

```js
function cancelCurrentRun(reason = 'cancelled') {
  state.runId += 1;
  driver.cancel();
  const target = reason === 'cancel_to_final' ? FINAL_PROGRESS : SOURCE_PROGRESS;
  state.phase = target === FINAL_PROGRESS ? 'final' : 'source';
  provider.setProgress(target);
  return { accepted: true, completed: false, reason };
}
```

HTML harness 不允许用裸 `currentRun` 判断当前是否播放中；按钮状态应从 `controller.getState().phase` 推导。

## 状态和时序原则

1. **一个 scroll owner**  
   同一运行模式下只能有一个系统监听并消费 wheel/touch/key scroll。当前 `js/main.js` 已经通过 `?snapRuntime=1` 保证新旧 runtime 二选一，这个约束必须保留。

2. **一个 frame owner**  
   所有 copy visibility、scene phase、handoff completion 都从 `SceneTimelineFrame` 派生。

3. **一个 copy owner**  
   同一个 copy selector 同一帧只能是 `hidden`、`timeline-fixed`、`native` 之一。

4. **source 不能早退**  
   `targetPresented === true` 且 target copy 已由 timeline/native 接管前，source 不允许完全不可见。

5. **target release 是 timeline 事件**  
   gate release、copy fixed release、native section present、reveal suppression 必须在同一个 timeline transaction 里完成。

6. **真实 DOM 不做转场素材**  
   需要视觉 bridge 时使用 clone/snapshot/canvas/texture，不移动目标 DOM 本体。

7. **特殊路径归 Director 管**
   direct-hash、post-scroll、reduced-motion、recovery 都是 `HomepageDirector` 的分支，不散落到 adapter。

8. **视觉是 frame 的纯函数**
   adapter 的 `render(frame)` 必须满足：同一个 frame 输入渲染出同一画面。渲染路径上禁止 `hasPlayed` / `entered` / `canvasRevealed` 这类一次性布尔；需要"只做一次"的语义时，用 frame 的 phase/milestone 表达，由 SceneTimeline 保证幂等。这是消除"重复出现"和支持反向播放的根本手段。

9. **DOM data-\* 属性是输出，不是输入**
   `data-section-handoff-state`、`data-timeline-phase`、`data-entry-state` 只能由 owner 写入供 CSS 消费，任何 JS 逻辑不允许读回这些属性做状态判断。状态判断只能来自 frame / controller snapshot。

10. **阈值只能活在 manifest**
   所有 join 的 progress 阈值（reveal/bloom/commit/present/cleanup 等）必须集中在 `scene-timeline-manifest.js`，同一 join 内的阶段区间必须有序且交接重叠段显式声明。迁移期允许存量 adapter 常量留在 `KNOWN_VIOLATIONS`，但新增阈值常量直接 fail；等 frame 输入稳定后，adapter 文件里出现魔法阈值常量一律视为违约。

## 当前代码映射

### 已可复用

- `js/runtime/homepage-snap-runtime.js`  
  已有明确 FSM：`FreeScroll / SnapAligning / SnappedArmed / TriggeredPlayback / Playing / Completing / ReleaseCooldown / RecoverPresentTarget`。

- `js/runtime/homepage-runtime-integration.js`  
  已有 `scenePresenter` seam 和 per-scene adapter registry，可作为新 Director 接 adapter 的入口。

- `js/runtime/timed-progress-driver.js`  
  已有可测试的时间进度驱动，适合 pattern-bloom、figure2 这类非真实媒体段。

- `scripts/check-pattern-scene-harness.mjs`  
  已有 pattern harness 的基础 Node 验证，可以扩展为 run identity / supersede / cancel race 验收。

- `js/transitions/homepage/scene-timeline-controller.js`  
  已有 `deriveTimelineState()`、`commitAt/presentAt/cleanupAt`、target copy fixed 逻辑，应该升级而不是旁路。

- `js/transitions/homepage/scene-timeline-manifest.js`  
  已有 `timelineJoins` 和 `homepageTimeline.scenes`，需要合并成统一 frame 输入。

### 需要降级/迁出

- `js/transitions/homepage-transition-runtime.js`  
  现在仍拥有 playhead、scroll lock、target gate、handoff complete、direct-hash alignment。目标是把它降级为 legacy adapter mount/兼容层，最后删除其状态机职责。

- `js/transitions/homepage/*-homepage-adapter.js`  
  这些 legacy adapter 仍自己 RAF + `timeline.update()` / `timeline?.update()`。迁移后只能渲染 frame 或报告 milestone。

- `js/ui/reveal.js`  
  对 timeline-owned copy 必须可跳过或被 presentation controller 原子性抑制，不能在 handoff 中途重新触发。

- `scene-harness-pattern.html`  
  现在拥有 `currentRun`、button async flow、timeout cancel 和 screenshot state。迁移后只保留 command dispatch、snapshot render 和截图标记。

- `js/scene-harness/pattern-scene-player.js`  
  现在 provider/player 双层拥有 status，provider 内部还有 `activeRun` 和手写 RAF progress driver。迁移后拆成独立 provider + controller + player facade：controller 拥有 phase/runId，provider 只拥有渲染资源，player 只做兼容转发。

## 迁移计划

### Phase 0: 冻结契约，不改视觉

目标：先防止继续扩大状态竞争。

- [ ] 在本文档确认 `homepage-snap-runtime` 是唯一目标 FSM。
- [ ] 定义 `SceneTimelineFrame` 类型/注释，放在 `scene-timeline-controller.js` 或相邻模块。
- [ ] 增加静态检查脚本：adapter 禁止直接滚动、禁止直接 present target、禁止直接改 section handoff state、禁止调用 `timeline.update(` / `timeline?.update(`（正则覆盖 optional chaining）、禁止读取 `data-section-handoff-state`/`data-timeline-phase` 做判断。
- [ ] 增加 manifest 检查：每个 join 必须有唯一 `fromScene/toScene/progressPolicy/commitAt/presentAt/cleanupAt`，且 `commitAt <= presentAt <= cleanupAt`。
- [ ] 把 `pattern-bloom-adapter.js:8-12` 的阈值常量（`REVEAL_END/BLOOM_START/BLOOM_END/SECOND_REVEAL_*`）先**登记到 manifest**，作为"阈值只能活在 manifest"（原则 10）的第一个执行案例；本 Phase 只增加数据和校验，不改 adapter 读法。adapter 仍保留模块级常量并列入 `verify:adapter-contract` 的 `KNOWN_VIOLATIONS`，等 Phase 4 迁移到 frame 输入后再删除。
- [ ] 增加 copy ownership 检查：timeline-owned selector 不允许同时由 global reveal 默认接管。
- [ ] 增加 init 幂等检查：`initHomepageTransitions()` 重复调用不得重复绑定 wheel/scroll/keydown 监听（当前 `main.js:75` 只调一次，但函数本身无守卫）。
- [ ] 把 `scripts/check-pattern-scene-harness.mjs` 接入 `package.json`，至少提供 `npm run verify:pattern-scene-harness`。
- [ ] 给 pattern harness 增加 run identity 用例：double play、play-cancel-play、play-reverse、destroy mid-play、旧 promise late resolve。
- [ ] 冻结 progress 命名：明确 source/poster/final 的视觉含义，修掉 `cancelToSource()` 到 `posterProgress = 1` 的语义错位。

建议脚本名：

```bash
npm run verify:homepage-owner-contract
npm run verify:adapter-contract
npm run verify:frame-contract
npm run verify:pattern-scene-harness
```

### Phase 0A: 先收口 Pattern Scene Harness

目标：在不动 homepage runtime 的前提下，先把最小复现从“三层状态 + 两套调度”改成“单一 controller + run identity”。这是 Phase 1/2 的试验田，不等同于默认切换线上 runtime。

- [ ] 新增或重写 `createPatternSceneController()`。
- [ ] `createPatternScenePlayer()` 变成兼容 facade，内部委托 controller，迁移期保留旧方法名。
- [ ] provider 移除 public `STATUS` 语义，只保留 mount/render/progress/destroy snapshot。
- [ ] provider progress 动画改用 `createTimedProgressDriver()`，不再手写 `animateProgress()`。
- [ ] HTML 删除 `currentRun` 调度逻辑，按钮只调用 controller command。
- [ ] `cancelToSource()`、`cancelToFinal()`、`showFinal()` 的 progress 目标按 `source=0/final=1` 重写；`showPoster/cancelToPoster/reverseToPoster` 只允许作为兼容 facade，且不得作为 HTML 按钮状态源。

验收：

- 快速连续触发 `playForward()` 两次：第一次返回 `superseded`，最终 phase 只由第二次决定。
- `playForward()` 后立刻 `cancelToSource()` 再 `playForward()`：旧 cancel/play 的 late resolve 不会把新 run 清掉。
- `reverseToSource()` 只有在 `final`/`playing` 等明确 phase 下可接受；legacy `reverseToPoster()` 若临时保留，只能返回 deprecated/invalid，不能偷偷改写当前 phase。
- `destroy()` 后所有 frame、driver、resize listener 都清空，旧 promise 返回 `destroyed` 或 `superseded`，不能再 emit 新 phase。
- Node 验证覆盖以上命令序列，不要求 Playwright；视觉关键路径另行人工或截图验收。

### Phase 1: 让 SceneTimeline 成为唯一交接入口

目标：先收口 `commit/present/cleanup`，不急着迁所有视觉。

- [ ] 给 `scene-timeline-controller` 增加 `beginJoin()`、`updateFrame()`、`commitTarget()`、`presentTarget()`、`cleanupJoin()`。
- [ ] `presentTarget()` 内部统一处理：
  - section `data-scene-state`
  - section `data-section-handoff-state`
  - copy `data-entry-state`
  - timeline fixed copy class
  - reveal suppression/present
- [ ] `section-presentation-controller` 降级为 presentation helper，不再独立决定 handoff lifecycle。
- [ ] `homepage-transition-runtime` 中的 `notifyHandoffComplete()` 改为调用 SceneTimeline 的接口。
- [ ] 同步更新 `scripts/check-homepage-transition-integration.mjs`：旧断言现在要求 runtime 调 `presentationController.beginHandoff/completeHandoff`，Phase 1 后应改为断言 runtime 经 `sceneTimeline.presentTarget` / `scene-timeline:presented` 走统一入口。

验收：

- 同一个 join 的 `presentTarget()` 只会触发一次。
- `targetPresented` 前 source opacity 不会变成 0。
- copy owner 状态在任意帧唯一。

### Phase 2: Director 接管播放生命周期

目标：用现有 `homepage-snap-runtime` 作为唯一顶层状态机。

- [x] 在 `homepage-runtime-integration.js` 的 `scenePresenter` 中接入 SceneTimeline frame。
- [x] Director 进入 `Playing` 时调用 adapter `play()`，adapter 只返回完成/失败，不直接 present target。
- [x] Director 进入 `Completing` 时由 SceneTimeline commit/present/cleanup。
- [x] recovery 统一走 `RecoverPresentTarget`，由 SceneTimeline 呈现最后安全状态。
- [x] Phase 2 期间保留 `?snapRuntime=1` pilot；Phase 5 已切为默认。

验收：

- snap runtime 默认路径下只有 `homepage-snap-runtime` 消费 wheel/touch/key。
- 播放失败会释放滚动并呈现安全目标，不会卡死。
- `window.__homepageRuntime.getState()` 能解释当前页面状态。

### Phase 3: Legacy runtime 降级

目标：旧 runtime 不再拥有状态机职责。

- [x] 从 `homepage-transition-runtime.js` 抽出 adapter mount registry。
- [x] 删除或旁路旧 runtime 的这些职责：
  - `lockScroll()` / `unlockScroll()`
  - `beginTargetRevealGate()` / `releaseTargetRevealGate()`
  - `completePlayback()`
  - `completePostScrollHandoff()`
  - direct-hash alignment timers
- [x] 保留旧 path 作为视觉兼容层，直到所有 join 都迁完；Phase 5 后只作为显式 fallback。

验收：

- 同一运行模式下不存在两个 scroll lock owner。
- handoff complete 只能由 SceneTimeline 发出。

### Phase 4: 按 join 迁移 adapter

迁移顺序从最容易暴露交接 bug 的段开始：

1. `home-belief` / `pattern-bloom`
2. `belief-method` / `aod`
3. `method-proof-brand` / `figure2`
4. `brand-services` / `figure3`
5. `philosophy-contact` / `crane`

每个 join 的迁移验收：

- adapter 不直接滚动页面。
- adapter 不直接标记 target section presented。
- adapter 不移动真实目标 DOM。
- adapter 只通过 `reportFrame()` 报告播放进度、通过 `reportMilestone()` 报告 `targetReady/playbackComplete/mediaReady`；Director 把进度落成 `SceneTimelineFrame` 后再调用 `render(frame)`。
- SceneTimeline 输出的 `copyOwner` 在截图/日志中无重复。
- adapter 渲染路径无一次性布尔，`render(frame)` 对同一 frame 幂等（原则 8）。

`pattern-bloom`（join 1）专项要求——它是"转场乱搞/黑闪"的最严重复现：

- [x] 现有 9 个本地状态变量（`canvasRevealed`、`beliefPinned`、`beliefSceneOpacity`、`secondRevealProgress` 派生量等）收敛为从 frame 推导的局部量，不跨帧存活。
- [x] Phase 0 迁入 manifest 的阈值改为**有序、无隐式重叠**的阶段区间表；`REVEAL_END=0.46` vs `BLOOM_START=0.42`、`SECOND_REVEAL_START=0.50` 这类重叠要么显式声明为交接段，要么修正数值。
- [x] 消除 `pattern-bloom-adapter.js:205` 的硬切：`topSceneOpacity` 在 `secondRevealProgress` 边界必须连续（用 smoothstep 缓冲带替代 `< 0.998 ? x : 0`），验收标准为任意相邻两帧 opacity 差值有上限。
- [x] 前景 canvas、背景 scene、belief 文案三者的可见性必须在同一个 `render(frame)` 内从同一 progress 推导，禁止三条独立决策链。

### Phase 5: 清理和默认切换

- [x] 删除废弃 handoff receiver/preview 路径。
- [x] 默认路径移除 legacy runtime 的状态机控制权；`homepage-transition-runtime.js` 的旧状态机代码仍保留为 `?legacyRuntime=1` / `?snapRuntime=0` 显式 debug fallback。
- [x] 把 snap runtime 从 opt-in 改成默认，仅保留 `?legacyRuntime=1` / `?snapRuntime=0` 临时 fallback flag。
- [x] 更新 docs/ADR，明确新架构的 owner contract。
  - `docs/ADR-homepage-js-snap.md` 记录 snap runtime 成为默认 owner、SceneTimeline 是唯一 present/cleanup 入口。
  - `docs/ADR-homepage-reverse-playback.md` 记录当前 reverse fallback 策略。
  - `verify:homepage-owner-contract` 已清空 known violation baseline，timeline-owned copy 不再由 `.reveal` 控制。

## 验证标准

### 现有验证命令

```bash
npm run verify:homepage-timeline
npm run verify:handoff-ownership
npm run verify:homepage-schema
npm run verify:homepage-snap
npm run verify:runtime-integration
npm run verify:snap-runtime
npm run verify:progress-driver
npm run verify:pattern-bloom-adapter
npm run verify:aod-adapter
npm run verify:figure2-adapter
```

### 新增/接入验证建议

```bash
npm run verify:homepage-owner-contract
npm run verify:adapter-contract
npm run verify:frame-contract
npm run verify:scene-timeline
npm run verify:pattern-scene-harness
```

`verify:homepage-owner-contract` 应检查：

- 每个 join 的 `commitAt <= presentAt <= cleanupAt`。
- 每个 target copy selector 只有一个 owner。
- timeline-owned copy 不被 global reveal 默认接管。
- direct-hash / post-scroll / reduced-motion 都有明确 Director 分支。

`verify:adapter-contract` 应检查 adapter 中禁止出现：

- `window.scrollTo`
- `scrollIntoView`
- `lenis.scrollTo`
- `body.style.overflow`
- `presentRevealWithin`
- `completeHandoff`
- `timeline.update(` / `timeline?.update(`（实现用 `timeline\s*\??\.\s*update\s*\(`，不要依赖 reason 名称；当前 baseline 已清空）
- 直接写 `data-section-handoff-state`
- 读取 `data-section-handoff-state` / `data-timeline-phase`（getAttribute/dataset 形式）
- 模块级 progress 阈值常量（阈值必须来自 manifest）
- 移动真实 copy DOM 到 overlay/stage（真实 DOM 搬运 baseline 已清空；允许 clone / snapshot / canvas / texture）

`verify:pattern-scene-harness` 应检查：

- `scene-harness-pattern.html` 不保存 `currentRun` 作为 command 状态源。
- controller snapshot 只有一个 public `phase`。
- provider 不暴露独立 public status/mode lifecycle。
- 所有 async play/reverse/cancel/destroy 序列都带 run identity。
- superseded/cancelled/destroyed run late resolve 不能改变当前 phase。
- `cancelToSource()` 的目标 progress 与命名一致。

### 运行时验收

开启 `?snapRuntime=1` 后，必须能在日志或 debug 面板看到：

```
FreeScroll
-> SnapAligning
-> SnappedArmed
-> TriggeredPlayback
-> Playing
-> Completing
-> ReleaseCooldown
-> FreeScroll / SnappedArmed
```

同时每个 join 的 timeline phase 应单调：

```
idle -> preparing -> playing -> committed -> presented -> cleanup -> released
```

允许 recovery 分支，但 recovery 后必须：

- 释放 scroll lock
- 清空 active adapter
- 呈现 target 或 lastSafeScene
- 不留下 timeline-fixed copy

## 风险和边界

1. **AOD/视频段不能强制统一 RAF**  
   AOD 应以 video playback 为事实源，RAF 只读取 `currentTime` 更新视觉层，不写 `currentTime`。

2. **figure2 有多阶段，不应一次迁完整链路**  
   先迁 `figure2-animation`，proof cards/closing/ink sweep 可以作为后续 scene/join 独立处理。

3. **direct hash 不应由 adapter 修复**  
   direct hash 是 Director 的初始状态/恢复问题，不能再用散落 timer 反复对齐。

4. **global reveal 不能粗暴全局禁用**  
   只对 timeline-owned target copy 做 skip/suppress，否则会破坏普通内容区进入动画。

5. **不做大爆炸替换**  
   每次迁移一个 join，保留 fallback，确保能比较新旧路径。

6. **Pattern harness 不是线上 runtime 替代品**  
   它用于验证 controller 合约和命令序列。通过后再决定如何迁移 pattern-bloom adapter，不直接拿 harness 逻辑旁路 SceneTimeline。

7. **renderer RAF 可以存在，但 timeline progress 只能有一个 owner**  
   `createPatternMirrorScene()` 的 continuous render 可以继续负责动态花纹和重绘；progress ramp 必须由 controller/driver 拥有。

## 附录：状态碎片清单与目标归属

迁移前共 14 处状态存储，目标是每类状态只剩一个 owner。此表用于逐 Phase 勾销：

| 现状存储 | 位置 | 目标归属 | 处置 Phase |
|---------|------|---------|-----------|
| `activeController` 单例 | homepage-transition-runtime.js:219 | Director phase | Phase 2-3 |
| `presentedJoinIds` Set | scene-timeline-controller.js:123 | SceneTimeline（保留，成为唯一 presented 记账） | Phase 1 |
| `presentedSections` Set | section-presentation-controller.js | 并入 SceneTimeline | Phase 1 |
| `suppressedOnce` WeakSet | reveal.js | PresentationController 统一抑制 | Phase 1 |
| `revealControls` WeakMap | reveal.js | 保留（renderer 资源，不是状态） | — |
| `data-section-handoff-state` | 多处写入 | 只由 `presentTarget()` 写，输出属性 | Phase 1 |
| `data-timeline-phase` | scene-timeline-controller.js | 保留，输出属性 | — |
| `data-section-transition-state` + gate class | homepage-transition-runtime.js | 已删除；不再作为状态机输入 | Phase 3 |
| `is-pattern-bloom-pinned` / `is-pattern-bloom-covering` class | pattern-bloom-adapter.js | 从 frame 推导后写出 | Phase 4 |
| pattern-bloom 9 个本地布尔/派生量 | pattern-bloom-adapter.js | 消灭，改为 frame 纯函数局部量 | Phase 4 |
| `isForcingLightNav` / `destroyed` | aod-homepage-adapter.js | `destroyed` 保留（资源生命周期）；nav 色调从 frame 推导 | Phase 4 |
| `currentRun` | scene-harness-pattern.html | PatternSceneController runId | Phase 0A |
| provider `status/mode/progress` | pattern-scene-player.js | controller 单一 phase | Phase 0A |
| `directHashAlignmentTimers` 数组 | homepage-transition-runtime.js | 已删除；direct hash 由 Director 初始状态分支处理 | Phase 3 |

## 文件清单

重点修改：

- `js/runtime/homepage-snap-runtime.js`
- `js/runtime/homepage-runtime-integration.js`
- `js/runtime/timed-progress-driver.js`
- `js/scene-harness/pattern-scene-provider.js`
- `js/scene-harness/pattern-scene-controller.js`
- `js/scene-harness/pattern-scene-player.js`
- `js/transitions/homepage/scene-timeline-controller.js`
- `js/transitions/homepage/scene-timeline-manifest.js`
- `js/transitions/homepage/section-presentation-controller.js`
- `js/transitions/homepage-transition-runtime.js`
- `js/transitions/homepage/*-homepage-adapter.js`
- `js/transitions/pattern-bloom-adapter.js`
- `js/ui/reveal.js`
- `scene-harness-pattern.html`
- `scripts/check-pattern-scene-harness.mjs`
- `scripts/check-*.mjs`
- `package.json`

参考：

- `docs/homepage-transition-root-cause.md`
- `docs/PLAN-homepage-snapped-scene-runtime.md`
- `docs/PLAN-homepage-scene-runtime-landing.md`
- `archive/timing-architecture-diagnosis.md`
- Shopify crawl assets under `/Users/aitoshuu/Documents/GitHub/github-https-www-shopify-com-editions/outputs/shopify-winter2026-crawl/files/...`

## 下一步

建议先做 **Phase 0 + Phase 0A + Phase 1**：

1. 写 owner contract 和 adapter contract verifier。
2. 先收口 `scene-harness-pattern`：单一 controller、run identity、progress 命名、专项验证。
3. 升级 `scene-timeline-controller`，让它成为唯一 `commit/present/cleanup` 入口。
4. 不动视觉效果，不默认切换 runtime。

这一步完成后，再决定是否把 `?snapRuntime=1` pilot 扩到第一个真实 join。
