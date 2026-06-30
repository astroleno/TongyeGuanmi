# 首页 SceneRuntime 迁移深度分析报告

> **分析状态**: 🔄 分析进行中  
> **开始时间**: 2026-06-30  
> **Workflow ID**: wf_702ea224-063  
> **分析团队**: 9个专家agent + 1个综合agent

---

## 执行摘要

**当前状态**: 正在执行多维度分析  
**核心问题**: 时间编排机制（用户明确指出）  
**历史背景**: 7次修复失败 + React重写失败

**最终决策**: 待综合分析完成后给出 [GO / GO WITH CHANGES / PIVOT / STOP]

---

## 分析框架

### Phase 1: Code Discovery 🔄 进行中
**目标**: 理解当前系统为什么这么复杂

#### 1.1 当前Runtime实现分析
- **文件**: `js/transitions/homepage-transition-runtime.js` (910行)
- **文件**: `js/runtime/homepage-snap-runtime.js` (1046行)  
- **文件**: `js/transitions/homepage/scene-timeline-manifest.js`
- **文件**: `src/section-manifest.mjs`

**Agent任务**: 提取核心职责、状态管理、时序机制、技术债

**发现**: 🔄 待agent返回

---

#### 1.2 Adapter生态系统调查
- **范围**: `js/transitions/homepage/` 目录下所有adapter
- **已知文件**:
  - aod-homepage-adapter.js (4283行)
  - crane-homepage-adapter.js (3344行)
  - figure2-homepage-adapter.js (11478行) ⚠️ 最大
  - figure3-homepage-adapter.js (2365行)
  - ph-homepage-adapter.js (2441行)
  - ttg-homepage-adapter.js (4429行)
  - handoff-preview.js / handoff-receiver.js
  - scene-timeline-controller.js (8528行)
  - scene-timeline-manifest.js (21911行) ⚠️ 最大
  - section-presentation-controller.js (2963行)

**Agent任务**: 识别职责重叠、接口一致性、演化模式

**发现**: 🔄 待agent返回

---

#### 1.3 React重写失败复盘
- **范围**: `docs/archived/react-rewrite/` 历史文档
- **已知事实**: 
  - 用户尝试过React重写
  - "试了下react也不好"
  - 7次修复全部失败
  - 当前在 `react-rewrite/homepage-snap-timeline` 分支

**Agent任务**: 提取失败根因、可复用的诊断insights

**发现**: 🔄 待agent返回

---

### Phase 2: Architecture Analysis 🔄 进行中
**目标**: 判断新架构是根本改进还是表面重构

#### 对比维度

| 维度 | 旧模型 | 新模型 | 评分 (1-10) |
|------|--------|--------|-------------|
| **耦合度** | 滚动进度 + adapter + handoff + reveal + presentation controller 多方协调 | SceneRuntime单一协调者 | 🔄 待评估 |
| **状态所有权** | 状态分散在多个模块 | SceneRuntime.state单一来源 | 🔄 待评估 |
| **时间模型** | scroll progress驱动视觉 + 多种bridge/window | 10vh threshold触发 + fixed playback | 🔄 待评估 |
| **失败模式** | 🔄 待分析 | 🔄 待分析 | 🔄 待评估 |
| **可测试性** | 🔄 待分析 | 状态机可独立测试（计划声明） | 🔄 待评估 |

**关键问题**: 新架构是否解决了导致7次失败的**根因**，还是只是转移了复杂度？

**发现**: 🔄 待Opus agent返回

---

### Phase 3: Timing Orchestration 🔄 进行中
**重要性**: ⚠️ **用户明确指出这是核心问题**

#### 3.1 状态机可行性分析

**新FSM提案** (迁移计划第6节):
```
IDLE → ARMED → SNAP_LOCKING → PLAYING → PRESENTING → RELEASING → IDLE
```

**现有FSM** (homepage-snap-runtime.js):
```
FreeScroll → SnapAligning → SnappedArmed → TriggeredPlayback 
→ Playing → Completing → ReleaseCooldown
```

