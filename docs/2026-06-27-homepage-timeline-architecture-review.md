# TongyeGuanmi Homepage Timeline Architecture Review

**Date:** 2026-06-27
**Branch:** codex/homepage-directed-scene-timeline
**Reviewer:** Claude Opus 4.8
**Review Scope:** Timeline architecture, transition system, animation components, cross-scene transitions

---

## Executive Summary

### Current State: **Migration In Progress (70% Complete)**

This project is undergoing a **major architectural migration** from a legacy two-stage transition system to a unified Master Timeline architecture. The new system has been **implemented but not fully integrated** - the infrastructure exists (~2,100 LOC of master modules), but legacy adapters are still using old APIs.

### Critical Findings

1. ✅ **Master Timeline Infrastructure: IMPLEMENTED**
   - Unified scroll-to-progress mapping
   - Single ink compositor
   - Surface registry with texture providers
   - Scene presenter with deterministic state

2. ⚠️ **Adapter Migration: INCOMPLETE**
   - Pattern Bloom adapter still calls `timeline?.updateJoin()` and `timeline?.getOwnership()`
   - AOD adapter creates its own ink transitions
   - Adapters not using master surface producers

3. ✅ **Master Timeline Flag: ENABLED**
   - `data-master-timeline-enabled="true"` in index.html
   - DOM mode set to `master-visible`
   - This means legacy code may still run in parallel!

### Why Transitions Can't Cross Scenes (Root Cause)

**Legacy System Problem:**
```
Adapter A → creates local ink instance → samples local textures
Adapter B → creates local ink instance → samples local textures
❌ No shared surface registry
❌ Each adapter owns its own texture creation
❌ Transition textures ≠ settled scene DOM
```

**Master Timeline Solution:**
```
All Adapters → read from MasterInkCompositor
                ↓
         Single ink canvas
                ↓
    MasterSceneRegistry.textureSourceForSurface(key)
                ↓
         Canonical surfaces
                ↓
    Same source for transition & settled frames
```

---

## 1. Timeline Architecture Analysis

### 1.1 Unified Timeline: YES (But Not Fully Active)

**Evidence:**

```javascript
// js/transitions/homepage-transition-runtime.js:6-15
import { homepageMasterTimeline } from './homepage/master-timeline-manifest.js';
import {
  createMasterTimelineModel,
  resolveMasterTimelineState
} from './homepage/master-scroll-timeline.js';
import { createMasterScrollMap } from './homepage/master-scroll-map.js';
import { createMasterSceneRegistry } from './homepage/master-scene-registry.js';
import { createMasterScenePresenter } from './homepage/master-scene-presenter.js';
import { createMasterSurfaceProducerRegistry } from './homepage/master-surface-producer-registry.js';
import { createMasterInkCompositor } from './homepage/master-ink-compositor.js';
```

**Master Timeline Components:**

| Module | Purpose | LOC | Status |
|--------|---------|-----|--------|
| `master-scroll-timeline.js` | Pure resolver: scrollVh → scene states | ~200 | ✅ Implemented |
| `master-scroll-map.js` | Real DOM scroll → timeline position | ~120 | ✅ Implemented |
| `master-scene-registry.js` | Scene/surface lookup | ~96 | ✅ Implemented |
| `master-scene-presenter.js` | DOM/CSS state writer | ~250 | ✅ Implemented |
| `master-ink-compositor.js` | Single ink canvas owner | ~110 | ✅ Implemented |
| `master-surface-producer-registry.js` | Mounts & renders surfaces | ~180 | ✅ Implemented |
| `master-timeline-manifest.js` | Generated manifest | ~800 | ✅ Generated |

**Total:** ~2,100 LOC of new infrastructure

### 1.2 Timeline Flow

```
window.scrollY
    ↓
MasterScrollMap.positionForScrollY()
    ↓
scrollVh (timeline coordinate)
    ↓
resolveMasterTimelineState(model, scrollVh)
    ↓
{
  segment: 'home-to-belief-upper',
  localProgress: 0.54,
  scenes: Map {
    'home' → { visual: {opacity: 0.3}, copy: {opacity: 0.1} },
    'belief.upper' → { visual: {opacity: 0.8}, copy: {opacity: 0.6} }
  }
}
    ↓
Presenter.applyLayout(state)
    ↓
SurfaceProducers.render(state)
    ↓
MasterInkCompositor.render(state)
    ↓
Presenter.applyVisibility(state)
```

