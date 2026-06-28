# Homepage Transition Remediation Plan

Date: 2026-06-28
Viewport used for latest visual review: 1440x840
Worktree: `/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/homepage-master-observer-runtime`

## 0. Quick Start

Status: **Conditional Go**. Phase 0 and the AOD -> Method pilot are approved; full-chain rollout is not approved until the pilot gate passes.

Critical path:

1. Build the Phase 0 harness and capture the primary plus supplemental checkpoints.
2. Write the AOD -> Method keyframe spec and choose the pilot bridge style.
3. Implement the Phase 1A pilot-only contract and the AOD -> Method pilot.
4. Run the pilot gate review.
5. If the pilot passes, expand one transition at a time under Phase 1B.
6. If the pilot fails, diagnose the contract/harness mismatch before touching the rest of the chain.

Before starting:

- [ ] Playwright or the chosen browser automation path is installed and tested.
- [ ] `output/playwright/` is writable.
- [ ] AOD pilot keyframes are decided in the Section 3 decision gate.
- [ ] AOD pilot bridge style is decided: `entryInk`, `paperWash`, or approved `snapEntry`.

First executable task:

- Create or run `node scripts/capture-homepage-checkpoints.mjs` at the Phase 0 checkpoint list, including the supplemental checkpoints in the coverage appendix.

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

Execution status: **Conditional Go**.

- Approved now: Phase 0 verification harness and the AOD -> Method pilot.
- Not approved yet: full Phase 1-5 rollout, global adapter rewrite, or any claim that all original 15 issues are closed.

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
   - Seen around TTG/Lab and PH/Education boundary areas, including checkpoints around `11616px` and `14839px`.
   - Likely caused by transition cover bars plus section/list borders.

7. Right-column rhythm is visibly lower than the left column in the mid-page copy area.
   - `12417px`: right-side items sit noticeably below the left-side lead copy.

8. Final contact/footer does not resolve as a clean full-screen end state.
   - `18523px`: contact is already partially scrolled; footer is visible.

### Original 15 Issues Crosswalk

This table is the authoritative issue numbering. A phase is not done until its mapped rows have passing evidence from the visual harness.

| Original # | Original issue text | Original checkpoint | Owner phase | Closure evidence |
| --- | --- | --- | --- | --- |
| #1 | Home dark field and copy disappearance | `886px` / `919px` | Phase 2.1 | screenshot has meaningful visual content or entering copy; HUD does not report `copy=none` on an empty frame |
| #2 | Belief/pattern-bloom reads as two disconnected scenes before copy lands | `1310px` / `1699px` | Phase 2.1 | at `1310px`, either `copy=belief` opacity >= 0.35 or the visual scene remains clearly active and not a blank holding frame |
| #3 | AOD entry snaps/jumps instead of reading as a bridged transition | `3767px` / `4598px` | Phase 2.2 pilot | `requestedY`, `actualY`, phase, and screenshot agree; entry phase reports `entryInk`, `paperWash`, or approved `snapEntry` |
| #4 | AOD white field and Method copy timing/position are late and low | `4598px` / `5368px` | Phase 2.2 pilot | Method receiver opacity >= 0.55 before AOD scene opacity falls below 0.25; text bbox is inside the agreed reading zone |
| #5 | Figure2 entry jumps into the stage instead of being bridged | `6198px` / `6885px` | Phase 3.1 | entry phase is named and visible; no no-copy mismatch frame after stabilization |
| #6 | Figure2 proof copy sits too low and is blocked by foreground rhythm | `6198px` / `6451px` | Phase 3.1 | copy opacity >= 0.8; proof text bbox does not overlap dominant foreground bbox by more than 10% area |
| #7 | Figure2 proof, foreground retreat, Brand receiver, and exit order stack together | `6885px` | Phase 3.1 | no frame has proof opacity >= 0.35 and Brand receiver opacity >= 0.35 while figure foreground opacity >= 0.25 |
| #8 | Figure3 has no Services receiver / text-before-exit handoff | `7873px` | Phase 3.2 | Services receiver exists and reaches opacity >= 0.5 before Figure3 exit completes |
| #9 | TTG entry/exit lacks ink or equivalent bridge into Lab | `10784px` / `11616px` | Phase 4.1 | transition phase reports `exitInk`, `paperWash`, or approved `snapEntry`; Lab copy starts before video leaves viewport |
| #10 | Duplicate divider lines around the TTG/Lab boundary | around `11616px` | Phase 5, after Phase 4.1 gate | one owner is documented for each visible horizontal line; screenshot shows no duplicate boundary rule |
| #11 | Right column sits noticeably lower than the left column | `12417px` | Phase 5, after owning section is stable | right/left bboxes match the approved vertical rhythm at 1440x840 |
| #12 | PH entry/exit snaps or collapses into a no-copy transition state | `14007px` / `14839px` | Phase 4.2 | forward and reverse samples report valid phases with PH or Education content visible |
| #13 | Duplicate divider lines around the PH/Education boundary | around `14839px` | Phase 5, after Phase 4.2 gate | one owner is documented for each visible horizontal line; screenshot shows no duplicate boundary rule |
| #14 | Crane entry/exit snaps into a no-copy transition state | `17268px` / `18097px` | Phase 4.3 | contact receiver opacity >= 0.45 before crane visual opacity < 0.3; reverse sample has a valid Crane/Contact phase |
| #15 | Contact/footer endpoint is not an intentional final viewport | `18523px` | Phase 4.3 + Phase 5 | footer visible ratio matches the chosen endpoint spec with documented snap target and tolerance |

