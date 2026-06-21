import { homepageTransitionRegistry } from './homepage-transition-registry.js';

const NAMED_TRANSITION_SELECTOR = [
  '.chapter-transition[data-transition-module]',
  '.scene-transition[data-transition-module]'
].join(',');

const SOFT_MODULES = new Set(['soft-divider', 'soft-drilldown', 'soft-breath']);

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

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

function createHostProgressSource(host) {
  return () => {
    const viewportHeight = Math.max(1, window.innerHeight || 1);
    const rect = host.getBoundingClientRect();
    const scrollable = Math.max(1, host.offsetHeight - viewportHeight);
    return clamp(-rect.top / scrollable);
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
  gsap = window.gsap,
  ScrollTrigger = window.ScrollTrigger
} = {}) {
  const cleanup = createCleanupStack();
  const hosts = [...root.querySelectorAll(NAMED_TRANSITION_SELECTOR)];

  await Promise.all(hosts.map(async (host) => {
    const moduleName = host.dataset.transitionModule;
    if (!moduleName || SOFT_MODULES.has(moduleName)) return;

    const loadAdapter = homepageTransitionRegistry[moduleName];
    if (!loadAdapter) {
      fallbackHost(host, new Error(`Unknown homepage transition module: ${moduleName}`));
      return;
    }

    try {
      const adapterModule = await loadAdapter();
      const mount = adapterModule.mountHomepageTransition || adapterModule.mountPatternBloomTransition;
      if (typeof mount !== 'function') {
        throw new Error(`Transition module ${moduleName} has no homepage mount function.`);
      }

      cleanup.add(mount({
        host,
        reduceMotion,
        progressSource: createHostProgressSource(host),
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
