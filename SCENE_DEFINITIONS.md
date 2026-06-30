# Homepage Transition Scene Definitions（修正版）

每个转场的完整场景定义：上一幕/下一幕的 100vh owner、场景类型、转场方式。

## 核心原则

### 原则 1：转场和动画分离
> **墨滴转场只接入下一幕静止首帧/最终帧；webm 动画不在转场中播放。**
> 转场完成后，用户再滚动 10vh，才 snap 锁定并自动播放动画。

### 原则 2：文案 owner 单一
> 只有 AOD、Figure3、Crane 的后续文案是在动画中提前入场。
> Method/Brand/Services/Lab/Education/Contact 这些纯文案段落本身正常滚动阅读。
> 进入它们的墨滴转场里，下一幕文案作为完整下一屏被 reveal，不再单独 clone 一套 receiver。

### 原则 3：Scroll 驱动范围
**应该 scroll 驱动**：
- 普通文案段落的自然阅读滚动
- 触发检测：滚动进入 10vh 后触发转场/动画

**不应该 scroll 驱动**（snap 后时间驱动）：
- 墨滴转场进度
- AOD / Figure2 / Figure3 / TTG / PH / Crane 的 webm 动画进度
- 文案提前入场的 opacity timeline
- Figure2 的复杂 5 步序列

### 原则 4：文案入场完整性
AOD / Figure3 / Crane 里，动画播完时如果文案还没完全呈现：
- **继续锁 scroll，等文案完整入场后再释放**（更稳，不会出现用户刚好滚走导致文案半截）

---

## 转场定义

### 转场 1：hero → pattern（中心扩散）
- 上一幕：`section#home`（DOM projection）
- 下一幕：`.pattern-bloom-transition__stage`（WebGL texture，静止首帧）
- 转场类型：中心扩散墨滴
- 触发：滚动 10vh
- 时长：2s

### 转场 2：pattern → belief（左侧旋转扩散）
- 上一幕：`.pattern-bloom-transition__stage`（最后一帧）
- 下一幕：`section#belief`（DOM projection）
- 转场类型：左侧旋转中心扩散墨滴
- 触发：pattern-bloom secondReveal 阶段
- 时长：2s

### 转场 3：belief → aod 入场态（下→上不规则）
- 上一幕：`section#belief`（DOM projection）
- 下一幕：`.aod-transition__field`（WebGL texture，video 静止首帧）
- 转场 host：`[data-transition-id="belief-method"]`
- 触发：滚动 10vh
- 时长：2s
- **重要**：转场完成后进入 AOD 动画阶段

### AOD 动画阶段
- 触发：转场 3 完成后，再滚动 10vh
- snap 锁定 + video 自动播放 2-3s
- **早接收器**：动画 80% 时，`section#method .chapter-intro` 文案淡入
- 释放：动画 + 文案都完成后释放

### 转场 4：method → figure2 入场态（下→上不规则）
- 上一幕：`section#method`（DOM projection）
- 下一幕：`.figure2-scroll`（DOM projection，video 静止首帧）
- 转场 host：`[data-transition-id="method-brand"]`
- 触发：滚动 10vh
- 时长：2s
- **重要**：转场完成后进入 Figure2 动画 + 5 步序列

### Figure2 动画 + 5 步序列
- 触发：转场 4 完成后，再滚动 10vh
- snap 锁定
- **步骤 1**：video 播放到 cameraProgress=1.0（远景扩散），前景横拱定型
- **步骤 2**：保留横拱，brand 上半文案淡入：
  ```
  我们见过太多"用不上"
  - 只培训：听完很激动，回去照旧。
  - 只上软件：账号开了，一线没人碰。
  - 只交方案：装订精美，锁进抽屉。
  ```
- **步骤 3**：保留横拱，brand 下半文案淡入：
  ```
  同野观幂做第四种：先进现场，再定章法，陪你跑到账上有数。
  ```
- **步骤 4**：横拱 + 文案一起做下→上墨滴转场消失
- **步骤 5**：显示 `section.edition-band`（brand 方法论），释放 scroll
- 总时长：8-10s

