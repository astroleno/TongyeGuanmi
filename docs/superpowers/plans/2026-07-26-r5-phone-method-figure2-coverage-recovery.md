# R5 Phone Method–Figure2 Visibility and Coverage Recovery Implementation Plan

> **Status:** Superseded by
> `2026-07-26-r5-phone-execution-layer-transaction-closure.md`.
> 本文识别出的三个问题和根因继续有效，但不得再作为三个独立补丁执行；
> 它们必须放入统一执行层事务迁移中一并关闭。

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task by task. Do not spawn subagents without explicit user permission.

**Goal:** 只修复并验收三个已确认存在的问题：Method 后续五步文字不可见、Figure2 稳定态卡死且无法继续上下滚动、Pattern 横条闪烁与 Figure2 底部露底。

**Architecture:** 保留现有“原生文档滚动 + 单一固定舞台 + 单一 Orchestrator”的手机端架构，但重新明确三种互不越权的所有权：Orchestrator 只决定当前章节与转场；章节内部进度由文档几何驱动；固定舞台、Pattern 和 Figure2 共享同一条无补丁的满屏覆盖几何链。稳定游标只能在几何暂不可用时提供端点兜底，不能覆盖章节内部滚动进度。

**Tech Stack:** React 19、TypeScript 5.8、Vitest 3、GSAP/ScrollTrigger、Vite 7、Playwright Chromium、iOS Simulator Safari。

---

## 1. 范围与完成定义

本计划接受以下三个问题为事实，不再把“复现问题是否存在”作为实施前提：

1. Method 后面的五步文字没有出现。
2. 进入 Figure2 后卡住，后续内容不可见，上下翻都不起作用。
3. 底部覆盖仍然错误：
   - Pattern 出现很细的横条闪烁；
   - Figure2 底部直接露出一截底色；
   - 不再继续叠加渐变、伪元素、负边距或 overscan 补丁。

本轮不处理 Brand、Figure3、TTG、PH、Crane、Services、Lab、Education、Contact 等后续章节。只允许将 Proof 的第一帧作为“Figure2 已能继续向下”的终点证据，不扩展到 Proof 内部或 Proof 之后。

完成必须同时满足：

| 问题 | 自动化合同 | 浏览器验收 |
| --- | --- | --- |
| Method 文字 | `hold:method-top` 时原生 reading 位于固定舞台之上，五个 `li` 可被滚动显现 | Chrome 与 iOS Simulator Safari 中五步文字逐项出现，无遮挡 |
| Figure2 卡死 | 新滚动 epoch 后 transition lock/anchor 已释放，`scrollY` 与 `--r4-figure2-progress` 同向变化 | 正向可到 Proof 第一帧，反向可回退 Figure2 进度，不跳、不锁死 |
| Pattern/Figure2 露底 | CSS 中不存在 Pattern 底部渐变补丁；各满屏节点覆盖 visual viewport 的四条边 | iOS Simulator Safari 中 Pattern 无横条闪烁，Figure2 底边和右边无露底 |

## 2. 当前代码结论

计划编写基线：

- Worktree：`/Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b`
- Branch：`codex/r5-phone-unit7b`
- Reviewed HEAD：`18b6a7c`
- Worktree 已有大量未提交修改；执行时必须保留并基于现状修改，不得覆盖或回退无关文件。
- 最近一次已记录的手机 JS 结果为 `663,551 / 663,552 bytes`，只剩 1 byte。执行前必须重新测量；不得提高硬上限，生产代码修改必须净增为零或通过删除重复分支回收空间。

### 2.1 Method 后续文字被固定舞台压住

已确认的代码路径：

- `app/src/production/phone/phone-orchestrator-publisher.ts` 当前无条件发布：

  ```ts
  element.dataset.portraitStageActive = 'true';
  ```

- `app/src/production/phone/scenes/PhoneMethodTop.css` 只有在
  `data-portrait-stage-active="false"` 时才把原生 reading 提升到 `z-index: 11`。
