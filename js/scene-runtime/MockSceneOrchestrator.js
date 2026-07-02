import { createDefaultSceneRegistry } from './SceneRegistry.js';

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
      this.currentSceneId = sceneId;
      return result;
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
      this.currentSceneId = sceneId;
      return result;
    } finally {
      if (this.activePlayerSceneId === sceneId) this.activePlayerSceneId = null;
    }
  }

  destroy() {
    for (const [sceneId, adapter] of this.adapters) {
      adapter.destroy({
        onTrace: (entry) => this.handleTrace(sceneId, entry)
      });
    }
    this.adapters.clear();
    this.activePlayerSceneId = null;
    this.currentSceneId = null;
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
}

export function createMockSceneOrchestrator(options = {}) {
  return new MockSceneOrchestrator(options);
}
