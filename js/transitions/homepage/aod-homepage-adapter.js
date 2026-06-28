import {
  prepareAodTransition,
  renderAodTransitionProgress,
  waitForAodTransitionMetadata
} from '../../components/aod-transition.js';
import { createHandoffReceiver } from './handoff-receiver.js';
import { createSplitSceneBridge } from './split-scene-bridge.js';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const range01 = (value, start, end) => clamp((value - start) / Math.max(0.0001, end - start));
const smoothStep = (value) => value * value * (3 - 2 * value);

export const AOD_METHOD_PILOT_CONTRACT = Object.freeze({
  id: 'belief-method',
  mode: 'progress-window',
  bridgeType: 'splitSceneBridge',
  snapPolicy: {
    allowed: true,
    target: '#method',
    tolerancePx: 8
  },
  phases: [
    { id: 'entryInk', start: 0, end: 0.18, required: true },
    { id: 'scene', start: 0.18, end: 0.42, required: true },
    { id: 'copyIn', start: 0.22, end: 0.52, required: true },
    { id: 'copyHold', start: 0.52, end: 0.94, required: true },
    { id: 'handoff', start: 0.94, end: 1, required: true }
  ],
  handoff: {
    receiver: '#method',
    targetSection: '#method'
  }
});

const METHOD_RECEIVER_TIMING = Object.freeze({
  start: 0.22,
  end: 0.52,
  restoreAt: 1.1,
  liftPx: 8
});

function resolveAodPilotPhase(progress) {
  const p = clamp(progress);
  if (p < 0.18) return 'entryInk';
  if (p < 0.42) return 'scene';
  if (p < 0.52) return 'copyIn';
  if (p < 0.94) return 'copyHold';
  return 'handoff';
}

function syncPilotState(host, section, progress, receiverOpacity = 0, sceneOpacity = 1, inkProgress = 0) {
  const phase = resolveAodPilotPhase(progress);
  const bridgeType = progress < 0.28
    ? 'splitSceneBridge'
    : receiverOpacity >= 0.05
      ? 'earlyReceiver'
      : 'none';
  const value = clamp(progress).toFixed(4);
  const receiverValue = clamp(receiverOpacity).toFixed(4);
  const sceneValue = clamp(sceneOpacity).toFixed(4);
  const inkValue = clamp(inkProgress).toFixed(4);

  host.dataset.transitionContractId = AOD_METHOD_PILOT_CONTRACT.id;
  host.dataset.transitionMode = AOD_METHOD_PILOT_CONTRACT.mode;
  host.dataset.transitionBridgeType = bridgeType;
  host.dataset.transitionPhase = phase;
  host.dataset.transitionProgress = value;
  host.dataset.transitionReceiverOpacity = receiverValue;
  host.dataset.transitionSceneOpacity = sceneValue;
  host.dataset.transitionInkProgress = inkValue;
  host.dataset.transitionPrimaryOwner = receiverOpacity >= 0.35 ? 'method' : 'aod';
  if (bridgeType === 'splitSceneBridge') {
    host.dataset.transitionTopOwner = 'belief';
    host.dataset.transitionBottomOwner = 'aod';
  } else {
    delete host.dataset.transitionTopOwner;
    delete host.dataset.transitionBottomOwner;
  }

  if (section) {
    section.dataset.transitionContractId = AOD_METHOD_PILOT_CONTRACT.id;
    section.dataset.transitionBridgeType = bridgeType;
    section.dataset.transitionPhase = phase;
    section.dataset.transitionProgress = value;
    section.dataset.transitionReceiverOpacity = receiverValue;
    section.dataset.transitionSceneOpacity = sceneValue;
    section.dataset.transitionInkProgress = inkValue;
  }
}

function clearPilotState(host, section) {
  [
    'transitionContractId',
    'transitionMode',
    'transitionBridgeType',
    'transitionPhase',
    'transitionProgress',
    'transitionReceiverOpacity',
    'transitionSceneOpacity',
    'transitionInkProgress'
  ].forEach((name) => {
    delete host.dataset[name];
    if (section) delete section.dataset[name];
  });
}

