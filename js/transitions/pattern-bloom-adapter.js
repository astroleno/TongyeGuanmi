import { createPatternBloomScene } from '../pattern-mirror-stage.js';
import { createInkCurtainTransition } from '../effects/ink-scene-transition.js';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const range01 = (value, start, end) => clamp((value - start) / Math.max(0.001, end - start));
const smoothStep = (value) => value * value * (3 - 2 * value);

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
  const previousAriaHidden = host.getAttribute('aria-hidden');
  const previousRole = host.getAttribute('role');
  const previousAriaLabel = host.getAttribute('aria-label');
  host.removeAttribute('aria-hidden');
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', '同野观幂一句话讲清我们干什么');

  const doc = host.ownerDocument || document;
  const stage = doc.createElement('div');
  stage.className = 'pattern-bloom-transition__stage';

  const canvas = doc.createElement('canvas');
  canvas.className = 'pattern-bloom-transition__canvas';
  canvas.setAttribute('aria-hidden', 'true');

  const exitInkCanvas = doc.createElement('canvas');
  exitInkCanvas.className = 'pattern-bloom-transition__exit-ink';
  exitInkCanvas.setAttribute('aria-hidden', 'true');

  const copy = doc.createElement('div');
  copy.className = 'pattern-bloom-transition__copy';
  copy.innerHTML = `
    <div class="section-index">同野观幂 / 00</div>
    <span class="card-label">一句话讲清我们干什么</span>
    <h3>让 AI 从一场培训，变成账上的数字。</h3>
    <p>我们不卖课、不卖软件，而是进到你的业务现场，把 AI 做成团队天天在用、月底对得上账的东西。</p>
  `;

  stage.append(canvas, copy, exitInkCanvas);
  host.append(stage);
  const exitInkTransition = createInkCurtainTransition(exitInkCanvas, {
    direction: 'bottom-up',
    colorLift: 0.56,
    coverAlpha: 1,
    fadeOutStart: 0.98,
    fadeOutEnd: 1,
    progressSpan: 1
  });
  const isHomeBeliefTransition = host.dataset.transitionId === 'home-belief'
    || host.dataset.transition === 'home-belief';
  const getRawProgress = () => (typeof progressSource === 'function' ? clamp(progressSource()) : 0);
  const getPatternProgress = () => {
    const progress = getRawProgress();
    return isHomeBeliefTransition ? Math.max(0.98, progress) : progress;
  };

  const scene = createPatternBloomScene({
    canvas,
    progressSource: getPatternProgress,
    reducedMotion: reduceMotion,
    reducedMotionProgress: 1,
    continuousMotion: true,
    scrollDrivenMotion: true,
    dprLimit: 1,
    center: {
      x: 0.24,
      y: 0.55,
      mobileX: 0.50,
      mobileY: 0.58
    }
  });

  let destroyed = false;
  let overlayRaf = 0;
  const renderOverlays = () => {
    if (destroyed) return;
    const progress = getRawProgress();
    const exitProgress = range01(progress, 0.62, 1);
    const lotusOpacity = 1 - smoothStep(range01(progress, 0.56, 0.86));

    canvas.style.opacity = lotusOpacity.toFixed(4);
    canvas.style.visibility = lotusOpacity > 0.002 ? 'visible' : 'hidden';
    copy.style.opacity = (1 - smoothStep(range01(progress, 0.58, 0.82))).toFixed(4);
    exitInkTransition?.render(exitProgress);
    overlayRaf = requestAnimationFrame(renderOverlays);
  };
  renderOverlays();

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(overlayRaf);
    scene.destroy();
    stage.remove();
    host.classList.remove('homepage-transition', 'homepage-transition--pattern-bloom', 'chapter-transition--pattern-bloom');
    if (previousAriaHidden === null) {
      host.removeAttribute('aria-hidden');
    } else {
      host.setAttribute('aria-hidden', previousAriaHidden);
    }
    if (previousRole === null) {
      host.removeAttribute('role');
    } else {
      host.setAttribute('role', previousRole);
    }
    if (previousAriaLabel === null) {
      host.removeAttribute('aria-label');
    } else {
      host.setAttribute('aria-label', previousAriaLabel);
    }
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
