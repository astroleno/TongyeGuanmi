# 同野观幂微信小程序：沉浸式品牌展厅 + 服务转化方案

> 版本：v0.1  
> 项目方向：前半段品牌展厅，后半段服务转化  
> 技术方向：uni-app / Vue 3 / TypeScript / 微信小程序优先  
> 体验关键词：沉浸式、克制未来感、东方语感、组织现场、无限画布、AIGC 视频、AI 能力建设

---

## 0. 一句话定位

**同野观幂 · AI 现场**

让 AI 进入真实的工作、学习与创造现场。

这个小程序不要做成“服务列表”，而要做成一个可滚动的 AI 能力剧场：前半段用 AIGC 视频、节点动画、短句叙事建立品牌格调；后半段回到清晰服务、项目展示和预约转化。

---

## 1. 参考站点转译

### 1.1 参考一：Immersive Garden

可借鉴：

- 用极短的品牌句进入体验，而不是先堆信息。
- 首页以“Scroll down”引导纵向叙事。
- 大幅视觉 + 大标题 + 项目片段穿插，形成品牌展厅感。
- 服务能力通过作品和体验来证明，而不是通过长段文字说服。

不建议照搬：

- 不要把每屏都做得过度炫技。
- 不要在小程序端硬复刻 WebGL / GSAP 的复杂动效。
- 不要让视觉压过“企业可信度”。

### 1.2 参考二：Moooi / A Life Extraordinary

可借鉴：

- “进入一个非常规空间”的感觉。
- 像展览、陈列室、梦境房间，而不是普通官网。
- 物件、光线、材质、声音/静音提示共同组成氛围。
- 让用户通过滚动“游览”品牌世界。

不建议照搬：

- Moooi 是家居/艺术陈列逻辑，同野观幂要转成“AI 进入现场”的业务逻辑。
- 微信小程序里不建议默认打开声音。背景视频建议静音，声音只作为可选增强。

---

## 2. 产品结构

### 2.1 页面类型

建议先做一个主小程序，而不是多页面复杂站点。

```txt
/pages/index/index.vue              # 主品牌展厅长页
/pages/project/index.vue            # 项目列表，可选
/pages/project/detail.vue           # 项目详情，可选
/pages/service/index.vue            # 服务说明，可选
/pages/contact/index.vue            # 预约/咨询表单
```

首页承担 80% 的体验。其它页面只做承接，不要分散注意力。

### 2.2 首页滚动分屏

```txt
S00 进入页 / Loading / 声音选择
S01 Hero：AI 不应停留在黑箱里
S02 品牌解释：同野 / 观幂
S03 四个现场：组织 / 产品 / 内容 / 个人
S04 组织现场：AI 转型咨询与培训陪跑
S05 产品现场：企业级无限画布 + Agent
S06 内容现场：生产级 AIGC 视频管线
S07 个人现场：作品集网站 / vibe coding / 国际教育 AI 能力
S08 方法论：看见现场 → 共创场景 → 建立工具 → 训练能力 → 陪跑落地
S09 项目展廊：能力 Demo / 案例 / 样片
S10 服务转化：服务包与适用对象
S11 预约共创：预约一次 AI 场景共创咨询
```

---

## 3. 技术栈建议

### 3.1 主技术栈

```txt
框架：uni-app
语法：Vue 3 + TypeScript
构建：Vite
状态管理：Pinia，可选
样式：SCSS + CSS Custom Properties 风格变量
工具类：UnoCSS 可选；首版也可以不用
平台：MP-WEIXIN 微信小程序优先，H5 作为预览备份
表单/数据：uniCloud 或自有 API
视频资源：CDN / OSS，不放进小程序包
动效核心：CSS transform + opacity + scroll progress + IntersectionObserver
辅助动效：lottie-miniprogram / canvas 2D 轻量节点动画
```

### 3.2 为什么不用完整 GSAP

微信小程序不是标准浏览器 DOM 环境，复杂 GSAP ScrollTrigger 式方案不适合作为主路径。建议做“类 GSAP 体验”，而不是直接引入 GSAP：

```txt
页面原生滚动
  ↓
onPageScroll 获取 scrollTop
  ↓
节流后计算 progress
  ↓
将 progress 映射到少量 transform / opacity / scale
  ↓
IntersectionObserver 控制每屏进出场、视频加载、视频暂停/播放
```

### 3.3 动效分层

```txt
第一层：背景 AIGC 视频
- 负责沉浸感和质感
- 每段 6–10 秒循环
- 静音、loop、object-fit: cover
- 同时只播放当前屏或前后 1 屏

第二层：滚动驱动文本
- 字重、透明度、位移、字距变化
- 不做复杂逐字 DOM 更新

第三层：节点/线框/画布动画
- 用 canvas 或绝对定位 view 实现
- 控制在轻量范围
- 不做大量实时粒子

第四层：服务卡片与 CTA
- 回到清晰、稳定、可信
- 少动效，重信息可读性
```