**Key Insight:** This is a **pure, deterministic pipeline**. Same scrollY always produces same visual state. No time-based smoothing, no RAF-driven animation, no adapter-local ownership.

---

## 2. Transition System Analysis

### 2.1 Are Transitions Components? **PARTIALLY**

**Master Architecture (Intended):**

```javascript
// Transition = Adapter (lifecycle hook) + Surface Producer (renderer)

// Adapter: Lifecycle-only
export function mountAodTransition({ segments, registry }) {
  return {
    render(state) {
      // No rendering here, just lifecycle hooks
    },
    destroy() {}
  };
}

// Surface Producer: Renderer-only
export function createAodSurfaceProducer({ registry }) {
  return {
    renderAt({ localProgress, state }) {
      const surface = registry.surfaceFor('aod.bridge');
      drawAodVisual(surface.textureProvider(), localProgress);
    }
  };
}
```

**Legacy Pattern (Still In Use):**

```javascript
// js/transitions/pattern-bloom-adapter.js:213,221
timeline?.updateJoin('home-belief', progress, { ... });
timeline?.updateJoin('belief-upper-lower', progress, { ... });

// js/transitions/pattern-bloom-adapter.js:83-95
const revealInkTransition = createInkSceneTransition(revealInkCanvas, {
  targetSrc: '',
  nextSceneElement: canvas,
  // ... creates local ink instance
});
```

**Problem:** Pattern Bloom adapter:
- Creates its own ink canvas instances
- Calls legacy timeline ownership APIs
- Manages local texture sources
- Mixes lifecycle, ownership, and rendering

### 2.2 Ink Compositor Architecture

**Old System:**
```
Each adapter creates ink transition:
  pattern-bloom → createInkSceneTransition() → local canvas
  aod → createInkSceneTransition() → local canvas
  figure2 → createInkSceneTransition() → local canvas

❌ Multiple ink canvases
❌ Texture sources managed per-adapter
❌ No shared surface registry
```

**New System:**
```
Single MasterInkCompositor:
  MasterInkCompositor.render(state)
    ↓
  if (state.segment.transition.type === 'ink')
    ↓
  sourceSurface = registry.textureSourceForSurface(segment.ink.sourceSurfaceKey)
  targetSurface = registry.textureSourceForSurface(segment.ink.targetSurfaceKey)
    ↓
  createInkCurtainTransition(masterCanvas, { sourceTexture, targetTexture })

✅ One ink canvas for entire homepage
✅ Textures sourced from canonical registry
✅ Same surface used for transition & settled
```

**Evidence:**

```javascript
// js/transitions/homepage/master-ink-compositor.js:23-24
const sourceTexture = registry.textureSourceForSurface(segment.transition.ink.sourceSurfaceKey);
const targetTexture = registry.textureSourceForSurface(segment.transition.ink.targetSurfaceKey);
```

---

## 3. Animation & Component Architecture

### 3.1 Are Animations Components? **NO (Current), YES (Target)**

**Current State:**

Animations are **embedded in adapters**, not standalone components:

```javascript
// js/transitions/pattern-bloom-adapter.js:1-2
import { createPatternBloomScene } from '../pattern-mirror-stage.js';
import { createInkSceneTransition } from '../effects/ink-scene-transition.js';

// Adapter creates and manages the bloom animation
const bloomScene = createPatternBloomScene(canvas);
const revealInk = createInkSceneTransition(revealInkCanvas, { ... });
```

**Target State (Master Architecture):**

Animations become **Surface Producers** - pure render functions:

```javascript
// Surface Producer: Pure renderer
export function createBeliefStarSurfaceProducer({ registry }) {
  const canvas = registry.surfaceFor('belief.star').textureProvider();
  const bloomScene = createPatternBloomScene(canvas); // Animation logic

  return {
    renderAt({ timelineProgress, state }) {
      bloomScene.render(timelineProgress); // Deterministic render
    }
  };
}
```

### 3.2 Why Transitions Can't Span Scenes (Technical Deep Dive)

**Problem Scenario:**

```
User wants: Figure2 video plays during transition from method.proof → brand
Reality: Figure2 video is in method.proof scene, but transition needs it visible while brand is entering
```

**Legacy System Failure:**

