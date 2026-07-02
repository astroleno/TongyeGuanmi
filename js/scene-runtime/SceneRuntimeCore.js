import { LayerOwnership } from './LayerOwnership.js';
import { Presentation } from './Presentation.js';
import { ReadMonitor } from './ReadMonitor.js';
import { ScrollIntent } from './ScrollIntent.js';
import { TransitionSegmentPlayer } from './TransitionSegmentPlayer.js';

export const RUNTIME_STATES = Object.freeze({
  IDLE: 'IDLE',
  ARMED: 'ARMED',
  SNAP_LOCKING: 'SNAP_LOCKING',
  TRANSITIONING: 'TRANSITIONING',
  PLAYING: 'PLAYING',
  PRESENTING: 'PRESENTING',
  RELEASING: 'RELEASING'
});

export const DEFAULT_RUNTIME_ROUTE = Object.freeze({
  hero: Object.freeze({
    kind: 'transition',
    to: 'pattern',
    segmentId: 'center-ink-expand'
  }),
  pattern: Object.freeze({
    kind: 'transition',
    to: 'star-map',
    segmentId: 'left-rotate-bloom'
  }),
  'star-map': Object.freeze({
    kind: 'scene-play-transition',
    to: 'aod-animation',
    segmentId: 'bottom-to-top-ink'
  }),
  'aod-animation': Object.freeze({
    kind: 'scene-play',
    to: 'method-top'
  }),
  'method-top': Object.freeze({
    kind: 'read',
    to: 'method-bottom'
  }),
  'method-bottom': Object.freeze({
    kind: 'transition',
    to: null,
    segmentId: 'bottom-to-top-ink'
  })
});

export const DEFAULT_RUNTIME_REVERSE_ROUTE = Object.freeze({
  pattern: Object.freeze({
    kind: 'transition',
    to: 'hero',
    segmentId: 'center-ink-expand'
  }),
  'star-map': Object.freeze({
    kind: 'transition',
    to: 'pattern',
    segmentId: 'left-rotate-bloom'
  }),
  'aod-animation': Object.freeze({
    kind: 'transition',
    to: 'star-map',
    segmentId: 'bottom-to-top-ink'
  }),
  'method-top': Object.freeze({
    kind: 'transition',
    to: 'aod-animation',
    segmentId: 'bottom-to-top-ink'
  }),
  'method-bottom': Object.freeze({
    kind: 'present',
    to: 'method-top'
  })
});

export class SceneRuntimeBoundaryError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'SceneRuntimeBoundaryError';
    this.detail = detail;
  }
}

function isCompletedResult(result) {
  if (result?.cancelled) return false;
  if (result?.completed === false) return false;
  return true;
}

function failureReason(error, fallback = 'failed') {
  return error?.name?.includes('Timeout') ? 'timeout' : fallback;
}

function now(clock = globalThis.performance) {
  return Math.round(clock?.now?.() ?? Date.now());
}

export class SceneRuntimeCore {
  constructor({
    registry,
    route = DEFAULT_RUNTIME_ROUTE,
    reverseRoute = DEFAULT_RUNTIME_REVERSE_ROUTE,
    presentation = new Presentation(),
    scrollIntent = new ScrollIntent(),
    readMonitor = new ReadMonitor(),
    transitionPlayer = new TransitionSegmentPlayer(),
    ownership = new LayerOwnership(),
    hosts = new Map(),
    timeouts = {},
    stableScenePlayers = [],
    failureCooldownMs = 420,
    clock = globalThis.performance
  } = {}) {
    if (!registry) throw new Error('SceneRuntimeCore requires a registry');
    this.registry = registry;
    this.route = route;
    this.reverseRoute = reverseRoute;
    this.presentation = presentation;
    this.scrollIntent = scrollIntent;
    this.readMonitor = readMonitor;
    this.transitionPlayer = transitionPlayer;
    this.ownership = ownership;
    this.hosts = hosts instanceof Map ? hosts : new Map(Object.entries(hosts));
    this.stableScenePlayers = new Set(stableScenePlayers);
    this.timeouts = {
      transition: 1000,
      scene: 1000,
      ...timeouts
    };
    this.failureCooldownMs = failureCooldownMs;
    this.clock = clock;
    this.failureCooldowns = new Map();
    this.adapters = new Map();
    this.stableScenePlayback = new Map();
    this.stableSceneCompleted = new Set();
    this.state = RUNTIME_STATES.IDLE;
    this.activeAttempt = null;
    this.epoch = 0;
    this.attemptSequence = 0;
    this.trace = [];
  }

