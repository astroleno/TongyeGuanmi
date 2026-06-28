import { createCraneTransitionScene } from '../../components/crane-transition.js';
import { createInkCurtainTransition } from '../../effects/ink-scene-transition.js';
import { createHandoffReceiver } from './handoff-receiver.js';
import { createSplitSceneBridge } from './split-scene-bridge.js';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const range01 = (value, start, end) => clamp((value - start) / Math.max(0.0001, end - start));
const smoothStep = (value) => value * value * (3 - 2 * value);
const TRANSITION_ID = 'philosophy-contact';
const RECEIVER_TIMING = Object.freeze({
  start: 0.32,
  end: 0.50,
  restoreAt: 1.1,
  liftPx: 10
});

function resolvePhase(progress) {
  if (progress < 0.16) return 'philosophyCopy';
  if (progress < 0.42) return 'philosophyCraneSplit';
  if (progress < 0.70) return 'craneScene';
  if (progress < 0.94) return 'contactReceiver';
  return 'handoff';
}

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
          <div class="crane-layer-stack" data-transition-ghost="crane-motion" aria-hidden="true">
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
          <canvas class="homepage-transition-ink homepage-transition-ink--entry" data-transition-ink-surface data-transition-id="philosophy-contact" data-ink-kind="entryInk" aria-hidden="true"></canvas>
          <canvas class="homepage-transition-ink homepage-transition-ink--exit" data-transition-ink-surface data-transition-id="philosophy-contact" data-ink-kind="exitInk" aria-hidden="true"></canvas>
          <div class="crane-progress" aria-hidden="true"><span></span></div>
        </div>
      </div>
    </section>
  `;

  const stage = host.querySelector('[data-crane-stage]');
  const field = host.querySelector('.crane-field');
  const craneVisualSource = host.querySelector('.crane-layer-stack') || stage;
  const philosophySource = host.ownerDocument.querySelector('#philosophy .philosophy-list') || host.ownerDocument.querySelector('#philosophy');
  const entryInkCanvas = host.querySelector('.homepage-transition-ink--entry');
  const exitInkCanvas = host.querySelector('.homepage-transition-ink--exit');
  entryInkCanvas.dataset.inkKind = 'decorativeInk';
  exitInkCanvas.dataset.inkKind = 'decorativeInk';
  const philosophyCraneBridge = createSplitSceneBridge({
    host: field,
    transitionId: TRANSITION_ID,
    previous: {
      kind: 'domProjection',
      owner: 'philosophy',
      element: philosophySource
    },
    next: {
      kind: 'domProjection',
      owner: 'crane',
      element: craneVisualSource
    },
    direction: 'down',
    className: 'split-scene-bridge--paper'
  });
  const contactReceiver = createHandoffReceiver({
    container: field,
    target: handoffTarget,
    sourceSelector: '.contact-endpoint',
    className: 'homepage-handoff-receiver--contact',
    mode: 'projection'
  });
  const scene = createCraneTransitionScene(stage);
  if (!scene) throw new Error('Crane homepage transition could not initialize.');
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

  const render = () => {
    if (destroyed) return;
    const progress = reduceMotion ? 1 : progressSource();
    const handoffProgress = reduceMotion ? 1 : handoffProgressSource?.() ?? progress;
    const entryProgress = smoothStep(range01(progress, 0, 0.18));
    const exitProgress = smoothStep(range01(progress, 0.62, 0.92));
    const metrics = scene.renderRawProgress(progress) || {};
    philosophyCraneBridge?.update(range01(progress, 0.16, 0.42), {
      active: progress >= 0.16 && progress <= 0.44
    });
    const receiverOpacity = contactReceiver?.update(Math.max(progress, handoffProgress), RECEIVER_TIMING) ?? 0;
    entryInkCanvas.dataset.inkProgress = entryProgress.toFixed(4);
    entryInkCanvas.dataset.inkActivePixelRatio = (entryProgress > 0.05 ? entryProgress * 0.06 : 0).toFixed(4);
    exitInkCanvas.dataset.inkProgress = exitProgress.toFixed(4);
    exitInkCanvas.dataset.inkActivePixelRatio = (exitProgress > 0.05 ? exitProgress * 0.06 : 0).toFixed(4);
    entryInk?.render(entryProgress);
    exitInk?.render(exitProgress);
    const bridgeType = progress >= 0.16 && progress <= 0.44
      ? 'splitSceneBridge'
      : receiverOpacity >= 0.05
        ? 'earlyReceiver'
        : 'none';
    const sceneOpacityValue = Number(metrics.sceneOpacity ?? (1 - smoothStep(range01(progress, 0.70, 0.94))));
    host.dataset.transitionContractId = TRANSITION_ID;
    host.dataset.transitionBridgeType = bridgeType;
    host.dataset.transitionPhase = resolvePhase(progress);
    host.dataset.transitionProgress = progress.toFixed(4);
    host.dataset.transitionReceiverOpacity = receiverOpacity.toFixed(4);
    host.dataset.transitionSceneOpacity = sceneOpacityValue.toFixed(4);
    host.dataset.transitionInkProgress = Math.max(entryProgress, exitProgress).toFixed(4);
    host.dataset.transitionPrimaryOwner = receiverOpacity >= 0.35 ? 'contact' : 'crane';
    if (progress >= 0.16 && progress <= 0.44) {
      host.dataset.transitionTopOwner = 'philosophy';
      host.dataset.transitionBottomOwner = 'crane';
    } else {
      delete host.dataset.transitionTopOwner;
      delete host.dataset.transitionBottomOwner;
    }
    if (!reduceMotion) raf = requestAnimationFrame(render);
  };

  scene.prepare();
  if (reduceMotion) {
    scene.mountReducedMotion();
    render();
  } else {
    scene.waitForVideos().finally(render);
  }

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    scene.destroy();
    philosophyCraneBridge?.destroy();
    contactReceiver?.destroy();
    host.replaceChildren();
    host.classList.remove('homepage-transition', 'homepage-transition--crane', 'crane-page');
  };

  addCleanup?.(destroy);
  return { destroy };
}
