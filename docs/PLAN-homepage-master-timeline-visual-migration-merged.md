# Homepage Master Timeline Visual Migration Implementation Plan

> **For agentic workers:** Execute Section 9 task-by-task: one task, one worker, one review, one commit. If `superpowers:subagent-driven-development` or `superpowers:executing-plans` is available in the current runtime, use it as an execution accelerator; otherwise follow Section 9 directly. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Master Timeline the single visible homepage visual authority, with real canonical surfaces, hidden-by-default debug HUD, no parallel legacy runtime, correct public hash navigation, and browser evidence for non-empty cross-scene bridges.

**Architecture:** This plan deliberately chooses Strategy A: real master takeover. The master track owns scroll range, sticky viewport presentation, copy, canonical surfaces, and ink composition. Legacy sections remain public semantic/hash anchors only after master copy and surfaces are real. Legacy transition adapters are not mounted in master mode; they remain legacy-only with defensive guards.

**Tech Stack:** Vanilla ES modules, generated `index.html` via `scripts/build-index.mjs`, `node-html-parser` for build-time copy extraction, CSS master stage rules in `css/components/homepage-continuity.css`, static checks under `scripts/check-*.mjs`, targeted Playwright/CDP probes at high-risk milestones, and final Playwright/CDP audit under `scripts/audit-homepage-directed-timeline-cdp.mjs`.

---

## 0. Decision And Scope

Use this document as the execution source of truth.

Merged from:

- `docs/PLAN-homepage-master-timeline-visual-migration.md`
- `docs/2026-06-27-complete-master-timeline-migration.md`
- `docs/2026-06-27-homepage-timeline-final-review.md`

Do not execute `docs/2026-06-27-complete-master-timeline-migration.md` directly. It misses the master-visible takeover prerequisite and treats the leaked HUD as a new feature instead of a production leak.

### Strategy A Selected: Real Takeover

The primary path is a real takeover of homepage visual ownership:

- Master stage is visible from the first viewport.
- Master stage precedes the scroll spacer in DOM order.
- Master track preserves scroll range after legacy visuals collapse.
- Master copy roots contain the visible copy.
- Canonical surface producers draw real surfaces, not observer flags.
- `MasterInkCompositor` composites from canonical surfaces.
- Legacy adapters and old visual initializers do not run in master mode.

### Strategy B Retained: Honest Rollback

If Task 7 cannot produce real surfaces with acceptable fidelity, stop before Task 8 and choose the honest rollback:

- keep the hidden/inert HUD fix;
- keep target-state checks out of `verify:all`;
- leave master scaffold inert or hidden;
- restore `data-master-dom-mode` to legacy-visible behavior;
- keep legacy visuals as the visible production path.

Do not ship a state where smoke-test surfaces are visible and checks claim real takeover.

## 1. Current Verified State

These facts are the basis for every task:

- `index.html` currently has `data-master-timeline-enabled="true"` and `data-master-dom-mode="master-visible"`.
- `initHomepageTransitions()` currently starts both runtimes when master is enabled: legacy first, master second.
- Master runtime currently declares salvage mode and does not mount transition adapters.
- `[data-homepage-master-stage]` is hidden with `display: none`.
- `[data-master-timeline-hud]` is visible, fixed, focusable, and scrub-capable.
- All `homepageSurfaceProducerRegistry` entries route to `createObserverSurfaceProducer`, which only writes dataset markers.
- Master copy roots are empty scaffold containers.
- `scripts/build-index.mjs` currently injects the master scaffold before `injectSectionAttributes()`, so selectors like `#home .hero-content` cannot match during scaffold construction.
- `js/ui/smooth-scroll.js` has a master-anchor helper, but public hashes still resolve to public legacy IDs before master timeline coordinates are applied.
- `scene-timeline-controller.js` is already deleted and `ownershipWindows` is already retired; those are not execution blockers.
- `verify:all` currently passes because static checks bless salvage/legacy parallel behavior.
- Current CDP audit checks salvage, not master takeover.

## 2. Non-Negotiable Invariants

- Master enabled mode must initialize exactly one homepage visual runtime.
- Master stage must be visible from the first viewport.
- In the generated track, `[data-homepage-master-stage]` must come before `[data-homepage-master-scroll-spacer]`.
- The sticky stage must use `100dvh` with a `100vh` fallback.
- The page must retain scroll range after legacy sections become semantic anchors.
- HUD must be hidden, inert, and absent from the accessibility tree unless explicitly enabled with `?debug=timeline` or `data-debug-timeline="true"`.
- Surface producers must draw real pixels, not only set readiness flags.
- Smoke-test surfaces can prove plumbing only; they cannot satisfy final acceptance.
- `MasterInkCompositor` must sample canonical surfaces through `textureSourceForSurface()`.
- Master mode must not mount legacy adapters, master no-op adapters, or adapter-local RAF/ink/progress loops.
- Public hashes such as `/#belief` must map to master timeline positions while public IDs remain on semantic legacy anchors.
- Reduced-motion must still draw static first frames through master producers.
- Static verification and CDP audit must assert the target state, not salvage.
- Main desktop diagnostic baseline screenshots must exist before any visible-flow takeover edits. They document the main-branch desktop behavior, including known defects; they are not a golden standard. Task 7 must compare real producers against those diagnostics before choosing Strategy A.
- `belief.star` is the shared-surface canary: one canonical surface must stay ready and non-blank across home/belief transition blocks without duplicate ownership or flash-clearing.
- Use Playwright/CDP when static checks cannot prove the behavior: sticky/mobile geometry, canvas pixel output, direct-hash landing, single runtime startup, and reduced-motion first frames.

### Browser/CDP Check Policy

- Static checks come first for every task.
- Targeted Playwright/CDP checks are required in Task 0, Task 3, Task 7, Task 10, Task 11, and Task 13.
- Targeted probes before Task 13 are milestone checks, not a replacement for the final full audit.
- Save useful probe output under `output/playwright/homepage-directed-timeline-cdp/` when it would help review.
- Do not treat a non-empty canvas as final visual acceptance unless `verify:homepage-real-surface-assets` also passes.
- Do not make the Strategy A/B decision from pixel variance alone. Compare against the main desktop diagnostic screenshots captured in Task 0, while explicitly noting which old behaviors are defects that should not be preserved.

## 3. Estimated Size

This is a homepage visual system rewrite, not a small polish task.

Expected implementation size:

- Task 0 main desktop diagnostic baseline capture: 0.5 day.
- Task 1-5 contracts/scaffold/HUD/hash/mobile spike: 1-2 engineering days.
- Task 6 smoke producers: 1 day.
- Task 7 real visual producers: 3-6 engineering days depending on how many legacy animations can be reused as drawing helpers.
- Task 8 copy migration: 1-2 days.
- Task 9-12 runtime takeover/check reversal/final audit: 1-2 days.
- Review, visual tuning, regression fixes: 2-4 days.

Total planning range: 8-15 engineering days. Treat any estimate below one week as optimistic unless real producer reuse is proven in Task 7.

## 4. File Structure

Create:

- `js/transitions/homepage/static-paper-surface-producers.js`
  Draws static paper/copy surfaces for method, brand, services, philosophy, and contact.

- `js/transitions/homepage/hero-surface-producer.js`
  Draws `home.visual`; replaces `initLayeredHero` as the master-mode visible hero renderer.

- `js/transitions/homepage/belief-star-surface-producer.js`
  Draws shared `belief.star` across home and belief scenes.

- `js/transitions/homepage/aod-surface-producer.js`
  Draws `aod.bridge`; required for `belief-lower-to-method`.

- `js/transitions/homepage/figure2-surface-producer.js`
  Draws `figure2.bridge`; required for `method-proof-to-brand`.

- `js/transitions/homepage/figure3-surface-producer.js`
  Draws `figure3.bridge`; required for `brand-to-services`.

- `js/transitions/homepage/ttg-surface-producer.js`
  Draws `lab.visual`; required for `services-to-lab`.