  snapshot() {
    return {
      state: this.state,
      activeAttempt: this.activeAttempt ? {
        attemptId: this.activeAttempt.attemptId,
        epoch: this.activeAttempt.epoch,
        from: this.activeAttempt.from,
        to: this.activeAttempt.step.to,
        kind: this.activeAttempt.step.kind
      } : null,
      epoch: this.epoch,
      presentation: this.presentation.snapshot(),
      ownership: this.ownership.snapshot(),
      stableScenePlayback: Object.fromEntries([...this.stableScenePlayback.entries()].map(([sceneId, playback]) => [
        sceneId,
        { epoch: playback.epoch }
      ])),
      scrollIntent: this.scrollIntent.snapshot(),
      readMonitor: this.readMonitor.snapshot(),
      failureCooldowns: Object.fromEntries([...this.failureCooldowns.entries()]),
      trace: this.trace.slice()
    };
  }

  record(type, detail = {}) {
    const entry = {
      type,
      state: this.state,
      epoch: this.epoch,
      ...detail
    };
    this.trace.push(entry);
    return entry;
  }

  setState(state, detail = {}) {
    this.state = state;
    return this.record('state', detail);
  }

  hostFor(sceneId) {
    if (this.hosts.has(sceneId)) return this.hosts.get(sceneId);
    const host = { sceneId, children: [] };
    this.hosts.set(sceneId, host);
    return host;
  }

  async ensureAdapter(sceneId) {
    if (!sceneId) return null;
    if (this.adapters.has(sceneId)) return this.adapters.get(sceneId);
    const adapter = this.registry.createAdapter(sceneId);
    this.adapters.set(sceneId, adapter);
    await adapter.mount({ host: this.hostFor(sceneId) });
    await adapter.showPoster({ direction: 'forward' });
    return adapter;
  }

  async initialize(sceneId = 'hero') {
    await this.ensureAdapter(sceneId);
    this.presentation.present(sceneId, 'runtime-initial');
    this.setState(RUNTIME_STATES.IDLE, { sceneId, reason: 'runtime-initial' });
    this.activateStableScene(sceneId, 'runtime-initial').catch((error) => {
      this.record('stable-scene-activation-failed', {
        sceneId,
        reason: 'runtime-initial',
        error: error.message
      });
    });
    return this.snapshot();
  }

  current() {
    return this.presentation.snapshot().current;
  }

  findRouteStep(sceneId = this.current(), direction = 1) {
    return (direction < 0 ? this.reverseRoute : this.route)[sceneId] || null;
  }

  routeStep(sceneId = this.current(), direction = 1) {
    const step = this.findRouteStep(sceneId, direction);
    if (!step) throw new Error(`No runtime route step for ${sceneId}`);
    return step;
  }

  cooldownKey(from, step) {
    return [
      from,
      step.kind,
      step.to || '',
      step.segmentId || ''
    ].join('|');
  }

  getActiveCooldown(from = this.current(), step = this.routeStep(from)) {
    const key = this.cooldownKey(from, step);
    const cooldown = this.failureCooldowns.get(key);
    if (!cooldown) return null;
    const remainingMs = cooldown.until - now(this.clock);
    if (remainingMs <= 0) {
      this.failureCooldowns.delete(key);
      return null;
    }
    return { key, ...cooldown, remainingMs };
  }

