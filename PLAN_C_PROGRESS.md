# 方案 C 执行进度

## 已完成（2 个 commits）

### Commit 1: 8634ffe - 修复第二幕下高度
✅ **问题 4 已修复**：belief section 从 160svh 改为 100svh

### Commit 2: a5058aa - 简化 belief-method 为纯墨滴转场
✅ **部分修复问题 5**：删除复杂的 progress-window + window-spec

**修改内容**：
- 删除：runtime-mode, window-spec, phase-spec, receiver config
- 改为：简单的 snap + autoplay 墨滴转场
- module: 'aod' → 'split-scene-ink'
- transition-id: 'belief-method' → 'belief-aod-ink'
- play-ms: 2600 → 2000

---

## 剩余任务

### ⏳ 问题 1：第一幕→第二幕墨滴中心扩散消失
**状态**：未修复
**需要**：检查 pattern-bloom 的 entryInk 渲染逻辑

### ⏳ 问题 2：第二幕上→第二幕下转场消失
**状态**：未修复
**需要**：检查 pattern-bloom 的 exitInk 渲染逻辑

### ⏳ 问题 3：第二幕上文案被挪到第二幕下
**状态**：未修复
**需要**：查找第二幕上应该显示的文案，修正布局

### ⏳ 问题 5（未完成）：创建 AOD 动画段落
**状态**：belief-method 已简化，但还需要创建独立的 AOD 动画段落
**需要**：
1. 创建新的转场 host 或 animation section
2. AOD video 自动播放
3. 80% 时 method 文案淡入

---

## 当前状态分析

### belief-aod-ink 转场（已简化）
- module: 'split-scene-ink'（但这个 module 不存在！）
- 需要修改为正确的 module，或者创建 split-scene-ink adapter

### 问题：split-scene-ink module 不存在
当前 runtime 会查找 `homepageTransitionRegistry['split-scene-ink']`，但这个 module 没有注册。

**可能的解决方案**：
1. 改用现有的 module（如 'aod'，但只做墨滴转场）
2. 创建新的 split-scene-ink adapter
3. 修改 split-scene-bridge 让它可以独立运行

---

## 下一步选择

### 选项 A：先修复 module 不存在的问题
让 belief-aod-ink 能正确加载

### 选项 B：先修复 pattern-bloom（问题 1-3）
让第一幕→第二幕的转场效果正确显示

### 选项 C：继续完成问题 5（创建 AOD 动画段落）
但前提是先解决 module 不存在的问题

---

## 我的建议

**优先修复选项 A**（module 不存在）：
- 把 belief-aod-ink 的 module 改回能用的（如去掉 module，用 split-scene-bridge）
- 或者创建简单的 split-scene-ink adapter

然后再决定是修 pattern-bloom 还是创建 AOD 动画段落。

---

等待你的指示：
1. 继续修复 module 不存在问题？
2. 还是先修 pattern-bloom（问题 1-3）？
3. 或者其他优先级？