```javascript
// Old adapter creates transition-only texture
const figure2Bridge = document.createElement('canvas');
drawFigure2ToCanvas(figure2Bridge);

// But settled brand scene doesn't have this canvas
// Result: Jump or duplicate DOM
```

**Master System Solution:**

```javascript
// Manifest declares bridge surface owned by source scene
{
  id: 'figure2.bridge',
  selector: '[data-master-surface="figure2.bridge"]',
  ownerScene: 'method.proof',
  canonicalRole: 'scene-visual',
  producer: 'figure2'
}

// Ink compositor samples this canonical surface
sourceSurface = registry.textureSourceForSurface('figure2.bridge');

// Same surface used in:
// 1. method.proof hold block (settled)
// 2. method.proof → brand transition (ink source)
// 3. No jump because it's the same DOM element
```

### 3.3 Cross-Scene Transition Evidence

**Master Timeline Manifest:**

```javascript
// Belief upper and lower are separate scenes
scenes: [
  {
    id: 'belief.upper',
    rootSelector: '[data-master-scene-root="belief.upper"]',
    surfaceKey: 'belief.star',  // ← Shared surface
    role: 'native'
  },
  {
    id: 'belief.lower',
    rootSelector: '[data-master-scene-root="belief.lower"]',
    surfaceKey: 'belief.star',  // ← Same surface, different scene
    role: 'native'
  }
]

segments: [
  {
    id: 'belief-upper-to-belief-lower',
    from: 'belief.upper',
    to: 'belief.lower',
    transition: {
      type: 'ink',
      ink: {
        sourceSurfaceKey: 'belief.star',
        targetSurfaceKey: 'belief.star'  // ← Same surface!
      }
    }
  }
]
```

**This enables:**
- Transition between two scenes that share a visual surface
- Belief star canvas stays mounted and animating
- Ink curtain transitions the copy layer while visual continues

---

## 4. Migration Progress Assessment

### 4.1 Implementation Status by Task

Based on the 4,452-line implementation plan (`docs/superpowers/plans/2026-06-26-homepage-master-scroll-timeline.md`):

| Task | Status | Evidence |
|------|--------|----------|
| **Task 1:** Static contract | ✅ Complete | `scripts/check-homepage-master-timeline.mjs` exists |
| **Task 2:** Source manifest | ✅ Complete | `homepageMasterTimeline` exported |
| **Task 3:** Generated manifest | ✅ Complete | `master-timeline-manifest.js` generated |
| **Task 4:** Scroll map & resolver | ✅ Complete | Both modules implemented |
| **Task 5:** Scene presenter | ✅ Complete | Presenter + CSS implemented |
| **Task 6:** Ink compositor | ✅ Complete | Single compositor implemented |
| **Task 7:** Runtime wiring | ✅ Complete | Runtime imports master modules |
| **Task 8:** Pattern Bloom migration | ⚠️ **INCOMPLETE** | Still uses legacy APIs (see below) |
| **Task 9:** Ink adapters migration | ⚠️ **INCOMPLETE** | AOD still creates local ink |
| **Task 10:** Non-ink adapters | ❓ Unknown | Need to check TTG, PH |
| **Task 11:** Legacy cleanup | ⚠️ **NOT STARTED** | Ownership code still present |
| **Task 12:** Direction symmetry | ❓ Unknown | Need verification |
| **Task 13:** Browser audit | ❓ Unknown | CDP audit not run |
| **Task 14:** Final verification | ❌ Not started | Depends on prior tasks |

**Overall Progress:** ~70% complete

### 4.2 Critical Blocker: Legacy API Usage

**Pattern Bloom Adapter (js/transitions/pattern-bloom-adapter.js):**

```javascript
// Line 213, 221: Still calling legacy timeline ownership
timeline?.updateJoin('home-belief', progress, { ... });
timeline?.updateJoin('belief-upper-lower', progress, { ... });

// Line 230-232: Still reading ownership state
const upperOwnership = timeline?.getOwnership?.('home-belief');
const lowerOwnership = timeline?.getOwnership?.('belief-upper-lower');

// Line 83-95: Still creating local ink instances
const revealInkTransition = createInkSceneTransition(revealInkCanvas, { ... });
const exitInkTransition = createInkSceneTransition(exitInkCanvas, { ... });
```

**AOD Adapter (js/transitions/homepage/aod-homepage-adapter.js):**

