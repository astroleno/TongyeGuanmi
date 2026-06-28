import { homepageTransitionRegistry } from './homepage-transition-registry.js';
import { createSectionPresentationController } from './homepage/section-presentation-controller.js';

const NAMED_TRANSITION_SELECTOR = [
  '.chapter-transition[data-transition-module]',
  '.scene-transition[data-transition-module]'
].join(',');

const SOFT_MODULES = new Set(['soft-divider', 'soft-drilldown', 'soft-breath']);
const SCROLL_DRIVEN_MODULES = new Set([]);
const HANDOFF_AFTER_PLAYBACK = 'after-playback';
const HANDOFF_POST_SCROLL = 'post-scroll';
const REDUCED_MOTION_CLASS = 'homepage-transition--reduced-motion';
const RUNTIME_PROGRESS_WINDOW = 'progress-window';

const DEFAULT_PLAY_MS = 1900;
const SNAP_VIEWPORT_HEIGHT_VAR = '--homepage-transition-snap-height';
const SNAP_EXTRA_HEIGHT_VAR = '--homepage-transition-extra-snap-height';
const FIXED_STAGE_CLASS = 'homepage-transition--fixed-stage';
const DEFAULT_SNAP_ENTRY_VH = 1.02;
const DEFAULT_TARGET_GATE_RELEASE_PROGRESS = 0.86;
const POST_SNAP_INPUT_LOCK_MS = 420;
const DIRECT_HASH_ALIGNMENT_DELAYS = [0, 120, 420, 1100, 2400, 5200, 9200];
const BLOCKED_SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']);
const MODULE_PLAY_MS = {
  aod: 1800,
  figure2: 2200,
  'pattern-bloom': 2200,
  ttg: 2500,
  'figure3-transition': 1800,
  ph: 1900,
  crane: 2200
};

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeInOutCubic = (value) => {
  const p = clamp(value);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
};
const parseFiniteNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const parseNumberList = (value, { min = -Infinity, max = Infinity } = {}) => String(value || '')
  .split(',')
  .map((item) => Number(item.trim()))
  .filter((number) => Number.isFinite(number) && number > min && number < max);

function resolveHandoffTarget(root, host) {
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

function getDirectHashTargetId() {
  const hash = window.location.hash || '';
  if (!hash.startsWith('#')) return '';
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return hash.slice(1);
  }
}

function isDirectHashTargetForController(controller) {
  const directHashTargetId = getDirectHashTargetId();
  return Boolean(
    directHashTargetId
    && controller?.handoffTarget
    && (
      controller.handoffTarget.id === directHashTargetId
      || controller.handoffTarget.dataset?.sectionId === directHashTargetId
    )
  );
}

function shouldGateTargetReveal(controller) {
  return Boolean(
    controller?.handoffTarget
    && !controller.handoffId
    && !controller.handoffPhase
  );
}

function createCleanupStack() {
  const cleanups = [];

  return {
    add(cleanup) {
      if (!cleanup) return;
      const destroy = typeof cleanup === 'function' ? cleanup : cleanup.destroy;
      if (typeof destroy === 'function') cleanups.push(() => destroy.call(cleanup));
    },
    destroy() {
      while (cleanups.length) {
        const dispose = cleanups.pop();
        try {
          dispose();
        } catch (error) {
          console.warn('Homepage transition cleanup failed.', error);
        }
      }
    }
  };
}

function getScrollY() {
  return window.scrollY || window.pageYOffset || 0;
}

function getDocumentTop(element) {
  return getScrollY() + element.getBoundingClientRect().top;
}

function createElementScrollProgressSource(element) {
  return () => {
    if (!element) return 0;
    const viewportHeight = Math.max(1, window.innerHeight || 1);
    const rect = element.getBoundingClientRect();
    const scrollSpan = Math.max(1, element.offsetHeight || rect.height || viewportHeight);
    return clamp((viewportHeight - rect.top) / scrollSpan);
  };
}

function createHeroLinkedScrollProgressSource(element) {
  return () => {
    const hero = document.querySelector('.hero-wrap');
    if (!hero || !element) return createElementScrollProgressSource(element)();

    const viewportHeight = Math.max(1, window.innerHeight || 1);
    const heroTop = getDocumentTop(hero);
    const hostTop = getDocumentTop(element);
    const heroRange = Math.max(1, hero.offsetHeight - viewportHeight);
    const heroRevealStart = heroTop + heroRange * 0.26;
    const heroRevealEnd = heroTop + heroRange * 0.92;
    const transitionEnd = hostTop + Math.max(viewportHeight, element.offsetHeight || viewportHeight);
    const scrollY = getScrollY();

    if (scrollY <= heroRevealEnd) {
      return clamp((scrollY - heroRevealStart) / Math.max(1, heroRevealEnd - heroRevealStart) * 0.50);
    }

    return clamp(0.50 + ((scrollY - heroRevealEnd) / Math.max(1, transitionEnd - heroRevealEnd)) * 0.50);
  };
}

