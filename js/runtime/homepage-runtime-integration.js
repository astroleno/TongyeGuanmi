/**
 * @fileoverview Homepage Runtime Integration
 *
 * Wires the homepage snap runtime to the existing timeline architecture:
 * - Initializes snap runtime with timeline from manifest
 * - Connects to Lenis or window.scrollTo fallback
 * - Wires state changes to DOM updates
 * - Connects charge indicator
 * - Connects recovery handler
 * - Exposes runtime lifecycle
 * - Handles viewport changes (resize, orientation, visualViewport)
 * - Implements ADR-homepage-js-snap.md fallback matrix
 */

import { homepageTimeline } from '../../src/section-manifest.mjs';
import { createHomepageSnapRuntime } from './homepage-snap-runtime.js';
import { createSceneTimelineController } from '../transitions/homepage/scene-timeline-controller.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  CHARGE_INDICATOR_THRESHOLD_VH: 10,
  CHARGE_UPDATE_THROTTLE_MS: 16,
  PREFERS_REDUCED_MOTION_SKIP_CHARGE: true,
  VIEWPORT_CHANGE_THRESHOLD_PX: 100, // Mobile address bar detection threshold
  DOM_ATTRIBUTES: {
    runtimeState: 'data-homepage-runtime-state',
    currentScene: 'data-homepage-current-scene',
    chargeProgress: 'data-homepage-charge-progress',
    scrollLocked: 'data-homepage-scroll-locked'
  }
};

// ============================================================================
// Charge Accumulator (10vh from any input source)
// ============================================================================

/**
 * Accumulates scroll delta across sources until threshold is met
 */
class ChargeAccumulator {
  constructor(thresholdVh = 10) {
    this.thresholdVh = thresholdVh;
    this.accumulatedVh = 0;
    this.lastTimestamp = 0;
    this.isCharging = false;
  }

  /**
   * Add scroll delta in pixels
   * @param {number} deltaPx - Scroll delta in pixels
   * @returns {boolean} True if threshold reached
   */
  addDelta(deltaPx) {
    const vh = window.innerHeight || 1;
    const deltaVh = Math.abs(deltaPx) / vh * 100;

    this.accumulatedVh += deltaVh;
    this.lastTimestamp = Date.now();

    if (this.accumulatedVh >= this.thresholdVh) {
      this.isCharging = true;
      return true;
    }

    return false;
  }

  /**
   * Get current charge progress (0-1)
   */
  getProgress() {
    return Math.min(this.accumulatedVh / this.thresholdVh, 1);
  }

  /**
   * Reset accumulator
   */
  reset() {
    this.accumulatedVh = 0;
    this.isCharging = false;
  }

  /**
   * Check if charge is active
   */
  isActive() {
    return this.isCharging;
  }
}

// ============================================================================
// DOM State Synchronization
// ============================================================================

/**
 * Sync runtime state to DOM attributes
 */
function syncStateToDom(state, rootElement = document.documentElement) {
  if (!rootElement) return;

  const attrs = CONFIG.DOM_ATTRIBUTES;

  rootElement.setAttribute(attrs.runtimeState, state.current);
  rootElement.setAttribute(attrs.currentScene, state.currentSceneIndex);
  rootElement.setAttribute(attrs.scrollLocked, state.isScrollLocked ? 'true' : 'false');
}

/**
 * Update charge indicator
 */
function updateChargeIndicator(progress, rootElement = document.documentElement) {
  if (!rootElement) return;

  const attrs = CONFIG.DOM_ATTRIBUTES;
  const percentage = Math.round(progress * 100);

  rootElement.setAttribute(attrs.chargeProgress, percentage);
  rootElement.style.setProperty('--homepage-charge-progress', progress.toFixed(3));
}

// ============================================================================
// Scene-Timeline Integration
// ============================================================================

/**
 * Create timeline controller adapter
 */
