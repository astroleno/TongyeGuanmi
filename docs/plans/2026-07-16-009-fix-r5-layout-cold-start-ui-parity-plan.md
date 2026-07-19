# R5 Reading Layout, Cold-Start Warmup, and UI Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the confirmed Method and Services reading layouts, remove first-use stalls on Hero→Pattern and Method→Figure2, and unify mobile navigation and Proof typography without weakening Ink visuals, reading ownership, or release budgets.

**Architecture:** Keep the canonical scene spine and the existing reading governor intact. Rebuild Method and Services around the same wide-first / vertical-second composition used by Lab and Education, centralize their typography and width tokens, and add an idle-only adjacent-transition warmup contract that prepares detached Ink GPU resources plus exact media frames before the first gesture. Preserve one visible Ink canvas and one draw call during playback.

**Tech Stack:** React 19, TypeScript 5.8, CSS, XState director runtime, WebGL Ink renderer, `TimelineVideoDriver`, Vitest, Playwright, Vite.

---

## Plan Status and Authority

- Status: planned; implementation not started.
- Reviewed branch: `codex/react-refactor-r5-parity-cutover`.
- Reviewed commit: `c410ef4`.
- Supersedes only the incomplete layout and cold-start assumptions in Plan 008; it does not rewrite Plan 008 history.
- User-confirmed layout authority:
  - Method screen 1 is a full-width landscape composition.
  - Method screen 2 is a left/right reading composition.
  - Services follows the same wide-first / vertical-second system as Lab and Education.
  - Proof retains three semantic screens but shares the same typography and content-width system.
- Existing copy remains authoritative. No new marketing paragraph, claim, service, or method step may be invented.
- Existing untracked `artifacts/react-refactor/r5-figure2-combined-candidate/` is out of scope and must remain untouched.

## Confirmed Findings

| Area | Current implementation | Required result |
|---|---|---|
| Method top | One narrow column, `720px` grid cap and `360px` lead cap | One `100svh` wide panel with headline/body and the existing “现场 / 章法” signals |
| Method bottom | Full-width list with no left lead | One left/right panel: structural lead/rail on the left, five steps on the right |
| Services | One combined left/right block; rows stretched with `min-height: 39svh` | A wide intro panel followed by a left/right capability panel |
| Hero→Pattern cold path | Pattern assets preload, but Hero media and transition GPU construction remain first-gesture work | Hero start frame and radial Ink renderer ready before the first accepted gesture |
| Method→Figure2 cold path | Figure2 prepares asynchronously after mount; Ink renderer still builds after input | Figure2 presented opening frame and horizontal Ink renderer ready during Method hold |
| Mobile topbar | Menu is a transparent pill; appointment CTA is a filled rounded rectangle | Same mobile action component geometry and typography |
| Proof | Opening, row titles and body use unrelated scales; legacy class aliases duplicate styles | Three screens preserved, shared part tokens and one Proof class system |

## Frozen Interaction and Visual Contracts

### Method

1. `method-top` remains a non-reading canonical hold.
2. Its only panel is at least `100svh` and uses the same content width as Lab/Education: `min(1240px, 90vw)`.
3. Copy placement is fixed:
   - Wide copy: `METHOD_TOP_COPY[0..3]`.
   - Right signal group: `METHOD_TOP_COPY[4..7]`.
4. `method-top-method-bottom` remains a separate 600ms continuation segment and still requires fresh input.
5. `method-bottom` remains the only Method reading hold.
6. Its desktop panel is left/right:
   - Left structural lead uses the existing semantic label “AI 落地五步” and the range `01—05`.
   - Right side contains the five canonical rows in their existing order.
7. On mobile, the lead precedes the list in one column.
8. Method internal rows have no horizontal divider rules.

### Services

1. `services` remains one canonical reading hold with one explicit scene-owned scrollport.
2. Panel 1 is a `100svh` wide introduction:
   - Main copy uses `SERVICES_COPY[0..3]`.
   - The right signal group uses the four existing service titles, not new copy.
3. Panel 2 is left/right:
   - Left structural lead uses the existing semantic label “企业服务能力” and the range `01—04`.
   - Right side contains all four canonical service rows and their existing detail lines.
4. Remove `min-height: 39svh`; content rhythm comes from padding and the reading governor.
5. No internal horizontal divider rules.
6. Reverse entry still lands at the bottom reading edge.

### Proof

1. Keep one `figure2-proof` canonical reading hold.
2. Keep exactly three `100svh` panels: opening, cards, closing.
3. Keep all existing copy and panel order.
4. Use the same shared tokens as Method, Services, Lab and Education:

```css
--r4-part-content-width: min(1240px, 90vw);
--r4-part-label-size: 12px;
--r4-part-wide-title-size: clamp(32px, 3.8vw, 68px);
--r4-part-lead-title-size: clamp(38px, 4.4vw, 78px);
--r4-part-row-title-size: clamp(21px, 1.9vw, 34px);
--r4-part-body-size: clamp(14px, 1vw, 17px);
--r4-part-finale-size: clamp(36px, 4.4vw, 78px);
```

5. Remove the legacy `method-proof__*` class aliases from production markup and CSS.
6. Remove Proof card divider rules; spacing, numbering and type hierarchy provide separation.

### Cold-start performance

1. “Preloaded” means the first usable visual frame is ready, not merely that a module was imported.
2. Idle warmup must never:
   - change scene visibility;
   - acquire layer ownership;
   - append a visible effect canvas;
   - start native video playback;
   - add a second playback draw call;
   - change Ink particle density, double-edge structure or shader output.
3. At most one detached prepared Ink surface may exist per implemented transition module.
4. The prepared surface is consumed by the next real timeline and disposed by the existing timeline lifecycle.
5. Context loss, incompatible viewport generation or reduced motion falls back to the current build path.
6. Hero keeps `preload="none"` in initial HTML. Promotion to `auto` occurs only from the idle adjacent-transition warmup after presentation readiness.
7. Figure2 may report opening-frame readiness only after `TimelineVideoDriver` confirms the requested presented frame.

### Release budgets

- Total JS hard cap remains `581,632 bytes`.
- Final total JS headroom remains at least `4,096 bytes`.
- Initial JS raw remains at or below `368,640 bytes`.
- Initial CSS raw remains at or below `76,800 bytes`.
- No media asset is added or recompressed.
- Runtime Stage remains at no more than three mounted layers and one visible Ink WebGL canvas.

## Non-goals

