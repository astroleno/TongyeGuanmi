import { createScrollProgressTrigger } from '../transitions/scroll-scene.js';
import {
  prepareScrubVideo,
  seekVideoToProgress,
  waitForVideoMetadata
} from '../transitions/video-scrub.js';

const DEFAULT_CONFIG = {
  durationSeconds: 2.5,
  triggerScrollRange: 0.2,
  triggerProgress: 0.015,
  videoDurationFallback: 2.459,
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

const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);
const smoothStep = (value) => value * value * (3 - 2 * value);
const range01 = (value, start, end) => clamp((value - start) / Math.max(0.0001, end - start));

function readNumberAttribute(element, name, fallback) {
  const value = Number(element?.dataset?.[name]);
  return Number.isFinite(value) ? value : fallback;
}

function stableProgress(value) {
  if (value < 0.002) return 0;
  if (value > 0.998) return 1;
  return clamp(value);
}

function acceleratedProgress(rawProgress) {
  const t = stableProgress(rawProgress);
  return clamp(0.78 * t + 0.22 * t * t);
}

export function getTtgTransitionElements(stage) {
  const figureVideos = [...(stage?.querySelectorAll('.ttg-layer--figure') || [])];

  return {
    bgLayer: stage?.querySelector('.ttg-layer--bg') || null,
    middleLayer: stage?.querySelector('.ttg-layer--middle') || null,
    middleOverlayLayer: stage?.querySelector('.ttg-layer--middle-overlay') || null,
    frontLayer: stage?.querySelector('.ttg-layer--front') || null,
    frontOverlayLayer: stage?.querySelector('.ttg-layer--front-overlay') || null,
    figureLayers: figureVideos,
    figureVideo: stage?.querySelector('[data-ttg-figure-video]') || null,
    figureReverseVideo: stage?.querySelector('[data-ttg-figure-video-reverse]') || null
  };
}

export function readTtgTransitionConfig(stage, overrides = {}) {
  return {
    durationSeconds: overrides.durationSeconds ?? readNumberAttribute(stage, 'ttgDuration', DEFAULT_CONFIG.durationSeconds),
    triggerScrollRange: overrides.triggerScrollRange
      ?? readNumberAttribute(stage, 'ttgTriggerScrollRange', DEFAULT_CONFIG.triggerScrollRange),
    triggerProgress: overrides.triggerProgress
      ?? readNumberAttribute(stage, 'ttgTriggerProgress', DEFAULT_CONFIG.triggerProgress),
    videoDurationFallback: overrides.videoDurationFallback
      ?? readNumberAttribute(stage, 'ttgVideoDuration', DEFAULT_CONFIG.videoDurationFallback),
    bgTravelVh: overrides.bgTravelVh ?? readNumberAttribute(stage, 'ttgBgTravelVh', DEFAULT_CONFIG.bgTravelVh),
    middleTravelVh: overrides.middleTravelVh
      ?? readNumberAttribute(stage, 'ttgMiddleTravelVh', DEFAULT_CONFIG.middleTravelVh),
    frontYVh: overrides.frontYVh ?? readNumberAttribute(stage, 'ttgFrontYVh', DEFAULT_CONFIG.frontYVh),
    frontTravelVh: overrides.frontTravelVh
      ?? readNumberAttribute(stage, 'ttgFrontTravelVh', DEFAULT_CONFIG.frontTravelVh),
    frontOverlayOpacity: overrides.frontOverlayOpacity
      ?? readNumberAttribute(stage, 'ttgFrontOverlayOpacity', DEFAULT_CONFIG.frontOverlayOpacity),
    figureScale: overrides.figureScale ?? readNumberAttribute(stage, 'ttgFigureScale', DEFAULT_CONFIG.figureScale),
    figureYVh: overrides.figureYVh ?? readNumberAttribute(stage, 'ttgFigureYVh', DEFAULT_CONFIG.figureYVh),
    figureTravelVh: overrides.figureTravelVh
      ?? readNumberAttribute(stage, 'ttgFigureTravelVh', DEFAULT_CONFIG.figureTravelVh),
    scrollVh: overrides.scrollVh ?? readNumberAttribute(stage, 'ttgScrollVh', DEFAULT_CONFIG.scrollVh)
  };
}

