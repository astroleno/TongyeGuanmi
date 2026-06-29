# 状态机规范

## 核心原则变化

### 旧模型的问题
- **滚动驱动进度**：墨滴转场进度由滚动位置 scrub，video.currentTime 被手动设置
- **复杂状态转换**：SnapAligning → SnappedArmed → TriggeredPlayback → Playing → Completing → SnappedArmed，多种分支
- **charge 触发**：wheel/touchmove 积累 charge，达到阈值触发转场

### 新模型：简化 + 固定

**核心约定：**
1. **滚动只做两件事**：
   - 普通文案段落阅读（reading scenes）
   - 滚动 10vh 后触发转场/动画（animation scenes）
2. **转场期间 webm 静态**：只显示 poster/首帧/静态层，不 scrub
3. **转场完成后再播动画**：PRESENTING 状态下，滚动 10vh 触发动画播放
4. **墨滴转场时间驱动**：不由滚动位置控制，而是固定时长（如 800ms）

## 固定状态机

```
IDLE (初始)
  ↓ 用户滚动 10vh
ARMED (场景边界，准备转场)
  ↓ 继续滚动触发
SNAP_LOCKING (锁定滚动，准备播放转场)
  ↓ 墨滴转场开始
PLAYING (墨滴转场播放中，时间驱动)
  ↓ 转场完成
PRESENTING (目标场景呈现，webm 首帧可见)
  ↓ 用户滚动 10vh
RELEASING (解锁滚动，播放动画)
  ↓ 动画完成 / reading scene 自然滚动
IDLE (at new scene)
```

## 状态详解

### IDLE
- **含义**：用户在某个场景内自然滚动（reading）或动画已播放完成（animation presented）
- **滚动行为**：原生滚动，无锁定
- **退出条件**：滚动接近下一个场景边界（距离 < 10vh）

### ARMED
- **含义**：用户滚动到场景边界附近，系统准备触发转场
- **滚动行为**：仍然原生滚动，但监听是否继续前进
- **视觉**：可选显示 charge 指示器（如底部进度条）
- **退出条件**：
  - **前进**：继续滚动 → SNAP_LOCKING
  - **后退**：滚动回上一场景 → 回到上一场景的 IDLE

### SNAP_LOCKING
- **含义**：用户确认要进入下一场景，系统锁定滚动，对齐到转场起始位置
- **滚动行为**：`lenis.stop()` 或 `overflow: hidden`，禁止用户滚动
- **视觉**：目标场景的 webm poster/首帧显示，墨滴转场准备
- **时长**：~100ms（snap 对齐动画）
- **退出条件**：对齐完成 → PLAYING

### PLAYING
- **含义**：墨滴转场动画播放中（时间驱动，不 scrub）
- **滚动行为**：锁定（用户滚动无效）
- **视觉**：墨滴从下到上/上到下/中心扩散/旋转扩散，覆盖源场景，显露目标场景首帧
- **时长**：固定 800ms（可按转场类型调整）
- **退出条件**：转场动画完成 → PRESENTING

### PRESENTING
- **含义**：转场完成，目标场景首帧呈现，等待用户滚动触发动画
- **滚动行为**：仍然锁定（或部分解锁，允许小范围滚动如 5vh）
- **视觉**：
  - **Animation scene**：webm 首帧静态，等待播放
  - **Reading scene**：文案已可见
- **退出条件**：
  - **Animation scene**：用户滚动 10vh → RELEASING（播放动画）
  - **Reading scene**：直接 → RELEASING（解锁滚动）

### RELEASING
- **含义**：解锁滚动，播放动画（如果是 animation scene）
- **滚动行为**：解锁，允许原生滚动
- **视觉**：
  - **Animation scene**：webm 播放（video.play()），不 scrub
  - **Reading scene**：自然滚动阅读
- **时长**：
  - **Animation scene**：动画时长（如 5s）
  - **Reading scene**：用户自由滚动
- **退出条件**：
  - **Animation scene**：video.ended → IDLE（at presented scene）
  - **Reading scene**：进入下一场景边界 → ARMED

## 转场类型与触发

### 墨滴转场类型