- Do not change the canonical scene or segment order.
- Do not merge `method-top` and `method-bottom`.
- Do not alter the reading governor, charge threshold, edge latch or fresh-input rules.
- Do not change Ink field shapes, particles, double-wave parameters, DPR cap, atlas size or draw-call count.
- Do not change Figure2 pair media, PH media, Crane media or archive authorities.
- Do not introduce Lenis, scroll snap, CSS smooth scrolling or a per-frame preload loop.
- Do not run the full Playwright matrix before unit, type, lint, focused browser and budget gates are green.

## File Map

### Layout and typography

- Modify: `app/src/scenes/method-top/index.tsx`
- Modify: `app/src/scenes/method-bottom/index.tsx`
- Modify: `app/src/scenes/method-top/copy.test.ts`
- Modify: `app/src/scenes/services/index.tsx`
- Modify: `app/src/scenes/group4-scenes.test.ts`
- Modify: `app/src/scenes/figure2-proof/index.tsx`
- Modify: `app/src/scenes/figure2-proof-opening/index.tsx`
- Modify: `app/src/scenes/figure2-proof-cards/index.tsx`
- Modify: `app/src/scenes/figure2-proof-closing/index.tsx`
- Modify: `app/src/scenes/figure2-proof-scenes.test.ts`
- Modify: `app/src/scenes/lab/index.tsx`
- Modify: `app/src/scenes/education/index.tsx`
- Modify: `app/src/styles.css`
- Modify: `app/src/stage/Stage.reading.test.ts`
- Modify: `app/e2e/r5-production.spec.ts`

### Mobile navigation

- Modify: `app/src/production/StoryNav.tsx`
- Modify: `app/src/production/StoryNav.css`
- Modify: `app/src/production/StoryNav.test.tsx`
- Modify: `app/e2e/r5-matrix.spec.ts`

### Adjacent transition warmup

- Create: `app/src/production/adjacent-prewarm.ts`
- Create: `app/src/production/adjacent-prewarm.test.ts`
- Modify: `app/src/production/StoryApp.tsx`
- Modify: `app/src/story/types.ts`
- Modify: `app/src/production/module-loaders.test.ts`
- Modify: `app/src/transitions/shared/sceneInk.ts`
- Modify: `app/src/transitions/shared/sceneInk.lifecycle.test.ts`
- Modify: `app/src/transitions/shared/ink.ts`
- Modify: `app/src/transitions/shared/ink.test.ts`

### Hero and Figure2 preparation

- Modify: `app/src/scenes/hero/index.tsx`
- Modify: `app/src/scenes/hero/progress.test.ts`
- Modify: `app/src/transitions/hero-pattern/index.ts`
- Modify: `app/src/transitions/hero-pattern/index.test.ts`
- Modify: `app/src/scenes/figure2-animation/index.tsx`
- Modify: `app/src/scenes/figure2-animation/progress.test.ts`
- Modify: `app/src/transitions/method-bottom-figure2/index.ts`
- Modify: `app/src/transitions/method-bottom-figure2/index.test.ts`

### Performance evidence and release documentation

- Modify: `app/e2e/r5-performance.spec.ts`
- Modify: `docs/react-refactor/reports/r5-transition-frame-pacing.md`
- Verify: `app/scripts/verify-performance-budgets.mjs`

## Task 1: Freeze Failing Layout and Style Contracts

**Files:**

- Modify: `app/src/scenes/method-top/copy.test.ts`
- Modify: `app/src/scenes/group4-scenes.test.ts`
- Modify: `app/src/scenes/figure2-proof-scenes.test.ts`
- Modify: `app/src/production/StoryNav.test.tsx`
- Modify: `app/src/stage/Stage.reading.test.ts`

- [ ] **Step 1: Add Method structural assertions**

Import `readFileSync`, read `styles.css`, then extend the Method test with:

```ts
expect(topMarkup).toContain('class="r4-method__wide"');
expect(topMarkup).toContain('class="r4-method__wide-copy"');
expect(topMarkup).toContain('class="r4-method__signals"');
expect(bottomMarkup).toContain('class="r4-method__vertical"');
expect(bottomMarkup).toContain('class="r4-method__steps-lead"');
expect(bottomMarkup).toContain('AI 落地五步');
expect(stylesheet).toMatch(
  /\.r4-method__wide\s*\{[^}]*min-height:\s*100%/s
);
expect(stylesheet).toMatch(
  /\.r4-method__vertical\s*\{[^}]*grid-template-columns:\s*minmax\(/s
);
expect(stylesheet).not.toMatch(
  /\.r4-method__row\s*\{[^}]*border-(?:top|bottom)/s
);
```

- [ ] **Step 2: Add Services structural assertions**

Render `servicesScene.Component` and assert:

```ts
expect(markup.match(/data-reading-scrollport="true"/g)).toHaveLength(1);
expect(markup).toContain('class="r4-services__wide"');
expect(markup).toContain('class="r4-services__signals"');
expect(markup).toContain('class="r4-services__vertical"');
expect(markup).toContain('class="r4-services__capability-lead"');
expect(markup).toContain('企业服务能力');
expect(markup.match(/class="r4-services__row"/g)).toHaveLength(4);
expect(stylesheet).not.toMatch(
  /\.r4-services__row\s*\{[^}]*min-height:\s*39svh/s
);
expect(stylesheet).not.toMatch(
  /\.r4-services__row\s*\{[^}]*border-(?:top|bottom)/s
);
```

- [ ] **Step 3: Replace the obsolete Proof title assertion**

Replace the `28px–42px` token assertion with:

```ts
expect(stylesheet).toContain(
  '--r4-part-wide-title-size: clamp(32px, 3.8vw, 68px)'
);
expect(stylesheet).toMatch(
  /\.r4-proof-opening__title\s*\{[^}]*font-size:\s*var\(--r4-part-wide-title-size\)/s
);
expect(stylesheet).not.toContain('method-proof__');
expect(stylesheet).not.toMatch(
  /\.r4-proof-cards__row\s*\{[^}]*border-(?:top|bottom)/s
);
```

- [ ] **Step 4: Add the mobile action-class contract**

Update the navigation markup assertions:

```ts
expect(markup).toContain(
  'class="site-nav__action site-nav__toggle"'
);
expect(markup).toContain(
  'class="site-nav__action nav-cta"'
);
```

Read `StoryNav.css` and assert that the mobile rule groups both actions:

```ts
expect(stylesheet).toMatch(
  /@media \(max-width: 720px\)[\s\S]*\.site-nav__action\s*\{[^}]*min-height:\s*32px[^}]*border-radius:\s*6px/s
);
```

- [ ] **Step 5: Extend the Stage reading contract**

Add Services to the explicit scrollport test:

