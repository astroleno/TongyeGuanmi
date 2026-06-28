/**
 * Input Normalizer
 *
 * Converts diverse input sources (wheel, touch, keyboard) into unified progress deltas.
 * Implements plan lines 280-287: 输入归一化
 *
 * All normalized deltas are expressed as viewport-relative progress values:
 * - 1.0 = full viewport height scroll
 * - 0.1 = 10vh scroll
 *
 * Frame clamping prevents single inputs from overfilling the charge tank.
 */

const WHEEL_LINE_HEIGHT = 16; // Standard line height in pixels for deltaMode=1
const MAX_DELTA_PER_FRAME = 0.25; // Maximum 25% viewport per frame to prevent overshoot

/**
 * Create input normalizer with viewport-aware conversions
 *
 * @param {Object} options
 * @param {number} options.viewportHeight - Current viewport height in pixels
 * @returns {Object} Normalizer API
 *
 * @example
 * const normalizer = createInputNormalizer({ viewportHeight: 800 });
 * const delta = normalizer.normalizeWheel(wheelEvent);
 * // delta is now in 0-1 progress units relative to viewport
 */
export function createInputNormalizer({ viewportHeight }) {
  let currentViewportHeight = viewportHeight;

  /**
   * Normalize wheel event delta to unified progress
   *
   * Handles three deltaMode types:
   * - 0 (DOM_DELTA_PIXEL): Raw pixels
   * - 1 (DOM_DELTA_LINE): Text lines (convert via line height)
   * - 2 (DOM_DELTA_PAGE): Already 0-1 normalized
   *
   * @param {WheelEvent} event - Wheel event
   * @returns {number} Normalized delta in viewport-relative units
   *
   * @example
   * // Pixel mode (most common on macOS trackpad)
   * wheelEvent.deltaY = 100; wheelEvent.deltaMode = 0;
   * normalizeWheel(wheelEvent); // → 100/800 = 0.125 (12.5vh)
   *
   * @example
   * // Line mode (common on Windows mouse wheel)
   * wheelEvent.deltaY = 3; wheelEvent.deltaMode = 1;
   * normalizeWheel(wheelEvent); // → (3*16)/800 = 0.06 (6vh)
   *
   * @example
   * // Page mode (rare, but spec-compliant)
   * wheelEvent.deltaY = 0.5; wheelEvent.deltaMode = 2;
   * normalizeWheel(wheelEvent); // → 0.5 (50vh)
   */
  function normalizeWheel(event) {
    const { deltaY, deltaMode } = event;

    let normalizedDelta;

    switch (deltaMode) {
      case 0: // DOM_DELTA_PIXEL
        normalizedDelta = deltaY / currentViewportHeight;
        break;

      case 1: // DOM_DELTA_LINE
        normalizedDelta = (deltaY * WHEEL_LINE_HEIGHT) / currentViewportHeight;
        break;

      case 2: // DOM_DELTA_PAGE
        normalizedDelta = deltaY; // Already 0-1 normalized
        break;

      default:
        // Fallback to pixel mode for unknown deltaMode
        normalizedDelta = deltaY / currentViewportHeight;
    }

    return clampDelta(normalizedDelta);
  }

  /**
   * Normalize touch move delta to unified progress
   *
   * Converts cumulative pixel delta from touchmove events into
   * viewport-relative progress.
   *
   * @param {Object} options
   * @param {number} options.pixelDelta - Cumulative touch movement in pixels
   * @returns {number} Normalized delta in viewport-relative units
   *
   * @example
   * // User swipes 200px downward on 800px viewport
   * normalizeTouchMove({ pixelDelta: 200 }); // → 200/800 = 0.25 (25vh)
   *
   * @example
   * // User swipes 50px upward (negative delta)
   * normalizeTouchMove({ pixelDelta: -50 }); // → -50/800 = -0.0625 (-6.25vh)
   */
  function normalizeTouchMove({ pixelDelta }) {
    const normalizedDelta = pixelDelta / currentViewportHeight;
    return clampDelta(normalizedDelta);
  }

  /**
   * Normalize keyboard event to unified progress
   *
   * Maps keyboard navigation keys to discrete progress steps:
   * - PageDown/Space: Large step forward (+50vh)
   * - ArrowDown: Small step forward (+10vh)
   * - ArrowUp: Small step backward (-10vh)
   * - PageUp: Large step backward (-50vh)
   *
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {number} Normalized delta in viewport-relative units, or 0 if key not handled
   *
   * @example
   * // PageDown advances half viewport
   * keyboardEvent.key = 'PageDown';
   * normalizeKeyboard(keyboardEvent); // → 0.5
   *
   * @example
   * // Arrow down advances 10% viewport
   * keyboardEvent.key = 'ArrowDown';
   * normalizeKeyboard(keyboardEvent); // → 0.1
   *
   * @example
   * // Space advances half viewport (same as PageDown)
   * keyboardEvent.key = ' ';
   * normalizeKeyboard(keyboardEvent); // → 0.5
   */
  function normalizeKeyboard(event) {
    const { key } = event;

    let normalizedDelta = 0;

    switch (key) {
      case 'PageDown':
      case ' ': // Space bar
        normalizedDelta = 0.5; // +50vh
        break;

      case 'PageUp':
        normalizedDelta = -0.5; // -50vh
        break;

      case 'ArrowDown':
        normalizedDelta = 0.1; // +10vh
        break;

      case 'ArrowUp':
        normalizedDelta = -0.1; // -10vh
        break;

      default:
        // Unhandled key, no delta
        normalizedDelta = 0;
    }

    // Keyboard deltas are already calibrated, but still apply clamp for consistency
    return clampDelta(normalizedDelta);
  }

  /**
   * Clamp delta to prevent single-frame overshoot
   *
   * Limits any normalized delta to ±MAX_DELTA_PER_FRAME (25vh).
   * Prevents inertia scrolling or aggressive wheel spins from
   * instantly filling the 10vh charge tank in one frame.
   *
   * @param {number} delta - Normalized delta
   * @returns {number} Clamped delta in range [-0.25, 0.25]
   *
   * @example
   * // Inertia swipe tries to advance 80vh in one frame
   * clampDelta(0.8); // → 0.25 (clamped to max)
   *
   * @example
   * // Normal 12vh scroll passes through
   * clampDelta(0.12); // → 0.12 (within limit)
   *
   * @example
   * // Aggressive upward scroll
   * clampDelta(-0.4); // → -0.25 (clamped to min)
   */
  function clampDelta(delta) {
    return Math.max(-MAX_DELTA_PER_FRAME, Math.min(MAX_DELTA_PER_FRAME, delta));
  }

  /**
   * Update viewport height for recalculation
   *
   * Should be called on window resize to maintain accurate
   * pixel-to-viewport conversions.
   *
   * @param {number} newViewportHeight - New viewport height in pixels
   *
   * @example
   * window.addEventListener('resize', () => {
   *   normalizer.updateViewportHeight(window.innerHeight);
   * });
   */
  function updateViewportHeight(newViewportHeight) {
    currentViewportHeight = newViewportHeight;
  }

  return {
    normalizeWheel,
    normalizeTouchMove,
    normalizeKeyboard,
    clampDelta,
    updateViewportHeight
  };
}

