---
title: R5 Typography System and Responsive Editorial Layout Closure
type: refactor
status: acceptance_pending
date: 2026-07-17
branch: codex/react-refactor-r5-parity-cutover
implementation_commit: 1942f6a
follow_up: docs/plans/2026-07-17-012-fix-r5-portrait-interaction-motion-plan.md
---

# R5 Typography System and Responsive Editorial Layout Closure Plan

> **Status:** implemented in commit `1942f6a`; focused visual acceptance and physical-device review remain open
>
> **Implementation choice:** semantic type/ink roles with system CJK stacks and supported weights; no new remote or bundled CJK font
>
> **Delivered scope:** production typography, authored Chinese line breaks, desktop and mobile navigation tone, desktop/phone-landscape/phone-portrait layouts, content-fit fixes, and expanded visual evidence
>
> **Still out of scope:** input ownership, loader/intro timing, portrait motion calibration, media drivers, scene order, Ink/WebGL, and marketing-copy rewrites; these move to Plan 012 where applicable

## Goal

Turn the existing visual family into one explicit, testable typography and layout system while preserving the deliberate differences between scenes.

The finished site must:

1. keep the current editorial character, warm-paper palette, serif display voice, and asymmetric scene compositions;
2. use one semantic size, weight, line-height, and ink hierarchy for equivalent text roles;
3. keep normal reading text legible on common desktop and phone-landscape viewports;
4. prevent browser-generated Chinese line breaks from splitting authored phrases;
5. keep all non-reading scene content visible inside one viewport;
6. keep reading scenes scrollable without narrow vertical text columns or panel overlap;
7. preserve the user-approved Hero subtitle treatment unless a physical-device review explicitly reopens it.

This is a typography and responsive-layout closure pass, not a redesign.

---

## Plan Status and Authority

- Branch: `codex/react-refactor-r5-parity-cutover`.
- Original reviewed commit: `dbc3cbd`.
- Implementation reviewed for this update: `1942f6a`.
- Visual audit viewports:
  - desktop Chrome: `1440 × 900`;
  - compact desktop check: `1280 × 720`;
  - touch/coarse-pointer phone landscape: `844 × 390`;
  - larger touch/coarse-pointer phone landscape: `915 × 412`;
  - Pixel-class phone portrait: `390 × 844` / `412 × 915`.
- Plan 010 is superseded: commit `1942f6a` deliberately disables the blocking phone-landscape gate and removes its static pre-hydration shell.
- Portrait layout support was an implementation deviation from this plan's original compact-landscape-only boundary. It is accepted as the new baseline because the UI now presents coherent portrait reading layouts.
- Runtime, loader, input, media, and motion behavior were not closed by this typography/layout commit.
- Existing copy arrays and static-fallback baselines remain authoritative.
- User visual acceptance remains the final authority for spacing, line composition, and type scale.
- Visual evidence for this implementation lives under `artifacts/react-refactor/r5-candidate/visual/typography-responsive/`.

## Implementation Outcome at `1942f6a`

| Area | Delivered result | Status after review |
| --- | --- | --- |
| Semantic typography | Shared size, line-height, weight, and ink roles are defined and used across production editorial scenes | Implemented |
| Chinese phrase boundaries | Pattern, Lab, Star Map, Hero, Proof, and Education use authored phrase/line hooks while preserving source copy | Implemented |
| Reading layouts | Method, Services, Lab, and Education share a stronger editorial hierarchy on desktop, compact landscape, and portrait | Implemented |
| Brand and Contact | Portrait compositions retain hierarchy and fit without collapsing into generic cards | Implemented |
| Proof | Opening, cards, and closing are centered and substantially cleaner | Implemented; portrait opening still needs a no-panel-bleed acceptance check |
| Navigation | Semantic 12px type and paper-scene tone coverage are present | Implemented; portrait contrast, all-section access, and 44px targets remain open |
| Phone entry | Portrait no longer waits behind the landscape gate | Implemented as an intentional scope deviation |
| Visual evidence | Desktop, phone-landscape, and Pixel-class portrait screenshots plus geometry checks were added | Implemented; physical iPhone review remains open |
| Interaction and motion | Stage/input/loader architecture was not changed | Not closed here; moved to Plan 012 |

## Post-implementation Visual Review

