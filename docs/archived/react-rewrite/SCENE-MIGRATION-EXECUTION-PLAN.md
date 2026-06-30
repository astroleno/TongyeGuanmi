# Scene Migration Execution Plan (v2.1)

**Version**: 2.1.0 (Contract-First + Progress Architecture Revision)  
**Date**: 2026-06-30  
**Status**: Executable Plan  
**Previous**: v2.0 fixed sequencing; v2.1 aligns runtime events and visual progress ownership

---

## Executive Summary

### What Changed from v1.0

**v1.0 Problem**: Jumped to AOD visual enhancement before freezing scene graph and runtime contract.

**v2.0 Fix**: Contract-first sequencing.

```
v1.0: AOD 95% → batch migration → polish
      ❌ Scene IDs inconsistent across docs
      ❌ Runtime performance risks unaddressed
      ❌ Architecture drift in examples

v2.1: Manifest freeze → Runtime P0 → Progress driver → Tech validation → Batch migration
      ✅ Single source of truth established first
      ✅ Performance contract enforced
      ✅ No architecture drift
      ✅ Per-frame visual progress no longer goes through React dispatch
```

---

## Core Principles (Retained from v1.0)

### Technology Stack

**Mobile Baseline (All Devices)**:
- SceneRuntime FSM (React)
- Native scroll + IntersectionObserver
- CSS + Web Animations API
- Canvas/WebGL/Video adapters

**Desktop Enhancement (Lazy-Loaded)**:
- +GSAP Core (optional, for complex timelines)

**Prohibited**:
- ❌ Lenis (mobile scroll hijacking)
- ❌ ScrollTrigger in main runtime (desktop-only, scene-specific)
- ❌ Theatre.js (3D-focused, not applicable)

---

## Critical Gaps Identified (Multi-Agent Review)

### 1. Scene Graph Not Frozen ⚠️ BLOCKER

**Current State**:
- `realManifest.ts`: uses `pattern-bloom`, `star-map`, `method-top`, `method-bottom`
- Original HTML: uses `belief-star`, `method-upper`, `method-lower`, `method-cocreation`, `method-tooling`, `method-proof`, `figure2-proof-cards`, `figure2-proof-closing`
- Docs: mix both conventions

**Impact**: If we start implementing scenes now, we'll build on wrong IDs and have to refactor.

**Resolution**: Phase 4.0 freezes the canonical scene graph.

---

### 2. Runtime Performance Risk ⚠️ CRITICAL

**Current Code**:
```typescript
// AODMediaAnimationAdapter.tsx (current)
const tick = (now: number) => {
  const progress = (now - start) / duration;
  dispatch({ type: 'MEDIA_PROGRESS', progress });  // ❌ Every frame
  requestAnimationFrame(tick);
};
```

**Problem**: 60fps = 60 React renders/sec = potential jank on mobile.

**Correct Pattern**:
```typescript
// Runtime events reuse the existing SceneRuntime contract.
// Per-frame progress stays in refs / external visual drivers.
visualDriver.start(({ progress }) => {
  adapterRefs.current.render(progress); // CSS vars, canvas uniforms, video UI, etc.
});

// Threshold-only reducer updates are allowed when reducer-owned state must change.
dispatch({ type: 'MEDIA_PROGRESS', segment, progress: 0.8 }); // once, triggers runtime reveal
dispatch({ type: 'SEGMENT_COMPLETE', segment });
```

**Resolution**: Phase 4.1 enforces the adapter contract and introduces a visual progress driver.

---

### 3. Bundle Size Target Unrealistic

**v1.0 Claim**: Mobile < 70KB

**Reality Check**:
- React 19 production: size must be measured from the Vite build output
- ReactDOM: ~130KB (raw), ~42KB (gzipped)
- Base estimate: ~80-100KB gzipped before large scene chunks; validate with build artifacts, not package-size guesses

**Corrected Target**:
- Initial bundle (gzipped): ~100KB (React + runtime + hero)
- Desktop enhancement: +50KB (GSAP lazy-loaded)

**Resolution**: Phase 4.0 sets measurable targets.

---

### 4. Architecture Drift Examples in v1.0

**Problem Code in v1.0 Plan**:
```typescript
// ❌ New action type not in FSM contract
dispatch({ type: 'HOLD_AT_KEYFRAME' });

// ❌ GSAP directly manipulating DOM, bypassing ownership
gsap.to(fromScene, { opacity: 0 });

// ❌ Mobile crossfade bypassing canvasOwner
return <CrossfadeTransition from={from} to={to} />;
```

