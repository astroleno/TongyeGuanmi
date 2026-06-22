# Figure 2 Transition Component

这个组件接入版用于验证 `createTransitionRoute()` 生命周期，不替换当前 `/figure2`。

## Standalone Route

独立页面：

- HTML：`figure2-transition-route.html`
- Route JS：`js/figure2-transition-route.js`
- 视觉组件：`js/components/figure2-transition.js`

这版让 shared transition runtime 负责：

- GSAP / ScrollTrigger / Lenis 加载
- reduced-motion 分支
- pagehide cleanup
- route-level ScrollTrigger refresh

Figure 2 组件只负责：

- 当前 Figure2 分层 DOM 的视觉进度
- 人物视频准备、正放和倒放 seek fallback
- 近景 / 中景 / 远景推进参数
- 墨滴转场与人物 mask
- native fallback 事件和 ticker 清理

## Contract Notes

`figure2-transition-route.html` 复用当前 `css/figure2.css` 和现有素材层级。入口 section 同时声明：

```html
data-figure2-transition
data-figure2-route-stage
data-figure2-scroll-vh="350"
data-figure2-duration="2.4"
data-figure2-scene-duration="1.28"
data-figure2-scene-range-vh="100"
data-figure2-video-segment="5"
```

参数仍然保留在 Figure2 本地，不进入 shared runtime。

## Not Homepage Adapter

这还不是首页 `chapter-transition` adapter。首页接入仍需要单独定义：

- placeholder mount host
- chapter progress source
- failure isolation
- asset lazy-load
- adapter cleanup

当前文件只验证 standalone route-entry 组件化。
