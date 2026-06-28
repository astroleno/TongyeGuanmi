# 剩余待修复问题

## #1 暗场（736px）
**根因**：pattern-bloom 的 COVER_PRIOR_SCENE_CLASS 只在 `revealProgress > 0.92` 时激活，但 revealProgress 从 0 开始爬升，0-0.92 之间有暗场。
**修复文件**：`js/transitions/pattern-bloom-adapter.js`
**修复代码**：
```js
// Line 227 附近
doc.body?.classList.toggle(COVER_PRIOR_SCENE_CLASS, overlayActive && revealProgress > 0.18); // 从 0.92 改为 0.18
```

## #3 belief 拉伸/文字不居中
**根因**：belief 段 124svh 压缩了三段时序（reveal/bloom/secondReveal）
**修复文件**：`css/components/homepage-continuity.css`
**修复代码**：
```css
/* Line 165 附近 */
.canvas-section--belief {
  height: 160svh; /* 从 124svh 增加到 160svh，拉开三段空间 */
  min-height: 160svh;
}
```

## #4 星图滚动（2700-2920）
**状态**：可能已被 split-bridge 修复，需验证

## #8 figure2 前景横拱墨滴消失
**根因**：前景 opacity fade 未接 ink channel
**修复文件**：`js/components/figure2-transition.js`
**需要**：在 sceneInkTransition 里添加 foreground layer 通道，让前景溶解跟随 ink boundary

## #14 education 双线
**根因**：ph 转场 seam + education section 边界叠加
**修复文件**：可能需要在 `css/sections/*.css` 移除 education 自身的 border-top/bottom
**验证**：检查 `.canvas-section--education` 是否有 border

## #16 philosophy 空场
**根因**：philosophy section min-height 过高
**修复文件**：`css/sections/*.css` 或 `css/styles.css`
**需要**：找到 philosophy section 的高度定义并收紧