```ts
const servicesMarkup = renderToStaticMarkup(createElement(Stage, {
  window: { current: 'services', retiring: [] },
  modules: { services: servicesScene },
  registry: new HandleRegistry()
}));

expect(servicesMarkup).toContain('data-reading-scrollport="true"');
```

- [ ] **Step 6: Run the characterization tests**

Run:

```bash
cd app
pnpm vitest run \
  src/scenes/method-top/copy.test.ts \
  src/scenes/group4-scenes.test.ts \
  src/scenes/figure2-proof-scenes.test.ts \
  src/production/StoryNav.test.tsx \
  src/stage/Stage.reading.test.ts
```

Expected: FAIL on missing wide/vertical classes, Services scrollport, shared Proof token and shared navigation action class.

- [ ] **Step 7: Record a fresh bundle baseline**

Run:

```bash
cd app
pnpm build
```

Expected: PASS before implementation. Copy `dist/r5-performance-budget.json` values into the implementation notes of `docs/react-refactor/reports/r5-transition-frame-pacing.md`. Do not change any budget constant.

- [ ] **Step 8: Commit the characterization tests if commit authority is granted**

```bash
git add \
  app/src/scenes/method-top/copy.test.ts \
  app/src/scenes/group4-scenes.test.ts \
  app/src/scenes/figure2-proof-scenes.test.ts \
  app/src/production/StoryNav.test.tsx \
  app/src/stage/Stage.reading.test.ts \
  docs/react-refactor/reports/r5-transition-frame-pacing.md
git commit -m "test(r5): freeze reading layout and ui parity"
```

## Task 2: Rebuild Method as Wide-First and Vertical-Second

**Files:**

- Modify: `app/src/scenes/method-top/index.tsx`
- Modify: `app/src/scenes/method-bottom/index.tsx`
- Modify: `app/src/styles.css`
- Test: `app/src/scenes/method-top/copy.test.ts`
- Test: `app/src/transitions/method-top-method-bottom/index.test.ts`
- Test: `app/src/transitions/method-bottom-figure2/index.test.ts`

- [ ] **Step 1: Replace Method top markup**

Use the existing copy without duplication:

```tsx
<div className="r4-method__wide">
  <div className="r4-method__wide-copy">
    <span className="section-index">{METHOD_TOP_COPY[0]}</span>
    <h2>
      <span>{METHOD_TOP_COPY[1]}</span>
      <span>{METHOD_TOP_COPY[2]}</span>
    </h2>
    <p>{METHOD_TOP_COPY[3]}</p>
  </div>
  <div className="r4-method__signals" aria-label="方法首屏重点">
    <p><b>{METHOD_TOP_COPY[4]}</b><span>{METHOD_TOP_COPY[5]}</span></p>
    <p><b>{METHOD_TOP_COPY[6]}</b><span>{METHOD_TOP_COPY[7]}</span></p>
  </div>
</div>
```

Remove `r4-method__layout`, `r4-method__lead` and `r4-method__brief` from Method top production markup.

- [ ] **Step 2: Add the Method bottom structural lead**

Replace the single-list wrapper with:

```tsx
<div className="r4-method__vertical">
  <aside className="r4-method__steps-lead">
    <span className="section-index">01—05</span>
    <h2>AI 落地五步</h2>
  </aside>
  <ol className="r4-method__list" tabIndex={0} aria-label="同野观幂 AI 落地五步">
    {METHOD_STEPS.map((step) => (
      <li key={step.index} className="r4-method__row">
        <span>{step.index}</span>
        <strong>{step.title}</strong>
        <p>{step.body}</p>
      </li>
    ))}
  </ol>
</div>
```

The visible structural heading is descriptive UI copy already present in the existing `aria-label`; do not alter the five canonical step strings or their fallback order.

- [ ] **Step 3: Introduce shared part tokens**

Add this token block once near the reading-part styles:

```css
.story-app {
  --r4-part-content-width: min(1240px, 90vw);
  --r4-part-label-size: 12px;
  --r4-part-wide-title-size: clamp(32px, 3.8vw, 68px);
  --r4-part-lead-title-size: clamp(38px, 4.4vw, 78px);
  --r4-part-row-title-size: clamp(21px, 1.9vw, 34px);
  --r4-part-body-size: clamp(14px, 1vw, 17px);
  --r4-part-finale-size: clamp(36px, 4.4vw, 78px);
}
```

Update Lab and Education typography declarations to reference these variables without changing their DOM or copy.

- [ ] **Step 4: Implement the Method wide panel**

Use:

```css
.r4-method__wide {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(260px, .72fr);
  gap: clamp(30px, 5vw, 76px);
  align-content: center;
  align-items: end;
  width: var(--r4-part-content-width);
  min-height: 100%;
  margin: 0 auto;
  opacity: var(--r4-method-entrance-opacity);
}

.r4-method__wide-copy h2 {
  max-width: 10em;
  margin: 16px 0 0;
  font-family: var(--font-traditional);
  font-size: var(--r4-part-wide-title-size);
  font-weight: 600;
  line-height: 1.08;
}

.r4-method__signals {
  display: grid;
  gap: clamp(20px, 2.4vw, 32px);
}
```

Keep the existing Method paper background and transition opacity variables.

- [ ] **Step 5: Implement the Method vertical panel**

Use:

```css
.r4-method__vertical {
  display: grid;
  grid-template-columns: minmax(240px, .72fr) minmax(0, 1.42fr);
  gap: clamp(36px, 6vw, 88px);
  align-items: start;
  width: var(--r4-part-content-width);
  min-height: 100%;
  margin: 0 auto;
  opacity: var(--r4-method-entrance-opacity);
  transform: translate3d(0, var(--r4-method-bottom-y), 0);
}

.r4-method__steps-lead {
  position: sticky;
  top: clamp(74px, 9svh, 112px);
  display: grid;
  gap: 20px;
}

.r4-method__steps-lead h2 {
  max-width: 5em;
  margin: 0;
  font-family: var(--font-traditional);
  font-size: var(--r4-part-lead-title-size);
  font-weight: 600;
  line-height: 1.04;
}

.r4-method__row {
  display: grid;
  grid-template-columns: 46px minmax(150px, .72fr) minmax(0, 1.4fr);
  gap: clamp(18px, 2.4vw, 34px);
  align-items: baseline;
  padding: clamp(22px, 2.6vw, 34px) 0;
}
```

Delete Method row borders, `min-height: 40%`, and the nested list max-height. The article remains the single scrolling element.

- [ ] **Step 6: Add the mobile collapse**

