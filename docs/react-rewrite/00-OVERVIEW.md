# React 重写项目总览

## 为什么重写

### 当前项目的问题
1. **双轨迁移太慢**：adapter-by-adapter 渐进迁移，剩余 ~10 个增量，每个需浏览器验证
2. **复杂度在错的地方**：adapter 注册机制 + 双轨共存 + 命令式 GSAP/ScrollTrigger
3. **测试困难**：需要 fake controller + fake driver，WebGL/video 无法 headless 测试
4. **技术债累积**：旧 runtime 保留，新 runtime 通过 flag 激活，两套系统共存

### React 重写的优势
1. **架构清晰**：`scrollPx` → 纯函数派生进度 → 显式 props 分发，无隐藏状态
2. **可测试**：纯函数可单测，组件用 JSDOM 测，进度计算与渲染分离
3. **一次到位**：没有"旧 runtime vs 新 runtime"的双轨，直接交付新架构
4. **类型安全**：TypeScript 覆盖全量代码，重构风险低

## 策略：B+C 混合

### Phase 1: 实验迁移（验证路线）
**范围**：hero → tod (pattern-bloom) 动画 80% + method 文案提前入场  
**目标**：验证 React 架构可行性，视觉还原度 ≥ 80%，工作量可控（7-11 天）  
**交付物**：独立 React 项目，可运行的 hero → method 链路

### Phase 2: 全量迁移（实验通过后）
**范围**：剩余所有动画（figure2/figure3/ttg/ph/crane）+ 所有章节  
**目标**：替换当前项目，默认页面移除旧 runtime  
**交付物**：完整首页，性能达标，测试覆盖

## 可复用资产评估

- ✅ **35% 可直接复用**：copy/content (src/copy/*.mjs)、静态资源（video/image）
- ⚠️ **20% 需包装**：canvas 渲染逻辑（pattern-bloom, figure2 WebGL）→ React hooks
- ❌ **45% 必须重写**：整个 runtime orchestration、GSAP ScrollTrigger 路径

## 核心架构原则（借鉴 Baseline）

1. **单一进度源**：`scrollPx` → 纯函数派生所有进度值 → 分发给组件
2. **显式 props**：无全局 Context（除非必要如 theme），数据流清晰可追踪
3. **常量文档化**：所有 magic number 提取到 `*-constants.ts`，带注释
4. **纯函数优先**：进度计算、工具函数都是纯函数，可单测
5. **组件自包含**：每个 section 独立文件，props 接口清晰

## 文档结构

- `00-OVERVIEW.md` — 本文档，总览
- `01-STATE-MACHINE.md` — 新的固定状态机规范
- `02-TRANSITION-MANIFEST.md` — 完整转场清单（19 个场景）
- `03-ARCHITECTURE.md` — React 技术架构设计
- `04-PHASE1-EXPERIMENT.md` — 实验迁移详细计划（hero → method）
- `05-REUSABLE-ASSETS.md` — 当前项目可复用资产清单
- `06-TESTING-STRATEGY.md` — 测试策略

## 下一步

阅读 `01-STATE-MACHINE.md` 了解新的状态机模型，它是整个重写的核心约定。
