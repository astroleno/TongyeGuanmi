# Animated Navigation Transition Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首屏标题“同野观幂”的仪式感自然收束成轻量顶部导航，让首屏转场前后形成同一套排版系统：大字从品牌标题归位为导航结构，转场后页面进入更轻、更可浏览的状态。

**Design Principle:** 不是把“同 / 野 / 观 / 幂”硬拆成四个菜单，而是让标题字形参与导航生成：部分字归位为品牌标识，部分字作为运动锚点引出真实导航项。最终导航语义仍然是 `方法 / 企业 / 场景 / 教育 / 联系`。

**Tech Stack:** Existing static site, Vanilla ES Modules, GSAP + ScrollTrigger CDN, current hero title chars, fixed `.site-nav`, CSS transform/opacity only.

---

## Current Baseline

- `index.html` 已有 `.site-nav`，当前导航项为 `方法 / 场景 / 留学 / 联系`，CTA 为 `预约诊断`。
- 首屏标题已经拆成 `.hero-title-char`，当前结构适合做 FLIP-like transform。
- `js/sections/hero.js` 控制 hero intro、title intro、nav reveal、manifesto reveal。
- `js/ui/reveal.js` 负责普通 `.reveal` 入场和 nav active 状态。
- 当前 nav 在 hero 完成后才显露，首屏标题和导航之间没有视觉因果关系。

## Target Experience

1. 首屏标题仍然完整出现：`同野观幂`。
2. 用户滚动到首屏转场前段，四个标题字轻微解组。
3. 标题字沿稳定路径向顶部导航区域收束。
4. 左上形成小品牌标识 `同野观幂` 或单字 mark。
5. 顶部真实导航项淡入：`方法 / 企业 / 场景 / 教育 / 联系`。
6. 转场完成后，导航常驻、轻量、不抢后续内容的主视觉。
7. `prefers-reduced-motion` 下直接显示常驻导航，不执行飞字动画。

## Non-Goals

- 不做中文 glyph path morph。
- 不引入 MorphSVG 或新商业插件。
- 不把四个字永久当成四个菜单。
- 不延长 loader 或 hero intro 时长。
- 不改首屏核心水墨/人物/山水层级。

## Proposed Architecture

新增一个独立 UI 模块：

```txt
js/ui/title-nav-morph.js
```

Public contract:

```js
export function initTitleNavMorph({
  root = document.documentElement,
  body = document.body,
  reduceMotion = false,
  heroSelector = '.hero-wrap',
  titleCharSelector = '.hero-title-char',
  navSelector = '.site-nav'
} = {}) {}
```

CSS/markup contract:

```html
<span class="hero-title-char" data-title-morph-source="brand-1">同</span>
<span class="hero-title-char" data-title-morph-source="brand-2">野</span>
<span class="hero-title-char" data-title-morph-source="nav-1">观</span>
<span class="hero-title-char" data-title-morph-source="nav-2">幂</span>
```

Navigation placeholders:

```html
<span class="nav-morph-target" data-title-morph-target="brand"></span>
<span class="nav-morph-target" data-title-morph-target="method"></span>
<span class="nav-morph-target" data-title-morph-target="enterprise"></span>
<span class="nav-morph-target" data-title-morph-target="scenario"></span>
<span class="nav-morph-target" data-title-morph-target="education"></span>
```

The placeholders can be visually hidden layout anchors; final readable labels fade in separately.

---

## Task 1: Define Navigation Semantics And Final State

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`

- [ ] Decide final nav labels:
  - `方法` links to `#method`
  - `企业` links to `#services`
  - `场景` links to `#lab`
  - `教育` links to `#education`
  - `联系` links to `#contact`

- [ ] Keep CTA as one primary button:
  - Desktop: `预约诊断`
  - Mobile: `预约`

- [ ] Add stable morph target anchors inside nav without changing visible layout.

- [ ] Make final nav visually lighter:
  - Reduce backdrop strength.
  - Avoid heavy glass pill reading as another card.
  - Keep nav height stable at `54px` desktop and `42-48px` mobile.

**Acceptance Criteria:**
- Navigation remains semantically readable without JS.
- Hash links still work.
- No visible placeholder text leaks into layout.

## Task 2: Build Title-To-Nav Motion Module

**Files:**
- Create: `js/ui/title-nav-morph.js`
- Modify: `js/main.js`

- [ ] Implement `initTitleNavMorph()`.
- [ ] On init, collect source title chars and nav target rects.
- [ ] Use GSAP `ScrollTrigger` tied to `.hero-wrap`.
- [ ] Compute transform deltas from source rects to target rects.
- [ ] Animate only `x`, `y`, `scale`, `opacity`, and `filter`.
- [ ] Keep final nav labels hidden until motion is 70-85% complete.
- [ ] Reveal final labels with a short staggered opacity/translate transition.
- [ ] Refresh measurements on resize and font load.

**Acceptance Criteria:**
- No layout shift when animation starts.
- No scroll-linked animation mutates width/height/top/left.
- Re-running `ScrollTrigger.refresh()` keeps targets aligned.

## Task 3: Integrate With Existing Hero Timing

**Files:**
- Modify: `js/sections/hero.js`
- Modify: `js/main.js`

- [ ] Start morph after the title intro is readable.
- [ ] Align morph progress with current hero scene transition window.
- [ ] Prevent existing nav reveal code from fighting the new module.
- [ ] Let `initLayeredHero()` continue owning hero layers and manifesto reveal.
- [ ] Let `initTitleNavMorph()` own nav visibility and title-to-nav transition.

**Suggested Timing:**

```txt
hero progress 0.00-0.55  title remains cinematic
hero progress 0.55-0.72  title chars unlock and drift upward
hero progress 0.72-0.86  chars snap into nav anchors
hero progress 0.86-1.00  readable nav labels replace motion glyphs
```

**Acceptance Criteria:**
- The motion feels like a system settling, not decorative flying text.
- The user can still scroll naturally through the hero.
- CTA becomes clickable only after nav final state is visible.

## Task 4: Reduced Motion And Mobile Behavior

**Files:**
- Modify: `css/styles.css`
- Modify: `js/ui/title-nav-morph.js`

- [ ] Under `prefers-reduced-motion`, show final nav immediately.
- [ ] On mobile, use shorter travel distance and fewer animated sources.
- [ ] Mobile may use only the first title group as brand morph; nav links fade in normally.
- [ ] Ensure nav text does not overflow at 320px width.
- [ ] Keep `教育` and `联系` accessible even if middle nav links are hidden.

**Acceptance Criteria:**
- Mobile has no horizontal scroll.
- No nav item overlaps brand or CTA.
- Reduced motion path has no hidden navigation.

## Task 5: Verification

**Files:**
- Optional create: `scripts/check-navigation-morph.mjs`

- [ ] Verify desktop viewport `1440x1000`.
- [ ] Verify mobile viewport `390x844`.
- [ ] Verify direct anchor entry `/#method`.
- [ ] Verify `prefers-reduced-motion`.
- [ ] Verify nav links after hero transition.
- [ ] Capture before/mid/final screenshots for visual review.

**Manual Review Checklist:**

- [ ] The title is readable before it moves.
- [ ] The movement path is calm and typographic.
- [ ] Final navigation is lighter than the current nav.
- [ ] The transition does not make the first screen feel longer.
- [ ] The nav sets up the post-hero layout instead of becoming another hero element.

