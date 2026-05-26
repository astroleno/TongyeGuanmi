# 同野观幂 UniApp 小程序实施计划：施工契约版

> 修订日期：2026-05-26  
> 方法：Superpowers / GSD 风格的「研究 -> 计划 -> 验证」落地版  
> 目标平台：uni-app / Vue 3 / TypeScript / 微信小程序优先  
> 小程序 AppID：`wx5f0a423b84cafbef`

---

## 1. 信息源优先级与范围决策

### 1.1 信息源优先级

| 优先级 | 信息源 | 用途 | 决策 |
|---|---|---|---|
| P0 | `docs/tongye_guanmii_weapp_immersive_design.md` | 功能范围、叙事结构、MVP 必做项 | 作为施工范围主依据 |
| P0 | `reference/prototype/*.png` | 高保真视觉、排版、质感、节奏 | 作为视觉验收主依据 |
| P0 | 微信小程序真机/开发者工具限制 | canvas、video、safe area、表单、包体积 | 平台限制优先于视觉理想 |
| P1 | `reference/component/tongye_quiet_intelligence_shader_repack.zip` | 主 shader 增强方案 | 视觉与业务映射最完整，Phase 0 优先 POC |
| P2 | `reference/component/*.tsx` shader | H5 视觉参考、shader 参数灵感 | 不作为小程序首版直接接入对象 |
| P2 | Variable Typographic ASCII | 字符纹理参考 | 只影响噪点、字符纹理、局部氛围，不作为 shader 候选 |
| P2 | Illustrated Manuscript | 文本互动参考 | 只影响文字进入、悬停/触摸反馈、段落节奏，不作为 shader 候选 |
| P2 | Pretext Emotional Text / `@chenglou/pretext` | 关键标题字符布局、情绪文字参考 | H5 可研究真 runtime；MP-WEIXIN v1 只转译为轻量 `view/text` 动效 |

### 1.2 参考资产分级

| 分级 | 资产 | 定位 | 施工使用方式 |
|---|---|---|---|
| 高保真视觉基准 | `reference/prototype/*.png` | 决定页面气质、标题尺度、卡片质感、CTA 形态 | 每个 scene 截图验收必须对照它 |
| 施工方向 | `docs/tongye_guanmii_weapp_immersive_design.md` | 决定 S00-S11 范围、文案、服务包、方法论、项目展廊 | 功能范围不得被原型 9 图压缩 |
| 主 shader 候选 | `reference/component/tongye_quiet_intelligence_shader_repack.zip` | 首选增强方案，视觉和业务映射最完整 | Phase 0 解包 POC，通过后进入 `ShaderCanvasBackdrop` |
| H5 视觉参考 | `tongye-neuro-orbital-field-shader.tsx`、`interactive-warp-noise-shader.tsx` | 参考流场、噪声、交互反馈、场景映射 | 只用于 H5 对比和参数灵感，不直接接入 MP-WEIXIN |
| 字符纹理参考 | Variable Typographic ASCII | 字符化纹理、低密度 typographic noise | 可转译为静态纹理、poster 或 CSS/canvas 轻量叠层 |
| 文本互动参考 | Illustrated Manuscript | 文本互动、阅读节奏、局部解释层 | 可转译为标题入场、卡片说明展开、触摸反馈 |
| 文字布局/情绪动效参考 | Pretext Emotional Text / `@chenglou/pretext` | 精确文字布局与字符情绪化显影参考 | H5 可接真 Pretext；小程序 v1 只做关键标题轻量字符层 |

硬规则：

- `tongye_quiet_intelligence_shader_repack.zip` 是唯一进入 MP-WEIXIN shader POC 的首选方案。
- 两个 TSX shader 不能被实现者误当小程序首版接入对象。
- Variable Typographic ASCII 和 Illustrated Manuscript 不是 shader 候选，只是视觉/交互参考。
- Pretext / Emotional Text 不是小程序首版实时文字引擎，不新增第二个实时 canvas；v1 只用于少数关键标题的轻量字符动效。

### 1.3 v1 范围决策表

| 决策点 | 结论 | 原因 |
|---|---|---|
| 首版屏数 | `S01-S11` 为首页长滚动 11 屏；`S00` 为进入/Loading 状态，也必须实现 | 对齐设计文档 MVP「首页长滚动 11 屏」，同时保留 S00 的进入仪式 |
| 原型 9 张如何使用 | 9 张原型是视觉基准，不是功能范围上限 | 原型缺少方法论、项目展廊、服务转化细分，但设计文档要求保留 |
| 首版页面数 | 只注册首页 `pages/index/index.vue` | CTA 先通过 scroll、expand、modal 闭环，避免多页分散 |
| 项目详情页 | 不做独立页面 | 项目卡片点击打开 modal 或展开详情 |
| 方法论 | 必做 `SceneMethod` | 否则会削弱“有方法”的品牌可信度 |
| 项目展廊 | 必做 `SceneProjectGallery` | 否则会削弱“有交付”的证据 |
| 服务转化 | 必做 `SceneServicePackages` | 解决服务包、适用对象、包含内容、转化 CTA 缺口 |
| Shader | Phase 0 前置 POC，POC 通过后作为 v1 增强层 | 不把可行性拖到后期；不过关时不阻塞 static/video fallback |

### 1.4 v1 必须交付

