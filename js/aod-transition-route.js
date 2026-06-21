import { initAodTransition, prepareAodTransition, renderAodTransitionProgress, waitForAodTransitionMetadata } from './components/aod-transition.js';
import { createTransitionRoute } from './transitions/route-entry.js';

const root = document.documentElement;
const body = document.body;
const stage = document.querySelector('[data-aod-route-stage]');

if (stage) {
  createTransitionRoute({
    name: 'AOD route-entry transition',
    root,
    body,
    stage,
    smoothOptions: {
      lerp: 0.08,
      wheelMultiplier: 0.82,
      syncTouch: false
    },
    prepare: () => {
      const { figureVideo } = prepareAodTransition(stage, { progress: 0 });
      return () => figureVideo?.pause?.();
    },
    onReducedMotion: () => {
      let active = true;

      renderAodTransitionProgress(stage, 1);
      waitForAodTransitionMetadata(stage).then(() => {
        if (active) renderAodTransitionProgress(stage, 1);
      });

      return () => {
        active = false;
      };
    },
    beforeMount: () => waitForAodTransitionMetadata(stage),
    mount: ({ gsap, ScrollTrigger }) => initAodTransition(stage, {
      gsap,
      ScrollTrigger,
      reduceMotion: false,
      refresh: false
    }),
    onError: (error) => {
      console.warn('AOD route-entry transition failed to initialize.', error);
      renderAodTransitionProgress(stage, 0);
    }
  });
}
