import { homepageTransitionRegistry } from './homepage-transition-registry.js';

const NAMED_TRANSITION_SELECTOR = [
  '.chapter-transition[data-transition-module]',
  '.scene-transition[data-transition-module]'
].join(',');

const SOFT_MODULES = new Set(['soft-divider', 'soft-drilldown', 'soft-breath']);
const SNAP_SELECTOR = [
  '.chapter-transition[data-transition-module]',
  '.scene-transition[data-transition-module]'
].join(',');

const DEFAULT_PLAY_MS = 1900;
const MODULE_PLAY_MS = {
  aod: 1800,
  figure2: 2200,
  'pattern-bloom': 2200,
  ttg: 2300,
  'figure3-transition': 1800,
  ph: 1900,
  crane: 2200
};

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeInOutCubic = (value) => {
  const p = clamp(value);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
};

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
  const controllers = [];
  let activeController = null;
  let lastScrollY = getScrollY();
  let scrollLockDepth = 0;

  const preventScrollInput = (event) => {
    if (!activeController) return;
    event.preventDefault();
  };

  const preventScrollKeys = (event) => {
    if (!activeController) return;
    const blockedKeys = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']);
    if (!blockedKeys.has(event.key)) return;
    event.preventDefault();
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

  const scrollToY = (targetY, options = {}) => {
    if (lenis?.scrollTo) {
      lenis.scrollTo(Math.max(0, targetY), {
        duration: options.duration ?? 0.62,
        easing: easeInOutCubic,
        force: true,
        immediate: Boolean(options.immediate),
        lock: !options.immediate,
        onComplete: options.onComplete
      });
      return;
    }

    nativeTween.scrollTo(targetY, options);
  };

  const animateProgress = (controller, direction, onComplete) => {
    const from = controller.playhead;
    const to = direction > 0 ? 1 : 0;
    const durationMs = controller.playMs;
    const startTime = performance.now();

    const tick = (now) => {
      if (controller.destroyed) return;
      const progress = clamp((now - startTime) / durationMs);
      controller.playhead = from + (to - from) * easeInOutCubic(progress);

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

  const completePlayback = (controller, direction) => {
    const hostTop = getDocumentTop(controller.host);
    const viewportHeight = Math.max(1, window.innerHeight || 1);
    const exitY = direction > 0
      ? hostTop + controller.host.offsetHeight + 1
      : hostTop - viewportHeight + 1;

    scrollToY(exitY, {
      duration: 0.58,
      onComplete: () => {
        controller.host.classList.remove('homepage-transition--snapped', 'homepage-transition--playing');
        activeController = null;
        unlockScroll();
        lastScrollY = getScrollY();
      }
    });
  };

  const playController = (controller, direction) => {
    if (reduceMotion || activeController || controller.destroyed) return;

    activeController = controller;
    controller.host.classList.add('homepage-transition--snapped', 'homepage-transition--playing');
    controller.host.dataset.snapState = direction > 0 ? 'forward' : 'backward';
    controller.playhead = direction > 0 ? 0 : 1;
    lockScroll();

    scrollToY(getDocumentTop(controller.host), {
      immediate: true,
      onComplete: () => {
        animateProgress(controller, direction, () => completePlayback(controller, direction));
      }
    });
  };

  const updateControllerState = (controller, scrollY, direction) => {
    if (controller.destroyed || activeController) return;

    const viewportHeight = Math.max(1, window.innerHeight || 1);
    const hostTop = getDocumentTop(controller.host);
    const hostHeight = Math.max(viewportHeight, controller.host.offsetHeight || viewportHeight);
    const forwardEntry = hostTop - viewportHeight * 0.26;
    const forwardExit = hostTop + hostHeight + viewportHeight * 0.18;
    const backwardEntry = hostTop + hostHeight + viewportHeight * 0.18;
    const backwardExit = hostTop - viewportHeight * 0.58;

    if (scrollY < backwardExit) {
      controller.playedForward = false;
    }

    if (scrollY > hostTop + hostHeight + viewportHeight * 0.58) {
      controller.playedBackward = false;
    }

    if (direction > 0 && !controller.playedForward && scrollY >= forwardEntry && scrollY < forwardExit) {
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
    if (reduceMotion || activeController) return;
    const scrollY = getScrollY();
    const direction = scrollY >= lastScrollY ? 1 : -1;
    if (Math.abs(scrollY - lastScrollY) < 1) return;
    lastScrollY = scrollY;
    controllers.forEach((controller) => updateControllerState(controller, scrollY, direction));
  };

  const onResize = () => {
    lastScrollY = getScrollY();
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('wheel', preventScrollInput, { passive: false });
  window.addEventListener('touchmove', preventScrollInput, { passive: false });
  window.addEventListener('keydown', preventScrollKeys);

  return {
    createController(host) {
      const moduleName = host.dataset.transitionModule;
      const controller = {
        host,
        playhead: reduceMotion ? 1 : 0,
        playMs: Number(host.dataset.transitionPlayMs) || MODULE_PLAY_MS[moduleName] || DEFAULT_PLAY_MS,
        raf: 0,
        playedForward: false,
        playedBackward: false,
        destroyed: false,
        progressSource() {
          return this.playhead;
        },
        destroy() {
          this.destroyed = true;
          cancelAnimationFrame(this.raf);
        }
      };
      controllers.push(controller);
      return controller;
    },
    destroy() {
      controllers.forEach((controller) => controller.destroy());
      controllers.length = 0;
      activeController = null;
      scrollLockDepth = 1;
      unlockScroll();
      nativeTween.destroy();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('wheel', preventScrollInput);
      window.removeEventListener('touchmove', preventScrollInput);
      window.removeEventListener('keydown', preventScrollKeys);
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

    const loadAdapter = homepageTransitionRegistry[moduleName];
    if (!loadAdapter) {
      fallbackHost(host, new Error(`Unknown homepage transition module: ${moduleName}`));
      return;
    }

    try {
      const snapController = snapCoordinator.createController(host);
      const adapterModule = await loadAdapter();
      const mount = adapterModule.mountHomepageTransition || adapterModule.mountPatternBloomTransition;
      if (typeof mount !== 'function') {
        throw new Error(`Transition module ${moduleName} has no homepage mount function.`);
      }

      cleanup.add(mount({
        host,
        reduceMotion,
        progressSource: () => snapController.progressSource(),
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
