# Shopify Section Transition Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a low-risk, Shopify-inspired section and transition metadata contract without changing visible copy, flat editorial styling, or runtime animation behavior.

**Architecture:** Phase 1 is build-time only: add a manifest, inject stable `data-section-*` attributes, keep backward-compatible `data-transition="id"` values, add new transition metadata fields, delete stale transition selector blocks without replacing them, and verify the contract. Phase 2 is deferred until a real non-`soft-divider` transition is ready; it will add section-sync, transition registry, and ink module wrappers with explicit runtime safeguards.

**Tech Stack:** Static HTML build via `scripts/build-index.mjs`, existing `src/partials` and `src/sections`, existing CSS under `css/sections`, existing verification scripts, Vanilla ES modules for future Phase 2 only.

---

## Review-Driven Corrections

This revision fixes the risks found in the review:

- Keep `scripts/check-scroll-modules.mjs` compatible in Phase 1 by not removing current template section includes, current nav HTML, or the current `reveal.js` hard-coded section list.
- Keep `data-transition="${id}"` as the legacy value and add `data-transition-id`, `data-transition-from`, `data-transition-to`, `data-transition-module`, and `data-transition-variant` as additive fields.
- Patch `scripts/build-index.mjs` minimally instead of replacing the whole file; preserve unrelated build behavior.
- Match transition opening tags by class and legacy id, then add metadata without dropping existing classes or attributes.
- Verify the contract by node count, order, uniqueness, stale ids, and DOM placement, not only by global string presence.
- Split work into two phases. Phase 1 is safe to execute now; Phase 2 is a separate runtime migration.
- Do not emit per-frame runtime progress events in Phase 1.
- Do not replace stale CSS selectors with currently matching selectors in Phase 1; that would change visible transition gap styling.
- Add a manual QA gate because this plan does not use Playwright.
- Account for the dirty worktree: no `git add -A`, no broad commits, no push unless explicitly requested during execution.

## Phase Boundaries

### Phase 1: Safe Contract Injection

Phase 1 may be implemented now. It changes generated metadata and verification only:

- Add `src/section-manifest.mjs`.
- Keep `src/index.template.html` section includes as they are.
- Keep `src/partials/nav.html` as it is.
- Minimally patch `scripts/build-index.mjs` to post-process generated HTML immediately before `writeFile()`.
- Preserve existing include rendering, safety checks, trim behavior, logging, and any unrelated future build behavior.
- Keep legacy `data-transition="method-brand"` style values.
- Preserve existing chapter-transition classes and attributes while adding metadata.
- Delete stale CSS transition selector blocks that reference transition ids not present in the generated page; do not add replacement visual selectors.
- Add `scripts/check-section-transition-contract.mjs`.
- Add `npm run verify:section-transitions`.
- Run existing verification scripts, including `npm run verify:scroll-modules`.

### Phase 1 Execution Slices

- Phase 1A: add `src/section-manifest.mjs` and minimally patch `scripts/build-index.mjs`.
- Phase 1B: delete stale transition selector blocks, then add the contract verifier that proves stale ids are absent from generated HTML and source template.
- Phase 1C: run full verification and manual QA, then commit only the listed Phase 1 files.

### Phase 2: Deferred Runtime Module System

Do not implement Phase 2 while executing Phase 1. Start Phase 2 only after a specific non-`soft-divider` transition needs to be attached to at least one chapter pair.

Phase 2 will add:

- `js/sections/section-sync.js`
- `js/transitions/registry.js`
- `js/transitions/soft-divider.js`
- `js/transitions/ink-curtain.js`
- `css/transitions/chapter-transition.css`

Phase 2 must satisfy the runtime safeguards listed near the end of this plan before implementation begins.

## File Structure

Phase 1 files:

- Create `src/section-manifest.mjs`
  - Single source of truth for post-hero section ids, match hints, nav metadata, and transition metadata.
- Modify `scripts/build-index.mjs`
  - Keep normal partial rendering.
  - After rendering, inject section and transition attributes into the generated HTML immediately before `writeFile()`.
  - Do not replace the whole file unless the current file still exactly matches the simple include-renderer baseline.
  - Preserve unrelated existing behavior if the file has changed since this plan was written.
- Modify `css/sections/canvas-stage.css`
  - Delete stale transition selector blocks; Phase 1 must not add new visual transition selectors.