  registerFailureCooldown(attempt, reason = 'failure') {
    if (!attempt || this.failureCooldownMs <= 0) return null;
    const key = this.cooldownKey(attempt.from, attempt.step);
    const cooldown = {
      from: attempt.from,
      to: attempt.step.to,
      kind: attempt.step.kind,
      segmentId: attempt.step.segmentId || null,
      reason,
      attemptId: attempt.attemptId,
      until: now(this.clock) + this.failureCooldownMs
    };
    this.failureCooldowns.set(key, cooldown);
    this.record('failure-cooldown', {
      key,
      ...cooldown
    });
    return cooldown;
  }

  assertCanArm(from = this.current(), step = this.routeStep(from)) {
    const cooldown = this.getActiveCooldown(from, step);
    if (!cooldown) return;
    const error = new Error(`Retry suppressed for ${from} after ${cooldown.reason}`);
    error.name = 'SceneRuntimeRetrySuppressedError';
    error.cooldown = cooldown;
    throw error;
  }

  createAttempt({ direction = 1, source = 'intent' } = {}) {
    const from = this.current();
    const step = this.findRouteStep(from, direction);
    if (!step) {
      throw new SceneRuntimeBoundaryError(`No runtime route step for ${from} in direction ${direction}`, {
        from,
        direction,
        source
      });
    }
    this.assertCanArm(from, step);
    const stableCancelPromise = this.cancelStableScenePlayback(from, 'attempt-start').catch((error) => {
      this.record('stable-scene-cancel-failed', {
        sceneId: from,
        reason: 'attempt-start',
        error: error.message
      });
      return null;
    });
    this.epoch += 1;
    const attempt = {
      attemptId: ++this.attemptSequence,
      epoch: this.epoch,
      direction,
      source,
      from,
      step,
      stableCancelPromise,
      controller: new AbortController()
    };
    this.activeAttempt = attempt;
    this.scrollIntent.setArmedAttempt(attempt.attemptId, direction);
    this.setState(RUNTIME_STATES.ARMED, {
      attemptId: attempt.attemptId,
      from,
      to: step.to,
      kind: step.kind
    });
    return attempt;
  }

  armNext(options = {}) {
    if (this.state !== RUNTIME_STATES.IDLE) {
      throw new Error(`Cannot arm runtime while ${this.state}`);
    }
    return this.createAttempt(options);
  }

  cancelArmed(reason = 'cancel-armed') {
    if (this.state !== RUNTIME_STATES.ARMED || !this.activeAttempt) return this.snapshot();
    const attempt = this.activeAttempt;
    this.scrollIntent.clearArmedAttempt();
    this.activeAttempt = null;
    this.epoch += 1;
    this.setState(RUNTIME_STATES.IDLE, {
      attemptId: attempt.attemptId,
      reason
    });
    return this.snapshot();
  }

  inputScroll(event = {}) {
    const result = this.scrollIntent.input(event);
    if (result.type === 'cancel-armed') {
      this.cancelArmed('reverse-scroll');
      return result;
    }
    if (result.type === 'intent' && this.state === RUNTIME_STATES.IDLE) {
      try {
        this.armNext({
          direction: result.direction,
          source: event.type || 'scroll'
        });
      } catch (error) {
        if (error.name === 'SceneRuntimeBoundaryError') {
          this.scrollIntent.reset('route-boundary');
          this.record('route-boundary', error.detail || {});
          return {
            type: 'route-boundary',
            direction: result.direction,
            detail: error.detail
          };
        }
        if (error.name !== 'SceneRuntimeRetrySuppressedError') throw error;
        this.scrollIntent.reset('retry-suppressed');
        this.record('retry-suppressed', {
          direction: result.direction,
          cooldown: error.cooldown
        });
        return {
          type: 'retry-suppressed',
          cooldown: error.cooldown
        };
      }
    }
    return result;
  }

