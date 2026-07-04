import { createTimedProgressDriver } from '../runtime/timed-progress-driver.js';
import { createPatternSceneProvider } from './pattern-scene-provider.js';

export const PATTERN_SOURCE_PROGRESS = 0;
export const PATTERN_FINAL_PROGRESS = 1;

const DEFAULT_DURATION_MS = 1800;

const VALID_TRANSITIONS = Object.freeze({
  unmounted: new Set(['MOUNT']),
  mounting: new Set(['DESTROY']),
  source: new Set(['PLAY', 'SHOW_FINAL', 'DESTROY']),
  playing: new Set(['PLAY', 'REVERSE', 'CANCEL_TO_SOURCE', 'CANCEL_TO_FINAL', 'DESTROY']),
  final: new Set(['PLAY', 'REVERSE', 'SHOW_FINAL', 'DESTROY']),
  reversing: new Set(['PLAY', 'CANCEL_TO_SOURCE', 'CANCEL_TO_FINAL', 'DESTROY']),
  destroyed: new Set([])
});

const COMMAND_ALIASES = Object.freeze({
  MOUNT: 'mount',
  PLAY: 'playForward',
  PLAY_FORWARD: 'playForward',
  SHOW_FINAL: 'showFinal',
  CANCEL_TO_SOURCE: 'cancelToSource',
  CANCEL_TO_FINAL: 'cancelToFinal',
  REVERSE: 'reverseToSource',
  REVERSE_TO_SOURCE: 'reverseToSource',
  DESTROY: 'destroy',
  mount: 'mount',
  play: 'playForward',
  playForward: 'playForward',
  showFinal: 'showFinal',
  cancelToSource: 'cancelToSource',
  cancelToFinal: 'cancelToFinal',
  reverse: 'reverseToSource',
  reverseToSource: 'reverseToSource',
  destroy: 'destroy'
});

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function isAborted(signal) {
  return Boolean(signal?.aborted);
}

function addAbort(signal, callback) {
  if (!signal) return () => {};
  if (signal.aborted) {
    callback();
    return () => {};
  }
  signal.addEventListener?.('abort', callback, { once: true });
  return () => signal.removeEventListener?.('abort', callback);
}