### 3.4 推荐组件结构

```txt
/src
  /components
    SceneShell.vue              # 每一屏的基础容器
    VideoBackdrop.vue           # 背景视频 + poster + 遮罩
    KineticText.vue             # 滚动文字动效
    ScrollProgress.vue          # 右侧/底部滚动进度
    FieldMap.vue                # 四个现场地图
    CanvasAgentGraph.vue        # 无限画布 / Agent 节点图
    PipelineStrip.vue           # AIGC 视频管线
    MethodSteps.vue             # 方法论步骤
    ProjectCard.vue             # 项目卡片
    ServiceCard.vue             # 服务卡片
    LeadForm.vue                # 预约表单
  /composables
    useSceneScroll.ts           # scrollTop → progress
    useIntersection.ts          # 屏幕进入/离开
    useVideoLifecycle.ts        # 视频播放/暂停/懒加载
  /styles
    tokens.scss                 # 颜色、字号、间距、动效变量
    mixins.scss
```

### 3.5 性能原则

- 首页首屏只加载：logo、第一屏 poster、第一屏短视频或静态封面。
- 视频全部使用 CDN，不打进小程序包。
- 背景视频不要同时播放多条；离屏视频暂停。
- `onPageScroll` 里不要频繁 setData / 改大量响应式数据，只更新一个轻量 progress。
- 大量装饰性粒子尽量做进视频素材，不要前端实时生成。
- canvas 只承担局部轻量动效，不承担全页面 3D 主视觉。
- 背景视频必须准备 poster，弱网下仍然有完整视觉。
- 服务转化区要减少动画，避免用户想咨询时还被动效打断。

---

## 4. 视觉设计系统

### 4.1 艺术方向

**静默智能 / Quiet Intelligence**

不是赛博朋克，不是蓝紫 AI 模板，不是机器人脸。整体要像一个“组织与智能的夜间展厅”：黑色基底、温润高光、微粒、画布线框、深色空间中的人文短句。

### 4.2 关键词

```txt
克制
电影感
留白
东方语感
真实现场
非炫技
高级咨询
生成式影像
无限画布
组织方法论
```

### 4.3 色彩

```scss
:root {
  --c-obsidian: #080807;       // 黑曜石，主背景
  --c-ink: #121412;            // 墨黑，卡片背景
  --c-ivory: #E9E2D2;          // 米白，正文与高亮文字
  --c-warm-gold: #C7B17A;      // 暖金，关键线条/CTA
  --c-moss: #123A32;           // 深苔绿，组织现场/人文感
  --c-ash: #7C817B;            // 灰绿，弱信息
  --c-silver: #B8B9B3;         // 银雾，线框/节点
  --c-clay: #8B5E45;           // 陶土，个人现场/作品集
}
```

使用比例：

```txt
黑曜石/墨黑：70%
米白/银雾：18%
暖金：6%
深苔绿/陶土：6%
```

### 4.4 字体建议

```css
font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
```

标题风格：

- 中文标题用大字号、低行高、少字数。
- 不要一屏超过 18 个主标题字。
- 品牌解释部分可以使用偏宋体气质的授权字体或做成图片字，但不要使用未授权字体。

### 4.5 排版

```txt
屏幕比例：移动端 9:16 优先
主标题：56–84rpx
副标题：28–34rpx
正文：24–28rpx
说明标签：18–22rpx
行距：1.35–1.65
每屏主文字不超过 3 行
```

### 4.6 动效语言

```txt
进入：fade + translateY 24rpx
转场：scale 0.96 → 1，opacity 0 → 1
画布：slow pan / zoom / node reveal
文字：字距轻微收紧，透明度从 0.24 到 1
卡片：错位上浮，不做弹跳
CTA：低频呼吸光，不做闪烁
```

建议缓动：

```scss
--ease-cinematic: cubic-bezier(.16, 1, .3, 1);
--ease-soft: cubic-bezier(.22, .61, .36, 1);
--ease-sharp: cubic-bezier(.7, 0, .2, 1);
```

---

## 5. 文案系统

### 5.1 主叙事

```txt
AI 不应停留在黑箱里。
它应该进入真实的工作、学习与创造现场。

同野观幂，帮助组织与个人建立 AI 时代的真实能力。
```

### 5.2 品牌解释

```txt
同野，取自“同人于野”。
在开放真实的场域中共同协作。

观幂，意为看见复杂系统背后的结构与方法。
让智能走出少数人的黑箱，进入更多人的工作、学习与创造现场。
```

### 5.3 服务主张

```txt
从概念，到现场。
从工具，到能力。
从试点，到流程。
从会用，到共创。
```

### 5.4 预约 CTA