- 固定舞台位于 `z-index: 10`，因此 `hold:method-top` 后五步列表仍处于舞台下方。
- `PhoneMethodTop.tsx` 中五个 `<li>` 仍然存在，GSAP reveal 也仍然注册；问题是稳定态表面所有权，不是文案或 DOM 丢失。

根治合同：

- 固定舞台宿主始终保留，不能卸载；
- `data-portrait-stage-active` 表示“固定舞台内容是否拥有当前 viewport”，不能再表示“舞台宿主是否存在”；
- `hold:method-top` 必须让原生 Method reading 成为稳定可见层；
- Method→Figure2 转场开始后，固定舞台重新取得转场所有权。

### 2.2 Figure2 稳定游标覆盖了章节内部几何进度

已确认的代码路径：

- `app/src/production/phone/PhoneGradeAStory.tsx` 在计算 `railActive`、`proofActive` 和 `proofBrandActive` 后，先处理 `stableGradeAHold`。
- 当游标为 `hold:figure2-animation` 时，该分支固定执行 `enter()`、固定端点值，然后直接 `return`。
- 真正调用 `phoneGradeAFigureProgress(...)` 和 `figure2Ref.current.update(...)` 的文档几何分支位于它之后，因此永远无法执行。

这不是“Figure2 没加载”，而是渲染优先级错误。正确优先级固定为：

1. 当前正在运行的时间型转场；
2. 当前章节有效的文档几何进度；
3. 仅在几何暂不可用或章节不在走廊中时使用稳定端点兜底。

稳定游标决定“当前是 Figure2 章节”，但不能把 Figure2 内部进度永久钉在 0。

### 2.3 Pattern 补丁自身形成横条，Figure2 缺少同色底层

已确认的代码路径：

- `app/src/production/phone/scenes/PhonePattern.css` 中
  `.portrait-scroll-spike__pattern-motion::after` 是一个高
  `clamp(48px, 6.5svh, 60px)`、`bottom: -1px` 的多段渐变覆盖层。
- Pattern 图片本身已经 `inset: 0`、`width/height: 100%`、`object-fit: cover`；横条不是媒体尺寸不足，而是额外覆盖层在 Safari 边缘采样时可见。
- `PhoneStageRail.css` 多处同时使用 `inset`、`width: 100%`、显式 `height` 和 `min-height`，形成过约束的固定/绝对定位盒；Safari 亚像素取样时可能在底边或右边选到不同表面。
- `PhoneFigure2.css` 的手机 Figure2 根节点背景是 `transparent`。真正的纸色/景深渐变只属于内部 `.r4-figure2__depth-field`，内部节点出现一像素尺寸差时会直接露出下方 edge surface。

根治合同：

- 每个满屏盒只保留一套尺寸约束，不能同时用 `inset` 和重复的 `width/height/min-height`；
- Pattern 使用真实媒体和 wash，不再使用底部渐变伪元素；
- Figure2 根节点与内部 depth field 使用同一份背景变量；
- 修复必须覆盖底边与右边，不能用新的条带、遮罩或扩大画布来掩盖。

## 3. 禁止的实现方式

- 不增加第二个状态机或 Figure2 本地锁。
- 不通过固定 `scrollTo` 循环“托住”Figure2。
- 不把稳定游标再次放到文档几何分支之前。
- 不增加新的 Pattern/Figure2 底部渐变、伪元素、mask、负 `bottom`、`translateY` 或 overscan。
- 不使用 `100vw` 修右侧缝；手机 Safari 的 scrollbar/亚像素宽度会让问题更不稳定。
- 不修改三个问题之外的场景顺序、文案、媒体和转场。
- 不提高 `663,552 bytes` 手机 JS 硬上限。

## 4. Task 1：恢复 Method 原生文字层所有权

**Files**

- Modify: `app/src/production/phone/phone-story-orchestrator.test.ts`
- Modify: `app/src/production/phone/phone-orchestrator-publisher.ts`
- Verify only unless合同确有缺口: `app/src/production/phone/scenes/PhoneMethodTop.css`
- Modify browser contract: `app/e2e/r5-phone-story.spec.ts`

### 4.1 先写失败的发布合同

