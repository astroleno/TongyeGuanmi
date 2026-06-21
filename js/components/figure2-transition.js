import { loadTransitionLibraries } from '../transitions/load-libraries.js';
import { createReduceMotionState } from '../transitions/scroll-scene.js';
import { createInkSceneTransition } from '../effects/ink-scene-transition.js';

const DEFAULT_CONFIG = {
  scrollVh: 350,
  durationSeconds: 2.4,
  sceneTransitionSeconds: 1.28,
  sceneTransitionRangeVh: 100,
  videoSegmentSeconds: 5,
  lenisLerp: 0.08,
  wheelMultiplier: 0.82
};

const INTRO_TRIGGER_PX = 2;
const INTRO_HOLD_SCROLL_PX = INTRO_TRIGGER_PX + 1;
const VIDEO_SEEK_EPSILON = 1 / 48;
const VIDEO_END_EPSILON = 0.045;
const DEPTH_INK_SRC = 'assets/figure2-middle-depth.png';
const WHITE_SCENE_SRC = 'assets/figure2-next-white.png';

const ARCH_LAYER_CAMERA = {
  cloud: {
    baseScale: 1,
    scaleTravel: 0.10,
    baseY: 0,
    yTravel: -3,
    mouseX: -0.010,
    mouseY: -0.006
  },
  farArcade: {
    baseScale: 1,
    scaleTravel: 0.22,
    baseY: 10,
    yTravel: -8,
    mouseX: -0.012,
    mouseY: -0.007
  },
  middle: {
    baseScale: 1.012,
    scaleTravel: 0.13,
    baseY: 0,
    yTravel: 34,
    mouseX: -0.014,
    mouseY: -0.008
  }
};

const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);
const smoothStep = (value) => value * value * (3 - 2 * value);
const range01 = (value, start, end) => clamp((value - start) / Math.max(0.0001, end - start));

function stableProgress(value) {
  if (value < 0.002) return 0;
  if (value > 0.998) return 1;
  return clamp(value);
}

function acceleratedProgress(rawProgress) {
  const t = stableProgress(rawProgress);
  return clamp(0.78 * t + 0.22 * t * t);
}

