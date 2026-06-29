# 转场清单：完整的 19 个场景

## 场景流程图

```
1. hero (reading)
   ↓ 墨滴中心扩散
2. pattern-top (transition)
   ↓ 左侧旋转扩散
3. pattern-bottom (transition)
   ↓ 下到上水平墨滴
4. aod-animation (animation)
   ↓ 动画 80% method 文案提前入场
5. method-top (reading)
   ↓ 普通阅读/滚动
6. method-bottom (reading)
   ↓ 下到上水平墨滴
7. figure2-animation (animation)
   ├─ 内部：远景扩散
   ├─ 保留前景模糊横拱 + "我们见过太多用不上"三卡
   ├─ 保留横拱 + "同野观幂做第四种..."整屏
   └─ 横拱和文案一起下到上水平墨滴
   ↓
8. brand (reading)
   ↓ 下到上水平墨滴
9. figure3-animation (animation)
   ↓ 动画 80% services 文案提前入场
10. services (reading)
    ↓ 下到上水平墨滴
11. ttg-animation (animation)
    ↓ 上到下水平墨滴
12. lab (reading)
    ↓ PH 太阳点放射墨滴
13. ph-animation (animation)
    ↓ 上到下水平墨滴
14. education (reading)
    ↓ 下到上水平墨滴
15. crane-animation (animation)
    ↓ 动画 80% contact 文案提前入场
16. contact (reading)
```

## 场景详细规格

### 1. hero (reading)
- **类型**：Reading scene
- **内容**：品牌标语 + CTA
- **高度**：100vh
- **状态流**：IDLE (自由滚动) → 滚动到底部 → ARMED
- **退出转场**：墨滴中心扩散

---

### 2. pattern-top (transition)
- **类型**：Transition scene（pattern-bloom 的上半段）
- **视觉**：墨滴从中心扩散，显露 lotus 图案上半部分
- **转场类型**：中心扩散墨滴
- **时长**：1000ms
- **Canvas**：`ink-scene-transition.js` radial mode + `pattern-bloom-visual.js` lotus layer 1-3
- **状态流**：SNAP_LOCKING (100ms) → PLAYING (1000ms) → PRESENTING (lotus 上半可见)

---

### 3. pattern-bottom (transition)
- **类型**：Transition scene（pattern-bloom 的下半段）
- **视觉**：lotus 图案从左侧旋转扩散，完整显现
- **转场类型**：左侧旋转扩散
- **时长**：1200ms
- **Canvas**：`pattern-bloom-visual.js` 完整 lotus 旋转 + 扩散动画
- **状态流**：PLAYING (1200ms) → PRESENTING (lotus 完整可见) → RELEASING (解锁滚动)

---

### 4. aod-animation (animation)
- **类型**：Animation scene
- **视觉**：AOD "度量世界" 视频播放
- **媒体**：`aod_figure-alpha-scrub.webm` (47MB alpha video)
- **时长**：~5s
- **转场入口**：下到上水平墨滴（从 pattern-bottom）
- **转场出口**：动画播放到 80% 时，method 文案开始淡入
- **状态流**：
  - SNAP_LOCKING (100ms, 对齐到 aod top)
  - PLAYING (800ms, 墨滴转场)
  - PRESENTING (webm poster 可见)
  - 用户滚动 10vh → RELEASING (video.play())
  - video 播放到 80% → method 文案淡入（`opacity: 0 → 1`, 1s）
  - video.ended → IDLE (at aod)

---

### 5. method-top (reading)
- **类型**：Reading scene
- **内容**：method 章节上半部分文案（场域法则、工具框架等）
- **高度**：~150vh
- **入场**：aod-animation 播放到 80% 时文案已淡入，用户滚动即可进入
- **状态流**：IDLE (自由滚动) → 滚动到底部接近 method-bottom

---

### 6. method-bottom (reading)
- **类型**：Reading scene
- **内容**：method 章节下半部分文案
- **高度**：~100vh
- **状态流**：IDLE (自由滚动) → 滚动到底部 → ARMED
- **退出转场**：下到上水平墨滴

---

### 7. figure2-animation (animation)
- **类型**：Animation scene（最复杂，内部四个子阶段）
- **媒体**：
  - `figure2a-alpha-auto.webm` (左侧人物，问道者)
  - `figure2b-alpha-auto.webm` (右侧人物，老子)
  - WebGL 渲染：arch layers, cloud, far arcade
- **转场入口**：下到上水平墨滴（从 method-bottom）
- **内部四个子阶段**：

#### 子阶段 1: 远景扩散（camera-expand）
- **时长**：~2.5s
- **视觉**：camera push，cloud/arcade 层远景扩散，middle camera scale
- **Controller**：`figure2-transition.js` `introProgress: 0 → 1`
- **WebGL**：parallax layers (cloud, far arcade, middle camera)
- **Video**：两个 figure video 同步播放（`video.play()`）

#### 子阶段 2: 保留前景模糊横拱 + "我们见过太多用不上"三卡
- **时长**：~1.5s (静态展示)
- **视觉**：
  - 横拱前景（near arch layer）保持，带轻微模糊
  - "我们见过太多用不上" heading + 三卡列表（只培训/只上软件/只交方案）显示
