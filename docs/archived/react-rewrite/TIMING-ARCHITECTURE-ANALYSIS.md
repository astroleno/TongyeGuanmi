# 时序架构深度分析

## 原版 AOD 实现机制（aod-scroll.js）

### 核心发现

#### 1. **不是 Scrub 模式，是 Seek + Tween 混合**

```javascript
// ScrollTrigger 配置
ScrollTrigger.create({
  trigger: stage,
  start: 'top top',
  end: () => `+=${Math.max(1, window.innerHeight * 0.2)}`,  // 只有 20vh 触发区
  onUpdate: (self) => tweenToRawProgress(self.progress),     // 不是直接 seek
  onLeave: () => tweenToRawProgress(1),
  onLeaveBack: () => tweenToRawProgress(0)
});
```

**关键机制**：
- ScrollTrigger 监听 **20vh 的触发区域**
- `onUpdate` 回调调用 `tweenToRawProgress()`，不是直接 seek 视频
- **Tween 到目标进度**，带缓动（duration 根据距离计算）

---

#### 2. **Tween 实现（双轨道：GSAP + 原生 fallback）**

```javascript
function tweenToRawProgress(rawProgress) {
  const target = stableProgress(rawProgress);
  const distance = Math.abs(target - playhead.raw);
  
  // 距离太小则跳过
  if (distance < 0.001) {
    renderProgress(target, target);
    return;
  }
  
  // 优先用 GSAP
  if (gsap) {
    progressTween = gsap.to(playhead, {
      raw: target,
      duration: Math.max(0.06, distance * TRANSITION_DURATION_SECONDS),  // 动态时长
      ease: 'none',
      onUpdate: () => renderProgress(playhead.raw)
    });
  } else {
    // Fallback: 原生 rAF
    tweenNativeToRawProgress(target);
  }
}
```

**关键点**：
- ✅ **动态 duration**：`distance * 2s`（距离越远，tween 越久）
- ✅ **Ease 为 'none'**（线性 tween）
- ✅ **每帧调用 `renderProgress()`** 更新场景和视频

---

#### 3. **视频 Seek 策略（加速曲线）**

```javascript
function acceleratedProgress(rawProgress) {
  const t = stableProgress(rawProgress);
  return clamp(0.78 * t + 0.22 * t * t, 0, 1);  // 加速曲线
}

function renderProgress(rawProgress, videoProgress = acceleratedProgress(rawProgress)) {
  playhead.raw = stableProgress(rawProgress);
  playhead.video = stableProgress(videoProgress);  // 视频用加速后的进度
  seekVideo(figureLayer, playhead.video);
  renderScene(playhead.raw, parallaxMouse.x, parallaxMouse.y);
}
```

**双进度系统**：
- `rawProgress`：场景动画进度（线性）
- `videoProgress`：视频播放进度（加速曲线，前半段慢，后半段快）

---

#### 4. **视频 Seek 优化（防抖 + 时间容差）**

```javascript
function seekVideo(video, progress) {
  if (!video || video.readyState < 1) return;
  
  const p = stableProgress(progress);
  const lastProgress = videoSeekProgress.get(video) ?? -1;
  
  // 进度变化小于 0.003 则跳过
  if (Math.abs(lastProgress - p) < 0.003) return;
  
  const duration = getVideoDuration(video);
  const targetTime = Math.min(duration - 0.02, Math.max(0, p * duration));
  
  // currentTime 差异小于一帧则跳过
  if (Math.abs(video.currentTime - targetTime) < 0.016) {
    videoSeekProgress.set(video, p);
    return;
  }
  
  try {
    video.currentTime = targetTime;
    videoSeekProgress.set(video, p);
  } catch {
    // WebKit can reject seeks before metadata fully settles.
  }
}
```

**优化策略**：
- ✅ 进度容差：0.003（0.3%）
- ✅ 时间容差：0.016s（一帧）
- ✅ 边界保护：`duration - 0.02` 防止越界
- ✅ WeakMap 缓存上次进度

---

### 技术栈总结

