# 阶段 2 当前状态

## 已完成的修复（3 个 commits）

### Commit 1: eb9d99f (初版，部分错误)
- 移除 isProgressWindow 导致 isScrollDriven
- 创建 snapController

### Commit 2: 76163aa (初版，部分错误)
- 修改 snapEntryVh = 0.1（**错误**）
- 优先使用 snapController.progressSource

### Commit 3: 6d4f422 (修正)
- ✅ **修正 snapEntryVh = 0.9**（露出 10vh 触发）
- ✅ **删除 home-belief 的 drive="scroll"**（第一幕→第二幕也 snap）

---

## 当前状态

### ✅ 已修复
1. progress-window 不再绕过 snapController（commit 1-2）
2. snapController.progressSource 优先级高于 scroll（commit 2）
3. snapEntryVh 正确（0.9 = 露出 10vh 触发）（commit 3）
4. home-belief 改为 snapped autoplay（commit 3）

### ⏳ 待验证
- home-belief（第一幕→第二幕）是否 snap + autoplay
- belief-method（AOD）是否 snap + autoplay
- snapEntryVh = 0.9 是否在正确位置触发

### ❌ 仍未修复（架构级问题）

#### 问题 1：转场和动画混在同一个 playhead
**现状**：belief-method 把"墨滴转场 + AOD 动画 + method 文案"都塞进一个 snap 周期

**应该是**（按你的定义）：
1. 阶段 A：belief → AOD 首帧墨滴转场（snap + autoplay 2s）→ 释放
2. 阶段 B：滚动 10vh → AOD 动画 snap（snap + video autoplay）→ 动画 80% 文案入场 → 释放

**影响**：所有动画型转场（AOD/Figure3/TTG/PH/Crane）

#### 问题 2：AOD 布局偏右
**现状**：AOD 动画播放过程中，文案和图案偏右，不居中

**需要**：查找 aod-homepage-adapter 或相关 CSS 的播放逻辑

---

## 下一步选择

### 选项 A：先验证 P1+P2 是否生效
手动测试或截图验证：
- home-belief 是否 snap（露出 10vh 触发）
- snapEntryVh = 0.9 是否正确

### 选项 B：继续修复 P0（AOD 布局）
深入查找 AOD 播放时的布局偏移根因

### 选项 C：修复 P3（拆分转场/动画）
这是最大的架构改动，需要：
- 修改所有动画型转场的 window-spec
- 拆分成多个独立的 snap 阶段
- 每个阶段独立触发、独立释放

---

## 我的建议

1. **先让你验证 P1+P2**（选项 A）：
   - 启动 dev server
   - 滚动到 home-belief，看是否 snap
   - 滚动到 belief-method，看触发时机

2. **如果 P1+P2 验证通过**：
   - 继续 P0（AOD 布局）
   - 然后 P3（拆分转场/动画）

3. **如果 P1+P2 仍有问题**：
   - 告诉我具体现象
   - 我继续调试

---

## 当前分支状态

```
6d4f422 fix(stage2): correct snapEntryVh to 0.9 and remove home-belief scroll-driven
76163aa fix(runtime): enable snap/autoplay for all transitions
eb9d99f fix(runtime): enable snap/autoplay for progress-window transitions
```

等待你的指示：验证 or 继续修复？