```css
@media (max-width: 860px) {
  .r4-method__wide,
  .r4-method__vertical {
    width: 100%;
    grid-template-columns: 1fr;
  }

  .r4-method__steps-lead {
    position: relative;
    top: auto;
  }

  .r4-method__row {
    grid-template-columns: 42px minmax(0, 1fr);
  }

  .r4-method__row p {
    grid-column: 2;
  }
}
```

- [ ] **Step 7: Run focused Method tests**

```bash
cd app
pnpm vitest run \
  src/scenes/method-top/copy.test.ts \
  src/transitions/method-top-method-bottom/index.test.ts \
  src/transitions/method-bottom-figure2/index.test.ts \
  src/story/manifest.test.ts
```

Expected: PASS. The canonical two-hold and reverse-entry contracts remain unchanged.

- [ ] **Step 8: Commit if authorized**

```bash
git add \
  app/src/scenes/method-top/index.tsx \
  app/src/scenes/method-bottom/index.tsx \
  app/src/scenes/method-top/copy.test.ts \
  app/src/scenes/lab/index.tsx \
  app/src/scenes/education/index.tsx \
  app/src/styles.css
git commit -m "fix(r5): restore method wide and vertical layouts"
```

## Task 3: Rebuild Services as a Two-Panel Reading Part

**Files:**

- Modify: `app/src/scenes/services/index.tsx`
- Modify: `app/src/styles.css`
- Modify: `app/src/scenes/group4-scenes.test.ts`
- Modify: `app/src/stage/Stage.reading.test.ts`
- Modify: `app/e2e/r5-production.spec.ts`

- [ ] **Step 1: Split Services into two semantic panels**

Replace the single `r4-services__layout` with:

```tsx
<article
  ref={(element) => registerHandle?.('copy', element)}
  className="r4-services"
  data-r4-scene="services"
  data-reading-scrollport="true"
>
  <section className="r4-services__wide" aria-label="企业服务总览">
    <div className="r4-services__wide-copy">
      <span className="section-index">{SERVICES_COPY[0]}</span>
      <h2>
        <span>{SERVICES_COPY[1]}</span>
        <span>{SERVICES_COPY[2]}</span>
      </h2>
      <p>{SERVICES_COPY[3]}</p>
    </div>
    <div className="r4-services__signals" aria-hidden="true">
      {SERVICE_ROWS.map((row) => <span key={row.index}>{row.title}</span>)}
    </div>
  </section>
  <section className="r4-services__vertical" aria-label="企业服务能力">
    <aside className="r4-services__capability-lead">
      <span className="section-index">01—04</span>
      <h2>企业服务能力</h2>
    </aside>
    <ol className="r4-services__list" aria-label="企业服务能力">
      {SERVICE_ROWS.map((row) => (
        <li key={row.index} className="r4-services__row">
          <span>{row.index}</span>
          <strong>{row.title}</strong>
          <p>{row.body}<small>{row.detail}</small></p>
        </li>
      ))}
    </ol>
  </section>
</article>
```

- [ ] **Step 2: Make Services own its reading overflow**

Use:

```css
.r4-services {
  height: 100svh;
  min-height: 100svh;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.r4-services::-webkit-scrollbar {
  display: none;
}
```

- [ ] **Step 3: Implement the wide and vertical compositions**

```css
.r4-services__wide,
.r4-services__vertical {
  position: relative;
  z-index: 1;
  width: var(--r4-part-content-width);
  margin: 0 auto;
  opacity: var(--r4-services-opacity);
  transform: translate3d(0, var(--r4-services-y), 0);
}

.r4-services__wide {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(260px, .74fr);
  gap: clamp(30px, 5vw, 76px);
  min-height: calc(100svh - clamp(24px, 5svh, 48px));
  align-content: center;
  align-items: end;
  padding-bottom: clamp(34px, 5svh, 58px);
}

.r4-services__vertical {
  display: grid;
  grid-template-columns: minmax(260px, .86fr) minmax(0, 3.14fr);
  gap: clamp(36px, 6vw, 88px);
  align-items: start;
  padding-top: clamp(34px, 5svh, 58px);
}
```

Use `--r4-part-wide-title-size`, `--r4-part-lead-title-size`, `--r4-part-row-title-size` and `--r4-part-body-size` for the corresponding elements.

- [ ] **Step 4: Remove layout pacing hacks**

Delete:

```css
min-height: 39svh;
```

Delete all Services internal `border-top` and `border-bottom` declarations. Keep focus outlines and section boundary behavior.

- [ ] **Step 5: Add mobile composition**

```css
@media (max-width: 860px) {
  .r4-services__wide,
  .r4-services__vertical {
    width: 100%;
    grid-template-columns: 1fr;
  }

  .r4-services__wide {
    min-height: auto;
  }

  .r4-services__capability-lead {
    position: relative;
    top: auto;
  }

  .r4-services__row {
    grid-template-columns: 42px minmax(0, 1fr);
  }

  .r4-services__row p {
    grid-column: 2;
  }
}
```

- [ ] **Step 6: Update production selector checks**

In `r5-production.spec.ts`, replace the obsolete `.r4-services__layout` selector with:

```ts
selectors: [
  '.r4-services__wide',
  '.r4-services__vertical',
  '.r4-services__list',
  '.r4-services__row'
]
```

- [ ] **Step 7: Run Services and reading tests**

```bash
cd app
pnpm vitest run \
  src/scenes/group4-scenes.test.ts \
  src/stage/Stage.reading.test.ts \
  src/production/reading-handoff.test.ts \
  src/production/input-controller.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit if authorized**

```bash
git add \
  app/src/scenes/services/index.tsx \
  app/src/scenes/group4-scenes.test.ts \
  app/src/stage/Stage.reading.test.ts \
  app/src/styles.css \
  app/e2e/r5-production.spec.ts
git commit -m "fix(r5): restore services wide and vertical composition"
```

## Task 4: Unify Proof Typography and Mobile Topbar Actions

**Files:**

- Modify: `app/src/scenes/figure2-proof/index.tsx`
- Modify: `app/src/scenes/figure2-proof-opening/index.tsx`
- Modify: `app/src/scenes/figure2-proof-cards/index.tsx`
- Modify: `app/src/scenes/figure2-proof-closing/index.tsx`
- Modify: `app/src/scenes/figure2-proof-scenes.test.ts`
- Modify: `app/src/styles.css`
- Modify: `app/src/production/StoryNav.tsx`
- Modify: `app/src/production/StoryNav.css`
- Modify: `app/src/production/StoryNav.test.tsx`
- Modify: `app/e2e/r5-matrix.spec.ts`

- [ ] **Step 1: Remove legacy Proof class aliases**

Use only:

```tsx
<div className="r4-proof-opening__lead">
  <span>{FIGURE2_PROOF_OPENING_COPY[0]}</span>
  <h2 className="r4-proof-opening__title">
    <span>{FIGURE2_PROOF_OPENING_COPY[1]}</span>
    <span>{FIGURE2_PROOF_OPENING_COPY[2]}</span>
  </h2>
