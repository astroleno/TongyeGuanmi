/**
 * @fileoverview Homepage Runtime Integration
 *
 * Wires the charge-driven snap runtime to the page:
 * - Reads scene list from the generated browser manifest
 * - Connects Lenis (or window.scrollTo fallback) for JS-snap
 * - Feeds wheel/touch/keyboard into the runtime's charge accumulator using
 *   NON-PASSIVE listeners so the page can be frozen while SnappedArmed
 * - Drives the real charge indicator (js/runtime/charge-indicator.js)
 * - Provides a real scenePresenter seam backed by the recovery handler
 * - Handles resize / orientation / visualViewport / hash per ADR-homepage-js-snap
 *
 * This module deliberately contains NO mock timeline and NO inline charge math —
 * those live in the dedicated, unit-tested runtime modules.
 */

import {
  homepageTimeline,
  timelineJoins
} from '../transitions/homepage/scene-timeline-manifest.js';
import { createSceneTimelineController } from '../transitions/homepage/scene-timeline-controller.js';
import { createHomepageSnapRuntime } from './homepage-snap-runtime.js';
import { createChargeIndicator } from './charge-indicator.js';
import { createRecoveryHandler } from './recovery-handler.js';
import { homepageTransitionRegistry } from '../transitions/homepage-transition-registry.js';
import { createPatternBloomSceneAdapter } from './scenes/pattern-bloom-scene-adapter.js';
import { createAodSceneAdapter } from './scenes/aod-scene-adapter.js';
import { createFigure2SceneAdapter } from './scenes/figure2-scene-adapter.js';
import { createFigure3SceneAdapter } from './scenes/figure3-scene-adapter.js';

const VISUAL_ONLY_TRANSITION_MODULES = new Set(['ttg', 'ph', 'crane']);
const VISUAL_TRANSITION_SELECTOR = [
  '.chapter-transition[data-transition-module]',
  '.scene-transition[data-transition-module]'
].join(',');

const CONFIG = {
  VIEWPORT_CHANGE_THRESHOLD_PX: 100, // mobile address-bar detection
  DOM_ATTRIBUTES: {
    runtimeState: 'data-homepage-runtime-state',
    currentScene: 'data-homepage-current-scene',
    scrollLocked: 'data-homepage-scroll-locked'
  }
};

/**
 * Resolve the DOM host for a scene id. Returns null when the scene has no DOM
 * yet (scaffolding still pending) — callers must treat null honestly rather
 * than pretend the scene exists.
 * @param {string} sceneId
 * @returns {HTMLElement|null}
 */
function resolveSceneElement(sceneId) {
  return document.querySelector(`[data-scene-id="${sceneId}"]`);
}

const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

function createElementScrollProgressSource(element) {
  return () => {
    if (!element) return 0;
    const viewportHeight = Math.max(1, window.innerHeight || 1);
    const rect = element.getBoundingClientRect();
    const scrollSpan = Math.max(1, element.offsetHeight || rect.height || viewportHeight);
    return clamp01((viewportHeight - rect.top) / scrollSpan);
  };
}

function resolveTransitionHandoffTarget(root, host) {
  const selector = host?.dataset?.transitionHandoffTarget;
  const queryRoot = typeof root?.querySelector === 'function' ? root : document;
  if (selector) {
    try {
      const target = queryRoot.querySelector(selector);
      if (target) return target;
    } catch (error) {
      console.warn(`Invalid transition handoff selector: ${selector}`, error);
    }
  }

  const transitionTo = host?.dataset?.transitionTo;
  if (!transitionTo) return null;
  return queryRoot.getElementById?.(transitionTo) || null;
}

/**
 * Sync runtime state to DOM attributes for CSS/debugging hooks.
 */
function syncStateToDom(state, rootElement) {
  if (!rootElement) return;
  const a = CONFIG.DOM_ATTRIBUTES;
  rootElement.setAttribute(a.runtimeState, state.current);
  rootElement.setAttribute(a.currentScene, String(state.currentSceneIndex));
  rootElement.setAttribute(a.scrollLocked, state.isScrollLocked ? 'true' : 'false');
}

