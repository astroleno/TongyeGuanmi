# Tongyeme 修改计划：稳定性、连续性、流程性与 UI/UX 系统化改造（执行修订版）

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use checkbox (`- [ ]`) syntax to track progress. Keep each PR small enough to verify independently.

**Goal:** 在不改正文叙事、不推倒重来、不重写核心文案的前提下，把 TongyeGuanmi 的发布稳定性、页面连续性、协作流程和 UI/UX 一致性变成可验证的工程契约。

**Architecture:** `src/index.template.html`、`src/partials/*.html`、`src/sections/*.html` 继续作为内容源；`npm run build:page` 生成根目录 `index.html`；`scripts/*.mjs` 负责结构、资源、联系入口、锚点和生成物检查；文档与发布流程放在 `docs/`；CI 只运行本地能稳定复现的验证命令。

**Tech Stack:** Static HTML/CSS/JS, Node.js ESM scripts, npm scripts, GitHub Actions after lockfile is present, no Playwright in the current round unless the user explicitly authorizes it.

---

本文件是 `/Users/aitoshuu/Downloads/tongyeme_MODIFICATION_PLAN.md` 的执行修订版。它保留原计划的主结构、措辞方向和“不改正文叙事”的约束，只修正会影响落地稳定性的部分：任务粒度、CI 前提、验证脚本范围、manifest 边界、联系入口、锚点连续性、媒体加载范围和 UI/UX 状态定义。

## 0. 背景与约束

当前项目已经具备静态页面生成、多个 transition 检查脚本和章节化源码结构，但仍有几个会影响稳定发布的问题：

- `package.json` 已有多个验证脚本，但没有统一的可发布验证入口。
- 项目目前没有 lockfile，CI 中直接使用 `npm ci` 会失败。
- `verify:copy` 目前已经是项目内检查，但它属于大段文案漂移 gate，第一阶段不直接加入 `verify:all`。
- `src/index.template.html` 已经使用 `<main id="top">`，导航和联系区依赖 `#top`，不能直接替换成 `main-content`。
- 联系入口仍有示例邮箱痕迹，上线前必须变成真实可用路径。
- 视频和非首屏媒体不仅存在于 `src/sections/*.html`，也存在于 `js/transitions/homepage/*` adapter。
- Shopify Editions 参考项目适合借鉴信息架构、扫描节奏和发布故事的连续性，不应直接照搬它的工程流程。
- 按用户约束，本轮不使用 Playwright；P3 的浏览器 smoke test 只作为显式授权后的增强项。

## 1. 修改原则

### 1.1 不做叙事和文字层面的改动

正文叙事、业务表达、服务定位、案例表述和核心文案继续以现有内容为准。本计划只允许做以下类型的文案级动作：

- 删除或替换明显的占位信息，例如示例邮箱、空链接、测试联系入口。
- 增加可访问性所需的短标签，例如 `aria-label`、跳转链接文字、按钮状态说明。
- 增加 release、architecture、asset policy 等工程文档，不重写页面正文。

### 1.2 不推倒重来

保留现有静态站架构：

- 继续由 `src/index.template.html` 组装页面。
- 继续使用 `src/sections/*.html` 维护章节。
- 继续通过 `npm run build:page` 生成 `index.html`；当前 `package.json` 中该命令指向 `scripts/build-index.mjs`。
- 继续保留已有 transition runtime，不在第一轮重写动画系统。
- UI 优化优先通过 token、状态、布局密度和可扫描性完成。

### 1.3 把“人工记忆”变成“工程契约”

本计划的核心不是增加更多说明，而是让关键发布条件可以被脚本验证：

- 页面可以稳定构建。
- 生成物和源码没有漂移。
- 联系入口真实可用。
- 内部锚点不会断。
- transition 模块引用不会漂移。
- 媒体加载策略有明确边界。
- 文档说明源文件、生成文件和发布流程。

### 1.4 UI/UX 优化以结构为主，不以文案为主

UI/UX 的改动范围限定为：

- 导航、进度、章节定位和移动端关键路径。
- 服务与场景信息的结构化呈现。
- 焦点态、当前态、展开态、加载态、错误态和 reduced motion。
- typography、spacing、motion、z-index 的 token 化。
- 响应式 CSS 的收敛和章节样式下沉。

## 2. 总体目标

### 2.1 稳定性目标

- 任意开发者可以通过一个命令完成发布前验证。
- CI 只使用项目内可复现的命令，不依赖本机路径。
- 发布前可以发现占位联系入口、断裂锚点、生成物漂移、transition 配置漂移和明显媒体加载风险。
- 资源检查从轻量规则开始，避免第一次接入就误伤大量历史资产。

### 2.2 连续性目标

- 页面章节、导航、进度和 transition 的关系清晰。
- `#top` 继续作为现有回到顶部锚点，新增 `#main-content` 作为可访问性跳转目标。
- 内部 scene transition 先通过 verifier 固化契约，再在出现第二个内部 scene 区块后考虑 manifest 化。
- 章节 manifest 只承载人类维护且多处消费的字段，不把所有资源和场景运行时都塞进去。

### 2.3 流程性目标

- PR 拆分与 P0/P1/P2/P3 一一对应。
- 每个 PR 有独立验收命令。
- Release checklist 能说明 build、generated output、navigation、contact、accessibility、assets、performance、transitions 和 known exceptions。
- 架构文档说明 source of truth、generated files、build flow、verification flow、transition system、asset policy 和 do-not-edit 规则。

## 3. 优先级路线图

## P0：上线风险与协作基础修复

目标：不改变叙事、不重做设计，先让项目可以被稳定验证和发布。

### P0-0. 增加 lockfile 与 CI 前提

#### 问题

原计划中的 CI 示例使用 `npm ci`，但当前项目没有 `package-lock.json`、`pnpm-lock.yaml` 或 `yarn.lock`。在没有 lockfile 的情况下直接添加 CI 会让验证入口本身变成失败源。

#### 修改文件

- `package-lock.json`
- `.github/workflows/verify.yml`
- `docs/ARCHITECTURE.md`

#### 修改内容

- 先运行一次 `npm install --package-lock-only` 生成 npm lockfile。
- CI 使用 `npm ci` 的前提是 `package-lock.json` 已提交。
- `docs/ARCHITECTURE.md` 写清楚项目使用 npm lockfile，不混用包管理器。

