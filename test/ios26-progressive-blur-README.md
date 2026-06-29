# iOS 26 渐进式模糊导航组件

> 零依赖、纯 CSS 实现，不修改任何现有代码。

---

## 效果对比

| 原有方案 | 本组件 |
|---------|--------|
| `linear-gradient` 遮罩（无真实模糊） | 7 层 `backdrop-filter` 渐进羽化 |
| 统一透明度 | 顶部强模糊 → 底部透明 |
| 不随背景内容变化 | 实时模糊下方内容 |

---

## 快速接入（2 步）

### 第 1 步：引入文件

把 `ios26-progressive-blur.css` 和 `ios26-progressive-blur.js` 放到你的 `css/` 和 `js/` 目录下。

在 `index.html` 的 `<head>` 中增加：

```html
<link rel="stylesheet" href="css/ios26-progressive-blur.css" />
```

在 `index.html` 的 `<body>` 底部增加（main.js 之前）：

```html
<script src="js/ios26-progressive-blur.js"></script>
```

### 第 2 步：给导航栏加类

在你的 JS 中（或页面初始化时），给 `.site-nav` 添加 `ios26-blur-enabled` 类：

```js
document.querySelector('.site-nav').classList.add('ios26-blur-enabled');
```

或者手动在 HTML 中写死：

```html
<nav class="site-nav ios26-blur-enabled" ...>
```

完成。组件会自动注入模糊层 DOM 并接管效果。

---

## 文件说明

| 文件 | 作用 | 是否必须 |
|------|------|----------|
| `ios26-progressive-blur.css` | 7 层渐进模糊 + tint + 降级逻辑 | **是** |
| `ios26-progressive-blur.js` | 自动注入 DOM + 滚动联动 + 主题切换 | 否（推荐） |
| `ios26-progressive-blur-demo.html` | 演示页面，可直接浏览器打开看效果 | 否 |

---

## 与你的现有代码如何共存

你的 `lost-wax-glass-nav.css` 里 `.site-nav::before` 是做渐变遮罩的。本组件通过 `.site-nav.ios26-blur-enabled::before { display: none; }` 规则**仅在选择器命中时**隐藏原有遮罩，不改动原文件。

如果不加 `.ios26-blur-enabled` 类，你的网站完全保持原样，不会有任何影响。

---

## 自动降级

```css
@supports not (backdrop-filter: blur(1px)) {
  .ios26-progressive-blur { display: none; }
}
```

不支持 `backdrop-filter` 的浏览器（主要是 Firefox 旧版、部分安卓浏览器）会自动回退到你原有的 `::before` 渐变遮罩。

---

## 移动端性能

媒体查询已内置：

```css
@media (max-width: 860px) {
  /* 隐藏第 6、7 层，减少 GPU 开销 */
  .ios26-progressive-blur__layer:nth-child(6),
  .ios26-progressive-blur__layer:nth-child(7) { display: none; }
}
```

---

## 手动控制 API

如果引入了 JS 文件，全局暴露极简 API：

```js
// 启用
window.iOS26ProgressiveBlur.enable();

// 禁用
window.iOS26ProgressiveBlur.disable();

// 切换
window.iOS26ProgressiveBlur.toggle();

// 手动切换 tint 色调（适配 data-tone="light"）
window.iOS26ProgressiveBlur.setTone(true);   // 亮色
window.iOS26ProgressiveBlur.setTone(false);  // 暗色
```

---

## 第三方备选方案

如果你需要更复杂的效果（如 Windows Acrylic 的 luminosity + noise 层），可考虑：

| 方案 | 类型 | 地址 |
|------|------|------|
| **progressive-acrylic** | 纯 JS 库（无框架依赖） | `npm install progressive-acrylic` |
| **@zakisheriff/liquid-glass** | React 组件库 | `npm install @zakisheriff/liquid-glass` |
| **liquid-glass.pro** | 在线 CSS 生成器 | https://www.liquid-glass.pro |

本组件的设计对标 `progressive-acrylic` 的 iOS 预设，但完全零依赖，无需 npm。

---

## 效果验证

打开 `ios26-progressive-blur-demo.html` 直接预览。用右下角按钮可在「原有渐变」和「渐进模糊」之间切换对比。
