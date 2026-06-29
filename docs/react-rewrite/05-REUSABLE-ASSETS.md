# 可复用资产清单

## 评估总结

从当前项目中，约 **35% 可直接复用**，**20% 需要包装**，**45% 必须重写**。

| 资产类型 | 可复用性 | 估算工作量 |
|---------|---------|-----------|
| 文案内容 | 100% 直接复用 | 2 小时（提取 + 整理） |
| 静态资源（图片/视频） | 100% 直接复用 | 1 小时（复制到 public/） |
| Canvas 渲染逻辑 | 70% 包装复用 | 3-4 天（提取纯函数 + React hook 包装） |
| 视频播放逻辑 | 80% 包装复用 | 1 天（video API 封装） |
| 场景配置 | 50% 参考复用 | 2 天（manifest 转成 TypeScript constants） |
| Runtime orchestration | 0% 必须重写 | 5-7 天（状态机 + 滚动逻辑全新设计） |

---

## 1. 文案内容（100% 直接复用）

### 当前位置
```
src/copy/homepage-reference.mjs
src/copy/homepage-belief.mjs
src/copy/homepage-method.mjs
```

### 复用方式
直接提取到 React 项目的 `constants/content.ts`：

```typescript
// constants/content.ts
export const CONTENT = {
  hero: {
    title: "同野观幂",
    subtitle: "陪你让 AI 真落地",
    cta: "了解我们的方法"
  },
  belief: {
    title: "观点：没有运转，就没有落地",
    sections: [
      {
        heading: "度量世界",
        body: "..."
      },
      // ... 从 homepage-belief.mjs 提取
    ]
  },
  method: {
    title: "方法：场域 + 工具 + 现场",
    intro: "我们进现场、定章法、陪你跑。",
    sections: [
      // ... 从 homepage-method.mjs 提取
    ]
  },
  // ... 其他章节
};
```

**工作量**：2 小时  
**风险**：无（纯数据提取）

---

## 2. 静态资源（100% 直接复用）

### 图片资源
```
assets/pattern-bloom-lotus-layer-1.png
assets/pattern-bloom-lotus-layer-2.png
assets/pattern-bloom-lotus-layer-3.png
assets/figure2-cloud-source.png
assets/figure2-front-white-source.png
assets/figure2-front-color-source.png
assets/figure2-middle-fresco-opaque-alpha.png
assets/arch2d-alpha.png
```

### 视频资源
```
assets/aod_figure-alpha-scrub.webm (47MB)
assets/figure2a-alpha-auto.webm
assets/figure2b-alpha-auto.webm
assets/figure3-alpha.webm
assets/ttg_figure-alpha-scrub.webm
assets/crane-figure1.mp4
assets/ph-alpha.webm
```

### 复用方式
直接复制到 React 项目的 `public/assets/`：

```bash
cp -r /path/to/current-project/assets/* /path/to/react-project/public/assets/
```

**工作量**：1 小时  
**风险**：无  
**注意**：确保 `.gitignore` 排除大文件（47MB webm），使用 Git LFS 或 CDN

---

## 3. Canvas 渲染逻辑（70% 包装复用）

### 3.1 墨滴转场（ink-scene-transition.js）

**当前位置**：  
`js/components/ink-scene-transition.js` (1,200+ LOC)

**可复用部分**：
- 核心渲染函数：`renderInkFrame()` (lines 400-600)
- Perlin noise 生成：`generatePerlinNoise()` (lines 200-300)
- 边缘扩散算法：`applyEdgeBlur()` (lines 300-400)

**需要剥离的部分**：
- GSAP ScrollTrigger 绑定（lines 50-150）
- `applyScrollPosition()` 滚动 scrub 逻辑（lines 600-700）
- Scene texture 管理（与 DOM 耦合，lines 700-800）

**React 包装策略**：

