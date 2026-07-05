# 实施计划：状态机与时序管理重构（Phase 0 / 0A / 1）

> 上游方案：`docs/newplan/state-machine-refactor-plan.md`（本文件不替代它，只把"下一步：Phase 0 + 0A + 1"拆成可执行任务）。
> 原则、合约、禁令均以上游方案为准；本文件只回答"改哪个文件、改成什么样、怎么验收、按什么顺序"。

## 0. 关键事实（决定任务怎么拆）

以下事实已逐一在代码中核实，任务设计依赖它们：

| # | 事实 | 影响 |
|---|------|------|
| F1 | `js/transitions/homepage/scene-timeline-manifest.js` 是**生成物**，源头是 `src/section-manifest.mjs`，由 `scripts/build-index.mjs` 生成（文件头 "Do not edit"） | 所有"阈值迁入 manifest"任务必须改 `src/section-manifest.mjs` + `npm run build:page`，禁止直接改生成文件 |
| F2 | `package.json` 现有 21 个 `verify:*` 脚本 + `verify:all` 串联，但 `check-pattern-scene-harness.mjs`（409 行，已有 fake-window/fake-rAF 测试基建）**未接入** | T0.1 是纯接线任务，成本极低 |
| F3 | `pattern-scene-player.js` 双层 public status：provider `STATUS`（8 值）+ player `PLAYER_STATUS`（7 值）+ `MODE`（5 值）；`PATTERN_POSTER_PROGRESS = 1`、`PATTERN_INITIAL_PROGRESS = 0`；`cancelToSource()` 委托 `cancelToPoster()` 落到 progress=1 | 语义错位实锤：poster 是**终态**（bloom-in 的 to），不是 source。命名决策见 T1.2 |
| F4 | `check-pattern-scene-harness.mjs:54-78` 断言了旧 API 名（`cancelToSource`、`PATTERN_POSTER_PROGRESS = 1`、`playForward` 等） | 改名/改结构必须同步改验证脚本，否则 verify 假红 |
| F5 | `createTimedProgressDriver.play({direction})` 只支持整段 0→1 / 1→0，无 `from/to`；provider 内自写的 `animateProgress()` 支持任意 from/to | harness 的 reverse（从当前进度反向）需要 driver 支持 partial ramp → T1.1 |
| F6 | `scene-timeline-controller.js` 已有 `deriveTimelineState()`（纯函数）、`presentTarget()`（`presentedJoinIds` 幂等守卫）、`createAdapterContext()`；`presentTarget` 已调 `presentRevealWithin` | Phase 1 是**升级**不是重写；新增 5 个入口方法，保留纯函数内核；当前 `presentTarget(join,state)` 需要迁移为 `presentTarget(joinId, reason)` 兼容包装 |
| F7 | `reveal.js` 已有 `suppressRevealOnceWithin` / `holdRevealWithin` / `releaseRevealWithin` / `presentRevealWithin` | Phase 1 的 reveal 抑制不需要新 API，只需要把调用权收归 SceneTimeline |
| F8 | `section-presentation-controller.js` 只有一个导出 `createSectionPresentationController` | 降级为 helper 的改动面可控 |
| F9 | pattern-bloom 阈值常量在 `js/transitions/pattern-bloom-adapter.js:8-12`（`REVEAL_END=0.46` 等 5 个） | T0.5 先把同值登记到 `src/section-manifest.mjs` 并加区间校验；adapter 读法等 Phase 4 有稳定 frame 输入后再改 |
| F10 | `main.js:75` 只调一次 `initHomepageTransitions()`，但函数本身（`homepage-transition-runtime.js:834`）无幂等守卫 | T0.7 加守卫 + 静态检查 |

## 1. 工作流与依赖

三条 workstream，可部分并行：

```
W0 验证基建（Phase 0）      W1 Harness 收口（Phase 0A）     W2 SceneTimeline 收口（Phase 1）
T0.1 接线 harness verify ──→ T1.1 driver partial ramp
T0.2 SceneTimelineFrame 类型  T1.2 progress 语义决议
T0.3 verify:adapter-contract  T1.3 provider 独立模块
T0.4 verify:owner-contract ─┐ T1.4 PatternSceneController
T0.5 阈值迁入 manifest      │ T1.5 player facade + HTML 改造
T0.6 manifest 区间检查      │ T1.6 run-identity 验收用例
T0.7 init 幂等守卫          └──────────────────────────────→ T2.1 5 个入口方法
                                                             T2.2 presentTarget 事务化
                                                             T2.3 presentation-controller 降级
                                                             T2.4 旧 runtime 接口改道
                                                             T2.5 Phase 1 验收脚本
```

