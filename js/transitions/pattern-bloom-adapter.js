import { createPatternBloomScene } from '../pattern-mirror-stage.js';

export function mountPatternBloomTransition({
  host,
  reduceMotion = false,
  progressSource,
  addCleanup
} = {}) {
  if (!host || host.dataset.patternBloomMounted === 'true') {
    return { destroy() {} };
  }

  host.dataset.patternBloomMounted = 'true';
  host.classList.add('homepage-transition', 'homepage-transition--pattern-bloom', 'chapter-transition--pattern-bloom');

  const doc = host.ownerDocument || document;
  const stage = doc.createElement('div');
  stage.className = 'pattern-bloom-transition__stage';

  const canvas = doc.createElement('canvas');
  canvas.className = 'pattern-bloom-transition__canvas';
  canvas.setAttribute('aria-hidden', 'true');

  stage.append(canvas);
  host.append(stage);

  const scene = createPatternBloomScene({
    canvas,
    progressSource: typeof progressSource === 'function' ? progressSource : () => 0,
    reducedMotion: reduceMotion,
    reducedMotionProgress: 1,
    continuousMotion: true,
    scrollDrivenMotion: true,
    dprLimit: 1,
    center: {
      x: 0.28,
      y: 0.55,
      mobileX: 0.42,
      mobileY: 0.58
    }
  });

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    scene.destroy();
    stage.remove();
    host.classList.remove('homepage-transition', 'homepage-transition--pattern-bloom', 'chapter-transition--pattern-bloom');
    delete host.dataset.patternBloomMounted;
  };

  scene.start().catch((error) => {
    console.warn('Pattern bloom transition failed; falling back to soft divider.', error);
    host.dataset.transitionModule = 'soft-divider';
    host.classList.add('chapter-transition--fallback', 'scene-transition--fallback');
    destroy();
  });

  addCleanup?.(destroy);
  return { destroy };
}