| 层级 | 原版技术栈 | 作用 |
|------|-----------|------|
| **滚动监听** | GSAP ScrollTrigger | 检测触发区域（20vh），触发回调 |
| **进度管理** | GSAP Tween / 原生 rAF | Tween 到目标进度，动态 duration |
| **渲染协调** | GSAP Ticker | 每帧调用 `tickAod()` 渲染场景 |
| **视频同步** | `video.currentTime` seek | 根据加速曲线 seek 视频 |
| **属性动画** | GSAP quickSetter | 高性能 DOM 属性更新 |
| **平滑滚动** | Lenis (可选) | 替代原生滚动 |

---

## 原版不是 Scrub，而是 "Scroll-Triggered Tween"

### 对比

| 模式 | 描述 | 实现 |
|------|------|------|
| **真正的 Scrub** | 滚动直接控制进度，1:1 映射 | `scrub: true` 或 `scrub: 1` |
| **原版 AOD** | 滚动触发 tween，tween 驱动进度 | `onUpdate: tweenTo(progress)` |

### 为什么不是 Scrub？

原版的 `onUpdate: (self) => tweenToRawProgress(self.progress)` 不是直接设置进度，而是：
1. ScrollTrigger 检测到滚动 → 计算目标进度（0-1）
2. 调用 `tweenToRawProgress(target)` → 启动一个 tween
3. Tween 缓动到目标进度 → 每帧更新视频和场景
4. 用户滚动 → ScrollTrigger 更新目标 → Tween 重新计算

**结果**：有一个"缓冲层"，不是生硬的 1:1 seek。

---

## 当前 React 版本的对比

### Phase 3 实现（media-animation segment）

```typescript
// AODMediaAnimationAdapter.tsx
useEffect(() => {
  if (state.phase !== 'PLAYING') return;
  
  let isActive = true;
  const start = performance.now();
  
  const tick = (now: number) => {
    if (!isActive) return;
    const progress = Math.min((now - start) / durationMs, 1);
    dispatch({ type: 'MEDIA_PROGRESS', segment: segmentId, progress });
    
    if (progress < 1) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      dispatch({ type: 'SEGMENT_COMPLETE', segment: segmentId });
    }
  };
  
  rafRef.current = requestAnimationFrame(tick);
}, [state.phase]);
```

**对比原版**：

| 维度 | 原版 AOD | React Phase 3 |
|------|----------|---------------|
| **触发** | ScrollTrigger 20vh 区域 | 滚动 10vh + ARM 逻辑 |
| **进度驱动** | Tween (GSAP/rAF) | 时间线性推进（rAF） |
| **视频控制** | Seek (`currentTime`) | 自动播放（`.play()`） |
| **滚动锁定** | Lenis + CSS | 手动 `preventScroll()` |
| **加速曲线** | `0.78*t + 0.22*t²` | 无（线性） |
| **渲染协调** | GSAP Ticker | React state + useEffect |

---

## 用户要求的实现方式

> "不需要 scrub，全部改成自动播放"

### 解读

1. **不要 scrub 模式**（滚动控制 `currentTime`）
2. **改成自动播放**（锁定滚动 + `video.play()`）
3. **原版的 tween 机制不需要**（因为视频自动播放，不需要 seek）

### 这意味着什么？

原版 AOD 的复杂度来自于：
- Scrub 需要精确的 `currentTime` 同步
- Tween 需要缓动到目标进度
- 双进度系统（raw + video accelerated）

**如果全部改成自动播放**：
- ❌ 不需要 `seekVideo()`
- ❌ 不需要 `acceleratedProgress()`
- ❌ 不需要 `tweenToRawProgress()`
- ✅ 只需要触发 `video.play()` 后等待 `ended` 事件

**Phase 3 实现已经是这个思路！**

---

## Shopify Winter Edition 时序管理

### 访问失败，但可以推测

Shopify Editions 系列通常使用：
1. **GSAP ScrollTrigger** - 滚动触发动画
2. **Lottie** - 轻量级矢量动画
3. **Canvas/WebGL** - 复杂视觉效果
4. **Video auto-play** - 锁定滚动时自动播放

### 可能的时序架构

```javascript
// 推测的 Shopify 方案
ScrollTrigger.create({
  trigger: section,
  start: 'top center',
  onEnter: () => {
    // 锁定滚动
    lenis.stop();
    // 播放视频
    video.play();
    // 监听结束
    video.addEventListener('ended', () => {
      lenis.start();
      scrollToNext();
    });
  }
});
```