**Resolution**: Phase 4.1 documents allowed patterns, Phase 4.2 validates in practice.

---

### 5. Runtime Event Drift ⚠️ BLOCKER

**Rule**: No implementation may invent new `RuntimeEvent` names inside adapters or scenes.

Current allowed events are defined in `react-runtime-spike/src/runtime/types.ts`. If a new event is truly required, update this order:

1. `docs/react-rewrite/07-SCENE-RUNTIME-CONTRACT.md`
2. `src/runtime/types.ts`
3. `src/runtime/reducer.ts`
4. tests
5. adapters

Until then, Phase 4 uses existing events only:

- `SEGMENT_PROGRESS` / `MEDIA_PROGRESS` only for declared thresholds, never per frame
- `SEGMENT_COMPLETE`
- `STEP_COMPLETE`
- `SEGMENT_ERROR`
- `MEDIA_REJECTED`
- `MEDIA_METADATA_TIMEOUT`
- `MEDIA_ENDED_TIMEOUT`
- `MEDIA_MISSING`
- `REDUCED_MOTION_SKIP`
- `HASH_NAVIGATE`
- `POPSTATE_NAVIGATE`
- `SCROLL_LOCK_RECOVERY`

---

## Phase 4.0: Manifest Freeze (Week 1)

### Goal

Establish single source of truth for scene graph. No visual work yet.

### Tasks

#### Task 1: Scene Naming Reconciliation (2 days)

**Decisions to Make**:

| Original HTML | Current Spike | Decision Needed |
|---------------|---------------|-----------------|
| `belief-star` | `star-map` | Keep which? Or both as separate scenes? |
| `method-upper`, `method-lower`, `method-cocreation`, `method-tooling`, `method-proof` | `method-top`, `method-bottom` | Flatten to 2 or keep 5? |
| `figure2-proof-cards`, `figure2-proof-closing` | Not in spike | First-class scenes or sub-states? |
| `pattern-bloom` | `pattern-bloom` | ✅ Already consistent |

**Process**:
1. Read original HTML section structure
2. Map to narrative flow
3. Consult with stakeholders on scene granularity
4. Document decision rationale

**Output**: `docs/react-rewrite/SCENE-NAMING-DECISIONS.md`

---

#### Task 2: Complete Manifest Definition (3 days)

**Target Structure**:
```typescript
// realManifest.ts (frozen version)

export const scenes: SceneDefinition[] = [
  // 18-20 scenes (TBD after Task 1)
  {
    id: 'hero',
    label: 'Hero',
    minHeightVh: 100,
    capabilities: { copy: 'native', stickyStage: true },
    anchors: { hash: 'home', nav: 'Home' },
  },
  // ... all scenes with complete metadata
];

export const segments: SegmentDefinition[] = [
  // 15-18 segments (TBD after Task 1)
  {
    id: 'hero-to-belief',
    type: 'ink-transition',
    from: 'hero',
    to: 'belief-star',  // or 'pattern-bloom'? Decided in Task 1
    durationMs: 800,
    ink: { kind: 'horizontal', direction: 'center-out' },
    commitAt: 'end',
    layerOwnership: {
      visualOwner: 'hero-to-belief',
      copyOwner: 'none',
      canvasOwner: 'hero-to-belief',
      maskOwner: 'none',
      mediaOwner: 'none',
    },
  },
  // ... all segments with COMPLETE metadata
];
```

**Each Segment Must Define**:
- `type`: One of 4 types (ink-transition, media-animation, text-read, compound-sequence)
- `from` / `to`: Scene IDs (validated against scenes[])
- `layerOwnership`: All 5 layers explicitly assigned
- `reveal`: When/how next scene copy appears (if applicable)
- `fallback`: Error handling policy (video/media segments)
- `hash`: URL anchor (if scene is hash-addressable)
- `reverse`: Behavior when scrolling back (if non-default)
- `textureSource`: Asset path (if applicable)

**Validation Rules**:
1. Every scene in `scenes[]` is reachable from 'hero' via segments
2. Every segment's `from` and `to` exist in `scenes[]`
3. No orphaned scenes (except 'hero' as root)
4. No duplicate segment IDs
5. At most one segment can own each layer at any time (runtime enforces this)

**Required validation scripts**:
```json
{
  "validate:manifest": "vitest run src/manifest/manifest.contract.test.ts",
  "validate:scene-ids": "node scripts/validate-scene-ids.mjs",
  "validate:scene-graph": "node scripts/validate-scene-graph.mjs",
  "validate:ownership": "vitest run src/runtime/ownership.contract.test.ts"
}
```

