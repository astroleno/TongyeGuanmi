# Phase 1 实验迁移计划（hero → method）

## 目标

验证 React 重写的可行性，完成第一条完整链路：hero → pattern-bloom → belief-star → aod → method。

**成功标准：**
- 视觉还原度 ≥ 80%（关键转场效果接近当前项目）
- 性能 ≥ 60fps（滚动 + Canvas 渲染流畅）
- 代码清晰度提升（新人可以理解进度派生逻辑）
- 工作量可控（7-11 天完成）

**如果失败：**
- 视觉还原度 < 60% → 重新评估 Canvas 复用策略
- 性能 < 45fps → 考虑降低转场复杂度或回退到 vanilla JS
- 工作量 > 3 周 → 放弃 React 重写，继续 adapter 路径

## 包含场景

1. **hero** (reading) — 100vh
2. **pattern-top** (transition) — 墨滴中心扩散，lotus 上半
3. **pattern-bottom** (transition) — lotus 左侧旋转扩散
4. **aod-animation** (animation) — 视频播放 ~5s
5. **method-top** (reading) — 80% 文案提前入场
6. **method-bottom** (reading) — 自由滚动

## 转场清单

| 从 | 到 | 转场类型 | 时长 | 复用资产 |
|---|---|---------|------|---------|
| hero | pattern-top | 墨滴中心扩散 | 1000ms | `ink-scene-transition.js` radial |
| pattern-top | pattern-bottom | lotus 左侧旋转扩散 | 1200ms | `pattern-bloom-visual.js` |
| pattern-bottom | aod | 下到上水平墨滴 | 800ms | `ink-scene-transition.js` horizontal |
| aod (80%) | method-top | 文案淡入 | 1000ms | CSS opacity transition |

## 工作分解

### Week 1: 基础设施 + Hero + Pattern

#### Day 1-2: 脚手架搭建
**任务：**
- [ ] 初始化 Vite + React + TypeScript 项目
- [ ] 配置 ESLint, Prettier, Vitest
- [ ] 创建基础目录结构（components/hooks/lib/constants）
- [ ] 从当前项目复制静态资源（images/videos）到 `public/assets/`
- [ ] 从 `src/copy/homepage-reference.mjs` 提取文案到 `constants/content.ts`

**产出：**
```
tongye-guanmi-react/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── App.tsx (空壳)
│   ├── constants/
│   │   ├── scenes.ts
│   │   ├── transitions.ts
│   │   └── content.ts (从 homepage-reference.mjs 提取)
│   └── styles/
│       └── global.css
└── public/
    └── assets/
        ├── pattern-bloom-lotus-layer-*.png
        ├── aod_figure-alpha-scrub.webm
        └── aod-poster.png
```

**验收：**
- `npm run dev` 启动开发服务器，显示空白页面
- `npm run test` 运行 Vitest，0 tests
- `constants/content.ts` 包含 hero 文案

---

#### Day 3-4: Hero Scene + 状态机核心
**任务：**
- [ ] 实现 `useSceneStateMachine` hook（IDLE / ARMED / SNAP_LOCKING / PLAYING / PRESENTING / RELEASING）
- [ ] 实现 `useScrollProgress` hook（heroFade 进度派生）
- [ ] 实现 `Hero.tsx` 组件（品牌标语 + CTA）
- [ ] Hero scroll-driven fade 效果（`opacity: 1 → 0` 在 0-100vh）

**产出：**
```typescript
// hooks/useSceneStateMachine.ts
export function useSceneStateMachine(scenes, initialScene) {
  const [state, setState] = useState('IDLE');
  const [currentScene, setCurrentScene] = useState(initialScene);
  // 滚动监听 IDLE → ARMED
  // ARMED 监听 → SNAP_LOCKING → PLAYING → PRESENTING
  return { state, currentScene, startTransition, playAnimation };
}

// hooks/useScrollProgress.ts
export function useScrollProgress(scrollPx) {
  return useMemo(() => ({
    heroFade: 1 - clamp(scrollPx / vh, 0, 1),
    // ... 其他进度
  }), [scrollPx]);
}

// components/scenes/Hero.tsx
export function Hero({ active }) {
  const [scrollPx, setScrollPx] = useState(0);
  const { heroFade } = useScrollProgress(scrollPx);
  
  useEffect(() => {
    const handleScroll = () => setScrollPx(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  return (
    <section className="hero" style={{ opacity: heroFade }}>
      <h1>{CONTENT.hero.title}</h1>
      <button>{CONTENT.hero.cta}</button>
    </section>
  );
}
```