#### 验收标准

- 仓库根目录存在 `package-lock.json`。
- 本地 `npm ci` 可以成功执行。
- CI 文件只在 lockfile 提交后合入。

### P0-1. 增加统一验证入口 `verify:all`

#### 问题

当前 `package.json` 已有多个验证脚本，但没有统一入口。原计划希望把 `verify:copy` 加回统一验证；当前脚本已经不依赖 Downloads 路径，但它会检查较长的正文基线，第一阶段不适合作为所有 PR 的默认 gate。

#### 修改文件

- `package.json`

#### 修改内容

PR 1 的第一版 `verify:all` 只包含当前已经存在、且项目内可复现的检查：

```json
{
  "scripts": {
    "check:generated": "npm run build:page && git diff --exit-code -- index.html",
    "verify:all": "npm run verify:ink-modules && npm run verify:scroll-modules && npm run verify:section-transitions && npm run verify:transition-runtime && npm run verify:homepage-transitions && npm run check:generated"
  }
}
```

`verify:contact` 在 PR 3 创建 `scripts/check-contact-placeholders.mjs` 并修复联系入口后加入 `verify:all`。

`verify:links` 在 PR 4 创建 `scripts/check-links.mjs` 并补齐 `#main-content` 后加入 `verify:all`。

`verify:copy` 的处理方式：

- 保留现有脚本名，避免破坏已有使用习惯。
- 不为了旧版 Downloads 描述去修改 `scripts/check-copy-alignment.mjs`。
- 在文案基线由负责人确认后，再决定是否加入 `verify:all`。
- 保持“禁用过期词 + 关键声明存在”的边界，避免把轻微排版调整变成误报。

#### 验收标准

- `npm run verify:all` 在干净生成物状态下通过。
- `npm run check:generated` 能在 `index.html` 漂移时失败。
- `verify:copy` 保持可手动运行，但第一阶段不阻塞所有 PR。
- `verify:all` 不引用尚未创建的检查脚本。
- `verify:all` 不依赖本机私有文件。

### P0-2. 增加 CI gate

#### 问题

没有 CI gate 时，验证结果依赖人工记忆。CI 需要先解决 lockfile，再接入统一验证入口；PR 1 完成后即可接最小 CI，不必等待 contact、links、media 全部完成。

#### 新增文件

- `.github/workflows/verify.yml`

#### 建议内容

```yaml
name: Verify

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run verify:all
```

#### 验收标准

- PR 会自动运行 `npm run verify:all`。
- CI 不运行 Playwright。
- CI 不读取 Downloads、本机绝对路径或未提交文件。

### P0-3. 修复联系入口占位符

#### 问题

联系入口是上线断点。示例邮箱、空链接、不可用 `mailto:`、缺失二维码或无效表单地址都会让用户转化链路中断。

#### 修改文件

- `src/sections/contact.html`
- `src/index.template.html`
- `scripts/check-contact-placeholders.mjs`

#### 修改内容

- 统一使用真实邮箱、表单地址或真实二维码资源。
- 若真实联系方式尚未确定，该 PR 不合入发布分支。
- 创建 `scripts/check-contact-placeholders.mjs` 后，把 `verify:contact` 加入 `verify:all`。
- `verify:contact` 检查：
  - 禁止 `contact@example.com`、`example.com`、空 `href`、`javascript:void(0)`。
  - `mailto:` 必须包含非示例邮箱。
  - 二维码图片路径必须存在。
  - 表单 URL 必须是 `https://`。

#### 验收标准

- `npm run verify:contact` 通过。
- `npm run verify:all` 在加入 `verify:contact` 后通过。
- 页面上的联系 CTA 都能落到真实路径。
- 没有把未知联系方式伪装成“稍后补齐”的可发布状态。

### P0-4A. 补 skip link、`#main-content` 与内部锚点检查

#### 问题

当前页面是沉浸式叙事站，但仍需要最基础的键盘和读屏器路径。原计划直接把 `<main id="top">` 改成 `main-content` 会破坏现有 `#top` 依赖。第一步只处理跳转目标和内部锚点，不同时改移动菜单和滚动状态。

#### 修改文件

- `src/index.template.html`
- `css/styles.css`
- `scripts/check-links.mjs`

#### 修改内容

- 保留 `<main id="top">`。
- 在 `<main id="top">` 内、hero 之前新增 `#main-content` 跳转目标；默认语义是“跳过导航进入主内容首屏”，不跳过 hero。
- 在 nav 前增加 skip link。
- 创建 `scripts/check-links.mjs` 后，把 `verify:links` 加入 `verify:all`。
- 加入 `:focus-visible` 样式。

建议结构：

```html
<a class="skip-link" href="#main-content">跳到主要内容</a>
<nav class="site-nav" aria-label="主导航">
  ...
</nav>
<main id="top">
  <div id="main-content" class="main-content-anchor" tabindex="-1" aria-label="主要内容"></div>
  ...
</main>
```

#### 验收标准

- `href="#top"` 和 `href="#main-content"` 都有效。
- `npm run verify:all` 在加入 `verify:links` 后通过。
- 键盘可以跳过导航进入主要内容。
- `#main-content` 的目标位置写入 UI/UX 决策记录；默认在 hero 前。

### P0-4B. 补导航状态、移动菜单与 reduced motion

#### 问题

移动菜单、当前章节状态和 reduced motion 会触及 `js/main.js` 的交互行为，应该在锚点检查稳定后单独实现。

#### 修改文件

- `src/partials/nav.html`
- `css/styles.css`
- `js/main.js`

#### 修改内容

- 给主导航增加 `aria-label`。
- 当前章节更新时同步 `aria-current="true"`。
- 移动端菜单按钮使用 `aria-expanded` 和 `aria-controls`。
- 菜单关闭后焦点回到触发按钮。
- fixed layer 不遮挡键盘焦点。
- `prefers-reduced-motion: reduce` 下禁用非必要滚动动画和长时 transition。

#### 验收标准

- 导航当前态有视觉状态和 `aria-current`。
- 移动端菜单的打开、关闭和焦点返回可以用键盘完成。
- reduced motion 下页面仍可阅读和导航。

