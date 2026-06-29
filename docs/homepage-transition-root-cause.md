# Homepage Transition Bug Root Cause

Date: 2026-06-24

This document is investigation only. It does not change runtime behavior.

## Short Verdict

The pasted diagnosis is directionally correct: the eight visible bugs are not eight isolated animation bugs. They come from one missing frame contract across the homepage transition system.

The more precise root cause is:

1. Multiple timing owners are active in the same frame.
2. Transition visuals and final section presentation are split across different owners.
3. Some adapters temporarily move real target DOM into transition layers.
4. Global `.reveal` ScrollTrigger still controls copy visibility for sections that the transition runtime also treats as handoff targets.

The pasted diagnosis over-attributes several symptoms to `pattern-bloom-adapter.js`. That adapter explains the first belief-scene failures, but AOD, figure2, figure3, and crane have additional roots in the snap runtime, handoff receiver, section presentation controller, CSS gates, and global reveal code.

## Accuracy Of The Pasted Diagnosis

Accurate:

- The failures are structural, not only threshold bugs.
- There is no single source of truth for scene progress, section readiness, copy visibility, and transition completion.
- Transition and presentation can appear as two separate systems to the viewer.
- CSS is being used as a late-stage logic layer through state classes, opacity variables, hidden gates, and `!important`.
- Patching opacity thresholds can move the failure from one transition to another.

Needs correction:

- `topSceneOpacity`, `canvasRevealed`, and `lotusOpacity` directly explain `home-belief`; they do not directly explain AOD blank frames, figure2 post-scroll blanks, figure3 disappearing copy, or crane/contact flashes.
- The current code does not always literally mount a new presentation layer after transition. In AOD, figure2, and crane, `createHandoffReceiver()` temporarily adopts the real target DOM into a transition receiver and later restores it. The visual result still feels like two systems, but the mechanism is DOM ownership transfer plus scroll timing, not only remounting.
- `overlayActive`, `sceneReady`, and `secondRevealProgress` are mostly pattern-bloom-local triggers. Crane/contact flashing is more strongly tied to receiver preview/restore timing and immediate scroll completion.
- The Shopify reference should be treated as an architectural comparison, not as proof that their implementation is GSAP/ScrollTrigger-based. The local production crawl shows a central section/background state and render-layer crossfade pattern; it is not useful as a line-by-line source template.

## Accuracy Of The Later Timing Diagnosis

The later diagnosis is also directionally useful, but it needs calibration before implementation.

Supported by local code:

- `js/ui/reveal.js` globally sets `.reveal` nodes hidden and then lets ScrollTrigger reveal them.
- `js/transitions/homepage-transition-runtime.js` owns snap playback, scroll locking, target gates, after-playback completion, post-scroll completion, and direct-hash alignment.
- `js/transitions/homepage/handoff-receiver.js` really does move target DOM into a transition receiver and then restore it.
- `js/transitions/homepage/section-presentation-controller.js` marks a section presented and can immediately suppress its next entry animation.
- `js/transitions/pattern-bloom-adapter.js` has its own local pin, overlay, belief copy, and scene opacity timeline.
- The Shopify crawl contains a centralized section/background state pattern with `activeSection`, `sectionMap`, `transitionProgress`, and next-section rendering. That supports the principle of one canonical scene state.

Needs correction:

- The root problem is broader than "scroll-driven vs playback-driven progress". Playback can be acceptable if it is one input policy under one scene ownership contract. The bug appears because progress, copy reveal, DOM ownership, CSS gates, and section commit are controlled by different systems.
- `home-belief` is explicitly `data-transition-drive="scroll"`. There is no evidence that its handoff is driven by the snap playback controller. Its black/early-cut issues are better explained by pattern-bloom local thresholds, body cover state, pinned belief CSS variables, and target section reveal ownership.
- Shopify should not be described as definitely "Rive State Machine only" or "Theatre.js only". The local crawl includes Rive assets and Theatre project-state asset references, but the visible background bundle also includes React Three Fiber/WebGL, a `SectionSyncSystem`, crossfade uniforms, and centralized state. The safe conclusion is a single section state feeding render layers, not a specific mandate to adopt Rive or Theatre.js.
- Figure2's `introProgress = range01(progress, 0, 0.72)` and `transitionProgress = range01(progress, 0.72, 1)` are staged ranges, not a literal moment where intro jumps from 1 to 0. The risk is the lack of an overlapping target presentation contract after stage completion, especially with post-scroll handoff and the brand receiver.
- AOD's `fadeOutStart: 0.82` is not "ink has completed at 0.82"; it is the start of fade-out. The blank risk is still real, but the cause is the interaction of ink progress, receiver restore, immediate target scroll, reveal suppression, and CSS gates.
- The second-scene perlin/no-stretch and centered-copy issue is primarily scene identity and visual contract drift. It should not be attributed to AOD's DOM receiver unless the observed frame is actually inside the AOD handoff.
- Repeated `alignDirectHashTarget()` timers are a direct-hash recovery path. They can contribute when loading directly to a target hash, but the ordinary crane-to-contact flash is more directly explained by showing contact inside the receiver, restoring it, then scrolling to native contact.