**验收：**
- 滚动 hero，标语淡出（opacity 1 → 0）
- Console 打印状态机日志：`[FSM] IDLE → ARMED` 当接近底部
- `useScrollProgress.test.ts` 单测通过（heroFade 0vh=1, 100vh=0）

---

#### Day 5-7: Pattern Transition (Canvas 复用)
**任务：**
- [ ] 从 `js/components/ink-scene-transition.js` 提取纯渲染逻辑到 `lib/canvas/ink-renderer.ts`
- [ ] 从 `js/components/pattern-bloom-visual.js` 提取 lotus 渲染到 `lib/canvas/pattern-renderer.ts`
- [ ] 实现 `useInkTransition` hook（时间驱动 Canvas 渲染）
- [ ] 实现 `usePatternCanvas` hook（lotus 旋转扩散）
- [ ] 实现 `InkTransition.tsx` 组件（GSAP 驱动 progress 0→1）
- [ ] 实现 `PatternTransition.tsx` 组件（编排 pattern-top + pattern-bottom）

**产出：**
```typescript
// lib/canvas/ink-renderer.ts (从 ink-scene-transition.js 提取)
export function renderInkFrame(
  ctx: CanvasRenderingContext2D,
  progress: number,
  config: { type: 'horizontal' | 'radial'; direction?: string; origin?: Point }
) {
  // 复用当前项目的墨滴渲染逻辑
  // 绘制 perlin noise + 边缘扩散
}

// lib/canvas/pattern-renderer.ts (从 pattern-bloom-visual.js 提取)
export function renderLotusFrame(
  ctx: CanvasRenderingContext2D,
  progress: number,
  layers: HTMLImageElement[]
) {
  // lotus 图案多层渲染 + 旋转动画
}

// hooks/useInkTransition.ts
export function useInkTransition(canvasRef, progress, config) {
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    renderInkFrame(ctx, progress, config);
  }, [progress, config]);
}

// components/transitions/InkTransition.tsx
export function InkTransition({ type, direction, duration, onComplete }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    gsap.to({ value: 0 }, {
      value: 1,
      duration: duration / 1000,
      onUpdate: function() { setProgress(this.targets()[0].value); },
      onComplete
    });
  }, [duration, onComplete]);
  
  useInkTransition(canvasRef, progress, { type, direction });
  
  return <canvas ref={canvasRef} className="ink-canvas" />;
}

// components/scenes/PatternTransition.tsx
export function PatternTransition({ state }) {
  const [stage, setStage] = useState<'top' | 'bottom' | 'complete'>('top');
  
  // state === 'PLAYING' 时触发转场
  useEffect(() => {
    if (state === 'PLAYING' && stage === 'top') {
      // 播放中心扩散墨滴
      playInkTransition('radial', 'center', 1000, () => {
        setStage('bottom');
      });
    } else if (state === 'PLAYING' && stage === 'bottom') {
      // 播放 lotus 旋转扩散
      playLotusTransition(1200, () => {
        setStage('complete');
      });
    }
  }, [state, stage]);
  
  return (
    <>
      {stage === 'top' && <InkTransition type="radial" origin="center" duration={1000} />}
      {stage === 'bottom' && <PatternLotusCanvas duration={1200} />}
    </>
  );
}
```

