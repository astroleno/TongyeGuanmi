import {
  prepareFigure3Transition,
  renderFigure3TransitionProgress,
  waitForFigure3TransitionMetadata
} from '../../components/figure3-transition.js';
import { createInkCurtainTransition } from '../../effects/ink-scene-transition.js';
import { createHandoffReceiver } from './handoff-receiver.js';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const range01 = (value, start, end) => clamp((value - start) / Math.max(0.0001, end - start));
const smoothStep = (value) => value * value * (3 - 2 * value);

function resolveFigure3Phase(progress, receiverOpacity) {
  if (receiverOpacity >= 0.35) return 'servicesReceiver';
  if (progress < 0.58) return 'scene';
  if (progress < 0.92) return 'exitInk';
  return 'handoff';
}

export function mountHomepageTransition({ host, reduceMotion = false, progressSource, handoffTarget, addCleanup }) {
  host.classList.add('homepage-transition', 'homepage-transition--figure3');
  host.innerHTML = `
    <section
      class="figure3-transition"
      data-figure3-transition
      data-figure3-duration="2"
      data-figure3-scroll-vh="20"
      aria-hidden="true"
    >
      <div class="figure3-transition__sticky">
        <div class="figure3-transition__backdrop" aria-hidden="true"></div>
        <div class="figure3-transition__stage" aria-hidden="true">
          <video class="figure3-transition__video" data-figure3-alpha-video src="assets/figure3-alpha-scrub.webm?v=1280-q40" poster="assets/figure3-alpha-poster.png" muted preload="auto" playsinline webkit-playsinline></video>
          <div class="figure3-transition__fill" data-figure3-fill aria-hidden="true"></div>
          <div class="figure3-transition__visual-bridge" data-transition-ghost="figure3-fabric" aria-hidden="true"></div>
          <canvas class="figure3-transition__ink" data-transition-ink-surface data-transition-id="brand-services" data-ink-kind="decorativeInk" aria-hidden="true"></canvas>
        </div>
      </div>
    </section>
  `;

  const section = host.querySelector('[data-figure3-transition]');
  const stage = host.querySelector('.figure3-transition__stage');
  const inkCanvas = host.querySelector('.figure3-transition__ink');
  const { alphaVideo } = prepareFigure3Transition(section, { progress: reduceMotion ? 1 : 0 });
  const exitInk = reduceMotion ? null : createInkCurtainTransition(inkCanvas, {
    direction: 'top-down',
    colorLift: 0.58,
    coverAlpha: 0.52,
    fadeOutStart: 0.76,
    fadeOutEnd: 1,
    progressSpan: 1
  });
  const servicesReceiver = createHandoffReceiver({
    container: stage,
    target: handoffTarget || host.ownerDocument.querySelector('#services'),
    sourceSelector: '.enterprise-vertical-layout',
    className: 'homepage-handoff-receiver--services',
    mode: 'projection'
  });
  let raf = 0;
  let destroyed = false;

  const render = () => {
    if (destroyed) return;
    const progress = reduceMotion ? 1 : progressSource();
    const metrics = renderFigure3TransitionProgress(section, progress) || {};
    const inkProgress = smoothStep(range01(progress, 0.58, 0.92));
    const receiverOpacity = servicesReceiver?.update(progress, {
      start: 0.54,
      end: 0.82,
      restoreAt: 0.96,
      liftPx: 10
    }) ?? 0;
    inkCanvas.dataset.inkProgress = inkProgress.toFixed(4);
    inkCanvas.dataset.inkActivePixelRatio = (inkProgress > 0.05 ? inkProgress * 0.06 : 0).toFixed(4);
    exitInk?.render(inkProgress);
    host.dataset.transitionContractId = 'brand-services';
    host.dataset.transitionBridgeType = receiverOpacity >= 0.05 ? 'earlyReceiver' : 'none';
    host.dataset.transitionPhase = resolveFigure3Phase(progress, receiverOpacity);
    host.dataset.transitionProgress = progress.toFixed(4);
    host.dataset.transitionReceiverOpacity = receiverOpacity.toFixed(4);
    host.dataset.transitionSceneOpacity = String(metrics.sceneOpacity ?? 1);
    host.dataset.transitionInkProgress = inkProgress.toFixed(4);
    host.dataset.transitionPrimaryOwner = receiverOpacity >= 0.35 ? 'services' : 'figure3';
    if (!reduceMotion) raf = requestAnimationFrame(render);
  };

  if (reduceMotion) {
    waitForFigure3TransitionMetadata(section).then(() => {
      if (!destroyed) render();
    });
  } else {
    render();
  }

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    alphaVideo?.pause?.();
    servicesReceiver?.destroy();
    host.replaceChildren();
    host.classList.remove('homepage-transition', 'homepage-transition--figure3');
  };

  addCleanup?.(destroy);
  return { destroy };
}
