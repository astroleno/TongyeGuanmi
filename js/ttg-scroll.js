import { loadTransitionLibraries } from './transitions/load-libraries.js';
import { createReduceMotionState, createScrollProgressTrigger, initTransitionScrollRuntime } from './transitions/scroll-scene.js';
import { prepareScrubVideo, seekVideoToProgress, waitForVideoMetadata } from './transitions/video-scrub.js';

const root = document.documentElement;
const page = document.body;
const stage = document.querySelector('[data-ttg-stage]');
const bgLayer = document.querySelector('.ttg-layer--bg');
const middleLayer = document.querySelector('.ttg-layer--middle');
const middleOverlayLayer = document.querySelector('.ttg-layer--middle-overlay');
const frontLayer = document.querySelector('.ttg-layer--front');
const frontOverlayLayer = document.querySelector('.ttg-layer--front-overlay');
const figureLayers = [...document.querySelectorAll('.ttg-layer--figure')];
const figureLayer = figureLayers[0];
const figureVideo = document.querySelector('[data-ttg-figure-video]');
const figureReverseVideo = document.querySelector('[data-ttg-figure-video-reverse]');
const figureVideos = [figureVideo, figureReverseVideo].filter(Boolean);
const tunePanel = document.querySelector('[data-ttg-tune-panel]');
const reduceMotion = createReduceMotionState();
const TRANSITION_DURATION_SECONDS = 2.5;
const TRANSITION_SCROLL_RANGE = 0.2;
const VIDEO_DURATION_FALLBACK = 2.459;
const TUNING_STORAGE_KEY = 'ttg:scene-tuning:v13';
const TUNING_DEFAULTS = {
  previewProgress: -1,
  bgTravelVh: 14.3,
  middleTravelVh: 23.5,
  frontYVh: 29.2,
  frontTravelVh: 13.1,
  frontOverlayOpacity: 0.2,
  figureScale: 0.80,
  figureYVh: -8.5,
  figureTravelVh: 16.5,
  scrollVh: 153
};
const TUNING_LIMITS = {
  previewProgress: [-0.01, 1],
  bgTravelVh: [0, 18],
  middleTravelVh: [-20, 28],
  frontYVh: [-100, 100],
  frontTravelVh: [-100, 100],
  frontOverlayOpacity: [0, 0.6],
  figureScale: [0.35, 0.90],
  figureYVh: [-16, 16],
  figureTravelVh: [-20, 32],
  scrollVh: [110, 260]
};

let scrollRuntime = null;
let progressState = { target: 0, bg: 0, middle: 0, front: 0 };
let transitionProgressTween = null;
let scrollTriggers = [];
let gsapSetters = null;
let nativeTickerStarted = false;
let pointerParallaxBound = false;
let lastRenderedProgress = { bg: -1, middle: -1, front: -1 };
let lastRenderedMouseX = 999;
let lastRenderedMouseY = 999;
let lastRenderedTuningVersion = -1;
let tuningVersion = 0;
let scrollRefreshTimer = 0;
let currentTuning = { ...TUNING_DEFAULTS };
let activeFigureVideo = figureVideo;
let figurePlaybackDirection = 0;
let figurePlaybackRaf = 0;
let figureSwitchToken = 0;
let pendingFigureDirection = 0;

const parallaxMouse = { x: 0, y: 0 };
const nativeMouse = { targetX: 0, targetY: 0, x: 0, y: 0 };
const figurePlayhead = { raw: 0 };

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function acceleratedProgress(rawProgress) {
  const t = clamp(rawProgress, 0, 1);
  return clamp(0.78 * t + 0.22 * t * t, 0, 1);
}

function stableProgress(value) {
  if (value < 0.002) return 0;
  if (value > 0.998) return 1;
  return clamp(value, 0, 1);
}

function sanitizeTuning(input = {}) {
  return Object.fromEntries(Object.entries(TUNING_DEFAULTS).map(([key, defaultValue]) => {
    const value = Number(input[key]);
    const [min, max] = TUNING_LIMITS[key];
    return [key, clamp(Number.isFinite(value) ? value : defaultValue, min, max)];
  }));
}