### Supplemental Checkpoint Coverage

These checkpoints do not create new issue IDs. They prevent broad crosswalk rows from hiding missing sampling points.

| Supplemental checkpoint | Covers | Mapped row(s) | Harness note |
| --- | --- | --- | --- |
| `1843px`, `2327px`, `2937px` | Belief -> AOD continuity and early AOD entry | #2, #3 | capture active phase, copy id, AOD scene state, bridge type, and residual scroll delta |
| `8703px`, `9535px` | Figure3 ending and Services text-before-exit timing | #8 | capture Figure3 scene progress and Services receiver opacity/bbox |
| `9954px` | TTG entry bridge | #9 | capture bridge type, TTG scene progress, Lab receiver state if present |
| `13177px` | PH entry bridge | #12 | capture bridge type, PH scene progress, Education receiver or section state |
| `16438px` | Crane entry bridge | #14 | capture bridge type, Crane scene progress, Contact receiver state |

### Source-backed structural gaps

1. Runtime observation: `SCROLL_DRIVEN_MODULES` is empty, while at least `pattern-bloom` is driven through `data-transition-drive="scroll"`. Treat this as a contract clarity issue, not a standalone bug.
2. AOD has `methodReceiver`, but receiver timing starts late: `start: 0.58`.
3. Figure3 has no handoff receiver and no ink curtain.
4. TTG and PH have no ink curtain / copy receiver.
5. Crane has `contactReceiver`, but no ink entry/exit.
6. Figure2 has special overlay/receiver logic, but no unified exit-to-Figure3 ink handoff.
7. Final contact/footer has no true snap endpoint contract.

## 3. Open Decisions And Transition Contract

### Open Decision Gates

These decisions do not block Phase 0. Only the rows marked for the pilot block the AOD -> Method implementation.

| Decision | Blocks | Required answer | Owner |
| --- | --- | --- | --- |
| AOD -> Method pilot keyframes | Phase 2.2 pilot implementation | 0/20/40/60/80/100% visual states, receiver opacity targets, white-field ratio, safe reading bbox | implementation lead + visual reviewer |
| Pilot bridge style | Phase 2.2 pilot implementation | choose `entryInk`, `paperWash`, or approved `snapEntry`; document why snap remains acceptable if used | implementation lead |
| Pattern Bloom visual rhythm | Phase 2.1 implementation | acceptable dark gap, lotus/star/copy order, and the first frame where belief copy should be readable | visual reviewer |
| Per-transition bridge style | each later transition phase | before work starts on that transition, declare `entryInk`, `paperWash`, approved `snapEntry`, or `none` | implementation lead |
| Contact/footer endpoint | Phase 4.3 implementation | choose full contact panel or composed contact/footer endpoint; define footer visible ratio, snap target, and tolerance | product/visual owner |

### Transition Contract Table

Every transition must declare one expected mode before implementation starts for that transition. During the pilot, only `belief-method` / AOD is required to implement the contract.