```typescript
// lib/canvas/ink-renderer.ts (提取纯渲染逻辑)
export function renderInkFrame(
  ctx: CanvasRenderingContext2D,
  progress: number, // 0-1
  config: InkTransitionConfig
): void {
  // 从 ink-scene-transition.js 复制 renderInkFrame 核心逻辑
  // 去掉 ScrollTrigger 和 scene texture 依赖
  
  const noiseMap = generatePerlinNoise(ctx.canvas.width, ctx.canvas.height);
  const edgeBlurred = applyEdgeBlur(noiseMap, progress);
  
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  
  if (config.type === 'horizontal') {
    renderHorizontalInk(ctx, edgeBlurred, progress, config.direction);
  } else {
    renderRadialInk(ctx, edgeBlurred, progress, config.origin);
  }
}

// hooks/useInkTransition.ts (React hook 包装)
export function useInkTransition(
  canvasRef: RefObject<HTMLCanvasElement>,
  progress: number,
  config: InkTransitionConfig
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    renderInkFrame(ctx, progress, config);
  }, [progress, config]);
}
```

**工作量**：2-3 天  
**风险**：中等  
- Perlin noise 算法可能依赖特定库（需检查）
- 边缘扩散效果可能需要调整参数才能还原视觉

---

### 3.2 Pattern Bloom Lotus（pattern-bloom-visual.js）

**当前位置**：  
`js/components/pattern-bloom-visual.js` (800+ LOC)

**可复用部分**：
- Lotus 图层渲染：`renderLotusLayers()` (lines 300-400)
- 旋转动画：`applyRotation()` (lines 400-500)
- 多层合成：`compositeLayers()` (lines 500-600)

**需要剥离的部分**：
- GSAP timeline 编排（lines 100-200）
- ScrollTrigger 进度绑定（lines 50-100）

**React 包装策略**：

```typescript
// lib/canvas/pattern-renderer.ts
export function renderLotusFrame(
  ctx: CanvasRenderingContext2D,
  progress: number, // 0-1
  layers: HTMLImageElement[], // [layer1, layer2, layer3]
  config: { rotationAngle: number; scaleStart: number; scaleEnd: number }
): void {
  // 从 pattern-bloom-visual.js 复制 renderLotusLayers
  
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  
  const rotation = config.rotationAngle * progress;
  const scale = config.scaleStart + (config.scaleEnd - config.scaleStart) * progress;
  
  layers.forEach((layer, index) => {
    ctx.save();
    ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
    ctx.rotate(rotation + index * Math.PI / 6); // 每层旋转偏移
    ctx.scale(scale, scale);
    ctx.drawImage(layer, -layer.width / 2, -layer.height / 2);
    ctx.restore();
  });
}

// hooks/usePatternCanvas.ts
export function usePatternCanvas(
  canvasRef: RefObject<HTMLCanvasElement>,
  progress: number,
  layerImages: HTMLImageElement[]
) {
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    renderLotusFrame(ctx, progress, layerImages, {
      rotationAngle: Math.PI * 2, // 360° 旋转
      scaleStart: 0.5,
      scaleEnd: 1.5
    });
  }, [progress, layerImages]);
}
```

**工作量**：1-2 天  
**风险**：低  
- Lotus 渲染逻辑相对独立
- 图层素材已有，直接加载即可

---

### 3.3 Figure2 WebGL（figure2-transition.js）

**当前位置**：  
`js/components/figure2-transition.js` (1,300+ LOC)

**可复用部分**：
- WebGL 渲染核心：`renderWithGsap()` / `renderNative()` (lines 857-1100)
- Camera parallax 计算：`ARCH_LAYER_CAMERA` (lines 863-893)
- Ink transition 合成：`renderInkTransition()` (lines 845-855)

**需要剥离的部分**：
- `mountGsap()` / `mountNativeFallback()` ScrollTrigger 绑定（lines 1050-1150）
- `applyScrollPosition()` 滚动 scrub（lines 1110-1180）
- Video seeking 逻辑（lines 250-320）

**React 包装策略**：

