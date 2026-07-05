/**
 * AOD Scene Adapter (media / autoplay)
 *
 * Second real adapter, and a DIFFERENT shape from pattern-bloom: aod is a
 * media/animation scene. Per plan lines 408-409 the legacy aod component is
 * scrub-based (renderAodTransitionProgress -> video.currentTime = progress); the
 * migration must split it into showFirstFrame + playForward and must NOT scrub
 * the webm during the main path (seekPolicy: reset-only).
 *
 * This adapter therefore:
 *  - showFirstFrame(): prepare the section, load metadata, present frame 0 with
 *    NO playback. currentTime is written only here (to 0) and on reset.
 *  - play(): call video.play() and let the video advance ITSELF. Each rAF we
 *    READ video.currentTime/duration and drive the visual LAYERS from real
 *    playback time — never writing currentTime. Completion is the `ended` event
 *    (or a time-based safety), not a progress ramp.
 *  - recovery: play() reject / metadata missing / ended-never-fires all reject
 *    so the runtime routes to RecoverPresentTarget and unlocks. Uses the shared
 *    recovery-handler watchers when provided.
 *
 * The layer rendering itself (setLayerProgress inside renderAodTransitionProgress)
 * is reused unchanged; we suppress its seek by passing minDeltaSeconds:Infinity,
 * which makes seekVideoToProgress always early-return without touching currentTime.
 */

import { renderAodTransitionProgress, prepareAodTransition, waitForAodTransitionMetadata } from '../../components/aod-transition.js';

const AOD_SECTION_SELECTOR = '[data-aod-transition]';
// Render layers from real playback time without ever writing currentTime.
const NO_SEEK = { minDeltaSeconds: Infinity };

function report(reportMilestone, name, value = true) {
  if (typeof reportMilestone === 'function') reportMilestone(name, value);
}

/**
 * @param {Object} options
 * @param {HTMLElement} options.host - the aod scene DOM host ([data-scene-id="aod-animation"])
 * @param {boolean} [options.reduceMotion]
 * @param {() => object|null} [options.getRecoveryHandler] - lazy accessor for the
 *   shared recovery-handler (it is created after adapters are registered).
 * @param {object} [options.deps] - injectable seams for tests (mountMarkup, raf, caf, now)
 * @returns {{ play: (o?:{direction?:1|-1, reportMilestone?:Function, reportFrame?:Function})=>Promise<void>, render:(frame:object|number)=>void, showFirstFrame: ()=>Promise<void>, getProgress: ()=>number, destroy: ()=>void }}
 */
