# Shopify-Style Long Canvas Redesign Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首屏之后的页面从“液态玻璃卡片官网”改成 Shopify Editions 式长画布：顶部轻导航、主体居中排版轨道、左右留缝、弱化可见容器、每章节通过排版节奏和转场建立边界。

**Locked Decisions:**
- 不再使用液态玻璃作为主视觉语言。
- 不做左侧章节索引；顶部导航承担全站导航。
- 不做左下下载导航，除非后续明确有资料下载业务目标。
- 主体可以有工程上的布局容器，但视觉上不能像盒子、卡片或大边框容器。
- 每个章节后续会接转场；本计划需要预留转场挂点，但不把章节边界做成明显卡片。

**Taste Baseline:** `DESIGN_VARIANCE=8`, `MOTION_INTENSITY=6`, `VISUAL_DENSITY=4`。高留白、非对称排版、适度滚动动效，避免卡片堆叠。

**Reference:** `/Users/aitoshuu/Documents/GitHub/github-https-www-shopify-com-editions`

**Tech Stack:** Existing static site, `index.html`, `css/styles.css`, Vanilla ES Modules, GSAP + ScrollTrigger CDN, current hero assets and transition primitives.

---

## Current Baseline

Homepage files currently involved:

- `index.html` owns the hero, nav, manifesto, method, services, lab, education, philosophy, contact, and footer markup.
- `css/styles.css` owns most layout, section rhythm, card surfaces, section backgrounds, and responsive behavior.
- `css/components/lost-wax-glass-nav.css` owns the current fixed nav shell.
- `css/components/liquid-glass-home.css` adds the liquid-glass material layer across nav, cards, and CTA surfaces.
- `js/sections/hero.js` owns the hero scroll scene and current nav reveal timing.
- `js/ui/reveal.js` owns reveal animations, nav active state, and post-hero section snap.

Important current patterns to remove or revise:

- `liquid-glass` classes are applied across major homepage content.
- `.method-grid`, `.service-grid`, `.scenario-strip`, `.edu-stack`, `.philosophy-grid`, and `.contact-card` create a repeated card/container language.
- `.post-hero-stage > section { min-height: 100dvh; }` and `initPostHeroSnap()` make the page feel like stacked panels.
- Top nav currently reads as a material component rather than a quiet overlay.

---

## Reference Findings

Shopify Editions 的重点不是“没有 DOM 容器”，而是视觉上弱化容器：

- 顶部导航是固定轻导航，靠顶部渐变托住，不靠重材质按钮。
- 内容有 `section` 和 `article`，但外层不显示大盒子边界。
- 主体使用统一栅格和留白作为结构，而不是每章一个可见大容器。
- 长内容被拆成大标题场、短介绍、媒体/功能块、轻列表。
- 章节切换靠背景明暗、字号、留白、动效和内容密度变化完成。

Current Tongye issue:

- `method-grid`, `service-grid`, `scenario-card`, `edu-stack article`, `philosophy-card`, `contact-card` 让后半段形成连续卡片墙。
- `liquid-glass` 让每个内容单元都变成强材质表面，削弱长画布感。
- `post-hero-stage > section { min-height: 100dvh; }` 加上 snap 逻辑，使页面更像分屏模块，而不是自然长卷。
- 顶部导航现在也是液态玻璃胶囊，和无容器长画布不一致。

---

## Target Experience

```txt
Hero
  -> transition into top-light navigation

Long Canvas
  centered invisible layout track
  generous left/right gutters
  no visible section containers
  section transition hooks between chapters

Chapters
  方法
  企业
  场景
  教育
  联系
```

The page should feel like a continuous editorial scroll, not a deck of panels.

---

## Non-Goals

- Do not add a left side index.
- Do not add a left-bottom download navigation.
- Do not replace the hero's ink/cinematic identity.
- Do not introduce a new framework or build system.
- Do not delete shared liquid-glass component files if preview/archive pages still depend on them.
- Do not implement the later cinematic chapter transitions in this pass; only add stable hooks and simple placeholders.
- Do not turn every chapter into a full-bleed hero. The page still needs scan rhythm and information hierarchy.