function createTimelineAdapter(sceneTimelineController, runtime) {
  return {
    onSceneEnter(sceneIndex) {
      // Notify timeline controller of scene entry
      const scene = homepageTimeline.scenes[sceneIndex];
      if (!scene) return;

      console.debug('[Timeline Adapter] Scene enter:', scene.id);
    },

    onSceneExit(sceneIndex) {
      const scene = homepageTimeline.scenes[sceneIndex];
      if (!scene) return;

      console.debug('[Timeline Adapter] Scene exit:', scene.id);
    },

    onPlaybackStart(sceneIndex) {
      const scene = homepageTimeline.scenes[sceneIndex];
      if (!scene) return;

      console.debug('[Timeline Adapter] Playback start:', scene.id);

      // Mark scene as playing
      const sceneElement = document.querySelector(`[data-scene-id="${scene.id}"]`);
      if (sceneElement) {
        sceneElement.setAttribute('data-scene-state', 'playing');
      }
    },

    onPlaybackComplete(sceneIndex) {
      const scene = homepageTimeline.scenes[sceneIndex];
      if (!scene) return;

      console.debug('[Timeline Adapter] Playback complete:', scene.id);

      // Mark scene as presented
      const sceneElement = document.querySelector(`[data-scene-id="${scene.id}"]`);
      if (sceneElement) {
        sceneElement.setAttribute('data-scene-state', 'presented');
      }
    }
  };
}

// ============================================================================
// Reduced Motion Handler
// ============================================================================

/**
 * Skip charge and jump directly to presented state
 */
function handleReducedMotionTransition(sceneIndex, rootElement) {
  const scene = homepageTimeline.scenes[sceneIndex];
  if (!scene) return;

  console.debug('[Reduced Motion] Skip charge, jump to presented:', scene.id);

  const sceneElement = document.querySelector(`[data-scene-id="${scene.id}"]`);
  if (sceneElement) {
    sceneElement.setAttribute('data-scene-state', 'presented');
  }

  // Scroll to scene immediately
  const vh = window.innerHeight || 1;
  const targetScroll = sceneIndex * vh;
  window.scrollTo({ top: targetScroll, behavior: 'auto' });
}

// ============================================================================
// Recovery Handler
// ============================================================================

/**
 * Handle timeout recovery: present terminal state and release
 */
function handleRecovery(runtime, sceneIndex) {
  console.warn('[Recovery] Timeout reached, presenting terminal state');

  const scene = homepageTimeline.scenes[sceneIndex];
  if (!scene) return;

  // Force present
  const sceneElement = document.querySelector(`[data-scene-id="${scene.id}"]`);
  if (sceneElement) {
    sceneElement.setAttribute('data-scene-state', 'presented');
  }

  // Unlock scroll
  document.body.style.overflow = '';

  // Reset runtime to FreeScroll
  runtime.reset();
}

// ============================================================================
// Runtime Integration API
// ============================================================================

/**
 * Create integrated homepage runtime
 * @param {Object} options
 * @param {Object|null} options.scrollController - Lenis instance or null
 * @param {HTMLElement} options.rootElement - Root element for DOM updates
 * @param {boolean} options.reduceMotion - Prefers reduced motion flag
 * @returns {Object} Runtime API
 */