- `js/transitions/homepage/ph-surface-producer.js`
  Draws `education.visual`; required for `lab-to-education`.

- `js/transitions/homepage/crane-surface-producer.js`
  Draws `crane.bridge`; required for `philosophy-to-contact`.

- `scripts/check-homepage-master-takeover-contract.mjs`
  Target-state static check covering default-hidden HUD, single runtime, non-observer producers, visible master stage, hash hooks, old visual initializer gates, and scroll range.

- `scripts/check-homepage-real-surface-assets.mjs`
  Static check that rejects smoke-only/fallback-only producers after Task 7.

- `scripts/check-homepage-master-hash-navigation.mjs`
  Static check that public hashes map to master timeline anchors in master-visible mode.

Modify:

- `package.json`
- `package-lock.json`
- `scripts/build-index.mjs`
- `css/components/homepage-continuity.css`
- `js/main.js`
- `js/ui/smooth-scroll.js`
- `js/transitions/homepage-transition-registry.js`
- `js/transitions/homepage-transition-runtime.js`
- `js/transitions/homepage/master-scroll-map.js`
- `js/transitions/homepage/master-surface-producer-registry.js`
- `scripts/check-copy-alignment.mjs`
- `scripts/check-homepage-master-timeline.mjs`
- `scripts/check-handoff-ownership.mjs`
- `scripts/check-homepage-master-track-structure.mjs`
- `scripts/check-homepage-visual-timeline-contract.mjs`
- `scripts/audit-homepage-directed-timeline-cdp.mjs`

Keep as retired compatibility, do not resurrect:

- `js/transitions/homepage/scene-timeline-controller.js`
- `ownershipWindows` export in `src/section-manifest.mjs`

## 5. Scene And Copy Migration Table

Task 8 must verify every selector against the real partial source before cloning. Do not assume one scene equals one partial.

| Master scene | Copy selector after section attributes | Expected source note | Visual/surface source | Public hash |
| --- | --- | --- | --- | --- |
| `home` | `#home .hero-content` | home partial after `injectSectionAttributes()` | `home.visual` | `#home` |
| `belief.upper` | `#belief .belief-upper-copy-wrap` | belief partial after `injectSectionAttributes()` | `belief.star` | `#belief` |
| `belief.lower` | `#belief .belief-lower-copy-wrap` | belief partial after `injectSectionAttributes()` | `belief.star` | `#belief` |
| `method` | `#method .method-edition-layout--after-handoff` | method partial after `injectSectionAttributes()` | `method.paper` | `#method` |
| `method.proof` | `#method .homepage-scene--method-proof` | method partial after `injectSectionAttributes()` | `figure2.bridge` | none |
| `brand` | `#brand .brand-definition-grid` | verify actual source; current code has this in `src/sections/brand.html` | `brand.paper` | `#brand` |
| `services` | `#services .enterprise-vertical-layout` | services partial after `injectSectionAttributes()` | `services.paper` | `#services` |
| `lab` | `#lab .scenario-wide-stage` | lab partial after `injectSectionAttributes()` | `lab.visual` | `#lab` |
| `education` | `#education .education-vertical-layout` | education partial after `injectSectionAttributes()` | `education.visual` | `#education` |
| `philosophy` | `#philosophy .philosophy-list` | philosophy partial after `injectSectionAttributes()` | `philosophy.visual` | `#philosophy` |
| `contact` | `#contact .contact-endpoint` | contact partial after `injectSectionAttributes()` | `contact.paper` | `#contact` |

Rules:

- Copy extraction runs after section metadata injection, not inside the first empty scaffold construction pass.
- Use `node-html-parser`; do not use regex or marker-comment slicing for copy extraction.
- Master copy roots contain cloned semantic copy content without duplicate public `id` attributes.
- Legacy sections keep public `id`, `data-section-id`, and labels as semantic anchors.
- Hash navigation resolves public hashes to master timeline coordinates while preserving public IDs for accessibility and direct linking.

## 6. Implementation Tasks

### Task 0: Capture Main Desktop Diagnostic Baseline Before Takeover Edits

**Files:**

- Output: `output/playwright/homepage-main-diagnostic-baseline/`

- [ ] **Step 1: Start from the current visible legacy path**

Run this task before Task 1 changes any production code. Capture from the `main` branch, desktop viewport only. Do not capture from the migration worktree, because it may already include partial master-timeline changes.

These screenshots are diagnostic evidence, not a golden target. The main homepage may contain the exact defects this migration is meant to fix. Use the captures to answer:

- what did desktop users actually see on `main` before migration;
- which visual moments are worth preserving;
- which glitches, HUD leaks, blank frames, or timing problems must not be reproduced.

Do not run this after Task 4 hides legacy flow or after Task 9 gates old visual initializers.

- [ ] **Step 2: Start the static site server**

Terminal 1:

```bash
PORT=8093 npm run dev
```

- [ ] **Step 3: Capture scene and bridge screenshots**

Terminal 2:

```bash
node --input-type=module <<'NODE'
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const outputDir = 'output/playwright/homepage-main-diagnostic-baseline';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8093/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const visibleMode = await page.evaluate(() => ({
  masterEnabled: document.documentElement.dataset.masterTimelineEnabled,
  masterDomMode: document.documentElement.dataset.masterDomMode,
  masterStageVisible: (() => {
    const stage = document.querySelector('[data-homepage-master-stage]');
    if (!stage) return false;
    const style = getComputedStyle(stage);
    const rect = stage.getBoundingClientRect();
    return style.display !== 'none' && rect.height > 100;
  })(),
  legacyHeroVisible: Boolean(document.querySelector('.hero-wrap, #home'))
}));

if (visibleMode.masterStageVisible) {
  throw new Error('Baseline must capture legacy-visible production flow, but master stage is already visible.');
}

const targets = await page.evaluate(() => {
  const sectionTargets = ['home', 'belief', 'method', 'brand', 'services', 'lab', 'education', 'philosophy', 'contact']
    .map((id) => {
      const node = document.getElementById(id);
      const rect = node?.getBoundingClientRect?.();
      return node && rect ? {
        type: 'section',
        id,
        y: Math.max(0, Math.round(window.scrollY + rect.top))
      } : null;
    })
    .filter(Boolean);

  const bridgeTargets = [...document.querySelectorAll('[data-transition-id], [data-transition]')]
    .map((node) => {
      const id = node.getAttribute('data-transition-id') || node.getAttribute('data-transition');
      const rect = node.getBoundingClientRect();
      return id && rect.height > 20 ? {
        type: 'bridge',
        id,
        y: Math.max(0, Math.round(window.scrollY + rect.top + rect.height * 0.5 - window.innerHeight * 0.5))
      } : null;
    })
    .filter(Boolean);

  return [...sectionTargets, ...bridgeTargets];
});

const manifest = [];
for (const target of targets) {
  await page.evaluate((y) => window.scrollTo(0, y), target.y);
  await page.waitForTimeout(900);
  const safeId = target.id.replace(/[^a-z0-9._-]+/gi, '-');
  const file = `${target.type}-${safeId}.png`;
  await page.screenshot({ path: `${outputDir}/${file}`, fullPage: false });
  manifest.push({ ...target, file, scrollY: await page.evaluate(() => window.scrollY) });
}

await writeFile(`${outputDir}/manifest.json`, `${JSON.stringify({ visibleMode, targets: manifest }, null, 2)}\n`);
await browser.close();
console.log(`Captured ${manifest.length} main desktop diagnostic frames in ${outputDir}`);
NODE
```

- [ ] **Step 4: Verify baseline completeness**

Run:

```bash
test -f output/playwright/homepage-main-diagnostic-baseline/manifest.json
ls output/playwright/homepage-main-diagnostic-baseline/*.png
```

Expected:

- `manifest.json` exists.
- section screenshots exist for home, belief, method, brand, services, lab, education, philosophy, and contact.
- bridge screenshots exist for every current `[data-transition-id]` or `[data-transition]` found in the built page.
- `manifest.json.visibleMode.masterStageVisible` is `false`.
- if a screenshot contains a known defect, record that in review notes instead of treating it as something to preserve.

