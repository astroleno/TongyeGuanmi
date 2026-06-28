import { createTtgTransitionScene } from '../../components/ttg-transition.js';
import { createInkCurtainTransition } from '../../effects/ink-scene-transition.js';
import { createSplitSceneBridge } from './split-scene-bridge.js';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const range01 = (value, start, end) => clamp((value - start) / Math.max(0.0001, end - start));
const smoothStep = (value) => value * value * (3 - 2 * value);
const TRANSITION_ID = 'services-lab';
function resolvePhase(progress) {
  if (progress < 0.16) return 'servicesCopy';
  if (progress < 0.42) return 'servicesTtgSplit';
  if (progress < 0.70) return 'ttgScene';
  return 'ttgLabSplit';
}

export function mountHomepageTransition({
  host,
  reduceMotion = false,
  progressSource,
  handoffTarget,
  handoffProgressSource,
  addCleanup,
  gsap = window.gsap
}) {
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
          <canvas class="homepage-transition-ink homepage-transition-ink--entry" data-transition-ink-surface data-transition-id="services-lab" data-ink-kind="entryInk" aria-hidden="true"></canvas>
          <canvas class="homepage-transition-ink homepage-transition-ink--exit" data-transition-ink-surface data-transition-id="services-lab" data-ink-kind="exitInk" aria-hidden="true"></canvas>
          <div class="ttg-progress" aria-hidden="true"><span></span></div>
        </div>
      </div>
    </section>
  `;

  const stage = host.querySelector('[data-ttg-stage]');
  const field = host.querySelector('.ttg-field');
  const ttgVisualSource = host.querySelector('.ttg-layer-stack') || stage;
  const servicesSource = host.ownerDocument.querySelector('#services .enterprise-vertical-layout') || host.ownerDocument.querySelector('#services');
  const labSource = host.ownerDocument.querySelector('#lab .scenario-wide-stage') || host.ownerDocument.querySelector('#lab');
  const entryInkCanvas = host.querySelector('.homepage-transition-ink--entry');
  const exitInkCanvas = host.querySelector('.homepage-transition-ink--exit');
  entryInkCanvas.dataset.inkKind = 'decorativeInk';
  exitInkCanvas.dataset.inkKind = 'decorativeInk';
  const scene = createTtgTransitionScene(stage);
  if (!scene) throw new Error('TTG homepage transition could not initialize.');
  scene.enableGsapRendering(gsap);
  const servicesTtgBridge = createSplitSceneBridge({
    host: field,
    transitionId: TRANSITION_ID,
    previous: {
      kind: 'domProjection',
      owner: 'services',
      element: servicesSource
    },
    next: {
      kind: 'domProjection',
      owner: 'ttg',
      element: ttgVisualSource
    },
    direction: 'down',
    className: 'split-scene-bridge--paper'
  });
  const ttgLabBridge = createSplitSceneBridge({
    host: field,
    transitionId: TRANSITION_ID,
    previous: {
      kind: 'domProjection',
      owner: 'ttg',
      element: ttgVisualSource
    },
    next: {
      kind: 'domProjection',
      owner: 'lab',
      element: labSource
    },
    direction: 'down',
    className: 'split-scene-bridge--paper'
  });
  const entryInk = reduceMotion ? null : createInkCurtainTransition(entryInkCanvas, {
    direction: 'bottom-up',
    colorLift: 0.54,
    coverAlpha: 0.50,
    fadeOutStart: 0.58,
    fadeOutEnd: 1,
    progressSpan: 1
  });
  const exitInk = reduceMotion ? null : createInkCurtainTransition(exitInkCanvas, {
    direction: 'top-down',
    colorLift: 0.58,
    coverAlpha: 0.54,
    fadeOutStart: 0.76,
    fadeOutEnd: 1,
    progressSpan: 1
  });
  let raf = 0;
  let destroyed = false;
  let videoPlaybackStage = reduceMotion ? 'complete' : 'idle';
  let lastProgress = reduceMotion ? 1 : 0;

  const render = () => {
    if (destroyed) return;
    const progress = reduceMotion ? 1 : progressSource();
    const direction = progress >= lastProgress ? 1 : -1;
    const entryProgress = smoothStep(range01(progress, 0, 0.18));
    const exitProgress = smoothStep(range01(progress, 0.62, 0.92));

    const metrics = scene.renderRawProgress(progress, { syncVideo: false }) || {};
    servicesTtgBridge?.update(range01(progress, 0.16, 0.42), {
      active: progress >= 0.16 && progress <= 0.44
    });
    ttgLabBridge?.update(range01(progress, 0.70, 1), {
      active: progress >= 0.68 && progress <= 0.995
    });
    entryInkCanvas.dataset.inkProgress = entryProgress.toFixed(4);
    entryInkCanvas.dataset.inkActivePixelRatio = (entryProgress > 0.05 ? entryProgress * 0.06 : 0).toFixed(4);
    exitInkCanvas.dataset.inkProgress = exitProgress.toFixed(4);
    exitInkCanvas.dataset.inkActivePixelRatio = (exitProgress > 0.05 ? exitProgress * 0.06 : 0).toFixed(4);
    entryInk?.render(entryProgress);
    exitInk?.render(exitProgress);
    const entryOpacity = Number(getComputedStyle(entryInkCanvas).opacity) || 0;
    const exitOpacity = Number(getComputedStyle(exitInkCanvas).opacity) || 0;
    const bridgeType = (progress >= 0.16 && progress <= 0.44) || progress >= 0.68
      ? 'splitSceneBridge'
      : 'none';
    const sceneOpacityValue = Number(metrics.sceneOpacity ?? (1 - smoothStep(range01(progress, 0.70, 0.94))));
    host.dataset.transitionContractId = TRANSITION_ID;
    host.dataset.transitionBridgeType = bridgeType;
    host.dataset.transitionPhase = resolvePhase(progress);
    host.dataset.transitionProgress = progress.toFixed(4);
    host.dataset.transitionReceiverOpacity = '0.0000';
    host.dataset.transitionSceneOpacity = sceneOpacityValue.toFixed(4);
    host.dataset.transitionInkProgress = Math.max(entryProgress, exitProgress).toFixed(4);
    host.dataset.transitionPrimaryOwner = progress < 0.42 ? 'ttg' : progress >= 0.70 ? 'lab' : 'ttg';
    if (progress >= 0.16 && progress <= 0.44) {
      host.dataset.transitionTopOwner = 'services';
      host.dataset.transitionBottomOwner = 'ttg';
    } else if (progress >= 0.68) {
      host.dataset.transitionTopOwner = 'ttg';
      host.dataset.transitionBottomOwner = 'lab';
    } else {
      delete host.dataset.transitionTopOwner;
      delete host.dataset.transitionBottomOwner;
    }

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
    if (!reduceMotion) raf = requestAnimationFrame(render);
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
    servicesTtgBridge?.destroy();
    ttgLabBridge?.destroy();
    host.replaceChildren();
    host.classList.remove('homepage-transition', 'homepage-transition--ttg', 'ttg-page');
  };

  addCleanup?.(destroy);
  return { destroy };
}
