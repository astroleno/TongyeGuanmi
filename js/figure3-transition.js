import { mountFigure3Transitions } from './components/figure3-transition.js';
import { loadTransitionLibraries } from './transitions/load-libraries.js';
import { createReduceMotionState, initTransitionScrollRuntime } from './transitions/scroll-scene.js';

const root = document.documentElement;
const body = document.body;
const reduceMotion = createReduceMotionState();

async function init() {
  let gsap = null;
  let ScrollTrigger = null;

  if (!reduceMotion) {
    ({ gsap, ScrollTrigger } = await loadTransitionLibraries());
    initTransitionScrollRuntime({
      root,
      body,
      reduceMotion,
      gsap,
      ScrollTrigger,
      smoothOptions: {
        lerp: 0.08,
        wheelMultiplier: 0.82,
        syncTouch: false
      }
    });
  }

  await mountFigure3Transitions({
    gsap,
    ScrollTrigger,
    reduceMotion,
    loadLibraries: false
  });
}

init().catch((error) => {
  console.warn('Figure 3 transition test failed to initialize.', error);
});
