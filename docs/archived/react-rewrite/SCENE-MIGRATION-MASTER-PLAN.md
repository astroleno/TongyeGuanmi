# Scene Migration Master Plan

**Version**: 1.0.0  
**Date**: 2026-06-30  
**Status**: Phase 4 Planning  
**Tech Stack Decision**: Mobile baseline B + Desktop enhancement (GSAP Core optional)

---

## Executive Summary

### Migration Strategy

**Core Principle**: Mobile-first performance with desktop enhancement

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Base Architecture** | SceneRuntime FSM (React) | Proven in Phase 0-3, mobile-friendly |
| **Mobile Animation** | CSS + Web Animations API + rAF | Zero bundle overhead, native performance |
| **Desktop Enhancement** | +GSAP Core (optional, lazy-loaded) | Premium animation quality for capable devices |
| **Scroll Management** | Native scroll + IntersectionObserver | Mobile-optimized, no Lenis |
| **Extreme Performance** | Canvas/WebGL/Video adapters | Offload to GPU, proven in Phase 3 |

**禁用清单**:
- ❌ Lenis (mobile scroll hijacking issues)
- ❌ ScrollTrigger in main runtime (desktop-only, lazy-loaded for specific scenes)
- ❌ Theatre.js (3D-focused, not applicable)

---

## Phase 0-3 Current State

### Completed (Phase 3)

| Component | Status | Notes |
|-----------|--------|-------|
| SceneRuntime FSM | ✅ 95% | 6-state machine validated |
| Layer Ownership | ✅ 100% | 5-layer model working |
| Scroll Lock | ✅ 100% | Double rAF verification |
| 80% Reveal | ✅ 100% | copyOwner switching working |
| Ink Transition (WebGL) | ✅ 100% | FBM noise shader |
| Media Animation | ✅ 95% | Auto-play + progress tracking |
| AOD Scene | ⚠️ 40% | Basic structure, missing details |
| Pattern/Star | ⚠️ Canvas rebuild | Not original code migration |

### Technical Debt

1. **AOD Scene Details**:
   - Missing: Background paper texture
   - Missing: Speed curves (acceleratedProgress)
   - Missing: Full parallax implementation
   - Simplified: Visual effects

2. **Pattern/Star Scenes**:
   - Current: Canvas rebuild (procedural generation)
   - Original: Complex GSAP timeline animations
   - Decision needed: Keep rebuild or migrate original

3. **Missing Scenes**:
   - belief-star
   - method-upper, method-lower, method-cocreation, method-tooling, method-proof
   - figure2 (questioning transition)
   - brand, services, lab (scenarios), education, philosophy
   - contact
   - crane, figure3, ph, ttg transitions

---

## Technology Stack Matrix

### Core Stack (All Scenes)

```typescript
// Phase 4 base architecture
SceneRuntime FSM (React)
  ↓
Native scroll + IntersectionObserver
  ↓
CSS transitions (simple animations)
  ↓
Web Animations API (complex timings)
  ↓
Performance tier detection
```

### Scene-Specific Enhancements

| Scene Type | Mobile | Desktop | Lazy Load |
|------------|--------|---------|-----------|
| **Simple Text** | CSS only | CSS only | - |
| **Complex Animation** | CSS + Web Animations | +GSAP Core | ✅ |
| **Video** | Native `<video>` | Native `<video>` | - |
| **Canvas** | Adapter (existing) | Adapter (existing) | - |
| **WebGL** | Adapter (existing) | Adapter (existing) | - |
| **Transition** | Adapter (existing) | +GSAP timeline (optional) | ✅ |

### Bundle Size Budget

| Tier | Target | Components |
|------|--------|------------|
| **Core** | 50KB | React + Runtime + Adapters |
| **+ Simple Scenes** | +20KB | CSS + inline styles |
| **+ GSAP Core** | +50KB | Desktop enhancement (lazy) |
| **Total (Mobile)** | 70KB | Core + Simple Scenes |
| **Total (Desktop)** | 120KB | + GSAP lazy-loaded |

---

## Scene Inventory & Migration Plan

### Scene Classification