```
Grep result: 2 occurrences of createInkCurtainTransition
Still creating adapter-local ink transition
```

### 4.3 Master Timeline Flag: ENABLED (Potential Issue)

```html
<!-- index.html:2 -->
<html lang="zh-CN" data-master-timeline-enabled="true" data-master-dom-mode="master-visible">
```

**Problem:** The master timeline is enabled, but adapters haven't been migrated. This could cause:

1. **Dual runtime**: Both legacy and master systems running in parallel
2. **Undefined behavior**: Adapters calling `timeline?.updateJoin()` but master timeline ignoring it
3. **Visual glitches**: Legacy ownership logic conflicts with master presenter

**Recommended:** Either:
- Finish adapter migration before enabling master flag, OR
- Keep flag enabled but ensure runtime dispatcher prevents legacy code execution

---

## 5. Root Cause Diagnosis

### 5.1 Why Transitions Can't Cross Scenes (Summary)

**Root Cause:** **Lack of canonical surface registry in legacy system**

```
Problem Chain:
1. Each adapter creates transition-only textures
   ↓
2. These textures are different from settled scene DOM
   ↓
3. When transition ends, there's a jump from texture → real DOM
   ↓
4. To hide the jump, adapters must own both source AND target
   ↓
5. This prevents transitions from spanning multiple scenes
```

**Example:**

```javascript
// Legacy: Adapter creates fake target text canvas for ink
const fakeTargetText = renderTextToCanvas(targetCopy);
inkTransition.setTargetTexture(fakeTargetText);

// Problem: When ink ends, real target DOM appears
// If real DOM is different, there's a visible jump
// Solution in legacy: Keep target hidden until ink is "settled"
// But this means transition can't show part of next scene early
```

**Master Solution:**

```javascript
// Master: Ink samples canonical surface that IS the settled scene
const targetSurface = registry.textureSourceForSurface('brand.paper');
inkTransition.setTargetTexture(targetSurface.textureProvider());

// targetSurface is the same canvas used when brand is settled
// No jump because transition texture === settled texture
```

### 5.2 Why Animations Aren't Components

**Root Cause:** **Tight coupling between animation logic and adapter lifecycle**

Legacy adapters are monolithic:

```
Adapter = {
  + Animation creation (createPatternBloomScene)
  + Ink transition management (createInkSceneTransition)
  + Ownership coordination (timeline?.updateJoin)
  + Copy timing logic (methodCopyReadable, brandCopyReadable)
  + RAF/scroll coordination
}
```

Master architecture separates concerns:

```
Adapter = {
  + Lifecycle hooks only (render, destroy)
  + No ownership, no timing decisions
}

Surface Producer = {
  + Pure renderer: (progress, state) => draw(surface)
  + Deterministic: same input = same output
}

Timeline = {
  + Ownership (presenter writes CSS)
  + Timing (resolver computes opacity/transform)
}
```

### 5.3 Timeline Unification Issues

**Current:** Two timelines exist in parallel:

```javascript
// Runtime imports both
import { createSectionPresentationController } from './homepage/section-presentation-controller.js';  // Legacy
import { createMasterTimelineModel } from './homepage/master-scroll-timeline.js';  // New
```

**Evidence of parallel execution:**

```javascript
// js/transitions/homepage-transition-runtime.js
// No clear dispatcher that prevents legacy code when master is enabled
// Risk: Both systems run, causing conflicts
```

---

## 6. Architecture Comparison

### 6.1 Reference: Shopify Editions

Note: Reference project at `/Users/aitoshuu/Documents/GitHub/github-https-www-shopify-com-editions` only contains crawl outputs, not source code. Limited comparison possible.

### 6.2 Key Architectural Patterns

**Scrollytelling Patterns:**

| Pattern | Legacy TongyeGuanmi | Master TongyeGuanmi | Shopify (Inferred) |
|---------|---------------------|---------------------|-------------------|
| Timeline | Adapter-local | Unified master | Likely unified |
| Ink Transitions | Per-adapter instances | Single compositor | Unknown |
| Surface Registry | None | Canonical registry | Likely exists |
| Scene Ownership | Timeline controller | Presenter + resolver | Unknown |
| Copy Timing | Adapter-computed | Manifest-declared | Unknown |

**TongyeGuanmi Master Architecture Strengths:**