依赖规则：

- W0 内部除 T0.5/T0.6 外互相独立，可任意顺序（建议按编号）。T0.5 只做 manifest 数据落位，不改 adapter 读法；T0.6 依赖 T0.5 的数据。
- W1 依赖 T0.1（先有 verify 跑起来再动被验对象）；T1.4 依赖 T1.1、T1.2、T1.3。T1.3 先把 provider 抽成独立模块，避免 `player -> controller -> player(provider)` 的 ESM 循环。
- W2 依赖 T0.2（frame 类型先冻结）、T0.4/T0.6（owner/manifest 检查先立起来当护栏）以及 T0.7（同一个 legacy runtime 文件先完成幂等护栏）。W2.1 落地前，不要求 adapter 从 `frame.join` 读取阈值。
- W1 和 W2 业务上无代码依赖，可由不同 worktree 并行；但 `homepage-transition-runtime.js` 相关改动必须串行：T0.7 合入后再开 T2.4。建议 W1 先完成——它是 controller 合约的试验田（上游方案 Phase 0A 定位）。

每个任务 = 一个 commit，`feat:`/`refactor:`/`test:`/`chore:` 前缀。每个 commit 前跑该任务的验收命令 + `npm run verify:all`。

---

## 2. W0：验证基建（Phase 0，不改任何视觉行为）

### T0.1 接线 pattern harness 验证

- **文件**：`package.json`
- **改动**：
  ```json
  "verify:pattern-scene-harness": "node scripts/check-pattern-scene-harness.mjs"
  ```
  并追加进 `verify:all` 链尾。
- **验收**：`npm run verify:pattern-scene-harness` 绿；`npm run verify:all` 绿。
- **不做**：不改 check 脚本本身（T1.x 再改）。

### T0.2 冻结 `SceneTimelineFrame` 类型

- **文件**：新建 `js/transitions/homepage/scene-timeline-frame.js`
- **改动**：按上游方案的 frame 结构定义 JSDoc typedef + 一个 `createFrame(partial)` 工厂（带默认值和字段校验，`Object.freeze` 返回）。字段：
  `joinId / fromScene / toScene / direction / phase / progress / sourceOpacity / targetOpacity / copyOwner / visualOwner / interactionOwner / milestones`。
  - `phase` 枚举：`idle | preparing | playing | committed | presented | cleanup | released`（与现有 `deriveTimelineState` 的 `transitioning/committed/presented` 的映射关系写进注释：`transitioning` → `playing`，迁移期两套并存，由 controller 内部转换）。
  - `copyOwner` 枚举：`hidden | timeline-fixed | native`；`visualOwner`：`adapter | native | compositor`；`interactionOwner`：`director | native | none`。
- **验收**：新建 `scripts/check-scene-timeline-frame.mjs`（node 直跑：非法 phase/owner 抛错、默认值正确、frozen），接入 `verify:frame-contract`。
- **备注**：本任务只定义类型，不改 controller 行为。

### T0.3 新增 `verify:adapter-contract`

- **文件**：新建 `scripts/check-adapter-contract.mjs`；`package.json` 加 `"verify:adapter-contract"`。
- **扫描范围**：`js/transitions/homepage/*-homepage-adapter.js`、`js/transitions/pattern-bloom-adapter.js`。
- **禁令清单**（源码正则，参考 `check-handoff-ownership.mjs` 的写法）：
  - `window.scrollTo` / `scrollIntoView` / `lenis.scrollTo`
  - `body.style.overflow`
  - `presentRevealWithin` / `completeHandoff`
  - 写 `data-section-handoff-state`（`setAttribute` 或 `dataset.sectionHandoffState =`）
  - 读 `data-section-handoff-state` / `data-timeline-phase`（`getAttribute(` / `dataset.timelinePhase` 出现在赋值右侧）
  - `timeline?.update(` / `timeline.update(`：正则用 `timeline\s*\??\.\s*update\s*\(`，不按 reason 过滤（当前真实 reason 是 `aod-render`、`figure2-render`、`pattern-bloom-render` 等，不存在统一的 `self-driven` 标记）。迁移期把现有调用写进 `KNOWN_VIOLATIONS` 并 warning；新增调用直接 fail。W2 完成后移除 baseline，完全禁止 adapter 反推 timeline。
  - 模块级 progress 阈值常量：`^const [A-Z_]*(START|END|AT|PROGRESS)[A-Z_]* = 0?\.\d+`（白名单机制同上：迁移期已知违规写进脚本内 `KNOWN_VIOLATIONS` 数组并打印 warning，新增违规直接 fail——防止存量问题阻塞接线，同时冻结增量）
  - 移动真实目标 DOM：`append(sourceProof)` / `appendChild(sourceProof)` / `insertBefore(sourceProof` 等针对 manifest copy selector 或已知真实 copy 变量的移动。当前 `figure2-homepage-adapter.js` 搬 `.method-proof` 是存量违规，先写入 `KNOWN_VIOLATIONS` 并绑定 Phase 4 的 figure2 迁移任务；新增真实 DOM 搬运直接 fail。
