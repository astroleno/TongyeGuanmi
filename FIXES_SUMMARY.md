# Homepage Transition Fixes - 2026-06-28

## 已修复（核心机制 + 8条问题）

### 🎯 根本原因修复
**双 ink 冲突**：所有 adapter 同时创建了 split-scene-bridge（正确的双层 ink）和 createInkCurtainTransition（旧帘式 ink）。帘式 ink 的 canvas 遮住了 split bridge 的分层效果。

**解决方案**：删除所有 adapter 里的 createInkCurtainTransition 调用。

### ✅ 已修复的问题

| # | 问题 | 修复方式 | Commit |
|---|---|---|---|
| **#0** | nav 顶部模糊塌成线 | ✅ 已在远程分支修好（band 高度 *2） | e03cc99 |
| **#2** | belief 右侧文案缺失 | ✅ 恢复 manifesto-grid 两列布局 | 40104e8 |
| **#5** | aod 被星图遮挡 | ✅ 已在远程分支修好（z-index） | e03cc99 |
| **#6** | method 文字太低 | ✅ 已在远程分支修好（居中对齐） | e03cc99 |
| **#9** | figure3 文字晚 | ✅ receiver start 0.54→0.22 | 40104e8 |
| **#11** | lab 双线 | ✅ 已在远程分支修好 | e03cc99 |
| **#12** | lab 右列不对齐 | ✅ 已在远程分支修好 | e03cc99 |
| **#17** | crane 文字晚 | ✅ receiver start 0.32→0.22 | 40104e8 |
| **#18** | contact 按钮暗 | ✅ 已在远程分支修好 | e03cc99 |

### 🔧 核心机制修复（预期影响 #1/#3/#7/#8/#10/#13）

| Adapter | 修复内容 | 预期效果 |
|---|---|---|
| **aod** | 删除 inkTransition | belief→aod 入场现在能看到 split 分层 |
| **figure3** | 删除 exitInk | brand→figure3 出场分层可见 |
| **ttg** | 删除 entry/exitInk | services→ttg→lab 分层可见 |
| **ph** | 删除 entry/exitInk | lab→ph→education 分层可见 |
| **crane** | 删除 entry/exitInk | philosophy→crane→contact 分层可见 |

## 未修复（需要进一步工作）

| # | 问题 | 原因 | 建议 |
|---|---|---|---|
| **#1** | 736px 暗场 | pattern-bloom 时序（hero covering 窗口过窄） | 需调整 COVER_PRIOR_SCENE_CLASS 触发阈值 |
| **#3** | belief 背景拉伸/文字不居中 | belief 段 124svh 压缩三段时序 | 需重排 pattern-bloom 区间 |
| **#4** | 2700-2920 星图滚动 | belief→aod 墨滴转场缺失 | split bridge 可能已修复，需验证 |
| **#7** | figure2 入场墨滴 | method→figure2 入场 | split bridge 可能已修复，需验证 |
| **#8** | figure2 前景横拱 | 前景退场未接 ink | 需在 figure2-transition 组件接入 foreground ink |
| **#10** | ttg 分层 | ttg split bridge | 本次修复应已解决，需验证截图 |
| **#13** | ph 分层 | ph split bridge | 本次修复应已解决，需验证截图 |
| **#14** | education 双线 | 转场 seam + section border 叠加 | 需移除重复 border |
| **#16** | philosophy 空场 | section 高度过高 | 需调整 min-height |

## Commits

```
20729f4 fix(homepage): remove overlay ink conflicting with split-scene bridges
40104e8 fix(homepage): restore belief right column and early receiver timing
```

## 验证截图

最新截图位于：
- `output/playwright/final-verification-2026-06-28/`
