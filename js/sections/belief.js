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
    autoplay: false,
    config: {
      revealDurationMs: 2800,
      loopTransitionMs: 1200
    }
  });

  let raf = 0;
  let destroyed = false;
  const renderLiveBackground = (now = performance.now()) => {
    if (destroyed || !reveal.ready) return;
    const timeSeconds = now / 1000;
    const pulse = reduceMotion ? 0 : (Math.sin(timeSeconds * 0.34) * 0.08 + Math.sin(timeSeconds * 0.17) * 0.05);
    reveal.renderBackground({
      timeSeconds,
      strength: reduceMotion ? 0.72 : 1.05 + pulse,
      noiseFloor: reduceMotion ? 0.02 : 0.028
    });
    canvas.dataset.inkTextureReady = 'true';
    if (!reduceMotion) {
      raf = window.requestAnimationFrame(renderLiveBackground);
    }
  };

  const markReady = () => {
    if (destroyed) return;
    if (!reveal.ready) {
      raf = window.requestAnimationFrame(markReady);
      return;
    }

    canvas.classList.add('is-ready');
    canvas.dataset.inkTextureReady = 'true';
    renderLiveBackground();
  };

  markReady();

  return {
    destroy() {
      destroyed = true;
      window.cancelAnimationFrame(raf);
      reveal.dispose();
      canvas.classList.remove('is-ready');
      delete canvas.dataset.inkTextureReady;
    }
  };
}
