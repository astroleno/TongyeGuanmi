/**
 * Timed Progress Driver
 *
 * Drives a progress value from 0→1 (forward) or 1→0 (reverse) over a fixed
 * duration using requestAnimationFrame. This is the TIME-DRIVEN replacement for
 * the homepage's old scroll-driven progress: visual adapters that were written
 * to read an external `progressSource()` every frame can be fed by this driver
 * instead, so playback runs on its own clock (plan: "转场用时间驱动",
 * playForward/playReverse) rather than tracking scroll position.
 *
 * Pure timing logic with INJECTABLE clock + scheduler, so it is fully
 * unit-testable under node with a fake clock (no real rAF, no DOM, no WebGL).
 * The visual rendering it ultimately feeds is a separate concern.
 */

/**
 * @param {Object} options
 * @param {number} [options.durationMs=1400] - ramp duration
 * @param {(t:number)=>number} [options.easing] - easing on 0..1 (default easeInOutQuad)
 * @param {(p:number)=>void} [options.onProgress] - called each tick with current progress
 * @param {() => number} [options.now] - clock (default performance.now/Date.now)
 * @param {(cb:(t:number)=>void)=>number} [options.requestFrame] - scheduler (default rAF)
 * @param {(id:number)=>void} [options.cancelFrame] - canceller (default cAF)
 * @returns {{ play: (opts?:{direction?:1|-1})=>Promise<{completed:boolean}>, cancel: ()=>void, getProgress: ()=>number, isRunning: ()=>boolean }}
 */
export function createTimedProgressDriver({
  durationMs = 1400,
  easing = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  onProgress = () => {},
  now,
  requestFrame,
  cancelFrame
} = {}) {
  // Resolve clock/scheduler once. Falls back to real env when not injected.
  const clock = now || (typeof performance !== 'undefined' && performance.now
    ? () => performance.now()
    : () => Date.now());
  const raf = requestFrame || ((cb) => requestAnimationFrame(cb));
  const caf = cancelFrame || ((id) => cancelAnimationFrame(id));

  let progress = 0;
  let running = false;
  let frameId = 0;
  let settleActive = null; // resolves the in-flight play() promise

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function cancel() {
    if (!running) return;
    running = false;
    if (frameId) { caf(frameId); frameId = 0; }
    // Settle the in-flight promise now as not-completed; no further tick will run.
    const settle = settleActive;
    settleActive = null;
    if (settle) settle({ completed: false });
  }

  /**
   * Ramp progress over durationMs. Resolves { completed: true } at the end, or
   * { completed: false } if cancelled mid-flight.
   * @param {{direction?: 1|-1}} [opts]
   */
  function play({ direction = 1 } = {}) {
    // Cancel any in-flight ramp first (last call wins).
    if (running) cancel();

    const reverse = direction === -1;
    const from = reverse ? 1 : 0;
    const to = reverse ? 0 : 1;
    progress = from;
    running = true;
    const startedAt = clock();

    return new Promise((resolve) => {
      settleActive = resolve;
      const tick = () => {
        if (!running) { return; } // cancel() already settled the promise
        const elapsed = clock() - startedAt;
        const t = durationMs <= 0 ? 1 : clamp01(elapsed / durationMs);
        const eased = easing(t);
        progress = clamp01(reverse ? from + (to - from) * eased : eased);
        onProgress(progress);

        if (t >= 1) {
          progress = to;
          onProgress(progress);
          running = false;
          frameId = 0;
          settleActive = null;
          resolve({ completed: true });
          return;
        }
        frameId = raf(tick);
      };
      frameId = raf(tick);
    });
  }

  return {
    play,
    cancel,
    getProgress: () => progress,
    isRunning: () => running
  };
}
