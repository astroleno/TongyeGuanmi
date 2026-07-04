# Scene Transition Issues Analysis - 2026-07-04

## Commit Context
Reviewing commit `1f282e7` "Handle stalled Figure3 media handoff" and current state of scene transitions.

### What 1f282e7 Fixed
- Added media stall fallback for Figure3 scene player
- When video stalls (no progress for 900ms while timeline advances), switches to timeline-based scrubbing
- Ensures 80% early copy handoff happens even if video gets stuck
- Adds explicit trace event: `media-stall-fallback`

## Current Issues Report

### 🔴 Critical: Incomplete Scene Handoffs (80% of transitions)

**Core Problem**: Most transitions have either `from` OR `to` scene present, not both simultaneously.

Current behavior shows `to` scene appearing more frequently, which means:
- Source scene exits too early
- Target scene appears before source finishes
- No proper crossfade/overlap period

**Manifestation**: Transitions look like: `from → blank → to` or just `to` (source missing entirely)

---

### Issue 1: Hero → Pattern Transition ⚠️

**Expected**: Pattern should be in **expanded state** after transition completes
**Actual**: Pattern appears in **collapsed state**
**Result**: Creates "open-close-open" visual glitch

**Root Cause**: Pattern bloom scene doesn't retain terminal state from transition

**Manifest Location**:
- Block ID: `hero-to-pattern` (line 594-619 in scene-timeline-manifest.js)
- Transition type: `ink-transition` with `radial-center` expand
- Pattern scene: `pattern-bloom` (line 363-371)

**Likely Issue**: Pattern scene player doesn't receive/honor the expanded terminal state from the ink transition.

---

### Issue 2: Pattern → Star-map Transition 🔴

**Problems**:
1. Star-map appears, disappears, then reappears (flicker)
2. Star-map is stretched beyond 100vh instead of properly filling viewport

**Root Cause**:
- Texture projection timing issue
- Canvas sizing/scaling problem in starmap provider

**Manifest Location**:
- Block ID: `pattern-to-belief` (line 620-645)
- Target scene: `belief-star` (line 373-383)
- Canvas element: `data-belief-star-field`

**Technical Detail**: Star-map likely has incorrect initial state or sizing during texture projection phase.

---

### Issue 3: Star-map → AOD Transition 🔴

**Problems**:
1. Same flicker issue as pattern → star-map
2. AOD playback doesn't 1:1 replicate main timeline
3. Visual misalignment during playback

**Root Cause**:
- Possibly missing mask in first half of AOD animation
- AOD scene adapter may not be correctly copying visual state

**Manifest Location**:
- Block ID: `belief-to-aod` (line 646-671)
- Scene: `aod-animation` (line 385-396)
- Adapter: `js/runtime/scenes/aod-scene-adapter.js`

**Investigation Needed**: Check if AOD's initial frame mask/composition matches the source scene.

---

### Issue 4: Belief 80% Early Copy Positioning ⚠️

**Problems**:
1. Early copy text entrance covers the AOD video below (should not)
2. Text positioned too low (should be higher)

**Expected Behavior**:
- At 80% of AOD animation, belief copy enters
- Copy should appear ABOVE the video content
- Background should fade in AFTER animation completes (not during)

**Manifest Location**:
- AOD scene config: line 392-396 (copy.enterAtRemaining: 0.2)
- Copy element: `.belief-copy-wrap` (HTML line 91-93)

**Root Cause**: Z-index or layout stacking issue during early copy entrance.

---

### Issue 5: Figure2 Stage 1 - Video Not Playing 🔴

**Problem**: During first stage scroll, video doesn't play

**Manifest Location**:
- Block ID: `figure2-play` (line 717-733)
- Scene: `figure2-animation` with stages (line 424-437)
- Stage: `camera-expand` (first stage)

**Root Cause**: Media playback gate or stage progression logic not triggering video.

---

### Issue 6: Figure2 Stage 2 - Missing Ink Transition 🔴

**Problem**: No ink drop transition between Figure2 stages

**Expected**: Ink drop effect between arch-with-cards → arch-with-closing stages

**Manifest Location**:
- Figure2 stages: line 431-436
- Stages: camera-expand, arch-with-cards, arch-with-closing, ink-sweep

**Root Cause**: Stage transition logic doesn't include ink effect between internal stages.

---

### Issue 7: Figure2 End → "同野观幂做第四种..." Missing 🔴