The update is a meaningful improvement: reading scenes now have a coherent type hierarchy, Proof cards read cleanly, and Brand/Contact retain their editorial character in portrait. The remaining UI acceptance issues are narrower and should not reopen the typography system:

| Priority | Scene/surface | Observed issue | Acceptance required |
| --- | --- | --- | --- |
| P1 | Hero portrait | The title is still visibly blurred in the screenshot captured after the runtime reported `hold` and `presentationReady` | The accepted hold state must render the title sharply; evidence capture must wait for an explicit scene-stable visual signal |
| P1 | Pattern portrait | Light copy competes with the high-detail mandala and loses contrast | Preserve the artwork while adding a controlled local contrast treatment and a readable text measure |
| P1 | Top navigation on light scenes | Logo, menu, and CTA feel faint; mobile controls remain 31–34px tall | Meet measured text contrast and a minimum 44px interactive target without making the chrome visually heavy |
| P1 | Proof opening portrait | The next panel's copy peeks into the bottom edge at the opening position | No adjacent-panel text may bleed into a stable panel unless an explicit scroll-affordance design is approved |
| P2 | Star Map portrait | The copy is readable but occupies too much of the upper/middle viewport | Keep the authored phrases while constraining line measure and preserving breathing room around the visualization |
| P2 | Mobile menu | Education is still hidden below `520px` | Every public section must remain reachable in portrait |

These items are split deliberately: stable-state visual defects remain acceptance work for this plan; swipe feel, animation triggering, loader readiness, and viewport changes belong to Plan 012.

## Confirmed Findings

| Area | Current state | Required result |
| --- | --- | --- |
| Typography foundation | Shared `--r4-part-*` tokens cover only part of the live text system | One semantic role system for production scene copy, navigation, actions, and footer |
| Core body size | Most reading copy renders at `14–14.4px` on common laptops and phone landscape | Desktop body `16–17px`; compact landscape body `15–16px` |
| Body ink | Common body alpha is `.62`; Proof rows use `.56` | Normal reading text reaches at least `4.5:1` on the paper surface |
| Lead paragraphs | Equivalent lead copy ranges from `14.4px` to `18px` | One `body-large` role, with exceptions documented by role rather than scene |
| Navigation | Primary links and CTA use `11px`; compact footer reaches `10px` | Navigation and footer text do not drop below `12px` |
| Font weights | Live UI uses `720` and `760` with system fallbacks and `font-synthesis: none` | Standard supported weights with predictable fallback behavior |
| Chinese line breaks | Pattern, Lab, and Star Map depend on automatic wrapping | Authored phrase boundaries; no isolated semantic fragments such as `培 / 训`, `数 / 字`, or `店怎 / 么卖` |
| Mobile reading rows | The base `<=860px` two-column rows are overridden to three columns in touch landscape | Sequence number plus one copy column; body sits below its row title |
| Brand | Mobile one-column content exceeds `100svh` while the scene remains `overflow: hidden` | All Brand content remains visible without changing scene ownership |
| Proof | Three rows are taller than the fixed cards panel and overlap Closing | Cards stay within their semantic panel; Closing begins cleanly |
| Education navigation | `education` is absent from the light-scene tone set | Dark navigation on the warm paper surface |
| Hero subtitle | Desktop fix is accepted | Frozen as a regression baseline; no unsolicited restyling |

## Design Principles to Preserve

Uniformity does not mean making every scene look the same.

Preserve:

- the large custom Hero title;
- serif display copy paired with sans-serif explanatory text;
- warm paper, muted gold, deep green, and charcoal ink;
- the distinction between image-led scenes, editorial reading scenes, and closing/contact scenes;
- the existing wide-first / detail-second narrative structure;
- Brand, Proof Closing, and Contact as the strongest display-composition references;
- Lab’s compact two-column rows as the phone-landscape reading reference;
- generous negative space where it serves hierarchy;
- current copy meaning, order, punctuation, and static fallback.

Do not:

- flatten the site into one repeated template;
- introduce generic cards or divider-heavy rows;
- reduce text below the defined minimums merely to make a viewport fit;
- hide content in compact landscape;
- use `display: none` as a layout fix;
- turn Brand into a reading scene without a separate architecture decision;
- alter Hero figure choreography or subtitle reveal timing;
- load fonts from a third-party CDN.

