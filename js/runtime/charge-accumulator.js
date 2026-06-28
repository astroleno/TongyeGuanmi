/**
 * Charge Accumulator for 10vh threshold tracking
 *
 * Implements plan lines 280-288: charge 可视反馈固定 contract
 *
 * Threshold logic:
 * - 10vh = 0.1 viewport height
 * - Delta accumulates as fraction of threshold
 * - Progress = accumulated / threshold, clamped 0-1
 * - Triggered when progress >= 1.0
 *
 * Decay:
 * - If user stops scrolling, charge gradually falls back
 * - Prevents "stuck half-charged" state
 * - Decay rate: ~0.1% per ms (reaches 0 in ~1s)
 *
 * Direction tracking:
 * - Positive deltas: forward (1)
 * - Negative deltas: reverse (-1)
 * - Used for playForward vs playReverse
 */

/**
 * Create a charge accumulator for threshold-based scroll tracking
 *
 * @param {Object} options
 * @param {number} options.thresholdVh - Threshold in viewport height units (default: 10)
 * @param {number} options.decayRatePerMs - Decay rate per millisecond (default: 0.001)
 * @returns {Object} Accumulator instance
 */
export function createChargeAccumulator({
  thresholdVh = 10,
  decayRatePerMs = 0.001
} = {}) {
  let accumulated = 0;
  let direction = 0;

  // Convert vh to pixels once at creation
  const thresholdPx = (thresholdVh / 100) * window.innerHeight;

  return {
    /**
     * Add scroll delta and update charge progress
     *
     * @param {number} normalizedDelta - Scroll delta in pixels
     * @returns {number} Current progress (0-1)
     */
    accumulate(normalizedDelta) {
      // Update direction based on delta sign
      if (normalizedDelta > 0) {
        direction = 1;
      } else if (normalizedDelta < 0) {
        direction = -1;
      }

      // Accumulate delta as fraction of threshold
      accumulated += Math.abs(normalizedDelta);

      // Clamp to threshold (progress max = 1.0)
      accumulated = Math.min(accumulated, thresholdPx);

      return accumulated / thresholdPx;
    },

    /**
     * Get current charge progress
     *
     * @returns {number} Progress value (0-1)
     */
    getProgress() {
      return Math.max(0, Math.min(1, accumulated / thresholdPx));
    },

    /**
     * Get current scroll direction
     *
     * @returns {number} 1 (forward), -1 (reverse), or 0 (none)
     */
    getDirection() {
      return direction;
    },

    /**
     * Check if threshold is reached
     *
     * @returns {boolean} True when progress >= 1.0
     */
    isTriggered() {
      return accumulated >= thresholdPx;
    },

    /**
     * Apply gradual decay when user stops scrolling
     *
     * @param {number} deltaTimeMs - Time elapsed in milliseconds
     * @returns {number} Current progress after decay
     */
    decay(deltaTimeMs) {
      if (accumulated > 0) {
        const decayAmount = decayRatePerMs * deltaTimeMs * thresholdPx;
        accumulated = Math.max(0, accumulated - decayAmount);

        // Reset direction when fully decayed
        if (accumulated === 0) {
          direction = 0;
        }
      }

      return accumulated / thresholdPx;
    },

    /**
     * Reset accumulator to initial state
     */
    reset() {
      accumulated = 0;
      direction = 0;
    }
  };
}
