import { homepageAliases } from '../../../src/homepage/homepage.aliases.mjs';
import { homepageScenes } from '../../../src/homepage/homepage.scenes.mjs';
import { homepageSegments } from '../../../src/homepage/homepage.segments.mjs';
import { createPatternBloomScene } from '../../pattern-mirror-stage.js';
import { initBeliefStarField } from '../../sections/belief.js';
import { createLayerOwnershipRegistry } from './layer-ownership.js';
import { createPresentationController } from './presentation.js';
import { createReadIntentAccumulator, createReadMonitor, READ_EVENTS } from './read-monitor.js';
import { createRecoveryRoutine } from './recovery.js';
import { createScrollIntentAccumulator } from './scroll-intent.js';
import { createSceneStateMachine, RuntimePhase } from './state-machine.js';
import { createPlayerRegistry } from './player-registry.js';
import { createAodPlayer } from './players/aod-player.js';
import { createInkTransitionPlayer } from './players/ink-transition-player.js';

export const MVP_SCENE_ROUTE = Object.freeze([
  'hero',
  'pattern',
  'star-map',
  'aod-animation',
  'method-top',
  'method-bottom'
]);

export const MVP_SEGMENT_ROUTE = Object.freeze([
  'hero-to-pattern',
  'pattern-to-star-map',
  'star-map-to-aod',
  'aod-play',
  'method-read'
]);

const sceneSet = new Set(homepageScenes.map((scene) => scene.id));
const segmentById = new Map(homepageSegments.map((segment) => [segment.id, segment]));
const mvpSegments = MVP_SEGMENT_ROUTE.map((id) => segmentById.get(id)).filter(Boolean);
const inputScenes = new Map([
  ['hero', 'hero-to-pattern'],
  ['pattern', 'pattern-to-star-map'],
  ['star-map', 'star-map-to-aod'],
  ['aod-animation', 'aod-play']
]);
const readingScenes = new Set(['method-top', 'method-bottom']);
const PATTERN_STEADY_BLOOM_PROGRESS = 0.58;
const READ_COMPLETE_MIN_DWELL_MS = 1200;

function normalizeWheelDelta(event) {
  const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
  return (event.deltaY * multiplier) / Math.max(1, window.innerHeight);
}

function keyDeltaVh(event) {
  if (['ArrowDown', 'PageDown', ' ', 'Spacebar'].includes(event.key)) return 0.1;
  if (['ArrowUp', 'PageUp'].includes(event.key)) return -0.1;
  if (event.key === 'Home') return -0.25;
  if (event.key === 'End') return 0.25;
  return 0;
}

function sceneSelector(sceneId) {
  return `[data-scene-owner="scene-runtime"][data-scene-id="${sceneId}"]`;
}

function createScrollLock({ root = document } = {}) {
  let locks = 0;
  const body = root.body;
  const html = root.documentElement;

  return {
    lock({ segmentId } = {}) {
      locks += 1;
      body.classList.add('scene-runtime-scroll-locked');
      html.dataset.sceneRuntimeScrollLock = segmentId || 'locked';
    },
    unlock() {
      locks = Math.max(0, locks - 1);
      if (locks > 0) return;
      body.classList.remove('scene-runtime-scroll-locked');
      delete html.dataset.sceneRuntimeScrollLock;
    },
    isLocked() {
      return locks > 0;
    }
  };
}

function createDomReadMonitor({ sceneId, element, nextSegmentId }) {
  return createReadMonitor({
    sceneId,
    nextSegmentId,
    boundsProvider: () => {
      const rect = element.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      return {
        top,
        bottom: top + rect.height
      };
    },
    viewportProvider: () => ({
      top: window.scrollY,
      height: window.innerHeight
    })
  });
}

function presentRevealWithinScene(root) {
  if (!root) return;
  const revealItems = root.matches?.('.reveal')
    ? [root, ...root.querySelectorAll('.reveal')]
    : [...root.querySelectorAll('.reveal')];

  revealItems.forEach((item) => {
    item.classList.add('is-visible');
    item.dataset.entryState = 'presented';
    item.setAttribute('data-entry-state', 'presented');
    item.style.opacity = '1';
    item.style.visibility = 'visible';
    item.style.transform = 'none';
  });
}

