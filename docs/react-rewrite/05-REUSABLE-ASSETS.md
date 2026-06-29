# 可复用资产清单

本清单基于当前 worktree：

```txt
/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/homepage-master-observer-runtime
```

## 评估总结

| 资产类型 | 复用策略 | 风险 |
| --- | --- | --- |
| 文案 HTML | 提取为 React content data | 低 |
| 图片/视频资源 | 直接复用路径和文件 | 低 |
| Ink WebGL | 包装现有 factory，不重写成 2D | 中 |
| Pattern bloom | 包装现有 stage/factory，先保视觉 | 中 |
| AOD/figure/ttg/ph/crane 组件 | 复用渲染和资产，剥离 handoff/scroll owner | 高 |
| Homepage runtime | 不复用，只参考问题边界 | 高 |
| Handoff receiver | 不复用 | 高 |
| Global reveal | timeline-owned copy 必须绕过 | 中 |

## 文案内容

实际位置：

```txt
src/sections/hero.html
src/sections/belief.html
src/sections/method.html
src/sections/brand.html
src/sections/services.html
src/sections/lab.html
src/sections/philosophy.html
src/sections/education.html
src/sections/contact.html
```

不是：

```txt
src/copy/homepage-reference.mjs
src/copy/homepage-belief.mjs
src/copy/homepage-method.mjs
```

React 迁移时应从 `src/sections/*.html` 或 `src/section-manifest.mjs` 提取 content data。

## 静态资源

### Pattern

```txt
assets/patterns/source/pattern-reference.png
assets/patterns/source/pattern-layer-02.png
assets/patterns/source/pattern-layer-03.png
assets/patterns/source/pattern-layer-04.png
assets/patterns/source/pattern-layer-05.png
assets/patterns/source/pattern-layer-06.png
assets/patterns/alpha-layers/pattern-layer-alpha-02.png
assets/patterns/alpha-layers/pattern-layer-alpha-03.png
assets/patterns/alpha-layers/pattern-layer-alpha-04.png
assets/patterns/alpha-layers/pattern-layer-alpha-05.png
assets/patterns/alpha-layers/pattern-layer-alpha-06.png
assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png
assets/patterns/exports/pattern-bloom-terminal-model.png
assets/patterns/exports/pattern-bloom-source-flower-no-stars.png
assets/patterns/exports/pattern-bloom-initial-no-stars.png
```

### AOD

```txt
assets/aod_figure-alpha-scrub.webm
assets/aod_figure-alpha-front-scrub.webm
assets/aod_figure-alpha-clean.webm
assets/aod_figure-alpha.png
assets/aod_figure.mp4
assets/aod_cloud-alpha.png
assets/aod_sun-alpha.png
assets/aod-paper-bg.png
```

### Figure2

```txt
assets/figure2a-alpha-auto.webm
assets/figure2b-alpha-auto.webm
assets/figure2a-alpha-scrub.webm
assets/figure2b-alpha-scrub.webm
assets/figure2-cloud-source.png
assets/figure2-front-color-source.png
assets/figure2-front-white-source.png
assets/figure2-middle-color-source.png
assets/figure2-middle-white-source.png
assets/figure2-middle-fresco-opaque-alpha.png
assets/figure2-far-arcade-window-alpha.png
assets/figure2-middle-window-mask.png
assets/arch2b-alpha.png
assets/arch2d-alpha.png
assets/arch2e-alpha.png
```

### Figure3 / TTG / PH / Crane

```txt
assets/figure3-alpha-scrub.webm
assets/figure3-alpha-poster.png
assets/ttg_figure-alpha-scrub.webm
assets/ttg_figure-alpha-scrub-reverse.webm
assets/ttg_figure-alpha-scrub-poster.png
assets/ttg_bg.png
assets/ttg_front-alpha.png
assets/ttg_middle-alpha.png
assets/ph_figure-alpha-scrub.webm
assets/ph_figure-alpha-poster.png
assets/ph_background.png
assets/ph_front-alpha.png
assets/ph_back.png
assets/ph_complete.jpg
assets/crane-figure1.mp4
assets/crane-figure1-transition.webm
assets/crane-figure2-transition.webm
assets/crane1_arch-alpha.png
assets/crane1_cloud1-alpha.png
assets/crane1_cloud2-alpha.png
```