- **验收**：脚本能跑；现有违规全部落在 `KNOWN_VIOLATIONS`（即基线锁定，每条带移除任务 ID）；随手加一条 `window.scrollTo` 或新增真实 copy append 到任一 adapter 能让它红（验完撤掉）。

### T0.4 新增 `verify:homepage-owner-contract`

- **文件**：新建 `scripts/check-homepage-owner-contract.mjs`；`package.json` 加脚本。
- **检查项**（读生成后的 `scene-timeline-manifest.js`，import 即可，纯数据）：
  1. 每个 join 有唯一 `fromScene/toScene/progressPolicy`。
  2. `commitAt <= presentAt <= cleanupAt`（用 `resolveTiming` 同款回退逻辑补默认值后再比）。
  3. `sourceOut`/`targetIn` 为合法二元区间且 `start < end`。
  4. 每个 `copySelectors[].selector` 在所有 scene 里唯一（copy 单 owner 的静态前提）。
  5. `entryOwner: "timeline"` 的 selector 收集成清单，输出到 stdout（供 T2.2 做 reveal 抑制白名单）。
- **验收**：当前 manifest 全绿（现有 8 个 join 的数值经查满足 2/3）；手工把某 join `presentAt` 改小于 `commitAt` 能红（验完还原）。

### T0.5 pattern-bloom 阈值先落入 manifest 源

- **文件**：`src/section-manifest.mjs`、`scripts/build-index.mjs`（通常无需改；当前 `JSON.stringify(timelineJoins)` 已透传未知字段）。
- **改动**：
  1. 在 `src/section-manifest.mjs` 的 `home-belief` join（pattern-bloom 所属）上新增 `phases` 字段：
     ```js
     phases: {
       reveal:       [0.00, 0.46],   // 原 REVEAL_END
       bloom:        [0.42, 0.70],   // 原 BLOOM_START/BLOOM_END；与 reveal 的重叠 [0.42,0.46] 是显式交接段
       secondReveal: [0.50, 0.86]    // 原 SECOND_REVEAL_START/END
     }
     ```
     **本任务数值原样照搬，不修重叠**（修重叠属于 Phase 4 pattern-bloom 专项，需要视觉验收）。
  2. `npm run build:page` 重新生成 `scene-timeline-manifest.js`；生成 diff 必须只新增 `phases/handoffOverlaps` 数据。
  3. **本任务不改 `pattern-bloom-adapter.js` 的读法**。原因：T2.1 前 adapter 还没有稳定的 `SceneTimelineFrame` 输入，贸然要求 `frame.join.phases` 会制造第三种临时接口。模块级阈值常量仍留在 T0.3 的 `KNOWN_VIOLATIONS`，绑定 Phase 4 pattern-bloom 迁移任务移除。
- **验收**：`npm run build:page && npm run verify:all` 绿；`npm run verify:homepage-owner-contract` 能读到 `home-belief.phases`；不要求视觉人工回归，因为运行时代码未变。

### T0.6 manifest 区间检查并入 owner-contract

- **文件**：`scripts/check-homepage-owner-contract.mjs`（T0.4 的追加）。
- **改动**：对带 `phases` 的 join 追加检查：每个区间 `start < end`；区间按 start 排序后，相邻重叠只允许出现在**显式声明**处（`phases` 加姊妹字段 `handoffOverlaps: [["reveal","bloom"]]`，未声明的重叠报错）。`src/section-manifest.mjs` 里为 home-belief 补 `handoffOverlaps: [["reveal","bloom"], ["bloom","secondReveal"]]`（现状如实声明）。这只是把现状显性化，不在 Phase 0 修数值。
- **验收**：当前数据绿；删掉一条 `handoffOverlaps` 声明能红（验完还原）。

### T0.7 `initHomepageTransitions` 幂等守卫