export function createAodSceneAdapter({
  host,
  reduceMotion = false,
  getRecoveryHandler = () => null,
  deps = {}
} = {}) {
  if (!host) throw new Error('aod scene adapter requires a host element');

  const raf = deps.raf || ((cb) => requestAnimationFrame(cb));
  const caf = deps.caf || ((id) => cancelAnimationFrame(id));
  // mountMarkup lets tests inject a section+fake video without real DOM/WebM.
  const mountMarkup = deps.mountMarkup || defaultMountMarkup;

  let section = null;
  let video = null;
  let progress = 0;
  let rafId = 0;
  let destroyed = false;
  let prepared = false;
  let preparePromise = null;
  let activeReportFrame = null;

  function defaultMountMarkup(hostEl) {
    // Reuse the same markup the legacy aod homepage adapter builds.
    hostEl.classList?.add('homepage-transition', 'homepage-transition--aod');
    hostEl.innerHTML = `
      <section class="aod-transition" data-aod-transition data-aod-duration="2"
        data-aod-scroll-vh="20" data-aod-video-duration="5.03"
        data-aod-fullscreen-start="0" data-aod-fullscreen-end="0.85"
        data-aod-backdrop-exit-start="0.18" data-aod-backdrop-exit-end="1.55"
        data-aod-figure-start-scale="1" data-aod-figure-start-y-vh="10.5"
        aria-hidden="true">
        <div class="aod-transition__sticky"><div class="aod-transition__field">
          <div class="aod-transition__layer-stack" aria-hidden="true">
            <img class="aod-transition__layer aod-transition__layer--cloud" data-aod-cloud-layer src="assets/aod_cloud-alpha.png" alt="" />
            <img class="aod-transition__layer aod-transition__layer--sun" data-aod-sun-layer src="assets/aod_sun-alpha.png" alt="" />
          </div>
          <video class="aod-transition__figure-video" data-aod-figure-video src="assets/aod_figure-alpha-front-scrub.webm" muted preload="auto" playsinline webkit-playsinline></video>
          <div class="aod-transition__paper-solid" aria-hidden="true"></div>
          <canvas class="aod-transition__ink" data-aod-ink-canvas aria-hidden="true"></canvas>
        </div></div>
      </section>`;
    return hostEl.querySelector(AOD_SECTION_SELECTOR);
  }

  function stopLoop() {
    if (rafId) { caf(rafId); rafId = 0; }
  }

  function durationOf() {
    const d = video?.duration;
    return Number.isFinite(d) && d > 0 ? d : 5.03; // fallback per component default
  }

  function playbackProgress() {
    if (!section || !video) return;
    return Math.min(1, Math.max(0, (video.currentTime || 0) / durationOf()));
  }

  /** Render visual layers from the Director's SceneTimelineFrame. */
  function render(frame) {
    if (!section) return;
    const nextProgress = typeof frame === 'number' ? frame : frame?.progress;
    progress = Math.min(1, Math.max(0, Number.isFinite(nextProgress) ? nextProgress : 0));
    renderAodTransitionProgress(section, progress, NO_SEEK);
  }

  function emitFrame(nextProgress, reason = 'aod-frame') {
    if (typeof activeReportFrame === 'function') {
      activeReportFrame(nextProgress, reason);
    } else {
      render(nextProgress);
    }
  }

  /**
   * Prepare and present the first frame without playing. The only place (besides
   * reset) currentTime is written — to 0.
   */
  async function showFirstFrame() {
    if (destroyed) return;
    if (prepared) return;
    if (preparePromise) return preparePromise;

    preparePromise = (async () => {
      if (!section) section = mountMarkup(host);
      video = section.querySelector('[data-aod-figure-video]');
      prepareAodTransition(section, { progress: 0 });
      if (video) { try { video.currentTime = 0; } catch { /* not seekable yet */ } }
      await waitForAodTransitionMetadata(section);
      render(0);
      prepared = true;
    })();

    try {
      await preparePromise;
    } finally {
      preparePromise = null;
    }
  }

  /**
   * Play the aod animation via real video playback. Resolves when the video
   * ends (or reaches the end by time); rejects on play() failure / no media so
   * the runtime recovers. Never scrubs.
   */
  async function play({ direction = 1, reportMilestone, reportFrame } = {}) {
    if (destroyed) return { status: 'complete' };
    activeReportFrame = reportFrame;
    try {
      if (!prepared) await showFirstFrame();
      report(reportMilestone, 'mediaReady');
      report(reportMilestone, 'targetReady');

      // Reduced motion or reverse: present terminal state, no playback.
      // (Reverse for a no-reverse-asset media scene degrades to terminal per the
      //  reverse matrix; the ink/runtime handles the visual fallback.)
      if (reduceMotion || direction === -1) {
        emitFrame(direction === -1 ? 0 : 1, 'aod-terminal');
        report(reportMilestone, 'playbackComplete');
        return { status: 'complete' };
      }

      if (!video) throw new Error('aod: no video element to play');

      // Kick playback. video.play() can reject (autoplay policy, decode error).
      const playPromise = Promise.resolve(video.play?.());

      // Optional shared-watcher recovery (metadata/play/end timeouts).
      const recovery = getRecoveryHandler();
      if (recovery?.watchMediaPlay) {
        recovery.watchMediaPlay(video, undefined, { id: 'aod-animation' }).catch(() => {});
      }

      await playPromise; // throws -> caller (scenePresenter) routes to recovery

      // Drive layers from real time until the video ends.
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (ok, err) => {
          if (settled) return;
          settled = true;
          stopLoop();
          video.removeEventListener('ended', onEnded);
          video.removeEventListener('error', onError);
          ok ? resolve() : reject(err);
        };
        const onEnded = () => { emitFrame(1, 'aod-ended'); finish(true); };
        const onError = () => finish(false, new Error('aod: video error during playback'));

        video.addEventListener('ended', onEnded, { once: true });
        video.addEventListener('error', onError, { once: true });

        const loop = () => {
          if (destroyed) { finish(true); return; }
          const nextProgress = playbackProgress();
          emitFrame(nextProgress, 'aod-playback');
          // Safety: some browsers fire 'ended' unreliably; treat >=~end as done.
          if (video.duration && video.currentTime >= video.duration - 0.05) {
            emitFrame(1, 'aod-complete-by-time');
            finish(true);
            return;
          }
          rafId = raf(loop);
        };
        rafId = raf(loop);
      });

      emitFrame(1, 'aod-complete');
      report(reportMilestone, 'playbackComplete');
      return { status: 'complete' };
    } finally {
      activeReportFrame = null;
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopLoop();
    try { video?.pause?.(); } catch { /* noop */ }
    host.replaceChildren?.();
    host.classList?.remove('homepage-transition', 'homepage-transition--aod');
  }

  return { play, render, showFirstFrame, getProgress: () => progress, destroy };
}