### Task 1: Add Target-State Static Checks Before Runtime Changes

**Files:**

- Create: `scripts/check-homepage-master-takeover-contract.mjs`
- Create: `scripts/check-homepage-master-hash-navigation.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create takeover contract check**

Create `scripts/check-homepage-master-takeover-contract.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const runtime = read('js/transitions/homepage-transition-runtime.js');
const registry = read('js/transitions/homepage-transition-registry.js');
const css = read('css/components/homepage-continuity.css');
const build = read('scripts/build-index.mjs');
const html = read('index.html');
const main = read('js/main.js');
const smoothScroll = read('js/ui/smooth-scroll.js');

assert.doesNotMatch(
  runtime,
  /cleanup\.add\(await initLegacyHomepageTransitions\(options\)\)[\s\S]*cleanup\.add\(await initMasterHomepageTransitions\(options\)\)/,
  'master-enabled mode must not start legacy and master runtimes in parallel'
);

assert.doesNotMatch(
  runtime,
  /real legacy visual flow|legacy runtime owns the real DOM\/video stages|only drives HUD\/state diagnostics/,
  'master runtime must not remain in salvage observer mode'
);

assert.doesNotMatch(
  runtime,
  /mountMasterHomepageAdapters\(\)/,
  'master runtime must not mount homepage transition adapters'
);

assert.doesNotMatch(
  css,
  /html\[data-master-dom-mode="master-visible"\]\s+\[data-homepage-master-stage\]\s*\{[\s\S]*display:\s*none/,
  'master-visible stage must not be hidden'
);

assert.match(
  css,
  /height:\s*100dvh/,
  'master-visible stage must use 100dvh for mobile viewport stability'
);

assert.match(
  build,
  /data-homepage-master-stage[\s\S]*data-homepage-master-scroll-spacer/,
  'master stage must be generated before the scroll spacer'
);

assert.doesNotMatch(
  registry,
  /createObserverSurfaceProducer|createObservedSurface/,
  'master registry must not use observer producers after takeover'
);

assert.match(
  build,
  /data-master-timeline-hud[^\\n]+hidden[^\\n]+inert[^\\n]+aria-hidden="true"/,
  'generated HUD must be hidden and inert by default'
);

assert.doesNotMatch(
  html,
  /<aside\b(?=[^>]*data-master-timeline-hud)(?![^>]*\bhidden\b)(?![^>]*\binert\b)[^>]*>/,
  'built HUD must not be visible by default'
);

assert.match(
  main,
  /if\s*\(!masterTimelineEnabled\)\s*\{[\s\S]*initBeliefStarField/,
  'main.js must gate old belief star initializer in master mode'
);

assert.match(
  main,
  /if\s*\(!masterTimelineEnabled\)\s*\{[\s\S]*initLayeredHero/,
  'main.js must gate old layered hero initializer in master mode'
);

assert.match(
  smoothScroll,
  /getMasterAnchorTarget|data-master-anchor/,
  'smooth scroll must have a master-anchor hash mapping path'
);

console.log('Homepage master takeover contract passed.');
```

This fixes the old HUD false positive by anchoring the assertion to the HUD opening tag.

- [ ] **Step 2: Create hash navigation check**

Create `scripts/check-homepage-master-hash-navigation.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const html = read('index.html');
const build = read('scripts/build-index.mjs');
const smoothScroll = read('js/ui/smooth-scroll.js');
const runtime = read('js/transitions/homepage-transition-runtime.js');

for (const id of ['home', 'belief', 'method', 'brand', 'services', 'lab', 'education', 'philosophy', 'contact']) {
  assert.match(html, new RegExp(`id="${id}"`), `${id} public id must remain in the built page`);
  assert.match(html, new RegExp(`data-master-anchor="${id}"`), `${id} master anchor must exist`);
}

assert.match(build, /MASTER_ANCHOR_SCENES/, 'build must keep a public-hash to master-scene map');
assert.match(smoothScroll, /getMasterAnchorTarget/, 'smooth-scroll must resolve master anchors before measuring hash targets');
assert.match(smoothScroll, /homepage:anchor-navigation/, 'anchor navigation must notify transition runtime');
assert.match(runtime, /scrollYForTimelineVh/, 'runtime hash handling must use master timeline coordinates');

console.log('Homepage master hash navigation contract passed.');
```

- [ ] **Step 3: Add scripts without adding them to `verify:all` yet**

Modify `package.json`:

```json
"verify:homepage-master-takeover": "node scripts/check-homepage-master-takeover-contract.mjs",
"verify:homepage-master-hash-navigation": "node scripts/check-homepage-master-hash-navigation.mjs"
```

- [ ] **Step 4: Verify expected failure**

Run:

```bash
npm run verify:homepage-master-takeover
npm run verify:homepage-master-hash-navigation
```

Expected:

- takeover check fails on parallel runtime, salvage text, hidden stage, observer producers, HUD, old initializer gates, or missing master hash path.
- hash check may pass partially if current generated anchors exist, but must fail until smooth-scroll maps public hashes to master coordinates.

### Task 2: Hide HUD By Default

**Files:**

- Modify: `scripts/build-index.mjs`
- Modify: `css/components/homepage-continuity.css`
- Modify: `js/transitions/homepage-transition-runtime.js`
- Test: `scripts/check-homepage-master-takeover-contract.mjs`

- [ ] **Step 1: Gate generated HUD**

Change `buildMasterTimelineHud()` output so the `<aside>` starts hidden and inert:

```js
'    <aside data-master-timeline-hud hidden inert aria-hidden="true">',
```

Keep the existing child markup.

- [ ] **Step 2: Add debug CSS gate**

Add to `css/components/homepage-continuity.css`:

```css
[data-master-timeline-hud][hidden] {
  display: none !important;
}

html:not([data-debug-timeline="true"]) [data-master-timeline-hud] {
  display: none !important;
}

html[data-debug-timeline="true"] [data-master-timeline-hud] {
  display: block;
}
```

- [ ] **Step 3: Enable HUD only when requested**

In `createHomepageMasterRuntime()`, before querying HUD fields, add:

```js
const debugTimelineEnabled = new URLSearchParams(window.location.search).get('debug') === 'timeline'
  || document.documentElement.dataset.debugTimeline === 'true';

if (debugTimelineEnabled) {
  document.documentElement.dataset.debugTimeline = 'true';
}
```

After `const masterTimelineHud = root.querySelector('[data-master-timeline-hud]');`, add:

```js
if (masterTimelineHud && debugTimelineEnabled) {
  masterTimelineHud.hidden = false;
  masterTimelineHud.inert = false;
  masterTimelineHud.setAttribute('aria-hidden', 'false');
}
```

Change scrubber creation:

```js
const masterHudScrubber = debugTimelineEnabled ? createMasterHudScrubber() : null;
```

- [ ] **Step 4: Verify**

Run:

```bash
npm run build:page
npm run verify:homepage-master-takeover
```

Expected: takeover check still fails on runtime/producers/stage, but no longer fails on default HUD visibility.

### Task 3: Preserve Master Scroll Range And Prove Mobile Sticky First

**Files:**

- Modify: `scripts/build-index.mjs`
- Modify: `css/components/homepage-continuity.css`
- Modify: `js/transitions/homepage/master-scroll-map.js`
- Test: `scripts/check-homepage-master-track-structure.mjs`
- Test: `scripts/check-homepage-master-takeover-contract.mjs`

- [ ] **Step 1: Put sticky stage before spacer**

Modify `buildMasterScaffold()` so `[data-homepage-master-stage]` appears before `[data-homepage-master-scroll-spacer]`.

Use this order:

```js
return [
  `<div ${trackAttributes}>`,
  masterAnchors,
  '  <div data-homepage-master-stage>',
  '    <canvas data-master-ink-canvas aria-hidden="true"></canvas>',
  '    <div data-master-surface-layer aria-hidden="true">',
  surfaceCanvases,
  '    </div>',
  '    <div data-master-scene-layer>',
  '      <div data-master-scene-visual-layer>',
  visualRoots,
  '      </div>',
  '      <div data-master-copy-layer>',
  copyRoots,
  '      </div>',
  '    </div>',
  '  </div>',
  '  <div data-homepage-master-scroll-spacer aria-hidden="true"></div>',
  timelineHud,
  '</div>'
].join('\n');
```

- [ ] **Step 2: Give spacer the timeline height and stage stable viewport height**

Add or replace CSS:

```css
[data-homepage-master-track] {
  position: relative;
  min-height: calc(var(--homepage-master-track-vh, 1) * 1vh);
}

[data-homepage-master-scroll-spacer] {
  height: calc(var(--homepage-master-track-vh, 1) * 1vh);
  pointer-events: none;
}

html[data-master-dom-mode="master-visible"] [data-homepage-master-track] {
  position: relative;
  inset: auto;
  z-index: 130;
  width: 100%;
  height: auto;
  min-height: calc(var(--homepage-master-track-vh, 1) * 1vh);
  overflow: visible;
  opacity: 1;
  visibility: visible;
  pointer-events: none;
}

html[data-master-dom-mode="master-visible"] [data-homepage-master-stage] {
  position: sticky;
  top: 0;
  display: block;
  height: 100vh;
  min-height: 100vh;
  height: 100dvh;
  min-height: 100dvh;
  opacity: 1;
  visibility: visible;
}
```

Remove the existing `master-visible [data-homepage-master-track]` fixed/zero-height rule and the `master-visible [data-homepage-master-stage] display:none` rule.

- [ ] **Step 3: Use track geometry in master scroll map**

In `master-scroll-map.js`, remove the document scroll-height fallback and compute against the track:

```js
function refresh() {
  const viewportHeight = Math.max(1, Number(getViewportHeight()) || 1);
  track.style.setProperty(model.track.heightCssVariable, String(model.totalVh));
  const rect = track.getBoundingClientRect();
  state.startY = rect.top + window.scrollY;
  state.scrollablePx = Math.max(1, rect.height - viewportHeight);
  return { ...state, viewportHeight };
}
```

Keep `scrollYForTimelineVh()`. Do not introduce `scrollYForPosition()`.

- [ ] **Step 4: Add a mobile sticky CDP checkpoint**

Before implementation review, verify statically:

```bash
rg -n "100dvh|data-homepage-master-scroll-spacer|data-homepage-master-stage" css/components/homepage-continuity.css scripts/build-index.mjs
```

Expected:

- `100dvh` is present.
- stage appears before spacer in `buildMasterScaffold()`.
- spacer is a sibling after stage, not before it.

Then run a targeted Playwright/CDP geometry probe because sticky viewport behavior cannot be proven statically.

Terminal 1:

```bash
PORT=8093 npm run dev
```

Terminal 2:

```bash
node --input-type=module <<'NODE'
import { chromium } from 'playwright';

const browser = await chromium.launch();
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
];

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport });
  await page.goto('http://127.0.0.1:8093/', { waitUntil: 'networkidle' });
  const result = await page.evaluate(() => {
    const stage = document.querySelector('[data-homepage-master-stage]');
    const spacer = document.querySelector('[data-homepage-master-scroll-spacer]');
    const track = document.querySelector('[data-homepage-master-track]');
    const rect = stage?.getBoundingClientRect?.();
    return {
      stageVisible: Boolean(rect && rect.height > 100 && rect.bottom > 0 && rect.top < window.innerHeight),
      stageHeight: rect?.height || 0,
      stageTop: rect?.top || 0,
      stageBeforeSpacer: Boolean(stage && spacer && (stage.compareDocumentPosition(spacer) & Node.DOCUMENT_POSITION_FOLLOWING)),
      trackHeight: track?.getBoundingClientRect?.().height || 0,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight
    };
  });
  await page.close();

  if (!result.stageVisible) throw new Error(`${viewport.name}: master stage is not visible on first viewport`);
  if (!result.stageBeforeSpacer) throw new Error(`${viewport.name}: master stage must appear before spacer`);
  if (result.trackHeight <= result.viewportHeight * 2) throw new Error(`${viewport.name}: master track does not preserve scroll range`);
  if (result.scrollHeight <= result.viewportHeight * 2) throw new Error(`${viewport.name}: document scroll range collapsed`);
  console.log(viewport.name, result);
}