- `S00` 进入页 / Loading / 声音选择状态。
- `S01-S11` 首页长滚动 11 屏。
- 高保真原型中的深色展厅、暖金流线、米白大标题、玻璃卡片、底部探索提示。
- `SceneMethod`、`SceneProjectGallery`、`SceneServicePackages` 不得后置。
- CTA 路由闭环：不出现无目标按钮。
- 服务包折叠区：`audience / includes / outcome / cta` 完整。
- 预约表单：校验、重复提交保护、mock/真实 API 模式标识。
- MP-WEIXIN 真机 POC：优先使用 `tongye_quiet_intelligence_shader_repack.zip` 做 `canvas 背景 + 上层 scroll/text/form`。
- Pretext-inspired 关键标题动效：v1 使用 `pretextMode="inspired"`，真实 `@chenglou/pretext` runtime 预留 H5 和 Post-v1 POC 路径。

### 1.5 施工契约索引

| 契约 | 文档位置 | 阻塞阶段 |
|---|---|---|
| 参考资产分级 | `1.2` | Phase 0 |
| 顶部胶囊安全区 | `3.3` | Phase 1 |
| Backdrop/shader POC | `4.3` | Phase 0 |
| Typographic Intelligence Layer | `4.4` | Phase 5 |
| Shader 9 状态到 11 屏映射 | `4.5` | Phase 0/5 |
| Scene Registry | `5` | Phase 2 |
| CTA 路由表 | `6` | Phase 3 |
| 服务包字段契约 | `7.1` | Phase 2 |
| Lead API Contract | `8` | Phase 0/4 |
| 滚动与状态契约 | `9` | Phase 3 |
| 验收矩阵 | `11` | Phase 6 |

### 1.6 非目标

- 不直接把 React TSX shader 接入微信小程序首版。
- 不首版实现完整 WebGL 大场景。
- 不在 MP-WEIXIN v1 直接引入 `@chenglou/pretext` runtime 或照搬 Pretext showcase 原版交互。
- 不在小程序包内放大体积视频素材。
- 不伪造微信系统状态栏和右上角胶囊按钮。
- 不在前端暴露 webhook、token、secret。

---

## 2. 技术路线

### 2.1 主栈

- `uni-app`
- `Vue 3`
- `TypeScript`
- `SCSS`
- 微信小程序优先，H5 作为预览和 shader 对比环境

### 2.2 工程结构

```txt
src/
  App.vue
  main.ts
  manifest.json
  pages.json
  uni.scss
  pages/
    index/
      index.vue
  components/
    app/
      BrandHeader.vue
      ScrollIndicator.vue
      WeappSafeArea.vue
    backdrop/
      SceneBackdrop.vue
      StaticFieldBackdrop.vue
      ShaderCanvasBackdrop.vue
      VideoBackdrop.vue
    fx/
      EmotionalTitleLayer.vue
      TypographicFieldOverlay.vue
    scenes/
      SceneShell.vue
      SceneEntry.vue
      SceneHero.vue
      SceneBrandMeaning.vue
      SceneFieldMap.vue
      SceneOrganization.vue
      SceneCanvasAgent.vue
      SceneVideoPipeline.vue
      ScenePersonalCapability.vue
      SceneMethod.vue
      SceneProjectGallery.vue
      SceneServicePackages.vue
      SceneLead.vue
    ui/
      GlassCard.vue
      CtaButton.vue
      IconBadge.vue
      StepRail.vue
      ProjectCard.vue
      ServiceCard.vue
      LeadForm.vue
  composables/
    usePageScroll.ts
    useSceneMetrics.ts
    useLeadForm.ts
  data/
    sceneRegistry.ts
    services.ts
    projects.ts
  services/
    leadApi.ts
  styles/
    tokens.scss
    mixins.scss
  types/
    scene.ts
    lead.ts
```

### 2.3 AppID 配置

`src/manifest.json` 必须配置：

```json
{
  "mp-weixin": {
    "appid": "wx5f0a423b84cafbef"
  }
}
```

验收时以微信开发者工具读取到的 AppID 为准。

---

## 3. 视觉与顶部安全区契约

### 3.1 设计 token

```scss
:root,
page {
  --c-obsidian: #080807;
  --c-ink: #121412;
  --c-ivory: #e9e2d2;
  --c-warm-gold: #c7b17a;
  --c-moss: #123a32;
  --c-ash: #7c817b;
  --c-silver: #b8b9b3;
  --c-clay: #8b5e45;
  --c-acid-dot: #c8f21c;

  --font-sans: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --ease-cinematic: cubic-bezier(.16, 1, .3, 1);
  --ease-soft: cubic-bezier(.22, .61, .36, 1);
}
```

### 3.2 原型视觉必须保留

- 黑曜石背景，不使用蓝紫 AI 模板。
- 米白大标题，中文为主，英文只作小标签。
- 半透明玻璃卡片，细边框，暖金边缘光。
- 小面积荧光绿/暖金作为状态点和进度强调。
- 米白胶囊 CTA，右侧箭头。
- 底部「向下探索」提示。

### 3.3 顶部系统 UI 规则

原型图中的时间、信号、电量、右上角胶囊只用于安全区参考，不作为前端绘制内容。

顶部胶囊安全区施工契约：

| 项 | 规则 | 验收 |
|---|---|---|
| 胶囊数据 | `BrandHeader` 使用 `uni.getMenuButtonBoundingClientRect()` | 开发者工具和真机都能取到位置 |
| 系统信息 | 使用 `uni.getSystemInfoSync()` 计算 status bar 和 safe area | iOS/Android 顶部留白正常 |
| 绘制边界 | 不绘制假的时间、信号、电量、胶囊 | 页面里没有伪系统 UI |
| 品牌位置 | 品牌名在左上安全区内，右侧避开胶囊 | 真机截图不重叠 |
| 验收基准 | 原型顶部只作参考，最终以微信宿主截图为准 | 截图验收不因原型状态栏差异返工 |

---

## 4. 背景与 Shader 契约

### 4.1 背景抽象接口

所有场景只依赖 `SceneBackdrop`：