async function mountVisualOnlyTransitionHosts({
  root = document,
  reduceMotion = false,
  addCleanup,
  isAlive = () => true
}) {
  const hosts = [...root.querySelectorAll(VISUAL_TRANSITION_SELECTOR)]
    .filter((host) => (
      !host.dataset.sceneId
      && VISUAL_ONLY_TRANSITION_MODULES.has(host.dataset.transitionModule)
    ));

  await Promise.all(hosts.map(async (host) => {
    const loadAdapter = homepageTransitionRegistry[host.dataset.transitionModule];
    if (!loadAdapter || !isAlive()) return;

    try {
      const adapterModule = await loadAdapter();
      if (!isAlive()) return;
      const mount = adapterModule.mountHomepageTransition;
      if (typeof mount !== 'function') return;
      const progressSource = createElementScrollProgressSource(host);
      let cleanupRegistered = false;
      const registerCleanup = (cleanup) => {
        cleanupRegistered = true;
        if (typeof addCleanup === 'function') addCleanup(cleanup);
      };
      const mounted = mount({
        host,
        reduceMotion,
        progressSource,
        handoffTarget: resolveTransitionHandoffTarget(root, host),
        handoffProgressSource: progressSource,
        reportMilestone: () => {},
        addCleanup: registerCleanup
      });
      if (!cleanupRegistered && typeof mounted?.destroy === 'function' && typeof addCleanup === 'function') {
        addCleanup(() => mounted.destroy());
      }
    } catch (error) {
      console.warn('[Homepage Runtime] visual-only transition mount failed:', error?.message || error);
    }
  }));
}

/**
 * Select the scene whose adapter should drive playback across a boundary.
 * Forward playback enters the target animation scene; reverse playback exits
 * the current animation scene, so the source scene owns the reverse adapter.
 * @param {Object} options
 * @param {Array<Object>} options.scenes
 * @param {number} options.fromIndex
 * @param {number} options.toIndex
 * @param {1|-1|number} options.direction
 * @returns {Object|null}
 */
export function selectPlaybackAdapterScene({ scenes, fromIndex, toIndex, direction } = {}) {
  if (!Array.isArray(scenes)) return null;
  const index = direction === -1 ? fromIndex : toIndex;
  return scenes[index] || null;
}

function findSceneById(scenes, id) {
  return Array.isArray(scenes) ? scenes.find((scene) => scene.id === id) || null : null;
}

function sceneIndexOf(scenes, scene) {
  if (!Array.isArray(scenes) || !scene) return -1;
  return scenes.findIndex((entry) => entry.id === scene.id);
}

function publicTimelineSceneId(scene, scenes) {
  if (!scene) return null;
  if (scene.publicSectionId) return scene.publicSectionId;
  if (scene.copy?.targetScene) {
    return publicTimelineSceneId(findSceneById(scenes, scene.copy.targetScene), scenes);
  }
  return null;
}

function nearestPublicTimelineSceneId(scenes, startIndex, step) {
  if (!Array.isArray(scenes) || step === 0) return null;
  for (let i = startIndex; i >= 0 && i < scenes.length; i += step) {
    const id = publicTimelineSceneId(scenes[i], scenes);
    if (id) return id;
  }
  return null;
}

/**
 * Map a snap-runtime playback scene (e.g. aod-animation) back to the homepage
 * SceneTimeline join whose target copy must be owned/presented by Director.
 */