## Code Evidence

### Runtime owns scroll and playhead timing

`js/transitions/homepage-transition-runtime.js` owns the snap coordinator, transition playhead, scroll locking, stage stops, post-scroll handoff, and final programmatic scroll.

Important behavior:

- Snap transitions lock scrolling and animate a synthetic playhead with `requestAnimationFrame`.
- Some transitions complete by immediately scrolling to the target section.
- Post-scroll handoff waits for a second progress source, separate from the main transition playhead.
- `beginTargetRevealGate()` can hide the target section while a transition is active.

This means a transition can be visually complete while the native section is still gated, suppressed, or controlled by another reveal system.

### Pattern bloom owns a separate local scene semantic timeline

`js/transitions/pattern-bloom-adapter.js` owns local concepts such as:

- `overlayActive`
- `canvasRevealed`
- `secondRevealProgress`
- `beliefPinned`
- `beliefSceneOpacity`
- `beliefCopyProgress`
- `topSceneOpacity`

The expression below creates a real discontinuity risk for the belief transition:

```js
topSceneOpacity = canvasRevealed && secondRevealProgress < 0.998
  ? Math.min(lotusOpacity, beliefPinned ? 0.18 : 1)
  : 0;
```

That logic can make the previous scene, next scene, and copy opacity disagree during the same frame. It is a direct suspect for the first and second belief-scene symptoms.

### Handoff receiver moves real target DOM

`js/transitions/homepage/handoff-receiver.js` does not just draw a visual preview. It inserts a marker, creates a placeholder, adds `homepage-handoff-receiver__content`, moves the source into a receiver, then restores it later.

This creates a fragile race:

1. The transition shows target content inside the transition layer.
2. Runtime completes the transition and may scroll immediately.
3. Receiver restores the content to the native section.
4. Global reveal or CSS gates may still be in another state.

This is the main reason the viewer can see duplicated, missing, or flashing target content after AOD, figure2, and crane.

### Global reveal owns copy visibility independently

`js/ui/reveal.js` creates GSAP ScrollTriggers for `.reveal` nodes:

- It starts them hidden with `autoAlpha: 0` and `y: 24`.
- It later animates them visible based on viewport position.
- Handoff helpers can kill or suppress those controls, but the ownership is negotiated after the fact.

For sections without an explicit handoff owner, like `brand-services` to `#services`, copy visibility can still be reset by `.reveal` after the transition visual has completed.

### CSS participates as logic

`css/components/homepage-continuity.css` and `css/components/homepage-transitions.css` define visibility and layout states such as:

- `.homepage-transition-target-gated`
- `data-section-transition-state="gated-in"`
- `.homepage-handoff-receiver`
- `body.is-pattern-bloom-covering`
- pattern-bloom pinned state classes and CSS variables

These are useful presentation hooks, but they currently decide visibility alongside JavaScript state. That makes CSS a third timing owner.

## Symptom Map