| Priority | Scene | Original Tech | Migration Strategy | Estimated Effort |
|----------|-------|---------------|-------------------|------------------|
| **P0** | hero | WebGL + GSAP | ✅ Complete (Phase 3) | - |
| **P0** | aod-animation | Video + GSAP timeline | Enhance existing (40% → 95%) | 3 days |
| **P0** | method-top | Text + CSS | ✅ Complete (Phase 3) | - |
| **P0** | method-bottom | Text + CSS | ✅ Complete (Phase 3) | - |
| **P1** | belief-star | Canvas stars | CSS + Canvas adapter | 2 days |
| **P1** | pattern-bloom | GSAP timeline | Evaluate rebuild vs migrate | 3 days |
| **P1** | star-map | Canvas + GSAP | Evaluate rebuild vs migrate | 3 days |
| **P1** | method-upper | Text reveal | CSS + IntersectionObserver | 1 day |
| **P1** | method-lower | Text + cards | CSS + IntersectionObserver | 2 days |
| **P2** | figure2-animation | Video + GSAP | Video adapter + timeline | 4 days |
| **P2** | brand | Text layout | CSS only | 1 day |
| **P2** | services | Text + list | CSS only | 1 day |
| **P2** | lab | Text + screen | CSS only | 1 day |
| **P2** | education | Text + list | CSS only | 1 day |
| **P2** | philosophy | Text grid | CSS only | 1 day |
| **P2** | contact | Form + text | CSS + form logic | 1 day |
| **P3** | crane transition | GSAP timeline | Canvas/GSAP hybrid | 3 days |
| **P3** | figure3 transition | GSAP timeline | Canvas/GSAP hybrid | 2 days |
| **P3** | ph transition | GSAP timeline | Canvas/GSAP hybrid | 2 days |
| **P3** | ttg transition | GSAP timeline | Canvas/GSAP hybrid | 2 days |

**Total Estimated Effort**: 32 days (6.4 weeks)

---

## Migration SOP (Standard Operating Procedure)

### Per-Scene Workflow

```
Step 1: Original Code Analysis (0.5 day)
  ├─ Read HTML structure
  ├─ Read CSS (layout, colors, typography)
  ├─ Read JS (animations, interactions)
  ├─ Extract constants (durations, easing, positions)
  └─ Screenshot keyframes (0%, 50%, 100%)

Step 2: Technical Decision (0.5 day)
  ├─ Classify scene type (text/video/canvas/WebGL)
  ├─ Choose animation strategy (CSS/Web Animations/GSAP)
  ├─ Identify reusable components/hooks
  └─ Define acceptance criteria

Step 3: Mobile Implementation (1-2 days)
  ├─ Create scene component (React)
  ├─ Implement layout (CSS/inline styles)
  ├─ Implement animations (CSS/Web Animations API)
  ├─ Add performance tier detection
  └─ Test on low-end device (iPhone SE)

Step 4: Desktop Enhancement (0.5-1 day)
  ├─ Detect device capability
  ├─ Lazy-load GSAP if needed
  ├─ Enhance animations with GSAP timeline
  └─ Test on desktop

Step 5: Visual Verification (0.5 day)
  ├─ Screenshot comparison (SSIM > 0.90)
  ├─ Z-index verification
  ├─ Position/size verification
  ├─ Animation timing verification (±10%)
  └─ Keyframe alignment check

Step 6: Runtime Integration (0.5 day)
  ├─ Add to realManifest.ts
  ├─ Implement layerOwnership logic
  ├─ Add segment definitions
  └─ Test in full chain

Step 7: Acceptance Test (0.5 day)
  ├─ Playwright E2E (desktop + mobile)
  ├─ Performance profiling (FPS, memory)
  ├─ Cross-browser check (Chrome, Safari, Firefox)
  └─ Accessibility audit (WCAG AA)
```

---

## Acceptance Criteria

### Visual Fidelity Checklist

#### P0 (Must Pass)

- [ ] **Z-Index Hierarchy**: Layers stack correctly (background < middle < foreground < UI)
- [ ] **Position Alignment**: Elements within ±5px of original
- [ ] **Size Accuracy**: Width/height within ±3% of original
- [ ] **Color Fidelity**: ΔE < 3 (visually indistinguishable)
- [ ] **Typography Match**: Font family, size, weight, line-height identical

#### P1 (Should Pass)

- [ ] **Scroll Transform**: Direction, distance, easing visually similar
- [ ] **Blur Transitions**: Blur radius progression matches original feel
- [ ] **Opacity Curves**: Fade in/out timing aligned with keyframes
- [ ] **Scale/Rotation**: Transform origins correct, no skew artifacts

#### P2 (Nice to Have)

