# 测试策略

## 测试金字塔

```
        E2E Tests (5%)
       /            \
      /  Integration  \
     /    Tests (15%)  \
    /____________________\
   /                      \
  /   Component Tests      \
 /        (30%)             \
/____________________________\
        Unit Tests (50%)
```

**原则**：
- 50% 单元测试（纯函数 + hook）：快速、可靠、易维护
- 30% 组件测试（React Testing Library）：验证组件行为
- 15% 集成测试（多组件交互）：验证状态流转
- 5% E2E 测试（Playwright）：验证完整用户流程

---

## 1. 单元测试（Vitest + JSDOM）

### 1.1 纯函数测试

#### useScrollProgress 进度派生
```typescript
// hooks/useScrollProgress.test.ts
import { renderHook } from '@testing-library/react';
import { useScrollProgress } from './useScrollProgress';

describe('useScrollProgress', () => {
  beforeEach(() => {
    // Mock window.innerHeight
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 1000
    });
  });

  it('heroFade: 0vh → 1.0', () => {
    const { result } = renderHook(() => useScrollProgress(0));
    expect(result.current.heroFade).toBe(1);
  });

  it('heroFade: 50vh → 0.5', () => {
    const { result } = renderHook(() => useScrollProgress(500));
    expect(result.current.heroFade).toBeCloseTo(0.5, 2);
  });

  it('heroFade: 100vh → 0.0', () => {
    const { result } = renderHook(() => useScrollProgress(1000));
    expect(result.current.heroFade).toBe(0);
  });

  it('heroFade: > 100vh → clamped to 0', () => {
    const { result } = renderHook(() => useScrollProgress(1500));
    expect(result.current.heroFade).toBe(0);
  });

  it('patternTopProgress: 100vh → 0, 200vh → 1', () => {
    const { result: r1 } = renderHook(() => useScrollProgress(1000));
    expect(r1.current.patternTopProgress).toBe(0);

    const { result: r2 } = renderHook(() => useScrollProgress(1500));
    expect(r2.current.patternTopProgress).toBeCloseTo(0.5, 2);

    const { result: r3 } = renderHook(() => useScrollProgress(2000));
    expect(r3.current.patternTopProgress).toBe(1);
  });
});
```

#### Canvas 渲染逻辑
```typescript
// lib/canvas/ink-renderer.test.ts
import { renderInkFrame } from './ink-renderer';

describe('renderInkFrame', () => {
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    ctx = canvas.getContext('2d')!;
  });

  it('horizontal bottom-up: progress 0 → no ink', () => {
    renderInkFrame(ctx, 0, { type: 'horizontal', direction: 'bottom-up' });
    const imageData = ctx.getImageData(0, 0, 800, 600);
    // 验证所有像素透明
    expect(imageData.data.every((v, i) => i % 4 === 3 ? v === 0 : true)).toBe(true);
  });

  it('horizontal bottom-up: progress 0.5 → ink covers bottom 50%', () => {
    renderInkFrame(ctx, 0.5, { type: 'horizontal', direction: 'bottom-up' });
    const imageData = ctx.getImageData(0, 0, 800, 600);
    // 验证底部 50% 有墨迹（alpha > 0）
    const bottomHalfAlpha = imageData.data.filter((_, i) => i % 4 === 3 && i / 4 >= 800 * 300);
    expect(bottomHalfAlpha.some(a => a > 0)).toBe(true);
  });

  it('radial center: progress 1 → ink covers entire canvas', () => {
    renderInkFrame(ctx, 1, { type: 'radial', origin: { x: 400, y: 300 } });
    const imageData = ctx.getImageData(0, 0, 800, 600);
    const totalAlpha = imageData.data.filter((_, i) => i % 4 === 3).reduce((sum, a) => sum + a, 0);
    expect(totalAlpha).toBeGreaterThan(0);
  });
});
```

### 1.2 Hook 测试

