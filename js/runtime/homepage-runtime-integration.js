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
import { createTimedProgressDriver } from './timed-progress-driver.js';
import { homepageTransitionRegistry } from '../transitions/homepage-transition-registry.js';
import { createPatternBloomSceneAdapter } from './scenes/pattern-bloom-scene-adapter.js';
import { createAodSceneAdapter } from './scenes/aod-scene-adapter.js';
import { createFigure2SceneAdapter } from './scenes/figure2-scene-adapter.js';
import { createFigure3SceneAdapter } from './scenes/figure3-scene-adapter.js';

const TRANSITION_MODULE_SCENE_ADAPTERS = Object.freeze({
  'ttg-animation': { moduleName: 'ttg', durationMs: 2500 },
  'ph-animation': { moduleName: 'ph', durationMs: 1900 },
  'crane-animation': { moduleName: 'crane', durationMs: 2200 }
});

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

/**
 * Wrap legacy homepage transition modules as Director-owned scene adapters.
 * The visual module still renders from a progressSource, but its clock is now a
 * Director playback ramp and its completion is reported back through the snap
 * runtime instead of a scroll/legacy handoff path.
 */
function createTransitionModuleSceneAdapter({
  host,
  moduleName,
  durationMs,
  reduceMotion = false,
  root = document,
  loadModule = homepageTransitionRegistry[moduleName],
  createDriver = createTimedProgressDriver
} = {}) {
  if (!host) throw new Error(`${moduleName || 'transition'} scene adapter requires a host element`);
  if (typeof loadModule !== 'function') throw new Error(`No homepage transition module registered for "${moduleName}"`);

  let progress = 0;
  let destroyed = false;
  let mounted = null;
  let mountPromise = null;
  let activeReportMilestone = null;
  let activeReportFrame = null;
  const cleanupFns = new Set();

  const report = (name, value = true) => {
    if (typeof activeReportMilestone === 'function') activeReportMilestone(name, value);
  };

  const reportFrame = (nextProgress, reason = 'director-transition-module-frame') => {
    if (typeof activeReportFrame === 'function') {
      activeReportFrame(nextProgress, reason);
    } else {
      render(nextProgress);
    }
  };

  const driver = createDriver({
    durationMs,
    onProgress: (p) => {
      reportFrame(p);
    }
  });

  const progressSource = () => progress;

  async function ensureMounted() {
    if (destroyed) return;
    if (mounted) return mounted;
    if (mountPromise) return mountPromise;

    mountPromise = (async () => {
      const adapterModule = await loadModule();
      if (destroyed) return null;
      const mount = adapterModule.mountHomepageTransition;
      if (typeof mount !== 'function') {
        throw new Error(`Homepage transition module "${moduleName}" does not export mountHomepageTransition()`);
      }

      let cleanupRegistered = false;
      const registerCleanup = (cleanup) => {
        if (typeof cleanup !== 'function') return;
        cleanupRegistered = true;
        cleanupFns.add(cleanup);
      };

      const nextMounted = mount({
        host,
        reduceMotion,
        progressSource,
        handoffTarget: resolveTransitionHandoffTarget(root, host),
        handoffProgressSource: progressSource,
        reportMilestone: report,
        addCleanup: registerCleanup
      });

      if (!cleanupRegistered && typeof nextMounted?.destroy === 'function') {
        cleanupFns.add(() => nextMounted.destroy());
      }
      mounted = nextMounted || Object.freeze({});
      return mounted;
    })();

    try {
      return await mountPromise;
    } finally {
      mountPromise = null;
    }
  }

  async function showFirstFrame() {
    render(reduceMotion ? 1 : 0);
    await ensureMounted();
  }

  function render(frame) {
    const nextProgress = typeof frame === 'number' ? frame : frame?.progress;
    progress = clamp01(nextProgress);
    return progress;
  }

  async function play({ direction = 1, reportMilestone, reportFrame: nextReportFrame } = {}) {
    if (destroyed) return { status: 'complete' };
    activeReportMilestone = reportMilestone;
    activeReportFrame = nextReportFrame;
    await ensureMounted();

    report('mediaReady');
    report('targetReady', Boolean(resolveTransitionHandoffTarget(root, host)) || moduleName !== 'crane');

    if (reduceMotion) {
      reportFrame(direction === -1 ? 0 : 1, 'director-transition-module-reduced-motion');
      report('playbackComplete');
      activeReportMilestone = null;
      activeReportFrame = null;
      return { status: 'complete' };
    }

    await driver.play({ direction });
    reportFrame(direction === -1 ? 0 : 1, 'director-transition-module-complete');
    report('playbackComplete');
    activeReportMilestone = null;
    activeReportFrame = null;
    return { status: 'complete' };
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    driver.cancel();
    cleanupFns.forEach((cleanup) => {
      try {
        cleanup();
      } catch (error) {
        console.warn(`[Homepage Runtime] ${moduleName} cleanup failed:`, error?.message || error);
      }
    });
    cleanupFns.clear();
  }

  return { play, render, showFirstFrame, getProgress: () => progress, destroy };
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

function findSceneByHashId(scenes, id) {
  if (!Array.isArray(scenes) || !id) return null;
  return scenes.find((scene) => scene.id === id)
    || scenes.find((scene) => scene.publicSectionId === id)
    || null;
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

  if (direction === -1) return null;

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

  const missingSceneHosts = homepageTimeline.scenes.filter((s) => !resolveSceneElement(s.id));
  if (missingSceneHosts.length) {
    throw new Error(`Homepage snap runtime requires every scene to have a DOM host: ${missingSceneHosts.map((s) => s.id).join(', ')}`);
  }

  const scenes = homepageTimeline.scenes;
  let isDestroyed = false;
  const sceneTimeline = createSceneTimelineController({ root: document });

  // Real document top of a scene's DOM host (for DOM-driven snap bounds).
  function resolveSceneTop(sceneId) {
    const el = resolveSceneElement(sceneId);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return rect.top + (window.scrollY || window.pageYOffset || 0);
  }

  function alignDocumentToScene(scene) {
    if (!scene?.id) return false;
    const targetY = resolveSceneTop(scene.id);
    if (!Number.isFinite(targetY)) return false;

    if (scrollController?.scrollTo) {
      scrollController.scrollTo(targetY, {
        immediate: true,
        duration: 0,
        force: true,
        lock: false
      });
    }
    if (Math.abs((window.scrollY || 0) - targetY) > 1) {
      window.scrollTo({
        top: targetY,
        left: window.scrollX || 0,
        behavior: 'auto'
      });
    }
    runtime?.handleScroll?.();
    return true;
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

  function updateTimelineFrame(playback, progress, reason = 'director-frame') {
    if (!playback?.join) return null;
    const nextProgress = clamp01(progress);
    playback.progress = nextProgress;
    playback.frame = sceneTimeline.updateFrame(playback.join.id, nextProgress, {
      direction: playback.direction,
      milestones: playback.milestones,
      reason,
      autoPresent: false,
      deferPresentedFrame: playback.join.targetCopyPolicy === 'early'
    });
    return playback.frame;
  }

  function reportTimelineMilestone(playback, name, value = true) {
    if (!playback?.join || !name) return null;
    playback.milestones[name] = value;
    return sceneTimeline.updateFrame(playback.join.id, playback.progress ?? playback.frame?.progress ?? 0, {
      direction: playback.direction,
      milestones: playback.milestones,
      reason: `director-milestone:${name}`,
      autoPresent: false,
      deferPresentedFrame: playback.join.targetCopyPolicy === 'early'
    });
  }

  function completeTimelinePlayback(reason = 'director-completing') {
    const playback = activePlayback;
    if (!playback?.join) return null;

    if (playback.direction === -1) {
      const releasedFrame = sceneTimeline.cleanupJoin(playback.join.id, reason);
      activePlayback = null;
      return releasedFrame;
    }

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
    el.removeAttribute('data-runtime-recovery');
    el.setAttribute('data-scene-state', 'playing');

    const adapterScene = selectPlaybackAdapterScene({ scenes, fromIndex, toIndex, direction });
    const adapterEl = adapterScene ? resolveSceneElement(adapterScene.id) : null;
    if (adapterEl && adapterEl !== el) {
      adapterEl.removeAttribute('data-runtime-recovery');
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
        progress: frame?.progress || 0,
        milestones: {}
      } : null;
      if (frame && typeof adapter.render === 'function') adapter.render(frame);

      const renderAdapterFrame = activePlayback ? (progress, reason = 'director-adapter-frame') => {
        const nextFrame = updateTimelineFrame(activePlayback, progress, reason);
        if (nextFrame && typeof adapter.render === 'function') adapter.render(nextFrame);
        return nextFrame;
      } : null;

      await adapter.play({
        direction,
        frame,
        recoveryHandler,
        ...(renderAdapterFrame ? { reportFrame: renderAdapterFrame } : {}),
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

  for (const [sceneId, config] of Object.entries(TRANSITION_MODULE_SCENE_ADAPTERS)) {
    const host = resolveSceneElement(sceneId);
    if (!host) continue;
    const adapter = createTransitionModuleSceneAdapter({
      host,
      moduleName: config.moduleName,
      durationMs: config.durationMs,
      reduceMotion,
      root: document
    });
    sceneAdapters.set(sceneId, adapter);
    primeSceneAdapter(sceneId, adapter);
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
      recoverToTerminalState('director-recovery');
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

  function recoverToTerminalState(reason = 'director-error-recovery') {
    const runtimeState = runtime?.getCurrentState?.() || {};
    const playback = activePlayback;
    const direction = playback?.direction ?? (runtimeState.playbackDirection === -1 ? -1 : 1);
    const fromIndex = Number.isInteger(playback?.fromIndex) ? playback.fromIndex : runtimeState.currentSceneIndex;
    const toIndex = Number.isInteger(playback?.toIndex) ? playback.toIndex : runtimeState.targetSceneIndex;
    const terminalProgress = direction === -1 ? 0 : 1;
    const adapterScene = playback?.adapterSceneId
      ? findSceneById(scenes, playback.adapterSceneId)
      : selectPlaybackAdapterScene({ scenes, fromIndex, toIndex, direction });
    const adapter = adapterScene ? sceneAdapters.get(adapterScene.id) : null;

    if (adapter && typeof adapter.render === 'function') {
      try {
        adapter.render(terminalProgress);
      } catch (err) {
        console.warn('[Homepage Runtime] recovery render failed:', err?.message || err);
      }
    }

    const recoveredFrame = recoverTimelinePlayback(reason);
    const targetScene = scenes[toIndex] || null;
    const adapterEl = adapterScene ? resolveSceneElement(adapterScene.id) : null;
    const targetEl = targetScene ? resolveSceneElement(targetScene.id) : null;
    const terminalState = direction === -1 ? 'reversed' : 'presented';

    if (adapterEl) {
      adapterEl.setAttribute('data-scene-state', terminalState);
      adapterEl.setAttribute('data-runtime-recovery', 'terminal');
    }
    if (targetEl) {
      targetEl.setAttribute('data-scene-state', terminalState);
      targetEl.setAttribute('data-runtime-recovery', 'terminal');
    }
    alignDocumentToScene(targetScene);
    return recoveredFrame;
  }

  function handleError(error) {
    console.error('[Homepage Runtime] error:', error?.message || error);
    recoverToTerminalState('director-error-recovery');
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
      const scene = findSceneByHashId(scenes, id);
      if (scene) {
        const el = resolveSceneElement(scene.id);
        if (el) el.setAttribute('data-scene-state', 'presented');
        const targetY = resolveSceneTop(scene.id);
        if (Number.isFinite(targetY)) {
          if (scrollController?.scrollTo) {
            scrollController.scrollTo(targetY, {
              immediate: true,
              duration: 0,
              force: true,
              lock: false
            });
          }
          if (Math.abs((window.scrollY || 0) - targetY) > 1) {
            window.scrollTo({
              top: targetY,
              left: window.scrollX || 0,
              behavior: 'auto'
            });
          }
          runtime.handleScroll();
        } else {
          runtime.snapToScene(scene.id);
        }
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
  decayRAF = requestAnimationFrame(decayLoop);
  // Kick the FSM so it can arm at the initial scroll position.
  runtime.handleScroll();
  onHashChange();
  if (window.location.hash) {
    const alignInitialHash = () => {
      onHashChange();
      window.setTimeout(onHashChange, 120);
      window.setTimeout(onHashChange, 650);
      window.setTimeout(onHashChange, 1500);
      window.setTimeout(onHashChange, 3000);
    };
    alignInitialHash();
    if (!document.body?.classList?.contains('is-loader-hidden')) {
      window.addEventListener('site:loader-hidden', alignInitialHash, { once: true });
    }
  }

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