### P0-5. 调整视频与非首屏资源加载策略

#### 问题

原计划只检查 `src/sections/*.html`，但当前 `preload="auto"` 也出现在 `js/transitions/homepage/*` adapter。只改 section 文件会漏掉首屏之外的主要加载压力。

#### 修改文件

- `src/sections/hero.html`
- `src/sections/*.html`
- `js/transitions/homepage/*.js`
- `scripts/check-media-policy.mjs`
- `scripts/check-assets-lite.mjs`
- `docs/assets-policy.md`

#### 修改内容

建立媒体清单，按来源分类：

- hero 首屏视频。
- homepage transition adapter 视频。
- 章节内展示视频。
- archive、实验、备用和历史素材。

`verify:media` 的第一阶段规则：

- 首屏 hero 可以保留明确的加载策略，但必须有 poster。
- 非首屏视频默认 `preload="metadata"` 或延迟创建。
- adapter 内的视频也必须有 poster 或明确豁免。
- `scripts/check-media-policy.mjs` 只负责视频 preload、poster、adapter 覆盖和媒体加载策略。

`verify:assets-lite` 的第一阶段规则：

- 检查被 HTML、CSS、JS 引用的本地资源是否存在。
- 检查 `.pre-*`、`.backup*`、`.bad-*`、`.tmp` 等历史资产引用，禁止被页面或脚本引用。
- 检查发布引用不得指向 `tmp/`。
- 只检查“被引用资源”和轻量预算，不扫描全仓库 2GB 临时目录。

#### 验收标准

- `npm run verify:media` 通过。
- `npm run verify:assets-lite` 通过。
- 所有被引用视频有明确 preload 策略。
- 非首屏 adapter 不再无约束地 `preload="auto"`。
- 文档记录 hero、transition、section、archive 的媒体边界。

## P1：结构产品化与 manifest 化

目标：把章节、scene、资源、依赖都纳入可追踪系统，降低后续漂移风险。manifest 不追求一次装下全部信息，只承载稳定、人工维护、被多处消费的字段。

### P1-1. 增强 `section-manifest.mjs`，生成章节导航 / 进度组件

#### 问题

章节导航和进度组件如果靠人工同步，会出现顺序、锚点和当前态漂移。

#### 修改文件

- `src/section-manifest.mjs`
- `src/partials/nav.html`
- `src/index.template.html`
- `js/main.js`
- `scripts/check-section-manifest.mjs`

#### 建议 manifest 字段

```js
export const sections = [
  {
    id: "method",
    sourcePath: "src/sections/method.html",
    navLabel: "方法",
    progressLabel: "方法",
    order: 30,
    anchors: ["method"],
    includeInNav: true,
    includeInProgress: true
  }
];
```

不在第一阶段放入：

- assets 明细。
- scene runtime 全量参数。
- copyRefs。
- 组件视觉配置。

#### 实现方式

- `section-manifest.mjs` 生成 nav 和 progress 的数据源。
- `check-section-manifest.mjs` 检查 id、sourcePath、order、anchors 是否存在。
- `verify:links` 检查生成后的 `index.html` 中锚点是否真实存在。

#### 验收标准

- 修改 section 顺序只需要改 manifest。
- nav 和 progress 不各自维护一份顺序。
- manifest 字段没有膨胀成资源数据库。

### P1-2. 把内部 scene transition 先验证，再 manifest 化

#### 问题

当前 `src/sections/method.html` 已经有内部 scene transition，runtime 会扫描 `.scene-transition[data-transition-module]`。在只有一个内部 scene 区块时，直接迁移成全局 scene manifest 风险偏高。

#### 修改文件

- `src/sections/method.html`
- `js/transitions/homepage-transition-runtime.js`
- `scripts/check-scene-transitions.mjs`
- `package.json`

#### 建议结构

第一阶段只建立 verifier：

- 检查 `.scene-transition[data-transition-module]`。
- 检查 `data-stage-stops`、`data-play-ms`、`data-hold-vh`、`data-post-scroll-vh` 是否为合法数值。
- 检查 transition module 是否存在。
- 检查 scene 内部必要 media 或 stage 节点是否存在。

第二个内部 scene 区块出现后，再引入：

```js
export const sceneTransitions = [
  {
    sectionId: "method",
    module: "method-transition",
    stageStops: [0, 0.33, 0.66, 1],
    playMs: 1800,
    holdVh: 120,
    postScrollVh: 60
  }
];
```

#### 验收标准

- `npm run verify:scene-transitions` 通过。
- 当前 runtime 行为不被重写。
- manifest 化有第二个消费者或第二个 scene 区块作为触发条件。

### P1-3. 统一依赖加载策略

#### 问题

Transition 依赖、页面主脚本和第三方库如果各自加载，容易出现重复加载、顺序漂移和失败状态不清晰。

#### 修改文件

- `js/transitions/load-libraries.js`
- `js/transitions/homepage-transition-runtime.js`
- `js/main.js`
- `docs/ARCHITECTURE.md`

#### 决策选项

第一阶段采用集中 loader：

- 所有 transition 依赖通过 `load-libraries.js` 进入。
- loader 提供 loaded、failed、skipped 三种状态。
- 依赖失败时页面内容仍可阅读。
- 不在第一阶段更换 bundler。

#### 验收标准

- transition 依赖没有重复注入。
- 依赖失败时不会阻塞正文。
- 架构文档能说明依赖入口和失败策略。

### P1-4. 增加 assets policy 与轻量资源预算检查

#### 问题

原计划的 assets manifest 字段较重，当前 `assets/` 体积较大，`tmp/` 也很大。第一次接入全量 hash、referencedBy 和预算失败会导致大量噪音。

#### 新增文件

- `scripts/check-assets-lite.mjs`
- `docs/assets-policy.md`

#### 建议检查项

第一阶段检查“被引用资源”：

- HTML、CSS、JS 中引用的本地资源必须存在。
- 页面引用不得指向 `tmp/`。
- 页面引用不得包含 `.pre-`、`.backup`、`.bad-`、`.tmp` 命名。
- 被引用视频必须符合 preload 和 poster 规则。
- 首屏资源体积超过预算时输出失败或明确豁免。

