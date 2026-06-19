import { initSmoothScroll } from './ui/smooth-scroll.js';
import { createInkSceneTransition } from './effects/ink-scene-transition.js';

const CDN = {
  gsap: 'js/vendor/gsap.min.js',
  scrollTrigger: 'js/vendor/ScrollTrigger.min.js',
  lenis: 'js/vendor/lenis.min.js'
};

const STORAGE_KEY = 'tongye.figure2.tune.v12';
const DEFAULT_SETTINGS = {
  scrollVh: 350,
  lenisLerp: 0.08,
  wheelMultiplier: 0.82
};

const FIGURE_INTRO_SECONDS = 1.15;
const FIGURE_VIDEO_TRANSITION_SECONDS = 2.4;
const PRE_TRANSITION_RANGE_VH = 50;
const SCENE_TRANSITION_RANGE_VH = 100;
const INTRO_TRIGGER_PX = 2;
const VIDEO_SEGMENT_SECONDS = 5;
const VIDEO_SEEK_EPSILON = 1 / 48;
const VIDEO_END_EPSILON = 0.045;

const root = document.documentElement;
const page = document.body;
const stage = document.querySelector('[data-figure2-stage]');
const figureVideos = Array.from(document.querySelectorAll('[data-figure2-video]'));
const cloudLayer = document.querySelector('.figure2-arch-layer--cloud');
const farArcadeLayers = Array.from(document.querySelectorAll('.figure2-arch-layer--far-arcade-window'));
const middleLayers = Array.from(document.querySelectorAll('.figure2-arch-layer--middle-composite'));
const nearArchLayer = document.querySelector('.figure2-arch-layer--near-arch');
const figureGroup = document.querySelector('.figure2-figures');
const figureMaskCanvas = createFigureMaskCanvas();
const figureMaskContext = figureMaskCanvas?.getContext('2d', { alpha: true });
const inkCanvas = document.querySelector('[data-figure2-ink-canvas]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const alphaVideoEnabled = shouldUseAlphaVideo();
const DEPTH_INK_SRC = 'assets/figure2-middle-depth.png';
const WHITE_SCENE_SRC = 'assets/figure2-next-white.png';

let settings = readSettings();
let scrollRuntime = null;
let progressState = { value: 0, target: 0 };
let currentProgress = 0;
let figureIntroTween = null;
let figureVideoTween = null;
let gsapSetters = null;
let nativeTickerStarted = false;
let pointerParallaxBound = false;
let introScrollGateBound = false;
let lastRenderedProgress = -1;
let lastRenderedIntroProgress = -1;
let lastRenderedMouseX = 999;
let lastRenderedMouseY = 999;
let transitionScrollAnchor = null;
let lastClampedScroll = 0;
let introTouchStartY = 0;

const parallaxMouse = { x: 0, y: 0 };
const nativeMouse = { targetX: 0, targetY: 0, x: 0, y: 0 };
const figure2IntroState = { progress: 0, active: false };
const figureVideoPlayhead = { raw: 0 };
const videoStates = figureVideos.map((videoElement) => ({
  video: videoElement,
  segmentStart: 0.001,
  segmentEnd: VIDEO_SEGMENT_SECONDS
}));
const sceneInkTransition = reduceMotion ? null : createInkSceneTransition(inkCanvas, {
  assets: {
    nextSceneSrc: WHITE_SCENE_SRC,
    backDepthSrc: DEPTH_INK_SRC,
    middleDepthSrc: DEPTH_INK_SRC
  },
  targetSrc: WHITE_SCENE_SRC,
  figureMaskElement: figureMaskCanvas,
  hideAtEnd: false,
  progressSpan: 1,
  depthThresholdMode: true,
  perlinOverlay: false,
  perlinStrength: 0,
  sceneBrightness: 1,
  inkCenterX: 0.5,
  inkCenterY: 0.52,
  colorLift: 0.34
});

document.body.classList.toggle('figure2-alpha-video', alphaVideoEnabled);
document.body.classList.toggle('figure2-multiply-video', !alphaVideoEnabled);
applyTuneSettings();

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function range01(value, start, end) {
  return clamp((value - start) / Math.max(0.0001, end - start), 0, 1);
}

function stableProgress(value) {
  if (value < 0.002) return 0;
  if (value > 0.998) return 1;
  return clamp(value, 0, 1);
}

function acceleratedProgress(rawProgress) {
  const t = stableProgress(rawProgress);
  return clamp(0.78 * t + 0.22 * t * t, 0, 1);
}

function isIntroComplete() {
  return figure2IntroState.progress >= 0.995 && figureVideoPlayhead.raw >= 0.995;
}

function resetTransitionAnchor() {
  transitionScrollAnchor = null;
}

function createFigureMaskCanvas() {
  if (!figureGroup) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'figure2-figure-mask-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.inkTextureReady = 'false';
  figureGroup.appendChild(canvas);
  return canvas;
}

function shouldUseAlphaVideo() {
  if (new URLSearchParams(window.location.search).has('mp4')) return false;
  const probe = document.createElement('video');
  const canPlayVp9 = probe.canPlayType('video/webm; codecs="vp9"');
  const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
  return Boolean(canPlayVp9) && !isSafari;
}

function getInkProgress(progress) {
  return smoothStep(stableProgress(progress));
}

function getForegroundOpacity(progress) {
  const inkProgress = getInkProgress(progress);
  return 1 - smoothStep(range01(inkProgress, 0.08, 0.62));
}

function renderInkTransition(progress, mouseX, mouseY) {
  if (!sceneInkTransition) return;
  const inkProgress = getInkProgress(progress);
  updateFigureMaskCanvas(inkProgress);
  window.__figure2InkProgress = inkProgress;
  root.style.setProperty('--figure2-ink-progress', inkProgress.toFixed(4));
  page.style.setProperty('--figure2-ink-progress', inkProgress.toFixed(4));
  sceneInkTransition.render(inkProgress, mouseX, mouseY, inkProgress, {
    perlinStrength: 0,
    sceneBrightness: 1
  });
}

function updateFigureMaskCanvas(inkProgress = 0) {
  if (!figureMaskCanvas || !figureMaskContext || !figureGroup || inkProgress <= 0.001) {
    if (figureMaskCanvas) figureMaskCanvas.dataset.inkTextureReady = 'false';
    return;
  }

  const groupRect = figureGroup.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 1.35);
  const width = Math.max(1, Math.round(groupRect.width * ratio));
  const height = Math.max(1, Math.round(groupRect.height * ratio));
  if (figureMaskCanvas.width !== width || figureMaskCanvas.height !== height) {
    figureMaskCanvas.width = width;
    figureMaskCanvas.height = height;
  }

  figureMaskContext.clearRect(0, 0, width, height);
  let drewFrame = false;

  for (const state of videoStates) {
    const { video } = state;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) continue;
    const rect = video.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    try {
      figureMaskContext.drawImage(
        video,
        (rect.left - groupRect.left) * ratio,
        (rect.top - groupRect.top) * ratio,
        rect.width * ratio,
        rect.height * ratio
      );
      drewFrame = true;
    } catch {
      // Canvas upload can miss a frame while the browser swaps video buffers.
    }
  }

  figureMaskCanvas.dataset.inkTextureReady = drewFrame ? 'true' : 'false';
}