  async advance(options = {}) {
    const attempt = this.armNext(options);
    return this.runArmed(attempt);
  }

  async runArmed(attempt = this.activeAttempt) {
    if (!attempt || !this.isAttemptCurrent(attempt)) {
      throw new Error('No current runtime attempt to run');
    }

    const owner = `attempt:${attempt.attemptId}`;
    try {
      await attempt.stableCancelPromise;
      if (!this.isAttemptCurrent(attempt)) return { completed: false, stale: true };

      this.setState(RUNTIME_STATES.SNAP_LOCKING, {
        attemptId: attempt.attemptId,
        from: attempt.from,
        to: attempt.step.to
      });
      this.ownership.claim('snap', owner, { attemptId: attempt.attemptId });
      this.ownership.release('snap', owner, 'snap-complete');

      if (attempt.step.kind === 'transition') {
        return await this.runTransitionAttempt(attempt, owner);
      }
      if (attempt.step.kind === 'scene-play') {
        return await this.runScenePlayAttempt(attempt, owner);
      }
      if (attempt.step.kind === 'scene-play-transition') {
        return await this.runScenePlayTransitionAttempt(attempt, owner);
      }
      if (attempt.step.kind === 'read') {
        return await this.runReadAttempt(attempt, owner);
      }
      if (attempt.step.kind === 'present') {
        return await this.runPresentAttempt(attempt);
      }
      throw new Error(`Unsupported route step kind: ${attempt.step.kind}`);
    } catch (error) {
      if (this.isAttemptCurrent(attempt)) {
        await this.recoverAttempt(attempt, failureReason(error, 'attempt-failed'));
      } else {
        this.record('stale-catch', {
          attemptId: attempt.attemptId,
          epoch: attempt.epoch,
          error: error.message
        });
      }
      throw error;
    } finally {
      this.ownership.releaseOwner(owner, 'attempt-finally');
      if (this.isAttemptCurrent(attempt)) {
        this.scrollIntent.clearArmedAttempt();
        this.activeAttempt = null;
        this.setState(RUNTIME_STATES.RELEASING, {
          attemptId: attempt.attemptId
        });
        this.setState(RUNTIME_STATES.IDLE, {
          attemptId: attempt.attemptId
        });
      } else {
        this.record('stale-finally', {
          attemptId: attempt.attemptId,
          epoch: attempt.epoch
        });
      }
    }
  }

  async runTransitionAttempt(attempt, owner) {
    this.setState(RUNTIME_STATES.TRANSITIONING, {
      attemptId: attempt.attemptId,
      segmentId: attempt.step.segmentId,
      from: attempt.from,
      to: attempt.step.to
    });
    this.ownership.claim('transition', owner, {
      segmentId: attempt.step.segmentId
    });
    await this.prepareTransitionTarget(attempt);
    const result = await this.transitionPlayer.play({
      segmentId: attempt.step.segmentId,
      from: attempt.from,
      to: attempt.step.to,
      attemptId: attempt.attemptId,
      epoch: attempt.epoch,
      signal: attempt.controller.signal,
      timeoutMs: this.timeouts.transition,
      onTrace: (entry) => this.handleAsyncTrace(attempt, entry),
      onProgress: (entry) => this.handleAsyncTrace(attempt, {
        type: 'transition-progress',
        ...entry
      })
    });
    if (!this.isAttemptCurrent(attempt)) return { completed: false, stale: true };

    this.ownership.release('transition', owner, 'transition-complete');
    this.setState(RUNTIME_STATES.PRESENTING, {
      attemptId: attempt.attemptId,
      target: attempt.step.to,
      reason: 'transition-complete'
    });
    if (attempt.step.to) {
      await this.ensureAdapter(attempt.step.to);
      this.presentation.present(attempt.step.to, `transition:${attempt.step.segmentId}`);
      this.activateStableScene(attempt.step.to, `transition:${attempt.step.segmentId}`).catch((error) => {
        this.record('stable-scene-activation-failed', {
          sceneId: attempt.step.to,
          reason: `transition:${attempt.step.segmentId}`,
          error: error.message
        });
      });
    } else {
      this.record('transition-only-complete', {
        attemptId: attempt.attemptId,
        segmentId: attempt.step.segmentId
      });
    }
    return result;
  }