- [ ] **Easing Functions**: Exact match to original (can deviate ±10%)
- [ ] **Timing Precision**: Duration within ±100ms of original
- [ ] **Micro-interactions**: Hover, focus states replicated

### Video Playback Criteria

- [ ] **Auto-play Trigger**: Fires after 10vh scroll (ARMED state)
- [ ] **Progress Sync**: Runtime progress matches video currentTime
- [ ] **Speed Curves**: Keyframes at 0%, 25%, 50%, 75%, 100% aligned
- [ ] **80% Reveal**: copyOwner switches at 0.8 progress (±0.02)
- [ ] **Fallback Handling**: Poster shown on autoplay block, no crash

### Performance Criteria

#### Mobile (iPhone SE 2020, baseline)

- [ ] **First Paint**: < 1.5s on 3G
- [ ] **Scroll FPS**: ≥ 50fps continuous (60fps target)
- [ ] **Memory**: < 150MB peak
- [ ] **Bundle Size**: < 70KB (core + scenes)

#### Desktop (MacBook Air M1, baseline)

- [ ] **First Paint**: < 1.0s
- [ ] **Scroll FPS**: 60fps sustained
- [ ] **Memory**: < 300MB peak
- [ ] **Bundle Size**: < 120KB (with GSAP)

---

## Phase 4 Roadmap

### Phase 4.0: Core Tech Validation (Week 1)

**Goal**: Validate migration approach with one complex scene

**Tasks**:
1. AOD Scene Enhancement (from 40% → 95%)
   - Add background paper texture
   - Implement speed curves (acceleratedProgress)
   - Complete parallax effect
   - Verify on mobile + desktop

2. Performance Tier System
   - Implement device detection
   - Create tier-based config
   - Test on 3 devices (low/mid/high)

3. GSAP Lazy-Loading POC
   - Implement code-split GSAP Core
   - Test timeline integration with FSM
   - Measure bundle impact

**Deliverables**:
- ✅ AOD scene 95% complete
- ✅ Performance tier system working
- ✅ GSAP integration pattern validated
- 📄 Phase 4.0 completion report

**Acceptance**:
- AOD passes all visual fidelity checks
- Mobile FPS ≥ 50fps
- Desktop with GSAP loads < 500ms after scene enter

---

### Phase 4.1: P1 Scenes Migration (Week 2-3)

**Goal**: Complete core narrative flow

**Scenes**:
1. belief-star (canvas stars field)
2. pattern-bloom (decision: migrate or keep rebuild)
3. star-map (decision: migrate or keep rebuild)
4. method-upper (text reveal)
5. method-lower (process list cards)

**Strategy**:
- belief-star: Canvas adapter + CSS text
- method-upper/lower: Pure CSS + IntersectionObserver
- pattern/star: Evaluate original vs rebuild

**Pattern/Star Decision Matrix**:

| Criteria | Keep Rebuild | Migrate Original |
|----------|--------------|------------------|
| **Visual Match** | 85% similar | 98% similar |
| **Bundle Size** | 0KB (canvas code) | +30KB (GSAP timeline) |
| **Mobile Performance** | 60fps | 45-55fps |
| **Development Time** | 0 days (done) | 6 days |
| **Maintenance** | Easy (procedural) | Medium (timeline sync) |

**Recommendation**: Keep rebuild if visual quality acceptable, migrate if pixel-perfect required

**Deliverables**:
- ✅ 5 scenes migrated and integrated
- ✅ belief-star → aod-animation chain validated
- ✅ Pattern/star decision documented
- 📄 Phase 4.1 completion report

**Acceptance**:
- hero → aod → method chain passes E2E
- All P1 scenes pass visual fidelity P0+P1
- Mobile performance maintained (≥50fps)

---

### Phase 4.2: Figure2 Complex Transition (Week 4)

**Goal**: Validate complex multi-stage video transition

**Scene**: figure2-animation (questioning transition)

**Original Tech**:
- Multi-stage timeline (stop at 72%, hold, resume)
- Video + figure layers
- GSAP ScrollTrigger control

**Migration Approach**:
```typescript
// Desktop: GSAP timeline (lazy-loaded)
if (performanceTier >= MEDIUM && !isMobile) {
  const { gsap } = await import('gsap');
  timeline = gsap.timeline({ paused: true })
    .to(video, { progress: 0.72, duration: 2.6 })
    .call(() => dispatch({ type: 'HOLD_AT_KEYFRAME' }))
    .to(video, { progress: 1.0, duration: 1.5 });
}

// Mobile: Simplified version (direct play, no hold)
else {
  video.play();
  video.addEventListener('ended', handleComplete);
}
```

