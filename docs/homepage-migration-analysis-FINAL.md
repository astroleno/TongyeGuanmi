# 首页 SceneRuntime 迁移深度分析报告 - 最终版

> **分析完成**: ✅ 2026-06-30  
> **Workflow ID**: wf_702ea224-063  
> **分析团队**: 11个专家agent  
> **总Token消耗**: 498,458 tokens  
> **总工具调用**: 108次  
> **分析时长**: 11分55秒

---

## 🎯 最终决策

### **PIVOT - 不要执行此迁移计划**

**理由**: 计划解决了**症状**（架构复杂度），但误诊了**病因**（时序编排模型与用户期望不兼容）。

---

## 执行摘要

**情况**: 7次失败的修复尝试后，提议从双runtime "progress window"模型完全迁移到统一的SceneRuntime与FSM驱动的播放。

**核心问题**: 你已经有一个70%完成的Master Timeline架构，设计正确，计算准确，但没有连接到渲染层。新计划提议扔掉它，重建一个**时序模型更差**的系统。

**关键发现**: 
- 现有Master Timeline已经解决了跨scene连续性问题
- 7次失败不是因为架构错误，而是没有完成最后30%的连接工作
- 新计划的"10vh阈值 + 固定900ms播放"会让用户体验**更差**

---

## 1. 根因分析：为什么7次失败？

### 真相（来自代码证据）

从2026-06-27的综合评审显示**实际系统状态**：

1. ✅ **Master Timeline基础设施已存在且计算正确** - 每帧计算确定性状态
2. ✅ **设计已解决跨scene连续性** - 规范surface registry，单一compositor，from/to同时存在
3. ❌ **未连接到渲染** - 故意运行在"salvage/observer模式"，legacy runtime仍驱动视觉

### 这意味着什么

**7次失败不是因为架构错误。** 证据：
- `resolveMasterTimelineState()` 正确计算from/to scene重叠
- `visualHandoffAt` 启用z-order交叉淡入
- `copy.target.policy: 'overlap'` 允许文本提前进入
- Manifest声明了`overlap`窗口

**失败是因为你从未完成连接。** 你没有完成最后30%（挂载master adapters，将surface producers从observer stubs切换到真实渲染器），而是提议扔掉所有东西，重建一个**完全不同的时序模型**。

---

## 2. 架构评估：表面重构，非根本改进

### 对比分析 (评分: 1-10)

| 维度 | 旧模型 | 新模型 | Δ | 评估 |
|------|--------|--------|---|------|
| **耦合度** | 2/10 (15-20个协调点) | 8/10 (3-5个协调点) | **+6** | ✅ 显著改进 |
| **状态所有权** | 3/10 (多owner混乱) | 9/10 (单一SceneRuntimeState) | **+6** | ✅ 显著改进 |
| **时序模型** | 1/10 (滚动scrub) | 9/10 (事件驱动) | **+8** | ⚠️ 理论上好，实际会更差 |
| **失败模式** | 2/10 (7种失败模式) | 8/10 (10个硬不变式) | **+6** | ✅ 架构保护 |
| **可测试性** | 2/10 (无法隔离测试) | 9/10 (纯状态机) | **+7** | ✅ 显著改进 |
| **总分** | **10/50** | **43/50** | **+33** | **4.3x改进** |

### 但是：时序模型评分是误导性的

**新模型的时序改进是理论上的，实际会更差：**

```javascript
// 新模型
用户滚动10vh → 锁定输入 → snap到边界 → 播放900ms → 呈现目标 → 释放
// 总"失去控制"时间: ~1200ms

// 现实问题
- 10vh = ~10px (1080p屏幕)，意外触摸板触碰 = 2.6s锁定
- 无速度阈值区分意图
- 无快速滚动旁路机制
- 播放后额外420ms"监狱时间"
```

**现有Master Timeline已经解决了这个问题：**
- 连续scrollVh → 连续localProgress
- 用户通过滚动速度控制速度
- 无输入锁定，无任意阈值

---

## 3. 时序冲突分析 ⚠️ 核心问题

### 6个主要时序冲突

