import {
  prepareAodTransition,
  renderAodTransitionProgress,
  waitForAodTransitionMetadata
} from '../../components/aod-transition.js';
import { createInkCurtainTransition } from '../../effects/ink-scene-transition.js';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothStep = (value) => value * value * (3 - 2 * value);

export function mountHomepageTransition({
  host,
  reduceMotion = false,
  progressSource,
  handoffTarget,
  handoffProgressSource,
  timeline,
  addCleanup
}) {
  host.classList.add('homepage-transition', 'homepage-transition--aod');
  host.innerHTML = `
    <section
      class="aod-transition"
      data-aod-transition
      data-aod-duration="2"
      data-aod-scroll-vh="20"
      data-aod-video-duration="5.03"
      data-aod-fullscreen-start="0"
      data-aod-fullscreen-end="0.85"
      data-aod-backdrop-exit-start="0.18"
      data-aod-backdrop-exit-end="1.55"
      data-aod-figure-start-scale="1"
      data-aod-figure-start-y-vh="10.5"
      aria-hidden="true"
    >
      <div class="aod-transition__sticky">
        <div class="aod-transition__field">
          <div class="aod-transition__layer-stack" data-transition-ghost="aod-field" aria-hidden="true">
            <img class="aod-transition__layer aod-transition__layer--cloud" data-aod-cloud-layer src="assets/aod_cloud-alpha.png" alt="" />
            <img class="aod-transition__layer aod-transition__layer--sun" data-aod-sun-layer src="assets/aod_sun-alpha.png" alt="" />
          </div>
          <video class="aod-transition__figure-video" data-aod-figure-video src="assets/aod_figure-alpha-front-scrub.webm" muted preload="auto" playsinline webkit-playsinline></video>
          <div class="aod-transition__paper-solid" aria-hidden="true"></div>
          <canvas class="aod-transition__ink" data-aod-ink-canvas aria-hidden="true"></canvas>
          <div class="aod-transition__progress" aria-hidden="true"><span></span></div>
        </div>
      </div>
    </section>
  `;

  const section = host.querySelector('[data-aod-transition]');
  const { figureVideo } = prepareAodTransition(section, { progress: reduceMotion ? 1 : 0 });
  const inkCanvas = host.querySelector('[data-aod-ink-canvas]');
  const inkTransition = reduceMotion ? null : createInkCurtainTransition(inkCanvas, {
    direction: 'bottom-up',
    colorLift: 0.64,
    coverAlpha: 0.64,
    fadeOutStart: 0.82,
    fadeOutEnd: 1,
    progressSpan: 1
  });
  const nav = document.querySelector('.site-nav');
  let raf = 0;
  let destroyed = false;
  let isForcingLightNav = false;

  const syncNavTone = (progress) => {
    if (!nav) return;

    const shouldUseLightNav = progress > 0.12;
    if (shouldUseLightNav) {
      if (isForcingLightNav) return;

      isForcingLightNav = true;
      nav.dataset.tone = 'light';
      nav.classList.add('is-on-light');
      return;
    }

    if (!isForcingLightNav) return;

    isForcingLightNav = false;
    nav.removeAttribute('data-tone');
    nav.classList.remove('is-on-light');
  };

  const render = () => {
    if (destroyed) return;
    const progress = reduceMotion ? 1 : progressSource();
    const handoffProgress = reduceMotion ? 1 : handoffProgressSource?.() ?? progress;
    const inkProgress = smoothStep(clamp(progress));
    syncNavTone(progress);
    renderAodTransitionProgress(section, progress);
    timeline?.update(Math.max(progress, handoffProgress), {
      reason: 'aod-render',
      milestones: {
        targetReady: Boolean(handoffTarget),
        playbackComplete: progress >= 0.998
      }
    });
    inkTransition?.render(inkProgress);
    raf = requestAnimationFrame(render);
  };

  if (reduceMotion) {
    waitForAodTransitionMetadata(section).then(() => {
      if (!destroyed) {
        syncNavTone(1);
        renderAodTransitionProgress(section, 1);
        timeline?.complete('aod-reduced-motion');
        inkTransition?.render(1);
      }
    });
  } else {
    render();
  }

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    figureVideo?.pause?.();
    host.replaceChildren();
    host.classList.remove('homepage-transition', 'homepage-transition--aod');
  };

  addCleanup?.(destroy);
  return { destroy };
}
