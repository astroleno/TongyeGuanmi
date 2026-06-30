# Homepage SceneRuntime Migration Review

日期：2026-06-30

审查对象：

- `/Users/aitoshuu/Downloads/homepage-scene-runtime-migration-plan.md`
- 当前仓库 `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi`

审查方式：

- 3 个 agent 并行只读审查：
  - 架构与时间编排审查
  - 代码库差距审查
  - workflow / PR 切法审查
- 主线程补充读取现有 runtime、manifest、adapter、build、verify 脚本。
- 未使用 Playwright。
- 未修改运行时代码。

已跑非浏览器验证：

```bash
npm run verify:snap-runtime
npm run verify:homepage-timeline
npm run verify:runtime-integration
npm run verify:aod-adapter
npm run verify:figure2-adapter
npm run verify:pattern-bloom-adapter
```

结果：以上均通过。

---

## 1. 总判断

迁移计划的方向是对的，但当前版本还不能直接进入实现。

前 7 次失败的根因不是 React、原生 JS 或单个 adapter 写法，而是首页同一帧里存在多个时间编排 owner：

```txt
runtime
adapter
handoff receiver
section presentation controller
global reveal
CSS gate
Lenis / ScrollTrigger / native scroll
```

它们同时决定：

- 当前 scene 是谁。
- target copy 是否出现。
- transition 何时完成。
- DOM 是否被移动。
- 滚动是否被锁住或释放。

新方案必须成立在一个硬前提上：

```txt
SceneRuntime 是唯一调度者。
Presentation 是唯一提交者。
Player 只画自己的视觉，不碰目标 scene / copy。
Scroll input 只表达意图，不表达视觉进度。
```

如果这个前提守住，计划能解决“时间编排机制”问题；如果只是把旧 runtime 包装成新目录，问题会复发。

---

## 2. 当前计划命中的正确方向

计划中这些决策是正确的，应保留：

1. 不再用滚动进度驱动一切。
2. 删除 scroll-driven ink progress。
3. 删除 scroll-driven webm scrub。
4. 删除 handoff receiver 移动真实 DOM。
5. 删除 adapter 控制目标 copy 可见性。
6. 删除 `.reveal` 控制 timeline-owned sections。
7. `scene / segment` 作为唯一 timeline 合同。
8. `PRESENTING` 作为唯一原子提交点。
9. animation scene 进入后只显示 poster / first frame，第二次 `10vh` 才播放。
10. AOD / figure3 / crane 的 80% 文案入场保留，但必须改成 runtime 管理的 side effect。
11. Figure2 作为唯一 compound sequence，而不是继续拆成多个普通 scene 互相抢状态。

这些方向正好命中旧系统的核心问题。

---

## 3. 必须先修正的架构缺口

### 3.1 ARMED 状态顺序不对

迁移计划当前写法接近：

```txt
IDLE + SCROLL_THRESHOLD -> ARMED -> SNAP_LOCKING -> PLAYING
```

这意味着用户先滚够 `10vh`，页面已经被原生滚动带走，然后 runtime 才开始 snap / lock。这会继续造成：

- 当前 scene 判断漂移。
- target scene 还没准备好。
- Lenis velocity 和原生 scrollY 抢状态。
- 同一段转场可能从错误的 scene 开始。

建议改为：

```txt
IDLE -> SNAP_LOCKING -> ARMED -> PLAYING -> PRESENTING -> RELEASING -> IDLE
```

语义：

- `SNAP_LOCKING`：先把 viewport 对齐到当前 scene 或播放安全位。
- `ARMED`：页面已经对齐并冻结，只累计 wheel / touch / key 的 `10vh` intent。
- `10vh` 只触发 segment，不驱动视觉进度。

现有 `js/runtime/homepage-snap-runtime.js` 里 `SnappedArmed` 的方向反而更接近正确模型，可以迁移它的输入累计思路，但不要直接复用整个 runtime。