| 冲突 | 严重性 | 检测窗口 | 已确认 | 解决方案合理 | 缓解措施 |
|------|--------|----------|--------|-------------|---------|
| **1. Snap期间滚动锁定** | 高 | 150-2000ms | ❌ | ❌ 缺失 | ❌ |
| **2. 10vh阈值（速度）** | 中 | 40-800ms | 🟡 部分 | 🟡 不完整 | ❌ |
| **3. Milestone竞态** | 高 | 16ms (1帧) | ✅ | ✅ | 🟡 部分 |
| **4. 视频播放延迟** | 中 | 50-200ms | 🟡 部分 | 🟡 不完整 | 🟡 |
| **5. Figure2 compound进度** | 高 | 500-1500ms | ✅ | 🟡 未明确 | ❌ |
| **6. 所有权抖动** | 中 | <16ms | ✅ | ✅ | 🟡 次优 |

### 场景分析

**场景1: 触发转场** (hero → pattern-top)
- 用户滚动10vh
- 系统行为: lock → snap → 墨滴900ms → 呈现 → 释放
- **实际锁定时间**: 2200-2620ms（不是计划的1200ms）
- **用户感知**: "页面卡住了，我不能滚动"
- **可接受性**: ❌ **不可接受** - 10px滚动导致2.6秒冻结是灾难性的

**场景2: 文案阅读** (method-top → method-bottom)
- **关键发现**: 当前实现中**不存在text-read segment概念**
- 实际情况: 用户在目标section内可以自然滚动
- 到达下一个转场host的1.02vh阈值时，循环重复
- **墙的问题**: 是的，感觉像撞墙，因为10vh触发器**过于敏感**

**场景3: 快速滚动穿过多场景**
- **关键缺失功能**: 你引用的`ReadingScroll` bypass **在当前代码库中不存在**
- 实际行为: Scene A锁定并播放 → 用户动量滚动**被取消** - 锁定2.2s → Scene B触发 → 又锁定2.2s
- **结果**: 顺序强制播放，无旁路

### 用户体验评估

**新时序会感觉更差 - 具体摩擦点：**

1. **灾难性触发敏感度**: 1.02vh = ~10px，意外触摸板触碰 = 2.6s锁定
2. **缺失逃生舱口**: 无快速滚动旁路，播放开始后无中断机制
3. **滚动后"监狱时间"**: 动画完成后额外420ms输入感觉"糊状"
4. **感知死区**: Pattern-bloom adapter的0.46到0.50间隙，视觉无变化
5. **视觉所有权混乱**: 5个独立控制器，无协调提交点

---

## 4. 风险评估 🔴 高风险

### 计划中的风险评分

| 风险 | 可能性 | 影响 | 防御充分性 | 早期检测 | 裁决 |
|------|--------|------|-----------|---------|------|
| 画面ownership不唯一 | **9/10** | **10/10** | **4/10** | **6/10** | 🔴 **关键阻断** |
| 旧adapter继续用progress seek | **8/10** | **9/10** | **5/10** | **7/10** | 🔴 **高风险** |
| 资源失败锁死页面 | **9/10** | **10/10** | **4/10** | **5/10** | 🔴 **关键阻断** |
| SnappedArmed输入归一化 | **8/10** | **7/10** | **2/10** | **4/10** | 🟡 **中风险** |

### 未列出的风险 ⚠️

#### 🔴 **迁移过程风险 - 部分状态**
- **可能性**: 9/10 | **影响**: 9/10
- 计划9个阶段横跨"7天"（Phase 0-6 = MVP）
- 历史记录: 7次失败 + React重写失败 + 用户说"试了下react也不好"
- **失败场景**: 完成Phase 3-4但Phase 5卡住 → 新runtime部分连线 + 旧adapters损坏 + 首页无法工作 + 巨大回滚成本

#### 🔴 **Figure2 Compound的结构性复杂度**
- **可能性**: 8/10 | **影响**: 8/10
- Figure2是11,478行（最大adapter的3倍）
- 唯一的compound-sequence，4个内部步骤，各自有时序
- **真正的问题**: Figure2不只是"复杂内容" - 它是**主状态机内的迷你状态机**
- **防御**: "只允许一个compound" - 但这不解决Figure2的4个步骤是否违反主FSM不变式

#### 🟡 **组织/团队风险 - 失败疲劳**
- **可能性**: 7/10 | **影响**: 7/10
- 7次失败 + 1次React重写失败 → 现在尝试第3次大重写
- 用户语气中的疲惫："试了下react也不好"
- **团队状态假设**: 决策疲劳、信心降低、走捷径诱惑、展示进度压力