function readStoredTuning() {
  try {
    return sanitizeTuning(JSON.parse(window.localStorage.getItem(TUNING_STORAGE_KEY)) || {});
  } catch {
    return sanitizeTuning();
  }
}

function persistTuning() {
  try {
    window.localStorage.setItem(TUNING_STORAGE_KEY, JSON.stringify(currentTuning));
  } catch {
    // Tuning should still work if storage is unavailable.
  }
}

function resetRenderCache() {
  lastRenderedProgress = { bg: -1, middle: -1, front: -1 };
  lastRenderedMouseX = 999;
  lastRenderedMouseY = 999;
  lastRenderedTuningVersion = -1;
}

function requestScrollRefresh() {
  if (!window.ScrollTrigger) return;
  window.clearTimeout(scrollRefreshTimer);
  scrollRefreshTimer = window.setTimeout(() => window.ScrollTrigger.refresh(), 60);
}

function applyTuning({ persist = true, refresh = false } = {}) {
  page.style.setProperty('--ttg-scroll-vh', currentTuning.scrollVh.toFixed(1));
  page.style.setProperty('--ttg-front-overlay-opacity', currentTuning.frontOverlayOpacity.toFixed(3));
  root.style.setProperty('--ttg-scroll-vh', currentTuning.scrollVh.toFixed(1));
  root.style.setProperty('--ttg-front-overlay-opacity', currentTuning.frontOverlayOpacity.toFixed(3));
  tuningVersion += 1;
  resetRenderCache();
  if (persist) persistTuning();
  if (refresh) requestScrollRefresh();
  renderPreviewFigureProgress();
  renderScene(getLiveProgressParts(), parallaxMouse.x, parallaxMouse.y);
}

function getProgressParts(progress) {
  if (typeof progress === 'number') {
    const p = stableProgress(progress);
    return { bg: p, middle: p, front: p };
  }

  return {
    bg: stableProgress(progress?.bg ?? 0),
    middle: stableProgress(progress?.middle ?? 0),
    front: stableProgress(progress?.front ?? 0)
  };
}

function getPreviewProgress() {
  return currentTuning.previewProgress >= 0
    ? stableProgress(currentTuning.previewProgress)
    : null;
}

function getLiveProgressParts() {
  const previewProgress = getPreviewProgress();
  if (previewProgress !== null) {
    const visualProgress = acceleratedProgress(previewProgress);
    return { bg: visualProgress, middle: visualProgress, front: visualProgress };
  }

  return {
    bg: progressState.bg,
    middle: progressState.middle,
    front: progressState.front
  };
}

function renderPreviewFigureProgress() {
  const previewProgress = getPreviewProgress();
  if (previewProgress === null) return;
  cancelPendingFigureSwitch();
  cancelFigurePlaybackTicker();
  figurePlaybackDirection = 0;
  pauseFigureVideos();
  showFigureVideo(figureVideo);
  transitionProgressTween?.kill?.();
  transitionProgressTween = null;
  figurePlayhead.raw = previewProgress;
  renderRawTransitionProgress(previewProgress, { syncVideo: true });
}

function formatTuneValue(key, value) {
  if (key === 'previewProgress') return value < 0 ? 'scroll' : value.toFixed(2);
  if (key === 'figureScale') return `${value.toFixed(2)}x`;
  if (key === 'frontOverlayOpacity') return `${Math.round(value * 100)}%`;
  if (key === 'scrollVh') return `${Math.round(value)}vh`;
  return `${value.toFixed(1)}vh`;
}