class SceneRuntime {
  constructor({
    root = document,
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    logger = console
  } = {}) {
    this.root = root;
    this.reduceMotion = reduceMotion;
    this.logger = logger;
    this.sceneHosts = new Map();
    this.currentSceneId = 'hero';
    this.started = false;
    this.touchY = null;
    this.readMonitors = new Map();
    this.readIntentAccumulators = new Map();
    this.readCompleteTimestamps = new Map();
    this.staticVisuals = [];
    this.aodPlayer = null;
    this.cleanups = [];
    this.layerOwnership = createLayerOwnershipRegistry({ mode: 'production' });
    this.scrollLock = createScrollLock({ root });
    this.scrollIntent = createScrollIntentAccumulator({
      config: {
        intentThreshold: 0.1,
        minArmedMs: 0,
        decayHalfLifeMs: 260,
        reverseCancelThreshold: 0.06
      },
      viewportHeight: Math.max(1, window.innerHeight)
    });
    this.presentation = createPresentationController({
      initialSceneId: this.currentSceneId,
      layerOwnership: this.layerOwnership,
      onCommit: (record) => this.applyPresentationCommit(record)
    });
    this.recovery = createRecoveryRoutine({
      scrollLock: this.scrollLock,
      presentation: this.presentation,
      logger,
      onRecover: (record) => {
        this.resetReadIntent();
        this.root.documentElement.dataset.sceneRuntimeRecoveryReason = record.recoveryReason;
      }
    });
    this.playerRegistry = createPlayerRegistry();
    this.stateMachine = createSceneStateMachine({
      segments: mvpSegments,
      initialSceneId: this.currentSceneId,
      playerRegistry: this.playerRegistry,
      presentation: this.presentation,
      scrollLock: this.scrollLock,
      recovery: this.recovery,
      mediaTimeoutMs: 5200,
      releaseCooldownMs: 180,
      reducedMotion: this.reduceMotion,
      onTransition: (state) => this.applyRuntimeState(state)
    });
  }

  start() {
    if (this.started) return this;
    this.started = true;
    this.collectSceneHosts();
    this.hideLegacyLoader();
    this.mountStaticVisuals();
    this.setupPlayers();
    this.setupReadMonitors();
    this.bindEvents();
    this.presentation.present(this.sceneFromHash() || 'hero', { reason: this.sceneFromHash() ? 'hash-entry' : 'initial' });
    return this;
  }

  collectSceneHosts() {
    const hosts = [...this.root.querySelectorAll('[data-scene-owner="scene-runtime"][data-scene-id]')];
    hosts.forEach((host) => {
      const sceneId = host.dataset.sceneId;
      if (!sceneSet.has(sceneId)) throw new Error(`Unknown SceneRuntime DOM host: ${sceneId}`);
      this.sceneHosts.set(sceneId, host);
      host.dataset.sceneRuntimeRoute = MVP_SCENE_ROUTE.includes(sceneId) ? 'mvp' : 'future';
    });
  }

  hideLegacyLoader() {
    this.root.body.classList.add('is-loaded', 'is-loader-hidden', 'is-loader-ink-ready', 'is-loader-text-ready');
    const loader = this.root.querySelector('.loading-screen');
    if (loader) {
      loader.style.visibility = 'hidden';
      loader.style.pointerEvents = 'none';
    }
  }

