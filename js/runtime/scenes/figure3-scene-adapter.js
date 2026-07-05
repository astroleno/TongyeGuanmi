/**
 * figure3-animation Scene Adapter (time-driven)
 *
 * Uses the existing figure3 renderer as a visual playback surface. The adapter
 * resolves only after playback reaches terminal state; SceneTimeline owns the
 * target presentation in the Director's Completing phase.
 */

import { createTimedProgressDriver } from '../timed-progress-driver.js';
import {
  prepareFigure3Transition,
  renderFigure3TransitionProgress,
  waitForFigure3TransitionMetadata
} from '../../components/figure3-transition.js';

const DEFAULT_DURATION_MS = 2800;
const FIGURE3_SECTION_SELECTOR = '[data-figure3-transition]';

function defaultMountMarkup(hostEl) {
  hostEl.classList.add('homepage-transition', 'homepage-transition--figure3');
  hostEl.innerHTML = `
    <section
      class="figure3-transition"
      data-figure3-transition
      data-figure3-duration="2"
      data-figure3-scroll-vh="20"
      aria-hidden="true"
    >
      <div class="figure3-transition__sticky">
        <div class="figure3-transition__backdrop" aria-hidden="true"></div>
        <div class="figure3-transition__stage" aria-hidden="true">
          <video class="figure3-transition__video" data-figure3-alpha-video src="assets/figure3-alpha-scrub.webm?v=1280-q40" poster="assets/figure3-alpha-poster.png" muted preload="auto" playsinline webkit-playsinline></video>
          <div class="figure3-transition__fill" data-figure3-fill aria-hidden="true"></div>
          <div class="figure3-transition__visual-bridge" data-transition-ghost="figure3-fabric" aria-hidden="true"></div>
        </div>
      </div>
    </section>
  `;
  return hostEl.querySelector(FIGURE3_SECTION_SELECTOR);
}

function report(reportMilestone, name, value = true) {
  if (typeof reportMilestone === 'function') reportMilestone(name, value);
}

/**
 * @param {Object} options
 * @param {HTMLElement} options.host - [data-scene-id="figure3-animation"] host
 * @param {boolean} [options.reduceMotion]
 * @param {number} [options.durationMs]
 * @param {object} [options.deps]
 * @returns {{ play:(o?:{direction?:1|-1, reportMilestone?:Function, reportFrame?:Function})=>Promise<object>, render:(frame:object|number)=>void, showFirstFrame:()=>Promise<void>, getProgress:()=>number, destroy:()=>void }}
 */
export function createFigure3SceneAdapter({
  host,
  reduceMotion = false,
  durationMs = DEFAULT_DURATION_MS,
  deps = {}
} = {}) {
  if (!host) throw new Error('figure3 scene adapter requires a host element');

  const mountMarkup = deps.mountMarkup || defaultMountMarkup;
  const createDriver = deps.createDriver || createTimedProgressDriver;

  let section = null;
  let alphaVideo = null;
  let progress = 0;
  let prepared = false;
  let destroyed = false;
  let preparePromise = null;
  let activeReportFrame = null;

  function render(frame) {
    const nextProgress = typeof frame === 'number' ? frame : frame?.progress;
    progress = Math.max(0, Math.min(1, Number.isFinite(nextProgress) ? nextProgress : 0));
    if (section) renderFigure3TransitionProgress(section, progress, { alphaVideo });
  }

  function emitFrame(nextProgress, reason = 'figure3-frame') {
    if (typeof activeReportFrame === 'function') {
      activeReportFrame(nextProgress, reason);
    } else {
      render(nextProgress);
    }
  }

  const driver = createDriver({
    durationMs,
    onProgress: (p) => emitFrame(p)
  });

  async function showFirstFrame() {
    if (destroyed || prepared) return;
    if (preparePromise) return preparePromise;

    preparePromise = (async () => {
      section = mountMarkup(host);
      ({ alphaVideo } = prepareFigure3Transition(section, { progress: 0 }));
      await waitForFigure3TransitionMetadata(section);
      render(0);
      prepared = true;
    })();

    try {
      await preparePromise;
    } finally {
      preparePromise = null;
    }
  }

  async function play({ direction = 1, reportMilestone, reportFrame } = {}) {
    if (destroyed) return { status: 'complete' };
    activeReportFrame = reportFrame;
    try {
      if (!prepared) await showFirstFrame();
      report(reportMilestone, 'mediaReady');
      report(reportMilestone, 'targetReady');

      if (reduceMotion || direction === -1) {
        emitFrame(direction === -1 ? 0 : 1, 'figure3-terminal');
        report(reportMilestone, 'playbackComplete');
        return { status: 'complete' };
      }

      await driver.play({ direction: 1 });
      emitFrame(1, 'figure3-complete');
      report(reportMilestone, 'playbackComplete');
      return { status: 'complete' };
    } finally {
      activeReportFrame = null;
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    driver.cancel();
    try { alphaVideo?.pause?.(); } catch { /* noop */ }
    host.replaceChildren?.();
    host.classList.remove('homepage-transition', 'homepage-transition--figure3');
  }

  return { play, render, showFirstFrame, getProgress: () => progress, destroy };
}