- **文件**：`js/transitions/homepage-transition-runtime.js`
- **改动**：不能只用裸模块级 `initPromise`。当前 init 依赖 `root/reduceMotion/scrollRuntime/gsap/ScrollTrigger` 且返回 cleanup；裸 promise 会在 cleanup/HMR/测试重进时返回 stale runtime。改为 root 绑定的 active handle：
  ```js
  let activeRuntime = null;

  export function initHomepageTransitions(options = {}) {
    const root = options.root || document;
    if (activeRuntime?.root === root) return activeRuntime.promise;

    const promise = Promise.resolve().then(() => {
      const cleanup = createHomepageTransitionsRuntime(options);
      const destroy = cleanup.destroy.bind(cleanup);
      cleanup.destroy = () => {
        destroy();
        if (activeRuntime?.root === root) activeRuntime = null;
      };
      return cleanup;
    }).catch((error) => {
      if (activeRuntime?.root === root) activeRuntime = null;
      throw error;
    });

    activeRuntime = { root, promise };
    return promise;
  }
  ```
  现有函数体可先抽成 `createHomepageTransitionsRuntime(options)`，返回原 cleanup stack（对象，带 `destroy()`）。保持当前 public contract：`initHomepageTransitions()` 仍 resolve 为 cleanup 对象，不改成可调用函数。若未来允许同一 root 用不同 `scrollRuntime` 重建，必须先调用旧 `cleanup.destroy()`，再创建新 runtime，不允许静默复用。
- **验收**：`scripts/check-transition-runtime.mjs` 或新增最小断言：同一 root 连调两次返回同一 cleanup promise；执行 `cleanup.destroy()` 后再次 init 会创建新 runtime；不同 root 不互相复用。手工在 console 连调两次确认监听器不翻倍（`getEventListeners` 或计数日志）。

**W0 完成定义**：`verify:all`（含新增 4 个脚本）全绿；无任何视觉 diff；上游方案 Phase 0 checklist 全勾。

---

## 3. W1：Pattern Harness 收口（Phase 0A）

> 目标形态（上游方案"职责拆分"节）：Harness UI 只 dispatch/render → **PatternSceneController**（唯一 phase/runId owner）→ provider（mount/setProgress/requestRender/destroy）→ `createTimedProgressDriver`（唯一 progress 时钟）→ renderer（保留内部连续渲染 RAF）。

### T1.1 `createTimedProgressDriver` 支持 partial ramp

- **文件**：`js/runtime/timed-progress-driver.js`、`scripts/check-timed-progress-driver.mjs`
- **改动**：`play({ direction = 1, from, to })`——`from/to` 缺省时保持现行为（0→1 / 1→0），显式传入时按给定端点 ramp（duration 按 `|to - from|` 等比缩放，保证速率一致）。`getProgress()` 语义不变。
- **验收**：`verify:progress-driver` 原有用例不动全绿；新增用例：`play({from:0.6, to:0, direction:-1})` 从 0.6 出发、时长约 0.6×durationMs、settle 在 0；mid-flight `cancel()` 返回 `{completed:false}` 且 progress 停在中途。

### T1.2 progress 语义决议（决策 + 常量改名）

- **文件**：`js/scene-harness/pattern-scene-player.js`（常量导出处）、`scripts/check-pattern-scene-harness.mjs`（同步断言，F4）
- **决策**（按上游方案"Progress 命名"节 + F3 事实）：pattern 的视觉终态是满开花纹（progress=1），poster 帧就是终态帧。因此：
  - `PATTERN_INITIAL_PROGRESS = 0` → 重导出为 `PATTERN_SOURCE_PROGRESS = 0`
  - `PATTERN_POSTER_PROGRESS = 1` → 重导出为 `PATTERN_FINAL_PROGRESS = 1`（poster 别名只在 facade 兼容层保留一个迁移期 re-export，controller 内部不得使用 `poster` 命名）
  - `cancelToSource()`：语义修正——它必须落到 `SOURCE_PROGRESS(0)`。现状落到 1 是 bug 化的命名。**保留方法名，修正落点**；原"取消后回满开帧"的行为改名为 `cancelToFinal()` 供 harness 现有按钮迁移期使用。
- **验收**：`verify:pattern-scene-harness` 更新后的断言绿：`cancelToSource` 落点 progress=0、`cancelToFinal` 落点 progress=1、新常量名存在。此任务与 T1.3 可合并 commit（controller 直接按新语义实现，避免中间态）。

