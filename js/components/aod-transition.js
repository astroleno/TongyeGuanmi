import { loadTransitionLibraries } from '../transitions/load-libraries.js';
import { createReduceMotionState, createScrollProgressTrigger } from '../transitions/scroll-scene.js';
import { prepareScrubVideo, seekVideoToProgress, waitForVideoMetadata } from '../transitions/video-scrub.js';

const DEFAULT_DURATION_SECONDS = 2;
const DEFAULT_SCROLL_VH = 20;
const DEFAULT_VIDEO_DURATION_FALLBACK = 5.03;
const DEFAULT_FULLSCREEN_START_SECONDS = 0;
const DEFAULT_FULLSCREEN_END_SECONDS = 0.3;
const DEFAULT_BACKDROP_EXIT_START_SECONDS = 0;
const DEFAULT_BACKDROP_EXIT_END_SECONDS = 0.5;
const DEFAULT_FIGURE_START_SCALE = 1;
const DEFAULT_FIGURE_START_Y_VH = 10.5;

const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);
const smoothStep = (value) => value * value * (3 - 2 * value);
const range01 = (value, start, end) => clamp((value - start) / (end - start));

function readNumberAttribute(element, name, fallback) {
  const value = Number(element?.dataset?.[name]);
  return Number.isFinite(value) ? value : fallback;
}

function acceleratedProgress(rawProgress) {
  const t = clamp(rawProgress);
  return clamp(0.78 * t + 0.22 * t * t);
}

function secondsRange(progress, startSeconds, endSeconds, durationSeconds) {
  return range01(progress, startSeconds / durationSeconds, endSeconds / durationSeconds);
}

function formatPx(value) {
  return `${value.toFixed(2)}px`;
}

export function getAodTransitionElements(section) {
  return {
    sunLayer: section?.querySelector('[data-aod-sun-layer]') || null,
    cloudLayer: section?.querySelector('[data-aod-cloud-layer]') || null,
    figureVideo: section?.querySelector('[data-aod-figure-video]') || null
  };
}

export function readAodTransitionConfig(section, overrides = {}) {
  return {
    durationSeconds: overrides.durationSeconds ?? readNumberAttribute(section, 'aodDuration', DEFAULT_DURATION_SECONDS),
    scrollVh: overrides.scrollVh ?? readNumberAttribute(section, 'aodScrollVh', DEFAULT_SCROLL_VH),
    videoDurationFallback: overrides.videoDurationFallback
      ?? readNumberAttribute(section, 'aodVideoDuration', DEFAULT_VIDEO_DURATION_FALLBACK),
    fullscreenStartSeconds: overrides.fullscreenStartSeconds
      ?? readNumberAttribute(section, 'aodFullscreenStart', DEFAULT_FULLSCREEN_START_SECONDS),
    fullscreenEndSeconds: overrides.fullscreenEndSeconds
      ?? readNumberAttribute(section, 'aodFullscreenEnd', DEFAULT_FULLSCREEN_END_SECONDS),
    backdropExitStartSeconds: overrides.backdropExitStartSeconds
      ?? readNumberAttribute(section, 'aodBackdropExitStart', DEFAULT_BACKDROP_EXIT_START_SECONDS),
    backdropExitEndSeconds: overrides.backdropExitEndSeconds
      ?? readNumberAttribute(section, 'aodBackdropExitEnd', DEFAULT_BACKDROP_EXIT_END_SECONDS),
    figureStartScale: overrides.figureStartScale
      ?? readNumberAttribute(section, 'aodFigureStartScale', DEFAULT_FIGURE_START_SCALE),
    figureStartYVh: overrides.figureStartYVh
      ?? readNumberAttribute(section, 'aodFigureStartYVh', DEFAULT_FIGURE_START_Y_VH)
  };
}

function setLayerProgress(section, progress, config) {
  const p = clamp(progress);
  const backdropExit = smoothStep(secondsRange(
    p,
    config.backdropExitStartSeconds,
    config.backdropExitEndSeconds,
    config.durationSeconds
  ));
  const fullscreen = smoothStep(secondsRange(
    p,
    config.fullscreenStartSeconds,
    config.fullscreenEndSeconds,
    config.durationSeconds
  ));
  const upExitY = window.innerHeight * -1.08;
  const backgroundFade = 1 - backdropExit;
  const figureScale = config.figureStartScale + fullscreen * (1 - config.figureStartScale);
  const figureY = (1 - fullscreen) * window.innerHeight * (config.figureStartYVh / 100);

  section.style.setProperty('--aod-transition-progress', p.toFixed(4));
  section.style.setProperty('--aod-transition-sun-x', '0px');
  section.style.setProperty('--aod-transition-sun-y', formatPx(backdropExit * upExitY * 1.02));
  section.style.setProperty('--aod-transition-sun-opacity', (0.96 * backgroundFade).toFixed(4));
  section.style.setProperty('--aod-transition-sun-scale', (1 + backdropExit * 0.025).toFixed(4));
  section.style.setProperty('--aod-transition-cloud-x', '0px');
  section.style.setProperty('--aod-transition-cloud-y', formatPx(backdropExit * upExitY * 1.16));
  section.style.setProperty('--aod-transition-cloud-opacity', (0.98 * backgroundFade).toFixed(4));
  section.style.setProperty('--aod-transition-cloud-scale', (1 + backdropExit * 0.025).toFixed(4));
  section.style.setProperty('--aod-transition-figure-y', formatPx(figureY));
  section.style.setProperty('--aod-transition-figure-scale', figureScale.toFixed(4));
}

