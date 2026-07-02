import { createDefaultSceneRegistry } from './SceneRegistry.js';

function isCompletedResult(result) {
  if (result?.cancelled) return false;
  if (result?.completed === false) return false;
  return true;
}

function playFailureReason(error) {
  return error?.name === 'SceneAdapterTimeoutError'
    ? 'play-forward-timeout'
    : 'play-forward-failed';
}

export class MockSceneOrchestrator {
  constructor({
    registry = createDefaultSceneRegistry(),
    hosts = new Map()
  } = {}) {
    this.registry = registry;
    this.hosts = hosts instanceof Map ? hosts : new Map(Object.entries(hosts));
    this.adapters = new Map();
    this.currentSceneId = null;
    this.activePlayerSceneId = null;
    this.trace = [];
    this.reveals = [];
  }

  getState() {
    return {
      currentSceneId: this.currentSceneId,
      activePlayerSceneId: this.activePlayerSceneId,
      trace: this.trace.slice(),
      reveals: this.reveals.slice(),
      mountedSceneIds: [...this.adapters.keys()]
    };
  }

  hostFor(sceneId, explicitHost = null) {
    if (explicitHost) return explicitHost;
    if (this.hosts.has(sceneId)) return this.hosts.get(sceneId);
    const host = { sceneId, children: [] };
    this.hosts.set(sceneId, host);
    return host;
  }

  adapterFor(sceneId) {
    const adapter = this.adapters.get(sceneId);
    if (!adapter) throw new Error(`Scene ${sceneId} is not mounted`);
    return adapter;
  }

  async mount(sceneId, { host, signal } = {}) {
    const adapter = this.registry.createAdapter(sceneId);
    this.adapters.set(sceneId, adapter);
    await adapter.mount({
      host: this.hostFor(sceneId, host),
      signal,
      onTrace: (entry) => this.handleTrace(sceneId, entry)
    });
    this.currentSceneId = sceneId;
    return adapter.getState();
  }

  async showPoster(sceneId = this.currentSceneId, { direction = 'forward', signal } = {}) {
    const adapter = this.adapterFor(sceneId);
    await adapter.showPoster({
      direction,
      signal,
      onTrace: (entry) => this.handleTrace(sceneId, entry)
    });
    this.currentSceneId = sceneId;
    return adapter.getState();
  }

  async playForward(sceneId = this.currentSceneId, { signal } = {}) {
    if (this.activePlayerSceneId) {
      throw new Error(`Active player already running: ${this.activePlayerSceneId}`);
    }
    const adapter = this.adapterFor(sceneId);
    this.activePlayerSceneId = sceneId;
    try {
      const result = await adapter.playForward({
        signal,
        onTrace: (entry) => this.handleTrace(sceneId, entry),
        onProgress: (progress) => this.handleProgress(sceneId, progress)
      });
      if (isCompletedResult(result)) {
        this.currentSceneId = sceneId;
      } else {
        this.clearReveals(sceneId, result?.reason || 'play-forward-failed');
      }
      return result;
    } catch (error) {
      this.clearReveals(sceneId, playFailureReason(error));
      throw error;
    } finally {
      if (this.activePlayerSceneId === sceneId) this.activePlayerSceneId = null;
    }
  }

  async cancelActiveToSource({ signal } = {}) {
    const sceneId = this.activePlayerSceneId;
    if (!sceneId) return null;
    const adapter = this.adapterFor(sceneId);
    try {
      return await adapter.cancelToSource({
        signal,
        onTrace: (entry) => this.handleTrace(sceneId, entry)
      });
    } finally {
      this.clearReveals(sceneId, 'cancel-to-source');
      if (this.activePlayerSceneId === sceneId) this.activePlayerSceneId = null;
    }
  }

  async reverseToPoster(sceneId = this.currentSceneId, { signal } = {}) {
    if (this.activePlayerSceneId && this.activePlayerSceneId !== sceneId) {
      throw new Error(`Active player already running: ${this.activePlayerSceneId}`);
    }
    const adapter = this.adapterFor(sceneId);
    if (!this.activePlayerSceneId) this.activePlayerSceneId = sceneId;
    try {
      const result = await adapter.reverseToPoster({
        signal,
        onTrace: (entry) => this.handleTrace(sceneId, entry)
      });
      this.clearReveals(sceneId, 'reverse-to-poster');
      this.currentSceneId = sceneId;
      return result;
    } finally {
      if (this.activePlayerSceneId === sceneId) this.activePlayerSceneId = null;
    }
  }

  async destroy() {
    for (const [sceneId, adapter] of this.adapters) {
      await adapter.destroy({
        onTrace: (entry) => this.handleTrace(sceneId, entry)
      });
    }
    this.adapters.clear();
    this.activePlayerSceneId = null;
    this.currentSceneId = null;
    this.reveals = [];
    return this.getState();
  }

  handleProgress(sceneId, progress) {
    this.trace.push({
      type: 'progress',
      sceneId,
      progress
    });
  }

  handleTrace(sceneId, entry) {
    const normalized = { sceneId, ...entry };
    this.trace.push(normalized);

    if (entry.type !== 'milestone') return;
    const mapping = this.registry.resolveMilestone(sceneId, entry.milestone);
    if (!mapping) return;
    this.reveals.push({
      sceneId,
      milestone: entry.milestone,
      revealSceneId: mapping.revealSceneId,
      atProgress: mapping.atProgress
    });
  }

  clearReveals(sceneId, reason) {
    const removed = this.reveals.filter((entry) => entry.sceneId === sceneId);
    if (removed.length === 0) return;
    this.reveals = this.reveals.filter((entry) => entry.sceneId !== sceneId);
    this.trace.push({
      type: 'reveal-clear',
      sceneId,
      reason,
      removed
    });
  }
}

export function createMockSceneOrchestrator(options = {}) {
  return new MockSceneOrchestrator(options);
}