### T1.3 provider 独立模块 + 瘦身

- **文件**：新建 `js/scene-harness/pattern-scene-provider.js`；从 `js/scene-harness/pattern-scene-player.js` 迁出 provider 相关代码。
- **改动**：
  - `createPatternSceneProvider` 保留：`mount / setProgress / requestRender（经 scene.requestRender）/ destroy / getSnapshot`（snapshot 只含 `mounted / ready / canvasWidth / canvasHeight / progress`，**删除 `status / mode / trace`** 的 public 语义；迁移期以 `debugTrace` 字段保留 trace 供排查，UI 不得读）。
  - 删除 provider 内 `animateProgress()`、`activeRun`、`frameId` 手写 RAF ramp（约 120 行）；`playBloomIn / playLeftRotatePreview / reverseToPoster / cancelToPoster / showPoster / playSteadyLoop` 全部移除——它们的职责被 controller + driver 取代。
  - renderer（`createPatternMirrorScene`）不动：`progressSource: () => controlledProgress` 与内部连续渲染 RAF 保留（上游方案风险节第 7 条明确允许）。
- **依赖约束**：provider 不能 import controller 或 player；只 import renderer。这样后续依赖方向固定为 `provider <- controller <- player facade`，不会出现 ESM 循环。
- **验收**：`verify:pattern-scene-harness`（T1.6 改写后）绿；`node scripts/check-pattern-scene-harness.mjs` 中旧 API 断言（F4 列出的 54-78 行）同步替换为 provider/controller API 断言。

### T1.4 新建 `createPatternSceneController`

- **文件**：新建 `js/scene-harness/pattern-scene-controller.js`
- **结构**（照上游方案 "Public state" + "Command rules" 节；本落地版不再使用 `poster` phase，只用 `source/final` 表达视觉端点）：
  - imports：`createPatternSceneProvider` from `pattern-scene-provider.js`、`createTimedProgressDriver` from runtime。
  - 内部持有：`state = { phase, progress, runId: 0, mounted, ready, reason? }`、一个 provider 实例、一个 `createTimedProgressDriver` 实例（`onProgress: (p) => { state.progress = p; provider.setProgress(p); }`）。
  - 命令：`mount(host)` / `playForward()` / `cancelToSource()` / `cancelToFinal()` / `reverseToSource()` / `showFinal()` / `destroy()` / `getState()` / `subscribe(fn)`。
  - 状态表硬编码为 `VALID_TRANSITIONS = { unmounted: ['MOUNT'], mounting: ['READY','DESTROY'], source: ['PLAY','SHOW_FINAL','DESTROY'], final: ['REVERSE','PLAY','DESTROY'], playing: ['REVERSE','CANCEL_TO_SOURCE','CANCEL_TO_FINAL','DESTROY'], reversing: ['PLAY','CANCEL_TO_SOURCE','CANCEL_TO_FINAL','DESTROY'] }`，非法命令同步返回 `{ accepted: false, completed: false, reason: 'invalid_phase' }`，不抛异常。`playing -> REVERSE` 与 `reversing -> PLAY` 是显式 supersede 规则，用来覆盖"play 到中途反向"和"reverse 到中途重新播放"。
  - 每个 async run 开头 `const runId = ++state.runId;`，await 回来先 `if (state.runId !== runId) return { accepted: true, completed: false, reason: 'superseded' };`（上游方案 startRun 样例照抄）。
  - `destroy()` 递增 runId、`driver.cancel()`、`provider.destroy()`、phase → `destroyed`；该 controller 实例进入终态，之后一切命令返回 `reason: 'destroyed'`。需要重新 Mount 时，由 HTML/player facade 创建新的 controller 实例，不在同一 controller 上复活。
  - `subscribe(fn)`：phase/progress 变化时推 snapshot（harness UI 渲染用），返回 unsubscribe。
- **驱动接线**：`playForward()` = 递增 runId、取消旧 driver、phase=`playing`、driver.play({from: state.progress, to: PATTERN_FINAL_PROGRESS})；`reverseToSource()` = 递增 runId、取消旧 driver、phase=`reversing`、driver.play({from: state.progress, to: PATTERN_SOURCE_PROGRESS, direction: -1})；`cancelToSource()` 立即落到 source/0；`cancelToFinal()` 和 `showFinal()` 落到 final/1。provider 内部不再有动画方法。
- **验收**：T1.6 的用例全绿。

### T1.5 player facade + HTML 改造