#### 1. 下到上水平墨滴（最常见）
```
pattern-bottom → aod-animation
method-bottom → figure2-animation
brand → figure3-animation
services → ttg-animation
education → crane-animation
```
- **视觉**：墨迹从屏幕底部水平线扩散，向上覆盖源场景，显露目标场景
- **时长**：800ms
- **Canvas 实现**：horizontal ink with `direction: 'bottom-up'`

#### 2. 上到下水平墨滴
```
ttg-animation → lab
ph-animation → education
```
- **视觉**：墨迹从屏幕顶部向下扩散
- **时长**：800ms

#### 3. 中心扩散墨滴
```
hero → pattern-top
```
- **视觉**：墨迹从屏幕中心点放射扩散
- **时长**：1000ms
- **Canvas 实现**：radial ink with `origin: 'center'`

#### 4. 左侧旋转扩散
```
pattern-top → pattern-bottom
```
- **视觉**：墨迹从屏幕左侧旋转扩散（lotus 图案旋转 + 扩散）
- **时长**：1200ms
- **特殊**：复用 pattern-bloom lotus canvas

#### 5. 太阳点放射墨滴
```
lab → ph-animation
```
- **视觉**：墨迹从特定"太阳"坐标点放射扩散
- **时长**：1000ms
- **Canvas 实现**：radial ink with `origin: { x, y }` (ph-animation 的太阳位置)

#### 6. figure2 内部远景扩散
```
figure2-animation 内部的四个子阶段
```
- **特殊**：这是 figure2-animation 场景内部的 WebGL 效果，不是场景间转场
- **视觉**：camera push，cloud/arcade 远景扩散，最后保留横拱前景
- **状态**：仍然在 figure2-animation 的 PLAYING/PRESENTING 内部

### 动画播放触发

#### Animation Scenes（需要播放 webm）
```
aod-animation: 视频播放 ~5s
figure2-animation: camera push + figure video ~6s
figure3-animation: 结构动画 ~4s
ttg-animation: 场域动画 ~5s
ph-animation: 光影动画 ~4s
crane-animation: 运动动画 ~5s
```

**播放时机**：
- 转场完成后（PRESENTING）
- 用户滚动 10vh 触发进入 RELEASING
- `video.play()` 启动，不 scrub
- `video.ended` 后进入 IDLE

#### Reading Scenes（无动画，纯文案）
```
hero, belief-star, method-top, method-bottom, brand, services, lab, education, contact
```

**行为**：
- PRESENTING 后直接进入 RELEASING
- 解锁滚动，用户自然阅读
- 滚动到下一场景边界 → ARMED

### 文案提前入场（80% 规则）

**适用场景：**
```
aod-animation 动画 80% → method 文案提前入场
figure3-animation 动画 80% → services 文案提前入场
crane-animation 动画 80% → contact 文案提前入场
```

**实现：**
- 动画播放到 80% 时（`video.currentTime / video.duration > 0.8`）
- 下一个 reading scene 的文案开始淡入（`opacity: 0 → 1`，持续 1s）
- 动画继续播放到 100%
- 动画结束后，进入 IDLE，用户可以滚动进入已淡入的文案区域

**React 实现示例：**
```typescript
useEffect(() => {
  if (!videoRef.current) return;
  const video = videoRef.current;
  
  const handleTimeUpdate = () => {
    const progress = video.currentTime / video.duration;
    if (progress > 0.8 && !textFadedIn) {
      setTextFadedIn(true); // 触发下一场景文案淡入
    }
  };
  
  video.addEventListener('timeupdate', handleTimeUpdate);
  return () => video.removeEventListener('timeupdate', handleTimeUpdate);
}, [textFadedIn]);
```

## 滚动行为总结

| 状态 | 滚动行为 | 用户体验 |
|------|---------|---------|
| IDLE | 原生滚动 | 自由阅读/查看 |
| ARMED | 原生滚动 + 边界检测 | 接近下一场景，可能触发转场 |
| SNAP_LOCKING | 锁定 | 短暂对齐，用户感知不明显 |
| PLAYING | 锁定 | 看墨滴转场动画 |
| PRESENTING | 锁定/半锁定 | 看目标场景首帧 |
| RELEASING | 解锁 | 动画播放 or 自由阅读 |