export function selectTimelineJoinForPlayback({
  scenes,
  fromIndex,
  toIndex,
  direction,
  adapterScene,
  joins = timelineJoins
} = {}) {
  if (!Array.isArray(scenes) || !Array.isArray(joins) || !adapterScene) return null;

  const adapterIndex = sceneIndexOf(scenes, adapterScene);
  if (adapterIndex < 0) return null;

  const fromScene = nearestPublicTimelineSceneId(scenes, adapterIndex - 1, -1);
  const explicitTargetScene = publicTimelineSceneId(adapterScene, scenes);
  const toScene = explicitTargetScene
    || nearestPublicTimelineSceneId(scenes, adapterIndex + 1, 1);

  return joins.find((join) => join.fromScene === fromScene && join.toScene === toScene)
    || joins.find((join) => {
      const forwardSource = publicTimelineSceneId(scenes[fromIndex], scenes);
      const forwardTarget = publicTimelineSceneId(scenes[toIndex], scenes);
      return join.fromScene === forwardSource && join.toScene === forwardTarget;
    })
    || (direction === -1
      ? joins.find((join) => join.fromScene === toScene && join.toScene === fromScene)
      : null)
    || null;
}

/**
 * Create integrated homepage runtime.
 * @param {Object} options
 * @param {Object|null} options.scrollController - Lenis instance or null
 * @param {HTMLElement} [options.rootElement]
 * @param {boolean} [options.reduceMotion]
 * @returns {Object} integration API
 */