```txt
SceneBackdrop
  ├─ StaticFieldBackdrop   # fallback / 转化区低风险背景
  ├─ VideoBackdrop         # CDN poster/video 可用后启用
  └─ ShaderCanvasBackdrop  # MP-WEIXIN 默认增强背景
```

组件 props：

```ts
export type BackdropVariant = "static" | "video" | "shader"

export type SceneBackdropProps = {
  sceneId: string
  sceneIndex: number
  active: boolean
  progress: number
  variant: BackdropVariant
}
```

### 4.2 Shader 候选结论

| 参考 | 小程序 v1 结论 | 使用方式 |
|---|---|---|
| `tongye_quiet_intelligence_shader_repack.zip` | 主 shader 候选，首选增强方案 | Phase 0 优先解包并评估 `uni-app-example/TongyeShaderBackdrop.vue` |
| `tongye-neuro-orbital-field-shader.tsx` | 不直接接入 MP-WEIXIN v1 | 使用 WebGL2 / GLSL 300，作为 H5/视觉参考 |
| `interactive-warp-noise-shader.tsx` | 不直接接入 MP-WEIXIN v1 | 依赖 React 与 `@paper-design/shaders-react`，作为交互和噪声参考 |
| Variable Typographic ASCII | 不是 shader 候选 | 作为字符纹理/噪点叠层参考 |
| Illustrated Manuscript | 不是 shader 候选 | 作为文本互动和解释层节奏参考 |
| Pretext Emotional Text / `@chenglou/pretext` | 不是 shader 候选，不作为 MP-WEIXIN v1 runtime | H5 可做真 Pretext 文字布局实验；小程序 v1 转译为轻量字符标题层 |

### 4.3 Phase 0 Shader POC 门槛

必须在正式施工前完成一个最小 POC：

```txt
优先实现：
  解包 tongye_quiet_intelligence_shader_repack.zip
  复用/改造 uni-app-example/TongyeShaderBackdrop.vue

页面结构：
  scroll-view 或页面原生滚动
  canvas 背景层
  上层 text / button / input / textarea / form

验证动作：
  1. 微信开发者工具预览
  2. 真机扫码预览
  3. 滚动页面
  4. 点击 CTA
  5. 聚焦 input/textarea
  6. 切后台再返回
```

通过标准：

- canvas 不盖住文字、按钮、表单。
- canvas 不抢触摸，滚动和输入正常。
- 表单输入法弹起后布局不崩。
- 切后台/返回后背景可恢复。
- 低端机没有明显掉帧或发热。

失败处理：

- MP-WEIXIN v1 可通过 `VITE_BACKDROP_VARIANT=static` 禁用 `ShaderCanvasBackdrop`。
- H5 可继续保留 shader 对比。
- 小程序使用 `StaticFieldBackdrop` 或 `VideoBackdrop`。
- Variable Typographic ASCII 可降级为静态字符纹理叠层；Illustrated Manuscript 可降级为普通文字展开动效。

### 4.4 Typographic Intelligence Layer 契约

Pretext / Emotional Text 的定位是文字层参考，不是第二套实时渲染主引擎。

分层原则：

```txt
底层：Quiet Intelligence shader / static / video fallback
  负责场、噪声、轨道、scroll morph

文字增强层：Pretext-inspired Typographic Intelligence Layer
  负责关键标题的字符显影、轻微聚散、对齐、落定

内容层：原生 view/text/card/form
  负责正文、服务卡、CTA、LeadForm
```

平台规则：

- MP-WEIXIN v1 不直接引入 `@chenglou/pretext` runtime。
- MP-WEIXIN v1 不新增第二个实时 canvas 绘制文字；优先使用 `view/text + CSS transform/opacity/transition`。
- H5 可以接入真 Pretext，验证更复杂的 layout / line range / WebGL 或 SVG 文字实验。
- Post-v1 POC 才评估小程序 Pretext adapter，必须验证 Canvas 2D measurement、`Intl.Segmenter` 或 polyfill、包体积、真机性能。
- 不做偏旁拆解、glyph morph 等 Pretext 本体不提供的能力；小程序只做字符级位移、透明度、字距、注释线等可控效果。

模式开关：

```ts
export type PretextMode = "inspired" | "h5-runtime" | "mp-runtime-poc"
```

| 模式 | 使用平台 | 规则 |
|---|---|---|
| `inspired` | MP-WEIXIN v1 默认 | 不安装 `@chenglou/pretext`，只用原生 `view/text` 和 CSS transition |
| `h5-runtime` | H5 预览/官网增强 | 可以安装并运行 `@chenglou/pretext`，用于真实 layout 实验 |
| `mp-runtime-poc` | Post-v1 小程序专项 POC | 不进入发布路径，只验证真机兼容性和性能 |

`pretextMode` 默认为 `inspired`。发布版 MP-WEIXIN 不允许配置为 `mp-runtime-poc`。

组件 props：

```ts
export type EmotionalTextMode = "none" | "emerge" | "scatter" | "align" | "settle"
export type LineBreakPolicy = "manual" | "native" | "precomputed"

export type EmotionalTitleLayerProps = {
  text: string
  lines?: string[]
  maxLines: number
  lineBreakPolicy: LineBreakPolicy
  sceneId: string
  active: boolean
  progress: number
  mode: EmotionalTextMode
}
```

换行规则：

- v1 优先使用 `lines` 手动断行，避免字符拆分后破坏原生 `<text>` 换行。
- `maxLines` 必须由 scene 明确给出；标题超过限制时优先改文案或缩短断行，不让组件临时猜测。
- 中英混排标题必须显式配置 `lines`，例如“企业级无限画布平台”“个人 vibe coding 培训”等。
- `lineBreakPolicy: "precomputed"` 只用于 H5 runtime 或 Post-v1 POC；MP-WEIXIN v1 不在滚动中做复杂排版计算。

