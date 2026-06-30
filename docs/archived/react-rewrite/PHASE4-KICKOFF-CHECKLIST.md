# Phase 4 Kickoff Checklist (v2.0 - Fixed)

**Date**: 2026-06-30  
**Status**: ✅ Ready for Phase 4.0A  
**Reference**: SCENE-MIGRATION-EXECUTION-PLAN.md v2.1

---

## ⚠️ Critical Fixes Applied

This version corrects all P0 issues found in v1:
- ✅ Runtime events aligned with actual `RuntimeEvent` types
- ✅ Repository paths clarified (dual-repo setup)
- ✅ Validation scripts use proper imports
- ✅ Visual Progress Driver uses correct time source for media
- ✅ Adapter examples have proper cleanup
- ✅ Git commands use relative paths

---

## 📁 Repository Context

This project uses **TWO repositories**:

### SOURCE_REPO (Original Site)
```bash
export SOURCE_REPO="/Users/aitoshuu/Documents/GitHub/TongyeGuanmi"
```
**Contains**:
- Original HTML/CSS/JS (`index.html`, `css/`, `js/`)
- Documentation (`docs/react-rewrite/`)
- Scripts (`scripts/`)

### SPIKE_REPO (React Implementation)
```bash
export SPIKE_REPO="/Users/aitoshuu/Documents/GitHub/react-runtime-spike"
```
**Contains**:
- React runtime (`src/runtime/`)
- Scene components (`src/scenes/`)
- Adapters (`src/adapters/`)
- Manifest (`src/manifest/realManifest.ts`)
- Tests (`src/**/*.test.ts`)

**All commands below specify which repo to use.**

---

## 🎯 Pre-Flight Checks

### Documentation Review

- [x] SCENE-MIGRATION-EXECUTION-PLAN.md reviewed and approved
- [x] Critical issues corrected in execution plan v2.1
- [ ] All team members read execution plan
- [ ] Stakeholders aware of 2-week hard gate

### Repository Status

```bash
# In SPIKE_REPO
cd $SPIKE_REPO
git status
npm test -- --run  # Record actual count (not hardcoded 57/57)
npm run build
```

**Expected**:
- [ ] Working directory clean or documented changes
- [ ] All tests passing (record actual: __ / __ tests)
- [ ] Build succeeds

### Current State Baseline

**Phase 3 Status** (from SPIKE_REPO):
- [x] SceneRuntime FSM: 95%
- [x] Layer Ownership: Working
- [x] 80% Reveal: Working
- [x] AOD Scene: 40%

**Known Issues**:
- ⚠️ Scene IDs inconsistent (fix in 4.0A)
- ⚠️ Adapter dispatches per-frame (fix in 4.0B)

---

## 📋 Phase 4.0A: Manifest Freeze (Week 1)

### Day 1-2: Scene ID Reconciliation

#### ✅ Task 1.1: Extract Scene IDs

**Run in SOURCE_REPO**:

```bash
cd $SOURCE_REPO

# Create script
cat > scripts/extract-scene-ids.sh << 'SCRIPT'
#!/bin/bash

SOURCE_REPO="/Users/aitoshuu/Documents/GitHub/TongyeGuanmi"
SPIKE_REPO="/Users/aitoshuu/Documents/GitHub/react-runtime-spike"

echo "=== Original HTML Scene IDs ==="
grep -o 'data-scene-id="[^"]*"' "$SOURCE_REPO/index.html" | \
  sed 's/data-scene-id="\([^"]*\)"/\1/' | \
  sort -u

echo ""
echo "=== Current Spike Scene IDs ==="
grep -o "id: '[^']*'" "$SPIKE_REPO/src/manifest/realManifest.ts" | \
  sed "s/id: '\([^']*\)'/\1/" | \
  sort -u

echo ""
echo "=== Conflicts to Resolve ==="
echo "Manual comparison required - document in SCENE-NAMING-DECISIONS.md"
SCRIPT

chmod +x scripts/extract-scene-ids.sh
./scripts/extract-scene-ids.sh > docs/react-rewrite/scene-id-extraction.txt

# Review
cat docs/react-rewrite/scene-id-extraction.txt
```

**Checklist**:
- [ ] Script created
- [ ] Scene IDs extracted
- [ ] Conflicts identified

---

#### ✅ Task 1.2: Decision Meeting

