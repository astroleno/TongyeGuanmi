# Homepage Transition Remediation Plan

Date: 2026-06-28
Viewport used for latest visual review: 1440x840
Worktree: `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/homepage-master-observer-runtime`

## 1. Background

The observer branch did not introduce the main transition regressions. The observer/HUD writes calibration UI state, but the visual problems are rooted in the existing homepage transition runtime and adapters.

The current homepage path is still mostly:

- JS snap/playback controller
- immediate scroll relocation at transition boundaries
- video scrub/playback inside fixed transition stages
- handoff receivers only for a few sections

It is not yet the intended continuous timeline:

- ink entry
- animated scene
- copy enters before the visual scene fully exits
- ink/canvas exit
- stable section handoff
- final full-screen snap

Latest screenshot/state evidence is stored here:

- `output/playwright/homepage-finding-visual-review-stable-1440x840/visual-review-stable.json`
- `output/playwright/homepage-finding-visual-review-stable-1440x840/*.png`

## 2. Verified Problems

### Strong visual reproduction

1. `919px` enters a near-empty dark field.
   - HUD/state: `section=home`, `transition=none`, `copy=none`.
   - Visual: almost pure dark green field.

2. `1310px` is inside `home-belief:pattern-bloom`, but belief copy is still absent.
   - `1310px`: lotus/paper scene, `copy=none`.
   - `1699px`: belief copy appears.

3. AOD is snap-controlled, not continuous-scroll-controlled.
   - `3767px` and `4598px` are pulled to the AOD handoff zone around `3808px`.
   - The page can still move after initial sampling, so AOD must be treated as runtime-controlled rather than a stable scroll position.

4. Figure2 has visible timing/layering problems.
   - `6198px` and `6451px`: figure stage dominates, proof/method copy sits low.
   - `6885px`: proof copy, brand receiver, and figure stage overlap visually, producing a blurred/stacked handoff.

5. TTG / PH / Crane transitions are not continuous ink handoffs.
   - TTG: `10784px` is video transition state; `11616px` is already lab copy.
   - PH: `14007px` and `14839px` both get pulled into PH transition state near `14058px`.
   - Crane: `17268px` and `18097px` both get pulled near `17319px`, with no contact copy visible yet.

6. Divider lines are visually over-present in multiple areas.
   - Seen around lab/education transition areas.
   - Likely caused by transition cover bars plus section/list borders.

7. Final contact/footer does not resolve as a clean full-screen end state.
   - `18523px`: contact is already partially scrolled; footer is visible.

### Source-backed structural gaps

1. `SCROLL_DRIVEN_MODULES` is empty in `homepage-transition-runtime.js`.
2. AOD has `methodReceiver`, but receiver timing starts late: `start: 0.58`.
3. Figure3 has no handoff receiver and no ink curtain.
4. TTG and PH have no ink curtain / copy receiver.
5. Crane has `contactReceiver`, but no ink entry/exit.
6. Figure2 has special overlay/receiver logic, but no unified exit-to-Figure3 ink handoff.
7. Final contact/footer has no true snap endpoint contract.

## 3. Remediation Principles

1. Do not try to fix this by removing the observer.
   - The observer is useful for calibration and did not create the main visual behavior.

2. Stop treating every transition as an isolated adapter.
   - Each adapter needs an explicit entry, scene, copy, exit, and handoff contract.

3. Prefer one timeline contract over scattered magic thresholds.
   - Current hard-coded `0.58`, `0.94`, post-scroll ranges, and immediate jumps make the chain hard to reason about.

4. Use stable visual verification for every change.
   - Each validation sample must save `requestedY`, `actualY`, HUD/state, and screenshot from the same stabilized moment.

5. Fix the chain before polishing CSS.
   - Divider and alignment fixes matter, but they should not hide broken transition timing.

## 4. Implementation Plan

### Phase 0: Create a reliable visual verification harness

Goal: make the review process trustworthy before changing behavior.

Tasks:

- Add or update a verification script that captures:
  - requested scroll position
  - stabilized actual scroll position
  - HUD fields
  - visible section/copy/video state
  - screenshot with HUD hidden
- Use the canonical 1440x840 checkpoint list:
  - `886`, `919`, `1310`, `1699`
  - `3767`, `4598`, `5368`
  - `6198`, `6451`, `6885`, `7873`
  - `10784`, `11616`, `12417`
  - `14007`, `14839`
  - `17268`, `18097`, `18523`
- Add one mobile viewport after desktop is stable.
- Save outputs under a new timestamped or named `output/playwright/...` directory.

Acceptance:

- No mismatch between screenshot filename, JSON state, HUD state, and actual visual content.
- The script can be rerun after every phase without manual cleanup.

### Phase 1: Define the homepage transition contract

Goal: introduce a consistent adapter contract without rewriting everything at once.

Add a shared transition phase model:

- `entryInk`
- `scene`
- `copyIn`
- `copyHold`
- `exitInk`
- `handoff`

Runtime changes:

- Make every major homepage transition declare whether it is:
  - scroll-driven
  - snap playback with staged handoff
  - soft divider
- Replace ambiguous immediate jumps with named handoff operations.
- Record transition phase in DOM/HUD for debugging.
- Keep reduced-motion behavior explicit.

Acceptance:

- For each transition, the runtime can report the active phase.
- No adapter needs to infer handoff timing from unrelated scroll state.

### Phase 2: Repair the top chain: Home -> Belief -> AOD

#### 2.1 Pattern Bloom / Belief

Problems:

- dark gap near `919px`
- `1310px` transition active but no belief copy
- bloom/reveal/second reveal bands are compressed and hard to follow

Tasks:

- Separate pattern bloom into clear visual bands:
  - hero cover
  - reveal ink
  - lotus bloom
  - star field handoff
  - belief copy pin
- Ensure belief copy starts before the old scene feels complete.
- Remove or reduce the dark dead zone between home and belief.
- Keep star field and lotus from competing as two unrelated stages.

Acceptance:

- At `919px`, there is no near-empty dark field.
- At `1310px`, the visual state is intentionally transitional and either copy is entering or the scene still has clear content.
- At `1699px`, belief copy is fully readable and stable.

#### 2.2 AOD / Method

Problems:

- AOD snap behavior pulls multiple requested positions to the same transition zone.
- Method copy arrives late/low relative to the white field.

Tasks:

- Move Method receiver timing earlier than `0.58`.
- Align Method receiver to the final reading position before the video fully disappears.
- Make AOD handoff deterministic in both forward and reverse directions.
- Avoid sampling/runtime races where the page keeps moving after the supposed final state.

Acceptance:

- AOD white field and Method copy overlap intentionally.
- Method copy is readable before the AOD scene fully exits.
- `3767px` and `4598px` no longer feel like an unexpected jump to a mismatched state.

### Phase 3: Repair Method -> Brand -> Services

#### 3.1 Figure2 / Brand

Problems:

- proof text sits low and collides with visual stage rhythm
- foreground/arch/video/proof copy/brand receiver overlap
- brand appears through a blurred stacked handoff
- no clean ink exit into Figure3

Tasks:

- Split Figure2 into explicit phases:
  - figure intro
  - proof copy
  - foreground retreat
  - brand receiver
  - exit ink to Figure3
- Re-check z-index order:
  - figure foreground
  - proof overlay
  - handoff receiver
  - nav
- Move proof copy to a stable reading zone.
- Avoid showing Brand receiver while Figure2 foreground is still visually dominant.
- Add an exit ink or paper wash that connects Figure2 to Figure3.

Acceptance:

- `6198px` and `6451px` do not show copy in a low/blocked position.
- `6885px` no longer shows blurred stacked proof + brand + figure content.
- Brand appears as a deliberate handoff, not a ghosted overlay.

#### 3.2 Figure3 / Services

Problems:

- no handoff receiver
- no text-before-exit mechanism
- no ink entry/exit

Tasks:

- Add a Services handoff receiver similar to AOD/Method, but tuned to Figure3.
- Introduce copy entry during the final clean/white portion of Figure3.
- Add ink or paper-wash entry/exit if the intended design requires consistency with the rest of the chain.
- Ensure Brand -> Figure3 -> Services does not depend on abrupt section reveal.

Acceptance:

- Figure3 ending visibly leads into Services copy.
- Services copy does not appear only after the video has already gone away.

### Phase 4: Repair Services -> Lab -> Education -> Contact

#### 4.1 TTG / Lab

Problems:

- no ink curtain
- `10784px` is TTG video, `11616px` is already lab copy
- transition feels like hard stage-to-copy movement

Tasks:

- Add TTG entry/exit ink or a consistent paper-wash handoff.
- Add a Lab copy receiver if copy needs to enter before the section fully lands.
- Tune reverse behavior so it does not jump back into the wrong visual state.

Acceptance:

- TTG video exits into Lab copy as one connected move.
- `10784px` to `11616px` has an intentional visual bridge.

#### 4.2 PH / Education

Problems:

- no ink curtain
- `14007px` and `14839px` collapse into the PH transition area
- education copy can feel attached to PH instead of its own section

