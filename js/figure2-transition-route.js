import {
  createFigure2TransitionController,
  renderFigure2TransitionState,
  waitForFigure2TransitionMedia
} from './components/figure2-transition.js';
import { createTransitionRoute } from './transitions/route-entry.js';

const root = document.documentElement;
const body = document.body;
const stage = document.querySelector('[data-figure2-route-stage]');
let fallbackDestroy = null;

function destroyFallback() {
  fallbackDestroy?.();
  fallbackDestroy = null;
}

if (stage) {
  const controller = createFigure2TransitionController(stage, {
    root,
    body
  });

  if (controller) {
    createTransitionRoute({
      name: 'Figure 2 route-entry transition',
      root,
      body,
      stage,
      smoothOptions: {
        lerp: controller.config.lenisLerp,
        wheelMultiplier: controller.config.wheelMultiplier,
        syncTouch: false
      },
      prepare: () => {
        controller.prepare();
      },
      onReducedMotion: () => {
        controller.mountReducedMotion();
      },
      beforeMount: () => waitForFigure2TransitionMedia(stage),
      mount: (context) => controller.mountGsap(context),
      onError: (error, context) => {
        console.warn('Figure 2 route-entry transition fell back to native scroll sync.', error);
        fallbackDestroy = controller.mountNativeFallback(context.reduceMotion);
      }
    });
  } else {
    renderFigure2TransitionState(stage, {
      introProgress: 1,
      transitionProgress: 0
    });
  }
}

window.addEventListener('pagehide', destroyFallback, { once: true });