- Create `scripts/check-section-transition-contract.mjs`
  - Verifies generated section attributes, transition attributes, legacy transition values, count/order uniqueness, DOM placement, module names, and stale selector removal.
- Modify `package.json`
  - Adds `verify:section-transitions`.
- Modify `index.html`
  - Generated output from `npm run build:page`.

Files intentionally untouched in Phase 1:

- `src/index.template.html`
- `src/partials/nav.html`
- `js/main.js`
- `js/ui/reveal.js`
- `js/sections/hero.js`
- `js/effects/ink-scene-transition.js`

## Task 0: Dirty Worktree Preflight

**Files:**
- Read-only check: repository status

- [ ] **Step 1: Inspect branch and dirty files**

Run:

```bash
git status --short --branch
```

Expected: output may include existing dirty files. Record which files are unrelated to Phase 1. Do not stage unrelated files.

- [ ] **Step 2: Enforce the build-input hard gate**

Run:

```bash
git status --short -- src/index.template.html src/partials src/sections index.html
```

Expected before starting Phase 1:

```txt
```

If this command prints any path, stop before Task 1. Continue only after one of these happens:

```txt
Option A: the existing build-input and index.html changes are checkpointed in a separate commit before Phase 1.
Option B: the user explicitly says these existing build-input and index.html changes are in scope for the Phase 1 contract commit.
Option C: the executor commits only non-index Phase 1 files, then uses git add -p index.html and stages only hunks that add data-section-* or data-transition-* attributes.
```

This is a hard gate because `npm run build:page` regenerates `index.html` from dirty `src/sections/*.html` inputs.

- [ ] **Step 3: Confirm this plan file exists in the repository**

Run:

```bash
test -f docs/superpowers/plans/2026-06-19-shopify-section-transition-contract.md
```

Expected: command exits successfully with no output.

If the command fails, save this plan to `docs/superpowers/plans/2026-06-19-shopify-section-transition-contract.md` before Task 1. Task 7 stages that exact file path, so the path must exist before implementation begins.

- [ ] **Step 4: Check whitespace before editing**

Run:

```bash
git diff --check
```

Expected: either no output, or existing whitespace errors that must be recorded before Phase 1 edits. If existing errors appear outside Phase 1 files, do not fix them in this plan.

- [ ] **Step 5: Confirm selective staging rule**

Use this staging rule throughout this plan:

```bash
git add src/section-manifest.mjs scripts/build-index.mjs css/sections/canvas-stage.css scripts/check-section-transition-contract.mjs package.json index.html docs/superpowers/plans/2026-06-19-shopify-section-transition-contract.md
```

Expected: only Phase 1 files are staged. Do not run `git add -A`.

## Task 1: Add Phase 1 Section Manifest

**Files:**
- Create: `src/section-manifest.mjs`

- [ ] **Step 1: Create the manifest**

Create `src/section-manifest.mjs` with this complete content:

```js
export const contentSections = [
  {
    id: 'method',
    match: 'id="method"',
    navLabel: '方法',
    includeInNav: true,
    theme: 'dark',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'brand',
    match: 'canvas-section--brand',
    navLabel: '',
    includeInNav: false,
    theme: 'dark',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'services',
    match: 'id="services"',
    navLabel: '场景',
    includeInNav: true,
    theme: 'dark',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'lab',
    match: 'id="lab"',
    navLabel: '',
    includeInNav: false,
    theme: 'dark',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'education',
    match: 'id="education"',
    navLabel: '留学',
    includeInNav: true,
    theme: 'dark',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'philosophy',
    match: 'id="philosophy"',
    navLabel: '',
    includeInNav: false,
    theme: 'dark',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'contact',
    match: 'id="contact"',
    navLabel: '联系',
    includeInNav: true,
    theme: 'dark',
    navBg: 'solid',
    layout: 'editorial-flat'
  }
];

export const chapterTransitions = [
  {
    id: 'method-brand',
    from: 'method',
    to: 'brand',
    module: 'soft-divider',
    variant: 'fine-rule'
  },
  {
    id: 'brand-services',
    from: 'brand',
    to: 'services',
    module: 'soft-divider',
    variant: 'breath'
  },
  {
    id: 'services-lab',
    from: 'services',
    to: 'lab',
    module: 'soft-divider',
    variant: 'breath'
  },
  {
    id: 'lab-education',
    from: 'lab',
    to: 'education',
    module: 'soft-divider',
    variant: 'fine-rule'
  },
  {
    id: 'education-philosophy',
    from: 'education',
    to: 'philosophy',
    module: 'soft-divider',
    variant: 'breath'
  },
  {
    id: 'philosophy-contact',
    from: 'philosophy',
    to: 'contact',
    module: 'soft-divider',
    variant: 'fine-rule'
  }
];

export const executableTransitionModules = ['soft-divider'];
```