function initTuningPanel() {
  if (!tunePanel) return;

  const reset = tunePanel.querySelector('[data-ttg-tune-reset]');
  const controls = [...tunePanel.querySelectorAll('[data-ttg-tune-key]')].map((input) => {
    const key = input.dataset.ttgTuneKey;
    const output = tunePanel.querySelector(`[data-ttg-tune-output="${key}"]`);
    return { key, input, output };
  }).filter(({ key }) => key in TUNING_DEFAULTS);

  const syncControl = ({ key, input, output }) => {
    input.value = String(currentTuning[key]);
    if (output) output.textContent = formatTuneValue(key, currentTuning[key]);
  };

  tunePanel.addEventListener('pointerdown', (event) => event.stopPropagation());
  tunePanel.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
  tunePanel.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true });

  controls.forEach((control) => {
    syncControl(control);
    const handleInput = () => {
      currentTuning = sanitizeTuning({
        ...currentTuning,
        [control.key]: control.input.value
      });
      syncControl(control);
      applyTuning({ refresh: control.key === 'scrollVh' });
    };
    control.input.addEventListener('input', handleInput);
    control.input.addEventListener('change', handleInput);
  });

  reset?.addEventListener('click', () => {
    currentTuning = sanitizeTuning();
    controls.forEach(syncControl);
    applyTuning({ refresh: true });
  });
}

function setFigureProgress(progress) {
  const p = clamp(progress, 0, 1);
  page.style.setProperty('--ttg-figure-progress', p.toFixed(4));
  root.style.setProperty('--ttg-figure-progress', p.toFixed(4));
}

function getFigureVideoDuration(video) {
  return Number.isFinite(video?.duration) && video.duration > 0 ? video.duration : VIDEO_DURATION_FALLBACK;
}

function cancelFigurePlaybackTicker() {
  if (!figurePlaybackRaf) return;
  window.cancelAnimationFrame(figurePlaybackRaf);
  figurePlaybackRaf = 0;
}

function cancelPendingFigureSwitch() {
  figureSwitchToken += 1;
  pendingFigureDirection = 0;
}

function pauseFigureVideos(exceptVideo = null) {
  figureVideos.forEach((video) => {
    if (video && video !== exceptVideo) video.pause();
  });
}

function showFigureVideo(video) {
  if (!video) return;
  activeFigureVideo = video;
  figureVideos.forEach((candidate) => {
    candidate.classList.toggle('is-active', candidate === video);
  });
}

function waitForVideoFrame(video, timeoutMs = 180) {
  return new Promise((resolve) => {
    if (!video) {
      resolve();
      return;
    }

    let settled = false;
    const timeout = window.setTimeout(finish, timeoutMs);

    function cleanup() {
      video.removeEventListener('seeked', settleAfterFrame);
      video.removeEventListener('loadeddata', settleAfterFrame);
      video.removeEventListener('canplay', settleAfterFrame);
      window.clearTimeout(timeout);
    }

    function finish() {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }

    function settleAfterFrame() {
      if (settled) return;
      if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(() => finish());
        return;
      }
      window.requestAnimationFrame(finish);
    }

    video.addEventListener('seeked', settleAfterFrame, { once: true });
    video.addEventListener('loadeddata', settleAfterFrame, { once: true });
    video.addEventListener('canplay', settleAfterFrame, { once: true });

    if (!video.seeking && video.readyState >= 2) {
      settleAfterFrame();
    }
  });
}

function seekFigureVideosToProgress(rawProgress) {
  const p = clamp(rawProgress, 0, 1);
  seekVideoToProgress(figureVideo, p, {
    fallbackSeconds: VIDEO_DURATION_FALLBACK,
    endPaddingSeconds: 0.02,
    minDeltaSeconds: 0.016
  });
  seekVideoToProgress(figureReverseVideo, 1 - p, {
    fallbackSeconds: VIDEO_DURATION_FALLBACK,
    endPaddingSeconds: 0.02,
    minDeltaSeconds: 0.016
  });
}

function renderRawTransitionProgress(rawProgress, { syncVideo = false } = {}) {
  const raw = clamp(rawProgress, 0, 1);
  const visualProgress = acceleratedProgress(raw);
  figurePlayhead.raw = raw;
  setFigureProgress(visualProgress);
  progressState.bg = visualProgress;
  progressState.middle = visualProgress;
  progressState.front = visualProgress;
  renderCurrentScene();
  if (syncVideo) seekFigureVideosToProgress(raw);
}