**Deliverables**:
- ✅ figure2-animation migrated
- ✅ Desktop: Full timeline with hold
- ✅ Mobile: Simplified auto-play
- ✅ method → brand transition working
- 📄 Complex transition pattern documented

**Acceptance**:
- Desktop: Timeline holds at 72% for 1.5s
- Mobile: Plays through smoothly (no hold)
- Both versions commit to brand scene
- Performance maintained

---

### Phase 4.3: Remaining Scenes (Week 5)

**Goal**: Complete all P2 scenes

**Scenes** (all text-based, CSS-only):
1. brand (2 columns layout)
2. services (capability list)
3. lab (scenarios grid)
4. education (program index)
5. philosophy (values grid)
6. contact (form + CTA)

**Strategy**: Batch migration (similar patterns)

**Pattern**:
```tsx
// Generic editorial scene
export function EditorialScene({ content }) {
  const hasVisual = state.layerOwnership.visualOwner === sceneId;
  const hasCopy = state.layerOwnership.copyOwner === sceneId;
  
  if (!hasVisual && !hasCopy) return null;
  
  return (
    <div className="editorial-scene">
      {hasCopy && (
        <div className="editorial-copy">
          <h2>{content.title}</h2>
          <p>{content.body}</p>
        </div>
      )}
    </div>
  );
}
```

**Deliverables**:
- ✅ 6 editorial scenes migrated
- ✅ Reusable editorial component pattern
- ✅ Full site navigation working
- 📄 Editorial scene template

**Acceptance**:
- All scenes render correctly
- Text readable on mobile (no clipping)
- Navigation works end-to-end
- Contact form functional

---

### Phase 4.4: Complex Transitions (Week 6)

**Goal**: Complete P3 transition scenes

**Transitions**:
1. crane (philosophy → contact)
2. figure3 (brand → services)
3. ph (lab → education)
4. ttg (services → lab)

**Strategy**: Canvas/GSAP hybrid

**Pattern**:
```typescript
// Mobile: Simple crossfade
if (isMobile) {
  return <CrossfadeTransition from={fromScene} to={toScene} />;
}

// Desktop: Complex GSAP timeline
const { gsap } = await import('gsap');
const tl = gsap.timeline()
  .to(crane, { rotation: Math.PI * 2, duration: 1.2 })
  .to(fromScene, { opacity: 0, duration: 0.5 }, '<0.6');
```

**Deliverables**:
- ✅ 4 transition scenes migrated
- ✅ Mobile: Simplified versions
- ✅ Desktop: Full GSAP animations
- 📄 Transition pattern guide

**Acceptance**:
- Desktop: Full animations play
- Mobile: Simplified versions smooth (60fps)
- No visual glitches during transitions
- All chains validated end-to-end

---

### Phase 4.5: Polish & Optimization (Week 7)

**Goal**: Final quality pass

**Tasks**:

1. **Visual Polish**:
   - Screenshot comparison all scenes
   - Fix any alignment issues
   - Color calibration pass
   - Typography kerning check

2. **Performance Optimization**:
   - Bundle size audit
   - Code-split large scenes
   - Lazy-load images/videos
   - Service Worker caching

3. **Accessibility**:
   - ARIA labels complete
   - Keyboard navigation
   - Screen reader testing
   - Focus management

4. **Cross-Browser**:
   - Chrome (desktop + mobile)
   - Safari (macOS + iOS)
   - Firefox (desktop + mobile)
   - Edge (desktop)

**Deliverables**:
- ✅ All visual fidelity checks pass
- ✅ Performance benchmarks met
- ✅ Accessibility audit clean
- ✅ Cross-browser tested
- 📄 Final QA report

---

### Phase 4.6: Production Prep (Week 8)

**Goal**: Ready for production deployment

**Tasks**:

1. **Build Optimization**:
   - Production build profiling
   - Asset optimization (images, videos)
   - CDN configuration
   - Cache strategy

2. **Monitoring Setup**:
   - Error tracking (Sentry)
   - Analytics (GA4)
   - Performance monitoring (Web Vitals)
   - User session recording

3. **Documentation**:
   - Component API docs
   - Migration lessons learned
   - Performance tuning guide
   - Maintenance playbook

4. **Deployment Plan**:
   - Staging deployment
   - A/B test plan (original vs React)
   - Rollback procedure
   - Go-live checklist

