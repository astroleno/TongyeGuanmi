export const SCENE_PLAYER_TRACE_STATES = Object.freeze([
  'idle',
  'mounted',
  'poster',
  'playing-forward',
  'complete',
  'stable',
  'destroyed'
]);

const traceStateSet = new Set(SCENE_PLAYER_TRACE_STATES);

const DEFAULT_TIMEOUTS = Object.freeze({
  mount: 2500,
  showPoster: 2500,
  playForward: 12000,
  cancelToSource: 1800,
  reverseToPoster: 1800,
  destroy: 1200
});

export class SceneAdapterTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SceneAdapterTimeoutError';
  }
}

export class SceneAdapterAbortError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SceneAdapterAbortError';
  }
}

function now(clock = globalThis.performance) {
  return Math.round(clock?.now?.() ?? Date.now());
}

function abortReason(signal, fallback = 'aborted') {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  return new SceneAdapterAbortError(String(reason || fallback));
}

function normalizeProviderState(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return snapshot.phase || snapshot.state || snapshot.status || null;
}

function normalizeTraceState(entry) {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return null;
  return entry.phase || entry.state || entry.status || entry.type || null;
}

function isEarlyCopyMilestone(entry, state) {
  if (state === 'early-copy-ready') return true;
  return entry?.milestone === 'early-copy-ready';
}

function isCompletedResult(result) {
  if (result?.cancelled) return false;
  if (result?.completed === false) return false;
  return true;
}