```typescript
// lib/canvas/figure2-renderer.ts
export function renderFigure2Frame(
  ctx: CanvasRenderingContext2D | WebGLRenderingContext,
  introProgress: number, // camera-expand 进度 0-1
  transitionProgress: number, // ink-sweep 进度 0-1
  config: Figure2RenderConfig
): void {
  // 从 figure2-transition.js 复制 renderWithGsap 核心
  
  // Camera parallax
  const cameraX = lerp(config.cameraStartX, config.cameraEndX, introProgress);
  const cameraY = lerp(config.cameraStartY, config.cameraEndY, introProgress);
  const cameraScale = lerp(config.scaleStart, config.scaleEnd, introProgress);
  
  // 渲染 cloud layer
  ctx.drawImage(config.cloudLayer, cameraX * 0.5, cameraY * 0.5);
  
  // 渲染 far arcade
  ctx.drawImage(config.farArcade, cameraX * 0.8, cameraY * 0.8);
  
  // 渲染 near arch
  ctx.drawImage(config.nearArch, 0, 0);
  
  // Ink transition overlay
  if (transitionProgress > 0) {
    renderInkOverlay(ctx, transitionProgress);
  }
}

// hooks/useFigure2Renderer.ts
export function useFigure2Renderer(
  canvasRef: RefObject<HTMLCanvasElement>,
  introProgress: number,
  transitionProgress: number
) {
  const [config, setConfig] = useState<Figure2RenderConfig | null>(null);
  
  // 加载图层资源
  useEffect(() => {
    const loadLayers = async () => {
      const cloudLayer = await loadImage('/assets/figure2-cloud-source.png');
      const farArcade = await loadImage('/assets/figure2-front-white-source.png');
      const nearArch = await loadImage('/assets/arch2d-alpha.png');
      setConfig({ cloudLayer, farArcade, nearArch, /* ... */ });
    };
    loadLayers();
  }, []);
  
  useEffect(() => {
    if (!config) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    renderFigure2Frame(ctx, introProgress, transitionProgress, config);
  }, [introProgress, transitionProgress, config]);
}
```

**工作量**：3-4 天（最复杂）  
**风险**：高  
- WebGL 渲染逻辑复杂，可能有隐藏依赖
- Parallax 参数需要微调才能还原视觉效果
- Ink overlay 与主渲染的合成可能有性能问题

**Phase 1 策略**：不包含 figure2，Phase 2 再做

---

## 4. 视频播放逻辑（80% 包装复用）

### AOD Adapter（aod-scene-adapter.js）

**当前位置**：  
`js/runtime/scenes/aod-scene-adapter.js` (200 LOC)

**可复用部分**：
- `video.play()` / `video.ended` 事件监听（lines 80-120）
- Poster 管理（lines 50-60）
- Preload 策略（lines 40-50）

**不需要的部分**：
- `reduceMotion` fallback（React 版可以用 CSS `prefers-reduced-motion`）
- `getRecoveryHandler` recovery 机制（React 版用 Error Boundary）

**React 包装策略**：

已在 `03-ARCHITECTURE.md` 的 `useVideoPlayback` hook 中实现。

**工作量**：1 天  
**风险**：低  
- Video API 是标准 Web API，包装简单

---

## 5. 场景配置（50% 参考复用）

### Timeline Manifest（section-manifest.mjs）

**当前位置**：  
`src/section-manifest.mjs` (homepageTimeline.scenes, homepageTimeline.blocks)

**可复用结构**：
- Scene 定义：`id`, `kind` (reading/animation), `visual`
- Block 定义：`type` (ink-transition/media-animation), `snap`, `lock`

**需要重新设计的部分**：
- `homepageSceneDomMap` (DOM selector 映射) — React 不需要
- `ink.type` / `ink.direction` — 转成 TypeScript enum
- `reverse.strategy` — Phase 1 不实现 reverse

**React 转换**：

```typescript
// constants/scenes.ts
export const SCENES: SceneConfig[] = [
  {
    id: 'hero',
    type: 'reading',
    height: 100, // vh
  },
  {
    id: 'pattern-top',
    type: 'transition',
    height: 100,
    transition: {
      type: 'radial',
      origin: { x: 0.5, y: 0.5 }, // center
      duration: 1000
    }
  },
  {
    id: 'pattern-bottom',
    type: 'transition',
    height: 120,
    transition: {
      type: 'lotus-rotation',
      duration: 1200
    }
  },
  {
    id: 'aod-animation',
    type: 'animation',
    height: 100,
    media: {
      video: '/assets/aod_figure-alpha-scrub.webm',
      poster: '/assets/aod-poster.png'
    },
    transition: {
      type: 'horizontal',
      direction: 'bottom-up',
      duration: 800
    },
    textFadeIn: {
      atProgress: 0.8,
      targetScene: 'method-top'
    }
  },
  // ... 其他场景
];
```

**工作量**：2 天  
**风险**：低  
- 主要是数据结构转换 + TypeScript 类型定义

---

