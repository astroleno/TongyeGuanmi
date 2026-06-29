# React 技术架构设计

## 技术栈

```json
{
  "name": "tongye-guanmi-react",
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "framer-motion": "^12.23.24",
    "gsap": "^3.14.2",
    "typescript": "~5.8.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "vite": "^6.2.0",
    "vitest": "^4.1.2",
    "jsdom": "^29.0.1",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

**为什么不用 @react-three/fiber？**
- Phase 1 不需要 WebGL（只有 canvas 2D ink + pattern lotus）
- figure2 的 WebGL 可以包装成 vanilla canvas ref hook
- 避免引入 Three.js 依赖增加包体积（~600KB）

**为什么保留 GSAP？**
- 时间驱动的缓动函数（`gsap.to()` 比手写 rAF 更简洁）
- 现有 canvas 渲染逻辑已用 GSAP quickSetter（可复用）
- 不用 ScrollTrigger（这是被替换的部分）

## 项目结构

```
src/
├── App.tsx                    # 主入口，场景编排
├── components/
│   ├── scenes/
│   │   ├── Hero.tsx           # hero reading scene
│   │   ├── PatternTransition.tsx  # pattern-top + pattern-bottom
│   │   ├── AodAnimation.tsx   # aod-animation scene
│   │   ├── MethodSection.tsx  # method-top + method-bottom
│   │   ├── Figure2Animation.tsx   # figure2 (Phase 2)
│   │   └── ... (其他场景)
│   ├── transitions/
│   │   ├── InkTransition.tsx  # 墨滴转场组件（复用 ink-scene-transition.js）
│   │   └── PatternLotus.tsx   # lotus 旋转扩散（复用 pattern-bloom-visual.js）
│   └── ui/
│       ├── ChargeIndicator.tsx    # 滚动 10vh 进度指示器
│       └── VideoPlayer.tsx        # 封装 video 播放逻辑
├── hooks/
│   ├── useSceneStateMachine.ts    # 核心状态机 hook
│   ├── useScrollProgress.ts       # 滚动进度派生（纯函数）
│   ├── useInkTransition.ts        # 墨滴 canvas 渲染
│   ├── usePatternCanvas.ts        # pattern lotus canvas
│   ├── useFigure2Sequence.ts      # figure2 四子阶段编排 (Phase 2)
│   └── useVideoPlayback.ts        # video.play/ended 封装
├── lib/
│   ├── canvas/
│   │   ├── ink-renderer.ts        # 从 ink-scene-transition.js 提取的纯渲染
│   │   ├── pattern-renderer.ts    # 从 pattern-bloom-visual.js 提取
│   │   └── figure2-renderer.ts    # 从 figure2-transition.js 提取 (Phase 2)
│   └── utils/
│       ├── scroll.ts              # 滚动工具函数（clamp, getViewportHeight）
│       └── easing.ts              # 缓动函数（复用或自定义）
├── constants/
│   ├── scenes.ts                  # 场景定义（19 个场景的 id/type/height）
│   ├── transitions.ts             # 转场配置（类型/时长/方向）
│   └── content.ts                 # 从 src/copy/*.mjs 提取的文案
├── types/
│   └── index.ts                   # TypeScript 类型定义
└── styles/
    └── global.css                 # 全局样式
```

## 核心 Hook 设计

### 1. useSceneStateMachine (状态机核心)

```typescript
// hooks/useSceneStateMachine.ts
import { useState, useEffect, useCallback } from 'react';

export type SceneState = 
  | 'IDLE'
  | 'ARMED'
  | 'SNAP_LOCKING'
  | 'PLAYING'
  | 'PRESENTING'
  | 'RELEASING';

export interface SceneStateMachine {
  state: SceneState;
  currentScene: number;
  transitionTo: (nextState: SceneState) => void;
  startTransition: (toScene: number) => Promise<void>;
  playAnimation: () => Promise<void>;
}

