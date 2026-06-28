/**
 * @fileoverview Recovery Handler - Timeout and failure handling for timeline playback
 *
 * Implements plan lines 257-275 (失败恢复与解锁)
 *
 * All error scenarios follow the same recovery path:
 * Playing/Completing (timeout or error)
 * → RecoverPresentTarget
 * → Show target scene terminal state
 * → Hide half-rendered overlay/transition
 * → Log error with observable event
 * → ReleaseCooldown (420ms)
 * → FreeScroll
 *
 * Never blocks user scroll. Always fails gracefully.
 */

// ============================================================================
// Configuration Constants
// ============================================================================

const TIMEOUT_CONFIG = {
  MEDIA_READY: 1800,        // wait for loadedmetadata/canplay
  MEDIA_PLAY: 1600,         // wait for play() resolve or first frame
  MEDIA_END_GRACE: 1200,    // grace period after expected duration
  TEXTURE_READY: 1200,      // wait for canvas/DOM projection ready
  RECOVERY_COOLDOWN: 420    // cooldown before returning to FreeScroll
};

// ============================================================================
// Recovery Handler Factory
// ============================================================================

/**
 * Create recovery handler instance
 * @param {Object} options
 * @param {Object} options.timeline - GSAP timeline instance
 * @param {Function} options.onRecover - Recovery callback (scene, reason, details)
 * @returns {Object} Recovery handler API
 */