| User symptom | Most likely root |
| --- | --- |
| 图一：第一幕转第二幕上后变黑，再出现完整第二幕上 | Pattern-bloom local timeline can set previous scene opacity to 0 before belief copy/scene is committed. Body-level covering CSS can also hide hero layers before the target is fully owned. |
| 图二：第二幕上莲花未收束就切到第二幕下，右侧文字没展示 | `secondRevealProgress`, lotus exit, belief pinning, and copy progress are separate local thresholds instead of one labeled scene timeline. |
| 图三：第二幕下不是指定的 perlin/no-stretch 版本，字也不居中 | Scene identity is not canonical. Variant choice, ink transition options, image fit, and copy layout are split across adapter constants, assets, and CSS. |
| 图四：第二幕下转 AOD 墨滴后显示的不是 AOD，而是未退出的第二幕下 | AOD transition and target presentation are separate owners; transition completion can happen before target section ownership is committed. |
| 图五：AOD 转场后没有紧跟后文，而是空白 | `after-playback` immediate scroll, receiver restore, target reveal suppression, and `.reveal` timing can leave a gap where neither transition receiver nor native section copy is visible. |
| 图六：figure2 第二阶段和文字后不是后文而是空白 | figure2 uses a staged playhead plus post-scroll handoff plus a brand receiver. The brand section can remain gated or unrevealed while the visual playhead has finished. |
| 图七：figure3 转场完成后文字不见 | figure3 has no handoff target owner. Services copy remains owned by global `.reveal`, so transition completion does not guarantee text presentation. |
| 图八：crane 动画后先闪 contact，再 contact | Crane previews `.contact-endpoint` through the receiver, restores it, then the runtime scrolls to native contact. That can show contact twice. |

## Core Contract Missing

The homepage needs a single frame contract:

```txt
For any animation frame:
  one scene is exiting or presented
  one scene is entering or presented
  one owner controls each visible copy block
  one progress value decides transition, target readiness, and copy visibility
```

The current system instead allows:

```txt
runtime progress says transition is complete
adapter progress says local scene is still exiting
receiver says target DOM is temporarily in the transition
CSS says target section is gated
global reveal says copy is hidden until viewport trigger fires
```

That is why the symptoms cluster around black frames, empty frames, duplicate content, and copy being eaten.

## Updated Root Cause Hierarchy

Primary root:

- Missing scene ownership contract. At each boundary, the runtime does not have one canonical answer for `from`, `to`, `progress`, `visual owner`, `copy owner`, and `commit point`.

Secondary roots:

- Progress policy is split. Some joins are scroll-derived, some are snap playback-derived, and figure2 adds post-scroll progress. This is manageable only if target presentation is committed by one state owner.
- Real DOM is used as transition material. `createHandoffReceiver()` creates a second visual ownership phase by adopting and restoring target content.
- `.reveal` is global. It can hide or replay target copy after the transition system believes that copy is already presented.
- CSS gates are logic. Target sections can be hidden by CSS while JavaScript believes handoff is complete.

Implementation implication:

- Do not start by converting every transition to pure scroll-driven playback.
- Start by introducing a scene timeline owner and making every adapter report to it.
- Then decide per join whether its progress policy is scroll, snap playback, staged playback, or post-scroll.
- The final invariant is not "everything is scroll"; it is "one state owns the frame".

## Shopify Comparison

The useful Shopify lesson is not a specific library. The useful lesson is ownership:

- A central section/scroll state decides which section is active.
- Section identity is stable.
- Sticky sections and reveals are composed around one progression model.
- The final scene content is not treated as a second, late-mounted presentation after the transition.

For this repo, the comparable target is a manifest-driven homepage scene timeline where each transition join declares:

- source scene
- target scene
- transition module
- target copy owner
- commit label
- reduced-motion behavior
- debug name

Adapters should render visuals from the same state object rather than inventing local semantic timelines.

## Required Fix Direction

The durable fix should not start by adjusting opacity clamps. It should first define these invariants:

1. Every transition join has one canonical `from` scene and one canonical `to` scene.
2. Every target copy block has exactly one owner: native section, transition visual, or global reveal. A block cannot be owned by two systems in the same frame.
3. Transition adapters do not move real target DOM. They may render decorative bridge visuals, but native content remains in its section.
4. Global `.reveal` skips timeline-owned target content.
5. CSS reflects JavaScript state. CSS does not decide whether a scene has been consumed or committed.
6. Transition completion and target presentation commit happen in the same runtime transaction.
7. Pattern-bloom scene variants are named and centralized so the perlin/no-stretch second-scene version cannot drift.

## Non-Goals

- Do not rewrite visual art direction in the root-cause step.
- Do not tune thresholds until the ownership contract is in place.
- Do not use Playwright for this investigation unless explicitly requested.
- Do not treat the Shopify production bundle as source code to copy.
