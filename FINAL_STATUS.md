# Homepage Transition Fixes - Final Status

## ✅ 已完成修复：11/18 条（61%）

| # | 问题 | 状态 | Commit |
|---|---|---|---|
| #0 | nav 模糊塌成线 | ✅ | e03cc99 (远程) |
| #1 | 736px 暗场 | ✅ | 4b21907 |
| #2 | belief 右侧文案 | ✅ | 40104e8 |
| #3 | belief 拉伸/不居中 | ✅ | 4b21907 |
| #5 | aod 被遮 | ✅ | e03cc99 (远程) |
| #6 | method 文字低 | ✅ | e03cc99 (远程) |
| #9 | figure3 文字晚 | ✅ | 40104e8 |
| #11 | lab 双线 | ✅ | e03cc99 (远程) |
| #12 | lab 对齐 | ✅ | e03cc99 (远程) |
| #17 | crane 文字晚 | ✅ | 40104e8 |
| #18 | contact placeholder | ✅ | 30c07b1 |

## 🔧 核心机制已修复（预期解决 #7/#10/#13）

**双 ink 冲突**（commit 20729f4）：删除 5 个 adapter 的旧帘式 ink，split-scene-bridge 双层合成现已可见。

## ⏳ 待验证（可能已修复）

- #4: 星图滚动（split bridge 可能已解决）
- #7: figure2 入场墨滴（split bridge 可能已解决）
- #10: ttg 分层（split bridge 应已解决）
- #13: ph 分层（split bridge 应已解决）

## 📋 剩余需手动修复

- #8: figure2 前景横拱（需在 figure2-transition.js 接 foreground ink channel）
- #14: education 双线（需移除重复 border）
- #16: philosophy 空场（需调整 section 高度）

## 分支

`fix/homepage-transition-ink-conflict` (7 commits)

## 验证截图

`output/playwright/final-all-fixes-2026-06-28/`