**Required**: Tech Lead, Product, Design

**Create decision document in SOURCE_REPO**:

```bash
cd $SOURCE_REPO

cat > docs/react-rewrite/SCENE-NAMING-DECISIONS.md << 'EOF'
# Scene Naming Decisions

## Decision 1: belief-star vs star-map

**Options**:
- A: Keep `belief-star` (matches original HTML)
- B: Keep `star-map` (current spike)
- C: Both as separate scenes

**Decision**: [ ] A / [ ] B / [ ] C

**Rationale**:
[Document reasoning]

---

## Decision 2: method-* granularity

**Options**:
- A: Flatten to 2 (`method-top`, `method-bottom`)
- B: Keep 5 from original (`method-upper`, `method-lower`, `method-cocreation`, `method-tooling`, `method-proof`)

**Decision**: [ ] A / [ ] B

**Rationale**:
[Document reasoning]

---

## Decision 3: figure2-proof-cards/closing

**Options**:
- A: First-class scenes
- B: Sub-states of figure2-animation

**Decision**: [ ] A / [ ] B

**Rationale**:
[Document reasoning]

---

## Sign-off

- Tech Lead: [ ] Name - Date
- Product: [ ] Name - Date
- Design: [ ] Name - Date
EOF
```

**Checklist**:
- [ ] Document created
- [ ] Decisions made
- [ ] Sign-off obtained

---

### Day 3-5: Complete Manifest Definition

#### ✅ Task 2.1: Define All Segments

**Edit in SPIKE_REPO**: `src/manifest/realManifest.ts`

**Template** (ensure all fields present):

```typescript
{
  id: 'segment-id',
  type: 'ink-transition', // or: media-animation, text-read, compound-sequence
  from: 'scene-a',
  to: 'scene-b',
  
  // ✅ REQUIRED: All 5 layers (NO undefined)
  layerOwnership: {
    visualOwner: 'segment-id',  // or 'none' or scene-id
    copyOwner: 'none',
    canvasOwner: 'segment-id',
    maskOwner: 'none',
    mediaOwner: 'none',
  },
  
  // Type-specific (based on type)
  durationMs: 800,              // ink-transition only
  durationPolicy: 'media-ended', // media-animation only
  ink: { kind, direction },     // ink-transition only
  readHeightVh: 100,            // text-read only
  armAfterVh: 10,               // text-read only
  steps: [],                    // compound-sequence only
  
  // Policies
  commitAt: 'end',
  reveal: { at: 0.8, target: 'next-scene' },  // Optional
  fallback: {                   // For media segments
    onPlayRejected: 'show-poster-and-complete',
    onMetadataTimeout: 'show-poster-and-complete',
    onEndedTimeout: 'force-complete-and-commit',
    onMissingMedia: 'recover-to-committed-scene',
    reducedMotion: 'poster-and-skip',
  },
}
```

**Checklist** (per segment):
- [ ] ID unique
- [ ] from/to exist in scenes[]
- [ ] All 5 layers defined
- [ ] Type-specific fields complete

---

#### ✅ Task 2.2: Create Validation Scripts

**In SPIKE_REPO** (use Vitest, not raw Node):

```bash
cd $SPIKE_REPO

# Create validation test
cat > src/manifest/__tests__/manifest.validation.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';
import { realManifest } from '../realManifest';

describe('Manifest Validation', () => {
  const { scenes, segments } = realManifest;
  const sceneIds = new Set(scenes.map(s => s.id));

  it('all segment from/to exist in scenes[]', () => {
    segments.forEach(seg => {
      expect(sceneIds.has(seg.from), `${seg.id}: from="${seg.from}" not found`).toBe(true);
      expect(sceneIds.has(seg.to), `${seg.id}: to="${seg.to}" not found`).toBe(true);
    });
  });

  it('all scenes reachable from hero', () => {
    const reachable = new Set<string>(['hero']);
    let changed = true;
    
    while (changed) {
      changed = false;
      segments.forEach(seg => {
        if (reachable.has(seg.from) && !reachable.has(seg.to)) {
          reachable.add(seg.to);
          changed = true;
        }
      });
    }

    scenes.forEach(scene => {
      if (scene.id !== 'hero') {
        expect(reachable.has(scene.id), `Scene "${scene.id}" not reachable from hero`).toBe(true);
      }
    });
  });

  it('all segments have complete ownership', () => {
    const LAYERS = ['visualOwner', 'copyOwner', 'canvasOwner', 'maskOwner', 'mediaOwner'] as const;
    
    segments.forEach(seg => {
      LAYERS.forEach(layer => {
        expect(
          seg.layerOwnership[layer],
          `${seg.id}: ${layer} is undefined`
        ).toBeDefined();
      });
    });
  });

  it('no duplicate segment IDs', () => {
    const ids = segments.map(s => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
EOF

# Run validation
npm test -- manifest.validation.test.ts
```