---

## Proposed Typography Contract

The first implementation task must confirm these values with the user. After confirmation, equivalent live roles may not use scene-local one-off sizes.

| Semantic role | Desktop target | Compact landscape target | Line height | Ink |
| --- | --- | --- | --- | --- |
| Hero title | existing responsive scale | existing responsive scale | existing `.82` | existing light ink |
| Display finale | `clamp(36px, 4.4vw, 78px)` | `36–40px` | `1.10–1.14` | primary |
| Display lead | `clamp(38px, 4.4vw, 78px)` | `34–38px` | `1.04–1.10` | primary |
| Display wide | `clamp(32px, 3.8vw, 68px)` | `32–38px` | `1.08–1.14` | primary |
| Row title | `clamp(21px, 1.9vw, 34px)` | `20–22px` | `1.08–1.18` | primary |
| Body large | `clamp(17px, 1.15vw, 18px)` | `16px` | `1.72–1.82` | body |
| Body | `clamp(16px, 1vw, 17px)` | `15–16px` | `1.68–1.78` | body |
| Helper/detail | `clamp(13px, .9vw, 14px)` | `13px` | `1.50–1.65` | muted |
| Label/index | `12px` | `12px` | `1.20–1.70` | accent |
| Navigation/action | `12px` | `12px` | `1` | nav role |
| Footer/legal | `12px` | `12px` | `1.50–1.65` | muted |

### Ink roles

Use semantic variables rather than scene-local alpha variations:

```css
--ink-primary: rgba(37, 39, 25, .94);
--ink-body: rgba(37, 39, 25, .72);
--ink-muted: rgba(37, 39, 25, .66);
--ink-accent: #786329;
```

On `#ede4d2`, these targets provide:

- body ink `.72`: approximately `5.36:1`;
- muted ink `.66`: approximately `4.50:1`;
- solid accent `#786329`: approximately `4.60:1`.

Decorative artwork and non-text texture may remain lower contrast. Normal reading text, navigation, labels, and actionable text may not.

### Font roles and weights

Keep the existing three family roles:

```css
--font-title;
--font-traditional;
--font-sans;
```

Normalize production text to supported weights:

- `400` for body;
- `600` for display and row titles;
- `700` for labels, navigation, actions, and numeric emphasis.

Do not keep `720` or `760` in live production text unless an approved bundled font proves those weights exist.

### Font asset decision gate

Only `qiji-title-subset.ttf` is currently bundled.

Before adding any other font:

1. confirm its license;
2. confirm that Chinese glyph coverage matches all production copy;
3. produce WOFF2 subsets for only the approved families and weights;
4. record added transfer size;
5. compare macOS Safari, macOS Chrome, Windows Chrome, and iOS Safari metrics.

If no licensed CJK font is approved, keep the system serif/sans stacks, normalize weights, and record cross-platform metric drift as an accepted limitation. Do not silently add a remote font.

---

## Responsive Layout Contracts

### Shared desktop grid

- Method, Services, Lab, and Education continue to use `min(1240px, 90vw)`.
- Equivalent wide panels use the same outer alignment and column gap.
- Equivalent detail panels use the same lead/list relationship.
- Brand may retain its narrower paired composition.
- Contact may retain its `920px` content cap.
- Paragraph measure should normally stay within approximately `28–36` Chinese characters per line.
- Different scene compositions may use different vertical placement, but equivalent roles use the same type tokens.

### Compact phone landscape

The compact mode remains:

```css
@media
  (orientation: landscape)
  and (max-height: 500px)
  and (hover: none)
  and (pointer: coarse) {
  /* compact phone-landscape layout */
}
```

Within this mode:

1. preserve the horizontal wide-panel compositions;
2. do not override detail rows back to three columns;
3. each detail row uses:

```text
index | title
      | body
      | optional helper
```

4. body copy width at `844 × 390` must remain at least `280px`;
5. body text must remain at least `15px`;
6. scroll content starts below the functional topbar/blur zone;
7. no non-reading content may extend below the viewport while hidden;
8. no reading-panel content may paint into the next semantic panel.

### Phone portrait

Commit `1942f6a` establishes portrait as a first-class layout baseline rather than a blocked fallback.

Within a Pixel/iPhone-class portrait viewport:

1. Hero, Pattern, Star Map, Brand, and Contact retain distinct scene compositions rather than collapsing into one generic mobile template;
2. Method, Proof, Services, Lab, and Education keep one readable primary column with sufficient top clearance for navigation and safe areas;
3. normal body text remains at least `16px`, and line measure normally stays within approximately `16–24` Chinese characters;
4. stable non-reading holds show all required copy without clipping;
5. reading panels do not expose copy from an adjacent semantic panel at their stable top/bottom positions;
6. artwork-backed copy receives a local contrast treatment where the underlying image has high spatial frequency;
7. the stable Hero hold is sharp, not mid-blur, and visual evidence waits on a deterministic scene-stable contract;
8. all public sections remain reachable from mobile navigation;
9. navigation and CTA targets are at least `44 × 44px`, including safe-area padding where needed.

This section governs layout acceptance only. Native swipe behavior, gesture-to-animation mapping, loader readiness, and dynamic browser-toolbar handling are specified in Plan 012.

### Brand

Brand remains a non-reading hold.

For compact landscape:

- retain a two-column paired definition instead of the generic mobile one-column collapse;
- reduce gap and display scale only within the approved typography minimums;
- keep both definitions fully inside the usable viewport;
- keep their semantic order and existing copy.

If the full Brand composition cannot fit at the supported minimum landscape viewport without violating the typography minimums, stop and request authority to make Brand a reading scene. Do not solve that conflict by clipping or hiding copy.

### Proof

Proof remains one reading scene with three semantic `100svh` panels.

For the cards panel:

- all three rows must fit inside the panel;
- use compact vertical padding and the shared row title/body tokens;
- keep row number, title, and body visible;
- do not overlap the Closing panel;
- do not hide the third row;
- do not remove the three-panel semantic structure.

### Authored Chinese line breaking

For Pattern, Lab, and the final sentence of Star Map:

- preserve the complete accessible sentence;
- preserve the canonical copy array and fallback text;
- wrap meaningful phrases in local spans;
- allow breaks between phrases, not inside protected phrases;
- use explicit block spans only where the composition is authored as lines;
- avoid inserting ordinary spaces or non-breaking-space runs as layout tools.

The implementation must keep these phrases intact:

- `一场培训`;
- `账上的数字`;
- `店怎么卖`;
- `未来三年`.

---

## File Map

### Typography and shared ink

- Modify: `app/src/styles.css`
- Create: `app/src/production/typography-contract.test.ts`
- Modify: `app/src/scenes/method-top/copy.test.ts`
- Modify: `app/src/scenes/group4-scenes.test.ts`
- Modify: `app/src/scenes/group5-scenes.test.ts`
- Modify: `app/src/scenes/group6-scenes.test.ts`
- Modify: `app/src/scenes/group7-scenes.test.ts`
- Modify: `app/src/scenes/figure2-proof-scenes.test.ts`

### Authored line composition

- Modify: `app/src/scenes/pattern/index.tsx`
- Modify: `app/src/scenes/pattern/progress.test.ts`
- Modify: `app/src/scenes/star-map/index.tsx`
- Modify: `app/src/scenes/star-map/progress.test.ts`
- Modify: `app/src/scenes/lab/index.tsx`
- Modify: `app/src/scenes/group5-scenes.test.ts`
- Modify: `app/src/styles.css`

### Mobile reading layout and content fit

- Modify: `app/src/scenes/method-top/index.tsx` only if an additional layout hook is required
- Modify: `app/src/scenes/services/index.tsx` only if an additional layout hook is required
- Modify: `app/src/scenes/education/index.tsx` only if an additional layout hook is required
- Modify: `app/src/scenes/brand/index.tsx` only if an additional layout hook is required
- Modify: `app/src/scenes/figure2-proof/index.tsx` only if an additional layout hook is required
- Modify: `app/src/styles.css`
- Modify: `app/e2e/r5-matrix.spec.ts`

### Navigation and footer

- Modify: `app/src/production/StoryNav.tsx`
- Modify: `app/src/production/StoryNav.css`
- Modify: `app/src/production/StoryNav.test.tsx`
- Modify: `app/src/styles.css`

### Visual evidence

- Modify only if the existing capture workflow cannot express the required viewports:
  - `app/scripts/capture-r5-visual-evidence.mjs`