**验收：**
- Hero 滚动到底部 → 状态机进入 ARMED → 继续滚动触发 SNAP_LOCKING
- PLAYING 状态播放墨滴中心扩散（1000ms，Canvas 渲染 perlin noise）
- 墨滴完成后播放 lotus 旋转扩散（1200ms，Canvas 渲染 lotus 图案）
- 60fps 渲染，无明显卡顿
- Canvas 渲染逻辑单测通过（fake canvas context）

---

### Week 2: AOD Animation + Method

#### Day 8-9: AOD Animation Scene
**任务：**
- [ ] 实现 `useVideoPlayback` hook（video.play/ended 封装）
- [ ] 实现 `AodAnimation.tsx` 组件
- [ ] Pattern → AOD 下到上水平墨滴转场
- [ ] AOD video 播放（不 scrub）
- [ ] 80% 时触发 method 文案淡入

**产出：**
```typescript
// hooks/useVideoPlayback.ts
export function useVideoPlayback(videoRef) {
  const [state, setState] = useState({ isPlaying: false, progress: 0, hasEnded: false });
  
  const play = useCallback(async () => {
    await videoRef.current?.play();
    setState(prev => ({ ...prev, isPlaying: true }));
  }, [videoRef]);
  
  const onTimeUpdate = useCallback((callback) => {
    // 注册 timeupdate 回调
  }, []);
  
  const onEnded = useCallback((callback) => {
    // 注册 ended 回调
  }, []);
  
  return [state, { play, onTimeUpdate, onEnded }];
}

// components/scenes/AodAnimation.tsx
export function AodAnimation({ state, onAnimationEnd, onTextFadeStart }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoState, videoControls] = useVideoPlayback(videoRef);
  
  // RELEASING 时播放视频
  useEffect(() => {
    if (state === 'RELEASING') {
      videoControls.play();
    }
  }, [state]);
  
  // 80% 时触发文案淡入
  useEffect(() => {
    videoControls.onTimeUpdate((progress) => {
      if (progress > 0.8) {
        onTextFadeStart();
      }
    });
  }, [videoControls, onTextFadeStart]);
  
  // 播放完成
  useEffect(() => {
    videoControls.onEnded(() => {
      onAnimationEnd();
    });
  }, [videoControls, onAnimationEnd]);
  
  return (
    <section className="aod-animation">
      <video
        ref={videoRef}
        src="/assets/aod_figure-alpha-scrub.webm"
        poster="/assets/aod-poster.png"
        muted
        playsInline
        preload="auto"
      />
    </section>
  );
}
```

**验收：**
- Pattern 转场完成后，AOD 场景显示 poster
- 滚动 10vh 触发 RELEASING，video.play() 启动播放
- Video 播放到 80% 时，method 文案开始淡入（`opacity: 0 → 1`, 1s）
- Video 播放到 100% 时，`onAnimationEnd` 触发，进入 method IDLE
- Console 0 error，video 不 scrub（currentTime 不被手动设置）

---

#### Day 10-11: Method Section + 整合测试
**任务：**
- [ ] 实现 `MethodSection.tsx`（method-top + method-bottom）
- [ ] Method 文案淡入动画（CSS transition）
- [ ] 整合 App.tsx，编排 hero → pattern → aod → method 完整链路
- [ ] E2E 测试：完整滚动一遍，验证所有状态转换
- [ ] 性能测试：Chrome DevTools Performance profile，确保 60fps

**产出：**
```typescript
// components/scenes/MethodSection.tsx
export function MethodSection({ active, textVisible }) {
  return (
    <section
      className="method-section"
      style={{
        opacity: textVisible ? 1 : 0,
        transition: 'opacity 1s ease-in-out'
      }}
    >
      <div className="method-top">
        <h2>{CONTENT.method.title}</h2>
        <p>{CONTENT.method.intro}</p>
      </div>
      <div className="method-bottom">
        <p>{CONTENT.method.details}</p>
      </div>
    </section>
  );
}

// App.tsx (完整编排)
export default function App() {
  const { state, currentScene } = useSceneStateMachine(SCENES);
  const [methodTextVisible, setMethodTextVisible] = useState(false);
  
  return (
    <div className="app">
      <Hero active={currentScene === 0} />
      <PatternTransition active={currentScene === 1 || currentScene === 2} state={state} />
      <AodAnimation
        active={currentScene === 3}
        state={state}
        onAnimationEnd={() => {/* 进入 method IDLE */}}
        onTextFadeStart={() => setMethodTextVisible(true)}
      />
      <MethodSection active={currentScene >= 4} textVisible={methodTextVisible} />
    </div>
  );
}
```