- **文件**：`js/scene-harness/pattern-scene-player.js`（facade 部分）、`scene-harness-pattern.html`
- **改动**：
  - `createPatternScenePlayer(options)` 变成薄 facade：只 import `createPatternSceneController`，不再 export/持有 provider 状态。旧方法名逐一委托但必须显式标注迁移语义：`showPoster/cancelToPoster` → `showFinal/cancelToFinal`（因为 poster 帧就是 final/1），`cancelToSource` → `cancelToSource`（source/0），`reverseToPoster` 从 HTML 删除；若为了旧测试临时保留，必须返回 `{ accepted:false, completed:false, deprecated:true, reason:'removed_ambiguous_poster' }`，不得偷偷映射到 source 或 final。`PLAYER_STATUS`、`activeToken` 删除；`getState()` 返回 controller snapshot。
  - `scene-harness-pattern.html`：删除 `currentRun` 与按钮内 async 编排 / `setTimeout` 取消逻辑；按钮 onclick 一律 `controller.dispatch` 式单行调用；按钮 disabled 态从 `controller.subscribe` 的 snapshot.phase 推导；截图标记（`data-*` for screenshot）保留但只写不读。Destroy 后再次点 Mount 时创建新的 player/controller 实例，不复用 destroyed controller。
- **验收**：`verify:pattern-scene-harness` 绿；`npm run dev` 手开 `scene-harness-pattern.html`，人工过一遍按钮矩阵（见 T1.6 用例表的手工版）；`scripts/quick-visual-check.mjs` 如适用则跑一次截图对比。

### T1.6 run-identity 验收用例

- **文件**：`scripts/check-pattern-scene-harness.mjs`（大改，保留其 fake-window/fake-rAF 基建）
- **必须覆盖**（上游方案 Phase 0A 验收清单逐条对应）：
  | 用例 | 断言 |
  |------|------|
  | double play | 第一次 `playForward()` 返回 `{reason:'superseded'}`，最终 phase 由第二次决定，恰好 settle 在 `final` 一次 |
  | play → cancel → play | 旧 run late resolve 不改 phase；最终 phase=`final`，progress=1 |
  | play → reverse | reverse 从中途 progress 出发（partial ramp 生效），settle 在 `source`，progress=0 |
  | source 以外 reverse | `final`/`playing` 可接受；`playing` 中途 reverse 会 supersede 旧 play，并从当前 progress 反向；`source` 返回 `invalid_phase` |
  | destroy mid-play | 旧 promise 返回 `destroyed/superseded`；之后无任何 emit；fake-window 上无残留 rAF/resize 监听 |
  | 语义一致 | `cancelToSource()` 后 `getState().progress === 0` |
  | 单一真相源 | snapshot 无 `providerStatus`/`mode` 字段（或仅 debug 命名空间下） |
- **验收**：`npm run verify:pattern-scene-harness` 全绿；`verify:all` 绿。

**W1 完成定义**：上游方案 Phase 0A 六条 checklist 全勾；`scene-harness-pattern.html` 源码中 grep 不到 `currentRun`；`pattern-scene-player.js` 中 grep 不到 `PLAYER_STATUS` / `activeToken`；`pattern-scene-provider.js` 中 grep 不到 `activeRun` / `animateProgress`。

---

## 4. W2：SceneTimeline 成为唯一交接入口（Phase 1）

> 不动视觉、不迁 adapter，只收口 commit/present/cleanup 的**调用权**。

### T2.1 controller 增加 5 个入口方法

- **文件**：`js/transitions/homepage/scene-timeline-controller.js`
- **改动**：在 `createSceneTimelineController` 返回对象上新增：
  - `beginJoin(joinId, { direction = 1 })`：置 frame phase=`preparing`，登记 activeJoinId；若已有不同 join active 且未 released → console.warn + 先 `cleanupJoin(prev)`（迁移期宽容策略，Phase 2 收紧为拒绝）。
  - `updateFrame(joinId, progress, { milestones, reason })`：现 `update()` 的改名包装（保留 `update` 为 deprecated 别名，供旧 runtime 过渡），内部产出 T0.2 的 `SceneTimelineFrame` 并缓存 `lastFrameByJoinId`。
  - `commitTarget(joinId, reason)` / `presentTarget(joinId, reason)` / `cleanupJoin(joinId, reason)`：显式生命周期入口。`presentTarget` 复用现有幂等实现（F6），但签名从 `(join, state)` 改为 `(joinId, reason)`，内部自查 join 和 lastFrame。
  - `getFrame(joinId)`：返回最近 frame（frozen）。
