import { SceneRegistry } from './SceneRegistry.js';

export const DOM_SHELL_SCENE_IDS = Object.freeze([
  'hero',
  'pattern',
  'star-map',
  'aod-animation',
  'method-top',
  'method-bottom',
  'method-proof',
  'brand',
  'services',
  'lab',
  'education',
  'philosophy',
  'contact',
  'figure2-animation',
  'figure3-animation',
  'crane-animation'
]);

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
      return;
    }

    const timer = setTimeout(resolve, Math.max(0, ms));
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function assertSignal(signal, sceneId, methodName) {
  if (!(signal instanceof AbortSignal)) {
    throw new Error(`${sceneId}.${methodName} requires AbortSignal`);
  }
}

function createElement(host, tagName) {
  const documentRef = host?.ownerDocument || globalThis.document;
  if (!documentRef?.createElement) {
    throw new Error('Fake DOM scene provider requires a DOM-like host');
  }
  return documentRef.createElement(tagName);
}

export class FakeDomScenePlayer {
  constructor({
    sceneId,
    playDelayMs = 24,
    rejectPlay = false,
    rejectAfterMilestone = false,
    neverResolve = false,
    milestone = null
  } = {}) {
    if (!sceneId) throw new Error('FakeDomScenePlayer requires sceneId');
    this.sceneId = sceneId;
    this.playDelayMs = playDelayMs;
    this.rejectPlay = rejectPlay;
    this.rejectAfterMilestone = rejectAfterMilestone;
    this.neverResolve = neverResolve;
    this.milestone = milestone;
    this.phase = 'idle';
    this.host = null;
    this.calls = [];
  }

  remember(methodName, signal) {
    assertSignal(signal, this.sceneId, methodName);
    this.calls.push([methodName, true]);
  }

  setHostState(phase) {
    this.phase = phase;
    if (this.host?.dataset) {
      this.host.dataset.providerScene = this.sceneId;
      this.host.dataset.providerPhase = phase;
    }
  }

  async mount({ host, signal, onTrace } = {}) {
    this.remember('mount', signal);
    this.host = host;
    this.setHostState('mounted');

    let marker = host.querySelector?.('[data-fake-scene-content]');
    if (!marker) {
      marker = createElement(host, 'div');
      marker.setAttribute('data-fake-scene-content', '');
      host.appendChild(marker);
    }
    marker.setAttribute('data-provider-scene-id', this.sceneId);
    marker.textContent = this.sceneId;

    onTrace?.({ type: 'mounted', sceneId: this.sceneId });
    return { completed: true };
  }

  async showPoster({ signal, onTrace } = {}) {
    this.remember('showPoster', signal);
    this.setHostState('poster');
    onTrace?.({ type: 'poster', sceneId: this.sceneId });
    return { completed: true };
  }

  async playForward({ signal, onTrace, onProgress } = {}) {
    this.remember('playForward', signal);
    this.setHostState('playing-forward');
    onTrace?.({ type: 'playing-forward', sceneId: this.sceneId });

    if (this.rejectPlay) throw new Error(`${this.sceneId} rejected`);
    if (this.neverResolve && !this.milestone) return new Promise(() => {});

    if (this.milestone) {
      await delay(Math.max(1, Math.floor(this.playDelayMs * 0.8)), signal);
      onProgress?.(0.8);
      onTrace?.({
        type: 'milestone',
        milestone: this.milestone,
        sceneId: this.sceneId,
        progress: 0.8
      });
      if (this.rejectAfterMilestone) {
        throw new Error(`${this.sceneId} rejected after milestone`);
      }
    }

    if (this.neverResolve) return new Promise(() => {});

    await delay(Math.max(1, Math.floor(this.playDelayMs * 0.2)), signal);
    onProgress?.(1);
    onTrace?.({ type: 'complete', sceneId: this.sceneId });
    this.setHostState('stable');
    onTrace?.({ type: 'stable', sceneId: this.sceneId });
    return { completed: true };
  }

  async cancelToSource({ signal, onTrace } = {}) {
    this.remember('cancelToSource', signal);
    this.setHostState('poster');
    onTrace?.({ type: 'poster', reason: 'cancel-to-source', sceneId: this.sceneId });
    return { completed: false, cancelled: true };
  }

  async reverseToPoster({ signal, onTrace } = {}) {
    this.remember('reverseToPoster', signal);
    this.setHostState('poster');
    onTrace?.({ type: 'poster', reason: 'reverse-to-poster', sceneId: this.sceneId });
    return { completed: true };
  }

  async destroy({ signal, onTrace } = {}) {
    this.remember('destroy', signal);
    this.setHostState('destroyed');
    onTrace?.({ type: 'destroyed', sceneId: this.sceneId });
    return { completed: true };
  }

  getState() {
    return {
      phase: this.phase,
      sceneId: this.sceneId,
      calls: this.calls.slice()
    };
  }
}

export function createFakeDomScenePlayer(options = {}) {
  return new FakeDomScenePlayer(options);
}

export function createFakeDomSceneRegistry(overrides = {}) {
  const instances = new Map();
  const entries = DOM_SHELL_SCENE_IDS.map((sceneId) => ({
    sceneId,
    label: sceneId,
    createPlayer() {
      const player = createFakeDomScenePlayer({
        sceneId,
        milestone: sceneId === 'aod-animation' ? 'early-copy-ready' : null,
        ...(overrides[sceneId] || {})
      });
      instances.set(sceneId, player);
      return player;
    },
    timeouts: overrides[sceneId]?.timeouts,
    milestones: sceneId === 'aod-animation'
      ? {
          'early-copy-ready': {
            revealSceneId: 'method-top',
            atProgress: 0.8
          }
        }
      : {}
  }));

  return {
    registry: new SceneRegistry(entries),
    instances
  };
}