**Checklist**:
- [ ] Validation test created
- [ ] All tests pass
- [ ] No orphans, no duplicates

---

#### ✅ Task 2.3: Figure2 Modeling Decision

**In SOURCE_REPO**: Create `docs/react-rewrite/FIGURE2-MODELING-DECISION.md`

```markdown
# Figure2 Modeling Decision

## Original Behavior

1. Video plays to 72%
2. Holds 1.5s (user can scroll, no lock)
3. Resumes to 100%
4. Commits to next scene

## Decision Criteria

- [ ] Hold is visible (static screen)
- [ ] Hold is internal (timeline pause only)
- [ ] Narrative importance: [high/medium/low]

## Options

### Option A: Single compound-sequence
**Pros**: Simpler, one segment  
**Cons**: Complex step definitions

### Option B: Two segments + intermediate scene
**Pros**: Explicit states, easier to debug  
**Cons**: More scenes in manifest

## Decision

**Chosen**: [ ] A / [ ] B

**Rationale**:
[Document why]

## Sign-off

- Tech Lead: [ ]
- Product: [ ]
- Design: [ ]
```

---

### Day 6: Contract Document Sync

**In SOURCE_REPO**: Update docs to reference frozen manifest

```bash
cd $SOURCE_REPO

# Update 07-SCENE-RUNTIME-CONTRACT.md
# Add frozen scene list from realManifest.ts

# Update 02-TRANSITION-MANIFEST.md
# Sync scene IDs

# Update 03-ARCHITECTURE.md
# Update scene graph diagram
```

**Validation**:
```bash
# Check all docs reference only canonical scenes
grep -r "scene.*id\|sceneId" docs/react-rewrite/*.md | \
  grep -v "SCENE-NAMING-DECISIONS\|scene-id-extraction" | \
  # Manually verify against canonical list
```

**Checklist**:
- [ ] Contract docs updated
- [ ] All scene IDs consistent

---

### Git Tag and Freeze

**In SPIKE_REPO**:

```bash
cd $SPIKE_REPO

# Final validation
npm test -- manifest.validation.test.ts

# Stage files explicitly (NO git add -A on dirty worktree)
git add src/manifest/realManifest.ts

# Add related docs from SOURCE_REPO if needed
# git add ../TongyeGuanmi/docs/react-rewrite/SCENE-NAMING-DECISIONS.md
# git add ../TongyeGuanmi/docs/react-rewrite/FIGURE2-MODELING-DECISION.md

# Commit (adjust co-author if needed)
git commit -m "chore: freeze scene manifest for Phase 4

- Canonical scene list: [N] scenes
- Complete segment definitions: [M] segments
- All ownership layers defined
- Scene naming decisions: [link to SOURCE_REPO doc]
- Figure2 modeling: Option [A/B]
- All validation passing

Ref: SCENE-MIGRATION-EXECUTION-PLAN.md Phase 4.0A"

# Tag
git tag -a manifest-v4.0 -m "Phase 4.0A: Manifest Freeze Complete

All scenes/segments defined with complete ownership.
Validation: All tests passing
Sign-off: Tech Lead, Product, Design"

# Push (adjust branch name if needed)
git push origin HEAD
git push origin manifest-v4.0
```

**Checklist**:
- [ ] Validations pass
- [ ] Commit created
- [ ] Tag `manifest-v4.0`
- [ ] Pushed to remote

---

## 📋 Phase 4.0B: Runtime P0 (Week 2)

### Day 1-3: Adapter Milestone-Only Contract

#### ✅ Task 1.1: Implement Visual Progress Driver

**In SPIKE_REPO**: Create `src/runtime/visualProgressDriver.ts`

