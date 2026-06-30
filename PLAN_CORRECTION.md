# 计划修正：基于核心根因的重新设计

## 你发现的核心根因（之前我漏掉的）

### 根因 1：progress-window 绕开了 snap/autoplay
**证据**：`homepage-transition-runtime.js:930`
```js
const isScrollDriven = runtimeMode === 'progress-window' || ...;
const snapController = isScrollDriven ? null : snapCoordinator.createController(host);
```

**问题**：
- 当前所有转场（AOD/Figure2/Figure3/TTG/PH/Crane）都配置成 `progress-window` 模式
- runtime 判定 progress-window = scroll-driven，所以**不创建 snapController**
- 没有 snapController = 没有 snap 锁定 = 没有 RAF autoplay = 全部 scroll scrub

**我之前错在哪**：
- 我以为 runtime 里没有 snap coordinator，需要"迁移"
- 实际上 snap coordinator 已经有了（line 285 createHomepageSnapCoordinator, line 493 animateProgress）
- 真正的问题是**配置和分支逻辑让它被跳过了**

---

### 根因 2：根目录 ink 不支持任意 DOM 纹理
**证据**：`ink-scene-transition.js:729/742`
```js
nextLayer.element = options.nextSceneElement || null;
// ...
if (element.tagName === 'CANVAS' || element.tagName === 'VIDEO' || element.tagName === 'IMG') {
  gl.texImage2D(..., element);
}
```

**问题**：
- 根目录 ink 只能接 canvas/video/img（WebGL texture 兼容类型）
- 当前 split-scene-bridge 大量使用 `domProjection` clone（普通 div/section）
- **不能直接"替换 import"就解决**

**我之前错在哪**：
- 我看到 `nextSceneElement` 就以为支持任意 DOM
- 实际上只支持 media 元素
- 需要先做 **SceneCaptureLayer**：把完整一幕渲染成 canvas，再交给 WebGL ink

---

### 根因 3：当前转场采样的不是完整一屏
**证据**：split-scene-bridge 的 projection 是局部 selector
```js
previous: { kind: 'domProjection', element: beliefSource }  // .belief-copy-wrap
next: { kind: 'domProjection', element: aodVisualSource }   // .aod-transition__stage
```

**问题**：
- 这些 element 不是满屏的完整场景
- 即使 host 改成 100vh，采样对象还是局部内容
- 所以转场时看不到"上半=前一幕、下半=后一幕"的完整视觉

**我之前错在哪**：
- 我以为只要 `.homepage-transition { height: 100vh }` 就行
- 实际上采样源不是 100vh，放进 100vh 壳子里也只是局部内容居中显示
- **需要为每一幕定义 full-scene owner**

---

### 根因 4：receiver 和 native section 文案双份竞争
**问题**：
- native section（如 method）的文案 DOM 一直在
- receiver clone 了同一份文案到转场容器
- 两份同时可见 = 文案重复

**我之前的方案不够**：
- `restoreAt: 1.05` 只能延后恢复，但 native section 在转场期间可能已经滚动进视口
- **根治是确保同一时刻只有一个 owner**（native pinned 或 receiver projection）

---

## 修正后的四个工程阶段

### 阶段 1：定义每一幕的 full-scene owner

**目标**：列清楚每个转场的"上一幕/下一幕"是谁的完整 100vh 场景

**任务**：
1. 创建 `SCENE_DEFINITIONS.md`，列出：
   ```
   转场：belief → aod
   - 上一幕：belief section（100vh，包含星图 + 文案）
   - 下一幕：aod 动画容器（100vh，包含 video + 文案预览）
   - 转场类型：下→上水平不规则墨滴
   ```

2. 确认每一幕的"完整场景"是哪个 DOM 元素：
   - 如果是 section，直接用
   - 如果是动画容器，确认是否满屏
   - 如果是局部元素，需要扩展成满屏布局

3. 对于文案提前入场的（aod/figure3/crane）：
   - 动画场景：不包含文案的纯动画层
   - 文案层：独立的叠加层，不参与转场采样

**产出**：`SCENE_DEFINITIONS.md`

---

### 阶段 2：把 progress-window 转回 snap/autoplay

**目标**：让 AOD/Figure2/Figure3/TTG/PH/Crane 退出 scroll-driven，恢复自动播放

**任务**：
1. 修改 `section-manifest.mjs`（line 91+ 的各 section 配置）：
   ```js
   // 之前
   { id: 'aod', mode: 'progress-window', ... }
   
   // 改为
   { id: 'aod', mode: 'snap-autoplay', snapTrigger: 0.1, ... }
   ```

2. 修改 `homepage-transition-runtime.js` 的分支逻辑（line 930）：
   ```js
   // 之前
   const isScrollDriven = runtimeMode === 'progress-window' || ...;
   
   // 改为
   const isScrollDriven = runtimeMode === 'scroll-scrub';  // 只有明确 scroll-scrub 才是 scroll-driven
   const snapController = isScrollDriven ? null : snapCoordinator.createController(host);
   ```

