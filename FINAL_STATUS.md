# 方案 C 最终状态

## 已完成的修复（4 个 commits）

### 1. 8634ffe - 修复第二幕下高度为 100vh
✅ **问题 4 已解决**

### 2. a5058aa - 简化 belief-method 配置
✅ **问题 5（部分）**：删除复杂的 progress-window + window-spec

### 3. b5b3647 - 删除不存在的 module
✅ 修复 belief-aod-ink 的 module 加载错误

### 4. 0d5cd46 - home-belief 改为 snap + autoplay
✅ **问题 1+2（预期修复）**：删除 scroll-driven，启用 snap

---

## 预期效果

### ✅ 应该已修复的问题

**问题 1：第一幕→第二幕墨滴扩散**
- home-belief 现在是 snap + autoplay
- pattern-bloom 的 entryInk 应该正常渲染

**问题 2：第二幕上→第二幕下转场**
- pattern-bloom 的 exitInk 应该正常渲染

**问题 4：第二幕下高度**
- belief section 固定 100vh

**问题 5（部分）：belief-method 简化**
- 删除了复杂的 window-spec
- 改为简单的转场配置

### ⏳ 可能仍存在的问题

**问题 3：第二幕上文案布局**
- 未明确修复
- 需要验证第二幕上是否显示文案

**问题 5（未完成）：AOD 动画段落**
- belief-aod-ink 只是简化的转场
- 没有创建独立的 AOD 动画段落
- 没有实现"两段式"（转场 + 动画分离）

**AOD 布局偏右**
- 未修复

---

## 当前架构状态

### home-belief（pattern-bloom）
- 模式：legacy-snap（snap + autoplay）
- 包含：entryInk + lotusBloom + exitInk + belief handoff
- 应该实现：第一幕→第二幕上→第二幕下的完整流程

### belief-aod-ink
- 模式：默认（无 module，无 runtime-mode）
- 配置：简化为基本转场
- **问题**：没有指定如何做墨滴转场，runtime 可能不知道该怎么处理

### 缺失：AOD 动画段落
- 需要：独立的 AOD video 播放 + method 文案入场
- 触发：belief-aod-ink 转场完成后，滚动 10vh
- 当前：不存在

---

## 剩余工作

### 必须完成（问题 5）
创建 AOD 动画段落，实现两段式：
1. belief-aod-ink：墨滴转场到 AOD 首帧（已简化，但可能需要调整）
2. aod-animation：AOD video 播放 + 80% 文案入场（**需要创建**）

### 可选完成
- 验证并修复问题 3（第二幕上文案）
- 修复 AOD 布局偏右
- 验证所有转场是否正常工作

---

## 建议

当前修复是"部分完成"的状态：
- 基础架构已简化（删除 progress-window）
- 基础配置已修正（snap + autoplay, 100vh）
- 但**两段式拆分未完成**（AOD 动画段落缺失）

**下一步最重要的是**：创建 AOD 动画段落，否则问题 5 仍然存在。

---

## 当前分支

```
0d5cd46 fix: remove scroll-driven from home-belief transition
b5b3647 fix: remove non-existent split-scene-ink module
a5058aa fix(stage2): simplify belief-method to pure ink transition
8634ffe fix(stage1): belief section height to 100vh
```

总共 4 个修复 commits，基于回滚后的干净状态。