function resolveAnchor(root, selector, fallback) {
  if (!selector) return fallback;
  try {
    return root.querySelector?.(selector) || document.querySelector(selector) || fallback;
  } catch {
    return fallback;
  }
}

function createProgressWindowSource(host, root = document) {
  const startAnchor = resolveAnchor(root, host.dataset.transitionProgressStartAnchor, host);
  const endAnchor = resolveAnchor(root, host.dataset.transitionProgressEndAnchor, host);
  const startOffsetVh = parseFiniteNumber(host.dataset.transitionStartOffsetVh, 0);
  const endOffsetVh = parseFiniteNumber(host.dataset.transitionEndOffsetVh, 0);

  return () => {
    const viewportHeight = Math.max(1, window.innerHeight || 1);
    const startY = getDocumentTop(startAnchor) + startOffsetVh * viewportHeight;
    const endY = getDocumentTop(endAnchor) + endOffsetVh * viewportHeight;
    return clamp((getScrollY() - startY) / Math.max(1, endY - startY));
  };
}

function parseWindowSpec(value = '') {
  return String(value || '')
    .split('|')
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(':');
      const [from, to] = String(parts[1] || '0-0').split('-').map(Number);
      const kind = parts[2] || '';
      const priorityPart = parts.find((part) => /^p\d+/.test(part));
      const base = {
        name: parts[0] || '',
        from: Number.isFinite(from) ? from : 0,
        to: Number.isFinite(to) ? to : 0,
        priority: priorityPart ? Number(priorityPart.slice(1)) || 0 : 0
      };
      if (kind === 'owner') {
        return { ...base, owner: parts[3] || '' };
      }
      const [topOwner, bottomOwner] = String(parts[3] || '').split('>');
      return {
        ...base,
        bridge: kind,
        topOwner: topOwner || '',
        bottomOwner: bottomOwner || '',
        commitOwner: parts[4] || ''
      };
    });
}

function syncProgressWindowMetadata(host, progress, windows) {
  if (!host || !windows?.length) return;
  const active = windows
    .filter((windowSpec) => progress >= windowSpec.from && progress <= windowSpec.to)
    .sort((a, b) => b.priority - a.priority || (b.to - b.from) - (a.to - a.from))[0] || null;

  host.dataset.transitionCurrentWindow = active?.name || 'none';
  if (!active) {
    delete host.dataset.transitionPrimaryOwner;
    delete host.dataset.transitionTopOwner;
    delete host.dataset.transitionBottomOwner;
    return;
  }

  if (active.bridge) {
    host.dataset.transitionBridgeType = active.bridge;
    host.dataset.transitionTopOwner = active.topOwner || '';
    host.dataset.transitionBottomOwner = active.bottomOwner || '';
    host.dataset.transitionPrimaryOwner = active.commitOwner || active.bottomOwner || active.topOwner || '';
  } else {
    host.dataset.transitionPrimaryOwner = active.owner || '';
    delete host.dataset.transitionTopOwner;
    delete host.dataset.transitionBottomOwner;
  }
}

function getScrollRuntimeLenis(scrollRuntime) {
  return scrollRuntime?.lenis || null;
}

function createNativeScrollTween() {
  let raf = 0;

  const cancel = () => {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  };

  return {
    scrollTo(targetY, { immediate = false, duration = 0.62, onComplete } = {}) {
      cancel();
      const target = Math.max(0, targetY);

      if (immediate || duration <= 0) {
        window.scrollTo({ top: target, left: window.scrollX, behavior: 'auto' });
        onComplete?.();
        return;
      }

      const startY = getScrollY();
      const distance = target - startY;
      const startTime = performance.now();
      const durationMs = duration * 1000;

      const tick = (now) => {
        const progress = clamp((now - startTime) / durationMs);
        const eased = easeInOutCubic(progress);
        window.scrollTo({ top: startY + distance * eased, left: window.scrollX, behavior: 'auto' });

        if (progress < 1) {
          raf = requestAnimationFrame(tick);
          return;
        }

        raf = 0;
        onComplete?.();
      };

      raf = requestAnimationFrame(tick);
    },
    destroy: cancel
  };
}