export function createHomepageRuntimeIntegration({
  scrollController = null,
  rootElement = document.documentElement,
  reduceMotion = false
} = {}) {
  if (!homepageTimeline || !Array.isArray(homepageTimeline.scenes)) {
    throw new Error('Invalid homepageTimeline: missing scenes');
  }

  // Operate only over scenes that actually have a DOM host. A partially
  // scaffolded page (e.g. 6/19 pilot scenes) yields a 6-entry active list; the
  // runtime is inert when this is empty. Indices below are into activeScenes.
  const scenes = homepageTimeline.scenes.filter((s) => resolveSceneElement(s.id));
  let isDestroyed = false;
  const sceneTimeline = createSceneTimelineController({ root: document });
  const visualOnlyCleanups = new Set();

  function addVisualOnlyCleanup(cleanup) {
    if (typeof cleanup !== 'function') return;
    if (isDestroyed) {
      cleanup();
      return;
    }
    visualOnlyCleanups.add(cleanup);
  }

  // Real document top of a scene's DOM host (for DOM-driven snap bounds).
  function resolveSceneTop(sceneId) {
    const el = resolveSceneElement(sceneId);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return rect.top + (window.scrollY || window.pageYOffset || 0);
  }

  // Charge indicator (visual feedback). Skipped entirely under reduced motion.
  const chargeIndicator = reduceMotion
    ? null
    : createChargeIndicator({ container: document.body });

  // ---- scenePresenter -------------------------------------------------------
  // The real playback seam. For now it presents the target scene's terminal
  // state via DOM attributes and resolves; when per-scene adapters land
  // (Phase 3+) they plug in here keyed by scene.visual. Crucially it is honest:
  // if the target scene has no DOM host, it REJECTS so the runtime routes to
  // recovery rather than silently "completing" a scene that isn't there.
  let recoveryHandler = null;
  let activePlayback = null;

  function reportTimelineMilestone(playback, name, value = true) {
    if (!playback?.join || !name) return null;
    playback.milestones[name] = value;
    return sceneTimeline.updateFrame(playback.join.id, playback.frame?.progress || 0, {
      direction: playback.direction,
      milestones: playback.milestones,
      reason: `director-milestone:${name}`
    });
  }

  function completeTimelinePlayback(reason = 'director-completing') {
    const playback = activePlayback;
    if (!playback?.join) return null;

    sceneTimeline.commitTarget(playback.join.id, reason);
    const presentedFrame = sceneTimeline.presentTarget(playback.join.id, reason);
    const releasedFrame = sceneTimeline.cleanupJoin(playback.join.id, reason);
    activePlayback = null;
    return releasedFrame || presentedFrame;
  }

  function recoverTimelinePlayback(reason = 'director-recovery') {
    if (!activePlayback?.join) return null;
    return completeTimelinePlayback(reason);
  }

  function primeSceneAdapter(sceneId, adapter) {
    if (!adapter || typeof adapter.showFirstFrame !== 'function') return;
    Promise.resolve(adapter.showFirstFrame()).catch((error) => {
      console.warn(`[Homepage Runtime] ${sceneId} first frame failed:`, error?.message || error);
    });
  }

  async function scenePresenter({ fromIndex, toIndex, direction, scene }) {
    const target = scene || scenes[toIndex];
    if (!target) throw new Error(`No scene at index ${toIndex}`);

    const el = resolveSceneElement(target.id);
    if (!el) {
      // Honest failure: scene DOM not scaffolded yet.
      throw new Error(`Scene DOM missing for "${target.id}" (no [data-scene-id])`);
    }

    // Mark playing, then presented. Real media/ink playback is delegated to a
    // per-scene adapter when available; absent that, present terminal state.
    el.setAttribute('data-scene-state', 'playing');

    const adapterScene = selectPlaybackAdapterScene({ scenes, fromIndex, toIndex, direction });
    const adapterEl = adapterScene ? resolveSceneElement(adapterScene.id) : null;
    if (adapterEl && adapterEl !== el) {
      adapterEl.setAttribute('data-scene-state', 'playing');
    }

    const adapter = adapterScene ? sceneAdapters.get(adapterScene.id) : null;
    if (adapter && typeof adapter.play === 'function') {
      const join = selectTimelineJoinForPlayback({
        scenes,
        fromIndex,
        toIndex,
        direction,
        adapterScene
      });
      const frame = join
        ? sceneTimeline.beginJoin(join.id, { direction, reason: 'director-playing' })
        : null;
      activePlayback = join ? {
        join,
        frame,
        direction,
        fromIndex,
        toIndex,
        adapterSceneId: adapterScene.id,
        milestones: {}
      } : null;

      await adapter.play({
        direction,
        frame,
        recoveryHandler,
        reportMilestone: (name, value = true) => reportTimelineMilestone(activePlayback, name, value)
      });
    }

    if (adapterEl && adapterEl !== el) {
      adapterEl.setAttribute('data-scene-state', direction === -1 ? 'reversed' : 'presented');
    }
    el.setAttribute('data-scene-state', 'presented');
  }

  // Per-scene playback adapters, keyed by scene id. Registered below when their
  // DOM host exists; scenePresenter calls adapter.play({direction}) during
  // Playing. Scenes without an adapter fall back to terminal-state presentation.
  const sceneAdapters = new Map();

  // First real time-driven adapter: pattern-bloom (hero -> pattern-bloom leg).
  // Only register when its host is actually scaffolded.
  const patternBloomEl = resolveSceneElement('pattern-bloom');
  if (patternBloomEl) {
    const adapter = createPatternBloomSceneAdapter({
      host: patternBloomEl,
      reduceMotion
    });
    sceneAdapters.set('pattern-bloom', adapter);
    primeSceneAdapter('pattern-bloom', adapter);
  }

  // Second real adapter: aod (media/autoplay). Uses video.play()/ended, never
  // scrubs. getRecoveryHandler is lazy because recoveryHandler is created below.
  const aodEl = resolveSceneElement('aod-animation');
  if (aodEl) {
    const adapter = createAodSceneAdapter({
      host: aodEl,
      reduceMotion,
      getRecoveryHandler: () => recoveryHandler
    });
    sceneAdapters.set('aod-animation', adapter);
    primeSceneAdapter('aod-animation', adapter);
  }

  // Third real adapter: figure2 (camera-expand). Reuses the figure2 controller's
  // renderStaticState seam, driven by a time ramp instead of scroll. Proof
  // cards/closing + ink-sweep are separate scenes/blocks handled later.
  const figure2El = resolveSceneElement('figure2-animation');
  if (figure2El) {
    const adapter = createFigure2SceneAdapter({
      host: figure2El,
      reduceMotion
    });
    sceneAdapters.set('figure2-animation', adapter);
    primeSceneAdapter('figure2-animation', adapter);
  }

  const figure3El = resolveSceneElement('figure3-animation');
  if (figure3El) {
    const adapter = createFigure3SceneAdapter({
      host: figure3El,
      reduceMotion
    });
    sceneAdapters.set('figure3-animation', adapter);
    primeSceneAdapter('figure3-animation', adapter);
  }

  // ---- runtime --------------------------------------------------------------
  const runtime = createHomepageSnapRuntime({
    timeline: { scenes },
    scrollController,
    scenePresenter,
    resolveSceneTop,
    onStateChange: handleStateChange,
    onError: handleError,
    onCompletePlayback: () => completeTimelinePlayback('director-completing'),
    onChargeProgress: handleChargeProgress
  });

  recoveryHandler = createRecoveryHandler({
    // Minimal timeline shim: recovery-handler only needs isActive/pause/time.
    timeline: {
      isActive: () => runtime.getCurrentState().current === 'Playing',
      pause: () => {},
      time: () => 0,
      duration: () => 0
    },
    onRecover: async (failedScene, reason) => {
      // Present terminal state of the target scene; never block scroll.
      recoverTimelinePlayback('director-recovery');
      const idx = runtime.getCurrentState().targetSceneIndex;
      const target = scenes[idx];
      const el = target && resolveSceneElement(target.id);
      if (el) el.setAttribute('data-scene-state', 'presented');
      console.warn('[Homepage Runtime] recovery:', reason);
    }
  });

  function handleChargeProgress(progress, direction) {
    if (!chargeIndicator) return;
    if (progress > 0) {
      chargeIndicator.show();
      chargeIndicator.updateDirection(direction);
      chargeIndicator.updateProgress(progress);
    } else {
      chargeIndicator.hide();
    }
  }

  function handleStateChange(newState) {
    if (isDestroyed) return;
    syncStateToDom(newState, rootElement);

    switch (newState.current) {
      case 'SnappedArmed':
        if (chargeIndicator) chargeIndicator.show();
        break;
      case 'Playing':
        if (scrollController && scrollController.stop) scrollController.stop();
        break;
      case 'Completing':
        if (chargeIndicator) chargeIndicator.fadeOut();
        break;
      case 'ReleaseCooldown':
      case 'FreeScroll':
        if (scrollController && scrollController.start) scrollController.start();
        if (chargeIndicator) chargeIndicator.hide();
        break;
    }
  }

  function handleError(error) {
    console.error('[Homepage Runtime] error:', error?.message || error);
    if (scrollController && scrollController.start) scrollController.start();
    document.body.style.overflow = '';
    if (chargeIndicator) chargeIndicator.hide();
  }

  // ---- input wiring ---------------------------------------------------------
  // Wheel/touch must be NON-PASSIVE so we can preventDefault while armed and
  // keep the page physically frozen (the whole point of SnappedArmed).
  function onScroll() {
    if (isDestroyed) return;
    runtime.handleScroll();
  }

  function onWheel(event) {
    if (isDestroyed) return;
    const consumed = runtime.handleWheel(event);
    if (consumed) event.preventDefault();
  }

  let touchLastY = null;
  function onTouchStart(event) {
    touchLastY = event.touches?.[0]?.clientY ?? null;
  }
  function onTouchMove(event) {
    if (isDestroyed || touchLastY == null) return;
    const y = event.touches?.[0]?.clientY ?? touchLastY;
    const pixelDelta = touchLastY - y; // downward swipe => positive (forward)
    touchLastY = y;
    const consumed = runtime.handleTouch(pixelDelta);
    if (consumed) event.preventDefault();
  }
  function onTouchEnd() { touchLastY = null; }

  function onKeyboard(event) {
    if (isDestroyed) return;
    const consumed = runtime.handleKeyboard(event);
    if (consumed) event.preventDefault();
  }

  // Charge decay tick while armed (so a half-charge bleeds off if user stops).
  let decayRAF = null;
  function decayLoop() {
    if (isDestroyed) return;
    runtime.tickChargeDecay();
    decayRAF = requestAnimationFrame(decayLoop);
  }

  // ---- viewport handlers (ADR fallback matrix) ------------------------------
  let lastViewportHeight = window.innerHeight;
  let lastVisualViewportHeight = window.visualViewport?.height || window.innerHeight;
  let resizeTimer = null;

  function onResize() {
    if (isDestroyed) return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      runtime.recalculateSceneBounds();
      lastViewportHeight = window.innerHeight;
      resizeTimer = null;
    }, 150);
  }

  function onOrientationChange() {
    if (isDestroyed) return;
    setTimeout(() => {
      runtime.recalculateSceneBounds();
      lastViewportHeight = window.innerHeight;
      const s = runtime.getCurrentState();
      if (s.current === 'SnappedArmed') {
        const scene = scenes[s.currentSceneIndex];
        if (scene) runtime.snapToScene(scene.id);
      }
    }, 100);
  }

  function onVisualViewportResize() {
    if (isDestroyed || !window.visualViewport) return;
    const h = window.visualViewport.height;
    if (Math.abs(h - lastVisualViewportHeight) > CONFIG.VIEWPORT_CHANGE_THRESHOLD_PX) {
      runtime.recalculateSceneBounds();
      lastVisualViewportHeight = h;
    }
  }

  function onHashChange() {
    if (isDestroyed) return;
    const hash = window.location.hash;
    if (!hash || hash.length <= 1) return;
    try {
      const id = decodeURIComponent(hash.slice(1));
      const scene = scenes.find((s) => s.id === id);
      if (scene) {
        const el = resolveSceneElement(scene.id);
        if (el) el.setAttribute('data-scene-state', 'presented');
        runtime.snapToScene(scene.id);
      }
    } catch (err) {
      console.warn('[Homepage Runtime] hash nav failed:', err);
    }
  }

  // ---- attach ---------------------------------------------------------------
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('keydown', onKeyboard);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onOrientationChange);
  window.addEventListener('hashchange', onHashChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onVisualViewportResize, { passive: true });
  }

  runtime.recalculateSceneBounds();
  syncStateToDom(runtime.getCurrentState(), rootElement);
  mountVisualOnlyTransitionHosts({
    root: document,
    reduceMotion,
    addCleanup: addVisualOnlyCleanup,
    isAlive: () => !isDestroyed
  }).catch((error) => {
    console.warn('[Homepage Runtime] visual-only transition setup failed:', error?.message || error);
  });
  decayRAF = requestAnimationFrame(decayLoop);
  // Kick the FSM so it can arm at the initial scroll position.
  runtime.handleScroll();

  return Object.freeze({
    getState: () => runtime.getCurrentState(),
    getCurrentScene: () => runtime.getCurrentScene(),
    getChargeProgress: () => runtime.getChargeProgress(),
    snapToScene: (id) => runtime.snapToScene(id),
    recalculateSceneBounds: () => runtime.recalculateSceneBounds(),
    /** Register a per-scene playback adapter (Phase 3+). */
    registerSceneAdapter: (sceneId, adapter) => { sceneAdapters.set(sceneId, adapter); },
    sceneTimeline,
    reset: () => runtime.reset(),
    destroy() {
      if (isDestroyed) return;
      isDestroyed = true;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('keydown', onKeyboard);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientationChange);
      window.removeEventListener('hashchange', onHashChange);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', onVisualViewportResize);
      }
      if (decayRAF) cancelAnimationFrame(decayRAF);
      if (resizeTimer) clearTimeout(resizeTimer);
      if (recoveryHandler) recoveryHandler.clearAllTimeouts();
      if (chargeIndicator) chargeIndicator.hide();
      visualOnlyCleanups.forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {
          console.warn('[Homepage Runtime] visual-only cleanup failed:', error?.message || error);
        }
      });
      visualOnlyCleanups.clear();
      sceneAdapters.forEach((a) => a?.destroy?.());
      sceneAdapters.clear();
      runtime.destroy();
      Object.values(CONFIG.DOM_ATTRIBUTES).forEach((attr) => rootElement.removeAttribute(attr));
    },
    runtime
  });
}

/**
 * Convenience wrapper for callers that detect reduced motion themselves.
 */
export function initHomepageRuntime(options = {}) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return createHomepageRuntimeIntegration({
    scrollController: null,
    rootElement: document.documentElement,
    reduceMotion,
    ...options
  });
}