#### useVideoPlayback
```typescript
// hooks/useVideoPlayback.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { useVideoPlayback } from './useVideoPlayback';

describe('useVideoPlayback', () => {
  let mockVideo: Partial<HTMLVideoElement>;
  let videoRef: React.RefObject<HTMLVideoElement>;

  beforeEach(() => {
    mockVideo = {
      play: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn(),
      currentTime: 0,
      duration: 10,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    videoRef = { current: mockVideo as HTMLVideoElement };
  });

  it('初始状态: isPlaying=false, progress=0', () => {
    const { result } = renderHook(() => useVideoPlayback(videoRef));
    const [state] = result.current;
    expect(state.isPlaying).toBe(false);
    expect(state.progress).toBe(0);
  });

  it('play() 调用 video.play()', async () => {
    const { result } = renderHook(() => useVideoPlayback(videoRef));
    const [, controls] = result.current;

    await act(async () => {
      await controls.play();
    });

    expect(mockVideo.play).toHaveBeenCalled();
  });

  it('timeupdate 事件更新 progress', async () => {
    const { result } = renderHook(() => useVideoPlayback(videoRef));

    // 模拟 timeupdate 事件
    act(() => {
      mockVideo.currentTime = 5;
      const listener = (mockVideo.addEventListener as jest.Mock).mock.calls.find(
        call => call[0] === 'timeupdate'
      )?.[1];
      listener?.();
    });

    await waitFor(() => {
      const [state] = result.current;
      expect(state.progress).toBeCloseTo(0.5, 2);
    });
  });

  it('onTimeUpdate callback 在 80% 时触发', async () => {
    const { result } = renderHook(() => useVideoPlayback(videoRef));
    const [, controls] = result.current;

    const callback = jest.fn();
    act(() => {
      controls.onTimeUpdate(callback);
    });

    // 模拟播放到 80%
    act(() => {
      mockVideo.currentTime = 8;
      const listener = (mockVideo.addEventListener as jest.Mock).mock.calls.find(
        call => call[0] === 'timeupdate'
      )?.[1];
      listener?.();
    });

    await waitFor(() => {
      expect(callback).toHaveBeenCalledWith(0.8);
    });
  });
});
```

#### useSceneStateMachine
```typescript
// hooks/useSceneStateMachine.test.ts
import { renderHook, act } from '@testing-library/react';
import { useSceneStateMachine } from './useSceneStateMachine';

const MOCK_SCENES = [
  { id: 'hero', type: 'reading', height: 100 },
  { id: 'pattern', type: 'transition', height: 100 },
  { id: 'aod', type: 'animation', height: 100 }
];

describe('useSceneStateMachine', () => {
  beforeEach(() => {
    window.innerHeight = 1000;
    window.scrollY = 0;
  });

  it('初始状态: IDLE, currentScene=0', () => {
    const { result } = renderHook(() => useSceneStateMachine(MOCK_SCENES));
    expect(result.current.state).toBe('IDLE');
    expect(result.current.currentScene).toBe(0);
  });

  it('滚动到边界 → ARMED', () => {
    const { result } = renderHook(() => useSceneStateMachine(MOCK_SCENES));

    act(() => {
      window.scrollY = 900; // 距离 1000vh (下一场景) 100px = 10vh
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current.state).toBe('ARMED');
  });

  it('继续滚动超过边界 → startTransition 触发', async () => {
    const { result } = renderHook(() => useSceneStateMachine(MOCK_SCENES));

    // 先进入 ARMED
    act(() => {
      window.scrollY = 900;
      window.dispatchEvent(new Event('scroll'));
    });

    // 继续滚动超过边界
    await act(async () => {
      window.scrollY = 1100;
      window.dispatchEvent(new Event('scroll'));
      // startTransition 是异步的，等待状态更新
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    expect(result.current.state).toBe('PRESENTING');
    expect(result.current.currentScene).toBe(1);
  });

  it('从 ARMED 滚回去 → 回到 IDLE', () => {
    const { result } = renderHook(() => useSceneStateMachine(MOCK_SCENES));

    act(() => {
      window.scrollY = 900;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current.state).toBe('ARMED');

    act(() => {
      window.scrollY = 400; // 滚回 hero 中间
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current.state).toBe('IDLE');
  });
});
```

---

## 2. 组件测试（React Testing Library）

### 2.1 Hero Scene
```typescript
// components/scenes/Hero.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Hero } from './Hero';
import { CONTENT } from '../../constants/content';

describe('Hero', () => {
  it('渲染 title 和 CTA', () => {
    render(<Hero active={true} />);
    expect(screen.getByText(CONTENT.hero.title)).toBeInTheDocument();
    expect(screen.getByText(CONTENT.hero.cta)).toBeInTheDocument();
  });

  it('active=false 时不渲染', () => {
    const { container } = render(<Hero active={false} />);
    expect(container.querySelector('.hero')).not.toBeInTheDocument();
  });

  it('滚动时 opacity 变化', () => {
    const { container } = render(<Hero active={true} />);
    const hero = container.querySelector('.hero') as HTMLElement;

    expect(hero).toHaveStyle({ opacity: '1' });

    // 模拟滚动
    act(() => {
      window.scrollY = 500;
      fireEvent.scroll(window);
    });

    expect(hero).toHaveStyle({ opacity: '0.5' });
  });
});
```