function loadScript(src, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some((script) => script.src.endsWith(src))) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    let settled = false;
    const timer = window.setTimeout(() => finish(false, new Error(`Timed out loading ${src}`)), timeout);

    function finish(ok, value) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      ok ? resolve(value) : reject(value);
    }

    script.src = src;
    script.async = false;
    script.onload = () => finish(true);
    script.onerror = () => finish(false, new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function loadRequiredLibraries() {
  return Promise.resolve()
    .then(() => (window.gsap ? undefined : loadScript(CDN.gsap)))
    .then(() => (window.ScrollTrigger ? undefined : loadScript(CDN.scrollTrigger)))
    .then(() => (window.Lenis ? undefined : loadScript(CDN.lenis).catch((error) => {
      console.warn('Lenis unavailable, keeping native scroll.', error);
    })))
    .then(() => {
      if (!window.gsap || !window.ScrollTrigger) {
        throw new Error('GSAP ScrollTrigger unavailable.');
      }
    });
}

function readSettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...saved });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function normalizeSettings(nextSettings) {
  return {
    scrollVh: Math.round(clamp(Number(nextSettings.scrollVh) || DEFAULT_SETTINGS.scrollVh, 220, 430) / 10) * 10,
    lenisLerp: clamp(Number(nextSettings.lenisLerp) || DEFAULT_SETTINGS.lenisLerp, 0.035, 0.12),
    wheelMultiplier: clamp(Number(nextSettings.wheelMultiplier) || DEFAULT_SETTINGS.wheelMultiplier, 0.35, 1.2)
  };
}