允许使用范围：

| 场景 | v1 文字动效 | 规则 |
|---|---|---|
| `hero` | `emerge` | 标题从噪声感位移中聚合，进入后稳定 |
| `about` | `align` | “同野 / 观幂”关键词轻微对齐、注释线显现 |
| `field-map` | `scatter` | “四类能力”短暂四向展开，再回到标题 |
| `method` | `align` | 五步骤从一句话落成结构，不重排正文 |
| `service-packages` | `none` | 服务包保持稳定可读 |
| `lead` | `settle` 或 `none` | 表单区只允许极轻落定，不做扰动 |

性能与交互规则：

- `pages/index/index.vue` 统一把 `sceneProgressMap` 派发给文字层；组件不自行查询滚动。
- 不在滚动中逐帧更新每个字符；按 `dispersed / gathering / settled` 等少数状态切换，用 CSS transition 完成过渡。
- 字符层默认 `pointer-events: none`，不得抢 scroll、CTA、input、textarea、form。
- `TypographicFieldOverlay` 单屏 glyph 数量不超过 `36`，整体透明度不超过 `0.12`。
- `TypographicFieldOverlay` 只允许在 `hero / about / method / projects` 开启；`service-packages / lead` 默认关闭。
- 375 / 390 / 430 宽度下标题不得溢出或覆盖后续内容。
- 低端机、低电量或 `typographicFxEnabled=false` 时退回普通标题。

Post-v1 `mp-runtime-poc` 验收清单：

| 检查项 | 通过标准 |
|---|---|
| `Intl.Segmenter` | 真机存在，或 polyfill 后包体积可接受 |
| Canvas 2D `measureText()` | iOS / Android / 开发者工具误差在标题断行可接受范围内 |
| `prepare()` | 中文、英文、中英混排标题初始化不阻塞首屏 |
| `layout()` | 滚动过程中不触发明显卡顿，不反复测量整段文本 |
| 包体积 | 引入 runtime 后主包体积仍满足微信限制，且不挤占业务素材 |
| 低端机滚动 | 连续滚动 30 秒无明显掉帧、发热、闪烁 |
| 输入框聚焦 | LeadForm 聚焦、输入法弹起、提交流程不受影响 |
| 发布隔离 | POC 代码有独立开关，不能进入 MP-WEIXIN 发布路径 |

### 4.5 Shader 9 状态到 11 屏映射

`tongye_quiet_intelligence_shader_repack.zip` 当前是 9 个 shader 状态；首页施工范围是 `S01-S11` 11 屏。v1 不强制把 shader 扩成 11 个独立状态。

v1 决策：

- `entry / hero` 共享 `shader 0` 的暗场和暖金光流。
- `about` 到 `method` 使用 `shader 1-7`。
- `projects / service-packages / lead` 共享 `shader 8`，作为低动态转化背景。
- `shader 8` 在转化区按 `calm conversion mode` 处理：降低粒子、轨道、噪声和亮度变化，优先保护项目卡、服务包和表单可读性。

Post-v1 才评估扩展 zip shader：

```txt
SECTION_COUNT
sceneA(float idx)
sceneB(float idx)
sceneTint(float idx)
demo section count
```

如果扩展到 11 状态，必须重新完成 Phase 0 的 canvas + scroll/text/form POC。

---

## 5. Scene Registry

所有场景必须从 `src/data/sceneRegistry.ts` 渲染或至少与其保持字段一致。

```ts
export type SceneCtaAction = "scroll" | "expand" | "modal" | "submit" | "external" | "disabled"

export type SceneRegistryItem = {
  id: string
  order: number
  component: string
  title: string
  titleLines?: string[]
  titleMaxLines?: number
  subtitle?: string
  body?: string[]
  cards?: number
  ctaLabel?: string
  ctaAction?: SceneCtaAction
  ctaTarget?: string
  prototypeRef?: string
  backdropMood: string
  shaderScene?: number
  textFx?: {
    mode: "none" | "emerge" | "scatter" | "align" | "settle"
    target: "title" | "keywords" | "steps"
    lineBreakPolicy?: "manual" | "native" | "precomputed"
  }
  screenshotCheck: string
}
```

`textFx` 只允许声明关键标题或关键词动效，不用于正文、服务卡和表单。未声明时等同 `mode: "none"`。启用 `textFx` 的标题必须同时配置 `titleLines` 和 `titleMaxLines`；中英混排标题不得让组件自行推断断行。