**验收：**
- 完整链路测试：
  1. Hero 滚动淡出 → ARMED
  2. 继续滚动 → SNAP_LOCKING → PLAYING (墨滴中心扩散) → PRESENTING
  3. Pattern lotus 旋转扩散 → AOD 入场墨滴
  4. AOD poster 显示 → 滚动 10vh → RELEASING (video.play)
  5. Video 播放到 80% → method 文案淡入
  6. Video ended → method IDLE，自由滚动
- Chrome DevTools Performance:
  - Scripting: < 30% CPU
  - Rendering: < 40% CPU
  - FPS 稳定在 55-60fps
- Lighthouse Performance Score: ≥ 85

---

## 测试策略（Phase 1）

### 1. 单元测试（Vitest + JSDOM）

**纯函数测试：**
```typescript
// hooks/useScrollProgress.test.ts
describe('useScrollProgress', () => {
  it('heroFade: 0vh → 1, 100vh → 0', () => {
    // 测试进度计算公式
  });
  
  it('patternTopProgress: 100vh → 0, 200vh → 1', () => {
    // 测试 pattern-top 入场进度
  });
});
```

**Hook 测试：**
```typescript
// hooks/useVideoPlayback.test.ts
describe('useVideoPlayback', () => {
  it('play() 启动视频播放', async () => {
    const mockVideo = { play: jest.fn().mockResolvedValue(undefined) };
    const videoRef = { current: mockVideo };
    const [, { play }] = renderHook(() => useVideoPlayback(videoRef)).result.current;
    await play();
    expect(mockVideo.play).toHaveBeenCalled();
  });
});
```

### 2. 组件测试（React Testing Library）

```typescript
// components/scenes/Hero.test.tsx
describe('Hero', () => {
  it('renders title and CTA', () => {
    const { getByText } = render(<Hero active={true} />);
    expect(getByText(CONTENT.hero.title)).toBeInTheDocument();
  });
  
  it('fades out on scroll', () => {
    const { container } = render(<Hero active={true} />);
    const hero = container.querySelector('.hero');
    
    // 模拟滚动
    act(() => {
      window.scrollY = 500;
      window.dispatchEvent(new Event('scroll'));
    });
    
    expect(hero).toHaveStyle({ opacity: '0.5' }); // 50vh → 50% opacity
  });
});
```

### 3. 集成测试（Playwright）

```typescript
// e2e/hero-to-method.spec.ts
import { test, expect } from '@playwright/test';

test('complete flow: hero → pattern → aod → method', async ({ page }) => {
  await page.goto('http://localhost:5173');
  
  // 1. Hero fade
  const hero = page.locator('.hero');
  await expect(hero).toBeVisible();
  await page.evaluate(() => window.scrollBy(0, 500));
  await expect(hero).toHaveCSS('opacity', /0\.\d+/);
  
  // 2. Pattern transition triggered
  await page.evaluate(() => window.scrollBy(0, 600));
  const inkCanvas = page.locator('.ink-canvas');
  await expect(inkCanvas).toBeVisible();
  await page.waitForTimeout(2200); // 1000ms + 1200ms
  
  // 3. AOD video plays
  const aodVideo = page.locator('video[src*="aod"]');
  await expect(aodVideo).toBeVisible();
  await page.evaluate(() => window.scrollBy(0, 100)); // 触发 10vh
  await expect(aodVideo).toHaveJSProperty('paused', false);
  
  // 4. Method text fades in at 80%
  await page.waitForTimeout(4000); // 80% of 5s
  const methodSection = page.locator('.method-section');
  await expect(methodSection).toHaveCSS('opacity', '1');
  
  // 5. Video ends, method scrollable
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollBy(0, 200));
  // 应该能自由滚动，无锁定
});
```

