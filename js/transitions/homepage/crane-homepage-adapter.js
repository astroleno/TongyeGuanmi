import { createCraneTransitionScene } from '../../components/crane-transition.js';

export function mountHomepageTransition({ host, reduceMotion = false, progressSource, addCleanup }) {
  host.classList.add('homepage-transition', 'homepage-transition--crane', 'crane-page');
  host.innerHTML = `
    <section class="crane-scroll" data-crane-stage aria-hidden="true">
      <div class="crane-sticky">
        <div class="crane-field">
          <div class="crane-paper" aria-hidden="true"></div>
          <div class="crane-layer-stack" aria-hidden="true">
            <img class="crane-layer crane-layer--cloud-back" src="assets/crane1_cloud2-alpha.png" alt="" />
            <div class="crane-video-transition crane-video-transition--figure">
              <video class="crane-figure-video" data-crane-figure-video muted preload="auto" playsinline webkit-playsinline>
                <source src="assets/crane-figure1-transition.webm" type="video/webm" />
              </video>
            </div>
            <img class="crane-layer crane-layer--arch" src="assets/crane1_arch-alpha.png" alt="" />
            <img class="crane-layer crane-layer--cloud-front" src="assets/crane1_cloud1-alpha.png" alt="" />
            <img class="crane-layer crane-layer--cloud-front-second" src="assets/crane1_cloud-front2-alpha.png" alt="" />
            <div class="crane-video-transition crane-video-transition--front">
              <video class="crane-figure-video crane-figure-video--front" data-crane-figure-front-video muted preload="auto" playsinline webkit-playsinline>
                <source src="assets/crane-figure2-transition.webm" type="video/webm" />
              </video>
            </div>
          </div>
          <div class="crane-warmth" aria-hidden="true"></div>
          <div class="crane-center-wash" aria-hidden="true"></div>
          <div class="crane-texture" aria-hidden="true"></div>
          <div class="crane-progress" aria-hidden="true"><span></span></div>
        </div>
      </div>
    </section>
  `;

  const stage = host.querySelector('[data-crane-stage]');
  const scene = createCraneTransitionScene(stage);
  if (!scene) throw new Error('Crane homepage transition could not initialize.');

  let raf = 0;
  let destroyed = false;

  const render = () => {
    if (destroyed) return;
    scene.renderRawProgress(reduceMotion ? 1 : progressSource());
    raf = requestAnimationFrame(render);
  };

  scene.prepare();
  if (reduceMotion) {
    scene.mountReducedMotion();
  } else {
    scene.waitForVideos().finally(render);
  }

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    scene.destroy();
    host.replaceChildren();
    host.classList.remove('homepage-transition', 'homepage-transition--crane', 'crane-page');
  };

  addCleanup?.(destroy);
  return { destroy };
}
