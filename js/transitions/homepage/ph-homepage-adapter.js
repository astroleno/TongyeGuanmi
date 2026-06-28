import {
  preparePhTransition,
  renderPhTransitionProgress,
  waitForPhTransitionMetadata
} from '../../components/ph-transition.js';
import { createInkCurtainTransition } from '../../effects/ink-scene-transition.js';
import { createSplitSceneBridge } from './split-scene-bridge.js';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const range01 = (value, start, end) => clamp((value - start) / Math.max(0.0001, end - start));
const smoothStep = (value) => value * value * (3 - 2 * value);
const TRANSITION_ID = 'lab-education';
function resolvePhase(progress) {
  if (progress < 0.16) return 'labCopy';
  if (progress < 0.42) return 'labPhSplit';
  if (progress < 0.70) return 'phScene';
  return 'phEducationSplit';
}

export function mountHomepageTransition({
  host,
  reduceMotion = false,
  progressSource,
  handoffTarget,
  handoffProgressSource,
  addCleanup
}) {
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
          <canvas class="homepage-transition-ink homepage-transition-ink--entry" data-transition-ink-surface data-transition-id="lab-education" data-ink-kind="entryInk" aria-hidden="true"></canvas>
          <canvas class="homepage-transition-ink homepage-transition-ink--exit" data-transition-ink-surface data-transition-id="lab-education" data-ink-kind="exitInk" aria-hidden="true"></canvas>
          <div class="ph-progress" aria-hidden="true"><span></span></div>
        </div>
      </div>
    </section>
  `;

  const stage = host.querySelector('[data-ph-stage]');
  const field = host.querySelector('.ph-field');
  const phVisualSource = host.querySelector('.ph-layer-stack') || stage;
  const labSource = host.ownerDocument.querySelector('#lab .scenario-wide-stage') || host.ownerDocument.querySelector('#lab');
  const educationSource = host.ownerDocument.querySelector('#education .education-vertical-layout') || host.ownerDocument.querySelector('#education');
  const entryInkCanvas = host.querySelector('.homepage-transition-ink--entry');
  const exitInkCanvas = host.querySelector('.homepage-transition-ink--exit');
  entryInkCanvas.dataset.inkKind = 'decorativeInk';
  exitInkCanvas.dataset.inkKind = 'decorativeInk';
  const { alphaVideo } = preparePhTransition(stage, { progress: reduceMotion ? 1 : 0 });
  const labPhBridge = createSplitSceneBridge({
    host: field,
    transitionId: TRANSITION_ID,
    previous: {
      kind: 'domProjection',
      owner: 'lab',
      element: labSource
    },
    next: {
      kind: 'domProjection',
      owner: 'ph',
      element: phVisualSource
    },
    direction: 'down',
    className: 'split-scene-bridge--paper'
  });
  const phEducationBridge = createSplitSceneBridge({
    host: field,
    transitionId: TRANSITION_ID,
    previous: {
      kind: 'domProjection',
      owner: 'ph',
      element: phVisualSource
    },
    next: {
      kind: 'domProjection',
      owner: 'education',
      element: educationSource
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

  const render = () => {
    if (destroyed) return;
    const progress = reduceMotion ? 1 : progressSource();
    const entryProgress = smoothStep(range01(progress, 0, 0.18));
    const exitProgress = smoothStep(range01(progress, 0.62, 0.92));
    const metrics = renderPhTransitionProgress(stage, progress, { alphaVideo }) || {};
    labPhBridge?.update(range01(progress, 0.36, 0.84), {
      active: progress >= 0.36 && progress <= 0.78
    });
    phEducationBridge?.update(range01(progress, 0.76, 1.08), {
      active: progress >= 0.76 && progress <= 0.995
    });
    entryInkCanvas.dataset.inkProgress = entryProgress.toFixed(4);
    entryInkCanvas.dataset.inkActivePixelRatio = (entryProgress > 0.05 ? entryProgress * 0.06 : 0).toFixed(4);
    exitInkCanvas.dataset.inkProgress = exitProgress.toFixed(4);
    exitInkCanvas.dataset.inkActivePixelRatio = (exitProgress > 0.05 ? exitProgress * 0.06 : 0).toFixed(4);
    entryInk?.render(entryProgress);
    exitInk?.render(exitProgress);
    const bridgeType = (progress >= 0.36 && progress <= 0.74) || progress >= 0.76
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
    host.dataset.transitionPrimaryOwner = progress >= 0.70 ? 'education' : 'ph';
    if (progress >= 0.36 && progress <= 0.74) {
      host.dataset.transitionTopOwner = 'lab';
      host.dataset.transitionBottomOwner = 'ph';
    } else if (progress >= 0.76) {
      host.dataset.transitionTopOwner = 'ph';
      host.dataset.transitionBottomOwner = 'education';
    } else {
      delete host.dataset.transitionTopOwner;
      delete host.dataset.transitionBottomOwner;
    }
    if (!reduceMotion) raf = requestAnimationFrame(render);
  };

  if (reduceMotion) {
    waitForPhTransitionMetadata(stage).then(() => {
      if (!destroyed) render();
    });
  } else {
    render();
  }

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    alphaVideo?.pause?.();
    labPhBridge?.destroy();
    phEducationBridge?.destroy();
    host.replaceChildren();
    host.classList.remove('homepage-transition', 'homepage-transition--ph', 'ph-page');
  };

  addCleanup?.(destroy);
  return { destroy };
}