- [ ] 将现有“每个 canonical cursor 都保持固定舞台 active”的测试改为语义正确的合同：
  - `hold:method-top` 发布 `data-portrait-stage-active="false"`；
  - `data-portrait-aod-method-visible="true"`；
  - Method→Figure2 transition 发布 `data-portrait-stage-active="true"`；
  - `hold:figure2-animation` 保持 `"true"`。
- [ ] 测试中同时确认只切换舞台内容所有权，不删除固定舞台宿主相关状态。

建议断言：

```ts
orchestrator.syncDiagnostics();
expect(root.dataset.portraitStageActive).toBe('false');
expect(root.dataset.portraitAodMethodVisible).toBe('true');

orchestrator.handleIntent(intent(1));
expect(root.dataset.portraitStageActive).toBe('true');
```

- [ ] 运行并确认新合同先失败：

  ```bash
  cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b/app
  pnpm exec vitest run src/production/phone/phone-story-orchestrator.test.ts
  ```

预期：失败原因只能是当前 publisher 仍无条件写入 `"true"`。

### 4.2 修改 publisher 的稳定态语义

- [ ] 删除“固定舞台内容在整个手机故事中始终拥有 viewport”的错误注释和无条件赋值。
- [ ] 用游标直接派生当前内容所有权，避免新建第二份状态：

  ```ts
  const methodOwnsNativeViewport = next.kind === 'hold'
    && next.scene === 'method-top';
  element.dataset.portraitStageActive = methodOwnsNativeViewport
    ? 'false'
    : 'true';
  ```

- [ ] 保留 `portraitAodMethodVisible` 与舞台所有权的分离：
  - 前者只决定 Method bridge 是否展示；
  - 后者决定 native reading 与 fixed canvas 的层级。
- [ ] 不新增 Method 专用 z-index。现有 `native reading = 11`、`fixed stage = 10` 已足够。
- [ ] 重新运行 Task 1 单测并确认通过。

### 4.3 补浏览器中的真实文字合同

- [ ] 在 `app/e2e/r5-phone-story.spec.ts` 增加一个聚焦用例，从
  `/?v=47#method-top` 冷启动：
  - 等待 `hold:method-top`；
  - 断言根节点 `data-portrait-stage-active="false"`；
  - 逐步向下滚动；
  - 断言 `.portrait-scroll-spike__steps li` 共 5 个；
  - 每一项至少一次与 viewport 相交，最终 `opacity > 0.95`；
  - 断言固定舞台 DOM 仍然只有一个。
- [ ] 此用例只走到 Method 底部，不进入后续场景，避免把其他问题混入本合同。

## 5. Task 2：恢复 Figure2 的滚动进度并保证输入解锁

**Files**

- Modify: `app/src/production/phone/phone-grade-a-runtime.ts`
- Modify: `app/src/production/phone/phone-grade-a-runtime.test.ts`
- Modify: `app/src/production/phone/PhoneGradeAStory.tsx`
- Modify: `app/src/production/phone/PhoneGradeAStory.test.ts`
- Modify browser contract: `app/e2e/r5-phone-story.spec.ts`
- Inspect and modify only if release invariant fails:
  `app/src/production/phone/phone-orchestrated-session.ts`

### 5.1 先把渲染优先级变成可测试的纯函数

- [ ] 在 `phone-grade-a-runtime.ts` 增加一个小型、无 DOM 的渲染模式选择函数；它只表达优先级，不保存状态。
- [ ] 模式至少区分：

  ```ts
  type PhoneGradeARenderMode =
    | 'timed-transition'
    | 'figure-scroll'
    | 'proof-scroll'
    | 'proof-brand-corridor'
    | 'stable-fallback';
  ```

- [ ] 在 `phone-grade-a-runtime.test.ts` 先写以下失败用例：
  - `hold:figure2-animation + railActive` 必须返回 `figure-scroll`；
  - `hold:figure2-animation + railInactive` 才能返回 `stable-fallback`；
  - active timed transition 始终高于几何分支；
  - Proof/Proof→Brand 的现有优先级不被 Figure2 修复破坏。
- [ ] 运行：

  ```bash
  pnpm exec vitest run \
    src/production/phone/phone-grade-a-runtime.test.ts \
    src/production/phone/PhoneGradeAStory.test.ts
  ```