### 3.2 early-copy 不能切入 PRESENTING

计划里写了：

```txt
PLAYING + MEDIA_PROGRESS(0.8) -> PRESENTING
```

同时又要求 media 继续播放到结束。这两个要求冲突。

如果 80% 时进入 `PRESENTING -> RELEASING`，runtime 会提前提交和解锁，media 还没播完，后续又会出现一次完成态。

建议改为：

```txt
PLAYING
  media progress 0.8 -> presentEarlyCopy()
  media ended -> PRESENTING
```

也就是：

- 80% 只做 target copy 的 early display。
- `currentSceneId` 不变。
- `activeSegmentId` 不变。
- input 仍锁住。
- 真正 scene commit 仍等 `PLAY_COMPLETE`。

### 3.3 text-read 模型不完整

计划里 `text-read` 同时说：

- 不锁滚。
- 允许自然阅读。
- 到 anchor 阈值时提交。
- `method-top-to-method-bottom` 的 trigger 是 `distanceVh: 0`。

这需要补齐 `ReadMonitor` 职责，否则 method 分段仍然会不稳定。

建议增加：

```txt
ReadMonitor
  - 只负责 reading scene 的 DOM 边界检测。
  - 只更新 current reading scene / nav / hash。
  - 不参与动画播放。
  - 长阅读段读到底后，再交给 ScrollIntent 累计额外 10vh。
```

`method-top -> method-bottom` 的提交条件不应是 `distanceVh: 0`，而应是明确的 DOM 边界，例如：

```js
read: {
  enterWhen: 'top crosses viewport center',
  completeWhen: 'bottom crosses viewport bottom',
  nextArm: 'after-bottom-plus-intent'
}
```

### 3.4 TTG / PH 的 exitInk 是隐式复合段

计划里 TTG / PH 是 `media-animation`，但内部语义是：

```txt
进入 animation scene
-> 用户再滚 10vh
-> 播放 media
-> 播放 exitInk
-> commit target reading scene
```

这不是普通单段 media。建议显式扩展 `media-animation`：

```js
mediaAnimation: {
  phases: ['media', 'exitInk'],
  commitAfter: 'exitInk'
}
```

不要把它升级为第二种 compound sequence；也不要把 exitInk 藏在 player 内部不暴露状态。

最少 debug state 需要显示：

```txt
activeSegmentId
activePhaseId
playbackProgress
```

### 3.5 Figure2 compound 需要内部 intent API

计划要求 runtime 外部只看到：

```txt
figure2-animation -> brand
```

一个 `compound-sequence`。

但内部步骤又需要多次 `10vh` advance。这必须定义清楚：

```js
type CompoundContext = {
  awaitIntent(options: { distanceVh: number, direction: 'forward' }): Promise<void>;
  presentStep(stepId: string): void;
  presentTarget(options): void;
  updateDebug(details): void;
};
```

否则 compound 内部会自己监听 wheel / touch，重新制造第二套 runtime。

硬规则：

- top-level 只有一个 `activeSegmentId`。
- compound 内部可以有 `activeStepId`。
- compound 内部不直接 commit brand。
- final ink exit 完成后，由 `SceneRuntime` 进入 `PRESENTING`，只 commit brand 一次。

### 3.6 Philosophy 去留必须现在定

迁移计划删除 `philosophy`，最终链路是：

```txt
education -> crane-animation -> contact
```

但当前仓库和已有落地文档仍保留：

```txt
education -> philosophy -> crane-animation -> contact
```

这是产品/内容级别决策，不是实现细节。

建议这版按迁移计划处理：

- `philosophy` 不进入 SceneRuntime。
- 如果内容仍要保留，放在普通页面内容或后续版本。
- `contact` endpoint 先只接受 `contact-only`。

如果决定保留 `philosophy`，必须显式加回新 `homepage.scenes.mjs` 和 `homepage.timeline.mjs`，不能从旧 manifest 隐式继承。