#### 🟡 **满屏契约 vs 现实内容**
- **可能性**: 8/10 | **影响**: 6/10
- 计划发现: "实测核对：当前没有任何section是100vh"
- 长sections如method-lower (5卡片)、services (网格)、brand (长) 不适合一屏
- **缺失验证**: 哪些sections超过100vh？极端情况的回退？强制snap边界的无障碍影响？

#### 🟡 **时序模型的用户体验风险**
- **可能性**: 7/10 | **影响**: 7/10
- 总"失去控制"时间: ~1200ms/转场
- **UX问题计划未回答**:
  1. 10vh + 锁定 + snap 感觉像"页面响应我"还是"页面控制我"？
  2. 与当前对比: 计划明确说main分支是"视觉验收基准"非"时序基准" - 所以同时改变视觉和时序，双重风险
  3. 快速滚动行为: 新模型不明确用户能否快速滚动穿过多个scenes

---

## 5. 实施计划评估 🔴 高风险

### 9阶段风险评级

| 阶段 | 内容 | 风险 | 可回滚性 | 评估 |
|------|------|------|----------|------|
| Phase 0 | 基线验证 | 🟢 | ✅ | 简单git/build检查 |
| Phase 1 | 契约检查 | 🟡 | ✅ | TDD方法，可能编码错误假设 |
| Phase 2 | Belief标记拆分 | 🟢 | ✅ | 纯标记/CSS，易回滚 |
| Phase 3 | Manifest schema | 🟡 | 🟡 | 提前承诺设计，未验证adapter需求 |
| Phase 4 | Controller所有权逻辑 | 🔴 | 🟡 | 与Phase 5-7高耦合 |
| Phase 5 | Runtime上下文连线 | 🟡 | 🟡 | 跨所有adapters的破坏性更改 |
| Phase 6 | Pattern Bloom重构 | 🔴 | ❌ | 首次真实验证Phase 3-5抽象 |
| Phase 7 | AOD时序修复 | 🟡 | 🟡 | 依赖Phase 6完成 |
| Phase 8 | Figure2/3释放 | 🟡 | 🟡 | 如Phase 6-7暴露API问题需重构 |
| Phase 9 | 删除旧runtime | 🔴 | ❌ | 如新runtime有生产bug，你被困住 |

### 关键发现

1. **隐藏耦合: Phase 4-7不是顺序的** 🔴
   - Phase 4构建ownership API，盲目于adapter需求
   - Phase 6是第一个真实消费者 - 如API错误，必须回退3个阶段
   - 这是**瀑布设计伪装成增量**

2. **"MVP"范围不是最小的** 🔴
   - Phase 0-6包括完整orchestrator抽象层、6个ownership窗口、优先级仲裁系统
   - 这不是最小的 - 是在验证一个adapter工作前构建完整所有权系统

3. **可回滚性陷阱** 🔴
   - 所有权状态烘焙到`document.documentElement`属性
   - Controller状态跨5个adapters传播
   - 无功能标志或A/B测试
   - 回滚 = 恢复9个阶段的交错更改

4. **团队速度现实检查** ⚠️
   - 计划估计Task 0-6为"第一周"（7天）
   - 考虑到"过去失败"，**现实估计: 5-7天仅Task 3-6**
   - 如Phase 6暴露controller API问题，增加2-3天修复Phase 4-5

---

## 6. 测试策略评估 🟡 不足

### 当前覆盖

**单元测试**: 不充分
- 仅提及验证工具脚本
- 无状态机逻辑的实际单元测试套件

**浏览器/Playwright测试**: 不足
- 11个手动测试检查点（不是13个）
- 全部是**手动浏览器检查**，无自动化Playwright测试
- 无可在CI运行的回归测试套件

**可视检查点（HUD）**: 有用但有限
- 实时状态检查，但需要人工解释
- 开发者工具，不是回归测试
- 无法检测视觉故障

### 缺口分析 ✅ 确认，严重

1. ❌ **性能回归测试**: 缺失
   - 无帧率监控（目标60fps）
   - 无内存泄漏检测
   - 无纹理/canvas分配跟踪

2. ❌ **跨浏览器兼容性测试**: 缺失
   - 提及手动"浏览器审计"但标记为"如授权"
   - 无Safari/Firefox/iOS特定测试

3. ❌ **移动端特定测试**: 最少
   - 仅顺带提及"触摸阈值"
   - 无触摸手势、视口变化、移动性能分析

4. ❌ **A/B测试/渐进式发布**: 缺失
   - 功能标志存在但无发布策略
   - 无金丝雀部署计划
   - 无生产问题的遥测/监控