预期：`hold:figure2-animation + railActive` 合同先失败。

### 5.2 重排 `renderFrame()`，删除稳定态抢占

- [ ] 在 `PhoneGradeAStory.tsx` 中保留 `stableGradeAHold`，但删除它位于所有几何判断之前的无条件 early return。
- [ ] 按固定顺序渲染：
  1. `activeInk` 对应的时间型 Method→Figure2、Figure2→Proof 或 Proof→Brand；
  2. `railActive` 时使用 `phoneGradeAFigureProgress(...)` 更新 Figure2；
  3. `proofActive`；
  4. `proofBrandActive`；
  5. 其余情况才按 `stableGradeAHold` 渲染端点。
- [ ] Figure2 文档走廊中每帧必须执行：

  ```ts
  const figure = phoneGradeAFigureProgress(railRect.top, railRect.height);
  figure2Ref.current?.update(clamp(figure / FIGURE2_PROOF_SPLIT));
  ```

- [ ] 稳定兜底不得写入会覆盖下一帧文档进度的完成 latch。
- [ ] 删除被新优先级替代的重复分支，确保生产 JS 总量净增为零或更小。
- [ ] 重新运行 Task 2 单测。

### 5.3 区分“同一滚轮 epoch 尾事件”与“真正未解锁”

- [ ] 扩展现有 `v47 one wheel epoch cannot skip beyond Method → Figure2`：
  - 同一 epoch 的尾事件仍应被 claim，不能启动下一段；
  - 等待新 epoch 后，根节点不得存在
    `data-phone-transition-lock`；
  - 根节点不得存在 `data-phone-anchor-y`；
  - 新一次 wheel/touch 后 `window.scrollY` 必须变化；
  - Figure2 根节点的 `--r4-figure2-progress` 必须从初值增加；
  - 反向输入后该值必须下降。
- [ ] 继续正向滚动，只验证能进入 Figure2→Proof transition 或显示 Proof 第一帧；到此停止。

建议浏览器采样：

```ts
const figure2 = document.querySelector<HTMLElement>(
  '[data-r4-scene="figure2-animation"]'
);
return {
  y: window.scrollY,
  progress: Number.parseFloat(
    figure2?.style.getPropertyValue('--r4-figure2-progress') || '0'
  ),
  lock: root?.hasAttribute('data-phone-transition-lock') ?? true,
  anchor: root?.hasAttribute('data-phone-anchor-y') ?? true
};
```

- [ ] 若 progress 不变但 `scrollY` 已变化，只修 `PhoneGradeAStory` 的渲染选择。
- [ ] 若新 epoch 后 lock 或 anchor 仍存在，则在
  `phone-orchestrated-session.ts` 修复 commit release 的同一事务清理，并为该清理补单测；不能用额外 wheel handler 绕过。

## 6. Task 3：移除边缘补丁，建立单一满屏覆盖链

**Files**

- Modify: `app/src/production/phone/scenes/PhonePattern.css`
- Modify: `app/src/production/phone/scenes/PhonePattern.test.tsx`
- Modify: `app/src/production/phone/PhoneStageRail.css`
- Modify: `app/src/production/phone/phone-layer-contract.test.ts`
- Modify: `app/src/production/phone/PhoneGradeAStory.css`
- Modify: `app/src/production/phone/scenes/PhoneFigure2.css`
- Modify: `app/src/production/phone/scenes/PhoneFigure2.test.tsx`
- Modify browser contract: `app/e2e/r5-phone-story.spec.ts`

### 6.1 先写“不能再有补丁层”的失败合同

- [ ] 在 `PhonePattern.test.tsx` 读取 `PhonePattern.css` 并断言：
  - 不存在 `.portrait-scroll-spike__pattern-motion::after`；
  - 不存在 Pattern 专用的底部渐变条；
  - Pattern 图片仍然 `object-fit: cover`。