  async runScenePlayAttempt(attempt, owner) {
    this.setState(RUNTIME_STATES.PLAYING, {
      attemptId: attempt.attemptId,
      sceneId: attempt.from
    });
    this.ownership.claim('scene', owner, { sceneId: attempt.from });
    const adapter = await this.ensureAdapter(attempt.from);
    const result = await adapter.playForward({
      timeoutMs: this.timeouts.scene,
      signal: attempt.controller.signal,
      onTrace: (entry) => this.handleSceneTrace(attempt, entry),
      onProgress: (progress) => this.handleAsyncTrace(attempt, {
        type: 'scene-progress',
        progress,
        sceneId: attempt.from,
        attemptId: attempt.attemptId,
        epoch: attempt.epoch
      })
    });
    if (!this.isAttemptCurrent(attempt)) return { completed: false, stale: true };
    if (!isCompletedResult(result)) {
      await this.recoverAttempt(attempt, result?.reason || 'scene-play-cancelled');
      return result;
    }

    this.ownership.release('scene', owner, 'scene-play-complete');
    this.setState(RUNTIME_STATES.PRESENTING, {
      attemptId: attempt.attemptId,
      target: attempt.step.to,
      reason: 'scene-play-complete'
    });
    await this.ensureAdapter(attempt.step.to);
    this.presentation.present(attempt.step.to, `scene-play:${attempt.from}`);
    this.presentation.clearEarlyCopy('scene-play-committed');
    return result;
  }

  async runScenePlayTransitionAttempt(attempt, owner) {
    this.setState(RUNTIME_STATES.PLAYING, {
      attemptId: attempt.attemptId,
      sceneId: attempt.from
    });
    this.ownership.claim('scene', owner, { sceneId: attempt.from });
    const adapter = await this.ensureAdapter(attempt.from);
    const playResult = await adapter.playForward({
      timeoutMs: this.timeouts.scene,
      signal: attempt.controller.signal,
      onTrace: (entry) => this.handleSceneTrace(attempt, entry),
      onProgress: (progress) => this.handleAsyncTrace(attempt, {
        type: 'scene-progress',
        progress,
        sceneId: attempt.from,
        attemptId: attempt.attemptId,
        epoch: attempt.epoch
      })
    });
    if (!this.isAttemptCurrent(attempt)) return { completed: false, stale: true };
    if (!isCompletedResult(playResult)) {
      await this.recoverAttempt(attempt, playResult?.reason || 'scene-play-cancelled');
      return playResult;
    }
    this.ownership.release('scene', owner, 'scene-play-complete');

    const transitionResult = await this.runTransitionAttempt(attempt, owner);
    return {
      completed: isCompletedResult(transitionResult),
      scenePlay: playResult,
      transition: transitionResult
    };
  }

  async runReadAttempt(attempt) {
    this.setState(RUNTIME_STATES.PRESENTING, {
      attemptId: attempt.attemptId,
      target: attempt.step.to,
      reason: 'reading-boundary'
    });
    await this.ensureAdapter(attempt.step.to);
    this.presentation.present(attempt.step.to, 'reading-boundary');
    return { completed: true, kind: 'read' };
  }

  async runPresentAttempt(attempt) {
    this.setState(RUNTIME_STATES.PRESENTING, {
      attemptId: attempt.attemptId,
      target: attempt.step.to,
      reason: 'present-route'
    });
    await this.ensureAdapter(attempt.step.to);
    this.presentation.present(attempt.step.to, 'present-route');
    return { completed: true, kind: 'present' };
  }

