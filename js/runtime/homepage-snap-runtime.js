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
  SNAP_THRESHOLD: 50, // px from scene boundary to trigger snap
  SNAP_VELOCITY_THRESHOLD: 0.5, // Lenis velocity threshold for snap
  TRIGGER_THRESHOLD: 100, // px scroll delta to trigger playback
  COOLDOWN_DURATION: 300, // ms before re-arming after release
  RECOVERY_TIMEOUT: 2000, // ms before forcing recovery
  RAPID_SCROLL_VELOCITY: 2.0, // velocity threshold for bypass
  SCENE_HEIGHT_VH: 100 // each scene is 100dvh
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
    scrollY: initialScroll,
    velocity: 0,
    stateEntryTime: Date.now(),
    cooldownEndTime: 0,
    isScrollLocked: false,
    error: null
  });
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

      // Check for rapid scroll bypass
      if (Math.abs(velocity) > CONFIG.RAPID_SCROLL_VELOCITY) {
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
            return transitionTo(
              { ...nextState, targetSceneIndex: sceneIndex },
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
          const scrollDelta = Math.abs(scrollY - sceneBounds.start);

          if (scrollDelta > CONFIG.TRIGGER_THRESHOLD) {
            return transitionTo(
              { ...nextState, targetSceneIndex: sceneIndex },
              State.TriggeredPlayback,
              now
            );
          }
          return Object.freeze(nextState);
        }

        case State.ReleaseCooldown: {
          if (now >= state.cooldownEndTime) {
            return transitionTo(nextState, State.FreeScroll, now);
          }
          return Object.freeze(nextState);
        }

        default:
          return Object.freeze(nextState);
      }
    }

    case 'SNAP_COMPLETE': {
      if (state.current === State.SnapAligning) {
        return transitionTo(
          { ...state, currentSceneIndex: state.targetSceneIndex },
          State.SnappedArmed,
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
        return transitionTo(
          { ...state, cooldownEndTime: now + CONFIG.COOLDOWN_DURATION },
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
    case State.Playing:
    case State.Completing:
      newState.isScrollLocked = true;
      break;

    case State.FreeScroll:
    case State.ReleaseCooldown:
      newState.isScrollLocked = false;
      break;
  }

  return Object.freeze(newState);
}

// ============================================================================
// Runtime API
// ============================================================================

/**
 * Create homepage snap runtime instance
 * @param {Object} options
 * @param {Object} options.timeline - GSAP timeline from section-manifest
 * @param {Object|null} options.scrollController - Lenis instance or null
 * @param {Function} options.onStateChange - Callback for state changes
 * @param {Function} options.onError - Error handler
 * @returns {Object} Runtime API
 */
export function createHomepageSnapRuntime({
  timeline,
  scrollController = null,
  onStateChange = () => {},
  onError = () => {}
}) {
  if (!timeline) {
    throw new Error('Timeline is required');
  }

  // Runtime context
  const context = {
    sceneCount: 0, // Will be set from timeline labels
    timeline,
    scrollController,

    /**
     * Get scene bounds in px
     * @param {number} sceneIndex
     * @returns {{start: number, end: number, height: number}}
     */
    getSceneBounds(sceneIndex) {
      const vh = window.innerHeight;
      const start = sceneIndex * vh;
      const end = (sceneIndex + 1) * vh;
      return { start, end, height: end - start };
    },

    /**
     * Get current scene index from scroll position
     * @param {number} scrollY
     * @returns {number}
     */
    getCurrentSceneIndex(scrollY) {
      const vh = window.innerHeight;
      return Math.max(0, Math.floor(scrollY / vh));
    }
  };

  // Scene bounds cache (recalculated on viewport changes)
  let sceneBounds = [];

  /**
   * Recalculate all scene bounds (called on resize/orientation change)
   */
  function recalculateAllSceneBounds() {
    const vh = window.innerHeight;
    sceneBounds = [];
    for (let i = 0; i < context.sceneCount; i++) {
      sceneBounds.push({
        id: timeline.scenes?.[i]?.id || `scene-${i}`,
        top: i * vh,
        bottom: (i + 1) * vh,
        height: vh
      });
    }
    return sceneBounds;
  }

  /**
   * Calculate scene top position
   * @param {Object} scene
   * @returns {number}
   */
  function calculateSceneTop(scene) {
    if (!timeline.scenes) return 0;
    const sceneIndex = timeline.scenes.findIndex(s => s.id === scene.id);
    if (sceneIndex === -1) return 0;
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

  // Derive scene count from timeline labels
  const labels = timeline.labels || {};
  context.sceneCount = Object.keys(labels).length;

  // Runtime state
  let state = createInitialState(window.scrollY || 0);
  let rafId = null;
  let snapAnimationId = null;

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
        executeSnap(current.targetSceneIndex);
        break;

      case State.Playing:
        executePlayback(current.targetSceneIndex);
        break;

      case State.Completing:
        executeComplete();
        break;

      case State.RecoverPresentTarget:
        scheduleRecovery();
        break;
    }
  }

  /**
   * Execute snap animation to scene boundary
   * @param {number} sceneIndex
   */
  function executeSnap(sceneIndex) {
    const bounds = context.getSceneBounds(sceneIndex);
    const targetScroll = bounds.start;

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
   * Execute timeline playback
   * @param {number} sceneIndex
   */
  function executePlayback(sceneIndex) {
    // Lock scroll
    if (scrollController && scrollController.stop) {
      scrollController.stop();
    }
    document.body.style.overflow = 'hidden';

    // Get scene label
    const labels = timeline.labels || {};
    const sceneLabel = `scene-${sceneIndex}`;

    if (!labels[sceneLabel]) {
      dispatch({
        type: 'ERROR',
        payload: new Error(`Scene label "${sceneLabel}" not found`)
      });
      return;
    }

    // Play from label
    timeline.play(sceneLabel);

    // Listen for complete
    timeline.eventCallback('onComplete', () => {
      dispatch({ type: 'PLAYBACK_COMPLETE' });
    });
  }

  /**
   * Execute completion and unlock
   */
  function executeComplete() {
    // Unlock scroll
    document.body.style.overflow = '';
    if (scrollController && scrollController.start) {
      scrollController.start();
    }

    // Clear timeline callback
    timeline.eventCallback('onComplete', null);

    // Transition to cooldown
    dispatch({ type: 'RELEASE' });
  }

  /**
   * Schedule recovery after timeout
   */
  function scheduleRecovery() {
    setTimeout(() => {
      if (state.current === State.RecoverPresentTarget) {
        onError(state.error);
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
   * Handle wheel event (for manual trigger detection)
   * @param {WheelEvent} event
   */
  function handleWheel(event) {
    if (state.current === State.SnappedArmed) {
      const delta = Math.abs(event.deltaY);
      if (delta > CONFIG.TRIGGER_THRESHOLD) {
        dispatch({ type: 'TRIGGER_PLAYBACK' });
      }
    }
  }

  /**
   * Handle touch event
   * @param {TouchEvent} event
   */
  function handleTouch(event) {
    // Touch handling for mobile trigger
    // Implementation depends on touch tracking requirements
  }

  /**
   * Handle keyboard event
   * @param {KeyboardEvent} event
   */
  function handleKeyboard(event) {
    if (state.current === State.SnappedArmed) {
      // Space or Enter to trigger playback
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        dispatch({ type: 'TRIGGER_PLAYBACK' });
      }
    }
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

    // Reset timeline
    timeline.pause(0);
    timeline.eventCallback('onComplete', null);

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