| Transition | Current mode | Target mode | Entry | Scene | Copy / receiver | Exit | Snap policy | Reverse policy | Reduced motion / hash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `home-belief` / `pattern-bloom` | scroll-driven overlay | scroll-driven phased overlay | reveal ink | lotus bloom and star handoff | belief copy pin | star/copy handoff to AOD | no JS snap | reverse keeps valid scene/copy phase | copy visible without animation; hash can land on belief |
| `belief-method` / `aod` | snap playback + method receiver | staged snap or scroll bridge, chosen in pilot | explicit entry ink or approved snapEntry | AOD video/white field | Method receiver starts before final white field exits | deterministic handoff to Method | snap may remain only if entry and actualY are documented | reverse must not land on stale belief/no-copy frame | Method section visible in reduced motion and hash |
| `method-proof` / `figure2` | snap playback + proof overlay + Brand receiver | staged snap with hard phase gates | entry phase defined; no hidden jump | figure intro and proof scene | proof copy, then Brand receiver | ink/paper wash to Figure3 | post-scroll allowed only with phase state | reverse separates Brand/proof/figure states | proof and Brand both accessible without animation |
| `brand-services` / `figure3` | snap video, no receiver | staged handoff with Services receiver | declared bridge from keyframe spec | Figure3 video | Services receiver during final clean frame | exit ink or paper wash | snap allowed only with receiver timing | reverse returns to Brand or Figure3, not no-copy limbo | Services visible in reduced motion/hash |
| `services-lab` / `ttg` | snap video | staged bridge to Lab | entry ink or paper wash | TTG video | Lab receiver when required by keyframe spec | exit ink/paper wash | actualY target documented | reverse phase gate required | Lab visible in reduced motion/hash |
| `lab-education` / `ph` | snap video | staged bridge to Education | entry ink or paper wash | PH video | Education receiver or delayed section reveal | exit ink/paper wash | actualY target documented | reverse phase gate required | Education visible in reduced motion/hash |
| `philosophy-contact` / `crane` | snap video + late contact receiver | staged bridge + final endpoint | declared bridge from keyframe spec | Crane video | Contact receiver starts before scene exit | final ink/paper wash | terminal snap endpoint documented | reverse phase gate required | Contact visible in reduced motion/hash |
| soft dividers | soft CSS/section flow | keep soft | none | none | native section copy | none | no JS snap | native scroll | native content accessible |

## 4. Objective Acceptance And Phase Gates

### Common objective thresholds

- State and screenshot must be captured after scroll stabilization.
- `requestedY`, `actualY`, HUD transition, active phase, and screenshot filename must agree.
- Every threshold below must map to a field captured by the Phase 0 harness. Do not add a pass/fail metric that the harness cannot measure.
- A transition sample fails if it has `copy=none` and no meaningful visual scene.
- Text is readable when opacity is >= 0.8, blur <= 2px, and its primary bbox is inside the viewport with at least 24px safe margin.
- A receiver is considered entering when opacity >= 0.35, dominant when opacity >= 0.65, and complete when opacity >= 0.95.
- Overlap fails when a foreground asset covers more than 10% of the primary copy bbox during a copy hold.
- Reverse samples must have an explicit phase and must not land on no-copy limbo frames.
- The final endpoint must define and verify footer visible ratio.

### Required Harness Fields

Each checkpoint record must include these fields before any closure row can be marked objectively passing:

| Field group | Required fields | Used by |
| --- | --- | --- |
| Scroll state | `requestedY`, `actualY`, direction, viewport, stabilization wait, residual scroll delta | all rows |
| Runtime/HUD state | active section, transition id, active phase, copy id, snap target if any | all transition rows |
| Receiver/copy state | receiver selector/id, opacity, visibility, bbox, computed blur, safe-margin result | copy timing and readability rows |
| Scene state | scene/video/canvas id, scene opacity, playback or progress value, bridge type | entry/exit bridge rows |
| Overlap state | primary copy bbox, dominant foreground bbox, overlap ratio | Figure2 and any layered transition |
| Boundary state | visible horizontal line owners, line count in sampled boundary band | divider rows #10 and #13 |
| Endpoint state | contact bbox, footer bbox, footer visible ratio, chosen endpoint spec | final row #15 |
| Artifact state | HUD-hidden screenshot path, optional HUD-visible screenshot path, JSON path | auditability |

### Phase gates