  async prepareTransitionTarget(attempt) {
    if (!attempt?.step?.to) return null;
    const adapter = await this.ensureAdapter(attempt.step.to);
    await adapter.showPoster({
      direction: attempt.direction < 0 ? 'reverse' : 'forward',
      timeoutMs: this.timeouts.scene
    });
    this.record('target-poster-ready', {
      attemptId: attempt.attemptId,
      from: attempt.from,
      to: attempt.step.to,
      segmentId: attempt.step.segmentId,
      direction: attempt.direction
    });
    return adapter;
  }

  handleSceneTrace(attempt, entry) {
    if (!this.isAttemptCurrent(attempt)) {
      this.record('stale-callback', {
        attemptId: attempt.attemptId,
        epoch: attempt.epoch,
        entry
      });
      return;
    }
    this.handleAsyncTrace(attempt, {
      ...entry,
      attemptId: attempt.attemptId,
      epoch: attempt.epoch
    });
    if (entry.type !== 'milestone') return;
    const mapping = this.registry.resolveMilestone(attempt.from, entry.milestone);
    if (!mapping) return;
    this.presentation.presentEarlyCopy(mapping.revealSceneId, entry.milestone);
  }

  handleAsyncTrace(attempt, entry) {
    if (!this.isAttemptCurrent(attempt)) {
      this.record('stale-callback', {
        attemptId: attempt.attemptId,
        epoch: attempt.epoch,
        entry
      });
      return false;
    }
    this.record('async-callback', {
      attemptId: attempt.attemptId,
      epoch: attempt.epoch,
      entry: {
        ...entry,
        attemptId: entry.attemptId ?? attempt.attemptId,
        epoch: entry.epoch ?? attempt.epoch
      }
    });
    return true;
  }

  isAttemptCurrent(attempt) {
    return Boolean(
      attempt
      && this.activeAttempt
      && this.activeAttempt.attemptId === attempt.attemptId
      && this.activeAttempt.epoch === attempt.epoch
      && this.epoch === attempt.epoch
    );
  }

  async recoverAttempt(attempt, reason = 'recover') {
    if (!attempt) return this.snapshot();
    this.registerFailureCooldown(attempt, reason);
    this.presentation.clearEarlyCopy(reason);
    const adapter = await this.ensureAdapter(attempt.from);
    await this.cleanupSourceAdapter(adapter, attempt, reason);
    this.presentation.present(attempt.from, reason);
    this.activateStableScene(attempt.from, reason).catch((error) => {
      this.record('stable-scene-activation-failed', {
        sceneId: attempt.from,
        reason,
        error: error.message
      });
    });
    this.record('recover', {
      attemptId: attempt.attemptId,
      from: attempt.from,
      reason
    });
    return this.snapshot();
  }

  async cleanupSourceAdapter(adapter, attempt, reason = 'cleanup-source') {
    if (!adapter) return null;
    let result = null;
    try {
      if (attempt?.step?.kind === 'scene-play') {
        result = await adapter.cancelToSource({ timeoutMs: this.timeouts.scene });
      } else {
        result = await adapter.showPoster({ direction: 'reverse', timeoutMs: this.timeouts.scene });
      }
      this.record('source-cleanup', {
        attemptId: attempt?.attemptId,
        sceneId: attempt?.from,
        reason,
        result
      });
    } catch (error) {
      this.record('source-cleanup-failed', {
        attemptId: attempt?.attemptId,
        sceneId: attempt?.from,
        reason,
        error: error.message
      });
    }
    return result;
  }