### 4. 性能测试（Chrome DevTools Protocol）

```typescript
// e2e/performance.spec.ts
test('60fps during transitions', async ({ page }) => {
  await page.goto('http://localhost:5173');
  
  // 开始 Performance trace
  await page.evaluate(() => {
    (window as any).performance.mark('start');
  });
  
  // 滚动触发转场
  await page.evaluate(() => window.scrollBy(0, 1100));
  await page.waitForTimeout(3000); // pattern 转场
  
  await page.evaluate(() => {
    (window as any).performance.mark('end');
    (window as any).performance.measure('transition', 'start', 'end');
  });
  
  const metrics = await page.evaluate(() => {
    const measure = performance.getEntriesByName('transition')[0];
    return { duration: measure.duration };
  });
  
  // 期望转场时间 < 3.5s (理论 3.2s，留 buffer)
  expect(metrics.duration).toBeLessThan(3500);
});
```

## 风险与应对

### 风险 1: Canvas 渲染性能不达标
**症状**：墨滴转场掉帧，FPS < 45  
**应对**：
- 降低 Canvas 分辨率（`scale(0.5)` 渲染后放大）
- 使用 OffscreenCanvas + Web Worker
- 简化 perlin noise 计算（减少采样点）
- 最坏情况：用 CSS clip-path 替代 Canvas

### 风险 2: 视频播放卡顿
**症状**：AOD video 播放时 FPS 下降  
**应对**：
- 使用更小的视频文件（降低码率或分辨率）
- 确保 `preload="auto"` 生效
- 检查视频格式是否硬件加速（WebM VP9）
- 最坏情况：用 poster + fade in 替代视频

### 风险 3: 状态机逻辑复杂度高
**症状**：状态转换 bug，滚动卡住  
**应对**：
- 添加状态机日志（每次转换打印）
- 单测覆盖所有状态转换路径
- 添加"escape hatch"（Esc 键强制回到 IDLE）
- 最坏情况：简化状态机（合并 SNAP_LOCKING 和 PLAYING）

### 风险 4: 文案提前入场时机不对
**症状**：method 文案太早/太晚淡入  
**应对**：
- 调整触发阈值（80% → 75% 或 85%）
- 添加手动调试工具（slider 控制触发时机）
- 最坏情况：放弃 80% 规则，视频结束后再淡入

## 成功标准（重申）

### 必须达成（P0）
- [ ] Hero 滚动淡出流畅（60fps）
- [ ] Pattern 墨滴转场视觉还原度 ≥ 80%
- [ ] AOD 视频播放不 scrub，不卡顿
- [ ] Method 文案 80% 淡入时机准确
- [ ] 完整链路无 Console error

### 期望达成（P1）
- [ ] 单测覆盖率 ≥ 70%（纯函数 + hook）
- [ ] Lighthouse Performance ≥ 85
- [ ] 代码可读性：新人能看懂 `useScrollProgress` 和状态机

### 可选（P2）
- [ ] Playwright E2E 自动化
- [ ] Performance trace 分析报告
- [ ] Canvas offscreen rendering 优化

## 验收流程

1. **自验**：开发完成后，自己滚动一遍完整链路，记录问题
2. **单测**：`npm run test` 全绿
3. **E2E**：`npm run test:e2e` 全绿（如果有）
4. **性能**：Chrome DevTools Performance profile，FPS ≥ 55
5. **提交给用户**：录屏演示 + 性能数据 + 已知问题清单
6. **用户验收**：真机测试（iOS/Android/Desktop），确认视觉效果和流畅度

## 下一步

如果 Phase 1 通过验收，阅读 `05-REUSABLE-ASSETS.md` 了解当前项目哪些资产可以在 Phase 2 全量迁移中复用。