3. 为所有转场/动画 host 设置：
   ```js
   host.dataset.transitionSnapEntryVh = '0.1';  // 10vh 触发
   host.dataset.transitionPlayDurationMs = '2000';  // 转场时长 2s
   ```

**验证**：
- 滚动到转场容器 10vh 处，触发 snap 锁定
- 转场自动播放 2s（不跟随 scroll）
- 转场完成后释放 snap

**产出**：修改后的 manifest + runtime

---

### 阶段 3：SceneCaptureLayer + WebGL ink

**目标**：把完整一幕渲染成 canvas texture，接入根目录的 WebGL ink

**任务**：
1. 新建 `js/utils/scene-capture-layer.js`：
   ```js
   export function captureSceneToCanvas(sceneElement, targetCanvas) {
     // 用 html2canvas 或 drawImage 把完整 scene 渲染到 canvas
     // 返回 canvas（可作为 WebGL texture）
   }
   ```

2. 修改 `split-scene-bridge.js`：
   ```js
   // 在转场开始时
   const previousCanvas = captureSceneToCanvas(previousSceneOwner, doc.createElement('canvas'));
   const nextCanvas = captureSceneToCanvas(nextSceneOwner, doc.createElement('canvas'));
   
   // 用根目录 ink
   const ink = createInkSceneTransition(inkCanvas, {
     previousSceneElement: previousCanvas,
     nextSceneElement: nextCanvas,
     direction: directionToShaderParam(direction)
   });
   ```

3. 用根目录 `ink-scene-transition.js` 替换当前的 `split-scene-ink-transition.js`

**验证**：
- 转场时，上半部分显示完整的前一幕（100vh）
- 下半部分显示完整的后一幕（100vh）
- 墨滴边界不规则（fbm 噪声）

**产出**：scene-capture-layer.js + 修改后的 split-scene-bridge.js

---

### 阶段 4：删除 receiver/native 双文案竞争

**目标**：确保文案只有一个 owner

**策略**：
1. **转场期间**：native section 文案隐藏（opacity: 0 或 visibility: hidden）
2. **文案提前入场**（aod/figure3/crane）：
   - 动画播放时，文案作为独立叠加层淡入
   - 不使用 receiver clone，直接操作 native section 文案的 CSS
   - 动画完成后，释放 native section

**任务**：
1. 在 snap 触发时，隐藏目标 section 的文案：
   ```js
   targetSection.querySelector('.chapter-intro')?.classList.add('homepage-transition-hidden');
   ```

2. 修改 aod/figure3/crane adapter 的文案入场：
   ```js
   // 不再用 receiver clone
   // 直接在动画 80% 时，控制 native section 文案的 opacity
   if (animationProgress >= 0.80) {
     const copyOpacity = smoothStep(range01(animationProgress, 0.80, 0.95));
     targetSection.querySelector('.chapter-intro').style.opacity = copyOpacity;
   }
   ```

3. 删除所有 `createHandoffReceiver` 调用（或只用于其他目的，不用于文案）

**验证**：
- method/brand/services/lab/education 文案只出现一次
- aod/figure3/crane 的文案在动画 80% 时淡入，不重复

**产出**：修改后的 adapter + 删除 receiver clone

---

## 执行顺序

1. **阶段 1**（定义）→ 生成 `SCENE_DEFINITIONS.md`，你审核确认
2. **阶段 2**（恢复 autoplay）→ 修改 manifest + runtime，验证 snap 生效
3. **阶段 3**（完整场景 texture）→ scene-capture + WebGL ink，验证墨滴边界
4. **阶段 4**（单一文案 owner）→ 删除 receiver，验证不重复

每个阶段独立 commit，逐步验证。

---

## 与之前计划的对比

| 之前（错误） | 现在（修正） |
|---|---|
| 阶段 2："迁移 snap coordinator" | 不需要迁移，只需修改配置让现有的被启用 |
| 阶段 1："替换 import" | 需要先做 scene-capture，不能直接替换 |
| 阶段 5："100vh 高度" | 不只是高度，是采样源要完整 |
| 阶段 3："receiver start 0.80" | 需要拆 timeline，不只是延后 |

---

## 我之前漏掉的关键点总结

1. **runtime 已经有 snap coordinator**，只是被 progress-window 配置绕开了
2. **根目录 ink 不支持任意 DOM**，需要先做 canvas capture
3. **采样源不是满屏**，需要重新定义 full-scene owner
4. **文案重复的根因是双 owner 竞争**，不是 restoreAt 时机

---

## 现在可以执行了吗？

@用户 请确认：
1. 这个修正计划的 4 个阶段顺序是否合理？
2. 是否需要我先执行阶段 1（生成 SCENE_DEFINITIONS.md），你审核后再继续？
3. 还有其他我漏掉的核心问题吗？