  async reverse(reason = 'reverse') {
    if (this.state === RUNTIME_STATES.ARMED) {
      return this.cancelArmed(reason);
    }
    if (!this.activeAttempt) return this.snapshot();
    const attempt = this.activeAttempt;
    this.activeAttempt = null;
    this.epoch += 1;
    attempt.controller.abort(new Error(reason));
    this.presentation.clearEarlyCopy(reason);
    const adapter = await this.ensureAdapter(attempt.from);
    await this.cleanupSourceAdapter(adapter, attempt, reason);
    this.presentation.present(attempt.from, reason);
    this.activateStableScene(attempt.from, reason).catch((error) => {
      this.record('stable-scene-activation-failed', {
        sceneId: attempt.from,
        reason,
        error: error.message
      });
    });
    this.ownership.releaseOwner(`attempt:${attempt.attemptId}`, reason);
    this.setState(RUNTIME_STATES.IDLE, {
      attemptId: attempt.attemptId,
      reason
    });
    return this.snapshot();
  }

  async handleReadInput(input = {}) {
    const current = this.current();
    const step = this.routeStep(current);
    if (step.kind !== 'read') return { type: 'not-reading' };
    const result = this.readMonitor.input(input);
    if (result.type !== 'next') return result;
    const attempt = this.armNext({ direction: 1, source: 'read-monitor' });
    await this.runArmed(attempt);
    return result;
  }

  async activateStableScene(sceneId, reason = 'stable-scene') {
    if (!sceneId || !this.stableScenePlayers.has(sceneId)) return null;
    if (this.stableSceneCompleted.has(sceneId)) return null;
    if (this.stableScenePlayback.has(sceneId)) return this.stableScenePlayback.get(sceneId).promise;

    const adapter = await this.ensureAdapter(sceneId);
    const epoch = this.epoch;
    const owner = `stable-scene:${sceneId}:${epoch}`;
    const controller = new AbortController();
    const playback = {
      sceneId,
      epoch,
      controller,
      promise: null
    };
    this.stableScenePlayback.set(sceneId, playback);
    this.ownership.claim('stable-scene', owner, { sceneId, reason, epoch });
    this.record('stable-scene-play-start', { sceneId, reason, epoch });

    playback.promise = adapter.playForward({
      timeoutMs: this.timeouts.scene,
      signal: controller.signal,
      onTrace: (entry) => {
        if (this.current() !== sceneId || this.epoch !== epoch) return;
        this.record('stable-scene-player-trace', { sceneId, entry, reason });
      },
      onProgress: (progress) => {
        if (this.current() !== sceneId || this.epoch !== epoch) return;
        this.record('stable-scene-player-progress', { sceneId, progress });
      }
    }).then((result) => {
      if (this.stableScenePlayback.get(sceneId) === playback && isCompletedResult(result)) {
        this.stableSceneCompleted.add(sceneId);
        this.record('stable-scene-play-complete', { sceneId, reason, epoch });
      }
      return result;
    }).catch(async (error) => {
      if (this.stableScenePlayback.get(sceneId) !== playback) {
        this.record('stable-scene-play-aborted', { sceneId, reason, epoch, error: error.message });
        return null;
      }
      this.record('stable-scene-play-failed', { sceneId, reason, epoch, error: error.message });
      await adapter.cancelToSource?.({ timeoutMs: this.timeouts.scene }).catch(() => null);
      return null;
    }).finally(() => {
      if (this.stableScenePlayback.get(sceneId) === playback) this.stableScenePlayback.delete(sceneId);
      this.ownership.releaseOwner(owner, 'stable-scene-finally');
    });

    return playback.promise;
  }

  async cancelStableScenePlayback(sceneId, reason = 'stable-scene-cancel') {
    const playback = this.stableScenePlayback.get(sceneId);
    if (!playback) return null;
    this.stableScenePlayback.delete(sceneId);
    playback.controller.abort(new Error(reason));
    const adapter = this.adapters.get(sceneId);
    const result = await adapter?.cancelToSource?.({ timeoutMs: this.timeouts.scene }).catch((error) => {
      this.record('stable-scene-cancel-failed', {
        sceneId,
        reason,
        error: error.message
      });
      return null;
    });
    this.record('stable-scene-play-cancelled', { sceneId, reason });
    return result;
  }
}

export function createSceneRuntimeCore(options = {}) {
  return new SceneRuntimeCore(options);
}
