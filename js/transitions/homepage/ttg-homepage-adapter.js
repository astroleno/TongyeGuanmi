import { createTtgTransitionScene } from '../../components/ttg-transition.js';

export function mountHomepageTransition({ host, reduceMotion = false, progressSource, reportMilestone, addCleanup, gsap = window.gsap }) {
  host.classList.add('homepage-transition', 'homepage-transition--ttg', 'ttg-page');
  host.innerHTML = `
    <section
      class="ttg-scroll"
      data-ttg-transition
      data-ttg-stage
      data-ttg-duration="2.5"
      data-ttg-scroll-vh="153"
      data-ttg-video-duration="2.459"
      data-ttg-bg-travel-vh="14.3"
      data-ttg-middle-travel-vh="23.5"
      data-ttg-front-y-vh="29.2"
      data-ttg-front-travel-vh="13.1"
      data-ttg-front-overlay-opacity="0.2"
      data-ttg-figure-scale="0.80"
      data-ttg-figure-y-vh="-8.5"
      data-ttg-figure-travel-vh="16.5"
      style="--ttg-scroll-vh: 153; --ttg-front-overlay-opacity: 0.2;"
      aria-hidden="true"
    >
      <div class="ttg-sticky">
        <div class="ttg-field">
          <div class="ttg-layer-stack" aria-hidden="true">
            <img class="ttg-layer ttg-layer--bg" src="assets/ttg_bg.png" alt="" />
            <img class="ttg-layer ttg-layer--middle" src="assets/ttg_middle-alpha.png" alt="" />
            <img class="ttg-layer ttg-layer--middle-overlay" src="assets/ttg_middle-original-overlay-alpha.png" alt="" />
            <img class="ttg-layer ttg-layer--front" src="assets/ttg_front-original-overlay-alpha.png?v=ttg-front-image15-blend80-v1" alt="" />
            <img class="ttg-layer ttg-layer--front-overlay" src="assets/ttg_front-alpha.png?v=ttg-front-image15-blend80-v1" alt="" />
            <video class="ttg-layer ttg-layer--figure is-active" data-ttg-figure-video src="assets/ttg_figure-alpha-scrub.webm?v=ttg-figure-blue-v2" poster="assets/ttg_figure-alpha-scrub-poster.png?v=ttg-figure-blue-v2" width="720" height="1280" muted preload="auto" playsinline webkit-playsinline></video>
            <video class="ttg-layer ttg-layer--figure" data-ttg-figure-video-reverse src="assets/ttg_figure-alpha-scrub-reverse.webm?v=ttg-figure-blue-v2" width="720" height="1280" muted preload="auto" playsinline webkit-playsinline></video>
          </div>
          <div class="ttg-progress" aria-hidden="true"><span></span></div>
        </div>
      </div>
    </section>
  `;

  const stage = host.querySelector('[data-ttg-stage]');
  const scene = createTtgTransitionScene(stage);
  if (!scene) throw new Error('TTG homepage transition could not initialize.');
  scene.enableGsapRendering(gsap);

  let raf = 0;
  let destroyed = false;
  let videoPlaybackStage = reduceMotion ? 'complete' : 'idle';
  let lastProgress = reduceMotion ? 1 : 0;

  const render = () => {
    if (destroyed) return;
    const progress = reduceMotion ? 1 : progressSource();
    const direction = progress >= lastProgress ? 1 : -1;

    scene.renderRawProgress(progress, { syncVideo: false });
    reportMilestone?.('targetReady', true);
    reportMilestone?.('playbackComplete', progress >= 1);

    if (reduceMotion) {
      if (videoPlaybackStage !== 'complete') {
        scene.finishFigureVideoPlayback();
        videoPlaybackStage = 'complete';
      }
    } else if (progress <= 0) {
      if (videoPlaybackStage !== 'idle') {
        scene.resetFigureVideoPlayback();
        videoPlaybackStage = 'idle';
      }
    } else if (progress >= 1) {
      if (videoPlaybackStage !== 'complete') {
        scene.finishFigureVideoPlayback();
        videoPlaybackStage = 'complete';
      }
    } else {
      if (direction > 0 && videoPlaybackStage !== 'playing') {
        scene.startFigureVideoPlayback(1, { driveScene: false });
        videoPlaybackStage = 'playing';
      } else if (direction < 0 && videoPlaybackStage !== 'reversing') {
        scene.startFigureVideoPlayback(-1, { driveScene: false });
        videoPlaybackStage = 'reversing';
      }
    }

    lastProgress = progress;
    raf = requestAnimationFrame(render);
  };

  scene.prepare();
  if (reduceMotion) {
    scene.mountReducedMotion();
  } else {
    scene.waitForMedia();
  }
  render();

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    scene.destroy();
    host.replaceChildren();
    host.classList.remove('homepage-transition', 'homepage-transition--ttg', 'ttg-page');
  };

  addCleanup?.(destroy);
  return { destroy };
}