### 2.2 AodAnimation
```typescript
// components/scenes/AodAnimation.test.tsx
import { render, waitFor } from '@testing-library/react';
import { AodAnimation } from './AodAnimation';

describe('AodAnimation', () => {
  it('PRESENTING 状态显示 poster', () => {
    const { container } = render(
      <AodAnimation
        state="PRESENTING"
        onAnimationEnd={jest.fn()}
        onTextFadeStart={jest.fn()}
      />
    );

    const video = container.querySelector('video');
    expect(video?.poster).toContain('aod-poster.png');
  });

  it('RELEASING 状态调用 video.play()', async () => {
    const { container } = render(
      <AodAnimation
        state="RELEASING"
        onAnimationEnd={jest.fn()}
        onTextFadeStart={jest.fn()}
      />
    );

    const video = container.querySelector('video') as HTMLVideoElement;
    const playSpy = jest.spyOn(video, 'play').mockResolvedValue(undefined);

    await waitFor(() => {
      expect(playSpy).toHaveBeenCalled();
    });
  });

  it('播放到 80% 触发 onTextFadeStart', async () => {
    const onTextFadeStart = jest.fn();
    const { container } = render(
      <AodAnimation
        state="RELEASING"
        onAnimationEnd={jest.fn()}
        onTextFadeStart={onTextFadeStart}
      />
    );

    const video = container.querySelector('video') as HTMLVideoElement;

    // 模拟播放到 80%
    Object.defineProperty(video, 'currentTime', { value: 4, writable: true });
    Object.defineProperty(video, 'duration', { value: 5, writable: true });

    act(() => {
      video.dispatchEvent(new Event('timeupdate'));
    });

    await waitFor(() => {
      expect(onTextFadeStart).toHaveBeenCalled();
    });
  });
});
```

### 2.3 InkTransition
```typescript
// components/transitions/InkTransition.test.tsx
import { render, waitFor } from '@testing-library/react';
import { InkTransition } from './InkTransition';

describe('InkTransition', () => {
  it('渲染 canvas', () => {
    const { container } = render(
      <InkTransition
        type="horizontal"
        direction="bottom-up"
        duration={800}
      />
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveClass('ink-transition-canvas');
  });

  it('duration 完成后调用 onComplete', async () => {
    const onComplete = jest.fn();
    render(
      <InkTransition
        type="radial"
        origin={{ x: 0.5, y: 0.5 }}
        duration={100}
        onComplete={onComplete}
      />
    );

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    }, { timeout: 200 });
  });
});
```

---

## 3. 集成测试（多组件交互）

### 3.1 Hero → Pattern 转场
```typescript
// integration/hero-to-pattern.test.tsx
import { render, act, waitFor } from '@testing-library/react';
import App from '../App';

describe('Hero → Pattern 转场', () => {
  it('完整流程: IDLE → ARMED → SNAP_LOCKING → PLAYING → PRESENTING', async () => {
    const { container } = render(<App />);

    // 初始: Hero 显示
    expect(container.querySelector('.hero')).toBeInTheDocument();

    // 滚动到边界
    act(() => {
      window.scrollY = 900;
      window.dispatchEvent(new Event('scroll'));
    });

    // 应该进入 ARMED（无可见变化，但状态机内部）

    // 继续滚动触发转场
    await act(async () => {
      window.scrollY = 1100;
      window.dispatchEvent(new Event('scroll'));
      await new Promise(resolve => setTimeout(resolve, 150)); // SNAP_LOCKING 100ms + buffer
    });

    // 应该显示墨滴 canvas
    await waitFor(() => {
      expect(container.querySelector('.ink-transition-canvas')).toBeInTheDocument();
    });

    // 等待转场完成 (1000ms)
    await waitFor(() => {
      expect(container.querySelector('.pattern-lotus-canvas')).toBeInTheDocument();
    }, { timeout: 1500 });
  });
});
```