注意：不要把不存在的 `figure3-alpha.webm`、`ph-alpha.webm` 写进新 manifest。

## 可包装代码入口

### Ink

实际位置：

```txt
js/effects/ink-scene-transition.js
js/effects/ink-scene-transition-root.js
js/effects/split-scene-ink-transition.js
```

策略：

- 优先包装现有 factory/WebGL 能力。
- 不假设存在 `renderInkFrame(ctx, progress)`。
- 不把 WebGL 墨滴重写成简化 2D 版本作为 Phase 1 前提。

### Pattern

实际位置：

```txt
js/pattern-mirror-stage.js
js/pattern-bloom.js
js/pattern-bloom-model.js
js/transitions/pattern-bloom-adapter.js
css/pattern-mirror-stage.css
css/pattern-bloom.css
```

策略：

- 先包装视觉 stage，保留已调好的视觉参数。
- 剥离 `pattern-bloom-adapter.js` 内的 scene ownership、pin、copy opacity 决策。
- `pattern-top` 和 `pattern-bottom` 的 scene identity 由 manifest 决定。

### AOD

实际位置：

```txt
js/components/aod-transition.js
js/transitions/homepage/aod-homepage-adapter.js
css/components/aod-transition.css
```

策略：

- 复用视觉层、素材加载、poster/首帧逻辑。
- 不复用 handoff receiver 和 target copy gate。
- AOD adapter 只报告 media progress/ended/rejected。

### Figure2

实际位置：

```txt
js/components/figure2-transition.js
js/transitions/homepage/figure2-homepage-adapter.js
docs/figure2-transition-component.md
css/figure2.css
```

策略：

- 保留 WebGL/canvas 渲染核心和资产映射。
- 把四段内部动作建模为 `figure2-compound-to-brand` steps。
- 不让 figure2 adapter 直接决定 brand commit。

### Figure3 / TTG / PH / Crane

实际位置：

```txt
js/components/figure3-transition.js
js/components/ttg-transition.js
js/components/ph-transition.js
js/components/crane-transition.js
js/transitions/homepage/figure3-homepage-adapter.js
js/transitions/homepage/ttg-homepage-adapter.js
js/transitions/homepage/ph-homepage-adapter.js
js/transitions/homepage/crane-homepage-adapter.js
```

策略：

- 渲染组件可参考。
- homepage adapter 中的 scroll/handoff/commit 逻辑不直接复用。
- TTG/PH 的出场墨滴要变成 compound segment step。

## 不复用的旧机制

```txt
js/transitions/homepage-transition-runtime.js
js/transitions/homepage/handoff-receiver.js
js/transitions/homepage/section-presentation-controller.js
js/ui/reveal.js 对 timeline-owned copy 的控制
```

原因：

- 它们正是多 owner 竞争的来源。
- handoff receiver 会移动真实 DOM，React 重写禁止这一点。
- section presentation 和 global reveal 会与 runtime commit 竞争。

## 从 baseline 借鉴的工程资产

参考 zip：

```txt
/Users/aitoshuu/Downloads/baseline-mobile-plan-code-only-20260629.zip
```

可借鉴：

```txt
hooks/openingSequenceConstants.ts
hooks/useOpeningSequenceProgress.ts
lib/viewport/getViewportHeightPx.ts
App.tsx 的顶层 composition
```

借鉴方式：

- 常量集中。
- 纯函数推导 progress/view model。
- viewport 使用 visualViewport/dvh 兼容。
- 顶层入口只编排，不承载 section 内部细节。

明确不借鉴：

- 容器里的视频播放流程。
- section 内 `setScrollPx` 作为主动画循环。
- section 组件通过 callback 推进全局 scene。

## 迁移顺序

1. 先建 manifest/types/reducer/debug overlay。
2. 再包装 ink/pattern/AOD 的视觉能力。
3. 最后接入 figure2/figure3/ttg/ph/crane。

不要先从视频或 canvas 组件开始。否则很容易重建旧系统的局部 owner。
