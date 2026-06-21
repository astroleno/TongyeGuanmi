import { createCraneTransitionScene } from './components/crane-transition.js';
import { createTransitionRoute } from './transitions/route-entry.js';

const root = document.documentElement;
const mountedRoutes = new Set();

export function initCraneTransitionRoute(stage = document.querySelector('[data-crane-route-stage]')) {
  if (!stage) return null;
  if (stage.__craneTransitionRoute) return stage.__craneTransitionRoute;

  const sceneState = createCraneTransitionScene(stage);
  if (!sceneState) return null;

  let fallbackDestroy = null;
  const route = createTransitionRoute({
    name: 'Crane route-entry transition',
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
    onReducedMotion: () => {
      sceneState.mountReducedMotion();
    },
    beforeMount: () => sceneState.waitForVideos(),
    mount: (context) => sceneState.mountGsap(context),
    onError: (error, context) => {
      console.warn('Crane route-entry transition fell back to native scroll sync.', error);
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
      if (stage.__craneTransitionRoute === mountedRoute) {
        delete stage.__craneTransitionRoute;
      }
    },
    renderRawProgress: sceneState.renderRawProgress
  };

  stage.__craneTransitionRoute = mountedRoute;
  mountedRoutes.add(mountedRoute);
  return mountedRoute;
}

document.querySelectorAll('[data-crane-route-stage]').forEach((stage) => initCraneTransitionRoute(stage));

window.addEventListener('pagehide', () => {
  [...mountedRoutes].forEach((route) => route.destroy());
});
