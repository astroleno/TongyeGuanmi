import { homepageAliases } from '../../../src/homepage/homepage.aliases.mjs';
import { homepageScenes } from '../../../src/homepage/homepage.scenes.mjs';
import { homepageSegments } from '../../../src/homepage/homepage.segments.mjs';
import { createPatternBloomScene } from '../../pattern-mirror-stage.js';
import { initBeliefStarField } from '../../sections/belief.js';
import { initFallbackParallax, initLayeredHero } from '../../sections/hero.js';
import { createLayerOwnershipRegistry } from './layer-ownership.js';
import { createPresentationController } from './presentation.js';
import { createReadIntentAccumulator, createReadMonitor, READ_EVENTS } from './read-monitor.js';
import { createRecoveryRoutine } from './recovery.js';
import { createScrollIntentAccumulator } from './scroll-intent.js';
import { createSceneStateMachine, RuntimePhase } from './state-machine.js';
import { createPlayerRegistry } from './player-registry.js';
import { createAodPlayer } from './players/aod-player.js';
import { createInkTransitionPlayer } from './players/ink-transition-player.js';

export const MVP_ROUTE_STEPS = Object.freeze([
  { from: 'hero', segmentId: 'hero-to-pattern', to: 'pattern', mode: 'ink-transition' },
  { from: 'pattern', segmentId: 'pattern-to-star-map', to: 'star-map', mode: 'ink-transition' },
  { from: 'star-map', segmentId: 'star-map-to-aod', to: 'aod-animation', mode: 'ink-transition' },
  { from: 'aod-animation', segmentId: 'aod-play', to: 'method-top', mode: 'media-animation' },
  { from: 'method-top', segmentId: 'method-read', to: 'method-bottom', mode: 'text-read' },
  { from: 'method-bottom', segmentId: 'method-bottom-to-figure2', to: 'figure2-animation', mode: 'ink-transition' }
]);

export const MVP_SCENE_ROUTE = Object.freeze([
  MVP_ROUTE_STEPS[0].from,
  ...MVP_ROUTE_STEPS.map((step) => step.to)
]);

export const MVP_SEGMENT_ROUTE = Object.freeze(MVP_ROUTE_STEPS.map((step) => step.segmentId));

const sceneSet = new Set(homepageScenes.map((scene) => scene.id));
const segmentById = new Map(homepageSegments.map((segment) => [segment.id, segment]));
const routeStepBySegmentId = new Map(MVP_ROUTE_STEPS.map((step) => [step.segmentId, step]));
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
const HERO_TRANSITION_EDGE_VH = 0.08;
const INPUT_RELEASE_SETTLE_MS = 260;
const routeVisibleSceneIds = new Set(MVP_SCENE_ROUTE);
const stableTraceReasons = new Set(['initial', 'hash-entry']);

const localAnimationScripts = Object.freeze({
  gsap: new URL('../../vendor/gsap.min.js', import.meta.url).href,
  scrollTrigger: new URL('../../vendor/ScrollTrigger.min.js', import.meta.url).href
});

const loadedScripts = new Map();

function loadRuntimeScript(src) {
  if (loadedScripts.has(src)) return loadedScripts.get(src);

  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing?.dataset.loaded === 'true') {
      resolve();
      return;
    }

    const script = existing || document.createElement('script');
    let settled = false;
    const finish = (ok, value) => {
      if (settled) return;
      settled = true;
      script.dataset.loaded = ok ? 'true' : 'false';
      ok ? resolve(value) : reject(value);
    };

    script.src = src;
    script.async = false;
    script.onload = () => finish(true);
    script.onerror = () => finish(false, new Error(`Failed to load ${src}`));
    if (!existing) document.head.append(script);
  });

  loadedScripts.set(src, promise);
  return promise;
}

async function loadHeroAnimationLibraries() {
  if (!window.gsap) await loadRuntimeScript(localAnimationScripts.gsap);
  if (!window.ScrollTrigger) await loadRuntimeScript(localAnimationScripts.scrollTrigger);
  if (!window.gsap || !window.ScrollTrigger) {
    throw new Error('SceneRuntime hero requires GSAP and ScrollTrigger.');
  }
  window.gsap.registerPlugin?.(window.ScrollTrigger);
}

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