export function createHomepageRuntimeIntegration({
  scrollController = null,
  rootElement = document.documentElement,
  reduceMotion = false
} = {}) {

  // Validate timeline
  if (!homepageTimeline || !homepageTimeline.scenes) {
    throw new Error('Invalid homepageTimeline: missing scenes');
  }

  console.debug('[Runtime Integration] Initializing with', homepageTimeline.scenes.length, 'scenes');

  // Create scene timeline controller
  const sceneTimelineController = createSceneTimelineController({
    root: document,
    scenes: homepageTimeline.scenes
  });

  // Create charge accumulator
  const chargeAccumulator = new ChargeAccumulator(CONFIG.CHARGE_INDICATOR_THRESHOLD_VH);

  // Track previous state for change detection
  let previousState = null;
  let chargeThrottle = 0;
  let isDestroyed = false;

  // State change handler
  function handleStateChange(newState, prevState) {
    if (isDestroyed) return;

    console.debug('[Runtime Integration] State change:', prevState.current, '->', newState.current);

    // Sync to DOM
    syncStateToDom(newState, rootElement);

    // Handle state-specific logic
    switch (newState.current) {
      case 'SnappedArmed':
        chargeAccumulator.reset();
        updateChargeIndicator(0, rootElement);
        break;

      case 'Playing':
        // Lock scroll via Lenis if available
        if (scrollController && scrollController.stop) {
          scrollController.stop();
        }
        break;

      case 'FreeScroll':
      case 'ReleaseCooldown':
        // Unlock scroll
        if (scrollController && scrollController.start) {
          scrollController.start();
        }
        chargeAccumulator.reset();
        updateChargeIndicator(0, rootElement);
        break;

      case 'RecoverPresentTarget':
        handleRecovery(runtime, newState.currentSceneIndex);
        break;
    }

    previousState = newState;
  }

  // Error handler
  function handleError(error) {
    console.error('[Runtime Integration] Error:', error);

    // Attempt to recover gracefully
    if (scrollController && scrollController.start) {
      scrollController.start();
    }
    document.body.style.overflow = '';
  }

  // Create snap runtime (with mock timeline for now)
  // TODO: Wire to actual GSAP timeline once available
  const mockTimeline = {
    labels: Object.fromEntries(
      homepageTimeline.scenes.map((scene, i) => [`scene-${i}`, i])
    ),
    play: (label) => {
      console.debug('[Mock Timeline] Play:', label);
      // Simulate playback complete after delay
      setTimeout(() => {
        runtime.handlePlaybackComplete();
      }, 2000);
    },
    pause: () => {},
    eventCallback: () => {}
  };

  const runtime = createHomepageSnapRuntime({
    timeline: mockTimeline,
    scrollController,
    onStateChange: handleStateChange,
    onError: handleError
  });

  // Create timeline adapter
  const timelineAdapter = createTimelineAdapter(sceneTimelineController, runtime);

  // Wire scroll events
  let lastScrollY = window.scrollY || 0;
  let scrollRAF = null;

  function handleScrollUpdate() {
    if (isDestroyed) return;

    const currentScrollY = window.scrollY || 0;
    const deltaY = currentScrollY - lastScrollY;
    lastScrollY = currentScrollY;

    // Update runtime
    runtime.handleScroll();

    // Update charge accumulator if armed
    const state = runtime.getCurrentState();
    if (state.current === 'SnappedArmed') {
      const charged = chargeAccumulator.addDelta(deltaY);

      // Throttle charge indicator updates
      const now = Date.now();
      if (now - chargeThrottle > CONFIG.CHARGE_UPDATE_THROTTLE_MS) {
        updateChargeIndicator(chargeAccumulator.getProgress(), rootElement);
        chargeThrottle = now;
      }

      // Trigger playback if charged
      if (charged) {
        if (reduceMotion && CONFIG.PREFERS_REDUCED_MOTION_SKIP_CHARGE) {
          handleReducedMotionTransition(state.currentSceneIndex, rootElement);
        } else {
          // Forward charge triggers Playing
          console.debug('[Runtime Integration] Charge complete, triggering playback');
          // The runtime's internal scroll handler will trigger playback
        }
      }
    }

    scrollRAF = null;
  }

  function onScroll() {
    if (!scrollRAF) {
      scrollRAF = requestAnimationFrame(handleScrollUpdate);
    }
  }

  // Wire wheel events for charge detection
  function onWheel(event) {
    runtime.handleWheel(event);
  }

  // Wire keyboard events
  function onKeyboard(event) {
    runtime.handleKeyboard(event);
  }

  // ============================================================================
  // Viewport Change Handlers (ADR fallback matrix)
  // ============================================================================

  let lastViewportHeight = window.innerHeight;
  let lastVisualViewportHeight = window.visualViewport?.height || window.innerHeight;
  let resizeDebounceTimer = null;

  /**
   * Handle window resize: recalculate bounds, adjust if Playing
   */
  function onResize() {
    if (isDestroyed) return;

    // Debounce resize events
    if (resizeDebounceTimer) {
      clearTimeout(resizeDebounceTimer);
    }

    resizeDebounceTimer = setTimeout(() => {
      const currentHeight = window.innerHeight;
      const heightDelta = Math.abs(currentHeight - lastViewportHeight);

      console.debug('[Runtime Integration] Resize detected, height delta:', heightDelta);

      // Recalculate scene bounds
      runtime.recalculateSceneBounds();
      lastViewportHeight = currentHeight;

      // If Playing, maintain current scene but adjust for new bounds
      const state = runtime.getCurrentState();
      if (state.current === 'Playing') {
        console.debug('[Runtime Integration] Continuing playback after resize');
        // Let playback continue with new bounds
      }

      resizeDebounceTimer = null;
    }, 150);
  }

  /**
   * Handle orientation change: recalculate bounds
   */
  function onOrientationChange() {
    if (isDestroyed) return;

    console.debug('[Runtime Integration] Orientation change detected');

    // Wait for orientation change to complete
    setTimeout(() => {
      runtime.recalculateSceneBounds();
      lastViewportHeight = window.innerHeight;

      // Snap to current scene's new position
      const state = runtime.getCurrentState();
      if (state.current === 'SnappedArmed') {
        const scene = homepageTimeline.scenes[state.currentSceneIndex];
        if (scene) {
          runtime.snapToScene(scene.id);
        }
      }
    }, 100);
  }

  /**
   * Handle visual viewport resize: detect mobile address bar
   */
  function onVisualViewportResize() {
    if (isDestroyed) return;
    if (!window.visualViewport) return;

    const currentHeight = window.visualViewport.height;
    const delta = Math.abs(currentHeight - lastVisualViewportHeight);

    // Only recalc if change is significant (mobile address bar show/hide)
    if (delta > CONFIG.VIEWPORT_CHANGE_THRESHOLD_PX) {
      console.debug('[Runtime Integration] Visual viewport change:', delta, 'px');

      runtime.recalculateSceneBounds();
      lastVisualViewportHeight = currentHeight;
    }
  }

  /**
   * Handle hash navigation to deep link target scene
   */
  function onHashChange() {
    if (isDestroyed) return;

    const hash = window.location.hash;
    if (!hash || hash.length <= 1) return;

    try {
      const targetId = decodeURIComponent(hash.slice(1));
      const scene = homepageTimeline.scenes.find(s => s.id === targetId);

      if (scene) {
        console.debug('[Runtime Integration] Hash navigation to scene:', targetId);

        // Snap to target scene's presented state (skip charge/playback per ADR)
        const sceneElement = document.querySelector(`[data-scene-id="${scene.id}"]`);
        if (sceneElement) {
          sceneElement.setAttribute('data-scene-state', 'presented');
        }

        // Use snapToScene for precise positioning
        runtime.snapToScene(targetId);
      }
    } catch (error) {
      console.warn('[Runtime Integration] Hash navigation failed:', error);
    }
  }

  // Attach event listeners
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('keydown', onKeyboard);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onOrientationChange);
  window.addEventListener('hashchange', onHashChange);

  // Visual viewport listener for mobile address bar
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onVisualViewportResize, { passive: true });
  }

  // Initialize scene bounds
  runtime.recalculateSceneBounds();

  // Initialize state
  syncStateToDom(runtime.getCurrentState(), rootElement);

  // Public API
  return Object.freeze({
    /**
     * Get current runtime state
     */
    getState() {
      return runtime.getCurrentState();
    },

    /**
     * Get current scene index
     */
    getCurrentScene() {
      return runtime.getCurrentScene();
    },

    /**
     * Get charge progress (0-1)
     */
    getChargeProgress() {
      return chargeAccumulator.getProgress();
    },

    /**
     * Snap to specific scene by ID
     */
    snapToScene(sceneId) {
      runtime.snapToScene(sceneId);
    },

    /**
     * Recalculate scene bounds (called on viewport changes)
     */
    recalculateSceneBounds() {
      return runtime.recalculateSceneBounds();
    },

    /**
     * Manually trigger playback (for testing)
     */
    triggerPlayback() {
      runtime.handleWheel({ deltaY: 200 });
    },

    /**
     * Manually complete playback (for testing)
     */
    handlePlaybackComplete() {
      // This is exposed from the runtime's mock timeline callback
      // In production, GSAP timeline will call this automatically
    },

    /**
     * Reset runtime to initial state
     */
    reset() {
      runtime.reset();
      chargeAccumulator.reset();
      updateChargeIndicator(0, rootElement);
      syncStateToDom(runtime.getCurrentState(), rootElement);
    },

    /**
     * Destroy runtime and cleanup
     */
    destroy() {
      if (isDestroyed) return;
      isDestroyed = true;

      // Remove event listeners
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyboard);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientationChange);
      window.removeEventListener('hashchange', onHashChange);

      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', onVisualViewportResize);
      }

      // Clear timers
      if (scrollRAF) {
        cancelAnimationFrame(scrollRAF);
      }
      if (resizeDebounceTimer) {
        clearTimeout(resizeDebounceTimer);
      }

      runtime.destroy();

      // Clear DOM state
      const attrs = CONFIG.DOM_ATTRIBUTES;
      Object.values(attrs).forEach(attr => {
        rootElement.removeAttribute(attr);
      });
      rootElement.style.removeProperty('--homepage-charge-progress');
    },

    // Expose for debugging
    runtime,
    chargeAccumulator,
    timelineAdapter,
    CONFIG
  });
}

/**
 * Initialize homepage runtime (convenience wrapper)
 */
export function initHomepageRuntime(options = {}) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return createHomepageRuntimeIntegration({
    scrollController: null, // Will be set by caller if Lenis is available
    rootElement: document.documentElement,
    reduceMotion,
    ...options
  });
}
