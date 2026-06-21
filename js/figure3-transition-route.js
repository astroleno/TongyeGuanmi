import { initFigure3Transition, prepareFigure3Transition, renderFigure3TransitionProgress, waitForFigure3TransitionMetadata } from './components/figure3-transition.js';
import { createTransitionRoute } from './transitions/route-entry.js';

const root = document.documentElement;
const body = document.body;
const stage = document.querySelector('[data-figure3-route-stage]');

if (stage) {
  createTransitionRoute({
    name: 'Figure 3 route-entry transition',
    root,
    body,
    stage,
    smoothOptions: {
      lerp: 0.08,
      wheelMultiplier: 0.82,
      syncTouch: false
    },
    prepare: () => {
      const { alphaVideo } = prepareFigure3Transition(stage, { progress: 0 });
      return () => alphaVideo?.pause?.();
    },
    onReducedMotion: () => {
      let active = true;

      renderFigure3TransitionProgress(stage, 1);
      waitForFigure3TransitionMetadata(stage).then(() => {
        if (active) renderFigure3TransitionProgress(stage, 1);
      });

      return () => {
        active = false;
      };
    },
    beforeMount: () => waitForFigure3TransitionMetadata(stage),
    mount: ({ gsap, ScrollTrigger }) => initFigure3Transition(stage, {
      gsap,
      ScrollTrigger,
      reduceMotion: false,
      refresh: false
    }),
    onError: (error) => {
      console.warn('Figure 3 route-entry transition failed to initialize.', error);
      renderFigure3TransitionProgress(stage, 0);
    }
  });
}