**Deliverables**:
- ✅ Production build optimized
- ✅ Monitoring live
- ✅ Documentation complete
- ✅ Deployment plan approved
- 📄 Production readiness report

---

## Migration Checklist Template

### Scene: [SCENE_ID]

**Original Files**:
- HTML: `[path]`
- CSS: `[path]`
- JS: `[path]`

**Tech Stack Decision**:
- [ ] Mobile: CSS only
- [ ] Mobile: CSS + Web Animations
- [ ] Desktop: +GSAP Core (lazy)
- [ ] Canvas adapter
- [ ] WebGL adapter
- [ ] Video adapter

**Implementation Checklist**:
- [ ] Step 1: Original code analyzed
- [ ] Step 2: Constants extracted
- [ ] Step 3: Keyframes screenshot
- [ ] Step 4: React component created
- [ ] Step 5: Mobile version implemented
- [ ] Step 6: Desktop enhancement added
- [ ] Step 7: Ownership logic integrated

**Visual Verification**:
- [ ] Z-index correct
- [ ] Position within ±5px
- [ ] Size within ±3%
- [ ] Colors ΔE < 3
- [ ] Typography matches
- [ ] Scroll transforms correct
- [ ] Blur transitions smooth
- [ ] Video keyframes aligned (if applicable)

**Performance Verification**:
- [ ] Mobile FPS ≥ 50fps
- [ ] Desktop FPS = 60fps
- [ ] Memory < threshold
- [ ] Bundle size < budget

**Integration Verification**:
- [ ] Added to realManifest.ts
- [ ] Segment definitions correct
- [ ] E2E test passes
- [ ] Cross-browser tested

**Sign-off**:
- Developer: [ ]
- QA: [ ]
- Design: [ ]
- Product: [ ]

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| GSAP bundle size > budget | Medium | High | Code-split, lazy-load per scene |
| Mobile performance < 50fps | Low | Critical | Disable effects for LOW tier |
| Visual fidelity gaps | Medium | Medium | Incremental comparison during dev |
| Original code unclear | Medium | Medium | Consult with original developer |
| Cross-browser inconsistencies | Low | Medium | Test early, fix incrementally |
| Timeline slippage | Medium | Low | Buffer built into estimates |

---

## Success Metrics

### Launch Criteria

**Must Have (Go/No-Go)**:
- ✅ All P0 + P1 scenes complete
- ✅ Mobile performance ≥ 50fps
- ✅ Desktop performance = 60fps
- ✅ Visual fidelity P0 checks pass
- ✅ E2E tests green
- ✅ No critical bugs

**Should Have (Post-Launch OK)**:
- P2 scenes complete
- Visual fidelity P1 checks pass
- Accessibility AA compliant
- Cross-browser verified

**Nice to Have**:
- P3 transitions complete
- Visual fidelity P2 checks pass
- Performance tier auto-tuning
- A/B test data collected

### Post-Launch Monitoring

**Week 1-2**:
- Core Web Vitals (LCP, FID, CLS)
- Error rate (< 0.1%)
- Bounce rate (compare to original)
- User feedback collection

**Week 3-4**:
- Performance trends
- Device/browser breakdown
- Scene completion rates
- Optimization opportunities

---

## Appendix A: Performance Tier Detection

```typescript
enum PerformanceTier {
  LOW = 'low',      // iPhone SE, low-end Android
  MEDIUM = 'medium', // iPhone X-12, mid-range Android
  HIGH = 'high'     // iPhone 13+, high-end Android
}

function detectPerformanceTier(): PerformanceTier {
  // Hardware detection
  const cores = navigator.hardwareConcurrency || 2;
  const memory = (navigator as any).deviceMemory || 2;
  
  // GPU detection (WebGL)
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  const renderer = gl?.getParameter(gl.RENDERER) || '';
  const isMobileGPU = /mali|adreno|powervr/i.test(renderer);
  
  // Device type
  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
  
  // Classification
  if (cores >= 6 && memory >= 4 && !isMobileGPU) {
    return PerformanceTier.HIGH;
  }
  
  if (cores >= 4 && memory >= 2) {
    return PerformanceTier.MEDIUM;
  }
  
  return PerformanceTier.LOW;
}

// Config per tier
const CONFIG = {
  [PerformanceTier.HIGH]: {
    gsap: true,
    particles: 200,
    parallax: true,
    videoQuality: '1080p',
    blur: true,
  },
  [PerformanceTier.MEDIUM]: {
    gsap: false,
    particles: 100,
    parallax: true,
    videoQuality: '720p',
    blur: false,
  },
  [PerformanceTier.LOW]: {
    gsap: false,
    particles: 0,
    parallax: false,
    videoQuality: '480p',
    blur: false,
  },
};
```

