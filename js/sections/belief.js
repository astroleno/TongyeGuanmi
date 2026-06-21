import { initStarFieldReveal } from '../effects/star-field-reveal.js';

const BELIEF_SCENE_SRC = 'assets/back2.png';

export function initBeliefStarField({
  root = document,
  reduceMotion = false
} = {}) {
  const canvas = root.querySelector('[data-belief-star-field]');
  if (!canvas) return { destroy() {} };

  const reveal = initStarFieldReveal({
    canvas,
    sourceUrl: BELIEF_SCENE_SRC,
    autoplay: !reduceMotion,
    config: {
      revealDurationMs: 2800,
      loopTransitionMs: 1200
    }
  });

  let raf = 0;
  let destroyed = false;

  const markReady = () => {
    if (destroyed) return;
    if (!reveal.ready) {
      raf = window.requestAnimationFrame(markReady);
      return;
    }

    canvas.classList.add('is-ready');
    if (reduceMotion) {
      reveal.renderBackground({
        strength: 0.72,
        noiseFloor: 0.02
      });
    }
  };

  markReady();

  return {
    destroy() {
      destroyed = true;
      window.cancelAnimationFrame(raf);
      reveal.dispose();
      canvas.classList.remove('is-ready');
    }
  };
}