</div>
```

```tsx
<ol className="r4-proof-cards__list">
  <li className="r4-proof-cards__row">...</li>
</ol>
```

```tsx
<p className="r4-proof-closing__copy">
  {FIGURE2_PROOF_CLOSING_COPY[0]}
</p>
```

No production class name may start with `method-proof__`.

Apply the same class replacement to the three retired compatibility scene modules so tests and harness imports do not preserve a second styling vocabulary.

- [ ] **Step 2: Apply shared Proof tokens**

```css
.r4-proof-opening__title {
  margin: 0;
  font-family: var(--font-traditional);
  font-size: var(--r4-part-wide-title-size);
  font-weight: 600;
  line-height: 1.08;
}

.r4-proof-cards__row strong {
  font-size: var(--r4-part-row-title-size);
}

.r4-proof-cards__row p {
  font-size: var(--r4-part-body-size);
  line-height: 1.72;
}

.r4-proof-closing__copy {
  font-size: var(--r4-part-finale-size);
}
```

Set Proof content width with `width: var(--r4-part-content-width); margin-inline: auto;`. Remove ad-hoc `left: max(128px, 12vw)` and the card list borders.

- [ ] **Step 3: Add a shared navigation action class**

Update JSX:

```tsx
className="site-nav__action site-nav__toggle"
```

```tsx
className="site-nav__action nav-cta"
```

- [ ] **Step 4: Unify mobile action geometry**

Keep desktop CTA behavior. Inside the mobile media query use:

```css
.site-nav__action {
  min-height: 32px;
  padding-inline: 12px;
  border: 1px solid var(--diagnosis-cta-border);
  border-radius: 6px;
  background: var(--diagnosis-cta-bg);
  color: var(--diagnosis-cta-fg);
  font-size: 11px;
  font-weight: var(--diagnosis-cta-weight);
  line-height: 1;
  letter-spacing: .04em;
}

.site-nav__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
}
```

Remove `border-radius: 999px` and `background: transparent` from the toggle.

- [ ] **Step 5: Add a focused mobile computed-style assertion**

Extend the mobile menu test:

```ts
const actionStyles = await page.evaluate(() => {
  const menu = document.querySelector<HTMLElement>('.site-nav__toggle');
  const cta = document.querySelector<HTMLElement>('.nav-cta');
  if (!menu || !cta) throw new Error('mobile actions missing');
  const pick = (element: HTMLElement) => {
    const style = getComputedStyle(element);
    return {
      height: style.minHeight,
      radius: style.borderRadius,
      border: style.borderTopWidth,
      background: style.backgroundColor,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight
    };
  };
  return { menu: pick(menu), cta: pick(cta) };
});

expect(actionStyles.menu).toEqual(actionStyles.cta);
```

- [ ] **Step 6: Run focused UI tests**

```bash
cd app
pnpm vitest run \
  src/scenes/figure2-proof-scenes.test.ts \
  src/production/StoryNav.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit if authorized**

```bash
git add \
  app/src/scenes/figure2-proof/index.tsx \
  app/src/scenes/figure2-proof-opening/index.tsx \
  app/src/scenes/figure2-proof-cards/index.tsx \
  app/src/scenes/figure2-proof-closing/index.tsx \
  app/src/scenes/figure2-proof-scenes.test.ts \
  app/src/styles.css \
  app/src/production/StoryNav.tsx \
  app/src/production/StoryNav.css \
  app/src/production/StoryNav.test.tsx \
  app/e2e/r5-matrix.spec.ts
git commit -m "fix(r5): align proof typography and mobile nav actions"
```

## Task 5: Add Idle Adjacent-Transition Scheduling

**Files:**

- Create: `app/src/production/adjacent-prewarm.ts`
- Create: `app/src/production/adjacent-prewarm.test.ts`
- Modify: `app/src/story/types.ts`
- Modify: `app/src/production/StoryApp.tsx`
- Modify: `app/src/production/module-loaders.test.ts`

- [ ] **Step 1: Add the transition prewarm type**

Add:

```ts
export type TransitionPrewarmContext = {
  segment: SpineSegmentNode;
  stage: StageHandle;
  from: LayerHandle;
  to: LayerHandle;
  direction: Direction;
  prefersReducedMotion: boolean;
};
```

Extend `TransitionModule`:

```ts
prewarm?(context: TransitionPrewarmContext): Promise<void> | void;
```

No run ID or prepare token belongs in idle warmup; it cannot acquire runtime ownership.

- [ ] **Step 2: Create an idle scheduler with cancellation**

Implement:

```ts
type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number }
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function scheduleAdjacentPrewarm(
  task: () => Promise<void> | void,
  timeoutMs = 600
): () => void {
  const target = window as IdleWindow;
  let cancelled = false;
  let timer = 0;
  let idle = 0;
  const run = () => {
    if (!cancelled) {
      void Promise.resolve().then(task).catch(() => undefined);
    }
  };
  if (target.requestIdleCallback) {
    idle = target.requestIdleCallback(run, { timeout: timeoutMs });
  } else {
    timer = window.setTimeout(run, 32);
  }
  return () => {
    cancelled = true;
    if (idle) target.cancelIdleCallback?.(idle);
    if (timer) window.clearTimeout(timer);
  };
}
```

- [ ] **Step 3: Test requestIdleCallback and fallback cancellation**

Cover:

1. idle callback runs exactly once;
2. cancellation before callback prevents the task;
3. `setTimeout` fallback runs when `requestIdleCallback` is unavailable;
4. task rejection does not throw synchronously into React.

- [ ] **Step 4: Schedule the next forward transition from stable holds**

In the existing hold effect in `StoryApp`:

1. keep `ensureWindow`;
2. locate the next segment;
3. load its module;
4. resolve `from` and `to` layer handles;
5. invoke `module.prewarm` through `scheduleAdjacentPrewarm`;
6. cancel only a not-yet-started idle callback when the hold changes.

The call must be gated by:

```ts
snapshot.state === 'hold'
&& snapshot.context.cursor.status === 'hold'
&& presentationReady
&& !bootFailed
```

The prewarm promise is best-effort:

```ts
await module.prewarm?.(context);
```

The scheduler catches rejected tasks. Actual timeline construction remains authoritative and must still work after a failed warmup.

- [ ] **Step 5: Add loader identity assertions**

Assert:

```ts
expect((await loadTransitionModule('hero-pattern')).prewarm).toBeTypeOf('function');
expect((await loadTransitionModule('method-bottom-figure2')).prewarm).toBeTypeOf('function');
```

Other transition modules are not required to implement prewarm in this plan.

- [ ] **Step 6: Run scheduler and loader tests**

```bash
cd app
pnpm vitest run \
  src/production/adjacent-prewarm.test.ts \
  src/production/module-loaders.test.ts
```

Expected: FAIL until the two target transition modules expose prewarm; scheduler tests PASS.

- [ ] **Step 7: Commit if authorized**

```bash
git add \
  app/src/production/adjacent-prewarm.ts \
  app/src/production/adjacent-prewarm.test.ts \
  app/src/production/StoryApp.tsx \
  app/src/production/module-loaders.test.ts \
  app/src/story/types.ts
git commit -m "feat(r5): schedule adjacent transition warmup"
```

## Task 6: Prepare and Reuse Detached Ink GPU Resources

**Files:**

- Modify: `app/src/transitions/shared/sceneInk.ts`
- Modify: `app/src/transitions/shared/sceneInk.lifecycle.test.ts`
- Modify: `app/src/transitions/shared/ink.ts`
- Modify: `app/src/transitions/shared/ink.test.ts`

- [ ] **Step 1: Make renderer generation adoptable before first live render**

Extend `InkFieldRenderer`:

```ts
rebindGeneration(generation: string): boolean;
```

Inside `createInkFieldRenderer`, change the generation binding from `const` to `let` and implement:

```ts
rebindGeneration(nextGeneration) {
  if (destroyed || invalidated || transition === null) {
    return false;
  }
  generation = nextGeneration;
  canvas.dataset.r4InkGeneration = nextGeneration;
  return true;
}
```

Context-lost and generation-mismatch failures must report the active generation.

- [ ] **Step 2: Add a prepared-surface lifecycle inside `ink.ts`**

Define an internal handle:

```ts
type PreparedInkSurface = {
  canvas: HTMLCanvasElement;
  renderer: InkFieldRenderer;
  fieldKind: InkFieldSpec['kind'];
  grade: InkGradePreset;
  viewport: Readonly<{ width: number; height: number }>;
  dispose(): void;
};
```

It is valid only when:

- the field is a static `InkFieldSpec`, not a roots callback;
- reduced motion is false;
- the field kind and grade match;
- the viewport width and height differ by no more than 8 CSS pixels;
- the renderer remains active.

- [ ] **Step 3: Implement detached prewarm**

Within the closure returned by `createInkSegmentTransition`, hold at most one `PreparedInkSurface`.

The module `prewarm(context)` must:

1. return for reduced motion or function-valued fields;
2. create a detached canvas with `document.createElement('canvas')`;
3. create the renderer using generation `prewarm:${options.id}`;
4. call `renderer.prewarm(createInkFieldFrame(..., 0.003, viewport))`;
5. keep the canvas detached;
6. replace and dispose an incompatible earlier prepared surface.

No scene style, visibility, clip path or dataset may be changed.

- [ ] **Step 4: Consume the prepared surface in `InkSegmentTimeline`**

Add an optional constructor parameter:

```ts
preparedSurface?: PreparedInkSurface
```

When valid:

1. call `renderer.rebindGeneration(generation)`;
2. assign the live canvas class and segment datasets;
3. append the canvas to the normal `surfaceHost`;
4. reuse the renderer instead of calling `createInkFieldRenderer`;
5. prewarm the run-specific frame once so horizontal contours can upload;
6. transfer disposal ownership to the timeline.

When invalid, dispose it and use the existing cold construction path.

- [ ] **Step 5: Preserve the current disposal contract**

`InkSegmentTimeline.dispose()` must still:

- destroy exactly one renderer;
- remove exactly one live canvas;
- clear ownership geometry;
- release motion leases;
- leave no detached prepared canvas after the prepared surface was consumed.

`TransitionModule.dispose()` must dispose an unconsumed prepared surface.

- [ ] **Step 6: Add lifecycle tests**

Test these exact behaviors:

```ts
expect(stage.children).toHaveLength(0); // after idle prewarm
expect(gl.createProgram).toHaveBeenCalledTimes(1);

const timeline = await transition.buildTimeline(context);
expect(stage.children).toHaveLength(1);
expect(gl.createProgram).toHaveBeenCalledTimes(1); // reused, not rebuilt

timeline.dispose();
expect(stage.children).toHaveLength(0);
expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
```

Also test:

- second `prewarm()` is idempotent;
- viewport mismatch disposes and rebuilds;
- context loss invalidates the prepared surface;
- reduced motion creates no WebGL context;
- function-valued fields use the cold path;
- particle and horizontal-contour source assertions remain unchanged.

- [ ] **Step 7: Run shared Ink tests**

```bash
cd app
pnpm vitest run \
  src/transitions/shared/sceneInk.lifecycle.test.ts \
  src/transitions/shared/ink.test.ts \
  src/transitions/shared/inkField.test.ts \
  src/vendor/ink-scene-transition.lifecycle.test.ts \
  src/vendor/ink-scene-transition.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run a production build budget checkpoint**

```bash
cd app
pnpm build
```

Expected:

- `totalJsRawBytes <= 577536`;
- `totalJsHeadroomBytes >= 4096`;
- no budget constant changed.

If the gate fails, stop implementation and report the exact `totalJsRawBytes`, remaining headroom and overage. Do not raise the budget or remove warmup correctness, Ink particles, error recovery or readiness checks without a separately approved headroom plan.

- [ ] **Step 9: Commit if authorized**

```bash
git add \
  app/src/transitions/shared/sceneInk.ts \
  app/src/transitions/shared/sceneInk.lifecycle.test.ts \
  app/src/transitions/shared/ink.ts \
  app/src/transitions/shared/ink.test.ts