function applyTuneSettings({ refresh = false } = {}) {
  root.style.setProperty('--figure2-scroll-vh', String(settings.scrollVh));
  page.style.setProperty('--figure2-scroll-vh', String(settings.scrollVh));

  if (scrollRuntime?.lenis) {
    scrollRuntime.lenis.options.lerp = settings.lenisLerp;
    scrollRuntime.lenis.options.wheelMultiplier = settings.wheelMultiplier;
  }

  if (refresh && window.ScrollTrigger) {
    window.ScrollTrigger.refresh();
  }
}

function prepareVideos() {
  if (!videoStates.length) return Promise.resolve([]);
  return Promise.all(videoStates.map(prepareVideoState));
}

function prepareVideoState(state) {
  const { video } = state;
  const source = alphaVideoEnabled ? video.dataset.alphaSrc : video.dataset.fallbackSrc;
  if (source && video.getAttribute('src') !== source) {
    video.setAttribute('src', source);
  }

  video.muted = true;
  video.loop = false;
  video.autoplay = false;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.pause();
  video.load();

  if (video.readyState >= 1) {
    primeVideoState(state);
    return Promise.resolve(video);
  }

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      primeVideoState(state);
      resolve(video);
    };
    video.addEventListener('loadedmetadata', done, { once: true });
    video.addEventListener('canplay', done, { once: true });
    window.setTimeout(done, 1300);
  });
}

function primeVideoState(state) {
  const { video } = state;
  if (video.dataset.figure2Primed === 'true') return;
  video.dataset.figure2Primed = 'true';
  syncSegmentBounds(state);
  seekVideo(state, state.segmentStart, true);
}

function syncSegmentBounds(state) {
  const { video } = state;
  if (!video) return;
  const duration = Number.isFinite(video.duration) && video.duration > 0
    ? video.duration
    : VIDEO_SEGMENT_SECONDS;
  state.segmentStart = 0.001;
  state.segmentEnd = Math.max(
    state.segmentStart + 0.2,
    Math.min(duration - VIDEO_END_EPSILON, state.segmentStart + Math.min(VIDEO_SEGMENT_SECONDS, duration))
  );
  if (video.readyState >= 1 && (!video.currentTime || video.currentTime < state.segmentStart || video.currentTime > state.segmentEnd)) {
    seekVideo(state, state.segmentStart, true);
  }
}

function seekVideo(state, time, force = false) {
  const { video } = state;
  if (!video || video.readyState < 1) return;
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : VIDEO_SEGMENT_SECONDS;
  const safeTime = clamp(time, 0.001, Math.max(0.001, duration - VIDEO_END_EPSILON));
  if (!force && Math.abs(video.currentTime - safeTime) < VIDEO_SEEK_EPSILON) return;

  try {
    video.currentTime = safeTime;
  } catch {
    // Metadata can settle a beat later on WebKit.
  }
}

function seekVideoProgress(state, progress) {
  syncSegmentBounds(state);
  const p = stableProgress(progress);
  const targetTime = p >= 1
    ? state.segmentEnd
    : state.segmentStart + (state.segmentEnd - state.segmentStart) * p;
  const threshold = p >= 0.998 || p <= 0.002 ? 0.004 : VIDEO_SEEK_EPSILON;
  const force = p >= 0.998 || p <= 0.002;

  if (!force && Math.abs(state.video.currentTime - targetTime) < threshold) return;
  seekVideo(state, targetTime, force);
}

function pauseVideo(state) {
  const { video } = state;
  if (video && !video.paused) video.pause();
}

function pauseVideos() {
  videoStates.forEach(pauseVideo);
}

