import {
  prepareAodTransition,
  renderAodTransitionProgress,
  waitForAodTransitionMetadata
} from '../components/aod-transition.js';
import { createInkCurtainTransition } from '../effects/ink-scene-transition.js';

export const AOD_SCENE_TRACE_STATES = [
  'idle',
  'mounted',
  'poster',
  'playing-forward',
  'complete',
  'stable',
  'destroyed'
];

export const AOD_EARLY_COPY_TARGET = 'method-top';

const DEFAULT_VIDEO_DURATION_SECONDS = 5.03;
const NO_SEEK = { minDeltaSeconds: Infinity };

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothStep = (value) => value * value * (3 - 2 * value);

function getWindow() {
  return typeof window !== 'undefined' ? window : globalThis;
}

function makeAbortError() {
  const error = new Error('aod scene player aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw makeAbortError();
}

function addAbortListener(signal, callback) {
  if (!signal) return () => {};
  signal.addEventListener('abort', callback, { once: true });
  return () => signal.removeEventListener('abort', callback);
}

function safeCall(fn) {
  try {
    fn?.();
  } catch {
    // Cleanup paths must be recovery-safe.
  }
}

function formatProgress(progress) {
  return Number(clamp(progress).toFixed(4));
}

function defaultMountMarkup(host) {
  host.innerHTML = `
    <section
      class="aod-transition"
      data-aod-transition
      data-aod-duration="2"
      data-aod-video-duration="5.03"
      data-aod-fullscreen-start="0"
      data-aod-fullscreen-end="0.85"
      data-aod-backdrop-exit-start="0.18"
      data-aod-backdrop-exit-end="1.55"
      data-aod-figure-start-scale="1"
      data-aod-figure-start-y-vh="10.5"
      aria-label="The Ancient of Days scene harness"
    >
      <div class="aod-transition__sticky">
        <div class="aod-transition__field">
          <div class="aod-transition__layer-stack" aria-hidden="true">
            <img class="aod-transition__layer aod-transition__layer--cloud" data-aod-cloud-layer src="assets/aod_cloud-alpha.png" alt="" />
            <img class="aod-transition__layer aod-transition__layer--sun" data-aod-sun-layer src="assets/aod_sun-alpha.png" alt="" />
          </div>
          <video
            class="aod-transition__figure-video"
            data-aod-figure-video
            src="assets/aod_figure-alpha-front-scrub.webm"
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

  return host.querySelector('[data-aod-transition]');
}

function waitForFirstFrame(video, {
  signal,
  timeoutMs = 5000,
  setTimeoutFn = getWindow().setTimeout?.bind(getWindow()) || setTimeout,
  clearTimeoutFn = getWindow().clearTimeout?.bind(getWindow()) || clearTimeout
} = {}) {
  if (!video || video.readyState >= 2) return Promise.resolve();
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = [];
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      cleanup.splice(0).forEach((fn) => safeCall(fn));
      if (error) reject(error);
      else resolve();
    };

    const onReady = () => finish();
    const onError = () => finish(new Error('aod poster gate failed: video error'));
    const onAbort = () => finish(makeAbortError());
    const onTimeout = () => finish(new Error('aod poster gate timed out'));

    video.addEventListener?.('loadeddata', onReady, { once: true });
    video.addEventListener?.('canplay', onReady, { once: true });
    video.addEventListener?.('error', onError, { once: true });
    cleanup.push(() => video.removeEventListener?.('loadeddata', onReady));
    cleanup.push(() => video.removeEventListener?.('canplay', onReady));
    cleanup.push(() => video.removeEventListener?.('error', onError));
    cleanup.push(addAbortListener(signal, onAbort));

    const timer = setTimeoutFn(onTimeout, timeoutMs);
    cleanup.push(() => clearTimeoutFn(timer));
    video.load?.();
  });
}

export function createAodScenePlayer(options = {}) {
  const win = getWindow();
  const deps = options.deps || {};
  const raf = deps.raf || win.requestAnimationFrame?.bind(win) || ((callback) => setTimeout(callback, 16));
  const caf = deps.caf || win.cancelAnimationFrame?.bind(win) || ((id) => clearTimeout(id));
  const setTimeoutFn = deps.setTimeout || win.setTimeout?.bind(win) || setTimeout;
  const clearTimeoutFn = deps.clearTimeout || win.clearTimeout?.bind(win) || clearTimeout;
  const now = deps.now || (() => win.performance?.now?.() ?? Date.now());
  const mountMarkup = deps.mountMarkup || defaultMountMarkup;
  const createInkTransition = deps.createInkTransition || createInkCurtainTransition;
  const playVideo = deps.playVideo || ((video) => video.play());

  const posterTimeoutMs = options.posterTimeoutMs ?? 5000;
  const playbackTimeoutMs = options.playbackTimeoutMs ?? 12000;
  const stableDelayMs = options.stableDelayMs ?? 700;
  const completionPaddingSeconds = options.completionPaddingSeconds ?? 0.05;
  const durationFallbackSeconds = options.durationFallbackSeconds ?? DEFAULT_VIDEO_DURATION_SECONDS;
  const onTraceDefault = options.onTrace || null;

  let host = options.host || null;
  let section = null;
  let video = null;
  let inkCanvas = null;
  let inkTransition = null;
  let state = 'idle';
  let progress = 0;
  let earlyCopyFired = false;
  let completeFired = false;
  let rafId = 0;
  let playbackTimeoutId = 0;
  let stableTimerId = 0;
  let playbackCleanups = [];
  let activePlaybackCancel = null;
  let traceSeq = 0;
  let activeTraceCallback = null;
  const trace = [];

  function dispatchTrace(entry) {
    const callback = activeTraceCallback || onTraceDefault;
    callback?.(entry);

    if (!host?.dispatchEvent || typeof CustomEvent === 'undefined') return;
    host.dispatchEvent(new CustomEvent('aod-scene-trace', { detail: entry }));
  }

  function recordTrace(type, detail = {}) {
    const entry = {
      seq: ++traceSeq,
      type,
      state,
      progress: formatProgress(progress),
      at: Math.round(now()),
      ...detail
    };
    trace.push(entry);
    if (trace.length > 200) trace.shift();
    dispatchTrace(entry);
    return entry;
  }

  function updateHostState() {
    if (!host) return;
    if (host.dataset) {
      host.dataset.aodSceneState = state;
      host.dataset.aodSceneProgress = progress.toFixed(4);
      host.dataset.aodEarlyCopyReady = earlyCopyFired ? 'true' : 'false';
    }
    host.style?.setProperty?.('--aod-scene-progress', progress.toFixed(4));
  }

  function transitionTo(nextState, detail = {}) {
    if (state === 'destroyed' && nextState !== 'destroyed') return;
    if (state === nextState && !detail.forceTrace) return;
    state = nextState;
    updateHostState();
    recordTrace(nextState, detail);
  }

  function setProgress(nextProgress) {
    progress = clamp(nextProgress);
    updateHostState();
  }

  function durationOf() {
    const duration = video?.duration;
    return Number.isFinite(duration) && duration > 0 ? duration : durationFallbackSeconds;
  }

  function renderInk(nextProgress) {
    inkTransition?.render?.(smoothStep(clamp(nextProgress)));
    if (inkCanvas && nextProgress <= 0) {
      inkCanvas.style.visibility = 'hidden';
      inkCanvas.style.opacity = '0';
    }
  }

  function renderPosterFrame() {
    if (!section) return;
    safeCall(() => video?.pause?.());
    if (video) {
      try {
        video.currentTime = 0;
      } catch {
        // Some browsers reject the seek until metadata is available.
      }
    }
    setProgress(0);
    renderAodTransitionProgress(section, 0);
    renderInk(0);
  }

  function renderPlaybackFrame() {
    if (!section || !video) return;
    const nextProgress = clamp((video.currentTime || 0) / durationOf());
    setProgress(nextProgress);
    renderAodTransitionProgress(section, nextProgress, NO_SEEK);
    renderInk(nextProgress);
    emitEarlyCopyReady(nextProgress);
  }

  function emitEarlyCopyReady(nextProgress = progress) {
    if (earlyCopyFired || nextProgress < 0.8) return;

    earlyCopyFired = true;
    updateHostState();
    recordTrace('early-copy-ready', {
      target: AOD_EARLY_COPY_TARGET,
      event: `early-copy-ready: ${AOD_EARLY_COPY_TARGET}`
    });
  }

  function clearStableTimer() {
    if (!stableTimerId) return;
    clearTimeoutFn(stableTimerId);
    stableTimerId = 0;
  }

  function cleanupPlayback() {
    if (rafId) {
      caf(rafId);
      rafId = 0;
    }
    if (playbackTimeoutId) {
      clearTimeoutFn(playbackTimeoutId);
      playbackTimeoutId = 0;
    }
    playbackCleanups.splice(0).forEach((fn) => safeCall(fn));
  }

  function addPlaybackCleanup(fn) {
    playbackCleanups.push(fn);
  }

  function cleanupToPoster() {
    cleanupPlayback();
    renderPosterFrame();
  }

  function failClean(reason, error) {
    cleanupPlayback();
    safeCall(() => video?.pause?.());
    renderPosterFrame();
    transitionTo('failed-clean', {
      reason,
      error: error?.message || String(error || reason),
      forceTrace: state === 'failed-clean'
    });
  }

  function completePlayback(reason) {
    if (completeFired) return false;
    completeFired = true;
    cleanupPlayback();
    safeCall(() => video?.pause?.());
    setProgress(1);
    emitEarlyCopyReady(1);
    if (section) renderAodTransitionProgress(section, 1, NO_SEEK);
    renderInk(1);
    transitionTo('complete', { reason });
    clearStableTimer();
    stableTimerId = setTimeoutFn(() => {
      stableTimerId = 0;
      if (state === 'complete') transitionTo('stable', { reason: 'complete-settled' });
    }, stableDelayMs);
    return true;
  }

  async function ensureMounted(signal) {
    throwIfAborted(signal);
    if (section) return;
    await mount({ host, signal });
  }

  async function mount({ host: nextHost = host, signal } = {}) {
    throwIfAborted(signal);
    if (state === 'destroyed') throw new Error('aod scene player has been destroyed');
    if (!nextHost) throw new Error('aod scene player mount requires a host');

    cleanupPlayback();
    clearStableTimer();
    host = nextHost;
    earlyCopyFired = false;
    completeFired = false;

    section = mountMarkup(host);
    if (!section) throw new Error('aod scene player failed to mount AOD section');

    video = section.querySelector?.('[data-aod-figure-video]') || null;
    inkCanvas = section.querySelector?.('[data-aod-ink-canvas]') || null;
    inkTransition = createInkTransition(inkCanvas, {
      direction: 'bottom-up',
      colorLift: 0.64,
      coverAlpha: 0.64,
      fadeOutStart: 0.82,
      fadeOutEnd: 1,
      progressSpan: 1
    });
    inkTransition?.prewarm?.();
    prepareAodTransition(section, { progress: 0 });
    renderInk(0);
    setProgress(0);
    transitionTo('mounted');
    return getState();
  }

  async function showPoster({ direction = 'forward', signal } = {}) {
    try {
      await ensureMounted(signal);
      throwIfAborted(signal);
      cleanupPlayback();
      clearStableTimer();
      earlyCopyFired = false;
      completeFired = false;
      prepareAodTransition(section, { progress: 0 });
      await waitForAodTransitionMetadata(section, { timeoutMs: posterTimeoutMs });
      await waitForFirstFrame(video, { signal, timeoutMs: posterTimeoutMs, setTimeoutFn, clearTimeoutFn });
      throwIfAborted(signal);
      renderPosterFrame();
      transitionTo('poster', { direction });
      return getState();
    } catch (error) {
      if (error?.name === 'AbortError') {
        cleanupToPoster();
        transitionTo('poster', { reason: 'poster-abort' });
        throw error;
      }

      failClean('poster-gate-failed', error);
      throw error;
    }
  }

  function playForward({ signal, onProgress, onTrace } = {}) {
    cleanupPlayback();
    clearStableTimer();
    activeTraceCallback = onTrace || null;

    return new Promise((resolve, reject) => {
      let settled = false;
      let localCancelPlayback = null;

      const settle = (completed, value) => {
        if (settled) return;
        settled = true;
        if (activePlaybackCancel === localCancelPlayback) activePlaybackCancel = null;
        activeTraceCallback = null;
        if (completed) resolve(value);
        else reject(value);
      };

      if (signal?.aborted) {
        settle(true, { completed: false, cancelled: true, reason: 'signal-abort' });
        return;
      }

      const runController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const runSignal = runController?.signal || signal;

      const fail = (reason, error) => {
        if (settled) return;
        failClean(reason, error);
        settle(false, error instanceof Error ? error : new Error(String(error || reason)));
      };

      const cancelPlayback = (reason) => {
        if (settled) return;
        runController?.abort();
        cleanupToPoster();
        earlyCopyFired = false;
        completeFired = false;
        clearStableTimer();
        transitionTo('poster', { reason });
        settle(true, { completed: false, cancelled: true, reason });
      };
      localCancelPlayback = cancelPlayback;

      const cancelFromSignal = () => cancelPlayback('signal-abort');
      activePlaybackCancel = cancelPlayback;
      addPlaybackCleanup(addAbortListener(signal, cancelFromSignal));

      (async () => {
        try {
          await ensureMounted(runSignal);
          if (settled) return;
          if (state !== 'poster') await showPoster({ direction: 'forward', signal: runSignal });
          if (settled) return;
          throwIfAborted(runSignal);

          earlyCopyFired = false;
          completeFired = false;
          transitionTo('playing-forward');

          if (!video) throw new Error('aod scene player has no video element');

          const handleEnded = () => {
            if (settled) return;
            if (!completePlayback('ended')) return;
            settle(true, { completed: true, reason: 'ended' });
          };
          const handleError = () => {
            fail('video-error', new Error('aod scene player video error'));
          };

          video.addEventListener?.('ended', handleEnded, { once: true });
          video.addEventListener?.('error', handleError, { once: true });
          addPlaybackCleanup(() => video.removeEventListener?.('ended', handleEnded));
          addPlaybackCleanup(() => video.removeEventListener?.('error', handleError));
          addPlaybackCleanup(addAbortListener(signal, cancelFromSignal));

          playbackTimeoutId = setTimeoutFn(() => {
            fail('playback-timeout', new Error('aod scene player playback timed out'));
          }, playbackTimeoutMs);

          await Promise.resolve(playVideo(video));
          if (settled) return;

          const tick = () => {
            if (settled || state !== 'playing-forward') return;
            renderPlaybackFrame();
            onProgress?.(progress);

            const duration = durationOf();
            const acceptedFallback = Number.isFinite(duration)
              && duration > 0
              && video
              && video.currentTime >= duration - completionPaddingSeconds;

            if (acceptedFallback) {
              if (completePlayback('accepted-fallback')) {
                settle(true, { completed: true, reason: 'accepted-fallback' });
              }
              return;
            }

            rafId = raf(tick);
          };

          rafId = raf(tick);
        } catch (error) {
          if (settled) return;
          if (error?.name === 'AbortError') {
            cancelFromSignal();
            return;
          }
          fail('play-reject', error);
        }
      })();
    });
  }

  async function cancelToSource({ signal } = {}) {
    throwIfAborted(signal);
    if (activePlaybackCancel) {
      activePlaybackCancel('cancel-to-source');
      return getState();
    }
    await ensureMounted(signal);
    cleanupToPoster();
    earlyCopyFired = false;
    completeFired = false;
    clearStableTimer();
    transitionTo('poster', { reason: 'cancel-to-source' });
    return getState();
  }

  async function reverseToPoster({ signal } = {}) {
    throwIfAborted(signal);
    if (activePlaybackCancel) {
      activePlaybackCancel('reverse-to-poster');
      return getState();
    }
    await ensureMounted(signal);
    cleanupToPoster();
    earlyCopyFired = false;
    completeFired = false;
    clearStableTimer();
    transitionTo('poster', { reason: 'reverse-to-poster' });
    return getState();
  }

  function destroy() {
    if (state === 'destroyed') return getState();
    activePlaybackCancel?.('destroy');
    cleanupPlayback();
    clearStableTimer();
    safeCall(() => video?.pause?.());
    transitionTo('destroyed');
    safeCall(() => host?.replaceChildren?.());
    section = null;
    video = null;
    inkCanvas = null;
    inkTransition = null;
    return getState();
  }

  function getState() {
    return {
      state,
      status: state,
      progress: formatProgress(progress),
      mounted: Boolean(section),
      earlyCopyFired,
      completeFired,
      trace: trace.slice()
    };
  }

  recordTrace('idle');

  return {
    mount,
    showPoster,
    playForward,
    cancelToSource,
    reverseToPoster,
    destroy,
    getState
  };
}

export default createAodScenePlayer;