| ID | 组件 | 标题 | 内容/卡片 | CTA | 交互 | 背景/Shader | 原型参考 | 截图验收点 |
|---|---|---|---|---|---|---|---|---|
| `entry` | `SceneEntry` | 同野观幂 / AI 现场 | 品牌进入、Sound Off 默认 | 进入 | scroll 到 `hero` | 安静黑曜石、暖金细线 / shader 0 | 设计文档 S00 | 进入态不遮挡微信胶囊 |
| `hero` | `SceneHero` | 让 AI 进入真实的现场 | 面向组织与个人能力建设的 AI 转型咨询公司 | 开始了解 | scroll 到 `about` | 暖金光流 / shader 0 | prototype 1 | 大标题不超过 3 行 |
| `about` | `SceneBrandMeaning` | 从黑箱，到现场 | 同野、观幂两张解释卡 | 继续了解 | scroll 到 `field-map` | 田野/系统结构 / shader 1 | prototype 2 | 两张玻璃卡片完整可读 |
| `field-map` | `SceneFieldMap` | 四类能力，一个现场 | 组织、产品、内容、个人 4 卡 | 查看详细服务 | scroll 到 `organization` | 无限画布四区 / shader 2 | prototype 3 | 4 张服务卡不溢出 |
| `organization` | `SceneOrganization` | 组织 AI 转型 | 管理层共识、业务流程梳理、工具实施、陪跑机制 | 预约咨询 | scroll 到 `lead` | 会议/流程线 / shader 3 | prototype 4 | 四宫格卡片可点击态清楚 |
| `canvas-agent` | `SceneCanvasAgent` | 企业级无限画布平台 | 项目隔离、固定工作流入口、结果回写、账号与权限 | 查看方案 | modal 展示方案摘要 | 节点画布 / shader 4 | prototype 5 | 节点线条不压标题 |
| `video-pipeline` | `SceneVideoPipeline` | 生产级 AIGC 视频管线 | 5 个前端节点，映射 7 步生产流程 | 浏览案例 | modal 展示案例摘要 | 胶片/管线 / shader 5 | prototype 6 | StepRail 在窄屏不挤压 |
| `personal` | `ScenePersonalCapability` | 个人现场 | 作品集、vibe coding、研究表达、海外准备 | 查看个人服务 | scroll 到 `service-packages` | 温暖学习/表达空间 / shader 6 | prototype 7/8 | 英文词与中文标题不换行异常 |
| `method` | `SceneMethod` | 我们把 AI 带进真实流程 | 看见现场、共创场景、建立工具、训练能力、陪跑落地 | 看项目样片 | scroll 到 `projects` | 五层系统图 / shader 7 | 设计文档 S08 | 五步骤在一屏内节奏清楚 |
| `projects` | `SceneProjectGallery` | 项目不是陈列 | 5 个项目卡：画布、视频、转型、作品集、品牌内容 | 查看样片 | modal/expand | 数字展廊 / shader 8 | 设计文档 S09 | 当前聚焦卡片信息完整 |
| `service-packages` | `SceneServicePackages` | 选择一种合作方式 | 4 个服务包，可展开 | 预约场景共创 | expand + scroll 到 `lead` | 克制深色卡片 / shader 8 | 设计文档 S10 | audience/includes/outcome 都可见 |
| `lead` | `SceneLead` | 预约一次场景共创 | LeadForm | 提交表单 | submit | 安静路径线 / shader 8 | prototype 9 | 输入法弹起后仍可提交 |

---

## 6. CTA 路由表

首版只注册首页，因此每个 CTA 必须在同页闭环。

| CTA 文案 | 所在场景 | action | target | 结果 |
|---|---|---|---|---|
| 进入 | `entry` | `scroll` | `hero` | 进入长页 |
| 开始了解 | `hero` | `scroll` | `about` | 滚到 About |
| 继续了解 | `about` | `scroll` | `field-map` | 滚到四类能力 |
| 查看详细服务 | `field-map` | `scroll` | `service-packages` | 滚到服务包 |
| 预约咨询 | `organization` | `scroll` | `lead` | 滚到预约表单，并设置 direction=`enterprise` |
| 查看方案 | `canvas-agent` | `modal` | `canvas-agent-summary` | 打开方案摘要 modal |
| 浏览案例 | `video-pipeline` | `modal` | `aigc-video-cases` | 打开案例/样片摘要 modal |
| 查看个人服务 | `personal` | `scroll` | `service-packages` | 滚到服务包，并高亮个人能力建设 |
| 看项目样片 | `method` | `scroll` | `projects` | 滚到项目展廊 |
| 查看样片 | `projects` | `modal` | `project-detail` | 打开当前项目卡详情 |
| 预约场景共创 | `service-packages` | `scroll` | `lead` | 滚到表单，并带入服务方向 |
| 提交表单 | `lead` | `submit` | `submitLead` | 校验并提交 |

禁止项：

- 不允许 `disabled` CTA 出现在发布版。
- 不允许按钮只改变视觉状态但无结果。
- 外链必须经过用户确认，并遵守微信小程序业务域名限制。

---

## 7. 数据结构契约

### 7.1 服务包

```ts
export type ServicePackage = {
  id: "ai-transformation" | "canvas-agent" | "aigc-video" | "personal-capability"
  title: string
  subtitle: string
  audience: string
  includes: string[]
  outcome: string
  cta: string
}
```

服务包施工契约：

| 字段 | 必填 | 施工规则 | 验收 |
|---|---|---|---|
| `title` | 是 | 服务名必须清楚指向合作方式 | 用户能判断要不要点开 |
| `subtitle` | 是 | 一句话解释价值，不写空泛口号 | 20 字左右可读 |
| `audience` | 是 | 写明适合对象 | 企业/个人边界清楚 |
| `includes` | 是 | 3-5 条具体包含内容 | 展开后不溢出 |
| `outcome` | 是 | 写明交付结果或能力结果 | 不停留在过程描述 |
| `cta` | 是 | 统一路由到 `lead`，并带 `direction` | 表单方向自动带入 |

服务包必须包含：

1. 企业 AI 场景共创与落地陪跑
2. 智能工作空间与 Agent 原型
3. AIGC 视频与品牌内容管线
4. 个人 AI 能力建设

### 7.2 AIGC 视频管线 7 -> 5 映射

设计文档原始 7 步：

```txt
Brief -> Script -> Storyboard -> Prompt -> Generate -> Edit -> Delivery
```

前端首版 5 节点：

| 前端节点 | 映射设计文档步骤 | 显示文案 |
|---|---|---|
| 01 | Brief + Script | 脚本策略 |
| 02 | Storyboard | 分镜设计 |
| 03 | Prompt + Generate image | 图像生成 |
| 04 | Generate video | 视频生成 |
| 05 | Edit + Delivery | 后期整合 |

代码注释和数据字段必须保留原始 7 步映射，避免内容与前端各做一套。

### 7.3 预约表单