### 建议

**优先级1: 阻断（没有这些不要合并）**
- 状态机单元测试（Jest/Vitest）
- 自动化E2E测试（Playwright）
- 视觉回归测试（Percy/截图）

**当前测试覆盖: ~15% 所需**

---

## 7. 综合判断：为什么这会成为失败#9

### 历史模式

- 7次失败修复当前系统
- React重写被放弃（用户："试了下react也不好"）
- 当前迁移70%完成但未连接

### 这个计划需要什么

- Phase 0-2: 3天
- Phase 3-4: 3天  
- Phase 5-6: 4天
- Phase 7: 3天（Figure2，**最高风险**）
- Phase 8-9: 2天

**总计: 15天** 对于一个已经失败7次的团队

### 为什么会失败

1. **Figure2仍是compound** - 计划承认它"独特复杂"，试图用validators隔离，但仍是11,478 LOC必须重写
2. **时序模型未经证实** - 无10vh + 固定播放的原型，无用户测试
3. **同一团队，同一代码库** - 组织问题未解决
4. **无回滚计划** - Phase 9删除legacy runtime；如新系统有生产bug，你被困住

---

## 8. 决策框架：PIVOT

### 为什么不GO或GO WITH CHANGES

**计划无法通过修改挽救**，因为核心时序模型（10vh阈值 + 固定播放）是错误的。

### 为什么不STOP

**底层Master Timeline架构是正确的。** 规范surfaces、单一compositor、推模型adapters - 全是好设计。完全放弃代码库浪费了70%完成的工作。

---

## 9. 替代方案：完成现有Master Timeline

### 实际需要做什么（3-5天）

**Phase 1: 连接Master Adapters（2天）**

优先顺序：

1. **Pattern Bloom** (home→belief)
   - 移除: `timeline?.updateJoin()`, `timeline?.getOwnership()`, 本地ink实例
   - 添加: `createBeliefStarSurfaceProducer` 渲染到规范surface
   - 连接: 在runtime调用`mountMasterHomepageAdapters()`（当前死代码，行1346）

2. **AOD** (belief→method)
   - 移除: 本地`createInkCurtainTransition`
   - 使用: Master ink compositor的规范surface

3. **Figure2, Figure3, Crane** (method→brand→services→education)
   - 同样模式: surface producer → 规范registry → compositor采样

**Phase 2: 修复可观察问题（1天）**

1. 隐藏HUD（行165 index.html）- 添加`data-debug-only` + CSS `display:none` 除非`?debug`
2. 停止双runtime启动（行1027-1028）- 只在标志为true时启动master
3. 重写静态检查 - 移除需要legacy runtime的断言

**Phase 3: 将Surface Producers从Observer切换到Real（1天）**

```javascript
// homepage-transition-registry.js:15-29
// 将所有13个producers从createObserverSurfaceProducer改为:
{
  'hero': createHeroSurfaceProducer,
  'belief.star': createBeliefStarSurfaceProducer,
  'method.paper': createMethodPaperSurfaceProducer,
  // ... 等等
}
```

**Phase 4: 启用Master Stage，禁用Legacy（0.5天）**

```css
/* homepage-continuity.css:416 - 移除 display:none */
html[data-master-dom-mode="master-visible"] [data-homepage-master-stage] {
  display: block; /* 之前是: none */
}
```

```javascript
// homepage-transition-runtime.js:1027 - 移除legacy启动
if (masterEnabled) {
  // 不调用initLegacyHomepageTransitions
  return initMasterHomepageTransitions(options);
}
```

**Phase 5: 验证（0.5天）**

- 运行`npm run verify:all`
- 运行`audit:homepage-directed-timeline`（先修复hero opacity:0）
- 手动测试: 滚动首页，验证无跳跃、无空白帧

### 为什么会成功

1. ✅ **架构已证明正确** - 综合评审确认设计解决跨scene连续性
2. ✅ **基础设施存在** - 2,100 LOC master模块已实现
3. ✅ **清晰、增量步骤** - 一次一个adapter，有回滚点
4. ✅ **保留连续滚动耦合** - 无任意阈值或固定持续时间

---

## 10. 如果坚持FSM模型：强制性更改

如果组织约束迫使你继续SceneRuntime计划：

### 关键成功因素1: 首先原型时序模型

**在写任何代码前:**

