# React 重写项目总览

## 为什么重写

### 当前项目的问题
1. **双轨迁移太慢**：adapter-by-adapter 渐进迁移，剩余 ~10 个增量，每个需浏览器验证
2. **复杂度在错的地方**：adapter 注册机制 + 双轨共存 + 命令式 GSAP/ScrollTrigger
3. **测试困难**：需要 fake controller + fake driver，WebGL/video 无法 headless 测试
4. **技术债累积**：旧 runtime 保留，新 runtime 通过 flag 激活，两套系统共存

### React 重写的优势
1. **权责清晰**：`SceneRuntime` 统一 scene/segment、状态机、layer ownership
2. **可测试**：runtime reducer、segment resolver、进度派生、layer ownership 都可单测
3. **一次到位**：没有"旧 runtime vs 新 runtime"的双轨，直接交付新架构
4. **类型安全**：TypeScript 覆盖 scene graph、segment union、runtime event，重构风险低

## 策略：B+C 混合

### Phase 0: SceneRuntime 契约校准
**范围**：`scenes[] + segments[]`、FSM event table、layer ownership、debug overlay
**目标**：先解决前 7 次失败的根因：同一帧多个 owner 抢画面
**交付物**：可运行的 fake scenes contract spike，证明 `07-SCENE-RUNTIME-CONTRACT.md` 能在代码中执行。详见 `08-PHASE0-CONTRACT-SPIKE.md`

### Phase 1: 实验迁移（验证路线）
**范围**：hero → pattern-top → pattern-bottom → aod-animation → method-top → method-bottom
**目标**：验证 SceneRuntime 契约可行，视觉还原度 ≥ 80%，关键边界不再靠局部组件补丁
**交付物**：独立 React 项目，可运行的 hero → method 链路，带 runtime overlay

### Phase 2: 全量迁移（实验通过后）
**范围**：剩余所有动画（figure2/figure3/ttg/ph/crane）+ 所有章节  
**目标**：替换当前项目，默认页面移除旧 runtime  
**交付物**：完整首页，性能达标，测试覆盖

## 可复用资产评估

- ✅ **35% 可直接复用**：`src/sections/*.html` 文案、静态资源（video/image）
- ⚠️ **20% 需包装**：Ink/Pattern/Figure canvas 或 WebGL factory → React adapter
- ❌ **45% 必须重写**：runtime orchestration、handoff receiver、全局 reveal 介入路径

## 核心架构原则

### 借鉴 Shopify

1. **中央 scene state**：所有视觉层读取同一个 `SceneRuntimeState`
2. **稳定 scene identity**：每一幕只有一个 canonical id，不在 adapter 内临时发明中间幕
3. **layer ownership**：`visual/copy/canvas/mask/media` 每帧只有一个 owner
4. **原子提交**：segment complete 与 target scene presentation commit 是同一事务
5. **不搬真实 DOM**：transition layer 只画视觉桥，不 adopt/restore native copy

### 借鉴 Baseline

1. **常量文档化**：所有 magic number 提取到 `*-constants.ts`，带注释
2. **纯函数优先**：滚动 intent、scene bounds、segment progress、layer view model 都可单测
3. **入口清爽**：`App.tsx` 只挂 runtime、manifest 和 scene components
4. **组件自包含**：每个 scene 管自己的视觉细节，但不能推进全局 scene commit
5. **明确不抄**：不复制 baseline 的容器内视频播放范式，视频只是 `media-animation` adapter

### 本项目自己的硬约束

1. **滚动只做两件事**：普通文案阅读；scene 尾部滚动 10vh 触发 segment
2. **转场不 scrub**：墨滴、compound sequence、media animation 不由 scroll position 驱动
3. **只有两类核心对象**：`scene` 和 `segment`
4. **固定 FSM**：`IDLE -> ARMED -> SNAP_LOCKING -> PLAYING -> PRESENTING -> RELEASING -> IDLE`

## 文档结构

- `00-OVERVIEW.md` — 本文档，总览
- `01-STATE-MACHINE.md` — 新的固定状态机规范
- `02-TRANSITION-MANIFEST.md` — canonical scenes + segments 清单
- `03-ARCHITECTURE.md` — React 技术架构设计
- `04-PHASE1-EXPERIMENT.md` — 实验迁移详细计划（hero → method）
- `05-REUSABLE-ASSETS.md` — 当前项目可复用资产清单
- `06-TESTING-STRATEGY.md` — 测试策略
- `07-SCENE-RUNTIME-CONTRACT.md` — SceneRuntime 最高优先级契约
- `08-PHASE0-CONTRACT-SPIKE.md` — Phase 0 契约验证计划

## 下一步

先阅读 `07-SCENE-RUNTIME-CONTRACT.md`。其他文档如果与它冲突，以 `07` 为准。