```ts
export type LeadDirection = "enterprise" | "agent" | "aigc" | "personal" | "other"

export type LeadPayload = {
  organization: string
  name: string
  contact: string
  need: string
  direction: LeadDirection
  sourceSceneId: string
  submittedAt: string
}
```

字段规则：

- `organization`：必填，2-40 字。
- `name`：必填，1-20 字。
- `contact`：必填，微信/手机/邮箱任一格式可通过。
- `need`：必填，10-300 字。
- `direction`：必填，默认来自 CTA 入口，没有入口时为 `other`。

---

## 8. Lead API Contract

### 8.1 模式选择

Phase 0 必须确定 `LEAD_API_MODE`：

```txt
mock      # 默认开发模式，不发网络请求
unicloud  # 使用 uniCloud 云函数
http      # 使用自有 API
```

在没有后端凭证前，开发环境和微信预览版使用 `mock`；正式发布版必须显式选择 `unicloud` 或 `http`，否则构建检查失败。

### 8.2 HTTP Contract

```txt
POST /api/leads
Content-Type: application/json
```

请求：

```json
{
  "organization": "同野观幂",
  "name": "张三",
  "contact": "wechat_id",
  "need": "想梳理企业内部 AI 场景共创。",
  "direction": "enterprise",
  "sourceSceneId": "organization",
  "submittedAt": "2026-05-26T12:00:00.000Z"
}
```

成功响应：

```json
{
  "ok": true,
  "leadId": "lead_20260526_001"
}
```

错误码：

| code | 含义 | 前端提示 |
|---|---|---|
| `VALIDATION_ERROR` | 字段不合法 | 请检查必填信息 |
| `RATE_LIMITED` | 提交过快 | 刚刚已经收到，请稍后再试 |
| `NETWORK_ERROR` | 网络失败 | 网络不稳定，请稍后重试 |
| `SERVER_ERROR` | 服务端失败 | 暂时提交失败，请稍后重试 |

### 8.3 微信配置

如果选择 `http`：

- Phase 0 必须确定合法 request 域名。
- 域名未配置前，不得走 `http` 正式发布；只能用 `mock` 做微信预览/演示，并在页面标记「演示提交」。
- 前端不得写入任何 secret。

重复提交策略：

- 点击提交后按钮进入 loading。
- 8 秒内禁止重复提交同一 payload。
- 成功后保留成功态，不清空用户输入，避免用户误以为丢失。

---

## 9. 滚动与状态契约

首页 `pages/index/index.vue` 是状态唯一持有者。

```ts
type HomeState = {
  activeSceneId: string
  pageProgress: number
  sceneProgressMap: Record<string, number>
  backdropVariant: "static" | "video" | "shader"
  typographicFxEnabled: boolean
  pretextMode: "inspired" | "h5-runtime" | "mp-runtime-poc"
  leadIntent?: LeadDirection
}
```

规则：

- 场景组件只接收 props，不各自 query 页面滚动。
- `onPageScroll` 中只更新 `scrollTop` 派生出的轻量状态。
- 不在滚动过程中频繁 `querySelector` / `boundingClientRect`。
- scene offset 在 `onReady` / `nextTick` / 窗口尺寸变化后统一计算并缓存。
- 滚动节流目标：约 32ms 一次。
- `sceneProgressMap` 只保留当前场景、前一场景、后一场景的 progress，避免整页高频响应式更新。
- `EmotionalTitleLayer` / `TypographicFieldOverlay` 只消费首页派发的 `progress / active / sceneId`，不得自行监听或查询滚动。
- MP-WEIXIN 发布路径强制 `pretextMode="inspired"`；`mp-runtime-poc` 只允许专项测试包使用。

---

## 10. 实施阶段

### Phase 0：工程初始化 + 平台 POC

目标：先证明微信端基础能力可行，再进入高保真施工。

任务：

- 初始化 UniApp Vue 3 + TypeScript 工程。
- 配置 AppID：`wx5f0a423b84cafbef`。
- 配置首页和全局 SCSS。
- 建立 `SceneBackdrop`、`Lead API`、`sceneRegistry` 的空实现。
- 确定 `LEAD_API_MODE`。
- 解包 `tongye_quiet_intelligence_shader_repack.zip`。
- 基于 `uni-app-example/TongyeShaderBackdrop.vue` 完成 MP-WEIXIN canvas 背景 POC。
- 明确记录 POC 结果：`tongye-quiet-intelligence-mp-poc` / `shader-enabled` 或 `shader-fallback-only`。

验收：

- `dev:mp-weixin` 可运行。
- 微信开发者工具显示正确 AppID。
- POC 中 zip shader/canvas 不遮挡 scroll/text/button/input/form。
- 如果 POC 失败，文档和代码配置均将小程序背景锁定为 `static` 或 `video`。

### Phase 1：视觉框架与基础组件

目标：还原原型视觉语言，并建立可复用组件。

任务：

- `BrandHeader` 安全区适配。
- `SceneShell`、`GlassCard`、`CtaButton`、`IconBadge`、`StepRail`。
- `ShaderCanvasBackdrop` 默认背景；`StaticFieldBackdrop` 作为 fallback / 转化区低风险背景。
- `ScrollIndicator` 和底部探索提示。
- 全局 token、混入、基础动效。

验收：

- `S00-S11` 组件占位全部渲染。
- 375/390/430 宽度下无标题、按钮、卡片溢出。
- 顶部品牌名不撞微信胶囊。

### Phase 2：Scene Registry 全量落地

目标：完成 12 个场景组件，其中 `S01-S11` 构成 11 屏长滚动。

任务：