---

## 关键结论

### 1. **原版 AOD 不是纯 Scrub**
- 是 "Scroll-Triggered Tween to Seek"
- 有缓动层，不是生硬的 1:1

### 2. **用户要求的"自动播放"更简单**
- 不需要 tween
- 不需要复杂的 seek 逻辑
- Phase 3 已经实现了这个思路

### 3. **是否需要 GSAP？**

#### 如果要完全还原原版 AOD（Scrub + Tween）：
- ✅ 需要 GSAP ScrollTrigger
- ✅ 需要 GSAP Tween
- ✅ 需要 GSAP Ticker

#### 如果改成自动播放（用户要求）：
- ❌ 不需要 GSAP Tween（视频自己播放）
- ⚠️ 可能需要 GSAP ScrollTrigger（触发检测）
- ⚠️ 可能需要 GSAP 动画其他元素（背景、视差）

### 4. **当前 React 架构的兼容性**

| 需求 | React FSM 方案 | GSAP 方案 | 评估 |
|------|---------------|-----------|------|
| **滚动触发检测** | 手动 scroll 监听 | ScrollTrigger | ⚠️ GSAP 更强大 |
| **视频自动播放** | `.play()` + rAF progress | 同左 | ✅ 无需 GSAP |
| **场景动画** | CSS + rAF | GSAP timeline | ⚠️ GSAP 更精确 |
| **视差效果** | pointermove + transform | GSAP quickSetter | ⚠️ GSAP 性能更好 |
| **状态管理** | React FSM | 手动状态 | ✅ React 更清晰 |

---

## 推荐方案

### 方案 A：混合架构（推荐）

```
高层状态管理：SceneRuntime FSM（React）
  ↓
滚动触发检测：GSAP ScrollTrigger（或手动）
  ↓
视频播放：原生 video.play()（自动播放）
  ↓
场景动画：GSAP timeline（复杂动画） + CSS（简单动画）
  ↓
属性更新：GSAP quickSetter（高频更新） + React state（低频）
```

**优点**：
- ✅ 结合两者优势
- ✅ GSAP 处理动画细节
- ✅ React 管理状态和组件

**集成方式**：
```typescript
// 场景组件
useEffect(() => {
  if (!hasVisual) return;
  
  // GSAP 管理动画
  const tl = gsap.timeline({ paused: true });
  tl.to(sunRef.current, { y: -200, opacity: 0, duration: 0.5 });
  tl.to(cloudRef.current, { y: -300, opacity: 0, duration: 0.5 }, '<');
  
  // Runtime 控制播放
  if (state.phase === 'PLAYING') {
    tl.play();
  }
  
  return () => tl.kill();
}, [hasVisual, state.phase]);
```

### 方案 B：完全 React（当前方案）

保持当前架构，不引入 GSAP：
- ✅ 架构统一
- ✅ 依赖少
- ⚠️ 动画曲线需要手动调优
- ⚠️ 复杂动画编排困难

---

## 下一步建议

### 1. **明确动画还原度要求**
- 如果要求像素级还原原版 AOD 的动画曲线 → 需要 GSAP
- 如果只要求视觉接近 → 当前方案可用

### 2. **评估 GSAP 引入成本**
- Bundle 大小：~50KB (gzipped)
- 学习曲线：团队是否熟悉
- 集成复杂度：与 React 状态同步

### 3. **分场景决策**
- **简单场景**（如 method-top）：纯 React + CSS
- **复杂场景**（如 AOD、figure2）：React + GSAP
- **转场动画**：Adapter（当前方案）已足够

### 4. **原型验证**
建议先用一个场景（如 AOD）实现两个版本：
- Version A：纯 React（当前方案）
- Version B：React + GSAP

并排对比，决定技术栈。

---

## 总结

1. ✅ **原版 AOD 机制已理解**：Scroll-Triggered Tween + Seek
2. ✅ **用户要求的"自动播放"更简单**：Phase 3 已实现核心逻辑
3. ⚠️ **GSAP 不是必需，但会让动画更精确**
4. ✅ **Shopify 可能用类似方案**，但核心是 ScrollTrigger + auto-play
5. 💡 **推荐混合架构**：React FSM + GSAP 动画细节