| Gate | Required before proceeding | Blockers |
| --- | --- | --- |
| Phase 0 gate | stable visual harness exists; required fields above are captured; 1440x840 checkpoint baseline saved; JSON/screenshot/HUD agree | missing required fields, or any mismatch between actualY and screenshot state |
| Pilot input gate | AOD -> Method keyframes and bridge style are documented before implementation starts | worker must infer visual truth from prose |
| Pilot gate | AOD -> Method fixes rows #3 and #4 and proves the contract with forward and reverse samples | phase naming exists but visual result still fails |
| Phase 1A gate | contract table is implemented for the pilot only; no global adapter rewrite yet | runtime/API churn without a passing pilot |
| Phase 1B gate | after pilot passes, contract expansion plan exists for the next transition only | global adapter rewrite starts before the pilot is proven |
| Per-transition gate | crosswalk rows for that transition pass; reduced motion and direct hash checked | unresolved no-copy frame, reverse limbo, or copy/foreground overlap |
| Phase 4.3 input gate | contact/footer endpoint decision is documented | final endpoint left as an implementation guess |
| Phase 5 gate | relevant transition rows pass before local CSS cleanup starts | CSS hides timing bugs instead of fixing them |
| Release gate | all crosswalk rows pass on desktop; mobile smoke pass; `npm run verify:all` passes; performance and cross-browser checks complete | dropped frames below budget, broken reduced motion/hash, or final endpoint ambiguity |

### Pilot recommendation

Start with `belief-method` / AOD -> Method.

Reasons:

- It exercises receiver timing, snap policy, forward/reverse behavior, and actualY stabilization.
- It is smaller than Pattern Bloom and less entangled than Figure2.
- It provides a concrete template for the rest of the snap transitions.

Do not execute Phase 1-5 globally until the pilot passes its gate.

## 5. Remediation Principles

1. Do not try to fix this by removing the observer.
   - The observer is useful for calibration and did not create the main visual behavior.

2. Stop treating every transition as an isolated adapter.
   - Each adapter needs an explicit entry, scene, copy, exit, and handoff contract.

3. Prefer one timeline contract over scattered magic thresholds.
   - Current hard-coded `0.58`, `0.94`, post-scroll ranges, and immediate jumps make the chain hard to reason about.

4. Use stable visual verification for every change.
   - Each validation sample must save `requestedY`, `actualY`, phase, opacity, bbox/overlap data, endpoint ratio where applicable, and screenshot from the same stabilized moment.

5. Fix the chain before polishing CSS.
   - Divider and alignment fixes matter, but they should not hide broken transition timing.

6. Pilot before expanding.
   - AOD -> Method is the proving slice. Do not globally rewrite adapters until the pilot gate passes.

7. Keep rollback cheap.
   - Make small gate-based commits or branches after passing checkpoints. Do not bundle multiple transition rewrites into one irreversible change.

## 6. Implementation Plan

### Phase 0: Create a reliable visual verification harness

Goal: make the review process trustworthy before changing behavior.

Tasks:

- Add or update a verification script that captures:
  - requested scroll position
  - stabilized actual scroll position
  - scroll direction and residual scroll delta after stabilization
  - HUD fields
  - active transition phase
  - visible section/copy/video state
  - receiver/copy opacity, bbox, computed blur, and safe-margin result
  - dominant foreground bbox and copy/foreground overlap ratio where applicable
  - bridge type and scene/video/canvas progress where applicable
  - visible horizontal line count and owner candidates for divider checkpoints
  - contact/footer bboxes and footer visible ratio for endpoint checkpoints
  - screenshot with HUD hidden
- Use the canonical 1440x840 checkpoint list:
  - `886`, `919`, `1310`, `1699`, `1843`, `2327`, `2937`
  - `3767`, `4598`, `5368`
  - `6198`, `6451`, `6885`, `7873`, `8703`, `9535`
  - `9954`, `10784`, `11616`, `12417`
  - `13177`, `14007`, `14839`
  - `16438`, `17268`, `18097`, `18523`
- Add one mobile viewport after desktop is stable.
- Save outputs under a new timestamped or named `output/playwright/...` directory.

Acceptance:

- No mismatch between screenshot filename, JSON state, HUD state, and actual visual content.
- Each objective threshold in the crosswalk can be evaluated from captured JSON fields.
- Rows #3 and #4 have enough fields to drive the AOD -> Method pilot before any transition code changes.
- The script can be rerun after every phase without manual cleanup.
- The baseline populates the original 15 issues crosswalk with current failing/pass evidence.

### Phase 1A: Define the pilot-only transition contract

Goal: introduce the smallest useful contract for the AOD -> Method pilot without rewriting every adapter.

Use this shared phase vocabulary for the pilot:

- `entryInk`
- `paperWash`
- `snapEntry`
- `scene`
- `copyIn`
- `copyHold`
- `exitInk`
- `handoff`

Minimum pilot contract shape:

```js
{
  id: 'belief-method',
  mode: 'snap-playback',
  bridgeType: 'snapEntry',
  snapPolicy: {
    allowed: true,
    target: '#method',
    tolerancePx: 8
  },
  phases: [
    { id: 'snapEntry', start: 0, end: 0.12, required: true },
    { id: 'scene', start: 0, end: 0.62, required: true },
    { id: 'copyIn', start: 0.42, end: 0.78, required: true },
    { id: 'copyHold', start: 0.78, end: 0.94, required: true },
    { id: 'handoff', start: 0.94, end: 1, required: true }
  ],
  handoff: {
    receiver: '#method',
    targetSection: '#method'
  }
}
```

Runtime changes for the pilot:

- Record the active phase in DOM/HUD.
- Expose receiver opacity and copy bbox to the verification harness.
- Replace ambiguous immediate jumps in the pilot path with named handoff operations.
- Keep reduced-motion behavior explicit for the pilot.
- Do not require every other adapter to export the full contract before the pilot passes.

Pilot keyframe spec, to be validated against baseline screenshots before code changes:

| Progress | Expected visual state | Required measurements |
| --- | --- | --- |
| 0% | AOD entry state is visible; any snap is hidden by declared `snapEntry` or bridge | `actualY`, `phase`, bridge type |
| 20% | AOD scene is dominant; Method copy is not yet dominant | scene opacity/progress, copy opacity |
| 40% | white field begins to read; Method receiver is entering | receiver opacity >= 0.35, copy bbox captured |
| 60% | Method copy is readable before AOD fully exits | receiver opacity >= 0.55, scene opacity >= 0.25, safe margin pass |
| 80% | Method copy is dominant and aligned to final reading position | receiver opacity >= 0.8, bbox safe margin pass |
| 100% | handoff lands on stable Method section state | target section, final bbox, residual scroll delta |

Acceptance:

- The pilot transition can report the active phase.
- The pilot passes forward and reverse visual samples.
- No adapter needs to infer pilot handoff timing from unrelated scroll state.
- A Go/No-Go decision is recorded before expanding the contract to other transitions.

### Phase 1B: Expand the contract after the pilot gate

Goal: apply the contract one transition at a time only after the pilot proves the model.

Tasks:

- For the next transition to be implemented, write its keyframe spec before code changes.
- Declare its mode:
  - scroll-driven
  - snap playback with staged handoff
  - soft divider
- Declare its bridge type:
  - `entryInk`
  - `paperWash`
  - approved `snapEntry`
  - `none`
- Add phase/HUD/harness reporting for that transition only.
- Keep reduced-motion and direct-hash behavior explicit for that transition.

Acceptance:

- No global adapter rewrite starts before the pilot passes.
- Each transition gets its own keyframe spec before implementation.
- Contract expansion stops at the first transition that fails its gate.

### Phase 2: Repair the top chain: Home -> Belief -> AOD

Do Phase 2.2 as the first pilot before attempting the full chain. Pattern Bloom remains a larger timing risk and should follow after the pilot proves the contract.

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
- Closure rows #1 and #2 pass.

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
- Closure rows #3 and #4 pass with objective actualY, phase, opacity, and bbox evidence.

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
- Closure rows #5, #6, and #7 pass.

#### 3.2 Figure3 / Services

Problems:

- no handoff receiver
- no text-before-exit mechanism
- no ink entry/exit

Tasks:

- Add a Services handoff receiver similar to AOD/Method, but tuned to Figure3.
- Introduce copy entry during the final clean/white portion of Figure3.
- Add the bridge declared by the per-transition keyframe spec.
- Ensure Brand -> Figure3 -> Services does not depend on abrupt section reveal.

Acceptance:

- Figure3 ending visibly leads into Services copy.
- Services copy does not appear only after the video has already gone away.
- Closure row #8 passes.

### Phase 4: Repair Services -> Lab -> Education -> Contact

#### 4.1 TTG / Lab

Problems:

- no ink curtain
- `10784px` is TTG video, `11616px` is already lab copy
- transition feels like hard stage-to-copy movement

Tasks:

- Add TTG entry/exit ink or a consistent paper-wash handoff.
- Add a Lab copy receiver when required by the TTG/Lab keyframe spec.
- Tune reverse behavior so it does not jump back into the wrong visual state.

Acceptance:

- TTG video exits into Lab copy as one connected move.
- `10784px` to `11616px` has an intentional visual bridge.
- Closure row #9 passes.
- Divider row #10 remains tracked for local CSS cleanup after the Phase 4.1 gate.

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
- Closure row #12 passes.
- Divider row #13 remains tracked for local CSS cleanup after the Phase 4.2 gate.

