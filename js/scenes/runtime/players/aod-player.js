import {
  prepareAodTransition,
  renderAodTransitionProgress,
  waitForAodTransitionMetadata
} from '../../../components/aod-transition.js';
import { createInkCurtainTransition } from '../../../effects/ink-scene-transition.js';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothStep = (value) => value * value * (3 - 2 * value);

const AOD_MARKUP = `
  <section
    class="aod-transition scene-runtime-aod-player"
    data-aod-transition
    data-aod-player="mvp"
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
        <video
          class="aod-transition__figure-video"
          data-aod-figure-video
          src="assets/aod_figure-alpha-front-scrub.webm"
          poster="assets/aod-paper-bg.png"
          muted
          preload="auto"
          playsinline
          webkit-playsinline
        ></video>
        <div class="aod-transition__paper-solid" aria-hidden="true"></div>
        <canvas class="aod-transition__ink" data-aod-ink-canvas aria-hidden="true"></canvas>
        <div class="aod-transition__progress" aria-hidden="true"><span></span></div>
      </div>
    </div>
  </section>
`;

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function animationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function syncFigureVisibility(video, progress) {
  if (!video) return;
  const visible = progress > 0.015;
  video.style.opacity = visible ? '1' : '0';
  video.style.visibility = visible ? 'visible' : 'hidden';
}

export function createAodPlayer({
  root = document,
  presentation,
  durationMs = 2600,
  readyTimeoutMs = 1400,
  endedGraceMs = 180,
  reduceMotion = false,
  claimLayer = () => {}
} = {}) {
  let stopped = false;
  let mountedSection = null;
  let mountedVideo = null;
  let mountedHost = null;
  let mountedInkTransition = null;
  let preparePromise = null;
  let ended = false;
  let earlyCopyPresented = false;

  function mount() {
    if (mountedSection && mountedVideo) {
      return { host: mountedHost, section: mountedSection, video: mountedVideo };
    }

    const host = root.querySelector('[data-scene-id="aod-animation"]');
    if (!host) throw new Error('Missing aod-animation scene host');
    if (!host.querySelector('[data-aod-player="mvp"]')) {
      host.innerHTML = AOD_MARKUP;
    }
    host.classList.add('homepage-transition', 'homepage-transition--aod');
    mountedHost = host;
    mountedSection = host.querySelector('[data-aod-transition]');
    const elements = prepareAodTransition(mountedSection, { progress: 0 });
    mountedVideo = elements.figureVideo;
    if (!mountedSection || !mountedVideo) throw new Error('Missing AOD media DOM');
    mountedInkTransition ??= reduceMotion ? null : createInkCurtainTransition(host.querySelector('[data-aod-ink-canvas]'), {
      direction: 'bottom-up',
      colorLift: 0.64,
      coverAlpha: 0.64,
      fadeOutStart: 0.82,
      fadeOutEnd: 1,
      progressSpan: 1
    });
    return { host, section: mountedSection, video: mountedVideo };
  }

  function teardown() {
    mountedVideo?.removeEventListener?.('ended', onEnded);
    mountedVideo?.pause?.();
    if (mountedVideo) {
      mountedVideo.style.opacity = '0';
      mountedVideo.style.visibility = 'hidden';
    }
    mountedHost?.classList.remove('homepage-transition', 'homepage-transition--aod');
    mountedInkTransition = null;
    mountedHost = null;
    mountedVideo = null;
    mountedSection = null;
    preparePromise = null;
  }

  function onEnded() {
    ended = true;
  }

  async function gateFirstFrame(section, video) {
    presentation?.markPoster?.('aod-animation');
    render(0, { section, video });
    await waitForAodTransitionMetadata(section, { timeoutMs: readyTimeoutMs });
    if (video.error || video.readyState < 1) {
      throw new Error('AOD media failed poster/first-frame gate');
    }
    render(0, { section, video });
  }

  function prepare() {
    const { section, video } = mount();
    if (!preparePromise) {
      preparePromise = gateFirstFrame(section, video).catch((error) => {
        preparePromise = null;
        throw error;
      });
    }
    return preparePromise;
  }

  async function playVideo(video) {
    const playResult = video.play?.();
    if (playResult?.then) await playResult;
  }

  function render(progress, { section = mountedSection, video = mountedVideo } = {}) {
    const safeProgress = clamp(progress);
    syncFigureVisibility(video, safeProgress);
    renderAodTransitionProgress(section, safeProgress, { figureVideo: video });
    mountedInkTransition?.render(smoothStep(safeProgress));
  }

  function presentRealTargetCopy(targetScene) {
    presentation?.presentEarlyCopy?.({ targetScene });
    const target = root.querySelector(`[data-scene-owner="scene-runtime"][data-scene-id="${targetScene}"]`);
    if (target) {
      const top = target.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top, behavior: 'auto' });
    }
  }

  async function play({ segment }) {
    if (segment.id !== 'aod-play') throw new Error(`Unsupported AOD segment: ${segment.id}`);

    claimLayer({ layer: 'media', owner: 'MediaPlayer', segmentId: segment.id });
    stopped = false;
    ended = false;
    earlyCopyPresented = false;

    const { section, video } = mount();
    video.addEventListener('ended', onEnded, { once: true });

    await prepare();
    if (reduceMotion) {
      presentRealTargetCopy(segment.to);
      render(1, { section, video });
      teardown();
      return { progress: 1, reducedMotion: true };
    }

    await playVideo(video);

    const startedAt = performance.now();
    while (!stopped) {
      await animationFrame();
      const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
      render(progress, { section, video });

      if (!earlyCopyPresented && progress >= (segment.earlyCopyAt ?? 0.8)) {
        earlyCopyPresented = true;
        presentRealTargetCopy(segment.to);
      }

      if (ended) {
        await wait(endedGraceMs);
        break;
      }
      if (progress >= 1) break;
    }

    const completed = !stopped;
    if (completed) render(1, { section, video });
    teardown();
    if (!completed) return { cancelled: true };
    return {
      progress: 1,
      earlyCopyPresented,
      posterGate: true,
      readyTimeoutMs,
      endedGraceMs
    };
  }

  function stop() {
    stopped = true;
    teardown();
  }

  return { prepare, play, stop, destroy: stop };
}

export const aodPlayerTimingContract = Object.freeze({
  posterGate: true,
  readyTimeoutMs: 1400,
  endedGraceMs: 180,
  earlyCopyAt: 0.8,
  autoplayAfterIntent: true
});