### 转场 5：brand → figure3 入场态（下→上不规则）
- 上一幕：`section.edition-band`（DOM projection）
- 下一幕：figure3 video 静止首帧（WebGL texture）
- 转场 host：`[data-transition-id="brand-services"]`
- 触发：滚动 10vh
- 时长：2s
- **重要**：转场完成后进入 Figure3 动画阶段

### Figure3 动画阶段
- 触发：转场 5 完成后，再滚动 10vh
- snap 锁定 + video 自动播放 2-3s
- **早接收器**：动画 80% 时，`section#services.canvas-section--enterprise .chapter-intro` 文案淡入
- 释放：动画 + 文案都完成后释放

### 转场 6：services → ttg 入场态（下→上不规则）
- 上一幕：`section#services.canvas-section--enterprise`（DOM projection）
- 下一幕：`.ttg-scroll`（WebGL texture，video 静止首帧）
- 转场 host：`[data-transition-id="services-lab"]`
- 触发：滚动 10vh
- 时长：2s
- **重要**：转场完成后进入 TTG 动画阶段

### TTG 动画阶段
- 触发：转场 6 完成后，再滚动 10vh
- snap 锁定 + video 自动播放 2-3s
- 释放：动画完成后释放，进入转场 7

### 转场 7：ttg 最终帧 → lab（上→下不规则）
- 上一幕：`.ttg-scroll`（定格最后一帧）
- 下一幕：`section#lab.canvas-section--scenario`（DOM projection）
- 触发：TTG 动画完成后自动触发
- 时长：2s

### 转场 8：lab → ph 入场态（放射扩散）
- 上一幕：`section#lab.canvas-section--scenario`（DOM projection）
- 下一幕：`.ph-scroll`（DOM projection，video 静止首帧 + 海面背景）
- 转场 host：`[data-transition-id="lab-education"]`
- 转场类型：⚠️ **从左侧太阳放射扩散**
- 太阳坐标：`{ x: 0.10, y: 0.65 }`（left-top UV）或 `{ x: 0.10, y: 0.35 }`（bottom-left UV）
- 触发：滚动 10vh
- 时长：2s
- **重要**：转场完成后进入 PH 动画阶段

### PH 动画阶段
- 触发：转场 8 完成后，再滚动 10vh
- snap 锁定 + video 自动播放 2-3s
- 释放：动画完成后释放，进入转场 9

### 转场 9：ph 最终帧 → education（上→下不规则）
- 上一幕：`.ph-scroll`（定格最后一帧）
- 下一幕：`section#education.canvas-section--education`（DOM projection）
- 触发：PH 动画完成后自动触发
- 时长：2s

### 转场 10：education → crane 入场态（下→上不规则）
- 上一幕：`section#education.canvas-section--education`（DOM projection）
- 下一幕：`.crane-scroll`（WebGL texture，video 静止首帧）
- 转场 host：`[data-transition-id="education-contact"]`
- 触发：滚动 10vh
- 时长：2s
- **重要**：转场完成后进入 Crane 动画阶段

### Crane 动画阶段
- 触发：转场 10 完成后，再滚动 10vh
- snap 锁定 + video 自动播放 2-3s
- **早接收器**：动画 80% 时，`section#contact.canvas-section--contact .contact-endpoint` 文案淡入
- 释放：动画 + 文案都完成后释放

---

## 总结

- **10 个墨滴转场**（满屏 snapped，时间驱动自动播放）
- **6 个动画阶段**（snap 后自动播放，其中 3 个有早接收器）
- **6 个纯文案段落**（正常 scroll 阅读）
- **3 个早接收器**：AOD→method, Figure3→services, Crane→contact
- **1 个复杂序列**：Figure2 的 5 步（stage1 + 文案 + 横拱转场）
- **1 个特殊转场**：lab→ph 放射扩散

**下一步**：用户确认后，开始阶段 2（启用 snap/autoplay）
