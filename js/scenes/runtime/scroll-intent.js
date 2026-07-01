export const scrollIntentDefaults = {
  intentThreshold: 0.1,
  singleFrameClamp: 0.25,
  minArmedMs: 150,
  reverseCancelThreshold: 0.06,
  cancelCooldownMs: 120,
  decayHalfLifeMs: 260,
  touchMomentumGraceMs: 180,
  releaseCooldownMs: 220
};

const directionOf = (value) => (value > 0 ? 'forward' : value < 0 ? 'reverse' : null);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function output({ progress, direction, thresholdReached, source }) {
  return {
    intentProgress: progress,
    direction,
    thresholdReached,
    source
  };
}

export function createScrollIntentAccumulator({
  config = {},
  viewportHeight = 1000,
  clock = { now: () => Date.now() }
} = {}) {
  const options = { ...scrollIntentDefaults, ...config };
  let progress = 0;
  let direction = null;
  let source = null;
  let firstInputAt = null;
  let cooldownUntil = 0;
  let touchMomentumIgnoreUntil = 0;
  let lastCancelReason = null;

  const now = () => (typeof clock.now === 'function' ? clock.now() : Date.now());

  function reset({ cooldownMs = 0, reason = 'reset' } = {}) {
    progress = 0;
    direction = null;
    source = null;
    firstInputAt = null;
    lastCancelReason = reason;
    if (cooldownMs > 0) cooldownUntil = now() + cooldownMs;
    return output({ progress, direction, thresholdReached: false, source: null });
  }

  function isInCooldown(time = now()) {
    return time < cooldownUntil;
  }

  function hasArmedLongEnough(time = now()) {
    return firstInputAt !== null && time - firstInputAt >= options.minArmedMs;
  }

  function hasReachedThreshold(time = now()) {
    return progress >= options.intentThreshold && hasArmedLongEnough(time) && !isInCooldown(time);
  }

  function normalizeDelta({ deltaVh, deltaPx, deltaY }) {
    if (Number.isFinite(deltaVh)) return deltaVh;
    if (Number.isFinite(deltaPx)) return deltaPx / Math.max(1, viewportHeight);
    if (Number.isFinite(deltaY)) return deltaY / Math.max(1, viewportHeight);
    return 0;
  }

  function update(event = {}) {
    const time = Number.isFinite(event.time) ? event.time : now();
    const eventSource = event.source || source || 'wheel';

    if (isInCooldown(time)) {
      return output({ progress: 0, direction: null, thresholdReached: false, source: eventSource });
    }

    if (eventSource === 'touch-momentum' && time < touchMomentumIgnoreUntil) {
      return output({ progress, direction, thresholdReached: false, source: eventSource });
    }

    const rawDelta = normalizeDelta(event);
    const deltaDirection = directionOf(rawDelta);
    if (!deltaDirection) {
      return output({ progress, direction, thresholdReached: false, source: eventSource });
    }

    const delta = Math.min(Math.abs(rawDelta), options.singleFrameClamp);
    if (direction && deltaDirection !== direction && delta >= options.reverseCancelThreshold) {
      return reset({ cooldownMs: options.cancelCooldownMs, reason: 'reverse-cancel' });
    }

    if (!direction) {
      direction = deltaDirection;
      firstInputAt = time;
    }

    source = eventSource;
    progress = clamp(progress + delta, 0, options.singleFrameClamp);
    const thresholdReached = hasReachedThreshold(time);
    return output({ progress, direction, thresholdReached, source });
  }

  function decay({ time = now() } = {}) {
    if (progress <= 0) return output({ progress, direction, thresholdReached: false, source });
    const elapsed = firstInputAt === null ? 0 : Math.max(0, time - firstInputAt);
    const factor = Math.pow(0.5, elapsed / Math.max(1, options.decayHalfLifeMs));
    progress = progress * factor;
    if (progress < 0.001) {
      progress = 0;
      direction = null;
      firstInputAt = null;
    }
    return output({ progress, direction, thresholdReached: false, source });
  }

  function touchEnd({ time = now() } = {}) {
    touchMomentumIgnoreUntil = time + options.touchMomentumGraceMs;
  }

  function release() {
    return reset({ cooldownMs: options.releaseCooldownMs, reason: 'release' });
  }

  return {
    update,
    decay,
    reset,
    release,
    touchEnd,
	    getState: () => ({
	      intentProgress: progress,
	      direction,
	      thresholdReached: hasReachedThreshold(),
	      source,
	      cooldownUntil,
	      touchMomentumIgnoreUntil,
      lastCancelReason
    })
  };
}