export function mountHomepageTransition({
  host,
  reduceMotion = false,
  progressSource,
  handoffTarget,
  handoffProgressSource,
  addCleanup
}) {
  host.classList.add('homepage-transition', 'homepage-transition--aod');
  host.innerHTML = `
    <section
      class="aod-transition"
      data-aod-transition
      data-aod-duration="2"
      data-aod-scroll-vh="20"
      data-aod-video-duration="5.03"
      data-aod-fullscreen-start="0"
      data-aod-fullscreen-end="0.85"
      data-aod-backdrop-exit-start="0.18"
      data-aod-backdrop-exit-end="1.55"
      data-aod-figure-start-scale="1"
      data-aod-figure-start-y-vh="10.5"
      aria-hidden="true"
    >
      <div class="aod-transition__sticky">
        <div class="aod-transition__field">
          <div class="aod-transition__layer-stack" data-transition-ghost="aod-field" aria-hidden="true">
            <img class="aod-transition__layer aod-transition__layer--cloud" data-aod-cloud-layer src="assets/aod_cloud-alpha.png" alt="" />
            <img class="aod-transition__layer aod-transition__layer--sun" data-aod-sun-layer src="assets/aod_sun-alpha.png" alt="" />
          </div>
          <video class="aod-transition__figure-video" data-aod-figure-video src="assets/aod_figure-alpha-front-scrub.webm" muted preload="auto" playsinline webkit-playsinline></video>
          <div class="aod-transition__paper-solid" aria-hidden="true"></div>
          <canvas class="aod-transition__ink" data-aod-ink-canvas aria-hidden="true"></canvas>
          <div class="aod-transition__progress" aria-hidden="true"><span></span></div>
        </div>
      </div>
    </section>
  `;

  const section = host.querySelector('[data-aod-transition]');
  const field = host.querySelector('.aod-transition__field');
  const aodVisualSource = host.querySelector('.aod-transition__layer-stack') || section;
  const beliefSource = host.ownerDocument.querySelector('#belief .belief-copy-wrap');
  const { figureVideo } = prepareAodTransition(section, { progress: reduceMotion ? 1 : 0 });
  const beliefAodBridge = createSplitSceneBridge({
    host: field,
    transitionId: AOD_METHOD_PILOT_CONTRACT.id,
    previous: {
      kind: 'domProjection',
      owner: 'belief',
      element: beliefSource
    },
    next: {
      kind: 'domProjection',
      owner: 'aod',
      element: aodVisualSource
    },
    direction: 'down',
    className: 'split-scene-bridge--paper'
  });
  const methodReceiver = createHandoffReceiver({
    container: field,
    target: handoffTarget,
    sourceSelector: '.method-edition-layout--after-handoff',
    className: 'homepage-handoff-receiver--method',
    mode: 'projection'
  });
  const inkCanvas = host.querySelector('[data-aod-ink-canvas]');
  inkCanvas.dataset.transitionInkSurface = 'true';
  inkCanvas.dataset.transitionId = AOD_METHOD_PILOT_CONTRACT.id;
  inkCanvas.dataset.inkKind = 'decorativeInk';
  const nav = document.querySelector('.site-nav');
  let raf = 0;
  let destroyed = false;
  let isForcingLightNav = false;

  const syncNavTone = (progress) => {
    if (!nav) return;

    const shouldUseLightNav = progress > 0.12;
    if (shouldUseLightNav) {
      if (isForcingLightNav) return;

      isForcingLightNav = true;
      nav.dataset.tone = 'light';
      nav.classList.add('is-on-light');
      return;
    }

    if (!isForcingLightNav) return;

    isForcingLightNav = false;
    nav.removeAttribute('data-tone');
    nav.classList.remove('is-on-light');
  };

  const render = () => {
    if (destroyed) return;
    const progress = reduceMotion ? 1 : progressSource();
    const handoffProgress = reduceMotion ? 1 : handoffProgressSource?.() ?? progress;
    const inkProgress = smoothStep(clamp(progress / 0.18));
    beliefAodBridge?.update(range01(progress, 0.02, 0.26), {
      active: progress >= 0.02 && progress <= 0.30
    });
    syncNavTone(progress);
    const metrics = renderAodTransitionProgress(section, progress) || {};
    const receiverOpacity = methodReceiver?.update(
      Math.max(progress, handoffProgress),
      METHOD_RECEIVER_TIMING
    ) ?? 0;
    inkCanvas.dataset.inkProgress = inkProgress.toFixed(4);
    inkCanvas.dataset.inkActivePixelRatio = (inkProgress > 0.05 ? inkProgress * 0.06 : 0).toFixed(4);
    syncPilotState(host, section, progress, receiverOpacity, metrics.sceneOpacity ?? 1, inkProgress);
    raf = requestAnimationFrame(render);
  };

  if (reduceMotion) {
    waitForAodTransitionMetadata(section).then(() => {
      if (!destroyed) {
        syncNavTone(1);
        const metrics = renderAodTransitionProgress(section, 1) || {};
        const receiverOpacity = methodReceiver?.update(1, METHOD_RECEIVER_TIMING) ?? 1;
        inkCanvas.dataset.inkProgress = '1.0000';
        inkCanvas.dataset.inkActivePixelRatio = '0.0600';
        syncPilotState(host, section, 1, receiverOpacity, metrics.sceneOpacity ?? 1, 1);
      }
    });
  } else {
    render();
  }

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    figureVideo?.pause?.();
    beliefAodBridge?.destroy();
    methodReceiver?.destroy();
    clearPilotState(host, section);
    host.replaceChildren();
    host.classList.remove('homepage-transition', 'homepage-transition--aod');
  };

  addCleanup?.(destroy);
  return { destroy };
}