## 与旧模型的对比

| 维度 | 旧模型 | 新模型 |
|------|--------|--------|
| 转场触发 | wheel charge 积累 | 滚动 10vh 固定距离 |
| 转场进度 | 滚动 scrub | 时间驱动（800ms） |
| Video 播放 | currentTime scrub | video.play() 自然播放 |
| 状态数量 | 8+ 种状态 + 多分支 | 6 种固定状态，单向流 |
| Reading scene | 需要特殊处理释放 | 直接跳过 PRESENTING |
| 测试复杂度 | 需要 fake Lenis, fake driver | 纯时间 + video API |

## React 实现映射

```typescript
// 状态定义
type SceneState = 
  | 'IDLE'
  | 'ARMED'
  | 'SNAP_LOCKING'
  | 'PLAYING'
  | 'PRESENTING'
  | 'RELEASING';

// 状态管理（简化版，完整版在 03-ARCHITECTURE.md）
const [state, setState] = useState<SceneState>('IDLE');
const [currentScene, setCurrentScene] = useState(0);

// 滚动监听
useEffect(() => {
  const handleScroll = () => {
    const scrollY = window.scrollY;
    const nextSceneTop = getSceneTop(currentScene + 1);
    
    if (state === 'IDLE' && scrollY > nextSceneTop - viewportHeight * 0.1) {
      setState('ARMED'); // 进入边界
    }
    
    if (state === 'ARMED' && scrollY > nextSceneTop) {
      setState('SNAP_LOCKING'); // 触发转场
      triggerTransition();
    }
  };
  
  window.addEventListener('scroll', handleScroll);
  return () => window.removeEventListener('scroll', handleScroll);
}, [state, currentScene]);

// 转场动画
const triggerTransition = () => {
  // SNAP_LOCKING: 对齐
  lenis.scrollTo(nextSceneTop, { duration: 100, lock: true });
  
  // PLAYING: 墨滴转场
  setTimeout(() => {
    setState('PLAYING');
    playInkTransition(800); // 时间驱动
  }, 100);
  
  // PRESENTING: 首帧呈现
  setTimeout(() => {
    setState('PRESENTING');
    unlockScrollPartially();
  }, 900);
};

// 动画播放（RELEASING）
const playAnimation = () => {
  setState('RELEASING');
  videoRef.current?.play();
  
  videoRef.current?.addEventListener('ended', () => {
    setState('IDLE');
    setCurrentScene(prev => prev + 1);
  });
};
```

## 边界 Case

### 快速滚动
- 用户在 IDLE 状态快速滚动，跳过多个场景边界
- **处理**：只触发最近的一个 ARMED，不连续触发多个转场
- **实现**：debounce 边界检测，或者检测 `scrollY` 的速度，大于阈值时忽略中间场景

### 滚动回退
- 用户在 ARMED 状态滚回上一场景
- **处理**：取消 ARMED，回到上一场景的 IDLE
- **实现**：检测滚动方向，`scrollY < prevSceneTop` 时重置状态

### 动画未完成就继续滚动
- 用户在 RELEASING 状态（动画播放中）就滚动到下一场景
- **处理**：
  - **选项 A（推荐）**：锁定滚动直到动画完成（`overflow: hidden`）
  - **选项 B**：允许跳过动画，直接进入下一场景（`video.pause()` + `setState('IDLE')`）
- **决策**：Phase 1 实验用选项 A，Phase 2 根据用户测试决定

### 浏览器 Back/Forward
- 用户点击浏览器返回
- **处理**：监听 `popstate`，解析 hash/state，跳转到对应场景并重置为 IDLE
- **实现**：每个场景有 hash（如 `#hero`, `#method`），状态变化时 `history.pushState`

## 性能目标

- **60fps 滚动**：IDLE/RELEASING 状态下原生滚动不掉帧
- **转场流畅**：PLAYING 状态墨滴 canvas 渲染 60fps
- **Video 播放**：RELEASING 状态 video 播放无卡顿
- **锁定响应**：SNAP_LOCKING/PLAYING 状态锁定滚动 < 50ms 延迟

## 下一步

阅读 `02-TRANSITION-MANIFEST.md` 查看完整的 19 个场景转场清单。