  mountStaticVisuals() {
    this.root.documentElement.classList.add('scene-runtime-active');
    const pattern = this.sceneHosts.get('pattern');
    if (pattern && !pattern.querySelector('[data-scene-runtime-pattern-canvas]')) {
      pattern.innerHTML = `
        <canvas class="scene-runtime-pattern-canvas" data-scene-runtime-pattern-canvas aria-hidden="true"></canvas>
      `;
      const canvas = pattern.querySelector('[data-scene-runtime-pattern-canvas]');
      const patternScene = createPatternBloomScene({
        canvas,
        progressSource: () => PATTERN_STEADY_BLOOM_PROGRESS,
        reducedMotion: this.reduceMotion,
        reducedMotionProgress: PATTERN_STEADY_BLOOM_PROGRESS,
        continuousMotion: true,
        scrollDrivenMotion: false,
        dprLimit: 1,
        center: {
          x: 0.24,
          y: 0.55,
          mobileX: 0.50,
          mobileY: 0.58
        }
      });
      patternScene.start().then(() => {
        pattern.dataset.sceneRuntimePatternReady = 'true';
      }).catch((error) => {
        pattern.dataset.sceneRuntimePatternReady = 'failed';
        this.logger.warn?.('SceneRuntime pattern canvas failed to start.', error);
      });
      this.staticVisuals.push(() => patternScene.destroy());
    }
    initBeliefStarField({ root: this.root, reduceMotion: this.reduceMotion });
  }

  setupPlayers() {
    const claimLayer = (claim) => this.layerOwnership.claim(claim);
    const inkPlayer = createInkTransitionPlayer({
      root: this.root,
      reduceMotion: this.reduceMotion,
      claimLayer
    });
    ['hero-to-pattern', 'pattern-to-star-map', 'star-map-to-aod'].forEach((segmentId) => {
      this.playerRegistry.register(segmentId, inkPlayer);
    });

    this.aodPlayer = createAodPlayer({
      root: this.root,
      reduceMotion: this.reduceMotion,
      presentation: this.presentation,
      claimLayer
    });
    this.playerRegistry.register('aod', this.aodPlayer);
    this.playerRegistry.register('aod-play', this.aodPlayer);
  }

  setupReadMonitors() {
    const methodTop = this.sceneHosts.get('method-top');
    const methodBottom = this.sceneHosts.get('method-bottom');
    if (methodTop) {
      this.readMonitors.set('method-top', createDomReadMonitor({
        sceneId: 'method-top',
        element: methodTop,
        nextSegmentId: 'method-read'
      }));
      this.readIntentAccumulators.set('method-top', createReadIntentAccumulator());
    }
    if (methodBottom) {
      this.readMonitors.set('method-bottom', createDomReadMonitor({
        sceneId: 'method-bottom',
        element: methodBottom,
        nextSegmentId: 'method-bottom-terminal'
      }));
      this.readIntentAccumulators.set('method-bottom', createReadIntentAccumulator());
    }
  }