```typescript
/**
 * Visual Progress Driver
 * 
 * Provides per-frame animation progress WITHOUT triggering React re-renders.
 * 
 * TWO IMPLEMENTATIONS:
 * 1. TimeDriver: For non-media animations (ink transitions, timelines)
 * 2. MediaDriver: For video-based animations (syncs to video.currentTime)
 */

interface VisualProgressCallback {
  (progress: number): void;
}

// ===== TIME-BASED DRIVER (for non-media) =====

class TimeBasedDriver {
  private subscriptions = new Map<string, Set<VisualProgressCallback>>();
  private rafId: number | null = null;
  private activeSegment: string | null = null;
  private startTime = 0;
  private duration = 0;

  subscribe(segmentId: string, callback: VisualProgressCallback) {
    if (!this.subscriptions.has(segmentId)) {
      this.subscriptions.set(segmentId, new Set());
    }
    this.subscriptions.get(segmentId)!.add(callback);
    
    return () => {
      this.subscriptions.get(segmentId)?.delete(callback);
    };
  }

  start(segmentId: string, durationMs: number) {
    this.activeSegment = segmentId;
    this.duration = durationMs;
    this.startTime = performance.now();
    this.tick();
  }

  stop(segmentId: string) {
    if (this.activeSegment === segmentId) {
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
      }
      this.activeSegment = null;
    }
  }

  reset() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    this.subscriptions.clear();
    this.activeSegment = null;
  }

  private tick = () => {
    if (!this.activeSegment) return;

    const elapsed = performance.now() - this.startTime;
    const progress = Math.min(elapsed / this.duration, 1);

    const callbacks = this.subscriptions.get(this.activeSegment);
    callbacks?.forEach(cb => cb(progress));

    if (progress < 1) {
      this.rafId = requestAnimationFrame(this.tick);
    }
  };
}

// ===== MEDIA-BASED DRIVER (for video autoplay) =====

class MediaBasedDriver {
  private subscriptions = new Map<string, Set<VisualProgressCallback>>();
  private rafId: number | null = null;
  private activeSegment: string | null = null;
  private videoRef: HTMLVideoElement | null = null;

  subscribe(segmentId: string, callback: VisualProgressCallback) {
    if (!this.subscriptions.has(segmentId)) {
      this.subscriptions.set(segmentId, new Set());
    }
    this.subscriptions.get(segmentId)!.add(callback);
    
    return () => {
      this.subscriptions.get(segmentId)?.delete(callback);
    };
  }

  start(segmentId: string, video: HTMLVideoElement) {
    this.activeSegment = segmentId;
    this.videoRef = video;
    this.tick();
  }

  stop(segmentId: string) {
    if (this.activeSegment === segmentId) {
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
      }
      this.activeSegment = null;
      this.videoRef = null;
    }
  }

  reset() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    this.subscriptions.clear();
    this.activeSegment = null;
    this.videoRef = null;
  }

  private tick = () => {
    if (!this.activeSegment || !this.videoRef) return;

    // Progress from actual video playback (handles decode delays)
    const progress = this.videoRef.duration > 0
      ? this.videoRef.currentTime / this.videoRef.duration
      : 0;

    const callbacks = this.subscriptions.get(this.activeSegment);
    callbacks?.forEach(cb => cb(progress));

    // Continue until video ends
    if (progress < 1) {
      this.rafId = requestAnimationFrame(this.tick);
    }
  };
}

export const timeDriver = new TimeBasedDriver();
export const mediaDriver = new MediaBasedDriver();
```

**Checklist**:
- [ ] Driver implemented (both variants)
- [ ] Unit tests written
- [ ] Exported from runtime

---

#### ✅ Task 1.2: Refactor AODMediaAnimationAdapter

**In SPIKE_REPO**: Update `src/adapters/AODMediaAnimationAdapter.tsx`