- [ ] 在 `phone-layer-contract.test.ts` 增加满屏盒约束：
  - fixed stage 与 persistent edge owner 不得同时声明 `inset: 0` 和 `width: 100%`；
  - stage canvas 不得同时由左右边界和 `width: 100%` 决定宽度；
  - 每层只能有一个 block-size 所有者。
- [ ] 在 `PhoneFigure2.test.tsx` 增加 CSS 合同：
  - Figure2 根节点必须有非透明的共享 field background；
  - root 和 `.r4-figure2__depth-field` 必须引用同一 CSS 变量；
  - phone surface/root 通过 `inset: 0` 拉伸，不再叠加 `height: 100%` 与 `min-height: 100%`。
- [ ] 运行并确认这些新合同先失败：

  ```bash
  pnpm exec vitest run \
    src/production/phone/scenes/PhonePattern.test.tsx \
    src/production/phone/scenes/PhoneFigure2.test.tsx \
    src/production/phone/phone-layer-contract.test.ts
  ```

### 6.2 删除 Pattern 横条来源

- [ ] 完整删除 `.portrait-scroll-spike__pattern-motion::after`。
- [ ] 保留 Pattern 真实图片、bloom、wash 和现有 edge color token。
- [ ] 不以另一段渐变或伪元素替代。
- [ ] 给 `.portrait-scroll-spike__pattern-motion` 增加必要的单一裁剪边界时，只允许使用 `inset: 0` 与 `overflow: hidden/clip`，不修改其可见设计。

### 6.3 统一固定舞台的宽高所有权

- [ ] 在 `PhoneStageRail.css` 将各满屏层改为单一约束：
  - `.portrait-scroll-spike__stage` 使用 `position: fixed; inset: 0`，删除重复 `width: 100%`；
  - `.portrait-scroll-spike__stage-rail::before` 使用 `position: fixed; inset: 0`，删除显式 `width`、`height` 和重复 `min-height`；
  - `.portrait-scroll-spike__stage-canvas` 使用 `top/right/left + var(--portrait-stage-canvas-height)`，删除重复 `width` 和 `min-height`；
  - `.portrait-scroll-spike__scene` 使用 `inset: 0` 拉伸，删除重复 `width/height`。
- [ ] 不修改 `usePhoneViewportGeometry.ts` 的 toolbar 高度冻结策略；本轮只消除 CSS 过约束与表面不一致。
- [ ] 保留 persistent edge owner 的 `z-index: 8` 和语义层级梯子，不新增 edge owner。

### 6.4 让 Figure2 自己成为完整不透明表面

- [ ] 将 `.phone-grade-a__surfaces` 改为相对 stage canvas 的 `inset: 0` 拉伸，删除重复的 `width/height/min-height`。
- [ ] 将手机 `.r4-figure2` 根节点也改为 `inset: 0` 拉伸，删除重复尺寸声明。
- [ ] 在手机 Figure2 根节点只定义一次现有已接受的景深背景变量，例如：

  ```css
  --phone-figure2-field-background:
    radial-gradient(
      ellipse at 50% 48%,
      rgba(255, 252, 242, .34),
      transparent 32rem
    ),
    linear-gradient(180deg, #f6f2e8 0%, #ece8dc 56%, #e2dac9 100%);
  ```

- [ ] Figure2 根节点和 `.r4-figure2__depth-field` 都引用该变量：

  ```css
  background: var(--phone-figure2-field-background);
  ```

- [ ] 不改变人物、中景、远景、拱门或媒体构图；根背景只负责填补内部层之间可能出现的亚像素空隙。
- [ ] 重新运行 Task 3 单测。

### 6.5 增加四边覆盖的浏览器合同

- [ ] 在 Chromium 聚焦用例中分别停在 Pattern 与 Figure2，读取：
  - `visualViewport.offsetLeft/offsetTop/width/height`；
  - stage canvas；
  - Pattern motion/image；
  - Grade A surfaces；
  - Figure2 root/depth field。
- [ ] 每个当前可见表面必须满足：
  - `left <= viewportLeft + 0.5px`；
  - `top <= viewportTop + 0.5px`；
  - `right >= viewportRight - 0.5px`；
  - `bottom >= viewportBottom - 0.5px`。