---

## 4. 当前代码库差距

### 4.1 可复用内容

可以迁移或参考：

- `assets/` 中图片、webm、poster、纹理、字体。
- `src/sections/*.html` 的文案和视觉结构。
- `src/partials/nav.html`、loader、footer 等站点级 UI。
- `scripts/build-index.mjs` 中 partial 渲染、selector 唯一性校验、`data-scene-id` 注入思路。
- `js/runtime/charge-accumulator.js`
- `js/runtime/input-normalizer.js`
- `js/runtime/timed-progress-driver.js`
- `js/runtime/recovery-handler.js`
- `js/runtime/scenes/aod-scene-adapter.js` 中 `video.play()` 而非 scrub 的思路。
- `js/runtime/scenes/pattern-bloom-scene-adapter.js` 的 time-driven progress seam，可参考但不能原样成为新 player。
- `js/runtime/scenes/figure2-scene-adapter.js` 的“复用组件但不用 ScrollTrigger”思路，可参考。

### 4.2 必须废弃或隔离

不要继续扩展：

- `js/transitions/homepage-transition-runtime.js`
- `src/section-manifest.mjs` 中旧的：
  - `chapterTransitions`
  - `handoffs`
  - `timelineScenes`
  - `timelineJoins`
  - `executableTransitionModules`
- `js/transitions/homepage/section-presentation-controller.js`
- `js/transitions/homepage/handoff-receiver.js`
- `data-entry-owner="timeline"` 体系
- 生产首页里的：
  - `data-transition-*`
  - `data-handoff-*`
  - `data-target-entry-*`
  - `data-scene-copy`
  - `data-scene-target`
- 旧 CSS gates：
  - target gate
  - fixed timeline copy
  - suppress once
  - receiver active

### 4.3 命名冲突

计划命名和现有代码不一致：

| 计划 | 当前代码 |
|---|---|
| `pattern-top` | `pattern-bloom` |
| `pattern-bottom` | `belief-star` |
| `method-top` | `method-upper` |
| `method-bottom` | `method-lower` |
| `figure2-animation -> brand` compound | `figure2-animation / figure2-proof-cards / figure2-proof-closing` |
| 无 `philosophy` | 当前 manifest / DOM / CSS / verify 均保留 `philosophy` |
| `contact` scene alias `contact-endpoint` | 当前 `.contact-endpoint` 是 copy 容器，不是 scene |

建议不要兼容旧命名作为内部主 ID。旧 ID 只能放 aliases：

```js
{ id: 'method-top', aliases: ['method', 'method-upper'] }
```

### 4.4 生成链路冲突

当前 `build:page` 会继续生成旧属性。

所以不要手改 `index.html`。必须先改 build 合同：

1. 新增 `src/homepage/homepage.scenes.mjs`。
2. 新增 `src/homepage/homepage.timeline.mjs`。
3. 新增 `src/homepage/homepage.aliases.mjs`。
4. 新增独立 validator。
5. build 阶段在 SceneRuntime flag 下走新注入逻辑。
6. 旧 transition 注入只保留在 legacy flag 或 archive。

---

## 5. 建议的目标状态机

建议把状态机改成：

```txt
IDLE
  当前 scene 已提交。reading scene 放行原生滚动；
  animation/snapped boundary 等待离开意图。

SNAP_LOCKING
  对齐 current 或 target 播放安全位；
  冻结 Lenis/native input。

ARMED
  页面已对齐且冻结；
  只累计 wheel/touch/key 的 10vh intent；
  不读取 scrollY 驱动画面。

PLAYING
  只有一个 activeSegmentId；
  segment player 固定时长或 media clock 播放；
  early-copy 只能作为 side effect。

PRESENTING
  唯一原子提交点：
  currentSceneId / target visibility / copy state /
  aria-hidden / nav / hash / focus / poster state。

RELEASING
  清理 ghost / overlay / media；
  重置 intent；
  恢复滚动；
  cooldown 后回 IDLE。

RECOVERING
  播放或媒体失败时 fail-open；
  提交 target 静态态；
  保证解锁。
```

