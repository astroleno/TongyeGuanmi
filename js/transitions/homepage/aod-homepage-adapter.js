import {
  prepareAodTransition,
  renderAodTransitionProgress,
  waitForAodTransitionMetadata
} from '../../components/aod-transition.js';

export function mountHomepageTransition({ host, reduceMotion = false, progressSource, addCleanup }) {
  host.classList.add('homepage-transition', 'homepage-transition--aod');
  host.innerHTML = `
    <section
      class="aod-transition"
      data-aod-transition
      data-aod-duration="2"
      data-aod-scroll-vh="20"
      data-aod-video-duration="5.03"
      data-aod-fullscreen-start="0"
      data-aod-fullscreen-end="0.3"
      data-aod-backdrop-exit-start="0"
      data-aod-backdrop-exit-end="0.5"
      data-aod-figure-start-scale="1"
      data-aod-figure-start-y-vh="10.5"
      aria-hidden="true"
    >
      <div class="aod-transition__sticky">
        <div class="aod-transition__field">
          <div class="aod-transition__layer-stack" aria-hidden="true">
            <img class="aod-transition__layer aod-transition__layer--cloud" data-aod-cloud-layer src="assets/aod_cloud-alpha.png" alt="" />
            <img class="aod-transition__layer aod-transition__layer--sun" data-aod-sun-layer src="assets/aod_sun-alpha.png" alt="" />
          </div>
          <video class="aod-transition__figure-video" data-aod-figure-video src="assets/aod_figure-alpha-front-scrub.webm" muted preload="auto" playsinline webkit-playsinline></video>
          <div class="aod-transition__progress" aria-hidden="true"><span></span></div>
        </div>
      </div>
    </section>
  `;

  const section = host.querySelector('[data-aod-transition]');
  const { figureVideo } = prepareAodTransition(section, { progress: reduceMotion ? 1 : 0 });
  let raf = 0;
  let destroyed = false;

  const render = () => {
    if (destroyed) return;
    renderAodTransitionProgress(section, reduceMotion ? 1 : progressSource());
    raf = requestAnimationFrame(render);
  };

  if (reduceMotion) {
    waitForAodTransitionMetadata(section).then(() => {
      if (!destroyed) renderAodTransitionProgress(section, 1);
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