function tweenToTransitionProgress(rawProgress, { syncVideo = true } = {}) {
  const { gsap } = window;
  const target = clamp(rawProgress, 0, 1);
  if (Math.abs(target - progressState.target) < 0.001 && transitionProgressTween) return;
  const distance = Math.abs(target - figurePlayhead.raw);

  progressState.target = target;
  cancelPendingFigureSwitch();
  cancelFigurePlaybackTicker();
  figurePlaybackDirection = 0;
  pauseFigureVideos();
  transitionProgressTween?.kill?.();
  transitionProgressTween = null;

  if (!gsap || reduceMotion || distance < 0.001) {
    figurePlayhead.raw = target;
    renderRawTransitionProgress(figurePlayhead.raw, { syncVideo });
    return;
  }

  transitionProgressTween = gsap.to(figurePlayhead, {
    raw: target,
    duration: Math.max(0.06, distance * TRANSITION_DURATION_SECONDS),
    ease: 'none',
    overwrite: true,
    onUpdate: () => renderRawTransitionProgress(figurePlayhead.raw, { syncVideo }),
    onComplete: () => {
      figurePlayhead.raw = target;
      transitionProgressTween = null;
      renderRawTransitionProgress(figurePlayhead.raw, { syncVideo });
    }
  });
}

function finishFigurePlayback(target) {
  cancelFigurePlaybackTicker();
  figurePlaybackDirection = 0;
  progressState.target = target;
  renderRawTransitionProgress(target);
}

function tickFigurePlayback(target) {
  const video = activeFigureVideo;
  const direction = figurePlaybackDirection;
  if (!video || !direction) return;

  const duration = getFigureVideoDuration(video);
  const raw = direction > 0
    ? clamp(video.currentTime / duration, 0, 1)
    : clamp(1 - video.currentTime / duration, 0, 1);

  renderRawTransitionProgress(raw);

  const reached = direction > 0
    ? raw >= target - 0.003 || video.ended
    : raw <= target + 0.003 || video.ended;

  if (reached) {
    finishFigurePlayback(target);
    return;
  }

  figurePlaybackRaf = window.requestAnimationFrame(() => tickFigurePlayback(target));
}

function playFigureTransition(direction) {
  if (getPreviewProgress() !== null) return;

  const normalizedDirection = direction >= 0 ? 1 : -1;
  const target = normalizedDirection > 0 ? 1 : 0;
  const rawProgress = clamp(figurePlayhead.raw, 0, 1);
  if (Math.abs(rawProgress - target) < 0.003 && !figurePlaybackDirection) return;

  const nextVideo = normalizedDirection > 0 ? figureVideo : figureReverseVideo;
  if (!nextVideo) {
    tweenToTransitionProgress(target, { syncVideo: true });
    return;
  }

  if (figurePlaybackDirection === normalizedDirection && !nextVideo.paused) return;
  if (pendingFigureDirection === normalizedDirection) return;

  transitionProgressTween?.kill?.();
  transitionProgressTween = null;
  cancelFigurePlaybackTicker();
  figurePlaybackDirection = 0;
  const switchToken = figureSwitchToken + 1;
  figureSwitchToken = switchToken;
  pendingFigureDirection = normalizedDirection;
  pauseFigureVideos(nextVideo);

  const duration = getFigureVideoDuration(nextVideo);
  const startProgress = normalizedDirection > 0 ? rawProgress : 1 - rawProgress;
  const startTime = clamp(startProgress * duration, 0, Math.max(0, duration - 0.02));

  try {
    nextVideo.pause();
    nextVideo.currentTime = startTime;
    nextVideo.playbackRate = clamp(duration / TRANSITION_DURATION_SECONDS, 0.25, 2);
  } catch {
    if (figureSwitchToken === switchToken) pendingFigureDirection = 0;
    tweenToTransitionProgress(target, { syncVideo: true });
    return;
  }

  progressState.target = target;
  waitForVideoFrame(nextVideo).then(() => {
    if (figureSwitchToken !== switchToken || getPreviewProgress() !== null) return;

    pendingFigureDirection = 0;
    pauseFigureVideos(nextVideo);
    showFigureVideo(nextVideo);
    figurePlaybackDirection = normalizedDirection;
    figurePlaybackRaf = window.requestAnimationFrame(() => tickFigurePlayback(target));

    const playPromise = nextVideo.play();
    if (playPromise?.catch) {
      playPromise.catch(() => {
        if (figurePlaybackDirection !== normalizedDirection || figureSwitchToken !== switchToken) return;
        tweenToTransitionProgress(target, { syncVideo: true });
      });
    }
  });
}