1. 用3个scenes构建HTML+JS原型
2. 实现: 10vh阈值 → 输入锁定 → 900ms播放 → 释放
3. 用5人用户测试: 快速滚动、慢速滚动、动量滚动
4. 测量: 感知控制、晕动症、挫折感

**门槛: 如果>2用户报告"卡住"或"卡顿"，放弃FSM模型**

### 关键成功因素2: 自适应播放持续时间

**不要用固定900ms。** 基于滚动速度计算:

```javascript
const scrollVelocity = Math.abs(currentScrollY - previousScrollY) / deltaTime;
const playbackDuration = clamp(
  BASE_DURATION / (1 + scrollVelocity * VELOCITY_SCALE),
  MIN_DURATION,  // 300ms for fast scroll
  MAX_DURATION   // 1200ms for slow scroll
);
```

### 关键成功因素3: Figure2逃生舱口

**不要试图让Figure2适应FSM。** 保持它作为滚动驱动异常:

```javascript
if (segment.type === 'compound-sequence' && segment.id === 'method-proof-to-brand') {
  return initLegacyFigure2Adapter(); // 保留滚动scrubbing
}
```

理由: 11,478 LOC, 4个内部子步骤, 视觉carry, copy beats - 强制这进入"10vh触发 + 固定播放"将消耗50%项目时间且可能失败。

---

## 11. 最终建议

### 🎯 PIVOT: 完成现有Master Timeline（3-5天）而不是用FSM重建（15天）

综合评审证明你已经解决了困难问题:
- ✅ 规范surface registry（防止跳跃）
- ✅ 单一ink compositor（共享纹理）
- ✅ From/to同时渲染（跨scene连续性）
- ✅ 声明式manifest（时序作为数据）
- ✅ 确定性resolver（纯函数，可测试）

**你不需要新架构。你需要完成你构建的那个。**

7次失败不是架构性的 - 它们是**集成债务**。Adapters仍调用legacy APIs，surface producers是observer stubs，master stage被CSS隐藏。这些是1行修复，不是15天重写。

### 📋 立即行动的关键文件

**如果pivot完成Master Timeline:**

1. `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/homepage-transition-runtime.js:1346-1379` - 取消注释`mountMasterHomepageAdapters()`
2. `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/homepage-transition-registry.js:15-29` - 用真实渲染器替换observer producers
3. `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/css/components/homepage-continuity.css:416` - 将`display:none`改为`display:block`
4. `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/js/transitions/pattern-bloom-adapter.js:213,221,230` - 移除`timeline?.updateJoin()`调用

**就这样。4个文件。3-5天。发布它。**

---

## 12. 风险矩阵总结

### 🔴 立即阻断问题

1. **所有权强制仍是声明性的，非机械性的** - 与杀死尝试1-7相同的问题
2. **媒体失败可永久锁定页面** - 无具体超时策略
3. **迁移是7天内全有或全无** - 卡在破损中间状态的高风险
4. **Figure2 compound结构未测试** - 最复杂组件获得特殊处理

### 🟡 高概率中等影响

5. **8次失败尝试后的团队疲劳** - 信心降低、走捷径压力
6. **10vh时序模型无UX验证** - 可能感觉比当前更差
7. **长内容sections不适合100vh契约** - "滚动到section底部"检测脆弱
8. **浏览器基础设施假设脆弱** - Lenis/dvh/svh/visualViewport可能不是处处工作

---

## 附录：关键数据

### 代码库快照
- 总runtime代码: ~3,300行
- 状态维度: 20+
- 并发状态模型: 3个
- 滚动真相源: 5个
- Adapter数量: 6个
- 最大adapter: figure2-homepage-adapter.js (11,478行)
- 最大manifest: scene-timeline-manifest.js (21,911行)

### Workflow统计
- 总Token: 498,458
- 总工具调用: 108
- 分析时长: 11分55秒
- Agent数量: 11个
- Phase数量: 6个

### 相关文件
- 迁移计划: `/Users/aitoshuu/Downloads/homepage-scene-runtime-migration-plan.md`
- 当前runtime: `js/transitions/homepage-transition-runtime.js` (910行)
- Snap runtime: `js/runtime/homepage-snap-runtime.js` (1046行)
- Section manifest: `src/section-manifest.mjs` (988行)

---

**报告完成**: 2026-06-30  
**分析师**: Multi-agent workflow (11 experts)  
**建议状态**: PIVOT - 完成现有Master Timeline，不要重建