export function createPatternSceneController({
  createProvider = createPatternSceneProvider,
  createDriver = createTimedProgressDriver,
  createScene,
  durations = {},
  deps = {},
  easing
} = {}) {
  const provider = createProvider({
    createScene,
    deps,
    initialProgress: PATTERN_SOURCE_PROGRESS
  });
  const subscribers = new Set();
  const playForwardDurationMs = durations.playForward
    ?? durations.bloomIn
    ?? durations.durationMs
    ?? DEFAULT_DURATION_MS;
  const reverseToSourceDurationMs = durations.reverseToSource
    ?? durations.reverse
    ?? durations.durationMs
    ?? playForwardDurationMs;

  const state = {
    phase: 'unmounted',
    progress: PATTERN_SOURCE_PROGRESS,
    runId: 0,
    mounted: false,
    ready: false,
    reason: undefined
  };

  let destroyed = false;
  let mountPromise = null;
  let removeAbort = () => {};
  let runProgressHandler = null;

  const driver = createDriver({
    durationMs: playForwardDurationMs,
    easing,
    onProgress(progress) {
      if (destroyed) return;
      state.progress = clamp(progress);
      provider.setProgress(state.progress);
      runProgressHandler?.(state.progress, snapshot());
      notify();
    },
    now: deps.now,
    requestFrame: deps.requestFrame,
    cancelFrame: deps.cancelFrame
  });

  function snapshot() {
    return Object.freeze({
      phase: state.phase,
      progress: state.progress,
      runId: state.runId,
      mounted: state.mounted,
      ready: state.ready,
      ...(state.reason ? { reason: state.reason } : {})
    });
  }

  function notify() {
    const next = snapshot();
    for (const subscriber of subscribers) subscriber(next);
  }

  function isValid(command) {
    return VALID_TRANSITIONS[state.phase]?.has(command) === true;
  }

  function invalidResult(reason = destroyed ? 'destroyed' : 'invalid_phase') {
    state.reason = reason;
    return { accepted: false, completed: false, reason };
  }

  function setEndpoint(phase, progress, reason) {
    state.phase = phase;
    state.progress = progress;
    state.reason = reason;
    provider.setProgress(progress);
    notify();
  }

  function supersedeCurrentRun() {
    state.runId += 1;
    removeAbort();
    removeAbort = () => {};
    runProgressHandler = null;
    driver.cancel();
  }

  async function startRun(kind, { signal, onProgress } = {}) {
    const command = kind === 'play' ? 'PLAY' : 'REVERSE';
    const abortPhase = kind === 'play' ? 'source' : 'final';
    const abortProgress = kind === 'play' ? PATTERN_SOURCE_PROGRESS : PATTERN_FINAL_PROGRESS;
    let aborted = false;
    if (destroyed) return invalidResult('destroyed');
    if (!isValid(command)) return invalidResult();
    if (isAborted(signal)) return { accepted: true, completed: false, reason: 'aborted' };

    const runId = state.runId + 1;
    state.runId = runId;
    removeAbort();
    removeAbort = () => {};
    driver.cancel();
    runProgressHandler = onProgress || null;
    state.phase = kind === 'play' ? 'playing' : 'reversing';
    state.reason = undefined;
    notify();

    const cleanupAbort = addAbort(signal, () => {
      aborted = true;
      state.runId += 1;
      runProgressHandler = null;
      driver.cancel();
      setEndpoint(abortPhase, abortProgress, 'aborted');
    });
    removeAbort = cleanupAbort;

    const result = await driver.play({
      from: state.progress,
      to: kind === 'play' ? PATTERN_FINAL_PROGRESS : PATTERN_SOURCE_PROGRESS,
      direction: kind === 'play' ? 1 : -1,
      durationMs: kind === 'play' ? playForwardDurationMs : reverseToSourceDurationMs
    });

    cleanupAbort();
    if (removeAbort === cleanupAbort) removeAbort = () => {};

    if (state.phase === 'destroyed') {
      return { accepted: true, completed: false, reason: 'destroyed' };
    }
    if (state.runId !== runId) {
      return { accepted: true, completed: false, reason: aborted ? 'aborted' : 'superseded' };
    }
    runProgressHandler = null;

    if (result.completed) {
      state.phase = kind === 'play' ? 'final' : 'source';
      state.progress = kind === 'play' ? PATTERN_FINAL_PROGRESS : PATTERN_SOURCE_PROGRESS;
      state.reason = undefined;
      provider.setProgress(state.progress);
      notify();
      return { accepted: true, completed: true };
    }

    return { accepted: true, completed: false, reason: result.reason || 'cancelled' };
  }

  async function mount(input = {}) {
    const options = input?.host ? input : { host: input };
    if (destroyed) return invalidResult('destroyed');
    if (mountPromise) return mountPromise;
    if (!isValid('MOUNT')) return invalidResult();
    if (isAborted(options.signal)) return { accepted: true, completed: false, reason: 'aborted' };

    const runId = state.runId + 1;
    state.runId = runId;
    state.phase = 'mounting';
    state.reason = undefined;
    notify();

    mountPromise = provider.mount(options).then((result) => {
      mountPromise = null;
      if (state.phase === 'destroyed') {
        return { accepted: true, completed: false, reason: 'destroyed' };
      }
      if (state.runId !== runId) {
        return { accepted: true, completed: false, reason: 'superseded' };
      }
      if (result.completed === false) {
        state.phase = 'unmounted';
        state.mounted = false;
        state.ready = false;
        state.reason = result.reason;
        notify();
        return { accepted: true, completed: false, reason: result.reason };
      }

      state.phase = 'source';
      state.progress = PATTERN_SOURCE_PROGRESS;
      state.mounted = true;
      state.ready = true;
      state.reason = undefined;
      provider.setProgress(PATTERN_SOURCE_PROGRESS);
      notify();
      return { accepted: true, completed: true };
    }).catch((error) => {
      mountPromise = null;
      throw error;
    });

    return mountPromise;
  }

  function cancelToSource() {
    if (destroyed) return invalidResult('destroyed');
    if (!isValid('CANCEL_TO_SOURCE')) return invalidResult();
    supersedeCurrentRun();
    setEndpoint('source', PATTERN_SOURCE_PROGRESS, 'cancelled');
    return { accepted: true, completed: false, reason: 'cancelled' };
  }

  function cancelToFinal() {
    if (destroyed) return invalidResult('destroyed');
    if (!isValid('CANCEL_TO_FINAL')) return invalidResult();
    supersedeCurrentRun();
    setEndpoint('final', PATTERN_FINAL_PROGRESS, 'cancel_to_final');
    return { accepted: true, completed: false, reason: 'cancel_to_final' };
  }

  function showFinal() {
    if (destroyed) return invalidResult('destroyed');
    if (!isValid('SHOW_FINAL')) return invalidResult();
    supersedeCurrentRun();
    setEndpoint('final', PATTERN_FINAL_PROGRESS, undefined);
    return { accepted: true, completed: true };
  }

  function destroy() {
    if (destroyed) return snapshot();
    destroyed = true;
    state.phase = 'destroyed';
    state.reason = 'destroyed';
    state.runId += 1;
    removeAbort();
    removeAbort = () => {};
    runProgressHandler = null;
    driver.cancel();
    provider.destroy();
    state.mounted = false;
    state.ready = false;
    notify();
    subscribers.clear();
    return snapshot();
  }

  const api = {
    mount,
    playForward(options) {
      if (destroyed) return invalidResult('destroyed');
      if (!isValid('PLAY')) return invalidResult();
      return startRun('play', options);
    },
    cancelToSource,
    cancelToFinal,
    reverseToSource(options) {
      if (destroyed) return invalidResult('destroyed');
      if (!isValid('REVERSE')) return invalidResult();
      return startRun('reverse', options);
    },
    showFinal,
    destroy,
    getState() {
      return snapshot();
    },
    subscribe(fn) {
      if (typeof fn !== 'function' || destroyed) return () => {};
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    dispatch(command, options) {
      const method = COMMAND_ALIASES[command];
      if (!method || typeof api[method] !== 'function') return invalidResult();
      return api[method](options);
    }
  };

  return api;
}