function resetFigureTransition() {
  playFigureTransition(-1);
}

function createGsapSetters(gsap) {
  gsap.set(bgLayer, {
    xPercent: -50,
    yPercent: 0,
    scale: 1,
    transformOrigin: '50% 0',
    force3D: true
  });

  gsap.set([middleLayer, middleOverlayLayer], {
    xPercent: -50,
    yPercent: -50,
    scale: 1,
    transformOrigin: '50% 50%',
    force3D: true
  });

  gsap.set([frontLayer, frontOverlayLayer], {
    xPercent: -50,
    yPercent: -100,
    scale: 1,
    transformOrigin: '50% 100%',
    force3D: true
  });

  gsap.set(figureLayers, {
    xPercent: -50,
    yPercent: -50,
    y: window.innerHeight * (currentTuning.figureYVh / 100),
    scale: currentTuning.figureScale,
    transformOrigin: '50% 50%',
    force3D: true
  });

  return {
    bgX: gsap.quickSetter(bgLayer, 'x', 'px'),
    bgY: gsap.quickSetter(bgLayer, 'y', 'px'),
    bgScale: gsap.quickSetter(bgLayer, 'scale'),
    middleX: gsap.quickSetter(middleLayer, 'x', 'px'),
    middleY: gsap.quickSetter(middleLayer, 'y', 'px'),
    middleScale: gsap.quickSetter(middleLayer, 'scale'),
    middleOverlayX: gsap.quickSetter(middleOverlayLayer, 'x', 'px'),
    middleOverlayY: gsap.quickSetter(middleOverlayLayer, 'y', 'px'),
    middleOverlayScale: gsap.quickSetter(middleOverlayLayer, 'scale'),
    frontX: gsap.quickSetter(frontLayer, 'x', 'px'),
    frontY: gsap.quickSetter(frontLayer, 'y', 'px'),
    frontScale: gsap.quickSetter(frontLayer, 'scale'),
    frontOverlayX: gsap.quickSetter(frontOverlayLayer, 'x', 'px'),
    frontOverlayY: gsap.quickSetter(frontOverlayLayer, 'y', 'px'),
    frontOverlayScale: gsap.quickSetter(frontOverlayLayer, 'scale'),
    figureX: gsap.quickSetter(figureLayers, 'x', 'px'),
    figureY: gsap.quickSetter(figureLayers, 'y', 'px'),
    figureScale: gsap.quickSetter(figureLayers, 'scale')
  };
}

function renderWithGsap(progressParts, mouseX, mouseY) {
  if (!gsapSetters) return;
  const bgEased = progressParts.bg;
  const middleEased = progressParts.middle;
  const frontEased = progressParts.front;
  const bgTravelY = window.innerHeight * (currentTuning.bgTravelVh / 100);
  const middleTravelY = window.innerHeight * (currentTuning.middleTravelVh / 100);
  const frontBaseY = window.innerHeight * (currentTuning.frontYVh / 100);
  const frontTravelY = window.innerHeight * (currentTuning.frontTravelVh / 100);
  const figureGroundingY = window.innerHeight * (currentTuning.figureYVh / 100);
  const figureTravelY = window.innerHeight * (currentTuning.figureTravelVh / 100);

  gsapSetters.bgX(mouseX * -0.0015);
  gsapSetters.bgY(-bgEased * bgTravelY);
  gsapSetters.bgScale(1 + bgEased * 0.018);

  gsapSetters.middleX(mouseX * -0.006);
  gsapSetters.middleY(mouseY * -0.002 + middleEased * middleTravelY);
  gsapSetters.middleScale(1 + middleEased * 0.012);
  gsapSetters.middleOverlayX(mouseX * -0.006);
  gsapSetters.middleOverlayY(mouseY * -0.002 + middleEased * middleTravelY);
  gsapSetters.middleOverlayScale(1 + middleEased * 0.012);

  gsapSetters.frontX(0);
  gsapSetters.frontY(frontBaseY + frontEased * frontTravelY);
  gsapSetters.frontScale(1);
  gsapSetters.frontOverlayX(0);
  gsapSetters.frontOverlayY(frontBaseY + frontEased * frontTravelY);
  gsapSetters.frontOverlayScale(1);

  gsapSetters.figureX(0);
  gsapSetters.figureY(figureGroundingY + frontEased * figureTravelY);
  gsapSetters.figureScale(currentTuning.figureScale);
}