- **实现**：
  - arch layer `filter: blur(2px)`
  - `.method-proof__list` (三卡) 淡入
  - `introProgress` 保持在 1.0

#### 子阶段 3: 保留横拱 + "同野观幂做第四种..."整屏
- **时长**：~1s (静态展示)
- **视觉**：
  - 横拱前景保持（模糊减轻或消失）
  - "同野观幂做第四种..." 整屏文案（`.method-proof__lead`）显示
- **实现**：
  - arch `filter: blur(0px)`
  - `.method-proof__lead` 淡入，三卡淡出

#### 子阶段 4: 横拱和文案一起下到上水平墨滴 → brand
- **时长**：800ms
- **视觉**：墨滴从底部覆盖 arch + 文案，显露 brand 场景
- **Controller**：`transitionProgress: 0 → 1`
- **实现**：复用 `ink-scene-transition.js` horizontal mode

**状态流（完整）**：
- SNAP_LOCKING (100ms, 对齐到 figure2 top)
- PLAYING (800ms, 墨滴转场入场)
- PRESENTING (webm poster + arch 首帧可见)
- 用户滚动 10vh → RELEASING
  - 子阶段 1: camera-expand (2.5s, `introProgress` 驱动)
  - 子阶段 2: 三卡展示 (1.5s, 静态)
  - 子阶段 3: 整屏文案 (1s, 静态)
  - 子阶段 4: 墨滴转场出场 (800ms, `transitionProgress` 驱动)
- → IDLE (at brand)

**复杂度说明**：
- figure2 是唯一有"内部子阶段"的场景
- 子阶段 1 是 animation（WebGL + video.play()）
- 子阶段 2-3 是 content presentation（静态展示文案）
- 子阶段 4 是 transition（墨滴转场出场）
- React 实现需要一个 `useFigure2Sequence` hook 编排这四个阶段

---

### 8. brand (reading)
- **类型**：Reading scene
- **内容**：品牌方法论（同野/观幂 两篇文章 or fixture copy）
- **高度**：~120vh
- **状态流**：IDLE (自由滚动) → ARMED
- **退出转场**：下到上水平墨滴

---

### 9. figure3-animation (animation)
- **类型**：Animation scene
- **视觉**：figure3 结构动画（questioning 变体）
- **媒体**：`figure3-alpha.webm` + WebGL arch/structure layers
- **时长**：~4s
- **转场入口**：下到上水平墨滴（从 brand）
- **转场出口**：动画播放到 80% 时，services 文案开始淡入
- **状态流**：
  - SNAP_LOCKING → PLAYING (墨滴入场) → PRESENTING
  - 用户滚动 10vh → RELEASING (video.play())
  - 播放到 80% → services 文案淡入
  - video.ended → IDLE (at figure3)

---

### 10. services (reading)
- **类型**：Reading scene
- **内容**：服务说明（先小做，再扩）
- **高度**：~100vh
- **入场**：figure3 播放到 80% 时已淡入
- **状态流**：IDLE (自由滚动) → ARMED
- **退出转场**：下到上水平墨滴

---

### 11. ttg-animation (animation)
- **类型**：Animation scene
- **视觉**：TTG 场域动画
- **媒体**：`ttg_figure-alpha-scrub.webm` + WebGL field overlay
- **时长**：~5s
- **转场入口**：下到上水平墨滴（从 services）
- **转场出口**：上到下水平墨滴（注意方向改变）
- **状态流**：
  - SNAP_LOCKING → PLAYING (墨滴入场) → PRESENTING
  - 用户滚动 10vh → RELEASING (video.play())
  - video.ended → SNAP_LOCKING (出场) → PLAYING (墨滴出场，上到下) → IDLE (at lab)

---

### 12. lab (reading)
- **类型**：Reading scene
- **内容**：实验室章节
- **高度**：~100vh
- **转场入口**：上到下水平墨滴（从 ttg）
- **状态流**：IDLE (自由滚动) → ARMED
- **退出转场**：PH 太阳点放射墨滴

---

### 13. ph-animation (animation)
- **类型**：Animation scene
- **视觉**：PH 光影动画（太阳点特效）
- **媒体**：`ph-alpha.webm` + 太阳点 radial ink
- **时长**：~4s
- **转场入口**：PH 太阳点放射墨滴（从 lab，特殊 origin）
- **转场出口**：上到下水平墨滴
- **状态流**：
  - SNAP_LOCKING → PLAYING (太阳点放射墨滴入场) → PRESENTING
  - 用户滚动 10vh → RELEASING (video.play())
  - video.ended → SNAP_LOCKING → PLAYING (墨滴出场，上到下) → IDLE (at education)

---

### 14. education (reading)
- **类型**：Reading scene
- **内容**：教育章节
- **高度**：~100vh
- **转场入口**：上到下水平墨滴（从 ph）
- **状态流**：IDLE (自由滚动) → ARMED
- **退出转场**：下到上水平墨滴

---