- Store implementation evidence under the existing R5 artifact hierarchy; do not create another top-level artifact directory.

---

## Milestones and Estimate

| # | Milestone | Likely effort | Success criteria |
| --- | --- | ---: | --- |
| 1 | Typography contract approved | 2–3h | User confirms role sizes, ink levels, and font strategy |
| 2 | Contract tests and shared tokens | 4–6h | Tests fail for the current system, then pass with semantic tokens |
| 3 | Authored line composition | 3–5h | Protected Chinese phrases never split; baseline copy remains identical |
| 4 | Compact reading layouts | 5–7h | Method, Services, Lab, and Education are readable and internally consistent |
| 5 | Brand and Proof content fit | 4–6h | No clipping or inter-panel overlap at required viewports |
| 6 | Navigation, footer, and visual closure | 4–6h | Tone, minimum sizes, focused browser checks, and user acceptance pass |

Three-point estimate:

- optimistic: `24h`;
- most likely: `32h`;
- pessimistic: `42h`;
- weighted expected effort: approximately `32.3h`.

Allow a `20–25%` buffer if a bundled CJK font is approved because font subsetting and cross-platform metric checks are not included in the core estimate.

---

## Task 1: Confirm the Typography and Font Contract

> **Historical execution record:** Tasks 1–7 below retain the original authoring checklist. Their current authority is the implementation-outcome table above, not unchecked box syntax. Commit `1942f6a` resolved the implementation path; Task 8 is the remaining live acceptance gate.

**Owner:** user + frontend implementer

**Effort:** 2–3h

**Depends on:** none

- [ ] Confirm the semantic role table in this plan.
- [ ] Confirm that `16px` is the desktop normal-body minimum.
- [ ] Confirm that `15px` is acceptable only for compact phone-landscape normal body.
- [ ] Confirm `12px` as the minimum navigation, label, and footer size.
- [ ] Confirm the four paper-ink roles.
- [ ] Choose one font path:
  - system stacks with standard weights and accepted metric drift; or
  - approved licensed bundled CJK WOFF2 assets.
- [ ] Capture the accepted Hero desktop and phone-landscape views as a frozen regression reference.

**Done when:** the user approves the role table and font path. No production CSS work begins before this checkpoint.

## Task 2: Freeze Failing Contracts Before Styling

**Owner:** frontend implementer

**Effort:** 3–4h

**Depends on:** Task 1

**Create**

- `app/src/production/typography-contract.test.ts`

**Modify**

- `app/src/production/StoryNav.test.tsx`
- `app/src/scenes/method-top/copy.test.ts`
- `app/src/scenes/group4-scenes.test.ts`
- `app/src/scenes/group5-scenes.test.ts`
- `app/src/scenes/group6-scenes.test.ts`
- `app/src/scenes/group7-scenes.test.ts`
- `app/src/scenes/figure2-proof-scenes.test.ts`

- [ ] Assert the approved semantic size tokens exist exactly once.
- [ ] Assert body, body-large, helper, label, navigation, and footer selectors use semantic tokens rather than smaller literals.
- [ ] Assert production navigation/action weights use the approved supported weight.
- [ ] Assert `chromeForScene('education')` returns `{ tone: 'light' }`.
- [ ] Assert the compact-landscape rule does not restore three-column Method, Services, or Education rows.
- [ ] Assert compact Proof defines a bounded cards-list treatment.
- [ ] Assert Brand has an explicit compact-landscape two-column contract.
- [ ] Assert Pattern, Lab, and Star Map render protected phrase hooks while their static fallback arrays remain unchanged.
- [ ] Keep all existing copy-baseline and renderer-idempotence tests.

**Done when:** the new focused tests describe the approved result and fail against the pre-change implementation for the expected reasons.

## Task 3: Introduce Semantic Type and Ink Tokens

**Owner:** frontend implementer

**Effort:** 4–6h

**Depends on:** Task 2

**Modify**

- `app/src/styles.css`
- `app/src/production/StoryNav.css`