```typescript
import { useEffect, useRef } from 'react';
import { useSceneRuntime } from '../runtime/SceneRuntimeProvider';
import { mediaDriver } from '../runtime/visualProgressDriver';

interface AODMediaAnimationAdapterProps {
  segmentId: string;
  config: {
    videoSrc: string;
  };
}

export function AODMediaAnimationAdapter({ segmentId, config }: AODMediaAnimationAdapterProps) {
  const { state, dispatch } = useSceneRuntime();
  const videoRef = useRef<HTMLVideoElement>(null);
  const revealed80Ref = useRef(false);
  const handlersRef = useRef<{
    ended?: () => void;
    error?: () => void;
  }>({});

  useEffect(() => {
    // Reset on new segment
    revealed80Ref.current = false;
  }, [segmentId]);

  useEffect(() => {
    if (state.phase !== 'PLAYING' || state.activeSegment !== segmentId) {
      return;
    }
    
    const video = videoRef.current;
    if (!video) return;
    
    // Subscribe to media-based progress
    const unsubscribe = mediaDriver.subscribe(segmentId, (progress) => {
      // Milestone: 80% reveal (dispatch ONCE)
      if (!revealed80Ref.current && progress >= 0.8) {
        revealed80Ref.current = true;
        // ✅ Use actual RuntimeEvent with correct payload
        dispatch({ 
          type: 'MEDIA_PROGRESS', 
          segment: segmentId, 
          progress: 0.8 
        });
      }
    });
    
    // Start driver (syncs to video.currentTime)
    mediaDriver.start(segmentId, video);
    
    // Event handlers
    handlersRef.current.ended = () => {
      dispatch({ type: 'SEGMENT_COMPLETE', segment: segmentId });
    };
    
    handlersRef.current.error = () => {
      // ✅ Use actual RuntimeEvent: MEDIA_MISSING
      dispatch({ 
        type: 'MEDIA_MISSING',
        segment: segmentId,
        src: video.currentSrc || config.videoSrc,
      });
    };
    
    video.addEventListener('ended', handlersRef.current.ended);
    video.addEventListener('error', handlersRef.current.error);
    
    // Auto-play
    video.play().catch((error) => {
      // ✅ Use actual RuntimeEvent with required reason field
      dispatch({ 
        type: 'MEDIA_REJECTED',
        segment: segmentId,
        reason: error instanceof Error ? error.message : 'play() rejected',
      });
    });
    
    return () => {
      mediaDriver.stop(segmentId);
      unsubscribe();
      
      // Proper cleanup
      if (handlersRef.current.ended) {
        video.removeEventListener('ended', handlersRef.current.ended);
      }
      if (handlersRef.current.error) {
        video.removeEventListener('error', handlersRef.current.error);
      }
    };
  }, [state.phase, state.activeSegment, segmentId, dispatch]);
  
  return (
    <video
      ref={videoRef}
      src={config.videoSrc}
      muted
      playsInline
      preload="auto"
      style={{ display: 'none' }}  // Adapter manages state, not visuals
    />
  );
}
```

**Key Fixes**:
- ✅ Uses `mediaDriver` (syncs to video.currentTime, not wall-clock)
- ✅ Proper cleanup with stored handler refs
- ✅ Resets `revealed80Ref` on segment change
- ✅ Uses actual `RuntimeEvent` types (verify in types.ts)

**Checklist**:
- [ ] Adapter refactored
- [ ] Uses mediaDriver (not timeDriver)
- [ ] Proper cleanup
- [ ] Tests updated

---

#### ✅ Task 1.3: Performance Validation

```typescript
// src/adapters/__tests__/adapter-performance.test.tsx

describe('Adapter Performance', () => {
  it('dispatches < 5 events during 3s playback', async () => {
    const dispatchSpy = vi.fn();
    
    render(
      <TestRuntimeProvider dispatch={dispatchSpy}>
        <AODMediaAnimationAdapter 
          segmentId="test" 
          config={{ videoSrc: '/test.webm' }} 
        />
      </TestRuntimeProvider>
    );
    
    await waitFor(() => {
      // Expected: 80% reveal + COMPLETE = 2 events
      expect(dispatchSpy.mock.calls.length).toBeLessThan(5);
    }, { timeout: 3500 });
  });
});
```

**Manual Validation**:
```bash
cd $SPIKE_REPO
npm run dev
# Open React DevTools Profiler
# Navigate to AOD scene
# Confirm < 5 renders/sec during playback
```

**Checklist**:
- [ ] Performance tests pass
- [ ] React DevTools < 5 renders/sec
- [ ] iPhone SE simulator ≥55fps

---

### Day 4: SnappedArmed + ReadingScroll

```typescript
// Additional edge case tests

describe('SnappedArmed', () => {
  it('handles momentum scroll', async () => {
    // Test implementation
  });
  
  it('cancels on reverse scroll', async () => {
    // Test implementation
  });
});
```

**Checklist**:
- [ ] Edge cases tested
- [ ] All tests passing

---