export function useSceneStateMachine(
  scenes: SceneConfig[],
  initialScene: number = 0
): SceneStateMachine {
  const [state, setState] = useState<SceneState>('IDLE');
  const [currentScene, setCurrentScene] = useState(initialScene);

  const transitionTo = useCallback((nextState: SceneState) => {
    console.log(`[FSM] ${state} → ${nextState}`);
    setState(nextState);
  }, [state]);

  const startTransition = useCallback(async (toScene: number) => {
    if (toScene < 0 || toScene >= scenes.length) return;
    
    // SNAP_LOCKING: 对齐到目标场景
    transitionTo('SNAP_LOCKING');
    await scrollToScene(toScene, { duration: 100, lock: true });
    
    // PLAYING: 墨滴转场
    transitionTo('PLAYING');
    const transitionDuration = scenes[toScene].transition?.duration || 800;
    await playInkTransition(scenes[currentScene], scenes[toScene], transitionDuration);
    
    // PRESENTING: 首帧呈现
    transitionTo('PRESENTING');
    setCurrentScene(toScene);
    
    // 如果是 reading scene，直接进入 RELEASING
    if (scenes[toScene].type === 'reading') {
      transitionTo('RELEASING');
      // 解锁滚动
      unlockScroll();
      // 等待用户滚动到下一场景
      // （由 useEffect 监听 scroll 处理）
    }
  }, [scenes, currentScene, transitionTo]);

  const playAnimation = useCallback(async () => {
    if (scenes[currentScene].type !== 'animation') return;
    
    transitionTo('RELEASING');
    // 播放动画逻辑在各自的 Animation 组件内部
    // 这里只负责状态转换
  }, [currentScene, scenes, transitionTo]);

  // 滚动监听：检测 ARMED 触发
  useEffect(() => {
    if (state !== 'IDLE') return;
    
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const nextSceneIndex = currentScene + 1;
      if (nextSceneIndex >= scenes.length) return;
      
      const nextSceneTop = getSceneTop(scenes, nextSceneIndex);
      const viewportHeight = window.innerHeight;
      
      // 滚动到距离下一场景 10vh 时 ARMED
      if (scrollY > nextSceneTop - viewportHeight * 0.1) {
        transitionTo('ARMED');
      }
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [state, currentScene, scenes, transitionTo]);

  // ARMED 监听：继续滚动触发转场
  useEffect(() => {
    if (state !== 'ARMED') return;
    
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const nextSceneIndex = currentScene + 1;
      const nextSceneTop = getSceneTop(scenes, nextSceneIndex);
      
      if (scrollY > nextSceneTop) {
        // 触发转场
        startTransition(nextSceneIndex);
      } else if (scrollY < getSceneTop(scenes, currentScene) + window.innerHeight * 0.5) {
        // 滚回去了，取消 ARMED
        transitionTo('IDLE');
      }
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [state, currentScene, scenes, startTransition, transitionTo]);

  // PRESENTING 监听：滚动 10vh 触发动画播放
  useEffect(() => {
    if (state !== 'PRESENTING' || scenes[currentScene].type !== 'animation') return;
    
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const currentSceneTop = getSceneTop(scenes, currentScene);
      const scrolledVh = (scrollY - currentSceneTop) / window.innerHeight * 100;
      
      if (scrolledVh > 10) {
        playAnimation();
      }
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [state, currentScene, scenes, playAnimation]);

  return {
    state,
    currentScene,
    transitionTo,
    startTransition,
    playAnimation
  };
}

// 辅助函数
function getSceneTop(scenes: SceneConfig[], index: number): number {
  let top = 0;
  for (let i = 0; i < index; i++) {
    top += scenes[i].height * window.innerHeight / 100;
  }
  return top;
}

function scrollToScene(sceneIndex: number, options: { duration: number; lock: boolean }) {
  // 使用 window.scrollTo 或 GSAP
  const target = getSceneTop(scenes, sceneIndex);
  return new Promise(resolve => {
    gsap.to(window, {
      scrollTo: target,
      duration: options.duration / 1000,
      onComplete: resolve
    });
  });
}

function unlockScroll() {
  document.body.style.overflow = '';
}

async function playInkTransition(
  fromScene: SceneConfig,
  toScene: SceneConfig,
  duration: number
) {
  // 触发 InkTransition 组件播放
  // 具体实现在 components/transitions/InkTransition.tsx
  return new Promise(resolve => setTimeout(resolve, duration));
}
```

### 2. useScrollProgress (纯进度派生)

```typescript
// hooks/useScrollProgress.ts
import { useMemo } from 'react';

export interface ScrollProgress {
  heroFade: number;          // hero 淡出进度 0-1
  patternTopProgress: number;    // pattern-top 转场进度
  patternBottomProgress: number; // pattern-bottom 旋转进度
  aodEntryProgress: number;      // aod 入场墨滴进度
  // ... 其他场景进度
}

export function useScrollProgress(scrollPx: number): ScrollProgress {
  return useMemo(() => {
    const vh = window.innerHeight;
    
    // Hero fade: 0vh → 100vh 滚动时，透明度 1 → 0
    const heroFade = 1 - clamp(scrollPx / vh, 0, 1);
    
    // Pattern-top 入场: 100vh → 200vh
    const patternTopStart = vh;
    const patternTopProgress = clamp((scrollPx - patternTopStart) / vh, 0, 1);
    
    // Pattern-bottom 旋转: 200vh → 320vh (1.2 倍时长)
    const patternBottomStart = vh * 2;
    const patternBottomProgress = clamp((scrollPx - patternBottomStart) / (vh * 1.2), 0, 1);
    
    // AOD 入场墨滴: 320vh → 400vh
    const aodStart = vh * 3.2;
    const aodEntryProgress = clamp((scrollPx - aodStart) / (vh * 0.8), 0, 1);
    
    return {
      heroFade,
      patternTopProgress,
      patternBottomProgress,
      aodEntryProgress
    };
  }, [scrollPx]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
```

**注意**：在新架构中，这个 hook 主要用于 **reading scene 内部的渐变效果**（如 hero fade），转场进度不再由滚动驱动，而是由状态机的 `PLAYING` 状态 + 时间驱动的 `useInkTransition` 控制。

### 3. useInkTransition (墨滴 Canvas 渲染)

```typescript
// hooks/useInkTransition.ts
import { useEffect, useRef } from 'react';
import { renderInkFrame } from '../lib/canvas/ink-renderer';

export interface InkTransitionConfig {
  type: 'horizontal' | 'radial';
  direction?: 'bottom-up' | 'top-down';
  origin?: { x: number; y: number }; // radial 模式的中心点
}

export function useInkTransition(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  progress: number, // 0-1, 时间驱动
  config: InkTransitionConfig
) {
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 渲染墨滴帧
    const render = () => {
      renderInkFrame(ctx, progress, config);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [canvasRef, progress, config]);
}
```

### 4. useVideoPlayback (视频播放封装)

```typescript
// hooks/useVideoPlayback.ts
import { useEffect, useRef, useState, useCallback } from 'react';

export interface VideoPlaybackState {
  isPlaying: boolean;
  progress: number; // 0-1
  currentTime: number;
  duration: number;
  hasEnded: boolean;
}

export interface VideoPlaybackControls {
  play: () => Promise<void>;
  pause: () => void;
  reset: () => void;
  onTimeUpdate: (callback: (progress: number) => void) => void;
  onEnded: (callback: () => void) => void;
}

export function useVideoPlayback(
  videoRef: React.RefObject<HTMLVideoElement>
): [VideoPlaybackState, VideoPlaybackControls] {
  const [state, setState] = useState<VideoPlaybackState>({
    isPlaying: false,
    progress: 0,
    currentTime: 0,
    duration: 0,
    hasEnded: false
  });

  const timeUpdateCallbackRef = useRef<((progress: number) => void) | null>(null);
  const endedCallbackRef = useRef<(() => void) | null>(null);

  const play = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    
    try {
      await video.play();
      setState(prev => ({ ...prev, isPlaying: true, hasEnded: false }));
    } catch (error) {
      console.error('Video play failed:', error);
    }
  }, [videoRef]);

  const pause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setState(prev => ({ ...prev, isPlaying: false }));
  }, [videoRef]);

  const reset = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    setState(prev => ({ ...prev, currentTime: 0, progress: 0, hasEnded: false }));
  }, [videoRef]);

  const onTimeUpdate = useCallback((callback: (progress: number) => void) => {
    timeUpdateCallbackRef.current = callback;
  }, []);

  const onEnded = useCallback((callback: () => void) => {
    endedCallbackRef.current = callback;
  }, []);

  // 监听 video 事件
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setState(prev => ({ ...prev, duration: video.duration }));
    };

    const handleTimeUpdate = () => {
      const progress = video.duration > 0 ? video.currentTime / video.duration : 0;
      setState(prev => ({
        ...prev,
        currentTime: video.currentTime,
        progress
      }));
      
      // 调用外部回调
      timeUpdateCallbackRef.current?.(progress);
    };

    const handleEnded = () => {
      setState(prev => ({ ...prev, isPlaying: false, hasEnded: true }));
      endedCallbackRef.current?.();
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [videoRef]);

  return [
    state,
    { play, pause, reset, onTimeUpdate, onEnded }
  ];
}
```

## 组件设计示例

### AodAnimation.tsx

```typescript
// components/scenes/AodAnimation.tsx
import React, { useRef, useEffect } from 'react';
import { useVideoPlayback } from '../../hooks/useVideoPlayback';
import { InkTransition } from '../transitions/InkTransition';