export function createTtgTransitionScene(stage, options = {}) {
  if (!stage) return null;

  const elements = getTtgTransitionElements(stage);
  const {
    bgLayer,
    middleLayer,
    middleOverlayLayer,
    frontLayer,
    frontOverlayLayer,
    figureLayers,
    figureVideo,
    figureReverseVideo
  } = elements;

  if (!bgLayer || !middleLayer || !middleOverlayLayer || !frontLayer || !frontOverlayLayer || !figureVideo) {
    return null;
  }

  const doc = stage.ownerDocument || document;
  const win = doc.defaultView || window;
  const figureVideos = [figureVideo, figureReverseVideo].filter(Boolean);
  const cleanup = [];
  const parallaxMouse = { x: 0, y: 0 };
  const nativeMouse = { targetX: 0, targetY: 0, x: 0, y: 0 };
  const playhead = { raw: 0 };
  const progressState = { target: 0, bg: 0, middle: 0, front: 0 };

  let config = readTtgTransitionConfig(stage, options);
  let destroyed = false;
  let progressTween = null;
  let scrollTrigger = null;
  let gsapSetters = null;
  let nativeTickerStarted = false;
  let pointerParallaxBound = false;
  let reduceMotionActive = false;
  let activeFigureVideo = figureVideo;
  let figurePlaybackDirection = 0;
  let figurePlaybackDrivesScene = true;
  let figurePlaybackRaf = 0;
  let nativeTickerRaf = 0;
  let figureSwitchToken = 0;
  let pendingFigureDirection = 0;
  let lastNativeRawProgress = 0;
  let lastRenderedProgress = { bg: -1, middle: -1, front: -1 };
  let lastRenderedMouseX = 999;
  let lastRenderedMouseY = 999;

  function addWindowListener(type, listener, listenerOptions) {
    win.addEventListener(type, listener, listenerOptions);
    cleanup.push(() => win.removeEventListener(type, listener, listenerOptions));
  }

  function resetRenderCache() {
    lastRenderedProgress = { bg: -1, middle: -1, front: -1 };
    lastRenderedMouseX = 999;
    lastRenderedMouseY = 999;
  }

  function applyConfig() {
    config = readTtgTransitionConfig(stage, options);
    stage.style.setProperty('--ttg-scroll-vh', config.scrollVh.toFixed(1));
    stage.style.setProperty('--ttg-front-overlay-opacity', config.frontOverlayOpacity.toFixed(3));
    resetRenderCache();
  }

  function setRouteProgress(progress) {
    stage.style.setProperty('--ttg-progress', stableProgress(progress).toFixed(4));
  }

  function setFigureProgress(progress) {
    stage.style.setProperty('--ttg-figure-progress', stableProgress(progress).toFixed(4));
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

  function getFigureVideoDuration(video) {
    return Number.isFinite(video?.duration) && video.duration > 0
      ? video.duration
      : config.videoDurationFallback;
  }

  function cancelFigurePlaybackTicker() {
    if (!figurePlaybackRaf) return;
    win.cancelAnimationFrame(figurePlaybackRaf);
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
      const timeout = win.setTimeout(finish, timeoutMs);

      function cleanupFrameListeners() {
        video.removeEventListener('seeked', settleAfterFrame);
        video.removeEventListener('loadeddata', settleAfterFrame);
        video.removeEventListener('canplay', settleAfterFrame);
        win.clearTimeout(timeout);
      }

      function finish() {
        if (settled) return;
        settled = true;
        cleanupFrameListeners();
        resolve();
      }

      function settleAfterFrame() {
        if (settled) return;
        if (typeof video.requestVideoFrameCallback === 'function') {
          video.requestVideoFrameCallback(() => finish());
          return;
        }
        win.requestAnimationFrame(finish);
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
    const p = stableProgress(rawProgress);
    seekVideoToProgress(figureVideo, p, {
      fallbackSeconds: config.videoDurationFallback,
      endPaddingSeconds: 0.02,
      minDeltaSeconds: 0.016
    });
    seekVideoToProgress(figureReverseVideo, 1 - p, {
      fallbackSeconds: config.videoDurationFallback,
      endPaddingSeconds: 0.02,
      minDeltaSeconds: 0.016
    });
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
      y: win.innerHeight * (config.figureYVh / 100),
      scale: config.figureScale,
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

    const bgTravelY = win.innerHeight * (config.bgTravelVh / 100);
    const middleTravelY = win.innerHeight * (config.middleTravelVh / 100);
    const frontBaseY = win.innerHeight * (config.frontYVh / 100);
    const frontTravelY = win.innerHeight * (config.frontTravelVh / 100);
    const figureGroundingY = win.innerHeight * (config.figureYVh / 100);
    const figureTravelY = win.innerHeight * (config.figureTravelVh / 100);

    gsapSetters.bgX(mouseX * -0.0015);
    gsapSetters.bgY(-progressParts.bg * bgTravelY);
    gsapSetters.bgScale(1 + progressParts.bg * 0.018);

    gsapSetters.middleX(mouseX * -0.006);
    gsapSetters.middleY(mouseY * -0.002 + progressParts.middle * middleTravelY);
    gsapSetters.middleScale(1 + progressParts.middle * 0.012);
    gsapSetters.middleOverlayX(mouseX * -0.006);
    gsapSetters.middleOverlayY(mouseY * -0.002 + progressParts.middle * middleTravelY);
    gsapSetters.middleOverlayScale(1 + progressParts.middle * 0.012);

    gsapSetters.frontX(0);
    gsapSetters.frontY(frontBaseY + progressParts.front * frontTravelY);
    gsapSetters.frontScale(1);
    gsapSetters.frontOverlayX(0);
    gsapSetters.frontOverlayY(frontBaseY + progressParts.front * frontTravelY);
    gsapSetters.frontOverlayScale(1);

    gsapSetters.figureX(0);
    gsapSetters.figureY(figureGroundingY + progressParts.front * figureTravelY);
    gsapSetters.figureScale(config.figureScale);
  }

  function renderNative(progressParts, mouseX, mouseY) {
    const bgTravelY = win.innerHeight * (config.bgTravelVh / 100);
    const middleTravelY = win.innerHeight * (config.middleTravelVh / 100);
    const frontBaseY = win.innerHeight * (config.frontYVh / 100);
    const frontTravelY = win.innerHeight * (config.frontTravelVh / 100);
    const figureGroundingY = win.innerHeight * (config.figureYVh / 100);
    const figureTravelY = win.innerHeight * (config.figureTravelVh / 100);

    bgLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.0015}px), ${-progressParts.bg * bgTravelY}px, 0) scale(${1 + progressParts.bg * 0.018})`;
    middleLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.006}px), calc(-50% + ${mouseY * -0.002 + progressParts.middle * middleTravelY}px), 0) scale(${1 + progressParts.middle * 0.012})`;
    middleOverlayLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.006}px), calc(-50% + ${mouseY * -0.002 + progressParts.middle * middleTravelY}px), 0) scale(${1 + progressParts.middle * 0.012})`;
    frontLayer.style.transform = `translate3d(-50%, calc(-100% + ${frontBaseY + progressParts.front * frontTravelY}px), 0) scale(1)`;
    frontOverlayLayer.style.transform = `translate3d(-50%, calc(-100% + ${frontBaseY + progressParts.front * frontTravelY}px), 0) scale(1)`;
    figureLayers.forEach((layer) => {
      layer.style.transform = `translate3d(-50%, calc(-50% + ${figureGroundingY + progressParts.front * figureTravelY}px), 0) scale(${config.figureScale})`;
    });
  }

  function renderScene(progress, mouseX = parallaxMouse.x, mouseY = parallaxMouse.y) {
    const progressParts = getProgressParts(progress);
    setRouteProgress(progressParts.front);

    const changed = Math.abs(lastRenderedProgress.bg - progressParts.bg) > 0.0005
      || Math.abs(lastRenderedProgress.middle - progressParts.middle) > 0.0005
      || Math.abs(lastRenderedProgress.front - progressParts.front) > 0.0005
      || Math.abs(lastRenderedMouseX - mouseX) > 0.10
      || Math.abs(lastRenderedMouseY - mouseY) > 0.10;

    if (!changed) return;

    lastRenderedProgress = progressParts;
    lastRenderedMouseX = mouseX;
    lastRenderedMouseY = mouseY;

    if (gsapSetters) {
      renderWithGsap(progressParts, mouseX, mouseY);
    } else {
      renderNative(progressParts, mouseX, mouseY);
    }
  }

  function renderRawProgress(rawProgress, { syncVideo = true } = {}) {
    const raw = stableProgress(rawProgress);
    const visualProgress = acceleratedProgress(raw);
    const sceneOpacity = 1 - smoothStep(range01(visualProgress, 0.70, 0.94));

    playhead.raw = raw;
    setFigureProgress(visualProgress);
    progressState.bg = visualProgress;
    progressState.middle = visualProgress;
    progressState.front = visualProgress;
    renderScene(progressState);

    if (syncVideo) seekFigureVideosToProgress(raw);
    return {
      visualProgress: Number(visualProgress.toFixed(4)),
      sceneOpacity: Number(sceneOpacity.toFixed(4))
    };
  }

  function renderCurrentScene() {
    renderScene(progressState, parallaxMouse.x, parallaxMouse.y);
  }

  function enableGsapRendering(gsap) {
    if (!gsap || gsapSetters) return;
    gsapSetters = createGsapSetters(gsap);
    resetRenderCache();
    renderCurrentScene();
  }

  function tweenToRawProgress(rawProgress, { syncVideo = true } = {}) {
    const gsap = win.gsap;
    const target = stableProgress(rawProgress);
    const distance = Math.abs(target - playhead.raw);

    progressState.target = target;
    cancelPendingFigureSwitch();
    cancelFigurePlaybackTicker();
    figurePlaybackDirection = 0;
    pauseFigureVideos();
    progressTween?.kill?.();
    progressTween = null;

    if (!gsap || reduceMotionActive || distance < 0.001) {
      renderRawProgress(target, { syncVideo });
      return;
    }

    progressTween = gsap.to(playhead, {
      raw: target,
      duration: Math.max(0.06, distance * config.durationSeconds),
      ease: 'none',
      overwrite: true,
      onUpdate: () => renderRawProgress(playhead.raw, { syncVideo }),
      onComplete: () => {
        progressTween = null;
        renderRawProgress(target, { syncVideo });
      }
    });
  }

  function finishFigurePlayback(target) {
    cancelFigurePlaybackTicker();
    figurePlaybackDirection = 0;
    progressState.target = target;
    if (figurePlaybackDrivesScene) {
      renderRawProgress(target);
    } else {
      setFigureProgress(acceleratedProgress(target));
    }
  }

  function tickFigurePlayback(target) {
    const video = activeFigureVideo;
    const direction = figurePlaybackDirection;
    if (!video || !direction || destroyed) return;

    const duration = getFigureVideoDuration(video);
    const raw = direction > 0
      ? clamp(video.currentTime / duration)
      : clamp(1 - video.currentTime / duration);

    if (figurePlaybackDrivesScene) {
      renderRawProgress(raw, { syncVideo: false });
    } else {
      setFigureProgress(acceleratedProgress(raw));
    }

    const reached = direction > 0
      ? raw >= target - 0.003 || video.ended
      : raw <= target + 0.003 || video.ended;

    if (reached) {
      finishFigurePlayback(target);
      return;
    }

    figurePlaybackRaf = win.requestAnimationFrame(() => tickFigurePlayback(target));
  }

  function playFigureTransition(direction, { driveScene = true } = {}) {
    const normalizedDirection = direction >= 0 ? 1 : -1;
    const target = normalizedDirection > 0 ? 1 : 0;
    const rawProgress = stableProgress(playhead.raw);

    if (Math.abs(rawProgress - target) < 0.003 && !figurePlaybackDirection) return;

    const nextVideo = normalizedDirection > 0 ? figureVideo : figureReverseVideo;
    if (!nextVideo || reduceMotionActive) {
      if (driveScene) {
        tweenToRawProgress(target, { syncVideo: true });
      } else {
        seekFigureVideosToProgress(target);
      }
      return;
    }

    if (figurePlaybackDirection === normalizedDirection && !nextVideo.paused) return;
    if (pendingFigureDirection === normalizedDirection) return;

    progressTween?.kill?.();
    progressTween = null;
    cancelFigurePlaybackTicker();
    figurePlaybackDirection = 0;
    figurePlaybackDrivesScene = driveScene;

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
      nextVideo.playbackRate = clamp(duration / config.durationSeconds, 0.25, 2);
    } catch {
      if (figureSwitchToken === switchToken) pendingFigureDirection = 0;
      if (driveScene) {
        tweenToRawProgress(target, { syncVideo: true });
      } else {
        seekFigureVideosToProgress(target);
      }
      return;
    }

    progressState.target = target;
    waitForVideoFrame(nextVideo).then(() => {
      if (destroyed || figureSwitchToken !== switchToken) return;

      pendingFigureDirection = 0;
      pauseFigureVideos(nextVideo);
      showFigureVideo(nextVideo);
      figurePlaybackDirection = normalizedDirection;
      figurePlaybackRaf = win.requestAnimationFrame(() => tickFigurePlayback(target));

      const playPromise = nextVideo.play();
      if (playPromise?.catch) {
        playPromise.catch(() => {
          if (figurePlaybackDirection !== normalizedDirection || figureSwitchToken !== switchToken) return;
          if (figurePlaybackDrivesScene) {
            tweenToRawProgress(target, { syncVideo: true });
          } else {
            seekFigureVideosToProgress(target);
          }
        });
      }
    });
  }

  function startFigureVideoPlayback(direction = 1, options = {}) {
    playFigureTransition(direction, options);
  }

  function finishFigureVideoPlayback() {
    cancelPendingFigureSwitch();
    cancelFigurePlaybackTicker();
    figurePlaybackDirection = 0;
    progressTween?.kill?.();
    progressTween = null;
    pauseFigureVideos();
    showFigureVideo(figureVideo);
    renderRawProgress(1, { syncVideo: true });
  }

  function resetFigureVideoPlayback() {
    cancelPendingFigureSwitch();
    cancelFigurePlaybackTicker();
    figurePlaybackDirection = 0;
    progressTween?.kill?.();
    progressTween = null;
    pauseFigureVideos();
    showFigureVideo(figureVideo);
    renderRawProgress(0, { syncVideo: true });
  }

  function updateNativeProgress() {
    const rect = stage.getBoundingClientRect();
    const range = Math.max(1, win.innerHeight * config.triggerScrollRange);
    const rawProgress = -rect.top / range;
    const p = stableProgress(rawProgress);
    const direction = rawProgress >= lastNativeRawProgress ? 1 : -1;
    lastNativeRawProgress = rawProgress;

    if (direction > 0 && p >= config.triggerProgress) {
      playFigureTransition(1);
    } else if (direction < 0 && p <= 1 - config.triggerProgress) {
      playFigureTransition(-1);
    }
  }

  function startPointerParallax(gsap, reduceMotion = false) {
    if (pointerParallaxBound) return;
    pointerParallaxBound = true;

    if (gsap) {
      const parallaxToX = gsap.quickTo(parallaxMouse, 'x', {
        duration: 0.85,
        ease: 'power3.out',
        onUpdate: renderCurrentScene
      });
      const parallaxToY = gsap.quickTo(parallaxMouse, 'y', {
        duration: 0.85,
        ease: 'power3.out',
        onUpdate: renderCurrentScene
      });

      cleanup.push(() => {
        parallaxToX.tween?.kill?.();
        parallaxToY.tween?.kill?.();
      });

      addWindowListener('pointermove', (event) => {
        if (reduceMotion || event.pointerType === 'touch') return;
        const rect = stage.getBoundingClientRect();
        if (rect.top > win.innerHeight || rect.bottom < 0) return;
        parallaxToX(event.clientX - win.innerWidth / 2);
        parallaxToY(event.clientY - win.innerHeight / 2);
      }, { passive: true });

      addWindowListener('pointerleave', () => {
        parallaxToX(0);
        parallaxToY(0);
      }, { passive: true });
      return;
    }

    addWindowListener('pointermove', (event) => {
      if (reduceMotion || event.pointerType === 'touch') return;
      const rect = stage.getBoundingClientRect();
      if (rect.top > win.innerHeight || rect.bottom < 0) return;
      nativeMouse.targetX = event.clientX - win.innerWidth / 2;
      nativeMouse.targetY = event.clientY - win.innerHeight / 2;
    }, { passive: true });

    addWindowListener('pointerleave', () => {
      nativeMouse.targetX = 0;
      nativeMouse.targetY = 0;
    }, { passive: true });
  }

  function prepare() {
    applyConfig();
    figureVideos.forEach((video) => prepareScrubVideo(video));
    showFigureVideo(figureVideo);
    renderRawProgress(0, { syncVideo: true });
  }

  function waitForMedia() {
    return Promise.all(figureVideos.map((video) => waitForVideoMetadata(video, { timeoutMs: 1300 })));
  }

  function mountReducedMotion() {
    let active = true;
    reduceMotionActive = true;
    applyConfig();
    showFigureVideo(figureVideo);
    renderRawProgress(1);
    waitForMedia().then(() => {
      if (active && !destroyed) renderRawProgress(1, { syncVideo: true });
    });

    return () => {
      active = false;
      pauseFigureVideos();
    };
  }

  function mountGsap({ gsap, ScrollTrigger, reduceMotion = false } = {}) {
    if (!gsap || !ScrollTrigger) {
      throw new Error('TTG transition requires GSAP and ScrollTrigger.');
    }

    reduceMotionActive = reduceMotion;
    applyConfig();
    ScrollTrigger.config?.({ ignoreMobileResize: true });
    gsapSetters = createGsapSetters(gsap);
    startPointerParallax(gsap, reduceMotion);
    renderRawProgress(0, { syncVideo: true });

    scrollTrigger = createScrollProgressTrigger({
      ScrollTrigger,
      trigger: stage,
      start: 'top top',
      end: () => `+=${Math.max(1, win.innerHeight * config.triggerScrollRange)}`,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        if (self.direction > 0 && self.progress >= config.triggerProgress) {
          playFigureTransition(1);
        } else if (self.direction < 0 && self.progress <= 1 - config.triggerProgress) {
          playFigureTransition(-1);
        }
      },
      onLeave: () => playFigureTransition(1),
      onEnterBack: () => playFigureTransition(-1),
      onLeaveBack: () => playFigureTransition(-1)
    });
    cleanup.push(() => scrollTrigger?.destroy?.());

    addWindowListener('resize', () => {
      resetRenderCache();
      ScrollTrigger.refresh?.();
    }, { passive: true });

    return destroy;
  }

  function mountNativeFallback(reduceMotion = false) {
    reduceMotionActive = reduceMotion;
    applyConfig();
    startPointerParallax(null, reduceMotion);
    addWindowListener('scroll', updateNativeProgress, { passive: true });
    addWindowListener('resize', updateNativeProgress, { passive: true });

    if (!nativeTickerStarted) {
      nativeTickerStarted = true;
      const tick = () => {
        nativeTickerRaf = 0;
        if (destroyed) return;
        updateNativeProgress();
        nativeMouse.x += (nativeMouse.targetX - nativeMouse.x) * 0.10;
        nativeMouse.y += (nativeMouse.targetY - nativeMouse.y) * 0.10;
        parallaxMouse.x = nativeMouse.x;
        parallaxMouse.y = nativeMouse.y;
        renderCurrentScene();
        nativeTickerRaf = win.requestAnimationFrame(tick);
      };
      nativeTickerRaf = win.requestAnimationFrame(tick);
    }

    updateNativeProgress();
    return destroy;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelPendingFigureSwitch();
    cancelFigurePlaybackTicker();
    if (nativeTickerRaf) {
      win.cancelAnimationFrame(nativeTickerRaf);
      nativeTickerRaf = 0;
    }
    progressTween?.kill?.();
    progressTween = null;
    cleanup.splice(0).forEach((dispose) => dispose());
    pauseFigureVideos();
  }

  return {
    stage,
    elements,
    prepare,
    mountReducedMotion,
    waitForMedia,
    mountGsap,
    mountNativeFallback,
    enableGsapRendering,
    renderRawProgress,
    startFigureVideoPlayback,
    finishFigureVideoPlayback,
    resetFigureVideoPlayback,
    destroy
  };
}
