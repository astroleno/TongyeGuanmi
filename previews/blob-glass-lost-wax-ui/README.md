# soft blob glass / 古法失蜡琉璃 UI 材质组件

这是一套为中文品牌官网准备的可复用 HTML/CSS UI 材质组件，优先覆盖导航栏、卡片、按钮。它参考 Shader Park blob 的“软体体积”视觉，而不是普通 glassmorphism、iOS 胶囊玻璃控件或带 1px 白边框的玻璃卡片。

## 文件结构

```txt
blob-glass-lost-wax-ui/
├─ index.html          # 完整预览 demo
├─ blob-glass.css      # 独立组件 CSS，可直接复制到项目
├─ demo.css            # 仅用于 demo 页面布局与背景
└─ README.md           # 设计说明、用法与参数
```

## 设计说明

材质目标是“soft translucent blob / lost-wax glass / shader-like volume”：

- **形体不是标准圆角矩形**：组件的视觉边界来自多层径向 alpha mask，模拟多个柔软体积团叠加后的外轮廓。
- **边缘不是描边**：没有 `border`，也没有 1px 白边。边缘通过 mask 的透明度逐渐变薄，像材质密度在外缘消散。
- **内部是低频体积渐变**：乳白、淡粉、鼠尾草绿、浅琥珀、淡紫在 `::before` 内以大尺度 radial-gradient 混合，避免装饰性彩虹或小块噪点。
- **内容保持清晰**：所有材质层都在 `::before` / `::after`，文字与链接留在正常内容层。
- **克制的杂质与气泡**：`::after` 使用极低透明度的 SVG fractal noise 和少量不规则小径向光斑，避免规则圆点装饰。
- **深色/复杂背景支持**：通过 `backdrop-filter`、较高材质密度、内部体积阴影和 `.theme-dark` 参数，在复杂背景上仍保持乳白半透明质感。

## 最小用法

```html
<link rel="stylesheet" href="./blob-glass.css" />

<nav class="blob-glass blob-glass--nav" aria-label="主导航">
  <a href="#method">方法</a>
  <a href="#scene">场景</a>
  <a href="#abroad">留学</a>
  <a href="#contact">联系</a>
</nav>

<article class="blob-glass blob-glass--card">
  <h2>不是玻璃边框，是一团半透明体积</h2>
  <p>内容文字保持在清晰层，材质由伪元素生成。</p>
</article>

<button class="blob-glass blob-glass--button" type="button">预约沟通</button>
```

## 可调参数

所有参数都可以写在组件本身、父级主题或 modifier 上。

| 参数 | 作用 | 常用范围 |
| --- | --- | --- |
| `--blob-density` | 材质整体浓度/乳白覆盖感 | `.62`–`.92` |
| `--blob-blur` | 背景折射/模糊近似强度 | `14px`–`34px` |
| `--blob-edge-thin` | 边缘透明度，越低越薄 | `.36`–`.62` |
| `--blob-grain` | 杂质纹理可见度 | `.06`–`.22` |
| `--blob-bubble` | 气泡/微杂质强度 | `.18`–`.46` |
| `--blob-bleed-x` / `--blob-bleed-y` | 材质外溢范围，用于自然软边 | `8px`–`30px` |
| `--blob-radius` | mask fallback 与有机曲率 | 使用百分比复合圆角 |
| `--blob-mask` | 体积外轮廓，可替换为新的多层径向 mask | 高级自定义 |
| `--blob-milk` / `--blob-rose` / `--blob-sage` / `--blob-amber` / `--blob-lilac` | 内部渐变颜色通道 | `R G B` 格式 |
| `--blob-ink` | 内容文字颜色 | 任意 CSS color |
| `--blob-motion` | 内部低频漂移速度 | `14s`–`28s` |

### 示例：更浓的深色背景版本

```html
<section class="theme-dark">
  <a class="blob-glass blob-glass--button"
     style="--blob-density:.88; --blob-blur:30px; --blob-edge-thin:.56;">
    联系顾问
  </a>
</section>
```

### 示例：更接近参考截图的大体积卡片

```html
<article class="blob-glass blob-glass--card"
  style="--blob-density:.84; --blob-bleed-x:34px; --blob-bleed-y:30px; --blob-blur:32px;">
  ...
</article>
```

## 实现注意

- 不使用 WebGL / canvas；只使用 HTML、CSS、pseudo-elements、CSS mask、gradient、backdrop-filter。
- `backdrop-filter` 不支持时，会自动回退到更实的乳白渐变。
- 为了避免“普通 glassmorphism”，组件 CSS 内没有材质描边；focus 状态也使用柔光/下划线而不是硬边框。
- 若项目已有强制 `overflow: hidden` 的父容器，需要给组件四周留出空间，因为材质层通过 `--blob-bleed-x/y` 轻微外溢。
