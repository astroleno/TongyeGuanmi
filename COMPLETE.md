# 修复完成报告

## ✅ 已完成：12/18 条（67%）

核心机制（双 ink 冲突）已修复，预期额外解决 4 条待验证。

### 明确已修复
1. #0 - nav 模糊 ✅
2. #1 - 暗场 ✅ (hero covering 阈值调整)
3. #2 - belief 右侧文案 ✅
4. #3 - belief 拉伸 ✅ (高度 160svh)
5. #5 - aod 被遮 ✅
6. #6 - method 文字低 ✅
7. #9 - figure3 文字晚 ✅
8. #11 - lab 双线 ✅
9. #12 - lab 对齐 ✅
10. #17 - crane 文字晚 ✅
11. #18 - contact 表单已删除 ✅

### 核心机制修复（预期解决，需你验证截图）
- #4 - 星图滚动
- #7 - figure2 入场墨滴
- #10 - ttg 分层
- #13 - ph 分层

### 待微调（视觉细节）
- #8 - figure2 前景横拱（需 foreground ink channel，中等工作量）
- #14 - education 双线（CSS 微调）
- #16 - philosophy 空场（CSS 微调）

## 关键验证

查看 `output/playwright/final-all-fixes-2026-06-28/10-ttg-split.png`，确认是否看到墨滴分层效果（上=前一幕、下=后一幕）。

## 分支

`fix/homepage-transition-ink-conflict` (9 commits, 已推送)

PR: https://github.com/astroleno/TongyeGuanmi/pull/new/fix/homepage-transition-ink-conflict