function renderNative(progressParts, mouseX, mouseY) {
  const bgEased = progressParts.bg;
  const middleEased = progressParts.middle;
  const frontEased = progressParts.front;
  const bgTravelY = window.innerHeight * (currentTuning.bgTravelVh / 100);
  const middleTravelY = window.innerHeight * (currentTuning.middleTravelVh / 100);
  const frontBaseY = window.innerHeight * (currentTuning.frontYVh / 100);
  const frontTravelY = window.innerHeight * (currentTuning.frontTravelVh / 100);
  const figureGroundingY = window.innerHeight * (currentTuning.figureYVh / 100);
  const figureTravelY = window.innerHeight * (currentTuning.figureTravelVh / 100);
  bgLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.0015}px), ${-bgEased * bgTravelY}px, 0) scale(${1 + bgEased * 0.018})`;
  middleLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.006}px), calc(-50% + ${mouseY * -0.002 + middleEased * middleTravelY}px), 0) scale(${1 + middleEased * 0.012})`;
  middleOverlayLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.006}px), calc(-50% + ${mouseY * -0.002 + middleEased * middleTravelY}px), 0) scale(${1 + middleEased * 0.012})`;
  frontLayer.style.transform = `translate3d(-50%, calc(-100% + ${frontBaseY + frontEased * frontTravelY}px), 0) scale(1)`;
  frontOverlayLayer.style.transform = `translate3d(-50%, calc(-100% + ${frontBaseY + frontEased * frontTravelY}px), 0) scale(1)`;
  figureLayers.forEach((layer) => {
    layer.style.transform = `translate3d(-50%, calc(-50% + ${figureGroundingY + frontEased * figureTravelY}px), 0) scale(${currentTuning.figureScale})`;
  });
}

function renderScene(progress, mouseX, mouseY) {
  const progressParts = getProgressParts(progress);
  page.style.setProperty('--ttg-progress', progressParts.front.toFixed(4));
  root.style.setProperty('--ttg-progress', progressParts.front.toFixed(4));

  const changed = Math.abs(lastRenderedProgress.bg - progressParts.bg) > 0.0005
    || Math.abs(lastRenderedProgress.middle - progressParts.middle) > 0.0005
    || Math.abs(lastRenderedProgress.front - progressParts.front) > 0.0005
    || Math.abs(lastRenderedMouseX - mouseX) > 0.10
    || Math.abs(lastRenderedMouseY - mouseY) > 0.10
    || lastRenderedTuningVersion !== tuningVersion;
  if (!changed) return;

  lastRenderedProgress = progressParts;
  lastRenderedMouseX = mouseX;
  lastRenderedMouseY = mouseY;
  lastRenderedTuningVersion = tuningVersion;

  if (gsapSetters) {
    renderWithGsap(progressParts, mouseX, mouseY);
  } else {
    renderNative(progressParts, mouseX, mouseY);
  }
}

function renderCurrentScene() {
  renderScene(getLiveProgressParts(), parallaxMouse.x, parallaxMouse.y);
}

function updateNativeProgress() {
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  const range = Math.max(1, rect.height - window.innerHeight);
  tweenToTransitionProgress(stableProgress(-rect.top / range));
}

function startPointerParallax(gsap) {
  if (pointerParallaxBound) return;
  pointerParallaxBound = true;

  if (gsap) {
    const parallaxToX = gsap.quickTo(parallaxMouse, 'x', { duration: 0.85, ease: 'power3.out', onUpdate: renderCurrentScene });
    const parallaxToY = gsap.quickTo(parallaxMouse, 'y', { duration: 0.85, ease: 'power3.out', onUpdate: renderCurrentScene });

    window.addEventListener('pointermove', (event) => {
      if (reduceMotion || event.pointerType === 'touch' || !stage) return;
      const rect = stage.getBoundingClientRect();
      if (rect.top > window.innerHeight || rect.bottom < 0) return;
      parallaxToX(event.clientX - window.innerWidth / 2);
      parallaxToY(event.clientY - window.innerHeight / 2);
    }, { passive: true });

    window.addEventListener('pointerleave', () => {
      parallaxToX(0);
      parallaxToY(0);
    }, { passive: true });
    return;
  }

  window.addEventListener('pointermove', (event) => {
    if (reduceMotion || event.pointerType === 'touch' || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.top > window.innerHeight || rect.bottom < 0) return;
    nativeMouse.targetX = event.clientX - window.innerWidth / 2;
    nativeMouse.targetY = event.clientY - window.innerHeight / 2;
  }, { passive: true });

  window.addEventListener('pointerleave', () => {
    nativeMouse.targetX = 0;
    nativeMouse.targetY = 0;
  }, { passive: true });
}

function initNativeFallback() {
  startPointerParallax(null);
  window.addEventListener('scroll', updateNativeProgress, { passive: true });
  window.addEventListener('resize', updateNativeProgress, { passive: true });

  if (!nativeTickerStarted) {
    nativeTickerStarted = true;
    const tick = () => {
      updateNativeProgress();
      nativeMouse.x += (nativeMouse.targetX - nativeMouse.x) * 0.10;
      nativeMouse.y += (nativeMouse.targetY - nativeMouse.y) * 0.10;
      parallaxMouse.x = nativeMouse.x;
      parallaxMouse.y = nativeMouse.y;
      renderCurrentScene();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  updateNativeProgress();
}

function initScrollTrigger({ gsap, ScrollTrigger }) {
  ScrollTrigger.config({ ignoreMobileResize: true });

  startPointerParallax(gsap);
  gsapSetters = createGsapSetters(gsap);
  resetRenderCache();
  ({ scrollRuntime } = initTransitionScrollRuntime({
    root,
    body: document.body,
    reduceMotion,
    gsap,
    ScrollTrigger,
    smoothOptions: {
      lerp: 0.08,
      wheelMultiplier: 0.82,
      syncTouch: false
    }
  }));

  renderRawTransitionProgress(0, { syncVideo: true });

  scrollTriggers.push(createScrollProgressTrigger({
    ScrollTrigger,
    trigger: stage,
    start: 'top top',
    end: () => `+=${Math.max(1, window.innerHeight * TRANSITION_SCROLL_RANGE)}`,
    onUpdate: (self) => playFigureTransition(self.direction >= 0 ? 1 : -1),
    onLeave: () => playFigureTransition(1),
    onLeaveBack: resetFigureTransition
  }));

  window.addEventListener('resize', () => {
    resetRenderCache();
    ScrollTrigger.refresh();
  }, { passive: true });
  renderRawTransitionProgress(0, { syncVideo: true });
  ScrollTrigger.refresh();
}

currentTuning = readStoredTuning();
applyTuning({ persist: false });
initTuningPanel();

if (stage && bgLayer && middleLayer && middleOverlayLayer && frontLayer && frontOverlayLayer && figureLayer && figureVideo) {
  figureVideos.forEach((video) => prepareScrubVideo(video));
  showFigureVideo(figureVideo);

  if (reduceMotion) {
    Promise.all(figureVideos.map((video) => waitForVideoMetadata(video))).then(() => {
      figurePlayhead.raw = 1;
      renderRawTransitionProgress(1, { syncVideo: true });
      renderScene(0, 0, 0);
    });
  } else {
    Promise.all(figureVideos.map((video) => waitForVideoMetadata(video)))
      .then(() => loadTransitionLibraries())
      .then(initScrollTrigger)
      .catch((error) => {
        console.warn('Falling back to native scroll sync.', error);
        initNativeFallback();
      });
  }
}

window.addEventListener('pagehide', () => {
  cancelFigurePlaybackTicker();
  transitionProgressTween?.kill?.();
  pauseFigureVideos();
  scrollTriggers.forEach((trigger) => trigger.destroy());
  scrollTriggers = [];
  scrollRuntime?.destroy?.();
});