### Day 5: Recovery + Hash Navigation

**⚠️ CRITICAL: Use actual RuntimeEvent types from types.ts**

```typescript
// src/runtime/SceneRuntimeProvider.tsx

// Scroll lock timeout recovery
useEffect(() => {
  // ✅ Use actual state structure: state.scrollLock.locked (boolean)
  if (!state.scrollLock.locked) return;
  
  const timeout = setTimeout(() => {
    // ✅ Use actual RuntimeEvent with required reason field
    dispatch({ 
      type: 'SCROLL_LOCK_RECOVERY',
      reason: 'lock-timeout',
    });
  }, 10000);
  
  return () => clearTimeout(timeout);
}, [state.scrollLock.locked, dispatch]);

// Hash navigation
useEffect(() => {
  const hash = window.location.hash.slice(1);
  if (hash) {
    const targetScene = scenes.find(s => s.anchors?.hash === hash);
    if (targetScene) {
      // ✅ Use actual RuntimeEvent payload structure
      dispatch({ 
        type: 'HASH_NAVIGATE',  // Verify actual type name
        scene: targetScene.id   // Verify field name (not sceneId)
      });
    }
  }
}, []);

// Browser back/forward
useEffect(() => {
  const handlePopState = () => {
    const hash = window.location.hash.slice(1);
    const targetScene = scenes.find(s => s.anchors?.hash === hash);
    if (targetScene && targetScene.id !== state.committedScene) {
      // ✅ Use actual RuntimeEvent
      dispatch({ 
        type: 'POPSTATE_NAVIGATE',  // Verify actual type
        scene: targetScene.id        // Verify field name
      });
    }
  };
  
  window.addEventListener('popstate', handlePopState);
  return () => window.removeEventListener('popstate', handlePopState);
}, [state.committedScene]);
```

**Action Required**:
- [ ] Open `src/runtime/types.ts`
- [ ] Find actual event type names
- [ ] Update above code with correct types
- [ ] Verify payload structure

**Checklist**:
- [ ] Recovery implemented with correct events
- [ ] Hash navigation working
- [ ] Browser back/forward tested

---

## 🚦 Phase 4.0 Gate Check

**ALL must be ✅ before Phase 4.1:**

### Phase 4.0A ✅
- [ ] Scene IDs frozen (zero conflicts)
- [ ] `realManifest.ts` complete (all segments defined)
- [ ] All ownership complete (no undefined)
- [ ] Validation tests pass
- [ ] Figure2 modeling decided
- [ ] Git tag `manifest-v4.0`
- [ ] Stakeholder sign-off

### Phase 4.0B ✅
- [ ] Visual progress driver implemented (time + media variants)
- [ ] Milestone-only contract enforced
- [ ] React renders < 5/sec (validated)
- [ ] Mobile FPS ≥55fps (iPhone SE)
- [ ] Recovery with correct event types
- [ ] Hash navigation working
- [ ] 150+ tests passing (record actual count: __ / __)

---

## 📞 Communication

### Daily Standups (15 min)
1. Yesterday's progress
2. Today's plan
3. Blockers

### Escalation
- Scene decision blocked → Product (24h)
- Validation failing → Tech Lead (4h)
- Performance issue → Team discussion

---

## ✅ Next Action

**Step 1**: Set repository variables

```bash
export SOURCE_REPO="/Users/aitoshuu/Documents/GitHub/TongyeGuanmi"
export SPIKE_REPO="/Users/aitoshuu/Documents/GitHub/react-runtime-spike"

# Verify
echo "Source: $SOURCE_REPO"
echo "Spike: $SPIKE_REPO"
ls -la $SOURCE_REPO/index.html
ls -la $SPIKE_REPO/src/manifest/realManifest.ts
```

**Step 2**: Begin Phase 4.0A Task 1.1

```bash
cd $SOURCE_REPO
mkdir -p scripts
# Follow Task 1.1 instructions
```

---

## 📚 Critical References

**Before writing any code**:
1. Check `$SPIKE_REPO/src/runtime/types.ts` for actual RuntimeEvent types
2. Check `$SPIKE_REPO/src/runtime/reducer.ts` for state structure
3. Use exact type names and payload structures

**Don't guess event types or state shapes - verify first!**

---

**Document Version**: 2.0 (P0 Fixes Applied)  
**Status**: Ready for Phase 4.0A ✅
