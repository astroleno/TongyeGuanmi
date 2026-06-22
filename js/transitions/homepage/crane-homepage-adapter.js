import { createCraneTransitionScene } from '../../components/crane-transition.js';
import { createHandoffPreview } from './handoff-preview.js';

export function mountHomepageTransition({
  host,
  reduceMotion = false,
  progressSource,
  handoffTarget,
  handoffProgressSource,
  addCleanup
}) {
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
  const field = host.querySelector('.crane-field');
  const contactPreview = createHandoffPreview({
    container: field,
    target: handoffTarget,
    sourceSelector: '.contact-endpoint',
    className: 'homepage-handoff-preview--contact'
  });
  const scene = createCraneTransitionScene(stage);
  if (!scene) throw new Error('Crane homepage transition could not initialize.');

  let raf = 0;
  let destroyed = false;

  const render = () => {
    if (destroyed) return;
    const progress = reduceMotion ? 1 : progressSource();
    const handoffProgress = reduceMotion ? 1 : handoffProgressSource?.() ?? progress;
    scene.renderRawProgress(progress);
    contactPreview?.update(Math.max(progress, handoffProgress), { start: 0.58, end: 0.94, liftPx: 20 });
    raf = requestAnimationFrame(render);
  };

  scene.prepare();
  if (reduceMotion) {
    scene.mountReducedMotion();
    contactPreview?.update(1);
  } else {
    scene.waitForVideos().finally(render);
  }

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    scene.destroy();
    contactPreview?.destroy();
    host.replaceChildren();
    host.classList.remove('homepage-transition', 'homepage-transition--crane', 'crane-page');
  };

  addCleanup?.(destroy);
  return { destroy };
}