---

## Implementation Sequence

Use this order when executing the plan. It keeps the blast radius controlled and avoids styling churn.

1. **Navigation and material reset**
   Remove homepage liquid-glass usage, rebuild top nav as a light gradient overlay, and make sure no-JS/reduced-motion states are still usable.

2. **Long-canvas shell**
   Replace the post-hero panel model with an invisible centered layout track and remove section snap. This should happen before redesigning individual chapters.

3. **Chapter structure**
   Convert Method, Enterprise, Scenario, Education, Philosophy, and Contact in that order. After each chapter, verify the page still scrolls naturally.

4. **Transition hooks**
   Add `chapter-transition` elements only after chapter structure stabilizes, so later animation work has stable anchors.

5. **Motion calibration**
   Rebalance reveal timing and remove ordinary tilt/magnetic treatments after the new layout is visible.

6. **Verification**
   Check desktop, mobile, anchors, overflow, nav overlap, and that liquid-glass surfaces are gone from the homepage.

---

## Design Guardrails

- The "container" is an invisible layout track, not a visible box.
- Desktop gutters should be visible, but content should not feel narrow or timid.
- Use thin rules, counters, alignment, and background tone changes before adding borders.
- Use cards only when an item genuinely needs object identity; most homepage text should be unboxed.
- Keep Chinese headings short. Long explanation belongs in paragraph text or lists.
- No heavy shadows, no neon glow, no glass/refraction material, no generic 3-column feature card row.
- Major motion can happen at chapter transitions; ordinary content should appear quickly and quietly.
- Mobile collapses to a strict single-column flow with stable padding and no horizontal drift.

---

## Task 1: Remove Liquid Glass As Primary Material

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`
- Modify: `css/components/lost-wax-glass-nav.css`
- Modify or stop importing: `css/components/liquid-glass-home.css`

- [ ] Remove `liquid-glass`, `liquid-glass--compact`, `liquid-glass--button`, and `liquid-glass--nav` classes from visible page structures.
- [ ] Remove the inline SVG liquid-glass refraction filter from `index.html` if no longer used by any visible component.
- [ ] Stop importing `css/components/liquid-glass-home.css` from the homepage.
- [ ] Keep old liquid glass component files only if other preview pages still use them; do not delete shared preview assets casually.
- [ ] Replace material hierarchy with:
  - typography scale
  - whitespace
  - thin rules
  - low-opacity texture
  - background tone changes

**Acceptance Criteria:**
- Homepage no longer has frosted/glass cards or nav pills.
- No major content block depends on `backdrop-filter`.
- Existing preview pages are not broken by cleanup.

## Task 2: Rebuild Top Navigation As A Light Gradient Nav

**Files:**
- Modify: `index.html`
- Modify: `css/components/lost-wax-glass-nav.css`
- Modify: `js/ui/reveal.js`
- Optional modify: `js/sections/hero.js`

- [ ] Keep only top navigation; do not add side rail.
- [ ] Use final labels:
  - `方法` -> `#method`
  - `企业` -> `#services`
  - `场景` -> `#lab`
  - `教育` -> `#education`
  - `联系` -> `#contact`
- [ ] Rename mobile CTA to `预约` if space is tight.
- [ ] Add a fixed top gradient layer:
  - dark sections: deep ink to transparent
  - light sections, if any: warm paper to transparent
- [ ] Make nav visually quiet:
  - no glass pill container
  - no heavy button shadow
  - small text, crisp hover/focus state
  - CTA as restrained solid or outline button
- [ ] Update nav active-state logic to include `lab`.
- [ ] Ensure nav can switch text color if later chapter backgrounds become light.

**Acceptance Criteria:**
- Top nav remains readable over hero and post-hero content.
- No side index exists.
- Nav does not feel like another card floating above the page.
- Hash links work on direct entry.

## Task 3: Create The Invisible Long Canvas Layout Track

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`

- [ ] Rename or repurpose `.post-hero-stage` into a long-canvas shell, for example:

```html
<div class="long-canvas" aria-label="页面主体章节">
  <section class="canvas-section canvas-section--method" id="method">...</section>
  ...
