# Homepage Transition Scene Definitions

每个转场的完整场景定义：上一幕/下一幕的 100vh owner、场景类型、转场方式。

---

## 转场 1：hero → pattern-lotus（第一幕 → 第二幕上）

**上一幕（hero）**：
- 完整场景：`section#home`（100vh，包含 hero 文案 + 背景）
- 场景类型：DOM（普通 section）
- 采样方式：DOM projection（全屏 clone）

**下一幕（pattern-lotus）**：
- 完整场景：`.pattern-bloom-transition__stage`（pattern canvas）
- 场景类型：canvas
- 采样方式：WebGL texture

**转场类型**：中心扩散墨滴（自动播放）
**触发时机**：滚动到转场容器 10vh
**转场时长**：2s
**文案入场**：无（hero 文案在上一幕，pattern 无文案）

---

## 转场 2：pattern-lotus → belief-star（第二幕上 → 第二幕下）

**上一幕（pattern-lotus）**：
- 完整场景：`.pattern-bloom-transition__stage`（pattern canvas with lotus）
- 场景类型：canvas
- 采样方式：WebGL texture

**下一幕（belief-star）**：
- 完整场景：`section#belief`（100vh，包含星图 canvas + belief 文案）
- 场景类型：混合（canvas 星图 + DOM 文案）
- 采样方式：DOM projection（完整 section）

**转场类型**：左侧旋转中心扩散墨滴（自动播放）
**触发时机**：滚动到转场容器 10vh
**转场时长**：2s
**文案入场**：无（belief 文案在下一幕 native section）

---

## 转场 3：belief → aod（第二幕下 → AOD 动画）

**上一幕（belief）**：
- 完整场景：`section#belief`（100vh，星图 + 文案）
- 场景类型：混合（canvas + DOM）
- 采样方式：DOM projection（完整 section）

**下一幕（aod）**：
- 完整场景：`.homepage-transition--aod`（转场容器，100vh）
- 动画 owner：`.aod-transition__stage`（video canvas）
- 场景类型：canvas（video）
- 采样方式：WebGL texture（video）

**转场类型**：下→上水平不规则墨滴
**触发时机**：滚动到转场容器 10vh
**转场时长**：2s
**文案入场**：⚠️ **早接收器**（动画播放到 80% 时，method section 文案提前淡入）
- 文案 owner：`section#method .chapter-intro`（native section）
- 入场方式：opacity 0→1，参考 hero 文案
- 动画继续播放到 100%，不受文案影响

---

## 转场 4：aod → method 文案（无转场，文案已提前入场）

**无转场**：aod 动画播放完成后，直接显示 method section 文案（已在动画 80% 时淡入）

**method section**：
- 完整场景：`section#method`（100vh，纯文案 section）
- 场景类型：DOM
- 滚动阅读：正常 scroll

---

## 转场 5：method → figure2（method 文案 → Figure2 动画）

**上一幕（method）**：
- 完整场景：`section#method`（100vh，纯文案）
- 场景类型：DOM
- 采样方式：DOM projection（完整 section）

**下一幕（figure2）**：
- 完整场景：`.homepage-transition--figure2`（转场容器，100vh）
- 动画 owner：`.figure2-transition__stage`（包含多层 arch layers + figure video）
- 场景类型：混合（video + DOM layers）
- 采样方式：DOM projection（完整转场容器）

**转场类型**：下→上水平不规则墨滴
**触发时机**：滚动到转场容器 10vh
**转场时长**：2s
**文案入场**：无（figure2 stage1 完成后有复杂序列，见转场 6）

---

## 转场 6：figure2 → brand（复杂 5 步序列）

**特殊说明**：这是跨 figure2 动画 + brand section 的复杂序列，分 5 步。

### 步骤 1：figure2 stage1（远景扩散）
- 动画自动播放到 `cameraProgress = 1.0`（远景扩散完成）
- 前景横拱（`nearArchLayer`）定型，保持模糊状态

### 步骤 2：brand 上半文案入场
- 保留前景横拱（静态模糊）
- brand 上半文案淡入（参考 hero 文案入场）
- 文案内容：【我们见过太多"用不上"】到【只交方案，锁进抽屉】
- 文案 owner：独立叠加层（不是 native section）

### 步骤 3：brand 下半文案入场
- 继续保留前景横拱
- brand 下半文案淡入（整屏）
- 文案内容：【同野观幂做第四种：先进现场，再定章法，陪你跑到账上有数。】

### 步骤 4：前景横拱 + 文案墨滴转场
- 前景横拱 + 所有文案一起做下→上水平不规则墨滴转场消失
- 转场类型：下→上水平不规则墨滴
- 采样方式：nearArchLayer + 文案叠加层合成为一个 projection

### 步骤 5：接到 brand section
- 显示 brand 解释文案（native section）
- 文案内容：【同野观幂】的详细解释
- 场景：`section.canvas-section--brand`（纯文案 section）

**总时长**：约 8-10s（stage1 自动播放 + 文案入场 + 墨滴转场）

---

## 转场 7：brand → figure3（brand 文案 → Figure3 动画）

**上一幕（brand）**：
- 完整场景：`section.canvas-section--brand`（100vh，纯文案）
- 场景类型：DOM
- 采样方式：DOM projection（完整 section）

**下一幕（figure3）**：
- 完整场景：`.homepage-transition--figure3`（转场容器，100vh）
- 动画 owner：`.figure3-transition__stage`（video）
- 场景类型：canvas（video）
- 采样方式：WebGL texture