**Output**: `src/manifest/realManifest.ts` (frozen by reviewed commit; git tag only after validation is green)

---

#### Task 3: Contract Document Update (1 day)

**Files to Update**:
- `docs/react-rewrite/07-SCENE-RUNTIME-CONTRACT.md`
  - Add complete scene list
  - Add segment type specifications
  - Add ownership resolution rules
- `docs/react-rewrite/SCENE-MIGRATION-MASTER-PLAN.md`
  - Sync scene IDs with frozen manifest
  - Remove inconsistencies

**Validation**: Run script to check all docs reference only scenes in frozen manifest.

---

### Deliverables

- ✅ `SCENE-NAMING-DECISIONS.md` (rationale for all choices)
- ✅ `realManifest.ts` (frozen and complete)
- ✅ `validate:manifest`, `validate:scene-ids`, `validate:scene-graph`, `validate:ownership`
- ✅ Scene graph visualization (mermaid diagram or similar)
- ✅ Contract docs updated and consistent
- 📄 **Phase 4.0 Completion Report**

### Acceptance Criteria

- [ ] All scene IDs consistent across all docs
- [ ] Every segment has complete metadata (no TODOs)
- [ ] Scene graph validates (no orphans, all reachable)
- [ ] Validation scripts pass in CI/local
- [ ] Stakeholder sign-off on scene granularity
- [ ] Git tag: `manifest-freeze-v4.0` only after all checks pass

---

## Phase 4.1: Runtime P0 - Contract Enforcement (Week 2)

### Goal

Fix runtime performance risks and enforce adapter contract. No new scenes.

### Tasks

#### Task 1: Adapter Milestone-Only Contract + Visual Progress Driver (3 days)

**Problem**: Current adapters dispatch every frame.

**Solution**: Adapters track visual progress internally or through a small external driver, and dispatch to React only at reducer-owned milestones.

**Allowed Runtime Events During PLAYING**:
```typescript
// Threshold-only progress events.
// Allowed only when reducer-owned state must change, such as runtime reveal.
'SEGMENT_PROGRESS'
'MEDIA_PROGRESS'

// Segment lifecycle / failures
'SEGMENT_COMPLETE'
'SEGMENT_ERROR'
'MEDIA_REJECTED'
'MEDIA_METADATA_TIMEOUT'
'MEDIA_ENDED_TIMEOUT'
'MEDIA_MISSING'
'REDUCED_MOTION_SKIP'

// Compound-sequence specific
'STEP_COMPLETE'

// NOT ALLOWED
'MEDIA_PROGRESS' every frame      // ❌
'SEGMENT_PROGRESS' every frame    // ❌
'SEGMENT_START'                   // ❌ not in current RuntimeEvent
'REVEAL_AT_80_PERCENT'            // ❌ not in current RuntimeEvent
```

**Progress Architecture**:
```txt
Runtime reducer
  - owns phase, activeScene, committedScene, ownership, recovery
  - receives only threshold / completion / error events

Visual progress driver
  - owns per-frame 0..1 progress
  - writes CSS variables, canvas uniforms, video UI refs, GSAP timeline progress
  - must not dispatch every frame

Scene / adapter refs
  - render visual frames from driver progress
  - never commit scenes or mutate layer ownership directly
```

**Adapter Internal Pattern**:
```typescript
export function MediaAnimationAdapter({ segmentId, config }) {
  const progressRef = useRef(0);
  const { state, dispatch } = useSceneRuntime();
  
  useEffect(() => {
    if (state.phase !== 'PLAYING') return;

    const video = videoRef.current;
    let revealed80 = false;
    
    const tick = () => {
      progressRef.current = video.currentTime / video.duration;
      visualDriver.set(segmentId, progressRef.current); // ref/external store, not React state
      
      // Milestone: 80% reveal
      if (!revealed80 && progressRef.current >= 0.8) {
        revealed80 = true;
        dispatch({ type: 'MEDIA_PROGRESS', segment: segmentId, progress: 0.8 });
      }
      
      // Continue internally, no dispatch
      if (progressRef.current < 1) {
        requestAnimationFrame(tick);
      }
    };
    
    video.addEventListener('ended', () => {
      dispatch({ type: 'SEGMENT_COMPLETE', segment: segmentId });
    });
    
    video.play();
    requestAnimationFrame(tick);
  }, [state.phase]);
  
  return null;  // Adapter renders nothing
}
```

