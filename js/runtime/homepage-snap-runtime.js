/**
 * @fileoverview Homepage Snap Runtime - FSM-based scroll-to-playback engine
 *
 * State Machine:
 * - FreeScroll: normal scroll, watching for snap targets
 * - SnapAligning: Lenis animating to scene boundary
 * - SnappedArmed: at scene boundary, waiting for trigger
 * - TriggeredPlayback: user triggered, preparing to play
 * - Playing: timeline playing, scroll locked
 * - Completing: playback finishing, preparing to unlock
 * - ReleaseCooldown: brief cooldown before re-arming
 * - ReadingScroll: bypass state during rapid scroll
 * - RecoverPresentTarget: recovery from failed state
 *
 * Implements ADR-homepage-js-snap.md:
 * - JS-controlled snap with Lenis scrollTo() as primary
 * - window.scrollTo() as fallback when Lenis unavailable
 * - prefers-reduced-motion: instant scrollTo, no easing
 * - Viewport change listeners for mobile address bar handling
 */

// ============================================================================
// State Definitions
// ============================================================================

/** @enum {string} */
const State = {
  FreeScroll: 'FreeScroll',
  SnapAligning: 'SnapAligning',
  SnappedArmed: 'SnappedArmed',
  TriggeredPlayback: 'TriggeredPlayback',
  Playing: 'Playing',
  Completing: 'Completing',
  ReleaseCooldown: 'ReleaseCooldown',
  ReadingScroll: 'ReadingScroll',
  RecoverPresentTarget: 'RecoverPresentTarget'
};

// ============================================================================
// Configuration Constants
// ============================================================================

const CONFIG = {
  SNAP_THRESHOLD: 50, // px from scene boundary to begin JS-snap alignment
  SNAP_VELOCITY_THRESHOLD: 0.5, // Lenis velocity threshold for snap
  COOLDOWN_DURATION: 420, // ms before re-arming after release (plan releaseCooldownMs)
  RECOVERY_TIMEOUT: 2000, // ms before forcing recovery
  RAPID_SCROLL_VELOCITY: 2.0, // velocity threshold for ReadingScroll bypass
  SCENE_HEIGHT_VH: 100, // each animation scene is 100dvh
  CHARGE_THRESHOLD_VH: 10, // plan: scroll 10vh after snap to trigger
  CHARGE_DECAY_PER_MS: 0.001 // charge bleed when input stops
};

// ============================================================================
// State Machine Reducer
// ============================================================================

/**
 * @typedef {Object} RuntimeState
 * @property {State} current
 * @property {number} currentSceneIndex
 * @property {number} targetSceneIndex
 * @property {number} scrollY
 * @property {number} velocity
 * @property {number} stateEntryTime
 * @property {number} cooldownEndTime
 * @property {boolean} isScrollLocked
 * @property {Object|null} error
 */

/**
 * @typedef {Object} RuntimeContext
 * @property {number} sceneCount
 * @property {Function} getSceneBounds
 * @property {Function} getCurrentSceneIndex
 * @property {Object} timeline
 * @property {Object|null} scrollController
 */

/**
 * Create initial state
 * @param {number} initialScroll
 * @returns {RuntimeState}
 */
function createInitialState(initialScroll = 0) {
  return Object.freeze({
    current: State.FreeScroll,
    currentSceneIndex: 0,
    targetSceneIndex: 0,
    playbackDirection: 1,
    scrollY: initialScroll,
    velocity: 0,
    stateEntryTime: Date.now(),
    cooldownEndTime: 0,
    isScrollLocked: false,
    releaseMode: 'free',
    error: null
  });
}

/**
 * Decide whether the runtime should re-arm (allow immediate forward/reverse
 * charge) after a transition into the given scene, or release to natural scroll.
 * Animation scenes re-arm; reading scenes release so the reader is not trapped.
 * Reuses the existing scene.kind field — no new classification.
 * @param {{kind?: string}|null|undefined} scene
 * @returns {boolean}
 */
function shouldRearmAfterComplete(scene) {
  return scene?.kind === 'animation';
}

function sceneAt(context, index) {
  return context.timeline?.scenes?.[index] || null;
}

function isReadingToAnimationBoundary(context, sourceIndex, targetIndex) {
  if (targetIndex <= sourceIndex) return false;
  const source = sceneAt(context, sourceIndex);
  const target = sceneAt(context, targetIndex);
  return source?.kind === 'reading' && target?.kind === 'animation';
}

