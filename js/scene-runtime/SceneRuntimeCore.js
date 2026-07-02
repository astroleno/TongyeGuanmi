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
    kind: 'transition',
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

function isCompletedResult(result) {
  if (result?.cancelled) return false;
  if (result?.completed === false) return false;
  return true;
}

function failureReason(error, fallback = 'failed') {
  return error?.name?.includes('Timeout') ? 'timeout' : fallback;
}

export class SceneRuntimeCore {
  constructor({
    registry,
    route = DEFAULT_RUNTIME_ROUTE,
    presentation = new Presentation(),
    scrollIntent = new ScrollIntent(),
    readMonitor = new ReadMonitor(),
    transitionPlayer = new TransitionSegmentPlayer(),
    ownership = new LayerOwnership(),
    hosts = new Map(),
    timeouts = {}
  } = {}) {
    if (!registry) throw new Error('SceneRuntimeCore requires a registry');
    this.registry = registry;
    this.route = route;
    this.presentation = presentation;
    this.scrollIntent = scrollIntent;
    this.readMonitor = readMonitor;
    this.transitionPlayer = transitionPlayer;
    this.ownership = ownership;
    this.hosts = hosts instanceof Map ? hosts : new Map(Object.entries(hosts));
    this.timeouts = {
      transition: 1000,
      scene: 1000,
      ...timeouts
    };
    this.adapters = new Map();
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
      scrollIntent: this.scrollIntent.snapshot(),
      readMonitor: this.readMonitor.snapshot(),
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
    return this.snapshot();
  }

  current() {
    return this.presentation.snapshot().current;
  }

  routeStep(sceneId = this.current()) {
    const step = this.route[sceneId];
    if (!step) throw new Error(`No runtime route step for ${sceneId}`);
    return step;
  }

  createAttempt({ direction = 1, source = 'intent' } = {}) {
    const from = this.current();
    const step = this.routeStep(from);
    this.epoch += 1;
    const attempt = {
      attemptId: ++this.attemptSequence,
      epoch: this.epoch,
      direction,
      source,
      from,
      step,
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
      this.armNext({
        direction: result.direction,
        source: event.type || 'scroll'
      });
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
      if (attempt.step.kind === 'read') {
        return await this.runReadAttempt(attempt, owner);
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
    this.presentation.clearEarlyCopy(reason);
    const adapter = await this.ensureAdapter(attempt.from);
    await this.cleanupSourceAdapter(adapter, attempt, reason);
    this.presentation.present(attempt.from, reason);
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
}

export function createSceneRuntimeCore(options = {}) {
  return new SceneRuntimeCore(options);
}