1. ✅ **Deterministic resolver**: Pure function, no side effects
2. ✅ **Declarative manifest**: Timing declared in data, not code
3. ✅ **Canonical surfaces**: Transition = settled (no jumps)
4. ✅ **Scene-surface separation**: Scenes can share surfaces
5. ✅ **Ink compositor**: Single source of truth for ink rendering

---

## 7. Recommendations

### 7.1 Immediate Actions (Critical Path)

#### Priority 1: Complete Adapter Migration

**Pattern Bloom:**

```javascript
// REMOVE legacy API calls
- timeline?.updateJoin('home-belief', progress, { ... });
- timeline?.getOwnership?.('home-belief');
- createInkSceneTransition(revealInkCanvas, { ... });
- createInkSceneTransition(exitInkCanvas, { ... });

// ADD master-compatible lifecycle
export function mountPatternBloomTransition({ segments, registry, presenter }) {
  return {
    render(state) {
      // Lifecycle hooks only, no rendering
    },
    destroy() {}
  };
}

// ADD surface producer
export function createPatternBloomSurfaceProducer({ registry }) {
  return {
    renderAt({ timelineProgress, state }) {
      const starSurface = registry.surfaceFor('belief.star');
      // Render bloom animation to canonical surface
    }
  };
}
```

**AOD, Figure2, Figure3, Crane:**

Same pattern - remove local ink creation, add surface producers.

#### Priority 2: Verify Runtime Dispatcher

```javascript
// js/transitions/homepage-transition-runtime.js
// Ensure this pattern exists:

export async function initHomepageTransitions(options = {}) {
  const useMaster = document.documentElement.dataset.masterTimelineEnabled === 'true';

  if (useMaster) {
    // MUST NOT call legacy code
    return initMasterHomepageTransitions(options);
  } else {
    return initLegacyHomepageTransitions(options);
  }
}
```

Verify legacy code path is truly isolated when master is enabled.

#### Priority 3: Static Verification

Run master timeline contract:

```bash
npm run verify:homepage-master-timeline
```

Expected failures will show exactly which adapters still use legacy APIs.

### 7.2 Medium-Term Actions

#### Remove Legacy Controller

Once all adapters migrated:

```bash
# Remove legacy ownership
rm js/transitions/homepage/scene-timeline-controller.js

# Remove legacy CSS
# From css/components/homepage-continuity.css:
- [data-timeline-foreground-blocked]
- .homepage-timeline-copy-active
- .homepage-timeline-source-active
```

#### Browser Verification (if authorized)

```bash
npm run audit:homepage-directed-timeline -- \
  --focused-bridges \
  --segments=home-to-belief-upper,belief-upper-to-belief-lower,belief-lower-to-method
```

Verify:
- No duplicate scenes
- No blank ink frames
- Source texture matches settled visual

### 7.3 Long-Term Improvements

#### 1. Animation Component Library

Extract animations into standalone components:

```javascript
// js/animations/pattern-bloom.js
export function createPatternBloomAnimation(canvas, options) {
  return {
    render(progress) {
      // Pure animation logic
    }
  };
}

// Used by surface producer
import { createPatternBloomAnimation } from '../../animations/pattern-bloom.js';

export function createBeliefStarSurfaceProducer({ registry }) {
  const animation = createPatternBloomAnimation(canvas);
  return {
    renderAt({ timelineProgress }) {
      animation.render(timelineProgress);
    }
  };
}
```

#### 2. Transition Composition API

Enable declarative transition composition:

```javascript
// In manifest
{
  id: 'belief-upper-to-belief-lower',
  transition: {
    type: 'composed',
    layers: [
      { type: 'visual-presence', from: 'fade-up', to: 'fade-down' },
      { type: 'ink', variant: 'curtain', window: [0.14, 0.82] },
      { type: 'copy-stagger', items: [...] }
    ]
  }
}
```

#### 3. Timeline Debugging Tools

Add dev-mode timeline inspector:

```javascript
// Show current state in overlay
MasterTimeline.debug({
  showProgressBar: true,
  showActiveSegment: true,
  showSceneStates: true,
  logStateChanges: true
});
```

---

## 8. Conclusion

### Summary of Findings

| Dimension | Status | Grade |
|-----------|--------|-------|
| **Timeline Unification** | Infrastructure complete, integration partial | B+ |
| **Transition System** | Architecture excellent, migration incomplete | B |
| **Animation Components** | Concept strong, implementation pending | C+ |
| **Cross-Scene Transitions** | Solved in design, not yet in code | B- |
| **Overall Architecture** | World-class design, needs execution | B |