**Problem**: Full-screen text doesn't appear after Figure2 stage 2 ends

**Expected Content**: "同野观幂做第四种：先进现场，再定章法，陪你跑到账上有数。"

**Manifest Location**:
- HTML line 139: `.method-proof__closing` in `figure2-proof-closing` scene
- Scene ID: `figure2-proof-closing` (line 455-469)

**Root Cause**: Scene not being presented or visibility controlled incorrectly.

---

### Issue 8: Horizontal Arch → Brand Transition Not Obvious ⚠️

**Problem**: Bottom-to-top horizontal ink drop transition to brand is not visible/obvious

**Manifest Location**:
- Block ID: `figure2-proof-to-brand` (line 735-759)
- Ink type: `horizontal-irregular` direction `bottom-up`

**Root Cause**: Ink transition may be too subtle or timing is off.

---

### Issue 9: Figure3 Occupies Both From/To in Transition 🔴

**Problem**: During bottom-to-top ink transition to figure3-animation, figure3 occupies BOTH from and to states

**Manifest Location**:
- Block ID: `brand-to-figure3` (line 761-785)

**Root Cause**: Figure3 scene is rendering before transition completes, creating duplicate visual.

---

### Issue 10: Services 80% Early Copy Problems 🔴

**Problems**:
1. Services section occupies figure3's screen during early copy
2. Services background is wrong color (should be light, not dark)

**Expected**:
- Services copy enters at 80% while figure3 video still playing
- Light background for services section
- Should not cover figure3 content

**Manifest Location**:
- Figure3 config: line 494-497 (copy.targetScene: "services", enterAtRemaining: 0.2)
- Services section: line 164-181
- Services copy: `.enterprise-vertical-layout` (HTML line 166)

**Root Cause**:
1. Z-index/stacking issue
2. Background color theme not applied correctly

---

### Issue 11: Crane → Contact Early Copy Wrong Order 🔴

**Problem**: Text occupies screen during early copy, but text should appear FIRST (not cover animation)

**Manifest Location**:
- Crane config: line 1008-1011 (copy.targetScene: "contact", enterAtRemaining: 0.2)
- Contact section: line 264-275

**Root Cause**: Similar to services - early copy z-index/visibility order incorrect.

---

### Issue 12: Education Title Has 4 Dividing Lines ❓

**Problem**: Education section title has 4 dividing lines

**Expected**: (Need clarification - should it have fewer? Different style?)

**Manifest Location**:
- Education section: HTML line 223-253
- Section header: line 227 with `section-index`

**Status**: UNCLEAR - need to verify if this is still an issue or if it's the expected design.

---

### Issue 13: Contact Background Color Wrong 🔴

**Problem**: Contact section background became dark (should be light)

**Expected**: Light background to match theme

**Manifest Location**:
- Contact section: HTML line 264
- Theme attribute: `data-section-theme="light"`

**Root Cause**: CSS theme application or overridden by transition state.

---

## Root Cause Categories

### A. Scene Lifecycle Issues (Most Critical)
- Scenes not maintaining presence during handoff window
- Early exit of source scenes
- Late entrance of target scenes
- Missing "both scenes present" overlap period

### B. Early Copy Positioning Issues
- Z-index stacking problems
- Copy covering animation content instead of appearing above/alongside
- Background timing (should appear after, not during)

### C. State Preservation Issues
- Pattern not retaining expanded state
- AOD not 1:1 replicating source visual state

### D. Media Playback Issues
- Figure2 stage 1 video not playing
- Stage transition effects missing

### E. Visibility/Presentation Issues
- Missing full-screen text reveal
- Sections not appearing when expected

### F. Theme/Styling Issues
- Background colors not applying correctly
- Section themes being overridden

---

## Investigation Priority

1. **HIGH**: Scene lifecycle - why are from/to scenes not both present during transitions?
2. **HIGH**: Early copy z-index and positioning system
3. **MEDIUM**: Pattern terminal state preservation
4. **MEDIUM**: Figure2 media playback gates
5. **MEDIUM**: AOD visual replication accuracy
6. **LOW**: Theme application consistency

---

## Next Steps

1. Read scene runtime core to understand scene lifecycle
2. Read early copy implementation in scene harness players
3. Check z-index/stacking CSS for early copy elements
4. Verify figure2 compound scene player media gates
5. Test in browser to confirm which issues still exist