export function renderAodTransitionProgress(section, rawProgress, options = {}) {
  if (!section) return;

  const { figureVideo } = getAodTransitionElements(section);
  const config = readAodTransitionConfig(section, options);
  const video = options.figureVideo ?? figureVideo;
  const visualProgress = acceleratedProgress(rawProgress);

  setLayerProgress(section, visualProgress, config);
  seekVideoToProgress(video, visualProgress, {
    fallbackSeconds: config.videoDurationFallback,
    endPaddingSeconds: options.endPaddingSeconds ?? 0.02,
    minDeltaSeconds: options.minDeltaSeconds ?? 0.016
  });
}

export function prepareAodTransition(section, options = {}) {
  const elements = getAodTransitionElements(section);

  prepareScrubVideo(elements.figureVideo, options.videoOptions);
  if (Number.isFinite(options.progress)) {
    renderAodTransitionProgress(section, options.progress, elements);
  }

  return elements;
}

export function waitForAodTransitionMetadata(section, options = {}) {
  const { figureVideo } = getAodTransitionElements(section);
  return waitForVideoMetadata(figureVideo, options);
}

export async function initAodTransition(section, options = {}) {
  if (!section) {
    return {
      destroy() {}
    };
  }

  const config = readAodTransitionConfig(section, options);
  const {
    gsap = window.gsap,
    ScrollTrigger = window.ScrollTrigger,
    reduceMotion = createReduceMotionState(),
    durationSeconds = config.durationSeconds,
    scrollVh = config.scrollVh,
    videoDurationFallback = config.videoDurationFallback,
    refresh = true
  } = options;

  if (!reduceMotion && (!gsap || !ScrollTrigger)) {
    throw new Error('AOD transition requires GSAP and ScrollTrigger.');
  }

  const { figureVideo } = getAodTransitionElements(section);
  const playhead = { raw: 0 };
  let progressTween = null;
  let scrollTrigger = null;
  let destroyed = false;

  const renderRawProgress = (rawProgress) => {
    renderAodTransitionProgress(section, rawProgress, {
      figureVideo,
      videoDurationFallback
    });
  };

  const tweenToRawProgress = (rawProgress) => {
    if (destroyed) return;

    const target = clamp(rawProgress);
    const distance = Math.abs(target - playhead.raw);

    progressTween?.kill?.();
    progressTween = null;

    if (distance < 0.001 || reduceMotion) {
      playhead.raw = target;
      renderRawProgress(playhead.raw);
      return;
    }

    progressTween = gsap.to(playhead, {
      raw: target,
      duration: Math.max(0.06, distance * durationSeconds),
      ease: 'none',
      overwrite: true,
      onUpdate: () => renderRawProgress(playhead.raw),
      onComplete: () => {
        playhead.raw = target;
        progressTween = null;
        renderRawProgress(playhead.raw);
      }
    });
  };

  const resetTransition = () => {
    tweenToRawProgress(0);
  };

  prepareAodTransition(section);

  if (reduceMotion) {
    playhead.raw = 1;
    renderRawProgress(1);
    waitForVideoMetadata(figureVideo).then(() => {
      if (!destroyed) renderRawProgress(1);
    });
  } else {
    await waitForVideoMetadata(figureVideo);

    if (destroyed) {
      return {
        destroy() {}
      };
    }

    const trigger = createScrollProgressTrigger({
      ScrollTrigger,
      trigger: section,
      start: 'top top',
      end: () => `+=${Math.max(1, window.innerHeight * (scrollVh / 100))}`,
      onUpdate: (self) => tweenToRawProgress(self.progress),
      onLeave: () => tweenToRawProgress(1),
      onLeaveBack: resetTransition
    });
    scrollTrigger = trigger;
    renderRawProgress(0);
  }

  if (refresh) ScrollTrigger?.refresh?.();

  return {
    section,
    reset: resetTransition,
    destroy() {
      destroyed = true;
      progressTween?.kill?.();
      progressTween = null;
      scrollTrigger?.destroy?.();
      figureVideo?.pause?.();
    }
  };
}

export async function mountAodTransitions(options = {}) {
  const {
    selector = '[data-aod-transition]',
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

  return Promise.all(sections.map((section) => initAodTransition(section, {
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