function createHomepageSnapCoordinator({
  reduceMotion = false,
  scrollRuntime = null,
  root = document
} = {}) {
  const lenis = getScrollRuntimeLenis(scrollRuntime);
  const nativeTween = createNativeScrollTween();
  const presentationController = createSectionPresentationController({ root });
  const originalLenisScrollTo = lenis?.scrollTo || null;
  const controllers = [];
  let activeController = null;
  let lastScrollY = getScrollY();
  let scrollLockDepth = 0;
  let inputLockUntil = 0;
  let releaseTimer = 0;
  let isProgrammaticScroll = false;
  let programmaticScrollToken = 0;
  const rootElement = root.documentElement || document.documentElement;
  const previousSnapViewportHeight = rootElement?.style?.getPropertyValue(SNAP_VIEWPORT_HEIGHT_VAR) || '';

  const isInputCooldownActive = () => performance.now() < inputLockUntil;
  const shouldBlockScrollInput = () => activeController || isInputCooldownActive();
  const shouldSuppressControllerUpdates = () => (
    activeController || isProgrammaticScroll || isInputCooldownActive()
  );

  const syncLastScrollY = () => {
    lastScrollY = getScrollY();
  };

  const syncControllerSnapHold = (controller, viewportHeight = Math.max(1, window.innerHeight || rootElement?.clientHeight || 1)) => {
    const extraHeight = Math.max(0, viewportHeight * (((controller?.stageHoldVh || 0) + (controller?.postScrollVh || 0)) / 100));
    controller?.host?.style?.setProperty(SNAP_EXTRA_HEIGHT_VAR, `${Math.round(extraHeight)}px`);
  };

  const syncSnapViewportHeight = () => {
    const viewportHeight = Math.ceil(Math.max(1, window.innerHeight || rootElement?.clientHeight || 1));
    rootElement?.style?.setProperty(SNAP_VIEWPORT_HEIGHT_VAR, `${viewportHeight}px`);
    controllers.forEach((controller) => syncControllerSnapHold(controller, viewportHeight));
  };

  const getStageHoldPx = (controller, viewportHeight = Math.max(1, window.innerHeight || 1)) => (
    Math.max(0, viewportHeight * ((controller?.stageHoldVh || 0) / 100))
  );

  const getPostScrollPx = (controller, viewportHeight = Math.max(1, window.innerHeight || 1)) => (
    Math.max(0, viewportHeight * ((controller?.postScrollVh || 0) / 100))
  );

  const getHandoffTargetY = (controller) => (
    controller?.handoffTarget ? Math.max(0, Math.round(getDocumentTop(controller.handoffTarget))) : null
  );

  const getDirectHashTargetY = (controller) => (
    controller?.handoffTarget
      ? Math.max(0, Math.round(getDocumentTop(controller.handoffTarget) - window.innerHeight * 0.2))
      : null
  );

  const isDirectHashTargetVisible = (controller) => {
    if (!controller?.handoffTarget) return true;
    const rect = controller.handoffTarget.getBoundingClientRect();
    const viewportHeight = Math.max(1, window.innerHeight || 1);
    return rect.bottom > viewportHeight * 0.18 && rect.top < viewportHeight * 0.88;
  };

  const syncFixedStageState = (controller, scrollY = getScrollY()) => {
    if (!controller?.host || controller.destroyed) return;
    if (controller.skipForDirectHash && isDirectHashTargetForController(controller)) {
      controller.host.classList.remove(FIXED_STAGE_CLASS);
      return;
    }
    const viewportHeight = Math.max(1, window.innerHeight || 1);
    const hostTop = getDocumentTop(controller.host);
    const stageHoldPx = getStageHoldPx(controller, viewportHeight);
    const postScrollPx = getPostScrollPx(controller, viewportHeight);
    const fixedStart = hostTop;
    const postStart = hostTop + stageHoldPx;
    const postEnd = postStart + postScrollPx;
    const inStageHold = stageHoldPx > 0
      && controller.playhead > 0.001
      && controller.playhead < 0.998
      && scrollY >= fixedStart - 2
      && scrollY <= postStart + 2;
    const inPostScroll = postScrollPx > 0
      && controller.playhead >= 0.998
      && scrollY >= fixedStart - 2
      && scrollY <= postEnd + 2;
    controller.host.classList.toggle(FIXED_STAGE_CLASS, inStageHold || inPostScroll);
  };

  const getSnapDocumentTop = (element) => Math.round(getDocumentTop(element));

  const beginProgrammaticScroll = () => {
    programmaticScrollToken += 1;
    isProgrammaticScroll = true;
    syncLastScrollY();
    return programmaticScrollToken;
  };

  const finishProgrammaticScroll = (token) => {
    if (!token || token !== programmaticScrollToken) return false;
    isProgrammaticScroll = false;
    syncLastScrollY();
    return true;
  };

  const cancelProgrammaticScrollTracking = () => {
    if (!isProgrammaticScroll || activeController) return;
    programmaticScrollToken += 1;
    isProgrammaticScroll = false;
    syncLastScrollY();
  };

  const blockEvent = (event) => {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation?.();
  };

  const clearReleaseTimer = () => {
    if (!releaseTimer) return;
    window.clearTimeout(releaseTimer);
    releaseTimer = 0;
  };

  const preventScrollInput = (event) => {
    if (shouldBlockScrollInput()) {
      blockEvent(event);
      return;
    }
    cancelProgrammaticScrollTracking();
  };

  const preventScrollKeys = (event) => {
    if (!BLOCKED_SCROLL_KEYS.has(event.key)) return;
    if (shouldBlockScrollInput()) {
      blockEvent(event);
      return;
    }
    cancelProgrammaticScrollTracking();
  };

  const lockScroll = () => {
    scrollLockDepth += 1;
    root.documentElement?.classList?.add('homepage-transition-snap-active');
    lenis?.stop?.();
  };

  const unlockScroll = () => {
    scrollLockDepth = Math.max(0, scrollLockDepth - 1);
    if (scrollLockDepth > 0) return;
    root.documentElement?.classList?.remove('homepage-transition-snap-active');
    lenis?.start?.();
  };

  if (lenis && originalLenisScrollTo) {
    lenis.scrollTo = (target, options = {}) => {
      const programmatic = options.programmatic !== false;
      const token = programmatic ? beginProgrammaticScroll() : 0;
      const onComplete = options.onComplete;

      return originalLenisScrollTo.call(lenis, target, {
        ...options,
        onComplete: (...args) => {
          if (programmatic) finishProgrammaticScroll(token);
          onComplete?.(...args);
        }
      });
    };
  }

  const scrollToY = (targetY, options = {}) => {
    if (lenis?.scrollTo) {
      lenis.scrollTo(Math.max(0, targetY), {
        duration: options.duration ?? 0.62,
        easing: easeInOutCubic,
        force: true,
        immediate: Boolean(options.immediate),
        lock: !options.immediate,
        programmatic: options.programmatic !== false,
        onComplete: options.onComplete
      });
      return;
    }

    const programmatic = options.programmatic !== false;
    const token = programmatic ? beginProgrammaticScroll() : 0;
    nativeTween.scrollTo(targetY, {
      ...options,
      onComplete: () => {
        if (programmatic) finishProgrammaticScroll(token);
        options.onComplete?.();
      }
    });
  };

  const getForwardStageTarget = (controller) => (
    controller.stageStops.find((stop) => stop > controller.playhead + 0.001) ?? 1
  );

  const getStagePlayMs = (controller, direction, target) => {
    if (direction < 0) return controller.playMs;
    const stageIndex = target >= 0.998
      ? controller.stageStops.length
      : controller.stageStops.findIndex((stop) => Math.abs(stop - target) < 0.001);
    return controller.stagePlayMs[stageIndex] || controller.playMs;
  };

  const animateProgress = (controller, direction, target, durationMs, onComplete) => {
    const from = controller.playhead;
    const to = target;
    const startTime = performance.now();

    const tick = (now) => {
      if (controller.destroyed) return;
      const progress = clamp((now - startTime) / durationMs);
      controller.playhead = from + (to - from) * easeInOutCubic(progress);
      if (
        direction > 0
        && controller.targetRevealHeld
        && controller.playhead >= controller.targetRevealReleaseProgress
      ) {
        releaseTargetRevealGate(controller);
      }

      if (progress < 1) {
        controller.raf = requestAnimationFrame(tick);
        return;
      }

      controller.raf = 0;
      controller.playhead = to;
      onComplete?.();
    };

    cancelAnimationFrame(controller.raf);
    controller.raf = requestAnimationFrame(tick);
  };

  const beginTargetRevealGate = (controller) => {
    if (!shouldGateTargetReveal(controller) || controller.targetRevealHeld) return;
    controller.handoffTarget.setAttribute('data-section-transition-state', 'gated-in');
    controller.handoffTarget.classList.add('homepage-transition-target-gated');
    controller.targetRevealHeld = true;
  };

  const releaseTargetRevealGate = (controller) => {
    if (!controller?.targetRevealHeld) return;
    controller.targetRevealHeld = false;
    controller.handoffTarget?.removeAttribute('data-section-transition-state');
    controller.handoffTarget?.classList.remove('homepage-transition-target-gated');
    window.requestAnimationFrame?.(() => window.ScrollTrigger?.refresh?.());
  };

  const finishPlayback = (controller, { releaseTargetGate = true } = {}) => {
    controller.host.classList.remove('homepage-transition--snapped', 'homepage-transition--playing');
    syncFixedStageState(controller);
    if (releaseTargetGate) releaseTargetRevealGate(controller);
    inputLockUntil = performance.now() + POST_SNAP_INPUT_LOCK_MS;
    syncLastScrollY();
    clearReleaseTimer();
    releaseTimer = window.setTimeout(() => {
      releaseTimer = 0;
      if (activeController !== controller) return;
      activeController = null;
      unlockScroll();
      syncLastScrollY();
    }, POST_SNAP_INPUT_LOCK_MS);
  };

  const notifyHandoffComplete = (controller) => {
    if (!controller?.handoffTarget) return;
    presentationController.completeHandoff({
      id: controller.handoffId || controller.host?.dataset?.transitionId || '',
      to: controller.handoffTarget?.dataset?.sectionId || controller.handoffTarget?.id || '',
      target: controller.handoffTarget,
      suppressEntryOnce: controller.host?.dataset?.targetEntrySuppressOnce !== 'false'
    });
  };

  const clearDirectHashAlignmentTimers = (controller) => {
    controller?.directHashAlignmentTimers?.forEach((timer) => window.clearTimeout(timer));
    if (controller) controller.directHashAlignmentTimers = [];
  };

  const alignDirectHashTarget = (controller) => {
    if (
      !controller?.skipForDirectHash
      || controller.destroyed
      || !isDirectHashTargetForController(controller)
      || isDirectHashTargetVisible(controller)
    ) return;

    const targetY = getDirectHashTargetY(controller);
    if (!Number.isFinite(targetY)) return;
    scrollToY(targetY, {
      immediate: true,
      duration: 0
    });
  };

  const completeDirectHashHandoff = (controller) => {
    if (!controller?.handoffTarget || !isDirectHashTargetForController(controller)) return;

    controller.handoffComplete = true;
    controller.playedForward = true;
    controller.host.classList.remove(FIXED_STAGE_CLASS);
    if (!controller.directHashHandoffComplete) {
      notifyHandoffComplete(controller);
      controller.directHashHandoffComplete = true;
    }

    clearDirectHashAlignmentTimers(controller);
    controller.directHashAlignmentTimers = DIRECT_HASH_ALIGNMENT_DELAYS.map((delay) => (
      window.setTimeout(() => alignDirectHashTarget(controller), delay)
    ));
  };

  const completePlayback = (controller, direction, { hold = false } = {}) => {
    syncSnapViewportHeight();
    const hostTop = getSnapDocumentTop(controller.host);
    const viewportHeight = Math.max(1, window.innerHeight || 1);
    const shouldEnterPostScroll = !hold && direction > 0 && controller.postScrollVh > 0 && controller.playhead >= 0.998;
    const shouldInstantExit = !hold && direction > 0 && controller.instantExit && controller.playhead >= 0.998;
    const shouldHandoffAfterPlayback = !hold
      && direction > 0
      && controller.handoffPhase === HANDOFF_AFTER_PLAYBACK
      && controller.handoffTarget
      && controller.playhead >= 0.998;
    const exitY = direction > 0
      ? hostTop + controller.host.offsetHeight + 1
      : hostTop - viewportHeight + 1;
    const targetY = hold
      ? hostTop
      : shouldHandoffAfterPlayback
        ? getHandoffTargetY(controller)
        : shouldEnterPostScroll
          ? getScrollY()
          : exitY;

    scrollToY(targetY, {
      immediate: hold || shouldEnterPostScroll || shouldInstantExit || shouldHandoffAfterPlayback,
      duration: hold || shouldEnterPostScroll || shouldInstantExit || shouldHandoffAfterPlayback ? 0 : 0.58,
      onComplete: () => {
        if (hold && direction > 0) {
          controller.playedForward = false;
          controller.playedBackward = false;
        }
        if (shouldHandoffAfterPlayback) {
          controller.handoffComplete = true;
          notifyHandoffComplete(controller);
        }
        finishPlayback(controller, { releaseTargetGate: !hold && direction > 0 });
      }
    });
  };

  const completePostScrollHandoff = (controller) => {
    const targetY = getHandoffTargetY(controller);
    if (!Number.isFinite(targetY)) return;

    controller.handoffComplete = true;
    notifyHandoffComplete(controller);
    clearReleaseTimer();
    inputLockUntil = performance.now() + POST_SNAP_INPUT_LOCK_MS;
    lockScroll();
    scrollToY(targetY, {
      immediate: true,
      duration: 0,
      onComplete: () => {
        controller.host.classList.remove(FIXED_STAGE_CLASS);
        syncLastScrollY();
        releaseTimer = window.setTimeout(() => {
          releaseTimer = 0;
          unlockScroll();
          syncLastScrollY();
        }, POST_SNAP_INPUT_LOCK_MS);
      }
    });
  };

  const playController = (controller, direction) => {
    if (reduceMotion || activeController || controller.destroyed) return;

    syncSnapViewportHeight();
    clearReleaseTimer();
    inputLockUntil = 0;
    activeController = controller;
    if (direction > 0 && controller.handoffId && controller.handoffTarget) {
      presentationController.beginHandoff({
        id: controller.handoffId || controller.host?.dataset?.transitionId || '',
        to: controller.handoffTarget?.dataset?.sectionId || controller.handoffTarget?.id || '',
        target: controller.handoffTarget
      });
    }
    if (direction > 0) {
      beginTargetRevealGate(controller);
    } else {
      releaseTargetRevealGate(controller);
    }
    controller.host.classList.add('homepage-transition--snapped', 'homepage-transition--playing');
    controller.host.dataset.snapState = direction > 0 ? 'forward' : 'backward';
    const target = direction > 0 ? getForwardStageTarget(controller) : 0;
    const hold = direction > 0 && target < 0.998;
    const playMs = getStagePlayMs(controller, direction, target);
    const shouldContinueStagedForward = direction > 0 && controller.playhead > 0.001 && target >= 0.998;
    const snapY = direction > 0 && controller.preserveEntry && controller.playhead <= 0.001
      ? getScrollY()
      : shouldContinueStagedForward
        ? getScrollY()
        : getSnapDocumentTop(controller.host);
    if (direction < 0) controller.host.classList.remove(FIXED_STAGE_CLASS);
    controller.playhead = direction > 0
      ? controller.playhead
      : controller.playhead > 0.001 && controller.playhead < 0.998
        ? controller.playhead
        : 1;
    lockScroll();

    scrollToY(snapY, {
      immediate: true,
      onComplete: () => {
        animateProgress(controller, direction, target, playMs, () => completePlayback(controller, direction, { hold }));
      }
    });
  };

  const updateControllerState = (controller, scrollY, direction) => {
    if (controller.destroyed || activeController) return;

    const viewportHeight = Math.max(1, window.innerHeight || 1);
    const hostTop = getDocumentTop(controller.host);
    const hostHeight = Math.max(viewportHeight, controller.host.offsetHeight || viewportHeight);
    const stageHoldOffset = getStageHoldPx(controller, viewportHeight);
    const forwardEntry = hostTop - viewportHeight * controller.snapEntryVh;
    const stagedForwardEntry = controller.playhead > 0.001 && controller.playhead < 0.998
      ? hostTop + stageHoldOffset
      : forwardEntry;
    const forwardExit = hostTop + hostHeight + viewportHeight * 0.18;
    const backwardEntry = controller.playhead >= 0.998 && controller.postScrollVh > 0
      ? hostTop
      : hostTop + hostHeight + viewportHeight * 0.18;
    const backwardExit = hostTop - viewportHeight * 0.58;

    if (controller.skipForDirectHash && isDirectHashTargetForController(controller)) {
      completeDirectHashHandoff(controller);
      return;
    }

    if (scrollY < backwardExit) {
      controller.playedForward = false;
      controller.playhead = 0;
      controller.handoffComplete = false;
      controller.host.classList.remove(FIXED_STAGE_CLASS);
      releaseTargetRevealGate(controller);
    }

    if (scrollY > hostTop + hostHeight + viewportHeight * 0.58) {
      controller.playedBackward = false;
    }

    if (direction > 0 && !controller.playedForward && scrollY >= stagedForwardEntry && scrollY < forwardExit) {
      controller.playedForward = true;
      controller.playedBackward = false;
      playController(controller, 1);
      return;
    }

    if (direction < 0 && !controller.playedBackward && scrollY <= backwardEntry && scrollY > backwardExit) {
      controller.playedBackward = true;
      controller.playedForward = false;
      playController(controller, -1);
    }
  };

  const onScroll = () => {
    if (reduceMotion) return;
    const scrollY = getScrollY();
    controllers.forEach((controller) => syncFixedStageState(controller, scrollY));
    controllers.forEach((controller) => {
      if (
        controller.destroyed
        || controller.handoffComplete
        || controller.handoffPhase !== HANDOFF_POST_SCROLL
        || !controller.handoffTarget
        || controller.playhead < 0.998
        || controller.postScrollVh <= 0
      ) return;

      const direction = scrollY >= lastScrollY ? 1 : -1;
      if (direction <= 0 || controller.postProgressSource() < 0.995) return;

      completePostScrollHandoff(controller);
    });
    if (shouldSuppressControllerUpdates()) {
      lastScrollY = scrollY;
      return;
    }
    const direction = scrollY >= lastScrollY ? 1 : -1;
    if (Math.abs(scrollY - lastScrollY) < 1) return;
    lastScrollY = scrollY;
    controllers.forEach((controller) => updateControllerState(controller, scrollY, direction));
  };

  const onResize = () => {
    syncSnapViewportHeight();
    lastScrollY = getScrollY();
  };

  syncSnapViewportHeight();

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('wheel', preventScrollInput, { passive: false, capture: true });
  window.addEventListener('touchmove', preventScrollInput, { passive: false, capture: true });
  window.addEventListener('keydown', preventScrollKeys, { capture: true });

  return {
    createController(host) {
      const moduleName = host.dataset.transitionModule;
      const handoffTarget = resolveHandoffTarget(root, host);
      const directHashTargetId = getDirectHashTargetId();
      const isDirectHandoffTarget = Boolean(
        directHashTargetId
        && host.dataset.handoffId
        && handoffTarget
        && (handoffTarget.id === directHashTargetId || handoffTarget.dataset?.sectionId === directHashTargetId)
      );
      const controller = {
        host,
        playhead: reduceMotion ? 1 : 0,
        playMs: Number(host.dataset.transitionPlayMs) || MODULE_PLAY_MS[moduleName] || DEFAULT_PLAY_MS,
        stageStops: parseNumberList(host.dataset.transitionStageStops, { min: 0, max: 1 }).sort((a, b) => a - b),
        stagePlayMs: parseNumberList(host.dataset.transitionStagePlayMs, { min: 0 }),
        stageHoldVh: Math.max(0, parseFiniteNumber(host.dataset.transitionStageHoldVh, 0)),
        postScrollVh: Math.max(0, parseFiniteNumber(host.dataset.transitionPostScrollVh, 0)),
        snapEntryVh: parseFiniteNumber(host.dataset.transitionSnapEntryVh, DEFAULT_SNAP_ENTRY_VH),
        preserveEntry: host.dataset.transitionPreserveEntry === 'true',
        instantExit: host.dataset.transitionInstantExit === 'true',
        handoffTarget,
        handoffId: host.dataset.handoffId || '',
        handoffOwner: host.dataset.handoffOwner || '',
        handoffScrollTo: host.dataset.handoffScrollTo || '',
        handoffTargetSelector: host.dataset.handoffTargetSelector || '',
        handoffPhase: host.dataset.transitionHandoffPhase || '',
        handoffComplete: isDirectHandoffTarget,
        skipForDirectHash: isDirectHandoffTarget,
        directHashHandoffComplete: false,
        directHashAlignmentTimers: [],
        targetRevealHeld: false,
        targetRevealReleaseProgress: clamp(
          parseFiniteNumber(host.dataset.transitionTargetReleaseProgress, DEFAULT_TARGET_GATE_RELEASE_PROGRESS),
          0,
          1
        ),
        raf: 0,
        playedForward: isDirectHandoffTarget,
        playedBackward: false,
        destroyed: false,
        progressSource() {
          return this.playhead;
        },
        postProgressSource() {
          const viewportHeight = Math.max(1, window.innerHeight || 1);
          const postScrollPx = Math.max(0, viewportHeight * ((this.postScrollVh || 0) / 100));
          if (postScrollPx <= 0) return this.playhead >= 0.998 ? 1 : 0;
          const stageHoldPx = Math.max(0, viewportHeight * ((this.stageHoldVh || 0) / 100));
          const postStart = getDocumentTop(this.host) + stageHoldPx;
          return clamp((getScrollY() - postStart) / postScrollPx);
        },
        destroy() {
          this.destroyed = true;
          clearDirectHashAlignmentTimers(this);
          releaseTargetRevealGate(this);
          this.host.classList.remove(FIXED_STAGE_CLASS);
          cancelAnimationFrame(this.raf);
        }
      };
      syncControllerSnapHold(controller);
      controllers.push(controller);
      if (isDirectHandoffTarget) completeDirectHashHandoff(controller);
      return controller;
    },
    destroy() {
      controllers.forEach((controller) => controller.destroy());
      controllers.length = 0;
      clearReleaseTimer();
      programmaticScrollToken += 1;
      isProgrammaticScroll = false;
      inputLockUntil = 0;
      activeController = null;
      scrollLockDepth = 1;
      unlockScroll();
      if (previousSnapViewportHeight) {
        rootElement?.style?.setProperty(SNAP_VIEWPORT_HEIGHT_VAR, previousSnapViewportHeight);
      } else {
        rootElement?.style?.removeProperty(SNAP_VIEWPORT_HEIGHT_VAR);
      }
      if (lenis && originalLenisScrollTo) lenis.scrollTo = originalLenisScrollTo;
      presentationController.clear();
      nativeTween.destroy();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('wheel', preventScrollInput, true);
      window.removeEventListener('touchmove', preventScrollInput, true);
      window.removeEventListener('keydown', preventScrollKeys, true);
    }
  };
}