- [ ] Chromium 几何合同只用于发现 DOM/CSS 回归，不能替代 iOS Safari 的像素采样结论。

## 7. Task 4：按固定顺序完成验证

不得在单测失败时直接进入视觉测试，也不得用 Chrome 通过代替 iOS Simulator Safari。

### 7.1 第一层：代码合同

- [ ] 运行聚焦测试：

  ```bash
  cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b/app
  pnpm exec vitest run \
    src/production/phone/phone-story-orchestrator.test.ts \
    src/production/phone/phone-grade-a-runtime.test.ts \
    src/production/phone/PhoneGradeAStory.test.ts \
    src/production/phone/scenes/PhoneMethodTop.test.ts \
    src/production/phone/scenes/PhonePattern.test.tsx \
    src/production/phone/scenes/PhoneFigure2.test.tsx \
    src/production/phone/phone-layer-contract.test.ts
  ```

- [ ] 运行完整代码检查：

  ```bash
  pnpm test
  pnpm lint
  pnpm typecheck
  pnpm build
  ```

- [ ] 构建验收：
  - phone JS 不超过 `663,552 bytes`；
  - 不提高预算；
  - boolean data contract、module boundaries、media/hash 和 release verifier 全部通过。

### 7.2 第二层：Chrome 快速状态与 DOM 回归

- [ ] 启动最新 production build：

  ```bash
  pnpm preview --host 0.0.0.0 --port 4173
  ```

- [ ] 运行仅包含这三个问题的 Chromium 用例：

  ```bash
  pnpm exec playwright test \
    --config playwright.release.config.ts \
    --project=desktop-chromium \
    e2e/r5-phone-story.spec.ts \
    --grep "Method|Figure2 progress|Pattern coverage"
  ```

- [ ] 使用 390×844 viewport 验证：
  - Method 五步文字可见；
  - Method→Figure2 后新手势能改变 scrollY 和 Figure2 progress；
  - Figure2 正向到 Proof 第一帧、反向进度下降；
  - Pattern/Figure2 四边 rect 覆盖 visual viewport。

### 7.3 第三层：iOS Simulator Safari 每批修改后的主验收

- [ ] 用当前 build 打开：

  ```bash
  xcrun simctl openurl booted "http://127.0.0.1:4173/?v=47"
  ```

- [ ] 每个实现批次都从冷页面开始，不能只刷新已有中间状态。
- [ ] 在 Safari 中依次检查：
  1. Method 标题结束后五步文字逐项出现；
  2. 进入 Figure2 后先等待同一手势结束，再用新手势继续；
  3. Figure2 动画进度正向增加、反向减少；
  4. 能到 Proof 第一帧并能回到 Figure2；
  5. Pattern 静止、滚动、toolbar 展开/收起时均无细横条；
  6. Figure2 底边与右边在 toolbar 展开/收起时均无露底。
- [ ] 分别在关键状态保存截图：

  ```bash
  mkdir -p /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b/app/test-results/manual
  xcrun simctl io booted screenshot \
    /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b/app/test-results/manual/r5-method-figure2-coverage.png
  ```

- [ ] Simulator Safari 全部通过后才可以说“可以开始真机测试”；实体 iPhone Safari 仍负责最终底边/右边采样验收。

## 8. 实施提交边界

在用户授权执行后，建议按以下三个独立提交推进；每个提交都必须先完成对应聚焦测试：

1. `fix(r5): restore native method reading ownership`
2. `fix(r5): resume figure2 document progress`
3. `fix(r5): unify phone full-bleed coverage`

不得把三个提交压成一个难以回归定位的大补丁。若 worktree 中已有重叠修改，先逐文件确认 diff 所有权，只提交本计划明确涉及的行。

## 9. 最终报告格式

最终实施报告只回答：

- 三个问题分别改了什么；
- 单测、typecheck、build 是否通过；
- Chrome 三个聚焦合同是否通过；
- iOS Simulator Safari 六项检查是否通过；
- 手机 JS 最终字节数；
- 是否仍有实体 iPhone Safari 风险。

任一项没有实际执行或没有证据时，必须写“未验证”，不能用已有旧结果代替。