**Agent任务**:
- [ ] FSM是更简单还是只是不同？
- [ ] 所有状态转换是否明确定义？
- [ ] 边缘情况处理（快速滚动、后退、hash导航、reduced motion）
- [ ] "10vh触发但不驱动视觉"这个区分是否可实现？
- [ ] Figure2 compound sequence如何融入FSM？

**发现**: 🔄 待agent返回

---

#### 3.2 时间冲突分析 ⚠️ 高优先级

**已识别的潜在冲突**:

1. **滚动输入 vs Snap对齐 vs 播放计时**
   - 用户滚动10vh → 系统锁输入 → snap到边界 → 播放900ms → 呈现目标 → 释放
   - 总"控制丢失"时间: ~1200ms？

2. **"锁定输入"期间的用户感知**
   - SNAP_LOCKING + PLAYING状态期间block wheel/touch/keyboard
   - 会感觉卡顿还是流畅过渡？

3. **10vh阈值实现**
   - 基于距离还是时间？
   - 滚动速度如何影响？
   - 快速滚动会发生什么？

4. **媒体播放80%提前拷贝**
   - race condition: 播放完成 vs 拷贝提交
   - 如果播放突然结束（错误/用户干预）？

5. **Figure2 compound sequence**
   - 多个子步骤，每个有自己的计时模型
   - 如何协调substep之间的时序？

**Agent任务**: 为每个冲突生成严重性评分 + 失败模式 + 计划是否覆盖

**发现**: 🔄 待Opus agent返回（high effort）

---

#### 3.3 UX时序感知评估

**关键场景**:

**场景1: 触发转场** (hero → pattern-top)
- 用户滚动10vh
- 系统行为: lock → snap → 墨滴900ms → 呈现 → 释放
- 用户感知: ？？？
- 对比当前系统: ？？？

**场景2: 文案阅读** (method-top → method-bottom)  
- 无锁定，自然滚动
- 但需要再累积10vh才能触发下一个转场
- 感觉像墙还是自然停顿？

**场景3: 快速滚动穿过多个scene**
- 当前FSM有"ReadingScroll bypass"
- 新模型是否保留？（计划中不清楚）
- 如果用户快速滚动，会卡在第一个转场还是跳过？

**Agent任务**: 评估新时序模型是感觉**更好**还是只是**不同**

**发现**: 🔄 待agent返回

---

### Phase 4: Risk Assessment 🔄 进行中
**目标**: 识别show-stopper风险

#### 计划列出的风险（第18节）

| 风险 | 可能性 (1-10) | 影响 (1-10) | 防御充分性 (1-10) | 早期检测 (1-10) |
|------|---------------|-------------|-------------------|-----------------|
| 新runtime也变成大泥球 | 🔄 | 🔄 | 防御: 每个segment一个文件 | 🔄 |
| Figure2 compound继续失控 | 🔄 | 🔄 | 防御: validator限制只一个 | 🔄 |
| 旧CSS gate继续吃文案 | 🔄 | 🔄 | 防御: reveal排除 + 删除类 | 🔄 |
| 视频加载慢导致空白 | 🔄 | 🔄 | 防御: 必须有poster | 🔄 |
| 移动端touch误触 | 🔄 | 🔄 | 防御: accumulated delta + cooldown | 🔄 |
| hash进入中间页空白 | 🔄 | 🔄 | 防御: 直接presented | 🔄 |
| reduced motion被忘记 | 🔄 | 🔄 | 防御: runtime层统一处理 | 🔄 |
| nav theme不同步 | 🔄 | 🔄 | 防御: presentation.js唯一owner | 🔄 |
| 两套runtime同时运行 | 🔄 | 🔄 | 防御: feature flag + verify | 🔄 |

#### 未列出的风险 🔄 agent识别中

**Agent任务**: 
- 找出计划遗漏的风险
- 组织/团队风险（非技术）
- 迁移过程本身的风险
- **Figure2为何如此棘手**的深层原因

**发现**: 🔄 待Opus agent返回

---

### Phase 5: Implementation Review 🔄 进行中
**目标**: 评估执行计划现实性

#### 5.1 9阶段执行计划评估

