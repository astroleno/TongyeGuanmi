/**
 * Charge Accumulator for 10vh threshold tracking
 *
 * Implements plan lines 280-288: charge 可视反馈固定 contract
 *
 * Units: this accumulator works in *normalized viewport fractions*, matching
 * the output of input-normalizer.js (where 1.0 === one full viewport height,
 * so 10vh === 0.1). The threshold is therefore `thresholdVh / 100` fractions.
 * It deliberately does NOT read window.innerHeight, so it is testable under
 * node and immune to resize staleness — viewport conversion is the
 * normalizer's job, not the accumulator's.
 *
 * Threshold logic:
 * - thresholdVh = 10  ->  thresholdFraction = 0.1
 * - Delta accumulates as |normalized fraction|
 * - Progress = accumulated / thresholdFraction, clamped 0-1
 * - Triggered when progress >= 1.0
 *
 * Decay:
 * - If user stops scrolling, charge gradually falls back
 * - Prevents "stuck half-charged" state
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
 * @param {number} options.decayRatePerMs - Fraction of full charge to bleed per ms (default: 0.001 -> ~1s to drain)
 * @returns {Object} Accumulator instance
 */
export function createChargeAccumulator({
  thresholdVh = 10,
  decayRatePerMs = 0.001
} = {}) {
  let accumulated = 0;
  let direction = 0;

  // Threshold expressed in the same normalized-fraction unit the normalizer emits.
  const thresholdFraction = thresholdVh / 100;

  return {
    /**
     * Add a normalized scroll delta (viewport fraction) and update charge.
     *
     * @param {number} normalizedDelta - Delta in viewport fractions (0.1 === 10vh)
     * @returns {number} Current progress (0-1)
     */
    accumulate(normalizedDelta) {
      // Update direction based on delta sign
      if (normalizedDelta > 0) {
        direction = 1;
      } else if (normalizedDelta < 0) {
        direction = -1;
      }

      // Accumulate magnitude, clamp at threshold (progress max = 1.0)
      accumulated += Math.abs(normalizedDelta);
      accumulated = Math.min(accumulated, thresholdFraction);

      return accumulated / thresholdFraction;
    },

    /**
     * Get current charge progress
     *
     * @returns {number} Progress value (0-1)
     */
    getProgress() {
      return Math.max(0, Math.min(1, accumulated / thresholdFraction));
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
      return accumulated >= thresholdFraction;
    },

    /**
     * Apply gradual decay when user stops scrolling
     *
     * @param {number} deltaTimeMs - Time elapsed in milliseconds
     * @returns {number} Current progress after decay
     */
    decay(deltaTimeMs) {
      if (accumulated > 0) {
        const decayAmount = decayRatePerMs * deltaTimeMs * thresholdFraction;
        accumulated = Math.max(0, accumulated - decayAmount);

        // Reset direction when fully decayed
        if (accumulated === 0) {
          direction = 0;
        }
      }

      return accumulated / thresholdFraction;
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