git commit -m "perf(r5): reuse idle-prepared ink surfaces"
```

## Task 7: Warm Hero Start Media Before Hero→Pattern

**Files:**

- Modify: `app/src/scenes/hero/index.tsx`
- Modify: `app/src/scenes/hero/progress.test.ts`
- Modify: `app/src/transitions/hero-pattern/index.ts`
- Modify: `app/src/transitions/hero-pattern/index.test.ts`

- [ ] **Step 1: Export a forward start-frame preparation helper**

Add:

```ts
export function prepareHeroPatternStartFrame(
  root: HTMLElement | null | undefined,
  signal?: AbortSignal
): Promise<void> {
  return prepareHeroPatternFrame(root, 0, {
    runId: 'hero-pattern-prewarm',
    direction: 1,
    signal
  });
}
```

The helper must not play the video and must leave the visible Hero at time zero.

- [ ] **Step 2: Keep cold HTML unchanged**

Retain:

```tsx
preload="none"
```

Add a test that static Hero markup still contains it.

- [ ] **Step 3: Compose media and GPU warmup in Hero→Pattern**

Wrap the base transition prewarm:

```ts
prewarm: async (context) => {
  await Promise.all([
    transition.prewarm?.(context),
    prepareHeroPatternStartFrame(
      context.from.element?.querySelector<HTMLElement>('[data-r4-scene="hero"]')
        ?? context.from.element
    )
  ]);
}
```

Preserve the existing build-time endpoint preparation as a correctness fallback. `TimelineVideoDriver` will reuse the previously presented time-zero frame for the real run generation.

- [ ] **Step 4: Add Hero media warmup tests**

Assert:

- initial markup is still `preload="none"`;
- calling transition `prewarm()` promotes the element to `preload="auto"`;
- frame zero becomes ready;
- `playCalls` remains zero;
- `buildTimeline()` targeting the same frame does not perform another physical seek;
- reverse construction still prepares the terminal frame;
- phase-boundary timeout and abort behavior remains green.

- [ ] **Step 5: Run Hero tests**

```bash
cd app
pnpm vitest run \
  src/scenes/hero/progress.test.ts \
  src/transitions/hero-pattern/index.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit if authorized**

```bash
git add \
  app/src/scenes/hero/index.tsx \
  app/src/scenes/hero/progress.test.ts \
  app/src/transitions/hero-pattern/index.ts \
  app/src/transitions/hero-pattern/index.test.ts
git commit -m "perf(r5): prewarm hero pattern start frame"
```

## Task 8: Make Figure2 Opening-Frame Readiness Real

**Files:**

- Modify: `app/src/scenes/figure2-animation/index.tsx`
- Modify: `app/src/scenes/figure2-animation/progress.test.ts`
- Modify: `app/src/transitions/method-bottom-figure2/index.ts`
- Modify: `app/src/transitions/method-bottom-figure2/index.test.ts`

- [ ] **Step 1: Add an idempotent Figure2 hold-frame promise**

Add a `WeakMap<HTMLElement, Promise<void>>` and export:

```ts
export function ensureFigure2HoldFrame(
  root: HTMLElement | null,
  signal?: AbortSignal
): Promise<void> {
  if (!root) return Promise.reject(new Error('Figure2 unavailable'));
  const existing = holdFramePreparations.get(root);
  if (existing) return existing;
  const preparation: Figure2MediaPreparation = {
    runId: 'figure2-hold-frame',
    direction: 1,
    signal,
    startPlayback: false
  };
  const promise = prepareFigure2MediaLeg(root, preparation)
    .then(() => commitFigure2MediaLeg(root, preparation))
    .then(() => {
      root.dataset.figure2HoldFrameReady = 'true';
    });
  holdFramePreparations.set(root, promise);
  void promise.catch(() => {
    if (holdFramePreparations.get(root) === promise) {
      holdFramePreparations.delete(root);
    }
  });
  return promise;
}
```

Clear the map entry and dataset during `disposeFigure2Media`.

- [ ] **Step 2: Register actual frame readiness as a required handle**

After `ensureFigure2HoldFrame` resolves, register the combined video element:

```ts
registerHandle?.('opening-frame', combinedVideo);
```

On cleanup:

```ts
registerHandle?.('opening-frame', null);
```

Update:

```ts
requiredHandles: ['stage', 'figures', 'combined-video', 'opening-frame']
```

Change scene preload metadata to:

```ts
preload: () => ({ milestones: ['targetReady'] })
```

The scene must no longer claim media readiness before a presented frame exists.

- [ ] **Step 3: Compose Figure2 frame and horizontal Ink warmup**

In `createMethodBottomFigure2Transition`, return:

```ts
return {
  ...inkTransition,
  prewarm: async (context) => {
    const root = context.to.element?.querySelector<HTMLElement>(
      '[data-r4-scene="figure2-animation"]'
    ) ?? context.to.element;
    await Promise.all([
      inkTransition.prewarm?.(context),
      ensureFigure2HoldFrame(root)
    ]);
  }
};
```

Playback must remain paused at the opening frame throughout Method→Figure2 Ink.

- [ ] **Step 4: Replace the obsolete dual-video test wording**

The current Figure2 asset is a single combined video. Rename the test to:

```ts
it('holds the prepared combined opening frame throughout the ink reveal', ...)
```

Assert one combined video, zero play calls and no additional seek after warmup.

- [ ] **Step 5: Add readiness tests**

Cover:

- concurrent calls share one promise;
- `opening-frame` is registered only after `requestVideoFrameCallback`;
- failed preparation does not register the handle;
- retry after failure creates one new promise;
- dispose clears readiness;
- Method→Figure2 prewarm creates no visible canvas and does not play video;
- actual timeline reuses both prepared GPU and media state.

- [ ] **Step 6: Run Figure2 tests**

```bash
cd app
pnpm vitest run \
  src/scenes/figure2-animation/progress.test.ts \
  src/transitions/method-bottom-figure2/index.test.ts \
  src/transitions/figure2-proof-chain.test.ts \
  src/stage/Stage.reading.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit if authorized**

```bash
git add \
  app/src/scenes/figure2-animation/index.tsx \
  app/src/scenes/figure2-animation/progress.test.ts \
  app/src/transitions/method-bottom-figure2/index.ts \
  app/src/transitions/method-bottom-figure2/index.test.ts
