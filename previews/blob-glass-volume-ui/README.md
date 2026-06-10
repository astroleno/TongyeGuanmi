# Soft Blob Glass / 古法失蜡琉璃 UI 材质组件

这版针对 Shader Park 参考重新实现：CSS 不再承担“画体积”的工作，而是只负责组件结构、伪元素承载、backdrop blur、文字层和交互。真正的材质来自 `blob-volume.js`：它用 Canvas2D 生成一个小尺寸的 raymarched 体积贴图，再把 PNG data URL 注入到 CSS 变量 `--blob-volume-map` / `--blob-alpha-map`，由 `.blob-glass::before` 和 `.blob-glass::after` 显示。

它不是 WebGL，不需要外部依赖；但视觉逻辑更接近 shader：ray direction、低频 fbm、sphere / torus 混合密度场、体积颜色累计、密度边缘自然消失。

## 文件结构

```txt
blob-glass-volume-ui/
├─ index.html          # 完整中文官网预览 demo
├─ blob-glass.css      # 独立组件 CSS
├─ blob-volume.js      # Canvas2D 体积贴图生成器，无 WebGL
├─ demo.css            # 仅 demo 背景与排版
└─ README.md           # 设计说明与参数说明
```

## 设计说明

### 1. 为什么不用纯 CSS radial-gradient/mask

纯 CSS 的 `radial-gradient` 和 mask 本质是 2D 平面叠色，很容易变成“柔和贴片”或“有机圆角卡片”。Shader Park 参考的体积感来自 ray direction、noise/fbm、sphere/torus 的三维混合，以及颜色沿射线从体积内部累计。因此这版把材质核心移到程序化体积贴图里。

### 2. 组件仍由 CSS 伪元素承载

`blob-volume.js` 只负责生成贴图，并设置：

```css
--blob-volume-map: url("data:image/png;base64,...");
--blob-alpha-map: url("data:image/png;base64,...");
```

CSS 中的 `.blob-glass::before` 使用这张图作为体积材质，同时用同一张图的 alpha 作为 mask，让 backdrop blur 只作用在 blob 密度范围内。`.blob-glass::after` 负责极轻微的低频高光/折射感。文字和交互内容始终在上层，保持清晰。

### 3. 边缘逻辑

边缘不是 1px 白边、不是描边、不是标准 border-radius，也不是单纯羽化。每个像素沿 z 方向采样多个 ellipsoid / torus 的密度，alpha 来自累计密度。密度不足的位置自然变薄并融入背景。

### 4. 导航栏如何避免变成胶囊

导航栏不会生成一个单一横向圆角条，而是按链接数量生成多个体积团：

- 每个中文链接附近有一个主 ellipsoid。
- 中间只有低密度 bridge 连接，避免视觉断裂。
- torus 权重很低，只给体积方向和内部空间感，不形成硬环。
- `--blob-bleed-y` 默认较大，让导航材质向上下外溢，不被压扁。

## 基础用法

```html
<link rel="stylesheet" href="./blob-glass.css">
<script src="./blob-volume.js" defer></script>

<nav class="blob-glass blob-glass--nav" aria-label="主导航">
  <a href="#method">方法</a>
  <a href="#scene">场景</a>
  <a href="#abroad">留学</a>
  <a href="#contact">联系</a>
</nav>

<article class="blob-glass blob-glass--card">
  <h2>古法失蜡琉璃卡片</h2>
  <p>内容文字在材质层之上，保持清晰。</p>
</article>

<button class="blob-glass blob-glass--button" type="button">
  开始咨询
</button>
```

## 组件类

```css
.blob-glass             /* 基础材质容器 */
.blob-glass--nav        /* 导航栏：多团体积横向合并 */
.blob-glass--card       /* 大卡片：有机体积外轮廓 */
.blob-glass--button     /* 小按钮：紧凑 blob/pill */
```

也可以显式指定形体：

```html
<div class="blob-glass" data-blob-shape="card">...</div>
<div class="blob-glass" data-blob-shape="nav">...</div>
<div class="blob-glass" data-blob-shape="button">...</div>
```

## 可调参数

所有参数都可以写在组件自身 style、局部 class 或全局主题里。

```css
.my-blob {
  --blob-density: .98;
  --blob-edge-softness: .48;
  --blob-backdrop-blur: 28px;
  --blob-bleed-x: 54px;
  --blob-bleed-y: 46px;
  --blob-map-scale: .68;
  --blob-steps: 38;
  --blob-grain: .12;
  --blob-bubble: .18;
  --blob-parallax: .46;
}
```

| 参数 | 默认用途 | 建议范围 |
|---|---|---|
| `--blob-density` | 体积密度/乳白厚度 | `.70` – `1.25` |
| `--blob-edge-softness` | 密度边缘变薄速度；越小边缘越收，越大越融 | `.35` – `.70` |
| `--blob-backdrop-blur` | 背景模糊与折射近似 | `12px` – `34px` |
| `--blob-bleed-x` / `--blob-bleed-y` | 材质相对内容框向外溢出 | `16px` – `70px` |
| `--blob-map-scale` | 体积贴图分辨率；越高越细但更耗时 | `.45` – `.95` |
| `--blob-steps` | raymarch 采样步数 | `24` – `44` |
| `--blob-grain` | 内部杂质/低频纹理强度 | `0` – `.22` |
| `--blob-bubble` | 极轻微气泡/密度空洞强度 | `0` – `.25` |
| `--blob-parallax` | ray direction 造成的深度偏移 | `.25` – `.70` |
| `--blob-highlight-opacity` | `::after` 低频高光层透明度 | `.25` – `.65` |

### 色彩参数

使用 RGB 三元组，方便配合 `rgb(var(--token) / alpha)`：

```css
.brand-blob {
  --blob-milk: 247 239 226;
  --blob-rose: 235 141 161;
  --blob-sage: 136 171 143;
  --blob-amber: 239 174 91;
  --blob-mauve: 173 145 174;
}
```

### 稳定随机种子

为了让同一个组件的体积形态稳定，可以加 `data-blob-seed`：

```html
<nav class="blob-glass blob-glass--nav" data-blob-seed="0.284">...</nav>
```

不设置时会根据组件文字、尺寸和类型生成 seed。生产环境建议显式设置 seed，避免内容变化导致 blob 形体变化。

## 性能说明

- 首次渲染时，每个组件会生成一张较小 PNG 贴图。
- 尺寸变化时会重新生成。
- `--blob-map-scale` 和 `--blob-steps` 是主要性能参数。
- 代码内置了像素上限与缓存，避免卡片过大时生成超大贴图。
- 不使用 WebGL，不引入 Shader Park runtime，也不依赖任何 CDN。

## 与普通 glassmorphism 的区别

这套组件故意避免：

- `1px solid rgba(255,255,255,...)` 白边框
- 标准 `border-radius: 999px` 胶囊外形
- 清晰 iOS Liquid Glass 控件高光
- 均匀 blur 的平面磨砂层
- 规则装饰点或固定噪声贴图

它追求的是：soft translucent blob、shader-like volume、lost-wax glass、milky translucent、organic edges、subtle refraction、no hard border。
