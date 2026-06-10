# Post-Hero Screen Redesign Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重做首屏之后的页面节奏，解决“太满”的问题。参考 Shopify Editions 的章节系统：保留强品牌感，但把后续内容从“连续大标题 + 等高大卡片”改成“轻侧栏 + 内容舞台 + 重点 feature + 轻列表”的分层结构。

**Design Principle:** 每一屏只允许一个主角。首屏之后不要继续用完整观点句做巨型标题；后续章节用短词命名、用舞台承载重点、用轻列表承载次级信息。

**Reference:** `/Users/aitoshuu/Documents/GitHub/github-https-www-shopify-com-editions`

**Tech Stack:** Existing static site, `index.html`, `css/styles.css`, Vanilla ES Modules, GSAP + ScrollTrigger CDN, existing assets plus possible new lightweight UI/media assets.

---

## Shopify Reference Findings

Shopify 首屏之后的关键模式：

- 每个 section 是 `20% side rail + 80% content stage`。
- 大章节标题是短词：`Sidekick / Agentic / Online / Retail / Marketing`。
- 每章入口只配一句短定位，不用完整大段解释。
- 内容分三档：
  - **Hero feature:** 大舞台、媒体演示、sticky/theater。
  - **Feature cards:** 少数重点能力。
  - **Update list:** 很多信息降级成轻列表。
- 页面很长，但不是每屏都满，因为侧栏、舞台、媒体和列表不断切换权重。

Current Tongye issue:

- `Method / Services / Lab / Education / Philosophy` 都在使用类似结构：巨型标题 + 卡片阵列。
- 后半段几乎没有内容媒体，全靠文字、边框、深色卡片撑场。
- 中文标题句太长，放大后笔画密度非常高。
- 每张卡都像主卡，缺少“小信息”的视觉层级。

---

## Target Page Structure

```txt
Hero
  -> navigation morph transition

Post-Hero Shell
  Side rail: 同野观幂 / 方法 / 企业 / 场景 / 教育 / 联系
  Content stage:
    01 Manifesto bridge
    02 Method
    03 Enterprise
    04 Scenario
    05 Education
    06 Contact
```

Recommended section naming:

```txt
方法
企业
场景
教育
联系
```

Avoid using these as giant section headings:

```txt
从“会看见”到“能落地”的五步方法
企业 AI 转型，不是买工具，而是建设能力。
面向国际教育的 AI 时代能力建设。
```

These can move into smaller supporting copy.

---

## Task 1: Create Post-Hero Shell

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`
- Optional modify: `js/ui/reveal.js`

- [ ] Wrap all sections after hero in a shared shell:

```html
<div class="post-hero-shell">
  <aside class="post-hero-rail">...</aside>
  <div class="post-hero-stage">...</div>
</div>
```

- [ ] Desktop: rail takes 18-22% width; stage takes remaining width.
- [ ] Mobile: rail collapses into a compact sticky section index or disappears in favor of top nav.
- [ ] Rail should be visually quiet:
  - Small labels.
  - Thin line or typographic counter.
  - No card background.

**Acceptance Criteria:**
- The content no longer spans the full viewport width after hero.
- There is persistent structural whitespace.
- Top nav and side rail do not compete.

## Task 2: Lighten Manifesto Bridge

**Current:** `manifesto` overlays hero with large copy plus glass card.

**Target:** Use it as a short bridge from cinematic hero into content system.

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`

- [ ] Keep one large sentence.
- [ ] Remove or heavily reduce the glass card.
- [ ] Make the bridge feel like a breath, not a second hero.
- [ ] Do not introduce another large bordered surface.

**Suggested Copy:**

```txt
AI 进入真实的工作、学习与创造现场。
```

Supporting copy can be one line:

```txt
我们把方法、工具和组织动作放在同一张工作台上。
```

**Acceptance Criteria:**
- Manifesto bridge fits in one viewport with visible empty space.
- No more than one dominant text block.

## Task 3: Redesign Method Screen

**Current:** Five equal vertical cards, each 420px min height.

**Target:** A light process rail or timeline.

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`

- [ ] Change heading to short title: `方法`。
- [ ] Move the current long H2 into small supporting copy or remove it.
- [ ] Replace `.method-grid` five-card layout with a thin process structure:

```txt
01 识场     识别高频任务与协作断点
02 立法     建立使用规范与质量标准
03 共创     把真实需求拆成工作流
04 成器     沉淀模板、智能体、知识库
05 陪跑     用复盘推动日常使用
```

- [ ] Use lines/dividers instead of card boxes.
- [ ] Let one step expand or highlight on scroll/hover; others remain compact.

**Acceptance Criteria:**
- Method section no longer reads as 5 big cards.
- At least 35% of desktop viewport remains visually quiet.
- User can scan all five steps in under 3 seconds.

## Task 4: Redesign Enterprise Screen

**Current:** Four equal service cards, each 520px min height.

**Target:** One primary capability stage plus lightweight service list.

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`

