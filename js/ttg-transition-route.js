import { createTtgTransitionScene } from './components/ttg-transition.js';
import { createTransitionRoute } from './transitions/route-entry.js';

const root = document.documentElement;
const mountedRoutes = new Set();

export function initTtgTransitionRoute(stage = document.querySelector('[data-ttg-route-stage]')) {
  if (!stage) return null;
  if (stage.__ttgTransitionRoute) return stage.__ttgTransitionRoute;

  const sceneState = createTtgTransitionScene(stage);
  if (!sceneState) return null;

  let fallbackDestroy = null;
  const route = createTransitionRoute({
    name: 'TTG route-entry transition',
    root,
    body: document.body,
    stage,
    smoothOptions: {
      lerp: 0.08,
      wheelMultiplier: 0.82,
      syncTouch: false
    },
    prepare: () => {
      sceneState.prepare();
    },
    onReducedMotion: () => sceneState.mountReducedMotion(),
    beforeMount: () => sceneState.waitForMedia(),
    mount: (context) => sceneState.mountGsap(context),
    onError: (error, context) => {
      console.warn('TTG route-entry transition fell back to native scroll sync.', error);
      fallbackDestroy = sceneState.mountNativeFallback(context.reduceMotion);
    }
  });

  const mountedRoute = {
    stage,
    route,
    ready: route.ready,
    destroy() {
      fallbackDestroy?.();
      fallbackDestroy = null;
      route.destroy();
      sceneState.destroy();
      mountedRoutes.delete(mountedRoute);
      if (stage.__ttgTransitionRoute === mountedRoute) {
        delete stage.__ttgTransitionRoute;
      }
    },
    renderRawProgress: sceneState.renderRawProgress
  };

  stage.__ttgTransitionRoute = mountedRoute;
  mountedRoutes.add(mountedRoute);
  return mountedRoute;
}

document.querySelectorAll('[data-ttg-route-stage]').forEach((stage) => initTtgTransitionRoute(stage));

window.addEventListener('pagehide', () => {
  [...mountedRoutes].forEach((route) => route.destroy());
});