/**
 * Unit Test Examples (for reference when implementing tests)
 *
 * Test wheel normalization:
 * ```javascript
 * const normalizer = createInputNormalizer({ viewportHeight: 800 });
 *
 * // Pixel mode
 * assert.equal(normalizer.normalizeWheel({ deltaY: 80, deltaMode: 0 }), 0.1);
 *
 * // Line mode
 * assert.equal(normalizer.normalizeWheel({ deltaY: 5, deltaMode: 1 }), 0.1);
 *
 * // Page mode
 * assert.equal(normalizer.normalizeWheel({ deltaY: 0.5, deltaMode: 2 }), 0.25);
 * ```
 *
 * Test touch normalization:
 * ```javascript
 * assert.equal(normalizer.normalizeTouchMove({ pixelDelta: 200 }), 0.25);
 * assert.equal(normalizer.normalizeTouchMove({ pixelDelta: -80 }), -0.1);
 * ```
 *
 * Test keyboard normalization:
 * ```javascript
 * assert.equal(normalizer.normalizeKeyboard({ key: 'PageDown' }), 0.25);
 * assert.equal(normalizer.normalizeKeyboard({ key: 'ArrowDown' }), 0.1);
 * assert.equal(normalizer.normalizeKeyboard({ key: 'ArrowUp' }), -0.1);
 * assert.equal(normalizer.normalizeKeyboard({ key: 'a' }), 0);
 * ```
 *
 * Test clamping:
 * ```javascript
 * assert.equal(normalizer.clampDelta(0.8), 0.25);
 * assert.equal(normalizer.clampDelta(-0.5), -0.25);
 * assert.equal(normalizer.clampDelta(0.12), 0.12);
 * ```
 *
 * Test viewport update:
 * ```javascript
 * normalizer.updateViewportHeight(1000);
 * assert.equal(normalizer.normalizeWheel({ deltaY: 100, deltaMode: 0 }), 0.1);
 * ```
 */