- **约束**：`deriveTimelineState` 保持纯函数不动；phase 映射（`transitioning`→`playing` 等）在 controller 内做。
- **direct-hash / reduced-motion 兜底**：`presentTarget(joinId, reason)` 不能要求先有 `updateFrame()`。如果 `lastFrameByJoinId` 不存在，必须从 join 合成 terminal frame（等价 `updateFrame(joinId, 1, { reason: 'present-without-frame' })`）再 present。这样 legacy direct-hash 当前直接完成 handoff 的路径不会丢 target。
- **验收**：新建 `scripts/check-scene-timeline-controller.mjs`（node + 最小 fake DOM，或纯 deriveTimelineState 层测试）：`presentTarget` 幂等（连调两次只 present 一次）、`beginJoin` 换 join 会先 cleanup、`getFrame` 返回 frozen frame、无 prior frame 的 `presentTarget(joinId)` 仍会呈现 target。接入 `verify:scene-timeline`。

### T2.2 `presentTarget` 事务化（原子交接）

- **文件**：`scene-timeline-controller.js`（同上任务内或独立 commit）
- **改动**：`presentTarget` 内一次完成（现有 145-151 行基础上补齐）：
  1. section `data-scene-state` / `data-section-handoff-state` = `presented`
  2. 对 copy 调用新的 `claimRevealWithin(copy, { owner: 'timeline', state: 'presented' })`（或在 `presentRevealWithin` 内补同等语义）：先 kill 对应 ScrollTrigger/tween 和 suppressedOnce，再写 `data-entry-state = presented` / `is-visible`。不要在 copy 已经 `presented` 后再调用 `suppressRevealOnceWithin`，当前 reveal API 会直接跳过已 presented/visible 元素，`markPresented` 还会清掉 suppression。
  3. `presentRevealWithin(copy)` 只作为最终呈现 helper；若新增 `claimRevealWithin` 已经完成呈现，则本步不再重复调用。
  4. 清除该 join 的 timeline-fixed copy（现 `clearFixedCopies` 逻辑并入，消灭"fixed copy 残留"路径）
  5. 同步派发一个 `CustomEvent('scene-timeline:presented', { detail: { joinId } })` 到 document（旧 runtime 迁移期监听用，Phase 3 删）
  以上全部同步执行，不跨 microtask/rAF——这就是上游方案原则 5"target release 是 timeline 事件"的落点。
- **验收**：`verify:scene-timeline` 增用例：present 后 fixedCopyElements 为空、copy 带 presented 标记；`verify:handoff-ownership` 保持绿。
- **兼容要求**：迁移期保留旧签名包装 `presentTarget(join, state)`，内部统一转为 `presentTarget(join.id, 'legacy-signature')`。等 T2.4 旧 runtime 改完、`createAdapterContext().present/complete` 不再传 join/state 后，再删旧签名。

### T2.3 `section-presentation-controller` 降级为 helper

- **文件**：`js/transitions/homepage/section-presentation-controller.js` 及其调用方
- **改动**：`presentedSections` Set 与"决定何时 present"的逻辑移除；保留纯 DOM 写操作函数（打标记、清标记），导出改为无状态 helpers，由 T2.2 的事务调用。调用方（grep `createSectionPresentationController` 的使用处）改为经 SceneTimeline 入口。
- **同步改验证**：`scripts/check-homepage-transition-integration.mjs` 当前硬性断言 `createSectionPresentationController/completeHandoff/beginHandoff/presentationController.completeHandoff` 存在；本任务必须把这些断言改成新的 SceneTimeline 入口断言（例如 `sceneTimeline.presentTarget`、`scene-timeline:presented`、helper 无状态 DOM 写入）。否则 `verify:all` 会被旧断言卡住。
- **验收**：grep 项目内 `presentedSections` 无结果；`verify:handoff-ownership`、`verify:homepage-transitions` 绿；附录状态碎片表中该行勾销。

### T2.4 旧 runtime 的完成通知改道

- **文件**：`js/transitions/homepage-transition-runtime.js`
- **改动**：`completePlayback()` / `completePostScrollHandoff()` / `completeDirectHashHandoff()` 内部**不再直接**操作 section/copy 呈现，改为调用 `sceneTimeline.presentTarget(joinId, 'runtime-complete')`（controller 实例经现有初始化路径传入）。gate 释放（`releaseTargetRevealGate`）暂留原位（属 Phase 3 迁移项），但在其后立即调用 `presentTarget`，保证 gate 开 → present 之间无异步间隙。recovery 分支如果需要强制呈现 target，也必须走同一入口。
- **验证同步**：同时更新 `scripts/check-homepage-transition-integration.mjs` 中关于 handoff lifecycle 的旧断言，允许 legacy runtime 调用 SceneTimeline，而不是 presentation controller。
- **验收**：手工回归两条链路：正向滚完 `home-belief`（scroll policy）与 `belief-method`（snap policy），确认无黑闪、无文案二次入场；`verify:all` 绿。