```txt
预约一次 AI 场景共创咨询

用 30 分钟，梳理你的团队、业务或个人项目中，AI 最值得进入的第一个现场。
```

---

# 6. 各屏 Prompt 与设计说明

以下 Prompt 可直接给设计师、AI 视觉生成工具、视频生成工具或前端 AI 编码助手使用。建议每屏都分成：**视觉 Prompt / AIGC 视频 Prompt / 前端实现 Prompt**。

---

## S00｜进入页 / Loading / 声音选择

### 屏幕目的

建立“这不是普通服务小程序”的第一印象。让用户进入一个安静、深色、带有仪式感的 AI 展厅。

### 屏幕文案

```txt
同野观幂
AI 现场

让 AI 进入真实的工作、学习与创造现场

进入
```

状态提示：

```txt
进入现场 / 保持静默
```

首版不展示未实现的声音开关，保持“静默进入”的仪式感。

### 视觉 Prompt

```txt
为“同野观幂”设计一个微信小程序进入页，9:16 竖屏，黑曜石质感背景，中央是极简中文品牌字标“同野观幂”，下方小字“AI 现场”。整体像进入一个安静的数字展厅，低光、留白、微弱暖金色线条、极细粒子漂浮。不要赛博朋克，不要机器人，不要蓝紫渐变模板。风格：quiet luxury, cinematic, human-centered AI, museum-like entrance, restrained Chinese typography.
```

### AIGC 视频 Prompt

```txt
Vertical 9:16 cinematic loop, a dark obsidian space with subtle floating dust particles, a thin warm-gold line slowly drawing an abstract horizon, quiet luxury, minimal, museum entrance, soft volumetric light, no text, no logo, no people, no robot, seamless 8-second loop.
```

### 前端实现 Prompt

```txt
用 uni-app Vue 3 + TypeScript 实现一个全屏进入页组件 SceneEntry.vue。背景使用 ShaderRuntimeBackdrop：小程序端由组件内部运行 WebGL shader，导出临时帧后用普通 image 显示，不使用 SVG/CSS 背景，也不把原生 canvas 直接铺在 UI 下方。中央品牌文案使用 view/text，不把文字做进背景图。进入按钮点击后滚动到主页面第一屏。首版不展示声音开关，状态提示使用“进入现场 / 保持静默”。
```

---

## S01｜Hero：AI 不应停留在黑箱里

### 屏幕目的

用一句强文案完成品牌世界观开场。

### 屏幕文案

```txt
AI 不应停留在黑箱里。

它应该进入真实的工作、学习与创造现场。
```

### 视觉 Prompt

```txt
设计一屏沉浸式微信小程序 Hero，9:16 竖屏。画面中心是一个抽象“黑箱”，由极细的银色线框和暗金色边缘组成，周围不是科幻电路，而是像真实办公室、学习桌、创作工作台的模糊影像被缓慢照亮。中文大标题“AI 不应停留在黑箱里。”以米白色出现，第二句在滚动后浮现。整体克制、电影感、深色、留白，不要商业海报感。
```

### AIGC 视频 Prompt

```txt
Vertical cinematic 9:16, an abstract matte black cube suspended in darkness, thin ivory and warm-gold lines slowly open from the cube, revealing faint silhouettes of a workplace, study desk, creative studio and digital canvas, restrained luxury AI atmosphere, soft shadows, no readable text, no human faces, no robots, seamless slow loop, 8 seconds.
```

### 前端实现 Prompt

```txt
实现 SceneHero.vue。该屏高度 100vh。背景视频固定覆盖，叠加 radial-gradient 暗角。根据 scroll progress 控制两段文案的 opacity 和 translateY：第一句 progress 0-0.35 出现，第二句 0.32-0.7 出现。不要在 onPageScroll 中频繁更新多个字段，只更新 heroProgress。使用 CSS transition 处理细节。
```

---

## S02｜品牌解释：同野 / 观幂

### 屏幕目的

把公司名字的文化感转成品牌可信度，不要玄学化。

### 屏幕文案

```txt
同野
取自“同人于野”
在开放真实的场域中共同协作

观幂
看见复杂系统背后的结构与方法
```

底部小字：

```txt
让智能走出少数人的黑箱，进入更多人的现场。
```

### 视觉 Prompt

```txt
设计一个品牌解释屏，竖屏 9:16，左右或上下两块留白区域分别展示“同野”和“观幂”。背景为深墨黑到苔绿色的极细渐变，画面里有抽象田野网格、协作节点、数学曲线、系统结构线。中文排版要像高级展览导视，不要古风，不要书法，不要水墨山水。风格：东方语感 + 现代系统设计 + quiet consulting brand.
```

### AIGC 视频 Prompt