function renderRawFigureVideoProgress(rawProgress) {
  const visualProgress = acceleratedProgress(rawProgress);
  for (const state of videoStates) {
    seekVideoProgress(state, visualProgress);
  }

  window.__figure2VideoProgress = visualProgress;
  window.__figure2VideoTime = videoStates[0] ? videoStates[0].video.currentTime : 0;
  window.__figure2VideoMode = 'figure2-intro-autoplay-playhead';
}

function tweenToFigureVideoProgress(rawProgress) {
  const target = stableProgress(rawProgress);
  const distance = Math.abs(target - figureVideoPlayhead.raw);

  figureVideoTween?.kill?.();
  figureVideoTween = null;

  if (!window.gsap || distance < 0.001) {
    figureVideoPlayhead.raw = target;
    renderRawFigureVideoProgress(figureVideoPlayhead.raw);
    return;
  }

  figureVideoTween = window.gsap.to(figureVideoPlayhead, {
    raw: target,
    duration: Math.max(0.06, distance * FIGURE_VIDEO_TRANSITION_SECONDS),
    ease: 'none',
    overwrite: true,
    onUpdate: () => renderRawFigureVideoProgress(figureVideoPlayhead.raw),
    onComplete: () => {
      figureVideoPlayhead.raw = target;
      figureVideoTween = null;
      renderRawFigureVideoProgress(figureVideoPlayhead.raw);
    }
  });
}

function resetFigureVideoTransition() {
  tweenToFigureVideoProgress(0);
}

function tweenToIntroProgress(progress, duration = FIGURE_INTRO_SECONDS) {
  const target = stableProgress(progress);
  const distance = Math.abs(target - figure2IntroState.progress);

  figureIntroTween?.kill?.();
  figureIntroTween = null;

  if (!window.gsap || distance < 0.001) {
    figure2IntroState.progress = target;
    lastRenderedIntroProgress = -1;
    return;
  }

  figureIntroTween = window.gsap.to(figure2IntroState, {
    progress: target,
    duration: Math.max(0.08, duration * distance),
    ease: 'sine.inOut',
    overwrite: true,
    onUpdate: () => {
      lastRenderedIntroProgress = -1;
    },
    onComplete: () => {
      figure2IntroState.progress = target;
      figureIntroTween = null;
      lastRenderedIntroProgress = -1;
    }
  });
}

function startIntroPlayback() {
  if (figure2IntroState.active) return;
  figure2IntroState.active = true;
  resetTransitionAnchor();
  tweenToIntroProgress(1, FIGURE_INTRO_SECONDS);
  tweenToFigureVideoProgress(1);
}

function resetIntroPlayback() {
  if (!figure2IntroState.active && figure2IntroState.progress <= 0.001 && figureVideoPlayhead.raw <= 0.001) return;
  figure2IntroState.active = false;
  resetTransitionAnchor();
  tweenToIntroProgress(0, FIGURE_INTRO_SECONDS * 0.7);
  resetFigureVideoTransition();
}