function applyUniqueSceneVisibility(host, sceneId, isCurrent) {
  if (!routeVisibleSceneIds.has(sceneId)) return;
  const visible = isCurrent || (sceneId === 'method-top' && host.dataset.sceneRuntimeEarlyCopy === 'true');
  host.style.opacity = visible ? '1' : '0';
  host.style.visibility = visible || sceneId === 'aod-animation' ? 'visible' : 'hidden';
  host.style.pointerEvents = visible ? '' : 'none';
}

function traceClock() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
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
    this.heroVisualReadyPromise = null;
    this.inputSettledUntil = 0;
    this.trace = [];
    this.lastRuntimePhase = RuntimePhase.IDLE;
    this.pendingReleaseTrace = null;
    this.tracedPresentedSegments = new Set();
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
    this.setupHeroVisuals();
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
          x: 0.50,
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

  setupHeroVisuals() {
    const html = this.root.documentElement || document.documentElement;
    const body = this.root.body || document.body;
    const runtime = { markLoaded() {} };

    this.heroVisualReadyPromise = loadHeroAnimationLibraries()
      .then(() => {
        initLayeredHero({
          root: html,
          body,
          runtime,
          reduceMotion: this.reduceMotion
        });
        html.dataset.sceneRuntimeHeroDriver = 'layered';
      })
      .catch((error) => {
        this.logger.warn?.('SceneRuntime layered hero failed; using fallback parallax.', error);
        initFallbackParallax({
          root: html,
          runtime,
          reduceMotion: this.reduceMotion
        });
        html.dataset.sceneRuntimeHeroDriver = 'fallback';
      });
  }

  setupPlayers() {
    const claimLayer = (claim) => this.layerOwnership.claim(claim);
    const inkPlayer = createInkTransitionPlayer({
      root: this.root,
      reduceMotion: this.reduceMotion,
      claimLayer,
      onCover: ({ segment }) => this.coverTransitionTarget(segment)
    });
    ['hero-to-pattern', 'pattern-to-star-map', 'star-map-to-aod', 'method-bottom-to-figure2'].forEach((segmentId) => {
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
        nextSegmentId: 'method-bottom-to-figure2'
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

  recordTrace(event, patch = {}) {
    const state = this.stateMachine?.getState?.() || {};
    const entry = {
      index: this.trace.length,
      at: Number(traceClock().toFixed(2)),
      event,
      phase: state.phase || null,
      sceneId: this.currentSceneId,
      activeSegmentId: state.activeSegmentId || null,
      targetSceneId: state.targetSceneId || null,
      ...patch
    };
    this.trace.push(entry);
    this.root.documentElement.dataset.sceneRuntimeTraceLength = String(this.trace.length);
    this.root.documentElement.dataset.sceneRuntimeLastTrace = event;
    return entry;
  }

  recordPresentTarget({ segmentId, sceneId, direction = 'forward', reason = 'present' } = {}) {
    if (!segmentId || this.tracedPresentedSegments.has(`${direction}:${segmentId}`)) return;
    this.tracedPresentedSegments.add(`${direction}:${segmentId}`);
    this.recordTrace('present:target', { segmentId, sceneId, direction, reason });
  }

  currentRouteIndex() {
    return MVP_SCENE_ROUTE.indexOf(this.currentSceneId);
  }

  routeStepEndingAt(sceneId) {
    const index = MVP_SCENE_ROUTE.indexOf(sceneId);
    return index > 0 ? MVP_ROUTE_STEPS[index - 1] : null;
  }

  playerOwnerForSegment(segmentId) {
    const step = routeStepBySegmentId.get(segmentId);
    if (step?.mode === 'media-animation') return 'MediaPlayer';
    if (step?.mode === 'text-read') return 'none';
    return 'SegmentPlayer';
  }

  restorePreviousStableScene({ source = 'wheel', originalEvent = null } = {}) {
    const index = this.currentRouteIndex();
    if (index <= 0) return false;

    const currentScene = this.currentSceneId;
    const previousScene = MVP_SCENE_ROUTE[index - 1];
    const forwardStep = this.routeStepEndingAt(currentScene);
    if (!forwardStep) return false;

    originalEvent?.preventDefault?.();
    this.resetReadIntent();
    this.scrollIntent.reset({ reason: 'reverse-restore' });
    const traceBase = {
      segmentId: forwardStep.segmentId,
      from: currentScene,
      to: previousScene,
      direction: 'reverse',
      owner: source === 'keyboard' ? 'KeyboardIntent' : 'ScrollIntent'
    };

    this.recordTrace('intent:armed', traceBase);
    this.recordTrace('snap:locked', { ...traceBase, owner: 'none' });
    this.recordTrace('player:started', { ...traceBase, owner: 'none' });
    this.recordPresentTarget({
      segmentId: forwardStep.segmentId,
      sceneId: previousScene,
      direction: 'reverse',
      reason: 'reverse-restore'
    });
    this.presentation.present(previousScene, { reason: 'reverse-restore' });

    const releaseTrace = {
      segmentId: forwardStep.segmentId,
      direction: 'reverse',
      releaseReason: 'reverse-restore',
      targetSceneId: previousScene
    };
    this.recordTrace('release:start', releaseTrace);
    this.recordTrace('release:done', releaseTrace);
    this.recordTrace('scene:stable', {
      sceneId: previousScene,
      segmentId: forwardStep.segmentId,
      direction: 'reverse',
      reason: 'reverse-restore'
    });
    this.tracedPresentedSegments.delete(`reverse:${forwardStep.segmentId}`);
    return true;
  }

  applyRuntimeState(state) {
    this.root.documentElement.dataset.sceneRuntimePhase = state.phase;
    if (state.phase === RuntimePhase.PLAYING && this.lastRuntimePhase !== RuntimePhase.PLAYING) {
      this.recordTrace('player:started', {
        segmentId: state.activeSegmentId,
        owner: this.playerOwnerForSegment(state.activeSegmentId),
        direction: state.intent?.direction || 'forward'
      });
    }
    if (state.phase === RuntimePhase.RELEASING) {
      this.inputSettledUntil = performance.now() + INPUT_RELEASE_SETTLE_MS;
      this.scrollIntent.reset({ reason: 'release-settle' });
      if (this.lastRuntimePhase !== RuntimePhase.RELEASING) {
        this.pendingReleaseTrace = {
          segmentId: state.activeSegmentId,
          direction: state.intent?.direction || 'forward',
          releaseReason: state.releaseReason || 'normal',
          targetSceneId: state.targetSceneId
        };
        this.recordTrace('release:start', this.pendingReleaseTrace);
        if (state.releaseReason === 'cancelled') {
          this.setCurrentScene(this.currentSceneId, { scroll: true, reason: 'reverse-cancel' });
        }
      }
    }
    if (state.phase === RuntimePhase.IDLE && this.lastRuntimePhase === RuntimePhase.RELEASING && this.pendingReleaseTrace) {
      this.recordTrace('release:done', this.pendingReleaseTrace);
      this.recordTrace('scene:stable', {
        sceneId: this.currentSceneId,
        segmentId: this.pendingReleaseTrace.segmentId,
        direction: this.pendingReleaseTrace.direction,
        reason: this.pendingReleaseTrace.releaseReason
      });
      this.tracedPresentedSegments.delete(`${this.pendingReleaseTrace.direction}:${this.pendingReleaseTrace.segmentId}`);
      this.pendingReleaseTrace = null;
    }
    if (state.activeSegmentId) {
      this.root.documentElement.dataset.sceneRuntimeActiveSegment = state.activeSegmentId;
    } else {
      delete this.root.documentElement.dataset.sceneRuntimeActiveSegment;
    }
    this.lastRuntimePhase = state.phase;
  }

  applyPresentationCommit(record) {
    if (record.kind === 'presentEarlyCopy') {
      const target = this.sceneHosts.get(record.patch.earlyCopySceneId);
      if (target) {
        target.dataset.sceneRuntimeEarlyCopy = 'true';
        presentRevealWithinScene(target);
        applyUniqueSceneVisibility(target, record.patch.earlyCopySceneId, false);
      }
      const activeState = this.stateMachine.getState();
      this.recordTrace('early-copy', {
        segmentId: activeState.activeSegmentId || null,
        sceneId: record.patch.earlyCopySceneId,
        direction: activeState.intent?.direction || 'forward',
        owner: 'Presentation'
      });
      return;
    }

    if (record.kind !== 'present' && record.kind !== 'poster') return;
    if (record.kind === 'poster') {
      const poster = this.sceneHosts.get(record.patch.posterSceneId);
      if (poster) poster.dataset.sceneRuntimePosterGate = 'true';
      return;
    }

    const sceneId = record.patch.currentSceneId;
    const activeState = this.stateMachine.getState();
    if (activeState.activeSegmentId) {
      this.recordPresentTarget({
        segmentId: activeState.activeSegmentId,
        sceneId,
        direction: activeState.intent?.direction || 'forward',
        reason: record.patch.reason
      });
    }
    this.setCurrentScene(sceneId, {
      scroll: ['play-complete', 'read-complete', 'recovery', 'reduced-motion', 'hash-entry', 'reverse-restore'].includes(record.patch.reason),
      reason: record.patch.reason
    });
  }

  setCurrentScene(sceneId, { scroll = false, reason = 'present' } = {}) {
    if (!this.sceneHosts.has(sceneId)) return;
    if (sceneId !== this.currentSceneId) this.resetReadIntent();
    this.currentSceneId = sceneId;
    this.root.documentElement.dataset.sceneRuntimeCurrentScene = sceneId;
    this.root.documentElement.dataset.sceneRuntimeRouteIndex = String(MVP_SCENE_ROUTE.indexOf(sceneId));
    this.sceneHosts.forEach((host, id) => {
      const isCurrent = id === sceneId;
      host.toggleAttribute('data-scene-runtime-current', isCurrent);
      host.toggleAttribute('aria-current', isCurrent);
      if (isCurrent) host.dataset.sceneRuntimePresented = 'true';
      delete host.dataset.sceneRuntimeEarlyCopy;
      applyUniqueSceneVisibility(host, id, isCurrent);
    });
    if (scroll) {
      this.scrollSceneIntoView(sceneId, { deferIfLocked: true });
    }
    if (sceneId === 'aod-animation') {
      this.aodPlayer?.prepare?.().catch(() => {});
    }
    if (stableTraceReasons.has(reason)) {
      this.recordTrace('scene:stable', { sceneId, reason });
    }
  }

  scrollSceneIntoView(sceneId, { deferIfLocked = false } = {}) {
    const target = this.sceneHosts.get(sceneId);
    if (!target) return;

    const scroll = () => {
      const top = target.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top, behavior: 'auto' });
    };

    if (deferIfLocked && this.scrollLock.isLocked()) {
      window.setTimeout(scroll, 0);
      return;
    }

    scroll();
  }

  getHeroTransitionReadiness(deltaVh = 0) {
    const hero = this.sceneHosts.get('hero');
    if (!hero) return { ready: true, progress: 1, shouldSnapToEnd: false, endScrollY: window.scrollY };

    const viewportHeight = Math.max(1, window.innerHeight);
    const totalRange = Math.max(1, hero.offsetHeight - viewportHeight);
    const rawScroll = window.scrollY - hero.offsetTop;
    const progress = Math.min(1, Math.max(0, rawScroll / totalRange));
    const remainingPx = Math.max(0, hero.getBoundingClientRect().bottom - viewportHeight);
    const forwardPx = Math.max(0, deltaVh * viewportHeight);
    const edgePx = viewportHeight * HERO_TRANSITION_EDGE_VH;
    const ready = remainingPx <= edgePx || remainingPx - forwardPx <= edgePx;

    return {
      ready,
      progress,
      shouldSnapToEnd: ready && remainingPx > edgePx,
      endScrollY: hero.offsetTop + totalRange
    };
  }

  handleHeroIntent({ deltaVh, source, originalEvent }) {
    if (deltaVh < 0) {
      this.scrollIntent.reset({ reason: 'hero-reverse' });
      return;
    }

    const readiness = this.getHeroTransitionReadiness(deltaVh);
    this.root.documentElement.dataset.sceneRuntimeHeroProgress = readiness.progress.toFixed(4);
    if (!readiness.ready) {
      this.scrollIntent.reset({ reason: 'hero-natural-scroll' });
      return;
    }

    originalEvent?.preventDefault?.();
    if (readiness.shouldSnapToEnd) {
      window.scrollTo({ top: readiness.endScrollY, behavior: 'auto' });
    }

    const result = this.scrollIntent.update({ deltaVh, source });
    this.root.documentElement.dataset.sceneRuntimeIntentProgress = result.intentProgress.toFixed(4);
    if (result.thresholdReached && result.direction === 'forward') {
      this.playSegment('hero-to-pattern', result);
    }
  }

  coverTransitionTarget(segment) {
    if (!segment?.to) return;
    const target = this.sceneHosts.get(segment.to);
    if (!target) return;

    if (segment.id === 'star-map-to-aod') {
      target.style.opacity = '1';
      target.style.visibility = 'visible';
      target.style.pointerEvents = 'none';
      this.aodPlayer?.prepare?.().catch(() => {});
    }

    this.recordPresentTarget({
      segmentId: segment.id,
      sceneId: segment.to,
      direction: 'forward',
      reason: 'covered'
    });
    this.scrollSceneIntoView(segment.to);
  }

  handleIntentInput({ deltaVh, source, originalEvent }) {
    if (!Number.isFinite(deltaVh) || deltaVh === 0) return;

    const state = this.stateMachine.getState();
    if (state.phase === RuntimePhase.RELEASING || performance.now() < this.inputSettledUntil) {
      originalEvent?.preventDefault?.();
      return;
    }

    const isBusy = state.phase !== RuntimePhase.IDLE;
    const segmentId = inputScenes.get(this.currentSceneId);

    if (!isBusy && this.currentSceneId === 'hero') {
      this.handleHeroIntent({ deltaVh, source, originalEvent });
      return;
    }

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

    if (deltaVh < 0 && this.restorePreviousStableScene({ source, originalEvent })) {
      return;
    }

    if (readingScenes.has(this.currentSceneId)) {
      if (deltaVh < 0) {
        this.resetReadIntent(this.currentSceneId);
        this.updateReadMonitors(0);
        return;
      }

      if (this.currentSceneId === 'method-bottom' && this.readMonitors.get('method-bottom')?.getState().completeLatched) {
        originalEvent?.preventDefault?.();
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
    const segment = segmentById.get(segmentId);
    this.recordTrace('intent:armed', {
      segmentId,
      from: segment?.from || this.currentSceneId,
      to: segment?.to || null,
      direction: intent?.direction || 'forward',
      owner: intent?.source === 'read-complete' ? 'ReadMonitor' : 'ScrollIntent',
      distanceVh: intent?.distanceVh ?? null
    });
    this.scrollIntent.release();
    this.layerOwnership.beginFrame();
    this.stateMachine.arm({ segmentId, intent });
    this.stateMachine.beginSnapLock();
    this.recordTrace('snap:locked', {
      segmentId,
      from: segment?.from || this.currentSceneId,
      to: segment?.to || null,
      direction: intent?.direction || 'forward',
      owner: 'StateMachine'
    });
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
          this.recordTrace('intent:armed', {
            segmentId: 'method-read',
            from: 'method-top',
            to: 'method-bottom',
            direction: 'forward',
            owner: 'ReadMonitor',
            distanceVh: 10
          });
          this.recordTrace('snap:locked', {
            segmentId: 'method-read',
            from: 'method-top',
            to: 'method-bottom',
            direction: 'forward',
            owner: 'none'
          });
          this.recordTrace('player:started', {
            segmentId: 'method-read',
            direction: 'forward',
            owner: 'none'
          });
          this.recordPresentTarget({
            segmentId: 'method-read',
            sceneId: 'method-bottom',
            direction: 'forward',
            reason: 'read-complete'
          });
          this.stateMachine.presentScene('method-bottom', { reason: 'read-complete' });
          const releaseTrace = {
            segmentId: 'method-read',
            direction: 'forward',
            releaseReason: 'read-complete',
            targetSceneId: 'method-bottom'
          };
          this.recordTrace('release:start', releaseTrace);
          this.recordTrace('release:done', releaseTrace);
          this.recordTrace('scene:stable', {
            sceneId: 'method-bottom',
            segmentId: 'method-read',
            direction: 'forward',
            reason: 'read-complete'
          });
          this.tracedPresentedSegments.delete('forward:method-read');
        }
        if (sceneId === 'method-bottom') {
          this.playSegment(event.nextSegmentId, {
            source: 'read-complete',
            direction: 'forward',
            distanceVh: 10
          });
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