---

## Appendix B: GSAP Integration Pattern

```typescript
// hooks/useGSAPTimeline.ts
import { useEffect, useRef, useState } from 'react';
import type { GSAPTimeline } from 'gsap';

export function useGSAPTimeline(
  sceneId: string,
  shouldLoad: boolean,
  buildTimeline: (gsap: GSAP) => GSAPTimeline
) {
  const [timeline, setTimeline] = useState<GSAPTimeline | null>(null);
  const isLoading = useRef(false);
  
  useEffect(() => {
    if (!shouldLoad || isLoading.current) return;
    
    isLoading.current = true;
    
    import('gsap').then(({ gsap }) => {
      const tl = buildTimeline(gsap);
      setTimeline(tl);
    });
    
    return () => {
      timeline?.kill();
    };
  }, [shouldLoad, sceneId]);
  
  return timeline;
}

// Usage in scene
export function ComplexScene() {
  const { state } = useSceneRuntime();
  const performanceTier = usePerformanceTier();
  
  const shouldUseGSAP = performanceTier >= PerformanceTier.MEDIUM && !isMobile();
  
  const timeline = useGSAPTimeline('complex-scene', shouldUseGSAP, (gsap) => {
    return gsap.timeline({ paused: true })
      .to('.element-1', { y: -200, duration: 0.5 })
      .to('.element-2', { opacity: 0, duration: 0.3 }, '<0.2');
  });
  
  useEffect(() => {
    if (state.phase === 'PLAYING' && timeline) {
      timeline.play();
    }
  }, [state.phase, timeline]);
  
  // Fallback for mobile
  if (!shouldUseGSAP) {
    return <SimpleCSSVersion />;
  }
  
  return <ComplexGSAPVersion />;
}
```

---

## Appendix C: Visual Verification Script

```bash
#!/bin/bash
# scripts/visual-verify.sh

SCENE_ID=$1
ORIGINAL_SCREENSHOT="reference/${SCENE_ID}.png"
CURRENT_SCREENSHOT="output/${SCENE_ID}.png"

# Capture current implementation
npm run dev &
DEV_PID=$!
sleep 5

npx playwright screenshot \
  --url "http://localhost:5173/#${SCENE_ID}" \
  --output "${CURRENT_SCREENSHOT}" \
  --viewport-size 1920x1080

kill $DEV_PID

# Compare with original
npx playwright-ssim \
  "${ORIGINAL_SCREENSHOT}" \
  "${CURRENT_SCREENSHOT}" \
  --threshold 0.90

# Check z-index hierarchy
npx playwright evaluate \
  --url "http://localhost:5173/#${SCENE_ID}" \
  'document.querySelectorAll("[data-scene-layer]").forEach(el => console.log(el.style.zIndex))'

echo "Visual verification complete for ${SCENE_ID}"
```

---

## Appendix D: Migration Timeline Gantt Chart

```
Week 1: Phase 4.0 (Core Tech Validation)
  └─ AOD Enhancement                [===]
  └─ Performance Tier System        [===]
  └─ GSAP POC                       [===]

Week 2-3: Phase 4.1 (P1 Scenes)
  └─ belief-star                    [===]
  └─ method-upper                   [===]
  └─ method-lower                   [===]
  └─ pattern/star decision          [===]

Week 4: Phase 4.2 (Figure2 Complex)
  └─ figure2-animation              [======]

Week 5: Phase 4.3 (Remaining Scenes)
  └─ brand/services/lab             [====]
  └─ education/philosophy/contact   [====]

Week 6: Phase 4.4 (Complex Transitions)
  └─ crane/figure3/ph/ttg           [======]

Week 7: Phase 4.5 (Polish)
  └─ Visual polish                  [====]
  └─ Performance optimization       [====]

Week 8: Phase 4.6 (Production Prep)
  └─ Build optimization             [===]
  └─ Monitoring setup               [===]
  └─ Documentation                  [===]
  └─ Deployment                     [===]

Timeline: 8 weeks total (32 working days)
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2026-06-30 | Initial master plan | System |