**Refactor Scope**:
- `AODMediaAnimationAdapter.tsx`
- `InkTransitionAdapter.tsx` (if dispatching per-frame)
- `TransitionCompositeHost.tsx` / scene view models that currently read `state.segmentProgress` per frame
- introduce `visualProgressDriver` or equivalent imperative progress channel
- Any future adapters

**Validation**: React DevTools Profiler shows < 5 renders/sec during PLAYING.

---

#### Task 2: SnappedArmed + 10vh Charge (1 day)

**Current Status**: Basic ARMED logic works.

**Gaps to Fill**:
- Fast scroll (momentum) handling
- Back button during ARMED state
- Multiple rapid scroll direction changes

**Test Cases**:
```typescript
describe('SnappedArmed', () => {
  it('arms after 10vh scroll into armed zone', ...);
  it('cancels arm on reverse scroll (delta < -10)', ...);
  it('handles momentum scroll past arm threshold', ...);
  it('resets on browser back during ARMED', ...);
  it('does not double-arm on rapid scroll', ...);
});
```

---

#### Task 3: ReadingScroll Segment (1 day)

**Segment Type**: `text-read`

**Contract**:
```typescript
{
  type: 'text-read',
  from: 'method-top',
  to: 'method-bottom',
  readHeightVh: 100,  // How much to scroll
  armAfterVh: 10,     // When to arm next segment
}
```

**Runtime Behavior**:
1. User scrolls into `method-top` scene
2. Scene content scrolls naturally (no lock)
3. After `readHeightVh` scrolled, scene commits to `method-bottom`
4. After additional `armAfterVh`, next segment arms

**Implementation**: Already exists, but add tests.

---

#### Task 4: Recovery + Timeouts (2 days)

**Scenarios to Handle**:

1. **Scroll Lock Timeout** (mobile Safari edge case)
   ```typescript
   // If locked for > 10s, force recovery
   setTimeout(() => {
     if (state.scrollLock.locked) {
       dispatch({ type: 'SCROLL_LOCK_RECOVERY', reason: 'lock-timeout' });
     }
   }, 10000);
   ```

2. **Video Load Failure**
   ```typescript
   video.addEventListener('error', () => {
     dispatch({ type: 'MEDIA_MISSING', segment, src: video.currentSrc });
   });
   ```

3. **Metadata Timeout**
   ```typescript
   // If video metadata doesn't load in 5s
   const timeout = setTimeout(() => {
     dispatch({ type: 'MEDIA_METADATA_TIMEOUT', segment });
   }, 5000);
   
   video.addEventListener('loadedmetadata', () => {
     clearTimeout(timeout);
   });
   ```

4. **Reduced Motion**
   ```typescript
   const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   
   if (prefersReducedMotion && segment.type === 'media-animation') {
     // Show poster, skip to end
     dispatch({ type: 'REDUCED_MOTION_SKIP' });
   }
   ```

**Fallback Policies** (defined in manifest):
```typescript
fallback: {
  onPlayRejected: 'show-poster-and-complete',
  onMetadataTimeout: 'show-poster-and-complete',
  onEndedTimeout: 'force-complete-and-commit',
  onMissingMedia: 'recover-to-committed-scene',
  reducedMotion: 'poster-and-skip',
}
```

---

#### Task 5: Hash/Back/Forward (2 days)

**Requirements**:

1. **URL Hash Sync**
   ```typescript
   // On scene commit
   if (scene.anchors?.hash) {
     window.history.replaceState(null, '', `#${scene.anchors.hash}`);
   }
   ```

2. **Direct Hash Access**
   ```typescript
   // On mount, if URL has hash
   const hash = window.location.hash.slice(1);
   const targetScene = scenes.find(s => s.anchors?.hash === hash);
   if (targetScene) {
     dispatch({ type: 'HASH_NAVIGATE', scene: targetScene.id });
   }
   ```

3. **Browser Back/Forward**
   ```typescript
   window.addEventListener('popstate', () => {
     const hash = window.location.hash.slice(1);
     const targetScene = scenes.find(s => s.anchors?.hash === hash);
     if (targetScene && targetScene.id !== state.committedScene) {
       dispatch({ type: 'POPSTATE_NAVIGATE', scene: targetScene.id });
     }
   });
   ```

**Edge Cases**:
- Back during PLAYING (should cancel, return to previous scene)
- Forward to unvisited scene (should skip intermediate scenes)
- Hash to middle of chain (should initialize from that scene)

---

### Deliverables

- ✅ Adapter contract enforced (milestone-only dispatch)
- ✅ Performance profiling clean (< 5 React renders/sec during animation)
- ✅ All P0 runtime features tested (100+ test cases)
- ✅ Hash/back/forward working in manual testing
- 📄 **Phase 4.1 Runtime P0 Report**

### Acceptance Criteria

- [ ] React DevTools shows < 5 renders/sec during PLAYING
- [ ] Mobile FPS ≥ 55fps on iPhone SE during ink transition
- [ ] All recovery paths have tests
- [ ] Browser back/forward doesn't break runtime state
- [ ] Reduced motion tested and working

---

## Phase 4.2: Tech Validation - AOD + GSAP + Video (Week 3)

### Goal

Validate technical approach on one complex scene (AOD) before batch migration.

### Why AOD?

- Representative complexity (video + layers + parallax)
- Already 40% complete (not starting from zero)
- Original code well-documented (aod-scroll.js)
- Critical for narrative (Ancient of Days)

### Tasks

#### Task 1: AOD Scene Enhancement (2 days)

**From 40% → 95%**:

1. **Background Paper Texture**
   ```typescript
   // AODScene.tsx
   <div style={{
     backgroundImage: 'url(/assets/aod-paper-bg.png)',
     backgroundSize: 'cover',
     backgroundBlendMode: 'multiply',
   }}>
   ```

2. **Speed Curves (visual-only acceleratedProgress)**
   ```typescript
   // From aod-scroll.js
   function acceleratedProgress(raw: number): number {
     const t = Math.max(0, Math.min(1, raw));
     return 0.78 * t + 0.22 * t * t;  // Slight acceleration
   }
   
   // Main path: video autoplay owns media time.
   // Do not seek currentTime every frame.
   visualDriver.subscribe(segmentId, (progress) => {
     const p = acceleratedProgress(progress);
     rootRef.current?.style.setProperty('--aod-visual-progress', String(p));
     sunRef.current?.style.setProperty('--aod-sun-y', `${-200 * p}px`);
   });
   ```

   `video.currentTime` is allowed only for reset, poster setup, reduced-motion, or an explicitly approved scrub fallback. It is not the primary playback driver.

3. **Complete Parallax**
   ```typescript
   // From aod-scroll.js: mouse parallax
   const handleMouseMove = (e: MouseEvent) => {
     const x = (e.clientX / window.innerWidth - 0.5) * 2;
     const y = (e.clientY / window.innerHeight - 0.5) * 2;
     
     if (sunRef.current) {
       sunRef.current.style.transform = 
         `translate(${x * -4}px, ${y * -3}px)`;
     }
     if (cloudRef.current) {
       cloudRef.current.style.transform = 
         `translate(${x * -6}px, ${y * -4}px)`;
     }
   };
   
   window.addEventListener('mousemove', handleMouseMove);
   ```

4. **Figure Scale/Position Alignment**
   ```typescript
   // From aod-scroll.js constants
   const FIGURE_START_SCALE = 0.62;
   const FIGURE_START_Y_VH = 7.5;
   
   <video style={{
     transform: `scale(${FIGURE_START_SCALE}) translateY(${FIGURE_START_Y_VH}vh)`,
     objectFit: 'cover',
   }} />
   ```

**Validation**: Screenshot comparison with original (SSIM > 0.90).

---

#### Task 2: GSAP Lazy-Load POC (2 days)

**Goal**: Prove GSAP can be code-split without breaking ownership contract.

**Implementation**:
```typescript
// hooks/useGSAPTimeline.ts
export function useGSAPTimeline(
  shouldLoad: boolean,
  buildTimeline: (gsap: GSAP) => GSAPTimeline
) {
  const [timeline, setTimeline] = useState<GSAPTimeline | null>(null);
  
  useEffect(() => {
    if (!shouldLoad) return;
    
    import('gsap').then(({ gsap }) => {
      const tl = buildTimeline(gsap);
      setTimeline(tl);
    });
    
    return () => timeline?.kill();
  }, [shouldLoad]);
  
  return timeline;
}

// AODScene.tsx (desktop enhancement example)
const shouldUseGSAP = !isMobile && performanceTier >= MEDIUM;

const timeline = useGSAPTimeline(shouldUseGSAP, (gsap) => {
  return gsap.timeline({ paused: true })
    .to(sunRef.current, { y: -200, opacity: 0, duration: 0.5 })
    .to(cloudRef.current, { y: -300, opacity: 0, duration: 0.5 }, '<');
});