</div>
```

- [ ] Add a shared inner track for content alignment:

```html
<div class="canvas-track">
  ...
</div>
```

- [ ] Desktop layout:
  - page track: `width: min(1280px, 84vw)`
  - centered with `margin-inline: auto`
  - preserve visual gutters on both sides
  - use 12-column grid inside track
- [ ] Mobile layout:
  - `width: min(100% - 36px, 1280px)`
  - single-column flow
  - no horizontal overflow
- [ ] Remove visible outer section boxes, section borders, and large rounded containers.
- [ ] Allow selected media/transition moments to break out full-bleed intentionally.

**Acceptance Criteria:**
- The user perceives one continuous page, not stacked containers.
- Left and right gutters are visible on desktop.
- Content has a consistent invisible alignment system.
- Full-bleed moments look intentional, not like overflow bugs.

## Task 4: Replace Section Snap With Natural Scroll

**Files:**
- Modify: `js/ui/reveal.js`
- Modify: `css/styles.css`

- [ ] Disable or remove `initPostHeroSnap()` for the homepage long canvas.
- [ ] Avoid forcing every post-hero section to `min-height: 100dvh`.
- [ ] Give sections variable rhythm:
  - large chapter intro: `min-height: 90-120svh`
  - content-heavy chapter: natural height
  - transition bridge: `40-80svh`
- [ ] Keep scroll animation transform/opacity-only.
- [ ] Leave clear data hooks for later transitions:

```html
<div class="chapter-transition" data-transition="method-to-enterprise"></div>
```

**Acceptance Criteria:**
- Scrolling feels like a long editorial page.
- No forced snap fights the user.
- Future transition modules have stable anchor elements.

## Task 5: Redesign Method As A Sparse Process System

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`

- [ ] Replace five equal `.method-card` cards with a process list or timeline.
- [ ] Use short chapter heading: `方法`。
- [ ] Keep one short explanatory paragraph only.
- [ ] Suggested structure:

```txt
01 识场    找出高频任务、协作断点、成本黑洞
02 立法    建立 AI 使用规范、质量判断、数据边界
03 共创    和一线一起拆真实工作流
04 成器    沉淀模板、智能体、知识库、自动流程
05 陪跑    用复盘把 AI 长进日常
```

- [ ] Use thin dividers and spacing instead of cards.
- [ ] Optionally make one row sticky-highlight during scroll; keep others quiet.

**Acceptance Criteria:**
- Method can be scanned in 3 seconds.
- No five-card wall remains.
- At least 40% of the desktop viewport stays visually quiet.

## Task 6: Redesign Enterprise And Scenario As Editorial Blocks

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`

- [ ] Enterprise chapter uses one primary statement and a light capability list.
- [ ] Remove four equal service cards.
- [ ] Suggested Enterprise content shape:

```txt
企业 AI 能力建设
从管理层共识、场景共创，到工具实施和陪跑。

咨询    路线图 / 治理 / 优先级
培训    管理层 / 业务团队 / 一线岗位
共创    销售 / 运营 / 知识管理
陪跑    智能体 / 知识库 / 复盘机制
```

- [ ] Scenario chapter becomes fast-scanning rows or an offset grid, not horizontal glass cards.
- [ ] Suggested Scenario rows:

```txt
管理决策    信息汇总 -> 判断框架
知识管理    经验 -> 可调用资产
销售增长    洞察 -> 内容与跟进
运营提效    重复动作 -> 自动化流程
供应链      比价 / 合同 / 库存预警
教育表达    研究 / 写作 / 申请结构
```

- [ ] Use one visual preview area if useful, but do not make it a framed card.

**Acceptance Criteria:**
- Enterprise has one primary stage and secondary details.
- Scenario is denser and faster than Enterprise.
- Neither chapter uses equal-height card grids.

## Task 7: Reposition Education As A Quiet Secondary Chapter

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`

- [ ] Keep `教育` in top nav, but make the section visually quieter than Enterprise.
- [ ] Remove four stacked glass blocks.
- [ ] Present as a compact program index:

```txt
AI 学习工具链
研究项目路径
申请表达结构
海外学习准备
```

- [ ] Keep only one short paragraph explaining why this belongs with the business offering.
- [ ] Use rows, columns, or an editorial aside; no card pile.

**Acceptance Criteria:**
- Education feels like a side chapter, not a second homepage.
- It remains credible and easy to find.
- It does not compete with Enterprise for primary visual weight.

## Task 8: Merge Or Minimize Philosophy

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`

- [ ] Remove standalone two-card `philosophy` section.
- [ ] Move the best brand explanation into either:
  - manifesto bridge
  - footer
  - contact preface
- [ ] Delete unused `.philosophy-*` CSS from the homepage stylesheet.

**Acceptance Criteria:**
- No large `同野 / 观幂` card pair remains.
- Brand meaning exists, but no longer interrupts page momentum.

## Task 9: Rebuild Contact As A Final Editorial Endpoint

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`

- [ ] Remove glass card treatment from `.contact-card`.
- [ ] Keep contact as a strong final endpoint, but not another bordered hero card.
- [ ] Shorten paragraph to one concrete sentence.
- [ ] Primary CTA:

```txt
预约一次 AI 现场诊断
```

- [ ] Secondary CTA can be removed or made text-only.
- [ ] Use background imagery or transition residue subtly; avoid a framed panel.

**Acceptance Criteria:**
- Contact feels like the natural end of the long canvas.
- CTA is the dominant action.
- Closing does not reintroduce heavy container styling.

## Task 10: Add Transition Hooks Between Chapters

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`
- Optional create: `js/ui/chapter-transitions.js`

- [ ] Insert explicit transition elements between major chapters:

```html
<div class="chapter-transition" data-transition="method-enterprise" aria-hidden="true"></div>
```

- [ ] Give each transition stable height and isolation.
- [ ] First implementation may use only CSS:
  - opacity fade
  - texture drift
  - background tone shift
  - thin line draw
- [ ] Future JS transition modules should attach to `data-transition`, not to arbitrary section order.
- [ ] Keep transition surfaces unboxed and full-width or full-bleed as needed.

**Acceptance Criteria:**
- Chapters have breathing room even without visible containers.
- Later cinematic transitions can be implemented without restructuring HTML.
- Transition hooks do not block reading or anchors.

## Task 11: Motion And Reveal Calibration

**Files:**
- Modify: `js/ui/reveal.js`
- Modify: `css/styles.css`

- [ ] Ordinary content reveal:
  - offset: `20-32px`
  - duration: `0.55-0.75s`
  - no heavy rotate unless used for a special chapter intro
- [ ] Chapter intros can have stronger motion, but only one focal element at a time.
- [ ] Remove `data-tilt` interactions from ordinary text blocks after liquid glass removal.
- [ ] Keep all scroll animation to transform and opacity.

**Acceptance Criteria:**
- Page feels lighter after hero.
- Motion supports chapter rhythm instead of decorating every block.
- Mobile scroll remains calm and performant.

## Task 12: Verification

**Files:**
- Optional create: `scripts/check-long-canvas-layout.mjs`

- [ ] Verify desktop viewport around `1440x1000`.
- [ ] Verify mobile viewport around `390x844`.
- [ ] Verify narrow mobile around `320x700`.
- [ ] Verify anchors:
  - `/#method`
  - `/#services`
  - `/#lab`
  - `/#education`
  - `/#contact`
- [ ] Verify no horizontal overflow.
- [ ] Verify top nav does not overlap chapter intro text.
- [ ] Verify no visible liquid glass surfaces remain on homepage.
- [ ] Verify all old card CSS removed or no longer applied.

**Visual Acceptance Checklist:**

- [ ] The post-hero page reads as one continuous long canvas.
- [ ] Top nav is enough; there is no side index.
- [ ] Left and right gutters are visible on desktop.
- [ ] No section looks like a bordered container.
- [ ] Method, Enterprise, Scenario, Education, and Contact each have different rhythm.
- [ ] Transitions, not boxes, define chapter changes.
- [ ] The page feels closer to Shopify Editions while retaining Tongye's ink/field identity.