```txt
Vertical 9:16 abstract cinematic scene, dark moss green and obsidian background, subtle field grid lines slowly transforming into system nodes and mathematical curves, warm ivory highlights, elegant and human-centered, no text, no logo, no people, no robots, seamless 8-second loop.
```

### 前端实现 Prompt

```txt
实现 SceneBrandMeaning.vue。用两个 BrandTerm 组件展示“同野”和“观幂”。滚动进入时第一组从左下浮入，第二组从右上浮入。背景线条可以用轻量 canvas 或静态 SVG/图片实现。优先使用静态/半动态素材，不做大量实时粒子。
```

---

## S03｜四个现场：组织 / 产品 / 内容 / 个人

### 屏幕目的

把看似分散的业务统一成一个系统：AI 进入四类现场。

### 屏幕文案

```txt
我们让 AI 进入四个现场

组织现场
产品现场
内容现场
个人现场
```

每个现场小字：

```txt
组织现场：咨询、培训、共创、陪跑
产品现场：无限画布、Agent、智能协作
内容现场：AIGC 视频管线、品牌影像
个人现场：作品集、vibe coding、国际教育 AI 能力
```

### 视觉 Prompt

```txt
设计一屏“四个现场”的沉浸式总览，竖屏 9:16。画面像一个暗色无限画布，四个发光区域缓慢展开：组织、产品、内容、个人。每个区域用不同材质暗示：组织是会议与流程线，产品是节点画布与 Agent 光点，内容是影片帧和生成管线，个人是作品集页面和学习桌。整体要高级、清晰、克制，不要密密麻麻，不要信息图模板。
```

### AIGC 视频 Prompt

```txt
Vertical 9:16, a dark infinite canvas slowly zooming out, four subtle luminous zones emerge: organization workflows, agent canvas nodes, cinematic video pipeline strips, personal portfolio desk, warm-gold and ivory lines, museum-like, quiet luxury, no readable text, seamless 10-second loop.
```

### 前端实现 Prompt

```txt
实现 SceneFieldMap.vue。四个现场用 FieldNode 组件渲染，不直接写死布局。根据 scroll progress 做 zoom-out：初始只看到中心节点，后续四个节点依次出现。点击节点可以 scrollTo 对应分屏。节点动画使用 CSS transform，连线可用 canvas 或绝对定位细线。
```

---

## S04｜组织现场：AI 转型咨询与培训陪跑

### 屏幕目的

让企业客户看到“你们能让团队真正用上 AI”，不是只会做工具展示。

### 屏幕文案

```txt
组织现场
让 AI 变成团队真正会用、业务真正用得上的能力。
```

服务点：

```txt
AI 转型咨询
管理层与业务团队培训
业务场景共创
工具实施与落地陪跑
```

### 视觉 Prompt

```txt
设计一屏“组织 AI 转型”服务页，竖屏 9:16，深色咨询公司质感。背景是一个真实会议现场的抽象化影像：桌面、白板、流程图、团队协作，但人物不需要清晰露脸。画面上有轻量 AI 节点进入业务流程，不是机器人。文案区域清晰、可信、克制。风格：enterprise consulting, cinematic workshop, human-centered AI adoption, quiet luxury.
```

### AIGC 视频 Prompt

```txt
Vertical 9:16 cinematic workshop scene, dimly lit meeting table, blurred team silhouettes, whiteboard workflow lines slowly illuminated by subtle ivory AI nodes, warm gold accents, realistic but abstract, no readable text, no faces, no robots, no cyberpunk, seamless loop 8 seconds.
```

### 前端实现 Prompt

```txt
实现 SceneOrganization.vue。背景视频 + 右侧或底部服务列表。滚动到该屏时，四个服务点依次出现。使用 IntersectionObserver 判断进入后才加载视频 src，离开后暂停。服务点组件要能复用到后面的服务转化区。
```

---

## S05｜产品现场：企业级无限画布 + Agent

### 屏幕目的

展示技术深度和产品想象力，是整个小程序最“酷”的一屏。

### 屏幕文案

```txt
产品现场
企业级无限画布 + Agent

把复杂业务、知识、任务和智能体，放进一个可视化、可协作、可扩展的工作空间。
```

关键词：

```txt
知识结构
业务流程
任务协作
Agent 编排
组织记忆
```

### 视觉 Prompt

```txt
设计一屏“企业级无限画布 + Agent”沉浸式页面，竖屏 9:16。画面像从一个大型暗色画布中缓慢俯瞰，节点、卡片、知识块、流程线、Agent 光点有秩序地展开。要体现企业级、可视化、可协作、可扩展，不要像普通脑图软件，不要彩虹色便利贴，不要过度科幻。颜色以黑曜石、银雾、暖金、深苔绿为主。
```

### AIGC 视频 Prompt