// Runtime phase starts/stops the adapter; visual progress driver advances timeline.
useEffect(() => {
  if (!timeline) return;
  return visualDriver.subscribe(segmentId, (progress) => {
    timeline.progress(progress);
  });
}, [timeline, segmentId]);
```

**Critical**: GSAP operates only on refs inside the adapter-owned visual/canvas/media layer. It must not commit scenes, change owner state, hide native target copy, or directly mutate `fromScene` / `toScene` DOM outside the layer host.

**Bundle Analysis**:
```bash
npm run build -- --analyze
# Verify:
# - Initial bundle (no GSAP): ~100KB
# - GSAP chunk (lazy): ~50KB
# - GSAP only loads when needed
```

---

#### Task 3: Adapter Contract Real-World Test (1 day)

**Verify**: AOD media-animation adapter follows milestone-only pattern.

**Test**:
```typescript
// Monitor React renders during AOD segment
const renderCount = useRef(0);
useEffect(() => { renderCount.current++; });

// After 3 seconds (video playing):
expect(renderCount.current).toBeLessThan(10);  // Not 180 (60fps * 3s)
```

**Profile**: Chrome DevTools Performance tab, ensure no layout thrashing.

---

#### Task 4: Video Decode Performance (2 days)

**Test Matrix**:

| Device | Resolution | Alpha | FPS | Result |
|--------|-----------|-------|-----|--------|
| iPhone SE 2020 | 1080p | Yes | ? | TBD |
| iPhone SE 2020 | 720p | Yes | ? | TBD |
| iPhone SE 2020 | 480p | Yes | ? | TBD |
| iPhone 12 | 1080p | Yes | ? | TBD |
| MacBook Air M1 | 1080p | Yes | ? | TBD |

**Baseline**: iPhone SE must hit ≥50fps with chosen resolution.

**Outcome**: Document recommended video specs per device tier.

---

### Deliverables

- ✅ AOD scene 95% complete (visual fidelity P0+P1)
- ✅ GSAP lazy-load pattern proven
- ✅ Adapter contract validated in practice
- ✅ Video performance baseline established
- 📄 **Phase 4.2 Tech Validation Report**
- 📄 **Video Encoding Guidelines** (resolution per device tier)

### Acceptance Criteria

- [ ] AOD passes visual comparison (SSIM > 0.90)
- [ ] GSAP loads only when needed (bundle analysis confirms)
- [ ] React renders < 10 during 3s AOD playback
- [ ] iPhone SE plays AOD video ≥50fps
- [ ] No ownership contract violations detected

---

## Phase 4.3+: Batch Scene Migration (Week 4-8)

### Sequencing

Now that manifest is frozen and runtime is proven, batch migration can proceed safely.

**Priority Order** (from frozen manifest):

1. **P0 Chain** (Week 4): hero → belief-star → aod → method-*
   - Ensures core narrative works end-to-end
   
2. **P1 Expansion** (Week 5): + figure2 → brand
   - Adds questioning transition
   
3. **P2 Content** (Week 6): services, lab, education, philosophy, contact
   - Text-heavy scenes (faster to migrate)
   
4. **P3 Transitions** (Week 7): crane, figure3, ph, ttg
   - Complex transitions (desktop GSAP enhancements)

5. **Polish** (Week 8): Visual QA, performance tuning, accessibility

### Per-Scene SOP (Retained from v1.0)

```
Day 1: Analysis
  - Read original HTML/CSS/JS
  - Extract constants → SCENE_CONSTANTS.ts
  - Screenshot keyframes

Day 2: Mobile Implementation
  - React component
  - CSS layout
  - Render only from runtime view model / layer ownership
  - Test on iPhone SE

Day 3: Desktop Enhancement (if needed)
  - Detect capability
  - Lazy-load GSAP
  - Enhanced timeline

Day 4: Integration + Validation
  - Register component/adapter against frozen manifest entry
  - Run manifest drift check before any graph change
  - E2E test
  - Visual verification (SSIM)
  - Performance check