和原计划相比，关键变化是：

- `SNAP_LOCKING` 必须在 `ARMED` 前。
- `ARMED` 是冻结状态，不是自然滚动状态。
- `early-copy` 不进入 `PRESENTING`。
- 增加 `RECOVERING`。
- `text-read` 由 `ReadMonitor` 处理，不把阅读当动画 segment。

---

## 6. 模块职责边界

### SceneRuntime

职责：

- 初始化 scene / segment registry。
- 处理 hash / alias entry。
- 选择 next segment。
- 调度状态机。
- 管 input lock / release。
- 调用 segment player。
- 调用 Presentation。
- 处理 recovery。
- 发布 readonly debug state。

不负责：

- 不画 ink。
- 不播具体 video。
- 不实现 Figure2 子步骤细节。
- 不写业务 copy。

### ScrollIntent

职责：

- 归一化 wheel / touch / keyboard。
- 累计 `10vh` intent。
- 判断方向。
- 支持 decay / reset。
- 只输出 intent progress 给 HUD。

禁止：

- 不读 scrollY 驱动视觉。
- 不写 video currentTime。
- 不改 DOM visibility。

### SegmentPlayer

职责：

- 只播放当前 segment 自己的视觉。
- 支持 `prepare / play / stop / destroy`。
- 回报 progress / complete / error。

禁止：

- 不改目标 scene 的真实 DOM state。
- 不直接 reveal target copy。
- 不移动真实 target DOM。
- 不管理 hash / nav / aria。

### Presentation

唯一负责：

- `currentSceneId`
- `previousSceneId`
- `targetSceneId`
- `data-scene-state`
- `data-scene-presented`
- `aria-hidden`
- target copy visible / pending / early / presented
- nav theme
- hash / history
- focus target
- media poster state

### MediaController

接口建议：

```ts
type MediaPlayer = {
  prepare(scene): Promise<void> | void;
  showPoster(scene): void;
  playOnce(ctx): Promise<void>;
  stop(): void;
  resetToPoster(): void;
  destroy(): void;
};
```

允许：

```js
video.currentTime = 0;
video.play();
```

禁止：

```js
video.currentTime = scrollProgress * video.duration;
```

### ReadMonitor

职责：

- 管 reading scene 的 current 边界。
- 管长阅读段底部完成。
- 管读完后交给 ScrollIntent 累计下一段 `10vh`。
- 更新 nav / hash / debug。

不负责：

- 不锁滚。
- 不播动画。
- 不 commit animation target。

---

## 7. 建议的 PR / Phase 重排

原计划的问题是横向铺能力太多，风险后置。建议改成“合同先行 + 端到端竖切”。

### PR 1：合同冻结 + 生成链路

先写验证：

```txt
verify:scene-runtime-manifest
verify:scene-runtime-entrypoint
verify:contact-endpoint-contract
verify:scene-runtime-generated-manifest
```

内容：

- 新增 `src/homepage/homepage.scenes.mjs`。
- 新增 `src/homepage/homepage.timeline.mjs`。
- 新增 `src/homepage/homepage.assets.mjs`。
- 新增 `src/homepage/homepage.aliases.mjs`。
- 新增 manifest validator。
- 锁死 scene / segment 顺序。
- 禁止旧字段：
  - `progress-window`
  - `handoffPhase`
  - `windows`
  - `earlyReceiver`
  - `splitSceneBridge`
  - `data-transition-drive="scroll"`
- 锁死唯一 compound：
  - 只能是 `figure2-animation -> brand`
- 锁死 contact-only endpoint。

验收：

- 不接真实首页。
- 不跑视觉。
- validator 通过。

### PR 2：纯 Runtime Core

先写验证：