function createGsapSetters(gsap) {
  gsap.set(cloudLayer, {
    xPercent: -50,
    yPercent: -50,
    scale: 1.012,
    transformOrigin: '50% 56%',
    force3D: true
  });
  gsap.set(farArcadeLayers, {
    xPercent: -50,
    yPercent: -50,
    scale: 1.012,
    transformOrigin: '50% 56%',
    force3D: true
  });
  gsap.set(middleLayers, {
    xPercent: -50,
    yPercent: -50,
    scale: 1.012,
    transformOrigin: '50% 56%',
    force3D: true
  });
  gsap.set(nearArchLayer, {
    xPercent: -50,
    yPercent: -50,
    scale: 1.025,
    transformOrigin: '50% 56%',
    force3D: true
  });
  gsap.set(figureGroup, {
    xPercent: -50,
    y: 0,
    scale: 1,
    transformOrigin: '50% 90%',
    force3D: true
  });

  return {
    cloudX: gsap.quickSetter(cloudLayer, 'x', 'px'),
    cloudY: gsap.quickSetter(cloudLayer, 'y', 'px'),
    cloudScaleX: gsap.quickSetter(cloudLayer, 'scaleX'),
    cloudScaleY: gsap.quickSetter(cloudLayer, 'scaleY'),
    farArcadeX: gsap.quickSetter(farArcadeLayers, 'x', 'px'),
    farArcadeY: gsap.quickSetter(farArcadeLayers, 'y', 'px'),
    farArcadeScaleX: gsap.quickSetter(farArcadeLayers, 'scaleX'),
    farArcadeScaleY: gsap.quickSetter(farArcadeLayers, 'scaleY'),
    middleX: gsap.quickSetter(middleLayers, 'x', 'px'),
    middleY: gsap.quickSetter(middleLayers, 'y', 'px'),
    middleScaleX: gsap.quickSetter(middleLayers, 'scaleX'),
    middleScaleY: gsap.quickSetter(middleLayers, 'scaleY'),
    nearArchX: gsap.quickSetter(nearArchLayer, 'x', 'px'),
    nearArchY: gsap.quickSetter(nearArchLayer, 'y', 'px'),
    nearArchScaleX: gsap.quickSetter(nearArchLayer, 'scaleX'),
    nearArchScaleY: gsap.quickSetter(nearArchLayer, 'scaleY'),
    figureX: gsap.quickSetter(figureGroup, 'x', 'px'),
    figureY: gsap.quickSetter(figureGroup, 'y', 'px'),
    figureScaleX: gsap.quickSetter(figureGroup, 'scaleX'),
    figureScaleY: gsap.quickSetter(figureGroup, 'scaleY'),
    figureOpacity: gsap.quickSetter(figureGroup, 'opacity')
  };
}

function renderWithGsap(progress, mouseX, mouseY) {
  if (!gsapSetters) return;
  const p = stableProgress(progress);
  const cameraProgress = smoothStep(figure2IntroState.progress);

  gsapSetters.cloudX(mouseX * -0.010);
  gsapSetters.cloudY(mouseY * -0.006 - cameraProgress * 30);
  const cloudScale = 1.012 + cameraProgress * 0.13;
  gsapSetters.cloudScaleX(cloudScale);
  gsapSetters.cloudScaleY(cloudScale);

  gsapSetters.farArcadeX(mouseX * -0.012);
  gsapSetters.farArcadeY(mouseY * -0.007 - cameraProgress * 32);
  const farArcadeScale = 1.012 + cameraProgress * 0.13;
  gsapSetters.farArcadeScaleX(farArcadeScale);
  gsapSetters.farArcadeScaleY(farArcadeScale);

  gsapSetters.middleX(mouseX * -0.014);
  gsapSetters.middleY(mouseY * -0.008 - cameraProgress * 34);
  const middleScale = 1.012 + cameraProgress * 0.13;
  gsapSetters.middleScaleX(middleScale);
  gsapSetters.middleScaleY(middleScale);

  gsapSetters.nearArchX(mouseX * -0.002);
  gsapSetters.nearArchY(0);
  const nearArchScale = 1.025 + cameraProgress * 0.10;
  gsapSetters.nearArchScaleX(nearArchScale);
  gsapSetters.nearArchScaleY(nearArchScale);
  nearArchLayer.style.setProperty('--figure2-near-arch-blur', `${(cameraProgress * 3.6).toFixed(2)}px`);

  gsapSetters.figureX(mouseX * 0.003);
  gsapSetters.figureY(-cameraProgress * 12);
  const figureScale = 1 + cameraProgress * 0.035;
  gsapSetters.figureScaleX(figureScale);
  gsapSetters.figureScaleY(figureScale);
  gsapSetters.figureOpacity(getForegroundOpacity(p));
}

function renderNative(progress, mouseX, mouseY) {
  const p = stableProgress(progress);
  const cameraProgress = smoothStep(figure2IntroState.progress);
  cloudLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.010}px), calc(-50% + ${mouseY * -0.006 - cameraProgress * 30}px), 0) scale(${1.012 + cameraProgress * 0.13})`;
  for (const farArcadeLayer of farArcadeLayers) {
    farArcadeLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.012}px), calc(-50% + ${mouseY * -0.007 - cameraProgress * 32}px), 0) scale(${1.012 + cameraProgress * 0.13})`;
  }
  for (const middleLayer of middleLayers) {
    middleLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.014}px), calc(-50% + ${mouseY * -0.008 - cameraProgress * 34}px), 0) scale(${1.012 + cameraProgress * 0.13})`;
  }
  nearArchLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.002}px), -50%, 0) scale(${1.025 + cameraProgress * 0.10})`;
  nearArchLayer.style.setProperty('--figure2-near-arch-blur', `${(cameraProgress * 3.6).toFixed(2)}px`);
  figureGroup.style.transform = `translate3d(calc(-50% + ${mouseX * 0.003}px), ${-cameraProgress * 12}px, 0) scale(${1 + cameraProgress * 0.035})`;
  figureGroup.style.opacity = getForegroundOpacity(p).toFixed(4);
}