- [ ] **Step 2: Run manifest syntax check**

Run:

```bash
node --check src/section-manifest.mjs
```

Expected:

```txt
```

## Task 2: Inject Metadata Without Rewriting Template Structure

**Files:**
- Modify: `scripts/build-index.mjs`
- Generated: `index.html`

- [ ] **Step 1: Import the manifest without changing existing build setup**

In `scripts/build-index.mjs`, add this import after the existing Node imports:

```js
import { chapterTransitions, contentSections } from '../src/section-manifest.mjs';
```

Do not remove or reorder the existing `rootDir`, `srcDir`, `includePattern`, `resolveSourcePath()`, or `renderFile()` logic.

- [ ] **Step 2: Add metadata injection helpers**

In `scripts/build-index.mjs`, add this block after `resolveSourcePath()`:

```js
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getAttribute(attrs, name) {
  const match = attrs.match(new RegExp(`\\s${escapeRegExp(name)}="([^"]*)"`));
  return match?.[1] ?? null;
}

function hasClass(attrs, className) {
  return (getAttribute(attrs, 'class') || '').split(/\s+/).includes(className);
}

function setAttribute(attrs, name, value) {
  const escapedValue = escapeHtml(value);
  const pattern = new RegExp(`\\s${escapeRegExp(name)}="[^"]*"`);
  if (pattern.test(attrs)) {
    return attrs.replace(pattern, ` ${name}="${escapedValue}"`);
  }
  return `${attrs} ${name}="${escapedValue}"`;
}

function injectSectionAttributes(html, section, index) {
  const sectionOpenPattern = /<section\b[^>]*>/g;
  let didInject = false;

  const nextHtml = html.replace(sectionOpenPattern, (tag) => {
    if (didInject || !tag.includes(section.match)) return tag;

    let attrs = tag.slice('<section'.length, -1);
    attrs = setAttribute(attrs, 'id', section.id);
    attrs = setAttribute(attrs, 'data-section-id', section.id);
    attrs = setAttribute(attrs, 'data-section-index', index);
    attrs = setAttribute(attrs, 'data-section-theme', section.theme);
    attrs = setAttribute(attrs, 'data-section-nav-bg', section.navBg);
    attrs = setAttribute(attrs, 'data-section-layout', section.layout);
    didInject = true;
    return `<section${attrs}>`;
  });

  if (!didInject) {
    throw new Error(`Unable to inject section metadata for ${section.id} using match ${section.match}`);
  }

  return nextHtml;
}

function injectTransitionAttributes(html, transition) {
  const divOpenPattern = /<div\b[^>]*>/g;
  let didInject = false;

  const nextHtml = html.replace(divOpenPattern, (tag) => {
    if (didInject) return tag;

    let attrs = tag.slice('<div'.length, -1);
    if (!hasClass(attrs, 'chapter-transition')) return tag;
    if (getAttribute(attrs, 'data-transition') !== transition.id) return tag;

    attrs = setAttribute(attrs, 'data-transition', transition.id);
    attrs = setAttribute(attrs, 'data-transition-id', transition.id);
    attrs = setAttribute(attrs, 'data-transition-from', transition.from);
    attrs = setAttribute(attrs, 'data-transition-to', transition.to);
    attrs = setAttribute(attrs, 'data-transition-module', transition.module);
    attrs = setAttribute(attrs, 'data-transition-variant', transition.variant);

    didInject = true;
    return `<div${attrs}>`;
  });

  if (!didInject) {
    throw new Error(`Unable to find transition ${transition.id}`);
  }

  return nextHtml;
}