```txt
check-scene-state-machine.mjs
check-scroll-intent.mjs
check-reduced-motion-runtime.mjs
check-presentation-invariants.mjs
```

内容：

- `SceneRuntime`
- `state-machine`
- `scroll-intent`
- `presentation`
- `debug-channel`
- `hash-entry`
- `reduced-motion`

验收：

- Node shim 下覆盖状态顺序。
- `10vh` 只触发，不驱动画面。
- reduced motion 不长时间锁滚。
- player error 必定进入 recovery 并解锁。

### PR 3：DOM Shell + Reveal / Hash

先写验证：

```txt
check-scene-dom-shell.mjs
check-reveal-ownership.mjs
check-hash-entry.mjs
check-scene-height-contract.mjs
```

内容：

- scene DOM 标注。
- method 拆 `method-top / method-bottom`。
- `.reveal` 排除 `[data-entry-owner="scene-runtime"]`。
- feature flag：SceneRuntime 开启时旧 runtime 不初始化。
- direct hash alias：
  - `#method -> method-top`
  - `#services -> services`
  - `#contact -> contact`

验收：

- 不播放动画也能从 hero 滚到 contact。
- `#method / #services / #contact` 不空白。
- timeline-owned 文案不会被 `.reveal` 先隐藏。

### PR 4：第一段 MVP 竖切

先写验证：

```txt
check-ink-segment-player.mjs
check-media-poster-gate.mjs
check-aod-player.mjs
check-text-read-segment.mjs
check-mvp-route.mjs
```

内容：

```txt
hero
-> pattern-top
-> pattern-bottom
-> aod-animation
-> method-top
-> method-bottom
```

验收：

- AOD 到达时只显示 poster / first frame。
- 第二次 `10vh` 才播放 AOD。
- AOD 80% 时 method-top early-copy。
- 播放完成后才 commit method-top。
- method-top / method-bottom 可自然阅读。

### PR 5：Figure2 Compound

先写验证：

```txt
check-compound-sequence-schema.mjs
check-figure2-compound-player.mjs
check-no-reveal-compound.mjs
```

内容：

- `method-bottom -> figure2-animation` ink。
- 唯一 `figure2-animation -> brand` compound。
- 内部四步：
  - 远景扩散
  - 横拱 + 三卡
  - 横拱 + 第四种整屏
  - 横拱 + 文案 + ink exit
- final commit brand 一次。

验收：

- validator 禁止第二个 compound。
- brand 不闪、不重复、不被 `.reveal` 抢。

### PR 6：后半段第一竖切

先写验证：

```txt
check-figure3-player.mjs
check-services-read-boundary.mjs
check-brand-figure3-services-route.mjs
```

内容：

```txt
brand
-> figure3-animation
-> services
```

验收：

- figure3 到达只 poster。
- 第二次 `10vh` 才 play。
- 80% services early-copy。

### PR 7：尾段 + Contact

先写验证：

```txt
check-ttg-player.mjs
check-ph-player.mjs
check-crane-player.mjs
check-after-media-exit-ink.mjs
check-contact-endpoint.mjs
```

内容：

```txt
services
-> ttg-animation
-> lab
-> ph-animation
-> education
-> crane-animation
-> contact
```

验收：

- TTG / PH exitInk 不引入第二个 compound。
- crane 80% contact early-copy。
- contact 只出现一次。
- footer 只在 contact 后自然滚动出现。

### PR 8：旧系统删除收口

先写验证：

```txt
verify:no-scroll-scrub-homepage
verify:no-legacy-homepage-runtime
verify:no-real-dom-handoff
verify:scene-runtime-production
```

内容：

- 移除旧 homepage transition 生产入口。
- 删除旧 data attributes。
- 删除旧 CSS gates。
- 删除 handoff receiver 首页路径。
- 旧 standalone demo / archive 可以保留。

生产首页不得出现：