function renderScene(progress, mouseX, mouseY) {
  const p = stableProgress(progress);
  const introProgress = stableProgress(figure2IntroState.progress);
  const inkActive = getInkProgress(p) > 0.002;
  window.__figure2Progress = p;
  window.__figure2IntroProgress = introProgress;
  root.style.setProperty('--figure2-progress', p.toFixed(4));
  root.style.setProperty('--figure2-scene-progress', introProgress.toFixed(4));
  page.style.setProperty('--figure2-progress', p.toFixed(4));
  page.style.setProperty('--figure2-scene-progress', introProgress.toFixed(4));

  const changed = Math.abs(lastRenderedProgress - p) > 0.0005
    || Math.abs(lastRenderedIntroProgress - introProgress) > 0.0005
    || Math.abs(lastRenderedMouseX - mouseX) > 0.10
    || Math.abs(lastRenderedMouseY - mouseY) > 0.10
    || inkActive;
  if (!changed) return;

  lastRenderedProgress = p;
  lastRenderedIntroProgress = introProgress;
  lastRenderedMouseX = mouseX;
  lastRenderedMouseY = mouseY;

  if (gsapSetters) {
    renderWithGsap(p, mouseX, mouseY);
  } else {
    renderNative(p, mouseX, mouseY);
  }
  renderInkTransition(p, mouseX, mouseY);
}

function tickFigure2() {
  if (figure2IntroState.active && transitionScrollAnchor === null) {
    applyScrollPosition(lastClampedScroll);
  }

  const targetProgress = stableProgress(progressState.target);
  const diff = targetProgress - progressState.value;
  progressState.value += diff * 0.22;

  currentProgress = stableProgress(progressState.value);
  renderScene(currentProgress, parallaxMouse.x, parallaxMouse.y);
}

function getStageScrollMetrics() {
  if (!stage) {
    return {
      totalRange: 1,
      transitionRange: 1
    };
  }

  const viewportHeight = Math.max(1, window.innerHeight);
  const totalRange = Math.max(1, stage.offsetHeight - viewportHeight);
  const transitionRange = Math.min(
    Math.max(1, totalRange),
    viewportHeight * (SCENE_TRANSITION_RANGE_VH / 100)
  );

  return { totalRange, transitionRange };
}

function applyScrollPosition(rawScroll) {
  const { totalRange, transitionRange } = getStageScrollMetrics();
  const clampedScroll = clamp(rawScroll, 0, totalRange);
  lastClampedScroll = clampedScroll;
  if (clampedScroll > INTRO_TRIGGER_PX) {
    startIntroPlayback();
  } else {
    resetIntroPlayback();
  }

  let transitionProgress = 0;
  if (clampedScroll > INTRO_TRIGGER_PX && isIntroComplete()) {
    if (transitionScrollAnchor === null) {
      transitionScrollAnchor = clampedScroll;
    }
    transitionProgress = stableProgress((clampedScroll - transitionScrollAnchor) / transitionRange);
  }

  progressState.target = transitionProgress;
  if (transitionProgress >= 1 || transitionProgress <= 0) {
    progressState.value = transitionProgress;
    currentProgress = transitionProgress;
    lastRenderedProgress = -1;
  }
  window.__figure2ScrollPx = clampedScroll;
  window.__figure2TransitionStartPx = transitionScrollAnchor ?? clampedScroll;
  window.__figure2TransitionRangePx = transitionRange;
  window.__figure2TransitionArmed = transitionScrollAnchor !== null;
}

function updateNativeProgress() {
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  applyScrollPosition(-rect.top);
}

