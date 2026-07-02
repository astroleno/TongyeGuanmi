import { createAodScenePlayer } from '../scene-harness/aod-scene-player.js';
import { createHeroScenePlayer } from '../scene-harness/hero-scene-player.js';
import { createPatternScenePlayer } from '../scene-harness/pattern-scene-player.js';
import { createStarmapScenePlayer } from '../scene-harness/starmap-scene-player.js';
import { createScenePlayerAdapter } from './ScenePlayerAdapter.js';

export const sceneProviderManifest = Object.freeze([
  Object.freeze({
    sceneId: 'hero',
    label: 'Hero',
    createPlayer: createHeroScenePlayer,
    milestones: Object.freeze({})
  }),
  Object.freeze({
    sceneId: 'pattern',
    label: 'Pattern',
    createPlayer: createPatternScenePlayer,
    milestones: Object.freeze({})
  }),
  Object.freeze({
    sceneId: 'star-map',
    label: 'Star map',
    createPlayer: createStarmapScenePlayer,
    milestones: Object.freeze({})
  }),
  Object.freeze({
    sceneId: 'aod-animation',
    label: 'AOD animation',
    createPlayer: createAodScenePlayer,
    milestones: Object.freeze({
      'early-copy-ready': Object.freeze({
        revealSceneId: 'method-top',
        atProgress: 0.8
      })
    })
  })
]);

export class SceneRegistry {
  constructor(entries = []) {
    this.entries = new Map();
    entries.forEach((entry) => this.register(entry));
  }

  register(entry) {
    if (!entry?.sceneId) throw new Error('SceneRegistry.register() requires sceneId');
    if (typeof entry.createPlayer !== 'function') {
      throw new Error(`SceneRegistry entry ${entry.sceneId} requires createPlayer()`);
    }
    this.entries.set(entry.sceneId, {
      ...entry,
      milestones: { ...(entry.milestones || {}) }
    });
    return this;
  }

  has(sceneId) {
    return this.entries.has(sceneId);
  }

  get(sceneId) {
    const entry = this.entries.get(sceneId);
    if (!entry) throw new Error(`Unknown scene provider: ${sceneId}`);
    return entry;
  }

  listSceneIds() {
    return [...this.entries.keys()];
  }

  createAdapter(sceneId, options = {}) {
    const entry = this.get(sceneId);
    return createScenePlayerAdapter({
      sceneId,
      createPlayer: entry.createPlayer,
      manifest: entry,
      timeouts: entry.timeouts,
      ...options
    });
  }

  resolveMilestone(sceneId, milestone) {
    return this.get(sceneId).milestones?.[milestone] || null;
  }

  toJSON() {
    return this.listSceneIds().map((sceneId) => {
      const entry = this.get(sceneId);
      return {
        sceneId,
        label: entry.label,
        milestones: entry.milestones
      };
    });
  }
}

export function createDefaultSceneRegistry() {
  return new SceneRegistry(sceneProviderManifest);
}