- `SceneEntry`
- `SceneHero`
- `SceneBrandMeaning`
- `SceneFieldMap`
- `SceneOrganization`
- `SceneCanvasAgent`
- `SceneVideoPipeline`
- `ScenePersonalCapability`
- `SceneMethod`
- `SceneProjectGallery`
- `SceneServicePackages`
- `SceneLead`

验收：

- 每个组件都能从 registry 找到对应配置。
- 缺原型图的 `method/projects/service-packages` 按设计文档落地，视觉语言与原型一致。
- `SceneServicePackages` 使用完整 `ServicePackage` 数据结构。

### Phase 3：CTA、滚动状态与交互闭环

目标：所有按钮都有明确结果。

任务：

- 实现 CTA 路由表。
- 实现同页 scroll target。
- 实现 modal/expand。
- CTA 设置 `leadIntent`。
- 完成表单校验、loading、success、error 状态。

验收：

- 发布版无 `disabled` CTA。
- 每个 CTA 点击后都有可见结果。
- 表单提交空值、错误联系方式、重复提交都有处理。

### Phase 4：Lead API 与资源策略

目标：转化链路可真实接入或清楚标记 mock。

任务：

- 实现 `services/leadApi.ts`。
- 根据 `LEAD_API_MODE` 接 `mock/unicloud/http`。
- 如果使用 `http`，确认微信合法 request 域名。
- 背景视频与 poster 使用远程 URL，不打进小程序包。
- 视频未准备时继续使用 static fallback。

验收：

- 前端没有 secret。
- mock 模式页面有演示标识。
- 生产模式接口错误可读。

### Phase 5：视觉增强收尾

目标：在 Phase 0 POC 结果基础上做增强收尾，而不是此时才判断 shader 是否可行。

任务：

- 若 Phase 0 为 `shader-enabled`，将 zip 方案封装进 `ShaderCanvasBackdrop` 并做性能收敛。
- 若 Phase 0 为 `shader-fallback-only`，保持 MP-WEIXIN 使用 `StaticFieldBackdrop`/`VideoBackdrop`。
- H5 可继续对比两个 TSX shader 作为视觉参考。
- 将 Variable Typographic ASCII 转译为静态字符纹理或轻量叠层。
- 将 Illustrated Manuscript 转译为文本展开/解释层互动。
- 将 Pretext Emotional Text 转译为 `Pretext-inspired Typographic Intelligence Layer`：MP-WEIXIN v1 使用 `EmotionalTitleLayer` 的 `view/text + CSS transition`；H5 可接真 Pretext 做增强实验。
- 配置 `pretextMode`，MP-WEIXIN v1 发布路径固定为 `inspired`，H5 可用 `h5-runtime`，小程序真 runtime 只走 `mp-runtime-poc` 专项测试包。
- `backdropVariant` 支持配置切换。

验收：

- MP-WEIXIN 端 shader 可一键关闭。
- shader 失败时页面仍完整显示。
- 真机滚动、输入、切后台稳定。
- 字符纹理和文本互动不影响 CTA 与表单可用性。
- 文字动效可一键关闭，不新增第二个实时 canvas，不逐帧更新每个字符。
- 启用文字动效的标题都有 `titleLines / titleMaxLines`，中英混排标题不依赖运行时猜测断行。
- `TypographicFieldOverlay` 单屏 glyph 数量不超过 `36`，透明度不超过 `0.12`，且不在服务包和表单区开启。

### Phase 6：微信验证与交付

目标：达到可预览、可演示、可继续接素材状态。

任务：

- `build:mp-weixin`。
- 微信开发者工具预览。
- 真机扫码测试。
- 检查包体积、首屏时间、滚动流畅度。
- 输出剩余素材、后端、字体、视频待确认清单。

验收：

- 无构建错误。
- 无微信关键报错。
- `S01-S11` 11 屏完整可达，`S00` 进入态可用。
- 表单闭环可用或清楚标记 mock。
- 视觉与原型方向一致。

---

## 11. 验收矩阵

| 类别 | 验收项 | 方法 | 必过 |
|---|---|---|---|
| 构建 | `dev:mp-weixin` 成功 | 本地命令 | 是 |
| 构建 | `build:mp-weixin` 成功 | 本地命令 | 是 |
| AppID | 微信开发者工具读取 `wx5f0a423b84cafbef` | 开发者工具 | 是 |
| 范围 | `S00-S11` 组件存在 | 页面检查 | 是 |
| 范围 | `S01-S11` 11 屏长滚动完整 | 真机滚动 | 是 |
| 视觉 | 375/390/430 宽度无溢出 | 截图比对 | 是 |
| 视觉 | 顶部不撞微信胶囊 | 真机截图 | 是 |
| 视觉 | 服务卡片包含 audience/includes/outcome | 页面检查 | 是 |
| CTA | 发布版无 disabled CTA | 静态检查 | 是 |
| CTA | 所有 CTA 有 scroll/expand/modal/submit 结果 | 手测 | 是 |
| 表单 | 校验、loading、success、error 完整 | 手测 | 是 |
| 表单 | 8 秒内防重复提交 | 手测 | 是 |
| Shader | `tongye_quiet_intelligence_shader_repack.zip` 已解包评估 | 文件/POC 检查 | 是 |
| Shader | zip shader canvas POC 不遮挡表单 | 真机 POC | 是 |
| Shader | POC 失败时 fallback 生效 | 配置切换 | 是 |
| Shader | 9 个 shader 状态到 11 屏映射已按 `calm conversion mode` 记录 | 文档/代码检查 | 是 |
| 参考资产 | 两个 TSX shader 仅作 H5/视觉参考 | 文档/代码检查 | 是 |
| 参考资产 | Variable Typographic ASCII 不进入 shader 候选 | 文档/代码检查 | 是 |
| 参考资产 | Illustrated Manuscript 不进入 shader 候选 | 文档/代码检查 | 是 |
| 文字动效 | Pretext Emotional Text 不作为 MP-WEIXIN v1 runtime 或第二实时 canvas | 文档/代码检查 | 是 |
| 文字动效 | 关键标题字符层不影响 CTA、滚动和表单输入 | 真机手测 | 是 |
| 文字动效 | `pretextMode` 在 MP-WEIXIN 发布路径为 `inspired` | 构建配置检查 | 是 |
| 文字动效 | 启用 `textFx` 的标题声明 `titleLines / titleMaxLines` | 静态检查 | 是 |
| 文字动效 | `mp-runtime-poc` 完成 Segmenter、measureText、包体积、30 秒滚动和输入框聚焦检查 | 专项 POC 记录 | 否 |
| 性能 | 滚动无明显卡顿 | 真机手测 | 是 |
| 安全 | 前端无 webhook/token/secret | `rg` 检查 | 是 |