function injectContractAttributes(html) {
  let nextHtml = html;

  contentSections.forEach((section, index) => {
    nextHtml = injectSectionAttributes(nextHtml, section, index);
  });

  chapterTransitions.forEach((transition) => {
    nextHtml = injectTransitionAttributes(nextHtml, transition);
  });

  return nextHtml;
}
```

- [ ] **Step 3: Apply metadata injection immediately before writing `index.html`**

At the bottom of `scripts/build-index.mjs`, replace only this line:

```js
const html = await renderFile('index.template.html');
```

with this line:

```js
const html = injectContractAttributes(await renderFile('index.template.html'));
```

Leave the existing `writeFile()` call and `console.log('Built index.html from src/index.template.html')` behavior unchanged.

If `scripts/build-index.mjs` has gained unrelated build behavior since this plan was written, preserve that behavior and apply `injectContractAttributes()` to the fully rendered HTML immediately before `writeFile()`.

- [ ] **Step 4: Run build script syntax check**

Run:

```bash
node --check scripts/build-index.mjs
```

Expected:

```txt
```

- [ ] **Step 5: Rebuild generated HTML**

Run:

```bash
npm run build:page
```

Expected:

Output includes final line: `Built index.html from src/index.template.html`

- [ ] **Step 6: Confirm backward-compatible transition values**

Run:

```bash
rg -n "data-transition=\"method-brand\"|data-transition-id=\"method-brand\"|data-transition-from=\"method\"|data-transition-to=\"brand\"" index.html
```

Expected: one generated transition line containing all four attributes.

- [ ] **Step 7: Confirm transition attributes were added without dropping existing attributes**

Run:

```bash
node -e "const html=require('fs').readFileSync('index.html','utf8'); const tag=html.match(/<div\\b[^>]*data-transition=\"method-brand\"[^>]*>/)?.[0]; if (!tag || !tag.includes('aria-hidden=\"true\"') || !tag.includes('data-transition-id=\"method-brand\"')) process.exit(1); console.log(tag);"
```

Expected: one generated transition opening tag. The `aria-hidden="true"` attribute remains present, proving the build patch preserved existing attributes instead of recreating the transition div from scratch.

- [ ] **Step 8: Confirm current template and nav remain compatible with old verification**

Run:

```bash
rg -n "\\{\\{> sections/method.html\\}\\}|href=\"#services\">场景</a>|const sections = \\['method', 'services', 'education', 'contact'\\]" src/index.template.html src/partials/nav.html js/ui/reveal.js
```

Expected:

```txt
src/index.template.html:...{{> sections/method.html}}
src/partials/nav.html:...href="#services">场景</a>
js/ui/reveal.js:...const sections = ['method', 'services', 'education', 'contact'];
```

## Task 3: Delete Stale Transition Selectors Without Visual Replacement

**Files:**
- Modify: `css/sections/canvas-stage.css`

- [ ] **Step 1: Delete stale selector blocks**

In `css/sections/canvas-stage.css`, delete this full block:

```css
.chapter-transition[data-transition="enterprise-scenario"] {
  background: linear-gradient(180deg, rgba(8,16,13,0), rgba(5,8,7,.34), rgba(5,8,7,0));
}

.chapter-transition[data-transition="education-contact"] {
  height: clamp(34svh, 40vw, 62svh);
}
```

Do not add replacement selectors for `method-brand`, `brand-services`, `services-lab`, `lab-education`, `education-philosophy`, or `philosophy-contact` in Phase 1. This keeps Phase 1 metadata-only and avoids visible gap styling changes.

- [ ] **Step 2: Verify stale selectors are gone**

Run:

```bash
rg -n "enterprise-scenario|education-contact" css/sections/canvas-stage.css
```

Expected:

```txt
```

- [ ] **Step 3: Rebuild generated HTML**

Run:

```bash
npm run build:page
```

Expected:

Output includes final line: `Built index.html from src/index.template.html`

## Task 4: Add Contract Verification Without Breaking Old Verification

**Files:**
- Create: `scripts/check-section-transition-contract.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create the verification script**

Create `scripts/check-section-transition-contract.mjs` with this complete content:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterTransitions, contentSections, executableTransitionModules } from '../src/section-manifest.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const indexHtml = read('index.html');
const templateHtml = read('src/index.template.html');
const navHtml = read('src/partials/nav.html');
const revealJs = read('js/ui/reveal.js');
const canvasCss = read('css/sections/canvas-stage.css');
const packageJson = JSON.parse(read('package.json'));

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message);
}