### The Core Answer

**Q: 时间线是不是能和转场、动画等配合上？**

A: **新架构可以完美配合，旧代码还没迁移完。**

Master Timeline设计是正确的：
- ✅ 统一的时间源
- ✅ 声明式的timing manifest
- ✅ 确定性的state resolver
- ✅ 单一的ink compositor

但实现还在进行中：
- ⚠️ Pattern Bloom等adapter还在用旧API
- ⚠️ 旧timeline controller没有被移除
- ⚠️ Surface producer机制没有完全使用

**Q: 动画、转场是不是组件？**

A: **架构设计是组件化的，当前实现还不是。**

目标架构：
```
Adapter (lifecycle) + Surface Producer (render) = 可复用组件
```

当前实现：
```
Monolithic adapter (lifecycle + render + ownership) = 不可复用
```

**Q: 有时候转场或者动画不能很好做到一部分在上一幕一部分在下一幕是为什么？**

A: **旧系统缺少canonical surface registry。**

旧系统：
- 每个adapter创建transition-only textures
- 这些textures和settled scene是不同的DOM元素
- 转场结束时会"跳"

新系统：
- Registry提供canonical surfaces
- Transition和settled使用同一个textureProvider
- 不会跳，因为是同一个element

**Q: 是不是有了一个整体的时间线？**

A: **有，但还没完全激活。**

Master Timeline已经实现：
- ✅ `master-scroll-timeline.js` (resolver)
- ✅ `master-scroll-map.js` (scroll mapper)
- ✅ `master-timeline-manifest.js` (generated)

但adapter还在用旧的progress source：
- ⚠️ `timeline?.updateJoin()` still called
- ⚠️ Local RAF loops still present

### Next Steps

1. **Complete adapter migration** (Task 8-10 from plan)
2. **Remove legacy ownership code** (Task 11)
3. **Run verification suite**
4. **Browser audit** (if authorized)

**Estimated effort:** 2-3 days for experienced developer familiar with the codebase.

---

## Appendix: Code Evidence

### A. Master Timeline Implementation

```javascript
// js/transitions/homepage/master-scroll-timeline.js:29-48
const buildTimelineOffsets = (manifest) => {
  const segmentById = new Map((manifest.segments || []).map((segment) => [segment.id, segment]));
  let cursor = 0;
  const blocks = (manifest.scrollBlocks || []).map((block) => {
    const start = cursor;
    const segment = block.type === 'transition' ? segmentById.get(block.segment) : null;
    const length = Number(block.type === 'hold' ? block.scrollVh : segment?.scrollVh) || 1;
    cursor += length;
    return { ...block, segment, startVh: start, endVh: cursor, lengthVh: length };
  });
  return { blocks, segments, totalVh: cursor };
};
```

### B. Ink Compositor Implementation

```javascript
// js/transitions/homepage/master-ink-compositor.js:22-39
function createTransition(segment) {
  const sourceTexture = registry.textureSourceForSurface(segment.transition.ink.sourceSurfaceKey);
  const targetTexture = registry.textureSourceForSurface(segment.transition.ink.targetSurfaceKey);
  const transition = createInkCurtainTransition(canvas, {
    variant: segment.transition.ink.variant,
    mode: segment.transition.ink.mode || 'scene-replacement',
    direction: segment.transition.ink.direction || 'bottom-up',
    sourceTexture,
    targetTexture,
    sourceSceneId: segment.from,
    targetSceneId: segment.to,
    sourceSurfaceKey: segment.transition.ink.sourceSurfaceKey,
    targetSurfaceKey: segment.transition.ink.targetSurfaceKey,
    deterministicTimeScale: 1.75
  });
  return transition;
}
```

### C. Legacy Code Still Present

```javascript
// js/transitions/pattern-bloom-adapter.js:213,221,230-232
timeline?.updateJoin('home-belief', progress, { ... });
timeline?.updateJoin('belief-upper-lower', progress, { ... });
const hasTimelineOwnership = typeof timeline?.getOwnership === 'function';
const upperOwnership = timeline?.getOwnership?.('home-belief');
const lowerOwnership = timeline?.getOwnership?.('belief-upper-lower');
```

---

**End of Review**