function getSnapSourceSceneIndex(context, targetIndex) {
  const previousIndex = targetIndex - 1;
  if (previousIndex >= 0 && isReadingToAnimationBoundary(context, previousIndex, targetIndex)) {
    return previousIndex;
  }
  return targetIndex;
}

function findCrossedAnimationSnapBoundary(context, fromScrollY, toScrollY) {
  if (!Number.isFinite(fromScrollY) || !Number.isFinite(toScrollY) || fromScrollY === toScrollY) {
    return null;
  }

  const scenes = Array.isArray(context.timeline?.scenes)
    ? context.timeline.scenes
    : [];
  const direction = toScrollY > fromScrollY ? 1 : -1;

  if (direction === 1) {
    for (let i = 1; i < scenes.length; i++) {
      if (!isReadingToAnimationBoundary(context, i - 1, i)) continue;
      const boundaryY = context.getSceneBounds(i)?.start;
      if (Number.isFinite(boundaryY) && fromScrollY < boundaryY && toScrollY >= boundaryY) {
        return { currentSceneIndex: i - 1, targetSceneIndex: i };
      }
    }
    return null;
  }

  for (let i = scenes.length - 1; i >= 1; i--) {
    if (scenes[i]?.kind !== 'animation') continue;
    const boundaryY = context.getSceneBounds(i)?.start;
    if (Number.isFinite(boundaryY) && fromScrollY > boundaryY && toScrollY <= boundaryY) {
      return { currentSceneIndex: i, targetSceneIndex: i };
    }
  }
  return null;
}

function getChargeTargetSceneIndex(state, direction, context) {
  const hasPendingForwardBoundary = isReadingToAnimationBoundary(
    context,
    state.currentSceneIndex,
    state.targetSceneIndex
  );

  if (direction === 1 && hasPendingForwardBoundary) {
    return state.targetSceneIndex;
  }

  return direction === -1
    ? Math.max(0, state.currentSceneIndex - 1)
    : state.currentSceneIndex + 1;
}

/**
 * State transition reducer (immutable)
 * @param {RuntimeState} state
 * @param {Object} action
 * @param {RuntimeContext} context
 * @returns {RuntimeState}
 */