| 阶段 | 范围 | 风险等级 | 可回滚性 | 验收标准清晰度 | 评估 |
|------|------|----------|----------|----------------|------|
| Phase 0 | 冻结旧分支，开新分支 | 🔄 | 🔄 | 🔄 | 🔄 |
| Phase 1 | manifest + validator | 🔄 | 🔄 | 🔄 | 🔄 |
| Phase 2 | 状态机单元测试 | 🔄 | 🔄 | 🔄 | 🔄 |
| Phase 3 | DOM scene shell | 🔄 | 🔄 | 🔄 | 🔄 |
| Phase 4 | ink-transition | 🔄 | 🔄 | 🔄 | 🔄 |
| Phase 5 | media-animation | 🔄 | 🔄 | 🔄 | 🔄 |
| Phase 6 | text-read | 🔄 | 🔄 | 🔄 | 🔄 |
| Phase 7 | Figure2 compound | 🔄 | 🔄 | 🔄 | 🔄 |
| Phase 8 | Contact收口 | 🔄 | 🔄 | 🔄 | 🔄 |
| Phase 9 | 删除旧runtime | 🔄 | 🔄 | 🔄 | 🔄 |

**关键问题**:
- Phase 4-7都触及时序/状态，能否真正串行？
- "MVP"是Phase 0-6（前6阶段），是否真的最小？
- Phase 9删除旧runtime，如果新的有生产bug怎么办？
- 第一周7天计划现实吗（考虑到历史失败）？

**发现**: 🔄 待agent返回

---

#### 5.2 测试策略评估

**计划的测试** (第15节):
- ✅ 状态机单元测试
- ✅ 13个Playwright场景
- ✅ HUD可视检查点

**潜在缺口**:
- ❓ 性能回归测试？
- ❓ 跨浏览器兼容性？
- ❓ 移动端专项测试（不只是"touch threshold"）？
- ❓ A/B测试 / 灰度发布策略？
- ❓ 压力测试（快速滚动、频繁交互）？

**Agent任务**: 识别测试覆盖缺口，推荐提交前必须的测试

**发现**: 🔄 待agent返回

---

### Phase 6: Synthesis 🔄 待前序完成
**目标**: 综合所有发现，给出决策性建议

#### 综合输出结构

1. **Executive Summary** (3句话)
   - 🔄 待综合

2. **Root Cause Analysis**: 7次失败的真正原因
   - 🔄 待综合

3. **Architecture Verdict**: 新架构根本更好 vs 表面不同
   - 🔄 待综合

4. **Timing Model Verdict**: "10vh触发+固定播放"可行性
   - 🔄 待综合

5. **Migration Feasibility**: 该团队能否执行（基于历史）
   - 🔄 待综合

6. **Decision Framework**:
   - 🔄 待决策: **GO** / **GO WITH CHANGES** / **PIVOT** / **STOP**

7. **If GO/GO WITH CHANGES**: 前3个关键成功因素
   - 🔄 待列出

8. **If PIVOT/STOP**: 替代方案（1段）
   - 🔄 待提供

---

## 迁移计划原文分析

### 核心决策（第0节）
> "首页不再做'滚动进度驱动一切'的系统"

**评估**: 🔄 待综合agent分析是否这是正确的决策

---

### Scene/Segment模型（第2节）

**Scene**: 满屏页面或动画舞台
- 17个固定scene (hero, pattern-top, ..., contact)
- method拆成method-top + method-bottom

**Segment**: 从一个scene到下一个scene的动作
- 4种类型: ink-transition, media-animation, text-read, compound-sequence
- **删除**: soft-divider, soft-breath, progress-window, earlyReceiver, splitSceneBridge...

**评估**: 🔄 这个抽象是否足够表达所有首页交互？有无遗漏？

---

### 状态机（第6节）

```
IDLE: 稳定呈现，等待10vh意图
ARMED: 阈值满足，找到segment，未锁滚
SNAP_LOCKING: 锁输入，viewport对齐
PLAYING: segment固定时长播放，不读scroll progress
PRESENTING: 原子提交target scene
RELEASING: 清理临时层，恢复滚动
```