```txt
Vertical 9:16 cinematic top-down infinite canvas, dark obsidian interface, elegant ivory nodes and warm-gold connection lines, small agent orbs moving between knowledge blocks and workflow cards, enterprise-grade, minimal, premium, no readable UI text, no brand names, no neon cyberpunk, seamless 10-second loop.
```

### 前端实现 Prompt

```txt
实现 SceneCanvasAgent.vue。核心是 CanvasAgentGraph 组件。用若干绝对定位的 NodeCard + SVG/canvas 线条模拟无限画布，不要依赖真正 WebGL。滚动 progress 0-1 映射到 scale: 1.18→0.82、translateX/Y、节点依次出现。Agent 光点用 CSS animation 沿预设路径移动。提供点击“查看产品 Demo”的 CTA。
```

---

## S06｜内容现场：生产级 AIGC 视频管线

### 屏幕目的

证明你们不是“会生成几个 AI 视频”，而是有可复用的生产管线。

### 屏幕文案

```txt
内容现场
生产级 AIGC 视频管线

从品牌概念、脚本、分镜、生成、后期到交付，建立可复用的视频生产流程。
```

流程：

```txt
Brief → Script → Storyboard → Prompt → Generate → Edit → Delivery
```

### 视觉 Prompt

```txt
设计一屏“AIGC 视频管线”，竖屏 9:16。画面像一条高级影像工作流：脚本文档、分镜帧、提示词卡片、生成片段、调色监看、最终成片依次排列。整体要像电影后期工作室与 AI 生成管线结合，不要做成普通流程图。深色背景，暖金高光，胶片帧细节，少量银色线条。
```

### AIGC 视频 Prompt

```txt
Vertical 9:16 cinematic AI video production pipeline, dark editing studio atmosphere, floating storyboard frames, script pages, prompt cards, generated video thumbnails, color grading monitor glow, warm gold and ivory highlights, premium and organized, no readable text, seamless 10-second loop.
```

### 前端实现 Prompt

```txt
实现 SceneVideoPipeline.vue。使用 PipelineStrip 组件横向/纵向展示 7 个流程节点。滚动时流程节点像胶片一样轻微位移，但不需要真实横向滚动。背景可播放抽象剪辑台视频。每个节点点击后弹出一句解释。转化按钮：了解 AIGC 视频管线。
```

---

## S07｜个人现场：作品集 / vibe coding / 国际教育 AI 能力

### 屏幕目的

把个人业务包装成“AI 时代的个人能力建设”，避免像零散副业。

### 屏幕文案

```txt
个人现场
建立 AI 时代的学习、研究与表达能力。
```

服务点：

```txt
个人作品集网站
vibe coding 培训
研究项目与申请表达
海外学习准备咨询
```

### 视觉 Prompt

```txt
设计一屏“个人 AI 能力建设”，竖屏 9:16。氛围比企业屏更温暖，但仍然高级。背景是学习桌、个人作品集网页、代码编辑器、研究笔记、申请表达材料的抽象组合。光线温润，陶土色和米白色细节，避免学生培训广告感，不要卡通，不要廉价教育海报。
```

### AIGC 视频 Prompt

```txt
Vertical 9:16 cinematic personal creative workspace, warm low light, portfolio website mockup, code editor glow, research notes, application essay pages, subtle AI assistant light lines connecting them, quiet premium atmosphere, clay and ivory accents, no readable text, no faces, seamless 8-second loop.
```

### 前端实现 Prompt

```txt
实现 ScenePersonalCapability.vue。该屏节奏要放慢，视觉比前几屏更温暖。四个服务点用 ServiceMiniCard 展示。文案重点是“表达能力、研究能力、创造能力”，不要写成普通课程招生页。CTA：查看个人能力建设服务。
```

---

## S08｜方法论：看见现场 → 共创场景 → 建立工具 → 训练能力 → 陪跑落地

### 屏幕目的

把公司从“会做很多东西”提升到“有方法论”。这是企业可信度的关键屏。

### 屏幕文案

```txt
我们不是把 AI 放到 PPT 里。
我们把 AI 带进真实流程。
```

步骤：

```txt
01 看见现场
理解组织、业务、团队和个人的真实需求。

02 共创场景
找到 AI 真正能进入的工作流。

03 建立工具
用平台、Agent、自动化和内容管线承接需求。

04 训练能力
让团队和个人真的会用。

05 陪跑落地
从试点走向持续使用。
```

### 视觉 Prompt

```txt
设计一屏“方法论”页面，竖屏 9:16。画面像一个精密但克制的系统图，五个步骤不是普通流程图，而像在暗色玻璃空间中逐层亮起的结构。每一步有编号、短标题、极简说明。整体要有咨询方法论、系统思考和组织落地感。避免花哨 icon，避免 SaaS 模板风。
```

### AIGC 视频 Prompt