git commit -m "perf(r5): make figure2 opening readiness explicit"
```

## Task 9: Add Cold-First-Interaction Performance Evidence

**Files:**

- Modify: `app/e2e/r5-performance.spec.ts`
- Modify: `docs/react-refactor/reports/r5-transition-frame-pacing.md`

- [ ] **Step 1: Start frame sampling before the first Hero gesture**

Change the Hero path order to:

```ts
await startFrameSampling(page, 'hero-pattern');
const heroStartedAt = Date.now();
await pressFromCurrentHold(page, 'PageDown');
await page.waitForFunction(() => {
  const hero = document.querySelector<HTMLElement>('[data-r4-scene="hero"]');
  return Number.parseFloat(
    hero?.style.getPropertyValue('--r4-hero-pattern-figure-progress') ?? '0'
  ) > 0.01;
});
const heroFirstVisualMs = Date.now() - heroStartedAt;
await waitForHold(page, 'pattern');
const heroPatternIntervals = await stopFrameSampling(page);
```

Do not wait for mid-Ink before starting the sampler; that was the previous blind spot.

- [ ] **Step 2: Add a cold Method→Figure2 path**

Use:

```ts
await bootStory(page, '/#method');
await pressFromCurrentHold(page, 'PageDown');
await waitForHold(page, 'method-bottom');
await reachReadingEdge(page, 1);
await startFrameSampling(page, 'horizontal-ink');
const methodStartedAt = Date.now();
await pressFromCurrentHold(page, 'PageDown');
await waitForLiveInk(page, 'method-bottom-figure2', { min: 0.03, max: 0.20 });
const methodFirstVisualMs = Date.now() - methodStartedAt;
await waitForHold(page, 'figure2-animation');
const methodFigure2Intervals = await stopFrameSampling(page);
```

- [ ] **Step 3: Report cold and steady metrics separately**

Add:

```ts
coldStart: {
  heroPattern: {
    firstVisualMs: heroFirstVisualMs,
    frames: summarizeFrames(heroPatternIntervals)
  },
  methodFigure2: {
    firstVisualMs: methodFirstVisualMs,
    frames: summarizeFrames(methodFigure2Intervals)
  }
}
```

- [ ] **Step 4: Apply explicit cold-start gates**

For hardware Chromium:

- desktop first visual: `<= 80ms`;
- mobile Chromium first visual: `<= 120ms`;
- no consecutive frames over `50ms`;
- long-frame ratio `< 0.01`;
- renderer witness active;
- Figure2 combined video has `data-figure2-hold-frame-ready="true"` before the transition begins.

Software renderers keep the existing relaxed frame interval allowance, but still require the media readiness witness and no runtime error.

- [ ] **Step 5: Run the focused critical browser test**

```bash
cd app
pnpm playwright test e2e/r5-performance.spec.ts \
  --project=desktop-chromium \
  --project=mobile-chromium
```

Expected: PASS. This focused Playwright run is required because the task is specifically about first-use visual pacing and cannot be proven in JSDOM.

- [ ] **Step 6: Update the performance report**

Record:

- prewarm scheduling point;
- Hero start-frame presented witness;
- Figure2 hold-frame presented witness;
- cold first-visual times;
- cold frame summaries;
- visible canvas count;
- final JS budget report.

- [ ] **Step 7: Commit if authorized**

```bash
git add \
  app/e2e/r5-performance.spec.ts \
  docs/react-refactor/reports/r5-transition-frame-pacing.md
git commit -m "test(r5): qualify cold transition startup"
```

## Task 10: Visual Acceptance and Full Verification

**Files:**

- Verify all modified files
- Update: `docs/react-refactor/reports/r5-transition-frame-pacing.md`

- [ ] **Step 1: Run static quality gates**

```bash
cd app
pnpm lint
pnpm typecheck
pnpm vitest run
```

Expected: all commands PASS.

- [ ] **Step 2: Run production and budget gates**

```bash
cd app
pnpm build
pnpm verify:media:deep
```

Expected:

- build PASS;
- media deep verification PASS;
- `totalJsRawBytes <= 577536`;
- at least `4096` bytes total JS headroom;
- no media inventory change.

- [ ] **Step 3: Run focused layout and mobile browser checks**

```bash
cd app
pnpm playwright test \
  e2e/r5-production.spec.ts \
  e2e/r5-matrix.spec.ts \
  --project=desktop-chromium \
  --project=mobile-chromium
```

Expected: PASS.

- [ ] **Step 4: Perform HITL visual review**

Review these exact states:

1. Method top at desktop `1440×900`: wide headline/body left, “现场 / 章法” right.
2. Method bottom at desktop: sticky structural lead left, 01–05 right.
3. Services first and second panels at desktop.
4. Method and Services at mobile `390×844`: one-column order and no horizontal overflow.
5. Mobile topbar on both light and dark scenes.
6. Proof opening, cards and closing at desktop and mobile.
7. First Hero→Pattern run after hard reload.
8. First Method→Figure2 run after direct Method entry.

Reject the candidate if any of these occur:

- narrow centered Method first screen;
- list-only Method second screen;
- Services `39svh` blank row rhythm;
- menu and appointment actions with different shapes;
- Proof card titles larger than its opening title;
- visible prewarm canvas;
- first-gesture freeze;
- missing Ink particles or secondary horizontal edge.

- [ ] **Step 5: Run the full release matrix only after HITL passes**

```bash
cd app
pnpm test:release
```

Expected: all configured required projects PASS and only project-configured skips remain.

- [ ] **Step 6: Check patch hygiene**

```bash
git diff --check
git status --short
```

Expected:

- `git diff --check` produces no output;
- only planned source, tests and documentation are modified;
- `artifacts/react-refactor/r5-figure2-combined-candidate/` remains untouched.

- [ ] **Step 7: Create the final implementation commit if authorized**

```bash
git add \
  app/src \
  app/e2e \
  docs/react-refactor/reports/r5-transition-frame-pacing.md \
  docs/plans/2026-07-16-009-fix-r5-layout-cold-start-ui-parity-plan.md
git commit -m "fix(r5): close layout cold-start and ui parity"
```

Do not push, freeze a candidate, finalize a release manifest or delete a worktree without separate user authorization.

## Completion Gate

This plan is complete only when all conditions are true:

- Method top is the confirmed wide full-screen composition.
- Method bottom is the confirmed left/right reading composition.
- Services has a wide intro and a left/right capability panel.
- Method, Services, Lab and Education share the same content-width and typography token system.
- Proof retains three screens and uses the shared typography system without legacy class aliases.
- Mobile menu and appointment actions have matching computed geometry and typography.
- Hero→Pattern and Method→Figure2 first-use measurements include the preparation interval and pass the cold-start gates.
- Hero initial HTML still uses `preload="none"`.
- Figure2 opening-frame readiness is backed by a presented-frame witness.
- One visible Ink canvas and one draw call remain the production contract.
- Ink particles and horizontal double-edge visual witnesses remain green.
- Lint, typecheck, unit, build, media deep verification, focused browser checks and release matrix pass.
- Total JS headroom remains at least 4 KiB without raising any budget.
- HITL confirms the four layouts and both first-use transitions.

## Self-Review

- Spec coverage: Method, Services, cold preload, mobile topbar and Proof are each mapped to implementation and verification tasks.
- Architecture consistency: `TransitionModule.prewarm`, `TransitionPrewarmContext`, detached Ink preparation and media-frame preparation use the same names throughout.
- Scope control: no canonical spine, media asset, reading governor or Ink visual parameter change is included.
- Placeholder scan: no implementation step depends on undefined copy, an unspecified selector or a deferred technical decision.
- Release safety: full Playwright remains after focused critical verification and HITL, and no stage/commit/push is authorized by this document alone.