### T2.5 Phase 1 验收脚本收口

- **文件**：`scripts/check-homepage-owner-contract.mjs`（追加）、`package.json`
- **改动**：owner-contract 增加源码级检查：`presentRevealWithin` 的 import 只允许出现在 `scene-timeline-controller.js`（白名单）；`data-section-handoff-state` 的写入只允许出现在 controller 与 helper 文件。
- **验收**：上游方案 Phase 1 三条验收（present 只触发一次 / `targetPresented` 前 source 不为 0 / copy owner 每帧唯一）中，前两条有自动化覆盖（T2.1 用例 + deriveTimelineState 区间断言：对所有 join 断言 `sourceOut[1] >= presentAt` 或显式声明例外），第三条以 `getFrame().copyOwner` 日志 + 手工滚查记录在 PR 描述。

**W2 完成定义**：`presentTarget` 全站唯一入口（静态检查保证）；`presentedSections` 消失；两条代表性 join 手工回归通过。

---

## 5. Phase 2-5 概要（Phase 5 后状态）

Phase 2-5 已推进到默认 snap runtime 路径：Director 负责播放生命周期和 SceneTimeline commit/present/cleanup，legacy runtime 仅保留 `?legacyRuntime=1` / `?snapRuntime=0` 调试 fallback。下表保留原入口条件，并把当前事实作为后续验收基线。

| Phase | 入口条件 | 一句话范围 |
|-------|---------|-----------|
| 2 Director 接管 | W1+W2 完成，`verify:snap-runtime` 绿 | `homepage-runtime-integration.js` 的 `scenePresenter` 接 SceneTimeline frame；adapter `play()` 只回完成信号 |
| 3 Legacy 降级 | Phase 2 在 ≥2 个 join 上稳定 | 拆 `homepage-transition-runtime.js` 的 lock/gate/direct-hash（含删除 `DIRECT_HASH_ALIGNMENT_DELAYS` 重试组） |
| 4 按 join 迁 adapter | Phase 3 完成 | 顺序：pattern-bloom → aod → figure2 → figure3 → crane；pattern-bloom 专项（去 9 布尔、修重叠区间、opacity 缓冲带）在此阶段做，是唯一允许改视觉数值的阶段 |
| 5 清理切默认 | 全部 join 迁完 | snap runtime 转默认；legacy runtime 仍保留为 `?legacyRuntime=1` / `?snapRuntime=0` 显式 debug fallback；更新 ADR |

## 6. 全局回归清单（每个 workstream 结束时跑）

```bash
npm run build:page
npm run verify:all          # 含本轮新增：pattern-scene-harness / adapter-contract / homepage-owner-contract / frame-contract / scene-timeline
npm run dev                 # 手工：首页正向滚全程、反向滚 home-belief、直达 #method hash、reduced-motion 开关
```

手工回归聚焦三个历史症状：**无重复入场**（同一文案不二次动画）、**无交接空白**（source 消失前 target 已可见）、**无黑闪**（pattern-bloom 第二幕→第三幕）。

## 7. 风险登记

| 风险 | 缓解 |
|------|------|
| T0.5 过早改 adapter 读 `frame.join.phases` 会制造临时接口 | T0.5 只落 manifest 数据和校验，不改 adapter；adapter 阈值读取等 T2.1 frame API 稳定后在 Phase 4 迁移 |
| T1.4 删 provider 动画方法可能有 harness 之外的调用方 | 动手前 `grep -rn "playBloomIn\|playLeftRotatePreview\|reverseToPoster" js/ *.html`，如有 harness 外调用方，该方法保留并加 deprecation warn |
| T2.4 改 `completePlayback` 波及 recovery 路径 | recovery（`RecoverPresentTarget`）同样改走 `presentTarget`，用例：mid-play 强制 recovery 后无 fixed copy 残留 |
| T0.3 白名单机制被滥用 | `KNOWN_VIOLATIONS` 每条必须带负责移除它的任务 ID（本文件的 T 编号），W2 结束时清单必须比 W0 开始时短 |