```txt
progress-window
earlyReceiver
splitSceneBridge
handoffPhase
data-transition-drive="scroll"
scroll scrub video
scroll scrub ink
handoff receiver adopt real DOM
section-presentation suppress once
```

---

## 8. 并行 worktree / agents 划分

适合并行，但必须等 PR 1 合同冻结后再开。

建议一个 integration owner，多个功能 worktree：

| Worktree | 写入范围 | 职责 |
|---|---|---|
| `codex/scene-runtime-core` | `js/scenes/runtime/**`、runtime 单测 | 状态机、intent、presentation、hash、debug |
| `codex/scene-runtime-dom` | `src/index.template.html`、`src/sections/**`、`js/ui/reveal.js`、高度 CSS、DOM/hash 验证 | DOM shell、method 拆分、reveal ownership |
| `codex/scene-runtime-ink` | `js/scenes/segments/ink-transition.js`、`js/scenes/players/ink/**`、ink 单测 | 墨滴 segment 和 ink players |
| `codex/scene-runtime-media` | `media-controller`、AOD/figure3/ttg/ph/crane players、media 单测 | media playback、poster gate、early-copy hook |
| `codex/scene-runtime-figure2` | compound player、Figure2 DOM/视觉层、compound 单测 | Figure2 四步 sequence |

共享高冲突文件由 integration owner 单独改：

- `package.json`
- `src/homepage/*.mjs`
- `scripts/build-index.mjs`
- `js/main.js`

其他 agents 可以新增独立脚本，但不要同时改 `package.json` scripts。最后由 integration owner 统一挂载验证命令。

---

## 9. 最容易再次失败的点

1. 复用旧 `homepage-transition-runtime.js`，只是换名为 SceneRuntime。
2. `build:page` 继续生成旧 `data-transition-*`，导致新 DOM 被旧系统污染。
3. 新 runtime 和旧 runtime 同时初始化。
4. `.reveal` 先把新 runtime 的目标文案隐藏。
5. Pattern Bloom player 继续 pin belief / 改 copy opacity / 更新旧 timeline。
6. Figure2 compound 内部自己监听 wheel，绕过 runtime。
7. AOD 80% 触发了真正 `PRESENTING`，导致提前解锁。
8. TTG / PH 的 exitInk 没有 phase 状态，失败时无法恢复。
9. `contact` 同时作为 receiver copy、scene、footer endpoint 被三套逻辑控制。
10. validator 仍检查旧 `progressPolicy` / `handoffPhase`，让新合同和旧合同混跑。

---

## 10. 最小可发布版本建议

第一版不要追全首页。

最小可发布版本：

```txt
hero
-> pattern-top
-> pattern-bottom
-> aod-animation
-> method-top
-> method-bottom
```

必须满足：

- 无黑屏。
- 无 scroll scrub。
- AOD 到达时只显示 poster / first frame。
- 第二次 `10vh` 才播放 AOD。
- AOD 80% method-top early-copy。
- AOD 播放完成后才 commit method-top。
- method-top / method-bottom 可自然阅读。
- `#method` 不空白。
- reduced motion 可用。
- 旧 runtime 不参与。

这段跑稳，再迁 Figure2。Figure2 跑稳，再迁后半段。

---

## 11. 最终建议

不要继续在旧 `homepage-master-observer-runtime` 上补丁式调参。

也不要再换 React 试图解决时间编排。React 能改善组件组织，但不能自动解决：

- 谁拥有 scene。
- 谁提交 copy。
- 谁锁滚。
- 谁负责播放完成。
- 谁负责失败恢复。

下一步应该是：

1. 先修订迁移计划中的状态机、early-copy、text-read、compound、TTG/PH phase、philosophy 去留。
2. 然后落 `src/homepage/*.mjs` 新合同。
3. 再写 validator。
4. 最后才接真实 DOM 和视觉。

一句话：

```txt
先让时间编排合同变窄、变硬、可验证；
再迁视觉。
```