第二阶段再增加：

- `assets-manifest.json`
- hash。
- referencedBy。
- release summary assets 表格。

#### 资源目录规则

- `assets/` 放发布可用资源。
- `tmp/` 只放本机工作文件，不能被页面引用。
- 历史备份、坏帧、预处理文件不能进入发布引用。

#### 验收标准

- `npm run verify:assets-lite` 通过。
- 被引用资源 100% 存在。
- 没有发布页面引用 `tmp/` 或历史备份资源。

### P1-5. 增加架构文档与新增模块流程

#### 问题

项目需要把“从哪里改、改完跑什么、哪些文件不要手改”写清楚。

#### 新增文件

- `docs/ARCHITECTURE.md`
- `docs/release-checklist.md`
- `docs/assets-policy.md`
- `docs/adr/0001-static-page-source-of-truth.md`

#### `docs/ARCHITECTURE.md` 建议结构

```md
# Architecture

## Source of truth

## Generated files

## Build flow

## Verification flow

## Transition system

## Asset policy

## Do not edit directly
```

#### 验收标准

- 新人能从文档判断应编辑 `src/` 还是 `index.html`。
- 文档列出 `npm run verify:all`。
- 文档说明 `verify:copy` 暂不进入统一 gate 的原因和恢复条件。

### P1-6. 增加 release summary 机制

#### 问题

发布前需要一份机器可生成、人工可读的摘要，帮助确认构建、章节、资产和检查结果。

#### 新增文件

- `scripts/generate-release-summary.mjs`
- `docs/release-summary.md`

#### release summary 内容

```md
# Release Summary

## Build

## Sections

## Assets

## Checks

## Known exceptions
```

#### 验收标准

- `npm run release:summary` 能生成文档。
- release summary 不读取本机私有路径。
- known exceptions 必须有原因、影响范围和移除条件。

## P2：UI/UX 系统化优化，不改正文叙事

目标：提升可扫描性、章节定位、移动端体验和一致性，不进行文案重写。

### P2-0. UI/UX 决策记录 gate

#### 问题

P2 会触及移动端导航、progress 呈现、章节跳转语义和 token 例外范围。没有先记录设计决策时，后续 PR 容易各自假设不同交互模型。

#### 新增文件

- `docs/ux-decisions.md`

#### 必须先定的决策

- 移动菜单形态：默认使用顶部导航下拉菜单，不使用底部常驻遮罩栏；如果改成全屏菜单，需要记录焦点管理和关闭路径。
- progress 显示范围：默认只显示 `includeInProgress: true` 的主章节，不显示内部 scene 或装饰性 transition。
- `#main-content` 跳转语义：默认跳过导航进入 hero 前的主内容起点；如果后续把 hero 视为装饰，需要改到第一段正文 section，并同步 `verify:links`。
- token 例外范围：只有已有沉浸式 transition、媒体舞台和固定比例画面可以申请局部例外，例外必须写清原因。

#### 验收标准

- P2 任何 UI PR 开始前，`docs/ux-decisions.md` 已记录以上四项。
- PR 描述引用对应决策，不在实现里临时发明交互模型。

### P2-1. 增加 section index / progress rail

#### 问题

当前页面沉浸感强，但长页浏览时用户容易失去章节位置。P1 已经解决数据源，P2 负责视觉和交互。

#### 修改文件

- `src/partials/progress.html`
- `src/index.template.html`
- `css/styles.css`
- `js/main.js`

#### 设计要求

- 桌面端：使用轻量 vertical progress rail，固定在内容外侧，不压住正文和 CTA。
- 移动端：使用导航下方的横向 section index，支持横向滚动和当前态，不使用底部遮罩式常驻栏。
- 当前章节必须有视觉状态和 `aria-current`。
- 点击 section index 后焦点进入目标章节标题或 `#main-content` 后的最近章节。
- reduced motion 下不做长距离平滑滚动。

#### 非目标

- 不重写章节文案。
- 不把 progress rail 做成营销式大卡片。
- 不新增独立 landing section。

#### 验收标准

- 桌面和移动端都能判断当前章节。
- section index 不遮挡主要内容。
- 键盘和读屏器能理解当前态。

### P2-2. 服务 / 场景卡片组件结构化

#### 问题

服务和场景信息需要更容易扫描，但不能因为组件化而发明新的业务文案。

#### 修改文件

- `src/sections/*.html`
- `css/sections/*.css`
- `src/section-manifest.mjs`

#### 结构方向

- 保留原句和原段落。
- 只把已有内容分组为 eyebrow、title、body、chips、proof、CTA。
- 如果需要 micro-summary，必须能追溯到同一章节已有句子，且不超过 28 个中文字符。
- 第一阶段不引入 `copyRefs` 数据结构。

#### 建议 HTML 结构

```html
<article class="service-card">
  <p class="service-card__eyebrow">...</p>
  <h3 class="service-card__title">...</h3>
  <div class="service-card__body">
    ...
  </div>
  <ul class="service-card__chips" aria-label="服务标签">
    ...
  </ul>
</article>
```

#### 验收标准

- 核心正文未被重写。
- 卡片只提升扫描性，不改变信息承诺。
- 移动端卡片高度不因 hover 或长词产生布局跳动。

### P2-3. token 化 typography / spacing / motion / z-index

#### 问题

视觉一致性需要通过 token 收敛，而不是在每个 section 里重复写局部值。

#### 修改文件

- `css/styles.css`
- `css/sections/*.css`

#### 建议 token

```css
:root {
  --font-size-body: 1rem;
  --font-size-step-1: 1.125rem;
  --font-size-step-2: 1.5rem;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --motion-fast: 160ms;
  --motion-base: 240ms;
  --z-nav: 40;
  --z-overlay: 60;
}
```

#### 规则

- 字号不使用 viewport width 缩放。
- letter spacing 默认为 0，只有小号标签在必要时微调。
- 卡片圆角不超过 8px，除非已有设计系统有明确例外。
- 页面区块不套卡片，卡片只用于重复项、工具面板或 modal。

#### 验收标准

- 主要 typography、spacing、motion、z-index 来自 token。
- CSS 中大面积重复 magic number 明显减少。
- 移动端文本不溢出按钮或卡片。

