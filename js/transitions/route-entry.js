import { loadTransitionLibraries } from './load-libraries.js';
import { createReduceMotionState, initTransitionScrollRuntime } from './scroll-scene.js';

const noop = () => {};

function resolveStage(stage, selector) {
  if (stage) return stage;
  if (!selector) return null;
  return document.querySelector(selector);
}

function createCleanupStack() {
  const cleanups = [];
  let destroyed = false;

  return {
    get destroyed() {
      return destroyed;
    },
    add(cleanup) {
      if (!cleanup) return;

      const destroy = typeof cleanup === 'function' ? cleanup : cleanup.destroy;
      if (typeof destroy !== 'function') return;

      if (destroyed) {
        destroy.call(cleanup);
        return;
      }

      cleanups.push(() => destroy.call(cleanup));
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;

      while (cleanups.length) {
        const cleanup = cleanups.pop();
        try {
          cleanup();
        } catch (error) {
          console.warn('Transition cleanup failed.', error);
        }
      }
    }
  };
}

function reportInitError(error, context) {
  context.logger?.warn?.(`${context.name} failed to initialize.`, error);
}

export function createTransitionRoute({
  name = 'Transition route',
  root = document.documentElement,
  body = document.body,
  stage = null,
  stageSelector = '',
  reduceMotion = createReduceMotionState(),
  smoothOptions = {},
  libraryOptions = {},
  prepare = noop,
  beforeMount = noop,
  onReducedMotion = noop,
  mount = noop,
  onError = reportInitError,
  refreshOnMount = true,
  logger = console
} = {}) {
  const cleanupStack = createCleanupStack();
  const resolvedStage = resolveStage(stage, stageSelector);
  const context = {
    name,
    root,
    body,
    stage: resolvedStage,
    reduceMotion,
    smoothOptions,
    addCleanup: cleanupStack.add,
    logger,
    gsap: null,
    ScrollTrigger: null,
    Lenis: null,
    scrollRuntime: null
  };

  if (!resolvedStage) {
    return {
      stage: null,
      ready: Promise.resolve(context),
      destroy: cleanupStack.destroy,
      addCleanup: cleanupStack.add
    };
  }

  const pagehideCleanup = () => cleanupStack.destroy();
  window.addEventListener('pagehide', pagehideCleanup, { once: true });
  cleanupStack.add(() => window.removeEventListener('pagehide', pagehideCleanup));

  const ready = (async () => {
    cleanupStack.add(await prepare(context));
    if (cleanupStack.destroyed) return context;

    if (reduceMotion) {
      cleanupStack.add(await onReducedMotion(context));
      return context;
    }

    cleanupStack.add(await beforeMount(context));
    if (cleanupStack.destroyed) return context;

    const libraries = await loadTransitionLibraries(libraryOptions);
    Object.assign(context, libraries);
    if (cleanupStack.destroyed) return context;

    const scrollScene = initTransitionScrollRuntime({
      root,
      body,
      reduceMotion,
      gsap: libraries.gsap,
      ScrollTrigger: libraries.ScrollTrigger,
      smoothOptions
    });
    context.scrollRuntime = scrollScene.scrollRuntime;
    cleanupStack.add(scrollScene);

    cleanupStack.add(await mount(context));
    if (refreshOnMount) libraries.ScrollTrigger.refresh?.();
    return context;
  })().catch((error) => {
    cleanupStack.destroy();
    try {
      onError(error, context);
    } catch (onErrorFailure) {
      logger?.warn?.(`${name} error handler failed.`, onErrorFailure);
    }
    return context;
  });

  return {
    stage: resolvedStage,
    ready,
    destroy: cleanupStack.destroy,
    addCleanup: cleanupStack.add
  };
}