```txt
Vertical 9:16 abstract system methodology scene, dark glass panels and ivory-gold lines forming five sequential layers, each layer lights up softly, consulting-grade, structured, minimal, premium, no readable text, no icons, seamless 8-second loop.
```

### 前端实现 Prompt

```txt
实现 SceneMethod.vue。使用 MethodSteps 组件，五个步骤根据进入视口的 progress 依次激活。每步只显示短文本。背景可以是静态系统线框 + CSS shimmer，不需要视频也可以。该屏的动效必须清晰、稳定、可信。
```

---

## S09｜项目展廊：能力 Demo / 案例 / 样片

### 屏幕目的

承接前半段的品牌感，开始进入“你们实际能做什么”。

### 项目顺序建议

```txt
01 企业级无限画布平台 + Agent
02 生产级 AIGC 视频管线
03 企业 AI 转型与培训陪跑
04 个人作品集网站与 vibe coding
05 宣传视频与品牌内容制作
```

### 屏幕文案

```txt
项目不是陈列。
它们是 AI 进入现场的方式。
```

### 视觉 Prompt

```txt
设计一屏项目展廊，竖屏 9:16，像高级数字展厅中的作品墙。每个项目是一张深色玻璃卡片，卡片内有动态视频缩略图或精致封面。项目卡片不是普通网格，而是带一点纵深和错位。整体参考奢华数字体验作品集，但信息必须清楚。不要花哨边框，不要低端科技感。
```

### AIGC 视频 Prompt

```txt
Vertical 9:16 premium digital gallery wall, dark museum space, five floating project cards with subtle video thumbnails, warm ivory and gold edge light, depth of field, elegant and minimal, no readable text, no brand logos, seamless slow camera movement, 10-second loop.
```

### 前端实现 Prompt

```txt
实现 SceneProjectGallery.vue。用 ProjectCard 列表渲染项目。每张卡片支持 poster、videoPreview、title、summary、tags、cta。进入视口后依次上浮。点击进入 project/detail 或打开底部弹层。注意视频预览默认不自动播放太多，最多当前聚焦卡片播放。
```

---

## S10｜服务转化：服务包与适用对象

### 屏幕目的

从沉浸式体验切换到“我该怎么合作”。这一屏必须清晰，不要继续大量炫技。

### 服务包建议

#### A. 企业 AI 场景共创与落地陪跑

适合：管理层、HR、业务负责人、数字化负责人。

包含：

```txt
AI 转型访谈
业务场景梳理
管理层/团队培训
工具选型与流程设计
试点陪跑
```

#### B. 智能工作空间与 Agent 原型

适合：需要沉淀知识、流程、任务协作的组织。

包含：

```txt
无限画布原型
知识结构设计
Agent 工作流设计
业务看板与任务流
内部 Demo / MVP
```

#### C. AIGC 视频与品牌内容管线

适合：品牌传播、课程内容、产品发布、企业宣传。

包含：

```txt
创意概念
脚本与分镜
AIGC 视频生成
后期剪辑与包装
可复用生产规范
```

#### D. 个人 AI 能力建设

适合：学生、创作者、申请者、个人品牌建设者。

包含：

```txt
作品集网站
vibe coding
研究项目表达
申请材料与海外学习准备
```

### 视觉 Prompt

```txt
设计一屏服务转化页面，竖屏 9:16，深色背景但信息清晰。四张服务卡片以高级咨询方案形式呈现，每张卡片有服务名、适用对象、包含内容、咨询按钮。视觉上从前半段的电影感回到可读、可信、可点击。不要大面积动效，不要杂乱图标。
```

### 前端实现 Prompt

```txt
实现 SceneServices.vue。用 ServiceCard 组件渲染四个服务包。卡片支持展开/收起。首屏只显示服务名和一句话，点击后展开包含内容。每张卡片有 CTA，但主 CTA 统一为“预约场景共创”。
```

---

## S11｜预约共创：最终 CTA

### 屏幕目的

把用户带到具体行动：预约一次 AI 场景共创咨询。

### 屏幕文案

```txt
从一个真实现场开始。

预约一次 AI 场景共创咨询。
```

辅助文案：

```txt
告诉我们你的团队、业务或个人项目正在面对什么问题。
我们会一起判断：AI 最值得进入的第一个现场在哪里。
```

表单字段：

```txt
姓名 / 称呼
公司 / 身份
你关心的方向：企业转型 / Agent 与画布 / AIGC 视频 / 个人能力建设 / 其他
联系方式：微信 / 手机 / 邮箱
一句话描述你的需求
```

### 视觉 Prompt

```txt
设计一个最终预约 CTA 页面，竖屏 9:16。背景回到安静的黑曜石空间，有一条暖金色细线从远处延伸到用户面前，象征“从一个现场开始”。表单区域像深色玻璃卡片，文字清晰，按钮温暖但不刺眼。整体要让企业客户愿意留下信息，不要像营销落地页。
```

