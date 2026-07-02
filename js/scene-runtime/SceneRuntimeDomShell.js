import { LayerOwnership } from './LayerOwnership.js';
import { Presentation } from './Presentation.js';
import { ReadMonitor } from './ReadMonitor.js';
import { SceneRuntimeCore, RUNTIME_STATES } from './SceneRuntimeCore.js';
import { ScrollIntent } from './ScrollIntent.js';
import {
  DOM_SHELL_SCENE_IDS,
  createFakeDomSceneRegistry
} from './FakeDomSceneProvider.js';
import { createFakeDomTransitionPlayer } from './FakeDomTransitionPlayer.js';

const LAYERS = Object.freeze([
  'source',
  'target',
  'transition',
  'early-copy',
  'debug'
]);

function dataSelector(name, value = null) {
  return value === null
    ? `[data-${name}]`
    : `[data-${name}="${value}"]`;
}

function createElement(documentRef, tagName) {
  if (!documentRef?.createElement) {
    throw new Error('SceneRuntimeDomShell requires a DOM-like document');
  }
  return documentRef.createElement(tagName);
}

function setBooleanDataset(element, name, value) {
  if (!element?.dataset) return;
  element.dataset[name] = value ? 'true' : 'false';
}

export class SceneRuntimeDomShell {
  constructor({
    documentRef = globalThis.document,
    root = null,
    sceneIds = DOM_SHELL_SCENE_IDS,
    registry = null,
    transitionPlayer = null,
    runtime = null,
    providerOverrides = {},
    transition = {},
    timeouts = {},
    failureCooldownMs = 420,
    clock = globalThis.performance
  } = {}) {
    this.document = documentRef;
    this.root = root;
    this.sceneIds = sceneIds.slice();
    this.registryBundle = registry ? { registry, instances: new Map() } : createFakeDomSceneRegistry(providerOverrides);
    this.registry = this.registryBundle.registry;
    this.providerInstances = this.registryBundle.instances;
    this.transitionPlayer = transitionPlayer || createFakeDomTransitionPlayer(transition);
    this.runtime = runtime;
    this.timeouts = timeouts;
    this.failureCooldownMs = failureCooldownMs;
    this.clock = clock;
    this.hosts = new Map();
    this.layers = new Map();
    this.mounted = false;
    this.hooksInstalled = false;
    this.unlisten = [];
  }

  static isEnabledFromUrl(urlLike) {
    const url = urlLike instanceof URL ? urlLike : new URL(String(urlLike), 'http://localhost/');
    return url.searchParams.get('sceneRuntime') === '1' || url.searchParams.get('scene-runtime') === '1';
  }

  queryRoot() {
    return this.document.querySelector?.(dataSelector('scene-runtime-shell')) || null;
  }

  ensureRoot() {
    if (this.root) return this.root;
    this.root = this.queryRoot();
    if (!this.root) {
      this.root = createElement(this.document, 'div');
      this.root.setAttribute('data-scene-runtime-shell', '');
      this.root.setAttribute('aria-hidden', 'true');
      this.document.body.appendChild(this.root);
    }
    return this.root;
  }

  ensureLayer(layerId) {
    if (this.layers.has(layerId)) return this.layers.get(layerId);
    const root = this.ensureRoot();
    let layer = root.querySelector?.(dataSelector('runtime-layer', layerId));
    if (!layer) {
      layer = createElement(this.document, 'div');
      layer.setAttribute('data-runtime-layer', layerId);
      root.appendChild(layer);
    }
    this.layers.set(layerId, layer);
    return layer;
  }

  ensureSceneHost(sceneId) {
    if (this.hosts.has(sceneId)) return this.hosts.get(sceneId);
    const sourceLayer = this.ensureLayer('source');
    let host = sourceLayer.querySelector?.(dataSelector('scene-id', sceneId));
    if (!host) {
      host = createElement(this.document, 'section');
      host.setAttribute('data-scene-id', sceneId);
      host.setAttribute('data-scene-visible', 'false');
      host.setAttribute('aria-hidden', 'true');
      host.hidden = true;
      sourceLayer.appendChild(host);
    }
    this.hosts.set(sceneId, host);
    return host;
  }

