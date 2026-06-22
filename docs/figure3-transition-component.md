# Figure 3 Transition Component

这个组件只负责 Figure 3 转场本身，不会自动接入首页。

## 引入样式

在需要使用的页面样式里引入：

```css
@import url("./components/figure3-transition.css");
```

如果是在 `css/styles.css` 里引入，路径也是上面这一行。

## HTML

```html
<section
  class="figure3-transition"
  data-figure3-transition
  data-figure3-duration="2"
  data-figure3-scroll-vh="20"
  aria-label="Figure 3 fabric transition"
>
  <div class="figure3-transition__sticky">
    <div class="figure3-transition__backdrop" aria-hidden="true"></div>

    <div class="figure3-transition__stage" aria-hidden="true">
      <video
        class="figure3-transition__video"
        data-figure3-alpha-video
        src="assets/figure3-alpha-scrub.webm"
        poster="assets/figure3-alpha-poster.png"
        muted
        preload="auto"
        playsinline
        webkit-playsinline
      ></video>
      <div class="figure3-transition__fill" data-figure3-fill aria-hidden="true"></div>
    </div>
  </div>
</section>
```

## JS

如果页面已经加载了 GSAP 和 ScrollTrigger：

```js
import { mountFigure3Transitions } from './components/figure3-transition.js';

mountFigure3Transitions({
  loadLibraries: false,
  gsap: window.gsap,
  ScrollTrigger: window.ScrollTrigger
});
```

如果页面还没加载动画库，可以让组件自己加载项目本地 vendor 版本：

```js
import { mountFigure3Transitions } from './components/figure3-transition.js';

mountFigure3Transitions();
```

组件默认参数：

- `data-figure3-duration="2"`：滚动目标变化后，动画用 2 秒追到目标。
- `data-figure3-scroll-vh="20"`：20vh 的滚动距离对应完整转场。
- 向下滚正向 seek，向上滚反向 seek。

## Standalone route-entry 接入版

`/figure3-transition-route` 是按 `createTransitionRoute()` contract 新起的独立接入版本：

- HTML：`figure3-transition-route.html`
- Route JS：`js/figure3-transition-route.js`
- 视觉组件：`js/components/figure3-transition.js`

这版让 shared route runtime 负责 library loading、Lenis 初始化、reduced-motion 分支和 `pagehide` cleanup；Figure 3 组件只保留自己的视觉进度、视频 seek、replay 和 ScrollTrigger 绑定。