建议命令：

```txt
pnpm install
pnpm run dev:mp-weixin
pnpm run build:mp-weixin
rg -n "webhook|token|secret|corpsecret|Authorization" src
```

---

## 12. 风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| canvas 原生层级盖住 UI | 文字/按钮/表单不可用 | Phase 0 POC，不通过则小程序禁用 shader |
| TSX shader 不兼容微信 | 接入返工 | 明确为 H5/视觉参考 |
| 字符/文本参考被误当 shader | 资产使用跑偏 | 明确 Variable Typographic ASCII / Illustrated Manuscript 只做纹理和文本互动参考 |
| Pretext runtime 直接进入小程序 | Canvas 2D measurement、`Intl.Segmenter`、包体积和性能不确定 | MP-WEIXIN v1 用轻量 `view/text` 动效；真 Pretext 只放 H5 或 Post-v1 adapter POC |
| 字符标题破坏原生换行 | 高保真标题溢出或中英混排异常 | 启用 `textFx` 的场景必须配置 `titleLines / titleMaxLines / lineBreakPolicy` |
| TypographicFieldOverlay 过密 | 视觉变噪、滚动性能下降 | 单屏 glyph `<=36`、opacity `<=0.12`，转化区默认关闭 |
| 11 屏误要求 11 个 shader 状态 | shader POC 被扩大、延期 | v1 明确复用 `shader 8` 做 `projects/service-packages/lead` 的低动态转化背景 |
| 9 张原型缺 3 个设计文档场景 | 范围漏项 | 按设计文档补 `method/projects/service-packages` |
| 服务转化信息不足 | 用户不知道如何合作 | 服务包使用完整 `ServicePackage` |
| CTA 无页面可跳 | 点击无闭环 | 同页 scroll/modal/expand 解决 |
| 后端未定 | 表单不能生产提交 | Phase 0 确定 `LEAD_API_MODE`，发布版禁止隐式 mock |
| 微信顶部与原型不一致 | 验收争议 | 原型顶部只作安全区参考，真机为准 |

---

## 13. 首轮施工顺序

1. 初始化 UniApp 工程、AppID、SCSS token。
2. 解包 `tongye_quiet_intelligence_shader_repack.zip`，做 MP-WEIXIN canvas + scroll/text/form POC。
3. 确定 `LEAD_API_MODE` 和 mock/生产规则。
4. 建 `sceneRegistry`、`services`、`projects` 数据。
5. 做 `SceneShell`、`SceneBackdrop`、`GlassCard`、`CtaButton`。
6. 先落 `SceneHero`、`SceneMethod`、`SceneProjectGallery`、`SceneServicePackages`、`SceneLead`。
7. 补齐其余 `S00-S11` 场景。
8. 接 CTA 路由表与滚动状态。
9. 接 Lead API adapter。
10. 根据 Phase 0 POC 结果启用 `ShaderCanvasBackdrop` 或 fallback。
11. 补 `Pretext-inspired Typographic Intelligence Layer`，只启用关键标题轻量动效，并为启用场景配置 `titleLines / titleMaxLines`。
12. 微信开发者工具和真机验收。

---

## 14. Definition of Done

首版可认为完成，当且仅当：

- 微信小程序工程可运行、可构建。
- AppID 已配置为 `wx5f0a423b84cafbef`。
- `S00-S11` 全部实现，其中 `S01-S11` 为首页长滚动 11 屏。
- `sceneRegistry` 覆盖标题、卡片、CTA、背景、截图验收点。
- 所有 CTA 有明确 action 和 target。
- `SceneServicePackages` 包含完整服务包字段。
- `SceneLead` 具备校验、提交态、成功态、错误态、重复提交保护。
- `LEAD_API_MODE` 明确，发布版不允许误用无标识 mock。
- `tongye_quiet_intelligence_shader_repack.zip` 已作为主 shader 候选完成 Phase 0 POC 并记录结果；不过关时 shader 小程序禁用。
- 9 个 shader 状态到 11 屏的映射已落地；`projects / service-packages / lead` 使用低动态转化背景，不误扩 Phase 0 范围。
- 两个 TSX shader 仅用于 H5/视觉参考；Variable Typographic ASCII 和 Illustrated Manuscript 仅用于字符纹理与文本互动参考。
- Pretext Emotional Text 已纳入 `Pretext-inspired Typographic Intelligence Layer`：MP-WEIXIN v1 发布路径 `pretextMode="inspired"`，真 Pretext runtime 只进入 H5 或专项 POC。
- 启用 `textFx` 的标题已声明 `titleLines / titleMaxLines`，`TypographicFieldOverlay` 满足 glyph 数量、透明度和禁用场景限制。
- 视觉没有明显文字溢出、遮挡、低端感或蓝紫 AI 模板感。
- 输出剩余素材、后端、字体、视频待确认清单。