**Invariants（第6.4节）**:
1. PLAYING时，native scroll不得改变visual progress
2. 同时只有一个activeSegmentId
3. 同时只有一个currentSceneId
4. timeline-owned scene不允许被.reveal初始化隐藏
5. media-animation不允许在第二次10vh前play
6. ink-transition期间，target animation只显示poster
7. 真实DOM不能被adopt到transition container
8. compound-sequence只能出现在figure2
9. reduced motion下不得锁用户滚动超过一帧

**评估**: 🔄 这些invariants能否被runtime强制保证？测试能否验证？

---

### Figure2的特殊性（第8节）

**为什么Figure2如此复杂**:
- 唯一的compound sequence
- 4个内部step
- 视觉carry（前景模糊横拱）
- 文案beat（三卡 + 整屏statement）
- 不进入普通reveal
- 最终只commit brand一次

**评估**: 🔄 "只允许一个compound"的规则能否控制复杂度？还是Figure2本身就是架构异味？

---

### 删除清单（第1.3节）

明确删除的概念:
- ❌ `runtimeMode: 'progress-window'`
- ❌ `windows: [{ from, to, owner, bridge... }]`
- ❌ `splitSceneBridge` / `earlyReceiver`
- ❌ handoff receiver移动真实DOM
- ❌ adapter直接改目标section opacity
- ❌ `.reveal`控制timeline section
- ❌ scroll-driven webm scrub
- ❌ scroll-driven ink progress

**评估**: 🔄 这些删除是否会丢失必要功能？还是确实是技术债？

---

### 最小可发布版本（第20节）

```
hero → pattern-top → pattern-bottom → aod-animation → method-top → method-bottom
```

**必须满足**:
- 无黑屏
- AOD不scroll scrub
- AOD转场完成时只显示poster
- 再滚10vh才播放AOD
- AOD 80% method-top提前入场
- method可自然阅读
- direct hash `#method`不空白
- reduced motion可用

**评估**: 🔄 这是否真的"最小"？能否更小？

---

### 风险和防线（第18节）

**计划的态度**:
> "这次迁移不是'把旧runtime抽象得更漂亮'，而是**换掉旧runtime的基本模型**"

**3条硬规则**:
1. 每一帧只有一个scene state
2. 每一段copy只有一个owner
3. 每一次transition completion和target presentation是同一事务

**评估**: 🔄 这3条规则能否被工程实践强制？还是只是理想声明？

---

## 实时更新日志

### 2026-06-30 初始化
- ✅ Workflow启动
- ✅ 分析文档创建
- 🔄 Phase 1: Code Discovery (3 agents并行)
- 🔄 Phase 2: Architecture Analysis (1 Opus agent)
- 🔄 Phase 3: Timing Orchestration (3 agents并行)
- 🔄 Phase 4: Risk Assessment (1 Opus agent)
- 🔄 Phase 5: Implementation Review (2 agents并行)
- ⏳ Phase 6: Synthesis (等待前序完成)

---

## 待办事项

- [ ] Phase 1 完成后更新"发现"部分
- [ ] Phase 2 完成后填写对比维度评分表
- [ ] Phase 3 完成后填写时间冲突矩阵
- [ ] Phase 4 完成后填写风险评分表
- [ ] Phase 5 完成后填写阶段评估表
- [ ] Phase 6 完成后写入最终决策和建议
- [ ] 生成单独的"行动计划"文档（如果决策是GO或GO WITH CHANGES）

---

## 附录

### A. 当前代码库快照
- 总runtime代码: ~1956行 (homepage-transition-runtime.js 910行 + homepage-snap-runtime.js 1046行)
- Adapter数量: 6个主要adapter (AOD, Crane, Figure2, Figure3, PH, TTG)
- 最大adapter: figure2-homepage-adapter.js (11478行)
- 最大manifest: scene-timeline-manifest.js (21911行)

### B. 相关分支
- 当前分支: `react-rewrite/homepage-snap-timeline`
- 计划目标分支: `rescue/homepage-scene-runtime`
- 归档分支: `codex/homepage-master-observer-runtime`

### C. 关键文件列表
```
js/transitions/homepage-transition-runtime.js
js/runtime/homepage-snap-runtime.js
js/transitions/homepage/scene-timeline-manifest.js
js/transitions/homepage/*-homepage-adapter.js
src/section-manifest.mjs
```

---

*本文档将随workflow进度持续更新*