interface AodAnimationProps {
  state: SceneState;
  onAnimationEnd: () => void;
  onTextFadeStart: () => void; // 80% 时触发
}

export function AodAnimation({ state, onAnimationEnd, onTextFadeStart }: AodAnimationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoState, videoControls] = useVideoPlayback(videoRef);
  const hasFadedText = useRef(false);

  // 监听状态：RELEASING 时播放视频
  useEffect(() => {
    if (state === 'RELEASING' && !videoState.isPlaying) {
      videoControls.play();
    }
  }, [state, videoState.isPlaying, videoControls]);

  // 监听播放进度：80% 时触发文案淡入
  useEffect(() => {
    videoControls.onTimeUpdate((progress) => {
      if (progress > 0.8 && !hasFadedText.current) {
        hasFadedText.current = true;
        onTextFadeStart();
      }
    });
  }, [videoControls, onTextFadeStart]);

  // 监听播放结束
  useEffect(() => {
    videoControls.onEnded(() => {
      onAnimationEnd();
    });
  }, [videoControls, onAnimationEnd]);

  return (
    <section className="aod-animation" data-scene-id="aod-animation">
      <video
        ref={videoRef}
        src="/assets/aod_figure-alpha-scrub.webm"
        poster="/assets/aod-poster.png"
        muted
        playsInline
        preload="auto"
      />
      {/* 可选：播放进度指示器 */}
      {videoState.isPlaying && (
        <div className="video-progress">
          <div style={{ width: `${videoState.progress * 100}%` }} />
        </div>
      )}
    </section>
  );
}
```

### InkTransition.tsx

```typescript
// components/transitions/InkTransition.tsx
import React, { useRef, useEffect, useState } from 'react';
import { useInkTransition } from '../../hooks/useInkTransition';
import gsap from 'gsap';