### AIGC 视频 Prompt

```txt
Vertical 9:16 quiet cinematic dark space, a single warm-gold line extends forward through a subtle misty gallery, symbolizing a path from idea to real-world scene, premium consulting atmosphere, minimal, no text, no people, no robots, seamless 8-second loop.
```

### 前端实现 Prompt

```txt
实现 SceneLead.vue 和 LeadForm.vue。表单字段使用 uni-app 表单组件。提交时做基础校验，成功后显示“已收到，我们会尽快联系你”。如果使用 uniCloud，封装 submitLead API；如果使用企业微信/飞书机器人 webhook，则在服务端中转，前端不要暴露 webhook。
```

---

# 7. 素材生产规范

## 7.1 背景视频规范

```txt
比例：9:16
建议尺寸：1080x1920 或 720x1280
时长：6–10 秒循环
声音：默认无声
编码：H.264 / MP4
风格：暗色、低对比、细节精致、可被文字覆盖
文字：不要把中文文案做进视频，所有文字由前端渲染
```

## 7.2 视频命名

```txt
hero_blackbox_loop.mp4
brand_field_system_loop.mp4
field_map_loop.mp4
org_workshop_loop.mp4
canvas_agent_loop.mp4
video_pipeline_loop.mp4
personal_workspace_loop.mp4
cta_path_loop.mp4
```

## 7.3 Poster 命名

```txt
hero_blackbox_poster.jpg
brand_field_system_poster.jpg
field_map_poster.jpg
org_workshop_poster.jpg
canvas_agent_poster.jpg
video_pipeline_poster.jpg
personal_workspace_poster.jpg
cta_path_poster.jpg
```

## 7.4 统一 Negative Prompt

```txt
no robot face, no humanoid robot, no cyberpunk neon, no blue-purple AI template, no cheap tech conference banner, no cluttered UI, no readable fake text, no excessive lens flare, no stock photo feeling, no cartoon, no anime, no low-end SaaS illustration, no over-saturated colors
```

---

# 8. 首页伪代码结构

```vue
<template>
  <view class="page page-home">
    <ScrollProgress :progress="pageProgress" />

    <SceneEntry />
    <SceneHero :progress="sceneProgress.hero" />
    <SceneBrandMeaning :active="activeScene === 'brand'" />
    <SceneFieldMap :progress="sceneProgress.fieldMap" />
    <SceneOrganization />
    <SceneCanvasAgent />
    <SceneVideoPipeline />
    <ScenePersonalCapability />
    <SceneMethod />
    <SceneProjectGallery />
    <SceneServices />
    <SceneLead />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onPageScroll } from '@dcloudio/uni-app'

const pageProgress = ref(0)
const activeScene = ref('hero')
const sceneProgress = ref({
  hero: 0,
  fieldMap: 0
})

let last = 0
onPageScroll((e) => {
  const now = Date.now()
  if (now - last < 32) return
  last = now
  // 只做轻量 progress 计算，不在这里做复杂 DOM / setData
  pageProgress.value = calcPageProgress(e.scrollTop)
  sceneProgress.value.hero = calcSceneProgress('hero', e.scrollTop)
  sceneProgress.value.fieldMap = calcSceneProgress('fieldMap', e.scrollTop)
})

function calcPageProgress(scrollTop: number) {
  // TODO: 根据页面总高度计算
  return Math.min(1, Math.max(0, scrollTop / 6000))
}

function calcSceneProgress(scene: string, scrollTop: number) {
  // TODO: 根据每个 scene 的 offsetTop / height 计算
  return 0
}
</script>
```

---

# 9. 关键组件设计

## 9.1 VideoBackdrop

```vue
<template>
  <view class="video-backdrop">
    <image v-if="!loaded" class="poster" :src="poster" mode="aspectFill" />
    <video
      v-if="shouldMount"
      class="video"
      :src="src"
      :poster="poster"
      :autoplay="autoplay"
      :loop="true"
      :muted="true"
      :controls="false"
      object-fit="cover"
      :show-center-play-btn="false"
      :show-play-btn="false"
      :show-fullscreen-btn="false"
      @loadedmetadata="loaded = true"
    />
    <view class="shade" />
  </view>
</template>
```

核心原则：

- 文案永远不要做进视频。
- 视频只做背景氛围。
- 所有屏幕必须有 poster 兜底。
- 离屏视频暂停或卸载。

## 9.2 SceneShell

```vue
<template>
  <view class="scene-shell" :id="id">
    <slot name="background" />
    <view class="scene-content">
      <slot />
    </view>
  </view>
</template>
```

```scss
.scene-shell {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background: var(--c-obsidian);
}

.scene-content {
  position: relative;
  z-index: 2;
  min-height: 100vh;
  padding: 96rpx 48rpx 72rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
```