  bindEvents() {
    const onWheel = (event) => this.handleIntentInput({
      deltaVh: normalizeWheelDelta(event),
      source: 'wheel',
      originalEvent: event
    });
    const onKeyDown = (event) => {
      const deltaVh = keyDeltaVh(event);
      if (!deltaVh) return;
      this.handleIntentInput({ deltaVh, source: 'keyboard', originalEvent: event });
    };
    const onTouchStart = (event) => {
      this.touchY = event.touches?.[0]?.clientY ?? null;
    };
    const onTouchMove = (event) => {
      const nextY = event.touches?.[0]?.clientY ?? null;
      if (this.touchY === null || nextY === null) return;
      const deltaVh = (this.touchY - nextY) / Math.max(1, window.innerHeight);
      this.touchY = nextY;
      this.handleIntentInput({ deltaVh, source: 'touchmove', originalEvent: event });
    };
    const onTouchEnd = () => {
      this.touchY = null;
      this.scrollIntent.touchEnd();
    };
    const onScroll = () => this.updateReadMonitors(0);
    const onHashChange = () => {
      const targetScene = this.sceneFromHash();
      if (targetScene) this.presentation.present(targetScene, { reason: 'hash-entry' });
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('hashchange', onHashChange);
    const decayTimer = window.setInterval(() => this.scrollIntent.decay(), 120);

    this.cleanups.push(
      () => window.removeEventListener('wheel', onWheel),
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('touchstart', onTouchStart),
      () => window.removeEventListener('touchmove', onTouchMove),
      () => window.removeEventListener('touchend', onTouchEnd),
      () => window.removeEventListener('scroll', onScroll),
      () => window.removeEventListener('hashchange', onHashChange),
      () => window.clearInterval(decayTimer)
    );
  }

  sceneFromHash() {
    const hash = window.location.hash;
    if (!hash) return null;
    const alias = Object.values(homepageAliases).find((entry) => entry.legacyHash === hash);
    return alias?.mapsToScene && this.sceneHosts.has(alias.mapsToScene) ? alias.mapsToScene : null;
  }

  applyRuntimeState(state) {
    this.root.documentElement.dataset.sceneRuntimePhase = state.phase;
    if (state.activeSegmentId) {
      this.root.documentElement.dataset.sceneRuntimeActiveSegment = state.activeSegmentId;
    } else {
      delete this.root.documentElement.dataset.sceneRuntimeActiveSegment;
    }
  }

  applyPresentationCommit(record) {
    if (record.kind === 'presentEarlyCopy') {
      const target = this.sceneHosts.get(record.patch.earlyCopySceneId);
      if (target) {
        target.dataset.sceneRuntimeEarlyCopy = 'true';
        presentRevealWithinScene(target);
      }
      return;
    }

    if (record.kind !== 'present' && record.kind !== 'poster') return;
    if (record.kind === 'poster') {
      const poster = this.sceneHosts.get(record.patch.posterSceneId);
      if (poster) poster.dataset.sceneRuntimePosterGate = 'true';
      return;
    }

    const sceneId = record.patch.currentSceneId;
    this.setCurrentScene(sceneId, {
      scroll: ['play-complete', 'recovery', 'reduced-motion', 'hash-entry'].includes(record.patch.reason)
    });
  }

  setCurrentScene(sceneId, { scroll = false } = {}) {
    if (!this.sceneHosts.has(sceneId)) return;
    if (sceneId !== this.currentSceneId) this.resetReadIntent();
    this.currentSceneId = sceneId;
    this.root.documentElement.dataset.sceneRuntimeCurrentScene = sceneId;
    this.sceneHosts.forEach((host, id) => {
      const isCurrent = id === sceneId;
      host.toggleAttribute('data-scene-runtime-current', isCurrent);
      host.toggleAttribute('aria-current', isCurrent);
      if (isCurrent) host.dataset.sceneRuntimePresented = 'true';
    });
    if (scroll) {
      this.sceneHosts.get(sceneId)?.scrollIntoView({ block: 'start', inline: 'nearest' });
    }
    if (sceneId === 'aod-animation') {
      this.aodPlayer?.prepare?.().catch((error) => {
        const host = this.sceneHosts.get('aod-animation');
        if (host) host.dataset.sceneRuntimePosterGate = 'failed';
        this.logger.warn?.('SceneRuntime AOD poster gate failed.', error);
      });
    }
  }

  handleIntentInput({ deltaVh, source, originalEvent }) {
    if (!Number.isFinite(deltaVh) || deltaVh === 0) return;

    const state = this.stateMachine.getState();
    const isBusy = state.phase !== RuntimePhase.IDLE;
    const segmentId = inputScenes.get(this.currentSceneId);
    const ownsIntent = Boolean(segmentId) || isBusy;
    if (ownsIntent) originalEvent?.preventDefault?.();

    if (isBusy) {
      const result = this.scrollIntent.update({ deltaVh, source });
      if (deltaVh < 0 || this.scrollIntent.getState().lastCancelReason === 'reverse-cancel') {
        this.stateMachine.cancel({ reason: 'cancelled' });
        this.scrollIntent.reset({ reason: 'reverse-cancel' });
      }
      this.root.documentElement.dataset.sceneRuntimeIntentProgress = result.intentProgress.toFixed(4);
      return;
    }

    if (readingScenes.has(this.currentSceneId)) {
      if (deltaVh < 0) {
        this.resetReadIntent(this.currentSceneId);
        this.updateReadMonitors(0);
        return;
      }

      this.updateReadMonitors(deltaVh > 0 ? Math.abs(deltaVh) * 100 : 0);
      return;
    }

    if (!segmentId) return;
    const result = this.scrollIntent.update({ deltaVh, source });
    this.root.documentElement.dataset.sceneRuntimeIntentProgress = result.intentProgress.toFixed(4);
    if (result.thresholdReached && result.direction === 'forward') {
      this.playSegment(segmentId, result);
    }
  }

  async playSegment(segmentId, intent) {
    const state = this.stateMachine.getState();
    if (state.phase !== RuntimePhase.IDLE) return;
    this.scrollIntent.release();
    this.layerOwnership.beginFrame();
    this.stateMachine.arm({ segmentId, intent });
    this.stateMachine.beginSnapLock();
    await this.stateMachine.completeSnapLock();
  }

  updateReadMonitors(forwardIntentVh = 0) {
    if (!readingScenes.has(this.currentSceneId)) return;

    const sceneId = this.currentSceneId;
    const monitor = this.readMonitors.get(sceneId);
    if (!monitor) return;

    const monitorState = monitor.getState();
    const readIntent = this.readIntentAccumulators.get(sceneId);
    const completedAt = this.readCompleteTimestamps.get(sceneId);
    const dwellElapsed = completedAt !== undefined
      && performance.now() - completedAt >= READ_COMPLETE_MIN_DWELL_MS;
    const intentState = readIntent?.update({
      completeLatched: monitorState.completeLatched,
      deltaVh: dwellElapsed ? forwardIntentVh : 0
    });
    const armIntentVh = intentState?.thresholdReached ? intentState.forwardIntentVh : 0;
    const events = monitor.update({ forwardIntentVh: armIntentVh });
    const host = this.sceneHosts.get(sceneId);

    if (host && intentState) {
      host.dataset.readIntentVh = intentState.forwardIntentVh.toFixed(2);
      if (completedAt !== undefined) {
        host.dataset.readDwellMs = Math.max(0, performance.now() - completedAt).toFixed(0);
      }
    }

    for (const event of events) {
      if (event.type === READ_EVENTS.COMPLETE_LATCHED) {
        this.readCompleteTimestamps.set(sceneId, performance.now());
        host.dataset.readComplete = 'true';
        this.resetReadIntent(sceneId, { keepCompleteTimestamp: true });
      }
      if (event.type === READ_EVENTS.ARM_NEXT_READY) {
        host.dataset.readNextArmed = event.nextSegmentId;
        this.resetReadIntent(sceneId);
        if (sceneId === 'method-top') {
          this.stateMachine.presentScene('method-bottom', { reason: 'read-complete' });
        }
        if (sceneId === 'method-bottom') {
          this.root.documentElement.dataset.sceneRuntimeTerminalArmed = 'method-bottom';
        }
      }
    }
  }

  resetReadIntent(sceneId = null, { keepCompleteTimestamp = false } = {}) {
    if (sceneId) {
      this.readIntentAccumulators.get(sceneId)?.reset();
      if (!keepCompleteTimestamp) this.readCompleteTimestamps.delete(sceneId);
      const host = this.sceneHosts.get(sceneId);
      if (host) {
        host.dataset.readIntentVh = '0.00';
        if (!keepCompleteTimestamp) delete host.dataset.readDwellMs;
      }
      return;
    }

    this.readIntentAccumulators.forEach((accumulator) => accumulator.reset());
    this.readCompleteTimestamps.clear();
    this.sceneHosts.forEach((host) => {
      if (readingScenes.has(host.dataset.sceneId)) {
        host.dataset.readIntentVh = '0.00';
        delete host.dataset.readDwellMs;
      }
    });
  }

  destroy() {
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    this.staticVisuals.splice(0).forEach((cleanup) => cleanup());
    this.stateMachine.destroy();
    this.scrollLock.unlock();
    this.root.documentElement.classList.remove('scene-runtime-active');
    delete this.root.documentElement.dataset.sceneRuntimePhase;
    this.aodPlayer = null;
  }
}

export function createSceneRuntime(options = {}) {
  return new SceneRuntime(options);
}

export function initSceneRuntime(options = {}) {
  const runtime = createSceneRuntime(options).start();
  window.__sceneRuntime = runtime;
  return runtime;
}