export function createRecoveryHandler({ timeline, onRecover }) {
  if (!timeline) {
    throw new Error('RecoveryHandler: timeline is required');
  }
  if (typeof onRecover !== 'function') {
    throw new Error('RecoveryHandler: onRecover must be a function');
  }

  // Active timeout handles
  const activeTimeouts = new Map();

  /**
   * Clear specific timeout by key
   * @param {string} key
   */
  function clearTimeout(key) {
    const handle = activeTimeouts.get(key);
    if (handle) {
      window.clearTimeout(handle);
      activeTimeouts.delete(key);
    }
  }

  /**
   * Clear all active timeouts
   */
  function clearAllTimeouts() {
    activeTimeouts.forEach((handle) => window.clearTimeout(handle));
    activeTimeouts.clear();
  }

  /**
   * Watch for video ready state (loadedmetadata + canplay)
   * @param {HTMLVideoElement} video
   * @param {number} timeoutMs
   * @param {Object} scene - Scene identifier
   * @returns {Promise<void>}
   */
  function watchMediaReady(video, timeoutMs = TIMEOUT_CONFIG.MEDIA_READY, scene) {
    return new Promise((resolve, reject) => {
      if (!video || !(video instanceof HTMLVideoElement)) {
        reject(new Error('Invalid video element'));
        return;
      }

      // Already ready
      if (video.readyState >= 2) { // HAVE_CURRENT_DATA or higher
        resolve();
        return;
      }

      const timeoutKey = `media-ready-${scene?.id || 'unknown'}`;
      let resolved = false;

      const handleReady = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutKey);
        video.removeEventListener('loadedmetadata', handleReady);
        video.removeEventListener('canplay', handleReady);
        video.removeEventListener('error', handleError);
        resolve();
      };

      const handleError = (e) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutKey);
        video.removeEventListener('loadedmetadata', handleReady);
        video.removeEventListener('canplay', handleReady);
        video.removeEventListener('error', handleError);
        reject(new Error(`Video load error: ${e.message || 'unknown'}`));
      };

      video.addEventListener('loadedmetadata', handleReady, { once: true });
      video.addEventListener('canplay', handleReady, { once: true });
      video.addEventListener('error', handleError, { once: true });

      // Set timeout
      const handle = window.setTimeout(() => {
        if (resolved) return;
        resolved = true;
        video.removeEventListener('loadedmetadata', handleReady);
        video.removeEventListener('canplay', handleReady);
        video.removeEventListener('error', handleError);
        activeTimeouts.delete(timeoutKey);
        reject(new Error(`Video ready timeout after ${timeoutMs}ms (readyState: ${video.readyState})`));
      }, timeoutMs);

      activeTimeouts.set(timeoutKey, handle);
    });
  }

  /**
   * Watch for video play start (play() resolve + first frame)
   * @param {HTMLVideoElement} video
   * @param {number} timeoutMs
   * @param {Object} scene - Scene identifier
   * @returns {Promise<void>}
   */
  function watchMediaPlay(video, timeoutMs = TIMEOUT_CONFIG.MEDIA_PLAY, scene) {
    return new Promise((resolve, reject) => {
      if (!video || !(video instanceof HTMLVideoElement)) {
        reject(new Error('Invalid video element'));
        return;
      }

      const timeoutKey = `media-play-${scene?.id || 'unknown'}`;
      let resolved = false;

      const handlePlaying = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutKey);
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('error', handleError);
        resolve();
      };

      const handleError = (e) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutKey);
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('error', handleError);
        reject(new Error(`Video play error: ${e.message || 'unknown'}`));
      };

      video.addEventListener('playing', handlePlaying, { once: true });
      video.addEventListener('error', handleError, { once: true });

      // Attempt play
      const playPromise = video.play();
      if (playPromise) {
        playPromise.catch((err) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeoutKey);
          video.removeEventListener('playing', handlePlaying);
          video.removeEventListener('error', handleError);
          reject(new Error(`Video play() rejected: ${err.message}`));
        });
      }

      // Set timeout
      const handle = window.setTimeout(() => {
        if (resolved) return;
        resolved = true;
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('error', handleError);
        activeTimeouts.delete(timeoutKey);
        reject(new Error(`Video play timeout after ${timeoutMs}ms (paused: ${video.paused}, readyState: ${video.readyState})`));
      }, timeoutMs);

      activeTimeouts.set(timeoutKey, handle);
    });
  }

  /**
   * Watch for video end (ended event within expected duration + grace)
   * @param {HTMLVideoElement} video
   * @param {number} expectedDuration - Expected duration in ms
   * @param {number} graceMs - Grace period after expected duration
   * @param {Object} scene - Scene identifier
   * @returns {Promise<void>}
   */
  function watchMediaEnd(video, expectedDuration, graceMs = TIMEOUT_CONFIG.MEDIA_END_GRACE, scene) {
    return new Promise((resolve, reject) => {
      if (!video || !(video instanceof HTMLVideoElement)) {
        reject(new Error('Invalid video element'));
        return;
      }

      const timeoutKey = `media-end-${scene?.id || 'unknown'}`;
      const timeoutMs = expectedDuration + graceMs;
      let resolved = false;

      const handleEnded = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutKey);
        video.removeEventListener('ended', handleEnded);
        video.removeEventListener('error', handleError);
        resolve();
      };

      const handleError = (e) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutKey);
        video.removeEventListener('ended', handleEnded);
        video.removeEventListener('error', handleError);
        reject(new Error(`Video playback error: ${e.message || 'unknown'}`));
      };

      video.addEventListener('ended', handleEnded, { once: true });
      video.addEventListener('error', handleError, { once: true });

      // Set timeout
      const handle = window.setTimeout(() => {
        if (resolved) return;
        resolved = true;
        video.removeEventListener('ended', handleEnded);
        video.removeEventListener('error', handleError);
        activeTimeouts.delete(timeoutKey);
        reject(new Error(`Video end timeout after ${timeoutMs}ms (currentTime: ${video.currentTime}, duration: ${video.duration}, ended: ${video.ended})`));
      }, timeoutMs);

      activeTimeouts.set(timeoutKey, handle);
    });
  }

  /**
   * Watch for texture ready (canvas/DOM projection ready with non-empty pixels)
   * @param {HTMLElement} element - Canvas or DOM element
   * @param {number} timeoutMs
   * @param {Object} scene - Scene identifier
   * @returns {Promise<void>}
   */
  function watchTextureReady(element, timeoutMs = TIMEOUT_CONFIG.TEXTURE_READY, scene) {
    return new Promise((resolve, reject) => {
      if (!element) {
        reject(new Error('Invalid texture element'));
        return;
      }

      const timeoutKey = `texture-ready-${scene?.id || 'unknown'}`;
      let resolved = false;

      /**
       * Check if element has visible content
       * @returns {boolean}
       */
      function checkTextureContent() {
        if (element instanceof HTMLCanvasElement) {
          const ctx = element.getContext('2d');
          if (!ctx) return false;

          // Sample center pixel
          const w = element.width;
          const h = element.height;
          if (w === 0 || h === 0) return false;

          try {
            const imageData = ctx.getImageData(w / 2, h / 2, 1, 1);
            const data = imageData.data;
            // Check if alpha channel is non-zero
            return data[3] > 0;
          } catch (e) {
            // Canvas may be tainted or not ready
            return false;
          }
        } else {
          // For DOM elements, check computed style and dimensions
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.opacity !== '0' &&
                 style.visibility !== 'hidden' &&
                 style.display !== 'none' &&
                 rect.width > 0 &&
                 rect.height > 0;
        }
      }

      // Poll for content
      const pollInterval = 100;
      let pollCount = 0;
      const maxPolls = Math.ceil(timeoutMs / pollInterval);

      const poll = () => {
        if (resolved) return;

        if (checkTextureContent()) {
          resolved = true;
          clearTimeout(timeoutKey);
          resolve();
          return;
        }

        pollCount++;
        if (pollCount >= maxPolls) {
          resolved = true;
          clearTimeout(timeoutKey);
          reject(new Error(`Texture ready timeout after ${timeoutMs}ms (no visible content detected)`));
          return;
        }

        window.setTimeout(poll, pollInterval);
      };

      // Start polling
      poll();

      // Set overall timeout
      const handle = window.setTimeout(() => {
        if (resolved) return;
        resolved = true;
        activeTimeouts.delete(timeoutKey);
        reject(new Error(`Texture ready timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      activeTimeouts.set(timeoutKey, handle);
    });
  }

  /**
   * Handle recovery from failed state
   * Executes recovery path:
   * 1. Show target scene terminal state
   * 2. Hide half-rendered overlay/transition
   * 3. Log error with observable event
   * 4. Trigger cooldown before returning to FreeScroll
   *
   * @param {Object} scene - Scene that failed
   * @param {string} reason - Error reason
   * @param {Object} details - Additional error details
   * @returns {Promise<void>}
   */
  async function handleRecovery(scene, reason, details = {}) {
    // Clear all active timeouts
    clearAllTimeouts();

    // Pause timeline if playing
    if (timeline && timeline.isActive()) {
      timeline.pause();
    }

    // Build error context
    const errorContext = {
      scene: scene?.id || 'unknown',
      reason,
      timestamp: Date.now(),
      timelineTime: timeline?.time() || 0,
      timelineDuration: timeline?.duration() || 0,
      ...details
    };

    // Log error (observable event)
    console.error('[RecoveryHandler] Recovery triggered:', errorContext);

    // Dispatch custom event for monitoring/debugging
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('timeline:recovery', {
        detail: errorContext
      }));
    }

    // Call recovery callback
    // onRecover should:
    // - Jump to target scene terminal state
    // - Hide overlays/transitions
    // - Transition to RecoverPresentTarget state
    // - After cooldown, transition to FreeScroll
    try {
      await onRecover(scene, reason, errorContext);
    } catch (err) {
      console.error('[RecoveryHandler] onRecover callback failed:', err);
    }
  }

  // Return public API
  return Object.freeze({
    watchMediaReady,
    watchMediaPlay,
    watchMediaEnd,
    watchTextureReady,
    handleRecovery,
    clearAllTimeouts,
    config: TIMEOUT_CONFIG
  });
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Common error scenarios:
 * - video.play() reject → DOMException: play() failed
 * - 404 video source → error event with MEDIA_ERR_SRC_NOT_SUPPORTED
 * - metadata missing → timeout on loadedmetadata
 * - ended event never fires → timeout on ended
 * - texture non-empty check fails → timeout on texture ready
 * - Canvas projection empty pixels → checkTextureContent returns false
 *
 * All → handleRecovery(scene, reason, details)
 */
