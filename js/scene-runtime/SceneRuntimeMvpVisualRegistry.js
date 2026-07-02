import { createAodScenePlayer } from '../scene-harness/aod-scene-player.js';
import { createHeroScenePlayer } from '../scene-harness/hero-scene-player.js';
import { createPatternScenePlayer } from '../scene-harness/pattern-scene-player.js';
import { createStarmapScenePlayer } from '../scene-harness/starmap-scene-player.js';
import { SceneRegistry } from './SceneRegistry.js';
import { DOM_SHELL_SCENE_IDS } from './SceneRuntimeSceneIds.js';

const STATIC_SCENE_SOURCES = Object.freeze({
  'method-top': Object.freeze({
    selector: '.chapter-intro--method',
    label: 'Method top',
    copy: '先看懂，再用上。'
  }),
  'method-bottom': Object.freeze({
    selector: '.method-flow',
    label: 'Method bottom',
    copy: '同野观幂 AI 落地五步'
  }),
  'method-proof': Object.freeze({
    selector: '.homepage-scene--method-proof',
    label: 'Method proof',
    copy: '用不上，不算落地。'
  }),
  brand: Object.freeze({
    selector: '#brand',
    label: 'Brand',
    copy: '同野观幂'
  }),
  services: Object.freeze({
    selector: '#services',
    label: 'Services',
    copy: '服务'
  }),
  lab: Object.freeze({
    selector: '#lab',
    label: 'Lab',
    copy: '实验室'
  }),
  education: Object.freeze({
    selector: '#education',
    label: 'Education',
    copy: '留学'
  }),
  philosophy: Object.freeze({
    selector: '#philosophy',
    label: 'Philosophy',
    copy: '理念'
  }),
  contact: Object.freeze({
    selector: '#contact',
    label: 'Contact',
    copy: '联系'
  }),
  'figure2-animation': Object.freeze({
    label: 'Figure 2',
    copy: 'Figure 2 placeholder'
  }),
  'figure3-animation': Object.freeze({
    label: 'Figure 3',
    copy: 'Figure 3 placeholder'
  }),
  'crane-animation': Object.freeze({
    label: 'Crane',
    copy: 'Crane placeholder'
  })
});

function cloneSourceForScene(documentRef, sceneId) {
  const source = STATIC_SCENE_SOURCES[sceneId];
  const template = source?.selector ? documentRef.querySelector?.(source.selector) : null;
  if (template?.cloneNode) {
    const clone = template.cloneNode(true);
    clone.removeAttribute?.('id');
    clone.setAttribute?.('data-static-scene-source', sceneId);
    clone.hidden = false;
    clone.setAttribute?.('aria-hidden', 'false');
    return clone;
  }

  const fallback = documentRef.createElement('div');
  fallback.setAttribute('data-static-scene-source', sceneId);
  fallback.className = 'scene-runtime-static-copy';
  fallback.textContent = source?.copy || sceneId;
  return fallback;
}

export class StaticDomScenePlayer {
  constructor({ sceneId } = {}) {
    this.sceneId = sceneId;
    this.host = null;
    this.phase = 'idle';
    this.calls = [];
  }

  remember(methodName, signal) {
    if (!(signal instanceof AbortSignal)) {
      throw new Error(`${this.sceneId}.${methodName} requires AbortSignal`);
    }
    this.calls.push(methodName);
  }

  setPhase(phase) {
    this.phase = phase;
    if (this.host?.dataset) {
      this.host.dataset.staticSceneId = this.sceneId;
      this.host.dataset.staticScenePhase = phase;
    }
  }

  async mount({ host, signal } = {}) {
    this.remember('mount', signal);
    this.host = host;
    const documentRef = host?.ownerDocument || globalThis.document;
    host.replaceChildren?.(cloneSourceForScene(documentRef, this.sceneId));
    this.setPhase('mounted');
    return { completed: true };
  }

  async showPoster({ signal } = {}) {
    this.remember('showPoster', signal);
    this.setPhase('poster');
    return { completed: true };
  }

  async playForward({ signal } = {}) {
    this.remember('playForward', signal);
    this.setPhase('stable');
    return { completed: true };
  }

  async cancelToSource({ signal } = {}) {
    this.remember('cancelToSource', signal);
    this.setPhase('poster');
    return { completed: false, cancelled: true };
  }

  async reverseToPoster({ signal } = {}) {
    this.remember('reverseToPoster', signal);
    this.setPhase('poster');
    return { completed: true };
  }

  async destroy({ signal } = {}) {
    this.remember('destroy', signal);
    this.setPhase('destroyed');
    this.host = null;
    return this.getState();
  }

  getState() {
    return {
      phase: this.phase,
      sceneId: this.sceneId,
      calls: this.calls.slice()
    };
  }
}

function createStaticDomScenePlayer({ sceneId } = {}) {
  return new StaticDomScenePlayer({ sceneId });
}

export function createSceneRuntimeMvpVisualRegistry({
  playerFactories = {},
  onCreatePlayer = null
} = {}) {
  const instances = new Map();
  const visualFactories = {
    hero: playerFactories.hero || createHeroScenePlayer,
    pattern: playerFactories.pattern || createPatternScenePlayer,
    'star-map': playerFactories['star-map'] || createStarmapScenePlayer,
    'aod-animation': playerFactories['aod-animation'] || createAodScenePlayer
  };

  const entries = DOM_SHELL_SCENE_IDS.map((sceneId) => {
    const createVisualPlayer = visualFactories[sceneId];
    return {
      sceneId,
      label: sceneId,
      providerKind: createVisualPlayer ? 'mvp-visual' : 'static-dom',
      createPlayer() {
        const player = createVisualPlayer
          ? createVisualPlayer()
          : createStaticDomScenePlayer({ sceneId });
        instances.set(sceneId, player);
        onCreatePlayer?.(sceneId, player);
        return player;
      },
      milestones: sceneId === 'aod-animation'
        ? {
            'early-copy-ready': {
              revealSceneId: 'method-top',
              atProgress: 0.8
            }
          }
        : {}
    };
  });

  return {
    registry: new SceneRegistry(entries),
    instances
  };
}