function readNumberAttribute(element, name, fallback) {
  const value = Number(element?.dataset?.[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function readFigure2TransitionConfig(section, overrides = {}) {
  return {
    scrollVh: overrides.scrollVh ?? readNumberAttribute(section, 'figure2ScrollVh', DEFAULT_CONFIG.scrollVh),
    durationSeconds: overrides.durationSeconds
      ?? readNumberAttribute(section, 'figure2Duration', DEFAULT_CONFIG.durationSeconds),
    sceneTransitionSeconds: overrides.sceneTransitionSeconds
      ?? readNumberAttribute(section, 'figure2SceneDuration', DEFAULT_CONFIG.sceneTransitionSeconds),
    sceneTransitionRangeVh: overrides.sceneTransitionRangeVh
      ?? readNumberAttribute(section, 'figure2SceneRangeVh', DEFAULT_CONFIG.sceneTransitionRangeVh),
    videoSegmentSeconds: overrides.videoSegmentSeconds
      ?? readNumberAttribute(section, 'figure2VideoSegment', DEFAULT_CONFIG.videoSegmentSeconds),
    lenisLerp: overrides.lenisLerp ?? DEFAULT_CONFIG.lenisLerp,
    wheelMultiplier: overrides.wheelMultiplier ?? DEFAULT_CONFIG.wheelMultiplier
  };
}

export function getFigure2TransitionElements(section) {
  return {
    figureVideos: [...(section?.querySelectorAll('[data-figure2-video]') || [])],
    middleCamera: section?.querySelector('.figure2-middle-camera') || null,
    middleWindowMask: section?.querySelector('.figure2-middle-window-mask') || null,
    cloudLayer: section?.querySelector('.figure2-arch-layer--cloud') || null,
    farArcadeLayers: [...(section?.querySelectorAll('.figure2-arch-layer--far-arcade-window') || [])],
    middleLayers: [...(section?.querySelectorAll('.figure2-arch-layer--middle-composite') || [])],
    nearArchLayer: section?.querySelector('.figure2-arch-layer--near-arch') || null,
    figureGroup: section?.querySelector('.figure2-figures') || null,
    inkCanvas: section?.querySelector('[data-figure2-ink-canvas]') || null
  };
}

function shouldUseAlphaVideo() {
  if (new URLSearchParams(window.location.search).has('mp4')) return false;
  const probe = document.createElement('video');
  const canPlayVp9 = probe.canPlayType('video/webm; codecs="vp9"');
  const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
  return Boolean(canPlayVp9) && !isSafari;
}

function createFigureMaskCanvas(figureGroup) {
  if (!figureGroup) return null;
  const existing = figureGroup.querySelector('.figure2-figure-mask-canvas');
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.className = 'figure2-figure-mask-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.inkTextureReady = 'false';
  figureGroup.appendChild(canvas);
  return canvas;
}

function getStageDocumentTop(stage) {
  if (!stage) return window.scrollY;
  return window.scrollY + stage.getBoundingClientRect().top;
}

export function createFigure2TransitionController(section, options = {}) {
  if (!section) return null;

  const root = options.root || document.documentElement;
  const body = options.body || document.body;
  const config = readFigure2TransitionConfig(section, options);
  const elements = getFigure2TransitionElements(section);
  const {
    figureVideos,
    middleCamera,
    cloudLayer,
    farArcadeLayers,
    middleLayers,
    nearArchLayer,
    figureGroup,
    inkCanvas
  } = elements;

  if (
    !figureVideos.length
    || !middleCamera
    || !cloudLayer
    || !farArcadeLayers.length
    || !middleLayers.length
    || !nearArchLayer
    || !figureGroup
  ) {
    return null;
  }

  const reduceMotion = options.reduceMotion ?? createReduceMotionState();
  const alphaVideoEnabled = options.alphaVideoEnabled ?? shouldUseAlphaVideo();
  const figureMaskCanvas = createFigureMaskCanvas(figureGroup);
  const figureMaskContext = figureMaskCanvas?.getContext('2d', { alpha: true }) || null;
  const videoStates = figureVideos.map((video) => ({
    video,
    segmentStart: 0.001,
    segmentEnd: config.videoSegmentSeconds
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

  let destroyed = false;
  let scrollRuntime = options.scrollRuntime || null;
  let scrollTrigger = null;
  let figureIntroTween = null;
  let figureVideoTween = null;
  let transitionPlaybackTween = null;
  let figureVideoNativeMode = false;
  let figureVideoFallbackStarted = false;
  let gsapSetters = null;
  let nativeTickerStarted = false;
  let introScrollLocked = false;
  let transitionScrollAnchor = null;
  let lastClampedScroll = 0;
  let lastRenderedProgress = -1;
  let lastRenderedIntroProgress = -1;
  let lastRenderedMouseX = 999;
  let lastRenderedMouseY = 999;
  let transitionArmedAfterIntro = false;
  let transitionPlaybackActive = false;
  let transitionPlaybackComplete = false;
  let transitionPlaybackDirection = 0;
  let introReverseActive = false;
  let videosReadyPromise = null;
  let introTouchStartY = 0;

  const cleanup = [];
  const parallaxMouse = { x: 0, y: 0 };
  const nativeMouse = { targetX: 0, targetY: 0, x: 0, y: 0 };
  const figure2IntroState = { progress: 0, active: false };
  const figureVideoPlayhead = { raw: 0 };
  const progressState = { value: 0, target: 0 };

  function addCleanup(cleanupFn) {
    if (typeof cleanupFn !== 'function') return;
    cleanup.push(cleanupFn);
  }

  function addWindowListener(type, listener, listenerOptions) {
    window.addEventListener(type, listener, listenerOptions);
    addCleanup(() => window.removeEventListener(type, listener, listenerOptions));
  }

  function setScrollRuntime(nextRuntime) {
    scrollRuntime = nextRuntime || null;
  }

  function applyConfig() {
    root.style.setProperty('--figure2-scroll-vh', String(config.scrollVh));
    body.style.setProperty('--figure2-scroll-vh', String(config.scrollVh));
    body.classList.toggle('figure2-alpha-video', alphaVideoEnabled);
    body.classList.toggle('figure2-multiply-video', !alphaVideoEnabled);
  }

  function syncSegmentBounds(state) {
    const { video } = state;
    if (!video) return;
    const duration = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : config.videoSegmentSeconds;
    state.segmentStart = 0.001;
    state.segmentEnd = Math.max(
      state.segmentStart + 0.2,
      Math.min(duration - VIDEO_END_EPSILON, state.segmentStart + Math.min(config.videoSegmentSeconds, duration))
    );
  }

  function seekVideo(state, time, force = false) {
    const { video } = state;
    if (!video || video.readyState < 1) return;
    const duration = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : config.videoSegmentSeconds;
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
    if (state.video && !state.video.paused) state.video.pause();
  }

  function pauseVideos() {
    videoStates.forEach(pauseVideo);
  }

  function primeVideoState(state) {
    const { video } = state;
    if (video.dataset.figure2Primed === 'true') return;
    video.dataset.figure2Primed = 'true';
    syncSegmentBounds(state);
    seekVideo(state, state.segmentStart, true);
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
      video.addEventListener('error', done, { once: true });
      window.setTimeout(done, 1300);
    });
  }

  function prepareVideos() {
    if (!videosReadyPromise) {
      videosReadyPromise = Promise.all(videoStates.map(prepareVideoState));
    }
    return videosReadyPromise;
  }

  function renderRawFigureVideoProgress(rawProgress) {
    const visualProgress = acceleratedProgress(rawProgress);
    window.__figure2VideoProgress = visualProgress;
    window.__figure2VideoTime = videoStates[0] ? videoStates[0].video.currentTime : 0;
    for (const state of videoStates) {
      seekVideoProgress(state, visualProgress);
    }
  }

  function getFigureVideoPlaybackRate(state) {
    syncSegmentBounds(state);
    const segmentDuration = state.segmentEnd - state.segmentStart;
    if (segmentDuration <= config.durationSeconds + 0.12) return 1;
    return clamp(segmentDuration / config.durationSeconds, 0.5, 3.5);
  }

  function finishNativeFigurePlayback() {
    if (!figureVideoNativeMode) return;
    figureVideoNativeMode = false;
    for (const state of videoStates) {
      pauseVideo(state);
      seekVideo(state, state.segmentEnd, true);
    }
  }

  function fallbackToSeekFigurePlayback() {
    if (figureVideoFallbackStarted || !figureVideoNativeMode) return;
    figureVideoFallbackStarted = true;
    figureVideoNativeMode = false;
    pauseVideos();
    tweenToFigureVideoProgress(1, { seek: true });
  }

  function playFigureVideosForward() {
    figureVideoNativeMode = true;
    figureVideoFallbackStarted = false;

    for (const state of videoStates) {
      const { video } = state;
      if (!video) continue;
      syncSegmentBounds(state);
      pauseVideo(state);
      video.loop = false;
      video.playbackRate = getFigureVideoPlaybackRate(state);
      seekVideo(state, state.segmentStart, true);
      const playPromise = video.play?.();
      if (playPromise?.catch) {
        playPromise.catch(() => {
          if (figure2IntroState.active && !isIntroComplete()) {
            fallbackToSeekFigurePlayback();
          }
        });
      }
    }
  }

  function tweenToFigureVideoProgress(rawProgress, {
    seek = true,
    duration = config.durationSeconds,
    onComplete
  } = {}) {
    const gsap = window.gsap;
    const target = stableProgress(rawProgress);
    const distance = Math.abs(target - figureVideoPlayhead.raw);

    figureVideoTween?.kill?.();
    figureVideoTween = null;

    if (!gsap || distance < 0.001) {
      figureVideoPlayhead.raw = target;
      if (seek) renderRawFigureVideoProgress(figureVideoPlayhead.raw);
      onComplete?.();
      return;
    }

    figureVideoTween = gsap.to(figureVideoPlayhead, {
      raw: target,
      duration: Math.max(0.06, distance * duration),
      ease: 'none',
      overwrite: true,
      onUpdate: () => {
        if (seek) renderRawFigureVideoProgress(figureVideoPlayhead.raw);
      },
      onComplete: () => {
        figureVideoPlayhead.raw = target;
        figureVideoTween = null;
        if (seek) renderRawFigureVideoProgress(figureVideoPlayhead.raw);
        onComplete?.();
      }
    });
  }

  function isIntroComplete() {
    return figure2IntroState.progress >= 0.995 && figureVideoPlayhead.raw >= 0.995;
  }

  function resetTransitionAnchor() {
    transitionScrollAnchor = null;
    transitionArmedAfterIntro = false;
    transitionPlaybackComplete = false;
    transitionPlaybackDirection = 0;
  }

  function lockIntroScroll() {
    if (introScrollLocked) return;
    introScrollLocked = true;
    scrollRuntime?.lenis?.stop?.();
  }

  function releaseIntroScroll() {
    if (!introScrollLocked) return;
    introScrollLocked = false;
    scrollRuntime?.lenis?.start?.();
  }

  function getStageScrollMetrics() {
    const viewportHeight = Math.max(1, window.innerHeight);
    const totalRange = Math.max(1, section.offsetHeight - viewportHeight);
    const transitionRange = Math.min(
      Math.max(1, totalRange),
      viewportHeight * (config.sceneTransitionRangeVh / 100)
    );
    return { totalRange, transitionRange };
  }

  function scrollStageToOffset(offset, {
    immediate = true,
    duration = config.sceneTransitionSeconds
  } = {}) {
    const { totalRange } = getStageScrollMetrics();
    const nextOffset = clamp(offset, 0, totalRange);
    const nextScrollY = getStageDocumentTop(section) + nextOffset;
    if (scrollRuntime?.lenis?.scrollTo) {
      scrollRuntime.lenis.scrollTo(nextScrollY, {
        immediate,
        duration,
        force: true,
        lock: !immediate,
        easing: (t) => 1 - Math.pow(1 - t, 3)
      });
    } else {
      window.scrollTo({
        top: nextScrollY,
        left: window.scrollX,
        behavior: immediate ? 'auto' : 'smooth'
      });
    }
    if (immediate) {
      lastClampedScroll = nextOffset;
    }
  }

  function holdIntroScrollPosition() {
    if (!figure2IntroState.active || isIntroComplete()) return;
    if (Math.abs(lastClampedScroll - INTRO_HOLD_SCROLL_PX) < 0.75) return;
    scrollStageToOffset(INTRO_HOLD_SCROLL_PX, { immediate: true });
  }

  function forceTransitionIdle() {
    transitionPlaybackTween?.kill?.();
    transitionPlaybackTween = null;
    transitionPlaybackActive = false;
    transitionPlaybackDirection = 0;
    transitionPlaybackComplete = false;
    progressState.target = 0;
    progressState.value = 0;
    lastRenderedProgress = -1;
  }

  function tweenToTransitionProgress(progress, direction, { onComplete } = {}) {
    const gsap = window.gsap;
    const target = stableProgress(progress);
    const distance = Math.abs(target - progressState.value);

    transitionPlaybackTween?.kill?.();
    transitionPlaybackTween = null;
    progressState.target = target;
    transitionPlaybackDirection = direction;

    if (!gsap || distance < 0.001) {
      progressState.value = target;
      transitionPlaybackActive = false;
      transitionPlaybackDirection = 0;
      transitionPlaybackComplete = target >= 0.998;
      lastRenderedProgress = -1;
      onComplete?.();
      return;
    }

    transitionPlaybackTween = gsap.to(progressState, {
      value: target,
      duration: Math.max(0.12, distance * config.sceneTransitionSeconds),
      ease: 'sine.inOut',
      overwrite: true,
      onComplete: () => {
        progressState.value = target;
        transitionPlaybackTween = null;
        transitionPlaybackActive = false;
        transitionPlaybackDirection = 0;
        transitionPlaybackComplete = target >= 0.998;
        lastRenderedProgress = -1;
        onComplete?.();
      }
    });
  }

  function startTransitionPlayback(direction = 1) {
    if (!isIntroComplete()) return;
    const targetProgress = direction > 0 ? 1 : 0;
    if (transitionPlaybackActive && transitionPlaybackDirection === direction) return;
    if (direction > 0 && transitionPlaybackComplete) return;
    if (direction < 0 && !transitionPlaybackComplete && progressState.value <= 0.002) return;

    transitionPlaybackActive = true;
    transitionPlaybackDirection = direction;
    transitionPlaybackComplete = false;
    transitionArmedAfterIntro = true;
    releaseIntroScroll();
    tweenToTransitionProgress(targetProgress, direction, {
      onComplete: direction < 0 ? () => startIntroReversePlayback({ scrollToTop: true }) : undefined
    });

    const { totalRange } = getStageScrollMetrics();
    const targetOffset = direction > 0 ? totalRange : (transitionScrollAnchor ?? INTRO_HOLD_SCROLL_PX);
    scrollStageToOffset(targetOffset, {
      immediate: false,
      duration: config.sceneTransitionSeconds
    });
  }

  function tweenToIntroProgress(progress, duration = config.durationSeconds, { onComplete } = {}) {
    const gsap = window.gsap;
    const target = stableProgress(progress);
    const distance = Math.abs(target - figure2IntroState.progress);

    figureIntroTween?.kill?.();
    figureIntroTween = null;

    if (!gsap || distance < 0.001) {
      figure2IntroState.progress = target;
      lastRenderedIntroProgress = -1;
      onComplete?.();
      return;
    }

    figureIntroTween = gsap.to(figure2IntroState, {
      progress: target,
      duration: Math.max(0.08, duration * distance),
      ease: 'none',
      overwrite: true,
      onUpdate: () => {
        lastRenderedIntroProgress = -1;
      },
      onComplete: () => {
        figure2IntroState.progress = target;
        figureIntroTween = null;
        lastRenderedIntroProgress = -1;
        onComplete?.();
      }
    });
  }

  function startIntroPlayback() {
    if (figure2IntroState.active || introReverseActive) return;
    figure2IntroState.active = true;
    resetTransitionAnchor();
    lockIntroScroll();
    scrollStageToOffset(INTRO_HOLD_SCROLL_PX, { immediate: true });
    playFigureVideosForward();
    tweenToIntroProgress(1, config.durationSeconds);
    tweenToFigureVideoProgress(1, {
      seek: false,
      onComplete: finishNativeFigurePlayback
    });
  }

  function finishIntroReversePlayback() {
    introReverseActive = false;
    figure2IntroState.active = false;
    figure2IntroState.progress = 0;
    figureVideoPlayhead.raw = 0;
    resetTransitionAnchor();
    releaseIntroScroll();
    forceTransitionIdle();
    scrollStageToOffset(0, { immediate: true });
    lastRenderedProgress = -1;
    lastRenderedIntroProgress = -1;
  }

  function startIntroReversePlayback({ scrollToTop = false } = {}) {
    if (introReverseActive) return;
    if (figure2IntroState.progress <= 0.001 && figureVideoPlayhead.raw <= 0.001) {
      finishIntroReversePlayback();
      if (scrollToTop) {
        scrollStageToOffset(0, { immediate: false, duration: 0.24 });
      }
      return;
    }

    introReverseActive = true;
    figure2IntroState.active = false;
    figureVideoNativeMode = false;
    figureVideoFallbackStarted = false;
    pauseVideos();
    releaseIntroScroll();
    forceTransitionIdle();

    let pendingTweens = 2;
    const finishWhenReady = () => {
      pendingTweens -= 1;
      if (pendingTweens <= 0) finishIntroReversePlayback();
    };

    tweenToIntroProgress(0, config.durationSeconds, { onComplete: finishWhenReady });
    tweenToFigureVideoProgress(0, {
      seek: true,
      duration: config.durationSeconds,
      onComplete: finishWhenReady
    });

    if (scrollToTop) {
      scrollStageToOffset(0, {
        immediate: false,
        duration: config.durationSeconds
      });
    }
  }

  function resetIntroPlayback() {
    if (!figure2IntroState.active && figure2IntroState.progress <= 0.001 && figureVideoPlayhead.raw <= 0.001) return;
    if (introReverseActive) return;
    startIntroReversePlayback({ scrollToTop: false });
  }

  function createGsapSetters(gsap) {
    gsap.set(middleCamera, {
      xPercent: -50,
      yPercent: -50,
      y: ARCH_LAYER_CAMERA.middle.baseY,
      scale: ARCH_LAYER_CAMERA.middle.baseScale,
      transformOrigin: '50% 56%',
      force3D: true
    });
    gsap.set(cloudLayer, {
      xPercent: -50,
      yPercent: -50,
      y: ARCH_LAYER_CAMERA.cloud.baseY,
      scale: ARCH_LAYER_CAMERA.cloud.baseScale,
      transformOrigin: '50% 56%',
      force3D: true
    });
    gsap.set(farArcadeLayers, {
      xPercent: -50,
      yPercent: -50,
      y: ARCH_LAYER_CAMERA.farArcade.baseY,
      scale: ARCH_LAYER_CAMERA.farArcade.baseScale,
      transformOrigin: '50% 56%',
      force3D: true
    });
    gsap.set(middleLayers, {
      xPercent: -50,
      yPercent: -50,
      y: 0,
      scale: 1,
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
      middleCameraX: gsap.quickSetter(middleCamera, 'x', 'px'),
      middleCameraY: gsap.quickSetter(middleCamera, 'y', 'px'),
      middleCameraScaleX: gsap.quickSetter(middleCamera, 'scaleX'),
      middleCameraScaleY: gsap.quickSetter(middleCamera, 'scaleY'),
      cloudX: gsap.quickSetter(cloudLayer, 'x', 'px'),
      cloudY: gsap.quickSetter(cloudLayer, 'y', 'px'),
      cloudScaleX: gsap.quickSetter(cloudLayer, 'scaleX'),
      cloudScaleY: gsap.quickSetter(cloudLayer, 'scaleY'),
      farArcadeX: gsap.quickSetter(farArcadeLayers, 'x', 'px'),
      farArcadeY: gsap.quickSetter(farArcadeLayers, 'y', 'px'),
      farArcadeScaleX: gsap.quickSetter(farArcadeLayers, 'scaleX'),
      farArcadeScaleY: gsap.quickSetter(farArcadeLayers, 'scaleY'),
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

  function getInkProgress(progress) {
    return smoothStep(stableProgress(progress));
  }

  function getForegroundOpacity(progress) {
    const inkProgress = getInkProgress(progress);
    return 1 - smoothStep(range01(inkProgress, 0.08, 0.62));
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

  function renderInkTransition(progress, mouseX, mouseY) {
    if (!sceneInkTransition) return;
    const inkProgress = getInkProgress(progress);
    updateFigureMaskCanvas(inkProgress);
    root.style.setProperty('--figure2-ink-progress', inkProgress.toFixed(4));
    body.style.setProperty('--figure2-ink-progress', inkProgress.toFixed(4));
    sceneInkTransition.render(inkProgress, mouseX, mouseY, inkProgress, {
      perlinStrength: 0,
      sceneBrightness: 1
    });
  }

  function renderWithGsap(progress, mouseX, mouseY) {
    if (!gsapSetters) return;
    const p = stableProgress(progress);
    const cameraProgress = smoothStep(figure2IntroState.progress);
    const { cloud, farArcade, middle } = ARCH_LAYER_CAMERA;

    gsapSetters.cloudX(mouseX * cloud.mouseX);
    gsapSetters.cloudY(cloud.baseY + mouseY * cloud.mouseY - cameraProgress * cloud.yTravel);
    const cloudScale = cloud.baseScale + cameraProgress * cloud.scaleTravel;
    gsapSetters.cloudScaleX(cloudScale);
    gsapSetters.cloudScaleY(cloudScale);

    gsapSetters.farArcadeX(mouseX * farArcade.mouseX);
    gsapSetters.farArcadeY(farArcade.baseY + mouseY * farArcade.mouseY - cameraProgress * farArcade.yTravel);
    const farArcadeScale = farArcade.baseScale + cameraProgress * farArcade.scaleTravel;
    gsapSetters.farArcadeScaleX(farArcadeScale);
    gsapSetters.farArcadeScaleY(farArcadeScale);

    const middleScale = middle.baseScale + cameraProgress * middle.scaleTravel;
    gsapSetters.middleCameraX(mouseX * middle.mouseX);
    gsapSetters.middleCameraY(middle.baseY + mouseY * middle.mouseY - cameraProgress * middle.yTravel);
    gsapSetters.middleCameraScaleX(middleScale);
    gsapSetters.middleCameraScaleY(middleScale);

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
    const { cloud, farArcade, middle } = ARCH_LAYER_CAMERA;
    middleCamera.style.transform = `translate3d(calc(-50% + ${mouseX * middle.mouseX}px), calc(-50% + ${middle.baseY + mouseY * middle.mouseY - cameraProgress * middle.yTravel}px), 0) scale(${middle.baseScale + cameraProgress * middle.scaleTravel})`;
    cloudLayer.style.transform = `translate3d(calc(-50% + ${mouseX * cloud.mouseX}px), calc(-50% + ${cloud.baseY + mouseY * cloud.mouseY - cameraProgress * cloud.yTravel}px), 0) scale(${cloud.baseScale + cameraProgress * cloud.scaleTravel})`;
    for (const farArcadeLayer of farArcadeLayers) {
      farArcadeLayer.style.transform = `translate3d(calc(-50% + ${mouseX * farArcade.mouseX}px), calc(-50% + ${farArcade.baseY + mouseY * farArcade.mouseY - cameraProgress * farArcade.yTravel}px), 0) scale(${farArcade.baseScale + cameraProgress * farArcade.scaleTravel})`;
    }
    nearArchLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.002}px), -50%, 0) scale(${1.025 + cameraProgress * 0.10})`;
    nearArchLayer.style.setProperty('--figure2-near-arch-blur', `${(cameraProgress * 3.6).toFixed(2)}px`);
    figureGroup.style.transform = `translate3d(calc(-50% + ${mouseX * 0.003}px), ${-cameraProgress * 12}px, 0) scale(${1 + cameraProgress * 0.035})`;
    figureGroup.style.opacity = getForegroundOpacity(p).toFixed(4);
  }

  function renderScene(progress, mouseX = parallaxMouse.x, mouseY = parallaxMouse.y) {
    const p = stableProgress(progress);
    const introProgress = stableProgress(figure2IntroState.progress);
    const inkActive = getInkProgress(p) > 0.002;

    root.style.setProperty('--figure2-progress', p.toFixed(4));
    root.style.setProperty('--figure2-scene-progress', introProgress.toFixed(4));
    body.style.setProperty('--figure2-progress', p.toFixed(4));
    body.style.setProperty('--figure2-scene-progress', introProgress.toFixed(4));

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
    if (destroyed) return;

    if (figure2IntroState.active && !introReverseActive) {
      if (!isIntroComplete()) {
        holdIntroScrollPosition();
        forceTransitionIdle();
      } else {
        releaseIntroScroll();
        if (!transitionArmedAfterIntro) {
          transitionScrollAnchor = lastClampedScroll;
          transitionArmedAfterIntro = true;
          forceTransitionIdle();
        }
      }
    }

    if (!transitionPlaybackTween) {
      const targetProgress = stableProgress(progressState.target);
      const diff = targetProgress - progressState.value;
      progressState.value += diff * 0.22;
    }

    renderScene(stableProgress(progressState.value), parallaxMouse.x, parallaxMouse.y);
  }

  function applyScrollPosition(rawScroll) {
    const { totalRange, transitionRange } = getStageScrollMetrics();
    const clampedScroll = clamp(rawScroll, 0, totalRange);
    const previousClampedScroll = lastClampedScroll;
    const scrollDirection = clampedScroll > previousClampedScroll + 0.5
      ? 1
      : clampedScroll < previousClampedScroll - 0.5
        ? -1
        : 0;
    lastClampedScroll = clampedScroll;

    window.__figure2ScrollPx = clampedScroll;
    window.__figure2TransitionRangePx = transitionRange;

    if (introReverseActive) return;
    if (clampedScroll > INTRO_TRIGGER_PX) {
      startIntroPlayback();
    } else {
      resetIntroPlayback();
    }

    if (clampedScroll > INTRO_TRIGGER_PX) {
      if (!isIntroComplete()) {
        forceTransitionIdle();
        return;
      }

      if (transitionScrollAnchor === null || !transitionArmedAfterIntro) {
        transitionScrollAnchor = clampedScroll;
        transitionArmedAfterIntro = true;
        forceTransitionIdle();
        return;
      }

      if (scrollDirection > 0 && clampedScroll > transitionScrollAnchor + 0.75) {
        startTransitionPlayback(1);
      } else if (
        scrollDirection < 0
        && clampedScroll < totalRange - 0.75
        && (transitionPlaybackComplete || transitionPlaybackActive || progressState.value > 0.002)
      ) {
        startTransitionPlayback(-1);
      }
      return;
    }

    forceTransitionIdle();
  }

  function updateNativeProgress() {
    const rect = section.getBoundingClientRect();
    applyScrollPosition(-rect.top);
  }

  function shouldGateIntroScroll() {
    if (reduceMotion || !figure2IntroState.active || isIntroComplete()) return false;
    const rect = section.getBoundingClientRect();
    return rect.top <= 1 && rect.bottom >= window.innerHeight * 0.25;
  }

  function normalizeWheelDelta(event) {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight;
    return event.deltaY;
  }

  function bindIntroScrollGate() {
    addWindowListener('wheel', (event) => {
      if (!shouldGateIntroScroll() || normalizeWheelDelta(event) <= 0) return;
      event.preventDefault();
    }, { passive: false, capture: true });

    addWindowListener('touchstart', (event) => {
      introTouchStartY = event.touches?.[0]?.clientY || 0;
    }, { passive: true });

    addWindowListener('touchmove', (event) => {
      const currentY = event.touches?.[0]?.clientY || 0;
      const scrollingDown = currentY < introTouchStartY;
      if (!shouldGateIntroScroll() || !scrollingDown) return;
      event.preventDefault();
    }, { passive: false, capture: true });
  }

  function startPointerParallax(gsap) {
    if (gsap) {
      const parallaxToX = gsap.quickTo(parallaxMouse, 'x', { duration: 0.85, ease: 'power3.out' });
      const parallaxToY = gsap.quickTo(parallaxMouse, 'y', { duration: 0.85, ease: 'power3.out' });

      addWindowListener('pointermove', (event) => {
        if (reduceMotion || event.pointerType === 'touch') return;
        const rect = section.getBoundingClientRect();
        if (rect.top > window.innerHeight || rect.bottom < 0) return;
        parallaxToX(event.clientX - window.innerWidth / 2);
        parallaxToY(event.clientY - window.innerHeight / 2);
      }, { passive: true });

      addWindowListener('pointerleave', () => {
        parallaxToX(0);
        parallaxToY(0);
      }, { passive: true });
      return;
    }

    addWindowListener('pointermove', (event) => {
      if (reduceMotion || event.pointerType === 'touch') return;
      const rect = section.getBoundingClientRect();
      if (rect.top > window.innerHeight || rect.bottom < 0) return;
      nativeMouse.targetX = event.clientX - window.innerWidth / 2;
      nativeMouse.targetY = event.clientY - window.innerHeight / 2;
    }, { passive: true });

    addWindowListener('pointerleave', () => {
      nativeMouse.targetX = 0;
      nativeMouse.targetY = 0;
    }, { passive: true });
  }

  function prepare() {
    applyConfig();
    sceneInkTransition?.prewarm?.();
    prepareVideos();
    renderRawFigureVideoProgress(0);
    renderScene(0, 0, 0);
  }

  function waitForVideos() {
    return prepareVideos();
  }

  function mountReducedMotion() {
    figure2IntroState.progress = 1;
    figure2IntroState.active = true;
    figureVideoPlayhead.raw = 1;
    progressState.value = 0;
    progressState.target = 0;
    renderScene(0, 0, 0);
    renderRawFigureVideoProgress(1);
    pauseVideos();
    waitForVideos().then(() => {
      if (destroyed) return;
      renderRawFigureVideoProgress(1);
      renderScene(0, 0, 0);
    });
  }

  function mountGsap(context = {}) {
    const gsap = context.gsap || window.gsap;
    const ScrollTrigger = context.ScrollTrigger || window.ScrollTrigger;
    if (!gsap || !ScrollTrigger) {
      throw new Error('Figure2 transition requires GSAP and ScrollTrigger.');
    }

    setScrollRuntime(context.scrollRuntime);
    gsap.ticker.lagSmoothing(0);
    ScrollTrigger.config({ ignoreMobileResize: true });

    bindIntroScrollGate();
    startPointerParallax(gsap);
    gsapSetters = createGsapSetters(gsap);
    renderRawFigureVideoProgress(0);
    applyScrollPosition(0);

    scrollTrigger = ScrollTrigger.create({
      trigger: section,
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

    const onResize = () => {
      lastRenderedProgress = -1;
      lastRenderedIntroProgress = -1;
      ScrollTrigger.refresh();
    };
    addWindowListener('resize', onResize, { passive: true });
    gsap.ticker.add(tickFigure2);
    addCleanup(() => gsap.ticker.remove(tickFigure2));
    tickFigure2();

    return destroy;
  }

  function mountNativeFallback() {
    bindIntroScrollGate();
    startPointerParallax(null);
    addWindowListener('scroll', updateNativeProgress, { passive: true });
    addWindowListener('resize', updateNativeProgress, { passive: true });

    if (!nativeTickerStarted) {
      nativeTickerStarted = true;
      const tick = () => {
        if (destroyed) return;
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
    return destroy;
  }

  function renderStaticState({ introProgress = 1, transitionProgress = 0 } = {}) {
    figure2IntroState.progress = stableProgress(introProgress);
    figure2IntroState.active = introProgress > 0.001;
    progressState.value = stableProgress(transitionProgress);
    progressState.target = stableProgress(transitionProgress);
    renderScene(progressState.value, 0, 0);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    releaseIntroScroll();
    scrollTrigger?.kill?.();
    scrollTrigger = null;
    figureIntroTween?.kill?.();
    figureVideoTween?.kill?.();
    transitionPlaybackTween?.kill?.();
    cleanup.splice(0).forEach((dispose) => dispose());
    pauseVideos();
    if (figureMaskCanvas?.parentNode === figureGroup) {
      figureGroup.removeChild(figureMaskCanvas);
    }
    if (section.__figure2TransitionController === controller) {
      delete section.__figure2TransitionController;
    }
  }

  const controller = {
    section,
    elements,
    config,
    prepare,
    waitForVideos,
    mountReducedMotion,
    mountGsap,
    mountNativeFallback,
    renderStaticState,
    renderRawFigureVideoProgress,
    destroy
  };

  section.__figure2TransitionController = controller;
  return controller;
}

export function prepareFigure2Transition(section, options = {}) {
  const controller = section.__figure2TransitionController || createFigure2TransitionController(section, options);
  controller?.prepare();
  return controller;
}

export function waitForFigure2TransitionMedia(section, options = {}) {
  const controller = section.__figure2TransitionController || createFigure2TransitionController(section, options);
  return controller?.waitForVideos() || Promise.resolve();
}

export function renderFigure2TransitionState(section, state = {}, options = {}) {
  const controller = section.__figure2TransitionController || createFigure2TransitionController(section, options);
  controller?.renderStaticState(state);
  return controller;
}

export async function initFigure2Transition(section, options = {}) {
  const controller = section.__figure2TransitionController || createFigure2TransitionController(section, options);
  if (!controller) {
    return {
      destroy() {}
    };
  }

  const reduceMotion = options.reduceMotion ?? createReduceMotionState();
  controller.prepare();

  if (reduceMotion) {
    controller.mountReducedMotion();
    return controller;
  }

  await controller.waitForVideos();
  if (options.destroyed) return { destroy() {} };
  controller.mountGsap(options);
  if (options.refresh !== false) options.ScrollTrigger?.refresh?.();
  return controller;
}

export async function mountFigure2Transitions(options = {}) {
  const {
    selector = '[data-figure2-transition]',
    root = document,
    loadLibraries = true,
    libraryOptions = {},
    ...transitionOptions
  } = options;

  const sections = [...root.querySelectorAll(selector)];
  if (!sections.length) return [];

  const reduceMotion = transitionOptions.reduceMotion ?? createReduceMotionState();
  let runtime = {
    gsap: transitionOptions.gsap || window.gsap,
    ScrollTrigger: transitionOptions.ScrollTrigger || window.ScrollTrigger
  };

  if (!reduceMotion && loadLibraries && (!runtime.gsap || !runtime.ScrollTrigger)) {
    runtime = await loadTransitionLibraries(libraryOptions);
  }

  if (!reduceMotion) runtime.gsap.registerPlugin(runtime.ScrollTrigger);

  return Promise.all(sections.map((section) => initFigure2Transition(section, {
    ...transitionOptions,
    reduceMotion,
    gsap: runtime.gsap,
    ScrollTrigger: runtime.ScrollTrigger,
    refresh: false
  }))).then((instances) => {
    runtime.ScrollTrigger?.refresh?.();
    return instances;
  });
}
