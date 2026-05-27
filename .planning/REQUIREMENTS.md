# Requirements

## Validated

- 初始化可运行、可构建的 uni-app Vue 3 + TypeScript 工程。
- 配置 `mp-weixin.appid` 为 `wx5f0a423b84cafbef`。
- 首页包含 `S00` 与 `S01-S11`。
- `sceneRegistry` 覆盖场景标题、卡片数量、CTA、背景 mood、shader 映射和截图验收点。
- 所有 CTA 必须有同页 `scroll`、`modal`、`expand` 或 `submit` 结果。
- 服务包包含 `audience / includes / outcome / cta`。
- LeadForm 包含校验、loading、success、error、8 秒重复提交保护。
- `LEAD_API_MODE` 默认 `mock`，页面清楚标记演示提交。
- 小程序沉浸屏默认使用 `ShaderRuntimeBackdrop`：组件内部运行 WebGL shader，用离屏 canvas 导出临时帧，再以普通 image 显示，不把原生 canvas 直接铺在 UI 下方。
- Pretext-inspired 文字动效使用 `view/text + CSS transition`，不新增第二实时 canvas。

## Constraints

- 参考原型顶部系统 UI 只作为安全区依据，不作为页面绘制内容。
- 背景风格保持黑曜石、暖金流线、米白标题、玻璃卡片和克制绿点。
- 375/390/430 宽度下标题、按钮、表单和卡片不能溢出。
- 前端不得包含 secret、webhook、Authorization token。
