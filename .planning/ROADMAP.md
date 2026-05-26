# Roadmap

## Phase 0: 工程初始化与 POC 记录

- 创建 uni-app 工程骨架。
- 配置 AppID、pages、manifest、全局样式。
- 解包并评估 `tongye_quiet_intelligence_shader_repack.zip`。
- 记录 shader POC 结果与 fallback 策略。

## Phase 1: 视觉框架与基础组件

- `BrandHeader`、`SceneShell`、`SceneBackdrop`、`GlassCard`、`CtaButton`、`IconBadge`、`StepRail`、`ScrollIndicator`。
- 全局 token、混入和移动端排版。

## Phase 2: 全量场景落地

- `S00` 与 `S01-S11` 场景组件。
- `SceneMethod`、`SceneProjectGallery`、`SceneServicePackages` 必做。

## Phase 3: CTA、滚动与表单闭环

- `sceneRegistry` 驱动 CTA。
- 同页滚动、modal、服务包 expand、leadIntent。
- LeadForm 校验与 mock 提交。

## Phase 4: 验证与交付

- 安装依赖。
- `pnpm run build:mp-weixin`。
- 微信开发者工具 / 真机滚动、CTA、表单、shader 性能验证。
- secret 静态检查。