function reduceState(state, action, context) {
  const now = Date.now();

  switch (action.type) {
    case 'SCROLL_UPDATE': {
      const { scrollY, velocity } = action.payload;
      const sceneIndex = context.getCurrentSceneIndex(scrollY);
      const sceneBounds = context.getSceneBounds(sceneIndex);

      // Update base state
      let nextState = { ...state, scrollY, velocity };

      // Check for rapid scroll bypass only during natural reading/free scroll.
      // Programmatic JS-snap can emit high Lenis velocity while SnapAligning;
      // that must not cancel the snap before its onComplete fires.
      const canEnterReadingBypass = state.current === State.FreeScroll || state.current === State.ReadingScroll;
      if (canEnterReadingBypass) {
        const crossedAnimationBoundary = findCrossedAnimationSnapBoundary(context, state.scrollY, scrollY);
        if (crossedAnimationBoundary) {
          return transitionTo(
            {
              ...nextState,
              currentSceneIndex: crossedAnimationBoundary.currentSceneIndex,
              targetSceneIndex: crossedAnimationBoundary.targetSceneIndex
            },
            State.SnapAligning,
            now
          );
        }
      }

      if (canEnterReadingBypass && Math.abs(velocity) > CONFIG.RAPID_SCROLL_VELOCITY) {
        if (state.current !== State.ReadingScroll) {
          return transitionTo(nextState, State.ReadingScroll, now);
        }
        return Object.freeze(nextState);
      }

      // State-specific logic
      switch (state.current) {
        case State.FreeScroll: {
          const distanceToSnapPoint = Math.abs(scrollY - sceneBounds.start);

          if (distanceToSnapPoint < CONFIG.SNAP_THRESHOLD &&
              Math.abs(velocity) < CONFIG.SNAP_VELOCITY_THRESHOLD) {
            const sourceSceneIndex = getSnapSourceSceneIndex(context, sceneIndex);
            return transitionTo(
              { ...nextState, currentSceneIndex: sourceSceneIndex, targetSceneIndex: sceneIndex },
              State.SnapAligning,
              now
            );
          }
          return Object.freeze(nextState);
        }

        case State.ReadingScroll: {
          // Exit bypass when velocity drops
          if (Math.abs(velocity) < CONFIG.SNAP_VELOCITY_THRESHOLD) {
            return transitionTo(nextState, State.FreeScroll, now);
          }
          return Object.freeze(nextState);
        }

        case State.SnappedArmed: {
          // Page is frozen while armed: scroll position must NOT drive the
          // trigger. Charge is accumulated from normalized input deltas and
          // surfaces via the CHARGE_TRIGGER action instead. Stay put.
          return Object.freeze(nextState);
        }

        case State.ReleaseCooldown: {
          if (now >= state.cooldownEndTime) {
            // After cooldown, re-arm or release based on the committed scene's
            // kind (recorded at RELEASE). Animation scenes re-arm so the user can
            // continue forward or reverse; reading scenes release to natural
            // scroll so the reader is never trapped (plan ReadingScroll bypass).
            const next = state.releaseMode === 'rearm'
              ? State.SnappedArmed
              : State.FreeScroll;
            return transitionTo(nextState, next, now);
          }
          return Object.freeze(nextState);
        }

        default:
          return Object.freeze(nextState);
      }
    }

    case 'SNAP_COMPLETE': {
      if (state.current === State.SnapAligning) {
        const currentSceneIndex = isReadingToAnimationBoundary(
          context,
          state.currentSceneIndex,
          state.targetSceneIndex
        )
          ? state.currentSceneIndex
          : state.targetSceneIndex;
        return transitionTo(
          { ...state, currentSceneIndex },
          State.SnappedArmed,
          now
        );
      }
      return state;
    }

    case 'CHARGE_TRIGGER': {
      // Charge reached 1.0 while armed. Direction decides forward vs reverse.
      if (state.current === State.SnappedArmed) {
        const dir = action.payload?.direction === -1 ? -1 : 1;
        const targetSceneIndex = getChargeTargetSceneIndex(state, dir, context);
        return transitionTo(
          { ...state, targetSceneIndex, playbackDirection: dir },
          State.TriggeredPlayback,
          now
        );
      }
      return state;
    }

    case 'TRIGGER_PLAYBACK': {
      if (state.current === State.SnappedArmed ||
          state.current === State.TriggeredPlayback) {
        return transitionTo(state, State.Playing, now);
      }
      return state;
    }

    case 'PLAYBACK_COMPLETE': {
      if (state.current === State.Playing) {
        return transitionTo(state, State.Completing, now);
      }
      return state;
    }

    case 'RELEASE': {
      if (state.current === State.Completing) {
        // releaseMode decides post-cooldown behavior: 'rearm' (animation scenes,
        // reversible) vs 'free' (reading scenes, natural scroll). Computed by the
        // caller from the committed scene's kind and passed in.
        const releaseMode = action.payload?.releaseMode === 'rearm' ? 'rearm' : 'free';
        return transitionTo(
          { ...state, cooldownEndTime: now + CONFIG.COOLDOWN_DURATION, releaseMode },
          State.ReleaseCooldown,
          now
        );
      }
      return state;
    }

    case 'ERROR': {
      return transitionTo(
        { ...state, error: action.payload },
        State.RecoverPresentTarget,
        now
      );
    }

    case 'RECOVER': {
      if (state.current === State.RecoverPresentTarget) {
        return transitionTo(
          { ...state, error: null },
          State.FreeScroll,
          now
        );
      }
      return state;
    }

    case 'COOLDOWN_EXPIRE': {
      if (state.current === State.ReleaseCooldown) {
        const next = state.releaseMode === 'rearm' ? State.SnappedArmed : State.FreeScroll;
        return transitionTo(state, next, now);
      }
      return state;
    }

    case 'RESET': {
      return createInitialState(state.scrollY);
    }

    default:
      return state;
  }
}

/**
 * Transition to new state with entry actions
 * @param {RuntimeState} state
 * @param {State} nextState
 * @param {number} now
 * @returns {RuntimeState}
 */
function transitionTo(state, nextState, now) {
  let newState = {
    ...state,
    current: nextState,
    stateEntryTime: now
  };

  // Entry actions
  switch (nextState) {
    case State.SnapAligning:
    case State.SnappedArmed:
    case State.TriggeredPlayback:
    case State.Playing:
    case State.Completing:
      // Page is frozen from the moment we begin aligning through completion.
      // SnappedArmed is explicitly locked: the user "scrolls" but the page
      // does not move; input is converted to charge instead (plan lines 247-249).
      newState.isScrollLocked = true;
      break;

    case State.FreeScroll:
    case State.ReadingScroll:
      newState.isScrollLocked = false;
      break;

    case State.ReleaseCooldown:
      newState.isScrollLocked = newState.releaseMode === 'rearm';
      break;
  }

  return Object.freeze(newState);
}

// ============================================================================
// Runtime API
// ============================================================================

import { createInputNormalizer } from './input-normalizer.js';
import { createChargeAccumulator } from './charge-accumulator.js';