function assertUnique(values, label) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  assert.equal(
    duplicates.length,
    0,
    `${label} must be unique; duplicates: ${[...new Set(duplicates)].join(', ')}`
  );
}

function assertNoStaleTransitionIds(source, label) {
  assert.doesNotMatch(
    source,
    /data-transition(?:-id)?="(?:enterprise-scenario|education-contact)"/,
    `${label} must not contain stale transition ids`
  );
}

function parseAttributes(tag) {
  const attrs = new Map();
  const attrPattern = /\s([A-Za-z0-9:_-]+)(?:="([^"]*)")?/g;
  for (const match of tag.matchAll(attrPattern)) {
    attrs.set(match[1], match[2] ?? '');
  }
  return attrs;
}

const sectionTags = [...indexHtml.matchAll(/<section\b[^>]*>/g)]
  .map((match) => ({ tag: match[0], index: match.index ?? -1, attrs: parseAttributes(match[0]) }));

const transitionTags = [...indexHtml.matchAll(/<div\b[^>]*>/g)]
  .map((match) => ({ tag: match[0], index: match.index ?? -1, attrs: parseAttributes(match[0]) }))
  .filter((node) => (node.attrs.get('class') || '').split(/\s+/).includes('chapter-transition'));

const manifestSectionIds = contentSections.map((section) => section.id);
const generatedSectionTags = sectionTags.filter((node) => node.attrs.has('data-section-id'));
const generatedSectionIds = generatedSectionTags.map((node) => node.attrs.get('data-section-id'));

assertUnique(manifestSectionIds, 'Manifest section ids');
assertUnique(generatedSectionIds, 'Generated section ids');
assert.equal(generatedSectionTags.length, contentSections.length, 'Generated section count must match manifest');
assert.deepEqual(generatedSectionIds, manifestSectionIds, 'Generated section order must match manifest');

const sectionPositions = new Map(
  generatedSectionTags.map((node) => [node.attrs.get('data-section-id'), node.index])
);

for (const [index, section] of contentSections.entries()) {
  const node = generatedSectionTags.find((candidate) => candidate.attrs.get('data-section-id') === section.id);
  assert.ok(node, `Missing section node for ${section.id}`);
  assert.equal(node.attrs.get('id'), section.id, `Section ${section.id} has incorrect id`);
  assert.equal(node.attrs.get('data-section-index'), String(index), `Section ${section.id} has incorrect data-section-index`);
  assert.equal(node.attrs.get('data-section-theme'), section.theme, `Section ${section.id} has incorrect data-section-theme`);
  assert.equal(node.attrs.get('data-section-nav-bg'), section.navBg, `Section ${section.id} has incorrect data-section-nav-bg`);
  assert.equal(node.attrs.get('data-section-layout'), section.layout, `Section ${section.id} has incorrect data-section-layout`);
}

const sectionIds = new Set(contentSections.map((section) => section.id));
const manifestTransitionIds = chapterTransitions.map((transition) => transition.id);
const generatedTransitionIds = transitionTags.map((node) => node.attrs.get('data-transition-id'));

assertUnique(manifestTransitionIds, 'Manifest transition ids');
assertUnique(generatedTransitionIds, 'Generated transition ids');
assert.equal(transitionTags.length, chapterTransitions.length, 'Generated transition count must match manifest');
assert.deepEqual(generatedTransitionIds, manifestTransitionIds, 'Generated transition order must match manifest');

for (const [index, transition] of chapterTransitions.entries()) {
  assert.ok(sectionIds.has(transition.from), `Transition ${transition.id} has unknown from section ${transition.from}`);
  assert.ok(sectionIds.has(transition.to), `Transition ${transition.id} has unknown to section ${transition.to}`);
  assert.ok(executableTransitionModules.includes(transition.module), `Transition ${transition.id} uses non-Phase-1 module ${transition.module}`);
  const node = transitionTags[index];
  assert.ok(node, `Missing transition node for ${transition.id}`);
  assert.equal(node.attrs.get('data-transition-id'), transition.id, `Transition ${transition.id} has incorrect data-transition-id`);
  assert.equal(node.attrs.get('data-transition'), transition.id, `Transition ${transition.id} must keep legacy data-transition value`);
  assert.equal(node.attrs.get('data-transition-from'), transition.from, `Transition ${transition.id} has incorrect from`);
  assert.equal(node.attrs.get('data-transition-to'), transition.to, `Transition ${transition.id} has incorrect to`);
  assert.equal(node.attrs.get('data-transition-module'), transition.module, `Transition ${transition.id} has incorrect module`);
  assert.equal(node.attrs.get('data-transition-variant'), transition.variant, `Transition ${transition.id} has incorrect variant`);

  const fromPosition = sectionPositions.get(transition.from);
  const toPosition = sectionPositions.get(transition.to);
  assert.ok(
    fromPosition < node.index && node.index < toPosition,
    `Transition ${transition.id} must sit between ${transition.from} and ${transition.to} in DOM order`
  );
}