function createTimeoutSignal({ sourceSignal, timeoutMs, label }) {
  const controller = new AbortController();
  const cleanups = [];
  let timer = null;

  const abort = (reason) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };

  if (sourceSignal?.aborted) {
    abort(abortReason(sourceSignal));
  } else if (sourceSignal) {
    const onAbort = () => abort(abortReason(sourceSignal));
    sourceSignal.addEventListener('abort', onAbort, { once: true });
    cleanups.push(() => sourceSignal.removeEventListener('abort', onAbort));
  }

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => {
      abort(new SceneAdapterTimeoutError(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    cleanups.push(() => clearTimeout(timer));
  }

  const abortPromise = new Promise((_, reject) => {
    if (controller.signal.aborted) {
      reject(abortReason(controller.signal));
      return;
    }
    const onAbort = () => reject(abortReason(controller.signal));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    cleanups.push(() => controller.signal.removeEventListener('abort', onAbort));
  });

  return {
    controller,
    signal: controller.signal,
    abortPromise,
    cleanup() {
      cleanups.splice(0).forEach((cleanup) => cleanup());
    }
  };
}

export class ScenePlayerAdapter {
  constructor({
    sceneId,
    createPlayer,
    player = null,
    timeouts = {},
    manifest = {},
    clock = globalThis.performance
  } = {}) {
    if (!sceneId) throw new Error('ScenePlayerAdapter requires sceneId');
    if (!player && typeof createPlayer !== 'function') {
      throw new Error(`ScenePlayerAdapter(${sceneId}) requires createPlayer or player`);
    }

    this.sceneId = sceneId;
    this.createPlayer = createPlayer;
    this.player = player;
    this.manifest = manifest;
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...timeouts };
    this.clock = clock;
    this.phase = 'idle';
    this.destroyed = false;
    this.currentOperation = null;
    this.trace = [{
      type: 'state',
      phase: 'idle',
      sceneId,
      at: now(clock)
    }];
  }

  ensurePlayer() {
    if (!this.player) this.player = this.createPlayer();
    return this.player;
  }

  assertUsable(methodName) {
    if (this.destroyed && methodName !== 'destroy') {
      throw new Error(`ScenePlayerAdapter(${this.sceneId}) is destroyed`);
    }
  }

  getState() {
    const providerState = this.player?.getState?.() || null;
    return {
      sceneId: this.sceneId,
      phase: this.phase,
      destroyed: this.destroyed,
      providerPhase: normalizeProviderState(providerState),
      providerState,
      trace: this.trace.slice()
    };
  }

  emitState(phase, detail = {}, callback = null) {
    if (!traceStateSet.has(phase)) return null;
    if (this.phase === phase && !detail.forceTrace) return null;
    this.phase = phase;
    this.destroyed = phase === 'destroyed';
    const entry = {
      type: 'state',
      phase,
      sceneId: this.sceneId,
      at: now(this.clock),
      ...detail
    };
    this.trace.push(entry);
    callback?.(entry);
    return entry;
  }

  emitMilestone(milestone, detail = {}, callback = null) {
    const entry = {
      type: 'milestone',
      milestone,
      sceneId: this.sceneId,
      at: now(this.clock),
      ...detail
    };
    delete entry.target;
    delete entry.targetSceneId;
    this.trace.push(entry);
    callback?.(entry);
    return entry;
  }

  handleProviderTrace(entry, operation, callback) {
    if (!operation.active) return;
    const state = normalizeTraceState(entry);
    if (isEarlyCopyMilestone(entry, state)) {
      this.emitMilestone('early-copy-ready', {
        progress: entry?.progress ?? null,
        providerEntry: entry
      }, callback);
      return;
    }
    if (traceStateSet.has(state)) {
      this.emitState(state, {
        source: 'provider',
        providerEntry: entry
      }, callback);
    }
  }

  beginOperation(methodName, { signal, timeoutMs } = {}) {
    this.assertUsable(methodName);
    if (this.currentOperation) {
      const shouldAbortCurrent = !['cancelToSource', 'reverseToPoster'].includes(methodName);
      this.currentOperation.active = false;
      if (shouldAbortCurrent) {
        this.currentOperation.controller?.abort(new SceneAdapterAbortError('superseded'));
      } else {
        this.currentOperation.cleanup?.();
      }
    }
    const timeoutSignal = createTimeoutSignal({
      sourceSignal: signal,
      timeoutMs: timeoutMs ?? this.timeouts[methodName],
      label: `${this.sceneId}.${methodName}`
    });
    const operation = {
      methodName,
      active: true,
      controller: timeoutSignal.controller,
      signal: timeoutSignal.signal,
      abortPromise: timeoutSignal.abortPromise,
      cleanup: timeoutSignal.cleanup
    };
    this.currentOperation = operation;
    return operation;
  }

  finishOperation(operation) {
    operation.active = false;
    operation.cleanup();
    if (this.currentOperation === operation) this.currentOperation = null;
  }

  async callProvider(methodName, args = {}, {
    signal,
    timeoutMs,
    onTrace,
    onProgress
  } = {}) {
    this.assertUsable(methodName);
    const player = this.ensurePlayer();
    const method = player?.[methodName];
    if (typeof method !== 'function') {
      throw new Error(`Scene provider ${this.sceneId} does not implement ${methodName}()`);
    }

    const operation = this.beginOperation(methodName, { signal, timeoutMs });
    const providerArgs = {
      ...args,
      signal: operation.signal
    };
    if (onTrace || methodName === 'playForward' || methodName === 'mount') {
      providerArgs.onTrace = (entry) => this.handleProviderTrace(entry, operation, onTrace);
    }
    if (onProgress) {
      providerArgs.onProgress = (progress) => {
        if (operation.active) onProgress(progress);
      };
    }

    try {
      return await Promise.race([
        Promise.resolve().then(() => method.call(player, providerArgs)),
        operation.abortPromise
      ]);
    } finally {
      this.finishOperation(operation);
    }
  }

  async mount({ host, signal, timeoutMs, onTrace } = {}) {
    const result = await this.callProvider('mount', { host }, { signal, timeoutMs, onTrace });
    this.emitState('mounted', { source: 'adapter' }, onTrace);
    return result;
  }

  async showPoster({ direction = 'forward', signal, timeoutMs, onTrace } = {}) {
    const result = await this.callProvider('showPoster', { direction }, { signal, timeoutMs, onTrace });
    this.emitState('poster', { direction, source: 'adapter' }, onTrace);
    return result;
  }

  async playForward({ signal, timeoutMs, onProgress, onTrace } = {}) {
    this.assertUsable('playForward');
    const restorePhase = this.phase === 'stable' ? 'stable' : 'poster';
    this.emitState('playing-forward', { source: 'adapter' }, onTrace);
    let result;
    try {
      result = await this.callProvider('playForward', {}, {
        signal,
        timeoutMs,
        onProgress,
        onTrace
      });
    } catch (error) {
      if (!this.destroyed && this.phase === 'playing-forward') {
        this.emitState(restorePhase, {
          reason: 'play-forward-failed',
          source: 'adapter'
        }, onTrace);
      }
      throw error;
    }
    if (isCompletedResult(result)) {
      if (!['complete', 'stable'].includes(this.phase)) {
        this.emitState('complete', { source: 'adapter' }, onTrace);
      }
      if (this.phase !== 'stable') {
        this.emitState('stable', { source: 'adapter' }, onTrace);
      }
    }
    return result;
  }

  async cancelToSource({ signal, timeoutMs, onTrace } = {}) {
    const result = await this.callProvider('cancelToSource', {}, { signal, timeoutMs, onTrace });
    this.emitState('poster', { reason: 'cancel-to-source', source: 'adapter' }, onTrace);
    return result;
  }

  async reverseToPoster({ signal, timeoutMs, onTrace, onProgress } = {}) {
    const result = await this.callProvider('reverseToPoster', {}, {
      signal,
      timeoutMs,
      onTrace,
      onProgress
    });
    this.emitState('poster', { reason: 'reverse-to-poster', source: 'adapter' }, onTrace);
    return result;
  }

  async destroy({ signal, timeoutMs, onTrace } = {}) {
    if (this.destroyed) return this.getState();
    const player = this.player;
    let thrown = null;

    if (player?.destroy) {
      const operation = this.beginOperation('destroy', { signal, timeoutMs });
      try {
        await Promise.race([
          Promise.resolve().then(() => player.destroy({ signal: operation.signal })),
          operation.abortPromise
        ]);
      } catch (error) {
        thrown = error;
      } finally {
        this.finishOperation(operation);
      }
    } else if (this.currentOperation) {
      this.currentOperation.active = false;
      this.currentOperation.controller?.abort(new SceneAdapterAbortError('destroyed'));
      this.currentOperation.cleanup?.();
      this.currentOperation = null;
    }

    this.emitState('destroyed', {
      source: 'adapter',
      ...(thrown ? { reason: 'destroy-failed', error: thrown.message } : {})
    }, onTrace);
    if (thrown) throw thrown;
    return this.getState();
  }
}

export function createScenePlayerAdapter(options = {}) {
  return new ScenePlayerAdapter(options);
}