/**
 * Create homepage snap runtime instance
 * @param {Object} options
 * @param {Object} [options.timeline] - Optional manifest-derived timeline metadata
 *   ({ scenes, labels }). Scene count is derived from scenes.length (preferred)
 *   or labels. Playback itself is delegated to scenePresenter, NOT to a GSAP
 *   master timeline — the homepage uses webm autoplay per the plan.
 * @param {Object|null} options.scrollController - Lenis instance or null
 * @param {Function} options.scenePresenter - REQUIRED. Async ({fromIndex, toIndex,
 *   direction, scene}) => Promise. Owns the actual transition/playback and must
 *   resolve when the target scene is presented, or reject to trigger recovery.
 * @param {Function} options.onStateChange - Callback for state changes
 * @param {Function} options.onError - Error handler
 * @param {Function} [options.onCompletePlayback] - Completion hook called by
 *   the Director while entering Completing. SceneTimeline commit/present/cleanup
 *   belongs here, after adapter play() has only reported completion.
 * @param {Function} [options.onChargeProgress] - (progress 0-1, direction) while armed
 * @param {Function} [options.resolveSceneTop] - (sceneId) => number|null. Returns
 *   the real document Y of a scene's DOM host. When supplied, scene bounds use
 *   actual element positions instead of the index*vh fallback. Scenes whose
 *   resolver returns null are skipped (no DOM host yet).
 */
