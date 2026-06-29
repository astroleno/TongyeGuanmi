# iOS 26 顶部整行毛玻璃导航组件

> 纯 CSS，零依赖，不修改任何现有代码。
> 导航栏**一整行**（100vw × 64px）都是真实的 `backdrop-filter` 毛玻璃效果。

---

## 效果对比

| 原有方案 | 本组件 |
|---------|--------|
| `::before` 渐变遮罩（暗色渐变，无模糊） | 整行 `backdrop-filter: blur(20px)` 真实毛玻璃 |
| 背景内容不可见 | 背景内容透过毛玻璃实时模糊可见 |
| 只有 64px 高 | 64px 毛玻璃 + 48px 下方过渡带 |

---

## 快速接入（2 步）

### 第 1 步：引入文件

```html
<link rel="stylesheet" href="css/ios26-glass-nav.css" />
<script src="js/ios26-glass-nav.js"></script>
```

### 第 2 步：给导航栏加类

```js
document.querySelector('.site-nav').classList.add('ios26-glass-enabled');
```

或直接在 HTML 中写：

```html
<nav class="site-nav ios26-glass-enabled" ...>
```

完成。JS 会自动注入毛玻璃层 DOM。

---

## 效果说明

### 组件结构

在 `.site-nav` 内注入两个元素：

```html
<nav class="site-nav ios26-glass-enabled">
  <!-- 注入：毛玻璃主条（导航栏本身） -->
  <div class="ios26-glass-bar"></div>

  <div class="site-nav-track">...</div>

  <!-- 注入：下方过渡带（模糊逐渐消散） -->
  <div class="ios26-glass-transition"></div>
</nav>
```

### 视觉参数

| 元素 | 属性 | 值 |
|------|------|-----|
| `.ios26-glass-bar` | `backdrop-filter` | `blur(20px) saturate(120%)` |
| `.ios26-glass-bar` | `background` | `rgba(5, 8, 7, 0.42)` |
| `.ios26-glass-bar` | `width` | `100%` |
| `.ios26-glass-transition` | `backdrop-filter` | `blur(12px) saturate(120%)` |
| `.ios26-glass-transition` | `height` | `48px` |
| `.ios26-glass-transition` | `mask` | 从 `opacity 0.65` 渐变到 `0` |

`saturate(120%)` 模拟 iOS 26 Liquid Glass 的**色彩增强**特性——背景模糊后不会变灰，而是保持鲜艳。

---

## 与现有代码共存

你的 `lost-wax-glass-nav.css` 里 `.site-nav::before` 是现有渐变遮罩。本组件**仅在选择器命中 `.ios26-glass-enabled` 时**隐藏它：

```css
.site-nav.ios26-glass-enabled::before {
  display: none !important;
}
```

不加 `.ios26-glass-enabled` 类，网站完全不受影响。

---

## 自动降级

```css
@supports not (backdrop-filter: blur(1px)) {
  .ios26-glass-bar,
  .ios26-glass-transition { display: none; }
  .site-nav.ios26-glass-enabled::before { display: block !important; }
}
```

不支持 `backdrop-filter` 的浏览器自动回退到原有渐变遮罩。

同时支持 `prefers-reduced-motion`：若用户开启了减少动画，毛玻璃自动关闭。

---

## 移动端性能

```css
@media (max-width: 860px) {
  .ios26-glass-bar {
    backdrop-filter: blur(14px) saturate(115%);
    background: rgba(5, 8, 7, 0.48);
  }
  .ios26-glass-transition {
    backdrop-filter: blur(8px) saturate(115%);
    height: 36px;
  }
}
```

移动端降低模糊强度以节省 GPU 开销。

---

## 手动控制 API

```js
// 启用
window.iOS26GlassNav.enable();

// 禁用
window.iOS26GlassNav.disable();

// 切换
window.iOS26GlassNav.toggle();

// 切换亮色 tint（适配 data-tone="light"）
window.iOS26GlassNav.setLight(true);
```

---

## 演示

打开 `ios26-glass-nav-demo.html`，页面包含高对比度背景（金色/绿色渐变球体），确保毛玻璃效果清晰可见。右下角按钮可在「原有渐变」和「整行毛玻璃」之间切换。

---

## 文件清单

| 文件 | 作用 | 是否必须 |
|------|------|----------|
| `ios26-glass-nav.css` | 毛玻璃条 + 过渡带 + 降级逻辑 | **是** |
| `ios26-glass-nav.js` | 自动注入 DOM + 主题监听 | 推荐 |
| `ios26-glass-nav-demo.html` | 演示页面 | 否 |