- [ ] Add the approved semantic type-size, line-height, weight, and ink variables at the shared root.
- [ ] Keep temporary `--r4-part-*` aliases only where required by existing production selectors.
- [ ] Migrate live Method, Proof, Brand, Services, Lab, Education, Pattern, Contact, navigation, actions, and footer selectors to semantic roles.
- [ ] Raise normal body copy to the approved minimum.
- [ ] Move equivalent lead paragraphs onto one body-large role.
- [ ] Move helper/detail lines onto one helper role.
- [ ] Replace scene-local paper-body alphas `.56`, `.60`, and `.62` with the approved body or muted ink role.
- [ ] Use the solid approved accent for 12px labels and indices.
- [ ] Normalize live weights to `400`, `600`, and `700`.
- [ ] Remove only the live production one-off declarations made obsolete by the role system.
- [ ] Do not refactor harness/devtool styles unrelated to the production story.

**Done when:** equivalent production text roles compute to the same approved values and focused contract tests pass.

## Task 4: Author Chinese Phrase Boundaries

**Owner:** frontend implementer

**Effort:** 3–5h

**Depends on:** Task 2; may proceed in parallel with Task 3

**Modify**

- `app/src/scenes/pattern/index.tsx`
- `app/src/scenes/star-map/index.tsx`
- `app/src/scenes/lab/index.tsx`
- their focused tests
- `app/src/styles.css`

- [ ] Keep each canonical copy constant unchanged.
- [ ] Render Pattern as two authored semantic lines while preserving one accessible sentence.
- [ ] Tune compact-landscape Pattern width and display size so the two authored lines fit without isolated characters.
- [ ] Split Lab markup into semantic phrase spans without changing punctuation or normalized fallback text.
- [ ] Keep `店怎么卖` in one protected phrase.
- [ ] Protect `未来三年` in Star Map without preventing the rest of the paragraph from wrapping naturally.
- [ ] Keep accessible reading order identical to the source copy.
- [ ] Keep current reveal handles and animation ownership on their existing roots.
- [ ] Add markup tests that compare normalized rendered text to the canonical arrays.

**Done when:** desktop and both phone-landscape viewports show natural Chinese phrase wrapping with no baseline-copy changes.

## Task 5: Unify Compact Phone-Landscape Reading Rows

**Owner:** frontend implementer

**Effort:** 5–7h

**Depends on:** Task 3

**Modify**

- `app/src/styles.css`
- scene components only if a missing hook prevents the shared rule
- `app/e2e/r5-matrix.spec.ts`

- [ ] Preserve Method, Services, and Education wide first panels in horizontal compact mode.
- [ ] Remove the compact-landscape three-column row override.
- [ ] Apply Lab’s two-column row model to Method, Services, and Education.
- [ ] Place body and helper copy below the row title in column two.
- [ ] Keep sequence indices in the first column.
- [ ] Use one shared gap and row-padding rhythm.
- [ ] Keep the lead/list relation visually consistent without forcing all scene leads to identical copy length.
- [ ] Reserve enough top space that active text is not blurred by the navigation edge treatment.
- [ ] Verify reverse-entry and reading-edge ownership remain unchanged.
- [ ] Add focused browser measurements for body-column width and minimum computed font size.

**Done when:** all four reading scenes scan as the same system at `844 × 390` and `915 × 412`, with no narrow vertical text strips.

## Task 6: Close Brand and Proof Content-Fit Defects

**Owner:** frontend implementer

**Effort:** 4–6h

**Depends on:** Task 3

### Brand

- [ ] Add a compact-landscape override that keeps the paired definitions in two columns.
- [ ] Use the approved display/body minimums and compact spacing.
- [ ] Keep both definitions fully inside the usable viewport.
- [ ] Keep Brand non-reading and `overflow: hidden`.
- [ ] Add a focused assertion that visible content bounds do not exceed the scene viewport.
- [ ] Stop for architecture approval if fitting requires text below the approved minimums.

### Proof

- [ ] Keep three semantic `100svh` panels.
- [ ] Compact the cards-list top position, row padding, and gaps only in the constrained mobile condition.
- [ ] Keep all three row titles and bodies visible.
- [ ] Ensure the cards-list bottom is no lower than the cards-panel bottom.
- [ ] Ensure the Closing copy does not intersect any cards-row bounds.
- [ ] Keep direct navigation and Proof alias navigation behavior unchanged.

**Done when:** Brand has no inaccessible second definition and Proof has no inter-panel overlap at required phone-landscape viewports.

## Task 7: Correct Navigation Tone and Small Text

**Owner:** frontend implementer

