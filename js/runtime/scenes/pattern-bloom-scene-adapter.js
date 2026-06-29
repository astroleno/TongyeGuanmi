/**
 * Pattern-Bloom Scene Adapter (time-driven)
 *
 * Bridges the snap runtime's scenePresenter seam to the EXISTING pattern-bloom
 * visual (js/transitions/pattern-bloom-adapter.js) without rewriting any of its
 * rendering. That visual was written to pull an external `progressSource()`
 * every frame (originally scroll). Here we feed it a TIME-DRIVEN progress ramp
 * instead, so `play()` runs the transition on its own clock per the plan
 * (playForward/playReverse, not scroll-scrub).
 *
 * Split of concerns (so logic is testable without a browser):
 *  - createTimedProgressDriver: pure timing, unit-tested under node.
 *  - this adapter: wiring + lifecycle (the progressSource closure).
 *  - mountPatternBloomTransition: WebGL rendering — UNCHANGED, and the one part
 *    that genuinely needs in-browser confirmation (no WebGL in CI/node).
 *
 * play({direction}) resolves when the ramp completes (scene presented) so the
 * runtime can advance to Completing; a cancel mid-flight resolves the runtime's
 * normal not-completed path.
 */

import { createTimedProgressDriver } from '../timed-progress-driver.js';
import { mountPatternBloomTransition } from '../../transitions/pattern-bloom-adapter.js';

const DEFAULT_DURATION_MS = 1600;

/**
 * @param {Object} options
 * @param {HTMLElement} options.host - the pattern-bloom transition host node
 * @param {boolean} [options.reduceMotion]
 * @param {number} [options.durationMs]
 * @param {(opts:object)=>{destroy:Function}} [options.mount] - injectable for tests
 * @param {(opts:object)=>object} [options.createDriver] - injectable for tests
 * @returns {{ play: (o?:{direction?:1|-1})=>Promise<void>, getProgress: ()=>number, destroy: ()=>void }}
 */
export function createPatternBloomSceneAdapter({
  host,
  reduceMotion = false,
  durationMs = DEFAULT_DURATION_MS,
  mount = mountPatternBloomTransition,
  createDriver = createTimedProgressDriver
} = {}) {
  if (!host) throw new Error('pattern-bloom scene adapter requires a host element');

  let progress = 0;

  // Driver owns the clock; its onProgress updates the value the visual reads.
  const driver = createDriver({
    durationMs,
    onProgress: (p) => { progress = p; }
  });

  // The existing visual pulls this every frame. Returning the driver-managed
  // value converts the visual from scroll-driven to time-driven with zero
  // changes to its rendering code.
  const progressSource = () => progress;

  // Mount the real visual. Under reduced motion the visual already short-circuits
  // its animation; we still mount so the terminal state is presented.
  const mounted = mount({
    host,
    reduceMotion,
    progressSource,
    addCleanup: () => {}
  });

  return {
    /**
     * Play the transition on its own clock. direction: 1 forward, -1 reverse.
     * Resolves when presented (or when superseded/cancelled — runtime treats
     * both as "done driving").
     */
    async play({ direction = 1 } = {}) {
      if (reduceMotion) {
        // Skip the ramp: jump to terminal state (plan reduced-motion contract).
        progress = direction === -1 ? 0 : 1;
        return;
      }
      await driver.play({ direction });
    },
    getProgress: () => progress,
    destroy() {
      driver.cancel();
      mounted?.destroy?.();
    }
  };
}
