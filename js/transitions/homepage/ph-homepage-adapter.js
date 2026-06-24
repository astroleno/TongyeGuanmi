import {
  preparePhTransition,
  renderPhTransitionProgress,
  waitForPhTransitionMetadata
} from '../../components/ph-transition.js';

export function mountHomepageTransition({ host, reduceMotion = false, progressSource, timeline, addCleanup }) {
  host.classList.add('homepage-transition', 'homepage-transition--ph', 'ph-page');
  host.innerHTML = `
    <section class="ph-scroll" data-ph-stage aria-hidden="true">
      <div class="ph-sticky">
        <div class="ph-field">
          <img class="ph-bg" src="assets/ph_background.png" alt="" aria-hidden="true" />
          <div class="ph-paper" aria-hidden="true"></div>
          <div class="ph-sun-wash" aria-hidden="true"></div>
          <div class="ph-layer-stack" aria-hidden="true">
            <img class="ph-layer ph-layer--front" src="assets/ph_front-alpha.png" alt="" />
            <video class="ph-layer ph-layer--figure" data-ph-alpha-video src="assets/ph_figure-alpha-scrub.webm?v=allkey-1672-simple-key-20260621" muted preload="auto" playsinline webkit-playsinline></video>
          </div>
          <div class="ph-edge-light" aria-hidden="true"></div>
          <div class="ph-texture" aria-hidden="true"></div>
          <div class="ph-progress" aria-hidden="true"><span></span></div>
        </div>
      </div>
    </section>
  `;

  const stage = host.querySelector('[data-ph-stage]');
  const { alphaVideo } = preparePhTransition(stage, { progress: reduceMotion ? 1 : 0 });
  let raf = 0;
  let destroyed = false;

  const render = () => {
    if (destroyed) return;
    const progress = reduceMotion ? 1 : progressSource();
    renderPhTransitionProgress(stage, progress, { alphaVideo });
    timeline?.update(progress, {
      reason: 'ph-render',
      milestones: {
        targetReady: true,
        playbackComplete: progress >= 0.998
      }
    });
    raf = requestAnimationFrame(render);
  };

  if (reduceMotion) {
    waitForPhTransitionMetadata(stage).then(() => {
      if (!destroyed) {
        renderPhTransitionProgress(stage, 1, { alphaVideo });
        timeline?.complete('ph-reduced-motion');
      }
    });
  } else {
    render();
  }

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    alphaVideo?.pause?.();
    host.replaceChildren();
    host.classList.remove('homepage-transition', 'homepage-transition--ph', 'ph-page');
  };

  addCleanup?.(destroy);
  return { destroy };
}