  createRuntime() {
    return new SceneRuntimeCore({
      registry: this.registry,
      presentation: new Presentation(),
      scrollIntent: new ScrollIntent({ viewportHeight: 1000, clock: this.clock }),
      readMonitor: new ReadMonitor({ viewportHeight: 1000 }),
      transitionPlayer: this.transitionPlayer,
      ownership: new LayerOwnership(),
      hosts: this.hosts,
      timeouts: {
        transition: 120,
        scene: 120,
        ...this.timeouts
      },
      failureCooldownMs: this.failureCooldownMs,
      clock: this.clock
    });
  }

  mount() {
    if (this.mounted) return this;
    this.ensureRoot();
    LAYERS.forEach((layerId) => this.ensureLayer(layerId));
    this.sceneIds.forEach((sceneId) => this.ensureSceneHost(sceneId));
    this.transitionPlayer.setLayer?.(this.layers.get('transition'));
    if (!this.runtime) this.runtime = this.createRuntime();
    this.installProjectionHooks();
    this.bindInputBridge();
    this.applyProjection('mount');
    this.mounted = true;
    return this;
  }

  installProjectionHooks() {
    if (!this.runtime || this.hooksInstalled) return;
    const originalSceneTrace = this.runtime.handleSceneTrace.bind(this.runtime);
    const originalAsyncTrace = this.runtime.handleAsyncTrace.bind(this.runtime);

    this.runtime.handleSceneTrace = (...args) => {
      const result = originalSceneTrace(...args);
      this.applyProjection('scene-trace');
      return result;
    };

    this.runtime.handleAsyncTrace = (...args) => {
      const result = originalAsyncTrace(...args);
      this.applyProjection('async-trace');
      return result;
    };

    this.hooksInstalled = true;
  }

  bindInputBridge() {
    if (!this.root?.addEventListener) return;
    const onWheel = (event) => {
      this.handleWheel({
        type: 'wheel',
        deltaY: event.deltaY,
        at: this.clock?.now?.()
      }).catch((error) => {
        this.writeDebug(`wheel:${error.message}`);
      });
    };
    this.root.addEventListener('wheel', onWheel, { passive: true });
    this.unlisten.push(() => this.root.removeEventListener('wheel', onWheel));
  }

  async start(initialScene = 'hero') {
    this.mount();
    await this.runtime.initialize(initialScene);
    this.applyProjection('start');
    return this.snapshot();
  }

  async advance(options = {}) {
    this.mount();
    const promise = this.runtime.advance(options);
    this.applyProjection('advance-start');
    try {
      const result = await promise;
      this.applyProjection('advance-complete');
      return result;
    } catch (error) {
      this.applyProjection('advance-failed');
      throw error;
    }
  }

  async runArmed() {
    this.mount();
    const promise = this.runtime.runArmed();
    this.applyProjection('run-armed-start');
    try {
      const result = await promise;
      this.applyProjection('run-armed-complete');
      return result;
    } catch (error) {
      this.applyProjection('run-armed-failed');
      throw error;
    }
  }

  async handleWheel(event = {}) {
    this.mount();
    const result = this.runtime.inputScroll(event);
    this.applyProjection('wheel-input');
    if (result.type === 'intent' && this.runtime.snapshot().state === RUNTIME_STATES.ARMED) {
      await this.runArmed();
    }
    return result;
  }

  async handleReadInput(input = {}) {
    this.mount();
    const result = await this.runtime.handleReadInput(input);
    this.applyProjection('read-input');
    return result;
  }