interface InkTransitionProps {
  type: 'horizontal' | 'radial';
  direction?: 'bottom-up' | 'top-down';
  origin?: { x: number; y: number };
  duration: number; // ms
  onComplete?: () => void;
}

export function InkTransition({
  type,
  direction,
  origin,
  duration,
  onComplete
}: InkTransitionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(0);

  // 使用 GSAP 时间驱动进度
  useEffect(() => {
    gsap.to({ value: 0 }, {
      value: 1,
      duration: duration / 1000,
      ease: 'power2.inOut',
      onUpdate: function() {
        setProgress(this.targets()[0].value);
      },
      onComplete
    });
  }, [duration, onComplete]);

  // 使用 hook 渲染墨滴
  useInkTransition(canvasRef, progress, { type, direction, origin });

  return (
    <canvas
      ref={canvasRef}
      className="ink-transition-canvas"
      width={window.innerWidth}
      height={window.innerHeight}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999
      }}
    />
  );
}
```

## App.tsx 编排

```typescript
// App.tsx (Phase 1 实验版)
import React, { useState } from 'react';
import { useSceneStateMachine } from './hooks/useSceneStateMachine';
import { Hero } from './components/scenes/Hero';
import { PatternTransition } from './components/scenes/PatternTransition';
import { AodAnimation } from './components/scenes/AodAnimation';
import { MethodSection } from './components/scenes/MethodSection';
import { SCENES } from './constants/scenes';