**转场类型**：下→上水平不规则墨滴
**触发时机**：滚动到转场容器 10vh
**转场时长**：2s
**文案入场**：⚠️ **早接收器**（动画播放到 80% 时，services section 文案提前淡入）
- 文案 owner：`section.canvas-section--services .chapter-intro`（native section）
- 入场方式：opacity 0→1，参考 hero 文案
- 动画继续播放到 100%

---

## 转场 8：figure3 → services 文案（无转场，文案已提前入场）

**无转场**：figure3 动画播放完成后，直接显示 services section 文案（已在动画 80% 时淡入）

**services section**：
- 完整场景：`section.canvas-section--services`（100vh，纯文案）
- 场景类型：DOM
- 滚动阅读：正常 scroll

---

## 转场 9：services → ttg（services 文案 → TTG 动画）

**上一幕（services）**：
- 完整场景：`section.canvas-section--services`（100vh，纯文案）
- 场景类型：DOM
- 采样方式：DOM projection（完整 section）

**下一幕（ttg）**：
- 完整场景：`.homepage-transition--ttg`（转场容器，100vh）
- 动画 owner：`.ttg-transition__stage`（包含 figure videos）
- 场景类型：canvas/video
- 采样方式：WebGL texture 或 DOM projection（取决于 ttg 实现）

**转场类型**：下→上水平不规则墨滴
**触发时机**：滚动到转场容器 10vh
**转场时长**：2s
**文案入场**：无（ttg 动画播放完成后接 lab 文案）

---

## 转场 10：ttg → lab（TTG 动画 → lab 文案）

**上一幕（ttg）**：
- 完整场景：`.homepage-transition--ttg`（转场容器，100vh，ttg 动画最后一帧）
- 场景类型：canvas/video
- 采样方式：WebGL texture 或 DOM projection

**下一幕（lab）**：
- 完整场景：`section.canvas-section--lab`（100vh，纯文案）
- 场景类型：DOM
- 采样方式：DOM projection（完整 section）

**转场类型**：上→下水平不规则墨滴
**触发时机**：滚动到转场容器 10vh
**转场时长**：2s
**文案入场**：无（lab 文案在下一幕 native section）

---

## 转场 11：lab → ph（lab 文案 → PH 动画）

**上一幕（lab）**：
- 完整场景：`section.canvas-section--lab`（100vh，纯文案）
- 场景类型：DOM
- 采样方式：DOM projection（完整 section）

**下一幕（ph）**：
- 完整场景：`.homepage-transition--ph`（转场容器，100vh）
- 动画 owner：`.ph-transition__stage`（video + 海面背景）
- 场景类型：混合（video + background image）
- 采样方式：DOM projection（完整转场容器）

**转场类型**：⚠️ **从 ph 背景海面左侧太阳（最亮处）墨滴放射扩散**
**太阳坐标**：静态坐标（需分析 `assets/ph_background.png`，预估 `{ x: 0.15, y: 0.40 }`）
**触发时机**：滚动到转场容器 10vh
**转场时长**：2s
**文案入场**：无（ph 动画播放完成后接 education 文案）

---

## 转场 12：ph → education（PH 动画 → education 文案）

**上一幕（ph）**：
- 完整场景：`.homepage-transition--ph`（转场容器，100vh，ph 动画最后一帧）
- 场景类型：混合（video + background）
- 采样方式：DOM projection

**下一幕（education）**：
- 完整场景：`section.canvas-section--education`（100vh，纯文案）
- 场景类型：DOM
- 采样方式：DOM projection（完整 section）

**转场类型**：上→下水平不规则墨滴
**触发时机**：滚动到转场容器 10vh
**转场时长**：2s
**文案入场**：无（education 文案在下一幕 native section）

---

## 转场 13：education → crane（education 文案 → Crane 动画）

**上一幕（education）**：
- 完整场景：`section.canvas-section--education`（100vh，纯文案）
- 场景类型：DOM
- 采样方式：DOM projection（完整 section）

**下一幕（crane）**：
- 完整场景：`.homepage-transition--crane`（转场容器，100vh）
- 动画 owner：`.crane-transition__stage`（video）
- 场景类型：canvas（video）
- 采样方式：WebGL texture

**转场类型**：下→上水平不规则墨滴
**触发时机**：滚动到转场容器 10vh
**转场时长**：2s
**文案入场**：⚠️ **早接收器**（动画播放到 80% 时，contact section 文案提前淡入）
- 文案 owner：`section.canvas-section--contact .contact-endpoint`（native section）
- 入场方式：opacity 0→1，参考 hero 文案
- 动画继续播放到 100%

---

## 转场 14：crane → contact 文案（无转场，文案已提前入场）

**无转场**：crane 动画播放完成后，直接显示 contact section 文案（已在动画 80% 时淡入）

**contact section**：
- 完整场景：`section.canvas-section--contact`（100vh，纯文案）
- 场景类型：DOM
- 滚动阅读：正常 scroll

---

## 总结

### 转场总数：14 个转场（含 3 个"无转场"的文案提前入场）

### 早接收器（3 个）：
1. **转场 3**：aod → method（动画 80% 时 method 文案淡入）
2. **转场 7**：figure3 → services（动画 80% 时 services 文案淡入）
3. **转场 13**：crane → contact（动画 80% 时 contact 文案淡入）

### 特殊转场（2 个）：
1. **转场 6**：figure2 → brand（5 步复杂序列，保留前景横拱）
2. **转场 11**：lab → ph（放射扩散，从太阳中心）

### 完整场景类型分布：
- **DOM section**：hero, belief, method, brand, services, lab, education, contact
- **canvas/video**：pattern, aod, figure2, figure3, ttg, ph, crane
- **混合**：belief（星图 + 文案）, figure2（video + layers）, ph（video + background）

### 下一步：
用户审核确认后，开始阶段 2（启用 snap/autoplay）。
