# 同野观幂 UniApp 小程序

## Goal

落地一个微信小程序优先的沉浸式品牌展厅与服务转化首页。首版只注册首页，包含 `S00` 进入态与 `S01-S11` 长滚动 11 屏，视觉参考 `reference/prototype/*.png`，施工契约参考 `docs/tongye_guanmii_uniapp_implementation_plan.md`。

## Product Shape

- 技术栈：uni-app / Vue 3 / TypeScript / SCSS。
- 平台：MP-WEIXIN 优先，H5 用于本地预览。
- AppID：`wx5f0a423b84cafbef`。
- 页面：`pages/index/index.vue`。
- 转化链路：同页 scroll / modal / expand / submit 闭环。

## Non Goals

- 不在首版直接接入 React TSX shader。
- 不在 MP-WEIXIN v1 引入真实 `@chenglou/pretext` runtime。
- 不绘制假的微信状态栏或右上角胶囊。
- 不在前端暴露 webhook、token、secret。

## Source Of Truth

- P0：`docs/tongye_guanmii_uniapp_implementation_plan.md`
- P0：`docs/tongye_guanmii_weapp_immersive_design.md`
- P0：`reference/prototype/*.png`
- P1：`reference/component/tongye_quiet_intelligence_shader_repack.zip`

## Current Execution Mode

本项目按 Superpowers / GSD 默认值执行：粗粒度阶段、并行思路、保留 `.planning/` 文档、每阶段执行后验证。