function fallbackHost(host, error) {
  console.warn('Homepage transition failed; using soft divider.', error);
  host.dataset.transitionModule = 'soft-divider';
  host.classList.add('chapter-transition--fallback', 'scene-transition--fallback');
}

export async function initHomepageTransitions({
  root = document,
  reduceMotion = false,
  scrollRuntime = null,
  gsap = window.gsap,
  ScrollTrigger = window.ScrollTrigger
} = {}) {
  const cleanup = createCleanupStack();
  const hosts = [...root.querySelectorAll(NAMED_TRANSITION_SELECTOR)];
  const snapCoordinator = createHomepageSnapCoordinator({ root, reduceMotion, scrollRuntime });
  cleanup.add(snapCoordinator);

  await Promise.all(hosts.map(async (host) => {
    const moduleName = host.dataset.transitionModule;
    if (!moduleName || SOFT_MODULES.has(moduleName)) return;

    if (reduceMotion) {
      host.classList.add(REDUCED_MOTION_CLASS);
      cleanup.add(() => host.classList.remove(REDUCED_MOTION_CLASS));
      return;
    }

    const loadAdapter = homepageTransitionRegistry[moduleName];
    if (!loadAdapter) {
      fallbackHost(host, new Error(`Unknown homepage transition module: ${moduleName}`));
      return;
    }

    try {
      const runtimeMode = host.dataset.transitionRuntimeMode || 'legacy-snap';
      const isProgressWindow = runtimeMode === RUNTIME_PROGRESS_WINDOW;
      // 修改：progress-window 也应该创建 snapController（snap + autoplay）
      // 只有明确 drive='scroll' 或在 SCROLL_DRIVEN_MODULES 里的才是 scroll-driven
      const isScrollDriven = host.dataset.transitionDrive === 'scroll' || SCROLL_DRIVEN_MODULES.has(moduleName);
      const snapController = isScrollDriven ? null : snapCoordinator.createController(host);
      const semanticWindows = parseWindowSpec(host.dataset.transitionWindowSpec);
      const baseProgressSource = isProgressWindow
        ? createProgressWindowSource(host, root)
        : isScrollDriven
          ? (host.dataset.transitionId === 'home-belief'
            ? createHeroLinkedScrollProgressSource(host)
            : createElementScrollProgressSource(host))
          : () => snapController.progressSource();
      const progressSource = () => {
        const progress = baseProgressSource();
        if (isProgressWindow) syncProgressWindowMetadata(host, progress, semanticWindows);
        return progress;
      };
      const handoffTarget = resolveHandoffTarget(root, host);
      const handoffProgressSource = snapController?.handoffPhase === HANDOFF_POST_SCROLL
        ? snapController.postProgressSource.bind(snapController)
        : progressSource;
      const adapterModule = await loadAdapter();
      const mount = adapterModule.mountHomepageTransition || adapterModule.mountPatternBloomTransition;
      if (typeof mount !== 'function') {
        throw new Error(`Transition module ${moduleName} has no homepage mount function.`);
      }

      cleanup.add(mount({
        host,
        reduceMotion,
        progressSource,
        postProgressSource: snapController?.postProgressSource?.bind(snapController),
        handoffTarget,
        handoffProgressSource,
        addCleanup: cleanup.add,
        gsap,
        ScrollTrigger
      }));
    } catch (error) {
      fallbackHost(host, error);
    }
  }));

  window.addEventListener('pagehide', cleanup.destroy, { once: true });
  cleanup.add(() => window.removeEventListener('pagehide', cleanup.destroy));

  return cleanup;
}
