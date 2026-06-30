# 阶段 2 完成报告：启用 Snap/Autoplay

## 完成时间
2026-06-28

## 修改内容

### 修改 1：移除 progress-window 绕过 snap 的逻辑
**文件**：`js/transitions/homepage-transition-runtime.js:932`
**修改前**：
```js
const isScrollDriven = isProgressWindow || host.dataset.transitionDrive === 'scroll' || SCROLL_DRIVEN_MODULES.has(moduleName);
```
**修改后**：
```js
const isScrollDriven = host.dataset.transitionDrive === 'scroll' || SCROLL_DRIVEN_MODULES.has(moduleName);
```
**效果**：progress-window 模式不再被判定为 scroll-driven，snapController 会被创建

---

### 修改 2：修改 snap 触发阈值
**文件**：`js/transitions/homepage-transition-runtime.js:20`
**修改前**：
```js
const DEFAULT_SNAP_ENTRY_VH = 1.02;  // 102vh，基本不可能触发
```
**修改后**：
```js
const DEFAULT_SNAP_ENTRY_VH = 0.1;  // 10vh，按用户要求
```
**效果**：滚动到转场容器 10vh 时触发 snap

---

### 修改 3：优先使用 snapController 的 progressSource
**文件**：`js/transitions/homepage-transition-runtime.js:937-949`
**修改前**：
```js
const baseProgressSource = isProgressWindow
  ? createProgressWindowSource(host, root)  // scroll-driven
  : isScrollDriven
    ? createElementScrollProgressSource(host)
    : () => snapController.progressSource();
```
**修改后**：
```js
const baseProgressSource = snapController
  ? () => snapController.progressSource()  // 优先使用 RAF autoplay
  : isProgressWindow
    ? createProgressWindowSource(host, root)
    : isScrollDriven
      ? createElementScrollProgressSource(host)
      : null;
```
**效果**：有 snapController 时，转场进度由 RAF 时间驱动，而非 scroll 驱动

---

## 核心逻辑改变

### 之前的流程（错误）：
1. 转场配置 `runtimeMode: 'progress-window'`
2. Runtime 判定：`isScrollDriven = true`（因为 isProgressWindow）
3. `snapController = null`（不创建）
4. `progressSource = createProgressWindowSource`（scroll-driven）
5. **结果**：所有转场都是滚动 scrub，没有 snap，没有 autoplay

### 现在的流程（正确）：
1. 转场配置 `runtimeMode: 'progress-window'`
2. Runtime 判定：`isScrollDriven = false`（移除了 isProgressWindow）
3. `snapController = snapCoordinator.createController(host)`（✅ 创建）
4. `progressSource = snapController.progressSource()`（RAF autoplay）
5. **结果**：转场是 snap + RAF 时间驱动

---

## 预期效果

### 转场行为：
- 滚动到转场容器 10vh 时，触发 `snapController`
- 滚动被锁定（`html.homepage-transition-snap-active`）
- 转场自动播放 2s（`animateProgress` RAF loop）
- 播放完成后释放滚动锁定

### 动画行为（AOD/Figure2/Figure3/TTG/PH/Crane）：
- 转场完成后，用户继续滚动 10vh
- 再次触发 snap 锁定
- 动画自动播放（video 播放）
- 早接收器（AOD/Figure3/Crane）：动画 80% 时文案淡入
- 动画 + 文案完成后释放锁定

---

## 验证状态

### ⏳ 待用户手动验证
由于 token 限制和权限限制，自动化验证未完成。需要你手动验证：

1. 启动 dev server：`npm run dev`
2. 打开浏览器控制台
3. 滚动到 belief section 末尾（约 2500px）
4. 观察：
   - `document.documentElement.classList` 是否包含 `homepage-transition-snap-active`
   - 滚动是否被锁定
   - 转场是否自动播放（不跟随 scroll）
   - 播放完成后是否释放

### 检查点：
- [ ] belief → aod 转场触发 snap
- [ ] aod 转场自动播放 2s
- [ ] aod 转场完成后，继续滚动触发 aod 动画 snap
- [ ] aod 动画自动播放，80% 时 method 文案淡入
- [ ] 动画 + 文案完成后释放 scroll

---

## Commits

```
76163aa fix(runtime): enable snap/autoplay for all transitions
eb9d99f fix(runtime): enable snap/autoplay for progress-window transitions
```

---

## 下一步

如果阶段 2 验证通过：
- **阶段 3**：分层 ink 架构（fbm mask + DOM projection）
- **阶段 4**：删除 receiver/native 双文案竞争

如果阶段 2 验证失败：
- 需要进一步调试 snap 触发逻辑
- 可能需要检查 `updateControllerState` 的触发条件
- 可能需要检查 `shouldSuppressControllerUpdates` 是否阻止了更新

---

## 已知问题

1. **progressSource 的 window spec**：
   - 当前 progress-window 的 window spec（belief-aod-split, aod-scene, aod-method-receiver）可能不再适用
   - 因为现在进度由 snapController.playhead 驱动，不再是 scroll 位置
   - 可能需要调整 window spec 的 from/to 值

2. **handoffProgressSource**：
   - 当前 handoffProgressSource 仍可能引用 postProgressSource
   - 需要确认 handoff 逻辑是否与 snap autoplay 兼容

3. **SCROLL_DRIVEN_MODULES**：
   - 需要确认哪些 module 应该保留在 SCROLL_DRIVEN_MODULES 里
   - pattern-bloom 应该是自动播放，不应该在 SCROLL_DRIVEN_MODULES

---

## 等待用户确认

@用户 请确认：
1. 阶段 2 的修改逻辑是否正确？
2. 你能否手动验证 snap/autoplay 是否生效？
3. 如果验证通过，我继续阶段 3（分层 ink）？
4. 如果验证失败，我需要进一步调试什么？