- [ ] Rename section heading to `企业`。
- [ ] Create one main stage:

```txt
企业 AI 能力建设
从管理层共识、场景共创，到工具实施和陪跑。
```

- [ ] Convert four service cards into a light list:

```txt
咨询        路线图 / 治理 / 优先级
培训        管理层 / 业务团队 / 一线岗位
共创        销售 / 运营 / 知识管理
陪跑        智能体 / 知识库 / 复盘机制
```

- [ ] If media is available, use one productized visual surface:
  - workflow board
  - workshop map
  - AI capability matrix
  - not another decorative landscape card

**Acceptance Criteria:**
- No four equal cards.
- One clear hero feature, all services secondary.
- The screen feels less dense than current `services`.

## Task 5: Redesign Scenario Screen

**Current:** Five 440px horizontal cards with sparse copy but heavy surfaces.

**Target:** Shopify-style update strip or light scenario index.

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`

- [ ] Rename section heading to `场景`。
- [ ] Keep scenario names, reduce surface height.
- [ ] Use compact tiles or rows:

```txt
管理决策       信息汇总 -> 判断框架
知识管理       经验 -> 可调用资产
销售增长       洞察 -> 内容与跟进
运营提效       重复动作 -> 自动化流程
研究表达       学习、写作、申请结构
```

- [ ] Consider a horizontal ticker with one active preview panel.
- [ ] Remove large empty interiors from cards.

**Acceptance Criteria:**
- Scenario screen has fast scanning rhythm.
- No tile should feel like an empty 440px card.
- The section visually contrasts with Method and Enterprise.

## Task 6: Redesign Education Screen

**Current:** Education has the same weight as enterprise: giant heading plus four stacked cards.

**Target:** Secondary business line, quieter and more editorial.

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`

- [ ] Rename section heading to `教育`。
- [ ] Reduce title scale relative to Enterprise.
- [ ] Present education as a compact program module:

```txt
AI 学习工具链
研究项目路径
申请表达结构
海外学习准备
```

- [ ] Use small rows or a two-column index.
- [ ] Keep only one short paragraph explaining the education offering.

**Acceptance Criteria:**
- Education no longer competes with Enterprise as equal primary business.
- The whole section should feel like a calm side chapter.

## Task 7: Remove Or Merge Philosophy Screen

**Current:** Two large 610px cards explaining `同野` and `观幂`。

**Target:** Merge brand explanation into Manifesto or footer-level copy.

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`

- [ ] Remove standalone `philosophy` section.
- [ ] Move the best one-line explanation into manifesto bridge or contact preface.
- [ ] Delete unused `.philosophy-*` CSS after removal.

**Acceptance Criteria:**
- No repeated brand explanation after education.
- Page length and visual weight decrease.

## Task 8: Contact Screen As Final Stage

**Current:** Large background card with another hero-scale title.

**Target:** Keep immersive closing, but reduce title density and make CTA obvious.

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`

- [ ] Keep one strong background asset.
- [ ] Reduce heading from hero-scale to section-scale.
- [ ] Shorten paragraph to one sentence.
- [ ] Primary CTA remains `预约一次 AI 现场诊断`。
- [ ] Secondary CTA can be removed or made text-only.

**Acceptance Criteria:**
- Contact feels like an endpoint, not another full hero.
- CTA is the dominant interactive element.

## Task 9: Motion And Reveal Simplification

**Files:**
- Modify: `js/ui/reveal.js`
- Modify: `css/styles.css`

- [ ] Reduce reveal offset from `64px` to around `24-32px`.
- [ ] Reduce reveal duration from `1.15s` to around `0.55-0.75s`.
- [ ] Avoid reverse reveal on ordinary content unless it serves a sticky stage.
- [ ] Keep major stage transitions, but make ordinary rows fast.

**Acceptance Criteria:**
- Scrolling after hero feels lighter.
- Content does not feel like it is waiting to appear.

## Task 10: Verification

**Files:**
- Optional create: `scripts/check-post-hero-layout.mjs`

- [ ] Desktop screenshot: method, enterprise, scenario, education, contact.
- [ ] Mobile screenshot: same sections.
- [ ] Verify no horizontal overflow.
- [ ] Verify text does not overlap nav/rail.
- [ ] Verify section anchors still work.
- [ ] Compare against current screenshots before merging.

**Visual Acceptance Checklist:**

- [ ] First post-hero screen is visibly calmer than current Method.
- [ ] Each subsequent section has a different layout rhythm.
- [ ] Not every section uses cards.
- [ ] At least one section uses lines/lists instead of boxes.
- [ ] At least one section uses a content stage/media surface.
- [ ] `Philosophy` no longer appears as two large cards.
- [ ] Chinese headings are short enough to breathe.