### P2-4. 清理重复响应式 CSS，section 样式继续下沉

#### 问题

响应式规则分散会导致某些 section 在移动端出现局部修复、局部回归。

#### 修改文件

- `css/styles.css`
- `css/sections/*.css`

#### 规则

- 全局 layout、nav、token 放在 `css/styles.css`。
- 章节独有视觉放在 `css/sections/*.css`。
- 同一断点的规则尽量集中。
- 固定格式 UI 元素使用 `aspect-ratio`、`minmax()`、`min-height` 或明确尺寸，避免状态变化撑开布局。

#### 验收标准

- 移动端主要断点没有互相覆盖的重复规则。
- hover、focus、current、open 状态不会造成布局跳动。

### P2-5. 移动端导航不隐藏关键路径

#### 问题

移动端如果隐藏导航、联系入口或进度入口，用户无法快速回到关键路径。

#### 修改文件

- `src/partials/nav.html`
- `src/partials/progress.html`
- `css/styles.css`
- `js/main.js`

#### 设计要求

- 移动端保留品牌、菜单按钮、主要 CTA。
- 展开菜单有明确焦点顺序和关闭路径。
- section index 位于导航后方，不覆盖正文。
- 联系 CTA 在菜单展开态和页面联系区都可访问。
- 菜单关闭后焦点回到触发按钮。

#### 验收标准

- 单手浏览时能进入联系路径。
- 键盘打开和关闭菜单后焦点位置合理。
- 菜单状态不会与 progress 当前态冲突。

## P3：测试、监控与发布体验增强

目标：在 P0 / P1 / P2 的基础上，让项目具备更完整的上线验证和回归能力。

### P3-1. 增加浏览器 smoke test（需要显式授权）

#### 问题

浏览器级检查可以发现静态脚本无法覆盖的 runtime 问题，但当前用户规则明确说明未指明时不要使用 Playwright。

#### 新增文件

- `tests/smoke/homepage.spec.mjs`
- `playwright.config.mjs`

#### 测试范围

- 页面无 console error。
- 导航锚点可点击。
- 联系 CTA 可见。
- reduced motion 下页面可阅读。
- transition 容器不空白。

#### package scripts

```json
{
  "scripts": {
    "test:smoke": "playwright test"
  }
}
```

#### 验收标准

- 只有用户明确授权后才安装和运行 Playwright。
- `test:smoke` 不加入当前 `verify:all`。
- CI 中是否运行由单独 PR 决定。

### P3-2. 扩展 link check 与 anchor check

#### 问题

P0 已覆盖内部锚点。P3 可以扩展到外链、下载资源和社交链接，但需要避免网络抖动造成 CI 不稳定。

#### 新增文件

- `scripts/check-external-links.mjs`

#### 检查项

- 内部锚点继续在 P0 强制检查。
- 外链采用 allowlist + HEAD/GET 可选检查。
- 网络检查默认不进 `verify:all`，只在 release 前或手动命令运行。

#### 验收标准

- 内链断裂必失败。
- 外链问题有报告，但不让日常 CI 因网络波动失败。

### P3-3. 增加基础前端监控事件

#### 问题

静态站也需要知道联系入口、导航、关键 section 的使用情况，但监控不能污染用户体验。

#### 新增文件

- `js/analytics-events.js`
- `docs/analytics-events.md`

#### 事件建议

- `nav_click`
- `section_view`
- `contact_click`
- `media_error`
- `transition_error`

#### 原则

- 不采集个人敏感信息。
- 不阻塞页面主流程。
- 监控失败不影响页面阅读。
- 事件命名写入文档。

#### 验收标准

- 事件有统一命名。
- 监控代码可以关闭。
- 页面无监控依赖时仍完整可用。

## 4. 建议 PR 拆分

### PR 1：lockfile、验证入口与生成物检查

范围：

- 生成 `package-lock.json`。
- 添加 `check:generated`。
- 添加第一版最小 `verify:all`，只包含当前已存在的检查脚本和 `check:generated`。
- 保持 `verify:copy` 可手动运行，但不加入统一 gate。

验收：

- `npm ci`
- `npm run verify:all`

### PR 2：CI 最小 gate

范围：

- 添加 `.github/workflows/verify.yml`。
- CI 只运行 `npm ci` 和当前稳定的 `npm run verify:all`。
- 不等待 contact、links、media 完成后才接 CI。

验收：

- GitHub Actions 通过。

### PR 3：联系入口检查

范围：

- 修复联系入口。
- 新增 `verify:contact`。
- 创建 `scripts/check-contact-placeholders.mjs`。
- 将 `verify:contact` 加入 `verify:all`。

验收：

- `npm run verify:contact`
- `npm run verify:all`

### PR 4：skip link、`#main-content` 与内部锚点检查

范围：

- skip link。
- 保留 `#top`，新增 `#main-content`。
- 新增 `verify:links`。
- 创建 `scripts/check-links.mjs`。
- 将 `verify:links` 加入 `verify:all`。
- focus-visible。

验收：

- `npm run verify:links`
- `npm run verify:all`

### PR 5：导航状态、移动菜单与 reduced motion

范围：

- nav `aria-label`。
- current state。
- mobile menu aria 状态。
- 菜单关闭后的焦点返回。
- reduced motion。

验收：

- `npm run verify:all`
- 手动键盘检查：Tab、Enter、Esc、Shift+Tab。

### PR 6：媒体加载策略与资源引用轻量检查

范围：

- 建立媒体引用清单。
- 调整非首屏视频 preload。
- adapter 视频纳入检查。
- 新增 `verify:media`：只管视频 preload、poster、adapter 覆盖和媒体加载策略。
- 新增 `verify:assets-lite`：只管本地资源存在性、`tmp/` 引用、backup/bad/pre 文件引用和轻量预算。

验收：

- `npm run verify:media`
- `npm run verify:assets-lite`
- `npm run verify:all`

### PR 7：架构文档与 release checklist

范围：

- `docs/ARCHITECTURE.md`
- `docs/release-checklist.md`
- `docs/assets-policy.md`
- ADR：source of truth。

验收：

- 文档能解释源码、生成物、验证入口和资源策略。

### PR 8：section manifest 增强与章节进度

范围：