  requestNavigationIntent(token = 'nav') {
    this.mount();
    if (this.runtime.snapshot().state !== RUNTIME_STATES.IDLE) {
      return { type: 'ignored', reason: 'runtime-busy' };
    }
    try {
      const attempt = this.runtime.armNext({ source: `nav:${token}` });
      this.applyProjection('nav-intent');
      return { type: 'armed', attemptId: attempt.attemptId };
    } catch (error) {
      if (error.name !== 'SceneRuntimeRetrySuppressedError') throw error;
      this.applyProjection('nav-suppressed');
      return { type: 'retry-suppressed', cooldown: error.cooldown };
    }
  }

  async reverse(reason = 'reverse') {
    this.mount();
    const result = await this.runtime.reverse(reason);
    this.applyProjection(reason);
    return result;
  }

  applyProjection(reason = 'projection') {
    if (!this.runtime) return null;
    const snapshot = this.runtime.snapshot();
    const projection = snapshot.presentation;
    const visible = new Set(projection.visible);
    const earlyCopies = new Set(projection.earlyCopies);

    for (const [sceneId, host] of this.hosts.entries()) {
      const isVisible = visible.has(sceneId);
      host.hidden = !isVisible;
      host.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
      host.setAttribute('data-scene-visible', isVisible ? 'true' : 'false');
      host.setAttribute('data-scene-role', sceneId === projection.current ? 'stable' : earlyCopies.has(sceneId) ? 'early-copy' : 'hidden');
      setBooleanDataset(host, 'sceneEarlyCopy', earlyCopies.has(sceneId));
      setBooleanDataset(host, 'sceneStable', sceneId === projection.current);
    }

    this.projectTargetLayer(snapshot);
    this.projectRevealLayer(projection);
    this.root.dataset.presentedScene = projection.current || '';
    this.root.dataset.runtimeState = snapshot.state;
    this.root.dataset.lastProjection = reason;
    this.writeDebug(`${snapshot.state}:${projection.current || 'none'}`);
    return snapshot;
  }

  projectTargetLayer(snapshot) {
    const targetLayer = this.layers.get('target');
    if (!targetLayer) return;
    targetLayer.replaceChildren?.();
    const attempt = snapshot.activeAttempt;
    if (!attempt?.to || snapshot.presentation.current === attempt.to) return;
    const marker = createElement(this.document, 'div');
    marker.setAttribute('data-target-scene-id', attempt.to);
    marker.setAttribute('data-target-source-scene-id', attempt.from);
    marker.setAttribute('data-target-kind', attempt.kind);
    marker.textContent = attempt.to;
    targetLayer.appendChild(marker);
  }

  projectRevealLayer(projection) {
    const revealLayer = this.layers.get('early-copy');
    if (!revealLayer) return;
    revealLayer.replaceChildren?.();
    for (const reveal of projection.reveals) {
      const marker = createElement(this.document, 'div');
      marker.setAttribute('data-reveal-scene-id', reveal.sceneId);
      marker.setAttribute('data-reveal-reason', reveal.reason || '');
      marker.textContent = reveal.sceneId;
      revealLayer.appendChild(marker);
    }
  }

  writeDebug(message) {
    const layer = this.layers.get('debug');
    if (!layer) return;
    layer.textContent = String(message);
  }

  async destroy() {
    this.unlisten.splice(0).forEach((cleanup) => cleanup());
    for (const adapter of this.runtime?.adapters?.values?.() || []) {
      await adapter.destroy();
    }
    this.mounted = false;
    this.applyProjection('destroy');
    return this.snapshot();
  }

  snapshot() {
    return {
      mounted: this.mounted,
      scenes: this.sceneIds.slice(),
      hosts: Object.fromEntries([...this.hosts.entries()].map(([sceneId, host]) => [
        sceneId,
        {
          hidden: Boolean(host.hidden),
          visible: host.getAttribute?.('data-scene-visible') || 'false',
          role: host.getAttribute?.('data-scene-role') || 'hidden'
        }
      ])),
      runtime: this.runtime?.snapshot?.() || null
    };
  }
}

export function createSceneRuntimeDomShell(options = {}) {
  return new SceneRuntimeDomShell(options);
}
