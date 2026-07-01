import { createLayerOwnershipRegistry } from './layer-ownership.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

export function createPresentationController({
  initialSceneId = null,
  layerOwnership = createLayerOwnershipRegistry({ mode: 'production' }),
  onCommit = null
} = {}) {
  const state = {
    currentSceneId: initialSceneId,
    copyState: null,
    earlyCopySceneId: null,
    navState: null,
    hash: null,
    focusTarget: null,
    posterSceneId: null,
    ariaState: null
  };
  const commits = [];

  function commit(kind, patch) {
    Object.assign(state, patch);
    const record = { kind, patch: clone(patch), state: clone(state) };
    commits.push(record);
    onCommit?.(record);
    return clone(state);
  }

  function present(sceneId, {
    copyState = { sceneId, state: 'final' },
    navState = { activeSceneId: sceneId },
    hash = null,
    focusTarget = null,
    posterSceneId = sceneId,
    ariaState = { sceneId, current: true },
    reason = 'present'
  } = {}) {
    layerOwnership.claim({ layer: 'scene-state', owner: 'Presentation', token: sceneId });
    layerOwnership.claim({ layer: 'copy', owner: 'Presentation', token: sceneId });
    layerOwnership.claim({ layer: 'nav/hash/focus', owner: 'Presentation', token: sceneId });
    return commit('present', {
      currentSceneId: sceneId,
      copyState,
      earlyCopySceneId: null,
      navState,
      hash,
      focusTarget,
      posterSceneId,
      ariaState,
      reason
    });
  }

  function presentEarlyCopy({ targetScene, copyState = { sceneId: targetScene, state: 'early' } } = {}) {
    if (!targetScene) throw new Error('presentEarlyCopy requires targetScene');
    layerOwnership.claim({ layer: 'copy', owner: 'Presentation', token: `early:${targetScene}` });
    return commit('presentEarlyCopy', {
      copyState,
      earlyCopySceneId: targetScene
    });
  }

  function markPoster(sceneId) {
    layerOwnership.claim({ layer: 'scene-state', owner: 'Presentation', token: `poster:${sceneId}` });
    return commit('poster', { posterSceneId: sceneId });
  }

  return {
    present,
    presentEarlyCopy,
    markPoster,
    getState: () => clone(state),
    getCommits: () => commits.map(clone)
  };
}

export function createPlayerRuntimePort({
  reportProgress = () => {},
  reportReady = () => {},
  reportError = () => {},
  claimLayer = () => {}
} = {}) {
  return Object.freeze({
    reportProgress,
    reportReady,
    reportError,
    claimLayer
  });
}
