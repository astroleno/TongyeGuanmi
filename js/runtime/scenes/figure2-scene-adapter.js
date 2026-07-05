/**
 * figure2-animation Scene Adapter (time-driven, reuses figure2 controller)
 *
 * Third real adapter, most complex component — but bounded: the manifest already
 * expresses the plan's "four sub-stages" as separate scenes (figure2-animation =
 * animation, figure2-proof-cards/closing = reading, figure2-proof-to-brand =
 * ink). This adapter drives ONLY figure2-animation: the camera-expand + figure
 * video playback.
 *
 * Reuses the existing controller's framework-agnostic seam
 * (js/components/figure2-transition.js: prepare/waitForVideos/renderStaticState/
 * startFigureVideoPlayback/finishFigureVideoPlayback) but NOT its scroll
 * machinery (mountGsap/mountNativeFallback/ScrollTrigger). The old path fed
 * (introProgress, transitionProgress) from scroll; we feed introProgress from a
 * time driver — same visual, time-driven playback (no scroll-scrub).
 *
 * intro axis  = camera-expand (cloud/arcade/middle push + figure video)
 * transition axis = ink sweep out -> brand. This increment keeps transition at 0;
 * the ink-sweep is the deferred figure2-proof-to-brand block, not this scene.
 *
 * Testability: control flow is unit-tested with a FAKE controller + driver
 * (no WebGL/WebM under node). The real WebGL/alpha-video render needs browser
 * confirmation.
 */

import { createTimedProgressDriver } from '../timed-progress-driver.js';
import { createFigure2TransitionController } from '../../components/figure2-transition.js';

const FIGURE2_SECTION_SELECTOR = '[data-figure2-transition]';
const DEFAULT_DURATION_MS = 2400; // matches the component's data-figure2-duration 2.4s

function report(reportMilestone, name, value = true) {
  if (typeof reportMilestone === 'function') reportMilestone(name, value);
}

/**
 * Same markup the legacy homepage adapter builds, minus behavior. Kept here so
 * the scene adapter owns its DOM and the controller can resolve every layer.
 */
function defaultMountMarkup(hostEl) {
  hostEl.classList.add('homepage-transition', 'homepage-transition--figure2', 'figure2-alpha-video');
  hostEl.innerHTML = `
    <section class="figure2-scroll" data-figure2-transition data-figure2-stage
      data-figure2-scroll-vh="140" data-figure2-duration="2.4" data-figure2-scene-duration="1.28"
      data-figure2-scene-range-vh="100" data-figure2-video-segment="5" aria-hidden="true">
      <div class="figure2-sticky"><div class="figure2-field">
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
      </div></div>
    </section>`;
  return hostEl.querySelector(FIGURE2_SECTION_SELECTOR);
}

/**
 * @param {Object} options
 * @param {HTMLElement} options.host - [data-scene-id="figure2-animation"] host
 * @param {boolean} [options.reduceMotion]
 * @param {number} [options.durationMs]
 * @param {object} [options.deps] - injectable seams for tests:
 *   mountMarkup(host)->section, createController(section,opts)->controller,
 *   createDriver(opts)->driver
 * @returns {{ play:(o?:{direction?:1|-1})=>Promise<void>, showFirstFrame:()=>Promise<void>, getProgress:()=>number, destroy:()=>void }}
 */
export function createFigure2SceneAdapter({
  host,
  reduceMotion = false,
  durationMs = DEFAULT_DURATION_MS,
  deps = {}
} = {}) {
  if (!host) throw new Error('figure2 scene adapter requires a host element');

  const mountMarkup = deps.mountMarkup || defaultMountMarkup;
  const createController = deps.createController
    || ((section, opts) => createFigure2TransitionController(section, opts));
  const createDriver = deps.createDriver || createTimedProgressDriver;

  let section = null;
  let controller = null;
  let prepared = false;
  let destroyed = false;
  let intro = 0;

  const driver = createDriver({
    durationMs,
    onProgress: (p) => {
      intro = p;
      controller?.renderStaticState?.({ introProgress: p, transitionProgress: 0 });
    }
  });

  async function showFirstFrame() {
    if (destroyed || prepared) return;
    section = mountMarkup(host);
    controller = createController(section, { root: host, body: host, reduceMotion });
    if (!controller) throw new Error('figure2 controller could not initialize');
    controller.prepare?.();
    // No mountGsap/mountNativeFallback — playback is time-driven, not scrolled.
    await (controller.waitForVideos?.() || Promise.resolve());
    intro = 0;
    controller.renderStaticState?.({ introProgress: 0, transitionProgress: 0 });
    prepared = true;
  }

  function presentTerminal() {
    intro = 1;
    controller?.renderStaticState?.({ introProgress: 1, transitionProgress: 0 });
    controller?.finishFigureVideoPlayback?.();
  }

  async function play({ direction = 1, reportMilestone } = {}) {
    if (destroyed) return { status: 'complete' };
    if (!prepared) await showFirstFrame();
    if (!controller) throw new Error('figure2: no controller to play');
    report(reportMilestone, 'mediaReady');
    report(reportMilestone, 'targetReady');

    // Reduced motion, or reverse (true reverse video deferred): present terminal.
    if (reduceMotion || direction === -1) {
      presentTerminal();
      report(reportMilestone, 'playbackComplete');
      return { status: 'complete' };
    }

    // Forward: real video playback + time-driven camera-expand ramp. No scrub.
    controller.startFigureVideoPlayback?.();
    await driver.play({ direction: 1 });
    // Settle to the expanded terminal and let the video finish cleanly.
    intro = 1;
    controller.renderStaticState?.({ introProgress: 1, transitionProgress: 0 });
    controller.finishFigureVideoPlayback?.();
    report(reportMilestone, 'playbackComplete');
    return { status: 'complete' };
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    driver.cancel();
    controller?.destroy?.();
    controller = null;
    host.replaceChildren?.();
  }

  return { play, showFirstFrame, getProgress: () => intro, destroy };
}