### 3.2 AOD → Method 文案提前入场
```typescript
// integration/aod-to-method.test.tsx
import { render, act, waitFor } from '@testing-library/react';
import App from '../App';

describe('AOD → Method 文案提前入场', () => {
  it('AOD 播放到 80% 时 method 文案淡入', async () => {
    const { container } = render(<App />);

    // 假设已经到达 AOD 场景 (currentScene=3)
    // ... 滚动逻辑省略 ...

    // 触发 AOD 播放
    act(() => {
      window.scrollY = 3200; // AOD top + 10vh
      window.dispatchEvent(new Event('scroll'));
    });

    const aodVideo = container.querySelector('video[src*="aod"]') as HTMLVideoElement;
    expect(aodVideo).toBeInTheDocument();

    // 模拟播放到 80%
    act(() => {
      Object.defineProperty(aodVideo, 'currentTime', { value: 4, writable: true });
      Object.defineProperty(aodVideo, 'duration', { value: 5, writable: true });
      aodVideo.dispatchEvent(new Event('timeupdate'));
    });

    // Method 文案应该淡入
    await waitFor(() => {
      const methodSection = container.querySelector('.method-section') as HTMLElement;
      expect(methodSection).toHaveStyle({ opacity: '1' });
    }, { timeout: 1500 }); // 1s transition
  });
});
```

---

## 4. E2E 测试（Playwright）

### 4.1 完整用户流程
```typescript
// e2e/complete-flow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('完整首页流程', () => {
  test('hero → pattern → aod → method 完整链路', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // 1. Hero 显示
    const hero = page.locator('.hero');
    await expect(hero).toBeVisible();

    // 2. 滚动 hero 淡出
    await page.evaluate(() => window.scrollBy(0, 500));
    await expect(hero).toHaveCSS('opacity', /0\.\d+/);

    // 3. 继续滚动触发 pattern 转场
    await page.evaluate(() => window.scrollBy(0, 600));
    const inkCanvas = page.locator('.ink-transition-canvas');
    await expect(inkCanvas).toBeVisible({ timeout: 2000 });

    // 等待墨滴转场完成
    await page.waitForTimeout(1200);

    // 4. Pattern lotus 显示
    const lotusCanvas = page.locator('.pattern-lotus-canvas');
    await expect(lotusCanvas).toBeVisible();

    // 等待 lotus 旋转完成
    await page.waitForTimeout(1300);

    // 5. AOD 入场墨滴
    await page.evaluate(() => window.scrollBy(0, 100));
    await expect(inkCanvas).toBeVisible({ timeout: 1000 });
    await page.waitForTimeout(800);

    // 6. AOD video 显示 poster
    const aodVideo = page.locator('video[src*="aod"]');
    await expect(aodVideo).toBeVisible();
    await expect(aodVideo).toHaveAttribute('poster', /aod-poster/);

    // 7. 滚动 10vh 触发播放
    await page.evaluate(() => window.scrollBy(0, 100));
    await expect(aodVideo).toHaveJSProperty('paused', false);

    // 8. 等待播放到 80%，method 文案淡入
    await page.waitForTimeout(4000); // 80% of 5s
    const methodSection = page.locator('.method-section');
    await expect(methodSection).toHaveCSS('opacity', '1', { timeout: 1500 });

    // 9. 等待 video 结束
    await page.waitForTimeout(1000);

    // 10. 滚动 method，应该自由滚动
    await page.evaluate(() => window.scrollBy(0, 300));
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(3500); // AOD 结束位置 + 300
  });
});
```

### 4.2 性能测试
```typescript
// e2e/performance.spec.ts
import { test, expect } from '@playwright/test';

test('60fps 转场性能', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // 开始 Performance trace
  await page.evaluate(() => performance.mark('transition-start'));

  // 触发转场
  await page.evaluate(() => window.scrollBy(0, 1100));

  // 等待转场完成
  await page.waitForTimeout(3000);

  await page.evaluate(() => performance.mark('transition-end'));

  // 获取 FPS 数据
  const metrics = await page.evaluate(() => {
    const entries = performance.getEntriesByType('measure');
    // 简化版：实际应该用 Performance Observer API 获取 frame timing
    return {
      duration: performance.measure('transition', 'transition-start', 'transition-end').duration
    };
  });

  // 期望转场时间接近理论值 (1000ms center ink + 1200ms lotus rotation)
  expect(metrics.duration).toBeLessThan(2500); // 2200ms + buffer
});

test('Canvas 渲染不掉帧', async ({ page, browser }) => {
  // 需要启动 Chrome 的 Performance tracing
  const context = await browser.newContext();
  await context.tracing.start({ screenshots: true, snapshots: true });

  const tracePage = await context.newPage();
  await tracePage.goto('http://localhost:5173');

  // 触发转场
  await tracePage.evaluate(() => window.scrollBy(0, 1100));
  await tracePage.waitForTimeout(3000);

  await context.tracing.stop({ path: 'trace.zip' });

  // 手动分析 trace.zip 中的 FPS 数据
  // 或者用 Playwright 的 CDP API 实时监控
});
```