- 精简 manifest 字段。
- nav/progress 使用同一数据源。
- 新增 `verify:section-manifest`。

验收：

- `npm run verify:section-manifest`
- `npm run verify:links`

### PR 9：内部 scene transition verifier

范围：

- 新增 `verify:scene-transitions`。
- 检查 scene transition data attributes 和 module。
- 不重写现有 runtime。

验收：

- `npm run verify:scene-transitions`
- `npm run verify:homepage-transitions`

### PR 10：依赖加载统一

范围：

- 收敛 transition dependency loader。
- 明确 loaded、failed、skipped 状态。
- 文档记录失败策略。

验收：

- `npm run verify:transition-runtime`
- transition 依赖失败时正文可读。

### PR 11：assets manifest 与预算第二阶段

范围：

- 在轻量检查稳定后加入 `assets-manifest.json`。
- 增加 referencedBy、hash 和 release summary assets 表。

验收：

- `npm run verify:assets`
- `npm run release:summary`

### PR 12：UI 决策、token 与响应式整理

范围：

- 新增 `docs/ux-decisions.md`。
- 记录移动菜单形态、progress 显示范围、`#main-content` 跳转语义和 token 例外范围。
- typography、spacing、motion、z-index token。
- progress rail 与移动端 section index。
- 响应式 CSS 收敛。

验收：

- 移动端文本不溢出。
- hover/focus/current/open 状态不造成布局跳动。

### PR 13：可选浏览器 smoke test 与监控事件

范围：

- 只在明确授权后加入 Playwright。
- 增加 analytics events 文档。
- 浏览器 smoke test 不进入当前 `verify:all`。

验收：

- 用户授权后运行 `npm run test:smoke`。
- 监控失败不影响页面可用性。

## 5. 新增脚本清单

第一阶段 PR 1：

- `check:generated`
- `verify:all`

第一阶段 PR 3-4：

- `verify:contact`
- `verify:links`

第二阶段 PR 6：

- `verify:media`
- `verify:assets-lite`

第三阶段：

- `verify:section-manifest`
- `verify:scene-transitions`

第四阶段：

- `verify:assets`
- `release:summary`
- `test:smoke`，需要显式授权。

最终 `package.json` 推荐脚本表。`build:page` 以当前 `package.json` 为准；本仓库现在指向 `scripts/build-index.mjs`：

```json
{
  "scripts": {
    "build:page": "node scripts/build-index.mjs",
    "check:generated": "npm run build:page && git diff --exit-code -- index.html",
    "verify:contact": "node scripts/check-contact-placeholders.mjs index.html src/sections/contact.html",
    "verify:links": "node scripts/check-links.mjs index.html",
    "verify:media": "node scripts/check-media-policy.mjs",
    "verify:assets-lite": "node scripts/check-assets-lite.mjs",
    "verify:section-manifest": "node scripts/check-section-manifest.mjs",
    "verify:scene-transitions": "node scripts/check-scene-transitions.mjs",
    "verify:all": "npm run verify:ink-modules && npm run verify:scroll-modules && npm run verify:section-transitions && npm run verify:transition-runtime && npm run verify:homepage-transitions && npm run verify:contact && npm run verify:links && npm run verify:media && npm run verify:assets-lite && npm run check:generated",
    "release:summary": "node scripts/generate-release-summary.mjs"
  }
}
```

## 6. 新增文档清单

- `docs/modification-plans/2026-06-22-tongyeme-hardening-implementation-plan.md`
- `docs/ARCHITECTURE.md`
- `docs/release-checklist.md`
- `docs/assets-policy.md`
- `docs/ux-decisions.md`
- `docs/analytics-events.md`
- `docs/adr/0001-static-page-source-of-truth.md`

## 7. Release checklist 草案

```md
# Release Checklist

## Build

- [ ] `npm ci` passes.
- [ ] `npm run build:page` passes.

## Generated output

- [ ] `npm run check:generated` passes.
- [ ] Root `index.html` is generated from `src/`.

## Navigation and anchors

- [ ] `npm run verify:links` passes.
- [ ] `#top` and `#main-content` both exist.
- [ ] Main navigation current state is visible and exposed with `aria-current`.

## Contact

- [ ] `npm run verify:contact` passes.
- [ ] Contact CTA points to real email, form, phone, or QR asset.

## Accessibility

- [ ] Skip link reaches main content.
- [ ] Keyboard can open and close mobile navigation.
- [ ] Focus styles are visible.
- [ ] Reduced motion remains readable.

## Assets

- [ ] `npm run verify:media` passes.
- [ ] `npm run verify:assets-lite` passes.
- [ ] Referenced local assets exist.
- [ ] No release references point to `tmp/` or backup assets.

## Performance

- [ ] Non-first-screen videos do not use unbounded auto preload.
- [ ] Hero media has poster and explicit loading strategy.

## Transitions

- [ ] Existing transition verification scripts pass.
- [ ] `npm run verify:scene-transitions` passes after it is introduced.

## Release summary

- [ ] `npm run release:summary` passes after it is introduced.
- [ ] Known exceptions include reason, impact, and removal condition.
```

## 8. 文件级改动地图

### `package.json`

目标：

- PR 1 增加 `check:generated` 和第一版最小 `verify:all`。
- PR 3 增加 `verify:contact`，并在脚本创建和联系入口修复后加入 `verify:all`。
- PR 4 增加 `verify:links`，并在脚本创建和锚点补齐后加入 `verify:all`。
- 后续增加 `verify:media`、`verify:assets-lite`、`verify:section-manifest`、`verify:scene-transitions`、`release:summary`。
- 当前不把 `test:smoke` 加入 `verify:all`。

### `src/section-manifest.mjs`

目标：

- 成为章节顺序、nav label、progress label 和 sourcePath 的唯一数据源。
- 不承载 assets 全量清单。
- 不承载 scene runtime 全量参数，直到出现第二个内部 scene 区块。

### `src/index.template.html`

目标：

- 保留 `<main id="top">`。
- 增加 `#main-content`。
- 接入 skip link。
- 让 nav、progress、section 顺序来自同一数据源。

### `src/partials/nav.html`

目标：

- 增加 `aria-label`。
- 当前态支持 `aria-current`。
- 移动端菜单按钮支持 `aria-expanded` 和 `aria-controls`。
- 保留联系 CTA 的可达性。