export default function App() {
  const { state, currentScene, startTransition, playAnimation } = useSceneStateMachine(SCENES);
  const [methodTextVisible, setMethodTextVisible] = useState(false);

  return (
    <div className="app">
      <Hero active={currentScene === 0} />
      
      <PatternTransition
        active={currentScene === 1 || currentScene === 2}
        state={state}
      />
      
      <AodAnimation
        active={currentScene === 3}
        state={state}
        onAnimationEnd={() => {
          // AOD 播放完成，进入 method IDLE
          startTransition(4);
        }}
        onTextFadeStart={() => {
          // 80% 时触发 method 文案淡入
          setMethodTextVisible(true);
        }}
      />
      
      <MethodSection
        active={currentScene === 4 || currentScene === 5}
        textVisible={methodTextVisible}
      />
    </div>
  );
}
```

## 类型定义

```typescript
// types/index.ts
export type SceneType = 'reading' | 'animation' | 'transition';

export interface SceneConfig {
  id: string;
  type: SceneType;
  height: number; // vh
  transition?: {
    type: 'horizontal' | 'radial';
    direction?: 'bottom-up' | 'top-down';
    origin?: { x: number; y: number };
    duration: number; // ms
  };
  media?: {
    video?: string;
    poster?: string;
  };
}

export type SceneState = 
  | 'IDLE'
  | 'ARMED'
  | 'SNAP_LOCKING'
  | 'PLAYING'
  | 'PRESENTING'
  | 'RELEASING';
```

## 性能优化策略

### 1. Canvas Offscreen Rendering
```typescript
// lib/canvas/offscreen-ink.ts
export function createOffscreenInkRenderer(width: number, height: number) {
  const offscreen = new OffscreenCanvas(width, height);
  const ctx = offscreen.getContext('2d');
  
  // 在 worker 中渲染墨滴
  // 主线程只负责 transferToImageBitmap
}
```

### 2. Video Preload
```typescript
// Phase 1: 只 preload 前 3 个场景的视频
const VIDEO_PRELOAD_LIST = [
  '/assets/aod_figure-alpha-scrub.webm',
  // figure2/figure3 等后续视频按需加载
];

useEffect(() => {
  VIDEO_PRELOAD_LIST.forEach(src => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'video';
    link.href = src;
    document.head.appendChild(link);
  });
}, []);
```

### 3. Lazy Load Components
```typescript
// App.tsx
const Figure2Animation = lazy(() => import('./components/scenes/Figure2Animation'));
const Figure3Animation = lazy(() => import('./components/scenes/Figure3Animation'));

// 只在用户滚动接近时才加载
```

## 测试策略

### 1. 纯函数单测
```typescript
// hooks/useScrollProgress.test.ts
import { renderHook } from '@testing-library/react';
import { useScrollProgress } from './useScrollProgress';

describe('useScrollProgress', () => {
  it('hero fade 0vh → 1', () => {
    const { result } = renderHook(() => useScrollProgress(0));
    expect(result.current.heroFade).toBe(1);
  });
  
  it('hero fade 100vh → 0', () => {
    window.innerHeight = 1000;
    const { result } = renderHook(() => useScrollProgress(1000));
    expect(result.current.heroFade).toBe(0);
  });
});
```

### 2. 组件测试
```typescript
// components/scenes/AodAnimation.test.tsx
import { render } from '@testing-library/react';
import { AodAnimation } from './AodAnimation';

describe('AodAnimation', () => {
  it('PRESENTING 状态显示 poster', () => {
    const { container } = render(
      <AodAnimation state="PRESENTING" onAnimationEnd={() => {}} onTextFadeStart={() => {}} />
    );
    const video = container.querySelector('video');
    expect(video?.getAttribute('poster')).toBe('/assets/aod-poster.png');
  });
});
```

### 3. 状态机集成测试
```typescript
// hooks/useSceneStateMachine.test.ts
import { renderHook, act } from '@testing-library/react';
import { useSceneStateMachine } from './useSceneStateMachine';

describe('useSceneStateMachine', () => {
  it('IDLE → ARMED 当滚动到边界', () => {
    const { result } = renderHook(() => useSceneStateMachine(MOCK_SCENES));
    
    act(() => {
      // 模拟滚动事件
      window.scrollY = 900; // 接近 100vh
      window.dispatchEvent(new Event('scroll'));
    });
    
    expect(result.current.state).toBe('ARMED');
  });
});
```

## 下一步

阅读 `04-PHASE1-EXPERIMENT.md` 查看实验迁移的详细实施计划（hero → method）。
