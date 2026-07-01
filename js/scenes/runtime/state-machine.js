import { createRecoveryRoutine } from './recovery.js';

export const RuntimePhase = Object.freeze({
  IDLE: 'IDLE',
  ARMED: 'ARMED',
  SNAP_LOCKING: 'SNAP_LOCKING',
  PLAYING: 'PLAYING',
  PRESENTING: 'PRESENTING',
  RELEASING: 'RELEASING'
});

export const publicRuntimePhases = Object.freeze(Object.values(RuntimePhase));
export const releaseReasons = Object.freeze(['normal', 'cancelled', 'recovery', 'reduced-motion', 'destroy']);

const clone = (value) => JSON.parse(JSON.stringify(value));

function defaultClock() {
  return {
    now: () => Date.now(),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timer) => clearTimeout(timer)
  };
}

function noopPort() {
  return {
    lock() {},
    unlock() {}
  };
}

export function isPublicRuntimePhase(phase) {
  return publicRuntimePhases.includes(phase);
}

export function createSceneStateMachine({
  segments = [],
  initialSceneId = null,
  playerRegistry = null,
  presentation = null,
  scrollLock = noopPort(),
  recovery = null,
  clock = defaultClock(),
  mediaTimeoutMs = 2000,
  releaseCooldownMs = 220,
  reducedMotion = false,
  onTransition = null
} = {}) {
  const segmentMap = new Map(segments.map((segment) => [segment.id, segment]));
  const recoveryRoutine = recovery || createRecoveryRoutine({ scrollLock, presentation });
  const timers = new Set();
  let activePlayer = null;
  const state = {
    phase: RuntimePhase.IDLE,
    currentSceneId: initialSceneId,
    activeSegmentId: null,
    targetSceneId: null,
    releaseReason: null,
    recoveryReason: null,
    intent: null
  };

  function setPhase(phase, patch = {}) {
    if (!isPublicRuntimePhase(phase)) throw new Error(`Invalid public RuntimeState.phase: ${phase}`);
    Object.assign(state, patch, { phase });
    onTransition?.(getState());
    return getState();
  }

  function getState() {
    return clone(state);
  }

  function requirePhase(phase) {
    if (state.phase !== phase) {
      throw new Error(`Expected phase ${phase}, got ${state.phase}`);
    }
  }

  function getSegment(segmentId) {
    const segment = segmentMap.get(segmentId);
    if (!segment) throw new Error(`Unknown segment ${segmentId}`);
    return segment;
  }

  function addTimer(callback, delay) {
    const timer = clock.setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
    return () => {
      clock.clearTimeout(timer);
      timers.delete(timer);
    };
  }

  function clearTimers() {
    for (const timer of timers) clock.clearTimeout(timer);
    timers.clear();
  }

  function arm({ segmentId, intent = null } = {}) {
    requirePhase(RuntimePhase.IDLE);
    const segment = getSegment(segmentId);
    return setPhase(RuntimePhase.ARMED, {
      activeSegmentId: segment.id,
      targetSceneId: segment.to,
      intent,
      releaseReason: null,
      recoveryReason: null
    });
  }

  function beginSnapLock() {
    requirePhase(RuntimePhase.ARMED);
    scrollLock.lock?.({ reason: 'snap-locking', segmentId: state.activeSegmentId });
    return setPhase(RuntimePhase.SNAP_LOCKING);
  }

  function completeSnapLock() {
    requirePhase(RuntimePhase.SNAP_LOCKING);
    const segment = getSegment(state.activeSegmentId);

    if (reducedMotion) {
      presentation?.present?.(segment.to, { reason: 'reduced-motion' });
      setPhase(RuntimePhase.PRESENTING, { currentSceneId: segment.to });
      return release({ reason: 'reduced-motion' });
    }

    setPhase(RuntimePhase.PLAYING);
    const player = playerRegistry?.get?.(segment.id) || playerRegistry?.get?.(segment.player) || playerRegistry?.[segment.id] || null;
    activePlayer = player;

    if (!player?.play) return Promise.resolve();

    const cancelTimeout = addTimer(() => {
      recover({ recoveryReason: 'PLAYER_TIMEOUT' });
    }, mediaTimeoutMs);

    return Promise.resolve()
      .then(() => player.play({ segment, state: getState() }))
      .then((result) => {
        cancelTimeout();
        if (state.phase === RuntimePhase.PLAYING) completePlaying(result);
        return result;
      })
      .catch((error) => {
        cancelTimeout();
        if (state.phase === RuntimePhase.PLAYING) {
          recover({ recoveryReason: 'PLAYING_ERROR', error });
        }
        return undefined;
      });
  }

  function completePlaying(result = {}) {
    requirePhase(RuntimePhase.PLAYING);
    const segment = getSegment(state.activeSegmentId);
    const nextScene = segment.completion === 'hold-current' ? segment.from : segment.to;
    presentation?.present?.(nextScene, { reason: 'play-complete', result });
    setPhase(RuntimePhase.PRESENTING, { currentSceneId: nextScene });
    return release({ reason: 'normal' });
  }

  function release({ reason = 'normal', recoveryReason = null } = {}) {
    if (!releaseReasons.includes(reason)) throw new Error(`Invalid release reason ${reason}`);
    clearTimers();
    activePlayer?.stop?.({ reason, recoveryReason });
    activePlayer = null;
    scrollLock.unlock?.({ reason, recoveryReason });
    setPhase(RuntimePhase.RELEASING, { releaseReason: reason, recoveryReason });
    addTimer(() => {
      setPhase(RuntimePhase.IDLE, {
        activeSegmentId: null,
        targetSceneId: null,
        intent: null,
        releaseReason: null
      });
    }, releaseCooldownMs);
    return getState();
  }

  function cancel({ reason = 'cancelled' } = {}) {
    if (![RuntimePhase.ARMED, RuntimePhase.SNAP_LOCKING, RuntimePhase.PLAYING].includes(state.phase)) {
      return getState();
    }
    return release({ reason });
  }

  function recover({ recoveryReason, error = null } = {}) {
    const segment = state.activeSegmentId ? getSegment(state.activeSegmentId) : null;
    clearTimers();
    recoveryRoutine.recover({
      activePlayer,
      targetScene: segment?.to || state.targetSceneId,
      lastSafeScene: state.currentSceneId,
      recoveryReason,
      error
    });
    activePlayer = null;
    return release({ reason: 'recovery', recoveryReason });
  }

  function resourceFailed({ recoveryReason = 'RESOURCE_FAILED', error = null } = {}) {
    return recover({ recoveryReason, error });
  }

  function destroy() {
    clearTimers();
    activePlayer?.stop?.({ reason: 'destroy' });
    activePlayer = null;
    scrollLock.unlock?.({ reason: 'destroy' });
    return setPhase(RuntimePhase.IDLE, {
      activeSegmentId: null,
      targetSceneId: null,
      intent: null,
      releaseReason: 'destroy'
    });
  }

  return {
    getState,
    arm,
    beginSnapLock,
    completeSnapLock,
    completePlaying,
    cancel,
    recover,
    resourceFailed,
    release,
    destroy
  };
}