**Effort:** 2–3h

**Depends on:** Task 3

**Modify**

- `app/src/production/StoryNav.tsx`
- `app/src/production/StoryNav.css`
- `app/src/production/StoryNav.test.tsx`
- `app/src/styles.css`

- [ ] Add `education` to the light-scene chrome set.
- [ ] Raise desktop nav links and CTA text to the approved navigation size.
- [ ] Keep compact action height, border, radius, and interaction behavior unchanged.
- [ ] Raise compact footer/legal text to the approved minimum.
- [ ] Preserve active-state underline and current navigation order.
- [ ] Verify dark and light navigation contrast on Star Map, paper scenes, and Contact.

**Done when:** Education navigation uses the correct tone and no live navigation/footer text is below `12px`.

## Task 8: Focused Visual Verification and User Acceptance

**Owner:** frontend implementer + user

**Remaining effort:** 3–5h for stable-state visual corrections and evidence; interaction/motion work is estimated separately in Plan 012

**Depends on:** Tasks 4–7

### Implementation evidence already present

- Typography contract, copy-baseline, responsive geometry, and portrait-entry regressions are represented in focused unit/E2E coverage.
- The visual capture workflow now includes desktop, phone landscape, and Pixel-class portrait scenes.
- The implementation commit records lint, typecheck, focused tests, build, and evidence generation; this document review does not rerun implementation checks.
- Any visual correction made after this review must rerun its directly affected checks and preserve existing JS/CSS budgets.

### Required focused browser matrix

| Context | Viewport | Required scenes |
| --- | --- | --- |
| Desktop Chrome | `1440 × 900` | Hero, Pattern, Star Map, Method top/bottom, Proof all panels, Brand, Services top/bottom, Lab top/bottom, Education top/bottom, Contact |
| Laptop Chrome | `1280 × 720` | Method, Proof, Brand, Services, Lab, Education, Contact |
| Touch/coarse Chrome | `844 × 390` | Hero regression, Pattern, all reading bottoms, Proof cards/closing, Brand, Education, Contact |
| Touch/coarse Chrome | `915 × 412` | Same compact-layout risk set |
| Touch/coarse Chrome | `390 × 844` or `412 × 915` | Hero stable hold, Pattern contrast, Star Map measure, Proof panel boundaries, Brand, all reading scenes, mobile menu, Contact |
| Physical iPhone Safari | available target device, portrait and landscape | Entry without a gate, Hero, Pattern, Proof, Brand, Services, Education, safe areas, dynamic toolbar |

The browser context must actually satisfy:

```js
matchMedia('(hover: none) and (pointer: coarse)').matches === true
```

A resized desktop browser is not valid evidence for the phone-landscape rules.

### Measurable acceptance

- [ ] Desktop normal body computes to at least `16px`.
- [ ] Compact phone-landscape normal body computes to at least `15px`.
- [ ] Navigation, labels, and footer compute to at least `12px`.
- [ ] Normal paper text meets at least `4.5:1`.
- [ ] Equivalent lead paragraphs differ by no more than `1px`.
- [ ] Protected Chinese phrases occupy one line each.
- [ ] Reading-row body width is at least `280px` at `844 × 390`.
- [ ] Brand content bounds remain inside the viewport.
- [ ] Proof cards content bounds remain inside the cards panel.
- [ ] Proof Closing does not intersect any card.
- [ ] Education navigation uses `data-tone="light"`.
- [ ] Hero desktop and phone-landscape reference views do not regress.
- [ ] Hero portrait hold is sharp after an explicit scene-stable signal.
- [ ] Pattern portrait copy remains readable over the mandala.
- [ ] Proof portrait opening shows no unapproved next-panel copy.
- [ ] Star Map portrait preserves artwork breathing room and readable line measure.
- [ ] Every public section, including Education, is reachable below `520px`.
- [ ] Mobile menu, CTA, and brand targets are at least `44 × 44px`.
- [ ] Light-scene navigation text and controls meet their contrast requirements.
- [ ] No copy is hidden to satisfy these checks.

### User visual review

Present a compact evidence set:

1. desktop type hierarchy contact sheet;
2. phone-landscape Pattern;
3. phone-portrait Hero, Pattern, and Star Map stable holds;
4. phone-portrait Method, Services, Lab, and Education detail rows side by side;
5. Proof opening/cards/closing panel boundaries in portrait and compact landscape;
6. Brand and Contact in portrait;
7. light-scene mobile navigation and complete menu;
8. Hero frozen-reference comparison.