---

# 10. 服务转化区信息架构

## 10.1 服务卡片字段

```ts
type ServiceCard = {
  id: string
  title: string
  subtitle: string
  audience: string
  includes: string[]
  outcome: string
  cta: string
}
```

## 10.2 服务卡片示例

```ts
const services = [
  {
    id: 'ai-transformation',
    title: '企业 AI 场景共创与落地陪跑',
    subtitle: '让 AI 进入团队真实工作流',
    audience: '适合管理层、HR、业务负责人、数字化负责人',
    includes: ['AI 转型访谈', '业务场景梳理', '团队培训', '工具实施', '试点陪跑'],
    outcome: '形成一套团队真的会用、业务真的用得上的 AI 工作方法。',
    cta: '预约场景共创'
  },
  {
    id: 'canvas-agent',
    title: '智能工作空间与 Agent 原型',
    subtitle: '把知识、任务与智能体放进同一张画布',
    audience: '适合需要沉淀知识、流程、任务协作的组织',
    includes: ['无限画布原型', '知识结构设计', 'Agent 工作流设计', '业务看板', 'MVP Demo'],
    outcome: '获得一个可演示、可迭代的智能协作原型。',
    cta: '了解画布与 Agent'
  },
  {
    id: 'aigc-video',
    title: 'AIGC 视频与品牌内容管线',
    subtitle: '从灵感生成到生产流程',
    audience: '适合品牌传播、课程内容、产品发布、企业宣传',
    includes: ['创意概念', '脚本分镜', '视频生成', '后期剪辑', '生产规范'],
    outcome: '建立可复用的视频内容生产流程，而不是一次性素材。',
    cta: '咨询视频管线'
  },
  {
    id: 'personal-capability',
    title: '个人 AI 能力建设',
    subtitle: '建立学习、研究与表达能力',
    audience: '适合学生、创作者、申请者、个人品牌建设者',
    includes: ['作品集网站', 'vibe coding', '研究项目表达', '申请表达', '海外学习准备'],
    outcome: '把个人想法转化为能被看见、能被表达、能被验证的作品。',
    cta: '查看个人服务'
  }
]
```

---

# 11. 首版 MVP 范围

## 11.1 必做

```txt
首页长滚动 11 屏
背景视频 + poster
四个现场模块
方法论模块
服务卡片
预约表单
视频懒加载/暂停
微信小程序真机测试
```

## 11.2 可后置

```txt
声音系统
复杂 canvas 节点动画
项目详情页
后台 CMS
用户行为埋点
多语言
真实 3D/WebGL
```

## 11.3 不建议首版做

```txt
完整 WebGL 大场景
大量前端实时粒子
过多页面跳转
每屏都有复杂交互
把所有视频都放进小程序包
没有 poster 的纯视频体验
```

---

# 12. 开发排期建议

```txt
第 1 阶段：视觉与内容锁定
- 确认 11 屏结构
- 确认每屏文案
- 生成/制作 poster 与视频素材

第 2 阶段：uni-app 骨架
- 首页场景组件
- VideoBackdrop
- Scroll progress
- IntersectionObserver
- 服务卡片与表单

第 3 阶段：动效细化
- Hero 文字进场
- 四个现场展开
- 无限画布节点动画
- 项目展廊动效

第 4 阶段：性能与真机测试
- 弱网 poster 兜底
- 视频加载策略
- 低端机滚动帧率
- 表单提交与错误提示
```

---

# 13. 最终气质判断标准

这个小程序做完后，用户应该产生这三个感觉：

```txt
1. 这家公司有审美，不是普通 AI 培训/外包团队。
2. 这家公司有方法，不是只会堆工具和概念。
3. 这家公司有真实交付能力，可以约一次聊聊。
```

如果某个设计或动效不能服务这三点，就删掉。

---

# 14. 参考来源

- Immersive Garden: https://immersive-g.com/
- Moooi - A Life Extraordinary: https://www.moooi.com/us/a-life-extraordinary
- uni-app Vue 3 / Vite / TypeScript CLI: https://uniapp.dcloud.net.cn/quickstart-cli.html
- uni-app 条件编译: https://uniapp.dcloud.net.cn/tutorial/platform.html
- uni-app video 组件: https://uniapp.dcloud.net.cn/component/video.html
- uni-app 页面 onPageScroll: https://uniapp.dcloud.net.cn/tutorial/page.html#onpagescroll
- uni-app IntersectionObserver: https://uniapp.dcloud.net.cn/api/ui/intersection-observer
- uni-app createAnimation: https://uniapp.dcloud.net.cn/api/ui/animation.html
- uni-app canvas 组件: https://uniapp.dcloud.net.cn/component/canvas.html
- lottie-miniprogram: https://github.com/wechat-miniprogram/lottie-miniprogram