```

**Estimate**: 3-4 days per scene × 15 scenes = 45-60 days (9-12 weeks)

**Parallelization**: Can migrate 2-3 scenes in parallel once pattern is established.

---

## Acceptance Criteria (Updated from v1.0)

### Visual Fidelity

**P0 (Must Pass)**:
- [ ] Z-index hierarchy correct
- [ ] Position within ±5px
- [ ] Size within ±3%
- [ ] Colors ΔE < 3
- [ ] Typography identical

**P1 (Should Pass)**:
- [ ] Scroll transforms visually similar
- [ ] Blur transitions smooth
- [ ] Opacity curves aligned
- [ ] Scale/rotation correct

**P2 (Nice to Have)**:
- [ ] Easing functions exact (±10% tolerance)
- [ ] Duration precise (±100ms)

### Performance

**Mobile (iPhone SE 2020)**:
- [ ] Initial load < 1.5s (3G)
- [ ] Scroll FPS ≥ 50fps
- [ ] Memory < 150MB peak
- [ ] Bundle ~100KB (gzipped, initial)

**Desktop (MacBook Air M1)**:
- [ ] Initial load < 1.0s
- [ ] Scroll FPS = 60fps
- [ ] Memory < 300MB peak
- [ ] Bundle ~150KB (gzipped, with GSAP)

### Functionality

- [ ] All segments in frozen manifest working
- [ ] Hash navigation working
- [ ] Browser back/forward working
- [ ] Reduced motion honored
- [ ] All recovery paths tested

---

## Risk Register

| Risk | Probability | Impact | Mitigation | Owner |
|------|-------------|--------|------------|-------|
| Scene naming decision blocked | Medium | High | Escalate to stakeholder by Day 2 | PM |
| Adapter refactor breaks existing scenes | Low | High | Test hero/method scenes after refactor | Dev |
| GSAP bundle size exceeds budget | Low | Medium | Verify with webpack-bundle-analyzer | Dev |
| Video performance inadequate on low-end | Medium | Critical | Test early (Phase 4.2), adjust resolution | Dev |
| Timeline slippage in batch migration | High | Low | Buffer built in, can defer P3 scenes | PM |

---

## Success Metrics

### Phase 4.0 (Manifest Freeze)

- ✅ Zero scene ID inconsistencies across all docs
- ✅ Stakeholder sign-off obtained
- ✅ Git tag created

### Phase 4.1 (Runtime P0)

- ✅ React renders < 5/sec during animation
- ✅ Mobile FPS ≥ 55fps
- ✅ 100+ tests passing

### Phase 4.2 (Tech Validation)

- ✅ AOD visual SSIM > 0.90
- ✅ GSAP lazy-load proven
- ✅ Video baseline documented

### Phase 4.3+ (Launch Readiness)

- ✅ All P0+P1 scenes complete
- ✅ Performance targets met
- ✅ E2E tests green
- ✅ Stakeholder UAT passed

---

## Appendix A: Milestone-Only Adapter Contract

### Allowed Events

```typescript
// Existing RuntimeEvent names only.
// Progress events are threshold-only, not frame events.
type MilestoneEvent =
  | { type: 'SEGMENT_PROGRESS'; segment: string; progress: number }
  | { type: 'MEDIA_PROGRESS'; segment: string; progress: number }
  | { type: 'SEGMENT_COMPLETE'; segment: string }
  | { type: 'SEGMENT_ERROR'; segment: string; reason: string }
  | { type: 'STEP_COMPLETE'; step: string }
  | { type: 'MEDIA_REJECTED'; segment: string; reason: string }
  | { type: 'MEDIA_METADATA_TIMEOUT'; segment: string }
  | { type: 'MEDIA_ENDED_TIMEOUT'; segment: string }
  | { type: 'MEDIA_MISSING'; segment: string; src: string }
  | { type: 'REDUCED_MOTION_SKIP' };
```

### Prohibited Patterns

```typescript
// ❌ DO NOT dispatch per-frame progress
requestAnimationFrame(() => {
  dispatch({ type: 'MEDIA_PROGRESS', segment, progress });  // Every frame
});

