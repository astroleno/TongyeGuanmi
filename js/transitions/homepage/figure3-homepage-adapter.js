import {
  prepareFigure3Transition,
  renderFigure3TransitionProgress,
  waitForFigure3TransitionMetadata
} from '../../components/figure3-transition.js';

export function mountHomepageTransition({ host, reduceMotion = false, progressSource, addCleanup }) {
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
        </div>
      </div>
    </section>
  `;

  const section = host.querySelector('[data-figure3-transition]');
  const { alphaVideo } = prepareFigure3Transition(section, { progress: reduceMotion ? 1 : 0 });
  let raf = 0;
  let destroyed = false;

  const render = () => {
    if (destroyed) return;
    renderFigure3TransitionProgress(section, reduceMotion ? 1 : progressSource());
    raf = requestAnimationFrame(render);
  };

  if (reduceMotion) {
    waitForFigure3TransitionMetadata(section).then(() => {
      if (!destroyed) renderFigure3TransitionProgress(section, 1);
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
    host.classList.remove('homepage-transition', 'homepage-transition--figure3');
  };

  addCleanup?.(destroy);
  return { destroy };
}