#### 4.3 Crane / Contact

Problems:

- no ink entry/exit
- contact receiver exists but contact copy is absent at sampled transition points
- final contact/footer is not a clean endpoint

Tasks:

- Add Crane exit ink or final paper-wash.
- Start contact receiver early enough to be visible before the scene disappears.
- Use the Phase 4.3 input gate to choose the contact/footer endpoint before implementation:
  - full contact panel, footer below
  - or composed contact/footer final viewport
- Implement the chosen endpoint with a documented footer visible ratio, snap target, and tolerance.

Acceptance:

- `17268px` and `18097px` do not both land on a no-copy Crane/Contact transition frame.
- `18523px` resolves to an intentional final viewport, not a partially scrolled contact/footer mix.
- Closure rows #14 and #15 pass.

### Phase 5: CSS and layout cleanup

Tasks:

- Close original rows #10, #11, and #13 only after the owning transition or section timing is stable.
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
- Re-locate original #11 right-column mismatch from screenshot/scroll evidence before changing CSS.
- Fix desktop offsets only where they are actually wrong.
- Keep mobile overrides explicit.

Acceptance:

- No double horizontal rules around lab/education/contact boundaries.
- Right/left column rhythm is intentional at 1440x840.
- No new overlap or text clipping at mobile viewport.
- CSS changes do not make any transition crosswalk row regress.

## 7. Suggested Work Order

1. Phase 0 verification harness.
2. AOD -> Method pilot keyframe spec and bridge decision.
3. Phase 1A pilot-only contract.
4. AOD -> Method pilot implementation and pilot gate review.
5. Expand contract one transition at a time under Phase 1B.
6. Pattern Bloom and the rest of the top chain.
7. Figure2 and Figure3.
8. TTG, PH, Crane.
9. Local CSS cleanup for rows #10, #11, and #13 after their owning timing gates pass.
10. Full visual pass across desktop and mobile.

This order matters because the CSS issues can be measured accurately only after transition timing stops moving content into unexpected states.

## 8. Files Likely To Change

Source of truth / build inputs:

- `src/index.template.html`
- `src/section-manifest.mjs`
- `src/partials/nav.html`
- `src/partials/*.html`
- `scripts/build-index.mjs`

Generated output:

- `index.html`

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

## 9. Validation Checklist

Desktop 1440x840:

- `919px`: no dead dark field.
- `1310px`: belief transition has intentional content/copy state.
- `1699px`: belief copy is stable.
- `1843px` / `2327px` / `2937px`: Belief -> AOD continuity has no no-copy limbo frame.
- `3767px` / `4598px`: AOD handoff is deterministic and readable.
- `6198px` / `6451px`: Figure2 copy is not low/blocked.
- `6885px`: no proof/brand/figure ghost stack.
- `7873px`: Figure3 handoff is intentional.
- `8703px` / `9535px`: Figure3 ending and Services text-before-exit timing are measurable and intentional.
- `9954px` / `10784px` / `11616px`: TTG to Lab has a real bridge; `11616px` has no duplicate boundary rule.
- `12417px`: right/left column rhythm matches the approved alignment.
- `13177px` / `14007px` / `14839px`: PH to Education has a real bridge; `14839px` has no duplicate boundary rule.
- `16438px` / `17268px` / `18097px`: Crane to Contact has visible handoff copy or intentional final motion.
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
- Performance stays within the agreed budget:
  - desktop: no sustained frame budget over 24ms during transition playback
  - fallback: if ink causes sustained fps under 30 on target devices, use paper-wash or soft-divider fallback
- Chromium is the primary gate; Safari and Firefox get one post-Phase-5 smoke pass for WebGL/backdrop-filter differences.
- Startup validates the transition chain:
  - handoff targets exist
  - receiver selectors resolve
  - transition ids are unique
  - reduced-motion paths can reveal the target content

## 10. Definition Of Done

The homepage transition work is complete when:

- every major transition has an explicit entry/scene/copy/exit/handoff phase
- every row in the original 15 issues crosswalk has objective passing evidence
- screenshots prove the 1440x840 checkpoint list is visually stable
- no transition depends on accidental immediate scroll jumps for the intended visual result
- divider and column layout issues are fixed after timing is stable
- final contact/footer behavior is intentional and documented
- the pilot passed before the contract was expanded to the rest of the chain
- reduced-motion, direct hash, mobile, performance, and transition-chain self-checks pass