await browser.close();
NODE
```

Expected: both desktop and mobile report a visible first-viewport stage, stage-before-spacer order, and preserved scroll range.

- [ ] **Step 5: Verify**

Run:

```bash
npm run build:page
npm run verify:homepage-master-track-structure
npm run verify:homepage-master-takeover
```

Expected: existing track structure check may fail until Task 11 reverses salvage assertions. Takeover check should no longer fail on hidden stage, stage/spacer order, or missing `100dvh`.

### Task 4: Hide Legacy Visual Flow Only After Master Track Exists

**Files:**

- Modify: `css/components/homepage-continuity.css`
- Test: `scripts/check-homepage-master-takeover-contract.mjs`

- [ ] **Step 1: Keep legacy sections as anchors, not visible visual flow**

Add master-mode rules that leave public anchors measurable but remove visible legacy content only when the master track is present:

```css
html[data-master-dom-mode="master-visible"] .canvas-section,
html[data-master-dom-mode="master-visible"] .hero-wrap {
  min-height: 1px;
  height: 1px;
  overflow: clip;
  pointer-events: none;
}

html[data-master-dom-mode="master-visible"] .canvas-section > *,
html[data-master-dom-mode="master-visible"] .hero-wrap > * {
  visibility: hidden;
}

html[data-master-dom-mode="master-visible"] [data-homepage-master-stage] {
  pointer-events: auto;
}
```

Do not apply this before Task 3 is complete.

- [ ] **Step 2: Verify**

Run:

```bash
npm run build:page
npm run verify:homepage-master-takeover
```

Expected: takeover check still fails on producers/runtime, but no longer fails on visible stage/track basics.

### Task 5: Guard Legacy Adapters; Do Not Mount Adapters In Master Mode

**Files:**

- Modify: `js/transitions/homepage-transition-runtime.js`
- Modify: `js/transitions/pattern-bloom-adapter.js`
- Modify: `js/transitions/homepage/aod-homepage-adapter.js`
- Modify: `js/transitions/homepage/figure2-homepage-adapter.js`
- Modify: `js/transitions/homepage/figure3-homepage-adapter.js`
- Modify: `js/transitions/homepage/crane-homepage-adapter.js`
- Modify: `js/transitions/homepage/ttg-homepage-adapter.js`
- Modify: `js/transitions/homepage/ph-homepage-adapter.js`
- Test: `scripts/check-homepage-master-takeover-contract.mjs`

- [ ] **Step 1: Remove master adapter mounting from runtime**

In `createHomepageMasterRuntime()` keep producer mounting:

```js
await mountMasterSurfaceProducers();
masterSurfaceProducerRegistry.assertAllProducersMounted();
```

Delete the call to:

```js
await mountMasterHomepageAdapters();
```

Then delete `mountMasterHomepageAdapters()` entirely, including its legacy fallback factory logic.

- [ ] **Step 2: Add defensive guards to legacy adapter factories**

At the top of each legacy adapter mount function, add:

```js
if (document.documentElement.dataset.masterTimelineEnabled === 'true') {
  return {
    render() {},
    renderIdle() {},
    destroy() {}
  };
}
```

This guard prevents accidental legacy adapter startup in master mode, but it is not a master adapter path. Master visuals must come from producers.

- [ ] **Step 3: Verify**

Run:

```bash
npm run verify:homepage-master-takeover
```

Expected: takeover check no longer fails on adapter mounting. It should still fail on observer producers and runtime dispatch until later tasks.

### Task 6: Replace Observer Producers With Deterministic Smoke Producers

**Files:**

- Create: all producer files listed in Section 4
- Modify: `js/transitions/homepage-transition-registry.js`
- Test: `scripts/check-homepage-master-takeover-contract.mjs`

- [ ] **Step 1: Use the real producer contract**

Every producer receives this context from `master-surface-producer-registry.js`:

```js
{
  surfaceKey,
  timelineProgress,
  blockProgress,
  localProgress,
  sceneId,
  segmentId,
  state,
  texture,
  surfaceEntry
}
```

`prepareSurface(surfaceEntry)` returns a texture element, usually a canvas. Producer code must draw into `texture` when it is an `HTMLCanvasElement`.

- [ ] **Step 2: Add a common smoke drawing shape to each producer**

Each smoke producer may use a deterministic canvas fill only to prove the runtime pipe:

```js
function prepareCanvas(texture) {
  if (!(texture instanceof HTMLCanvasElement)) return null;
  const width = texture.clientWidth || texture.width || 1;
  const height = texture.clientHeight || texture.height || 1;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  texture.width = Math.max(1, Math.round(width * dpr));
  texture.height = Math.max(1, Math.round(height * dpr));
  const context = texture.getContext('2d');
  if (!context) return null;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

function markReady(surfaceEntry, texture) {
  surfaceEntry.element.dataset.masterSurfaceReady = 'true';
  if (texture?.dataset) texture.dataset.inkTextureReady = 'true';
}
```

- [ ] **Step 3: Register every non-paper family**

Register all of these as non-observer producers:

- `hero` -> `hero-surface-producer.js`
- `belief-star` -> `belief-star-surface-producer.js`
- `aod` -> `aod-surface-producer.js`
- `figure2` -> `figure2-surface-producer.js`
- `figure3` -> `figure3-surface-producer.js`
- `ttg` -> `ttg-surface-producer.js`
- `ph` -> `ph-surface-producer.js`
- `crane` -> `crane-surface-producer.js`

- [ ] **Step 4: Verify registry pipe only**

Run:

```bash
npm run build:page
npm run verify:homepage-master-takeover
```

Expected: takeover check no longer fails on observer producers. This is not a visual acceptance gate.

### Task 7: Replace Smoke Producers With Real Visual Producers

**Files:**

- Modify: all producer files from Task 6
- Create: `scripts/check-homepage-real-surface-assets.mjs`
- Modify: `package.json`
- Input: `output/playwright/homepage-main-diagnostic-baseline/manifest.json`

- [ ] **Step 0: Confirm main desktop diagnostic baseline exists**

Before touching real producers, verify Task 0 output exists:

```bash
test -f output/playwright/homepage-main-diagnostic-baseline/manifest.json
ls output/playwright/homepage-main-diagnostic-baseline/*.png
```

Expected: main desktop diagnostic manifest and screenshots are present. If they are missing, stop and run Task 0 before continuing.

- [ ] **Step 1: Add real-surface asset check**

Create `scripts/check-homepage-real-surface-assets.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const producers = [
  'js/transitions/homepage/hero-surface-producer.js',
  'js/transitions/homepage/belief-star-surface-producer.js',
  'js/transitions/homepage/aod-surface-producer.js',
  'js/transitions/homepage/figure2-surface-producer.js',
  'js/transitions/homepage/figure3-surface-producer.js',
  'js/transitions/homepage/ttg-surface-producer.js',
  'js/transitions/homepage/ph-surface-producer.js',
  'js/transitions/homepage/crane-surface-producer.js'
];

for (const path of producers) {
  const source = read(path);
  assert.doesNotMatch(source, /smoke|placeholder|test composite|fallback color/i, `${path} must not ship smoke-only drawing`);
  assert.match(source, /ImageBitmap|HTMLImageElement|HTMLVideoElement|drawImage|OffscreenCanvas|createPattern|masterSurfaceReady/, `${path} must draw or decode a real visual source`);
}

console.log('Homepage real surface asset contract passed.');
```

Add script:

```json
"verify:homepage-real-surface-assets": "node scripts/check-homepage-real-surface-assets.mjs"
```

- [ ] **Step 2: Migrate hero visual first**

`hero-surface-producer.js` must render a stable first frame and animated frame source equivalent to the legacy layered hero. Reuse existing hero assets/helpers where possible, but the visible output must be drawn into `home.visual`.

Acceptance for this producer:

- reduced-motion draws a static first frame;
- non-reduced-motion draws changing pixels over time;
- no legacy `.hero-content` visual layer is required for visible rendering.

- [ ] **Step 3: Migrate belief star visual**

`belief-star-surface-producer.js` must replace the visible starfield for both `belief.upper` and `belief.lower`.

Acceptance for this producer:

- the same `belief.star` texture can be sampled across hold and transition blocks;
- reduced-motion draws a static starfield frame;
- no legacy `initBeliefStarField()` output is needed in master mode.

- [ ] **Step 4: Migrate bridge visuals**

Replace smoke drawing in:

- `aod-surface-producer.js`
- `figure2-surface-producer.js`
- `figure3-surface-producer.js`
- `ttg-surface-producer.js`
- `ph-surface-producer.js`
- `crane-surface-producer.js`

Each producer must fail closed if its real visual source cannot be loaded. Do not silently draw a fallback color and mark ready.

- [ ] **Step 5: Verify real visual producers**

Run:

```bash
npm run build:page
npm run verify:homepage-real-surface-assets
```

Expected: all producers pass the static real-source check.

- [ ] **Step 6: Run targeted CDP surface probe**

Run this after real producers replace smoke producers. This catches blank canvases before the final audit.

Terminal 1:

```bash
PORT=8093 npm run dev
```

Terminal 2:

```bash
node --input-type=module <<'NODE'
import { chromium } from 'playwright';

function variance(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / Math.max(1, values.length);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:8093/', { waitUntil: 'networkidle' });

const samples = await page.evaluate(() => {
  return [...document.querySelectorAll('[data-master-surface]')].map((canvas) => {
    const context = canvas.getContext?.('2d');
    if (!context || !canvas.width || !canvas.height) {
      return { id: canvas.dataset.masterSurface, ready: false, alphaVariance: 0, brightnessVariance: 0 };
    }
    const width = Math.min(canvas.width, 64);
    const height = Math.min(canvas.height, 64);
    const data = context.getImageData(0, 0, width, height).data;
    const alpha = [];
    const brightness = [];
    for (let index = 0; index < data.length; index += 4) {
      alpha.push(data[index + 3]);
      brightness.push((data[index] + data[index + 1] + data[index + 2]) / 3);
    }
    const avg = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const variance = (values) => {
      const mean = avg(values);
      return values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / Math.max(1, values.length);
    };
    return {
      id: canvas.dataset.masterSurface,
      ready: canvas.dataset.inkTextureReady === 'true',
      alphaVariance: variance(alpha),
      brightnessVariance: variance(brightness)
    };
  });
});

await browser.close();

for (const sample of samples) {
  if (!sample.ready) throw new Error(`${sample.id}: surface is not marked ready`);
  if (sample.alphaVariance <= 0 || sample.brightnessVariance <= 0) {
    throw new Error(`${sample.id}: surface pixels are blank or flat`);
  }
}

console.log(samples);
NODE
```

Expected: every registered master surface is ready and has non-zero alpha and brightness variance. This still does not replace Task 13 fidelity screenshots.

- [ ] **Step 7: Run `belief.star` shared-surface CDP probe**

`belief.star` is the canary for cross-block continuity. It must stay one canonical surface and stay non-blank while moving through home/belief samples.

Terminal 1:

```bash
PORT=8093 npm run dev
```

Terminal 2:

```bash
node --input-type=module <<'NODE'
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:8093/', { waitUntil: 'networkidle' });

const sampleAt = async (label, y) => {
  await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
  await page.waitForTimeout(700);
  return page.evaluate((sampleLabel) => {
    const canvases = [...document.querySelectorAll('[data-master-surface="belief.star"]')];
    const canvas = canvases[0];
    const context = canvas?.getContext?.('2d');
    let alphaVariance = 0;
    let brightnessVariance = 0;

    if (context && canvas.width && canvas.height) {
      const width = Math.min(canvas.width, 64);
      const height = Math.min(canvas.height, 64);
      const data = context.getImageData(0, 0, width, height).data;
      const alpha = [];
      const brightness = [];
      for (let index = 0; index < data.length; index += 4) {
        alpha.push(data[index + 3]);
        brightness.push((data[index] + data[index + 1] + data[index + 2]) / 3);
      }
      const variance = (values) => {
        const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
        return values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / Math.max(1, values.length);
      };
      alphaVariance = variance(alpha);
      brightnessVariance = variance(brightness);
    }

    return {
      label: sampleLabel,
      surfaceCount: canvases.length,
      sameNode: canvas ? (window.__beliefStarSurfaceNode ? window.__beliefStarSurfaceNode === canvas : true) : false,
      ready: canvas?.dataset?.inkTextureReady === 'true',
      alphaVariance,
      brightnessVariance
    };
  }, label);
};

await page.evaluate(() => {
  window.__beliefStarSurfaceNode = document.querySelector('[data-master-surface="belief.star"]') || null;
});

const anchors = await page.evaluate(() => {
  const readAnchorY = (id) => {
    const node = document.querySelector(`[data-master-anchor="${id}"]`);
    return node ? Math.max(0, Math.round(window.scrollY + node.getBoundingClientRect().top)) : 0;
  };
  const home = readAnchorY('home');
  const belief = readAnchorY('belief');
  const viewport = window.innerHeight;
  return [
    { label: 'home-hold', y: home },
    { label: 'home-to-belief', y: Math.max(0, Math.round((home + belief) * 0.5)) },
    { label: 'belief-entry', y: belief },
    { label: 'belief-lower-probe', y: belief + Math.round(viewport * 1.4) }
  ];
});

const samples = [];
for (const anchor of anchors) {
  samples.push(await sampleAt(anchor.label, anchor.y));
}

await browser.close();

for (const sample of samples) {
  if (sample.surfaceCount !== 1) throw new Error(`${sample.label}: expected exactly one belief.star surface, got ${sample.surfaceCount}`);
  if (!sample.sameNode) throw new Error(`${sample.label}: belief.star canvas node was recreated`);
  if (!sample.ready) throw new Error(`${sample.label}: belief.star surface is not ready`);
  if (sample.alphaVariance <= 0 || sample.brightnessVariance <= 0) {
    throw new Error(`${sample.label}: belief.star surface is blank or flat`);
  }
}

console.log(samples);
NODE
```

Expected: every sample reports `surfaceCount: 1`, `sameNode: true`, `ready: true`, and non-zero alpha/brightness variance.

- [ ] **Step 8: Compare real producers against main desktop diagnostic baseline**

Open the Task 0 screenshots and the current Task 7 screenshots side by side. Use human review for fidelity:

```bash
open output/playwright/homepage-main-diagnostic-baseline
open output/playwright/homepage-directed-timeline-cdp
```

Acceptance:

- hero composition keeps the same major layers, focal hierarchy, and first-frame readability;
- belief star density, continuity, and fade behavior are recognizably equivalent;
- AOD, figure2, figure3, TTG, PH, and crane bridges preserve the legacy transition intent;
- no bridge is accepted only because its canvas has non-zero variance;
- if two reviewers cannot agree that the real producer is production-faithful, stop before Task 8 and choose Strategy B.

### Task 8: Move Master Copy Into The Master Stage

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/build-index.mjs`
- Modify: `css/components/homepage-continuity.css`
- Test: `scripts/check-copy-alignment.mjs`
- Test: `scripts/check-homepage-master-track-structure.mjs`

- [ ] **Step 1: Add `node-html-parser`**

Run:

```bash
npm install -D node-html-parser
```

Expected:

- `package.json` includes `node-html-parser` in `devDependencies`.
- `package-lock.json` is updated.

- [ ] **Step 2: Define selectors and strip list**

In `scripts/build-index.mjs`, add:

```js
import { parse } from 'node-html-parser';

const MASTER_COPY_SELECTORS = {
  home: '#home .hero-content',
  'belief.upper': '#belief .belief-upper-copy-wrap',
  'belief.lower': '#belief .belief-lower-copy-wrap',
  method: '#method .method-edition-layout--after-handoff',
  'method.proof': '#method .homepage-scene--method-proof',
  brand: '#brand .brand-definition-grid',
  services: '#services .enterprise-vertical-layout',
  lab: '#lab .scenario-wide-stage',
  education: '#education .education-vertical-layout',
  philosophy: '#philosophy .philosophy-list',
  contact: '#contact .contact-endpoint'
};

const PUBLIC_SECTION_IDS = new Set([
  'home',
  'belief',
  'method',
  'brand',
  'services',
  'lab',
  'education',
  'philosophy',
  'contact'
]);
```

- [ ] **Step 3: Build scaffold in two passes**

Change `injectContractAttributes()` so section IDs exist before copy extraction:

```js
function injectSectionAndTransitionAttributes(html) {
  let nextHtml = html;

  contentSections.forEach((section, index) => {
    nextHtml = injectSectionAttributes(nextHtml, section, index);
  });

  chapterTransitions.forEach((transition) => {
    nextHtml = injectTransitionAttributes(nextHtml, transition);
  });

  return injectTimelineAttributes(nextHtml);
}

function injectContractAttributes(html) {
  let nextHtml = html;

  nextHtml = injectHtmlMasterAttributes(nextHtml);
  nextHtml = injectSectionAndTransitionAttributes(nextHtml);
  nextHtml = injectHomepageMasterScaffold(nextHtml);
  nextHtml = injectBeliefStarMasterSurface(nextHtml);
  nextHtml = retireLegacyHomeAnchor(nextHtml);

  return nextHtml;
}
```

Do not call `buildMasterScaffold()` before `injectSectionAttributes()`.

- [ ] **Step 4: Extract copy with parser**

Implement:

```js
function stripPublicIds(html) {
  const root = parse(`<template>${html}</template>`);
  root.querySelectorAll('[id]').forEach((node) => {
    const id = node.getAttribute('id');
    if (PUBLIC_SECTION_IDS.has(id)) node.removeAttribute('id');
  });
  return root.querySelector('template')?.innerHTML || html;
}

function getMasterCopyHtml(sourceHtml, sceneId) {
  const selector = MASTER_COPY_SELECTORS[sceneId];
  if (!selector) return '';
  const root = parse(sourceHtml);
  const node = root.querySelector(selector);
  if (!node) {
    throw new Error(`Unable to extract master copy for ${sceneId} using selector ${selector}`);
  }
  return stripPublicIds(node.toString());
}
```

Update `buildMasterCopyRoot(scene, sourceHtml)`:

```js
const copyHtml = getMasterCopyHtml(sourceHtml, scene.id);
```

Then place `copyHtml` inside `[data-master-copy-root="true"]`.

- [ ] **Step 5: Verify selector-to-source mapping**

Run:

```bash
npm run build:page
npm run verify:copy
rg -n "data-master-copy-root|brand-definition-grid|hero-content|belief-upper-copy-wrap" index.html
```

Expected:

- build fails if any selector misses;
- `brand-definition-grid` is extracted from the built HTML after section attributes, regardless of partial source assumptions;
- public section IDs are not duplicated inside master copy roots.

### Task 9: Gate Old Visual Initializers In Master Mode

**Files:**

- Modify: `js/main.js`
- Modify: `js/sections/hero.js`
- Modify: `js/sections/belief.js`
- Test: `scripts/check-homepage-master-takeover-contract.mjs`

- [ ] **Step 1: Stop unconditional old visual initializers**

In `js/main.js`, call `initBeliefStarField`, `initLayeredHero`, and `initFallbackParallax` only when `!masterTimelineEnabled`.

Use this shape:

```js
root.dataset.masterVisualInitializers = masterTimelineEnabled ? 'master' : 'legacy';

if (!masterTimelineEnabled) {
  initBeliefStarField({ root: document, reduceMotion });
}
```

Inside the non-reduced-motion branch:

```js
if (!masterTimelineEnabled) {
  initLayeredHero({ root, body, runtime, reduceMotion });
}
```

Fallback branch:

```js
if (!masterTimelineEnabled) {
  initFallbackParallax({ root, reduceMotion, runtime });
}
```

- [ ] **Step 2: Add defensive guards**

At the top of exported visual initializer functions in `js/sections/hero.js` and `js/sections/belief.js`, return a no-op cleanup when master is enabled:

```js
if (document.documentElement.dataset.masterTimelineEnabled === 'true') {
  return { destroy() {} };
}
```

- [ ] **Step 3: Verify**

Run:

```bash
npm run build:page
npm run verify:homepage-master-takeover
```

Expected: takeover check no longer fails on old visual initializer gates.

### Task 10: Fix Public Hash Navigation For Master Coordinates

**Files:**

- Modify: `js/ui/smooth-scroll.js`
- Modify: `js/transitions/homepage-transition-runtime.js`
- Test: `scripts/check-homepage-master-hash-navigation.mjs`

- [ ] **Step 1: Resolve public hashes to master anchors in master-visible mode**

In `js/ui/smooth-scroll.js`, add:

```js
function getMasterAnchorTarget(targetId) {
  if (document.documentElement.dataset.masterDomMode !== 'master-visible') return null;
  if (!targetId) return null;
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(targetId)
    : String(targetId).replace(/"/g, '\\"');
  return document.querySelector(`[data-master-anchor="${escaped}"]`);
}
```

Change `getAnchorTarget(hash)`:

```js
function getAnchorTarget(hash) {
  const targetId = getAnchorTargetId(hash);
  return getMasterAnchorTarget(targetId) || document.getElementById(targetId);
}
```

- [ ] **Step 2: Keep public hash notification**

When anchor navigation dispatches `homepage:anchor-navigation`, keep `targetId` as the public ID:

```js
window.dispatchEvent(new CustomEvent('homepage:anchor-navigation', {
  detail: {
    hash: link.hash,
    targetId
  }
}));
```

- [ ] **Step 3: Use master scroll map for runtime alignment**

In `homepage-transition-runtime.js`, any handler for `homepage:anchor-navigation` or initial hash alignment must map public ID to a master anchor and call:

```js
const targetY = masterScrollMap.scrollYForTimelineVh(anchorVh);
```

Do not use `scrollYForPosition()`.

- [ ] **Step 4: Verify**

Run:

```bash
npm run build:page
npm run verify:homepage-master-hash-navigation
```

Expected: hash contract passes for public IDs and master anchor mapping.

- [ ] **Step 5: Run targeted CDP hash probe**

Terminal 1:

```bash
PORT=8093 npm run dev
```

Terminal 2:

```bash
node --input-type=module <<'NODE'
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

for (const hash of ['#belief', '#method', '#brand', '#services', '#contact']) {
  await page.goto(`http://127.0.0.1:8093/${hash}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const result = await page.evaluate((hashValue) => {
    const id = hashValue.slice(1);
    const publicAnchor = document.getElementById(id);
    const masterAnchor = document.querySelector(`[data-master-anchor="${id}"]`);
    const activeCopy = [...document.querySelectorAll('[data-master-copy-root="true"]')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.bottom > window.innerHeight * 0.2 && rect.top < window.innerHeight * 0.8;
      })
      .map((node) => node.dataset.masterCopyId || node.dataset.masterScene || '');
    return {
      hash: window.location.hash,
      hasPublicAnchor: Boolean(publicAnchor),
      hasMasterAnchor: Boolean(masterAnchor),
      scrollY: window.scrollY,
      activeCopy
    };
  }, hash);

  if (result.hash !== hash) throw new Error(`${hash}: location hash changed to ${result.hash}`);
  if (!result.hasPublicAnchor) throw new Error(`${hash}: public anchor missing`);
  if (!result.hasMasterAnchor) throw new Error(`${hash}: master anchor missing`);
  if (result.scrollY <= 0 && hash !== '#home') throw new Error(`${hash}: did not scroll into master timeline`);
  console.log(result);
}

await browser.close();
NODE
```

Expected: each public hash keeps its URL hash, retains a public semantic anchor, resolves a master anchor, and scrolls into the master timeline.

### Task 11: Make Master Runtime The Only Runtime When Enabled

**Files:**

- Modify: `js/transitions/homepage-transition-runtime.js`
- Test: `scripts/check-homepage-master-takeover-contract.mjs`

- [ ] **Step 1: Replace parallel runtime dispatch**

Change `initHomepageTransitions()` to:

```js
export async function initHomepageTransitions(options = {}) {
  const MASTER_TIMELINE_ENABLED = document.documentElement.dataset.masterTimelineEnabled === 'true';
  if (MASTER_TIMELINE_ENABLED) return initMasterHomepageTransitions(options);
  return initLegacyHomepageTransitions(options);
}
```

- [ ] **Step 2: Keep legacy as explicit fallback only**

Do not delete `initLegacyHomepageTransitions`. It remains for `MASTER_TIMELINE_ENABLED === false` and for Strategy B rollback.

- [ ] **Step 3: Verify**

Run:

```bash
npm run build:page
npm run verify:homepage-master-takeover
```

Expected: takeover check passes if earlier tasks are complete.

- [ ] **Step 4: Run targeted CDP single-runtime probe**

Terminal 1:

```bash
PORT=8093 npm run dev
```

Terminal 2:

```bash
node --input-type=module <<'NODE'
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:8093/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

const result = await page.evaluate(() => ({
  masterEnabled: document.documentElement.dataset.masterTimelineEnabled,
  visualInitializers: document.documentElement.dataset.masterVisualInitializers,
  stageVisible: (() => {
    const rect = document.querySelector('[data-homepage-master-stage]')?.getBoundingClientRect?.();
    return Boolean(rect && rect.height > 100 && rect.bottom > 0 && rect.top < window.innerHeight);
  })(),
  oldHeroVisible: Boolean(document.querySelector('.hero-wrap .layered-hero, .hero-wrap .hero-visual')),
  hudVisible: (() => {
    const hud = document.querySelector('[data-master-timeline-hud]');
    if (!hud) return false;
    const style = getComputedStyle(hud);
    return style.display !== 'none' && style.visibility !== 'hidden' && !hud.hidden;
  })()
}));

await browser.close();

if (result.masterEnabled !== 'true') throw new Error('master timeline is not enabled');
if (result.visualInitializers !== 'master') throw new Error('legacy visual initializers are not gated');
if (!result.stageVisible) throw new Error('master stage is not visible');
if (result.hudVisible) throw new Error('HUD is visible by default');
console.log(result);
NODE
```

Expected: master runtime is the visible owner, HUD is hidden, and old visual initializer state is not legacy.

### Task 12: Reverse Existing Static Checks And Audit Targets

**Files:**

- Modify: `scripts/check-homepage-master-timeline.mjs`
- Modify: `scripts/check-handoff-ownership.mjs`
- Modify: `scripts/check-homepage-master-track-structure.mjs`
- Modify: `scripts/check-homepage-visual-timeline-contract.mjs`
- Modify: `scripts/audit-homepage-directed-timeline-cdp.mjs`
- Modify: `package.json`

- [ ] **Step 1: Reverse salvage assertions**

Replace assertions that require:

- `real legacy visual flow`
- `initLegacyHomepageTransitions(options)` in master mode
- master stage hidden
- HUD visible
- observer producer registry
- real hero/long-canvas flow as visible path

with target-state assertions:

- master mode only starts `initMasterHomepageTransitions(options)`
- master stage visible
- HUD hidden unless debug flag enabled
- critical producers not observer
- legacy sections are semantic anchors, not visible flow
- master copy roots contain real text
- old visual initializers are gated in `main.js`
- public hashes map to master anchors

- [ ] **Step 2: Add new scripts to `verify:all`**

Add these scripts after existing homepage checks:

```json
"npm run verify:homepage-master-takeover && npm run verify:homepage-master-hash-navigation && npm run verify:homepage-real-surface-assets"
```

- [ ] **Step 3: Rewrite CDP structure assertion**

In `assertMasterStructure(sample)`, target:

```js
assert.equal(sample.hud.visible, false, `${sample.label}: master HUD must be hidden by default`);
assert.equal(sample.masterStage.visible, true, `${sample.label}: master stage must be visible`);
assert.ok(sample.masterStage.rect.height > 100, `${sample.label}: master stage must keep viewport height`);
assert.ok(sample.visibleMasterCopies.length > 0, `${sample.label}: master copy layer must contain visible text`);
```

Remove assertions requiring legacy hero/long-canvas visible height.

- [ ] **Step 4: Add strict pixel probes**

For each required bridge midpoint, sample the relevant `[data-master-surface]` canvas and `[data-master-ink-canvas]` pixels.

Pass only when:

- alpha variance is non-zero;
- brightness variance is non-zero;
- producer source is not marked smoke/fallback;
- target copy is visible when the manifest says it should be visible.

- [ ] **Step 5: Verify**

Run:

```bash
npm run build:page
npm run verify:all
```

Expected: all static checks pass after target-state reversal.

### Task 13: Final Browser Closure

**Files:**

- Modify: `scripts/audit-homepage-directed-timeline-cdp.mjs`
- Output: `output/playwright/homepage-directed-timeline-cdp/`

- [ ] **Step 1: Test required desktop bridges**

Run:

```bash
npm run audit:homepage-directed-timeline
```

Audit must cover forward and reverse midpoint frames for:

- `home-to-belief-upper`
- `belief-upper-to-belief-lower`
- `belief-lower-to-method`
- `method-proof-to-brand`
- `brand-to-services`
- `services-to-lab`
- `lab-to-education`
- `philosophy-to-contact`

- [ ] **Step 2: Add mobile viewport**

Add at least:

```js
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
];
```

Mobile assertions:

- sticky master stage is visible on first viewport;
- `100dvh` sizing does not create a blank gap;
- public hashes land on the expected master scene.

- [ ] **Step 3: Add reduced-motion audit**

Launch a second context with:

```js
reducedMotion: 'reduce'
```

Assert:

- no blank visible frame;
- no unbounded RAF leaks from old visual initializers;
- master producers draw static first frames;
- copy remains readable.

- [ ] **Step 4: Add direct hash audit**

Directly open:

- `/#belief`
- `/#method`
- `/#brand`
- `/#services`
- `/#contact`

Assert the public hash resolves to a legacy public ID for semantics and to the matching master anchor for timeline position.

- [ ] **Step 5: Add shared-surface audit**

Add explicit `belief.star` checks to the audit sample output:

```js
assert.equal(sample.beliefStar.surfaceCount, 1, `${sample.label}: belief.star must have one canonical surface`);
assert.equal(sample.beliefStar.sameNodeAcrossSamples, true, `${sample.label}: belief.star must not be recreated across belief blocks`);
assert.ok(sample.beliefStar.alphaVariance > 0, `${sample.label}: belief.star alpha variance must be non-zero`);
assert.ok(sample.beliefStar.brightnessVariance > 0, `${sample.label}: belief.star brightness variance must be non-zero`);
```

If the runtime exposes active surface ownership state, also assert that `belief.star` has one shared surface state and no duplicate competing owner state during:

- `home-to-belief-upper`
- `belief.upper`
- `belief-upper-to-belief-lower`
- `belief.lower`

- [ ] **Step 6: Add baseline comparison note to audit output**

Make the audit write a short comparison manifest:

```js
{
  "mainDesktopDiagnosticBaselineDir": "output/playwright/homepage-main-diagnostic-baseline",
  "currentAuditDir": "output/playwright/homepage-directed-timeline-cdp",
  "requiresHumanFidelityReview": true
}
```

This manifest is a review gate: the final audit can prove non-blank structure, but a human reviewer must compare the current screenshots to the Task 0 main desktop diagnostic baseline before Strategy A ships.

- [ ] **Step 7: Final command**

Run:

```bash
npm run build:page
npm run verify:all
npm run audit:homepage-directed-timeline
```

Expected:

- `verify:all` passes.
- audit passes desktop/mobile/reduced-motion/hash checks.
- output screenshots and `samples.json` show non-empty real master bridge frames.
- audit output references the main desktop diagnostic baseline directory for final fidelity review.

## 7. Rollback Boundaries

### Before Task 8

Rollback is limited to producers, HUD gating, scroll scaffold, and adapter guards. Revert the relevant commits and run:

```bash
npm run build:page
npm run verify:all
```

### After Task 8

Do not rely on flipping `MASTER_DOM_MODE` alone. Rollback must include:

- `scripts/build-index.mjs`
- `css/components/homepage-continuity.css`
- `js/ui/smooth-scroll.js`
- all reversed check scripts
- generated `index.html`

### After Task 11

Rollback must restore legacy dispatch and remove target-state checks from `verify:all` in the same commit. Do not leave a state where master is enabled, legacy is disabled, and producers/copy are incomplete.

### Honest Strategy B Commit

If Strategy B is chosen, make one explicit rollback commit that:

- keeps HUD hidden by default;
- restores legacy visual flow as production visible path;
- leaves master scaffold hidden/inert;
- removes target-state checks from `verify:all`;
- documents why real takeover stopped.

## 8. Final Acceptance Criteria

- `npm run verify:all` passes with target-state checks included.
- `npm run audit:homepage-directed-timeline` passes.
- Master enabled mode starts exactly one homepage visual runtime.
- No producer is `createObserverSurfaceProducer`.
- No smoke-only producer remains.
- Main desktop diagnostic baseline screenshots exist in `output/playwright/homepage-main-diagnostic-baseline/`.
- Real producer screenshots have been compared against the main desktop diagnostic baseline before Strategy A ships.
- HUD is hidden by default and works only with explicit `?debug=timeline`.
- Master stage is visible on first viewport and owns scene/copy/surface/ink layers.
- Master stage appears before the scroll spacer in generated HTML.
- Legacy sections are semantic/hash anchors, not the visible visual flow.
- Public hashes map to master timeline coordinates.
- Page keeps scroll range through the master track/spacer.
- Required bridges have non-empty real source surface, active ink frame, and visible target copy according to manifest policy.
- `belief.star` remains one canonical shared surface across home/belief transition blocks and never flashes blank during shared ownership.
- Mobile, reduced-motion, and direct-hash entry do not produce blank or duplicate scenes.
- Legacy adapters and old visual initializers do not run in master mode.

## 9. Execution Handoff

Recommended execution mode:

1. Use subagent-driven development, one task per worker.
2. Review after each task before starting the next.
3. Commit after each task with the task number in the message.
4. Run targeted Playwright/CDP when a task asks for it or when static checks cannot prove the behavior under review.
5. Capture Task 0 main desktop diagnostic baselines before visible-flow edits.
6. Stop after Task 7 if real visual producer fidelity is not good enough against the Task 0 main desktop diagnostic baseline; choose Strategy B rather than shipping smoke visuals.

Suggested commit sequence:

```bash
git commit -m "test: capture homepage legacy visual baselines"
git commit -m "test: add homepage master takeover contracts"
git commit -m "fix: hide master timeline HUD by default"
git commit -m "fix: preserve master timeline scroll range"
git commit -m "fix: keep legacy flow semantic in master mode"
git commit -m "fix: guard legacy homepage adapters in master mode"
git commit -m "feat: add homepage master smoke producers"
git commit -m "feat: replace homepage smoke producers with real visuals"
git commit -m "feat: move homepage copy into master stage"
git commit -m "fix: gate legacy homepage visual initializers"
git commit -m "fix: map homepage hashes to master timeline"
git commit -m "feat: make master homepage runtime authoritative"
git commit -m "test: reverse homepage master verification gates"
git commit -m "test: close homepage master visual audit"
```