## 6. Runtime Orchestration（0% 必须重写）

### 当前 Runtime（homepage-snap-runtime.js + homepage-runtime-integration.js）

**总 LOC**：~1,500 行（FSM + 滚动控制 + adapter 注册 + charge 指示器 + recovery）

**为什么不能复用**：
- 整个 FSM 是为 adapter 机制设计的（SnapAligning → SnappedArmed → TriggeredPlayback → Playing → Completing）
- Charge 触发机制（wheel deltaY 积累）与新模型（滚动 10vh 固定距离）完全不同
- Lenis 滚动控制器绑定（`lenis.scrollTo` / `lenis.stop`）在 React 版用原生或更轻量的库
- Adapter 注册 / `scenePresenter.play()` 机制不存在于 React 版

**React 重写策略**：
全新设计，参考 Baseline 的 `useOpeningSequenceProgress` 模式 + 新的固定状态机（IDLE → ARMED → SNAP_LOCKING → PLAYING → PRESENTING → RELEASING）。

已在 `03-ARCHITECTURE.md` 的 `useSceneStateMachine` 中设计。

**工作量**：5-7 天（最大工作量）  
**风险**：高  
- 这是全新设计，可能遇到未预见的边界 case
- 滚动锁定 / 解锁时机需要精细调试
- 状态转换 bug 难以排查

---

## 复用优先级（Phase 1）

### P0（必须复用）
1. **文案内容**（2 小时）
2. **静态资源**（1 小时）
3. **墨滴 Canvas**（ink-scene-transition.js，2-3 天）
4. **Pattern Lotus Canvas**（pattern-bloom-visual.js，1-2 天）
5. **Video 播放**（aod-scene-adapter.js，1 天）

### P1（Phase 2 再复用）
6. **Figure2 WebGL**（figure2-transition.js，3-4 天）
7. **其他 animation adapter**（figure3/ttg/ph/crane，各 2-3 天）

### P2（可选）
8. **Charge 指示器视觉**（当前的底部进度条设计可以参考）
9. **Recovery UI**（当前的 error toast，React 版用 Error Boundary 替代）

---

## 不可复用 / 必须重写

### 1. 整个 Adapter 层
- `createPatternBloomSceneAdapter`
- `createAodSceneAdapter`
- `createFigure2SceneAdapter`
- `selectPlaybackAdapterScene`
- `scenePresenter.play({ direction })`

**原因**：React 组件直接管理自己的渲染和播放，不需要中间 adapter 层。

### 2. Snap Runtime FSM
- `homepage-snap-runtime.js` 的 8 种状态 + 多分支转换
- Charge 积累机制（`charge += Math.abs(deltaY)`）
- `resolveSceneTop` / `getCurrentSceneIndex` 滚动位置映射

**原因**：新状态机简化到 6 种固定状态，滚动触发改为 10vh 固定距离。

### 3. Lenis 集成
- `createScrollController` Lenis 实例管理
- `lenis.scrollTo({ lock: true })`
- `lenis.velocity` 检测快速滚动

**原因**：React 版用原生 `window.scrollTo` + `overflow: hidden` 锁定，或用更轻量的 smooth-scroll 库。

### 4. GSAP ScrollTrigger
- 所有 `ScrollTrigger.create()` 调用
- `scrollTrigger.scrub` 进度绑定
- `scrollTrigger.pin` 固定元素

**原因**：React 版转场是时间驱动（GSAP `to()` 驱动 progress 0→1），不用 ScrollTrigger。

---

## 工作量总结（Phase 1）

| 任务 | 工作量 | 风险 |
|------|--------|------|
| 文案 + 静态资源 | 3 小时 | 无 |
| 墨滴 Canvas 提取 | 2-3 天 | 中 |
| Pattern Lotus 提取 | 1-2 天 | 低 |
| Video 播放封装 | 1 天 | 低 |
| 场景配置转换 | 2 天 | 低 |
| 状态机重写 | 5-7 天 | 高 |
| **总计** | **11-15 天** | **中-高** |

扣除复用节省的时间（~4 天），净工作量约 **7-11 天**，与 `04-PHASE1-EXPERIMENT.md` 的估算一致。

## 下一步

阅读 `06-TESTING-STRATEGY.md` 了解完整的测试策略，确保复用的资产在 React 版中行为一致。
