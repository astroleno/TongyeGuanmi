import { LayerOwnership } from './LayerOwnership.js';
import { Presentation } from './Presentation.js';
import { ReadMonitor } from './ReadMonitor.js';
import { SceneRuntimeCore, RUNTIME_STATES } from './SceneRuntimeCore.js';
import { ScrollIntent } from './ScrollIntent.js';
import { DOM_SHELL_SCENE_IDS } from './SceneRuntimeSceneIds.js';

const LAYERS = Object.freeze([
  'source',
  'target',
  'transition',
  'early-copy',
  'debug'
]);

const SUPPORT_STYLE_SELECTOR = '[data-scene-runtime-dom-shell-style]';

const NAVIGATION_TARGETS = Object.freeze({
  '#home': 'hero',
  '#top': 'hero',
  '#brand': 'brand',
  '#method': 'method-top',
  '#services': 'services',
  '#lab': 'lab',
  '#education': 'education',
  '#philosophy': 'education',
  '#contact': 'contact'
});

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
    timeouts = {},
    failureCooldownMs = 420,
    allowDynamicShell = false,
    playStableScenes = [],
    clock = globalThis.performance
  } = {}) {
    this.document = documentRef;
    this.root = root;
    this.sceneIds = sceneIds.slice();
    if (!registry) throw new Error('SceneRuntimeDomShell requires a scene registry');
    if (!transitionPlayer) throw new Error('SceneRuntimeDomShell requires a transition player');
    this.registry = registry;
    this.providerInstances = new Map();
    this.transitionPlayer = transitionPlayer;
    this.runtime = runtime;
    this.timeouts = timeouts;
    this.failureCooldownMs = failureCooldownMs;
    this.allowDynamicShell = allowDynamicShell;
    this.playStableScenes = new Set(playStableScenes);
    this.clock = clock;
    this.hosts = new Map();
    this.layers = new Map();
    this.mounted = false;
    this.hooksInstalled = false;
    this.stablePlayback = new Map();
    this.stablePlaybackCompleted = new Set();
    this.touchStartY = null;
    this.lastTouchY = null;
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
      if (!this.allowDynamicShell) {
        throw new Error('SceneRuntimeDomShell requires prebuilt [data-scene-runtime-shell]');
      }
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
      if (!this.allowDynamicShell) {
        throw new Error(`SceneRuntimeDomShell requires prebuilt layer: ${layerId}`);
      }
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
      if (!this.allowDynamicShell) {
        throw new Error(`SceneRuntimeDomShell requires prebuilt scene host: ${sceneId}`);
      }
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
    this.ensureShellStyles();
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

  ensureShellStyles() {
    if (!this.document?.head || this.document.querySelector?.(SUPPORT_STYLE_SELECTOR)) return;
    const style = createElement(this.document, 'style');
    style.setAttribute('data-scene-runtime-dom-shell-style', '');
    style.textContent = `
      [data-scene-runtime-shell] {
        position: fixed;
        inset: 0;
        z-index: 10;
        overflow: hidden;
        isolation: isolate;
        background: #07110e;
        color: #f7edd7;
      }

      [data-runtime-layer] {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      [data-runtime-layer="source"] {
        z-index: 1;
      }

      [data-runtime-layer="target"] {
        z-index: 2;
      }

      [data-runtime-layer="transition"] {
        z-index: 3;
        overflow: hidden;
      }

      [data-runtime-layer="early-copy"] {
        z-index: 4;
      }

      [data-runtime-layer="debug"] {
        z-index: 5;
        display: none;
      }

      [data-scene-id] {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        min-height: 100%;
        overflow: hidden;
      }

      [data-scene-visible="false"] {
        display: none !important;
      }

      [data-scene-role="early-copy"] {
        z-index: 2;
      }

      .scene-runtime-static-copy {
        min-height: 100%;
        display: grid;
        place-items: center;
        padding: 12vh min(8vw, 96px);
        font: 400 clamp(28px, 5vw, 78px)/1.08 "Tongye Title", "PingFang SC", sans-serif;
        text-align: center;
        background: #eee5ce;
        color: #17251f;
      }
    `;
    this.document.head.appendChild(style);
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
    const eventTarget = this.document?.addEventListener ? this.document : this.root;
    if (!eventTarget?.addEventListener) return;
    const onWheel = (event) => {
      this.handleWheelEvent(event).catch((error) => {
        this.writeDebug(`wheel:${error.message}`);
      });
    };
    const onTouchStart = (event) => this.handleTouchStart(event);
    const onTouchMove = (event) => {
      this.handleTouchMove(event).catch((error) => {
        this.writeDebug(`touch:${error.message}`);
      });
    };
    const onTouchEnd = (event) => this.handleTouchEnd(event);
    const onFragmentChange = () => {
      const fragment = this.fragmentFromHref(globalThis.location?.href || '');
      this.requestNavigationIntent(fragment || '#top');
    };
    const onClick = (event) => {
      const anchor = this.findFragmentAnchor(event.target);
      if (!anchor) return;
      event.preventDefault?.();
      this.requestNavigationIntent(anchor.getAttribute('href'));
    };

    eventTarget.addEventListener('wheel', onWheel, { passive: true });
    eventTarget.addEventListener('touchstart', onTouchStart, { passive: true });
    eventTarget.addEventListener('touchmove', onTouchMove, { passive: true });
    eventTarget.addEventListener('touchend', onTouchEnd, { passive: true });
    eventTarget.addEventListener('click', onClick);
    globalThis.addEventListener?.('hashchange', onFragmentChange);

    this.unlisten.push(() => {
      eventTarget.removeEventListener('wheel', onWheel);
      eventTarget.removeEventListener('touchstart', onTouchStart);
      eventTarget.removeEventListener('touchmove', onTouchMove);
      eventTarget.removeEventListener('touchend', onTouchEnd);
      eventTarget.removeEventListener('click', onClick);
      globalThis.removeEventListener?.('hashchange', onFragmentChange);
    });
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

  async handleWheelEvent(event = {}) {
    const deltaY = Number(event.deltaY || 0);
    if (this.isReadingStep()) {
      return this.handleReadInput({
        ...this.readPositionForCurrentHost(),
        deltaY
      });
    }
    return this.handleWheel({
      type: 'wheel',
      deltaY,
      at: this.clock?.now?.()
    });
  }

  handleTouchStart(event = {}) {
    const touch = event.touches?.[0] || event.changedTouches?.[0] || null;
    this.touchStartY = touch?.clientY ?? null;
    this.lastTouchY = this.touchStartY;
    return { type: 'touchstart' };
  }

  async handleTouchMove(event = {}) {
    const touch = event.touches?.[0] || event.changedTouches?.[0] || null;
    if (!touch || this.lastTouchY === null) return { type: 'touchmove-ignored' };
    const deltaY = this.lastTouchY - touch.clientY;
    this.lastTouchY = touch.clientY;
    if (this.isReadingStep()) {
      return this.handleReadInput({
        ...this.readPositionForCurrentHost(),
        deltaY
      });
    }
    return this.handleWheel({
      type: 'touchmove',
      deltaY,
      at: this.clock?.now?.()
    });
  }

  handleTouchEnd(event = {}) {
    this.touchStartY = null;
    this.lastTouchY = null;
    return this.runtime.inputScroll({
      type: 'touchend',
      deltaY: 0,
      at: this.clock?.now?.(),
      inertia: Boolean(event.inertia)
    });
  }

  async handleReadInput(input = {}) {
    this.mount();
    const result = await this.runtime.handleReadInput(input);
    this.applyProjection('read-input');
    return result;
  }

  fragmentFromHref(href) {
    const index = String(href || '').indexOf('#');
    return index >= 0 ? String(href).slice(index) : '';
  }

  normalizeFragment(token = '#top') {
    const text = String(token || '#top').trim();
    if (!text) return '#top';
    return text.startsWith('#') ? text : `#${text}`;
  }

  resolveNavigationTarget(token = '#top') {
    return NAVIGATION_TARGETS[this.normalizeFragment(token)] || null;
  }

  findFragmentAnchor(startNode) {
    let node = startNode;
    while (node) {
      const href = node.getAttribute?.('href');
      if (typeof href === 'string' && href.startsWith('#')) return node;
      node = node.parentNode;
    }
    return null;
  }

  isReadingStep() {
    try {
      return this.runtime?.routeStep?.().kind === 'read';
    } catch {
      return false;
    }
  }

  readPositionForCurrentHost() {
    const host = this.hosts.get(this.runtime?.current?.());
    const clientHeight = host?.clientHeight || 1000;
    return {
      scrollTop: host?.scrollTop || 0,
      scrollHeight: host?.scrollHeight || clientHeight,
      clientHeight
    };
  }

  requestNavigationIntent(token = 'nav') {
    this.mount();
    const fragment = this.normalizeFragment(token);
    const targetSceneId = this.resolveNavigationTarget(fragment);
    if (!targetSceneId) {
      this.runtime.record('nav-ignored', { fragment, reason: 'unknown-target' });
      this.applyProjection('nav-ignored');
      return { type: 'ignored', reason: 'unknown-target', fragment };
    }
    if (targetSceneId === this.runtime.current()) {
      this.runtime.record('nav-current', { fragment, targetSceneId });
      this.applyProjection('nav-current');
      return { type: 'current', fragment, targetSceneId };
    }
    if (this.runtime.snapshot().state !== RUNTIME_STATES.IDLE) {
      return { type: 'ignored', reason: 'runtime-busy', fragment, targetSceneId };
    }
    const step = this.runtime.routeStep();
    if (step.to !== targetSceneId) {
      this.runtime.record('nav-deferred', {
        fragment,
        targetSceneId,
        nextSceneId: step.to || null
      });
      this.applyProjection('nav-deferred');
      return {
        type: 'deferred',
        fragment,
        targetSceneId,
        nextSceneId: step.to || null
      };
    }
    try {
      const attempt = this.runtime.armNext({ source: `nav:${fragment}` });
      this.applyProjection('nav-intent');
      return { type: 'armed', attemptId: attempt.attemptId, fragment, targetSceneId };
    } catch (error) {
      if (error.name !== 'SceneRuntimeRetrySuppressedError') throw error;
      this.applyProjection('nav-suppressed');
      return { type: 'retry-suppressed', cooldown: error.cooldown, fragment, targetSceneId };
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
    this.cancelStaleStablePlayback(projection.current, reason);
    this.queueStableScenePlayback(projection.current, reason);
    return snapshot;
  }

  cancelStaleStablePlayback(currentStableId, reason = 'stable-scene-changed') {
    for (const sceneId of [...this.stablePlayback.keys()]) {
      if (sceneId === currentStableId) continue;
      const adapter = this.runtime?.adapters?.get?.(sceneId);
      this.stablePlayback.delete(sceneId);
      adapter?.cancelToSource?.({ timeoutMs: this.timeouts.scene }).catch(() => null);
      this.runtime?.record?.('stable-scene-player-cancelled', { sceneId, reason });
    }
  }

  queueStableScenePlayback(sceneId, reason = 'stable') {
    if (!sceneId || !this.playStableScenes.has(sceneId)) return;
    if (this.stablePlaybackCompleted.has(sceneId)) return;
    if (this.stablePlayback.has(sceneId)) return;
    const adapter = this.runtime?.adapters?.get?.(sceneId);
    if (!adapter) return;
    const epoch = this.runtime.snapshot().epoch;
    const playback = adapter.playForward({
      timeoutMs: this.timeouts.scene,
      onTrace: (entry) => {
        if (this.runtime?.current?.() !== sceneId || this.runtime.snapshot().epoch !== epoch) return;
        this.runtime.record('stable-scene-player-trace', { sceneId, entry, reason });
      },
      onProgress: (progress) => {
        if (this.runtime?.current?.() !== sceneId || this.runtime.snapshot().epoch !== epoch) return;
        this.runtime.record('stable-scene-player-progress', { sceneId, progress });
      }
    }).catch(async (error) => {
      this.runtime?.record?.('stable-scene-player-failed', {
        sceneId,
        reason,
        error: error.message
      });
      await adapter.cancelToSource?.({ timeoutMs: this.timeouts.scene }).catch(() => null);
    }).finally(() => {
      this.stablePlaybackCompleted.add(sceneId);
      if (this.stablePlayback.get(sceneId) === playback) this.stablePlayback.delete(sceneId);
    });
    this.stablePlayback.set(sceneId, playback);
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