### 4.3 视觉回归测试
```typescript
// e2e/visual-regression.spec.ts
import { test, expect } from '@playwright/test';

test('hero 视觉快照', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await expect(page).toHaveScreenshot('hero-initial.png');
});

test('pattern lotus 视觉快照', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // 滚动到 pattern 场景
  await page.evaluate(() => window.scrollBy(0, 2200));
  await page.waitForTimeout(2500); // 等待转场完成

  await expect(page).toHaveScreenshot('pattern-lotus-complete.png');
});

test('AOD poster 视觉快照', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // 滚动到 AOD 场景
  await page.evaluate(() => window.scrollBy(0, 3200));
  await page.waitForTimeout(3500);

  await expect(page).toHaveScreenshot('aod-poster.png');
});
```

---

## 5. 测试覆盖率目标

| 测试类型 | 目标覆盖率 | Phase 1 优先级 |
|---------|-----------|---------------|
| 纯函数（进度计算、Canvas 渲染） | 90% | P0 |
| Hook（useVideoPlayback, useSceneStateMachine） | 80% | P0 |
| 组件（Hero, AodAnimation, InkTransition） | 70% | P1 |
| 集成（多组件交互） | 50% | P1 |
| E2E（完整流程） | 3-5 个关键场景 | P2 |

---

## 6. CI/CD 集成

### GitHub Actions 配置
```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  unit-and-component:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm ci
      - run: npm run test
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run build
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## 7. Mock 策略

### Canvas Mock
```typescript
// test/mocks/canvas.ts
export function createMockCanvas() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Mock drawImage
  ctx.drawImage = jest.fn();

  // Mock getImageData
  ctx.getImageData = jest.fn(() => ({
    data: new Uint8ClampedArray(800 * 600 * 4),
    width: 800,
    height: 600
  }));

  return { canvas, ctx };
}
```

### Video Mock
```typescript
// test/mocks/video.ts
export function createMockVideo(): HTMLVideoElement {
  const video = document.createElement('video');

  Object.defineProperties(video, {
    play: { value: jest.fn().mockResolvedValue(undefined) },
    pause: { value: jest.fn() },
    currentTime: { value: 0, writable: true },
    duration: { value: 10, writable: true },
    paused: { value: true, writable: true }
  });

  return video;
}
```

---

## 8. 测试命令

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:visual": "playwright test --grep @visual"
  }
}
```

---

## 9. 测试优先级（Phase 1）

### Week 1（Day 1-7）
- [ ] useScrollProgress 单测（2 小时）
- [ ] ink-renderer 单测（1 天）
- [ ] pattern-renderer 单测（0.5 天）
- [ ] useSceneStateMachine 单测（1 天）

### Week 2（Day 8-11）
- [ ] useVideoPlayback 单测（0.5 天）
- [ ] Hero 组件测试（0.5 天）
- [ ] AodAnimation 组件测试（0.5 天）
- [ ] 完整流程 E2E（1 天）

---

## 总结

测试策略的核心是**快速反馈** + **高可信度**：
- 纯函数单测确保进度计算和 Canvas 渲染逻辑正确
- Hook 测试确保状态管理和视频播放逻辑可靠
- 组件测试确保 UI 行为符合预期
- 集成测试确保多组件协作无误
- E2E 测试确保完整用户流程流畅

Phase 1 重点：**单元测试覆盖 90% 的纯函数和 hook**，组件测试覆盖关键场景，至少 1 个完整流程 E2E。

Phase 2 扩展：补充 figure2/figure3/ttg 等复杂场景的测试，视觉回归测试覆盖所有转场。