Tasks:

- Add PH entry/exit ink or paper-wash bridge.
- Add an Education receiver or delay the Education section reveal until the PH exit completes.
- Make `先会用，再出海` appear as an Education section moment, not a PH tail.

Acceptance:

- PH exits cleanly before Education copy is visually claimed.
- Education has its own stable first-read frame.

#### 4.3 Crane / Contact

Problems:

- no ink entry/exit
- contact receiver exists but contact copy is absent at sampled transition points
- final contact/footer is not a clean endpoint

Tasks:

- Add Crane exit ink or final paper-wash.
- Start contact receiver early enough to be visible before the scene disappears.
- Create a final endpoint contract for contact + footer:
  - either contact is one full-screen terminal panel and footer follows
  - or contact/footer are intentionally composed into one final viewport

Acceptance:

- `17268px` and `18097px` do not both land on a no-copy Crane/Contact transition frame.
- `18523px` resolves to an intentional final viewport, not a partially scrolled contact/footer mix.

### Phase 5: CSS and layout cleanup

Tasks:

- Audit all transition seam bars:
  - `.homepage-transition::before`
  - `.homepage-transition::after`
  - continuity overrides
  - section borders
  - row borders
- Decide one owner for each horizontal line:
  - transition cover bar
  - section boundary
  - internal list row
- Remove duplicate border responsibility.
- Re-locate #11 right-column mismatch from screenshot/scroll evidence before changing CSS.
- Fix desktop offsets only where they are actually wrong.
- Keep mobile overrides explicit.

Acceptance:

- No double horizontal rules around lab/education/contact boundaries.
- Right/left column rhythm is intentional at 1440x840.
- No new overlap or text clipping at mobile viewport.

## 5. Suggested Work Order

1. Phase 0 verification harness.
2. Runtime phase contract.
3. Pattern Bloom and AOD.
4. Figure2 and Figure3.
5. TTG, PH, Crane.
6. Divider/offset/final-contact CSS.
7. Full visual pass across desktop and mobile.

This order matters because the CSS issues can be measured accurately only after transition timing stops moving content into unexpected states.

## 6. Files Likely To Change

Runtime:

- `js/transitions/homepage-transition-runtime.js`
- `js/transitions/homepage-transition-registry.js`

Adapters:

- `js/transitions/pattern-bloom-adapter.js`
- `js/transitions/homepage/aod-homepage-adapter.js`
- `js/transitions/homepage/figure2-homepage-adapter.js`
- `js/transitions/homepage/figure3-homepage-adapter.js`
- `js/transitions/homepage/ttg-homepage-adapter.js`
- `js/transitions/homepage/ph-homepage-adapter.js`
- `js/transitions/homepage/crane-homepage-adapter.js`
- `js/transitions/homepage/handoff-receiver.js`

Effects:

- `js/effects/ink-scene-transition.js`

CSS:

- `css/components/homepage-transitions.css`
- `css/components/homepage-continuity.css`
- `css/sections/canvas-stage.css`
- `css/sections/source-copy.css`
- `css/figure2.css`

Verification:

- `scripts/*homepage*visual*.mjs`
- `output/playwright/...` generated artifacts

## 7. Validation Checklist

Desktop 1440x840:

- `919px`: no dead dark field.
- `1310px`: belief transition has intentional content/copy state.
- `1699px`: belief copy is stable.
- `3767px` / `4598px`: AOD handoff is deterministic and readable.
- `6198px` / `6451px`: Figure2 copy is not low/blocked.
- `6885px`: no proof/brand/figure ghost stack.
- `7873px`: Figure3 handoff is intentional.
- `10784px` / `11616px`: TTG to Lab has a real bridge.
- `14007px` / `14839px`: PH to Education has a real bridge.
- `17268px` / `18097px`: Crane to Contact has visible handoff copy or intentional final motion.
- `18523px`: final endpoint is composed, not accidental.

Mobile:

- Navigation remains readable.
- No large text clips.
- No copy overlaps visual assets.
- Final contact/footer still has a clear endpoint.

Regression checks:

- Reduced motion still renders all sections.
- Direct hash navigation still lands correctly.
- Observer/HUD still reports accurate phase and copy state.
- Existing static checks continue to pass.

## 8. Definition Of Done

The homepage transition work is complete when:

- every major transition has an explicit entry/scene/copy/exit/handoff phase
- screenshots prove the 1440x840 checkpoint list is visually stable
- no transition depends on accidental immediate scroll jumps for the intended visual result
- divider and column layout issues are fixed after timing is stable
- final contact/footer behavior is intentional and documented