Make only user-requested visual adjustments after that review. Re-run the directly affected checks and rebuild only when production CSS or code changes.

---

## Historical Implementation Dependencies

The dependency graph below describes the work already landed in `1942f6a`; it is retained for traceability.

```text
Typography approval
        |
        v
Contract tests
   |         |
   v         v
Type/ink    Authored phrase breaks
tokens       |
   |         |
   +----+----+
        |
        +------> Compact reading rows
        |
        +------> Brand and Proof fit
        |
        +------> Navigation and footer
                       |
                       v
             Focused visual acceptance
                       |
                       v
                  Final build
```

Tasks 3 and 4 may proceed in parallel after the contract tests are committed. Tasks 5, 6, and 7 may proceed in parallel after the shared tokens are stable. Final visual acceptance remains the merge gate.

## Remaining Critical Path

Deterministic stable-state capture → five focused visual corrections → portrait/landscape evidence → physical iPhone review → user acceptance.

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation |
| --- | --- | --- | --- |
| Larger text increases scene height | High | High | Preserve reading ownership; solve with row rhythm and layout, never clipping |
| Brand cannot fit the supported minimum viewport | High | Medium | Use paired compact layout; stop for authority before converting it to reading |
| Proof compacting weakens hierarchy | Medium | Medium | Keep shared title/body roles; reduce spacing before size |
| Authored spans alter copy baselines | High | Low | Compare normalized rendered text and static fallback to canonical arrays |
| Touch-specific CSS is tested in a desktop context | High | High | Require a real coarse-pointer browser context and physical iPhone review |
| New font increases payload or changes metrics | Medium | Medium | Separate license/asset gate; no remote fonts; subset and compare before adoption |
| Weight normalization changes visual tone | Medium | Medium | Review `600/700` side by side before broad replacement |
| CSS token refactor touches non-production harnesses | Low | Medium | Limit migration to live production selectors |
| Concurrent R5 media work changes the branch | Medium | High | Rebase/review current HEAD before implementation; keep this plan out of media/runtime files |

---

## Non-goals

- Do not change the canonical scene or segment order.
- Do not change reading ownership, edge latches, charge thresholds, or input damping.
- Do not re-enable the blocking orientation gate. Loader/input changes belong to Plan 012.
- Do not modify media preparation, playback, alpha-video sources, or timeout policy.
- Do not modify Ink shaders, particles, canvases, or draw-call limits.
- Do not rewrite marketing claims or add copy.
- Do not change Hero choreography or reopen its desktop subtitle treatment without user direction.
- Do not run the complete release/memory/media matrix for a typography-only patch unless focused checks expose a wider regression.

## Delivery Sequence

1. Treat `1942f6a` as the typography/layout baseline; do not reopen the semantic role system.
2. Add an explicit scene-stable visual cue for evidence capture.
3. Correct only the five residual UI surfaces: Hero sharpness, Pattern contrast, Proof opening boundary, Star Map portrait measure, and mobile navigation.
4. Re-run directly affected unit, geometry, type, lint, build, and budget checks.
5. Capture the focused desktop, landscape, portrait, and physical-iPhone evidence set.
6. Obtain user visual acceptance.

## Done Definition

### Delivered in `1942f6a`

- semantic type/ink roles and standard font weights;
- authored Chinese phrase boundaries with copy-baseline coverage;
- coherent desktop, compact-landscape, and portrait reading layouts;
- Brand, Proof, Contact, and navigation typography refinements;
- portrait entry without a blocking landscape gate;
- expanded geometry and screenshot evidence.

### Required to close this plan

- Hero is sharp in the stable portrait hold;
- Pattern copy is legible over its artwork;
- Proof opening does not leak unapproved next-panel copy;
- Star Map portrait keeps readable measure and adequate visual breathing room;
- mobile navigation is complete, sufficiently contrasted, and uses 44px targets;
- the focused checks and budgets remain green after those corrections;
- the user approves desktop, phone-landscape, phone-portrait, and physical-iPhone evidence;
- no runtime, media, Ink, scene-order, or copy-baseline regression is introduced.