assertIncludes(templateHtml, '{{> sections/method.html}}', 'Phase 1 must keep template section includes for scroll verifier compatibility');
assertIncludes(navHtml, 'href="#services">场景</a>', 'Phase 1 must keep current nav HTML for scroll verifier compatibility');
assertIncludes(revealJs, "const sections = ['method', 'services', 'education', 'contact'];", 'Phase 1 must keep current reveal nav state for scroll verifier compatibility');
assertNoStaleTransitionIds(indexHtml, 'index.html');
assertNoStaleTransitionIds(templateHtml, 'src/index.template.html');
assert.doesNotMatch(canvasCss, /enterprise-scenario|education-contact/, 'canvas-stage.css must not contain stale transition selectors');
assert.equal(packageJson.scripts['verify:section-transitions'], 'node scripts/check-section-transition-contract.mjs');

console.log('Section transition contract looks good.');
```

- [ ] **Step 2: Add the package script**

In `package.json`, update the `scripts` object so it contains this entry:

```json
"verify:section-transitions": "node scripts/check-section-transition-contract.mjs"
```

Expected `scripts` object after the edit:

```json
{
  "build:page": "node scripts/build-index.mjs",
  "verify:copy": "node scripts/check-copy-alignment.mjs",
  "dev": "node scripts/serve-static-site.mjs",
  "dev:web": "node scripts/serve-static-site.mjs",
  "verify:ink-modules": "node scripts/check-ink-modules.mjs",
  "verify:scroll-modules": "node scripts/check-scroll-modules.mjs",
  "verify:section-transitions": "node scripts/check-section-transition-contract.mjs"
}
```

- [ ] **Step 3: Run verification script syntax check**

Run:

```bash
node --check scripts/check-section-transition-contract.mjs
```

Expected:

```txt
```

- [ ] **Step 4: Run the new verification**

Run:

```bash
npm run verify:section-transitions
```

Expected: output includes final line `Section transition contract looks good.`

## Task 5: Phase 1 Full Verification

**Files:**
- Verify generated output and existing static checks.

- [ ] **Step 1: Rebuild generated page**

Run:

```bash
npm run build:page
```

Expected: output includes final line `Built index.html from src/index.template.html`

- [ ] **Step 2: Run syntax checks**

Run:

```bash
node --check scripts/build-index.mjs
node --check src/section-manifest.mjs
node --check scripts/check-section-transition-contract.mjs
```

Expected:

```txt
```

- [ ] **Step 3: Run existing verification scripts**

Run:

```bash
npm run verify:copy
npm run verify:ink-modules
npm run verify:scroll-modules
```

Expected: output includes these final lines:

```txt
Copy aligns with /Users/aitoshuu/Downloads/tongyeme/index.html.
Ink module structure looks good.
Scroll integration structure looks good.
```

- [ ] **Step 4: Run new contract verification**

Run:

```bash
npm run verify:section-transitions
```

Expected: output includes final line `Section transition contract looks good.`

- [ ] **Step 5: Check whitespace errors from Phase 1 files**

Run:

```bash
git diff --check -- src/section-manifest.mjs scripts/build-index.mjs css/sections/canvas-stage.css scripts/check-section-transition-contract.mjs package.json index.html
```

Expected:

```txt
```

## Task 6: Manual QA Gate

**Files:**
- Manual browser inspection only

- [ ] **Step 1: Start the static dev server only if one is not already running**

Run:

```bash
npm run dev
```

Expected: server prints a local URL. If another process already serves the site, use the existing URL and do not start a second server.

- [ ] **Step 2: Desktop QA at 1440px or wider**

Open the generated site and check:

```txt
- Hero still loads.
- Method, brand, services, lab, education, philosophy, and contact remain in the same order.
- No section turns into a card, glass block, or bordered container.
- Chapter gaps keep the same visual role as before Phase 1.
- Top nav links still jump to method, services, education, and contact.
- The services nav label still displays 场景.
```

Expected: all checks pass.

- [ ] **Step 3: Mobile-width QA**

Resize browser to a narrow viewport and check:

```txt
- No horizontal overflow.
- Long Chinese headings do not collapse into unwanted vertical columns.
- Transition gaps do not create blank dead zones larger than before Phase 1.
- Hash navigation lands near the intended section.
```

Expected: all checks pass.

- [ ] **Step 4: Reduced-motion QA**

Enable reduced motion in the browser or operating system and reload the page. Check:

```txt
- Page remains readable.
- Existing loader and hero fallback behavior still complete.
- Contract attributes do not affect visible content.
```

Expected: all checks pass.

- [ ] **Step 5: CDN fallback QA**

Temporarily block animation CDN requests using the browser network panel or disconnect network after the page shell loads. Check:

```txt
- The existing fallback path still displays content.
- No new Phase 1 runtime error appears in console from section contract code.
```

Expected: all checks pass because Phase 1 adds no new browser runtime.

## Task 7: Phase 1 Commit

**Files:**
- Stage only Phase 1 files.

- [ ] **Step 1: Inspect final status**

Run:

```bash
git status --short --branch
```

Expected: dirty worktree may include unrelated files. Only Phase 1 files should be staged in the next step.

- [ ] **Step 2: Stage exact Phase 1 files**

Run:

```bash
git add src/section-manifest.mjs scripts/build-index.mjs css/sections/canvas-stage.css scripts/check-section-transition-contract.mjs package.json index.html docs/superpowers/plans/2026-06-19-shopify-section-transition-contract.md
```

Expected: only listed files are staged.

- [ ] **Step 3: Confirm staged files**

Run:

```bash
git diff --cached --name-only
```

Expected output:

```txt
css/sections/canvas-stage.css
docs/superpowers/plans/2026-06-19-shopify-section-transition-contract.md
index.html
package.json
scripts/build-index.mjs
scripts/check-section-transition-contract.mjs
src/section-manifest.mjs
```

- [ ] **Step 4: Commit Phase 1**

Run:

```bash
git commit -m "feat: add section transition metadata contract"
```

Expected: commit succeeds.

- [ ] **Step 5: Push only when requested**

Do not push as part of this plan unless the current user request explicitly asks for push. If push is requested, run:

```bash
git push
```

Expected: current branch pushes to its remote tracking branch.

## Phase 2 Runtime Safeguards

Before implementing Phase 2, update this plan or create a separate plan that includes concrete code for these safeguards:

- `section-sync` must use `requestAnimationFrame` batching and must not dispatch all transition progress events on every raw scroll event.
- `section-sync` must dispatch progress only when a transition is active or when progress changes by at least `0.002`.
- The transition registry must attach the progress listener before dynamic imports resolve and must replay the latest known progress after each module initializes.
- A module import failure must be isolated with `Promise.allSettled` or per-module `try/catch`, so one broken transition does not prevent later transitions from initializing.
- Reduced-motion and CDN fallback paths must keep nav active state working without GSAP.
- The runtime must not take ownership of hero loading, hero first act, hero second act, or the hero-to-body ink timeline.
- `ink-curtain` must wrap `createInkCurtainTransition()` from `js/effects/ink-scene-transition.js`; it must not duplicate shader code.
- Phase 2 must include a new manual QA gate covering at least one real `ink-curtain` transition.

## Phase 1 Acceptance Criteria

- `npm run verify:scroll-modules` still passes.
- `data-transition="method-brand"` and the other legacy transition values remain present.
- Each transition also has `data-transition-id`, `data-transition-from`, `data-transition-to`, `data-transition-module`, and `data-transition-variant`.
- Every long-canvas content section has `data-section-id`, `data-section-index`, `data-section-theme`, `data-section-nav-bg`, and `data-section-layout`.
- `enterprise-scenario` and `education-contact` no longer appear in `css/sections/canvas-stage.css`.
- Phase 1 introduces no new browser runtime.
- Manual QA confirms no visual regression in desktop, mobile, reduced-motion, or CDN fallback checks.