### 15. crane-animation (animation)
- **类型**：Animation scene
- **视觉**：crane 运动动画
- **媒体**：`crane-figure1.mp4` + motion overlay
- **时长**：~5s
- **转场入口**：下到上水平墨滴（从 education）
- **转场出口**：动画播放到 80% 时，contact 文案开始淡入
- **状态流**：
  - SNAP_LOCKING → PLAYING (墨滴入场) → PRESENTING
  - 用户滚动 10vh → RELEASING (video.play())
  - 播放到 80% → contact 文案淡入
  - video.ended → IDLE (at crane)

---

### 16. contact (reading)
- **类型**：Reading scene
- **内容**：联系方式 + footer
- **高度**：~100vh
- **入场**：crane 播放到 80% 时已淡入
- **状态流**：IDLE (自由滚动) → 到达页面底部，无下一转场

---

## 转场类型统计

| 转场类型 | 使用次数 | 场景 |
|---------|---------|------|
| 下到上水平墨滴 | 7 | pattern→aod, method→figure2, brand→figure3, services→ttg, education→crane, figure2-sub4 |
| 上到下水平墨滴 | 3 | ttg→lab, ph→education |
| 中心扩散墨滴 | 1 | hero→pattern |
| 左侧旋转扩散 | 1 | pattern-top→pattern-bottom |
| 太阳点放射墨滴 | 1 | lab→ph |
| 内部远景扩散 | 1 | figure2-sub1 (camera-expand) |

## Animation Scenes 统计

| Scene | 视频时长 | 入场转场 | 出场行为 | 文案提前入场 |
|-------|---------|---------|---------|-------------|
| aod-animation | ~5s | 下→上墨滴 | 80% method 淡入 | ✓ |
| figure2-animation | ~6s (四子阶段) | 下→上墨滴 | 内置墨滴转场到 brand | - |
| figure3-animation | ~4s | 下→上墨滴 | 80% services 淡入 | ✓ |
| ttg-animation | ~5s | 下→上墨滴 | 上→下墨滴到 lab | - |
| ph-animation | ~4s | 太阳点放射 | 上→下墨滴到 education | - |
| crane-animation | ~5s | 下→上墨滴 | 80% contact 淡入 | ✓ |

## Reading Scenes 统计

| Scene | 高度 | 内容 | 特殊性 |
|-------|------|------|--------|
| hero | 100vh | 品牌标语 + CTA | 首屏 |
| method-top | ~150vh | method 上半 | 文案提前入场 |
| method-bottom | ~100vh | method 下半 | - |
| brand | ~120vh | 品牌方法论 | - |
| services | ~100vh | 服务说明 | 文案提前入场 |
| lab | ~100vh | 实验室 | - |
| education | ~100vh | 教育 | - |
| contact | ~100vh | 联系 + footer | 终点 |

## Phase 1 实验范围（hero → method）

**包含场景**：
1. hero (reading)
2. pattern-top (transition)
3. pattern-bottom (transition)
4. aod-animation (animation)
5. method-top (reading, 80% 文案提前)
6. method-bottom (reading)

**包含转场**：
- 墨滴中心扩散（hero→pattern）
- 左侧旋转扩散（pattern-top→pattern-bottom）
- 下到上水平墨滴（pattern→aod）
- 文案提前入场（aod 80%→method）

**不包含**：
- figure2 及之后的所有场景
- figure2 的复杂四子阶段
- 太阳点放射、上到下墨滴转场

## Phase 2 全量范围（method → contact）

**新增场景**：
7-16 所有剩余场景

**新增转场**：
- 上到下水平墨滴（3次）
- 太阳点放射墨滴（1次）
- figure2 内部四子阶段

## 实现优先级

### P0（Phase 1 必须）
1. 墨滴中心扩散（hero→pattern）
2. 左侧旋转扩散（pattern lotus）
3. 下到上水平墨滴（pattern→aod, method→figure2）
4. 文案提前入场（aod 80%）
5. Video 播放不 scrub

### P1（Phase 2 补充）
6. 上到下水平墨滴
7. 太阳点放射墨滴
8. figure2 四子阶段编排

### P2（优化）
9. 转场性能优化（Canvas offscreen rendering）
10. Reverse 播放（当前可以 terminal fallback）
11. 转场中断恢复（用户快速滚动）

## Canvas 复用策略

**可复用的 Canvas 模块**：
1. `ink-scene-transition.js` — 水平/径向墨滴基础渲染
2. `pattern-bloom-visual.js` — lotus 图案 + 旋转扩散
3. `figure2-transition.js` — WebGL arch layers + parallax

**React 包装方式**：
```typescript
// hooks/useInkTransition.ts
export function useInkTransition(
  canvasRef: RefObject<HTMLCanvasElement>,
  type: 'horizontal' | 'radial',
  direction: 'bottom-up' | 'top-down',
  progress: number // 0-1, 时间驱动
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // 复用当前项目的 ink-scene-transition.js 渲染逻辑
    const ctx = canvas.getContext('2d');
    renderInkFrame(ctx, progress, { type, direction });
  }, [progress, type, direction]);
}
```

## 下一步

阅读 `03-ARCHITECTURE.md` 了解 React 技术架构如何实现这 19 个场景的状态管理和转场编排。