function shouldGateIntroScroll() {
  if (reduceMotion || !stage || !figure2IntroState.active || isIntroComplete()) return false;
  const rect = stage.getBoundingClientRect();
  return rect.top <= 1 && rect.bottom >= window.innerHeight * 0.25;
}

function normalizeWheelDelta(event) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight;
  return event.deltaY;
}

function bindIntroScrollGate() {
  if (introScrollGateBound) return;
  introScrollGateBound = true;

  window.addEventListener('wheel', (event) => {
    if (!shouldGateIntroScroll() || normalizeWheelDelta(event) <= 0) return;
    event.preventDefault();
  }, { passive: false, capture: true });

  window.addEventListener('touchstart', (event) => {
    introTouchStartY = event.touches?.[0]?.clientY || 0;
  }, { passive: true });

  window.addEventListener('touchmove', (event) => {
    const currentY = event.touches?.[0]?.clientY || 0;
    const scrollingDown = currentY < introTouchStartY;
    if (!shouldGateIntroScroll() || !scrollingDown) return;
    event.preventDefault();
  }, { passive: false, capture: true });
}

function startPointerParallax(gsap) {
  if (pointerParallaxBound) return;
  pointerParallaxBound = true;

  if (gsap) {
    const parallaxToX = gsap.quickTo(parallaxMouse, 'x', { duration: 0.85, ease: 'power3.out' });
    const parallaxToY = gsap.quickTo(parallaxMouse, 'y', { duration: 0.85, ease: 'power3.out' });

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
  window.addEventListener('scroll', () => {
    updateNativeProgress();
  }, { passive: true });
  window.addEventListener('resize', () => {
    updateNativeProgress();
  }, { passive: true });

  if (!nativeTickerStarted) {
    nativeTickerStarted = true;
    let lastTime = performance.now();
    const tick = (time) => {
      lastTime = time;
      updateNativeProgress();
      nativeMouse.x += (nativeMouse.targetX - nativeMouse.x) * 0.10;
      nativeMouse.y += (nativeMouse.targetY - nativeMouse.y) * 0.10;
      parallaxMouse.x = nativeMouse.x;
      parallaxMouse.y = nativeMouse.y;
      tickFigure2();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  updateNativeProgress();
}

function initScrollTrigger() {
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  gsap.ticker.lagSmoothing(0);
  ScrollTrigger.config({ ignoreMobileResize: true });

  startPointerParallax(gsap);
  gsapSetters = createGsapSetters(gsap);

  scrollRuntime = initSmoothScroll({
    root,
    body: document.body,
    reduceMotion
  });

  ScrollTrigger.create({
    trigger: stage,
    start: 'top top',
    end: 'bottom bottom',
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      const rawScroll = (self.end - self.start) * self.progress;
      applyScrollPosition(rawScroll);
    },
    onRefresh: (self) => {
      const rawScroll = (self.end - self.start) * self.progress;
      applyScrollPosition(rawScroll);
    }
  });

  renderRawFigureVideoProgress(0);
  applyScrollPosition(0);

  window.addEventListener('resize', () => {
    lastRenderedProgress = -1;
    lastRenderedIntroProgress = -1;
    ScrollTrigger.refresh();
  }, { passive: true });
  gsap.ticker.add(tickFigure2);
  tickFigure2();
  ScrollTrigger.refresh();
}

if (stage && figureVideos.length && cloudLayer && farArcadeLayers.length && middleLayers.length && nearArchLayer && figureGroup) {
  sceneInkTransition?.prewarm();
  const videoReady = prepareVideos();
  const librariesReady = reduceMotion ? Promise.resolve() : loadRequiredLibraries();

  videoReady.then(() => {
    if (reduceMotion) {
      progressState.value = 0.5;
      progressState.target = 0.5;
      currentProgress = 0.5;
      figure2IntroState.progress = 1;
      figure2IntroState.active = true;
      figureVideoPlayhead.raw = 1;
      renderRawFigureVideoProgress(1);
      renderScene(0.5, 0, 0);
      pauseVideos();
    }
  });

  if (!reduceMotion) {
    Promise.all([videoReady, librariesReady])
      .then(() => {
        initScrollTrigger();
      })
      .catch((error) => {
        console.warn('Falling back to native scroll sync.', error);
        initNativeFallback();
      });
  }
}