### `src/sections/contact.html`

目标：

- 删除示例联系方式。
- 所有联系路径真实可用。
- 联系方式缺失时不允许发布。

### `src/sections/method.html`

目标：

- 保留现有 scene transition 行为。
- data attributes 纳入 verifier。
- 不在第一阶段迁移到全局 scene manifest。

### `js/main.js`

目标：

- 管理 nav 当前态。
- 管理 progress 当前态。
- 管理移动端菜单焦点。
- 尊重 reduced motion。

### `js/transitions/load-libraries.js`

目标：

- 收敛 transition 依赖加载。
- 暴露 loaded、failed、skipped 状态。
- 依赖失败不阻塞正文。

### `js/transitions/homepage/*.js`

目标：

- adapter 内视频也遵守 preload 和 poster 策略。
- 被引用资源纳入媒体检查。

### `assets/**/*`

目标：

- 发布引用只指向可用资源。
- 备份、坏帧、预处理资源不能被页面引用。
- 全量 manifest 在轻量检查稳定后引入。

## 9. 验收指标

### 稳定性指标

- `npm ci` 可复现安装。
- `npm run verify:all` 可在本地和 CI 运行。
- `check:generated` 能发现生成物漂移。
- 联系入口、内部锚点和媒体策略都有脚本覆盖。

### 连续性指标

- `#top`、`#main-content`、nav、progress、section heading 之间关系稳定。
- manifest 字段少而清晰。
- scene transition 在 runtime 不重写的情况下获得校验。
- adapter 视频不被漏检。

### 流程性指标

- 每个 PR 都有独立验收命令。
- release checklist 可以作为发布前清单使用。
- 架构文档能解释 source of truth 和 generated files。
- known exceptions 有退出条件。

### UI/UX 指标

- 用户可以知道自己在第几个章节。
- 移动端不隐藏主要 CTA。
- 键盘可访问主流程。
- focus、hover、current、open、loading、error、reduced-motion 状态明确。
- 卡片和导航不会因为状态变化产生布局跳动。

## 10. PR 模板建议

```md
## Change type

- [ ] Verification
- [ ] CI
- [ ] Contact
- [ ] Accessibility
- [ ] Media
- [ ] Manifest
- [ ] UI/UX
- [ ] Docs

## Scope

What changed:

## Not in scope

What intentionally did not change:

## Verification

- [ ] `npm ci`
- [ ] `npm run verify:all`
- [ ] Other command:

## Assets

- [ ] No new asset
- [ ] New asset listed below
- [ ] Asset policy checked

## Screenshots

Desktop:

Mobile:

## Exceptions

Reason:
Impact:
Removal condition:
```

## 11. 风险与处理

### 风险 1：manifest 过度膨胀

处理：

- P1-1 只放 section 顺序、label、sourcePath、anchors。
- assets、scene runtime 和 copyRefs 不在第一阶段进入 section manifest。
- 只有出现第二个消费者时才提升到 manifest。

### 风险 2：CI 一次接入太多导致开发阻塞

处理：

- 先生成 lockfile。
- CI 第一版只运行 `verify:all`。
- `verify:all` 第一版只包含项目内稳定检查。
- 外链网络检查和 Playwright 不进入当前 CI。

### 风险 3：progress rail 影响现有沉浸式视觉

处理：

- 桌面 rail 放在内容外侧。
- 移动端使用导航下方横向 section index。
- 不使用遮挡正文的底部常驻栏。

### 风险 4：依赖加载策略调整引发 transition 行为差异

处理：

- 先加 verifier，再收敛 loader。
- 不在同一个 PR 中同时迁移 runtime 和改视觉。
- 依赖失败时保留正文可读。

### 风险 5：资源预算误伤现有必要资产

处理：

- 第一阶段只检查被引用资源。
- 全量 manifest 和预算第二阶段接入。
- 每个预算失败都要有资源路径、引用来源和处理建议。

### 风险 6：联系信息未确定但流程误判为可发布

处理：

- 缺少真实联系方式时，PR 不合入发布分支。
- `verify:contact` 把示例联系方式视为失败。
- release checklist 单独列出 contact。

## 12. 推荐执行顺序

第 1 组：P0-0 + P0-1

- 先解决 lockfile。
- 再接入 `check:generated` 和第一版最小 `verify:all`。

第 2 组：P0-2

- CI 在 lockfile 和本地验证稳定后接入。

第 3 组：P0-3

- 真实联系入口与 `verify:contact`。

第 4 组：P0-4A

- skip link、`#main-content` 与 `verify:links`。

第 5 组：P0-4B

- 导航状态、移动菜单和 reduced motion。

第 6 组：P0-5

- `verify:media` 与 `verify:assets-lite`，分别覆盖媒体加载策略和轻量资源引用。

第 7 组：P1-5

- 架构文档、release checklist、asset policy。

第 8 组：P1-1 + P1-2

- section manifest。
- scene transition verifier。

第 9 组：P1-3 + P1-4 + P1-6

- 依赖加载、资源轻量检查、release summary。

第 10 组：P2-0 到 P2-5

- 先记录 UI/UX 决策，再做 progress、卡片结构、token、响应式、移动端导航。

第 11 组：P3-1 到 P3-3

- 显式授权后做浏览器 smoke test。
- 外链检查和监控事件。

## 13. 第一轮落地任务清单

第一轮只处理最小可发布闭环，不混入大型 UI 改版。

### Task 1：生成 lockfile 并建立统一验证入口

- [ ] Run `npm install --package-lock-only`.
- [ ] Modify `package.json`.
- [ ] Add `check:generated` and the first minimal `verify:all`.
- [ ] Keep `verify:copy` outside `verify:all`.
- [ ] Run `npm ci`.
- [ ] Run `npm run verify:all`.

Exact `package.json` script additions:

```json
{
  "check:generated": "npm run build:page && git diff --exit-code -- index.html",
  "verify:all": "npm run verify:ink-modules && npm run verify:scroll-modules && npm run verify:section-transitions && npm run verify:transition-runtime && npm run verify:homepage-transitions && npm run check:generated"
}
```

Expected result:

- Lockfile exists.
- `npm ci` passes.
- `npm run verify:all` passes on a clean working tree for generated output.

### Task 2：接入最小 CI gate

- [ ] Create `.github/workflows/verify.yml`.
- [ ] Run `npm ci` in CI.
- [ ] Run `npm run verify:all` in CI.
- [ ] Keep Playwright and network link checks out of this CI gate.

Exact workflow body:

```yaml
name: Verify

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run verify:all
```

Expected result:

- CI runs after PR 1 without waiting for contact, links, or media checks.
- CI passes with the minimal `verify:all`.

### Task 3：新增联系入口检查并修复联系区

- [ ] Confirm the official contact entry with the project owner: email, form URL, phone, or QR asset.
- [ ] Create `scripts/check-contact-placeholders.mjs`.
- [ ] Modify `src/sections/contact.html`.
- [ ] Add `verify:contact` to `package.json`.
- [ ] Add `verify:contact` to `verify:all` after the script and contact fix are present.
- [ ] Rebuild `index.html`.
- [ ] Run `npm run verify:contact`.
- [ ] Run `npm run verify:all`.

Script behavior:

- Read every file passed as an argument.
- Fail on `contact@example.com`, `example.com`, empty `href`, `javascript:void(0)`.
- Fail on `mailto:` using example domains.
- Fail on QR image paths that do not exist.
- Fail on form links that are not `https://`.

Expected result:

- Contact path is real.
- Without an official contact entry, this PR can add the verifier but cannot merge to the release branch.
- Placeholder contact content is gone from generated output.

### Task 4：保留 `#top` 并新增 `#main-content`

- [ ] Modify `src/index.template.html`.
- [ ] Modify `css/styles.css`.
- [ ] Create `scripts/check-links.mjs`.
- [ ] Add `verify:links` to `package.json`.
- [ ] Add `verify:links` to `verify:all` after `#top` and `#main-content` both exist.
- [ ] Run `npm run verify:links`.
- [ ] Run `npm run verify:all`.

Required markup contract:

```html
<a class="skip-link" href="#main-content">跳到主要内容</a>
<nav class="site-nav">
  ...
</nav>
<main id="top">
  <div id="main-content" class="main-content-anchor" tabindex="-1" aria-label="主要内容"></div>
  ...
</main>
```

Expected result:

- Existing `#top` links continue to work.
- Skip link reaches `#main-content`.
- Internal anchor check passes.

### Task 5：补导航状态、移动菜单与 reduced motion

- [ ] Modify `src/partials/nav.html`.
- [ ] Modify `css/styles.css`.
- [ ] Modify `js/main.js` only where current state or mobile menu state is already managed.
- [ ] Add nav `aria-label`.
- [ ] Add `aria-current` to current nav item.
- [ ] Add `aria-expanded` and `aria-controls` to mobile menu button.
- [ ] Return focus to the menu button after closing the mobile menu.
- [ ] Respect `prefers-reduced-motion: reduce`.
- [ ] Run `npm run verify:all`.

Expected result:

- Keyboard can open and close mobile navigation.
- Current section state is visible and exposed to assistive technology.
- Reduced motion users can still read and navigate the page.

### Task 6：建立媒体与轻量资源检查的第一版

- [ ] Create `scripts/check-media-policy.mjs`.
- [ ] Create `scripts/check-assets-lite.mjs`.
- [ ] Check `src/**/*.html`, root `index.html`, `js/**/*.js`, and `css/**/*.css` for local resource references.
- [ ] Include `js/transitions/homepage/*.js` in video preload checks.
- [ ] Modify non-first-screen videos that use `preload="auto"` without a documented reason.
- [ ] Run `npm run verify:media`.
- [ ] Run `npm run verify:assets-lite`.
- [ ] Run `npm run verify:all` after adding both checks to the second-stage gate.

`check-media-policy.mjs` behavior:

- Fail when a video lacks an explicit preload strategy.
- Fail when a video that can render before user scroll lacks poster.
- Include homepage adapter videos in the scan.

`check-assets-lite.mjs` behavior:

- Fail when a referenced local asset does not exist.
- Fail when a published reference points to `tmp/`.
- Fail when a published reference contains `.pre-`, `.backup`, `.bad-`, or `.tmp`.
- Report lightweight budget violations for referenced assets only.

Expected result:

- Media references are visible to a verifier.
- Adapter videos are included in the policy.

### Task 7：补齐第一版工程文档

- [ ] Create `docs/ARCHITECTURE.md`.
- [ ] Create `docs/release-checklist.md`.
- [ ] Create `docs/assets-policy.md`.
- [ ] Create `docs/adr/0001-static-page-source-of-truth.md`.
- [ ] Add `verify:all` and source-of-truth rules to docs.
- [ ] Run `npm run verify:all`.

Required documentation points:

- Source files live in `src/`.
- Root `index.html` is generated.
- Do not manually edit generated output for lasting changes.
- `verify:copy` is outside `verify:all` until the copy baseline is confirmed as a default release gate.
- Playwright is not part of the current verification loop.

Expected result:

- A new contributor can build, verify and release without guessing the file ownership model.

第一轮完成后，项目应达到：

- 有 lockfile。
- 有统一验证入口。
- CI 已接入最小 gate，且不会因为缺 lockfile 失败。
- 联系入口不是占位信息。
- 内部锚点和生成物漂移可被检查。
- `#top` 的既有语义不被破坏。
- 媒体检查覆盖 adapter。
- 工程文档说明发布前流程。

## 14. 最终目标状态

最终目标不是把页面改成另一个项目，而是让当前 TongyeGuanmi 站点具备以下状态：

- 内容仍是当前内容。
- 叙事仍是当前叙事。
- 视觉不推倒重来。
- 发布过程可复现。
- 验证过程可自动化。
- 章节连续性可追踪。
- 联系路径真实可用。
- UI 状态明确。
- 移动端关键路径不隐藏。
- 资源和 transition 不靠人工记忆维护。

Shopify Editions 的可借鉴点是“强章节秩序、持续定位、叙事节奏和发布完整性”，不是一套需要照抄的实现模板。TongyeGuanmi 应该吸收它的连续体验和信息组织能力，同时保留自己的静态架构、中文表达、服务叙事和轻量发布流程。