export function createHomepageSnapRuntime({
  timeline = {},
  scrollController = null,
  scenePresenter,
  onStateChange = () => {},
  onError = () => {},
  onCompletePlayback = () => {},
  onChargeProgress = () => {},
  resolveSceneTop = null
}) {
  if (typeof scenePresenter !== 'function') {
    throw new Error('scenePresenter is required (async fn that performs playback)');
  }

  // Runtime context
  const context = {
    sceneCount: 0, // Will be set from timeline labels
    timeline,
    scrollController,

    /**
     * Get scene bounds in px. Uses real DOM tops (sceneTops) when a
     * resolveSceneTop was supplied; otherwise falls back to index*vh.
     * @param {number} sceneIndex
     * @returns {{start: number, end: number, height: number}}
     */
    getSceneBounds(sceneIndex) {
      const vh = window.innerHeight;
      if (sceneTops.length) {
        const start = sceneTops[sceneIndex] ?? sceneIndex * vh;
        const next = sceneTops[sceneIndex + 1];
        const end = next ?? (start + vh);
        return { start, end, height: end - start };
      }
      const start = sceneIndex * vh;
      const end = (sceneIndex + 1) * vh;
      return { start, end, height: end - start };
    },

    /**
     * Get current scene index from scroll position. With real tops, returns the
     * last scene whose top is at or above scrollY; else the index*vh bucket.
     * @param {number} scrollY
     * @returns {number}
     */
    getCurrentSceneIndex(scrollY) {
      const vh = window.innerHeight;
      if (sceneTops.length) {
        let idx = 0;
        for (let i = 0; i < sceneTops.length; i++) {
          if (scrollY >= sceneTops[i] - vh / 2) idx = i;
        }
        return idx;
      }
      return Math.max(0, Math.floor(scrollY / vh));
    }
  };

  // Scene bounds cache (recalculated on viewport changes)
  let sceneBounds = [];
  // Real per-scene document tops, parallel to context.sceneCount, when a
  // resolveSceneTop is available. Empty => index*vh fallback everywhere.
  let sceneTops = [];

  /**
   * Recalculate all scene bounds (called on resize/orientation change).
   * Refreshes real DOM tops first so bounds reflect actual layout.
   */
  function recalculateAllSceneBounds() {
    const vh = window.innerHeight;
    normalizer.updateViewportHeight(vh || 1);

    // Refresh real tops when a resolver is available.
    sceneTops = [];
    if (typeof resolveSceneTop === 'function' && Array.isArray(timeline.scenes)) {
      sceneTops = timeline.scenes.map((s) => {
        const top = resolveSceneTop(s.id);
        return Number.isFinite(top) ? top : null;
      });
    }

    sceneBounds = [];
    for (let i = 0; i < context.sceneCount; i++) {
      const top = sceneTops[i] ?? i * vh;
      const bottom = sceneTops[i + 1] ?? (top + vh);
      sceneBounds.push({
        id: timeline.scenes?.[i]?.id || `scene-${i}`,
        top,
        bottom,
        height: bottom - top
      });
    }
    return sceneBounds;
  }

  /**
   * Calculate scene top position. Prefers the real DOM top via resolveSceneTop,
   * falling back to index*vh.
   * @param {Object} scene
   * @returns {number}
   */
  function calculateSceneTop(scene) {
    if (!timeline.scenes) return 0;
    const sceneIndex = timeline.scenes.findIndex(s => s.id === scene.id);
    if (sceneIndex === -1) return 0;
    if (typeof resolveSceneTop === 'function') {
      const top = resolveSceneTop(scene.id);
      if (Number.isFinite(top)) return top;
    }
    return sceneIndex * window.innerHeight;
  }

  /**
   * Snap to specific scene by ID (public API method)
   * @param {string} sceneId
   * @param {Object} scrollController
   */
  function snapToScene(sceneId, scrollController) {
    if (!timeline.scenes) {
      console.error('[Snap Runtime] No scenes available in timeline');
      return;
    }

    const scene = timeline.scenes.find(s => s.id === sceneId);
    if (!scene) {
      console.error('[Snap Runtime] Scene not found:', sceneId);
      return;
    }

    const targetY = calculateSceneTop(scene);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (scrollController?.scrollTo) {
      // Primary: Lenis smooth scroll
      scrollController.scrollTo(targetY, {
        duration: prefersReducedMotion ? 0 : 0.8,
        easing: prefersReducedMotion
          ? (t) => t
          : (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
        immediate: prefersReducedMotion,
        force: true,
        lock: true,
        onComplete: () => {
          dispatch({ type: 'SNAP_COMPLETE' });
        }
      });
    } else {
      // Fallback: native scrollTo
      window.scrollTo({
        top: targetY,
        behavior: prefersReducedMotion ? 'auto' : 'smooth'
      });

      // Poll for scroll completion
      if (!prefersReducedMotion) {
        watchScrollComplete(targetY, () => {
          dispatch({ type: 'SNAP_COMPLETE' });
        });
      } else {
        dispatch({ type: 'SNAP_COMPLETE' });
      }
    }
  }

  /**
   * Watch for scroll completion (fallback when no Lenis)
   * @param {number} targetY
   * @param {Function} onComplete
   */
  function watchScrollComplete(targetY, onComplete) {
    let lastY = window.scrollY;
    let stableCount = 0;
    const threshold = 2; // px tolerance
    const requiredStableFrames = 3;

    function check() {
      const currentY = window.scrollY;
      const diff = Math.abs(currentY - targetY);
      const moved = Math.abs(currentY - lastY);

      if (diff < threshold && moved < 1) {
        stableCount++;
        if (stableCount >= requiredStableFrames) {
          onComplete?.();
          return;
        }
      } else {
        stableCount = 0;
      }

      lastY = currentY;
      requestAnimationFrame(check);
    }

    requestAnimationFrame(check);
  }

  /**
   * Force-align the real document scroll position to the committed scene.
   * Lenis can still be stopped while Completing, so immediate alignment must
   * opt into force and keep a native fallback for non-Lenis controllers.
   * @param {number} targetY
   */
  function alignDocumentTo(targetY) {
    const target = Math.max(0, targetY);

    if (scrollController && scrollController.scrollTo) {
      scrollController.scrollTo(target, {
        immediate: true,
        duration: 0,
        force: true,
        lock: false
      });
    }

    if (Math.abs((window.scrollY || 0) - target) > 1) {
      window.scrollTo({
        top: target,
        left: window.scrollX || 0,
        behavior: 'auto'
      });
    }
  }

  // Derive scene count: prefer explicit scenes[], fall back to labels{}.
  const labels = timeline.labels || {};
  context.sceneCount = Array.isArray(timeline.scenes) && timeline.scenes.length
    ? timeline.scenes.length
    : Object.keys(labels).length;

  // Charge subsystem: normalize wheel/touch/keyboard to viewport fractions,
  // accumulate toward the 10vh threshold. This — not scroll position — is what
  // arms playback (plan lines 276-288).
  const normalizer = createInputNormalizer({ viewportHeight: window.innerHeight || 1 });
  const charge = createChargeAccumulator({
    thresholdVh: CONFIG.CHARGE_THRESHOLD_VH,
    decayRatePerMs: CONFIG.CHARGE_DECAY_PER_MS
  });
  let lastChargeInputTs = 0;

  // Runtime state
  let state = createInitialState(window.scrollY || 0);
  let rafId = null;
  let snapAnimationId = null;
  let pendingSnapCharge = 0;

  /**
   * Dispatch action to state machine
   * @param {Object} action
   */
  function dispatch(action) {
    const prevState = state;
    state = reduceState(state, action, context);

    if (prevState.current !== state.current) {
      onStateChange(state, prevState);
      executeStateActions(state, prevState);
    }
  }

  /**
   * Execute side effects on state transitions
   * @param {RuntimeState} current
   * @param {RuntimeState} previous
   */
  function executeStateActions(current, previous) {
    // Exit actions
    switch (previous.current) {
      case State.SnapAligning:
        if (snapAnimationId) {
          cancelAnimationFrame(snapAnimationId);
          snapAnimationId = null;
        }
        break;
    }

    // Entry actions
    switch (current.current) {
      case State.SnapAligning:
        pendingSnapCharge = 0;
        executeSnap(current.targetSceneIndex);
        break;

      case State.SnappedArmed:
        flushPendingSnapCharge();
        break;

      case State.TriggeredPlayback:
        // Transient: charge has fired. Advance to Playing on the next tick so
        // onStateChange observers see TriggeredPlayback before Playing.
        Promise.resolve().then(() => {
          if (state.current === State.TriggeredPlayback) {
            dispatch({ type: 'TRIGGER_PLAYBACK' });
          }
        });
        break;

      case State.Playing:
        executePlayback(current.targetSceneIndex);
        break;

      case State.Completing:
        executeComplete();
        break;

      case State.ReleaseCooldown:
        // Deterministically leave cooldown after COOLDOWN_DURATION, independent
        // of whether a scroll event arrives (after alignment none may). The
        // COOLDOWN_EXPIRE action re-arms or frees per releaseMode.
        scheduleCooldownExpiry();
        break;

      case State.RecoverPresentTarget:
        scheduleRecovery();
        break;
    }
  }

  /**
   * Leave ReleaseCooldown deterministically once the cooldown elapses.
   */
  function scheduleCooldownExpiry() {
    setTimeout(() => {
      if (state.current === State.ReleaseCooldown) {
        dispatch({ type: 'COOLDOWN_EXPIRE' });
      }
    }, CONFIG.COOLDOWN_DURATION);
  }

  /**
   * Execute snap animation to scene boundary
   * @param {number} sceneIndex
   */
  function executeSnap(sceneIndex) {
    const bounds = context.getSceneBounds(sceneIndex);
    const targetScroll = bounds.start;

    // Already aligned (within 1px): no animation needed, arm immediately.
    if (Math.abs((window.scrollY || 0) - targetScroll) <= 1) {
      dispatch({ type: 'SNAP_COMPLETE' });
      return;
    }

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (scrollController && scrollController.scrollTo) {
      // Primary: Use Lenis smooth scroll
      scrollController.scrollTo(targetScroll, {
        duration: prefersReducedMotion ? 0 : 0.8,
        easing: prefersReducedMotion
          ? (t) => t
          : (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t, // easeInOutQuad
        immediate: prefersReducedMotion,
        force: true,
        lock: true,
        onComplete: () => {
          dispatch({ type: 'SNAP_COMPLETE' });
        }
      });
    } else {
      // Fallback: native window.scrollTo with smooth behavior
      if (prefersReducedMotion) {
        // Instant snap for reduced motion
        window.scrollTo({
          top: targetScroll,
          behavior: 'auto'
        });
        dispatch({ type: 'SNAP_COMPLETE' });
      } else {
        // Animate manually with requestAnimationFrame
        const startScroll = window.scrollY;
        const distance = targetScroll - startScroll;
        const startTime = Date.now();
        const duration = 800;

        function animateSnap() {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const t = progress;
          const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

          window.scrollTo(0, startScroll + distance * eased);

          if (progress < 1) {
            snapAnimationId = requestAnimationFrame(animateSnap);
          } else {
            snapAnimationId = null;
            dispatch({ type: 'SNAP_COMPLETE' });
          }
        }

        snapAnimationId = requestAnimationFrame(animateSnap);
      }
    }
  }

  /**
   * Execute scene playback via the injected presenter.
   * The presenter owns the real transition (webm autoplay, ink shader, copy
   * entry) and resolves when the target scene is presented. On reject/throw we
   * route to RecoverPresentTarget — playback failure never wedges the page.
   * @param {number} targetSceneIndex
   */
  function executePlayback(targetSceneIndex) {
    // Lock scroll (defence in depth; state is already isScrollLocked)
    if (scrollController && scrollController.stop) {
      scrollController.stop();
    }
    document.body.style.overflow = 'hidden';

    const fromIndex = state.currentSceneIndex;
    const direction = state.playbackDirection === -1 ? -1 : 1;
    const scene = Array.isArray(timeline.scenes)
      ? timeline.scenes[targetSceneIndex]
      : null;

    let settled = false;
    Promise.resolve()
      .then(() => scenePresenter({ fromIndex, toIndex: targetSceneIndex, direction, scene }))
      .then(() => {
        if (settled) return;
        settled = true;
        dispatch({ type: 'PLAYBACK_COMPLETE' });
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        dispatch({ type: 'ERROR', payload: err instanceof Error ? err : new Error(String(err)) });
      });
  }

  /**
   * Execute completion: commit target scene, align the page to it, then release.
   */
  function executeComplete() {
    // Commit the target scene as the new current scene.
    const previousIndex = state.currentSceneIndex;
    const committedIndex = state.targetSceneIndex;
    const direction = state.playbackDirection === -1 ? -1 : 1;
    const completingState = state;

    try {
      onCompletePlayback({
        fromIndex: previousIndex,
        toIndex: committedIndex,
        direction,
        state: completingState,
        scene: Array.isArray(timeline.scenes) ? timeline.scenes[committedIndex] : null
      });
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }

    state = Object.freeze({ ...state, currentSceneIndex: committedIndex });

    const committedScene = Array.isArray(timeline.scenes)
      ? timeline.scenes[committedIndex]
      : null;

    // Align the document to the committed scene's real top so scrollY and
    // currentSceneIndex agree. Without this, the next re-arm/scroll re-infers the
    // OLD scene from a stale scrollY (root cause of the reverse/re-arm failure).
    const targetY = committedScene ? calculateSceneTop(committedScene) : null;
    if (Number.isFinite(targetY)) {
      alignDocumentTo(targetY);
    }

    // Reset charge so a fresh arm starts from zero.
    charge.reset();
    onChargeProgress(0, 0);

    // Release: animation scenes re-arm (reversible), reading scenes free-scroll.
    const releaseMode = shouldRearmAfterComplete(committedScene) ? 'rearm' : 'free';
    if (releaseMode === 'free') {
      document.body.style.overflow = '';
      if (scrollController && scrollController.start) {
        scrollController.start();
      }
    } else {
      document.body.style.overflow = 'hidden';
      if (scrollController && scrollController.stop) {
        scrollController.stop();
      }
    }
    dispatch({ type: 'RELEASE', payload: { releaseMode } });
  }

  /**
   * Schedule recovery after timeout.
   * Recovery must ALWAYS release the page — a failed presenter (404, play()
   * reject, ended never firing) must never leave scroll locked (plan line 274).
   */
  function scheduleRecovery() {
    setTimeout(() => {
      if (state.current === State.RecoverPresentTarget) {
        // onError owns presenting the target terminal state / hiding overlays.
        onError(state.error);

        // Guarantee unlock regardless of what onError does.
        document.body.style.overflow = '';
        if (scrollController && scrollController.start) {
          scrollController.start();
        }
        charge.reset();
        onChargeProgress(0, 0);

        // Commit to the target scene's terminal state and resume free scroll.
        state = Object.freeze({ ...state, currentSceneIndex: state.targetSceneIndex });
        dispatch({ type: 'RECOVER' });
      }
    }, CONFIG.RECOVERY_TIMEOUT);
  }

  /**
   * Update runtime (call every frame)
   * @param {number} deltaTime - unused, kept for API compatibility
   */
  function update(deltaTime) {
    // State machine is event-driven via scroll updates
    // This method is kept for potential future frame-based logic
  }

  /**
   * Feed a normalized input delta into the charge accumulator while armed.
   * Positive charge -> forward trigger, negative -> reverse. Emits progress for
   * the indicator and dispatches CHARGE_TRIGGER once the 10vh tank fills.
   * @param {number} normalizedDelta - viewport fraction (0.1 === 10vh)
   * @returns {boolean} true if the input was consumed (armed); caller should preventDefault
   */
  function feedCharge(normalizedDelta) {
    if (state.current !== State.SnappedArmed) return false;
    if (normalizedDelta === 0) return true; // armed: still consume to keep page frozen

    lastChargeInputTs = Date.now();
    const progress = charge.accumulate(normalizedDelta);
    onChargeProgress(progress, charge.getDirection());

    if (charge.isTriggered()) {
      const direction = charge.getDirection();
      charge.reset();
      // Reverse at the very first scene has nowhere to go: ignore.
      if (direction === -1 && state.currentSceneIndex === 0) {
        onChargeProgress(0, 0);
        return true;
      }
      dispatch({ type: 'CHARGE_TRIGGER', payload: { direction } });
    }
    return true;
  }

  function queuePendingSnapCharge(normalizedDelta) {
    if (state.current !== State.SnapAligning) return false;
    if (normalizedDelta !== 0) {
      pendingSnapCharge += normalizedDelta;
      lastChargeInputTs = Date.now();
    }
    return true;
  }

  function flushPendingSnapCharge() {
    if (pendingSnapCharge === 0) return;
    const normalizedDelta = pendingSnapCharge;
    pendingSnapCharge = 0;
    const schedule = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb) => setTimeout(cb, 0);
    schedule(() => schedule(() => {
      if (state.current === State.SnappedArmed) feedCharge(normalizedDelta);
    }));
  }

  /**
   * Apply charge decay when the user pauses mid-charge (called each frame while armed).
   */
  function tickChargeDecay() {
    if (state.current !== State.SnappedArmed) return;
    const now = Date.now();
    const idle = now - lastChargeInputTs;
    if (idle > 80 && charge.getProgress() > 0) {
      const progress = charge.decay(idle);
      onChargeProgress(progress, charge.getDirection());
      lastChargeInputTs = now;
    }
  }

  /**
   * Handle scroll event
   * @param {Event} event
   */
  function handleScroll(event) {
    const scrollY = window.scrollY || window.pageYOffset;
    const velocity = scrollController && scrollController.velocity
      ? scrollController.velocity
      : 0;

    dispatch({
      type: 'SCROLL_UPDATE',
      payload: { scrollY, velocity }
    });
  }

  /**
   * Handle wheel event. While armed, converts wheel delta to charge and
   * signals the caller to preventDefault (page stays frozen).
   * @param {WheelEvent} event
   * @returns {boolean} true if consumed
   */
  function handleWheel(event) {
    if (state.current === State.SnapAligning) {
      return queuePendingSnapCharge(normalizer.normalizeWheel(event));
    }
    if (state.current !== State.SnappedArmed) return state.isScrollLocked;
    return feedCharge(normalizer.normalizeWheel(event));
  }

  /**
   * Handle a touch move delta (px) while armed.
   * @param {number} pixelDelta - signed vertical finger movement in px
   * @returns {boolean} true if consumed
   */
  function handleTouch(pixelDelta) {
    if (state.current === State.SnapAligning) {
      return queuePendingSnapCharge(normalizer.normalizeTouchMove({ pixelDelta }));
    }
    if (state.current !== State.SnappedArmed) return state.isScrollLocked;
    return feedCharge(normalizer.normalizeTouchMove({ pixelDelta }));
  }

  /**
   * Handle keyboard event. PageDown/Space/Arrows feed discrete charge steps.
   * @param {KeyboardEvent} event
   * @returns {boolean} true if consumed
   */
  function handleKeyboard(event) {
    if (state.current === State.SnapAligning) {
      const pendingDelta = normalizer.normalizeKeyboard(event);
      if (pendingDelta === 0) return false;
      return queuePendingSnapCharge(pendingDelta);
    }
    if (state.current !== State.SnappedArmed) return state.isScrollLocked;
    const delta = normalizer.normalizeKeyboard(event);
    if (delta === 0) return false;
    return feedCharge(delta);
  }

  /**
   * Get current state (frozen, immutable)
   * @returns {RuntimeState}
   */
  function getCurrentState() {
    return state;
  }

  /**
   * Get current scene index
   * @returns {number}
   */
  function getCurrentScene() {
    return state.currentSceneIndex;
  }

  /**
   * Reset runtime to initial state
   */
  function reset() {
    // Stop any ongoing animations
    if (snapAnimationId) {
      cancelAnimationFrame(snapAnimationId);
      snapAnimationId = null;
    }

    // Reset charge tank
    charge.reset();
    pendingSnapCharge = 0;
    onChargeProgress(0, 0);

    // Unlock scroll
    document.body.style.overflow = '';
    if (scrollController && scrollController.start) {
      scrollController.start();
    }

    // Reset state
    dispatch({ type: 'RESET' });
  }

  /**
   * Destroy runtime and cleanup
   */
  function destroy() {
    reset();
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
  }

  // Return public API
  return Object.freeze({
    update,
    handleScroll,
    handleWheel,
    handleTouch,
    handleKeyboard,
    feedCharge,
    tickChargeDecay,
    getChargeProgress: () => charge.getProgress(),
    getChargeDirection: () => charge.getDirection(),
    getCurrentState,
    getCurrentScene,
    snapToScene: (sceneId) => snapToScene(sceneId, context.scrollController),
    recalculateSceneBounds: recalculateAllSceneBounds,
    calculateSceneTop,
    reset,
    destroy,

    // Expose for testing/debugging
    State,
    CONFIG,
    sceneBounds: () => sceneBounds
  });
}