// ❌ DO NOT invent new event types not in RuntimeEvent union
dispatch({ type: 'ANIMATION_TICK', segment, frame });  // Not defined
dispatch({ type: 'HOLD_AT_KEYFRAME' });  // Not defined
dispatch({ type: 'REVEAL_AT_80_PERCENT', segment });  // Not defined (use MEDIA_PROGRESS at 0.8)
```

### Rationale

**Problem**: React re-renders entire tree on every dispatch.

**Solution**: Adapters manage progress internally through refs / visual drivers, and dispatch only discrete milestones or threshold progress.

**Benefit**: 60fps animation with < 5 React renders/sec.

---

## Appendix B: Performance Tier Detection

```typescript
enum PerformanceTier {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

function detectTier(): PerformanceTier {
  const cores = navigator.hardwareConcurrency || 2;
  const memory = (navigator as any).deviceMemory || 2;
  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
  
  if (cores >= 6 && memory >= 4 && !isMobile) {
    return PerformanceTier.HIGH;
  }
  
  if (cores >= 4 && memory >= 2) {
    return PerformanceTier.MEDIUM;
  }
  
  return PerformanceTier.LOW;
}

// Usage
const tier = detectTier();
const shouldUseGSAP = tier >= PerformanceTier.MEDIUM && !isMobile();
```

---

## Appendix C: Bundle Size Measurement

```bash
# Production build
npm run build

# Analyze
npx vite-bundle-visualizer

# Verify targets:
# - dist/index.html: metadata
# - dist/assets/index-[hash].js: main bundle (~100KB gzipped)
# - dist/assets/gsap-[hash].js: lazy chunk (~50KB gzipped)
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-06-30 | Initial vision draft (incorrect sequencing) |
| 2.0.0 | 2026-06-30 | Contract-first revision (executable plan) |
| 2.1.0 | 2026-06-30 | Align runtime event contract, add visual progress driver, remove seek/scrub ambiguity |

---

## Sign-off

- [ ] Technical Lead: Contract-first sequencing approved
- [ ] Product: Scene granularity decisions delegated to Phase 4.0
- [ ] Design: Visual fidelity criteria understood
- [ ] QA: Acceptance criteria measurable

---

## Appendix D: Visual Progress Driver Interface

### Purpose

Provides per-frame animation progress to adapters and scene components **without triggering React re-renders**.

### Two Driver Types

**1. Time-Based Driver** (for non-media animations like ink transitions)
- Drives progress based on `performance.now()` and `durationMs`
- Predictable timing, not affected by media decode delays

**2. Media-Based Driver** (for video autoplay animations)
- Drives progress based on `video.currentTime / video.duration`
- Syncs to actual video playback, handles decode delays correctly

### Interface

```typescript
// src/runtime/visualProgressDriver.ts

interface VisualProgressCallback {
  (progress: number): void;
}

interface TimeBasedDriver {
  /**
   * Subscribe to per-frame progress updates.
   * @param segmentId - Segment identifier
   * @param callback - Called every frame with progress (0.0 - 1.0)
   * @returns Unsubscribe function
   */
  subscribe(segmentId: string, callback: VisualProgressCallback): () => void;

  /**
   * Start driving progress based on wall-clock time.
   * @param segmentId - Segment identifier
   * @param durationMs - Total duration in milliseconds
   */
  start(segmentId: string, durationMs: number): void;

  /**
   * Stop driving progress.
   */
  stop(segmentId: string): void;

  /**
   * Reset all subscriptions and timers.
   */
  reset(): void;
}

interface MediaBasedDriver {
  /**
   * Subscribe to per-frame progress updates.
   * @param segmentId - Segment identifier
   * @param callback - Called every frame with progress (0.0 - 1.0)
   * @returns Unsubscribe function
   */
  subscribe(segmentId: string, callback: VisualProgressCallback): () => void;

  /**
   * Start driving progress based on video playback.
   * @param segmentId - Segment identifier
   * @param video - HTMLVideoElement reference to sync with
   */
  start(segmentId: string, video: HTMLVideoElement): void;

  /**
   * Stop driving progress.
   */
  stop(segmentId: string): void;

  /**
   * Reset all subscriptions and timers.
   */
  reset(): void;
}
```

### Implementation Location

`src/runtime/visualProgressDriver.ts`

### Exports

```typescript
export const timeDriver: TimeBasedDriver;
export const mediaDriver: MediaBasedDriver;
```

### Usage Patterns

**For ink transitions (time-based)**:
```typescript
useEffect(() => {
  if (state.phase !== 'PLAYING') return;

  const unsubscribe = timeDriver.subscribe(segmentId, (progress) => {
    // Update DOM directly (no React state)
    canvasRef.current?.updateProgress(progress);
  });

  timeDriver.start(segmentId, durationMs);

  return () => {
    timeDriver.stop(segmentId);
    unsubscribe();
  };
}, [state.phase]);
```

**For media animations (video-based)**:
```typescript
useEffect(() => {
  if (state.phase !== 'PLAYING') return;
  
  const video = videoRef.current;
  if (!video) return;

  const unsubscribe = mediaDriver.subscribe(segmentId, (progress) => {
    // Update visual elements based on video progress
    rootRef.current?.style.setProperty('--progress', String(progress));
  });

  mediaDriver.start(segmentId, video);

  return () => {
    mediaDriver.stop(segmentId);
    unsubscribe();
  };
}, [state.phase]);
```

### Key Benefits

1. **60fps without React overhead**: DOM updates bypass React reconciliation
2. **Centralized timing**: One rAF loop for all animations
3. **Easy testing**: Mock driver for unit tests
4. **Progressive enhancement**: Can add more sophisticated easing/curves without touching adapters

### Integration with Runtime

- Visual driver is **independent** of reducer state
- Runtime dispatches only threshold events (e.g., 80% reveal)
- Driver provides smooth interpolation between thresholds

