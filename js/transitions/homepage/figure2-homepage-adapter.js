import { createFigure2TransitionController } from '../../components/figure2-transition.js';

export function mountHomepageTransition({ host, reduceMotion = false, progressSource, addCleanup }) {
  host.classList.add('homepage-transition', 'homepage-transition--figure2', 'figure2-alpha-video');
  host.innerHTML = `
    <section
      class="figure2-scroll"
      data-figure2-transition
      data-figure2-stage
      data-figure2-scroll-vh="140"
      data-figure2-duration="2.4"
      data-figure2-scene-duration="1.28"
      data-figure2-scene-range-vh="100"
      data-figure2-video-segment="5"
      aria-hidden="true"
    >
      <div class="figure2-sticky">
        <div class="figure2-field">
          <div class="figure2-backdrop" aria-hidden="true"></div>
          <div class="figure2-arch-stack" aria-hidden="true">
            <div class="figure2-middle-camera">
              <div class="figure2-middle-window-mask">
                <img class="figure2-arch-layer figure2-arch-layer--cloud" src="assets/figure2-cloud-source.png?v=cloudsource3" alt="" />
                <div class="figure2-arch-layer figure2-arch-layer--far-arcade-window">
                  <img class="figure2-far-arcade-layer figure2-far-arcade-layer--white" src="assets/figure2-front-white-source.png" alt="" />
                  <img class="figure2-far-arcade-layer figure2-far-arcade-layer--color" src="assets/figure2-front-color-source.png" alt="" />
                  <img class="figure2-far-arcade-layer figure2-far-arcade-layer--relief" src="assets/figure2-front-white-source.png" alt="" />
                </div>
              </div>
              <img class="figure2-arch-layer figure2-arch-layer--middle-composite" src="assets/figure2-middle-fresco-opaque-alpha.png?v=middlemaskhard1" alt="" />
            </div>
          </div>
          <div class="figure2-fresco-warmth" aria-hidden="true"></div>
          <div class="figure2-center-wash" aria-hidden="true"></div>
          <div class="figure2-fresco-texture" aria-hidden="true"></div>
          <img class="figure2-arch-layer figure2-arch-layer--near-arch" src="assets/arch2d-alpha.png" alt="" aria-hidden="true" />
          <div class="figure2-figures" aria-label="子问老子人物动画">
            <div class="figure2-people-contact-shadow" aria-hidden="true"></div>
            <figure class="figure2-figure figure2-figure--left">
              <video class="figure2-figure-video" data-alpha-src="assets/figure2a-alpha-auto.webm?v=auto2" data-fallback-src="assets/figure2a-reverse.mp4" poster="assets/figure2a-alpha-reverse-lite-poster.png" muted preload="auto" playsinline webkit-playsinline data-figure2-video></video>
              <figcaption>问道者</figcaption>
            </figure>
            <figure class="figure2-figure figure2-figure--right">
              <video class="figure2-figure-video" data-alpha-src="assets/figure2b-alpha-auto.webm?v=auto2" data-fallback-src="assets/figure2b-reverse.mp4" poster="assets/figure2b-alpha-reverse-lite-poster.png" muted preload="auto" playsinline webkit-playsinline data-figure2-video></video>
              <figcaption>老子</figcaption>
            </figure>
          </div>
          <canvas class="figure2-scene-ink-transition" data-figure2-ink-canvas aria-hidden="true"></canvas>
          <div class="figure2-progress" aria-hidden="true"><span></span></div>
        </div>
      </div>
    </section>
  `;

  const section = host.querySelector('[data-figure2-transition]');
  const controller = createFigure2TransitionController(section, {
    root: host,
    body: host,
    reduceMotion
  });
  if (!controller) throw new Error('Figure2 homepage transition could not initialize.');

  let raf = 0;
  let destroyed = false;

  const render = () => {
    if (destroyed) return;
    const progress = reduceMotion ? 1 : progressSource();
    controller.renderRawFigureVideoProgress(1);
    controller.renderStaticState({
      introProgress: 1,
      transitionProgress: progress
    });
    raf = requestAnimationFrame(render);
  };

  controller.prepare();
  controller.waitForVideos().finally(render);

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    controller.destroy();
    host.replaceChildren();
    host.classList.remove('homepage-transition', 'homepage-transition--figure2', 'figure2-alpha-video', 'figure2-multiply-video');
  };

  addCleanup?.(destroy);
  return { destroy };
}
